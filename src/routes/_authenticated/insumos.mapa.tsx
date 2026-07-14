import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Boxes, Search } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/insumos/mapa")({
  component: MapaInsumosPage,
});

type Row = {
  id: string;
  codigo: string;
  categoria: string;
  grupo: string | null;
  subcategoria: string;
  insumo: string | null;
  provee: string | null;
  unidad: string | null;
  saldo_und: number;
  saldo_emp: number;
  ingresos: number;
  salidas: number;
  stock_min_und: number | null;
  estado: string | null;
  ult_mov: string | null;
};

type GrupoAgg = {
  grupo: string;
  saldo: number;
  ingresos: number;
  salidas: number;
  stockMin: number;
  items: number;
  alertas: number;
  ultMov: string | null;
  estado: "OK" | "BAJO" | "AGOTADO";
};

type Bucket = {
  key: string;
  subcategoria: string;
  categoria: string;
  items: Row[];
  grupos: GrupoAgg[];
  saldo: number;
  ingresos: number;
  salidas: number;
  stockMin: number;
  alertas: number;
  ultMov: string | null;
  color: "empty" | "ok" | "warn" | "danger";
};

function MapaInsumosPage() {
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("all");
  const [fGrupo, setFGrupo] = useState("all");
  const [fSub, setFSub] = useState("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openGrupo, setOpenGrupo] = useState<{ categoria: string; subcategoria: string; grupo: string } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["insumos-mapa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vista_insumos_stock")
        .select("id,codigo,categoria,grupo,subcategoria,insumo,provee,unidad,saldo_und,saldo_emp,ingresos,salidas,stock_min_und,estado,ult_mov")
        .eq("activo", true)
        .order("categoria").order("grupo").order("subcategoria");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const categorias = useMemo(() => Array.from(new Set(rows.map(r => r.categoria).filter(Boolean))).sort(), [rows]);
  const grupos = useMemo(() => Array.from(new Set(
    rows.filter(r => fCat === "all" || r.categoria === fCat).map(r => (r.grupo && r.grupo.trim()) ? r.grupo : "GENERAL")
  )).sort(), [rows, fCat]);
  const subcategorias = useMemo(() => Array.from(new Set(
    rows
      .filter(r => fCat === "all" || r.categoria === fCat)
      .filter(r => fGrupo === "all" || ((r.grupo && r.grupo.trim()) ? r.grupo : "GENERAL") === fGrupo)
      .map(r => r.subcategoria)
      .filter((s): s is string => !!s && s.trim() !== "")
  )).sort(), [rows, fCat, fGrupo]);


  const filtered = useMemo(() => rows.filter(r => {
    if (fCat !== "all" && r.categoria !== fCat) return false;
    if (fGrupo !== "all" && (r.grupo ?? "GENERAL") !== fGrupo) return false;
    if (fSub !== "all" && r.subcategoria !== fSub) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![r.categoria, r.grupo, r.subcategoria, r.insumo, r.codigo, r.provee]
        .some(x => (x ?? "").toString().toLowerCase().includes(s))) return false;
    }
    return true;
  }), [rows, q, fCat, fGrupo, fSub]);

  const buckets: Bucket[] = useMemo(() => {
    const map = new Map<string, Bucket>();
    const grupoMap = new Map<string, Map<string, GrupoAgg>>();
    filtered.forEach(r => {
      const key = `${r.categoria}||${r.subcategoria}`;
      const b: Bucket = map.get(key) ?? {
        key,
        subcategoria: r.subcategoria,
        categoria: r.categoria,
        items: [],
        grupos: [],
        saldo: 0, ingresos: 0, salidas: 0, stockMin: 0, alertas: 0,
        ultMov: null,
        color: "empty",
      };
      b.items.push(r);
      b.saldo += Number(r.saldo_und || 0);
      b.ingresos += Number(r.ingresos || 0);
      b.salidas += Number(r.salidas || 0);
      b.stockMin += Number(r.stock_min_und || 0);
      if (r.estado && r.estado !== "OK") b.alertas += 1;
      if (r.ult_mov && (!b.ultMov || r.ult_mov > b.ultMov)) b.ultMov = r.ult_mov;

      const gname = (r.grupo && r.grupo.trim()) ? r.grupo : "GENERAL";
      if (!grupoMap.has(key)) grupoMap.set(key, new Map());
      const gm = grupoMap.get(key)!;
      const g = gm.get(gname) ?? {
        grupo: gname, saldo: 0, ingresos: 0, salidas: 0, stockMin: 0, items: 0, alertas: 0, ultMov: null, estado: "OK" as const,
      };
      g.items += 1;
      g.saldo += Number(r.saldo_und || 0);
      g.ingresos += Number(r.ingresos || 0);
      g.salidas += Number(r.salidas || 0);
      g.stockMin += Number(r.stock_min_und || 0);
      if (r.estado && r.estado !== "OK") g.alertas += 1;
      if (r.ult_mov && (!g.ultMov || r.ult_mov > g.ultMov)) g.ultMov = r.ult_mov;
      gm.set(gname, g);
      map.set(key, b);
    });
    for (const [key, b] of map.entries()) {
      const gm = grupoMap.get(key);
      if (gm) {
        b.grupos = Array.from(gm.values()).map(g => {
          const estado: GrupoAgg["estado"] = g.saldo <= 0 ? "AGOTADO" : (g.stockMin > 0 && g.saldo < g.stockMin) ? "BAJO" : (g.alertas > 0 ? "BAJO" : "OK");
          return { ...g, estado };
        }).sort((a, b) => b.saldo - a.saldo);
      }
      if (b.saldo <= 0) b.color = "danger";
      else if (b.alertas > 0) b.color = "warn";
      else if (b.stockMin > 0 && b.saldo < b.stockMin) b.color = "warn";
      else b.color = "ok";
    }
    return Array.from(map.values()).sort((a, b) => b.saldo - a.saldo);
  }, [filtered]);

  const secciones = useMemo(() => {
    const m = new Map<string, Bucket[]>();
    buckets.forEach(b => {
      const key = b.categoria;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(b);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [buckets]);

  const resumen = useMemo(() => {
    return buckets.reduce((acc, b) => {
      acc.saldo += b.saldo;
      acc.ingresos += b.ingresos;
      acc.salidas += b.salidas;
      acc[b.color]++;
      return acc;
    }, { saldo: 0, ingresos: 0, salidas: 0, empty: 0, ok: 0, warn: 0, danger: 0 });
  }, [buckets]);

  const openBucket = openKey ? buckets.find(b => b.key === openKey) ?? null : null;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mapa de insumos</h1>
          <p className="text-muted-foreground">Vista cinema · agrupación por subcategoría con totales</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Subcategorías" value={buckets.length} accent="primary" />
        <Kpi label="Saldo total (und)" value={resumen.saldo} accent="success" decimals={0} />
        <Kpi label="Alertas" value={resumen.warn} accent="warning" />
        <Kpi label="Sin stock" value={resumen.danger} accent="destructive" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Categoría, subcategoría, insumo, proveedor…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-10" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={fCat} onValueChange={(v) => { setFCat(v); setFGrupo("all"); setFSub("all"); }}>
              <SelectTrigger className="w-56 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Grupo</Label>
            <Select value={fGrupo} onValueChange={(v) => { setFGrupo(v); setFSub("all"); }}>
              <SelectTrigger className="w-48 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {grupos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subcategoría</Label>
            <Select value={fSub} onValueChange={setFSub}>
              <SelectTrigger className="w-60 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {subcategorias.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="relative rounded-2xl overflow-hidden border border-navy/40 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f1f] via-[#0d1428] to-[#070b18]" />
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(circle at 25% 0%, white 0%, transparent 45%), radial-gradient(circle at 75% 0%, white 0%, transparent 45%)" }} />
        <div className="relative p-6 md:p-10">
          <div className="mx-auto max-w-2xl mb-8">
            <div className="h-2 rounded-full bg-gradient-to-r from-transparent via-amber-300/80 to-transparent shadow-[0_0_40px_8px_rgba(251,191,36,0.35)]" />
            <p className="text-center text-[10px] uppercase tracking-[0.4em] text-amber-200/70 mt-2">Insumos por subcategoría</p>
          </div>

          {isLoading ? (
            <p className="text-center text-white/50 py-16">Cargando…</p>
          ) : secciones.length === 0 ? (
            <p className="text-center text-white/50 py-16">Sin registros para los filtros aplicados</p>
          ) : (
            <div className="flex flex-col gap-8 w-full">
              {secciones.map(([label, arr]) => {
                const labelNorm = label.toLowerCase();
                let divisor = 0;
                if (/1\s*lb\s*tall|tall.*1\s*lb/.test(labelNorm)) divisor = 24;
                else if (/media\s*libra|1\/2\s*lb|½\s*lb/.test(labelNorm)) divisor = 48;

                let packInfo: {
                  divisor: number;
                  envases: number; tapas: number;
                  cajasEnv: number; cajasTap: number;
                  conjuntos: number;
                } | null = null;
                if (divisor > 0) {
                  let envases = 0, tapas = 0;
                  arr.forEach(b => {
                    const sub = (b.subcategoria ?? "").toUpperCase();
                    if (/^TAPA/.test(sub)) tapas += b.saldo;
                    else if (sub === "ENVASE") envases += b.saldo;
                  });
                  const cajasEnv = Math.floor(envases / divisor);
                  const cajasTap = Math.floor(tapas / divisor);
                  packInfo = {
                    divisor, envases, tapas, cajasEnv, cajasTap,
                    conjuntos: Math.min(cajasEnv, cajasTap),
                  };
                }
                return (
                <div key={label} className="w-full">
                  <div className="flex items-center gap-4 mb-4 flex-wrap">
                    <div className="flex items-center justify-center px-6 h-16 rounded-2xl bg-amber-300/15 border-2 border-amber-300/40 text-amber-200 font-black text-xl shadow-[inset_0_0_30px_rgba(251,191,36,0.25)]">
                      {label}
                    </div>
                    {packInfo && (
                      <div className="relative flex items-stretch rounded-2xl overflow-hidden border-2 border-sky-300/50 bg-gradient-to-br from-sky-500/20 via-cyan-500/10 to-sky-400/5 shadow-[0_0_25px_rgba(56,189,248,0.35)] backdrop-blur-sm">
                        <div className="flex flex-col items-center justify-center px-4 py-2 bg-emerald-500/15 border-r border-sky-300/30">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-emerald-200/80 font-semibold">Envases</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white tabular-nums leading-none">{formatNumber(packInfo.cajasEnv, 0)}</span>
                            <span className="text-[10px] font-bold text-emerald-100 uppercase">cajas</span>
                          </div>
                          <span className="text-[9px] font-mono text-emerald-100/70">{formatNumber(packInfo.envases, 0)} ÷ {packInfo.divisor}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center px-4 py-2 bg-fuchsia-500/15 border-r border-sky-300/30">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-fuchsia-200/80 font-semibold">Tapas</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white tabular-nums leading-none">{formatNumber(packInfo.cajasTap, 0)}</span>
                            <span className="text-[10px] font-bold text-fuchsia-100 uppercase">cajas</span>
                          </div>
                          <span className="text-[9px] font-mono text-fuchsia-100/70">{formatNumber(packInfo.tapas, 0)} ÷ {packInfo.divisor}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center px-4 py-2 bg-sky-400/25">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-sky-100/90 font-semibold">Conjuntos</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white tabular-nums leading-none">{formatNumber(packInfo.conjuntos, 0)}</span>
                            <span className="text-[10px] font-bold text-sky-100 uppercase">cajas</span>
                          </div>
                          <span className="text-[9px] font-mono text-sky-100/70">mín(env, tapas)</span>
                        </div>
                      </div>
                    )}
                    <div className="flex-1 h-px bg-gradient-to-r from-amber-300/40 to-transparent min-w-8" />
                    <span className="text-xs uppercase tracking-[0.3em] text-white/40">{arr.length} subcategorías</span>
                  </div>

                  <div className="grid gap-3 w-full" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                    {arr.map(b => (
                      <SeatSub key={b.key} b={b} onClick={() => setOpenKey(b.key)} />
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-white/70">
            <Legend color="ok" label="Con stock" />
            <Legend color="warn" label="Bajo mínimo / alerta" />
            <Legend color="danger" label="Sin stock" />
          </div>
        </div>
      </div>

      <Sheet open={!!openKey} onOpenChange={(o) => !o && setOpenKey(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {openBucket && (
            <BucketDetail
              b={openBucket}
              onOpenGrupo={(grupo) => setOpenGrupo({ categoria: openBucket.categoria, subcategoria: openBucket.subcategoria, grupo })}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!openGrupo} onOpenChange={(o) => !o && setOpenGrupo(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {openGrupo && <GrupoMovimientos {...openGrupo} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, accent, decimals = 0 }: {
  label: string; value: number; accent: "primary" | "success" | "warning" | "destructive"; decimals?: number;
}) {
  const ring =
    accent === "primary" ? "from-primary/40 to-primary/0" :
    accent === "success" ? "from-success/40 to-success/0" :
    accent === "warning" ? "from-warning/40 to-warning/0" :
    "from-destructive/40 to-destructive/0";
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={cn("absolute -top-10 -right-10 size-32 rounded-full blur-2xl bg-gradient-to-br", ring)} />
      <div className="relative">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-3xl font-bold mt-1">{formatNumber(value, decimals)}</div>
      </div>
    </Card>
  );
}

function SeatSub({ b, onClick }: { b: Bucket; onClick: () => void }) {
  const styles =
    b.color === "empty" ? "bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/10" :
    b.color === "ok" ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.45)]" :
    b.color === "warn" ? "bg-amber-500/25 border-amber-300/70 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.55)]" :
    "bg-rose-600/30 border-rose-400/70 text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.6)]";

  // Etiqueta de conjuntos (tapas + envases) según subcategoría
  const subNorm = (b.subcategoria ?? "").toLowerCase();
  let packInfo: { cajas: number; divisor: number } | null = null;
  if (/1\s*lb.*tall|tall.*1\s*lb|1lb\s*tall/.test(subNorm)) {
    packInfo = { cajas: Math.floor(b.saldo / 24), divisor: 24 };
  } else if (/media\s*libra|1\/2\s*lb|½\s*lb/.test(subNorm)) {
    packInfo = { cajas: Math.floor(b.saldo / 48), divisor: 48 };
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full min-h-32 rounded-2xl border-2 transition-all duration-200 cursor-pointer overflow-hidden p-3 text-left",
        "flex flex-col gap-1 hover:scale-[1.02]",
        styles,
      )}
      title={`${b.subcategoria} · ${formatNumber(b.saldo, 0)} und`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-sm leading-tight line-clamp-2">{b.subcategoria}</span>
        <Boxes className="size-4 shrink-0 opacity-70" />
      </div>
      <div className="mt-auto space-y-0.5">
        <div className="text-2xl font-black leading-none">{formatNumber(b.saldo, 0)}</div>
        <div className="text-[10px] opacity-70 uppercase tracking-wider">
          {b.items.length} ítem{b.items.length !== 1 ? "s" : ""}
          {b.stockMin > 0 && ` · mín ${formatNumber(b.stockMin, 0)}`}
        </div>
        {packInfo && (
          <div className="pt-1">
            <span className="inline-block px-2 py-0.5 rounded-md bg-sky-400/25 border border-sky-300/50 text-sky-50 text-[11px] font-bold">
              ≈ {formatNumber(packInfo.cajas, 0)} cajas <span className="opacity-70 font-normal">(tapas+envases /{packInfo.divisor})</span>
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-1 pt-1 text-[10px] font-mono">
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/30 border border-emerald-400/40">+{formatNumber(b.ingresos, 0)}</span>
          <span className="px-1.5 py-0.5 rounded bg-rose-500/30 border border-rose-400/40">−{formatNumber(b.salidas, 0)}</span>
        </div>
      </div>
      {b.alertas > 0 && (
        <span className="absolute -top-2 -right-2 px-2 h-6 rounded-full bg-amber-300 text-xs text-black font-black flex items-center justify-center shadow-lg border-2 border-[#0a0f1f]">
          ⚠ {b.alertas}
        </span>
      )}
    </button>
  );
}


function Legend({ color, label }: { color: Bucket["color"]; label: string }) {
  const cls =
    color === "empty" ? "bg-white/10 border-white/20" :
    color === "ok" ? "bg-emerald-500/40 border-emerald-400" :
    color === "warn" ? "bg-amber-400/50 border-amber-300" :
    "bg-rose-500/50 border-rose-400";
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-5 h-3 rounded-t-md rounded-b-sm border", cls)} />
      <span>{label}</span>
    </div>
  );
}

function BucketDetail({ b, onOpenGrupo }: { b: Bucket; onOpenGrupo: (grupo: string) => void }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-xl">{b.subcategoria}</SheetTitle>
        <p className="text-xs text-muted-foreground">{b.categoria}</p>
      </SheetHeader>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Saldo (und)" value={formatNumber(b.saldo, 0)} />
        <Stat label="Ingresos" value={formatNumber(b.ingresos, 0)} tone="success" />
        <Stat label="Salidas" value={formatNumber(b.salidas, 0)} tone="destructive" />
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">Grupos ({b.grupos.length})</h3>
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-2 py-1.5">Grupo</th>
                <th className="text-right px-2 py-1.5">Saldo</th>
                <th className="text-left px-2 py-1.5">Último movimiento</th>
                <th className="text-left px-2 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {b.grupos.map(g => (
                <tr
                  key={g.grupo}
                  className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => onOpenGrupo(g.grupo)}
                  title="Ver movimientos del grupo"
                >
                  <td className="px-2 py-1.5 font-medium">
                    <Badge variant="outline">{g.grupo}</Badge>
                    <span className="ml-2 text-muted-foreground">{g.items} ítem{g.items !== 1 ? "s" : ""}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(g.saldo, 0)}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{g.ultMov ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={g.estado === "OK" ? "secondary" : "destructive"} className="text-[10px]">{g.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">Ítems ({b.items.length})</h3>
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-2 py-1.5">Código</th>
                <th className="text-left px-2 py-1.5">Grupo</th>
                <th className="text-left px-2 py-1.5">Insumo</th>
                <th className="text-left px-2 py-1.5">Proveedor</th>
                <th className="text-right px-2 py-1.5">Saldo</th>
                <th className="text-left px-2 py-1.5">Último mov.</th>
                <th className="text-left px-2 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {b.items.map(it => (
                <tr key={it.id} className="border-t">
                  <td className="px-2 py-1.5 font-mono">{it.codigo}</td>
                  <td className="px-2 py-1.5 text-xs"><Badge variant="outline">{it.grupo ?? "GENERAL"}</Badge></td>
                  <td className="px-2 py-1.5">{it.insumo ?? "—"}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{it.provee ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{formatNumber(it.saldo_und, 0)} {it.unidad ?? ""}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{it.ult_mov ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={it.estado === "OK" ? "secondary" : "destructive"} className="text-[10px]">{it.estado ?? "—"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold mt-0.5",
        tone === "success" && "text-emerald-600",
        tone === "destructive" && "text-rose-600",
      )}>{value}</div>
    </Card>
  );
}

function GrupoMovimientos({ categoria, subcategoria, grupo }: { categoria: string; subcategoria: string; grupo: string }) {
  const { data: movs = [], isLoading } = useQuery({
    queryKey: ["insumos-mapa-grupo-movs", categoria, subcategoria, grupo],
    queryFn: async () => {
      let query = (supabase as any)
        .from("vista_insumos_movimientos")
        .select("*")
        .eq("categoria", categoria)
        .eq("subcategoria", subcategoria)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      query = grupo === "GENERAL"
        ? query.or("grupo.is.null,grupo.eq.GENERAL")
        : query.eq("grupo", grupo);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    let ing = 0, sal = 0;
    (movs as any[]).forEach(m => {
      if (m.clase === "INGRESO") ing += Number(m.cantidad || 0);
      else if (m.clase === "SALIDA") sal += Number(m.cantidad || 0);
    });
    return { ing, sal };
  }, [movs]);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg flex items-center gap-2 flex-wrap">
          <Boxes className="size-5 text-primary" />
          <span>{subcategoria}</span>
          <Badge variant="outline">{grupo}</Badge>
          <span className="text-muted-foreground text-sm">· {categoria}</span>
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          <span className="text-emerald-600 font-semibold">Ingresos: {formatNumber(totals.ing, 0)}</span>
          <span className="mx-2">·</span>
          <span className="text-rose-600 font-semibold">Salidas: {formatNumber(totals.sal, 0)}</span>
          <span className="mx-2">·</span>
          <span>{(movs as any[]).length} movimientos</span>
        </p>
      </SheetHeader>

      <div className="mt-4 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5">Fecha</th>
              <th className="text-left px-2 py-1.5">Tipo</th>
              <th className="text-right px-2 py-1.5 text-emerald-600">Ingreso</th>
              <th className="text-right px-2 py-1.5 text-rose-600">Salida</th>
              <th className="text-right px-2 py-1.5">Saldo</th>
              <th className="text-left px-2 py-1.5">Guía / Vale</th>
              <th className="text-left px-2 py-1.5">Proveedor</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Cargando…</td></tr>
            )}
            {!isLoading && (movs as any[]).length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Sin movimientos</td></tr>
            )}
            {(movs as any[]).map((m: any) => (
              <tr key={m.id} className="border-t">
                <td className="px-2 py-1.5 whitespace-nowrap">{m.fecha}</td>
                <td className="px-2 py-1.5">
                  <Badge variant={m.clase === "INGRESO" ? "default" : "secondary"} className="text-[10px]">{m.tipo_mov}</Badge>
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-emerald-600">
                  {m.clase === "INGRESO" ? formatNumber(Number(m.cantidad || 0), 0) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-rose-600">
                  {m.clase === "SALIDA" ? formatNumber(Number(m.cantidad || 0), 0) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  {m.saldo_post != null ? formatNumber(Number(m.saldo_post), 0) : "—"}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{m.nro_guia ?? m.vale_num ?? "—"}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{m.proveedor ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
