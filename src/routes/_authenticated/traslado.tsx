import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftRight, Replace } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatDate, addYearsISO } from "@/lib/format";
import { toast } from "sonner";
import { HistorialMovimientos } from "@/components/historial-movimientos";
import { LoteSnapshotPanel } from "@/components/lote-snapshot-panel";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { LatasInput, LatasDisplay, splitLatas } from "@/components/latas-input";

export const Route = createFileRoute("/_authenticated/traslado")({
  component: TrasladoPage,
});

function useCatalogos() {
  return useQuery({
    queryKey: ["catalogos-traslado"],
    queryFn: async () => {
      const [l, s, u, a, w, p, e] = await Promise.all([
        supabase.from("lotes").select("*").order("codigo_lote"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("warrants").select("lote_id, cantidad_cajas_warrant").eq("estado", "ACTIVO"),
        supabase.from("productos").select("*").order("codigo_base"),
        supabase.from("estados").select("*"),
      ]);
      return {
        lotes: l.data ?? [], stock: s.data ?? [], ubicaciones: u.data ?? [],
        almacenes: a.data ?? [], warrants: w.data ?? [], productos: p.data ?? [],
        estados: e.data ?? [],
      };
    },
  });
}

function TrasladoPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-700/30 text-sky-400 flex items-center justify-center">
          <ArrowLeftRight className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Traslado</h1>
          <p className="text-muted-foreground">Mover cajas entre ubicaciones · cambiar código de lote</p>
        </div>
      </header>

      <Tabs defaultValue="traslado">
        <TabsList>
          <TabsTrigger value="traslado"><ArrowLeftRight className="size-4 mr-1.5" />Traslado</TabsTrigger>
          <TabsTrigger value="cambio"><Replace className="size-4 mr-1.5" />Cambio de Lote</TabsTrigger>
        </TabsList>
        <TabsContent value="traslado" className="mt-4 space-y-6">
          <TrasladoForm />
          <HistorialMovimientos tipo="TRASLADO" title="Últimos traslados" />
        </TabsContent>
        <TabsContent value="cambio" className="mt-4 space-y-6">
          <CambioLoteForm />
          <HistorialMovimientos tipo="CAMBIO" title="Últimos cambios de lote" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ TRASLADO ============================ */
function TrasladoForm() {
  const qc = useQueryClient();
  const [loteId, setLoteId] = useState("");
  const [origenId, setOrigenId] = useState("");
  const [almDestId, setAlmDestId] = useState("");
  const [destId, setDestId] = useState("");
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const [tercero, setTercero] = useState("");
  const [tieneEtiqueta, setTieneEtiqueta] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [empaque24, setEmpaque24] = useState(false);
  const [saving, setSaving] = useState(false);
  const empaqueVal = empaque24 ? 24 : 48;

  const { data: cat } = useCatalogos();
  const prodById = useMemo(() => new Map((cat?.productos ?? []).map((p: any) => [p.id, p])), [cat]);
  const ubicById = useMemo(() => new Map((cat?.ubicaciones ?? []).map(u => [u.id, u])), [cat]);
  const almById = useMemo(() => new Map((cat?.almacenes ?? []).map(a => [a.id, a])), [cat]);
  const warrantByLote = useMemo(() => {
    const m = new Map<string, number>();
    (cat?.warrants ?? []).forEach((w) => m.set(w.lote_id, (m.get(w.lote_id) ?? 0) + Number(w.cantidad_cajas_warrant)));
    return m;
  }, [cat]);
  const loteSel = useMemo(() => (cat?.lotes ?? []).find(l => l.id === loteId) ?? null, [cat, loteId]);

  const origenesLote = useMemo(() => {
    if (!loteId) return [];
    return (cat?.stock ?? [])
      .filter(s => s.lote_id === loteId && Number(s.cantidad_cajas) > 0)
      .map(s => {
        const u = ubicById.get(s.ubicacion_id);
        const a = u ? almById.get(u.almacen_id) : null;
        return { ...s, ubicCodigo: u?.codigo, almNombre: a?.nombre };
      });
  }, [loteId, cat, ubicById, almById]);

  const ubicsDestino = useMemo(
    () => (cat?.ubicaciones ?? []).filter(u => u.almacen_id === almDestId && u.id !== origenId),
    [cat, almDestId, origenId],
  );
  const disponible = origenesLote.find(u => u.ubicacion_id === origenId)?.cantidad_cajas ?? 0;

  const stockTotalByLote = useMemo(() => {
    const m = new Map<string, number>();
    (cat?.stock ?? []).forEach((s: any) => m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    return m;
  }, [cat]);

  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.lotes ?? []).map((l: any) => {
      const prod: any = prodById.get(l.producto_id);
      const stk = stockTotalByLote.get(l.id) ?? 0;
      return {
        value: l.id,
        label: l.codigo_lote,
        description: prod ? `${prod.codigo_base} · ${prod.descripcion}` : undefined,
        searchText: `${prod?.codigo_base ?? ""} ${prod?.descripcion ?? ""} ${l.estado ?? ""}`,
        meta: [
          { label: "Stock", value: `${formatNumber(stk)} cajas` },
          l.fecha_vencimiento ? { label: "FV", value: formatDate(l.fecha_vencimiento) } : null,
          l.fecha_produccion ? { label: "FP", value: formatDate(l.fecha_produccion) } : null,
          l.estado ? { label: "Estado", value: l.estado } : null,
        ].filter(Boolean) as SearchSelectOption["meta"],
      };
    });
  }, [cat, prodById, stockTotalByLote]);

  const origenOptions = useMemo<SearchSelectOption[]>(() => origenesLote.map((u: any) => ({
    value: u.ubicacion_id,
    label: `${u.almNombre} · ${u.ubicCodigo}`,
    description: `Disponible: ${formatNumber(u.cantidad_cajas, 3)} cajas`,
    meta: [{ label: "Almacén", value: u.almNombre }, { label: "Ubic.", value: u.ubicCodigo }],
  })), [origenesLote]);

  const almacenOptions = useMemo<SearchSelectOption[]>(() => (cat?.almacenes ?? []).map((a: any) => ({
    value: a.id, label: a.nombre, description: a.direccion ?? undefined,
    meta: [a.codigo ? { label: "Código", value: a.codigo } : null].filter(Boolean) as SearchSelectOption["meta"],
  })), [cat]);

  const destinoOptions = useMemo<SearchSelectOption[]>(() => ubicsDestino.map((u: any) => ({
    value: u.id, label: u.codigo, description: u.descripcion ?? undefined,
    meta: [
      u.pasillo ? { label: "Pasillo", value: u.pasillo } : null,
      u.fila ? { label: "Fila", value: u.fila } : null,
      u.nivel ? { label: "Nivel", value: u.nivel } : null,
    ].filter(Boolean) as SearchSelectOption["meta"],
  })), [ubicsDestino]);

  useEffect(() => { setOrigenId(""); setDestId(""); }, [loteId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteId || !origenId || !destId) { toast.error("Completa lote, origen y destino"); return; }
    if (origenId === destId) { toast.error("Origen y destino no pueden ser iguales"); return; }
    const totalLatasNum = typeof totalLatas === "number" ? totalLatas : 0;
    if (totalLatasNum <= 0) { toast.error("Ingresa el total de latas a trasladar"); return; }
    const { cajas: cajasNum, latas: latasResiduo } = splitLatas(totalLatasNum, empaqueVal);
    setSaving(true);
    try {
      const { error } = await supabase.rpc("registrar_movimiento", {
        p_tipo: "TRASLADO", p_lote_id: loteId, p_cantidad: cajasNum,
        p_ubic_origen: origenId, p_ubic_destino: destId,
        p_motivo: "Traslado entre ubicaciones",
        p_observaciones: observaciones || undefined,
        p_tiene_etiqueta: tieneEtiqueta,
        p_latas: latasResiduo,
        p_total_latas: totalLatasNum,
        p_tercero: tercero || undefined,
        p_empaque: empaqueVal,
      } as any);
      if (error) throw error;
      toast.success("Traslado registrado");
      setTotalLatas(""); setTercero(""); setTieneEtiqueta(false); setObservaciones(""); setEmpaque24(false);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message ?? "Error en traslado"); }
    finally { setSaving(false); }
  };

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="1 · Lote">
          <Field label="Lote *" hint="Búsqueda por código, producto o estado" full>
            <SearchSelect value={loteId} onValueChange={setLoteId} options={loteOptions}
              placeholder="Seleccionar lote" searchPlaceholder="Buscar lote…" />
          </Field>
        </Section>

        {loteSel && <LoteSnapshotPanel lote={loteSel as any} warrantsActivos={warrantByLote.get(loteSel.id) ?? 0} />}

        <Section title="2 · Origen → Destino">
          <Field label="Ubicación origen *" full>
            <SearchSelect value={origenId} onValueChange={setOrigenId} options={origenOptions}
              disabled={!loteId} placeholder="Origen" searchPlaceholder="Buscar ubicación origen…" />
          </Field>
          <Field label="Almacén destino *">
            <SearchSelect value={almDestId} onValueChange={(v) => { setAlmDestId(v); setDestId(""); }}
              options={almacenOptions} placeholder="Almacén destino" searchPlaceholder="Buscar almacén…" />
          </Field>
          <Field label="Ubicación destino *">
            <SearchSelect value={destId} onValueChange={setDestId} options={destinoOptions}
              disabled={!almDestId} placeholder="Ubicación destino" searchPlaceholder="Buscar ubicación destino…" />
          </Field>
        </Section>

        <Section title="3 · Detalle">
          <Field label="Cantidad (latas totales) *" full>
            <LatasInput
              totalLatas={totalLatas}
              onChange={setTotalLatas}
              empaque={empaqueVal}
              max={origenId ? Number((origenesLote.find(u => u.ubicacion_id === origenId) as any)?.total_latas ?? disponible * empaqueVal) : null}
              size="lg"
              placeholder="Ej. 240"
            />
            {origenId && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Disponible en origen:</span>
                <LatasDisplay
                  total={Number((origenesLote.find(u => u.ubicacion_id === origenId) as any)?.total_latas ?? disponible * empaqueVal)}
                  empaque={empaqueVal}
                  inline
                />
              </div>
            )}
          </Field>
          <Field label="Etiqueta" hint="Formato casilla">
            <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={tieneEtiqueta} onCheckedChange={(v) => setTieneEtiqueta(!!v)} />
              <span className="text-sm">Tiene etiqueta</span>
            </label>
          </Field>
          <Field label={`Empaque · ${empaqueVal} u/caja`} hint="Formato casilla · activar para 24, por defecto 48">
            <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
              <Checkbox checked={empaque24} onCheckedChange={(v) => setEmpaque24(!!v)} />
              <span className="text-sm">Empaque ×24 (desmarcar = ×48)</span>
            </label>
          </Field>
          <Field label="Tercero" hint="Transportista / contacto externo">
            <Input value={tercero} onChange={(e) => setTercero(e.target.value)} className="h-11" placeholder="Nombre del tercero" />
          </Field>
          <Field label="Observaciones" full>
            <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Motivo del traslado, instrucciones…" />
          </Field>
        </Section>

        <Separator />
        <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
          {saving ? "Trasladando…" : "Registrar traslado"}
        </Button>
      </form>
    </Card>
  );
}

/* =========================== CAMBIO DE LOTE =========================== */
function CambioLoteForm() {
  const qc = useQueryClient();
  const [loteOrigenId, setLoteOrigenId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const empaqueVal = 48;
  const [productoDest, setProductoDest] = useState("");
  const [fp, setFp] = useState("");
  const [fv, setFv] = useState("");
  const [estado, setEstado] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cat } = useCatalogos();
  const prodById = useMemo(() => new Map((cat?.productos ?? []).map((p: any) => [p.id, p])), [cat]);
  const ubicById = useMemo(() => new Map((cat?.ubicaciones ?? []).map(u => [u.id, u])), [cat]);
  const almById = useMemo(() => new Map((cat?.almacenes ?? []).map(a => [a.id, a])), [cat]);
  const loteOrigen = useMemo(() => (cat?.lotes ?? []).find(l => l.id === loteOrigenId) ?? null, [cat, loteOrigenId]);

  // Sólo lotes con stock
  const stockByLote = useMemo(() => {
    const m = new Map<string, number>();
    (cat?.stock ?? []).forEach((s: any) => m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    return m;
  }, [cat]);

  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.lotes ?? [])
      .filter((l: any) => (stockByLote.get(l.id) ?? 0) > 0)
      .map((l: any) => {
        const prod: any = prodById.get(l.producto_id);
        const stk = stockByLote.get(l.id) ?? 0;
        return {
          value: l.id, label: l.codigo_lote,
          description: prod ? `${prod.codigo_base} · ${prod.descripcion}` : undefined,
          searchText: `${prod?.codigo_base ?? ""} ${prod?.descripcion ?? ""} ${l.estado ?? ""}`,
          meta: [
            { label: "Stock", value: `${formatNumber(stk)} cajas` },
            l.fecha_vencimiento ? { label: "FV", value: formatDate(l.fecha_vencimiento) } : null,
            l.estado ? { label: "Estado", value: l.estado } : null,
          ].filter(Boolean) as SearchSelectOption["meta"],
        };
      });
  }, [cat, prodById, stockByLote]);

  const ubicOptionsOrigen = useMemo<SearchSelectOption[]>(() => {
    if (!loteOrigenId) return [];
    return (cat?.stock ?? [])
      .filter((s: any) => s.lote_id === loteOrigenId && Number(s.cantidad_cajas) > 0)
      .map((s: any) => {
        const u: any = ubicById.get(s.ubicacion_id);
        const a: any = u ? almById.get(u.almacen_id) : null;
        return {
          value: s.ubicacion_id,
          label: `${a?.nombre ?? ""} · ${u?.codigo ?? ""}`,
          description: `Disponible: ${formatNumber(s.cantidad_cajas, 3)} cajas`,
        };
      });
  }, [cat, loteOrigenId, ubicById, almById]);

  const productoOptions = useMemo<SearchSelectOption[]>(() => (cat?.productos ?? []).map((p: any) => ({
    value: p.id, label: p.codigo_base, description: p.descripcion ?? undefined,
  })), [cat]);

  const disponible = useMemo(() => {
    if (!loteOrigenId || !ubicacionId) return 0;
    const s: any = (cat?.stock ?? []).find((x: any) => x.lote_id === loteOrigenId && x.ubicacion_id === ubicacionId);
    return s ? Number(s.cantidad_cajas) : 0;
  }, [cat, loteOrigenId, ubicacionId]);

  // Defaults: copia de origen
  useEffect(() => {
    if (loteOrigen) {
      setProductoDest((p) => p || loteOrigen.producto_id);
      setFp((v) => v || loteOrigen.fecha_produccion);
      setFv((v) => v || loteOrigen.fecha_vencimiento);
      setEstado((v) => v || loteOrigen.estado || "");
    }
  }, [loteOrigen]);

  useEffect(() => { if (fp && !fv) setFv(addYearsISO(fp, 4)); }, [fp, fv]);

  // Preview código destino
  const codigoDestino = useMemo(() => {
    const p: any = prodById.get(productoDest);
    if (!p?.codigo_base || !fp || !fv) return "";
    const fmt = (iso: string) => { const [y,m,d] = iso.split("-"); return `${d} ${m} ${y}`; };
    return `${p.codigo_base} FP:${fmt(fp)} FV:${fmt(fv)}`;
  }, [prodById, productoDest, fp, fv]);

  const sinCambio = useMemo(() => {
    if (!loteOrigen) return false;
    return productoDest === loteOrigen.producto_id && fp === loteOrigen.fecha_produccion && fv === loteOrigen.fecha_vencimiento;
  }, [loteOrigen, productoDest, fp, fv]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteOrigenId || !ubicacionId || !productoDest || !fp || !fv) {
      toast.error("Completa lote, ubicación, producto y fechas"); return;
    }
    if (sinCambio) { toast.error("El lote destino es idéntico al origen. Cambia producto, FP o FV."); return; }
    const totalLatasNum = typeof totalLatas === "number" ? totalLatas : 0;
    if (totalLatasNum <= 0) { toast.error("Ingresa el total de latas"); return; }
    const { cajas: cajasNum, latas: latasResiduo } = splitLatas(totalLatasNum, empaqueVal);
    if (cajasNum > disponible) { toast.error(`Sólo hay ${formatNumber(disponible, 3)} cajas en esa ubicación`); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("cambiar_lote" as any, {
        p_lote_origen: loteOrigenId,
        p_cantidad: cajasNum,
        p_ubicacion: ubicacionId,
        p_latas: latasResiduo,
        p_producto_destino: productoDest,
        p_fp_destino: fp,
        p_fv_destino: fv,
        p_estado_destino: estado || null,
        p_observaciones: observaciones || null,
      } as any);
      if (error) throw error;
      toast.success("Cambio de lote registrado");
      setTotalLatas(""); setObservaciones("");
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message ?? "Error al cambiar lote"); }
    finally { setSaving(false); }
  };

  const ESTADOS = (cat?.estados ?? []).map((e: any) => e.nombre);

  return (
    <Card className="p-6">
      <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        <strong>Cambio de Lote</strong>: descuenta cajas del lote origen e ingresa la misma cantidad en un lote destino con otro código.
        Se generan 2 movimientos tipo <code className="font-mono">CAMBIO</code> enlazados.
      </div>
      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="1 · Lote origen">
          <Field label="Lote origen *" full>
            <SearchSelect value={loteOrigenId} onValueChange={setLoteOrigenId} options={loteOptions}
              placeholder="Seleccionar lote con stock" searchPlaceholder="Buscar lote (código, producto)…" />
          </Field>
          <Field label="Ubicación de origen *" full>
            <SearchSelect value={ubicacionId} onValueChange={setUbicacionId} options={ubicOptionsOrigen}
              disabled={!loteOrigenId} placeholder="Ubicación con stock" searchPlaceholder="Buscar ubicación…" />
          </Field>
          <Field label="Cantidad (latas totales) *" full>
            <LatasInput
              totalLatas={totalLatas}
              onChange={setTotalLatas}
              empaque={empaqueVal}
              max={ubicacionId ? disponible * empaqueVal : null}
              size="lg"
            />
            {ubicacionId && (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Disponible:</span>
                <LatasDisplay total={disponible * empaqueVal} empaque={empaqueVal} inline />
              </div>
            )}
          </Field>
        </Section>

        <Section title="2 · Lote destino (nuevo código)">
          <Field label="Producto destino *" full>
            <SearchSelect value={productoDest} onValueChange={setProductoDest} options={productoOptions}
              placeholder="Producto destino" searchPlaceholder="Buscar producto…" />
          </Field>
          <Field label="Fecha producción *">
            <Input type="date" value={fp} onChange={(e) => setFp(e.target.value)} className="h-11" />
          </Field>
          <Field label="Fecha vencimiento *" hint="FP + 4 años, editable">
            <Input type="date" value={fv} onChange={(e) => setFv(e.target.value)} className="h-11" />
          </Field>
          <Field label="Estado del lote destino" full>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Hereda del origen" /></SelectTrigger>
              <SelectContent>
                {ESTADOS.map((s: string) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {codigoDestino && (
            <div className="md:col-span-2 rounded-md border bg-muted/40 p-3 text-xs">
              <div className="uppercase font-semibold text-muted-foreground mb-1">Vista previa del código destino</div>
              <div className="font-mono">{codigoDestino}</div>
              {sinCambio && <div className="text-destructive mt-1">⚠ El lote destino es idéntico al origen. Cambia producto, FP o FV.</div>}
            </div>
          )}
          <Field label="Observaciones" full>
            <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Motivo del cambio…" />
          </Field>
        </Section>

        <Separator />
        <Button type="submit" className="w-full h-12 text-base" disabled={saving || sinCambio}>
          {saving ? "Registrando…" : "Registrar cambio de lote"}
        </Button>
      </form>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}
function Field({ label, children, hint, full }: { label: string; children: React.ReactNode; hint?: string; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-sm">{label}{hint && <span className="text-xs text-muted-foreground font-normal ml-2">{hint}</span>}</Label>
      {children}
    </div>
  );
}
