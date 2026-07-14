import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas-pro";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
// (Badge no se usa aquí)
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowDownToLine, ArrowUpFromLine, Shuffle, Repeat, Image as ImageIcon,
  Download, Filter, Layers, Calendar,
} from "lucide-react";
import { formatNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reportes/jpg-lote")({
  component: ReporteJpgLote,
});

const TIPOS_OK = new Set(["ENTRADA", "SALIDA", "TRASLADO", "CAMBIO"]);

function defaultRange() {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 7);
  return { desde: desde.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10) };
}

const TIPO_META: Record<string, { label: string; icon: any; gradient: string; chip: string }> = {
  ENTRADA: { label: "Ingreso", icon: ArrowDownToLine, gradient: "from-emerald-500 to-emerald-700", chip: "bg-emerald-100 text-emerald-800" },
  SALIDA: { label: "Salida", icon: ArrowUpFromLine, gradient: "from-blue-500 to-blue-700", chip: "bg-blue-100 text-blue-800" },
  TRASLADO: { label: "Traslado", icon: Shuffle, gradient: "from-slate-500 to-slate-700", chip: "bg-slate-100 text-slate-800" },
  CAMBIO: { label: "Cambio de Lote", icon: Repeat, gradient: "from-violet-500 to-violet-700", chip: "bg-violet-100 text-violet-800" },
};

function ReporteJpgLote() {
  const [{ desde, hasta }, setRange] = useState(defaultRange());
  const [tipo, setTipo] = useState<string>("ALL");
  const [loteFilter, setLoteFilter] = useState("");
  const [almFilter, setAlmFilter] = useState<string>("ALL");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rep-jpg", desde, hasta],
    queryFn: async () => {
      const [movs, lotes, prod, ubic, alm, cli] = await Promise.all([
        supabase.from("movimientos").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("lotes").select("id, codigo_lote, producto_id, estado, fecha_produccion, fecha_vencimiento, etiqueta, mercado"),
        supabase.from("productos").select("id, descripcion, codigo_base"),
        supabase.from("ubicaciones").select("id, codigo, almacen_id"),
        supabase.from("almacenes").select("id, nombre"),
        supabase.from("clientes_proveedores").select("id, nombre, tipo"),
      ]);
      return {
        movs: movs.data ?? [],
        lotesM: new Map((lotes.data ?? []).map((l) => [l.id, l])),
        prodM: new Map((prod.data ?? []).map((p) => [p.id, p])),
        ubicM: new Map((ubic.data ?? []).map((u) => [u.id, u])),
        almM: new Map((alm.data ?? []).map((a) => [a.id, a])),
        cliM: new Map((cli.data ?? []).map((c) => [c.id, c])),
        almacenes: alm.data ?? [],
      };
    },
  });

  const groups = useMemo(() => {
    if (!data) return [];
    const q = loteFilter.trim().toLowerCase();
    type Mov = any;
    const map = new Map<string, { key: string; fecha: string; lote_id: string; lote: any; prod: any; tipos: Record<string, Mov[]> }>();

    data.movs.forEach((mv: Mov) => {
      if (!TIPOS_OK.has(mv.tipo)) return;
      if (tipo !== "ALL" && mv.tipo !== tipo) return;
      const lote: any = data.lotesM.get(mv.lote_id);
      if (!lote) return;
      const prod: any = data.prodM.get(lote.producto_id);

      if (almFilter !== "ALL") {
        const uo: any = mv.ubicacion_origen_id ? data.ubicM.get(mv.ubicacion_origen_id) : null;
        const ud: any = mv.ubicacion_destino_id ? data.ubicM.get(mv.ubicacion_destino_id) : null;
        if (uo?.almacen_id !== almFilter && ud?.almacen_id !== almFilter) return;
      }

      if (q) {
        const hay = `${lote.codigo_lote ?? ""} ${prod?.descripcion ?? ""} ${prod?.codigo_base ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return;
      }

      const key = `${mv.fecha}__${mv.lote_id}`;
      let g = map.get(key);
      if (!g) {
        g = { key, fecha: mv.fecha, lote_id: mv.lote_id, lote, prod, tipos: { ENTRADA: [], SALIDA: [], TRASLADO: [], CAMBIO: [] } };
        map.set(key, g);
      }
      g.tipos[mv.tipo].push(mv);
    });

    return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha) || (a.prod?.descripcion ?? "").localeCompare(b.prod?.descripcion ?? ""));
  }, [data, tipo, loteFilter, almFilter]);

  const ubicLabel = (id: string | null | undefined) => {
    if (!id || !data) return "—";
    const u: any = data.ubicM.get(id);
    if (!u) return "—";
    const a: any = data.almM.get(u.almacen_id);
    return `${a?.nombre ?? ""} · ${u.codigo}`;
  };
  const cliLabel = (id: string | null | undefined) => (id && data?.cliM.get(id) as any)?.nombre ?? "";

  const downloadOne = async (key: string, filename: string) => {
    const el = cardRefs.current[key];
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b as Blob), "image/jpeg", 0.95));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message || "Error al generar JPG");
    }
  };

  const downloadAll = async () => {
    if (groups.length === 0) return;
    setBusy(true);
    try {
      for (const g of groups) {
        const fn = `${g.fecha}_${(g.lote?.codigo_lote ?? "lote").replace(/[^a-z0-9]/gi, "_").slice(0, 60)}.jpg`;
        await downloadOne(g.key, fn);
        await new Promise((r) => setTimeout(r, 150));
      }
      toast.success(`${groups.length} JPG generados`);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon className="size-6 text-primary" /> Reporte JPG por Lote / Día
          </h1>
          <p className="text-sm text-muted-foreground">Genera tarjetas elegantes con ingresos, salidas, cambios y traslados de cada lote por día.</p>
        </div>
        <Button onClick={downloadAll} disabled={busy || groups.length === 0}>
          <Download className="size-4 mr-1.5" />
          {busy ? "Generando…" : `Descargar todo (${groups.length})`}
        </Button>
      </header>

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setRange((r) => ({ ...r, desde: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setRange((r) => ({ ...r, hasta: e.target.value }))} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="ENTRADA">Ingresos</SelectItem>
                <SelectItem value="SALIDA">Salidas</SelectItem>
                <SelectItem value="TRASLADO">Traslados</SelectItem>
                <SelectItem value="CAMBIO">Cambios de lote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Almacén</Label>
            <Select value={almFilter} onValueChange={setAlmFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {(data?.almacenes ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Lote / Producto</Label>
            <Input placeholder="Buscar…" value={loteFilter} onChange={(e) => setLoteFilter(e.target.value)} />
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
          <Filter className="size-3" /> {groups.length} tarjeta(s) lote-día encontrada(s)
        </div>
      </Card>

      {isLoading && <Card className="p-8 text-center text-muted-foreground">Cargando…</Card>}
      {!isLoading && groups.length === 0 && (
        <Card className="p-10 text-center text-muted-foreground">Sin movimientos para los filtros seleccionados.</Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {groups.map((g) => {
          const totals = {
            ENTRADA: g.tipos.ENTRADA.reduce((s, m) => s + Number(m.cantidad_cajas || 0), 0),
            SALIDA: g.tipos.SALIDA.reduce((s, m) => s + Number(m.cantidad_cajas || 0), 0),
            TRASLADO: g.tipos.TRASLADO.reduce((s, m) => s + Number(m.cantidad_cajas || 0), 0),
            CAMBIO: g.tipos.CAMBIO.reduce((s, m) => s + Number(m.cantidad_cajas || 0), 0),
          };
          const totLatas = (["ENTRADA", "SALIDA", "TRASLADO", "CAMBIO"] as const).reduce(
            (s, t) => s + g.tipos[t].reduce((ss, m) => ss + Number(m.latas || 0), 0), 0,
          );
          const fn = `${g.fecha}_${(g.lote?.codigo_lote ?? "lote").replace(/[^a-z0-9]/gi, "_").slice(0, 60)}.jpg`;
          return (
            <div key={g.key} className="space-y-2">
              <div
                ref={(el) => { cardRefs.current[g.key] = el; }}
                className="bg-white text-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-200"
                style={{ width: "100%", fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                {/* Header gradient */}
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300 flex items-center gap-1.5">
                        <Calendar className="size-3" /> {new Date(g.fecha + "T00:00:00").toLocaleDateString("es-PE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                      </div>
                      <div className="text-xl font-bold mt-1 truncate">{g.prod?.descripcion ?? "—"}</div>
                      <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
                        <Layers className="size-3" /> {g.lote?.codigo_lote}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Estado</div>
                      <div className="text-sm font-semibold">{g.lote?.estado ?? "—"}</div>
                      {g.lote?.mercado && <div className="text-[10px] text-slate-400 mt-0.5">{g.lote.mercado}</div>}
                    </div>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50">
                  {(["ENTRADA", "SALIDA", "CAMBIO", "TRASLADO"] as const).map((t) => {
                    const meta = TIPO_META[t]; const Icon = meta.icon;
                    return (
                      <div key={t} className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                          <Icon className="size-3" /> {meta.label}
                        </div>
                        <div className="text-lg font-bold mt-0.5 tabular-nums">{formatNumber(totals[t], 0)}</div>
                        <div className="text-[10px] text-slate-400">cajas</div>
                      </div>
                    );
                  })}
                </div>

                {/* Sections by tipo */}
                <div className="p-4 space-y-4">
                  {(["ENTRADA", "SALIDA", "CAMBIO", "TRASLADO"] as const).map((t) => {
                    const items = g.tipos[t];
                    if (items.length === 0) return null;
                    const meta = TIPO_META[t]; const Icon = meta.icon;
                    return (
                      <div key={t}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`size-7 rounded-md bg-gradient-to-br ${meta.gradient} text-white flex items-center justify-center shadow-sm`}>
                            <Icon className="size-4" />
                          </div>
                          <h3 className="font-semibold text-sm uppercase tracking-wider">{meta.label}</h3>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${meta.chip}`}>{items.length} mov.</span>
                        </div>
                        <div className="rounded-lg border border-slate-200 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider text-[10px]">
                              <tr>
                                <th className="text-left px-2 py-1.5">Hora</th>
                                <th className="text-right px-2 py-1.5">Cajas</th>
                                <th className="text-right px-2 py-1.5">Latas</th>
                                <th className="text-left px-2 py-1.5">Origen → Destino</th>
                                <th className="text-left px-2 py-1.5">Cli/Prov · Doc</th>
                                <th className="text-left px-2 py-1.5">Usuario</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((mv: any) => (
                                <tr key={mv.id} className="border-t border-slate-100">
                                  <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{new Date(mv.created_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</td>
                                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatNumber(Number(mv.cantidad_cajas), 0)}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{mv.latas != null ? formatNumber(Number(mv.latas), 0) : "—"}</td>
                                  <td className="px-2 py-1.5 text-slate-700">
                                    {mv.ubicacion_origen_id && <div>← {ubicLabel(mv.ubicacion_origen_id)}</div>}
                                    {mv.ubicacion_destino_id && <div>→ {ubicLabel(mv.ubicacion_destino_id)}</div>}
                                  </td>
                                  <td className="px-2 py-1.5 text-slate-700">
                                    {cliLabel(mv.cliente_proveedor_id) && <div>{cliLabel(mv.cliente_proveedor_id)}</div>}
                                    {mv.nro_guia && <div className="text-slate-500">G: {mv.nro_guia}</div>}
                                    {mv.nro_vale && <div className="text-slate-500">V: {mv.nro_vale}</div>}
                                    {mv.tercero && <div className="text-slate-500">3°: {mv.tercero}</div>}
                                  </td>
                                  <td className="px-2 py-1.5 text-slate-600 truncate max-w-[140px]" title={mv.usuario_nombre ?? ""}>{mv.usuario_nombre ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="bg-slate-900 text-slate-300 px-5 py-3 flex items-center justify-between text-[11px]">
                  <div>
                    FP: <b className="text-white">{g.lote?.fecha_produccion ?? "—"}</b> ·
                    FV: <b className="text-white"> {g.lote?.fecha_vencimiento ?? "—"}</b>
                    {g.lote?.etiqueta && g.lote.etiqueta !== "S/E" && <> · Etiqueta: <b className="text-white">{g.lote.etiqueta}</b></>}
                  </div>
                  <div>Total latas: <b className="text-white">{formatNumber(totLatas, 0)}</b></div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={() => downloadOne(g.key, fn)}>
                  <Download className="size-4 mr-1.5" /> Descargar JPG
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
