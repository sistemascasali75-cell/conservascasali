import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatNumber } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetch-all";

import { exportPDF, exportXLSX } from "@/lib/export";
import { Plus, Loader2, FileSpreadsheet, FileText, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/insumos/movimientos")({
  component: MovimientosInsumos,
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

function MovimientosInsumos() {
  const qc = useQueryClient();
  const [insumoId, setInsumoId] = useState("");
  const [tipo, setTipo] = useState<typeof TIPOS[number]["v"]>("INGRESO_GUIA");
  const [cantidad, setCantidad] = useState("");
  const [nroGuia, setNroGuia] = useState("");
  const [valeNum, setValeNum] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [transportista, setTransportista] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [observacion, setObservacion] = useState("");
  const [q, setQ] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [filterGrupo, setFilterGrupo] = useState("all");

  const { data: insumos = [] } = useQuery({
    queryKey: ["insumos-cat-select"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vista_insumos_stock").select("id,codigo,categoria,grupo,subcategoria,unidad,saldo_und").order("categoria").order("grupo").order("subcategoria");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movs = [] } = useQuery({
    queryKey: ["insumos-movs-full"],
    queryFn: async () =>
      fetchAllRows((from, to) =>
        (supabase as any)
          .from("vista_insumos_movimientos")
          .select("*")
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
      ),
  });


  const tipoSel = useMemo(() => TIPOS.find((t) => t.v === tipo)!, [tipo]);
  const categorias = useMemo(() => Array.from(new Set((insumos as any[]).map((i) => i.categoria))).sort(), [insumos]);
  const grupos = useMemo(() => Array.from(new Set(
    (movs as any[]).filter((m) => filterCat === "all" || m.categoria === filterCat).map((m) => m.grupo ?? "GENERAL")
  )).sort(), [movs, filterCat]);

  const filteredMovs = useMemo(() => (movs as any[]).filter((m) => {
    if (filterTipo !== "all" && m.tipo_mov !== filterTipo) return false;
    if (filterCat !== "all" && m.categoria !== filterCat) return false;
    if (filterGrupo !== "all" && (m.grupo ?? "GENERAL") !== filterGrupo) return false;
    if (q) {
      const s = q.toLowerCase();
      if (![m.subcategoria, m.categoria, m.grupo, m.codigo, m.nro_guia, m.vale_num, m.proveedor, m.transportista, m.observacion]
        .some((x: any) => (x ?? "").toString().toLowerCase().includes(s))) return false;
    }
    return true;
  }), [movs, q, filterTipo, filterCat, filterGrupo]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!insumoId) throw new Error("Selecciona un insumo");
      const cant = Number(cantidad);
      if (!cant || cant <= 0) throw new Error("Cantidad inválida");
      const { error } = await (supabase as any).rpc("registrar_movimiento_insumo", {
        p_insumo_id: insumoId, p_tipo: tipo, p_cantidad: cant,
        p_nro_guia: nroGuia || null, p_observacion: observacion || null, p_fecha: fecha,
        p_vale_num: valeNum || null, p_proveedor: proveedor || null, p_transportista: transportista || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento registrado");
      setCantidad(""); setNroGuia(""); setValeNum(""); setProveedor(""); setTransportista(""); setObservacion("");
      qc.invalidateQueries({ queryKey: ["insumos-movs-full"] });
      qc.invalidateQueries({ queryKey: ["insumos-stock"] });
      qc.invalidateQueries({ queryKey: ["insumos-cat-select"] });
      qc.invalidateQueries({ queryKey: ["insumos-mov-recientes"] });
      qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0] ?? "").startsWith("insumo") });
    },
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const headers = ["Fecha", "Código", "Categoría", "Subcategoría", "Tipo", "Clase", "Cantidad", "Saldo post.", "N° Guía", "N° Vale", "Proveedor", "Transportista", "Observación"];
  const buildRows = () => filteredMovs.map((m: any) => [
    m.fecha, m.codigo, m.categoria, m.subcategoria,
    TIPOS.find((t) => t.v === m.tipo_mov)?.l ?? m.tipo_mov,
    m.clase, m.cantidad, m.saldo_post ?? "", m.nro_guia ?? "", m.vale_num ?? "",
    m.proveedor ?? "", m.transportista ?? "", m.observacion ?? "",
  ]);
  const exportar = async (kind: "pdf" | "xlsx") => {
    const totalIng = filteredMovs.filter((m: any) => m.clase === "INGRESO").reduce((a: number, m: any) => a + Number(m.cantidad || 0), 0);
    const totalSal = filteredMovs.filter((m: any) => m.clase === "SALIDA").reduce((a: number, m: any) => a + Number(m.cantidad || 0), 0);
    const opts = {
      title: "Movimientos de insumos",
      subtitle: `${filteredMovs.length} movimientos · ${new Date().toLocaleString("es-PE")}`,
      headers, rows: buildRows(), filename: `movimientos-insumos.${kind}`,
      summary: [
        { label: "Movimientos", value: filteredMovs.length },
        { label: "Ingresos (und)", value: formatNumber(totalIng, 0) },
        { label: "Salidas (und)", value: formatNumber(totalSal, 0) },
        { label: "Neto", value: formatNumber(totalIng - totalSal, 0) },
      ],
    };
    if (kind === "pdf") await exportPDF(opts);
    else await exportXLSX({ sheetName: "Movimientos", ...opts });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Movimientos de insumos</h1>
        <p className="text-sm text-muted-foreground">Registra ingresos (guía, devolución, ajuste) y salidas (producción, mermas, etc.).</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nuevo movimiento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Insumo</Label>
              <SearchSelect
                value={insumoId}
                onValueChange={setInsumoId}
                options={(insumos as any[]).map((i) => ({
                  value: i.id,
                  label: `${i.codigo} · ${i.subcategoria}`,
                  description: `${i.categoria} · ${i.grupo ?? "GENERAL"}`,
                  searchText: `${i.codigo} ${i.subcategoria} ${i.categoria} ${i.grupo ?? ""}`,
                  meta: [
                    { label: "Stock", value: formatNumber(Number(i.saldo_und || 0), 0) + " " + (i.unidad ?? "und") },
                  ] as SearchSelectOption["meta"],
                }))}
                placeholder="Selecciona insumo…"
                searchPlaceholder="Buscar por categoría, grupo, código…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo <Badge variant={tipoSel.clase === "INGRESO" ? "default" : "secondary"} className="ml-1 text-[10px]">{tipoSel.clase}</Badge></Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Cantidad</Label><Input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>N° guía</Label><Input value={nroGuia} onChange={(e) => setNroGuia(e.target.value)} placeholder="TEP1-0011436 / produccion / STOCK…" /></div>
            <div className="space-y-1.5"><Label>N° vale</Label><Input value={valeNum} onChange={(e) => setValeNum(e.target.value)} placeholder="N° DE VALE 0041" /></div>
            <div className="space-y-1.5"><Label>Proveedor</Label><Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="NORTHGRAPHIC / LA PATRONA…" /></div>
            <div className="space-y-1.5"><Label>Transportista</Label><Input value={transportista} onChange={(e) => setTransportista(e.target.value)} placeholder="CASALI / TRANSPORTE…" /></div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label>Observación</Label>
              <Textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Registrar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Historial de movimientos ({filteredMovs.length})</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => exportar("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
              <Button size="sm" variant="outline" onClick={() => exportar("pdf")}><FileText className="size-4" /> PDF</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setFilterGrupo("all"); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterGrupo} onValueChange={setFilterGrupo}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Subcategoría</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Clase</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Saldo post.</TableHead>
                <TableHead>N° Guía / Vale</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Transportista</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovs.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{m.fecha}</TableCell>
                  <TableCell className="text-xs">{m.categoria}</TableCell>
                  <TableCell className="text-xs"><Badge variant="outline">{m.grupo ?? "GENERAL"}</Badge></TableCell>
                  <TableCell className="text-xs font-medium">{m.subcategoria}</TableCell>
                  <TableCell className="text-xs">{TIPOS.find((t) => t.v === m.tipo_mov)?.l ?? m.tipo_mov}</TableCell>
                  <TableCell><Badge variant={m.clase === "INGRESO" ? "default" : "secondary"}>{m.clase}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatNumber(m.cantidad, 0)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{m.saldo_post != null ? formatNumber(Number(m.saldo_post), 0) : "—"}</TableCell>
                  <TableCell className="text-xs">{m.nro_guia ?? m.vale_num ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.proveedor ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.transportista ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{m.observacion ?? ""}</TableCell>
                </TableRow>
              ))}
              {filteredMovs.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">Sin movimientos</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
