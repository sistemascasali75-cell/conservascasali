import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { Plus, Search, FileSpreadsheet, FileText, Ticket, CheckCircle2, XCircle, Link2, Pencil, Trash2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/control-vales")({
  component: ControlVales,
});

type Vale = {
  id: string;
  tipo: string;
  fecha: string;
  nro_vale: number;
  descripcion: string | null;
  estado: string;
  autorizado: string | null;
  observacion: string | null;
};

const ESTADOS = ["EMITIDO", "USADO", "ANULADO", "PENDIENTE"] as const;

const ESTADO_STYLES: Record<string, string> = {
  EMITIDO: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  USADO: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  ANULADO: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  PENDIENTE: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

function EstadoBadge({ e }: { e: string }) {
  return <Badge variant="outline" className={ESTADO_STYLES[e] ?? "bg-muted"}>{e}</Badge>;
}

function ControlVales() {
  const qc = useQueryClient();
  const { canManageCatalogs, isInsumos, isAdmin } = useRoles();
  const canEdit = canManageCatalogs || isInsumos || isAdmin;

  const [q, setQ] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterAutorizado, setFilterAutorizado] = useState("all");
  const [selectedNro, setSelectedNro] = useState<number | null>(null);
  const [editing, setEditing] = useState<Partial<Vale> | null>(null);
  const [open, setOpen] = useState(false);

  const { data: vales = [] } = useQuery({
    queryKey: ["vales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vales" as any).select("*").order("nro_vale", { ascending: false }).order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Vale[];
    },
  });

  // Movimientos con nro_vale (para vincular)
  const { data: movs = [] } = useQuery({
    queryKey: ["vales-movs"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        (supabase as any).from("movimientos").select("id,fecha,tipo_mov,clase,nro_vale,observacion,codigo_lote:lotes(codigo_lote)").not("nro_vale", "is", null).order("fecha", { ascending: false }).limit(2000),
        (supabase as any).from("insumos_movimientos").select("id,fecha,tipo_mov,clase,vale_num,observacion,proveedor,cantidad").not("vale_num", "is", null).order("fecha", { ascending: false }).limit(2000),
      ]);
      const m1 = (a.data ?? []).map((r: any) => ({ ...r, origen: "MOVIMIENTOS", nro: String(r.nro_vale).replace(/\D/g, "") }));
      const m2 = (b.data ?? []).map((r: any) => ({ ...r, origen: "INSUMOS", nro: String(r.vale_num).replace(/\D/g, ""), nro_vale: r.vale_num }));
      return [...m1, ...m2];
    },
  });

  const movsByNro = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const m of movs) {
      const k = m.nro;
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return map;
  }, [movs]);

  // Agrupamos vales por nro_vale (pueden repetirse líneas)
  const grouped = useMemo(() => {
    const map = new Map<number, Vale[]>();
    for (const v of vales) {
      if (!map.has(v.nro_vale)) map.set(v.nro_vale, []);
      map.get(v.nro_vale)!.push(v);
    }
    return Array.from(map.entries())
      .map(([nro, items]) => {
        const first = items[0];
        return {
          nro_vale: nro,
          fecha: first.fecha,
          items,
          lineas: items.length,
          autorizado: first.autorizado,
          descripciones: items.map((i) => i.descripcion).filter(Boolean).join(" · ") || null,
          estados: Array.from(new Set(items.map((i) => i.estado))),
          movs: movsByNro.get(String(nro)) ?? [],
        };
      })
      .sort((a, b) => b.nro_vale - a.nro_vale);
  }, [vales, movsByNro]);

  const autorizados = useMemo(
    () => Array.from(new Set(vales.map((v) => v.autorizado).filter(Boolean))).sort() as string[],
    [vales],
  );

  const filtered = useMemo(() => {
    return grouped.filter((g) => {
      if (filterEstado !== "all" && !g.estados.includes(filterEstado)) return false;
      if (filterAutorizado !== "all" && g.autorizado !== filterAutorizado) return false;
      if (q) {
        const s = q.toLowerCase();
        const hay = [String(g.nro_vale), g.autorizado ?? "", g.descripciones ?? "", g.fecha].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [grouped, q, filterEstado, filterAutorizado]);

  const stats = useMemo(() => {
    const totalNros = grouped.length;
    const emitidos = grouped.filter((g) => g.estados.includes("EMITIDO") && !g.estados.includes("ANULADO")).length;
    const anulados = grouped.filter((g) => g.estados.every((e) => e === "ANULADO")).length;
    const vinculados = grouped.filter((g) => g.movs.length > 0).length;
    const sinMov = grouped.filter((g) => g.movs.length === 0 && !g.estados.every((e) => e === "ANULADO")).length;
    const proxNro = Math.max(0, ...vales.map((v) => v.nro_vale)) + 1;
    return { totalNros, emitidos, anulados, vinculados, sinMov, proxNro };
  }, [grouped, vales]);

  const selected = useMemo(() => grouped.find((g) => g.nro_vale === selectedNro) ?? null, [grouped, selectedNro]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const payload: any = {
        tipo: editing.tipo ?? "SALIDA",
        fecha: editing.fecha ?? new Date().toISOString().slice(0, 10),
        nro_vale: editing.nro_vale,
        descripcion: editing.descripcion || null,
        estado: editing.estado ?? "EMITIDO",
        autorizado: editing.autorizado || null,
        observacion: editing.observacion || null,
      };
      if (!payload.nro_vale && payload.nro_vale !== 0) throw new Error("Número de vale requerido");
      if (editing.id) {
        const { error } = await (supabase as any).from("vales").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("vales").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Vale guardado");
      setOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["vales"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const anularMut = useMutation({
    mutationFn: async (nro: number) => {
      const { error } = await (supabase as any).from("vales").update({ estado: "ANULADO" }).eq("nro_vale", nro);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vale anulado"); qc.invalidateQueries({ queryKey: ["vales"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("vales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["vales"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const openNew = () => { setEditing({ tipo: "SALIDA", fecha: new Date().toISOString().slice(0, 10), estado: "EMITIDO", nro_vale: stats.proxNro }); setOpen(true); };
  const openEdit = (v: Vale) => { setEditing({ ...v }); setOpen(true); };

  const exportar = async (kind: "pdf" | "xlsx") => {
    const headers = ["N° Vale", "Fecha", "Estado", "Autorizado", "Líneas", "Descripción", "Movimientos vinc."];
    const rows = filtered.map((g) => [g.nro_vale, g.fecha, g.estados.join("/"), g.autorizado ?? "—", g.lineas, g.descripciones ?? "", g.movs.length]);
    const opts = {
      title: "Control de vales de salida",
      subtitle: `${filtered.length} vales · ${new Date().toLocaleString("es-PE")}`,
      headers, rows, filename: `control-vales.${kind}`,
      summary: [
        { label: "Total N°", value: stats.totalNros },
        { label: "Emitidos", value: stats.emitidos },
        { label: "Anulados", value: stats.anulados },
        { label: "Con movimientos", value: stats.vinculados },
        { label: "Sin movimientos", value: stats.sinMov },
      ],
    };
    if (kind === "pdf") await exportPDF(opts);
    else await exportXLSX({ sheetName: "Vales", ...opts });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Ticket className="size-6" /> Control de vales</h1>
          <p className="text-sm text-muted-foreground">Seguimiento vale por vale. Vincula automáticamente con los movimientos que llevan el mismo N° de vale.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportar("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exportar("pdf")}><FileText className="size-4" /> PDF</Button>
          {canEdit && <Button size="sm" onClick={openNew}><Plus className="size-4" /> Nuevo vale</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: "Total vales", v: stats.totalNros, cn: "" },
          { l: "Emitidos", v: stats.emitidos, cn: "text-blue-600" },
          { l: "Con movimientos", v: stats.vinculados, cn: "text-emerald-600" },
          { l: "Sin movimientos", v: stats.sinMov, cn: "text-amber-600" },
          { l: "Anulados", v: stats.anulados, cn: "text-red-600" },
        ].map((k) => (
          <Card key={k.l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className={"text-2xl font-bold " + k.cn}>{k.v}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Listado de vales ({filtered.length})</CardTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                <Input placeholder="Buscar N°, autorizado, descripción…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
              </div>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterAutorizado} onValueChange={setFilterAutorizado}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los autorizados</SelectItem>
                  {autorizados.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Autorizado</TableHead>
                  <TableHead className="text-center">Líneas</TableHead>
                  <TableHead className="text-center">Mov.</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g) => {
                  const active = selectedNro === g.nro_vale;
                  const linked = g.movs.length > 0;
                  return (
                    <TableRow
                      key={g.nro_vale}
                      onClick={() => setSelectedNro(g.nro_vale)}
                      className={"cursor-pointer " + (active ? "bg-accent" : "")}
                    >
                      <TableCell className="font-bold">{g.nro_vale}</TableCell>
                      <TableCell className="text-xs">{formatDate(g.fecha)}</TableCell>
                      <TableCell><div className="flex flex-wrap gap-1">{g.estados.map((e) => <EstadoBadge key={e} e={e} />)}</div></TableCell>
                      <TableCell className="text-xs">{g.autorizado ?? "—"}</TableCell>
                      <TableCell className="text-center">{g.lineas}</TableCell>
                      <TableCell className="text-center">
                        {linked
                          ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30" variant="outline"><Link2 className="size-3 mr-1" />{g.movs.length}</Badge>
                          : <Badge variant="outline" className="text-muted-foreground"><AlertCircle className="size-3 mr-1" />0</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">{g.descripciones ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin vales</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected ? <>Vale N° <span className="font-mono">{selected.nro_vale}</span></> : "Selecciona un vale"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected && <p className="text-sm text-muted-foreground">Haz clic en un vale del listado para ver su detalle y los movimientos vinculados por N° de vale.</p>}
            {selected && (
              <Tabs defaultValue="detalle">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="detalle">Detalle ({selected.lineas})</TabsTrigger>
                  <TabsTrigger value="mov">Movimientos ({selected.movs.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="detalle" className="space-y-2 mt-3">
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Fecha: <b>{formatDate(selected.fecha)}</b></span>
                    <span>Autorizado: <b>{selected.autorizado ?? "—"}</b></span>
                  </div>
                  <div className="space-y-2 max-h-[45vh] overflow-auto">
                    {selected.items.map((it, i) => (
                      <div key={it.id} className="border rounded-md p-2 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">Línea {i + 1}</span>
                          <div className="flex items-center gap-1">
                            <EstadoBadge e={it.estado} />
                            {canEdit && (
                              <>
                                <Button size="icon" variant="ghost" className="size-6" onClick={() => openEdit(it)}><Pencil className="size-3" /></Button>
                                <Button size="icon" variant="ghost" className="size-6 text-red-600" onClick={() => confirm("¿Eliminar esta línea?") && delMut.mutate(it.id)}><Trash2 className="size-3" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                        {it.descripcion && <div className="text-muted-foreground">{it.descripcion}</div>}
                        {it.observacion && <div className="text-muted-foreground italic">{it.observacion}</div>}
                      </div>
                    ))}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing({ tipo: "SALIDA", fecha: selected.fecha, estado: "EMITIDO", nro_vale: selected.nro_vale, autorizado: selected.autorizado }); setOpen(true); }}>
                        <Plus className="size-4" /> Agregar línea
                      </Button>
                      {!selected.estados.every((e) => e === "ANULADO") && (
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => confirm(`¿Anular vale ${selected.nro_vale}?`) && anularMut.mutate(selected.nro_vale)}>
                          <XCircle className="size-4" /> Anular
                        </Button>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="mov" className="mt-3">
                  {selected.movs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay movimientos registrados con este N° de vale.</p>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-auto">
                      {selected.movs.map((m: any) => (
                        <div key={m.origen + m.id} className="border rounded-md p-2 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono">{formatDate(m.fecha)}</span>
                            <Badge variant="outline" className="text-[10px]">{m.origen}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{m.tipo_mov}</span>
                            {m.clase && <Badge variant={m.clase === "INGRESO" ? "default" : "secondary"} className="text-[10px]">{m.clase}</Badge>}
                          </div>
                          {m.codigo_lote?.codigo_lote && <div className="text-muted-foreground">Lote: <span className="font-mono">{m.codigo_lote.codigo_lote}</span></div>}
                          {m.cantidad != null && <div className="text-muted-foreground">Cantidad: {m.cantidad}</div>}
                          {m.proveedor && <div className="text-muted-foreground">Prov.: {m.proveedor}</div>}
                          {m.observacion && <div className="text-muted-foreground italic">{m.observacion}</div>}
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground pt-2 flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-emerald-600" /> Vinculación automática por N° de vale.
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar vale" : "Nuevo vale"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>N° Vale</Label><Input type="number" value={editing.nro_vale ?? ""} onChange={(e) => setEditing({ ...editing, nro_vale: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={editing.fecha ?? ""} onChange={(e) => setEditing({ ...editing, fecha: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={editing.tipo ?? "SALIDA"} onValueChange={(v) => setEditing({ ...editing, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALIDA">SALIDA</SelectItem>
                      <SelectItem value="INGRESO">INGRESO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={editing.estado ?? "EMITIDO"} onValueChange={(v) => setEditing({ ...editing, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Autorizado por</Label><Input value={editing.autorizado ?? ""} onChange={(e) => setEditing({ ...editing, autorizado: e.target.value })} placeholder="Nombre del responsable" /></div>
              <div className="space-y-1.5"><Label>Descripción</Label><Input value={editing.descripcion ?? ""} onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })} placeholder="Ej: MARCOS DE MADERA" /></div>
              <div className="space-y-1.5"><Label>Observación</Label><Textarea rows={2} value={editing.observacion ?? ""} onChange={(e) => setEditing({ ...editing, observacion: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
