import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber, daysUntil } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes/vencimientos")({
  component: Page,
});

const BUCKETS = [
  { key: "VENCIDO", label: "Vencido", color: "bg-destructive text-destructive-foreground", test: (d: number) => d < 0 },
  { key: "M3", label: "< 3 meses", color: "bg-destructive/70 text-destructive-foreground", test: (d: number) => d >= 0 && d < 90 },
  { key: "M3_6", label: "3 – 6 meses", color: "bg-warning text-warning-foreground", test: (d: number) => d >= 90 && d < 180 },
  { key: "M6_12", label: "6 – 12 meses", color: "bg-accent text-accent-foreground", test: (d: number) => d >= 180 && d < 365 },
  { key: "M12", label: "> 12 meses", color: "bg-success text-success-foreground", test: (d: number) => d >= 365 },
];

function Page() {
  const { data } = useQuery({
    queryKey: ["rep-venc"],
    queryFn: async () => {
      const [l, s, p] = await Promise.all([
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("productos").select("*"),
      ]);
      return { lotes: l.data ?? [], stock: s.data ?? [], productos: p.data ?? [] };
    },
  });

  const filas = useMemo(() => {
    if (!data) return [];
    const stockMap = new Map<string, number>();
    data.stock.forEach((s) => stockMap.set(s.lote_id, (stockMap.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    const prodMap = new Map(data.productos.map((p) => [p.id, p]));
    return data.lotes
      .map((l) => {
        const dias = daysUntil(l.fecha_vencimiento);
        const bucket = BUCKETS.find((b) => b.test(dias))!;
        return {
          id: l.id,
          codigo: l.codigo_lote,
          producto: prodMap.get(l.producto_id)?.descripcion ?? "",
          fp: l.fecha_produccion,
          fv: l.fecha_vencimiento,
          dias,
          stock: stockMap.get(l.id) ?? 0,
          bucket: bucket.key,
          bucketLabel: bucket.label,
        };
      })
      .filter((r) => r.stock > 0)
      .sort((a, b) => a.dias - b.dias);
  }, [data]);

  const totals = useMemo(() => {
    const total = filas.reduce((s, r) => s + r.stock, 0);
    return BUCKETS.map((b) => {
      const items = filas.filter((r) => r.bucket === b.key);
      const cajas = items.reduce((s, r) => s + r.stock, 0);
      return { ...b, cajas, pct: total > 0 ? (cajas / total) * 100 : 0, count: items.length };
    });
  }, [filas]);

  const headers = ["Lote", "Producto", "FP", "FV", "Días", "Bucket", "Stock (cajas)"];
  const rows = filas.map((r) => [r.codigo, r.producto, formatDate(r.fp), formatDate(r.fv), r.dias, r.bucketLabel, r.stock]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reporte de Vencimientos</h1>
          <p className="text-muted-foreground">Lotes con stock agrupados por rango de vencimiento</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportXLSX({ sheetName: "Vencimientos", headers, rows, filename: "Vencimientos.xlsx" })}>
            <FileSpreadsheet className="size-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" onClick={() => exportPDF({ title: "Reporte de Vencimientos", headers, rows, filename: "Vencimientos.pdf" })}>
            <FileDown className="size-4 mr-2" /> PDF
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {totals.map((t) => (
          <Card key={t.key} className="p-4">
            <div className={`inline-block text-xs px-2 py-0.5 rounded ${t.color}`}>{t.label}</div>
            <div className="text-2xl font-bold mt-2">{formatNumber(t.cajas, 0)}</div>
            <div className="text-xs text-muted-foreground">{t.count} lotes · {t.pct.toFixed(1)}%</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">FP</th>
                <th className="text-left px-3 py-2">FV</th>
                <th className="text-right px-3 py-2">Días</th>
                <th className="text-left px-3 py-2">Bucket</th>
                <th className="text-right px-3 py-2">Stock (cj)</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-3 py-2">{r.producto}</td>
                  <td className="px-3 py-2">{formatDate(r.fp)}</td>
                  <td className="px-3 py-2">{formatDate(r.fv)}</td>
                  <td className={`px-3 py-2 text-right ${r.dias < 0 ? "text-destructive font-bold" : r.dias < 90 ? "text-warning font-semibold" : ""}`}>{r.dias}</td>
                  <td className="px-3 py-2 text-xs">{r.bucketLabel}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
