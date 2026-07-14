import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, daysUntil } from "@/lib/format";
import { exportXLSX, exportPDF } from "@/lib/export";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  TrendingUp, DollarSign, Truck, ShieldCheck, AlertTriangle, Activity, FileDown, FileText,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes/analitica")({
  component: AnaliticaPage,
});

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--accent))"];

function rangeMonths(n: number) {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setMonth(desde.getMonth() - n);
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) };
}

function AnaliticaPage() {
  const [{ desde, hasta }, setRange] = useState(rangeMonths(6));
  const [tab, setTab] = useState<"costos" | "rotacion" | "cumplimiento" | "proveedores" | "proyeccion">("costos");

  const { data } = useQuery({
    queryKey: ["analitica", desde, hasta],
    queryFn: async () => {
      const [movs, lotes, stock, prod, cli] = await Promise.all([
        supabase.from("movimientos").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha"),
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("clientes_proveedores").select("*"),
      ]);
      return {
        movs: movs.data ?? [],
        lotes: lotes.data ?? [],
        stock: stock.data ?? [],
        productos: prod.data ?? [],
        clientes: cli.data ?? [],
      };
    },
  });

  const m = useMemo(() => {
    if (!data) return null;
    const lotesM = new Map(data.lotes.map((l) => [l.id, l]));
    const prodM = new Map(data.productos.map((p) => [p.id, p]));
    const cliM = new Map(data.clientes.map((c) => [c.id, c]));

    // ---- Costos por mes ----
    const mesMap = new Map<string, { mes: string; entradas: number; salidas: number; mermas: number; costoSalidas: number; costoMermas: number }>();
    data.movs.forEach((mv: any) => {
      const mes = String(mv.fecha).slice(0, 7);
      const cur = mesMap.get(mes) ?? { mes, entradas: 0, salidas: 0, mermas: 0, costoSalidas: 0, costoMermas: 0 };
      const l: any = lotesM.get(mv.lote_id);
      const costo = Number(l?.costo_por_caja ?? 0) * Number(mv.cantidad_cajas);
      if (mv.tipo === "ENTRADA") cur.entradas += Number(mv.cantidad_cajas);
      else if (mv.tipo === "SALIDA") { cur.salidas += Number(mv.cantidad_cajas); cur.costoSalidas += costo; }
      else if (mv.tipo === "MERMA" || mv.tipo === "AJUSTE_NEGATIVO") { cur.mermas += Number(mv.cantidad_cajas); cur.costoMermas += costo; }
      mesMap.set(mes, cur);
    });
    const costoPorMes = Array.from(mesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));

    // ---- Rotación por producto (salidas / stock promedio) ----
    const salidasProd = new Map<string, number>();
    data.movs.forEach((mv: any) => {
      if (mv.tipo !== "SALIDA") return;
      const l: any = lotesM.get(mv.lote_id); if (!l) return;
      const p: any = prodM.get(l.producto_id); if (!p) return;
      salidasProd.set(p.descripcion, (salidasProd.get(p.descripcion) ?? 0) + Number(mv.cantidad_cajas));
    });
    const stockProd = new Map<string, number>();
    data.stock.forEach((s: any) => {
      const l: any = lotesM.get(s.lote_id); if (!l) return;
      const p: any = prodM.get(l.producto_id); if (!p) return;
      stockProd.set(p.descripcion, (stockProd.get(p.descripcion) ?? 0) + Number(s.cantidad_cajas));
    });
    const rotacion = Array.from(salidasProd.entries()).map(([producto, salidas]) => {
      const stk = stockProd.get(producto) ?? 0;
      const indice = stk > 0 ? salidas / stk : salidas > 0 ? 999 : 0;
      return { producto, salidas, stock: stk, indice: Number(indice.toFixed(2)) };
    }).sort((a, b) => b.indice - a.indice).slice(0, 15);

    // ---- Cumplimiento (lotes con stock por estado) ----
    const stockLote = new Map<string, number>();
    data.stock.forEach((s: any) => stockLote.set(s.lote_id, (stockLote.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    const estCount: Record<string, number> = {};
    data.lotes.forEach((l: any) => {
      if ((stockLote.get(l.id) ?? 0) <= 0) return;
      estCount[l.estado] = (estCount[l.estado] ?? 0) + 1;
    });
    const totLotes = Object.values(estCount).reduce((a, b) => a + b, 0);
    const cumplimiento = Object.entries(estCount).map(([estado, n]) => ({
      estado, lotes: n, pct: totLotes ? Number(((n / totLotes) * 100).toFixed(1)) : 0,
    }));

    // ---- Ranking proveedores (entradas) ----
    const provMap = new Map<string, { proveedor: string; entradas: number; valor: number; ops: number }>();
    data.movs.forEach((mv: any) => {
      if (mv.tipo !== "ENTRADA" || !mv.cliente_proveedor_id) return;
      const c: any = cliM.get(mv.cliente_proveedor_id);
      const k = c?.nombre ?? "—";
      const l: any = lotesM.get(mv.lote_id);
      const valor = Number(l?.costo_por_caja ?? 0) * Number(mv.cantidad_cajas);
      const cur = provMap.get(k) ?? { proveedor: k, entradas: 0, valor: 0, ops: 0 };
      cur.entradas += Number(mv.cantidad_cajas);
      cur.valor += valor;
      cur.ops += 1;
      provMap.set(k, cur);
    });
    const proveedores = Array.from(provMap.values()).sort((a, b) => b.valor - a.valor).slice(0, 15);

    // ---- Proyección 3 meses (vencimientos) ----
    const proyMap = new Map<string, { mes: string; cajas: number; valor: number }>();
    for (let i = 0; i < 4; i++) {
      const d = new Date(); d.setMonth(d.getMonth() + i);
      const k = d.toISOString().slice(0, 7);
      proyMap.set(k, { mes: k, cajas: 0, valor: 0 });
    }
    data.lotes.forEach((l: any) => {
      const c = stockLote.get(l.id) ?? 0;
      if (c <= 0) return;
      const d = daysUntil(l.fecha_vencimiento);
      if (d < 0 || d > 120) return;
      const fv = new Date(l.fecha_vencimiento);
      const k = fv.toISOString().slice(0, 7);
      const cur = proyMap.get(k);
      if (cur) { cur.cajas += c; cur.valor += c * Number(l.costo_por_caja ?? 0); }
    });
    const proyeccion = Array.from(proyMap.values());

    return { costoPorMes, rotacion, cumplimiento, proveedores, proyeccion };
  }, [data]);

  if (!m) return <div className="p-8 text-muted-foreground">Cargando analítica…</div>;

  const exportCurrentXLSX = () => {
    if (tab === "costos") {
      exportXLSX({
        sheetName: "Costos por mes",
        headers: ["Mes", "Entradas (cj)", "Salidas (cj)", "Mermas (cj)", "Costo Salidas (S/.)", "Costo Mermas (S/.)"],
        rows: m.costoPorMes.map((r) => [r.mes, r.entradas, r.salidas, r.mermas, r.costoSalidas.toFixed(2), r.costoMermas.toFixed(2)]),
        filename: `Costos_${desde}_${hasta}.xlsx`,
      });
    } else if (tab === "rotacion") {
      exportXLSX({
        sheetName: "Rotación",
        headers: ["Producto", "Salidas (cj)", "Stock actual", "Índice rotación"],
        rows: m.rotacion.map((r) => [r.producto, r.salidas, r.stock, r.indice]),
        filename: `Rotacion_${desde}_${hasta}.xlsx`,
      });
    } else if (tab === "proveedores") {
      exportXLSX({
        sheetName: "Proveedores",
        headers: ["Proveedor", "Entradas (cj)", "Operaciones", "Valor (S/.)"],
        rows: m.proveedores.map((r) => [r.proveedor, r.entradas, r.ops, r.valor.toFixed(2)]),
        filename: `Proveedores_${desde}_${hasta}.xlsx`,
      });
    } else if (tab === "proyeccion") {
      exportXLSX({
        sheetName: "Proyección 3 meses",
        headers: ["Mes", "Cajas a vencer", "Valor (S/.)"],
        rows: m.proyeccion.map((r) => [r.mes, r.cajas, r.valor.toFixed(2)]),
        filename: `Proyeccion_3m.xlsx`,
      });
    } else {
      exportXLSX({
        sheetName: "Cumplimiento",
        headers: ["Estado", "Lotes", "%"],
        rows: m.cumplimiento.map((r) => [r.estado, r.lotes, r.pct]),
        filename: `Cumplimiento.xlsx`,
      });
    }
  };

  const exportCurrentPDF = async () => {
    const titles: Record<typeof tab, string> = {
      costos: "Costos por mes",
      rotacion: "Rotación de productos",
      cumplimiento: "Cumplimiento de certificación",
      proveedores: "Ranking de proveedores",
      proyeccion: "Proyección de vencimientos (3 meses)",
    };
    let headers: string[] = []; let rows: any[][] = [];
    if (tab === "costos") {
      headers = ["Mes", "Entradas", "Salidas", "Mermas", "Costo Sal (S/.)", "Costo Mer (S/.)"];
      rows = m.costoPorMes.map((r) => [r.mes, r.entradas, r.salidas, r.mermas, r.costoSalidas.toFixed(2), r.costoMermas.toFixed(2)]);
    } else if (tab === "rotacion") {
      headers = ["Producto", "Salidas", "Stock", "Índice"];
      rows = m.rotacion.map((r) => [r.producto, r.salidas, r.stock, r.indice]);
    } else if (tab === "proveedores") {
      headers = ["Proveedor", "Entradas", "Ops", "Valor (S/.)"];
      rows = m.proveedores.map((r) => [r.proveedor, r.entradas, r.ops, r.valor.toFixed(2)]);
    } else if (tab === "proyeccion") {
      headers = ["Mes", "Cajas", "Valor (S/.)"];
      rows = m.proyeccion.map((r) => [r.mes, r.cajas, r.valor.toFixed(2)]);
    } else {
      headers = ["Estado", "Lotes", "%"];
      rows = m.cumplimiento.map((r) => [r.estado, r.lotes, r.pct]);
    }
    await exportPDF({
      title: titles[tab],
      subtitle: `Periodo ${desde} → ${hasta}`,
      headers, rows,
      filename: `${titles[tab]}.pdf`,
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analítica avanzada</h1>
          <p className="text-muted-foreground">Costos, rotación, cumplimiento, proveedores y proyección</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block">Desde</label>
            <Input type="date" value={desde} onChange={(e) => setRange((r) => ({ ...r, desde: e.target.value }))} className="h-9 w-40" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground block">Hasta</label>
            <Input type="date" value={hasta} onChange={(e) => setRange((r) => ({ ...r, hasta: e.target.value }))} className="h-9 w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setRange(rangeMonths(3))}>3m</Button>
          <Button variant="outline" size="sm" onClick={() => setRange(rangeMonths(6))}>6m</Button>
          <Button variant="outline" size="sm" onClick={() => setRange(rangeMonths(12))}>12m</Button>
          <Button variant="outline" size="sm" onClick={exportCurrentXLSX}><FileDown className="size-4 mr-1" />Excel</Button>
          <Button variant="outline" size="sm" onClick={exportCurrentPDF}><FileText className="size-4 mr-1" />PDF</Button>
        </div>
      </header>

      <div className="flex gap-1 flex-wrap border-b">
        {([
          ["costos", "Costos por mes", DollarSign],
          ["rotacion", "Rotación", Activity],
          ["cumplimiento", "Cumplimiento", ShieldCheck],
          ["proveedores", "Proveedores", Truck],
          ["proyeccion", "Proyección 3m", TrendingUp],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px ${tab === id ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "costos" && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Evolución mensual de costos</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={m.costoPorMes}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v, 0)} />
              <Tooltip formatter={(v: number) => `S/. ${formatNumber(v)}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" name="Costo Salidas" dataKey="costoSalidas" stroke="hsl(var(--primary))" strokeWidth={2} />
              <Line type="monotone" name="Costo Mermas" dataKey="costoMermas" stroke="hsl(var(--destructive))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mes</TableHead><TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Salidas</TableHead><TableHead className="text-right">Mermas</TableHead>
                <TableHead className="text-right">Costo salidas</TableHead><TableHead className="text-right">Costo mermas</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {m.costoPorMes.map((r) => (
                  <TableRow key={r.mes}>
                    <TableCell className="font-medium">{r.mes}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.entradas, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.salidas, 0)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatNumber(r.mermas, 0)}</TableCell>
                    <TableCell className="text-right">S/. {formatNumber(r.costoSalidas)}</TableCell>
                    <TableCell className="text-right text-destructive">S/. {formatNumber(r.costoMermas)}</TableCell>
                  </TableRow>
                ))}
                {m.costoPorMes.length > 0 && (
                  <TableRow className="font-bold bg-muted/40">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatNumber(m.costoPorMes.reduce((a, b) => a + b.entradas, 0), 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(m.costoPorMes.reduce((a, b) => a + b.salidas, 0), 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(m.costoPorMes.reduce((a, b) => a + b.mermas, 0), 0)}</TableCell>
                    <TableCell className="text-right">S/. {formatNumber(m.costoPorMes.reduce((a, b) => a + b.costoSalidas, 0))}</TableCell>
                    <TableCell className="text-right">S/. {formatNumber(m.costoPorMes.reduce((a, b) => a + b.costoMermas, 0))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {tab === "rotacion" && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Top 15 productos por índice de rotación</h2>
          <p className="text-xs text-muted-foreground mb-3">Índice = salidas (en periodo) ÷ stock actual. Mayor = se mueve más rápido.</p>
          <ResponsiveContainer width="100%" height={Math.max(280, m.rotacion.length * 26)}>
            <BarChart data={m.rotacion} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="producto" width={180} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="indice" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Salidas</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Índice</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {m.rotacion.map((r) => (
                  <TableRow key={r.producto}>
                    <TableCell>{r.producto}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.salidas, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.stock, 0)}</TableCell>
                    <TableCell className="text-right font-bold">{r.indice}x</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {tab === "cumplimiento" && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Estado de lotes (cumplimiento de certificación)</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={m.cumplimiento} dataKey="lotes" nameKey="estado" cx="50%" cy="50%" outerRadius={100} label={(e: any) => `${e.estado}: ${e.pct}%`}>
                  {m.cumplimiento.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Lotes</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {m.cumplimiento.map((r) => (
                    <TableRow key={r.estado}>
                      <TableCell className="font-medium">{r.estado}</TableCell>
                      <TableCell className="text-right">{r.lotes}</TableCell>
                      <TableCell className="text-right font-bold">{r.pct}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      )}

      {tab === "proveedores" && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Ranking de proveedores por valor de entradas</h2>
          <ResponsiveContainer width="100%" height={Math.max(280, m.proveedores.length * 26)}>
            <BarChart data={m.proveedores} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="proveedor" width={200} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `S/. ${formatNumber(v)}`} />
              <Bar dataKey="valor" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Entradas (cj)</TableHead>
                <TableHead className="text-right">Operaciones</TableHead>
                <TableHead className="text-right">Valor (S/.)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {m.proveedores.map((r) => (
                  <TableRow key={r.proveedor}>
                    <TableCell className="font-medium">{r.proveedor}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.entradas, 0)}</TableCell>
                    <TableCell className="text-right">{r.ops}</TableCell>
                    <TableCell className="text-right font-bold">S/. {formatNumber(r.valor)}</TableCell>
                  </TableRow>
                ))}
                {m.proveedores.length > 0 && (
                  <TableRow className="font-bold bg-muted/40">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatNumber(m.proveedores.reduce((a, b) => a + b.entradas, 0), 0)}</TableCell>
                    <TableCell className="text-right">{m.proveedores.reduce((a, b) => a + b.ops, 0)}</TableCell>
                    <TableCell className="text-right">S/. {formatNumber(m.proveedores.reduce((a, b) => a + b.valor, 0))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {tab === "proyeccion" && (
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Proyección de vencimientos · próximos 3 meses</h2>
          <p className="text-xs text-muted-foreground mb-3">Cajas y valor de stock cuya FV cae en cada mes.</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={m.proyeccion}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, n) => n === "valor" ? `S/. ${formatNumber(v)}` : formatNumber(v, 0)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" name="Cajas" dataKey="cajas" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="r" name="Valor S/." dataKey="valor" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Cajas a vencer</TableHead>
                <TableHead className="text-right">Valor (S/.)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {m.proyeccion.map((r) => (
                  <TableRow key={r.mes}>
                    <TableCell className="font-medium">{r.mes}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.cajas, 0)}</TableCell>
                    <TableCell className="text-right text-destructive font-bold">S/. {formatNumber(r.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
