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
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, Trash2, Plus, Truck, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";
import { EstadoBadge } from "@/components/ventas/estado-badge";
import { LineasEditor, type LineaEditable } from "@/components/ventas/lineas-editor";
import { useRoles } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/ventas/facturas")({
  component: FacturasPage,
});

function FacturasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useRoles();
  const [busca, setBusca] = useState("");
  const [estadoF, setEstadoF] = useState("__ALL__");
  const [tipoF, setTipoF] = useState("__ALL__");
  const [verId, setVerId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fromOrden, setFromOrden] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["ventas-fac-list"],
    queryFn: async () => {
      const [fac, cli, ord] = await Promise.all([
        supabase.from("ventas_facturas").select("*").order("created_at", { ascending: false }),
        supabase.from("clientes_proveedores").select("id,nombre,documento,direccion,condicion_pago,telefono,email,tipo").in("tipo", ["CLIENTE", "AMBOS"] as any).eq("activo", true).order("nombre"),
        supabase.from("ventas_ordenes").select("id,codigo,cliente_id,estado,total,moneda,fecha_emision").in("estado", ["PENDIENTE","RESERVADA","PARCIAL","DESPACHADA"] as any).order("created_at", { ascending: false }),
      ]);
      return { fac: fac.data ?? [], cli: cli.data ?? [], ord: ord.data ?? [] };
    },
  });

  const cliMap = useMemo(() => new Map((data?.cli ?? []).map((c: any) => [c.id, c])), [data]);

  const filtered = useMemo(() => (data?.fac ?? []).filter((f: any) => {
    if (estadoF !== "__ALL__" && f.estado !== estadoF) return false;
    if (tipoF !== "__ALL__" && f.tipo_comprobante !== tipoF) return false;
    if (busca) {
      const s = busca.toLowerCase();
      const cli = cliMap.get(f.cliente_id) as any;
      return (f.codigo?.toLowerCase().includes(s) || cli?.nombre?.toLowerCase().includes(s) || f.cliente_ruc?.includes(s));
    }
    return true;
  }), [data, estadoF, tipoF, busca, cliMap]);

  const marcarPagada = async (id: string) => {
    const { error } = await (supabase.from("ventas_facturas") as any).update({ estado: "PAGADA" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Marcada como pagada"); qc.invalidateQueries(); }
  };

  const anular = async (id: string) => {
    if (!confirm("¿Anular factura?")) return;
    const { error } = await supabase.rpc("ventas_anular_factura", { p_fac: id, p_motivo: "Anulada desde UI" } as any);
    if (error) {
      const { error: e2 } = await (supabase.from("ventas_facturas") as any).update({ estado: "ANULADA" }).eq("id", id);
      if (e2) { toast.error(e2.message); return; }
    }
    toast.success("Anulada"); qc.invalidateQueries();
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar factura definitivamente?")) return;
    const { error } = await supabase.from("ventas_facturas").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Eliminada"); qc.invalidateQueries(); }
  };

  const generarGuia = async (id: string) => {
    try {
      const { error } = await supabase.rpc("ventas_convertir_factura_a_guia", { p_fac: id } as any);
      if (error) throw error;
      toast.success("Guía generada (borrador). Emítela para descontar stock.");
      qc.invalidateQueries();
      navigate({ to: "/ventas/guias" });
    } catch (e: any) { toast.error(e.message); }
  };

  const nuevaDesdeOrden = async (ordId: string, tipo: "FACTURA" | "BOLETA") => {
    try {
      const serie = tipo === "FACTURA" ? "F001" : "B001";
      const { data: newId, error } = await supabase.rpc("ventas_convertir_orden_a_factura", { p_ov: ordId, p_tipo: tipo, p_serie: serie } as any);
      if (error) throw error;
      toast.success(`${tipo} generada desde orden — revisa y guarda`);
      setFromOrden(null);
      await qc.invalidateQueries();
      if (newId) { setEditId(String(newId)); setEditOpen(true); }
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/30 text-violet-400 flex items-center justify-center">
            <Receipt className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Facturas / Boletas</h1>
            <p className="text-muted-foreground">Genera desde orden de venta, edita, factura → guía de remisión</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFromOrden("__PICK__")}>
            <Receipt className="size-4 mr-1" /> Desde orden
          </Button>
          <Button onClick={() => { setEditId(null); setEditOpen(true); }}>
            <Plus className="size-4 mr-1" /> Nueva factura
          </Button>
        </div>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <Input placeholder="Buscar por código, cliente o RUC…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Select value={tipoF} onValueChange={setTipoF}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">Todos los tipos</SelectItem>
              {["FACTURA","BOLETA","NOTA_CREDITO","NOTA_DEBITO"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={estadoF} onValueChange={setEstadoF}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">Todos los estados</SelectItem>
              {["EMITIDA","PAGADA","ANULADA"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-sm text-muted-foreground self-center">{filtered.length} registros</div>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">RUC/DNI</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-right">Op. Gravada</th>
                <th className="px-3 py-2 text-right">IGV</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f: any) => {
                const cli = cliMap.get(f.cliente_id) as any;
                return (
                  <tr key={f.id} className={`border-t ${f.prestamo ? "bg-red-500/20 hover:bg-red-500/30" : "hover:bg-muted/30"}`}>
                    <td className="px-3 py-2 font-mono font-semibold">{f.codigo}</td>
                    <td className="px-3 py-2">{f.tipo_comprobante}</td>
                    <td className="px-3 py-2">{cli?.nombre ?? f.cliente_razon_social ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{f.cliente_ruc ?? cli?.documento ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(f.fecha_emision)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(f.op_gravada))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(Number(f.igv))}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{f.moneda} {formatNumber(Number(f.total))}</td>
                    <td className="px-3 py-2 text-center"><EstadoBadge estado={f.estado} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setVerId(f.id)} title="Ver detalle"><Eye className="size-4" /></Button>
                        {f.estado !== "ANULADA" && (
                          <Button size="sm" variant="outline" onClick={() => { setEditId(f.id); setEditOpen(true); }}>Editar</Button>
                        )}
                        {f.estado !== "ANULADA" && (
                          <Button size="sm" onClick={() => generarGuia(f.id)} title="Generar guía de remisión">
                            <Truck className="size-4" />
                          </Button>
                        )}
                        {f.estado === "EMITIDA" && <Button size="sm" variant="secondary" onClick={() => marcarPagada(f.id)}>Pagar</Button>}
                        {f.estado !== "ANULADA" && <Button size="sm" variant="ghost" onClick={() => anular(f.id)}>Anular</Button>}
                        {isAdmin && <Button size="sm" variant="ghost" onClick={() => eliminar(f.id)}><Trash2 className="size-4 text-red-500" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Sin facturas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {verId && <VerFacturaDialog id={verId} onClose={() => setVerId(null)} />}
      {editOpen && (
        <FacturaDialog
          id={editId}
          clientes={data?.cli ?? []}
          onClose={() => setEditOpen(false)}
        />
      )}
      {fromOrden && (
        <Dialog open onOpenChange={() => setFromOrden(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Generar factura desde orden de venta</DialogTitle></DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr><th className="px-2 py-2 text-left">Orden</th><th className="px-2 py-2 text-left">Cliente</th><th className="px-2 py-2 text-right">Total</th><th></th></tr>
                </thead>
                <tbody>
                  {(data?.ord ?? []).map((o: any) => {
                    const cli = cliMap.get(o.cliente_id) as any;
                    return (
                      <tr key={o.id} className="border-t hover:bg-muted/30">
                        <td className="px-2 py-2 font-mono">{o.codigo}</td>
                        <td className="px-2 py-2">{cli?.nombre ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{o.moneda} {formatNumber(Number(o.total))}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => nuevaDesdeOrden(o.id, "FACTURA")}>Factura</Button>
                            <Button size="sm" variant="outline" onClick={() => nuevaDesdeOrden(o.id, "BOLETA")}>Boleta</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.ord ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No hay órdenes facturables</td></tr>
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

function FacturaDialog({ id, clientes, onClose }: { id: string | null; clientes: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState("FACTURA");
  const [serie, setSerie] = useState("F001");
  const [numero, setNumero] = useState<string>("");
  const [clienteId, setClienteId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [vence, setVence] = useState("");
  const [moneda, setMoneda] = useState("PEN");
  const [tc, setTc] = useState("");
  const [condicion, setCondicion] = useState("CONTADO");
  const [observ, setObserv] = useState("");
  const [prestamo, setPrestamo] = useState(false);
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const hydrated = useRef(false);

  const { data: facData } = useQuery({
    queryKey: ["ventas-fac-detail-edit", id],
    enabled: !!id,
    queryFn: async () => {
      const [cab, its] = await Promise.all([
        supabase.from("ventas_facturas").select("*").eq("id", id!).maybeSingle(),
        supabase.from("ventas_factura_items").select("*").eq("factura_id", id!).order("orden"),
      ]);
      return { cab: cab.data, its: its.data ?? [] };
    },
  });

  const { data: productos } = useQuery({
    queryKey: ["productos-activos-fac"],
    queryFn: async () => (await supabase.from("productos").select("id,codigo_base,descripcion").eq("activo", true).order("descripcion")).data ?? [],
  });

  const productosOpt = useMemo(
    () => (productos ?? []).map((p: any) => ({ id: p.id, codigo_base: p.codigo_base, descripcion: p.descripcion, empaque_default: 48 })),
    [productos]
  );

  useEffect(() => {
    if (facData?.cab && !hydrated.current) {
      hydrated.current = true;
      const c: any = facData.cab;
      setTipo(c.tipo_comprobante); setSerie(c.serie); setNumero(String(c.numero ?? "")); setClienteId(c.cliente_id);
      setFecha(c.fecha_emision); setVence(c.fecha_vencimiento ?? "");
      setMoneda(c.moneda); setTc(c.tipo_cambio?.toString() ?? "");
      setCondicion(c.condicion_pago ?? ""); setObserv(c.observaciones ?? "");
      setPrestamo(!!c.prestamo);
      setLineas((facData.its ?? []).map((it: any) => ({
        id: it.id, producto_id: it.producto_id, descripcion: it.descripcion,
        cantidad_cajas: Number(it.cantidad_cajas), empaque: it.empaque,
        precio_unitario: Number(it.precio_unitario), descuento_pct: Number(it.descuento_pct),
        unidad_precio: it.unidad_precio,
      })));
    }
  }, [facData]);

  const cliOpts = useMemo<SearchSelectOption[]>(
    () => clientes.map(c => ({
      value: c.id, label: c.nombre,
      description: c.documento ? `RUC/DNI ${c.documento}` : undefined,
      searchText: [c.documento, c.direccion, c.telefono, c.email].filter(Boolean).join(" "),
    })), [clientes]);

  const clienteSel = useMemo(() => clientes.find((c: any) => c.id === clienteId), [clientes, clienteId]);
  const condTouched = useRef(false);
  useEffect(() => {
    if (clienteSel && !condTouched.current && clienteSel.condicion_pago) setCondicion(clienteSel.condicion_pago);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const guardar = async () => {
    if (!clienteId) { toast.error("Selecciona un cliente"); return; }
    if (lineas.length === 0) { toast.error("Añade al menos una línea"); return; }
    if (lineas.some(l => !l.producto_id)) { toast.error("Selecciona producto en todas las líneas"); return; }
    setSaving(true);
    try {
      let facId = id;
      const cli = clientes.find((c: any) => c.id === clienteId);
      if (!facId) {
        let cod: string;
        let num: number;
        if (numero && !isNaN(parseInt(numero, 10))) {
          num = parseInt(numero, 10);
          cod = `${serie}-${String(num).padStart(8, "0")}`;
        } else {
          const { data: codRpc, error: e1 } = await supabase.rpc("ventas_next_codigo", { p_serie: serie } as any);
          if (e1) throw e1;
          cod = String(codRpc);
          num = parseInt(cod.replace(`${serie}-`, ""), 10);
        }
        const { data: ins, error: e2 } = await (supabase.from("ventas_facturas") as any).insert({
          serie, numero: num, codigo: cod, tipo_comprobante: tipo,
          cliente_id: clienteId, cliente_ruc: cli?.documento ?? null,
          cliente_razon_social: cli?.nombre ?? null,
          fecha_emision: fecha, fecha_vencimiento: vence || null,
          moneda, tipo_cambio: tc ? Number(tc) : null,
          condicion_pago: condicion, observaciones: observ,
          prestamo,
        }).select("id").single();
        if (e2) throw e2;
        facId = ins.id;
      } else {
        const num = numero && !isNaN(parseInt(numero, 10)) ? parseInt(numero, 10) : undefined;
        const cod = num !== undefined ? `${serie}-${String(num).padStart(8, "0")}` : undefined;
        const { error } = await (supabase.from("ventas_facturas") as any).update({
          serie,
          ...(num !== undefined ? { numero: num, codigo: cod } : {}),
          tipo_comprobante: tipo, cliente_id: clienteId,
          cliente_ruc: cli?.documento ?? null, cliente_razon_social: cli?.nombre ?? null,
          fecha_emision: fecha, fecha_vencimiento: vence || null,
          moneda, tipo_cambio: tc ? Number(tc) : null,
          condicion_pago: condicion, observaciones: observ,
          prestamo,
        }).eq("id", facId);
        if (error) throw error;
        await supabase.from("ventas_factura_items").delete().eq("factura_id", facId);
      }
      const items = lineas.map((l, i) => ({
        factura_id: facId, producto_id: l.producto_id, descripcion: l.descripcion,
        cantidad_cajas: l.cantidad_cajas, empaque: l.empaque,
        unidad_precio: l.unidad_precio ?? "CAJA", precio_unitario: l.precio_unitario,
        descuento_pct: l.descuento_pct, tipo_afectacion_igv: "GRAVADO", orden: i + 1,
      }));
      const { error: eIt } = await (supabase.from("ventas_factura_items") as any).insert(items);
      if (eIt) throw eIt;
      toast.success(id ? "Factura actualizada" : "Factura creada");
      qc.invalidateQueries();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{id ? `Editar factura ${(facData?.cab as any)?.codigo ?? ""}` : "Nueva factura / boleta"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>Tipo comprobante</Label>
              <Select value={tipo} onValueChange={(v) => { setTipo(v); if (!id) setSerie(v === "FACTURA" ? "F001" : v === "BOLETA" ? "B001" : "F001"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FACTURA">FACTURA</SelectItem>
                  <SelectItem value="BOLETA">BOLETA</SelectItem>
                  <SelectItem value="NOTA_CREDITO">NOTA CRÉDITO</SelectItem>
                  <SelectItem value="NOTA_DEBITO">NOTA DÉBITO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Serie</Label><Input value={serie} onChange={e => setSerie(e.target.value)} /></div>
            <div><Label>Número</Label><Input type="number" value={numero} onChange={e => setNumero(e.target.value)} placeholder={id ? "" : "auto"} /></div>
            <div className="col-span-2"><Label>Cliente *</Label>
              <SearchSelect value={clienteId} onValueChange={setClienteId} options={cliOpts} placeholder="Buscar cliente" />
              {clienteSel && (
                <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5">
                  {clienteSel.documento && <div><span className="text-muted-foreground">RUC/DNI:</span> <span className="font-mono">{clienteSel.documento}</span></div>}
                  {clienteSel.direccion && <div><span className="text-muted-foreground">Dirección:</span> {clienteSel.direccion}</div>}
                </div>
              )}
            </div>
            <div><Label>Fecha emisión *</Label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
            <div><Label>Fecha vencimiento</Label><Input type="date" value={vence} onChange={e => setVence(e.target.value)} /></div>
            <div><Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="PEN">PEN</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Tipo cambio</Label><Input type="number" step="0.0001" value={tc} onChange={e => setTc(e.target.value)} /></div>
            <div className="col-span-2"><Label>Condición pago</Label><Input value={condicion} onChange={e => { condTouched.current = true; setCondicion(e.target.value); }} /></div>
            <div className="col-span-2 md:col-span-4"><Label>Observaciones</Label><Textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2} /></div>
            <div className="col-span-2 md:col-span-4 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2">
              <Checkbox id="prestamo-chk" checked={prestamo} onCheckedChange={(v) => setPrestamo(!!v)} />
              <Label htmlFor="prestamo-chk" className="cursor-pointer text-red-500 font-medium">Préstamo (marcar fila en rojo)</Label>
            </div>
          </div>
          <LineasEditor lineas={lineas} onChange={setLineas} productos={productosOpt} showUnidad />
          {(() => {
            const opGravada = lineas.reduce((s, l) => {
              const cant = (l.unidad_precio === "LATA") ? Number(l.cantidad_cajas || 0) * Number(l.empaque || 0) : Number(l.cantidad_cajas || 0);
              return s + cant * Number(l.precio_unitario || 0) * (1 - Number(l.descuento_pct || 0) / 100);
            }, 0);
            const igv = opGravada * 0.18;
            const total = opGravada + igv;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-md border bg-muted/30 p-3">
                <div><Label className="text-xs text-muted-foreground">Op. Gravada</Label><div className="text-lg font-semibold tabular-nums">{moneda} {formatNumber(opGravada)}</div></div>
                <div><Label className="text-xs text-muted-foreground">IGV (18%)</Label><Input value={formatNumber(igv)} readOnly className="font-semibold tabular-nums" /></div>
                <div><Label className="text-xs text-muted-foreground">Total</Label><div className="text-lg font-bold tabular-nums text-primary">{moneda} {formatNumber(total)}</div></div>
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar factura"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerFacturaDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["ventas-fac-detail", id],
    queryFn: async () => {
      const [cab, its] = await Promise.all([
        supabase.from("ventas_facturas").select("*").eq("id", id).maybeSingle(),
        supabase.from("ventas_factura_items").select("*").eq("factura_id", id).order("orden"),
      ]);
      return { cab: cab.data, its: its.data ?? [] };
    },
  });
  const cab: any = data?.cab;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Factura {cab?.codigo}</DialogTitle></DialogHeader>
        {cab && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Tipo</div><div className="font-medium">{cab.tipo_comprobante}</div></div>
              <div><div className="text-muted-foreground text-xs">Cliente</div><div className="font-medium">{cab.cliente_razon_social ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">RUC/DNI</div><div className="font-medium">{cab.cliente_ruc ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Fecha emisión</div><div className="font-medium">{formatDate(cab.fecha_emision)}</div></div>
              <div><div className="text-muted-foreground text-xs">Vencimiento</div><div>{formatDate(cab.fecha_vencimiento)}</div></div>
              <div><div className="text-muted-foreground text-xs">Condición</div><div>{cab.condicion_pago ?? "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Estado</div><EstadoBadge estado={cab.estado} /></div>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-right">Cajas</th>
                    <th className="px-2 py-2 text-right">Latas</th>
                    <th className="px-2 py-2 text-right">P.Unit</th>
                    <th className="px-2 py-2 text-right">Dscto%</th>
                    <th className="px-2 py-2 text-right">V.Venta</th>
                    <th className="px-2 py-2 text-right">IGV</th>
                    <th className="px-2 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.its.map((it: any) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2">{it.descripcion}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.cantidad_cajas), 3)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.cantidad_latas))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.precio_unitario))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.descuento_pct))}%</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.valor_venta))}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(Number(it.igv_linea))}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">{formatNumber(Number(it.importe))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30 text-sm">
                  <tr><td colSpan={7} className="px-2 py-1 text-right">Op. Gravada</td><td className="px-2 py-1 text-right tabular-nums">{formatNumber(Number(cab.op_gravada))}</td></tr>
                  <tr><td colSpan={7} className="px-2 py-1 text-right">IGV</td><td className="px-2 py-1 text-right tabular-nums">{formatNumber(Number(cab.igv))}</td></tr>
                  <tr><td colSpan={7} className="px-2 py-1 text-right font-semibold">Total</td><td className="px-2 py-1 text-right tabular-nums font-semibold">{cab.moneda} {formatNumber(Number(cab.total))}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
