import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Send, Trash2, PackageMinus, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";
import { EstadoBadge } from "@/components/ventas/estado-badge";
import { LineasEditor, type LineaEditable } from "@/components/ventas/lineas-editor";
import { useRoles } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/ventas/guias")({
  component: GuiasPage,
});

function GuiasPage() {
  const qc = useQueryClient();
  const { isAdmin } = useRoles();
  const [busca, setBusca] = useState("");
  const [estadoF, setEstadoF] = useState("__ALL__");
  const [verId, setVerId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fromFac, setFromFac] = useState(false);

  const { data } = useQuery({
    queryKey: ["ventas-guia-list"],
    queryFn: async () => {
      const [gr, cli, fac] = await Promise.all([
        supabase.from("ventas_guias").select("*").order("created_at", { ascending: false }),
        supabase.from("clientes_proveedores").select("id,nombre,documento,direccion,telefono,email,tipo").in("tipo", ["CLIENTE","AMBOS"] as any).eq("activo", true).order("nombre"),
        supabase.from("ventas_facturas").select("id,codigo,cliente_id,total,moneda,fecha_emision,estado").neq("estado", "ANULADA").order("created_at", { ascending: false }),
      ]);
      return { gr: gr.data ?? [], cli: cli.data ?? [], fac: fac.data ?? [] };
    },
  });

  const cliMap = useMemo(() => new Map((data?.cli ?? []).map((c: any) => [c.id, c])), [data]);

  const filtered = useMemo(() => (data?.gr ?? []).filter((g: any) => {
    if (estadoF !== "__ALL__" && g.estado !== estadoF) return false;
    if (busca) {
      const s = busca.toLowerCase();
      const cli = cliMap.get(g.cliente_id) as any;
      return (g.codigo?.toLowerCase().includes(s) || cli?.nombre?.toLowerCase().includes(s));
    }
    return true;
  }), [data, estadoF, busca, cliMap]);

  const emitir = async (id: string) => {
    if (!confirm("¿Emitir guía? Se descontará stock del almacén.")) return;
    try {
      const { error } = await supabase.rpc("ventas_emitir_guia", { p_guia: id } as any);
      if (error) throw error;
      toast.success("Guía emitida · movimientos SALIDA registrados");
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  };

  const anular = async (id: string) => {
    if (!confirm("¿Anular guía? Si fue emitida, se revertirán los movimientos.")) return;
    try {
      const { error } = await supabase.rpc("ventas_anular_guia", { p_guia: id, p_motivo: "Anulada desde UI" } as any);
      if (error) {
        const { error: e2 } = await (supabase.from("ventas_guias") as any).update({ estado: "ANULADA" }).eq("id", id);
        if (e2) throw e2;
      }
      toast.success("Anulada"); qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar guía definitivamente?")) return;
    const { error } = await supabase.from("ventas_guias").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Eliminada"); qc.invalidateQueries(); }
  };

  const desdeFactura = async (facId: string) => {
    try {
      const { error } = await supabase.rpc("ventas_convertir_factura_a_guia", { p_fac: facId } as any);
      if (error) throw error;
      toast.success("Guía generada desde factura");
      setFromFac(false);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-700/30 text-orange-400 flex items-center justify-center">
            <Truck className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Guías de salida</h1>
            <p className="text-muted-foreground">Al emitir descuenta stock físico (SALIDA en movimientos)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFromFac(true)}><Truck className="size-4 mr-1" /> Desde factura</Button>
          <Button onClick={() => { setEditId(null); setEditOpen(true); }}><Plus className="size-4 mr-1" /> Nueva guía</Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Select value={estadoF} onValueChange={setEstadoF}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">Todos los estados</SelectItem>
              {["BORRADOR","EMITIDA","ANULADA"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-muted-foreground self-center">{filtered.length} registros</div>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">Motivo</th>
                <th className="px-3 py-2 text-left">Punto llegada</th>
                <th className="px-3 py-2 text-left">Fecha emisión</th>
                <th className="px-3 py-2 text-left">Fecha traslado</th>
                <th className="px-3 py-2 text-left">Transportista</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g: any) => {
                const cli = cliMap.get(g.cliente_id) as any;
                return (
                  <tr key={g.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono font-semibold">{g.codigo}</td>
                    <td className="px-3 py-2">{cli?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{g.motivo_traslado ?? "VENTA"}</td>
                    <td className="px-3 py-2">{g.punto_llegada ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(g.fecha_emision)}</td>
                    <td className="px-3 py-2">{formatDate(g.fecha_traslado)}</td>
                    <td className="px-3 py-2">{g.transportista ?? "—"}</td>
                    <td className="px-3 py-2 text-center"><EstadoBadge estado={g.estado} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setVerId(g.id)} title="Ver"><Eye className="size-4" /></Button>
                        {g.estado === "BORRADOR" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => { setEditId(g.id); setEditOpen(true); }}>Editar</Button>
                            <Button size="sm" onClick={() => emitir(g.id)} title="Emitir y descontar stock"><Send className="size-4 mr-1" /> Emitir</Button>
                          </>
                        )}
                        {g.estado !== "ANULADA" && (
                          <Button size="sm" variant="ghost" onClick={() => anular(g.id)}>Anular</Button>
                        )}
                        {isAdmin && g.estado !== "EMITIDA" && (
                          <Button size="sm" variant="ghost" onClick={() => eliminar(g.id)}>
                            <Trash2 className="size-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Sin guías</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {verId && <VerGuiaDialog id={verId} onClose={() => setVerId(null)} />}
      {editOpen && (
        <GuiaDialog id={editId} clientes={data?.cli ?? []} onClose={() => setEditOpen(false)} />
      )}
      {fromFac && (
        <Dialog open onOpenChange={() => setFromFac(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Generar guía desde factura</DialogTitle></DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr><th className="px-2 py-2 text-left">Factura</th><th className="px-2 py-2 text-left">Cliente</th><th className="px-2 py-2 text-right">Total</th><th></th></tr>
                </thead>
                <tbody>
                  {(data?.fac ?? []).map((f: any) => {
                    const cli = cliMap.get(f.cliente_id) as any;
                    return (
                      <tr key={f.id} className="border-t hover:bg-muted/30">
                        <td className="px-2 py-2 font-mono">{f.codigo}</td>
                        <td className="px-2 py-2">{cli?.nombre ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{f.moneda} {formatNumber(Number(f.total))}</td>
                        <td className="px-2 py-2 text-right">
                          <Button size="sm" onClick={() => desdeFactura(f.id)}>Generar</Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.fac ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No hay facturas disponibles</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function GuiaDialog({ id, clientes, onClose }: { id: string | null; clientes: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [traslado, setTraslado] = useState("");
  const [motivo, setMotivo] = useState("VENTA");
  const [transp, setTransp] = useState("");
  const [transpRuc, setTranspRuc] = useState("");
  const [placa, setPlaca] = useState("");
  const [conductor, setConductor] = useState("");
  const [partida, setPartida] = useState("");
  const [llegada, setLlegada] = useState("");
  const [observ, setObserv] = useState("");
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const hydrated = useRef(false);

  const { data: gdata } = useQuery({
    queryKey: ["ventas-guia-edit", id],
    enabled: !!id,
    queryFn: async () => {
      const [cab, its] = await Promise.all([
        supabase.from("ventas_guias").select("*").eq("id", id!).maybeSingle(),
        supabase.from("ventas_guia_items").select("*").eq("guia_id", id!).order("orden"),
      ]);
      return { cab: cab.data, its: its.data ?? [] };
    },
  });

  const { data: productos } = useQuery({
    queryKey: ["productos-activos-gr"],
    queryFn: async () => (await supabase.from("productos").select("id,codigo_base,descripcion").eq("activo", true).order("descripcion")).data ?? [],
  });

  const { data: stock } = useQuery({
    queryKey: ["ventas-stock-gr"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_lote_ubicacion")
        .select("lote_id,ubicacion_id,cantidad_cajas,lotes(id,producto_id,codigo_lote,fecha_vencimiento),ubicaciones(id,codigo)")
        .gt("cantidad_cajas", 0);
      return (data ?? []).map((s: any) => ({
        lote_id: s.lote_id, ubicacion_id: s.ubicacion_id,
        producto_id: s.lotes?.producto_id, codigo_lote: s.lotes?.codigo_lote,
        fecha_vencimiento: s.lotes?.fecha_vencimiento, cajas_saldo: s.cantidad_cajas,
        ubic_codigo: s.ubicaciones?.codigo,
      }));
    },
  });

  const productosOpt = useMemo(
    () => (productos ?? []).map((p: any) => ({ id: p.id, codigo_base: p.codigo_base, descripcion: p.descripcion, empaque_default: 48 })),
    [productos]
  );

  const lotesByProducto = useMemo(() => {
    const map = new Map<string, SearchSelectOption[]>();
    (stock ?? []).forEach((s: any) => {
      if (!s.producto_id) return;
      const key = s.producto_id;
      const arr = map.get(key) ?? [];
      if (!arr.some(o => o.value === s.lote_id)) {
        arr.push({ value: s.lote_id, label: s.codigo_lote, description: `FV ${s.fecha_vencimiento ?? "—"}` });
      }
      map.set(key, arr);
    });
    return map;
  }, [stock]);

  const ubicByLote = useMemo(() => {
    const map = new Map<string, SearchSelectOption[]>();
    (stock ?? []).forEach((s: any) => {
      const arr = map.get(s.lote_id) ?? [];
      arr.push({ value: s.ubicacion_id, label: s.ubic_codigo ?? "—", description: `Saldo: ${formatNumber(Number(s.cajas_saldo), 3)} cj` });
      map.set(s.lote_id, arr);
    });
    return map;
  }, [stock]);

  useEffect(() => {
    if (gdata?.cab && !hydrated.current) {
      hydrated.current = true;
      const c: any = gdata.cab;
      setClienteId(c.cliente_id); setFecha(c.fecha_emision); setTraslado(c.fecha_traslado ?? "");
      setMotivo(c.motivo_traslado ?? "VENTA");
      setTransp(c.transportista ?? ""); setTranspRuc(c.transportista_ruc ?? "");
      setPlaca(c.placa ?? ""); setConductor(c.conductor ?? "");
      setPartida(c.punto_partida ?? ""); setLlegada(c.punto_llegada ?? "");
      setObserv(c.observaciones ?? "");
      setLineas((gdata.its ?? []).map((it: any) => ({
        id: it.id, producto_id: it.producto_id, descripcion: it.descripcion,
        cantidad_cajas: Number(it.cantidad_cajas), empaque: it.empaque,
        precio_unitario: 0, descuento_pct: 0,
        lote_id: it.lote_id, ubicacion_id: it.ubicacion_id,
      })));
    }
  }, [gdata]);

  const cliOpts = useMemo<SearchSelectOption[]>(
    () => clientes.map(c => ({
      value: c.id, label: c.nombre,
      description: c.documento ? `RUC/DNI ${c.documento}` : undefined,
      searchText: [c.documento, c.direccion, c.telefono].filter(Boolean).join(" "),
    })), [clientes]);

  const clienteSel = useMemo(() => clientes.find((c: any) => c.id === clienteId), [clientes, clienteId]);
  const llegadaTouched = useRef(false);
  useEffect(() => {
    if (clienteSel && !llegadaTouched.current && clienteSel.direccion && !llegada) setLlegada(clienteSel.direccion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const guardar = async () => {
    if (!clienteId) { toast.error("Selecciona un cliente"); return; }
    if (lineas.length === 0) { toast.error("Añade al menos una línea"); return; }
    if (lineas.some(l => !l.producto_id || !l.lote_id || !l.ubicacion_id)) {
      toast.error("Selecciona producto, lote y ubicación en todas las líneas"); return;
    }
    setSaving(true);
    try {
      let grId = id;
      if (!grId) {
        const { data: cod, error: e1 } = await supabase.rpc("ventas_next_codigo", { p_serie: "T001" } as any);
        if (e1) throw e1;
        const num = parseInt(String(cod).replace("T001-", ""), 10);
        const { data: ins, error: e2 } = await (supabase.from("ventas_guias") as any).insert({
          serie: "T001", numero: num, codigo: cod, cliente_id: clienteId,
          fecha_emision: fecha, fecha_traslado: traslado || null, motivo_traslado: motivo,
          transportista: transp || null, transportista_ruc: transpRuc || null,
          placa: placa || null, conductor: conductor || null,
          punto_partida: partida || null, punto_llegada: llegada || null,
          observaciones: observ || null,
        }).select("id").single();
        if (e2) throw e2;
        grId = ins.id;
      } else {
        const { error } = await (supabase.from("ventas_guias") as any).update({
          cliente_id: clienteId, fecha_emision: fecha, fecha_traslado: traslado || null,
          motivo_traslado: motivo, transportista: transp || null, transportista_ruc: transpRuc || null,
          placa: placa || null, conductor: conductor || null,
          punto_partida: partida || null, punto_llegada: llegada || null,
          observaciones: observ || null,
        }).eq("id", grId);
        if (error) throw error;
        await supabase.from("ventas_guia_items").delete().eq("guia_id", grId);
      }
      const items = lineas.map((l, i) => ({
        guia_id: grId, producto_id: l.producto_id, descripcion: l.descripcion,
        cantidad_cajas: l.cantidad_cajas, empaque: l.empaque,
        lote_id: l.lote_id, ubicacion_id: l.ubicacion_id, orden: i + 1,
      }));
      const { error: eIt } = await (supabase.from("ventas_guia_items") as any).insert(items);
      if (eIt) throw eIt;
      toast.success(id ? "Guía actualizada" : "Guía creada");
      qc.invalidateQueries();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{id ? `Editar guía ${(gdata?.cab as any)?.codigo ?? ""}` : "Nueva guía de salida"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2"><Label>Cliente / Destinatario *</Label>
              <SearchSelect value={clienteId} onValueChange={setClienteId} options={cliOpts} placeholder="Buscar cliente" />
              {clienteSel && (
                <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                  {clienteSel.documento && <div><span className="text-muted-foreground">RUC/DNI:</span> <span className="font-mono">{clienteSel.documento}</span></div>}
                  {clienteSel.direccion && <div><span className="text-muted-foreground">Dirección:</span> {clienteSel.direccion}</div>}
                </div>
              )}
            </div>
            <div><Label>Fecha emisión *</Label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
            <div><Label>Fecha traslado</Label><Input type="date" value={traslado} onChange={e => setTraslado(e.target.value)} /></div>
            <div><Label>Motivo traslado</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["VENTA","COMPRA","TRASLADO","DEVOLUCION","OTRO"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Transportista</Label><Input value={transp} onChange={e => setTransp(e.target.value)} /></div>
            <div><Label>RUC Transp.</Label><Input value={transpRuc} onChange={e => setTranspRuc(e.target.value)} /></div>
            <div><Label>Placa</Label><Input value={placa} onChange={e => setPlaca(e.target.value)} /></div>
            <div><Label>Conductor</Label><Input value={conductor} onChange={e => setConductor(e.target.value)} /></div>
            <div className="col-span-2"><Label>Punto partida</Label><Input value={partida} onChange={e => setPartida(e.target.value)} /></div>
            <div className="col-span-2"><Label>Punto llegada</Label><Input value={llegada} onChange={e => { llegadaTouched.current = true; setLlegada(e.target.value); }} /></div>
            <div className="col-span-2 md:col-span-4"><Label>Observaciones</Label><Textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2} /></div>
          </div>
          <LineasEditor lineas={lineas} onChange={setLineas} productos={productosOpt} showLoteUbic loteOptionsByProducto={lotesByProducto} ubicOptionsByLote={ubicByLote} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar guía"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerGuiaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["ventas-guia-detail", id],
    queryFn: async () => {
      const [cab, its] = await Promise.all([
        supabase.from("ventas_guias").select("*").eq("id", id).maybeSingle(),
        supabase.from("ventas_guia_items").select("*, lote:lotes(codigo_lote), ubicacion:ubicaciones(codigo)").eq("guia_id", id).order("orden"),
      ]);
      return { cab: cab.data, its: (its.data ?? []) as any[] };
    },
  });
  const cab: any = data?.cab;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageMinus className="size-5" /> Guía {cab?.codigo}
          </DialogTitle>
        </DialogHeader>
        {cab && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Transportista</div><div>{cab.transportista ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Placa</div><div>{cab.placa ?? "—"}</div></div>
              <div className="col-span-2"><div className="text-muted-foreground text-xs">Punto partida</div><div>{cab.punto_partida ?? "—"}</div></div>
              <div className="col-span-2"><div className="text-muted-foreground text-xs">Punto llegada</div><div>{cab.punto_llegada ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Motivo</div><div>{cab.motivo_traslado ?? "VENTA"}</div></div>
              <div><div className="text-muted-foreground text-xs">Fecha emisión</div><div>{formatDate(cab.fecha_emision)}</div></div>
              <div><div className="text-muted-foreground text-xs">Fecha traslado</div><div>{formatDate(cab.fecha_traslado)}</div></div>
              <div><div className="text-muted-foreground text-xs">Estado</div><EstadoBadge estado={cab.estado} /></div>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-left">Lote</th>
                    <th className="px-2 py-2 text-left">Ubic.</th>
                    <th className="px-2 py-2 text-right">Cajas</th>
                    <th className="px-2 py-2 text-right">Empaque</th>
                    <th className="px-2 py-2 text-right">Latas</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.its.map((it: any) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2">{it.descripcion}</td>
                      <td className="px-2 py-2 font-mono text-xs">{it.lote?.codigo_lote ?? "—"}</td>
                      <td className="px-2 py-2">{it.ubicacion?.codigo ?? "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.cantidad_cajas), 3)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{it.empaque}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.cantidad_latas))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cab.observaciones && (
              <div className="text-sm"><span className="text-muted-foreground">Obs:</span> {cab.observaciones}</div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

