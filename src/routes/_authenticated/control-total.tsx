import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-role";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Cog, Pencil, Trash2, Undo2, RefreshCw, ShieldAlert, Search, History, Database,
  Calculator, ArrowLeftRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/control-total")({
  component: ControlTotal,
});

const TABLES: { key: string; label: string; group: string; sensitive?: boolean }[] = [
  { key: "movimientos", label: "Movimientos", group: "Inventario", sensitive: true },
  { key: "lotes", label: "Lotes", group: "Inventario" },
  { key: "stock_lote_ubicacion", label: "Stock por ubicación", group: "Inventario", sensitive: true },
  { key: "ordenes_etiquetado", label: "Órdenes etiquetado", group: "Inventario" },
  { key: "inventarios_fisicos", label: "Inventarios físicos", group: "Inventario" },
  { key: "inventario_conteo", label: "Conteo inventario", group: "Inventario" },
  { key: "warrants", label: "Warrants", group: "Inventario" },

  { key: "productos", label: "Productos", group: "Catálogos" },
  { key: "almacenes", label: "Almacenes", group: "Catálogos" },
  { key: "ubicaciones", label: "Ubicaciones", group: "Catálogos" },
  { key: "clientes_proveedores", label: "Clientes/Proveedores", group: "Catálogos" },
  { key: "mercados", label: "Mercados", group: "Catálogos" },
  { key: "estados", label: "Estados", group: "Catálogos" },

  { key: "insumos", label: "Insumos", group: "Insumos" },
  { key: "insumos_movimientos", label: "Movimientos insumos", group: "Insumos" },

  { key: "ventas_cotizaciones", label: "Cotizaciones", group: "Ventas" },
  { key: "ventas_cot_items", label: "Ítems cotización", group: "Ventas" },
  { key: "ventas_ordenes", label: "Órdenes venta", group: "Ventas" },
  { key: "ventas_orden_items", label: "Ítems orden", group: "Ventas" },
  { key: "ventas_facturas", label: "Facturas", group: "Ventas" },
  { key: "ventas_factura_items", label: "Ítems factura", group: "Ventas" },
  { key: "ventas_guias", label: "Guías", group: "Ventas" },
  { key: "ventas_guia_items", label: "Ítems guía", group: "Ventas" },
];

type ColDef = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
};

const READ_ONLY_ALWAYS = new Set(["id", "created_at", "updated_at"]);

function isNumericType(udt: string) {
  return ["int2", "int4", "int8", "numeric", "float4", "float8"].includes(udt);
}
function isBoolType(udt: string) { return udt === "bool"; }
function isDateType(udt: string) { return udt === "date"; }
function isTimestampType(udt: string) { return udt === "timestamp" || udt === "timestamptz"; }
function isTextType(udt: string) {
  return ["text", "varchar", "bpchar", "citext"].includes(udt);
}
function isUUIDType(udt: string) { return udt === "uuid"; }
function isJsonType(udt: string) { return udt === "jsonb" || udt === "json"; }

function formatCell(val: any, udt: string) {
  if (val === null || val === undefined) return <span className="text-muted-foreground/60">—</span>;
  if (isBoolType(udt)) return val ? "Sí" : "No";
  if (isJsonType(udt)) return <code className="text-[10px]">{JSON.stringify(val).slice(0, 60)}</code>;
  if (typeof val === "string" && val.length > 60) return val.slice(0, 60) + "…";
  return String(val);
}

function ControlTotal() {
  const { isAdmin, isLoading } = useRoles();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"editor" | "audit">("editor");
  const [tabla, setTabla] = useState("movimientos");
  const [filtro, setFiltro] = useState("");
  const [pageSize, setPageSize] = useState(100);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  if (isLoading) return <div className="p-4 text-muted-foreground">Cargando…</div>;
  if (!isAdmin) return <Navigate to="/" />;

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      <header>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Cog className="size-5 sm:size-7 text-primary shrink-0" />
          Control total
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Edita cualquier campo, elimina o revierte cambios. Al modificar movimientos, se recalcula
          automáticamente el stock del lote y las ubicaciones afectadas.
        </p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="editor" className="gap-1.5"><Database className="size-3.5" /> Editor de tablas</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><History className="size-3.5" /> Historial y revertir</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-3 pt-3">
          <Card className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 min-w-0">
                <Label className="text-xs">Tabla</Label>
                <Select value={tabla} onValueChange={(v) => { setTabla(v); setFiltro(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-96">
                    {Array.from(new Set(TABLES.map((t) => t.group))).map((g) => (
                      <div key={g}>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{g}</div>
                        {TABLES.filter((t) => t.group === g).map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label} {t.sensitive && <span className="text-amber-500">⚠</span>}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-0">
                <Label className="text-xs">Buscar en resultados</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                  <Input value={filtro} onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Filtrar…" className="pl-8" />
                </div>
              </div>
              <div className="w-32">
                <Label className="text-xs">Límite</Label>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[50, 100, 250, 500, 1000].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => qc.invalidateQueries()} className="gap-1.5">
                <RefreshCw className="size-4" /> Refrescar
              </Button>
            </div>

            {TABLES.find((t) => t.key === tabla)?.sensitive && (
              <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/40 text-amber-800 dark:text-amber-200 rounded-md p-2">
                <ShieldAlert className="size-4 mt-0.5 shrink-0" />
                <span>
                  Tabla crítica. Cambios aquí afectan stock, kardex, mapa e informes.
                  El sistema recalcula automáticamente al guardar.
                </span>
              </div>
            )}
          </Card>

          <TablaEditor
            tabla={tabla}
            filtro={filtro}
            pageSize={pageSize}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        </TabsContent>

        <TabsContent value="audit" className="pt-3">
          <AuditPanel />
        </TabsContent>
      </Tabs>

      {editing && (
        <EditDialog
          tabla={tabla}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries();
          }}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(o) => { if (!o) setDeleting(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
              <AlertDialogDescription>
                Se guarda en el historial y podrás revertir. El stock se recalculará si aplica.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="bg-muted rounded p-2 text-xs font-mono max-h-40 overflow-auto">
              {JSON.stringify(deleting, null, 2)}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const { error } = await supabase.rpc("admin_delete_row", {
                    p_tabla: tabla, p_id: String(deleting.id),
                  });
                  if (error) { toast.error(error.message); return; }
                  toast.success("Eliminado");
                  setDeleting(null);
                  qc.invalidateQueries();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla editor                                                        */
/* ------------------------------------------------------------------ */

function TablaEditor({
  tabla, filtro, pageSize, onEdit, onDelete,
}: {
  tabla: string; filtro: string; pageSize: number;
  onEdit: (r: any) => void; onDelete: (r: any) => void;
}) {
  const cols = useQuery({
    queryKey: ["ctrl-cols", tabla],
    queryFn: async (): Promise<ColDef[]> => {
      const { data, error } = await supabase.rpc("admin_list_table_columns", { p_tabla: tabla });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });

  const rows = useQuery({
    queryKey: ["ctrl-rows", tabla, pageSize],
    queryFn: async () => {
      const orderCol = ["created_at", "fecha", "id"].find((c) =>
        cols.data?.some((cc) => cc.column_name === c)
      ) ?? "id";
      const { data, error } = await supabase.from(tabla as any).select("*")
        .order(orderCol, { ascending: false })
        .limit(pageSize);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!cols.data,
  });

  const filtered = useMemo(() => {
    if (!rows.data) return [];
    if (!filtro.trim()) return rows.data;
    const q = filtro.toLowerCase();
    return rows.data.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [rows.data, filtro]);

  if (cols.isLoading || rows.isLoading) {
    return <Card className="p-8 text-center text-muted-foreground">Cargando…</Card>;
  }
  if (!cols.data?.length) {
    return <Card className="p-8 text-center text-muted-foreground">No hay columnas</Card>;
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 border-b flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {filtered.length} / {rows.data?.length ?? 0} filas · {cols.data.length} columnas
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">{tabla}</Badge>
      </div>
      <div className="overflow-auto max-h-[65vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted z-10">
            <tr>
              <th className="px-2 py-1.5 text-left sticky left-0 bg-muted z-20 border-r">Acciones</th>
              {cols.data.map((c) => (
                <th key={c.column_name} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span>{c.column_name}</span>
                    <span className="text-[9px] text-muted-foreground font-normal">{c.udt_name}</span>
                    {c.is_nullable === "NO" && <span className="text-destructive">*</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id ?? i} className="border-t hover:bg-muted/50">
                <td className="px-2 py-1 sticky left-0 bg-background border-r">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="size-7"
                      onClick={() => onEdit(r)} title="Editar">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive"
                      onClick={() => onDelete(r)} title="Eliminar">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
                {cols.data.map((c) => (
                  <td key={c.column_name} className="px-2 py-1 whitespace-nowrap max-w-64 truncate">
                    {formatCell(r[c.column_name], c.udt_name)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={cols.data.length + 1} className="p-8 text-center text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog de edición dinámica                                          */
/* ------------------------------------------------------------------ */

function EditDialog({
  tabla, row, onClose, onSaved,
}: { tabla: string; row: any; onClose: () => void; onSaved: () => void }) {
  const cols = useQuery({
    queryKey: ["ctrl-cols", tabla],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_table_columns", { p_tabla: tabla });
      if (error) throw error;
      return (data as ColDef[]) ?? [];
    },
  });

  const [values, setValues] = useState<Record<string, any>>(() => ({ ...row }));
  const [saving, setSaving] = useState(false);

  const isMov = tabla === "movimientos";
  const empaque = Number(values.empaque ?? 48) || 48;
  const totalLatas = Number(values.total_latas ?? 0) || 0;
  const cajasCalc = Math.floor(totalLatas / empaque);
  const latasCalc = totalLatas - cajasCalc * empaque;

  const setVal = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }));

  const handleSave = async () => {
    if (!cols.data) return;
    // Build patch with only edited fields (skip readonly)
    const patch: Record<string, any> = {};
    for (const c of cols.data) {
      if (READ_ONLY_ALWAYS.has(c.column_name)) continue;
      const orig = row[c.column_name];
      const cur = values[c.column_name];
      // Normalize empty string → null for nullable non-text
      let normalized = cur;
      if (cur === "" && !isTextType(c.udt_name)) normalized = null;
      if (JSON.stringify(orig ?? null) !== JSON.stringify(normalized ?? null)) {
        patch[c.column_name] = normalized;
      }
    }
    if (Object.keys(patch).length === 0) {
      toast.info("Sin cambios");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_row", {
      p_tabla: tabla, p_id: String(row.id), p_patch: patch,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Guardado (${Object.keys(patch).length} campo${Object.keys(patch).length > 1 ? "s" : ""})`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" /> Editar registro · <code className="text-sm">{tabla}</code>
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px]">id: {row.id}</DialogDescription>
        </DialogHeader>

        {isMov && (
          <Card className="p-3 bg-primary/5 border-primary/30">
            <div className="flex items-center gap-2 text-xs font-semibold mb-2">
              <Calculator className="size-4 text-primary" /> Vista previa fórmula latas
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">total_latas</div>
                <div className="text-lg font-bold">{totalLatas}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">cajas ({empaque}/caja)</div>
                <div className="text-lg font-bold text-primary">{cajasCalc}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">latas sueltas</div>
                <div className="text-lg font-bold text-primary">{latasCalc}</div>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <ArrowLeftRight className="size-3" />
              Al guardar, se recalcula el stock del lote en las ubicaciones origen y destino.
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cols.data?.map((c) => {
            const readOnly = READ_ONLY_ALWAYS.has(c.column_name);
            const v = values[c.column_name];
            return (
              <div key={c.column_name} className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <span className={readOnly ? "text-muted-foreground" : ""}>{c.column_name}</span>
                  <span className="text-[9px] text-muted-foreground">{c.udt_name}</span>
                  {c.is_nullable === "NO" && !readOnly && <span className="text-destructive">*</span>}
                </Label>
                {isBoolType(c.udt_name) ? (
                  <div className="flex items-center gap-2 h-9">
                    <Checkbox
                      checked={!!v}
                      disabled={readOnly}
                      onCheckedChange={(cv) => setVal(c.column_name, !!cv)}
                    />
                    <span className="text-xs text-muted-foreground">{v ? "verdadero" : "falso"}</span>
                  </div>
                ) : isJsonType(c.udt_name) ? (
                  <Textarea
                    value={v == null ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                    disabled={readOnly}
                    rows={3}
                    className="font-mono text-xs"
                    onChange={(e) => {
                      try {
                        setVal(c.column_name, e.target.value ? JSON.parse(e.target.value) : null);
                      } catch {
                        setVal(c.column_name, e.target.value);
                      }
                    }}
                  />
                ) : isDateType(c.udt_name) ? (
                  <Input type="date" value={v ?? ""} disabled={readOnly}
                    onChange={(e) => setVal(c.column_name, e.target.value || null)} />
                ) : isTimestampType(c.udt_name) ? (
                  <Input value={v == null ? "" : String(v)} disabled={readOnly}
                    onChange={(e) => setVal(c.column_name, e.target.value || null)} />
                ) : isNumericType(c.udt_name) ? (
                  <Input type="number" step="any" value={v ?? ""} disabled={readOnly}
                    onChange={(e) => setVal(c.column_name, e.target.value === "" ? null : Number(e.target.value))} />
                ) : c.column_name === "observaciones" || c.column_name === "motivo" || c.column_name === "descripcion" ? (
                  <Textarea rows={2} value={v ?? ""} disabled={readOnly}
                    onChange={(e) => setVal(c.column_name, e.target.value || null)} />
                ) : (
                  <Input value={v ?? ""} disabled={readOnly}
                    placeholder={isUUIDType(c.udt_name) ? "uuid" : ""}
                    onChange={(e) => setVal(c.column_name, e.target.value === "" ? null : e.target.value)} />
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de auditoría + revertir                                       */
/* ------------------------------------------------------------------ */

function AuditPanel() {
  const qc = useQueryClient();
  const [filterTable, setFilterTable] = useState<string>("__all");
  const [onlyReverted, setOnlyReverted] = useState<"all" | "active" | "reverted">("all");
  const [detail, setDetail] = useState<any | null>(null);

  const q = useQuery({
    queryKey: ["ctrl-audit", filterTable, onlyReverted],
    queryFn: async () => {
      let query = supabase.from("admin_audit" as any).select("*")
        .order("created_at", { ascending: false }).limit(500);
      if (filterTable !== "__all") query = query.eq("tabla", filterTable);
      if (onlyReverted === "active") query = query.eq("reverted", false);
      if (onlyReverted === "reverted") query = query.eq("reverted", true);
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const revertMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_revert_audit", { p_audit_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revertido. Stock recalculado si correspondía.");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al revertir"),
  });

  return (
    <Card className="p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48">
          <Label className="text-xs">Tabla</Label>
          <Select value={filterTable} onValueChange={setFilterTable}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas</SelectItem>
              {TABLES.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40">
          <Label className="text-xs">Estado</Label>
          <Select value={onlyReverted} onValueChange={(v: any) => setOnlyReverted(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Solo activos</SelectItem>
              <SelectItem value="reverted">Solo revertidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["ctrl-audit"] })} className="gap-1.5">
          <RefreshCw className="size-4" /> Refrescar
        </Button>
      </div>

      <div className="overflow-auto max-h-[65vh] border rounded">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr className="text-left">
              <th className="px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5">Usuario</th>
              <th className="px-2 py-1.5">Tabla</th>
              <th className="px-2 py-1.5">Acción</th>
              <th className="px-2 py-1.5">Row ID</th>
              <th className="px-2 py-1.5">Estado</th>
              <th className="px-2 py-1.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-2 py-1 truncate max-w-40">{r.usuario_email || "—"}</td>
                <td className="px-2 py-1 font-mono">{r.tabla}</td>
                <td className="px-2 py-1">
                  <Badge variant={
                    r.accion === "DELETE" ? "destructive" :
                    r.accion.startsWith("REVERT") ? "secondary" : "outline"
                  }>{r.accion}</Badge>
                </td>
                <td className="px-2 py-1 font-mono text-[10px] truncate max-w-40">{r.row_pk}</td>
                <td className="px-2 py-1">
                  {r.reverted
                    ? <Badge variant="secondary">revertido</Badge>
                    : <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">activo</Badge>}
                </td>
                <td className="px-2 py-1 text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>Ver</Button>
                    {!r.reverted && !r.accion.startsWith("REVERT") && (
                      <Button size="sm" variant="outline" className="gap-1"
                        disabled={revertMut.isPending}
                        onClick={() => {
                          if (confirm("¿Revertir este cambio? Se restaurarán los valores anteriores.")) {
                            revertMut.mutate(r.id);
                          }
                        }}>
                        <Undo2 className="size-3" /> Revertir
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {q.data?.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Dialog open onOpenChange={(o) => { if (!o) setDetail(null); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalle · {detail.tabla} · {detail.accion}</DialogTitle>
              <DialogDescription>{new Date(detail.created_at).toLocaleString()} · {detail.usuario_email}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold mb-1">Antes</div>
                <pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-96">
                  {detail.before_data ? JSON.stringify(detail.before_data, null, 2) : "—"}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">Después</div>
                <pre className="bg-muted p-2 rounded text-[10px] overflow-auto max-h-96">
                  {detail.after_data ? JSON.stringify(detail.after_data, null, 2) : "—"}
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
