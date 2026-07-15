import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ArrowDownToLine, Package, Boxes, CalendarDays } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { addYearsISO } from "@/lib/format";
import { toast } from "sonner";
import { HistorialMovimientos } from "@/components/historial-movimientos";
import { decodeCodigo } from "@/lib/codigo-producto";
import { LatasInput, splitLatas } from "@/components/latas-input";
import { TamanoSelect } from "@/components/tamano-select";
import { defaultTamano } from "@/lib/tamano";

export const Route = createFileRoute("/_authenticated/entrada")({
  component: EntradaPage,
});

function EntradaPage() {
  const qc = useQueryClient();
  const [productoId, setProductoId] = useState("");
  const [fp, setFp] = useState("");
  const [fv, setFv] = useState("");
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const [piso, setPiso] = useState<string>("");
  const [estado, setEstado] = useState<string>("EN_PROCESO");
  const [almId, setAlmId] = useState("");
  const [ubicId, setUbicId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [nroGuia, setNroGuia] = useState("");
 const [nroWarrant, setNroWarrant] = useState("");
 const [tieneWarrant, setTieneWarrant] = useState(false);
 const [iniciaWarrant, setIniciaWarrant] = useState("");
 const [venceWarrant, setVenceWarrant] = useState("");
  const [tieneEtiqueta, setTieneEtiqueta] = useState(false);
  const [observaciones, setObservaciones] = useState("");
  const [mercadoId, setMercadoId] = useState<string>("");
  const [tercero, setTercero] = useState("");
  const [empaque24, setEmpaque24] = useState(false);
  const [tamano, setTamano] = useState("");
  const [saving, setSaving] = useState(false);
  const [loteExistente, setLoteExistente] = useState<{ id: string; estado: string } | null>(null);
  const empaqueVal = empaque24 ? 24 : 48;

  useEffect(() => { if (fp) setFv(addYearsISO(fp, 4)); }, [fp]);
  useEffect(() => { if (nroWarrant.trim()) setTieneWarrant(true); }, [nroWarrant]);

  // Detectar lote existente y mostrar su estado
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!productoId || !fp || !fv) { setLoteExistente(null); return; }
      const { data } = await supabase
        .from("lotes").select("id, estado")
        .eq("producto_id", productoId)
        .eq("fecha_produccion", fp)
        .eq("fecha_vencimiento", fv)
        .maybeSingle();
      if (cancel) return;
      if (data) { setLoteExistente({ id: data.id, estado: data.estado as string }); setEstado(data.estado as string); }
      else { setLoteExistente(null); }
    })();
    return () => { cancel = true; };
  }, [productoId, fp, fv]);

  const { data: cat } = useQuery({
    queryKey: ["catalogos-entrada"],
    queryFn: async () => {
      const [p, a, u, c, e, m] = await Promise.all([
        supabase.from("productos").select("*").eq("activo", true).order("codigo_base"),
        supabase.from("almacenes").select("*").eq("activo", true),
        supabase.from("ubicaciones").select("*"),
        supabase.from("clientes_proveedores").select("*").in("tipo", ["PROVEEDOR", "AMBOS"]),
        supabase.from("estados" as any).select("nombre, observacion, orden").order("orden"),
        supabase.from("mercados" as any).select("id, mercado, nivel").order("mercado"),
      ]);
      return {
        productos: p.data ?? [], almacenes: a.data ?? [],
        ubicaciones: u.data ?? [], proveedores: c.data ?? [],
        estados: ((e.data ?? []) as unknown) as Array<{ nombre: string; observacion: string | null; orden: number }>,
        mercados: ((m.data ?? []) as unknown) as Array<{ id: string; mercado: string; nivel: string | null }>,
      };
    },
  });

  const ubicsFiltradas = useMemo(
    () => (cat?.ubicaciones ?? []).filter((u) => u.almacen_id === almId),
    [cat, almId],
  );

  const productoSel = useMemo(
    () => (cat?.productos ?? []).find((p: any) => p.id === productoId) as any,
    [cat, productoId],
  );
  const envaseSel: string = productoSel?.envase ?? "";
  useEffect(() => { setTamano(defaultTamano(envaseSel)); /* eslint-disable-next-line */ }, [envaseSel]);

  const productoOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.productos ?? []).map((p: any) => {
      const dec = decodeCodigo(p.codigo_base ?? "");
      return {
        value: p.id,
        label: p.codigo_base,
        description: p.descripcion ?? dec.descripcion,
        searchText: `${dec.especie ?? ""} ${dec.corte ?? ""} ${dec.liquido ?? ""}`,
        meta: [
          dec.empresaNombre ? { label: "Empresa", value: dec.empresaNombre } : null,
          dec.especie ? { label: "Especie", value: dec.especie } : null,
          dec.corte ? { label: "Presentación", value: dec.corte } : null,
          dec.liquido ? { label: "Líq. gob.", value: dec.liquido } : null,
          p.peso_neto ? { label: "Peso neto", value: `${p.peso_neto} g` } : null,
          p.unidades_por_caja ? { label: "Und/Caja", value: p.unidades_por_caja } : null,
        ].filter(Boolean) as SearchSelectOption["meta"],
      };
    });
  }, [cat]);

  const almacenOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.almacenes ?? []).map((a: any) => ({
      value: a.id,
      label: a.nombre,
      description: a.direccion ?? a.descripcion ?? undefined,
      meta: [
        a.codigo ? { label: "Código", value: a.codigo } : null,
        a.capacidad ? { label: "Capacidad", value: a.capacidad } : null,
      ].filter(Boolean) as SearchSelectOption["meta"],
    }));
  }, [cat]);

  const ubicacionOptions = useMemo<SearchSelectOption[]>(() => {
    return ubicsFiltradas.map((u: any) => ({
      value: u.id,
      label: u.codigo,
      description: u.descripcion ?? u.zona ?? undefined,
      meta: [
        u.pasillo ? { label: "Pasillo", value: u.pasillo } : null,
        u.fila ? { label: "Fila", value: u.fila } : null,
        u.nivel ? { label: "Nivel", value: u.nivel } : null,
        u.capacidad_cajas ? { label: "Cap.", value: `${u.capacidad_cajas} cajas` } : null,
      ].filter(Boolean) as SearchSelectOption["meta"],
    }));
  }, [ubicsFiltradas]);

  const proveedorOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.proveedores ?? []).map((c: any) => ({
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

  const mercadoOptions = useMemo<SearchSelectOption[]>(() => {
    return (cat?.mercados ?? []).map((m: any) => ({
      value: m.id,
      label: m.mercado,
      description: m.datos ?? undefined,
      meta: m.nivel ? [{ label: "Nivel", value: m.nivel }] : undefined,
    }));
  }, [cat]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productoId || !fp || !fv) {
      toast.error("Completa producto y fechas");
      return;
    }
    const totalLatasNum = typeof totalLatas === "number" ? totalLatas : 0;
    if (totalLatasNum < 0) { toast.error("Total de latas inválido"); return; }
    const { cajas: cajasNum, latas: latasResiduo } = splitLatas(totalLatasNum, empaqueVal);
    const hayMovimiento = totalLatasNum > 0;
    if (hayMovimiento && !ubicId) {
      toast.error("Selecciona la ubicación de destino"); return;
    }
    if (tieneWarrant && !nroWarrant.trim()) { toast.error("Indica el N° de warrant"); return; }
    const pisoNum = piso.trim() === "" ? null : parseInt(piso, 10);
    if (pisoNum !== null && (!Number.isFinite(pisoNum) || pisoNum < 1)) {
      toast.error("Piso debe ser un número entero ≥ 1"); return;
    }
    setSaving(true);
    try {
      const mercadoNombre = mercadoId ? (cat?.mercados ?? []).find((m: any) => m.id === mercadoId)?.mercado ?? null : null;
      const { data: loteId, error: loteErr } = await supabase.rpc("upsert_lote" as any, {
        p_producto: productoId, p_fp: fp, p_fv: fv, p_estado: estado || undefined,
        p_mercado: mercadoNombre || undefined,
      } as any);
      if (loteErr) throw loteErr;
      if (hayMovimiento) {
        const { error: movErr } = await supabase.rpc("registrar_movimiento", {
          p_tipo: "ENTRADA", p_lote_id: loteId as any, p_cantidad: cajasNum,
          p_ubic_destino: ubicId, p_cliente_proveedor: proveedorId || undefined,
          p_nro_guia: nroGuia || undefined, p_motivo: "Entrada de almacén",
          p_observaciones: observaciones || undefined,
          p_nro_warrant: tieneWarrant ? nroWarrant : undefined,
          p_inicia_warrant: tieneWarrant && iniciaWarrant ? iniciaWarrant : undefined,
          p_vence_warrant: tieneWarrant && venceWarrant ? venceWarrant : undefined,
          p_latas: latasResiduo,
          p_total_latas: totalLatasNum,
          p_piso: pisoNum ?? undefined,
          p_mercado_id: mercadoId || undefined,
          p_tiene_etiqueta: tieneEtiqueta,
          p_tercero: tercero || undefined,
          p_empaque: empaqueVal,
          p_tamano: tamano || undefined,
        } as any);
        if (movErr) throw movErr;
        toast.success("Entrada registrada");
      } else {
        toast.success("Lote registrado (sin movimiento de latas)");
      }
      setTotalLatas(""); setPiso(""); setNroGuia(""); setNroWarrant(""); setTieneWarrant(false); setIniciaWarrant(""); setVenceWarrant(""); setTieneEtiqueta(false); setObservaciones(""); setMercadoId(""); setTercero(""); setEmpaque24(false); setTamano(defaultTamano(envaseSel));
      qc.invalidateQueries();
    } catch (e: any) {
      console.error("[entrada] error", e);
      toast.error(e?.message || e?.details || e?.hint || "Error al registrar entrada");
    } finally { setSaving(false); }
  };
  const ESTADOS = (cat?.estados ?? []).map((e) => e.nombre);


  return (
    <div className="space-y-4 sm:space-y-6 pb-28 sm:pb-24">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
        <div className="size-10 sm:size-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/30 text-emerald-400 flex items-center justify-center shrink-0">
          <ArrowDownToLine className="size-5 sm:size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight truncate">Registrar Entrada</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Ingreso de mercadería al almacén</p>
        </div>
      </header>

      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-6">
          <Section title="1 · Producto y lote">
            <Field label="Producto *" hint="Búsqueda por código, especie, corte o líquido" full>
              <SearchSelect
                value={productoId}
                onValueChange={setProductoId}
                options={productoOptions}
                placeholder="Seleccionar producto"
                searchPlaceholder="Buscar producto (código, especie, descripción)…"
                emptyText="Sin productos"
              />
            </Field>
            <Field label="Fecha producción *">
              <Input type="date" value={fp} onChange={(e) => setFp(e.target.value)} className="h-11" />
            </Field>
            <Field label="Fecha vencimiento *" hint="FP + 4 años, editable">
              <Input type="date" value={fv} onChange={(e) => setFv(e.target.value)} className="h-11" />
            </Field>
            <Field label="Cantidad (latas totales)" hint="Fuente de verdad · se derivan cajas y residuo" full>
              <LatasInput
                totalLatas={totalLatas}
                onChange={setTotalLatas}
                empaque={empaqueVal}
                size="lg"
                placeholder="Ej. 125"
              />
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
            <Field label="Piso" hint="1 o 2 (nivel del carril)">
              <Select value={piso} onValueChange={setPiso}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Seleccionar piso" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Piso 1</SelectItem>
                  <SelectItem value="2">Piso 2</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estado del lote" hint={loteExistente ? "Lote existente — modificable" : "Opcional · Catálogo Estados"} full>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Seleccionar estado (opcional)" /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((s) => (<SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section title="2 · Destino">
            <Field label="Almacén *">
              <SearchSelect
                value={almId}
                onValueChange={(v) => { setAlmId(v); setUbicId(""); }}
                options={almacenOptions}
                placeholder="Seleccionar almacén"
                searchPlaceholder="Buscar almacén…"
              />
            </Field>
            <Field label="Ubicación *">
              <SearchSelect
                value={ubicId}
                onValueChange={setUbicId}
                options={ubicacionOptions}
                disabled={!almId}
                placeholder={almId ? "Seleccionar ubicación" : "Selecciona primero un almacén"}
                searchPlaceholder="Buscar ubicación (código, pasillo, fila)…"
              />
            </Field>
          </Section>

          <Section title="3 · Documentación">
            <Field label="Proveedor">
              <SearchSelect
                value={proveedorId}
                onValueChange={setProveedorId}
                options={proveedorOptions}
                placeholder="Proveedor (opcional)"
                searchPlaceholder="Buscar proveedor (nombre, RUC, email)…"
                allowClear
              />
            </Field>
            <Field label="N° de guía">
              <Input value={nroGuia} onChange={(e) => setNroGuia(e.target.value)} className="h-11" placeholder="G-12345" />
            </Field>
            <Field label="Mercado" hint="Catálogo Mercados" full>
              <SearchSelect
                value={mercadoId}
                onValueChange={setMercadoId}
                options={mercadoOptions}
                placeholder="Seleccionar mercado (opcional)"
                searchPlaceholder="Buscar mercado (nombre, nivel, datos)…"
                allowClear
              />
            </Field>
          </Section>

          <Section title="4 · Etiqueta y observaciones">
            <Field label="Etiqueta" hint="Formato casilla">
              <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
                <Checkbox checked={tieneEtiqueta} onCheckedChange={(v) => setTieneEtiqueta(!!v)} />
                <span className="text-sm">Tiene etiqueta</span>
              </label>
            </Field>
            <Field label="Tercero" hint="Transportista / corredor / contacto externo">
              <Input value={tercero} onChange={(e) => setTercero(e.target.value)} className="h-11" placeholder="Nombre del tercero" />
            </Field>
            <Field label="Observaciones" full>
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Notas opcionales del ingreso" />
            </Field>
          </Section>


          <Separator />
          <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
            {saving ? "Registrando…" : "Registrar entrada"}
          </Button>
        </form>
      </Card>

      <HistorialMovimientos tipo="ENTRADA" title="Últimas entradas" />

      <EntradaFooter />
    </div>
  );
}

function EntradaFooter() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = useQuery({
    queryKey: ["entrada-footer", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("movimientos")
        .select("cantidad_cajas, latas, fecha")
        .eq("tipo", "ENTRADA")
        .gte("fecha", today);
      return data ?? [];
    },
    refetchInterval: 15000,
  });
  const totCajas = (data ?? []).reduce((s, m: any) => s + Number(m.cantidad_cajas || 0), 0);
  const totLatas = (data ?? []).reduce((s, m: any) => s + (Number(m.cantidad_cajas || 0) * 48) + Number(m.latas || 0), 0);
  const totReg = data?.length ?? 0;
  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-64 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="px-3 sm:px-4 md:px-8 py-2 sm:py-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs overflow-x-auto">
        <span className="hidden sm:inline font-semibold uppercase tracking-wider text-muted-foreground">Hoy:</span>
        <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 whitespace-nowrap">
          <CalendarDays className="size-3" /><span>Registros</span><b className="font-mono">{totReg}</b>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border bg-success/15 text-success border-success/30 px-2 py-0.5 whitespace-nowrap">
          <Boxes className="size-3" /><span>Cajas</span><b className="font-mono">{totCajas.toLocaleString()}</b>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border bg-primary/15 text-primary border-primary/30 px-2 py-0.5 whitespace-nowrap">
          <Package className="size-3" /><span>Latas</span><b className="font-mono">{totLatas.toLocaleString()}</b>
        </span>
        <span className="ml-auto hidden sm:inline text-muted-foreground whitespace-nowrap">Fecha · {new Date().toLocaleDateString()}</span>
      </div>
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
