import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { Plus, CheckCircle2, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { useRoles } from "@/hooks/use-role";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/inventario-fisico")({
  validateSearch: (s: Record<string, unknown>) => ({ id: typeof s.id === "string" ? s.id : undefined }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  if (search.id) return <DetalleInv id={search.id} />;
  return <Lista />;
}

function Lista() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [almacenId, setAlmacenId] = useState("");
  const [observacion, setObservacion] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editAlmacen, setEditAlmacen] = useState("");
  const [editObservacion, setEditObservacion] = useState("");
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data } = useQuery({
    queryKey: ["inv-fis-list"],
    queryFn: async () => {
      const [i, a] = await Promise.all([
        supabase.from("inventarios_fisicos").select("*").order("created_at", { ascending: false }),
        supabase.from("almacenes").select("*"),
      ]);
      return { invs: i.data ?? [], alm: a.data ?? [] };
    },
  });

  const almMap = useMemo(() => new Map((data?.alm ?? []).map((a) => [a.id, a])), [data]);

  const crear = useMutation({
    mutationFn: async () => {
      const { data: id, error } = await supabase.rpc("crear_inventario_fisico", {
        p_almacen: almacenId,
        p_observacion: observacion || undefined,
      });
      if (error) throw error;
      return id as unknown as string;
    },
    onSuccess: (id) => {
      toast.success("Toma de inventario creada");
      setOpen(false);
      setAlmacenId(""); setObservacion("");
      qc.invalidateQueries({ queryKey: ["inv-fis-list"] });
      window.location.href = `/inventario-fisico?id=${id}`;
    },
    onError: (e: any) => toast.error(e.message),
  });

  const actualizar = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const payload: any = { observacion: editObservacion || null };
      if (editing.estado === "BORRADOR" && editAlmacen) payload.almacen_id = editAlmacen;
      const { error } = await supabase.from("inventarios_fisicos").update(payload).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Toma actualizada");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["inv-fis-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      const { error: e1 } = await supabase.from("inventario_conteo").delete().eq("inventario_id", deleting.id);
      if (e1) throw e1;
      const { error } = await supabase.from("inventarios_fisicos").delete().eq("id", deleting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Toma eliminada");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["inv-fis-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });



  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Toma de Inventario Físico</h1>
          <p className="text-muted-foreground">Conteo por ubicación con generación automática de ajustes</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4 mr-2" /> Nueva toma</Button>
      </header>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">N°</th>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Almacén</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Observación</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(data?.invs ?? []).map((inv: any) => (
                <tr key={inv.id} className="border-t">
                  <td className="px-3 py-2 font-mono">#{inv.numero}</td>
                  <td className="px-3 py-2">{formatDate(inv.fecha)}</td>
                  <td className="px-3 py-2">{(almMap.get(inv.almacen_id) as any)?.nombre}</td>
                  <td className="px-3 py-2"><Badge variant={inv.estado === "APROBADO" ? "default" : "secondary"}>{inv.estado}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{inv.observacion ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Link to="/inventario-fisico" search={{ id: inv.id } as any}>
                        <Button variant="outline" size="sm"><ClipboardList className="size-4 mr-1" />Abrir</Button>
                      </Link>
                      {inv.estado !== "APROBADO" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(inv);
                              setEditAlmacen(inv.almacen_id);
                              setEditObservacion(inv.observacion ?? "");
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(inv)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>

                </tr>
              ))}
              {(data?.invs ?? []).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin tomas registradas</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva toma de inventario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Almacén</Label>
              <Select value={almacenId} onValueChange={setAlmacenId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {(data?.alm ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observación</Label>
              <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => crear.mutate()} disabled={!almacenId || crear.isPending}>
              {crear.isPending ? "Creando…" : "Crear y empezar conteo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar toma #{editing?.numero}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Almacén</Label>
              <Select value={editAlmacen} onValueChange={setEditAlmacen} disabled={editing?.estado !== "BORRADOR"}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {(data?.alm ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {editing?.estado !== "BORRADOR" && (
                <p className="text-xs text-muted-foreground mt-1">Solo editable en estado BORRADOR</p>
              )}
            </div>
            <div>
              <Label>Observación</Label>
              <Input value={editObservacion} onChange={(e) => setEditObservacion(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => actualizar.mutate()} disabled={actualizar.isPending}>
              {actualizar.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar toma #{deleting?.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán también todos los conteos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => eliminar.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function DetalleInv({ id }: { id: string }) {
  const qc = useQueryClient();
  const { canApprove } = useRoles();

  const { data } = useQuery({
    queryKey: ["inv-fis", id],
    queryFn: async () => {
      const [inv, conteo, lotes, ubic, alm, prod] = await Promise.all([
        supabase.from("inventarios_fisicos").select("*").eq("id", id).single(),
        supabase.from("inventario_conteo").select("*").eq("inventario_id", id),
        supabase.from("lotes").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("productos").select("*"),
      ]);
      return { inv: inv.data, conteo: conteo.data ?? [], lotes: lotes.data ?? [], ubic: ubic.data ?? [], alm: alm.data ?? [], prod: prod.data ?? [] };
    },
  });

  const loteMap = useMemo(() => new Map((data?.lotes ?? []).map((l) => [l.id, l])), [data]);
  const ubicMap = useMemo(() => new Map((data?.ubic ?? []).map((u) => [u.id, u])), [data]);
  const prodMap = useMemo(() => new Map((data?.prod ?? []).map((p) => [p.id, p])), [data]);

  const [edits, setEdits] = useState<Record<string, string>>({});

  const updateConteo = useMutation({
    mutationFn: async ({ conteoId, val }: { conteoId: string; val: number | null }) => {
      const { error } = await supabase.from("inventario_conteo").update({ cantidad_contada: val } as any).eq("id", conteoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inv-fis", id] }),
  });

  const enviarAprobacion = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventarios_fisicos").update({ estado: "PENDIENTE_APROBACION" } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Enviado a aprobación"); qc.invalidateQueries({ queryKey: ["inv-fis", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const aprobar = useMutation({
    mutationFn: async () => {
      const { data: n, error } = await supabase.rpc("aprobar_inventario", { p_inventario: id });
      if (error) throw error;
      return n;
    },
    onSuccess: (n) => { toast.success(`Inventario aprobado: ${n} ajustes generados`); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!data?.inv) return <div>Cargando…</div>;
  const inv = data.inv;
  const editable = inv.estado === "BORRADOR" || inv.estado === "EN_CONTEO";

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/inventario-fisico" search={{ id: undefined }} className="text-sm text-muted-foreground hover:underline">← Volver</Link>
          <h1 className="text-3xl font-bold tracking-tight">Toma #{inv.numero}</h1>
          <p className="text-muted-foreground">{formatDate(inv.fecha)} · {(data.alm.find((a) => a.id === inv.almacen_id) as any)?.nombre}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={inv.estado === "APROBADO" ? "default" : "secondary"}>{inv.estado}</Badge>
          {editable && <Button onClick={() => enviarAprobacion.mutate()}>Enviar a aprobación</Button>}
          {inv.estado === "PENDIENTE_APROBACION" && canApprove && (
            <Button onClick={() => aprobar.mutate()} disabled={aprobar.isPending}>
              <CheckCircle2 className="size-4 mr-2" /> Aprobar y generar ajustes
            </Button>
          )}
        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Ubicación</th>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-right px-3 py-2">Esperado</th>
                <th className="text-right px-3 py-2">Contado</th>
                <th className="text-right px-3 py-2">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {data.conteo
                .sort((a: any, b: any) => {
                  const ua: any = ubicMap.get(a.ubicacion_id);
                  const ub: any = ubicMap.get(b.ubicacion_id);
                  return (ua?.codigo ?? "").localeCompare(ub?.codigo ?? "");
                })
                .map((c: any) => {
                  const u: any = ubicMap.get(c.ubicacion_id);
                  const l: any = loteMap.get(c.lote_id);
                  const p: any = l ? prodMap.get(l.producto_id) : null;
                  const contadoEdit = edits[c.id] ?? (c.cantidad_contada !== null ? String(c.cantidad_contada) : "");
                  const contadoNum = contadoEdit === "" ? null : Number(contadoEdit);
                  const diff = contadoNum === null ? null : contadoNum - Number(c.cantidad_esperada);
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{u?.codigo}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l?.codigo_lote}</td>
                      <td className="px-3 py-2 text-xs">{p?.descripcion}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(c.cantidad_esperada)}</td>
                      <td className="px-3 py-2 text-right">
                        {editable ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 w-24 ml-auto text-right"
                            value={contadoEdit}
                            onChange={(e) => setEdits({ ...edits, [c.id]: e.target.value })}
                            onBlur={() => updateConteo.mutate({ conteoId: c.id, val: contadoEdit === "" ? null : Number(contadoEdit) })}
                          />
                        ) : (
                          formatNumber(c.cantidad_contada ?? 0)
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${diff === null ? "text-muted-foreground" : diff === 0 ? "" : diff > 0 ? "text-success" : "text-destructive"}`}>
                        {diff === null ? "—" : (diff > 0 ? "+" : "") + formatNumber(diff)}
                      </td>
                    </tr>
                  );
                })}
              {data.conteo.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin ítems para contar</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
