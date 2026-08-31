import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatDate } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { ChevronRight, TrendingUp, TrendingDown, Scale, FileDown, FileSpreadsheet, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ajustes")({
  component: AjustesPage,
  head: () => ({
    meta: [
      { title: "Ajustes de Inventario | Almacén Conservas" },
      { name: "description", content: "Análisis agrupado de ajustes positivos y negativos de inventario por tipo, lote y ubicación con informes en PDF y Excel." },
      { property: "og:title", content: "Ajustes de Inventario | Almacén Conservas" },
      { property: "og:description", content: "Dashboard e informes de ajustes positivos y negativos por lote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Tipo = "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO";
const TIPOS: { value: Tipo; label: string }[] = [
  { value: "AJUSTE_POSITIVO", label: "Ajuste positivo" },
  { value: "AJUSTE_NEGATIVO", label: "Ajuste negativo" },
];

type Row = {
  id: string;
  tipo: Tipo;
  fecha: string;
  lote: string;
  loteId: string;
  producto: string;
  empaque: number;
  tamano: string;
  cajas: number;
  latas: number;
  totalLatas: number;
  almacen: string;
  ubicacion: string;
  motivo: string;
  usuario: string;
  vale: string;
  guia: string;
};

function AjustesPage() {
  const [tipoSel, setTipoSel] = useState<"TODOS" | Tipo>("TODOS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [q, setQ] = useState("");
  const [almacenSel, setAlmacenSel] = useState("TODOS");

  const { data, isLoading } = useQuery({
    queryKey: ["ajustes-data"],
    queryFn: async () => {
      const [movs, lotes, productos, ubic, alm] = await Promise.all([
        fetchAllRows((f, t) =>
          supabase
            .from("movimientos")
            .select("*")
            .in("tipo", ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"])
            .order("fecha", { ascending: false })
            .range(f, t),
        ),
        fetchAllRows((f, t) => supabase.from("lotes").select("*").range(f, t)),
        fetchAllRows((f, t) => supabase.from("productos").select("*").range(f, t)),
        fetchAllRows((f, t) => supabase.from("ubicaciones").select("*").range(f, t)),
        fetchAllRows((f, t) => supabase.from("almacenes").select("*").range(f, t)),
      ]);
      return { movs, lotes, productos, ubic, alm };
    },
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const loteById = new Map(data.lotes.map((l: any) => [l.id, l]));
    const prodById = new Map(data.productos.map((p: any) => [p.id, p]));
    const ubicById = new Map(data.ubic.map((u: any) => [u.id, u]));
    const almById = new Map(data.alm.map((a: any) => [a.id, a]));
    return data.movs.map((m: any) => {
      const lote: any = loteById.get(m.lote_id);
      const prod: any = lote ? prodById.get(lote.producto_id) : null;
      const u: any = ubicById.get(m.ubicacion_destino_id ?? m.ubicacion_origen_id);
      const a: any = u ? almById.get(u.almacen_id) : null;
      const empaque = Math.max(1, Number(m.empaque ?? prod?.empaque ?? 48));
      const cajas = Number(m.cantidad_cajas ?? 0);
      const latas = Number(m.latas ?? 0);
      return {
        id: m.id,
        tipo: m.tipo as Tipo,
        fecha: m.fecha,
        lote: lote?.codigo_lote ?? "—",
        loteId: m.lote_id,
        producto: prod?.descripcion ?? "—",
        empaque,
        tamano: m.tamano ?? "—",
        cajas,
        latas,
        totalLatas: Number(m.total_latas ?? cajas * empaque + latas),
        almacen: a?.nombre ?? "—",
        ubicacion: u?.codigo ?? "—",
        motivo: m.motivo ?? "—",
        usuario: m.usuario_nombre ?? "—",
        vale: m.nro_vale ?? "",
        guia: m.nro_guia ?? "",
      };
    });
  }, [data]);

  const almacenes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.almacen))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tipoSel !== "TODOS" && r.tipo !== tipoSel) return false;
      if (desde && r.fecha < desde) return false;
      if (hasta && r.fecha > hasta) return false;
      if (almacenSel !== "TODOS" && r.almacen !== almacenSel) return false;
      if (term) {
        const hay = `${r.lote} ${r.producto} ${r.motivo} ${r.ubicacion} ${r.usuario} ${r.vale} ${r.guia}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, tipoSel, desde, hasta, almacenSel, q]);

  const kpi = useMemo(() => {
    const pos = filtered.filter((r) => r.tipo === "AJUSTE_POSITIVO");
    const neg = filtered.filter((r) => r.tipo === "AJUSTE_NEGATIVO");
    const sum = (a: Row[]) => a.reduce((s, r) => s + r.totalLatas, 0);
    const cj = (a: Row[]) => a.reduce((s, r) => s + r.cajas, 0);
    return {
      posLatas: sum(pos),
      negLatas: sum(neg),
      posCajas: cj(pos),
      negCajas: cj(neg),
      posCount: pos.length,
      negCount: neg.length,
      neto: sum(pos) - sum(neg),
      lotes: new Set(filtered.map((r) => r.loteId)).size,
    };
  }, [filtered]);

  // Agrupado por tipo → registros como sub-items
  const grupos = useMemo(() => {
    return TIPOS.map((t) => {
      const items = filtered.filter((r) => r.tipo === t.value);
      return {
        tipo: t.value,
        label: t.label,
        items,
        latas: items.reduce((s, r) => s + r.totalLatas, 0),
        cajas: items.reduce((s, r) => s + r.cajas, 0),
      };
    }).filter((g) => g.items.length > 0);
  }, [filtered]);

  // Análisis por lote
  const porLote = useMemo(() => {
    const m = new Map<string, { lote: string; producto: string; pos: number; neg: number; movs: number }>();
    filtered.forEach((r) => {
      const cur = m.get(r.loteId) ?? { lote: r.lote, producto: r.producto, pos: 0, neg: 0, movs: 0 };
      if (r.tipo === "AJUSTE_POSITIVO") cur.pos += r.totalLatas;
      else cur.neg += r.totalLatas;
      cur.movs += 1;
      m.set(r.loteId, cur);
    });
    return Array.from(m.values())
      .map((v) => ({ ...v, neto: v.pos - v.neg }))
      .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  }, [filtered]);

  const filtrosTexto = useMemo(() => {
    const p: string[] = [];
    p.push(`Tipo: ${tipoSel === "TODOS" ? "Ajuste positivo + Ajuste negativo" : TIPOS.find((t) => t.value === tipoSel)?.label}`);
    if (desde || hasta) p.push(`Periodo: ${desde ? formatDate(desde) : "inicio"} → ${hasta ? formatDate(hasta) : "hoy"}`);
    if (almacenSel !== "TODOS") p.push(`Almacén: ${almacenSel}`);
    if (q.trim()) p.push(`Búsqueda: "${q.trim()}"`);
    p.push(`Registros: ${filtered.length}`);
    return p.join("  ·  ");
  }, [tipoSel, desde, hasta, almacenSel, q, filtered.length]);

  const detalleHeaders = ["Fecha", "Tipo", "Lote", "Producto", "Empaque", "Tamaño", "Almacén", "Ubicación", "Cajas", "Latas", "Total latas", "Motivo", "Vale", "Guía", "Usuario"];
  const detalleRows = filtered.map((r) => [
    formatDate(r.fecha),
    r.tipo === "AJUSTE_POSITIVO" ? "Ajuste positivo" : "Ajuste negativo",
    r.lote, r.producto, r.empaque, r.tamano, r.almacen, r.ubicacion,
    r.cajas, r.latas, r.totalLatas, r.motivo, r.vale, r.guia, r.usuario,
  ]);

  const resumen = [
    { label: "Ajuste positivo (latas)", value: formatNumber(kpi.posLatas, 0) },
    { label: "Ajuste negativo (latas)", value: formatNumber(kpi.negLatas, 0) },
    { label: "Neto (latas)", value: formatNumber(kpi.neto, 0) },
    { label: "Movimientos", value: filtered.length },
    { label: "Lotes afectados", value: kpi.lotes },
  ];

  const onExcel = () =>
    exportXLSX({
      sheetName: "Ajustes",
      headers: detalleHeaders,
      rows: detalleRows as any,
      filename: `ajustes-${new Date().toISOString().slice(0, 10)}.xlsx`,
      summary: resumen,
    });

  const onPDF = () =>
    exportPDF({
      title: "Informe de Ajustes de Inventario",
      subtitle: filtrosTexto,
      headers: ["Tipo", "Movimientos", "Cajas", "Total latas"],
      rows: grupos.map((g) => [g.label, g.items.length, formatNumber(g.cajas, 0), formatNumber(g.latas, 0)]),
      filename: `ajustes-${new Date().toISOString().slice(0, 10)}.pdf`,
      summary: resumen,
      sections: [
        {
          title: "Análisis por lote (Ajuste positivo / negativo)",
          headers: ["Lote", "Producto", "Positivo (latas)", "Negativo (latas)", "Neto (latas)", "Movs."],
          rows: porLote.map((l) => [l.lote, l.producto, formatNumber(l.pos, 0), formatNumber(l.neg, 0), formatNumber(l.neto, 0), l.movs]),
        },
      ],
    });

  const onPDFFiltros = () =>
    exportPDF({
      title: "Ajustes — Pantalla con filtros aplicados",
      subtitle: filtrosTexto,
      headers: detalleHeaders,
      rows: detalleRows as any,
      filename: `ajustes-filtros-${new Date().toISOString().slice(0, 10)}.pdf`,
      summary: resumen,
      sections: [
        {
          title: "Resumen agrupado por tipo",
          headers: ["Tipo", "Movimientos", "Cajas", "Total latas"],
          rows: grupos.map((g) => [g.label, g.items.length, formatNumber(g.cajas, 0), formatNumber(g.latas, 0)]),
        },
        {
          title: "Análisis por lote",
          headers: ["Lote", "Producto", "Positivo (latas)", "Negativo (latas)", "Neto (latas)", "Movs."],
          rows: porLote.map((l) => [l.lote, l.producto, formatNumber(l.pos, 0), formatNumber(l.neg, 0), formatNumber(l.neto, 0), l.movs]),
        },
      ],
    });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ajustes de Inventario</h1>
          <p className="text-muted-foreground">Resumen agrupado por tipo · análisis por lote · informes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onExcel}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel</Button>
          <Button variant="outline" onClick={onPDF}><FileDown className="h-4 w-4 mr-2" />PDF</Button>
          <Button onClick={onPDFFiltros}><Filter className="h-4 w-4 mr-2" />PDF Pantalla (filtros)</Button>
        </div>
      </header>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipoSel} onValueChange={(v) => setTipoSel(v as any)}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los ajustes</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" className="h-10" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" className="h-10" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Almacén</Label>
            <Select value={almacenSel} onValueChange={setAlmacenSel}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                {almacenes.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar</Label>
            <Input className="h-10" placeholder="Lote, producto, motivo, vale…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Dashboard */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Ajuste positivo"
          icon={<TrendingUp className="h-4 w-4" />}
          value={`${formatNumber(kpi.posLatas, 0)} latas`}
          sub={`${formatNumber(kpi.posCajas, 0)} cajas · ${kpi.posCount} movs.`}
          tone="pos"
        />
        <KpiCard
          title="Ajuste negativo"
          icon={<TrendingDown className="h-4 w-4" />}
          value={`${formatNumber(kpi.negLatas, 0)} latas`}
          sub={`${formatNumber(kpi.negCajas, 0)} cajas · ${kpi.negCount} movs.`}
          tone="neg"
        />
        <KpiCard
          title="Neto"
          icon={<Scale className="h-4 w-4" />}
          value={`${kpi.neto >= 0 ? "+" : ""}${formatNumber(kpi.neto, 0)} latas`}
          sub="Positivo − Negativo"
          tone={kpi.neto >= 0 ? "pos" : "neg"}
        />
        <KpiCard
          title="Lotes afectados"
          icon={<Scale className="h-4 w-4" />}
          value={formatNumber(kpi.lotes, 0)}
          sub={`${filtered.length} registros filtrados`}
        />
      </div>

      <Tabs defaultValue="agrupado">
        <TabsList>
          <TabsTrigger value="agrupado">Agrupado por tipo</TabsTrigger>
          <TabsTrigger value="lotes">Análisis por lote</TabsTrigger>
          <TabsTrigger value="detalle">Detalle</TabsTrigger>
        </TabsList>

        <TabsContent value="agrupado" className="mt-4 space-y-3">
          {isLoading && <Card className="p-6 text-sm text-muted-foreground">Cargando…</Card>}
          {!isLoading && grupos.length === 0 && (
            <Card className="p-6 text-sm text-muted-foreground">No hay ajustes con los filtros aplicados.</Card>
          )}
          {grupos.map((g) => <GrupoCard key={g.tipo} grupo={g} />)}
        </TabsContent>

        <TabsContent value="lotes" className="mt-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Lote</th>
                  <th className="text-left p-3">Producto</th>
                  <th className="text-right p-3">Positivo</th>
                  <th className="text-right p-3">Negativo</th>
                  <th className="text-right p-3">Neto</th>
                  <th className="text-right p-3">Movs.</th>
                </tr>
              </thead>
              <tbody>
                {porLote.map((l) => (
                  <tr key={l.lote + l.producto} className="border-t">
                    <td className="p-3 font-medium">{l.lote}</td>
                    <td className="p-3 text-muted-foreground">{l.producto}</td>
                    <td className="p-3 text-right">{formatNumber(l.pos, 0)}</td>
                    <td className="p-3 text-right">{formatNumber(l.neg, 0)}</td>
                    <td className={cn("p-3 text-right font-semibold", l.neto >= 0 ? "text-emerald-600" : "text-destructive")}>
                      {l.neto >= 0 ? "+" : ""}{formatNumber(l.neto, 0)}
                    </td>
                    <td className="p-3 text-right">{l.movs}</td>
                  </tr>
                ))}
                {porLote.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="detalle" className="mt-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 uppercase text-muted-foreground">
                <tr>{detalleHeaders.map((h) => <th key={h} className="text-left p-2 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {detalleRows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => <td key={j} className="p-2 whitespace-nowrap">{c === null || c === undefined || c === "" ? "—" : String(c)}</td>)}
                  </tr>
                ))}
                {detalleRows.length === 0 && (
                  <tr><td colSpan={detalleHeaders.length} className="p-6 text-center text-muted-foreground">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ title, value, sub, icon, tone }: { title: string; value: string; sub?: string; icon?: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span className={cn(tone === "pos" && "text-emerald-600", tone === "neg" && "text-destructive")}>{icon}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-bold tabular-nums", tone === "pos" && "text-emerald-600", tone === "neg" && "text-destructive")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function GrupoCard({ grupo }: { grupo: { tipo: Tipo; label: string; items: Row[]; latas: number; cajas: number } }) {
  const [open, setOpen] = useState(true);
  const pos = grupo.tipo === "AJUSTE_POSITIVO";
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
      >
        <ChevronRight className={cn("h-4 w-4 transition-transform text-muted-foreground", open && "rotate-90")} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{grupo.label}</span>
            <Badge variant={pos ? "default" : "destructive"}>{grupo.items.length} registros</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatNumber(grupo.cajas, 0)} cajas · {formatNumber(grupo.latas, 0)} latas totales
          </div>
        </div>
        <div className={cn("text-xl font-bold tabular-nums", pos ? "text-emerald-600" : "text-destructive")}>
          {pos ? "+" : "−"}{formatNumber(grupo.latas, 0)}
        </div>
      </button>
      {open && (
        <div className="border-t overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Fecha</th>
                <th className="text-left p-2">Lote</th>
                <th className="text-left p-2">Producto</th>
                <th className="text-left p-2">Almacén / Ubicación</th>
                <th className="text-right p-2">Cajas</th>
                <th className="text-right p-2">Latas</th>
                <th className="text-right p-2">Total latas</th>
                <th className="text-left p-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {grupo.items.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="p-2 whitespace-nowrap">{formatDate(r.fecha)}</td>
                  <td className="p-2 font-medium whitespace-nowrap">{r.lote}</td>
                  <td className="p-2 text-muted-foreground">{r.producto}</td>
                  <td className="p-2 whitespace-nowrap">{r.almacen} / {r.ubicacion}</td>
                  <td className="p-2 text-right">{formatNumber(r.cajas, 0)}</td>
                  <td className="p-2 text-right">{formatNumber(r.latas, 0)}</td>
                  <td className="p-2 text-right font-semibold">{formatNumber(r.totalLatas, 0)}</td>
                  <td className="p-2">{r.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
