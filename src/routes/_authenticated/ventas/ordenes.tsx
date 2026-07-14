import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { ClipboardList, Plus, FileText, Truck, Trash2, FileInput } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";
import { EstadoBadge } from "@/components/ventas/estado-badge";
import { LineasEditor, type LineaEditable } from "@/components/ventas/lineas-editor";
import { useRoles } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/ventas/ordenes")({
  component: OrdenesPage,
});

function OrdenesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useRoles();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("__ALL__");
  const [busca, setBusca] = useState("");
  const [pickCot, setPickCot] = useState(false);

  const { data } = useQuery({
    queryKey: ["ventas-ord-list"],
    queryFn: async () => {
      const [ord, cli, cot] = await Promise.all([
        supabase.from("ventas_ordenes").select("*").order("created_at", { ascending: false }),
        supabase.from("clientes_proveedores").select("id,nombre,documento,direccion,condicion_pago,telefono,email,tipo").in("tipo", ["CLIENTE", "AMBOS"] as any).eq("activo", true).order("nombre"),
        supabase.from("ventas_cotizaciones").select("id,codigo,cliente_id,fecha_emision,total,moneda,estado").in("estado", ["BORRADOR","ENVIADA","ACEPTADA"] as any).order("created_at", { ascending: false }),
      ]);
      return { ord: ord.data ?? [], cli: cli.data ?? [], cot: cot.data ?? [] };
    },
  });

  const cliMap = useMemo(() => new Map((data?.cli ?? []).map((c: any) => [c.id, c])), [data]);

  const filtered = useMemo(() => (data?.ord ?? []).filter((o: any) => {
    if (filtroEstado !== "__ALL__" && o.estado !== filtroEstado) return false;
    if (busca) {
      const s = busca.toLowerCase();
      const cli = cliMap.get(o.cliente_id) as any;
      return (o.codigo?.toLowerCase().includes(s) || cli?.nombre?.toLowerCase().includes(s));
    }
    return true;
  }), [data, filtroEstado, busca, cliMap]);

  const generarFactura = async (id: string) => {
    try {
      const { error } = await supabase.rpc("ventas_convertir_orden_a_factura", { p_ov: id, p_tipo: "FACTURA", p_serie: "F001" } as any);
      if (error) throw error;
      toast.success("Factura generada");
      qc.invalidateQueries();
      navigate({ to: "/ventas/facturas" });
    } catch (e: any) { toast.error(e.message); }
  };

  const generarGuia = async (id: string) => {
    try {
      const { error } = await supabase.rpc("ventas_convertir_orden_a_guia", { p_ord: id } as any);
      if (error) throw error;
      toast.success("Guía generada (borrador). Emítela para descontar stock.");
      qc.invalidateQueries();
      navigate({ to: "/ventas/guias" });
    } catch (e: any) { toast.error(e.message); }
  };


  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar orden?")) return;
    const { error } = await supabase.from("ventas_ordenes").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Eliminada"); qc.invalidateQueries(); }
  };

  const nuevaDesdeCot = async (cotId: string) => {
    try {
      const { data: newId, error } = await supabase.rpc("ventas_convertir_cot_a_orden", { p_cot: cotId } as any);
      if (error) throw error;
      toast.success("Orden generada desde cotización — revisa y guarda");
      setPickCot(false);
      await qc.invalidateQueries();
      if (newId) { setEditingId(String(newId)); setOpen(true); }
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/30 text-emerald-400 flex items-center justify-center">
            <ClipboardList className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Órdenes de compra</h1>
            <p className="text-muted-foreground">Pedido del cliente · genera factura y/o guía de salida</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPickCot(true)}>
            <FileInput className="size-4 mr-1" /> Desde cotización
          </Button>
          <Button onClick={() => { setEditingId(null); setOpen(true); }}>
            <Plus className="size-4 mr-1" /> Nueva orden
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">Todos los estados</SelectItem>
              {["PENDIENTE","RESERVADA","PARCIAL","FACTURADA","DESPACHADA","ANULADA"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Entrega</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: any) => {
                const cli = cliMap.get(o.cliente_id) as any;
                const puedeFacturar = ["PENDIENTE","RESERVADA","PARCIAL","DESPACHADA"].includes(o.estado);
                const puedeGuia = ["PENDIENTE","RESERVADA","PARCIAL"].includes(o.estado);
                return (
                  <tr key={o.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono font-semibold">{o.codigo}</td>
                    <td className="px-3 py-2">{cli?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(o.fecha_emision)}</td>
                    <td className="px-3 py-2">{formatDate(o.fecha_entrega)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{o.moneda} {formatNumber(Number(o.total))}</td>
                    <td className="px-3 py-2 text-center"><EstadoBadge estado={o.estado} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setEditingId(o.id); setOpen(true); }}>Ver</Button>
                        {puedeFacturar && (
                          <Button size="sm" variant="secondary" onClick={() => generarFactura(o.id)} title="Generar factura">
                            <FileText className="size-4" />
                          </Button>
                        )}
                        {puedeGuia && (
                          <Button size="sm" onClick={() => generarGuia(o.id)} title="Generar guía de salida">
                            <Truck className="size-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => eliminar(o.id)}>
                            <Trash2 className="size-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin órdenes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {open && <OrdenDialog id={editingId} onClose={() => setOpen(false)} clientes={data?.cli ?? []} />}

      {pickCot && (
        <Dialog open onOpenChange={() => setPickCot(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Generar orden desde cotización</DialogTitle></DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left">Cotización</th>
                    <th className="px-2 py-2 text-left">Cliente</th>
                    <th className="px-2 py-2 text-left">Fecha</th>
                    <th className="px-2 py-2 text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.cot ?? []).map((c: any) => {
                    const cli = cliMap.get(c.cliente_id) as any;
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="px-2 py-2 font-mono">{c.codigo}</td>
                        <td className="px-2 py-2">{cli?.nombre ?? "—"}</td>
                        <td className="px-2 py-2">{formatDate(c.fecha_emision)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{c.moneda} {formatNumber(Number(c.total))}</td>
                        <td className="px-2 py-2 text-right">
                          <Button size="sm" onClick={() => nuevaDesdeCot(c.id)}>Usar</Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.cot ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No hay cotizaciones convertibles</td></tr>
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

function OrdenDialog({ id, onClose, clientes }: { id: string | null; onClose: () => void; clientes: any[] }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [entrega, setEntrega] = useState("");
  const [moneda, setMoneda] = useState("PEN");
  const [tc, setTc] = useState("");
  const [condicion, setCondicion] = useState("CONTADO");
  const [dirEntrega, setDirEntrega] = useState("");
  const [observ, setObserv] = useState("");
  const [estado, setEstado] = useState("PENDIENTE");
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const hydrated = useRef(false);

  const { data: ordData } = useQuery({
    queryKey: ["ventas-ord-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const [cab, its] = await Promise.all([
        supabase.from("ventas_ordenes").select("*").eq("id", id!).maybeSingle(),
        supabase.from("ventas_orden_items").select("*").eq("orden_id", id!).order("orden"),
      ]);
      return { cab: cab.data, its: its.data ?? [] };
    },
  });

  const { data: productos } = useQuery({
    queryKey: ["productos-activos"],
    queryFn: async () => (await supabase.from("productos").select("id,codigo_base,descripcion").eq("activo", true).order("descripcion")).data ?? [],
  });

  const { data: stock } = useQuery({
    queryKey: ["ventas-stock-fefo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_lote_ubicacion")
        .select("lote_id,cantidad_cajas,lotes(id,producto_id,codigo_lote,fecha_vencimiento)")
        .gt("cantidad_cajas", 0);
      return (data ?? []).map((s: any) => ({
        lote_id: s.lote_id,
        producto_id: s.lotes?.producto_id,
        codigo_lote: s.lotes?.codigo_lote,
        fecha_vencimiento: s.lotes?.fecha_vencimiento,
        cajas_saldo: s.cantidad_cajas,
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
      const arr = map.get(s.producto_id) ?? [];
      arr.push({
        value: s.lote_id,
        label: s.codigo_lote,
        description: `Saldo: ${formatNumber(Number(s.cajas_saldo))} cj · FV ${s.fecha_vencimiento ?? "—"}`,
      });
      map.set(s.producto_id, arr);
    });
    return map;
  }, [stock]);

  useEffect(() => {
    if (ordData?.cab && !hydrated.current) {
      hydrated.current = true;
      const c: any = ordData.cab;
      setClienteId(c.cliente_id); setFecha(c.fecha_emision); setEntrega(c.fecha_entrega ?? "");
      setMoneda(c.moneda); setTc(c.tipo_cambio?.toString() ?? ""); setCondicion(c.condicion_pago ?? "");
      setDirEntrega(c.direccion_entrega ?? ""); setObserv(c.observaciones ?? ""); setEstado(c.estado);
      setLineas((ordData.its ?? []).map((it: any) => ({
        id: it.id, producto_id: it.producto_id, descripcion: it.descripcion,
        cantidad_cajas: Number(it.cantidad_cajas), empaque: it.empaque,
        precio_unitario: Number(it.precio_unitario), descuento_pct: Number(it.descuento_pct),
        unidad_precio: it.unidad_precio, lote_id: it.lote_id,
      })));
    }
  }, [ordData]);

  const cliOpts = useMemo<SearchSelectOption[]>(
    () => clientes.map(c => ({
      value: c.id,
      label: c.nombre,
      description: c.documento ? `RUC/DNI ${c.documento}` : undefined,
      searchText: [c.documento, c.direccion, c.telefono, c.email].filter(Boolean).join(" "),
    })),
    [clientes]
  );

  const clienteSel = useMemo(() => clientes.find((c: any) => c.id === clienteId), [clientes, clienteId]);
  const condTouched = useRef(false);
  const dirTouched = useRef(false);
  useEffect(() => {
    if (clienteSel) {
      if (!condTouched.current && clienteSel.condicion_pago) setCondicion(clienteSel.condicion_pago);
      if (!dirTouched.current && clienteSel.direccion && !dirEntrega) setDirEntrega(clienteSel.direccion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const [nuevoClienteOpen, setNuevoClienteOpen] = useState(false);

  const guardar = async () => {
    if (!clienteId) { toast.error("Selecciona un cliente"); return; }
    if (lineas.length === 0) { toast.error("Añade al menos una línea"); return; }
    if (lineas.some(l => !l.producto_id)) { toast.error("Selecciona producto en todas las líneas"); return; }
    setSaving(true);
    try {
      let ordId = id;
      if (!ordId) {
        const { data: cod, error: e1 } = await supabase.rpc("ventas_next_codigo", { p_serie: "OV" } as any);
        if (e1) throw e1;
        const num = parseInt(String(cod).replace("OV-", ""), 10);
        const { data: ins, error: e2 } = await (supabase.from("ventas_ordenes") as any).insert({
          serie: "OV", numero: num, codigo: cod, cliente_id: clienteId,
          fecha_emision: fecha, fecha_entrega: entrega || null, moneda, tipo_cambio: tc ? Number(tc) : null,
          condicion_pago: condicion, direccion_entrega: dirEntrega, observaciones: observ, estado,
        }).select("id").single();
        if (e2) throw e2;
        ordId = ins.id;
      } else {
        const { error } = await (supabase.from("ventas_ordenes") as any).update({
          cliente_id: clienteId, fecha_emision: fecha, fecha_entrega: entrega || null,
          moneda, tipo_cambio: tc ? Number(tc) : null, condicion_pago: condicion,
          direccion_entrega: dirEntrega, observaciones: observ, estado,
        }).eq("id", ordId);
        if (error) throw error;
        await supabase.from("ventas_orden_items").delete().eq("orden_id", ordId);
      }
      const items = lineas.map((l, i) => ({
        orden_id: ordId, producto_id: l.producto_id, lote_id: l.lote_id ?? null,
        descripcion: l.descripcion, cantidad_cajas: l.cantidad_cajas, empaque: l.empaque,
        unidad_precio: l.unidad_precio ?? "CAJA", precio_unitario: l.precio_unitario,
        descuento_pct: l.descuento_pct, orden: i + 1,
      }));
      const { error: eIt } = await (supabase.from("ventas_orden_items") as any).insert(items);
      if (eIt) throw eIt;
      toast.success(id ? "Orden actualizada" : "Orden creada");
      qc.invalidateQueries();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{id ? `Orden ${(ordData?.cab as any)?.codigo ?? ""}` : "Nueva orden de venta"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2"><Label>Cliente *</Label>
              <div className="flex gap-2">
                <div className="flex-1"><SearchSelect value={clienteId} onValueChange={setClienteId} options={cliOpts} placeholder="Buscar cliente" /></div>
                <Button type="button" variant="outline" size="sm" onClick={() => setNuevoClienteOpen(true)} title="Crear nuevo cliente">
                  <Plus className="size-4" />
                </Button>
              </div>
              {clienteSel && (
                <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                  {clienteSel.documento && <div><span className="text-muted-foreground">RUC/DNI:</span> <span className="font-mono">{clienteSel.documento}</span></div>}
                  {clienteSel.direccion && <div><span className="text-muted-foreground">Dirección:</span> {clienteSel.direccion}</div>}
                  {(clienteSel.telefono || clienteSel.email) && (
                    <div className="flex gap-3">
                      {clienteSel.telefono && <span><span className="text-muted-foreground">Tel:</span> {clienteSel.telefono}</span>}
                      {clienteSel.email && <span><span className="text-muted-foreground">Email:</span> {clienteSel.email}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div><Label>Fecha emisión *</Label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
            <div><Label>Fecha entrega</Label><Input type="date" value={entrega} onChange={e => setEntrega(e.target.value)} /></div>
            <div><Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="PEN">PEN</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Tipo cambio</Label><Input type="number" step="0.0001" value={tc} onChange={e => setTc(e.target.value)} /></div>
            <div><Label>Condición pago</Label><Input value={condicion} onChange={e => { condTouched.current = true; setCondicion(e.target.value); }} /></div>
            <div><Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["PENDIENTE","RESERVADA","PARCIAL","FACTURADA","DESPACHADA","ANULADA"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 md:col-span-4"><Label>Dirección de entrega</Label><Input value={dirEntrega} onChange={e => { dirTouched.current = true; setDirEntrega(e.target.value); }} /></div>
            <div className="col-span-2 md:col-span-4"><Label>Observaciones</Label><Textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2} /></div>
          </div>
          <LineasEditor lineas={lineas} onChange={setLineas} productos={productosOpt} showUnidad showLoteUbic loteOptionsByProducto={lotesByProducto} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar orden"}</Button>
        </DialogFooter>
      </DialogContent>
      {nuevoClienteOpen && (
        <NuevoClienteDialog
          onClose={() => setNuevoClienteOpen(false)}
          onCreated={(nuevo) => {
            qc.invalidateQueries({ queryKey: ["ventas-ord-list"] });
            setClienteId(nuevo.id);
            if (nuevo.condicion_pago) { condTouched.current = false; setCondicion(nuevo.condicion_pago); }
            if (nuevo.direccion) { dirTouched.current = false; setDirEntrega(nuevo.direccion); }
            setNuevoClienteOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}

function NuevoClienteDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: any) => void }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("CLIENTE");
  const [documento, setDocumento] = useState("");
  const [direccion, setDireccion] = useState("");
  const [condicion, setCondicion] = useState("CONTADO");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) { toast.error("Nombre requerido"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("clientes_proveedores").insert({
        nombre: nombre.trim(), tipo: tipo as any, documento: documento || null,
        direccion: direccion || null, condicion_pago: condicion || null,
        telefono: telefono || null, email: email || null,
      }).select("*").single();
      if (error) throw error;
      toast.success("Cliente creado");
      onCreated(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo cliente / proveedor</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Nombre / Razón social *</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} autoFocus /></div>
          <div><Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENTE">CLIENTE</SelectItem>
                <SelectItem value="PROVEEDOR">PROVEEDOR</SelectItem>
                <SelectItem value="AMBOS">AMBOS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>RUC / DNI</Label><Input value={documento} onChange={e => setDocumento(e.target.value)} /></div>
          <div className="col-span-2"><Label>Dirección</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} /></div>
          <div><Label>Condición de pago</Label><Input value={condicion} onChange={e => setCondicion(e.target.value)} placeholder="CONTADO / CREDITO_30" /></div>
          <div><Label>Teléfono</Label><Input value={telefono} onChange={e => setTelefono(e.target.value)} /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Crear cliente"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
