import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
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
import { ArrowUpFromLine } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { HistorialMovimientos } from "@/components/historial-movimientos";
import { LoteSnapshotPanel } from "@/components/lote-snapshot-panel";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { decodeCodigo } from "@/lib/codigo-producto";
import { LatasInput, LatasDisplay, splitLatas } from "@/components/latas-input";
import { TamanoSelect } from "@/components/tamano-select";
import { defaultTamano } from "@/lib/tamano";

export const Route = createFileRoute("/_authenticated/salida")({
  component: SalidaPage,
});

function SalidaPage() {
  const qc = useQueryClient();
  const [productoId, setProductoId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [ubicId, setUbicId] = useState("");
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const [clienteId, setClienteId] = useState("");
  const [nroGuia, setNroGuia] = useState("");
  const [nroVale, setNroVale] = useState("");
  const [nroWarrant, setNroWarrant] = useState("");
  const [tieneWarrant, setTieneWarrant] = useState(false);
  const [tieneEtiqueta, setTieneEtiqueta] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [tercero, setTercero] = useState("");
  // total_latas es la fuente de verdad; latas y cajas se derivan
  const [soloCertificados, setSoloCertificados] = useState(false);
  const [empaque24, setEmpaque24] = useState(false); // false = 48, true = 24
  const [donacion, setDonacion] = useState(false);
  const [autorizado, setAutorizado] = useState<string>("");
  const [autorizadoOtro, setAutorizadoOtro] = useState<string>("");
  const [tamano, setTamano] = useState("");
  const [estadoLote, setEstadoLote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const limaToday = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" })).toISOString().slice(0, 10);
  const [fecha, setFecha] = useState<string>(limaToday());
  const empaqueVal = empaque24 ? 24 : 48;
  const AUTORIZADORES = ["Ricardo Carrillo", "Fiorella Llauce", "Jordan Verde", "Otros"];

  const { data: cat } = useQuery({
    queryKey: ["catalogos-salida"],
    queryFn: async () => {
      const [p, l, s, u, a, c, w, e] = await Promise.all([
        supabase.from("productos").select("*").eq("activo", true).order("codigo_base"),
        supabase.from("lotes").select("*").order("fecha_vencimiento"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("clientes_proveedores").select("*").in("tipo", ["CLIENTE", "AMBOS"]),
        supabase.from("warrants").select("lote_id, cantidad_cajas_warrant").eq("estado", "ACTIVO"),
        supabase.from("estados" as any).select("nombre, orden").order("orden"),
      ]);
      return {
        productos: p.data ?? [], lotes: l.data ?? [], stock: s.data ?? [],
        ubicaciones: u.data ?? [], almacenes: a.data ?? [], clientes: c.data ?? [],
        warrants: w.data ?? [],
        estados: ((e.data ?? []) as unknown) as Array<{ nombre: string; orden: number }>,
      };
    },
  });

  const ubicById = useMemo(() => new Map((cat?.ubicaciones ?? []).map(u => [u.id, u])), [cat]);
  const almById = useMemo(() => new Map((cat?.almacenes ?? []).map(a => [a.id, a])), [cat]);
  const warrantByLote = useMemo(() => {
    const m = new Map<string, number>();
    (cat?.warrants ?? []).forEach((w) => m.set(w.lote_id, (m.get(w.lote_id) ?? 0) + Number(w.cantidad_cajas_warrant)));
    return m;
  }, [cat]);

  const lotesProducto = useMemo(() => {
    if (!productoId) return [];
    const stockPorLote = new Map<string, number>();
    (cat?.stock ?? []).forEach(s => stockPorLote.set(s.lote_id, (stockPorLote.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    return (cat?.lotes ?? [])
      .filter(l => l.producto_id === productoId && (stockPorLote.get(l.id) ?? 0) > 0)
      .filter(l => !soloCertificados || l.estado === "CERTIFICADO")
      .map(l => ({ ...l, stockTotal: stockPorLote.get(l.id) ?? 0 }))
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));
  }, [productoId, cat, soloCertificados]);

  useEffect(() => {
    if (lotesProducto.length > 0 && !lotesProducto.find(l => l.id === loteId)) {
      setLoteId(lotesProducto[0].id);
      setUbicId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const loteSel = useMemo(() => lotesProducto.find(l => l.id === loteId) ?? null, [lotesProducto, loteId]);
  const warrantsActivos = loteSel ? (warrantByLote.get(loteSel.id) ?? 0) : 0;

  useEffect(() => { if (nroWarrant.trim()) setTieneWarrant(true); }, [nroWarrant]);
  useEffect(() => { setTieneWarrant(warrantsActivos > 0); }, [warrantsActivos]);
  useEffect(() => { setEstadoLote((loteSel?.estado as string) ?? ""); }, [loteSel]);

  const productoSel = useMemo(() => (cat?.productos ?? []).find((p: any) => p.id === productoId) as any, [cat, productoId]);
  const envaseSel: string = productoSel?.envase ?? "";
  useEffect(() => { setTamano(defaultTamano(envaseSel)); /* eslint-disable-next-line */ }, [envaseSel]);

  const ubicacionesLote = useMemo(() => {
    if (!loteId) return [];
    return (cat?.stock ?? [])
      .filter(s => s.lote_id === loteId && Number(s.cantidad_cajas) > 0)
      .map(s => {
        const u = ubicById.get(s.ubicacion_id);
        const a = u ? almById.get(u.almacen_id) : null;
        return { ...s, ubicCodigo: u?.codigo, almNombre: a?.nombre };
      });
  }, [loteId, cat, ubicById, almById]);

  const disponibleUbic = ubicacionesLote.find(u => u.ubicacion_id === ubicId)?.cantidad_cajas ?? 0;

  const productoOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.productos ?? []).map((p: any) => {
      const dec = decodeCodigo(p.codigo_base ?? "");
      return {
        value: p.id,
        label: p.codigo_base,
        description: p.descripcion ?? dec.descripcion,
        searchText: `${dec.especie ?? ""} ${dec.corte ?? ""} ${dec.liquido ?? ""}`,
        meta: [
          dec.especie ? { label: "Especie", value: dec.especie } : null,
          dec.corte ? { label: "Presentación", value: dec.corte } : null,
          dec.liquido ? { label: "Líq. gob.", value: dec.liquido } : null,
          p.peso_neto ? { label: "Peso", value: `${p.peso_neto} g` } : null,
          p.unidades_por_caja ? { label: "Und/Caja", value: p.unidades_por_caja } : null,
        ].filter(Boolean) as SearchSelectOption["meta"],
      };
    });
  }, [cat]);

  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    return lotesProducto.map((l: any, idx: number) => ({
      value: l.id,
      label: l.codigo_lote,
      badge: (
        <span className="flex items-center gap-1">
          {idx === 0 && <span className="text-amber-500 font-bold">★ FEFO</span>}
          {l.estado === "CERTIFICADO" && <span className="text-emerald-500 text-xs">✓ CERT</span>}
        </span>
      ),
      description: `FV ${formatDate(l.fecha_vencimiento)} · FP ${formatDate(l.fecha_produccion)}`,
      meta: [
        { label: "Stock", value: `${formatNumber(l.stockTotal)} cajas` },
        l.estado ? { label: "Estado", value: l.estado } : null,
      ].filter(Boolean) as SearchSelectOption["meta"],
    }));
  }, [lotesProducto]);

  const ubicacionOptions = useMemo<SearchSelectOption[]>(() => {
    return ubicacionesLote.map((u: any) => ({
      value: u.ubicacion_id,
      label: `${u.almNombre} · ${u.ubicCodigo}`,
      description: `Disponible: ${formatNumber(u.cantidad_cajas, 3)} cajas`,
      meta: [{ label: "Almacén", value: u.almNombre }, { label: "Ubic.", value: u.ubicCodigo }],
    }));
  }, [ubicacionesLote]);

  const clienteOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.clientes ?? []).map((c: any) => ({
      value: c.id,
      label: c.nombre,
      description: c.razon_social ?? undefined,
      meta: [
        c.ruc ? { label: "RUC", value: c.ruc } : null,
        c.telefono ? { label: "Tel", value: c.telefono } : null,
        c.email ? { label: "Email", value: c.email } : null,
        c.tipo ? { label: "Tipo", value: c.tipo } : null,
      ].filter(Boolean) as SearchSelectOption["meta"],
    }));
  }, [cat]);

  const totalLatasRegistro = useMemo(() => {
    return typeof totalLatas === "number" ? totalLatas : 0;
  }, [totalLatas]);


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteId || !ubicId) { toast.error("Completa los campos requeridos"); return; }
    const totalLatasNum = typeof totalLatas === "number" ? totalLatas : 0;
    if (totalLatasNum <= 0) { toast.error("Ingresa el total de latas a sacar"); return; }
    const { cajas, latas: latasResiduo } = splitLatas(totalLatasNum, empaqueVal);
    const autorizadoFinal = autorizado === "Otros" ? autorizadoOtro.trim() : autorizado;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("registrar_movimiento", {
        p_tipo: "SALIDA", p_lote_id: loteId, p_cantidad: cajas, p_ubic_origen: ubicId,
        p_cliente_proveedor: clienteId || undefined,
        p_nro_guia: nroGuia || undefined, p_nro_vale: nroVale || undefined,
        p_motivo: "Salida de venta",
        p_fecha: fecha || limaToday(),
        p_observaciones: observaciones || undefined,
        p_nro_warrant: tieneWarrant && nroWarrant ? nroWarrant : undefined,
        p_tiene_etiqueta: tieneEtiqueta,
        p_latas: latasResiduo,
        p_total_latas: totalLatasNum,
        p_tercero: tercero || undefined,
        p_empaque: empaqueVal,
        p_donacion: donacion,
        p_autorizado: autorizadoFinal || undefined,
        p_tamano: tamano || undefined,
        p_estado_lote: estadoLote || undefined,
      } as any);
      if (error) throw error;
      toast.success("Salida registrada");
      setTotalLatas(""); setNroGuia(""); setNroVale(""); setNroWarrant(""); setTieneEtiqueta(false); setObservaciones(""); setTercero(""); setFecha(limaToday());
      setEmpaque24(false); setDonacion(false); setAutorizado(""); setAutorizadoOtro(""); setTamano(defaultTamano(envaseSel));
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Error al registrar salida");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-700/30 text-orange-400 flex items-center justify-center">
          <ArrowUpFromLine className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Registrar Salida</h1>
          <p className="text-muted-foreground">Despacho de mercadería · sugerencia FEFO · todos los lotes con stock disponibles</p>
        </div>
      </header>

      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="1 · Selección de lote">
            <Field label="Producto *" hint="Búsqueda rápida" full>
              <SearchSelect
                value={productoId}
                onValueChange={(v) => { setProductoId(v); setLoteId(""); setUbicId(""); }}
                options={productoOptions}
                placeholder="Buscar producto"
                searchPlaceholder="Buscar producto (código, especie, descripción)…"
              />
            </Field>
            <Field label="Filtro de lotes" hint="Opcional" full>
              <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer w-fit">
                <Checkbox checked={soloCertificados} onCheckedChange={(v) => { setSoloCertificados(!!v); setLoteId(""); setUbicId(""); }} />
                <span className="text-sm">Mostrar solo lotes <strong>CERTIFICADOS</strong></span>
              </label>
            </Field>
            <Field label="Lote (FEFO sugerido)" hint="Opcional · seleccione si requiere especificar lote" full>
              <SearchSelect
                value={loteId}
                onValueChange={(v) => { setLoteId(v); setUbicId(""); }}
                options={loteOptions}
                disabled={!productoId}
                placeholder={productoId ? "Seleccionar lote" : "Selecciona primero un producto"}
                searchPlaceholder="Buscar lote (código, fecha vencimiento)…"
                emptyText={soloCertificados ? "Sin stock certificado" : "Sin stock disponible"}
              />
            </Field>
          </Section>

          {loteSel && (
            <LoteSnapshotPanel lote={loteSel as any} warrantsActivos={warrantsActivos} />
          )}

          <Section title="2 · Ubicación y cantidad">
            <Field label="Ubicación origen *" full>
              <SearchSelect
                value={ubicId}
                onValueChange={setUbicId}
                options={ubicacionOptions}
                disabled={!loteId}
                placeholder="Ubicación de origen"
                searchPlaceholder="Buscar ubicación (almacén, código)…"
              />
            </Field>
            <Field label="Cantidad a sacar (latas totales)" hint="Se derivan cajas y residuo automáticamente" full>
              <LatasInput
                totalLatas={totalLatas}
                onChange={setTotalLatas}
                empaque={empaqueVal}
                max={ubicId ? Number((ubicacionesLote.find(u => u.ubicacion_id === ubicId) as any)?.total_latas ?? disponibleUbic * empaqueVal) : null}
                size="lg"
                placeholder="Ej. 125"
              />
              {ubicId && (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Disponible en ubicación:</span>
                  <LatasDisplay
                    total={Number((ubicacionesLote.find(u => u.ubicacion_id === ubicId) as any)?.total_latas ?? disponibleUbic * empaqueVal)}
                    empaque={empaqueVal}
                    inline
                  />
                </div>
              )}
            </Field>
            <Field label={`Empaque · ${empaqueVal} u/caja`} hint="Formato casilla · activar para 24, por defecto 48">
              <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <Checkbox checked={empaque24} onCheckedChange={(v) => setEmpaque24(!!v)} />
                <span className="text-sm">Empaque ×24 (desmarcar = ×48)</span>
              </label>
            </Field>
            <Field label="Tamaño" hint={envaseSel ? `Envase: ${envaseSel}` : "Definido por el envase del producto"}>
              <TamanoSelect envase={envaseSel} value={tamano} onChange={setTamano} />
            </Field>
            <Field label="Cliente">
              <SearchSelect
                value={clienteId}
                onValueChange={setClienteId}
                options={clienteOptions}
                placeholder="Cliente (opcional)"
                searchPlaceholder="Buscar cliente (nombre, RUC, email)…"
                allowClear
              />
            </Field>
            <Field label="Tercero" hint="Transportista / contacto externo">
              <Input value={tercero} onChange={(e) => setTercero(e.target.value)} className="h-11" placeholder="Nombre del tercero" />
            </Field>
          </Section>

          <Section title="3 · Documentación">
            <Field label="Fecha del movimiento *" hint="Zona horaria Lima, Perú">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11" />
            </Field>
            <Field label="N° de guía">
              <Input value={nroGuia} onChange={(e) => setNroGuia(e.target.value)} className="h-11" />
            </Field>
            <Field label="N° de vale">
              <Input value={nroVale} onChange={(e) => setNroVale(e.target.value)} className="h-11" />
            </Field>
            <Field label="Etiqueta" hint="Formato casilla">
              <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <Checkbox checked={tieneEtiqueta} onCheckedChange={(v) => setTieneEtiqueta(!!v)} />
                <span className="text-sm">Tiene etiqueta</span>
              </label>
            </Field>
            <Field label="Warrant" hint="Marca si la salida está comprometida">
              <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <Checkbox checked={tieneWarrant} onCheckedChange={(v) => setTieneWarrant(!!v)} />
                <span className="text-sm">Con warrant</span>
              </label>
            </Field>
            <Field label="N° de warrant">
              <Input value={nroWarrant} onChange={(e) => setNroWarrant(e.target.value)} className="h-11" placeholder="W-001" disabled={!tieneWarrant} />
            </Field>
            <Field label="Donación" hint="Formato casilla · Sí/No">
              <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <Checkbox checked={donacion} onCheckedChange={(v) => setDonacion(!!v)} />
                <span className="text-sm">{donacion ? "Sí · es donación" : "No"}</span>
              </label>
            </Field>
            <Field label="Autorizado por" hint="Selecciona o escribe (Otros)">
              <Select value={autorizado} onValueChange={setAutorizado}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Seleccionar autorizador" /></SelectTrigger>
                <SelectContent>
                  {AUTORIZADORES.map((n) => (<SelectItem key={n} value={n}>{n}</SelectItem>))}
                </SelectContent>
              </Select>
              {autorizado === "Otros" && (
                <Input value={autorizadoOtro} onChange={(e) => setAutorizadoOtro(e.target.value)} className="h-11 mt-2" placeholder="Nombre del autorizador" />
              )}
            </Field>
            <Field label="Observaciones" full>
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Notas del despacho" />
            </Field>
          </Section>

          <Separator />
          <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
            {saving ? "Registrando…" : "Registrar salida"}
          </Button>
        </form>
      </Card>

      <HistorialMovimientos tipo="SALIDA" title="Últimas salidas" />
    </div>
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
