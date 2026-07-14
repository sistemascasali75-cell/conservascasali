import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRoles } from "@/hooks/use-role";
import { Plus, Pencil, Loader2, Search, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/insumos/catalogo")({
  component: CatalogoInsumos,
});

const EMPAQUES = ["UNIDAD", "CAJA", "PAQUETE", "BOLSA", "ROLLO", "BARRIL", "SACO", "BIN", "PALET"];
const UNIDADES = ["UND", "KG", "L", "M", "PZA"];

type Insumo = {
  id?: string; codigo: string; categoria: string; grupo: string; subcategoria: string;
  provee: string | null; insumo: string; formato: string | null;
  empaque: string; und_x_empaque: number; unidad: string;
  stock_min_und: number; saldo_inicial: number;
  descripcion: string | null; activo?: boolean;
};

const EMPTY: Insumo = {
  codigo: "", categoria: "", grupo: "GENERAL", subcategoria: "", provee: null, insumo: "",
  formato: null, empaque: "UNIDAD", und_x_empaque: 1, unidad: "UND",
  stock_min_und: 0, saldo_inicial: 0, descripcion: null,
};

function genCodigo(cat: string, sub: string) {
  const cm: Record<string, string> = {
    "Envases 1 Lb Tall": "E1LB",
    "Envases Media Libra (1/2 Lb)": "E1/2",
    "Insumos Producción": "PROD",
  };
  const p = cm[cat] ?? (cat.match(/\b\w/g)?.join("").slice(0, 4).toUpperCase() || "GEN");
  const base = sub.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25);
  return `${p}-${base}`;
}

function CatalogoInsumos() {
  const qc = useQueryClient();
  const { canManageCatalogs, isAdmin } = useRoles();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Insumo>(EMPTY);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterGrupo, setFilterGrupo] = useState("all");

  const { data: items = [] } = useQuery({
    queryKey: ["insumos-catalogo-full"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("insumos").select("*").order("categoria").order("grupo").order("subcategoria");
      if (error) throw error;
      return (data ?? []) as Insumo[];
    },
  });

  const categorias = useMemo(() => Array.from(new Set(items.map((i) => i.categoria))).sort(), [items]);
  const grupos = useMemo(() => Array.from(new Set(
    items.filter((i) => filterCat === "all" || i.categoria === filterCat).map((i) => i.grupo || "GENERAL")
  )).sort(), [items, filterCat]);
  const filtered = useMemo(() => items.filter((i) => {
    if (filterCat !== "all" && i.categoria !== filterCat) return false;
    if (filterGrupo !== "all" && (i.grupo || "GENERAL") !== filterGrupo) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![i.codigo, i.subcategoria, i.insumo, i.categoria, i.grupo].some((x) => (x ?? "").toLowerCase().includes(s))) return false;
    }
    return true;
  }), [items, q, filterCat, filterGrupo]);

  const mut = useMutation({
    mutationFn: async (payload: Insumo) => {
      const cleaned = {
        ...payload,
        codigo: payload.codigo || genCodigo(payload.categoria, payload.subcategoria),
        insumo: payload.insumo || payload.subcategoria,
        formato: payload.formato || null,
        provee: payload.provee || null,
        descripcion: payload.descripcion || null,
      };
      const q = (supabase as any).from("insumos");
      const res = payload.id ? await q.update(cleaned).eq("id", payload.id) : await q.insert(cleaned);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success(form.id ? "Actualizado" : "Creado");
      setOpen(false); setForm(EMPTY);
      qc.invalidateQueries({ queryKey: ["insumos-catalogo-full"] });
      qc.invalidateQueries({ queryKey: ["insumos-stock"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("insumos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Insumo eliminado");
      qc.invalidateQueries({ queryKey: ["insumos-catalogo-full"] });
      qc.invalidateQueries({ queryKey: ["insumos-stock"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo eliminar"),
  });

  const openNew = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (i: Insumo) => { setForm({ ...i }); setOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de insumos</h1>
          <p className="text-sm text-muted-foreground">{items.length} insumos · {categorias.length} categorías</p>
        </div>
        {canManageCatalogs && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="size-4" /> Nuevo insumo</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{form.id ? "Editar insumo" : "Nuevo insumo"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Input
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    list="categorias-list"
                    placeholder="Envases 1 Lb Tall / Insumos Producción…"
                  />
                  <datalist id="categorias-list">
                    {categorias.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label>Grupo</Label>
                  <Input
                    value={form.grupo}
                    onChange={(e) => setForm({ ...form, grupo: e.target.value.toUpperCase() })}
                    placeholder="EPINSA 109 / EVENSA(AP) / GENERAL…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Subcategoría</Label>
                  <Input
                    value={form.subcategoria}
                    onChange={(e) => {
                      const sub = e.target.value;
                      setForm({ ...form, subcategoria: sub, codigo: form.id ? form.codigo : genCodigo(form.categoria, sub) });
                    }}
                    placeholder="CARTON / PALE / TAPA…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Código (autogenerado)</Label>
                  <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Insumo / nombre largo</Label>
                  <Input value={form.insumo} onChange={(e) => setForm({ ...form, insumo: e.target.value.toUpperCase() })} placeholder="(usa subcategoría si está vacío)" />
                </div>
                <div className="space-y-1.5">
                  <Label>Provee (opcional)</Label>
                  <Input value={form.provee ?? ""} onChange={(e) => setForm({ ...form, provee: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Formato (opcional)</Label>
                  <Input value={form.formato ?? ""} onChange={(e) => setForm({ ...form, formato: e.target.value })} placeholder="108 / 109…" />
                </div>
                <div className="space-y-1.5">
                  <Label>Empaque</Label>
                  <Select value={form.empaque} onValueChange={(v) => setForm({ ...form, empaque: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EMPAQUES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Unidad</Label>
                  <Select value={form.unidad} onValueChange={(v) => setForm({ ...form, unidad: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Und × empaque</Label><Input type="number" min="1" value={form.und_x_empaque} onChange={(e) => setForm({ ...form, und_x_empaque: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Stock mínimo (und)</Label><Input type="number" min="0" value={form.stock_min_und} onChange={(e) => setForm({ ...form, stock_min_und: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Saldo inicial (und)</Label><Input type="number" min="0" value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: Number(e.target.value) })} disabled={!!form.id} /></div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Descripción</Label>
                  <Textarea rows={2} value={form.descripcion ?? ""} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
                  {mut.isPending && <Loader2 className="size-4 animate-spin" />} Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} insumos</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setFilterGrupo("all"); }}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterGrupo} onValueChange={setFilterGrupo}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Subcategoría</TableHead>
                <TableHead>Provee</TableHead>
                <TableHead>Empaque</TableHead>
                <TableHead className="text-right">Und/emp</TableHead>
                <TableHead className="text-right">Stock mín</TableHead>
                <TableHead>Unidad</TableHead>
                {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                  <TableCell className="text-xs">{i.categoria}</TableCell>
                  <TableCell className="text-xs"><Badge variant="outline">{i.grupo || "GENERAL"}</Badge></TableCell>
                  <TableCell className="font-medium">{i.subcategoria}</TableCell>
                  <TableCell className="text-xs">{i.provee ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{i.empaque}</Badge></TableCell>
                  <TableCell className="text-right">{i.und_x_empaque}</TableCell>
                  <TableCell className="text-right">{i.stock_min_und}</TableCell>
                  <TableCell className="text-xs">{i.unidad}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(i)} title="Editar">
                          <Pencil className="size-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" title="Eliminar" className="text-destructive hover:text-destructive">
                              <Trash2 className="size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar insumo?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará <b>{i.codigo}</b> — {i.subcategoria}. Esta acción no se puede deshacer y fallará si el insumo tiene movimientos registrados.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => i.id && delMut.mutate(i.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
