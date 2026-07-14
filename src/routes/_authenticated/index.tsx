import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, venceColor } from "@/lib/format";
import {
  Package, Boxes, AlertTriangle, Lock, FileText, Activity,
  ArrowDownCircle, ArrowUpCircle, RefreshCw, Shuffle, Flame, Copy,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const ALERT_PATTERNS = [
  { kw: "borrar", label: "BORRAR", tone: "bg-destructive text-destructive-foreground" },
  { kw: "urgente", label: "URGENTE", tone: "bg-orange-600 text-white" },
  { kw: "cambio codigo", label: "CAMBIO CÓDIGO", tone: "bg-fuchsia-600 text-white" },
  { kw: "cambio de codigo", label: "CAMBIO CÓDIGO", tone: "bg-fuchsia-600 text-white" },
];

function detectPatterns(text: string): { label: string; tone: string }[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Map<string, string>();
  ALERT_PATTERNS.forEach((p) => {
    if (lower.includes(p.kw)) found.set(p.label, p.tone);
  });
  return Array.from(found.entries()).map(([label, tone]) => ({ label, tone }));
}

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 3);
      const desdeStr = desde.toISOString().slice(0, 10);
      const [stockRes, lotesRes, prodRes, warrRes, movsRes] = await Promise.all([
        supabase.from("v_stock_lote").select("*"),
        supabase.from("lotes").select("id,codigo_lote,estado,fecha_vencimiento,producto_id,observacion"),
        supabase.from("productos").select("id,codigo_base,descripcion"),
        supabase.from("warrants").select("cantidad_cajas_warrant,estado").eq("estado", "ACTIVO"),
        supabase.from("movimientos")
          .select("id,tipo,fecha,lote_id,cantidad_cajas,latas,motivo,observaciones,usuario_nombre,tercero,created_at")
          .gte("fecha", desdeStr)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      return {
        stock: stockRes.data ?? [],
        lotes: lotesRes.data ?? [],
        productos: prodRes.data ?? [],
        warrants: warrRes.data ?? [],
        movs: movsRes.data ?? [],
      };
    },
    refetchInterval: 30000,
  });

  const stockTotal = (data?.stock ?? []).reduce((s, r: any) => s + Number(r.stock_total || 0), 0);
  const lotesActivos = (data?.lotes ?? []).filter((l) => l.estado === "DISPONIBLE").length;
  const inmovilizados = (data?.lotes ?? []).filter((l) => l.estado === "INMOVILIZADO").length;
  const warrantTotal = (data?.warrants ?? []).reduce(
    (s, w: any) => s + Number(w.cantidad_cajas_warrant || 0),
    0,
  );
  const porVencer = (data?.lotes ?? []).filter((l) => venceColor(l.fecha_vencimiento) === "warn").length;
  const vencidos = (data?.lotes ?? []).filter((l) => venceColor(l.fecha_vencimiento) === "danger").length;

  const lotesMap = useMemo(
    () => new Map((data?.lotes ?? []).map((l: any) => [l.id, l])),
    [data?.lotes],
  );

  // Duplicate lote codes (case insensitive, ignoring blanks)
  const duplicados = useMemo(() => {
    const counts = new Map<string, string[]>();
    (data?.lotes ?? []).forEach((l: any) => {
      const k = (l.codigo_lote ?? "").trim().toUpperCase();
      if (!k) return;
      const arr = counts.get(k) ?? [];
      arr.push(l.id);
      counts.set(k, arr);
    });
    const dup = new Map<string, number>();
    counts.forEach((ids, k) => {
      if (ids.length > 1) dup.set(k, ids.length);
    });
    return dup;
  }, [data?.lotes]);

  // Movements last 3 days with pattern detection
  const movimientosAlerta = useMemo(() => {
    return (data?.movs ?? []).map((mv: any) => {
      const lote: any = lotesMap.get(mv.lote_id);
      const txt = `${mv.motivo ?? ""} ${mv.observaciones ?? ""}`;
      const patrones = detectPatterns(txt);
      const codigo = (lote?.codigo_lote ?? "").trim().toUpperCase();
      const repetido = codigo && duplicados.has(codigo);
      return { mv, lote, patrones, repetido };
    });
  }, [data?.movs, lotesMap, duplicados]);

  const conPatron = movimientosAlerta.filter((x) => x.patrones.length > 0);
  const totalCambios = movimientosAlerta.length;
  const totalRepetidos = duplicados.size;

  const byProd = new Map<string, number>();
  (data?.stock ?? []).forEach((r: any) => {
    byProd.set(r.producto_id, (byProd.get(r.producto_id) ?? 0) + Number(r.stock_total || 0));
  });
  const chartData = (data?.productos ?? [])
    .map((p) => ({ name: p.codigo_base, cajas: byProd.get(p.id) ?? 0 }))
    .filter((d) => d.cajas > 0)
    .sort((a, b) => b.cajas - a.cajas);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Resumen operativo · alertas en tiempo real</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          Actualiza cada 30s
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Boxes} label="Stock total (cajas)" value={formatNumber(stockTotal)} tone="primary" />
        <StatCard icon={Package} label="Lotes disponibles" value={String(lotesActivos)} tone="success" />
        <StatCard
          icon={AlertTriangle}
          label="Por vencer < 90d"
          value={String(porVencer)}
          extra={vencidos > 0 ? `${vencidos} vencidos` : undefined}
          tone={vencidos > 0 ? "danger" : "warning"}
        />
        <StatCard icon={Lock} label="Inmovilizados" value={String(inmovilizados)} tone="muted" />
        <StatCard icon={FileText} label="En warrant" value={formatNumber(warrantTotal)} tone="muted" />
      </div>

      {/* Alertas de actividad reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PulseCard
          icon={Activity}
          label="Movimientos últimos 3 días"
          value={String(totalCambios)}
          gradient="from-blue-500 to-cyan-500"
        />
        <PulseCard
          icon={Flame}
          label="Patrones críticos detectados"
          value={String(conPatron.length)}
          gradient="from-orange-500 to-red-600"
          pulse={conPatron.length > 0}
        />
        <PulseCard
          icon={Copy}
          label="Lotes con código repetido"
          value={String(totalRepetidos)}
          gradient="from-fuchsia-600 to-pink-600"
          pulse={totalRepetidos > 0}
        />
      </div>

      {/* Lotes repetidos */}
      {totalRepetidos > 0 && (
        <Card className="p-5 border-2 border-destructive bg-destructive/5">
          <div className="flex items-center gap-2 mb-3">
            <Copy className="size-5 text-destructive" />
            <h2 className="font-bold text-destructive">Alerta · Lotes con código repetido</h2>
            <Badge variant="destructive" className="ml-auto">{totalRepetidos}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(duplicados.entries()).map(([codigo, count]) => (
              <span
                key={codigo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground font-mono text-sm font-bold shadow-sm"
              >
                {codigo}
                <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded">×{count}</span>
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Revisa estos lotes en el módulo correspondiente; los registros que comparten código se muestran resaltados en rojo abajo.
          </p>
        </Card>
      )}

      {/* Cambios recientes con detección de patrones */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-5 text-primary" />
          <h2 className="font-bold">Actividad de los últimos 3 días</h2>
          <Badge variant="outline" className="ml-auto">{totalCambios} movimientos</Badge>
        </div>
        {movimientosAlerta.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin movimientos recientes.</p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {movimientosAlerta.slice(0, 50).map(({ mv, lote, patrones, repetido }) => (
              <div
                key={mv.id}
                className={`flex items-center gap-3 p-2.5 rounded-md border transition-colors ${
                  repetido
                    ? "border-destructive bg-destructive/10 ring-1 ring-destructive/40"
                    : patrones.length > 0
                    ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <TipoIcon tipo={mv.tipo} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-wider">{mv.tipo}</span>
                    <span
                      className={`text-sm font-mono font-bold ${
                        repetido ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {lote?.codigo_lote ?? "—"}
                    </span>
                    {repetido && (
                      <Badge variant="destructive" className="text-[10px] h-5">REPETIDO</Badge>
                    )}
                    {patrones.map((p) => (
                      <span
                        key={p.label}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.tone}`}
                      >
                        {p.label}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatNumber(Number(mv.cantidad_cajas), 0)} cj
                    {mv.latas ? ` · ${formatNumber(Number(mv.latas), 0)} lt` : ""}
                    {mv.usuario_nombre ? ` · ${mv.usuario_nombre}` : ""}
                    {mv.tercero ? ` · ${mv.tercero}` : ""}
                    {mv.motivo || mv.observaciones ? ` · ${(mv.motivo ?? mv.observaciones).slice(0, 80)}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">{mv.fecha}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Stock por producto (cajas)</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatNumber(v)} />
              <Bar dataKey="cajas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function TipoIcon({ tipo }: { tipo: string }) {
  const map: Record<string, { Icon: any; cls: string }> = {
    ENTRADA: { Icon: ArrowDownCircle, cls: "bg-success/15 text-success" },
    SALIDA: { Icon: ArrowUpCircle, cls: "bg-primary/15 text-primary" },
    TRASLADO: { Icon: Shuffle, cls: "bg-muted text-foreground" },
    CAMBIO: { Icon: RefreshCw, cls: "bg-fuchsia-500/15 text-fuchsia-600" },
    MERMA: { Icon: AlertTriangle, cls: "bg-destructive/15 text-destructive" },
    AJUSTE_NEGATIVO: { Icon: AlertTriangle, cls: "bg-destructive/15 text-destructive" },
  };
  const { Icon, cls } = map[tipo] ?? { Icon: Activity, cls: "bg-muted text-muted-foreground" };
  return (
    <div className={`size-9 rounded-md flex items-center justify-center shrink-0 ${cls}`}>
      <Icon className="size-5" />
    </div>
  );
}

function PulseCard({
  icon: Icon, label, value, gradient, pulse,
}: { icon: any; label: string; value: string; gradient: string; pulse?: boolean }) {
  return (
    <Card className={`relative overflow-hidden p-4 border-0 text-white bg-gradient-to-br ${gradient} shadow-md`}>
      <div className="absolute -right-6 -top-6 size-24 rounded-full bg-white/15 blur-xl" />
      <div className="relative flex items-center gap-3">
        <div className={`size-11 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center ${pulse ? "animate-pulse" : ""}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-semibold opacity-90">{label}</p>
          <p className="text-2xl font-extrabold leading-tight">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  extra,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  extra?: string;
  tone: "primary" | "success" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    danger: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1 truncate">{value}</p>
          {extra && <p className="text-xs text-destructive mt-0.5">{extra}</p>}
        </div>
        <div className={`size-10 rounded-md flex items-center justify-center shrink-0 ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}
