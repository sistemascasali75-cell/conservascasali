import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-role";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowDownToLine, ArrowUpFromLine, Shuffle, AlertTriangle, Plus, Minus, Eye, Pencil, Trash2,
  FileDown, ShieldAlert, Package, Warehouse, MapPin, Users, Tag, Layers,
} from "lucide-react";
import { formatNumber } from "@/lib/format";
import { exportXLSX } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPanel,
});

const TIPO_ICON: Record<string, any> = {
  ENTRADA: ArrowDownToLine, SALIDA: ArrowUpFromLine, TRASLADO: Shuffle,
  MERMA: AlertTriangle, AJUSTE_POSITIVO: Plus, AJUSTE_NEGATIVO: Minus,
};
const TIPO_TONE: Record<string, string> = {
  ENTRADA: "bg-success/15 text-success border-success/30",
  SALIDA: "bg-primary/15 text-primary border-primary/30",
  TRASLADO: "bg-muted text-foreground border-border",
  MERMA: "bg-destructive/15 text-destructive border-destructive/30",
  AJUSTE_POSITIVO: "bg-success/15 text-success border-success/30",
  AJUSTE_NEGATIVO: "bg-destructive/15 text-destructive border-destructive/30",
};

function AdminPanel() {
  const { isAdmin, isLoading: rolesLoading } = useRoles();
  const [tab, setTab] = useState("movimientos");

  if (rolesLoading) return <div className="text-muted-foreground p-4">Cargando…</div>;
  if (!isAdmin) return <Navigate to="/" />;

  return (
    <div className="space-y-4 sm:space-y-6 pb-32">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="size-5 sm:size-7 text-destructive shrink-0" />
            <span className="truncate">Panel administrativo</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Control total · movimientos y catálogos</p>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-2 px-2 overflow-x-auto">
          <TabsList className="inline-flex w-max sm:grid sm:grid-cols-7 sm:w-full">
            <TabsTrigger value="movimientos" className="gap-1.5"><Layers className="size-3.5" /><span className="hidden sm:inline">Movimientos</span><span className="sm:hidden">Mov.</span></TabsTrigger>
            <TabsTrigger value="productos" className="gap-1.5"><Package className="size-3.5" /><span className="hidden sm:inline">Productos</span><span className="sm:hidden">Prod.</span></TabsTrigger>
            <TabsTrigger value="almacenes" className="gap-1.5"><Warehouse className="size-3.5" /><span className="hidden sm:inline">Almacenes</span><span className="sm:hidden">Alm.</span></TabsTrigger>
            <TabsTrigger value="ubicaciones" className="gap-1.5"><MapPin className="size-3.5" /><span className="hidden sm:inline">Ubicaciones</span><span className="sm:hidden">Ubic.</span></TabsTrigger>
            <TabsTrigger value="clientes" className="gap-1.5"><Users className="size-3.5" /><span className="hidden sm:inline">Cli/Prov</span><span className="sm:hidden">CP</span></TabsTrigger>
            <TabsTrigger value="estados" className="gap-1.5"><Tag className="size-3.5" /><span className="hidden sm:inline">Estados</span><span className="sm:hidden">Est.</span></TabsTrigger>
            <TabsTrigger value="lotes" className="gap-1.5"><Layers className="size-3.5" /><span className="hidden sm:inline">Lotes</span><span className="sm:hidden">Lot.</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="movimientos" className="mt-4"><MovimientosAdmin /></TabsContent>
        <TabsContent value="productos" className="mt-4"><ProductosAdmin /></TabsContent>
        <TabsContent value="almacenes" className="mt-4"><AlmacenesAdmin /></TabsContent>
        <TabsContent value="ubicaciones" className="mt-4"><UbicacionesAdmin /></TabsContent>
        <TabsContent value="clientes" className="mt-4"><ClientesAdmin /></TabsContent>
        <TabsContent value="estados" className="mt-4"><EstadosAdmin /></TabsContent>
        <TabsContent value="lotes" className="mt-4"><LotesAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MOVIMIENTOS                                                         */
/* ------------------------------------------------------------------ */
function MovimientosAdmin() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("ALL");
  const [view, setView] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [del, setDel] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-movs"],
    queryFn: async () => {
      const [movs, lotes, prod, ubic, alm, cli] = await Promise.all([
        supabase.from("movimientos").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("lotes").select("id, codigo_lote, producto_id"),
        supabase.from("productos").select("id, descripcion, codigo_base"),
        supabase.from("ubicaciones").select("id, codigo, almacen_id"),
        supabase.from("almacenes").select("id, nombre"),
        supabase.from("clientes_proveedores").select("id, nombre, tipo"),
      ]);
      const firstError = [movs, lotes, prod, ubic, alm, cli].find((r) => r.error)?.error;
      if (firstError) throw firstError;
      return {
        movs: movs.data ?? [],
        lotesM: new Map((lotes.data ?? []).map((l) => [l.id, l])),
        prodM: new Map((prod.data ?? []).map((p) => [p.id, p])),
        ubicM: new Map((ubic.data ?? []).map((u) => [u.id, u])),
        almM: new Map((alm.data ?? []).map((a) => [a.id, a])),
        cliM: new Map((cli.data ?? []).map((c) => [c.id, c])),
        lotes: lotes.data ?? [],
        ubicaciones: ubic.data ?? [],
        clientes: cli.data ?? [],
      };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.movs
      .filter((m) => tipoFilter === "ALL" || m.tipo === tipoFilter)
      .map((m) => {
        const lote: any = data.lotesM.get(m.lote_id);
        const prod: any = lote ? data.prodM.get(lote.producto_id) : null;
        const uo: any = m.ubicacion_origen_id ? data.ubicM.get(m.ubicacion_origen_id) : null;
        const ud: any = m.ubicacion_destino_id ? data.ubicM.get(m.ubicacion_destino_id) : null;
        const cli: any = m.cliente_proveedor_id ? data.cliM.get(m.cliente_proveedor_id) : null;
        return {
          ...m,
          _lote: lote?.codigo_lote ?? "—",
          _prod: prod?.descripcion ?? "—",
          _origen: uo ? `${data.almM.get(uo.almacen_id)?.nombre ?? ""} · ${uo.codigo}` : "",
          _destino: ud ? `${data.almM.get(ud.almacen_id)?.nombre ?? ""} · ${ud.codigo}` : "",
          _cliente: cli?.nombre ?? "",
        };
      })
      .filter((m) => {
        if (!q) return true;
        return [m._lote, m._prod, m._origen, m._destino, m._cliente, m.nro_guia, m.nro_vale, m.motivo, m.tipo]
          .some((v) => String(v ?? "").toLowerCase().includes(q));
      });
  }, [data, search, tipoFilter]);

  const counters = useMemo(() => {
    const c = { ENTRADA: 0, SALIDA: 0, TRASLADO: 0, MERMA: 0, AJUSTE_POSITIVO: 0, AJUSTE_NEGATIVO: 0 };
    rows.forEach((r) => { c[r.tipo as keyof typeof c] = (c[r.tipo as keyof typeof c] ?? 0) + Number(r.cantidad_cajas); });
    return c;
  }, [rows]);

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_eliminar_movimiento", { p_mov: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Movimiento eliminado y stock recalculado"); qc.invalidateQueries(); setDel(null); },
    onError: (e: any) => toast.error(e?.message || "Error al eliminar movimiento"),
  });

  const editMut = useMutation({
    mutationFn: async (m: any) => {
      const raw = (m.cantidad_cajas ?? "").toString().trim();
      const cantidad = raw === "" ? 0 : Number(m.cantidad_cajas);
      if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error("Cajas debe ser un número ≥ 0");
      const latas = m.latas === "" || m.latas == null ? null : Number(m.latas);
      if (latas !== null && (!Number.isInteger(latas) || latas < 0)) throw new Error("Latas debe ser un entero ≥ 0");
      const piso = m.piso === "" || m.piso == null ? null : Number(m.piso);
      if (piso !== null && (!Number.isInteger(piso) || piso < 1)) throw new Error("Piso debe ser 1 o 2");
      const { error } = await supabase.rpc("admin_editar_movimiento" as any, {
        p_mov: m.id,
        p_tipo: m.tipo,
        p_fecha: m.fecha,
        p_lote_id: m.lote_id,
        p_ubic_origen: m.ubicacion_origen_id || null,
        p_ubic_destino: m.ubicacion_destino_id || null,
        p_cantidad_cajas: cantidad,
        p_latas: latas,
        p_piso: piso,
        p_nro_guia: m.nro_guia || null,
        p_nro_vale: m.nro_vale || null,
        p_cliente: m.cliente_proveedor_id || null,
        p_motivo: m.motivo || null,
        p_observaciones: m.observaciones || null,
        p_nro_warrant: m.nro_warrant || null,
        p_tiene_etiqueta: !!m.tiene_etiqueta,
        p_tercero: m.tercero || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Movimiento actualizado y stock recalculado"); qc.invalidateQueries(); setEdit(null); },
    onError: (e: any) => toast.error(e?.message || "Error al actualizar"),
  });

  const ubicLabel = (id: string | null | undefined) => {
    if (!id || !data) return "—";
    const u: any = data.ubicM.get(id);
    return u ? `${data.almM.get(u.almacen_id)?.nombre ?? ""} · ${u.codigo}` : "—";
  };

  const lotLabel = (id: string | null | undefined) => {
    if (!id || !data) return "—";
    const lote: any = data.lotesM.get(id);
    const prod: any = lote ? data.prodM.get(lote.producto_id) : null;
    return lote ? `${prod?.codigo_base ?? ""} · ${lote.codigo_lote}` : "—";
  };

  const exportAll = () => {
    exportXLSX({
      sheetName: "Movimientos",
      headers: ["Fecha", "Creado", "Tipo", "Producto", "Lote", "Cajas", "Origen", "Destino", "Cliente/Prov.", "Guía", "Vale", "Motivo"],
      rows: rows.map((r) => [
        r.fecha, new Date(r.created_at).toLocaleString(), r.tipo, r._prod, r._lote,
        Number(r.cantidad_cajas), r._origen, r._destino, r._cliente, r.nro_guia ?? "", r.nro_vale ?? "", r.motivo ?? "",
      ]),
      filename: `Admin_Movimientos_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div className="min-w-0">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Buscar</Label>
            <Input placeholder="Producto, lote, guía, cliente, motivo…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</Label>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="ENTRADA">Entradas</SelectItem>
                <SelectItem value="SALIDA">Salidas</SelectItem>
                <SelectItem value="TRASLADO">Traslados</SelectItem>
                <SelectItem value="MERMA">Mermas</SelectItem>
                <SelectItem value="AJUSTE_POSITIVO">Ajuste +</SelectItem>
                <SelectItem value="AJUSTE_NEGATIVO">Ajuste −</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={exportAll} className="w-full sm:w-auto">
            <FileDown className="size-4 mr-1" /> Excel
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{rows.length} de {data?.movs.length ?? 0} registros</div>
      </Card>

      {/* Mobile cards */}
      <div className="grid gap-2 md:hidden">
        {isLoading && <Card className="p-6 text-center text-muted-foreground">Cargando…</Card>}
        {!isLoading && rows.length === 0 && <Card className="p-6 text-center text-muted-foreground">Sin registros</Card>}
        {rows.map((r) => {
          const Icon = TIPO_ICON[r.tipo] ?? Eye;
          return (
            <Card key={r.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className={TIPO_TONE[r.tipo]}><Icon className="size-3 mr-1" />{r.tipo}</Badge>
                <span className="font-mono text-sm font-semibold">{formatNumber(Number(r.cantidad_cajas), 3)} cj</span>
              </div>
              <div className="text-sm font-medium truncate">{r._prod}</div>
              <div className="text-xs text-muted-foreground truncate">{r._lote}</div>
              {(r._origen || r._destino) && <div className="text-xs">{r._origen && <>← {r._origen} </>}{r._destino && <>→ {r._destino}</>}</div>}
              <div className="flex justify-end gap-1 pt-1 border-t">
                <Button size="sm" variant="ghost" onClick={() => setView(r)}><Eye className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...r, cantidad_cajas: String(r.cantidad_cajas), latas: r.latas == null ? "" : String(r.latas), piso: r.piso == null ? null : Number(r.piso) })}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setDel(r)} className="text-destructive"><Trash2 className="size-4" /></Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Desktop table */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Creado</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Producto / Lote</th>
                <th className="text-right px-3 py-2">Cajas</th>
                <th className="text-left px-3 py-2">Origen → Destino</th>
                <th className="text-left px-3 py-2">Doc.</th>
                <th className="text-right px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
              {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>}
              {rows.map((r) => {
                const Icon = TIPO_ICON[r.tipo] ?? Eye;
                return (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      <div>{new Date(r.created_at).toLocaleDateString()}</div>
                      <div className="text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-3 py-2"><Badge variant="outline" className={TIPO_TONE[r.tipo]}><Icon className="size-3 mr-1" />{r.tipo}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-[260px]">{r._prod}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[260px]">{r._lote}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{formatNumber(Number(r.cantidad_cajas), 3)}</td>
                    <td className="px-3 py-2 text-xs">
                      {r._origen && <div>← {r._origen}</div>}
                      {r._destino && <div>→ {r._destino}</div>}
                      {r._cliente && <div className="text-muted-foreground">{r._cliente}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.nro_guia && <div>G: {r.nro_guia}</div>}
                      {r.nro_vale && <div>V: {r.nro_vale}</div>}
                      {r.tiene_etiqueta && <div>Etiqueta: Sí</div>}
                      {r.motivo && <div className="text-muted-foreground truncate max-w-[180px]" title={r.motivo}>{r.motivo}</div>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => setView(r)}><Eye className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEdit({ ...r, cantidad_cajas: String(r.cantidad_cajas), latas: r.latas == null ? "" : String(r.latas), piso: r.piso == null ? null : Number(r.piso) })}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDel(r)} className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Footer resumen */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 z-20 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="px-3 sm:px-4 md:px-8 py-2 sm:py-3 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs overflow-x-auto">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground hidden sm:inline">Registro:</span>
          <Pill icon={ArrowDownToLine} tone="success" label="Entr." value={counters.ENTRADA} />
          <Pill icon={ArrowUpFromLine} tone="primary" label="Sal." value={counters.SALIDA} />
          <Pill icon={Shuffle} tone="muted" label="Tras." value={counters.TRASLADO} />
          <Pill icon={AlertTriangle} tone="danger" label="Merm." value={counters.MERMA} />
          <Pill icon={Plus} tone="success" label="Aj.+" value={counters.AJUSTE_POSITIVO} />
          <Pill icon={Minus} tone="danger" label="Aj.−" value={counters.AJUSTE_NEGATIVO} />
          <span className="ml-auto text-muted-foreground whitespace-nowrap">Total: <b className="text-foreground">{rows.length}</b></span>
        </div>
      </div>

      {/* Ver */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de movimiento</DialogTitle>
            <DialogDescription>{view?.tipo} · {view && new Date(view.created_at).toLocaleString()}</DialogDescription>
          </DialogHeader>
          {view && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Fecha" v={view.fecha} />
              <Field label="Cajas" v={formatNumber(Number(view.cantidad_cajas), 3)} />
              <Field label="Latas" v={view.latas ?? "—"} />
              <Field label="Piso" v={view.piso ? `Piso ${view.piso}` : "—"} />
              <Field label="Etiqueta" v={view.tiene_etiqueta ? "Sí" : "No"} />
              <Field label="Producto" v={view._prod} full />
              <Field label="Lote" v={view._lote} full />
              {view._origen && <Field label="Origen" v={view._origen} full />}
              {view._destino && <Field label="Destino" v={view._destino} full />}
              {view._cliente && <Field label="Cliente/Prov." v={view._cliente} full />}
              {view.nro_guia && <Field label="Guía" v={view.nro_guia} />}
              {view.nro_vale && <Field label="Vale" v={view.nro_vale} />}
              {view.tercero && <Field label="Tercero" v={view.tercero} full />}
              {view.motivo && <Field label="Motivo" v={view.motivo} full />}
              <Field label="ID" v={view.id} full />
            </dl>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar movimiento</DialogTitle>
            <DialogDescription>Al guardar se recalcula automáticamente el stock por lote y ubicación.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-2 text-xs">
                <div><b>{edit.tipo}</b> · {edit._prod}</div>
                <div className="text-muted-foreground truncate">{edit._lote}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={edit.tipo} onValueChange={(v) => setEdit({ ...edit, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTRADA">ENTRADA</SelectItem>
                      <SelectItem value="SALIDA">SALIDA</SelectItem>
                      <SelectItem value="TRASLADO">TRASLADO</SelectItem>
                      <SelectItem value="MERMA">MERMA</SelectItem>
                      <SelectItem value="AJUSTE_POSITIVO">AJUSTE_POSITIVO</SelectItem>
                      <SelectItem value="AJUSTE_NEGATIVO">AJUSTE_NEGATIVO</SelectItem>
                      <SelectItem value="CAMBIO">CAMBIO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Fecha</Label><Input type="date" value={edit.fecha ?? ""} onChange={(e) => setEdit({ ...edit, fecha: e.target.value })} /></div>
                <div className="sm:col-span-2">
                  <Label>Lote</Label>
                  <SearchSelect
                    value={edit.lote_id ?? ""}
                    onValueChange={(v) => setEdit({ ...edit, lote_id: v })}
                    placeholder="Seleccionar lote"
                    searchPlaceholder="Buscar lote, producto…"
                    options={(data?.lotes ?? []).map((l: any): SearchSelectOption => ({
                      value: l.id,
                      label: lotLabel(l.id),
                    }))}
                  />
                </div>
                <div>
                  <Label>Ubicación origen</Label>
                  <SearchSelect
                    value={edit.ubicacion_origen_id ?? ""}
                    onValueChange={(v) => setEdit({ ...edit, ubicacion_origen_id: v || null })}
                    placeholder="— Sin origen —"
                    searchPlaceholder="Buscar ubicación…"
                    allowClear
                    options={(data?.ubicaciones ?? []).map((u: any): SearchSelectOption => ({
                      value: u.id,
                      label: ubicLabel(u.id),
                    }))}
                  />
                </div>
                <div>
                  <Label>Ubicación destino</Label>
                  <SearchSelect
                    value={edit.ubicacion_destino_id ?? ""}
                    onValueChange={(v) => setEdit({ ...edit, ubicacion_destino_id: v || null })}
                    placeholder="— Sin destino —"
                    searchPlaceholder="Buscar ubicación…"
                    allowClear
                    options={(data?.ubicaciones ?? []).map((u: any): SearchSelectOption => ({
                      value: u.id,
                      label: ubicLabel(u.id),
                    }))}
                  />
                </div>
                <div>
                  <Label>Cliente / Proveedor</Label>
                  <SearchSelect
                    value={edit.cliente_proveedor_id ?? ""}
                    onValueChange={(v) => setEdit({ ...edit, cliente_proveedor_id: v || null })}
                    placeholder="— Ninguno —"
                    searchPlaceholder="Buscar cliente o proveedor…"
                    allowClear
                    options={(data?.clientes ?? []).map((c: any): SearchSelectOption => ({
                      value: c.id,
                      label: c.nombre,
                      description: c.tipo,
                    }))}
                  />
                </div>

                <div>
                  <Label>Cajas</Label>
                  <Input type="number" step="0.001" min="0" value={edit.cantidad_cajas ?? ""}
                    onChange={(e) => setEdit({ ...edit, cantidad_cajas: e.target.value })} />
                </div>
                <div>
                  <Label>Latas</Label>
                  <Input type="number" step="1" min="0" value={edit.latas ?? ""}
                    onChange={(e) => setEdit({ ...edit, latas: e.target.value })} />
                </div>
                <div>
                  <Label>Piso</Label>
                  <Select value={edit.piso != null ? String(edit.piso) : "NONE"} onValueChange={(v) => setEdit({ ...edit, piso: v === "NONE" ? null : Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Sin asignar —</SelectItem>
                      <SelectItem value="1">Piso 1</SelectItem>
                      <SelectItem value="2">Piso 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>N° Guía</Label><Input value={edit.nro_guia ?? ""} onChange={(e) => setEdit({ ...edit, nro_guia: e.target.value })} /></div>
                <div><Label>N° Vale</Label><Input value={edit.nro_vale ?? ""} onChange={(e) => setEdit({ ...edit, nro_vale: e.target.value })} /></div>
                <div><Label>N° Warrant</Label><Input value={edit.nro_warrant ?? ""} onChange={(e) => setEdit({ ...edit, nro_warrant: e.target.value })} /></div>
                <div>
                  <Label>Etiqueta</Label>
                  <label className="flex items-center gap-2 h-10 px-3 rounded-md border bg-background cursor-pointer">
                    <Checkbox checked={!!edit.tiene_etiqueta} onCheckedChange={(v) => setEdit({ ...edit, tiene_etiqueta: !!v })} />
                    <span className="text-sm">Tiene etiqueta</span>
                  </label>
                </div>
              </div>
              <div><Label>Tercero</Label><Input value={edit.tercero ?? ""} onChange={(e) => setEdit({ ...edit, tercero: e.target.value })} placeholder="Transportista / contacto externo" /></div>
              <div><Label>Motivo</Label><Input value={edit.motivo ?? ""} onChange={(e) => setEdit({ ...edit, motivo: e.target.value })} /></div>
              <div><Label>Observaciones</Label><Textarea rows={2} value={edit.observaciones ?? ""} onChange={(e) => setEdit({ ...edit, observaciones: e.target.value })} /></div>
              <p className="text-xs text-muted-foreground">Al modificar cajas, el stock se ajusta automáticamente.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={() => editMut.mutate(edit)} disabled={editMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revertirá el efecto en stock ({del?.tipo} de {del && formatNumber(Number(del.cantidad_cajas), 3)} cajas del lote {del?._lote}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => del && delMut.mutate(del.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar y revertir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GENERIC CATALOG MANAGER                                             */
/* ------------------------------------------------------------------ */
type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "boolean" | "date";
  options?: { value: string; label: string }[];
  required?: boolean;
  readOnlyOnEdit?: boolean;
};

function CatalogManager({
  table, pk, fields, columns, queryKey, deleteVia, title,
}: {
  table: string;
  pk: string;
  fields: FieldDef[];
  columns: { key: string; label: string; render?: (row: any) => any }[];
  queryKey: string;
  deleteVia?: "rpc" | "direct";
  title: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<any | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [del, setDel] = useState<any | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase.from(table as any).select("*").limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r: any) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const saveMut = useMutation({
    mutationFn: async (payload: any) => {
      const clean: any = {};
      fields.forEach((f) => {
        let v = payload[f.key];
        if (v === "" || v === undefined) v = null;
        if (f.type === "number" && v !== null) v = Number(v);
        // Omitir nulos en INSERT para respetar defaults/triggers de la BD.
        if (isNew && v === null) return;
        clean[f.key] = v;
      });
      if (isNew) {
        const { error } = await supabase.from(table as any).insert(clean);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as any).update(clean).eq(pk, payload[pk]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isNew ? "Registro creado" : "Registro actualizado");
      qc.invalidateQueries({ queryKey: [queryKey] });
      setEdit(null); setIsNew(false);
    },
    onError: (e: any) => toast.error(e.message),
  });


  const delMut = useMutation({
    mutationFn: async (row: any) => {
      if (deleteVia === "rpc") {
        const { error } = await supabase.rpc("admin_delete_catalogo", { p_tabla: table, p_id: String(row[pk]) });
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as any).delete().eq(pk, row[pk]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Eliminado");
      qc.invalidateQueries({ queryKey: [queryKey] });
      setDel(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => {
    const blank: any = {};
    fields.forEach((f) => { blank[f.key] = f.type === "boolean" ? true : ""; });
    setEdit(blank); setIsNew(true);
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="min-w-0">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Buscar en {title}</Label>
            <Input placeholder="Filtrar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="size-4 mr-1" />Nuevo</Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{filtered.length} de {rows?.length ?? 0} registros</div>
      </Card>

      {/* Mobile cards */}
      <div className="grid gap-2 md:hidden">
        {isLoading && <Card className="p-6 text-center text-muted-foreground">Cargando…</Card>}
        {!isLoading && filtered.length === 0 && <Card className="p-6 text-center text-muted-foreground">Sin registros</Card>}
        {filtered.map((r: any) => (
          <Card key={r[pk]} className="p-3 space-y-1.5">
            {columns.slice(0, 3).map((c) => (
              <div key={c.key} className="text-sm">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-2">{c.label}</span>
                <span className="font-medium">{c.render ? c.render(r) : String(r[c.key] ?? "—")}</span>
              </div>
            ))}
            <div className="flex justify-end gap-1 pt-1 border-t">
              <Button size="sm" variant="ghost" onClick={() => { setEdit({ ...r }); setIsNew(false); }}><Pencil className="size-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setDel(r)} className="text-destructive"><Trash2 className="size-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider">
              <tr>
                {columns.map((c) => <th key={c.key} className="text-left px-3 py-2">{c.label}</th>)}
                <th className="text-right px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>}
              {filtered.map((r: any) => (
                <tr key={r[pk]} className="border-t hover:bg-muted/30">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2">
                      <div className="truncate max-w-[240px]">{c.render ? c.render(r) : String(r[c.key] ?? "—")}</div>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => { setEdit({ ...r }); setIsNew(false); }}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDel(r)} className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit/New dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) { setEdit(null); setIsNew(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? `Nuevo · ${title}` : `Editar · ${title}`}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((f) => {
                const disabled = !isNew && f.readOnlyOnEdit;
                const full = f.type === "textarea";
                return (
                  <div key={f.key} className={full ? "sm:col-span-2" : ""}>
                    <Label>{f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}</Label>
                    {f.type === "textarea" ? (
                      <Textarea value={edit[f.key] ?? ""} disabled={disabled} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                    ) : f.type === "select" && f.options ? (
                      <Select value={edit[f.key] ?? ""} onValueChange={(v) => setEdit({ ...edit, [f.key]: v })} disabled={disabled}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                        <SelectContent>{f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : f.type === "boolean" ? (
                      <Select value={edit[f.key] === false ? "false" : "true"} onValueChange={(v) => setEdit({ ...edit, [f.key]: v === "true" })} disabled={disabled}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Sí / Activo</SelectItem>
                          <SelectItem value="false">No / Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        value={edit[f.key] ?? ""}
                        disabled={disabled}
                        onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEdit(null); setIsNew(false); }}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate(edit)} disabled={saveMut.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no puede deshacerse. Si el registro está referenciado fallará.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => del && delMut.mutate(del)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CATÁLOGOS ESPECÍFICOS                                               */
/* ------------------------------------------------------------------ */
const ESPECIES = ["ANCHOVETA","CABALLA","JUREL","ATUN","BONITO","MERLUZA","SARDINA","CALAMAR","POTA","TRUCHA","OTRO"];
const PRESENTACIONES = ["ENTERO","FILETE","FILETE_PIEL","SANGACHO","TROZOS","DESMENUZADO","CUBOS","MEDALLON","OTRO"];
const LIQUIDOS = ["ACEITE_VEGETAL","ACEITE_OLIVA","AGUA_Y_SAL","SALSA_TOMATE","NATURAL","OTRO"];
const ENVASES = ["TINAPA","TALL","OVAL","LIBRA","CLUB","FRASCO","OTRO"];

function ProductosAdmin() {
  return <CatalogManager
    title="Productos"
    table="productos"
    pk="id"
    queryKey="admin-productos"
    deleteVia="rpc"
    fields={[
      { key: "codigo_base", label: "Código base", required: true, readOnlyOnEdit: false },
      { key: "descripcion", label: "Descripción", required: true },
      { key: "especie", label: "Especie", type: "select", options: ESPECIES.map(v => ({ value: v, label: v })) },
      { key: "presentacion", label: "Presentación", type: "select", options: PRESENTACIONES.map(v => ({ value: v, label: v })) },
      { key: "liquido_gobierno", label: "Líquido", type: "select", options: LIQUIDOS.map(v => ({ value: v, label: v })) },
      { key: "envase", label: "Envase", type: "select", options: ENVASES.map(v => ({ value: v, label: v })) },
      { key: "activo", label: "Activo", type: "boolean" },
    ]}
    columns={[
      { key: "codigo_base", label: "Código" },
      { key: "descripcion", label: "Descripción" },
      { key: "especie", label: "Especie" },
      { key: "presentacion", label: "Presentación" },
      { key: "envase", label: "Envase" },
      { key: "activo", label: "Activo", render: (r) => r.activo ? "Sí" : "No" },
    ]}
  />;
}

function AlmacenesAdmin() {
  return <CatalogManager
    title="Almacenes"
    table="almacenes"
    pk="id"
    queryKey="admin-almacenes"
    deleteVia="rpc"
    fields={[
      { key: "nombre", label: "Nombre", required: true },
      { key: "activo", label: "Activo", type: "boolean" },
    ]}
    columns={[
      { key: "nombre", label: "Nombre" },
      { key: "activo", label: "Activo", render: (r) => r.activo ? "Sí" : "No" },
    ]}
  />;
}

function UbicacionesAdmin() {
  const { data: alm } = useQuery({
    queryKey: ["admin-alm-opts"],
    queryFn: async () => (await supabase.from("almacenes").select("id, nombre")).data ?? [],
  });
  return <CatalogManager
    title="Ubicaciones"
    table="ubicaciones"
    pk="id"
    queryKey="admin-ubicaciones"
    deleteVia="rpc"
    fields={[
      { key: "almacen_id", label: "Almacén", type: "select", required: true, options: (alm ?? []).map((a: any) => ({ value: a.id, label: a.nombre })) },
      { key: "codigo", label: "Código", required: true },
      { key: "seccion", label: "Sección" },
      { key: "carril", label: "Carril" },
      { key: "pallets", label: "Pallets", type: "number" },
      { key: "observacion", label: "Observación", type: "textarea" },
      { key: "activo", label: "Activo", type: "boolean" },
    ]}
    columns={[
      { key: "codigo", label: "Código" },
      { key: "almacen_id", label: "Almacén", render: (r) => (alm ?? []).find((a: any) => a.id === r.almacen_id)?.nombre ?? "—" },
      { key: "seccion", label: "Sección" },
      { key: "carril", label: "Carril" },
      { key: "pallets", label: "Pallets" },
      { key: "activo", label: "Activo", render: (r) => r.activo ? "Sí" : "No" },
    ]}
  />;
}

function ClientesAdmin() {
  return <CatalogManager
    title="Clientes / Proveedores"
    table="clientes_proveedores"
    pk="id"
    queryKey="admin-clientes"
    deleteVia="rpc"
    fields={[
      { key: "nombre", label: "Nombre", required: true },
      { key: "tipo", label: "Tipo", type: "select", required: true, options: [
        { value: "CLIENTE", label: "CLIENTE" }, { value: "PROVEEDOR", label: "PROVEEDOR" }, { value: "AMBOS", label: "AMBOS" },
      ] },
      { key: "documento", label: "Documento (RUC/DNI)" },
      { key: "activo", label: "Activo", type: "boolean" },
    ]}
    columns={[
      { key: "nombre", label: "Nombre" },
      { key: "tipo", label: "Tipo" },
      { key: "documento", label: "Documento" },
      { key: "activo", label: "Activo", render: (r) => r.activo ? "Sí" : "No" },
    ]}
  />;
}

function EstadosAdmin() {
  return <CatalogManager
    title="Estados"
    table="estados"
    pk="nombre"
    queryKey="admin-estados"
    deleteVia="rpc"
    fields={[
      { key: "nombre", label: "Nombre", required: true, readOnlyOnEdit: true },
      { key: "observacion", label: "Observación", type: "textarea" },
      { key: "orden", label: "Orden", type: "number" },
    ]}
    columns={[
      { key: "nombre", label: "Nombre" },
      { key: "observacion", label: "Observación" },
      { key: "orden", label: "Orden" },
    ]}
  />;
}

function LotesAdmin() {
  const { data: prods } = useQuery({
    queryKey: ["admin-prod-opts"],
    queryFn: async () => (await supabase.from("productos").select("id, codigo_base, descripcion")).data ?? [],
  });
  const { data: mercs } = useQuery({
    queryKey: ["admin-mercados-opts"],
    queryFn: async () => (await (supabase as any).from("mercados").select("id, mercado").order("mercado")).data ?? [],
  });
  return <CatalogManager
    title="Lotes"
    table="lotes"
    pk="id"
    queryKey="admin-lotes"
    deleteVia="direct"
    fields={[
      { key: "producto_id", label: "Producto", type: "select", required: true, options: (prods ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo_base} — ${p.descripcion}` })) },
      { key: "fecha_produccion", label: "Fecha producción", type: "date", required: true, readOnlyOnEdit: true },
      { key: "fecha_vencimiento", label: "Fecha vencimiento", type: "date", required: true, readOnlyOnEdit: true },
      { key: "estado", label: "Estado" },
      { key: "etiqueta", label: "Etiqueta" },
      { key: "mercado", label: "Mercado", type: "select", options: (mercs ?? []).map((m: any) => ({ value: m.mercado, label: m.mercado })) },
      { key: "costo_por_caja", label: "Costo / caja", type: "number" },
      { key: "certificadora", label: "Certificadora" },
      { key: "fecha_certificacion", label: "Fecha certificación", type: "date" },
      { key: "observacion", label: "Observación", type: "textarea" },
    ]}
    columns={[
      { key: "codigo_lote", label: "Código lote" },
      { key: "producto_id", label: "Producto", render: (r) => (prods ?? []).find((p: any) => p.id === r.producto_id)?.codigo_base ?? "—" },
      { key: "fecha_produccion", label: "F. Prod." },
      { key: "fecha_vencimiento", label: "F. Venc." },
      { key: "estado", label: "Estado" },
      { key: "etiqueta", label: "Etiqueta" },
      { key: "mercado", label: "Mercado" },
    ]}
  />;
}


/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */
function Field({ label, v, full }: { label: string; v: any; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{v}</dd>
    </div>
  );
}

function Pill({ icon: Icon, tone, label, value }: { icon: any; tone: "success" | "primary" | "muted" | "danger"; label: string; value: number }) {
  const tones: Record<string, string> = {
    success: "bg-success/15 text-success border-success/30",
    primary: "bg-primary/15 text-primary border-primary/30",
    muted: "bg-muted text-foreground border-border",
    danger: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 whitespace-nowrap ${tones[tone]}`}>
      <Icon className="size-3" /> <span>{label}</span>
      <b className="font-mono">{formatNumber(value, 0)}</b>
    </span>
  );
}
