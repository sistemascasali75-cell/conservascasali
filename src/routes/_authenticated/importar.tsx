import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-role";
import { Download, Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/importar")({
  component: ImportarPage,
});

// ---------- Definición de entidades ----------
type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  enum?: string[];
  type?: "text" | "number" | "boolean";
  hint?: string;
};

type EntityDef = {
  id: string;
  label: string;
  table: string;
  conflict?: string; // columna(s) UNIQUE para upsert
  fields: FieldDef[];
  // postprocesado por fila antes de insertar (ej. resolver almacen_id por nombre)
  resolveRow?: (row: Record<string, any>, lookups: Record<string, Map<string, string>>) => Promise<Record<string, any> | string>;
  // datos auxiliares a precargar (mapa de nombre→id)
  preload?: { name: string; query: () => Promise<Map<string, string>> }[];
};

const ENTITIES: EntityDef[] = [
  {
    id: "productos",
    label: "Productos (catálogo)",
    table: "productos",
    conflict: "codigo_base",
    fields: [
      { key: "codigo_base", label: "Código base", required: true, hint: "Llave única" },
      { key: "descripcion", label: "Descripción", required: true },
      { key: "especie", label: "Especie", required: true, enum: ["BONITO", "ATUN", "JUREL", "CABALLA", "ANCHOVETA"] },
      { key: "presentacion", label: "Presentación", required: true, enum: ["FILETE", "ENTERO", "GRATED"] },
      { key: "liquido_gobierno", label: "Líquido", required: true, enum: ["ACEITE", "AGUA Y SAL"] },
      { key: "envase", label: "Envase", required: true, enum: ["1/2 LB", "1/2 LB-108", "1 LB TALL", "TINAPON"] },
    ],
  },
  {
    id: "clientes_proveedores",
    label: "Clientes / Proveedores",
    table: "clientes_proveedores",
    fields: [
      { key: "nombre", label: "Nombre / Razón social", required: true },
      { key: "tipo", label: "Tipo", required: true, enum: ["CLIENTE", "PROVEEDOR", "AMBOS"] },
      { key: "documento", label: "RUC / Documento" },
    ],
  },
  {
    id: "almacenes",
    label: "Almacenes",
    table: "almacenes",
    conflict: "nombre",
    fields: [{ key: "nombre", label: "Nombre del almacén", required: true }],
  },
  {
    id: "ubicaciones",
    label: "Ubicaciones (rack/posición)",
    table: "ubicaciones",
    conflict: "almacen_id,codigo",
    fields: [
      { key: "almacen", label: "Almacén (nombre)", required: true, hint: "Debe existir" },
      { key: "codigo", label: "Código ubicación", required: true },
    ],
    preload: [
      {
        name: "almacenes",
        query: async () => {
          const { data } = await supabase.from("almacenes").select("id,nombre");
          const m = new Map<string, string>();
          (data ?? []).forEach((a: any) => m.set(String(a.nombre).trim().toUpperCase(), a.id));
          return m;
        },
      },
    ],
    resolveRow: async (row, lookups) => {
      const key = String(row.almacen ?? "").trim().toUpperCase();
      const id = lookups.almacenes?.get(key);
      if (!id) return `Almacén "${row.almacen}" no existe`;
      return { almacen_id: id, codigo: String(row.codigo).trim() };
    },
  },
];

// ---------- Helpers ----------
function normalize(s: string) {
  return s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function autoMap(headers: string[], fields: FieldDef[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fields) {
    const target = normalize(f.key);
    const targetLabel = normalize(f.label);
    const found = headers.find((h) => {
      const n = normalize(h);
      return n === target || n === targetLabel || n.includes(target) || target.includes(n);
    });
    if (found) map[f.key] = found;
  }
  return map;
}

function downloadTemplate(entity: EntityDef) {
  const headers = entity.fields.map((f) => f.label);
  const ws = XLSX.utils.aoa_to_sheet([headers, headers.map(() => "")]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entity.label.substring(0, 30));
  XLSX.writeFile(wb, `plantilla_${entity.id}.xlsx`);
}

// ---------- Componente principal ----------
function ImportarPage() {
  const { canManageCatalogs, isLoading } = useRoles();
  const [entityId, setEntityId] = useState<string>(ENTITIES[0].id);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: { row: number; msg: string }[] } | null>(null);

  const entity = useMemo(() => ENTITIES.find((e) => e.id === entityId)!, [entityId]);

  if (isLoading) return <div className="p-8">Cargando…</div>;
  if (!canManageCatalogs) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="size-4" />
        <AlertTitle>Sin permisos</AlertTitle>
        <AlertDescription>Solo ADMIN u OPERADOR pueden importar datos.</AlertDescription>
      </Alert>
    );
  }

  const handleFile = async (file: File) => {
    setResult(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    setWorkbook(wb);
    const first = wb.SheetNames[0];
    setSheetName(first);
    loadSheet(wb, first);
  };

  const loadSheet = (wb: XLSX.WorkBook, name: string) => {
    const ws = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
    const hs = json.length > 0 ? Object.keys(json[0]) : [];
    setHeaders(hs);
    setRows(json);
    setMapping(autoMap(hs, entity.fields));
  };

  const changeEntity = (id: string) => {
    setEntityId(id);
    setResult(null);
    const e = ENTITIES.find((x) => x.id === id)!;
    if (headers.length > 0) setMapping(autoMap(headers, e.fields));
  };

  const validateRow = (row: Record<string, any>): { mapped: Record<string, any>; error?: string } => {
    const mapped: Record<string, any> = {};
    for (const f of entity.fields) {
      const src = mapping[f.key];
      let v = src ? row[src] : undefined;
      if (typeof v === "string") v = v.trim();
      if (v === "" || v === undefined || v === null) {
        if (f.required) return { mapped, error: `Campo "${f.label}" vacío` };
        continue;
      }
      if (f.enum) {
        const up = String(v).toUpperCase();
        if (!f.enum.includes(up)) return { mapped, error: `"${f.label}"="${v}" no es válido. Use: ${f.enum.join(", ")}` };
        v = up;
      }
      if (f.type === "number") {
        const n = Number(v);
        if (Number.isNaN(n)) return { mapped, error: `"${f.label}" debe ser numérico` };
        v = n;
      }
      mapped[f.key] = v;
    }
    return { mapped };
  };

  const runImport = async () => {
    setRunning(true);
    setResult(null);
    try {
      // Pre-cargar lookups
      const lookups: Record<string, Map<string, string>> = {};
      if (entity.preload) {
        for (const p of entity.preload) lookups[p.name] = await p.query();
      }

      const valid: any[] = [];
      const errors: { row: number; msg: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const { mapped, error } = validateRow(rows[i]);
        if (error) {
          errors.push({ row: i + 2, msg: error });
          continue;
        }
        if (entity.resolveRow) {
          const res = await entity.resolveRow(mapped, lookups);
          if (typeof res === "string") {
            errors.push({ row: i + 2, msg: res });
            continue;
          }
          valid.push(res);
        } else {
          valid.push(mapped);
        }
      }

      // Insertar / upsert en lotes
      let ok = 0;
      const CHUNK = 200;
      for (let i = 0; i < valid.length; i += CHUNK) {
        const slice = valid.slice(i, i + CHUNK);
        const q = supabase.from(entity.table as any);
        const { error } = entity.conflict
          ? await q.upsert(slice, { onConflict: entity.conflict, ignoreDuplicates: false })
          : await q.insert(slice);
        if (error) {
          errors.push({ row: i + 2, msg: `Lote ${i}-${i + slice.length}: ${error.message}` });
        } else {
          ok += slice.length;
        }
      }

      setResult({ ok, errors });
      if (errors.length === 0) toast.success(`Importación completa: ${ok} filas`);
      else toast.warning(`Importadas ${ok} filas, ${errors.length} con error`);
    } catch (e: any) {
      toast.error(e.message ?? "Error inesperado");
    } finally {
      setRunning(false);
    }
  };

  const missingRequired = entity.fields.filter((f) => f.required && !mapping[f.key]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Importar datos</h1>
        <p className="text-sm text-muted-foreground">
          Carga Excel (.xlsx) o CSV, mapea columnas y haz upsert masivo.
        </p>
      </div>

      {/* Paso 1: Entidad + archivo */}
      <Card>
        <CardHeader>
          <CardTitle>1. Selecciona qué importar</CardTitle>
          <CardDescription>Descarga la plantilla, llénala y vuelve a subir.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tabla destino</Label>
              <Select value={entityId} onValueChange={changeEntity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTITIES.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plantilla</Label>
              <Button variant="outline" onClick={() => downloadTemplate(entity)} className="w-full">
                <Download className="size-4" /> Descargar plantilla {entity.id}.xlsx
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Archivo (.xlsx, .xls, .csv)</Label>
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </CardContent>
      </Card>

      {/* Paso 2: Hoja + previsualización */}
      {workbook && (
        <Card>
          <CardHeader>
            <CardTitle>2. Hoja y previsualización</CardTitle>
            <CardDescription>
              {rows.length} filas detectadas · {headers.length} columnas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 max-w-xs">
              <Label>Hoja</Label>
              <Select value={sheetName} onValueChange={(v) => { setSheetName(v); loadSheet(workbook, v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {workbook.SheetNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {rows.length > 0 && (
              <div className="border rounded overflow-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>{headers.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 5).map((r, i) => (
                      <TableRow key={i}>
                        {headers.map((h) => <TableCell key={h} className="text-xs">{String(r[h] ?? "")}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 3: Mapeo */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Mapeo de columnas</CardTitle>
            <CardDescription>Empareja cada campo con la columna del archivo. Auto-sugerido por nombre.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {entity.fields.map((f) => (
              <div key={f.key} className="grid sm:grid-cols-2 gap-3 items-center">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{f.label}</span>
                  {f.required && <Badge variant="destructive" className="text-[10px]">requerido</Badge>}
                  {f.hint && <span className="text-xs text-muted-foreground">({f.hint})</span>}
                </div>
                <Select
                  value={mapping[f.key] ?? "__none__"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="— sin asignar —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sin asignar —</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Faltan asignar campos requeridos: {missingRequired.map((f) => f.label).join(", ")}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 4: Ejecutar */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>4. Validar e importar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              size="lg"
              onClick={runImport}
              disabled={running || missingRequired.length > 0}
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Importar {rows.length} filas a {entity.label}
            </Button>

            {result && (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="size-5" />
                    <span className="font-medium">{result.ok} OK</span>
                  </div>
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="size-5" />
                    <span className="font-medium">{result.errors.length} errores</span>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="border rounded max-h-80 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Fila</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono">{e.row}</TableCell>
                            <TableCell className="text-xs text-destructive">{e.msg}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!workbook && (
        <div className="text-center py-12 text-muted-foreground">
          <FileSpreadsheet className="size-12 mx-auto mb-2 opacity-30" />
          <p>Sube un archivo para comenzar</p>
        </div>
      )}
    </div>
  );
}
