import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import {
  AlertTriangle, Boxes, PackageX, FileSpreadsheet, Search, Plus,
  ArrowDownToLine, ArrowUpFromLine, Layers, FileText, FileDown, BarChart3,
  ChevronDown, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/insumos/")({
  component: InsumosTablero,
});

type Stock = {
  id: string; codigo: string; categoria: string; grupo: string | null; subcategoria: string;
  provee: string | null; insumo: string; formato: string | null;
  empaque: string; und_x_empaque: number; unidad: string;
  stock_min_und: number; saldo_inicial: number;
  ingresos: number; salidas: number; saldo_und: number; saldo_emp: number;
  ult_mov: string | null; estado: "OK" | "BAJO" | "AGOTADO"; activo: boolean;
  descripcion: string | null;
};

function estadoVariant(e: string): "default" | "destructive" | "secondary" | "outline" {
  if (e === "AGOTADO") return "destructive";
  if (e === "BAJO") return "secondary";
  return "default";
}

function InsumosTablero() {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("all");
  const [grupo, setGrupo] = useState("all");
  const [subcategoria, setSubcategoria] = useState("all");
  const [estado, setEstado] = useState("all");
  const [proveedor, setProveedor] = useState("all");
  const [detalle, setDetalle] = useState<Stock | null>(null);
  const [expandCats, setExpandCats] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["insumos-stock"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vista_insumos_stock")
        .select("*")
        .order("categoria")
        .order("grupo")
        .order("subcategoria");
      if (error) throw error;
      return (data ?? []) as Stock[];
    },
  });

  const { data: recientes = [] } = useQuery({
    queryKey: ["insumos-mov-recientes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vista_insumos_movimientos")
        .select("*")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mapa proveedor -> Set<insumo_id> obtenido desde insumos_movimientos
  const { data: provMap = { list: [] as string[], byProv: new Map<string, Set<string>>() } } = useQuery({
    queryKey: ["insumos-mov-proveedores"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("insumos_movimientos")
        .select("insumo_id,proveedor")
        .not("proveedor", "is", null)
        .limit(10000);
      if (error) throw error;
      const byProv = new Map<string, Set<string>>();
      (data ?? []).forEach((r: any) => {
        const p = (r.proveedor ?? "").trim();
        if (!p) return;
        if (!byProv.has(p)) byProv.set(p, new Set());
        byProv.get(p)!.add(r.insumo_id);
      });
      return { list: Array.from(byProv.keys()).sort(), byProv };
    },
  });

  const categorias = useMemo(() => Array.from(new Set(rows.map((r) => r.categoria))).sort(), [rows]);
  const grupos = useMemo(() => Array.from(new Set(
    rows.filter((r) => categoria === "all" || r.categoria === categoria).map((r) => r.grupo ?? "GENERAL")
  )).sort(), [rows, categoria]);
  const subcategorias = useMemo(() => Array.from(new Set(
    rows
      .filter((r) => categoria === "all" || r.categoria === categoria)
      .filter((r) => grupo === "all" || (r.grupo ?? "GENERAL") === grupo)
      .map((r) => r.subcategoria)
      .filter((s): s is string => !!s)
  )).sort(), [rows, categoria, grupo]);
  const filtered = useMemo(() => {
    const provSet = proveedor !== "all" ? provMap.byProv.get(proveedor) : null;
    return rows.filter((r) => {
      if (categoria !== "all" && r.categoria !== categoria) return false;
      if (grupo !== "all" && (r.grupo ?? "GENERAL") !== grupo) return false;
      if (subcategoria !== "all" && r.subcategoria !== subcategoria) return false;
      if (estado !== "all" && r.estado !== estado) return false;
      if (provSet && !provSet.has(r.id)) return false;
      if (q) {
        const s = q.toLowerCase();
        if (![r.codigo, r.subcategoria, r.insumo, r.categoria, r.grupo, r.provee].some((x) => (x ?? "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [rows, categoria, grupo, subcategoria, estado, q, proveedor, provMap]);

  // Resumen por subcategoría (sobre filtrado)
  const resumenSub = useMemo(() => {
    const map = new Map<string, { categoria: string; grupo: string; subcategoria: string; items: number; ingresos: number; salidas: number; saldo: number; alerta: number }>();
    filtered.forEach((r) => {
      const key = `${r.categoria}||${r.grupo ?? "GENERAL"}||${r.subcategoria}`;
      const cur = map.get(key) ?? { categoria: r.categoria, grupo: r.grupo ?? "GENERAL", subcategoria: r.subcategoria, items: 0, ingresos: 0, salidas: 0, saldo: 0, alerta: 0 };
      cur.items += 1;
      cur.ingresos += Number(r.ingresos || 0);
      cur.salidas += Number(r.salidas || 0);
      cur.saldo += Number(r.saldo_und || 0);
      if (r.estado !== "OK") cur.alerta += 1;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.saldo - a.saldo);
  }, [filtered]);


  const kpi = useMemo(() => {
    const alerta = rows.filter((r) => r.estado === "BAJO").length;
    const agotado = rows.filter((r) => r.estado === "AGOTADO").length;
    const total = rows.length;
    const totalUnd = rows.reduce((a, r) => a + Number(r.saldo_und || 0), 0);
    const totalIng = rows.reduce((a, r) => a + Number(r.ingresos || 0), 0);
    const totalSal = rows.reduce((a, r) => a + Number(r.salidas || 0), 0);
    return { alerta, agotado, total, totalUnd, totalIng, totalSal };
  }, [rows]);

  // Stock por categoría (con subcategorías agrupadas)
  const porCategoria = useMemo(() => {
    const map = new Map<string, { items: number; saldo: number; ingresos: number; salidas: number; alerta: number; subs: Map<string, { items: number; saldo: number; ingresos: number; salidas: number; alerta: number }> }>();
    rows.forEach((r) => {
      const cur = map.get(r.categoria) ?? { items: 0, saldo: 0, ingresos: 0, salidas: 0, alerta: 0, subs: new Map() };
      cur.items += 1;
      cur.saldo += Number(r.saldo_und || 0);
      cur.ingresos += Number(r.ingresos || 0);
      cur.salidas += Number(r.salidas || 0);
      if (r.estado !== "OK") cur.alerta += 1;
      const sub = cur.subs.get(r.subcategoria) ?? { items: 0, saldo: 0, ingresos: 0, salidas: 0, alerta: 0 };
      sub.items += 1;
      sub.saldo += Number(r.saldo_und || 0);
      sub.ingresos += Number(r.ingresos || 0);
      sub.salidas += Number(r.salidas || 0);
      if (r.estado !== "OK") sub.alerta += 1;
      cur.subs.set(r.subcategoria, sub);
      map.set(r.categoria, cur);
    });
    return Array.from(map.entries()).map(([cat, v]) => ({
      cat,
      items: v.items, saldo: v.saldo, ingresos: v.ingresos, salidas: v.salidas, alerta: v.alerta,
      subs: Array.from(v.subs.entries()).map(([sub, sv]) => ({ sub, ...sv })).sort((a, b) => b.saldo - a.saldo),
    })).sort((a, b) => b.saldo - a.saldo);
  }, [rows]);

  const toggleCat = (c: string) => {
    setExpandCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  };

  const maxSaldoCat = Math.max(1, ...porCategoria.map((p) => p.saldo));

  const baseHeaders = ["Código", "Categoría", "Subcategoría", "Unidad", "Saldo (und)", "Ingresos", "Salidas", "Stock mín", "Estado"];
  const buildRows = (data: Stock[]) =>
    data.map((r) => [r.codigo, r.categoria, r.subcategoria, r.unidad, r.saldo_und, r.ingresos, r.salidas, r.stock_min_und, r.estado]);

  const exportarStock = async (kind: "pdf" | "xlsx") => {
    const data = buildRows(filtered);
    const opts = {
      title: "Stock de insumos",
      subtitle: `${filtered.length} insumos · ${new Date().toLocaleString("es-PE")}`,
      headers: baseHeaders,
      rows: data,
      filename: `stock-insumos.${kind}`,
      summary: [
        { label: "Insumos", value: filtered.length },
        { label: "Total und", value: formatNumber(filtered.reduce((a, r) => a + Number(r.saldo_und || 0), 0), 0) },
        { label: "Alertas", value: filtered.filter((r) => r.estado !== "OK").length },
      ],
    };
    if (kind === "pdf") await exportPDF(opts);
    else await exportXLSX({ sheetName: "Stock", ...opts });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="size-6" /> Almacén de insumos</h1>
          <p className="text-sm text-muted-foreground">
            {categorias.length} categorías · {kpi.total} insumos · {formatNumber(kpi.totalUnd, 0)} unidades en stock
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/insumos/catalogo"><FileSpreadsheet className="size-4" /> Catálogo</Link></Button>
          <Button asChild variant="outline"><Link to="/insumos/reportes"><BarChart3 className="size-4" /> Reportes</Link></Button>
          <Button asChild><Link to="/insumos/movimientos"><Plus className="size-4" /> Movimiento</Link></Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Layers className="size-7 text-primary" />
          <div><div className="text-xs text-muted-foreground">Categorías</div><div className="text-2xl font-bold">{categorias.length}</div></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Boxes className="size-7 text-primary" />
          <div><div className="text-xs text-muted-foreground">Insumos</div><div className="text-2xl font-bold">{kpi.total}</div></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <ArrowDownToLine className="size-7 text-emerald-500" />
          <div><div className="text-xs text-muted-foreground">Total ingresos (und)</div><div className="text-2xl font-bold">{formatNumber(kpi.totalIng, 0)}</div></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <ArrowUpFromLine className="size-7 text-rose-500" />
          <div><div className="text-xs text-muted-foreground">Total salidas (und)</div><div className="text-2xl font-bold">{formatNumber(kpi.totalSal, 0)}</div></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <AlertTriangle className="size-7 text-amber-500" />
          <div><div className="text-xs text-muted-foreground">Alertas / Agotados</div><div className="text-2xl font-bold">{kpi.alerta} / {kpi.agotado}</div></div>
        </CardContent></Card>
      </div>

      {/* Stock por categoría (barras) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Stock por categoría</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {porCategoria.map((p) => {
            const open = expandCats.has(p.cat);
            const maxSub = Math.max(1, ...p.subs.map((s) => s.saldo));
            return (
              <div key={p.cat} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleCat(p.cat)}
                  className="w-full flex items-center justify-between text-sm hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 text-left"
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    {p.cat}
                    <span className="text-xs text-muted-foreground font-normal">({p.subs.length} subcategorías)</span>
                  </div>
                  <div className="text-muted-foreground">
                    {p.items} ítems · <span className="text-foreground font-semibold">{formatNumber(p.saldo, 0)}</span> und
                    {p.alerta > 0 && <Badge variant="secondary" className="ml-2">{p.alerta} alertas</Badge>}
                  </div>
                </button>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(p.saldo / maxSaldoCat) * 100}%` }} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Ingresos: {formatNumber(p.ingresos, 0)} · Salidas: {formatNumber(p.salidas, 0)}
                </div>
                {open && (
                  <div className="mt-2 ml-5 pl-3 border-l space-y-2">
                    {p.subs.map((s) => (
                      <div key={s.sub} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="font-medium">{s.sub}</div>
                          <div className="text-muted-foreground">
                            {s.items} ítems · <span className="text-foreground font-semibold">{formatNumber(s.saldo, 0)}</span> und
                            {s.alerta > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{s.alerta}</Badge>}
                          </div>
                        </div>
                        <div className="h-1.5 bg-muted/60 rounded overflow-hidden">
                          <div className="h-full bg-primary/70" style={{ width: `${(s.saldo / maxSub) * 100}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Ingresos: {formatNumber(s.ingresos, 0)} · Salidas: {formatNumber(s.salidas, 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Tabla principal */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Kárdex de stock</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => exportarStock("xlsx")} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <FileSpreadsheet className="size-4" /> Descargar Excel ({filtered.length})
              </Button>
              <Button size="sm" onClick={() => exportarStock("pdf")} className="bg-rose-600 hover:bg-rose-700 text-white">
                <FileText className="size-4" /> Descargar PDF ({filtered.length})
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Buscar código, insumo, categoría…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
            </div>
            <Select value={categoria} onValueChange={(v) => { setCategoria(v); setGrupo("all"); setSubcategoria("all"); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={grupo} onValueChange={(v) => { setGrupo(v); setSubcategoria("all"); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los grupos</SelectItem>
                {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={subcategoria} onValueChange={setSubcategoria}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Subcategoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las subcategorías</SelectItem>
                {subcategorias.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="OK">OK</SelectItem>
                <SelectItem value="BAJO">Bajo</SelectItem>
                <SelectItem value="AGOTADO">Agotado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={proveedor} onValueChange={setProveedor}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Proveedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {provMap.list.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="kardex">
            <TabsList>
              <TabsTrigger value="kardex">Kárdex ({filtered.length})</TabsTrigger>
              <TabsTrigger value="resumen">Resumen insumos ({resumenSub.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="kardex">
              {isLoading ? <div className="py-8 text-center text-muted-foreground">Cargando…</div> : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Subcategoría</TableHead>
                        <TableHead className="text-right">Ingresos</TableHead>
                        <TableHead className="text-right">Salidas</TableHead>
                        <TableHead className="text-right">Saldo (und)</TableHead>
                        <TableHead className="text-right">Stock mín</TableHead>
                        <TableHead>Último mov.</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow
                          key={r.id}
                          onClick={() => setDetalle(r)}
                          className="cursor-pointer hover:bg-muted/60"
                        >
                          <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                          <TableCell className="text-xs">{r.categoria}</TableCell>
                          <TableCell className="text-xs"><Badge variant="outline">{r.grupo ?? "GENERAL"}</Badge></TableCell>
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">{r.subcategoria}</TableCell>
                          <TableCell className="text-right text-emerald-600">{formatNumber(r.ingresos, 0)}</TableCell>
                          <TableCell className="text-right text-rose-600">{formatNumber(r.salidas, 0)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatNumber(r.saldo_und, 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatNumber(r.stock_min_und, 0)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.ult_mov ?? "—"}</TableCell>
                          <TableCell><Badge variant={estadoVariant(r.estado)}>{r.estado}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">Sin resultados</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="resumen">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Subcategoría</TableHead>
                      <TableHead className="text-right">Insumos</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Salidas</TableHead>
                      <TableHead className="text-right">Saldo total (und)</TableHead>
                      <TableHead className="text-right">Alertas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resumenSub.map((r) => (
                      <TableRow key={`${r.categoria}-${r.grupo}-${r.subcategoria}`}>
                        <TableCell className="text-xs">{r.categoria}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline">{r.grupo}</Badge></TableCell>
                        <TableCell className="font-medium">{r.subcategoria}</TableCell>
                        <TableCell className="text-right">{r.items}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatNumber(r.ingresos, 0)}</TableCell>
                        <TableCell className="text-right text-rose-600">{formatNumber(r.salidas, 0)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatNumber(r.saldo, 0)}</TableCell>
                        <TableCell className="text-right">{r.alerta > 0 ? <Badge variant="secondary">{r.alerta}</Badge> : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {resumenSub.length > 0 && (
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={3}>TOTAL ({resumenSub.length} subcategorías)</TableCell>
                        <TableCell className="text-right">{resumenSub.reduce((a, r) => a + r.items, 0)}</TableCell>
                        <TableCell className="text-right text-emerald-600">{formatNumber(resumenSub.reduce((a, r) => a + r.ingresos, 0), 0)}</TableCell>
                        <TableCell className="text-right text-rose-600">{formatNumber(resumenSub.reduce((a, r) => a + r.salidas, 0), 0)}</TableCell>
                        <TableCell className="text-right">{formatNumber(resumenSub.reduce((a, r) => a + r.saldo, 0), 0)}</TableCell>
                        <TableCell className="text-right">{resumenSub.reduce((a, r) => a + r.alerta, 0)}</TableCell>
                      </TableRow>
                    )}
                    {resumenSub.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sin datos</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>


      {/* Movimientos recientes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Últimos movimientos</CardTitle>
            <Button asChild size="sm" variant="ghost"><Link to="/insumos/movimientos"><FileDown className="size-4" /> Ver todos</Link></Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Insumo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Vale / Guía</TableHead>
                <TableHead>Proveedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recientes.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{m.fecha}</TableCell>
                  <TableCell className="text-xs">{m.categoria} · {m.subcategoria}</TableCell>
                  <TableCell><Badge variant={m.clase === "INGRESO" ? "default" : "secondary"}>{m.tipo_mov}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatNumber(m.cantidad, 0)}</TableCell>
                  <TableCell className="text-xs">{m.nro_guia ?? m.vale_num ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.proveedor ?? "—"}</TableCell>
                </TableRow>
              ))}
              {recientes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin movimientos</TableCell></TableRow>}
            </TableBody>
          </Table>
          {recientes.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <PackageX className="size-3" /> {kpi.agotado} insumos agotados · <AlertTriangle className="size-3" /> {kpi.alerta} en alerta
            </div>
          )}
        </CardContent>
      </Card>
      <DetalleMovimientosDialog stock={detalle} onOpenChange={(o) => !o && setDetalle(null)} />
    </div>
  );
}

function DetalleMovimientosDialog({
  stock,
  onOpenChange,
}: {
  stock: Stock | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!stock;
  const { data: movs = [], isLoading } = useQuery({
    queryKey: ["insumo-detalle-mov", stock?.grupo, stock?.subcategoria, stock?.categoria],
    enabled: open,
    queryFn: async () => {
      let q = (supabase as any)
        .from("vista_insumos_movimientos")
        .select("id,fecha,tipo_mov,clase,cantidad,saldo_post,nro_guia,vale_num,proveedor,observacion,categoria,grupo,subcategoria")
        .eq("categoria", stock!.categoria)
        .eq("subcategoria", stock!.subcategoria)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (stock!.grupo) q = q.eq("grupo", stock!.grupo);
      else q = q.is("grupo", null);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    let ing = 0, sal = 0;
    movs.forEach((m: any) => {
      if (m.clase === "INGRESO") ing += Number(m.cantidad || 0);
      else sal += Number(m.cantidad || 0);
    });
    return { ing, sal };
  }, [movs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="size-5" />
            {stock?.categoria} · <Badge variant="outline">{stock?.grupo ?? "GENERAL"}</Badge> · {stock?.subcategoria}
          </DialogTitle>
          <div className="flex gap-4 text-xs text-muted-foreground pt-1">
            <span className="text-emerald-600">Ingresos: <b>{formatNumber(totals.ing, 0)}</b></span>
            <span className="text-rose-600">Salidas: <b>{formatNumber(totals.sal, 0)}</b></span>
            <span>Saldo actual: <b>{formatNumber(stock?.saldo_und ?? 0, 0)}</b> und</span>
            <span>{movs.length} movimientos</span>
          </div>
        </DialogHeader>
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando movimientos…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right text-emerald-600">Ingreso</TableHead>
                  <TableHead className="text-right text-rose-600">Salida</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Guía / Vale</TableHead>
                  <TableHead>Proveedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">{m.fecha}</TableCell>
                    <TableCell><Badge variant={m.clase === "INGRESO" ? "default" : "secondary"} className="text-[10px]">{m.tipo_mov}</Badge></TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">{m.clase === "INGRESO" ? formatNumber(m.cantidad, 0) : "—"}</TableCell>
                    <TableCell className="text-right text-rose-600 font-medium">{m.clase === "SALIDA" ? formatNumber(m.cantidad, 0) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(m.saldo_post ?? 0, 0)}</TableCell>
                    <TableCell className="text-xs">{m.nro_guia ?? m.vale_num ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.proveedor ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {movs.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin movimientos registrados</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
