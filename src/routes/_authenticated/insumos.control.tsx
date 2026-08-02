import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRoles } from "@/hooks/use-role";
import { useAuthUser } from "@/hooks/use-auth";
import { formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { Pencil, Trash2, Search, FileSpreadsheet, FileText, Loader2, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/insumos/control")({
  component: ControlInsumos,
});

const TIPOS = [
  { v: "INGRESO_GUIA", l: "Ingreso con guía", clase: "INGRESO" },
  { v: "STOCK_INICIAL", l: "Stock inicial", clase: "INGRESO" },
  { v: "DEVOLUCION", l: "Devolución", clase: "INGRESO" },
  { v: "AJUSTE_POS", l: "Ajuste (+)", clase: "INGRESO" },
  { v: "PRODUCCION", l: "Producción", clase: "SALIDA" },
  { v: "MUESTRAS", l: "Muestras", clase: "SALIDA" },
  { v: "CALIBRACION", l: "Calibración", clase: "SALIDA" },
  { v: "MERMA", l: "Merma / Oxidadas", clase: "SALIDA" },
  { v: "PRESTAMO", l: "Préstamo", clase: "SALIDA" },
  { v: "AJUSTE_NEG", l: "Ajuste (−)", clase: "SALIDA" },
] as const;

type Mov = {
  id: string; fecha: string; insumo_id: string;
  categoria: string; grupo: string | null; subcategoria: string; codigo: string;
  tipo_mov: string; clase: "INGRESO" | "SALIDA"; cantidad: number;
  nro_guia: string | null; vale_num: string | null;
  proveedor: string | null; transportista: string | null;
  observacion: string | null; saldo_post: number | null;
  usuario_id: string | null; created_at: string;
};

type FormState = {
  id: string; fecha: string; insumo_id: string; tipo_mov: string;
  cantidad: string; nro_guia: string; vale_num: string;
  proveedor: string; transportista: string; observacion: string;
};

const EMPTY_FORM: FormState = {
  id: "", fecha: "", insumo_id: "", tipo_mov: "INGRESO_GUIA",
  cantidad: "", nro_guia: "", vale_num: "", proveedor: "", transportista: "",
  observacion: "",
};

const ALLOWED_EMAIL = "insumoscasali@gmail.com";

function ControlInsumos() {
  const qc = useQueryClient();
  const { isAdmin, isInsumos } = useRoles();
  const { user } = useAuthUser();
  const isAllowedEmail = (user?.email ?? "").toLowerCase() === ALLOWED_EMAIL;
  const canAccess = isAdmin || isInsumos || isAllowedEmail;
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterGrupo, setFilterGrupo] = useState("all");
  const [filterSub, setFilterSub] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: insumos = [] } = useQuery({
    queryKey: ["insumos-control-cat"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("insumos")
        .select("id,codigo,categoria,grupo,subcategoria,unidad")
        .order("categoria").order("grupo").order("subcategoria");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movs = [], isLoading } = useQuery({
    queryKey: ["insumos-control-movs"],
    queryFn: async () => {
      const pageSize = 1000;
      const all: Mov[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await (supabase as any)
          .from("vista_insumos_movimientos").select("*")
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data ?? []) as Mov[];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
      }
      return all;
    },
  });

  const categorias = useMemo(() => Array.from(new Set(movs.map((m) => m.categoria))).sort(), [movs]);
  const grupos = useMemo(() => Array.from(new Set(
    movs.filter((m) => filterCat === "all" || m.categoria === filterCat).map((m) => m.grupo ?? "GENERAL")
  )).sort(), [movs, filterCat]);
  const subs = useMemo(() => Array.from(new Set(
    movs.filter((m) =>
      (filterCat === "all" || m.categoria === filterCat) &&
      (filterGrupo === "all" || (m.grupo ?? "GENERAL") === filterGrupo)
    ).map((m) => m.subcategoria)
  )).sort(), [movs, filterCat, filterGrupo]);

  const filtered = useMemo(() => movs.filter((m) => {
    if (filterCat !== "all" && m.categoria !== filterCat) return false;
    if (filterGrupo !== "all" && (m.grupo ?? "GENERAL") !== filterGrupo) return false;
    if (filterSub !== "all" && m.subcategoria !== filterSub) return false;
    if (filterTipo !== "all" && m.tipo_mov !== filterTipo) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![m.codigo, m.categoria, m.grupo, m.subcategoria, m.nro_guia, m.vale_num, m.proveedor, m.transportista, m.observacion]
        .some((x: any) => (x ?? "").toString().toLowerCase().includes(s))) return false;
    }
    return true;
  }), [movs, q, filterCat, filterGrupo, filterSub, filterTipo]);

  // Group: Categoría → Grupo → Subcategoría
  const grouped = useMemo(() => {
    const tree = new Map<string, Map<string, Map<string, Mov[]>>>();
    filtered.forEach((m) => {
      const cat = m.categoria, gru = m.grupo ?? "GENERAL", sub = m.subcategoria;
      if (!tree.has(cat)) tree.set(cat, new Map());
      const gMap = tree.get(cat)!;
      if (!gMap.has(gru)) gMap.set(gru, new Map());
      const sMap = gMap.get(gru)!;
      if (!sMap.has(sub)) sMap.set(sub, []);
      sMap.get(sub)!.push(m);
    });
    return tree;
  }, [filtered]);

  const toggle = (k: string) => setCollapsed((s) => {
    const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n;
  });

  const openEdit = (m: Mov) => {
    setForm({
      id: m.id, fecha: m.fecha, insumo_id: m.insumo_id, tipo_mov: m.tipo_mov,
      cantidad: String(m.cantidad ?? ""), nro_guia: m.nro_guia ?? "",
      vale_num: m.vale_num ?? "", proveedor: m.proveedor ?? "",
      transportista: m.transportista ?? "", observacion: m.observacion ?? "",
    });
    setEditOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const cant = Number(form.cantidad);
      if (Number.isNaN(cant) || cant < 0) throw new Error("Cantidad inválida");
      const { error } = await (supabase as any).rpc("admin_editar_insumo_mov", {
        p_mov: form.id, p_fecha: form.fecha || null, p_insumo_id: form.insumo_id || null,
        p_tipo: form.tipo_mov, p_cantidad: cant,
        p_nro_guia: form.nro_guia || null, p_vale_num: form.vale_num || null,
        p_proveedor: form.proveedor || null, p_transportista: form.transportista || null,
        p_observacion: form.observacion || null,
        p_saldo_post: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento actualizado");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["insumos-control-movs"] });
      qc.invalidateQueries({ queryKey: ["insumos-stock"] });
      qc.invalidateQueries({ queryKey: ["insumos-movs-full"] });
      qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? "").startsWith("insumo") });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("admin_eliminar_insumo_mov", { p_mov: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento eliminado");
      qc.invalidateQueries({ queryKey: ["insumos-control-movs"] });
      qc.invalidateQueries({ queryKey: ["insumos-stock"] });
      qc.invalidateQueries({ queryKey: ["insumos-movs-full"] });
      qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? "").startsWith("insumo") });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const bulkDelMut = useMutation({
    mutationFn: async (ids: string[]) => {
      let ok = 0; const errors: string[] = [];
      for (const id of ids) {
        const { error } = await (supabase as any).rpc("admin_eliminar_insumo_mov", { p_mov: id });
        if (error) errors.push(error.message); else ok++;
      }
      return { ok, errors };
    },
    onSuccess: ({ ok, errors }) => {
      if (ok > 0) toast.success(`${ok} movimiento(s) eliminado(s)`);
      if (errors.length > 0) toast.error(`${errors.length} error(es): ${errors[0]}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["insumos-control-movs"] });
      qc.invalidateQueries({ queryKey: ["insumos-stock"] });
      qc.invalidateQueries({ queryKey: ["insumos-movs-full"] });
      qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? "").startsWith("insumo") });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const totalIng = filtered.filter((m) => m.clase === "INGRESO").reduce((a, m) => a + Number(m.cantidad || 0), 0);
  const totalSal = filtered.filter((m) => m.clase === "SALIDA").reduce((a, m) => a + Number(m.cantidad || 0), 0);

  const allShownSelected = filtered.length > 0 && filtered.every((m) => selected.has(m.id));
  const toggleSelectAllShown = () => {
    if (allShownSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((m) => m.id)));
  };
  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const exportar = async (kind: "pdf" | "xlsx") => {
    const src = selected.size > 0 ? filtered.filter((m) => selected.has(m.id)) : filtered;
    const headers = ["Fecha", "Categoría", "Grupo", "Subcategoría", "Código", "Tipo", "Clase", "Cantidad", "Saldo post.", "N° Guía", "N° Vale", "Proveedor", "Transportista", "Observación"];
    const rows = src.map((m) => [
      m.fecha, m.categoria, m.grupo ?? "", m.subcategoria, m.codigo,
      TIPOS.find((t) => t.v === m.tipo_mov)?.l ?? m.tipo_mov,
      m.clase, m.cantidad, m.saldo_post ?? "", m.nro_guia ?? "", m.vale_num ?? "",
      m.proveedor ?? "", m.transportista ?? "", m.observacion ?? "",
    ]);
    const ing = src.filter((m) => m.clase === "INGRESO").reduce((a, m) => a + Number(m.cantidad || 0), 0);
    const sal = src.filter((m) => m.clase === "SALIDA").reduce((a, m) => a + Number(m.cantidad || 0), 0);
    const opts = {
      title: "Control de movimientos de insumos",
      subtitle: `${src.length} movimientos${selected.size > 0 ? " (selección)" : ""} · ${new Date().toLocaleString("es-PE")}`,
      headers, rows, filename: `control-insumos.${kind}`,
      summary: [
        { label: "Movimientos", value: src.length },
        { label: "Ingresos", value: formatNumber(ing, 0) },
        { label: "Salidas", value: formatNumber(sal, 0) },
        { label: "Neto", value: formatNumber(ing - sal, 0) },
      ],
    };
    if (kind === "pdf") await exportPDF(opts);
    else await exportXLSX({ sheetName: "Control", ...opts });
  };

  if (!canAccess) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldAlert className="size-6 text-amber-500" /> Control de insumos</h1>
        <Card><CardContent className="pt-6 text-muted-foreground">
          Esta sección está reservada al rol <Badge>ADMIN</Badge> o al usuario autorizado <Badge variant="secondary">{ALLOWED_EMAIL}</Badge>. Permite editar y eliminar movimientos de insumos.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Control de insumos</h1>
          <p className="text-sm text-muted-foreground">
            Edita o elimina movimientos. Agrupado por <b>Categoría → Grupo → Subcategoría</b>.
            {filtered.length} movimientos · Ingresos {formatNumber(totalIng, 0)} · Salidas {formatNumber(totalSal, 0)}
            {selected.size > 0 ? ` · ${selected.size} seleccionados` : ""}.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={toggleSelectAllShown}>
            {allShownSelected ? "Limpiar selección" : `Seleccionar todos (${filtered.length})`}
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportar("xlsx")}><FileSpreadsheet className="size-4" /> Excel{selected.size > 0 ? ` (${selected.size})` : ""}</Button>
          <Button size="sm" variant="outline" onClick={() => exportar("pdf")}><FileText className="size-4" /> PDF{selected.size > 0 ? ` (${selected.size})` : ""}</Button>
          {selected.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" disabled={bulkDelMut.isPending}>
                  {bulkDelMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Eliminar seleccionados ({selected.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar {selected.size} movimiento(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminarán definitivamente los movimientos seleccionados. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => bulkDelMut.mutate(Array.from(selected))}>
                    Eliminar {selected.size}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Buscar código, guía, proveedor, obs…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setFilterGrupo("all"); setFilterSub("all"); }}>
              <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterGrupo} onValueChange={(v) => { setFilterGrupo(v); setFilterSub("all"); }}>
              <SelectTrigger><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSub} onValueChange={setFilterSub}>
              <SelectTrigger><SelectValue placeholder="Subcategoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las subcategorías</SelectItem>
                {subs.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Movimientos agrupados</CardTitle></CardHeader>
        <CardContent className="overflow-auto max-h-[70vh]">
          {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> : (
            <div className="space-y-3">
              {Array.from(grouped.entries()).map(([cat, gMap]) => {
                const catKey = `c:${cat}`;
                const catCol = collapsed.has(catKey);
                const catRows = Array.from(gMap.values()).flatMap((sMap) => Array.from(sMap.values()).flat());
                return (
                  <div key={cat} className="border rounded-md">
                    <button onClick={() => toggle(catKey)} className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted text-left">
                      {catCol ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                      <span className="font-semibold">{cat}</span>
                      <span className="text-xs text-muted-foreground ml-2">{catRows.length} movs</span>
                    </button>
                    {!catCol && (
                      <div className="p-2 space-y-2">
                        {Array.from(gMap.entries()).map(([gru, sMap]) => {
                          const grKey = `g:${cat}:${gru}`;
                          const grCol = collapsed.has(grKey);
                          const grRows = Array.from(sMap.values()).flat();
                          return (
                            <div key={gru} className="border rounded">
                              <button onClick={() => toggle(grKey)} className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/30 hover:bg-muted/60 text-left text-sm">
                                {grCol ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                                <Badge variant="outline">{gru}</Badge>
                                <span className="text-xs text-muted-foreground ml-2">{grRows.length} movs</span>
                              </button>
                              {!grCol && (
                                <div className="px-2 pb-2 space-y-3">
                                  {Array.from(sMap.entries()).map(([sub, rows]) => (
                                    <div key={sub}>
                                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b">
                                        {sub} · <span className="text-foreground">{rows.length}</span> movs
                                      </div>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-8">
                                              <Checkbox
                                                checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                                                onCheckedChange={(c) => setSelected((s) => {
                                                  const n = new Set(s);
                                                  if (c) rows.forEach((r) => n.add(r.id));
                                                  else rows.forEach((r) => n.delete(r.id));
                                                  return n;
                                                })}
                                              />
                                            </TableHead>
                                            <TableHead className="w-24">Fecha</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead className="text-right">Cantidad</TableHead>
                                            <TableHead className="text-right">Saldo</TableHead>
                                            <TableHead>Guía/Vale</TableHead>
                                            <TableHead>Proveedor</TableHead>
                                            <TableHead>Transp.</TableHead>
                                            <TableHead>Obs.</TableHead>
                                            <TableHead className="w-24 text-right">Acciones</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {rows.map((m) => (
                                            <TableRow key={m.id} data-state={selected.has(m.id) ? "selected" : undefined}>
                                              <TableCell><Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggleOne(m.id)} /></TableCell>
                                              <TableCell className="text-xs">{m.fecha}</TableCell>
                                              <TableCell className="text-xs">
                                                <Badge variant={m.clase === "INGRESO" ? "default" : "secondary"} className="text-[10px]">
                                                  {TIPOS.find((t) => t.v === m.tipo_mov)?.l ?? m.tipo_mov}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className={`text-right font-medium ${m.clase === "INGRESO" ? "text-emerald-600" : "text-rose-600"}`}>
                                                {formatNumber(Number(m.cantidad), 0)}
                                              </TableCell>
                                              <TableCell className="text-right text-muted-foreground">{m.saldo_post != null ? formatNumber(Number(m.saldo_post), 0) : "—"}</TableCell>
                                              <TableCell className="text-xs">{m.nro_guia ?? m.vale_num ?? "—"}</TableCell>
                                              <TableCell className="text-xs">{m.proveedor ?? "—"}</TableCell>
                                              <TableCell className="text-xs">{m.transportista ?? "—"}</TableCell>
                                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{m.observacion ?? ""}</TableCell>
                                              <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                  <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(m)}><Pencil className="size-3.5" /></Button>
                                                  <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                      <Button size="icon" variant="ghost" className="size-7 text-rose-600"><Trash2 className="size-3.5" /></Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                      <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                          Se eliminará el movimiento del {m.fecha} ({m.clase} {formatNumber(Number(m.cantidad), 0)}). Esta acción no se puede deshacer.
                                                        </AlertDialogDescription>
                                                      </AlertDialogHeader>
                                                      <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => delMut.mutate(m.id)}>Eliminar</AlertDialogAction>
                                                      </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                  </AlertDialog>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">Sin movimientos para los filtros aplicados</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar movimiento</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Insumo</Label>
              <SearchSelect
                value={form.insumo_id}
                onValueChange={(v) => setForm({ ...form, insumo_id: v })}
                options={(insumos as any[]).map((i) => ({
                  value: i.id,
                  label: `${i.codigo} · ${i.subcategoria}`,
                  description: `${i.categoria} · ${i.grupo ?? "GENERAL"}`,
                  searchText: `${i.codigo} ${i.subcategoria} ${i.categoria} ${i.grupo ?? ""}`,
                }))}
                placeholder="Selecciona insumo…"
              />
            </div>
            <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo_mov} onValueChange={(v) => setForm({ ...form, tipo_mov: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Cantidad</Label><Input type="number" min="0" step="any" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Saldo posterior</Label>
              <Input value="Se recalcula automáticamente" disabled />
            </div>
            <div className="space-y-1.5"><Label>N° guía</Label><Input value={form.nro_guia} onChange={(e) => setForm({ ...form, nro_guia: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>N° vale</Label><Input value={form.vale_num} onChange={(e) => setForm({ ...form, vale_num: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Proveedor</Label><Input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Transportista</Label><Input value={form.transportista} onChange={(e) => setForm({ ...form, transportista: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Observación</Label><Textarea rows={2} value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="size-4 animate-spin" />} Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
