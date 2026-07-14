import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatDate, venceColor } from "@/lib/format";
import { fetchEmpaquePorLote, resolveEmpaque } from "@/lib/empaque";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LatasInput, LatasDisplay, splitLatas } from "@/components/latas-input";


export const Route = createFileRoute("/_authenticated/mapa")({
  component: MapaPage,
});

const CAPACIDAD_CARRIL = 2880;

type CellInfo = {
  ubicacion: any;
  lotes: { lote: any; cantidad: number; latas: number; totalLatas: number }[];
  totalLatas: number;
  color: "empty" | "ok" | "warn" | "danger";
  total: number;
  piso: number | null;
};

function MapaPage() {
  const qc = useQueryClient();
  const [almId, setAlmId] = useState<string>("");
  const [openUbic, setOpenUbic] = useState<string | null>(null);
  const [hoverUbic, setHoverUbic] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["mapa"],
    queryFn: async () => {
      const [a, u, s, l, p, m, latas, empMap] = await Promise.all([
        supabase.from("almacenes").select("*").eq("activo", true).order("nombre"),
        supabase.from("ubicaciones").select("*").eq("activo", true).order("codigo"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("lotes").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("movimientos").select("ubicacion_destino_id, piso, fecha, created_at").not("piso", "is", null).order("created_at", { ascending: false }).limit(2000),
        supabase.from("v_stock_latas_ubic" as any).select("*"),
        fetchEmpaquePorLote(),
      ]);
      return {
        almacenes: a.data ?? [],
        ubicaciones: u.data ?? [],
        stock: s.data ?? [],
        lotes: l.data ?? [],
        productos: p.data ?? [],
        movimientos: (m.data ?? []) as Array<{ ubicacion_destino_id: string | null; piso: number | null }>,
        latas: ((latas.data ?? []) as unknown) as Array<{ lote_id: string; ubicacion_id: string; latas: number }>,
        empaquePorLote: empMap,
      };
    },
  });

  const currentAlm = almId || data?.almacenes[0]?.id || "";
  const loteById = useMemo(() => new Map((data?.lotes ?? []).map(l => [l.id, l])), [data]);
  const prodById = useMemo(() => new Map((data?.productos ?? []).map(p => [p.id, p])), [data]);

  const pisoByUbic = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of data?.movimientos ?? []) {
      if (mv.ubicacion_destino_id && mv.piso != null && !m.has(mv.ubicacion_destino_id)) {
        m.set(mv.ubicacion_destino_id, mv.piso);
      }
    }
    return m;
  }, [data]);

  const empaqueLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.lotes ?? []).forEach((l: any) => {
      const p: any = (data?.productos ?? []).find((x: any) => x.id === l.producto_id);
      m.set(l.id, resolveEmpaque(l.id, data?.empaquePorLote, p?.empaque));
    });
    return m;
  }, [data]);

  const celdas: CellInfo[] = useMemo(() => {
    if (!data) return [];
    const ubs = data.ubicaciones.filter(u => u.almacen_id === currentAlm);
    return ubs.map(u => {
      const stocks = data.stock.filter(s => s.ubicacion_id === u.id && Number(s.total_latas ?? 0) > 0);
      const lotes = stocks.map(s => {
        const emp = empaqueLote.get(s.lote_id) ?? 48;
        const tot = Number(s.total_latas ?? 0);
        return {
          lote: loteById.get(s.lote_id),
          cantidad: Math.floor(tot / emp),   // cajas derivadas
          latas: tot % emp,                   // latas sueltas derivadas
          totalLatas: tot,
        };
      }).filter(x => x.lote);
      const total = lotes.reduce((acc, x) => acc + x.cantidad, 0);
      const totalLatas = lotes.reduce((acc, x) => acc + x.totalLatas, 0);
      let color: CellInfo["color"] = "empty";
      if (total > 0 || totalLatas > 0) {
        color = "ok";
        for (const { lote } of lotes) {
          if (!lote) continue;
          if (lote.estado === "INMOVILIZADO" || lote.estado === "CUARENTENA") { color = "danger"; break; }
          const c = venceColor(lote.fecha_vencimiento);
          if (c === "danger") { color = "danger"; break; }
          if (c === "warn") color = "warn";
        }
      }
      return { ubicacion: u, lotes, color, total, totalLatas, piso: pisoByUbic.get(u.id) ?? null };
    });

  }, [data, currentAlm, loteById, pisoByUbic, empaqueLote]);

  const resumen = useMemo(() => {
    const r = { empty: 0, ok: 0, warn: 0, danger: 0, total: 0, ocupadas: 0 };
    celdas.forEach(c => {
      r[c.color]++;
      r.total += c.total;
      if (c.total > 1) r.ocupadas++;
    });
    return r;
  }, [celdas]);

  // Group cells by section, sorted numerically by carril
  const secciones = useMemo(() => {
    const map = new Map<string, CellInfo[]>();
    celdas.forEach(c => {
      const s = c.ubicacion.seccion || "—";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(c);
    });
    for (const arr of map.values()) {
      arr.sort((a, b) => Number(a.ubicacion.carril ?? 0) - Number(b.ubicacion.carril ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [celdas]);

  const ocupacionPct = celdas.length ? Math.round((resumen.ocupadas / celdas.length) * 100) : 0;
  const hoverCell = hoverUbic ? celdas.find(c => c.ubicacion.id === hoverUbic) : null;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mapa de almacén</h1>
          <p className="text-muted-foreground">Vista cinema · ubicaciones con stock resaltadas</p>
        </div>
        {data && data.almacenes.length > 0 && (
          <Tabs value={currentAlm} onValueChange={setAlmId}>
            <TabsList>
              {data.almacenes.map(a => (
                <TabsTrigger key={a.id} value={a.id}>{a.nombre}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Ubicaciones" value={celdas.length} accent="primary" />
        <Kpi label="Ocupadas" value={resumen.ocupadas} accent="success" sub={`${ocupacionPct}% ocupación`} />
        <Kpi label="Por vencer" value={resumen.warn} accent="warning" />
        <Kpi label="Críticas" value={resumen.danger} accent="destructive" />
      </div>

      {/* Cinema-style hall */}
      <div className="relative rounded-2xl overflow-hidden border border-navy/40 shadow-2xl">
        {/* Theater backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f1f] via-[#0d1428] to-[#070b18]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 0%, white 0%, transparent 45%), radial-gradient(circle at 75% 0%, white 0%, transparent 45%)",
          }}
        />

        <div className="relative p-6 md:p-10">
          {/* Screen / Pantalla */}
          <div className="mx-auto max-w-2xl mb-8">
            <div className="h-2 rounded-full bg-gradient-to-r from-transparent via-amber-300/80 to-transparent shadow-[0_0_40px_8px_rgba(251,191,36,0.35)]" />
            <p className="text-center text-[10px] uppercase tracking-[0.4em] text-amber-200/70 mt-2">
              {data?.almacenes.find(a => a.id === currentAlm)?.nombre ?? "Almacén"}
            </p>
          </div>

          {celdas.length === 0 ? (
            <p className="text-center text-white/50 py-16">Sin ubicaciones en este almacén</p>
          ) : (
            <div className="flex flex-col gap-8 w-full">
              {secciones.map(([seccion, cells]) => (
                <SectionRow
                  key={seccion}
                  label={seccion}
                  cells={cells}
                  hoverUbic={hoverUbic}
                  onHover={setHoverUbic}
                  onPick={(id) => setOpenUbic(id)}
                />
              ))}
            </div>
          )}


          {/* Legend */}
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-white/70">
            <Legend color="empty" label={`Vacía (${resumen.empty})`} />
            <Legend color="ok" label={`Con stock (${resumen.ok})`} />
            <Legend color="warn" label={`Por vencer (${resumen.warn})`} />
            <Legend color="danger" label={`Crítico (${resumen.danger})`} />
          </div>
        </div>

        {/* Floating hover preview */}
        {hoverCell && (
          <div className="pointer-events-none absolute top-4 right-4 max-w-xs bg-black/70 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-white shadow-2xl">
            <div className="font-mono text-sm font-bold text-amber-200">
              {hoverCell.ubicacion.codigo}
            </div>
            <div className="text-[11px] text-white/60 mt-0.5">
              {hoverCell.total > 0 || hoverCell.totalLatas > 0
                ? `${formatNumber(hoverCell.total, 0)} cj · ${formatNumber(hoverCell.totalLatas, 0)} lt · ${hoverCell.lotes.length} lote(s)`
                : "Vacía"}
            </div>
            {hoverCell.ubicacion.pallets && (
              <div className="text-[10px] text-white/40 mt-1">Cap: {hoverCell.ubicacion.pallets} pallets</div>
            )}
          </div>
        )}
      </div>

      <Sheet open={!!openUbic} onOpenChange={(o) => !o && setOpenUbic(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {openUbic && data && (
            <CeldaDetail
              ubicacion={data.ubicaciones.find(u => u.id === openUbic)!}
              celda={celdas.find(c => c.ubicacion.id === openUbic)}
              almacenes={data.almacenes}
              ubicaciones={data.ubicaciones}
              prodById={prodById}
              empaqueLote={empaqueLote}
              onDone={() => { setOpenUbic(null); qc.invalidateQueries(); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: {
  label: string; value: number; sub?: string;
  accent: "primary" | "success" | "warning" | "destructive";
}) {
  const ring =
    accent === "primary" ? "from-primary/40 to-primary/0" :
    accent === "success" ? "from-success/40 to-success/0" :
    accent === "warning" ? "from-warning/40 to-warning/0" :
    "from-destructive/40 to-destructive/0";
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={cn("absolute -top-10 -right-10 size-32 rounded-full bg-gradient-radial blur-2xl bg-gradient-to-br", ring)} />
      <div className="relative">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-3xl font-bold mt-1">{formatNumber(value, 0)}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
    </Card>
  );
}

function SectionRow({
  label, cells, hoverUbic, onHover, onPick,
}: {
  label: string;
  cells: CellInfo[];
  hoverUbic: string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center justify-center size-20 md:size-24 rounded-2xl bg-amber-300/15 border-2 border-amber-300/40 text-amber-200 font-black text-5xl md:text-6xl shadow-[inset_0_0_30px_rgba(251,191,36,0.25)]">
          {label}
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-amber-300/40 to-transparent" />
        <span className="text-xs uppercase tracking-[0.3em] text-white/40">
          {cells.length} ubicaciones
        </span>
      </div>
      <div className="grid gap-3 w-full" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))` }}>
        {cells.map(c => (
          <Seat
            key={c.ubicacion.id}
            cell={c}
            active={hoverUbic === c.ubicacion.id}
            onHover={() => onHover(c.ubicacion.id)}
            onLeave={() => onHover(null)}
            onClick={() => onPick(c.ubicacion.id)}
          />
        ))}
      </div>
    </div>
  );
}


function Seat({ cell, active, onHover, onLeave, onClick }: {
  cell: CellInfo;
  active: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const occupied = cell.total > 1;
  const excede = cell.total > CAPACIDAD_CARRIL;
  const pct = Math.min(100, Math.round((cell.total / CAPACIDAD_CARRIL) * 100));

  // Color base por estado/vencimiento
  const styles =
    cell.color === "empty"
      ? "bg-white/[0.04] border-white/10 text-white/40 hover:bg-white/10"
      : cell.color === "ok"
      ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.45)]"
      : cell.color === "warn"
      ? "bg-amber-500/25 border-amber-300/70 text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.55)]"
      : "bg-rose-600/30 border-rose-400/70 text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.6)] animate-pulse";

  // Acento de piso (anillo lateral): piso 1 = cian, piso 2 = violeta
  const pisoRing =
    cell.piso === 1 ? "ring-2 ring-cyan-300/80 shadow-[0_0_18px_rgba(34,211,238,0.55)]" :
    cell.piso === 2 ? "ring-2 ring-violet-300/80 shadow-[0_0_18px_rgba(167,139,250,0.6)]" : "";

  // Barra animada
  const barColor =
    excede ? "bg-gradient-to-r from-rose-500 to-red-600"
    : pct >= 85 ? "bg-gradient-to-r from-amber-400 to-orange-500"
    : pct >= 50 ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
    : "bg-gradient-to-r from-sky-400 to-emerald-400";

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        "relative w-full h-28 md:h-32 rounded-2xl border-2 transition-all duration-200 cursor-pointer overflow-hidden",
        "flex flex-col items-center justify-center font-mono font-black",
        styles,
        pisoRing,
        active && "scale-105 z-10 ring-4 ring-amber-200/80",
        occupied && !pisoRing && "ring-2 ring-amber-200/40",
        excede && "animate-pulse",
      )}
      title={`${cell.ubicacion.codigo} · ${cell.totalLatas > 0 ? formatNumber(cell.totalLatas, 0) + " latas (" + formatNumber(cell.total, 0) + "c + " + (cell.totalLatas - cell.total * 48) + "l)" : "vacía"}${cell.piso ? " · Piso " + cell.piso : ""}`}
    >
      <span className="text-3xl md:text-4xl leading-none">{cell.ubicacion.carril || cell.ubicacion.codigo}</span>
      {cell.totalLatas > 0 && (
        <span className="flex flex-col items-center mt-1 leading-tight">
          <span className="text-sm font-black tabular-nums">{formatNumber(cell.totalLatas, 0)} lt</span>
          <span className="text-[10px] font-semibold opacity-75 tracking-wide">{formatNumber(cell.total, 0)}c + {cell.totalLatas - cell.total * 48}l</span>
        </span>
      )}

      {/* Barra animada de capacidad */}
      {cell.total > 0 && (
        <div className="absolute bottom-1.5 left-2 right-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-[width] duration-700 ease-out", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Badge piso */}
      {cell.piso != null && (
        <span className={cn(
          "absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-wider border",
          cell.piso === 1 ? "bg-cyan-400/90 text-black border-cyan-200" : "bg-violet-400/90 text-black border-violet-200",
        )}>
          P{cell.piso}
        </span>
      )}

      {/* Badge latas sueltas */}
      {cell.totalLatas - cell.total * 48 > 0 && (
        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md text-[10px] font-black tracking-wider bg-sky-400/95 text-black border border-sky-200 shadow">
          {formatNumber(cell.totalLatas - cell.total * 48, 0)} lt
        </span>
      )}


      {/* Badge cantidad o alerta */}
      {excede ? (
        <span className="absolute -top-2 -right-2 px-2 h-7 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center shadow-lg border-2 border-[#0a0f1f] uppercase tracking-wider animate-pulse">
          ⚠ Excede {pct}%
        </span>
      ) : occupied && (
        <span className="absolute -top-2 -right-2 min-w-[28px] h-7 px-2 rounded-full bg-amber-300 text-xs text-black font-black flex items-center justify-center shadow-lg border-2 border-[#0a0f1f]">
          {pct}%
        </span>
      )}
    </button>
  );
}


function Legend({ color, label }: { color: CellInfo["color"]; label: string }) {
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

function CeldaDetail({
  ubicacion, celda, almacenes, ubicaciones, prodById, empaqueLote, onDone,
}: {
  ubicacion: any;
  celda: CellInfo | undefined;
  almacenes: any[];
  ubicaciones: any[];
  prodById: Map<string, any>;
  empaqueLote: Map<string, number>;
  onDone: () => void;
}) {
  const [selLote, setSelLote] = useState<string>("");
  const [almDest, setAlmDest] = useState<string>("");
  const [ubicDest, setUbicDest] = useState<string>("");
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const [tieneEtiqueta, setTieneEtiqueta] = useState(false);
  const [saving, setSaving] = useState(false);

  const lotes = celda?.lotes ?? [];
  const loteSel = lotes.find(l => l.lote.id === selLote);
  const empaqueVal = loteSel ? (empaqueLote.get(loteSel.lote.id) ?? 48) : 48;
  const ubicsDest = ubicaciones.filter(u => u.almacen_id === almDest && u.id !== ubicacion.id);
  const dispLatas = loteSel ? Number(loteSel.totalLatas ?? 0) : 0;

  const onTraslado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selLote || !ubicDest) { toast.error("Selecciona lote y destino"); return; }
    const t = typeof totalLatas === "number" ? totalLatas : 0;
    if (t <= 0) { toast.error("Ingresa el total de latas a trasladar"); return; }
    const { cajas: c, latas: l } = splitLatas(t, empaqueVal);
    setSaving(true);
    try {
      const { error } = await supabase.rpc("registrar_movimiento", {
        p_tipo: "TRASLADO", p_lote_id: selLote, p_cantidad: c,
        p_latas: l, p_total_latas: t,
        p_ubic_origen: ubicacion.id, p_ubic_destino: ubicDest,
        p_motivo: "Traslado rápido desde mapa",
        p_tiene_etiqueta: tieneEtiqueta,
        p_empaque: empaqueVal,
      } as any);
      if (error) throw error;
      toast.success("Traslado registrado");
      setTieneEtiqueta(false);
      setTotalLatas("");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Error en traslado");
    } finally { setSaving(false); }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">Ubicación {ubicacion.codigo}</SheetTitle>
      </SheetHeader>
      <div className="mt-5 space-y-5">
        <div>
          <h3 className="font-semibold mb-2">Lotes en esta ubicación</h3>
          {lotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ubicación vacía</p>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Lote</th>
                    <th className="text-left px-3 py-2">FV</th>
                    <th className="text-right px-3 py-2">Cajas</th>
                    <th className="text-right px-3 py-2">Latas</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map(({ lote, cantidad, latas }) => {
                    const p = prodById.get(lote.producto_id);
                    const col = venceColor(lote.fecha_vencimiento);
                    const isSel = selLote === lote.id;
                    return (
                      <tr
                        key={lote.id}
                        onClick={() => {
                          setSelLote(lote.id);
                          setTotalLatas(Number((lotes.find(x => x.lote.id === lote.id)?.totalLatas) ?? 0));
                        }}
                        className={cn(
                          "border-t cursor-pointer transition-colors hover:bg-muted/60",
                          isSel && "bg-primary/10 hover:bg-primary/15",
                        )}
                        title="Clic para cargar en traslado rápido"
                      >
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">{lote.codigo_lote}</div>
                          <div className="text-xs text-muted-foreground">{p?.descripcion}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${
                              col === "danger" ? "bg-destructive" : col === "warn" ? "bg-warning" : "bg-success"
                            }`} />
                            {formatDate(lote.fecha_vencimiento)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{formatNumber(cantidad)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-sky-600">{formatNumber(latas, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {lotes.length > 0 && (
          <div>
            <h3 className="font-semibold mb-2">Traslado rápido</h3>
            <Card className="p-4">
              <form onSubmit={onTraslado} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Lote a trasladar</Label>
                  <SearchSelect
                    value={selLote}
                    onValueChange={(v) => {
                      setSelLote(v);
                      const found = lotes.find(l => l.lote.id === v);
                      if (found) {
                        setTotalLatas(Number(found.totalLatas ?? 0));
                      }
                    }}
                    placeholder="Seleccionar lote"
                    searchPlaceholder="Buscar lote, producto…"
                    options={lotes.map(({ lote, cantidad, latas }): SearchSelectOption => {
                      const p = prodById.get(lote.producto_id);
                      return {
                        value: lote.id,
                        label: lote.codigo_lote,
                        description: p?.descripcion,
                        meta: [
                          { label: "Cajas", value: formatNumber(cantidad, 0) },
                          { label: "Latas", value: formatNumber(latas, 0) },
                          lote.fecha_vencimiento ? { label: "FV", value: formatDate(lote.fecha_vencimiento) } : null,
                        ].filter(Boolean) as SearchSelectOption["meta"],
                        searchText: `${p?.descripcion ?? ""} ${p?.codigo ?? ""} ${lote.estado ?? ""}`,
                      };
                    })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Almacén destino</Label>
                    <SearchSelect
                      value={almDest}
                      onValueChange={(v) => { setAlmDest(v); setUbicDest(""); }}
                      placeholder="Almacén"
                      searchPlaceholder="Buscar almacén…"
                      options={almacenes.map((a): SearchSelectOption => ({ value: a.id, label: a.nombre }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ubicación destino</Label>
                    <SearchSelect
                      value={ubicDest}
                      onValueChange={setUbicDest}
                      disabled={!almDest}
                      placeholder="Ubicación"
                      searchPlaceholder="Buscar ubicación…"
                      options={ubicsDest.map((u): SearchSelectOption => ({
                        value: u.id,
                        label: u.codigo,
                        description: u.descripcion ?? undefined,
                        meta: [
                          u.pasillo ? { label: "Pasillo", value: u.pasillo } : null,
                          u.fila ? { label: "Fila", value: u.fila } : null,
                          u.nivel ? { label: "Nivel", value: u.nivel } : null,
                        ].filter(Boolean) as SearchSelectOption["meta"],
                      }))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Cantidad a trasladar (latas totales)</Label>
                  <LatasInput
                    totalLatas={totalLatas}
                    onChange={setTotalLatas}
                    empaque={empaqueVal}
                    max={loteSel ? dispLatas : null}
                    size="lg"
                  />
                  {loteSel && (
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                      <span>Disponible:</span>
                      <LatasDisplay total={dispLatas} empaque={empaqueVal} inline />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Etiqueta</Label>
                  <label className="flex items-center gap-2 h-10 px-3 rounded-md border bg-background cursor-pointer">
                    <Checkbox checked={tieneEtiqueta} onCheckedChange={(v) => setTieneEtiqueta(!!v)} />
                    <span className="text-sm">Tiene etiqueta</span>
                  </label>
                </div>
                <Button type="submit" className="w-full h-11" disabled={saving}>
                  {saving ? "Trasladando…" : "Trasladar"}
                </Button>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
