import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { LatasInput, LatasDisplay, splitLatas } from "@/components/latas-input";

export const Route = createFileRoute("/_authenticated/mermas")({
  component: MermasPage,
});

const MOTIVOS = [
  "ABOLLADAS",
  "OXIDADAS",
  "DIFERENCIA DE INVENTARIO",
  "ETIQUETADO DAÑADO",
  "OTRO",
] as const;

const TIPOS = [
  { value: "MERMA", label: "Merma" },
  { value: "AJUSTE_NEGATIVO", label: "Ajuste negativo" },
  { value: "AJUSTE_POSITIVO", label: "Ajuste positivo" },
] as const;

function MermasPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Mermas y Ajustes</h1>
        <p className="text-muted-foreground">Registro y reporte mensual</p>
      </header>
      <Tabs defaultValue="registrar">
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="reporte">Reporte mensual</TabsTrigger>
        </TabsList>
        <TabsContent value="registrar" className="mt-4"><RegistrarForm /></TabsContent>
        <TabsContent value="historial" className="mt-4"><Historial /></TabsContent>
        <TabsContent value="reporte" className="mt-4"><Reporte /></TabsContent>
      </Tabs>
    </div>
  );
}

function RegistrarForm() {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<string>("MERMA");
  const [loteId, setLoteId] = useState("");
  const [ubicId, setUbicId] = useState("");
  const [totalLatas, setTotalLatas] = useState<number | "">("");
  const [motivo, setMotivo] = useState<string>("");
  const [tieneEtiqueta, setTieneEtiqueta] = useState(false);
  const [tercero, setTercero] = useState("");
  const [detalle, setDetalle] = useState("");
  const [empaque24, setEmpaque24] = useState(false);
  const [saving, setSaving] = useState(false);
  const empaqueVal = empaque24 ? 24 : 48;

  const { data } = useQuery({
    queryKey: ["mermas-cat"],
    queryFn: async () => {
      const [l, s, u, a, p] = await Promise.all([
        supabase.from("lotes").select("*").order("codigo_lote"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("productos").select("*"),
      ]);
      return { lotes: l.data ?? [], stock: s.data ?? [], ubicaciones: u.data ?? [], almacenes: a.data ?? [], productos: p.data ?? [] };
    },
  });

  const prodById = useMemo(() => new Map((data?.productos ?? []).map((p: any) => [p.id, p])), [data]);

  const ubicById = useMemo(() => new Map((data?.ubicaciones ?? []).map(u => [u.id, u])), [data]);
  const almById = useMemo(() => new Map((data?.almacenes ?? []).map(a => [a.id, a])), [data]);

  const requiereUbicacion = tipo !== "AJUSTE_POSITIVO";
  const opcionesUbic = useMemo(() => {
    if (!loteId) return [];
    if (tipo === "AJUSTE_POSITIVO") return data?.ubicaciones ?? [];
    return (data?.stock ?? [])
      .filter(s => s.lote_id === loteId && Number(s.cantidad_cajas) > 0)
      .map(s => {
        const u = ubicById.get(s.ubicacion_id);
        const a = u ? almById.get(u.almacen_id) : null;
        return { ...u, cantidad: Number(s.cantidad_cajas), almNombre: a?.nombre };
      });
  }, [loteId, tipo, data, ubicById, almById]);

  const disponible = useMemo(() => {
    if (tipo === "AJUSTE_POSITIVO") return null;
    const opt = opcionesUbic.find((o: any) => o.id === ubicId);
    return opt ? (opt as any).cantidad : 0;
  }, [opcionesUbic, ubicId, tipo]);

  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    return (data?.lotes ?? []).map((l: any) => {
      const prod: any = prodById.get(l.producto_id);
      return {
        value: l.id,
        label: l.codigo_lote,
        description: prod ? `${prod.codigo_base} · ${prod.descripcion}` : undefined,
        searchText: `${prod?.codigo_base ?? ""} ${prod?.descripcion ?? ""}`,
        meta: [
          l.fecha_vencimiento ? { label: "FV", value: formatDate(l.fecha_vencimiento) } : null,
          l.estado ? { label: "Estado", value: l.estado } : null,
        ].filter(Boolean) as SearchSelectOption["meta"],
      };
    });
  }, [data, prodById]);

  const ubicOptions = useMemo<SearchSelectOption[]>(() => {
    return opcionesUbic.map((u: any) => ({
      value: u.id,
      label: u.codigo,
      description: u.almNombre ?? undefined,
      meta: [
        u.cantidad !== undefined ? { label: "Stock", value: `${formatNumber(u.cantidad)} cj` } : null,
        u.pasillo ? { label: "Pasillo", value: u.pasillo } : null,
        u.fila ? { label: "Fila", value: u.fila } : null,
      ].filter(Boolean) as SearchSelectOption["meta"],
    }));
  }, [opcionesUbic]);


  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteId || !ubicId || !motivo) { toast.error("Completa lote, ubicación y motivo"); return; }
    const totalLatasNum = typeof totalLatas === "number" ? totalLatas : 0;
    if (totalLatasNum <= 0) { toast.error("Ingresa el total de latas"); return; }
    const { cajas: cajasNum, latas: latasResiduo } = splitLatas(totalLatasNum, empaqueVal);
    setSaving(true);
    try {
      const motivoFull = `${motivo}${detalle ? " · " + detalle : ""}`;
      const params: any = {
        p_tipo: tipo, p_lote_id: loteId, p_cantidad: cajasNum, p_motivo: motivoFull,
        p_tiene_etiqueta: tieneEtiqueta,
        p_latas: latasResiduo,
        p_total_latas: totalLatasNum,
        p_tercero: tercero || undefined,
        p_empaque: empaqueVal,
      };
      if (tipo === "AJUSTE_POSITIVO") params.p_ubic_destino = ubicId;
      else params.p_ubic_origen = ubicId;
      const { error } = await supabase.rpc("registrar_movimiento", params);
      if (error) throw error;
      toast.success("Movimiento registrado");
      setTotalLatas(""); setDetalle(""); setMotivo(""); setTieneEtiqueta(false); setUbicId(""); setTercero(""); setEmpaque24(false);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Error al registrar");
    } finally { setSaving(false); }
  };

  return (
    <Card className="p-6 max-w-3xl">
      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <Label>Tipo de movimiento *</Label>
          <Select value={tipo} onValueChange={(v) => { setTipo(v); setUbicId(""); }}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Motivo *</Label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
            <SelectContent>
              {MOTIVOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label>Lote * <span className="text-xs text-muted-foreground font-normal ml-2">Búsqueda por código o producto</span></Label>
          <SearchSelect
            value={loteId}
            onValueChange={(v) => { setLoteId(v); setUbicId(""); }}
            options={loteOptions}
            placeholder="Seleccionar lote"
            searchPlaceholder="Buscar lote (código, producto, estado)…"
          />
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label>{requiereUbicacion ? "Ubicación origen *" : "Ubicación destino *"}</Label>
          <SearchSelect
            value={ubicId}
            onValueChange={setUbicId}
            options={ubicOptions}
            disabled={!loteId}
            placeholder="Ubicación"
            searchPlaceholder="Buscar ubicación…"
          />
          {disponible !== null && ubicId && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Disponible:</span>
              <LatasDisplay total={Number(disponible) * empaqueVal} empaque={empaqueVal} inline />
            </div>
          )}
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Cantidad (latas totales) *</Label>
          <LatasInput
            totalLatas={totalLatas}
            onChange={setTotalLatas}
            empaque={empaqueVal}
            max={disponible !== null && ubicId ? Number(disponible) * empaqueVal : null}
            size="lg"
          />
        </div>
        <div className="space-y-2">
          <Label>Etiqueta <span className="text-xs text-muted-foreground font-normal ml-2">Formato casilla</span></Label>
          <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
            <Checkbox checked={tieneEtiqueta} onCheckedChange={(v) => setTieneEtiqueta(!!v)} />
            <span className="text-sm">Tiene etiqueta</span>
          </label>
        </div>
        <div className="space-y-2">
          <Label>Empaque · {empaqueVal} u/caja <span className="text-xs text-muted-foreground font-normal ml-2">Casilla · ×24, por defecto ×48</span></Label>
          <label className="flex items-center gap-2 h-11 px-3 rounded-md border bg-background cursor-pointer">
            <Checkbox checked={empaque24} onCheckedChange={(v) => setEmpaque24(!!v)} />
            <span className="text-sm">Empaque ×24 (desmarcar = ×48)</span>
          </label>
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label>Tercero <span className="text-xs text-muted-foreground font-normal ml-2">Transportista / contacto externo</span></Label>
          <Input value={tercero} onChange={(e) => setTercero(e.target.value)} className="h-11" placeholder="Nombre del tercero" />
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label>Detalle</Label>
          <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Información adicional del motivo" rows={3} />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
            {saving ? "Registrando…" : "Registrar movimiento"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Historial() {
  const { data } = useQuery({
    queryKey: ["mermas-hist"],
    queryFn: async () => {
      const [m, l, p] = await Promise.all([
        supabase.from("movimientos").select("*").in("tipo", ["MERMA", "AJUSTE_NEGATIVO", "AJUSTE_POSITIVO"]).order("fecha", { ascending: false }).limit(200),
        supabase.from("lotes").select("*"),
        supabase.from("productos").select("*"),
      ]);
      return { movs: m.data ?? [], lotes: l.data ?? [], productos: p.data ?? [] };
    },
  });
  const loteById = useMemo(() => new Map((data?.lotes ?? []).map(l => [l.id, l])), [data]);
  const prodById = useMemo(() => new Map((data?.productos ?? []).map(p => [p.id, p])), [data]);

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Fecha</th>
            <th className="text-left px-3 py-2">Tipo</th>
            <th className="text-left px-3 py-2">Lote / Producto</th>
            <th className="text-right px-3 py-2">Cajas</th>
            <th className="text-left px-3 py-2">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {(data?.movs ?? []).map(m => {
            const l = loteById.get(m.lote_id);
            const p = l ? prodById.get(l.producto_id) : null;
            return (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2">{formatDate(m.fecha)}</td>
                <td className="px-3 py-2"><Badge variant={m.tipo === "AJUSTE_POSITIVO" ? "default" : "destructive"}>{m.tipo}</Badge></td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs">{l?.codigo_lote}</div>
                  <div className="text-xs text-muted-foreground">{p?.descripcion}</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold">{formatNumber(m.cantidad_cajas)}</td>
                <td className="px-3 py-2 text-xs">{m.motivo ?? "—"}</td>
              </tr>
            );
          })}
          {(data?.movs ?? []).length === 0 && (
            <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function Reporte() {
  const now = new Date();
  const [mes, setMes] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data } = useQuery({
    queryKey: ["mermas-reporte", mes],
    queryFn: async () => {
      const [y, m] = mes.split("-").map(Number);
      const ini = `${y}-${String(m).padStart(2, "0")}-01`;
      const finDate = new Date(y, m, 1);
      const fin = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, "0")}-01`;
      const [mv, l, p] = await Promise.all([
        supabase.from("movimientos").select("*").eq("tipo", "MERMA").gte("fecha", ini).lt("fecha", fin),
        supabase.from("lotes").select("*"),
        supabase.from("productos").select("*"),
      ]);
      return { movs: mv.data ?? [], lotes: l.data ?? [], productos: p.data ?? [] };
    },
  });

  const loteById = useMemo(() => new Map((data?.lotes ?? []).map(l => [l.id, l])), [data]);
  const prodById = useMemo(() => new Map((data?.productos ?? []).map(p => [p.id, p])), [data]);

  const filas = useMemo(() => {
    const map = new Map<string, { producto: string; motivo: string; cajas: number }>();
    (data?.movs ?? []).forEach(m => {
      const l = loteById.get(m.lote_id);
      const p = l ? prodById.get(l.producto_id) : null;
      const producto = p?.descripcion ?? "—";
      const motivo = (m.motivo ?? "OTRO").split(" · ")[0];
      const key = `${producto}|${motivo}`;
      const cur = map.get(key) ?? { producto, motivo, cajas: 0 };
      cur.cajas += Number(m.cantidad_cajas);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.cajas - a.cajas);
  }, [data, loteById, prodById]);

  const total = filas.reduce((a, f) => a + f.cajas, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <Label>Mes:</Label>
        <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44" />
        <div className="ml-auto text-sm">
          Total mermas del mes: <span className="font-bold text-destructive">{formatNumber(total)} cajas</span>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Producto</th>
              <th className="text-left px-3 py-2">Motivo</th>
              <th className="text-right px-3 py-2">Cajas</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2">{f.producto}</td>
                <td className="px-3 py-2"><Badge variant="outline">{f.motivo}</Badge></td>
                <td className="px-3 py-2 text-right font-semibold">{formatNumber(f.cajas)}</td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">Sin mermas en el mes</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
