import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { History, Package, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, AlertTriangle, Plus, Minus, Replace, FileText, ShoppingCart, Receipt, FileOutput, Boxes, Sparkles, Clock, User } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/historial")({
  component: HistorialPage,
});

type Evento = {
  ts: string;
  fecha: string;
  categoria: "INVENTARIO" | "VENTAS" | "INSUMOS" | "LOTES";
  tipo: string;
  entidad: string;
  detalle: string;
  usuario: string;
  monto?: string;
  color: string;
  Icon: any;
};

const TIPO_MOV_META: Record<string, { color: string; Icon: any }> = {
  ENTRADA: { color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", Icon: ArrowDownToLine },
  SALIDA: { color: "text-orange-500 bg-orange-500/10 border-orange-500/30", Icon: ArrowUpFromLine },
  TRASLADO: { color: "text-sky-500 bg-sky-500/10 border-sky-500/30", Icon: ArrowLeftRight },
  MERMA: { color: "text-destructive bg-destructive/10 border-destructive/30", Icon: AlertTriangle },
  AJUSTE_POSITIVO: { color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", Icon: Plus },
  AJUSTE_NEGATIVO: { color: "text-amber-500 bg-amber-500/10 border-amber-500/30", Icon: Minus },
  CAMBIO: { color: "text-violet-500 bg-violet-500/10 border-violet-500/30", Icon: Replace },
};

function fmtTs(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

function HistorialPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-700/30 text-indigo-400 flex items-center justify-center">
          <History className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Historial</h1>
          <p className="text-muted-foreground">Registro completo de cambios · usuario, fecha y datos · últimos primero</p>
        </div>
      </header>

      <Tabs defaultValue="cambios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cambios"><Sparkles className="size-4 mr-1" />Cambios del sistema</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="size-4 mr-1" />Timeline por lote</TabsTrigger>
        </TabsList>
        <TabsContent value="cambios"><TabCambios /></TabsContent>
        <TabsContent value="timeline"><TabTimeline /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// TAB 1 · CAMBIOS DEL SISTEMA
// ============================================================
function TabCambios() {
  const [busca, setBusca] = useState("");
  const [catF, setCatF] = useState("__ALL__");
  const [dias, setDias] = useState("30");

  const { data, isLoading } = useQuery({
    queryKey: ["historial-cambios", dias],
    queryFn: async () => {
      const limit = 300;
      const since = new Date();
      since.setDate(since.getDate() - Number(dias));
      const sinceIso = since.toISOString();

      const [mov, lot, cot, ord, fac, gu, ins, prod, cli, insCat] = await Promise.all([
        supabase.from("movimientos").select("id,tipo,fecha,created_at,cantidad_cajas,motivo,observaciones,usuario_nombre,lote_id,cliente_proveedor_id,nro_guia").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit),
        supabase.from("lotes").select("id,codigo_lote,estado,mercado,producto_id,created_at,usuario_marca").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit),
        supabase.from("ventas_cotizaciones").select("id,codigo,estado,total,moneda,cliente_id,usuario_nombre,created_at,updated_at").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(limit),
        supabase.from("ventas_ordenes").select("id,codigo,estado,total,moneda,cliente_id,usuario_nombre,created_at,updated_at").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(limit),
        supabase.from("ventas_facturas").select("id,codigo,tipo_comprobante,estado,total,moneda,cliente_id,usuario_nombre,created_at,updated_at").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(limit),
        supabase.from("ventas_guias").select("id,codigo,estado,cliente_id,usuario_nombre,created_at,updated_at").gte("updated_at", sinceIso).order("updated_at", { ascending: false }).limit(limit),
        supabase.from("insumos_movimientos").select("id,tipo_mov,clase,cantidad,fecha,created_at,nro_guia,insumo_id,observacion").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit),
        supabase.from("productos").select("id,descripcion"),
        supabase.from("clientes_proveedores").select("id,nombre"),
        supabase.from("insumos").select("id,nombre"),
      ]);

      const prodMap = new Map((prod.data ?? []).map((p: any) => [p.id, p.nombre ?? p.descripcion]));
      const cliMap = new Map((cli.data ?? []).map((c: any) => [c.id, c.nombre]));
      const insMap = new Map((insCat.data ?? []).map((i: any) => [i.id, i.nombre]));

      const eventos: Evento[] = [];

      (mov.data ?? []).forEach((m: any) => {
        const meta = TIPO_MOV_META[m.tipo] ?? { color: "text-muted-foreground bg-muted border-border", Icon: Package };
        eventos.push({
          ts: m.created_at, fecha: m.fecha,
          categoria: "INVENTARIO", tipo: m.tipo, entidad: "Movimiento",
          detalle: `${formatNumber(Number(m.cantidad_cajas ?? 0), 0)} cajas · ${m.motivo ?? m.observaciones ?? "—"}${m.nro_guia ? ` · Guía ${m.nro_guia}` : ""}`,
          usuario: m.usuario_nombre ?? "—",
          color: meta.color, Icon: meta.Icon,
        });
      });

      (lot.data ?? []).forEach((l: any) => {
        eventos.push({
          ts: l.created_at, fecha: l.created_at?.slice(0, 10) ?? "",
          categoria: "LOTES", tipo: "LOTE_CREADO", entidad: "Lote",
          detalle: `${l.codigo_lote} · ${prodMap.get(l.producto_id) ?? ""} · ${l.estado}${l.mercado ? ` · ${l.mercado}` : ""}`,
          usuario: l.usuario_marca ?? "—",
          color: "text-blue-500 bg-blue-500/10 border-blue-500/30", Icon: Package,
        });
      });

      const pushVenta = (rows: any[], entidad: string, tipoBase: string, Icon: any, color: string) => {
        rows.forEach((r: any) => {
          const cambio = r.created_at === r.updated_at ? "CREADO" : "ACTUALIZADO";
          eventos.push({
            ts: r.updated_at, fecha: (r.updated_at ?? "").slice(0, 10),
            categoria: "VENTAS", tipo: `${tipoBase}_${cambio}`, entidad,
            detalle: `${r.codigo}${r.tipo_comprobante ? ` (${r.tipo_comprobante})` : ""} · ${cliMap.get(r.cliente_id) ?? "—"} · ${r.estado}`,
            usuario: r.usuario_nombre ?? "—",
            monto: r.total != null ? `${r.moneda ?? ""} ${formatNumber(Number(r.total))}` : undefined,
            color, Icon,
          });
        });
      };
      pushVenta(cot.data ?? [], "Cotización", "COT", FileText, "text-cyan-500 bg-cyan-500/10 border-cyan-500/30");
      pushVenta(ord.data ?? [], "Orden de venta", "OV", ShoppingCart, "text-indigo-500 bg-indigo-500/10 border-indigo-500/30");
      pushVenta(fac.data ?? [], "Factura", "FAC", Receipt, "text-violet-500 bg-violet-500/10 border-violet-500/30");
      pushVenta(gu.data ?? [], "Guía de salida", "GR", FileOutput, "text-pink-500 bg-pink-500/10 border-pink-500/30");

      (ins.data ?? []).forEach((im: any) => {
        const meta = im.clase === "INGRESO"
          ? { color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", Icon: ArrowDownToLine }
          : { color: "text-orange-500 bg-orange-500/10 border-orange-500/30", Icon: ArrowUpFromLine };
        eventos.push({
          ts: im.created_at, fecha: im.fecha,
          categoria: "INSUMOS", tipo: im.tipo_mov, entidad: "Insumo",
          detalle: `${insMap.get(im.insumo_id) ?? "—"} · ${formatNumber(Number(im.cantidad), 0)} und · ${im.observacion ?? im.nro_guia ?? "—"}`,
          usuario: "—",
          color: meta.color, Icon: meta.Icon,
        });
      });

      eventos.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
      return eventos;
    },
  });

  const filtered = useMemo(() => (data ?? []).filter((e) => {
    if (catF !== "__ALL__" && e.categoria !== catF) return false;
    if (busca) {
      const s = busca.toLowerCase();
      return (e.detalle?.toLowerCase().includes(s) || e.usuario?.toLowerCase().includes(s) || e.tipo?.toLowerCase().includes(s) || e.entidad?.toLowerCase().includes(s));
    }
    return true;
  }), [data, catF, busca]);

  // Agrupar por fecha para el timeline visual
  const grupos = useMemo(() => {
    const m = new Map<string, Evento[]>();
    filtered.forEach((e) => {
      const k = (e.ts ?? "").slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    });
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input placeholder="Buscar por detalle, usuario, tipo…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
          <Select value={catF} onValueChange={setCatF}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">Todas las categorías</SelectItem>
              <SelectItem value="INVENTARIO">Inventario</SelectItem>
              <SelectItem value="LOTES">Lotes</SelectItem>
              <SelectItem value="VENTAS">Ventas</SelectItem>
              <SelectItem value="INSUMOS">Insumos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["7", "15", "30", "60", "90", "180"].map(d => <SelectItem key={d} value={d}>Últimos {d} días</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-muted-foreground">{filtered.length} eventos</div>
        </div>
      </Card>

      {isLoading && <div className="text-center py-10 text-muted-foreground">Cargando historial…</div>}

      <div className="space-y-6">
        {grupos.map(([fecha, eventos]) => (
          <div key={fecha} className="space-y-2">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <Badge variant="outline" className="font-mono text-xs">{fecha ? formatDate(fecha) : "—"}</Badge>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
            <div className="space-y-2">
              {eventos.map((e, i) => (
                <Card key={i} className="p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`size-9 rounded-lg border flex items-center justify-center shrink-0 ${e.color}`}>
                      <e.Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{e.entidad}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{e.tipo}</Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{e.categoria}</Badge>
                        {e.monto && <span className="text-sm font-mono tabular-nums text-primary">{e.monto}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5 truncate" title={e.detalle}>{e.detalle}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="size-3" />{e.usuario}</span>
                        <span className="flex items-center gap-1"><Clock className="size-3" />{fmtTs(e.ts)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">Sin cambios registrados en el período</Card>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB 2 · TIMELINE POR LOTE
// ============================================================
function TabTimeline() {
  const [loteId, setLoteId] = useState<string>("");

  const { data: lotes } = useQuery({
    queryKey: ["hist-lotes"],
    queryFn: async () => {
      const [l, p] = await Promise.all([
        supabase.from("lotes").select("id,codigo_lote,producto_id,estado,mercado,etiqueta,fecha_produccion,fecha_vencimiento,created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("productos").select("id,descripcion,codigo_base"),
      ]);
      const pm = new Map((p.data ?? []).map((x: any) => [x.id, x]));
      return (l.data ?? []).map((lo: any) => ({ ...lo, producto: pm.get(lo.producto_id) }));
    },
  });

  const opts = useMemo<SearchSelectOption[]>(() => (lotes ?? []).map((l: any) => ({
    value: l.id,
    label: l.codigo_lote,
    description: `${l.producto?.descripcion ?? ""} · ${l.estado}${l.mercado ? ` · ${l.mercado}` : ""}`,
    searchText: [l.codigo_lote, l.producto?.descripcion, l.producto?.codigo_base, l.estado, l.mercado].filter(Boolean).join(" "),
  })), [lotes]);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["hist-lote-detail", loteId],
    enabled: !!loteId,
    queryFn: async () => {
      const [movs, stock, ubic, cli] = await Promise.all([
        supabase.from("movimientos").select("*").eq("lote_id", loteId).order("fecha", { ascending: true }).order("created_at", { ascending: true }),
        supabase.from("stock_lote_ubicacion").select("*").eq("lote_id", loteId),
        supabase.from("ubicaciones").select("id,codigo,almacen_id"),
        supabase.from("clientes_proveedores").select("id,nombre"),
      ]);
      return {
        movs: movs.data ?? [],
        stock: stock.data ?? [],
        ubicMap: new Map((ubic.data ?? []).map((u: any) => [u.id, u])),
        cliMap: new Map((cli.data ?? []).map((c: any) => [c.id, c.nombre])),
      };
    },
  });

  const lote = useMemo(() => (lotes ?? []).find((l: any) => l.id === loteId), [lotes, loteId]);

  const totales = useMemo(() => {
    if (!detail) return null;
    const t = { entradas: 0, salidas: 0, mermas: 0, ajustesPos: 0, ajustesNeg: 0, traslados: 0, cambios: 0 };
    detail.movs.forEach((m: any) => {
      const c = Number(m.cantidad_cajas ?? 0);
      if (m.tipo === "ENTRADA") t.entradas += c;
      else if (m.tipo === "SALIDA") t.salidas += c;
      else if (m.tipo === "MERMA") t.mermas += c;
      else if (m.tipo === "AJUSTE_POSITIVO") t.ajustesPos += c;
      else if (m.tipo === "AJUSTE_NEGATIVO") t.ajustesNeg += c;
      else if (m.tipo === "TRASLADO") t.traslados += c;
      else if (m.tipo === "CAMBIO") t.cambios += c;
    });
    return t;
  }, [detail]);

  const porCalidad = useMemo(() => {
    // Agrupa cantidad total movida por estado_lote (calidad) al momento del mov
    if (!detail) return [] as { calidad: string; entradas: number; salidas: number }[];
    const m = new Map<string, { entradas: number; salidas: number }>();
    detail.movs.forEach((mv: any) => {
      const k = mv.estado_lote ?? "—";
      if (!m.has(k)) m.set(k, { entradas: 0, salidas: 0 });
      const c = Number(mv.cantidad_cajas ?? 0);
      const row = m.get(k)!;
      if (["ENTRADA", "AJUSTE_POSITIVO"].includes(mv.tipo)) row.entradas += c;
      else if (["SALIDA", "MERMA", "AJUSTE_NEGATIVO"].includes(mv.tipo)) row.salidas += c;
    });
    return Array.from(m.entries()).map(([calidad, v]) => ({ calidad, ...v }));
  }, [detail]);

  const stockActual = useMemo(() => (detail?.stock ?? []).reduce((s: number, r: any) => s + Number(r.cantidad_cajas ?? 0), 0), [detail]);

  const salidas = useMemo(() => (detail?.movs ?? []).filter((m: any) => m.tipo === "SALIDA").slice().reverse(), [detail]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <SearchSelect
            options={opts}
            value={loteId}
            onValueChange={(v: string) => setLoteId(v ?? "")}
            placeholder="Selecciona un lote para ver su timeline…"
          />
          {lote && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">{lote.estado}</Badge>
              {lote.mercado && <Badge variant="outline">{lote.mercado}</Badge>}
              {lote.etiqueta && <Badge variant="outline">{lote.etiqueta}</Badge>}
            </div>
          )}
        </div>
      </Card>

      {!loteId && (
        <Card className="p-10 text-center text-muted-foreground">
          <Boxes className="size-10 mx-auto mb-3 opacity-40" />
          Elige un lote para ver toda su historia: creación, entradas, traslados, cambios y salidas.
        </Card>
      )}

      {loteId && isLoading && <div className="text-center py-10 text-muted-foreground">Cargando timeline…</div>}

      {loteId && detail && totales && (
        <>
          {/* KPIs */}
          <div className="grid gap-3 md:grid-cols-5">
            <KPI label="Stock actual" value={formatNumber(stockActual, 0)} sub="cajas" color="text-primary" />
            <KPI label="Entradas" value={formatNumber(totales.entradas, 0)} sub="cajas" color="text-emerald-500" />
            <KPI label="Salidas" value={formatNumber(totales.salidas, 0)} sub="cajas" color="text-orange-500" />
            <KPI label="Mermas" value={formatNumber(totales.mermas, 0)} sub="cajas" color="text-destructive" />
            <KPI label="Ajustes" value={`+${formatNumber(totales.ajustesPos, 0)} / -${formatNumber(totales.ajustesNeg, 0)}`} sub="cajas" color="text-amber-500" />
          </div>

          {/* Cantidad por calidad */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="size-4" />Cantidad por calidad (estado del lote al mover)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Calidad</th>
                    <th className="text-right px-3 py-2">Entradas</th>
                    <th className="text-right px-3 py-2">Salidas</th>
                    <th className="text-right px-3 py-2">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {porCalidad.map((r) => (
                    <tr key={r.calidad} className="border-t">
                      <td className="px-3 py-2"><Badge variant="outline">{r.calidad}</Badge></td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-500">{formatNumber(r.entradas, 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-orange-500">{formatNumber(r.salidas, 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatNumber(r.entradas - r.salidas, 0)}</td>
                    </tr>
                  ))}
                  {porCalidad.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Sin movimientos</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Salidas destacadas */}
          {salidas.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><ArrowUpFromLine className="size-4 text-orange-500" />Salidas ({salidas.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-right px-3 py-2">Cajas</th>
                      <th className="text-left px-3 py-2">Ubicación origen</th>
                      <th className="text-left px-3 py-2">Cliente</th>
                      <th className="text-left px-3 py-2">Guía</th>
                      <th className="text-left px-3 py-2">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salidas.map((s: any) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">{formatDate(s.fecha)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatNumber(Number(s.cantidad_cajas), 0)}</td>
                        <td className="px-3 py-2">{(detail.ubicMap.get(s.ubicacion_origen_id) as any)?.codigo ?? "—"}</td>
                        <td className="px-3 py-2">{detail.cliMap.get(s.cliente_proveedor_id) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{s.nro_guia ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.usuario_nombre ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Timeline completo */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><Clock className="size-4" />Timeline completo (últimos primero)</h3>
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
              {/* Creación como último ítem (más antiguo) al final */}
              {[...(detail.movs as any[])].reverse().map((m) => {
                const meta = TIPO_MOV_META[m.tipo] ?? { color: "text-muted-foreground bg-muted border-border", Icon: Package };
                const origen = (detail.ubicMap.get(m.ubicacion_origen_id) as any)?.codigo;
                const destino = (detail.ubicMap.get(m.ubicacion_destino_id) as any)?.codigo;
                const cli = detail.cliMap.get(m.cliente_proveedor_id);
                return (
                  <div key={m.id} className="relative pb-4 pl-6">
                    <div className={`absolute -left-1.5 size-4 rounded-full border-2 ${meta.color} flex items-center justify-center bg-background`}>
                      <meta.Icon className="size-2.5" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={meta.color} variant="outline">{m.tipo}</Badge>
                      <span className="font-semibold tabular-nums">{formatNumber(Number(m.cantidad_cajas ?? 0), 0)} cajas</span>
                      {origen && <span className="text-xs text-muted-foreground">de {origen}</span>}
                      {destino && <span className="text-xs text-muted-foreground">→ {destino}</span>}
                      {m.estado_lote && <Badge variant="secondary" className="text-[10px]">{m.estado_lote}</Badge>}
                      {m.etiqueta && <Badge variant="outline" className="text-[10px]">{m.etiqueta}</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {m.motivo ?? m.observaciones ?? "—"}
                      {cli && ` · ${cli}`}
                      {m.nro_guia && ` · Guía ${m.nro_guia}`}
                      {m.nro_vale && ` · Vale ${m.nro_vale}`}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="size-3" />{m.usuario_nombre ?? "—"}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" />{fmtTs(m.created_at)} · Fecha {formatDate(m.fecha)}</span>
                    </div>
                  </div>
                );
              })}
              {lote && (
                <div className="relative pb-2 pl-6">
                  <div className="absolute -left-1.5 size-4 rounded-full border-2 text-blue-500 bg-blue-500/10 border-blue-500/30 flex items-center justify-center bg-background">
                    <Package className="size-2.5" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10">LOTE CREADO</Badge>
                    <span className="font-mono text-sm">{lote.codigo_lote}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Producción {formatDate(lote.fecha_produccion)} · Vence {formatDate(lote.fecha_vencimiento)} · {lote.estado}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="size-3" />{fmtTs(lote.created_at)}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${color ?? ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
