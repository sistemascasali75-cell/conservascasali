import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Upload, FileUp } from "lucide-react";
import { exportXLSX } from "@/lib/export";

/** Columnas de la plantilla (orden fijo). */
const COLS = [
  "Item", "Usuario", "Producto", "Presentación", "Lote / Código certif.",
  "xCertif", "Producido", "Codificado", "Certifica", "Fecha certif. (YYYY-MM-DD)", "Obs.",
] as const;

type Parsed = {
  item: number | null;
  usuario: string | null;
  producto: string | null;
  presentacion: string | null;
  lote_codigo: string | null;
  xcertif: number | null;
  producido: number | null;
  codificado: string | null;
  certifica: string | null;
  fecha_certif: string | null;
  obs: string | null;
};

const txt = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = typeof v === "object" && v?.text ? String(v.text) : String(v);
  const t = s.trim();
  return t === "" ? null : t;
};
const num = (v: any): number | null => {
  const s = txt(v);
  if (s === null) return null;
  const n = Number(s.replace(/\s|,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fecha = (v: any): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = txt(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function CalidadImport({ existingItems }: { existingItems: Map<number, string> }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  function descargarPlantilla() {
    exportXLSX({
      sheetName: "Calidad",
      headers: [...COLS],
      rows: [
        [1, "CASALI", "FILETE DE CABALLA EN ACEITE VEGETAL", "1/2 LB", "BRFBAA FP:01 08 2026 FV:01 08 2030", 1200, 57600, "SI", "SI", "2026-08-01", "QW"],
        [2, "POLAY", "GRATED DE CABALLA EN AGUA Y SAL", "1 LB TALL", "BRFBAB FP:02 08 2026 FV:02 08 2030", 800, 19200, "SI", "-", "2026-08-02", "LOCAL"],
      ],
      filename: "plantilla_calidad_codigos.xlsx",
    });
  }

  async function onFile(file: File) {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("El archivo no tiene hojas");

      // Localiza la fila de encabezados (busca "Item" en la columna A o B)
      let headerRow = 1;
      for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
        const v = String(ws.getRow(r).getCell(1).value ?? "").trim().toLowerCase();
        if (v === "item") { headerRow = r; break; }
      }

      const parsed: Parsed[] = [];
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const c = (i: number) => ws.getRow(r).getCell(i).value;
        const row: Parsed = {
          item: num(c(1)),
          usuario: txt(c(2)),
          producto: txt(c(3)),
          presentacion: txt(c(4)),
          lote_codigo: txt(c(5)),
          xcertif: num(c(6)),
          producido: num(c(7)),
          codificado: txt(c(8)),
          certifica: txt(c(9)),
          fecha_certif: fecha(c(10)),
          obs: txt(c(11)),
        };
        const vacio = Object.values(row).every((v) => v === null);
        if (!vacio) parsed.push(row);
      }
      if (parsed.length === 0) throw new Error("No se encontraron filas con datos");
      setFileName(file.name);
      setRows(parsed);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el archivo");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importar() {
    if (!rows) return;
    setSaving(true);
    try {
      let creados = 0, actualizados = 0;
      for (const r of rows) {
        const id = r.item != null ? existingItems.get(r.item) : undefined;
        if (id) {
          const { error } = await (supabase as any).from("calidad_codigos").update(r).eq("id", id);
          if (error) throw error;
          actualizados++;
        } else {
          const { error } = await (supabase as any).from("calidad_codigos").insert(r);
          if (error) throw error;
          creados++;
        }
      }
      qc.invalidateQueries({ queryKey: ["calidad-codigos"] });
      toast.success(`Importación lista: ${creados} nuevos, ${actualizados} actualizados`);
      setRows(null);
    } catch (e: any) {
      toast.error(e.message ?? "Error al importar");
    } finally {
      setSaving(false);
    }
  }

  const nuevos = (rows ?? []).filter((r) => r.item == null || !existingItems.has(r.item)).length;
  const updates = (rows ?? []).length - nuevos;

  return (
    <>
      <div className="flex items-end gap-2">
        <Button variant="outline" size="sm" className="h-9" onClick={descargarPlantilla}>
          <Download className="size-4 mr-1" /> Plantilla
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4 mr-1" /> Importar Excel
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>

      <Dialog open={!!rows} onOpenChange={(o) => !o && setRows(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileUp className="size-5" /> Previsualizar importación</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{fileName}</Badge>
              <Badge variant="secondary">{rows?.length ?? 0} filas</Badge>
              <Badge className="bg-emerald-600">{nuevos} nuevos</Badge>
              <Badge className="bg-amber-600">{updates} actualizados (por Item)</Badge>
            </div>
            <Card className="max-h-[45vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0">
                  <tr>{COLS.map((c) => <th key={c} className="text-left px-2 py-1.5 whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {(rows ?? []).slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{r.item ?? "—"}</td>
                      <td className="px-2 py-1">{r.usuario ?? "—"}</td>
                      <td className="px-2 py-1">{r.producto ?? "—"}</td>
                      <td className="px-2 py-1">{r.presentacion ?? "—"}</td>
                      <td className="px-2 py-1 font-mono">{r.lote_codigo ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{r.xcertif ?? "—"}</td>
                      <td className="px-2 py-1 text-right">{r.producido ?? "—"}</td>
                      <td className="px-2 py-1 text-center">{r.codificado ?? "—"}</td>
                      <td className="px-2 py-1 text-center">{r.certifica ?? "—"}</td>
                      <td className="px-2 py-1">{r.fecha_certif ?? "—"}</td>
                      <td className="px-2 py-1">{r.obs ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="text-xs text-muted-foreground">
              Las filas con un <b>Item</b> existente se actualizan; las demás se crean como nuevos registros.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRows(null)}>Cancelar</Button>
            <Button onClick={importar} disabled={saving}>{saving ? "Importando…" : "Confirmar importación"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
