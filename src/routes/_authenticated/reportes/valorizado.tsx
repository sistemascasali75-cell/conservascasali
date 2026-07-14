import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";
import { fetchEmpaquePorLote, resolveEmpaque } from "@/lib/empaque";
import { exportPDF, exportXLSX } from "@/lib/export";
import { FileDown, FileSpreadsheet, Pencil, Save, X } from "lucide-react";
import { useRoles } from "@/hooks/use-role";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reportes/valorizado")({
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const { canManageCatalogs } = useRoles();
  const [editing, setEditing] = useState<string | null>(null);
  const [costoInput, setCostoInput] = useState("");

  const { data } = useQuery({
    queryKey: ["rep-val"],
    queryFn: async () => {
      const [l, s, p, u, a, empMap] = await Promise.all([
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
        fetchEmpaquePorLote(),
      ]);
      return { lotes: l.data ?? [], stock: s.data ?? [], productos: p.data ?? [], ubicaciones: u.data ?? [], almacenes: a.data ?? [], empaquePorLote: empMap };
    },
  });

  const updateCosto = useMutation({
    mutationFn: async ({ id, costo }: { id: string; costo: number }) => {
      const { error } = await supabase.from("lotes").update({ costo_por_caja: costo } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Costo actualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["rep-val"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filas = useMemo(() => {
    if (!data) return [];
    const ubicMap = new Map(data.ubicaciones.map((u) => [u.id, u]));
    const almMap = new Map(data.almacenes.map((a) => [a.id, a]));
    const prodMap = new Map(data.productos.map((p) => [p.id, p]));
    const loteMap = new Map(data.lotes.map((l) => [l.id, l]));

    const acumPorProdAlm = new Map<string, { producto: string; almacen: string; cajas: number; latas: number; totalLatas: number; valor: number; productoId: string; almacenId: string }>();
    data.stock.forEach((s: any) => {
      const totalLatas = Number(s.total_latas ?? 0);
      if (totalLatas <= 0) return;
      const l: any = loteMap.get(s.lote_id);
      if (!l) return;
      const u: any = ubicMap.get(s.ubicacion_id);
      if (!u) return;
      const a: any = almMap.get(u.almacen_id);
      const p: any = prodMap.get(l.producto_id);
      const empaque = resolveEmpaque(l.id, data.empaquePorLote, p?.empaque);
      const cajas = Math.floor(totalLatas / empaque);
      const latasSueltas = totalLatas - cajas * empaque;
      const key = `${l.producto_id}|${u.almacen_id}`;
      const cur = acumPorProdAlm.get(key) ?? { producto: p?.descripcion ?? "", almacen: a?.nombre ?? "", cajas: 0, latas: 0, totalLatas: 0, valor: 0, productoId: l.producto_id, almacenId: u.almacen_id };
      cur.cajas += cajas;
      cur.latas += latasSueltas;
      cur.totalLatas += totalLatas;
      cur.valor += (totalLatas / empaque) * Number((l as any).costo_por_caja ?? 0);
      acumPorProdAlm.set(key, cur);
    });
    return Array.from(acumPorProdAlm.values()).sort((a, b) => a.producto.localeCompare(b.producto));
  }, [data]);

  const total = filas.reduce((s, f) => s + f.valor, 0);
  const totalCj = filas.reduce((s, f) => s + f.cajas, 0);
  const totalLatasSum = filas.reduce((s, f) => s + f.totalLatas, 0);


  const headers = ["Producto", "Almacén", "Cajas", "Latas sueltas", "Inventario (latas)", "Valor S/."];
  const rows = filas.map((f) => [f.producto, f.almacen, f.cajas, f.latas, f.totalLatas, f.valor.toFixed(2)]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventario Valorizado</h1>
          <p className="text-muted-foreground">Valor del stock por producto y almacén (S/.)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportXLSX({ sheetName: "Valorizado", headers, rows, filename: "Inv_Valorizado.xlsx" })}>
            <FileSpreadsheet className="size-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" onClick={() => exportPDF({ title: "Inventario Valorizado", headers, rows, filename: "Inv_Valorizado.pdf" })}>
            <FileDown className="size-4 mr-2" /> PDF
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Total cajas</div>
          <div className="text-3xl font-bold mt-1">{formatNumber(totalCj, 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Inventario (latas)</div>
          <div className="text-3xl font-bold mt-1 text-primary">{formatNumber(totalLatasSum, 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Valor total</div>
          <div className="text-3xl font-bold mt-1">S/. {formatNumber(total)}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">Almacén</th>
                <th className="text-right px-3 py-2">Cajas</th>
                <th className="text-right px-3 py-2">Latas sueltas</th>
                <th className="text-right px-3 py-2">Inventario (latas)</th>
                <th className="text-right px-3 py-2">Valor (S/.)</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{f.producto}</td>
                  <td className="px-3 py-2">{f.almacen}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(f.cajas, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatNumber(f.latas, 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">{formatNumber(f.totalLatas, 0)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatNumber(f.valor)}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin stock</td></tr>}
            </tbody>
          </table>

        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Costos por lote</h2>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-right px-3 py-2">Costo / caja (S/.)</th>
                {canManageCatalogs && <th className="px-3 py-2 w-24"></th>}
              </tr>
            </thead>
            <tbody>
              {(data?.lotes ?? []).map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{l.codigo_lote}</td>
                  <td className="px-3 py-2 text-right">
                    {editing === l.id ? (
                      <Input type="number" step="0.01" value={costoInput} onChange={(e) => setCostoInput(e.target.value)} className="h-8 w-28 ml-auto" />
                    ) : (
                      formatNumber(l.costo_por_caja ?? 0)
                    )}
                  </td>
                  {canManageCatalogs && (
                    <td className="px-3 py-2 text-right">
                      {editing === l.id ? (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => updateCosto.mutate({ id: l.id, costo: Number(costoInput) || 0 })}>
                            <Save className="size-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            <X className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(l.id); setCostoInput(String(l.costo_por_caja ?? 0)); }}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
