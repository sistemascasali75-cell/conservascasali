import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/etiquetado")({
  component: Page,
});

const ETIQUETAS_DESTINO = ["CASALI", "JAER", "BELL'S", "GLORIA", "OTRO"];

function Page() {
  const qc = useQueryClient();
  const [openLote, setOpenLote] = useState<any>(null);
  const [etiqueta, setEtiqueta] = useState("CASALI");
  const [etiquetaOtro, setEtiquetaOtro] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [merma, setMerma] = useState("0");
  const [ubicacionId, setUbicacionId] = useState("");
  const [observacion, setObservacion] = useState("");

  const { data } = useQuery({
    queryKey: ["etiq"],
    queryFn: async () => {
      const [l, s, u, a, p, o] = await Promise.all([
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("ordenes_etiquetado").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      return { lotes: l.data ?? [], stock: s.data ?? [], ubic: u.data ?? [], alm: a.data ?? [], prod: p.data ?? [], ordenes: o.data ?? [] };
    },
  });

  const stockPorLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.stock ?? []).forEach((s) => m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    return m;
  }, [data]);
  const prodMap = useMemo(() => new Map((data?.prod ?? []).map((p) => [p.id, p])), [data]);
  const ubicMap = useMemo(() => new Map((data?.ubic ?? []).map((u) => [u.id, u])), [data]);
  const almMap = useMemo(() => new Map((data?.alm ?? []).map((a) => [a.id, a])), [data]);
  const loteMap = useMemo(() => new Map((data?.lotes ?? []).map((l) => [l.id, l])), [data]);

  const lotesSinEtiqueta = useMemo(() => {
    return (data?.lotes ?? [])
      .filter((l: any) => !l.etiqueta || l.etiqueta === "S/E")
      .map((l: any) => ({ ...l, stock: stockPorLote.get(l.id) ?? 0 }))
      .filter((l) => l.stock > 0);
  }, [data, stockPorLote]);

  const ubicacionesDelLote = useMemo(() => {
    if (!openLote) return [];
    return (data?.stock ?? [])
      .filter((s) => s.lote_id === openLote.id && Number(s.cantidad_cajas) > 0)
      .map((s) => ({ ...s, ubic: ubicMap.get(s.ubicacion_id) }));
  }, [openLote, data, ubicMap]);

  const exec = useMutation({
    mutationFn: async () => {
      const dest = etiqueta === "OTRO" ? etiquetaOtro.trim() : etiqueta;
      if (!dest) throw new Error("Indica la etiqueta destino");
      const { error } = await supabase.rpc("ejecutar_orden_etiquetado", {
        p_lote_origen: openLote.id,
        p_etiqueta_destino: dest,
        p_cantidad_etiquetada: Number(cantidad),
        p_merma_proceso: Number(merma) || 0,
        p_ubicacion: ubicacionId,
        p_observacion: observacion || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orden de etiquetado ejecutada");
      setOpenLote(null);
      setCantidad(""); setMerma("0"); setObservacion(""); setUbicacionId("");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Etiquetado</h1>
        <p className="text-muted-foreground">Convierte lotes sin etiqueta (S/E) a etiqueta comercial registrando merma del proceso</p>
      </header>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Lotes S/E con stock</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">FP / FV</th>
                <th className="text-right px-3 py-2">Stock (cj)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lotesSinEtiqueta.map((l: any) => {
                const p: any = prodMap.get(l.producto_id);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{l.codigo_lote}</td>
                    <td className="px-3 py-2">{p?.descripcion}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(l.fecha_produccion)} → {formatDate(l.fecha_vencimiento)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatNumber(l.stock)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" onClick={() => setOpenLote(l)}>
                        <Tag className="size-4 mr-1" /> Etiquetar
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {lotesSinEtiqueta.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No hay lotes S/E pendientes</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Historial de órdenes de etiquetado</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Lote origen</th>
                <th className="text-left px-3 py-2">Etiqueta</th>
                <th className="text-right px-3 py-2">Etiquetadas</th>
                <th className="text-right px-3 py-2">Merma</th>
                <th className="text-left px-3 py-2">Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ordenes ?? []).map((o: any) => {
                const l: any = loteMap.get(o.lote_origen_id);
                const u: any = ubicMap.get(o.ubicacion_id);
                const a: any = u ? almMap.get(u.almacen_id) : null;
                return (
                  <tr key={o.id} className="border-t">
                    <td className="px-3 py-2">{formatDate(o.fecha)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l?.codigo_lote ?? "—"}</td>
                    <td className="px-3 py-2"><span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">{o.etiqueta_destino}</span></td>
                    <td className="px-3 py-2 text-right font-semibold">{formatNumber(o.cantidad_etiquetada)}</td>
                    <td className="px-3 py-2 text-right text-destructive">{formatNumber(o.merma_proceso)}</td>
                    <td className="px-3 py-2 text-xs">{a?.nombre} · <span className="font-mono">{u?.codigo}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!openLote} onOpenChange={(o) => !o && setOpenLote(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Orden de etiquetado</DialogTitle></DialogHeader>
          {openLote && (
            <div className="space-y-3">
              <div className="text-sm bg-muted p-3 rounded">
                <div className="font-mono text-xs">{openLote.codigo_lote}</div>
                <div className="text-muted-foreground">Stock total disponible: {formatNumber(openLote.stock)} cajas</div>
              </div>
              <div>
                <Label>Etiqueta destino</Label>
                <Select value={etiqueta} onValueChange={setEtiqueta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ETIQUETAS_DESTINO.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                {etiqueta === "OTRO" && (
                  <Input placeholder="Nombre etiqueta" value={etiquetaOtro} onChange={(e) => setEtiquetaOtro(e.target.value)} className="mt-2" />
                )}
              </div>
              <div>
                <Label>Ubicación (de donde sale y donde queda el etiquetado)</Label>
                <SearchSelect
                  value={ubicacionId}
                  onValueChange={setUbicacionId}
                  options={ubicacionesDelLote.map((u: any) => ({
                    value: u.ubicacion_id,
                    label: `${(almMap.get(u.ubic?.almacen_id) as any)?.nombre ?? ""} · ${u.ubic?.codigo ?? ""}`,
                    description: `Stock: ${formatNumber(u.cantidad_cajas)} cajas`,
                    meta: [
                      u.ubic?.pasillo ? { label: "Pasillo", value: u.ubic.pasillo } : null,
                      u.ubic?.fila ? { label: "Fila", value: u.ubic.fila } : null,
                      u.ubic?.nivel ? { label: "Nivel", value: u.ubic.nivel } : null,
                    ].filter(Boolean) as SearchSelectOption["meta"],
                  }))}
                  placeholder="Seleccionar ubicación…"
                  searchPlaceholder="Buscar ubicación…"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cantidad etiquetada</Label>
                  <Input type="number" step="0.01" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                </div>
                <div>
                  <Label>Merma del proceso</Label>
                  <Input type="number" step="0.01" value={merma} onChange={(e) => setMerma(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Observación</Label>
                <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} />
              </div>
              <div className="text-xs text-muted-foreground">
                Total a descontar del lote origen: <strong>{formatNumber((Number(cantidad) || 0) + (Number(merma) || 0))}</strong> cajas
              </div>
              <Button className="w-full h-11" onClick={() => exec.mutate()} disabled={!cantidad || !ubicacionId || exec.isPending}>
                {exec.isPending ? "Procesando…" : "Ejecutar orden"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
