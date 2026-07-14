import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatNumber, daysUntil } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
} from "recharts";
import { CalendarClock, DollarSign, Truck, TrendingUp, Boxes, AlertTriangle, FileDown, Briefcase, Image as ImageIcon, Package } from "lucide-react";
import { exportXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reportes/")({
  component: ReportesHub,
});

const COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--accent))", "hsl(var(--muted-foreground))"];

function defaultRange() {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 30);
  return { desde: desde.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10) };
}

function ReportesHub() {
  const [{ desde, hasta }, setRange] = useState(defaultRange());

  const { data, isLoading } = useQuery({
    queryKey: ["rep-hub", desde, hasta],
    queryFn: async () => {
      const [movs, lotes, stock, prod, alm, ubic, cli] = await Promise.all([
        supabase.from("movimientos").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha"),
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("clientes_proveedores").select("*"),
      ]);
      return {
        movs: movs.data ?? [], lotes: lotes.data ?? [], stock: stock.data ?? [],
        productos: prod.data ?? [], almacenes: alm.data ?? [], ubicaciones: ubic.data ?? [], clientes: cli.data ?? [],
      };
    },
  });

  const m = useMemo(() => {
    if (!data) return null;
    const lotesM = new Map(data.lotes.map((l) => [l.id, l]));
    const prodM = new Map(data.productos.map((p) => [p.id, p]));
    const ubicM = new Map(data.ubicaciones.map((u) => [u.id, u]));
    const almM = new Map(data.almacenes.map((a) => [a.id, a]));
    const cliM = new Map(data.clientes.map((c) => [c.id, c]));

    // KPIs
    let entradas = 0, salidas = 0, mermas = 0, traslados = 0;
    data.movs.forEach((mv: any) => {
      const c = Number(mv.cantidad_cajas);
      if (mv.tipo === "ENTRADA") entradas += c;
      else if (mv.tipo === "SALIDA") salidas += c;
      else if (mv.tipo === "MERMA" || mv.tipo === "AJUSTE_NEGATIVO") mermas += c;
      else if (mv.tipo === "TRASLADO") traslados += c;
    });

    // Serie diaria entradas/salidas
    const dayMap = new Map<string, { fecha: string; ENTRADA: number; SALIDA: number }>();
    data.movs.forEach((mv: any) => {
      if (mv.tipo !== "ENTRADA" && mv.tipo !== "SALIDA") return;
      const f = mv.fecha;
      const cur = dayMap.get(f) ?? { fecha: f, ENTRADA: 0, SALIDA: 0 };
      cur[mv.tipo as "ENTRADA" | "SALIDA"] += Number(mv.cantidad_cajas);
      dayMap.set(f, cur);
    });
    const serieDiaria = Array.from(dayMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Empaque y latas-totales por lote (desde movimientos)
    const SIGNO: Record<string, number> = { ENTRADA: 1, AJUSTE_POSITIVO: 1, SALIDA: -1, MERMA: -1, AJUSTE_NEGATIVO: -1, TRASLADO: 0 };
    const empaquePorLote = new Map<string, number>();
    const latasTotPorLote = new Map<string, number>();
    data.movs.forEach((mv: any) => {
      const emp = Number(mv.empaque || 48);
      if (mv.empaque) empaquePorLote.set(mv.lote_id, emp);
      const s = SIGNO[mv.tipo] ?? 0;
      if (s === 0) return;
      const total = Number(mv.cantidad_cajas || 0) * emp + Number(mv.latas || 0);
      latasTotPorLote.set(mv.lote_id, (latasTotPorLote.get(mv.lote_id) ?? 0) + s * total);
    });

    // Stock total y valorizado
    let stockTotal = 0, valorTotal = 0, stockLatas = 0;
    const stockPorAlm = new Map<string, { almacen: string; cajas: number; latas: number; valor: number }>();
    const stockPorProd = new Map<string, { producto: string; cajas: number; latas: number; valor: number }>();
    data.stock.forEach((s: any) => {
      const c = Number(s.cantidad_cajas);
      if (c <= 0) return;
      const l: any = lotesM.get(s.lote_id); if (!l) return;
      const u: any = ubicM.get(s.ubicacion_id); if (!u) return;
      const a: any = almM.get(u.almacen_id);
      const p: any = prodM.get(l.producto_id);
      const emp = empaquePorLote.get(l.id) ?? 48;
      const latasRow = c * emp; // aproximación: latas sueltas se reparten en lotes pequeños, dominante es cajas*empaque
      const valor = c * Number(l.costo_por_caja ?? 0);
      stockTotal += c; valorTotal += valor; stockLatas += latasRow;
      const ka = a?.nombre ?? "—";
      const va = stockPorAlm.get(ka) ?? { almacen: ka, cajas: 0, latas: 0, valor: 0 };
      va.cajas += c; va.latas += latasRow; va.valor += valor; stockPorAlm.set(ka, va);
      const kp = p?.descripcion ?? "—";
      const vp = stockPorProd.get(kp) ?? { producto: kp, cajas: 0, latas: 0, valor: 0 };
      vp.cajas += c; vp.latas += latasRow; vp.valor += valor; stockPorProd.set(kp, vp);
    });
    // Añadir latas sueltas (totalLatas por lote - cajas_en_stock*empaque) sólo si positivo
    const cajasStockPorLote = new Map<string, number>();
    data.stock.forEach((s: any) => cajasStockPorLote.set(s.lote_id, (cajasStockPorLote.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas || 0)));
    latasTotPorLote.forEach((total, loteId) => {
      const cj = cajasStockPorLote.get(loteId) ?? 0;
      const emp = empaquePorLote.get(loteId) ?? 48;
      const sueltas = Math.max(0, total - cj * emp);
      stockLatas += sueltas;
    });

    // Estados de lotes (solo con stock)
    const stockLote = new Map<string, number>();
    data.stock.forEach((s: any) => stockLote.set(s.lote_id, (stockLote.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    const estadoMap = new Map<string, number>();
    data.lotes.forEach((l: any) => {
      const c = stockLote.get(l.id) ?? 0;
      if (c <= 0) return;
      estadoMap.set(l.estado, (estadoMap.get(l.estado) ?? 0) + c);
    });
    const estados = Array.from(estadoMap.entries()).map(([name, value]) => ({ name, value }));

    // Vencimientos buckets
    const buckets = [
      { name: "Vencido", value: 0 },
      { name: "< 3m", value: 0 },
      { name: "3-6m", value: 0 },
      { name: "6-12m", value: 0 },
      { name: "> 12m", value: 0 },
    ];
    data.lotes.forEach((l: any) => {
      const c = stockLote.get(l.id) ?? 0;
      if (c <= 0) return;
      const d = daysUntil(l.fecha_vencimiento);
      const i = d < 0 ? 0 : d < 90 ? 1 : d < 180 ? 2 : d < 365 ? 3 : 4;
      buckets[i].value += c;
    });

    // Top clientes (salidas)
    const cliMap = new Map<string, number>();
    data.movs.forEach((mv: any) => {
      if (mv.tipo !== "SALIDA" || !mv.cliente_proveedor_id) return;
      const c: any = cliM.get(mv.cliente_proveedor_id);
      const k = c?.nombre ?? "—";
      cliMap.set(k, (cliMap.get(k) ?? 0) + Number(mv.cantidad_cajas));
    });
    const topClientes = Array.from(cliMap.entries()).map(([cliente, cajas]) => ({ cliente, cajas })).sort((a, b) => b.cajas - a.cajas).slice(0, 8);

    const topProductos = Array.from(stockPorProd.values()).sort((a, b) => b.valor - a.valor).slice(0, 8);
    const porAlmacen = Array.from(stockPorAlm.values()).sort((a, b) => b.cajas - a.cajas);

    // Mermas por motivo
    const motivoMap = new Map<string, number>();
    data.movs.forEach((mv: any) => {
      if (mv.tipo !== "MERMA" && mv.tipo !== "AJUSTE_NEGATIVO") return;
      const k = mv.motivo?.split("|")[0]?.trim() || "SIN MOTIVO";
      motivoMap.set(k, (motivoMap.get(k) ?? 0) + Number(mv.cantidad_cajas));
    });
    const mermasMotivo = Array.from(motivoMap.entries()).map(([motivo, cajas]) => ({ motivo, cajas })).sort((a, b) => b.cajas - a.cajas);

    return {
      entradas, salidas, mermas, traslados,
      stockTotal, stockLatas, valorTotal,
      empaquePorLote, latasTotPorLote,
      serieDiaria, estados, buckets, topClientes, topProductos, porAlmacen, mermasMotivo,
    };
  }, [data]);

  const exportResumen = () => {
    if (!m) return;
    exportXLSX({
      sheetName: "Resumen",
      headers: ["Indicador", "Valor"],
      rows: [
        ["Entradas (cj)", m.entradas],
        ["Salidas (cj)", m.salidas],
        ["Mermas (cj)", m.mermas],
        ["Traslados (cj)", m.traslados],
        ["Stock total (cj)", m.stockTotal],
        ["Inventario total (latas)", m.stockLatas],
        ["Valor total (S/.)", m.valorTotal.toFixed(2)],
      ],
      filename: `Resumen_${desde}_${hasta}.xlsx`,
      inventario: { cajas: m.stockTotal, latas: 0, totalLatas: m.stockLatas },
    });
  };

  const exportInventarioPDF = async () => {
    if (!m || !data) return;
    // Construir filas: stock por lote+ubicacion
    const lotesM = new Map(data.lotes.map((l: any) => [l.id, l]));
    const prodM = new Map(data.productos.map((p: any) => [p.id, p]));
    const ubicM = new Map(data.ubicaciones.map((u: any) => [u.id, u]));
    const almM = new Map(data.almacenes.map((a: any) => [a.id, a]));
    const rows = data.stock
      .filter((s: any) => Number(s.cantidad_cajas) > 0)
      .map((s: any) => {
        const l: any = lotesM.get(s.lote_id);
        const p: any = l ? prodM.get(l.producto_id) : null;
        const u: any = ubicM.get(s.ubicacion_id);
        const a: any = u ? almM.get(u.almacen_id) : null;
        const emp = m.empaquePorLote.get(s.lote_id) ?? 48;
        const cajas = Number(s.cantidad_cajas);
        const total = cajas * emp;
        return [
          l?.codigo_lote ?? "—",
          p?.descripcion ?? "—",
          p?.envase ?? "—",
          a?.nombre ?? "—",
          u?.codigo ?? "—",
          l?.estado ?? "—",
          cajas,
          emp,
          total,
          l?.fecha_vencimiento ?? "—",
        ];
      })
      .sort((a: any, b: any) => Number(b[8]) - Number(a[8]));

    // Resumen por producto
    const porProd = new Map<string, { cajas: number; latas: number }>();
    rows.forEach((r: any[]) => {
      const k = String(r[1]);
      const cur = porProd.get(k) ?? { cajas: 0, latas: 0 };
      cur.cajas += Number(r[6]); cur.latas += Number(r[8]);
      porProd.set(k, cur);
    });

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "landscape" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.text("INVENTARIO COMPLETO", 14, 14);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Generado ${new Date().toLocaleString("es-PE")}`, 14, 19);
    doc.setTextColor(0);

    // Banner total
    doc.setFillColor(30, 58, 95);
    doc.rect(14, 24, pageW - 28, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9); doc.text("INVENTARIO TOTAL", 18, 30);
    doc.setFontSize(16); doc.setFont(undefined as any, "bold");
    doc.text(`${m.stockLatas.toLocaleString("es-PE")} LATAS`, 18, 37);
    doc.setFont(undefined as any, "normal"); doc.setFontSize(9);
    doc.text(`${m.stockTotal.toLocaleString("es-PE")} cajas · ${rows.length} líneas · ${porProd.size} productos`, pageW - 18, 37, { align: "right" });
    doc.setTextColor(0);

    // Resumen por producto
    autoTable(doc, {
      head: [["RESUMEN POR PRODUCTO", "Cajas", "Inventario (latas)"]],
      body: Array.from(porProd.entries())
        .sort((a, b) => b[1].latas - a[1].latas)
        .map(([prod, v]) => [prod, v.cajas.toLocaleString("es-PE"), v.latas.toLocaleString("es-PE")]),
      startY: 46,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95] },
    });

    // Detalle completo
    autoTable(doc, {
      head: [["Lote", "Producto", "Envase", "Almacén", "Ubic.", "Estado", "Cajas", "Empaque", "Inventario (latas)", "FV"]],
      body: rows.map((r: any[]) => r.map((c) => String(c))),
      startY: (doc as any).lastAutoTable.finalY + 6,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 95] },
    });

    doc.save(`inventario-completo-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground">Análisis dinámico con gráficos en tiempo real</p>
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
          <Button variant="outline" size="sm" onClick={() => setRange(defaultRange())}>Últimos 30d</Button>
          <Button variant="outline" size="sm" onClick={exportResumen}><FileDown className="size-4 mr-1" /> Excel</Button>
          <Button size="sm" onClick={exportInventarioPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <FileDown className="size-4 mr-1" /> PDF Inventario Completo
          </Button>
        </div>
      </header>

      {/* Banner inventario total en latas */}
      {m && (
        <Card className="p-4 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white border-0 shadow-lg">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Package className="size-8" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] opacity-80">Inventario total</div>
                <div className="text-3xl md:text-4xl font-extrabold leading-tight">
                  {formatNumber(m.stockLatas, 0)} <span className="text-base font-medium opacity-90">latas</span>
                </div>
                <div className="text-xs opacity-90">{formatNumber(m.stockTotal, 0)} cajas en stock · valorizado S/. {formatNumber(m.valorTotal)}</div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={exportInventarioPDF}><FileDown className="size-4 mr-1" />Descargar PDF</Button>
          </div>
        </Card>
      )}

      {/* Tarjetas rápidas - alertas */}
      {m && (
        <QuickAlerts
          lotes={data?.lotes ?? []}
          stock={data?.stock ?? []}
          movs={data?.movs ?? []}
        />
      )}

      {/* Accesos rápidos */}
      {/* CTA destacado JPG por Lote */}
      <Link to="/reportes/jpg-lote" className="block group">
        <Card className="relative overflow-hidden p-5 border-0 bg-gradient-to-r from-fuchsia-600 via-pink-500 to-orange-500 text-white shadow-lg hover:shadow-2xl transition-all hover:scale-[1.01]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
          <div className="absolute -right-8 -top-8 size-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="size-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-2 ring-white/40 group-hover:rotate-6 transition-transform">
              <ImageIcon className="size-7" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold bg-white/25 px-2 py-0.5 rounded">Destacado</span>
                <span className="text-[10px] uppercase tracking-wider opacity-80">Nuevo</span>
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold mt-1 leading-tight">JPG por Lote / Día</h2>
              <p className="text-sm text-white/90">Tarjetas descargables · Entradas, salidas, cambios y traslados con filtros dinámicos</p>
            </div>
            <Button variant="secondary" className="bg-white text-pink-600 hover:bg-white/90 font-semibold shadow">Abrir →</Button>
          </div>
        </Card>
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <QuickLink to="/reportes/gerencia" icon={Briefcase} label="Reporte Gerencial" desc="Stock cajas/latas · multi-filtro" />
        <QuickLink to="/reportes/analitica" icon={TrendingUp} label="Analítica avanzada" desc="Costos, rotación, proyección" />
        <QuickLink to="/reportes/vencimientos" icon={CalendarClock} label="Vencimientos" desc="Detalle por rango de FV" />
        <QuickLink to="/reportes/valorizado" icon={DollarSign} label="Inventario valorizado" desc="Stock × costo" />
        <QuickLink to="/reportes/despachos" icon={Truck} label="Despachos por cliente" desc="Historial detallado" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
        <Kpi label="Entradas (cj)" value={formatNumber(m?.entradas ?? 0, 0)} tone="success" />
        <Kpi label="Salidas (cj)" value={formatNumber(m?.salidas ?? 0, 0)} tone="primary" />
        <Kpi label="Mermas (cj)" value={formatNumber(m?.mermas ?? 0, 0)} tone="danger" />
        <Kpi label="Traslados (cj)" value={formatNumber(m?.traslados ?? 0, 0)} tone="muted" />
        <Kpi label="Stock (cajas)" value={formatNumber(m?.stockTotal ?? 0, 0)} tone="primary" />
        <Kpi label="Inventario (latas)" value={formatNumber(m?.stockLatas ?? 0, 0)} tone="primary" />
        <Kpi label="Valor (S/.)" value={formatNumber(m?.valorTotal ?? 0)} tone="success" />
      </div>

      {/* Grid de gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Flujo diario · Entradas vs Salidas" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={m?.serieDiaria ?? []}>
              <defs>
                <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="ENTRADA" stroke="hsl(var(--success))" fill="url(#gE)" />
              <Area type="monotone" dataKey="SALIDA" stroke="hsl(var(--primary))" fill="url(#gS)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Stock por almacén" icon={Boxes}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m?.porAlmacen ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="almacen" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatNumber(v)} />
              <Bar dataKey="cajas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vencimientos por rango" icon={AlertTriangle}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m?.buckets ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatNumber(v)} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {(m?.buckets ?? []).map((_, i) => (
                  <Cell key={i} fill={[COLORS[3], COLORS[3], COLORS[2], COLORS[4], COLORS[1]][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Estados de lotes (cajas)" icon={Boxes}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={m?.estados ?? []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.name}: ${formatNumber(e.value, 0)}`}>
                {(m?.estados ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatNumber(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top productos por valor (S/.)" icon={DollarSign}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m?.topProductos ?? []} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="producto" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatNumber(v)} />
              <Bar dataKey="valor" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top clientes (cajas despachadas)" icon={Truck}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m?.topClientes ?? []} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="cliente" width={140} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatNumber(v)} />
              <Bar dataKey="cajas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {(m?.mermasMotivo ?? []).length > 0 && (
          <ChartCard title="Mermas por motivo" icon={AlertTriangle}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m?.mermasMotivo ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="motivo" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="cajas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Tendencia acumulada (salidas)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={(m?.serieDiaria ?? []).reduce((acc: any[], r) => {
              const prev = acc[acc.length - 1]?.acum ?? 0;
              acc.push({ fecha: r.fecha, acum: prev + r.SALIDA });
              return acc;
            }, [])}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="acum" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground">Cargando…</div>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "primary" | "success" | "danger" | "muted" }) {
  const cls = { primary: "border-l-primary", success: "border-l-success", danger: "border-l-destructive", muted: "border-l-muted-foreground" }[tone];
  return (
    <Card className={`p-3 border-l-4 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1 truncate">{value}</div>
    </Card>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function QuickLink({ to, icon: Icon, label, desc }: { to: string; icon: any; label: string; desc: string }) {
  return (
    <Link to={to} className="group">
      <Card className="p-4 hover:border-primary hover:shadow-md transition-all">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-md bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Icon className="size-5" />
          </div>
          <div>
            <div className="font-semibold text-sm">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function QuickAlerts({ lotes, stock, movs }: { lotes: any[]; stock: any[]; movs: any[] }) {
  const stockLote = new Map<string, number>();
  stock.forEach((s) => stockLote.set(s.lote_id, (stockLote.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));

  let vencidos = 0, en7 = 0, en30 = 0, en90 = 0;
  lotes.forEach((l) => {
    const c = stockLote.get(l.id) ?? 0;
    if (c <= 0) return;
    const d = daysUntil(l.fecha_vencimiento);
    if (d < 0) vencidos += c;
    else if (d <= 7) en7 += c;
    else if (d <= 30) en30 += c;
    else if (d <= 90) en90 += c;
  });

  // Costo del mes en curso
  const ahora = new Date();
  const mesIni = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString().slice(0, 10);
  const lotesM = new Map(lotes.map((l) => [l.id, l]));
  let costoMes = 0, salidasMes = 0;
  movs.forEach((mv) => {
    if (mv.fecha < mesIni) return;
    if (mv.tipo !== "SALIDA") return;
    const l: any = lotesM.get(mv.lote_id);
    costoMes += Number(l?.costo_por_caja ?? 0) * Number(mv.cantidad_cajas);
    salidasMes += Number(mv.cantidad_cajas);
  });

  const items: { label: string; value: string; tone: string; icon: any; to: string }[] = [
    { label: "Vencidos HOY", value: formatNumber(vencidos, 0) + " cj", tone: "border-l-destructive bg-destructive/5", icon: AlertTriangle, to: "/reportes/vencimientos" },
    { label: "Vencen ≤ 7 días", value: formatNumber(en7, 0) + " cj", tone: "border-l-destructive", icon: CalendarClock, to: "/reportes/vencimientos" },
    { label: "Vencen ≤ 30 días", value: formatNumber(en30, 0) + " cj", tone: "border-l-warning", icon: CalendarClock, to: "/reportes/vencimientos" },
    { label: "Vencen ≤ 90 días", value: formatNumber(en90, 0) + " cj", tone: "border-l-warning", icon: CalendarClock, to: "/reportes/vencimientos" },
    { label: "Salidas del mes", value: formatNumber(salidasMes, 0) + " cj", tone: "border-l-primary", icon: Truck, to: "/reportes/despachos" },
    { label: "Costo mes (S/.)", value: formatNumber(costoMes), tone: "border-l-success", icon: DollarSign, to: "/reportes/analitica" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {items.map((it) => (
        <Link key={it.label} to={it.to}>
          <Card className={`p-3 border-l-4 ${it.tone} hover:shadow-md transition-shadow cursor-pointer h-full`}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <it.icon className="size-3" /> {it.label}
            </div>
            <div className="text-lg font-bold mt-1 truncate">{it.value}</div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

