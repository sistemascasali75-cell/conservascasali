import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Wand2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { decodeCodigo, CORTES, ESPECIES, LIQUIDOS, CORTES_LABEL, LIQUIDOS_LABEL } from "@/lib/codigo-producto";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/catalogos")({
  component: Catalogos,
});

function Catalogos() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Catálogos</h1>
        <p className="text-muted-foreground">Mantenimiento de tablas maestras</p>
      </header>
      <Tabs defaultValue="productos">
        <TabsList className="h-11 flex-wrap">
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="almacenes">Almacenes</TabsTrigger>
          <TabsTrigger value="ubicaciones">Ubicaciones</TabsTrigger>
          <TabsTrigger value="cp">Clientes / Proveedores</TabsTrigger>
          <TabsTrigger value="estados">Estados</TabsTrigger>
          <TabsTrigger value="mercados">Mercados</TabsTrigger>
        </TabsList>
        <TabsContent value="productos"><ProductosTab /></TabsContent>
        <TabsContent value="almacenes"><AlmacenesTab /></TabsContent>
        <TabsContent value="ubicaciones"><UbicacionesTab /></TabsContent>
        <TabsContent value="cp"><CPTab /></TabsContent>
        <TabsContent value="estados"><EstadosTab /></TabsContent>
        <TabsContent value="mercados"><MercadosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- helpers ----------
async function deleteCatalogo(tabla: string, id: string) {
  const { error } = await supabase.rpc("admin_delete_catalogo" as any, { p_tabla: tabla, p_id: id } as any);
  if (error) throw error;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" className="size-8" onClick={onEdit}><Pencil className="size-4" /></Button>
      <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="size-4" /></Button>
    </div>
  );
}

function confirmDelete(label: string) {
  return window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`);
}

// ---------- PRODUCTOS ----------
const PROD_DEFAULTS = {
  codigo_base: "", descripcion: "", especie: "BONITO",
  presentacion: "FILETE", liquido_gobierno: "ACEITE", envase: "1/2 LB",
  valor: "" as string | number,
};

const ESPECIE_OPTIONS = Array.from(new Set(Object.values(ESPECIES))).sort();
const CORTE_OPTIONS = Array.from(new Set(Object.values(CORTES))).sort();
const LIQUIDO_OPTIONS = Array.from(new Set(Object.values(LIQUIDOS))).sort();
const ENVASE_OPTIONS = ["1/2 LB", "1/2 LB-108", "1 LB TALL", "TINAPON"];

function ProductosTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(PROD_DEFAULTS);
  const [filter, setFilter] = useState("");

  const { data } = useQuery({
    queryKey: ["productos-cat"],
    queryFn: async () => (await supabase.from("productos").select("*").order("codigo_base")).data ?? [],
  });

  const decoded = decodeCodigo(form.codigo_base ?? "");

  const openNew = () => { setEditing(null); setForm(PROD_DEFAULTS); setOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ ...p }); setOpen(true); };

  const onCodigoChange = (raw: string) => {
    const value = raw.toUpperCase();
    const d = decodeCodigo(value);
    setForm((prev: any) => ({
      ...prev,
      codigo_base: value,
      especie: d.especie ?? prev.especie,
      presentacion: d.corte ?? prev.presentacion,
      liquido_gobierno: d.liquido ?? prev.liquido_gobierno,
      descripcion: d.isValid && (!prev.descripcion || prev.descripcion === decodeCodigo(prev.codigo_base).descripcion)
        ? d.descripcion
        : prev.descripcion,
    }));
  };

  const aplicarSugerencia = () => {
    if (!decoded.isValid) return toast.error("El código no es válido aún");
    setForm((prev: any) => ({
      ...prev,
      especie: decoded.especie!,
      presentacion: decoded.corte!,
      liquido_gobierno: decoded.liquido!,
      descripcion: decoded.descripcion,
    }));
    toast.success("Campos auto-rellenados desde el código");
  };

  const save = async () => {
    if (!form.codigo_base?.trim() || !form.descripcion?.trim()) return toast.error("Código y descripción requeridos");
    const valorNum = form.valor === "" || form.valor === null || form.valor === undefined
      ? null
      : Number(form.valor);
    if (valorNum !== null && (!Number.isFinite(valorNum) || valorNum < 0)) {
      return toast.error("Valor inválido");
    }
    const payload: any = {
      codigo_base: form.codigo_base.toUpperCase().trim(), descripcion: form.descripcion,
      especie: form.especie, presentacion: form.presentacion,
      liquido_gobierno: form.liquido_gobierno, envase: form.envase,
      valor: valorNum,
    };
    const { error } = editing
      ? await supabase.from("productos").update(payload).eq("id", editing.id)
      : await supabase.from("productos").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Producto actualizado" : "Producto creado");
    setOpen(false); qc.invalidateQueries({ queryKey: ["productos-cat"] });
  };

  const remove = async (p: any) => {
    if (!confirmDelete(`producto ${p.codigo_base}`)) return;
    try { await deleteCatalogo("productos", p.id); toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["productos-cat"] }); }
    catch (e: any) { toast.error(e.message ?? "No se pudo eliminar"); }
  };

  const filtered = (data ?? []).filter((p: any) => {
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return p.codigo_base.toLowerCase().includes(f) || p.descripcion.toLowerCase().includes(f);
  });

  return (
    <Card className="mt-4 p-4 space-y-3">
      <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
        <Input
          placeholder="Buscar por código o descripción…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="md:max-w-sm"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="size-4 mr-1" /> Nuevo producto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs uppercase tracking-wide">Código base</Label>
                    <Input
                      value={form.codigo_base}
                      onChange={(e) => onCodigoChange(e.target.value)}
                      placeholder="Ej: BREEAA"
                      className="font-mono text-lg tracking-widest uppercase"
                      maxLength={20}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={aplicarSugerencia}
                    disabled={!decoded.isValid}
                    title="Auto-rellenar campos según código"
                  >
                    <Wand2 className="size-4 mr-1" /> Aplicar
                  </Button>
                </div>
                <CodigoDecodificado decoded={decoded} />
              </div>

              <div>
                <Label>Descripción</Label>
                <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                {decoded.isValid && decoded.descripcion !== form.descripcion && (
                  <button
                    type="button"
                    className="text-xs text-primary underline mt-1"
                    onClick={() => setForm({ ...form, descripcion: decoded.descripcion })}
                  >
                    Usar sugerida: «{decoded.descripcion}»
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SelectField label="Especie" value={form.especie} onChange={(v) => setForm({ ...form, especie: v })} options={ESPECIE_OPTIONS} />
                <SelectField label="Presentación (corte)" value={form.presentacion} onChange={(v) => setForm({ ...form, presentacion: v })} options={CORTE_OPTIONS} />
                <SelectField label="Líquido de gobierno" value={form.liquido_gobierno} onChange={(v) => setForm({ ...form, liquido_gobierno: v })} options={LIQUIDO_OPTIONS} />
                <SelectField label="Envase" value={form.envase} onChange={(v) => setForm({ ...form, envase: v })} options={ENVASE_OPTIONS} />
                <div className="md:col-span-2">
                  <Label>Valor (S/.)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">S/.</span>
                    <Input
                      type="number" step="0.01" min="0"
                      className="pl-10"
                      value={form.valor ?? ""}
                      onChange={(e) => setForm({ ...form, valor: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Precio referencial del producto en soles</p>
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={save} className="w-full">{editing ? "Guardar cambios" : "Crear"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Código</th>
              <th className="text-left px-3 py-2">Descripción</th>
              <th className="text-left px-3 py-2">Especie</th>
              <th className="text-left px-3 py-2">Presentación</th>
              <th className="text-left px-3 py-2">Líquido</th>
              <th className="text-left px-3 py-2">Envase</th>
              <th className="text-right px-3 py-2">Valor (S/.)</th>
              <th className="text-left px-3 py-2">Empresa</th>
              <th className="text-right px-3 py-2 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const d = decodeCodigo(p.codigo_base);
              return (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono font-semibold tracking-widest">{p.codigo_base}</td>
                  <td className="px-3 py-2">{p.descripcion}</td>
                  <td className="px-3 py-2"><Badge variant="secondary">{p.especie}</Badge></td>
                  <td className="px-3 py-2">{CORTES_LABEL[p.presentacion] ?? p.presentacion}</td>
                  <td className="px-3 py-2">{LIQUIDOS_LABEL[p.liquido_gobierno] ?? p.liquido_gobierno}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.envase}</td>
                  <td className="px-3 py-2 text-right font-mono">{p.valor != null ? `S/. ${Number(p.valor).toFixed(2)}` : "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{d.empresaNombre ?? d.empresa ?? "—"}</td>
                  <td className="px-3 py-2"><RowActions onEdit={() => openEdit(p)} onDelete={() => remove(p)} /></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Sin productos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CodigoDecodificado({ decoded }: { decoded: ReturnType<typeof decodeCodigo> }) {
  const segs = [
    { letra: decoded.empresa ?? "··", label: "Empresa", value: decoded.empresaNombre ?? (decoded.empresa ? "Desconocida" : "—"), ok: !!decoded.empresaNombre, color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    { letra: decoded.corteLetra ?? "·", label: "Corte", value: decoded.corte ? (CORTES_LABEL[decoded.corte] ?? decoded.corte) : "—", ok: !!decoded.corte, color: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30" },
    { letra: decoded.especieLetra ?? "·", label: "Especie", value: decoded.especie ?? "—", ok: !!decoded.especie, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
    { letra: decoded.liquidoLetra ?? "·", label: "Líquido", value: decoded.liquido ? (LIQUIDOS_LABEL[decoded.liquido] ?? decoded.liquido) : "—", ok: !!decoded.liquido, color: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30" },
    { letra: decoded.correlativo ?? "·", label: "Correlativo", value: decoded.correlativo ?? "—", ok: !!decoded.correlativo, color: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-2">
        {segs.map((s, i) => (
          <div key={i} className={`rounded-md border px-2 py-2 text-center ${s.color}`}>
            <div className="font-mono text-2xl font-bold leading-none">{s.letra}</div>
            <div className="text-[10px] uppercase opacity-70 mt-1">{s.label}</div>
            <div className="text-xs font-medium truncate" title={s.value}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        {decoded.isValid ? (
          <><CheckCircle2 className="size-4 text-emerald-600" /><span className="text-muted-foreground">Sugerencia:</span><span className="font-medium">{decoded.descripcion}</span></>
        ) : decoded.raw.length === 0 ? (
          <span className="text-muted-foreground">Escribe un código (ej: BREEAA) para decodificarlo automáticamente.</span>
        ) : (
          <><AlertCircle className="size-4 text-amber-600" /><span className="text-muted-foreground">Código incompleto o letra no reconocida.</span></>
        )}
      </div>
    </div>
  );
}


// ---------- ALMACENES ----------
function AlmacenesTab() {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editName, setEditName] = useState("");

  const { data } = useQuery({
    queryKey: ["almacenes-cat"],
    queryFn: async () => (await supabase.from("almacenes").select("*").order("nombre")).data ?? [],
  });
  const save = async () => {
    if (!nombre.trim()) return;
    const { error } = await supabase.from("almacenes").insert({ nombre });
    if (error) return toast.error(error.message);
    toast.success("Almacén creado"); setNombre(""); qc.invalidateQueries({ queryKey: ["almacenes-cat"] });
  };
  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    const { error } = await supabase.from("almacenes").update({ nombre: editName }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Actualizado"); setEditing(null); qc.invalidateQueries({ queryKey: ["almacenes-cat"] });
  };
  const remove = async (a: any) => {
    if (!confirmDelete(`almacén ${a.nombre}`)) return;
    try { await deleteCatalogo("almacenes", a.id); toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["almacenes-cat"] }); }
    catch (e: any) { toast.error(e.message ?? "No se pudo eliminar"); }
  };

  return (
    <Card className="mt-4 p-4 space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Nombre del almacén" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Button onClick={save}><Plus className="size-4 mr-1" /> Agregar</Button>
      </div>
      <ul className="divide-y border rounded-md">
        {(data ?? []).map((a: any) => (
          <li key={a.id} className="py-2 px-3 flex items-center justify-between">
            <span>{a.nombre}</span>
            <RowActions onEdit={() => { setEditing(a); setEditName(a.nombre); }} onDelete={() => remove(a)} />
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar almacén</DialogTitle></DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          <DialogFooter><Button onClick={saveEdit} className="w-full">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- UBICACIONES ----------
function UbicacionesTab() {
  const qc = useQueryClient();
  const [almId, setAlmId] = useState("");
  const [seccion, setSeccion] = useState("");
  const [carril, setCarril] = useState("");
  const [pallets, setPallets] = useState("");
  const [observacion, setObservacion] = useState("");
  const [filterAlm, setFilterAlm] = useState<string>("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data } = useQuery({
    queryKey: ["ubic-cat"],
    queryFn: async () => {
      const [u, a] = await Promise.all([
        supabase.from("ubicaciones").select("*").order("codigo"),
        supabase.from("almacenes").select("*").order("nombre"),
      ]);
      return { ubic: u.data ?? [], alm: a.data ?? [] };
    },
  });

  const save = async () => {
    if (!almId || !seccion || !carril) return toast.error("Almacén, sección y carril son obligatorios");
    const codigo = `${seccion.toUpperCase()}-${carril}`;
    const { error } = await supabase.from("ubicaciones").insert({
      almacen_id: almId, codigo, seccion: seccion.toUpperCase(), carril,
      pallets: pallets ? Number(pallets) : null, observacion: observacion || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Ubicación creada");
    setSeccion(""); setCarril(""); setPallets(""); setObservacion("");
    qc.invalidateQueries({ queryKey: ["ubic-cat"] });
  };
  const openEdit = (u: any) => { setEditing(u); setEditForm({ ...u, pallets: u.pallets ?? "" }); };
  const saveEdit = async () => {
    const codigo = `${(editForm.seccion ?? "").toUpperCase()}-${editForm.carril}`;
    const { error } = await supabase.from("ubicaciones").update({
      almacen_id: editForm.almacen_id, codigo,
      seccion: (editForm.seccion ?? "").toUpperCase(), carril: editForm.carril,
      pallets: editForm.pallets ? Number(editForm.pallets) : null,
      observacion: editForm.observacion || null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Actualizado"); setEditing(null); qc.invalidateQueries({ queryKey: ["ubic-cat"] });
  };
  const remove = async (u: any) => {
    if (!confirmDelete(`ubicación ${u.codigo}`)) return;
    try { await deleteCatalogo("ubicaciones", u.id); toast.success("Eliminada"); qc.invalidateQueries({ queryKey: ["ubic-cat"] }); }
    catch (e: any) { toast.error(e.message ?? "No se pudo eliminar"); }
  };

  const ubic = (data?.ubic ?? []).filter((u: any) => !filterAlm || u.almacen_id === filterAlm);
  const totalPallets = ubic.reduce((s: number, u: any) => s + (u.pallets ?? 0), 0);

  return (
    <Card className="mt-4 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <Select value={almId} onValueChange={setAlmId}>
          <SelectTrigger><SelectValue placeholder="Almacén" /></SelectTrigger>
          <SelectContent>{(data?.alm ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Sección (A, B, L)" value={seccion} onChange={(e) => setSeccion(e.target.value)} />
        <Input placeholder="Carril (24)" value={carril} onChange={(e) => setCarril(e.target.value)} />
        <Input placeholder="Pallets" type="number" value={pallets} onChange={(e) => setPallets(e.target.value)} />
        <Input placeholder="Observación" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        <Button onClick={save}><Plus className="size-4 mr-1" /> Agregar</Button>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Label className="text-xs text-muted-foreground">Filtrar:</Label>
        <Select value={filterAlm || "all"} onValueChange={(v) => setFilterAlm(v === "all" ? "" : v)}>
          <SelectTrigger className="w-60 h-8"><SelectValue placeholder="Todos los almacenes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los almacenes</SelectItem>
            {(data?.alm ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{ubic.length} ubicaciones · {totalPallets} pallets capacidad</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Almacén</th><th className="text-left px-3 py-2">Sección</th>
              <th className="text-left px-3 py-2">Carril</th><th className="text-left px-3 py-2">Código</th>
              <th className="text-right px-3 py-2">Pallets</th><th className="text-left px-3 py-2">Observación</th>
              <th className="text-right px-3 py-2 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ubic.map((u: any) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{(data?.alm ?? []).find((a: any) => a.id === u.almacen_id)?.nombre}</td>
                <td className="px-3 py-2 font-mono">{u.seccion ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{u.carril ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{u.codigo}</td>
                <td className="px-3 py-2 text-right">{u.pallets ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{u.observacion ?? ""}</td>
                <td className="px-3 py-2"><RowActions onEdit={() => openEdit(u)} onDelete={() => remove(u)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar ubicación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Almacén</Label>
              <Select value={editForm.almacen_id ?? ""} onValueChange={(v) => setEditForm({ ...editForm, almacen_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(data?.alm ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Sección</Label><Input value={editForm.seccion ?? ""} onChange={(e) => setEditForm({ ...editForm, seccion: e.target.value })} /></div>
              <div><Label>Carril</Label><Input value={editForm.carril ?? ""} onChange={(e) => setEditForm({ ...editForm, carril: e.target.value })} /></div>
            </div>
            <div><Label>Pallets</Label><Input type="number" value={editForm.pallets ?? ""} onChange={(e) => setEditForm({ ...editForm, pallets: e.target.value })} /></div>
            <div><Label>Observación</Label><Input value={editForm.observacion ?? ""} onChange={(e) => setEditForm({ ...editForm, observacion: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="w-full">Guardar cambios</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- CLIENTES / PROVEEDORES ----------
function CPTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ nombre: "", tipo: "CLIENTE", documento: "" });
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data } = useQuery({
    queryKey: ["cp-cat"],
    queryFn: async () => (await supabase.from("clientes_proveedores").select("*").order("nombre")).data ?? [],
  });
  const save = async () => {
    if (!form.nombre.trim()) return;
    const { error } = await supabase.from("clientes_proveedores").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Creado"); setForm({ nombre: "", tipo: "CLIENTE", documento: "" });
    qc.invalidateQueries({ queryKey: ["cp-cat"] });
  };
  const openEdit = (c: any) => { setEditing(c); setEditForm({ ...c }); };
  const saveEdit = async () => {
    const { error } = await supabase.from("clientes_proveedores").update({
      nombre: editForm.nombre, tipo: editForm.tipo, documento: editForm.documento,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Actualizado"); setEditing(null); qc.invalidateQueries({ queryKey: ["cp-cat"] });
  };
  const remove = async (c: any) => {
    if (!confirmDelete(c.nombre)) return;
    try { await deleteCatalogo("clientes_proveedores", c.id); toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["cp-cat"] }); }
    catch (e: any) { toast.error(e.message ?? "No se pudo eliminar"); }
  };
  return (
    <Card className="mt-4 p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{["CLIENTE","PROVEEDOR","AMBOS"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="RUC / Doc" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
        <Button onClick={save}><Plus className="size-4 mr-1" /> Agregar</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th><th className="text-left px-3 py-2">Tipo</th>
              <th className="text-left px-3 py-2">Documento</th><th className="text-right px-3 py-2 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.nombre}</td>
                <td className="px-3 py-2">{c.tipo}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.documento ?? "—"}</td>
                <td className="px-3 py-2"><RowActions onEdit={() => openEdit(c)} onDelete={() => remove(c)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre</Label><Input value={editForm.nombre ?? ""} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} /></div>
            <div><Label>Tipo</Label>
              <Select value={editForm.tipo ?? "CLIENTE"} onValueChange={(v) => setEditForm({ ...editForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["CLIENTE","PROVEEDOR","AMBOS"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>RUC / Doc</Label><Input value={editForm.documento ?? ""} onChange={(e) => setEditForm({ ...editForm, documento: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="w-full">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- ESTADOS ----------
function EstadosTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ nombre: "", observacion: "", orden: 0 });
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data } = useQuery({
    queryKey: ["estados-cat"],
    queryFn: async () => (await supabase.from("estados" as any).select("*").order("orden")).data ?? [],
  });

  const save = async () => {
    if (!form.nombre.trim()) return toast.error("El nombre es obligatorio");
    const payload = {
      nombre: form.nombre.trim().toUpperCase().replace(/\s+/g, "_"),
      observacion: form.observacion || null,
      orden: Number(form.orden) || 0,
    };
    const { error } = await supabase.from("estados" as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Estado creado");
    setForm({ nombre: "", observacion: "", orden: 0 });
    qc.invalidateQueries({ queryKey: ["estados-cat"] });
  };
  const openEdit = (e: any) => { setEditing(e); setEditForm({ ...e }); };
  const saveEdit = async () => {
    const { error } = await supabase.from("estados" as any).update({
      observacion: editForm.observacion || null,
      orden: Number(editForm.orden) || 0,
    }).eq("nombre", editing.nombre);
    if (error) return toast.error(error.message);
    toast.success("Actualizado"); setEditing(null); qc.invalidateQueries({ queryKey: ["estados-cat"] });
  };
  const remove = async (e: any) => {
    if (!confirmDelete(`estado ${e.nombre}`)) return;
    try { await deleteCatalogo("estados", e.nombre); toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["estados-cat"] }); }
    catch (err: any) { toast.error(err.message ?? "No se pudo eliminar"); }
  };

  return (
    <Card className="mt-4 p-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Catálogo de estados de lote. Se usa como lista desplegable en Movimientos (campo Estado del lote).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input placeholder="Nombre (ej: DISPONIBLE)" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <Input placeholder="Orden" type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })} />
        <div className="md:col-span-2">
          <Textarea placeholder="Observación" rows={1} value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
        </div>
        <Button onClick={save}><Plus className="size-4 mr-1" /> Agregar</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-16">Orden</th>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Observación</th>
              <th className="text-right px-3 py-2 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e: any) => (
              <tr key={e.nombre} className="border-t">
                <td className="px-3 py-2 font-mono">{e.orden}</td>
                <td className="px-3 py-2 font-semibold">{e.nombre}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.observacion ?? "—"}</td>
                <td className="px-3 py-2"><RowActions onEdit={() => openEdit(e)} onDelete={() => remove(e)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar estado · {editing?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Orden</Label><Input type="number" value={editForm.orden ?? 0} onChange={(e) => setEditForm({ ...editForm, orden: e.target.value })} /></div>
            <div><Label>Observación</Label><Textarea rows={3} value={editForm.observacion ?? ""} onChange={(e) => setEditForm({ ...editForm, observacion: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="w-full">Guardar cambios</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- MERCADOS ----------
function MercadosTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ mercado: "", nivel: "", datos: "" });
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data } = useQuery({
    queryKey: ["mercados-cat"],
    queryFn: async () => (await supabase.from("mercados" as any).select("*").order("mercado")).data ?? [],
  });

  const save = async () => {
    if (!form.mercado.trim()) return toast.error("El nombre del mercado es obligatorio");
    const payload = {
      mercado: form.mercado.trim().toUpperCase(),
      nivel: form.nivel?.trim() || null,
      datos: form.datos?.trim() || null,
    };
    const { error } = await supabase.from("mercados" as any).insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Mercado creado");
    setForm({ mercado: "", nivel: "", datos: "" });
    qc.invalidateQueries({ queryKey: ["mercados-cat"] });
  };
  const openEdit = (m: any) => { setEditing(m); setEditForm({ ...m }); };
  const saveEdit = async () => {
    const { error } = await supabase.from("mercados" as any).update({
      mercado: (editForm.mercado ?? "").trim().toUpperCase(),
      nivel: editForm.nivel?.trim() || null,
      datos: editForm.datos?.trim() || null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Actualizado"); setEditing(null);
    qc.invalidateQueries({ queryKey: ["mercados-cat"] });
  };
  const remove = async (m: any) => {
    if (!confirmDelete(`mercado ${m.mercado}`)) return;
    const { error } = await supabase.from("mercados" as any).delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    qc.invalidateQueries({ queryKey: ["mercados-cat"] });
  };

  return (
    <Card className="mt-4 p-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Catálogo de mercados. Se usa como lista desplegable en Movimientos (campo Mercado).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input placeholder="Mercado (ej: NACIONAL)" value={form.mercado} onChange={(e) => setForm({ ...form, mercado: e.target.value })} />
        <Input placeholder="Nivel (ej: Local)" value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value })} />
        <div className="md:col-span-2">
          <Textarea placeholder="Datos / observación" rows={1} value={form.datos} onChange={(e) => setForm({ ...form, datos: e.target.value })} />
        </div>
        <Button onClick={save}><Plus className="size-4 mr-1" /> Agregar</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Mercado</th>
              <th className="text-left px-3 py-2">Nivel</th>
              <th className="text-left px-3 py-2">Datos</th>
              <th className="text-right px-3 py-2 w-24">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((m: any) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2 font-semibold">{m.mercado}</td>
                <td className="px-3 py-2"><Badge variant="secondary">{m.nivel ?? "—"}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{m.datos ?? "—"}</td>
                <td className="px-3 py-2"><RowActions onEdit={() => openEdit(m)} onDelete={() => remove(m)} /></td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sin mercados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar mercado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Mercado</Label><Input value={editForm.mercado ?? ""} onChange={(e) => setEditForm({ ...editForm, mercado: e.target.value })} /></div>
            <div><Label>Nivel</Label><Input value={editForm.nivel ?? ""} onChange={(e) => setEditForm({ ...editForm, nivel: e.target.value })} /></div>
            <div><Label>Datos</Label><Textarea rows={3} value={editForm.datos ?? ""} onChange={(e) => setEditForm({ ...editForm, datos: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="w-full">Guardar cambios</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
