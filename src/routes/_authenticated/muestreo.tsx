import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { LatasInput, splitLatas } from "@/components/latas-input";
import { formatNumber, formatDate } from "@/lib/format";
import { exportXLSX } from "@/lib/export";
import { useIsReadOnly } from "@/lib/session-role";
import { toast } from "sonner";
import {
  Beaker,
  Trash2,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Search,
  Replace,
  Boxes,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/muestreo")({
  component: MuestreoPage,
  head: () => ({
    meta: [
      { title: "Muestreo de lotes | Almacén Conservas Casali" },
      {
        name: "description",
        content:
          "Registra muestreos de almacén: lote a trabajar, cantidad, actividad, nuevo lote, merma en cajas y latas, carril y revisión.",
      },
      { property: "og:title", content: "Muestreo de lotes | Almacén Casali" },
      {
        property: "og:description",
        content: "Formato de almacén digital para muestreo, cambio de lote y control de mermas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACTIVIDADES_FALLBACK = [
  "MUESTREO",
  "CAMBIO DE LOTE",
  "REVISIÓN",
  "ETIQUETADO",
  "SELECCIÓN",
  "RE-EMPAQUE",
  "OTRO",
];

type MuestreoRow = {
  id: string;
  fecha: string;
  lote_id: string;
  ubicacion_id: string | null;
  carril: string | null;
  empaque: number;
  total_latas: number;
  actividad: string;
  estado_lote: string | null;
  nuevo_lote_id: string | null;
  merma_cajas: number;
  merma_latas: number;
  merma_total_latas: number;
  revisado: boolean;
  aplicado: boolean;
  observacion: string | null;
  usuario_nombre: string | null;
  created_at: string;
};


function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos-muestreo"],
    queryFn: async () => {
      const [l, s, u, a, p, ac, es] = await Promise.all([
        supabase.from("lotes").select("*").order("codigo_lote"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("ubicaciones").select("*").order("codigo"),
        supabase.from("almacenes").select("*"),
        supabase.from("productos").select("*").order("codigo_base"),
        supabase.from("actividades" as any).select("*").order("orden"),
        supabase.from("estados" as any).select("*").order("orden"),
      ]);
      return {
        lotes: l.data ?? [],
        stock: s.data ?? [],
        ubicaciones: u.data ?? [],
        almacenes: a.data ?? [],
        productos: p.data ?? [],
        actividades: (ac.data ?? []) as any[],
        estados: (es.data ?? []) as any[],
      };
    },
  });
}


function useMuestreos() {
  return useQuery({
    queryKey: ["muestreos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("muestreos" as any)
        .select("*")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as MuestreoRow[];
    },
  });
}

function MuestreoPage() {
  const qc = useQueryClient();
  const readOnly = useIsReadOnly();
  const { data: cat } = useCatalogos();
  const { data: rows, isLoading } = useMuestreos();

  const prodById = useMemo(
    () => new Map((cat?.productos ?? []).map((p: any) => [p.id, p])),
    [cat],
  );
  const loteById = useMemo(
    () => new Map((cat?.lotes ?? []).map((l: any) => [l.id, l])),
    [cat],
  );
  const ubicById = useMemo(
    () => new Map((cat?.ubicaciones ?? []).map((u: any) => [u.id, u])),
    [cat],
  );
  const almById = useMemo(
    () => new Map((cat?.almacenes ?? []).map((a: any) => [a.id, a])),
    [cat],
  );

  const stockByLote = useMemo(() => {
    const m = new Map<string, number>();
    (cat?.stock ?? []).forEach((s: any) =>
      m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.total_latas ?? 0)),
    );
    return m;
  }, [cat]);

  /* ---------------- formulario ---------------- */
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [fecha, setFecha] = useState(hoy);
  const [loteId, setLoteId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [empaque24, setEmpaque24] = useState(false);
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const [actividad, setActividad] = useState("MUESTREO");
  const [estadoLote, setEstadoLote] = useState("");
  const [nuevoLoteId, setNuevoLoteId] = useState("");

  const [mermaCajas, setMermaCajas] = useState<string>("");
  const [mermaLatas, setMermaLatas] = useState<string>("");
  const [revisado, setRevisado] = useState(false);
  const [aplicarInventario, setAplicarInventario] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);

  const emp = empaque24 ? 24 : 48;
  const mermaTotal =
    (Number.parseInt(mermaCajas || "0", 10) || 0) * emp +
    (Number.parseInt(mermaLatas || "0", 10) || 0);

  const actividadOptions = useMemo<string[]>(() => {
    const list = (cat?.actividades ?? [])
      .filter((a: any) => a.activo !== false)
      .map((a: any) => String(a.nombre));
    return list.length ? list : ACTIVIDADES_FALLBACK;
  }, [cat]);

  const estadoOptions = useMemo<string[]>(() => {
    const list = (cat?.estados ?? []).map((s: any) => String(s.nombre));
    return list.length ? list : ["DISPONIBLE", "INMOVILIZADO", "POR_CERTIFICAR", "MERMA"];
  }, [cat]);

  const loteOptions = useMemo<SearchSelectOption[]>(

    () =>
      (cat?.lotes ?? []).map((l: any) => {
        const prod: any = prodById.get(l.producto_id);
        const stk = stockByLote.get(l.id) ?? 0;
        return {
          value: l.id,
          label: l.codigo_lote,
          description: prod ? `${prod.codigo_base} · ${prod.descripcion}` : undefined,
          searchText: `${prod?.codigo_base ?? ""} ${prod?.descripcion ?? ""} ${l.estado ?? ""}`,
          meta: [
            { label: "Stock", value: `${formatNumber(stk, 0)} latas` },
            l.fecha_vencimiento ? { label: "FV", value: formatDate(l.fecha_vencimiento) } : null,
          ].filter(Boolean) as SearchSelectOption["meta"],
        };
      }),
    [cat, prodById, stockByLote],
  );

  const ubicOptions = useMemo<SearchSelectOption[]>(() => {
    const conStock = (cat?.stock ?? []).filter(
      (s: any) => s.lote_id === loteId && Number(s.total_latas ?? 0) > 0,
    );
    const base = loteId && conStock.length
      ? conStock.map((s: any) => s.ubicacion_id)
      : (cat?.ubicaciones ?? []).map((u: any) => u.id);
    return base.map((id: string) => {
      const u: any = ubicById.get(id);
      const a: any = u ? almById.get(u.almacen_id) : null;
      const s: any = (cat?.stock ?? []).find(
        (x: any) => x.lote_id === loteId && x.ubicacion_id === id,
      );
      return {
        value: id,
        label: `${u?.codigo ?? "—"}${u?.carril ? ` · carril ${u.carril}` : ""}`,
        description: [a?.nombre, s ? `Disp: ${formatNumber(Number(s.total_latas ?? 0), 0)} latas` : null]
          .filter(Boolean)
          .join(" · "),
        searchText: `${u?.codigo ?? ""} ${u?.carril ?? ""} ${u?.seccion ?? ""} ${a?.nombre ?? ""}`,
      };
    });
  }, [cat, loteId, ubicById, almById]);

  const disponible = useMemo(() => {
    const s: any = (cat?.stock ?? []).find(
      (x: any) => x.lote_id === loteId && x.ubicacion_id === ubicacionId,
    );
    return s ? Number(s.total_latas ?? 0) : 0;
  }, [cat, loteId, ubicacionId]);

  const resetForm = () => {
    setLoteId("");
    setUbicacionId("");
    setTotalLatas("");
    setNuevoLoteId("");
    setMermaCajas("");
    setMermaLatas("");
    setObservacion("");
    setEstadoLote("");
    setRevisado(false);
    setAplicarInventario(false);
  };


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return toast.error("Modo solo lectura");
    if (!loteId) return toast.error("Selecciona el lote a trabajar");
    const total = typeof totalLatas === "number" ? totalLatas : 0;
    if (total <= 0) return toast.error("Ingresa la cantidad en latas");

    const u: any = ubicacionId ? ubicById.get(ubicacionId) : null;
    setSaving(true);
    try {
      if (aplicarInventario) {
        if (!ubicacionId) throw new Error("Para aplicar en inventario indica la ubicación");
        if (total > disponible)
          throw new Error(`Sólo hay ${formatNumber(disponible, 0)} latas en esa ubicación`);
        if (nuevoLoteId) {
          const dest: any = loteById.get(nuevoLoteId);
          if (!dest) throw new Error("Nuevo lote no encontrado");
          const { cajas, latas } = splitLatas(total - mermaTotal, emp);
          const { error } = await supabase.rpc("cambiar_lote" as any, {
            p_lote_origen: loteId,
            p_cantidad: cajas,
            p_ubicacion: ubicacionId,
            p_latas: latas,
            p_producto_destino: dest.producto_id,
            p_fp_destino: dest.fecha_produccion,
            p_fv_destino: dest.fecha_vencimiento,
            p_estado_destino: dest.estado ?? null,
            p_observaciones: `MUESTREO · ${actividad}${observacion ? ` · ${observacion}` : ""}`,
            p_fecha: fecha,
          } as any);
          if (error) throw error;
        }
        if (mermaTotal > 0) {
          // Merma → lote espejo "M…" en almacén TRANSITO, sección M, carril M
          const { error } = await supabase.rpc("registrar_merma_muestreo" as any, {
            p_lote_id: loteId,
            p_ubic_origen: ubicacionId,
            p_total_latas: mermaTotal,
            p_empaque: emp,
            p_fecha: fecha,
            p_motivo: `MERMA MUESTREO · ${actividad}`,
            p_observacion: observacion || null,
          } as any);
          if (error) throw error;
        }
        if (estadoLote) {
          const origen: any = loteById.get(loteId);
          if (origen && origen.estado !== estadoLote) {
            const { error } = await supabase
              .from("lotes")
              .update({ estado: estadoLote })
              .eq("id", loteId);
            if (error) throw error;
          }
        }
      }

      const { data: au } = await supabase.auth.getUser();
      const { error } = await supabase.from("muestreos" as any).insert({
        fecha,
        lote_id: loteId,
        ubicacion_id: ubicacionId || null,
        carril: u?.carril ?? u?.codigo ?? null,
        empaque: emp,
        total_latas: total,
        actividad,
        estado_lote: estadoLote || null,

        nuevo_lote_id: nuevoLoteId || null,
        merma_cajas: Number.parseInt(mermaCajas || "0", 10) || 0,
        merma_latas: Number.parseInt(mermaLatas || "0", 10) || 0,
        merma_total_latas: mermaTotal,
        revisado,
        aplicado: aplicarInventario,
        observacion: observacion || null,
        usuario_id: au.user?.id ?? null,
        usuario_nombre: au.user?.email ?? null,
      } as any);
      if (error) throw error;

      toast.success(aplicarInventario ? "Muestreo registrado y aplicado" : "Muestreo registrado");
      resetForm();
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message ?? "Error al registrar");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- filtros / tabla ---------------- */
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);

  const enriched = useMemo(() => {
    return (rows ?? []).map((r) => {
      const lote: any = loteById.get(r.lote_id);
      const nuevo: any = r.nuevo_lote_id ? loteById.get(r.nuevo_lote_id) : null;
      const u: any = r.ubicacion_id ? ubicById.get(r.ubicacion_id) : null;
      const prod: any = lote ? prodById.get(lote.producto_id) : null;
      return {
        ...r,
        loteCodigo: lote?.codigo_lote ?? "—",
        nuevoCodigo: nuevo?.codigo_lote ?? "—",
        carrilTxt: r.carril ?? u?.carril ?? u?.codigo ?? "—",
        producto: prod?.descripcion ?? "",
      };
    });
  }, [rows, loteById, ubicById, prodById]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (desde && r.fecha < desde) return false;
      if (hasta && r.fecha > hasta) return false;
      if (soloPendientes && r.revisado) return false;
      if (!needle) return true;
      return `${r.loteCodigo} ${r.nuevoCodigo} ${r.actividad} ${r.carrilTxt} ${r.producto} ${r.observacion ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [enriched, q, desde, hasta, soloPendientes]);

  const totals = useMemo(() => {
    let latas = 0,
      merma = 0,
      rev = 0;
    filtered.forEach((r) => {
      latas += Number(r.total_latas ?? 0);
      merma += Number(r.merma_total_latas ?? 0);
      if (r.revisado) rev++;
    });
    return { latas, merma, rev, n: filtered.length };
  }, [filtered]);

  const toggleRevisado = async (r: MuestreoRow) => {
    if (readOnly) return toast.error("Modo solo lectura");
    const { error } = await supabase
      .from("muestreos" as any)
      .update({ revisado: !r.revisado } as any)
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["muestreos"] });
  };

  const eliminar = async (id: string) => {
    if (readOnly) return toast.error("Modo solo lectura");
    if (!confirm("¿Eliminar este registro de muestreo?")) return;
    const { error } = await supabase.from("muestreos" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro eliminado");
    qc.invalidateQueries({ queryKey: ["muestreos"] });
  };

  const exportar = () =>
    exportXLSX({
      sheetName: "Muestreo",
      filename: `muestreo-${hoy}.xlsx`,
      headers: [
        "FECHA",
        "LOTE A TRABAJAR",
        "PRODUCTO",
        "CANTIDAD (LATAS)",
        "CAJAS",
        "ACTIVIDAD",
        "ESTADO LOTE",

        "NUEVO LOTE",
        "MERMA CAJAS",
        "MERMA LATAS",
        "MERMA TOTAL",
        "CARRIL",
        "REVISADO",
        "OBSERVACIÓN",
      ],
      rows: filtered.map((r) => [
        formatDate(r.fecha),
        r.loteCodigo,
        r.producto,
        Number(r.total_latas ?? 0),
        Math.floor(Number(r.total_latas ?? 0) / Math.max(1, r.empaque || 48)),
        r.actividad,
        r.estado_lote ?? "",

        r.nuevoCodigo,
        Number(r.merma_cajas ?? 0),
        Number(r.merma_latas ?? 0),
        Number(r.merma_total_latas ?? 0),
        r.carrilTxt,
        r.revisado ? "SÍ" : "NO",
        r.observacion ?? "",
      ]),
      summary: [
        { label: "Registros", value: totals.n },
        { label: "Total latas", value: formatNumber(totals.latas, 0) },
        { label: "Merma total (latas)", value: formatNumber(totals.merma, 0) },
        { label: "Revisados", value: `${totals.rev} / ${totals.n}` },
      ],
    });

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="size-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/30 text-violet-400 flex items-center justify-center">
          <Beaker className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Muestreo</h1>
          <p className="text-sm text-muted-foreground">
            Formato de almacén · lote a trabajar, actividad, nuevo lote, merma y carril
          </p>
        </div>
      </header>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Kpi label="Registros" value={formatNumber(totals.n, 0)} />
        <Kpi label="Cantidad (latas)" value={formatNumber(totals.latas, 0)} />
        <Kpi label="Merma (latas)" value={formatNumber(totals.merma, 0)} tone="warn" />
        <Kpi label="Revisados" value={`${totals.rev}/${totals.n}`} tone="ok" />
      </div>

      {/* Formulario rápido */}
      {!readOnly && (
        <Card className="p-4">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Lote a trabajar *</Label>
                <SearchSelect
                  value={loteId}
                  onValueChange={(v) => {
                    setLoteId(v);
                    setUbicacionId("");
                    const l: any = loteById.get(v);
                    setEstadoLote(l?.estado ?? "");
                  }}

                  options={loteOptions}
                  placeholder="Buscar lote…"
                  searchPlaceholder="Código, producto, estado…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Carril / Ubicación</Label>
                <SearchSelect
                  value={ubicacionId}
                  onValueChange={setUbicacionId}
                  options={ubicOptions}
                  placeholder="Ubicación"
                  searchPlaceholder="Buscar carril o código…"
                  allowClear
                />
              </div>
              <div className="space-y-1.5">
                <Label>Actividad *</Label>
                <Select value={actividad} onValueChange={setActividad}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actividadOptions.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Catálogo editable en Gestión → Catálogos → Actividad
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Estado del lote</Label>
                <Select value={estadoLote} onValueChange={setEstadoLote}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Sin cambio" />
                  </SelectTrigger>
                  <SelectContent>
                    {estadoOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <Replace className="size-3.5" /> Nuevo lote (opcional)
                </Label>
                <SearchSelect
                  value={nuevoLoteId}
                  onValueChange={setNuevoLoteId}
                  options={loteOptions}
                  placeholder="Sin cambio de lote"
                  searchPlaceholder="Buscar lote destino…"
                  allowClear
                />
              </div>

            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">
                <Boxes className="size-3.5" /> Cantidad (latas totales) *
              </Label>
              <LatasInput
                totalLatas={totalLatas}
                onChange={setTotalLatas}
                empaque={emp}
                max={ubicacionId ? disponible : null}
                size="lg"
                placeholder="Ej. 480"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Merma · cajas</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={mermaCajas}
                  onChange={(e) => setMermaCajas(e.target.value.replace(/[^\d]/g, ""))}
                  className="h-11 text-center tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Merma · latas</Label>
                <Input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={mermaLatas}
                  onChange={(e) => setMermaLatas(e.target.value.replace(/[^\d]/g, ""))}
                  className="h-11 text-center tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Merma total</Label>
                <div className="h-11 px-3 rounded-md border bg-muted/40 flex items-center font-bold tabular-nums">
                  {formatNumber(mermaTotal, 0)}{" "}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">latas</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Empaque · {emp} u/caja</Label>
                <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
                  <Checkbox checked={empaque24} onCheckedChange={(v) => setEmpaque24(!!v)} />
                  <span className="text-sm">×24 (si no, ×48)</span>
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <span className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" /> Revisado
                </span>
                <Switch checked={revisado} onCheckedChange={setRevisado} />
              </label>
              <label className="flex items-center justify-between gap-3 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <span className="text-sm font-medium">Aplicar en inventario</span>
                <Switch checked={aplicarInventario} onCheckedChange={setAplicarInventario} />
              </label>
            </div>
            {aplicarInventario && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <p>Se ejecutará el cambio de lote (si indicas nuevo lote) y el estado del lote.</p>
                {mermaTotal > 0 && mermaLoteCodigo && (
                  <p>
                    Merma de <strong>{formatNumber(mermaTotal, 0)} latas</strong> → almacén{" "}
                    <strong>TRANSITO</strong> · sección <strong>M</strong> · carril{" "}
                    <strong>M</strong>, como lote <strong>{mermaLoteCodigo}</strong>.
                  </p>
                )}
              </div>
            )}


            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              rows={2}
              placeholder="Observación…"
            />

            <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
              <Plus className="size-4 mr-1.5" />
              {saving ? "Guardando…" : "Registrar muestreo"}
            </Button>
          </form>
        </Card>
      )}

      {/* Filtros */}
      <Card className="p-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar lote, actividad, carril…"
              className="h-10 pl-8"
            />
          </div>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10" />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 h-10 px-3 rounded-md border bg-background cursor-pointer flex-1">
              <Checkbox
                checked={soloPendientes}
                onCheckedChange={(v) => setSoloPendientes(!!v)}
              />
              <span className="text-sm">Sin revisar</span>
            </label>
            <Button type="button" variant="outline" className="h-10" onClick={exportar}>
              <FileSpreadsheet className="size-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Móvil: tarjetas */}
        <div className="grid gap-2 md:hidden">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin registros</p>
          )}
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{formatDate(r.fecha)}</div>
                  <div className="font-semibold text-sm truncate">{r.loteCodigo}</div>
                  {r.nuevoCodigo !== "—" && (
                    <div className="text-xs text-sky-500 truncate">→ {r.nuevoCodigo}</div>
                  )}
                </div>
                <Badge variant="outline">{r.actividad}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <Mini label="Latas" value={formatNumber(r.total_latas, 0)} />
                <Mini
                  label="Merma"
                  value={`${formatNumber(r.merma_cajas, 0)}c + ${r.merma_latas}l`}
                />
                <Mini label="Carril" value={r.carrilTxt} />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={r.revisado} onCheckedChange={() => toggleRevisado(r)} />
                  Revisado
                </label>
                <Button size="sm" variant="ghost" onClick={() => eliminar(r.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Escritorio: tabla */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Lote a trabajar</th>
                <th className="py-2 pr-3 text-right">Cantidad</th>
                <th className="py-2 pr-3">Actividad</th>
                <th className="py-2 pr-3">Nuevo lote</th>
                <th className="py-2 pr-3 text-right">Merma</th>
                <th className="py-2 pr-3">Carril</th>
                <th className="py-2 pr-3 text-center">Revisado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b hover:bg-muted/40">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.fecha)}</td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{r.loteCodigo}</div>
                    {r.producto && (
                      <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {r.producto}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatNumber(r.total_latas, 0)}
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(Math.floor(r.total_latas / Math.max(1, r.empaque || 48)), 0)} cajas
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline">{r.actividad}</Badge>
                    {r.aplicado && (
                      <Badge variant="secondary" className="ml-1 text-[10px]">
                        aplicado
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">{r.nuevoCodigo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatNumber(r.merma_total_latas, 0)}
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(r.merma_cajas, 0)}c + {r.merma_latas}l
                    </div>
                  </td>
                  <td className="py-2 pr-3">{r.carrilTxt}</td>
                  <td className="py-2 pr-3 text-center">
                    <Switch checked={r.revisado} onCheckedChange={() => toggleRevisado(r)} />
                  </td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => eliminar(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted-foreground">
                    Sin registros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={
          "text-xl font-bold tabular-nums " +
          (tone === "warn" ? "text-amber-500" : tone === "ok" ? "text-emerald-500" : "")
        }
      >
        {value}
      </div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}
