import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes/despachos")({
  component: Page,
});

function Page() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const { data } = useQuery({
    queryKey: ["rep-desp", desde, hasta],
    queryFn: async () => {
      let q = supabase.from("movimientos").select("*").eq("tipo", "SALIDA").order("fecha", { ascending: false });
      if (desde) q = q.gte("fecha", desde);
      if (hasta) q = q.lte("fecha", hasta);
      const [m, c, l, p] = await Promise.all([
        q,
        supabase.from("clientes_proveedores").select("*"),
        supabase.from("lotes").select("id,producto_id,codigo_lote"),
        supabase.from("productos").select("id,descripcion"),
      ]);
      return { movs: m.data ?? [], clientes: c.data ?? [], lotes: l.data ?? [], productos: p.data ?? [] };
    },
  });

  const { porCliente, detalle } = useMemo(() => {
    if (!data) return { porCliente: [], detalle: [] };
    const cliMap = new Map(data.clientes.map((c) => [c.id, c]));
    const loteMap = new Map(data.lotes.map((l) => [l.id, l]));
    const prodMap = new Map(data.productos.map((p) => [p.id, p]));

    const acum = new Map<string, { cliente: string; periodo: string; cajas: number; salidas: number }>();
    const detalle: any[] = [];
    data.movs.forEach((m: any) => {
      const cli: any = cliMap.get(m.cliente_proveedor_id);
      const nombre = cli?.nombre ?? "(sin cliente)";
      const periodo = m.fecha?.slice(0, 7) ?? "—";
      const key = `${nombre}|${periodo}`;
      const cur = acum.get(key) ?? { cliente: nombre, periodo, cajas: 0, salidas: 0 };
      cur.cajas += Number(m.cantidad_cajas);
      cur.salidas += 1;
      acum.set(key, cur);

      const l: any = loteMap.get(m.lote_id);
      const p: any = l ? prodMap.get(l.producto_id) : null;
      detalle.push({
        fecha: m.fecha,
        cliente: nombre,
        guia: m.nro_guia ?? m.nro_vale ?? "",
        producto: p?.descripcion ?? "",
        lote: l?.codigo_lote ?? "",
        cajas: Number(m.cantidad_cajas),
      });
    });
    const porCliente = Array.from(acum.values()).sort((a, b) => b.cajas - a.cajas);
    return { porCliente, detalle };
  }, [data]);

  const totalCj = porCliente.reduce((s, r) => s + r.cajas, 0);
  const headers = ["Cliente", "Periodo", "N° Despachos", "Cajas"];
  const rows = porCliente.map((r) => [r.cliente, r.periodo, r.salidas, r.cajas]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Despachos por Cliente</h1>
          <p className="text-muted-foreground">Salidas agrupadas por cliente y mes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportXLSX({ sheetName: "Despachos", headers, rows, filename: "Despachos.xlsx" })}>
            <FileSpreadsheet className="size-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" onClick={() => exportPDF({ title: "Despachos por Cliente", headers, rows, filename: "Despachos.pdf" })}>
            <FileDown className="size-4 mr-2" /> PDF
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10" />
          </div>
          <Card className="p-3 col-span-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total cajas despachadas</div>
            <div className="text-2xl font-bold">{formatNumber(totalCj, 0)}</div>
          </Card>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Resumen por cliente / periodo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Periodo</th>
                <th className="text-right px-3 py-2">N° Despachos</th>
                <th className="text-right px-3 py-2">Cajas</th>
              </tr>
            </thead>
            <tbody>
              {porCliente.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.cliente}</td>
                  <td className="px-3 py-2">{r.periodo}</td>
                  <td className="px-3 py-2 text-right">{r.salidas}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.cajas)}</td>
                </tr>
              ))}
              {porCliente.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sin despachos</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Detalle</h2>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Guía/Vale</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-right px-3 py-2">Cajas</th>
              </tr>
            </thead>
            <tbody>
              {detalle.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{formatDate(d.fecha)}</td>
                  <td className="px-3 py-2">{d.cliente}</td>
                  <td className="px-3 py-2 text-xs">{d.guia}</td>
                  <td className="px-3 py-2">{d.producto}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.lote}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(d.cajas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
