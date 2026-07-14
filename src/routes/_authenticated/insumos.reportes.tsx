import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { FileSpreadsheet, FileText, BarChart3, TrendingDown, TrendingUp, AlertTriangle, Database } from "lucide-react";

export const Route = createFileRoute("/_authenticated/insumos/reportes")({
  component: ReportesInsumos,
});

type MovRow = {
  id: string; fecha: string; categoria: string; grupo: string | null; subcategoria: string; codigo: string;
  tipo_mov: string; clase: "INGRESO" | "SALIDA"; cantidad: number;
  nro_guia: string | null; vale_num: string | null;
  proveedor: string | null; transportista: string | null; observacion: string | null;
  saldo_post: number | null;
};

function ReportesInsumos() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const { data: stock = [] } = useQuery({
    queryKey: ["insumos-stock"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vista_insumos_stock").select("*").order("categoria").order("subcategoria");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movs = [] } = useQuery({
    queryKey: ["insumos-reportes-movs", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vista_insumos_movimientos")
        .select("*")
        .gte("fecha", from)
        .lte("fecha", to)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MovRow[];
    },
  });

  // Resumen por categoría > grupo > subcategoría
  const porCategoria = useMemo(() => {
    const m = new Map<string, { categoria: string; grupo: string; subcategoria: string; ingresos: number; salidas: number; movs: number }>();
    movs.forEach((r) => {
      const k = `${r.categoria}||${r.grupo ?? "GENERAL"}||${r.subcategoria}`;
      const cur = m.get(k) ?? { categoria: r.categoria, grupo: r.grupo ?? "GENERAL", subcategoria: r.subcategoria, ingresos: 0, salidas: 0, movs: 0 };
      if (r.clase === "INGRESO") cur.ingresos += Number(r.cantidad);
      else cur.salidas += Number(r.cantidad);
      cur.movs += 1;
      m.set(k, cur);
    });
    return Array.from(m.values()).map((v) => ({
      categoria: v.categoria, grupo: v.grupo, subcategoria: v.subcategoria,
      ingresos: v.ingresos, salidas: v.salidas, neto: v.ingresos - v.salidas, movs: v.movs,
    })).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.grupo.localeCompare(b.grupo) || b.salidas - a.salidas);
  }, [movs]);

  // Top consumos (salidas)
  const topConsumos = useMemo(() => {
    const m = new Map<string, { categoria: string; grupo: string; subcategoria: string; salidas: number; movs: number }>();
    movs.filter((r) => r.clase === "SALIDA").forEach((r) => {
      const k = `${r.categoria}|${r.grupo ?? "GENERAL"}|${r.subcategoria}`;
      const cur = m.get(k) ?? { categoria: r.categoria, grupo: r.grupo ?? "GENERAL", subcategoria: r.subcategoria, salidas: 0, movs: 0 };
      cur.salidas += Number(r.cantidad); cur.movs += 1;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.salidas - a.salidas).slice(0, 25);
  }, [movs]);

  // Proveedores: ingresos
  const porProveedor = useMemo(() => {
    const m = new Map<string, { ingresos: number; movs: number }>();
    movs.filter((r) => r.clase === "INGRESO" && r.proveedor).forEach((r) => {
      const k = r.proveedor!;
      const cur = m.get(k) ?? { ingresos: 0, movs: 0 };
      cur.ingresos += Number(r.cantidad); cur.movs += 1;
      m.set(k, cur);
    });
    return Array.from(m.entries()).map(([p, v]) => ({ proveedor: p, ...v })).sort((a, b) => b.ingresos - a.ingresos);
  }, [movs]);

  // Alertas
  const alertas = useMemo(() => (stock as any[]).filter((s) => s.estado !== "OK")
    .sort((a, b) => Number(a.saldo_und) - Number(b.saldo_und)), [stock]);

  const totalIng = movs.filter((m) => m.clase === "INGRESO").reduce((a, m) => a + Number(m.cantidad), 0);
  const totalSal = movs.filter((m) => m.clase === "SALIDA").reduce((a, m) => a + Number(m.cantidad), 0);

  // Helper para exportar detalle por registro (filas reales de movs filtrados)
  const detalleHeaders = ["Fecha", "Categoría", "Grupo", "Subcategoría", "Tipo", "Clase", "Cantidad", "Saldo post.", "N° Guía", "N° Vale", "Proveedor", "Transportista", "Obs."];
  const detalleRow = (m: MovRow) => [m.fecha, m.categoria, m.grupo ?? "GENERAL", m.subcategoria, m.tipo_mov, m.clase, m.cantidad, m.saldo_post ?? "", m.nro_guia ?? "", m.vale_num ?? "", m.proveedor ?? "", m.transportista ?? "", m.observacion ?? ""];

  const runExport = async (kind: "pdf" | "xlsx", opts: any, sheet: string) => {
    if (kind === "pdf") await exportPDF(opts);
    else await exportXLSX({ sheetName: sheet, ...opts });
  };

  const exportResumen = async (kind: "pdf" | "xlsx") => {
    const headers = ["Categoría", "Grupo", "Subcategoría", "Movs", "Ingresos", "Salidas", "Neto"];
    const rows = porCategoria.map((r) => [r.categoria, r.grupo, r.subcategoria, r.movs, r.ingresos, r.salidas, r.neto]);
    await runExport(kind, {
      title: "Reporte Gerencial · Insumos · Resumen",
      subtitle: `${from} a ${to} · Generado ${new Date().toLocaleString("es-PE")}`,
      headers, rows, filename: `reporte-insumos-resumen.${kind}`,
      summary: [
        { label: "Filas (Cat × Grupo × Subcat)", value: porCategoria.length },
        { label: "Movimientos", value: movs.length },
        { label: "Ingresos", value: formatNumber(totalIng, 0) },
        { label: "Salidas", value: formatNumber(totalSal, 0) },
      ],
    }, "Resumen");
  };

  const exportConsumos = async (kind: "pdf" | "xlsx") => {
    const headers = ["Categoría", "Grupo", "Subcategoría", "Movs", "Salidas (und)"];
    const rows = topConsumos.map((r) => [r.categoria, r.grupo, r.subcategoria, r.movs, r.salidas]);
    await runExport(kind, { title: "Top consumos · Insumos", subtitle: `${from} a ${to}`, headers, rows, filename: `insumos-top-consumos.${kind}` }, "Top consumos");
  };

  const exportProv = async (kind: "pdf" | "xlsx") => {
    const headers = ["Proveedor", "Movs", "Ingresos (und)"];
    const rows = porProveedor.map((r) => [r.proveedor, r.movs, r.ingresos]);
    await runExport(kind, { title: "Ingresos por proveedor", subtitle: `${from} a ${to}`, headers, rows, filename: `insumos-proveedores.${kind}` }, "Proveedores");
  };

  const exportAlertas = async (kind: "pdf" | "xlsx") => {
    const headers = ["Código", "Categoría", "Subcategoría", "Saldo (und)", "Stock mín", "Estado"];
    const rows = alertas.map((s: any) => [s.codigo, s.categoria, s.subcategoria, s.saldo_und, s.stock_min_und, s.estado]);
    await runExport(kind, { title: "Insumos en alerta", subtitle: `${alertas.length} insumos en alerta o agotados`, headers, rows, filename: `insumos-alertas.${kind}` }, "Alertas");
  };

  const exportDetalle = async (kind: "pdf" | "xlsx") => {
    const rows = movs.map(detalleRow);
    await runExport(kind, {
      title: "Detalle de movimientos · Insumos", subtitle: `${from} a ${to} · ${movs.length} movimientos`,
      headers: detalleHeaders, rows, filename: `insumos-detalle.${kind}`,
      summary: [
        { label: "Movimientos", value: movs.length },
        { label: "Ingresos", value: formatNumber(totalIng, 0) },
        { label: "Salidas", value: formatNumber(totalSal, 0) },
      ],
    }, "Detalle");
  };

  // Detalle por registro de cada tab (movs subyacentes al filtro mostrado)
  const exportDetalleScope = async (kind: "pdf" | "xlsx", scope: "resumen" | "consumos" | "proveedores" | "alertas") => {
    let scoped: MovRow[] = movs;
    let label = "Resumen";
    if (scope === "consumos") { scoped = movs.filter((m) => m.clase === "SALIDA"); label = "Top consumos"; }
    else if (scope === "proveedores") { scoped = movs.filter((m) => m.clase === "INGRESO" && m.proveedor); label = "Proveedores"; }
    else if (scope === "alertas") {
      const codigos = new Set(alertas.map((a: any) => a.codigo));
      scoped = movs.filter((m) => codigos.has(m.codigo)); label = "Alertas";
    }
    const rows = scoped.map(detalleRow);
    await runExport(kind, {
      title: `Detalle por registro · ${label}`,
      subtitle: `${from} a ${to} · ${scoped.length} registros`,
      headers: detalleHeaders, rows, filename: `insumos-${scope}-detalle.${kind}`,
      summary: [{ label: "Registros", value: scoped.length }],
    }, `${label} · Detalle`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="size-6" /> Reportes Gerenciales · Insumos</h1>
        <p className="text-sm text-muted-foreground">Reportes resumidos y detallados, exportables a Excel y PDF.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="flex-1" />
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="text-center"><div className="text-muted-foreground">Movimientos</div><div className="text-lg font-bold">{movs.length}</div></div>
            <div className="text-center text-emerald-600"><div className="text-muted-foreground flex items-center gap-1 justify-center"><TrendingUp className="size-3" /> Ingresos</div><div className="text-lg font-bold">{formatNumber(totalIng, 0)}</div></div>
            <div className="text-center text-rose-600"><div className="text-muted-foreground flex items-center gap-1 justify-center"><TrendingDown className="size-3" /> Salidas</div><div className="text-lg font-bold">{formatNumber(totalSal, 0)}</div></div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumen">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumen">Resumen por categoría</TabsTrigger>
          <TabsTrigger value="consumos">Top consumos</TabsTrigger>
          <TabsTrigger value="proveedores">Por proveedor</TabsTrigger>
          <TabsTrigger value="alertas">Alertas de stock</TabsTrigger>
          <TabsTrigger value="detalle">Detalle de movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Resumen ejecutivo por categoría · grupo · subcategoría</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => exportResumen("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
                  <Button size="sm" variant="outline" onClick={() => exportResumen("pdf")}><FileText className="size-4" /> PDF</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("xlsx", "resumen")}><Database className="size-4" /> Detalle Excel</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("pdf", "resumen")}><Database className="size-4" /> Detalle PDF</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Grupo</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead className="text-right">Movs</TableHead>
                    <TableHead className="text-right text-emerald-600">Ingresos</TableHead>
                    <TableHead className="text-right text-rose-600">Salidas</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porCategoria.map((r, idx) => (
                    <TableRow key={`${r.categoria}-${r.grupo}-${r.subcategoria}-${idx}`}>
                      <TableCell className="text-xs">{r.categoria}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{r.grupo}</Badge></TableCell>
                      <TableCell className="font-medium">{r.subcategoria}</TableCell>
                      <TableCell className="text-right">{r.movs}</TableCell>
                      <TableCell className="text-right text-emerald-600">{formatNumber(r.ingresos, 0)}</TableCell>
                      <TableCell className="text-right text-rose-600">{formatNumber(r.salidas, 0)}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.neto < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatNumber(r.neto, 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consumos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Top 25 consumos del período</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => exportConsumos("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
                  <Button size="sm" variant="outline" onClick={() => exportConsumos("pdf")}><FileText className="size-4" /> PDF</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("xlsx", "consumos")}><Database className="size-4" /> Detalle Excel</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("pdf", "consumos")}><Database className="size-4" /> Detalle PDF</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Categoría</TableHead><TableHead>Grupo</TableHead><TableHead>Subcategoría</TableHead><TableHead className="text-right">Movs</TableHead><TableHead className="text-right">Salidas (und)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {topConsumos.map((r, idx) => (
                    <TableRow key={`${r.categoria}-${r.grupo}-${r.subcategoria}-${idx}`}>
                      <TableCell className="text-xs">{r.categoria}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{r.grupo}</Badge></TableCell>
                      <TableCell className="font-medium">{r.subcategoria}</TableCell>
                      <TableCell className="text-right">{r.movs}</TableCell>
                      <TableCell className="text-right font-semibold text-rose-600">{formatNumber(r.salidas, 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proveedores">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Ingresos por proveedor</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => exportProv("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
                  <Button size="sm" variant="outline" onClick={() => exportProv("pdf")}><FileText className="size-4" /> PDF</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("xlsx", "proveedores")}><Database className="size-4" /> Detalle Excel</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("pdf", "proveedores")}><Database className="size-4" /> Detalle PDF</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead className="text-right">Movimientos</TableHead><TableHead className="text-right">Ingresos (und)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {porProveedor.map((r) => (
                    <TableRow key={r.proveedor}>
                      <TableCell className="font-medium">{r.proveedor}</TableCell>
                      <TableCell className="text-right">{r.movs}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatNumber(r.ingresos, 0)}</TableCell>
                    </TableRow>
                  ))}
                  {porProveedor.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin proveedores en el período</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alertas">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4 text-amber-500" /> Insumos en alerta o agotados</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => exportAlertas("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
                  <Button size="sm" variant="outline" onClick={() => exportAlertas("pdf")}><FileText className="size-4" /> PDF</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("xlsx", "alertas")}><Database className="size-4" /> Detalle Excel</Button>
                  <Button size="sm" variant="secondary" onClick={() => exportDetalleScope("pdf", "alertas")}><Database className="size-4" /> Detalle PDF</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Categoría</TableHead><TableHead>Subcategoría</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead className="text-right">Mín</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {alertas.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.codigo}</TableCell>
                      <TableCell className="text-xs">{s.categoria}</TableCell>
                      <TableCell>{s.subcategoria}</TableCell>
                      <TableCell className="text-right font-semibold">{formatNumber(s.saldo_und, 0)}</TableCell>
                      <TableCell className="text-right">{formatNumber(s.stock_min_und, 0)}</TableCell>
                      <TableCell><Badge variant={s.estado === "AGOTADO" ? "destructive" : "secondary"}>{s.estado}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {alertas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Sin alertas</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detalle">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Detalle completo ({movs.length} movimientos)</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportDetalle("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
                  <Button size="sm" variant="outline" onClick={() => exportDetalle("pdf")}><FileText className="size-4" /> PDF</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-auto max-h-[600px]">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Subcategoría</TableHead><TableHead>Tipo</TableHead><TableHead>Clase</TableHead>
                  <TableHead className="text-right">Cant.</TableHead><TableHead>Guía/Vale</TableHead><TableHead>Proveedor</TableHead><TableHead>Transp.</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {movs.slice(0, 300).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{m.fecha}</TableCell>
                      <TableCell className="text-xs font-medium">{m.subcategoria}</TableCell>
                      <TableCell className="text-xs">{m.tipo_mov}</TableCell>
                      <TableCell><Badge variant={m.clase === "INGRESO" ? "default" : "secondary"}>{m.clase}</Badge></TableCell>
                      <TableCell className="text-right">{formatNumber(m.cantidad, 0)}</TableCell>
                      <TableCell className="text-xs">{m.nro_guia ?? m.vale_num ?? "—"}</TableCell>
                      <TableCell className="text-xs">{m.proveedor ?? "—"}</TableCell>
                      <TableCell className="text-xs">{m.transportista ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {movs.length > 300 && (
                <div className="text-xs text-muted-foreground text-center py-2">Mostrando 300 de {movs.length}. Exporta a Excel/PDF para ver todo.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
