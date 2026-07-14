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
import { FileText, Plus, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatNumber } from "@/lib/format";
import { EstadoBadge } from "@/components/ventas/estado-badge";
import { LineasEditor, type LineaEditable } from "@/components/ventas/lineas-editor";
import { useRoles } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/ventas/cotizaciones")({
  component: CotizacionesPage,
});

function CotizacionesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useRoles();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>("__ALL__");
  const [busca, setBusca] = useState("");

  const { data } = useQuery({
    queryKey: ["ventas-cot-list"],
    queryFn: async () => {
      const [cot, cli] = await Promise.all([
        supabase.from("ventas_cotizaciones").select("*").order("created_at", { ascending: false }),
        supabase.from("clientes_proveedores").select("id,nombre,documento,direccion,condicion_pago,telefono,email,tipo").in("tipo", ["CLIENTE", "AMBOS"] as any).eq("activo", true).order("nombre"),
      ]);
      return { cot: cot.data ?? [], cli: cli.data ?? [] };
    },
  });

  const cliMap = useMemo(() => new Map((data?.cli ?? []).map((c: any) => [c.id, c])), [data]);

  const filtered = useMemo(() => {
    return (data?.cot ?? []).filter((c: any) => {
      if (filtroEstado !== "__ALL__" && c.estado !== filtroEstado) return false;
      if (busca) {
        const s = busca.toLowerCase();
        const cli = cliMap.get(c.cliente_id) as any;
        return (c.codigo?.toLowerCase().includes(s) || cli?.nombre?.toLowerCase().includes(s));
      }
      return true;
    });
  }, [data, filtroEstado, busca, cliMap]);

  const convertir = async (id: string) => {
    try {
      const { data: newId, error } = await supabase.rpc("ventas_convertir_cot_a_orden", { p_cot: id } as any);
      if (error) throw error;
      toast.success("Cotización convertida a orden");
      qc.invalidateQueries();
      navigate({ to: "/ventas/ordenes" });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar cotización?")) return;
    const { error } = await supabase.from("ventas_cotizaciones").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Eliminada"); qc.invalidateQueries({ queryKey: ["ventas-cot-list"] }); }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-700/30 text-blue-400 flex items-center justify-center">
            <FileText className="size-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cotizaciones</h1>
            <p className="text-muted-foreground">Documento comercial inicial · convertible a orden de venta</p>
          </div>
        </div>
        <Button onClick={() => { setEditingId(null); setOpen(true); }}>
          <Plus className="size-4 mr-1" /> Nueva cotización
        </Button>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <Input placeholder="Buscar por código o cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">Todos los estados</SelectItem>
              {["BORRADOR","ENVIADA","ACEPTADA","RECHAZADA","VENCIDA","CONVERTIDA"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <th className="px-3 py-2 text-left">Validez</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c: any) => {
                const cli = cliMap.get(c.cliente_id) as any;
                return (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono font-semibold">{c.codigo}</td>
                    <td className="px-3 py-2">{cli?.nombre ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(c.fecha_emision)}</td>
                    <td className="px-3 py-2">{formatDate(c.fecha_validez)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{c.moneda} {formatNumber(Number(c.total))}</td>
                    <td className="px-3 py-2 text-center"><EstadoBadge estado={c.estado} /></td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setEditingId(c.id); setOpen(true); }}>Ver</Button>
                        {c.estado !== "CONVERTIDA" && c.estado !== "RECHAZADA" && (
                          <Button size="sm" onClick={() => convertir(c.id)} title="Convertir a orden">
                            <ArrowRight className="size-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => eliminar(c.id)}>
                            <Trash2 className="size-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sin cotizaciones</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {open && <CotizacionDialog id={editingId} onClose={() => setOpen(false)} clientes={data?.cli ?? []} />}
    </div>
  );
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function CotizacionDialog({ id, onClose, clientes }: { id: string | null; onClose: () => void; clientes: any[] }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(today);
  const [validez, setValidez] = useState(addDays(today, 15));
  const [validezAuto, setValidezAuto] = useState(true);
  const [moneda, setMoneda] = useState("PEN");
  const [tc, setTc] = useState("");
  const [tcLoading, setTcLoading] = useState(false);
  const [condicion, setCondicion] = useState("CONTADO");
  const [descGlobal, setDescGlobal] = useState("0");
  const [observ, setObserv] = useState("");
  const [estado, setEstado] = useState("BORRADOR");
  const [lineas, setLineas] = useState<LineaEditable[]>([]);
  const hydrated = useRef(false);

  const { data: cotData } = useQuery({
    queryKey: ["ventas-cot-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const [cab, its] = await Promise.all([
        supabase.from("ventas_cotizaciones").select("*").eq("id", id!).maybeSingle(),
        supabase.from("ventas_cot_items").select("*").eq("cotizacion_id", id!).order("orden"),
      ]);
      return { cab: cab.data, its: its.data ?? [] };
    },
  });

  const { data: productos } = useQuery({
    queryKey: ["productos-activos"],
    queryFn: async () => (await supabase.from("productos").select("id,codigo_base,descripcion").eq("activo", true).order("descripcion")).data ?? [],
  });

  const productosOpt = useMemo(
    () => (productos ?? []).map((p: any) => ({ id: p.id, codigo_base: p.codigo_base, descripcion: p.descripcion, empaque_default: 48 })),
    [productos]
  );

  // Validez = fecha + 15 días (mientras el usuario no lo cambie manualmente)
  useEffect(() => {
    if (validezAuto && fecha) setValidez(addDays(fecha, 15));
  }, [fecha, validezAuto]);

  // Tipo de cambio USD → PEN del día (fuente pública)
  const fetchTC = async () => {
    setTcLoading(true);
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await r.json();
      const pen = j?.rates?.PEN;
      if (pen) { setTc(String(Number(pen).toFixed(4))); toast.success(`Tipo de cambio del día: ${Number(pen).toFixed(4)}`); }
      else toast.error("No se pudo obtener el tipo de cambio");
    } catch { toast.error("Error consultando tipo de cambio"); }
    finally { setTcLoading(false); }
  };

  // Auto-cargar TC al abrir nueva cotización
  useEffect(() => { if (!id && !tc) fetchTC(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (cotData?.cab && !hydrated.current) {
      hydrated.current = true;
      const c: any = cotData.cab;
      setClienteId(c.cliente_id); setFecha(c.fecha_emision);
      setValidez(c.fecha_validez ?? addDays(c.fecha_emision, 15));
      setValidezAuto(false);
      setMoneda(c.moneda); setTc(c.tipo_cambio?.toString() ?? ""); setCondicion(c.condicion_pago ?? "");
      setDescGlobal(String(c.descuento_global ?? 0)); setObserv(c.observaciones ?? ""); setEstado(c.estado);
      setLineas((cotData.its ?? []).map((it: any) => ({
        id: it.id, producto_id: it.producto_id, descripcion: it.descripcion,
        cantidad_cajas: Number(it.cantidad_cajas), empaque: it.empaque,
        precio_unitario: Number(it.precio_unitario), descuento_pct: Number(it.descuento_pct),
        unidad_precio: it.unidad_precio,
      })));
    }
  }, [cotData]);

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
  useEffect(() => {
    if (clienteSel && !condTouched.current && (!condicion || condicion === "CONTADO")) {
      if (clienteSel.condicion_pago) setCondicion(clienteSel.condicion_pago);
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
      let cotId = id;
      if (!cotId) {
        const { data: cod, error: e1 } = await supabase.rpc("ventas_next_codigo", { p_serie: "COT" } as any);
        if (e1) throw e1;
        const num = parseInt(String(cod).replace("COT-", ""), 10);
        const { data: ins, error: e2 } = await supabase.from("ventas_cotizaciones").insert({
          serie: "COT", numero: num, codigo: cod, cliente_id: clienteId,
          fecha_emision: fecha, fecha_validez: validez || null, moneda, tipo_cambio: tc ? Number(tc) : null,
          condicion_pago: condicion, descuento_global: Number(descGlobal) || 0, observaciones: observ, estado: estado as any,
        }).select("id").single();
        if (e2) throw e2;
        cotId = ins.id;
      } else {
        const { error } = await supabase.from("ventas_cotizaciones").update({
          cliente_id: clienteId, fecha_emision: fecha, fecha_validez: validez || null,
          moneda, tipo_cambio: tc ? Number(tc) : null, condicion_pago: condicion,
          descuento_global: Number(descGlobal) || 0, observaciones: observ, estado: estado as any,
        }).eq("id", cotId);
        if (error) throw error;
        await supabase.from("ventas_cot_items").delete().eq("cotizacion_id", cotId);
      }
      const items = lineas.map((l, i) => ({
        cotizacion_id: cotId, producto_id: l.producto_id, descripcion: l.descripcion,
        cantidad_cajas: l.cantidad_cajas, empaque: l.empaque, unidad_precio: l.unidad_precio ?? "CAJA",
        precio_unitario: l.precio_unitario, descuento_pct: l.descuento_pct, orden: i + 1,
      }));
      const { error: eIt } = await supabase.from("ventas_cot_items").insert(items);
      if (eIt) throw eIt;
      toast.success(id ? "Cotización actualizada" : "Cotización creada");
      qc.invalidateQueries();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{id ? `Cotización ${(cotData?.cab as any)?.codigo ?? ""}` : "Nueva cotización"}</DialogTitle></DialogHeader>
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
            <div><Label>Validez <span className="text-xs text-muted-foreground">(+15 días)</span></Label>
              <Input type="date" value={validez} onChange={e => { setValidez(e.target.value); setValidezAuto(false); }} />
            </div>
            <div><Label>Moneda</Label>
              <Select value={moneda} onValueChange={setMoneda}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="PEN">PEN</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Tipo cambio (USD→PEN)</Label>
              <div className="flex gap-2">
                <Input type="number" step="0.0001" value={tc} onChange={e => setTc(e.target.value)} />
                <Button type="button" variant="outline" size="sm" onClick={fetchTC} disabled={tcLoading} title="Obtener del día">
                  {tcLoading ? "…" : "↻"}
                </Button>
              </div>
            </div>
            <div><Label>Condición de pago</Label><Input value={condicion} onChange={e => { condTouched.current = true; setCondicion(e.target.value); }} placeholder="CONTADO / CREDITO_30" /></div>
            <div><Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["BORRADOR","ENVIADA","ACEPTADA","RECHAZADA","VENCIDA"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Descuento global</Label><Input type="number" step="0.01" value={descGlobal} onChange={e => setDescGlobal(e.target.value)} /></div>
            <div className="col-span-2 md:col-span-4"><Label>Observaciones</Label><Textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2} /></div>
          </div>
          <LineasEditor lineas={lineas} onChange={setLineas} productos={productosOpt} showUnidad />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar cotización"}</Button>
        </DialogFooter>
      </DialogContent>
      {nuevoClienteOpen && (
        <NuevoClienteDialog
          onClose={() => setNuevoClienteOpen(false)}
          onCreated={(nuevo) => {
            qc.invalidateQueries({ queryKey: ["ventas-cot-list"] });
            setClienteId(nuevo.id);
            if (nuevo.condicion_pago) { condTouched.current = false; setCondicion(nuevo.condicion_pago); }
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

