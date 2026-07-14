import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber, formatDate, daysUntil } from "@/lib/format";
import { exportXLSX, exportPDF } from "@/lib/export";
import { Briefcase, FileSpreadsheet, FileDown, Boxes, Package, Coins, Layers, Filter, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes/gerencia")({
  component: ReporteGerencia,
});

const SIGNO: Record<string, number> = {
  ENTRADA: 1, AJUSTE_POSITIVO: 1,
  SALIDA: -1, MERMA: -1, AJUSTE_NEGATIVO: -1,
  TRASLADO: 0, CAMBIO: 0,
};

const TIPOS_MOV = ["ENTRADA", "SALIDA", "MERMA", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO", "TRASLADO", "CAMBIO"] as const;
const TIPOS_DEFAULT = new Set<string>(["ENTRADA", "SALIDA", "MERMA", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"]);

const ALL = "__all__";

function ReporteGerencia() {
  const [vista, setVista] = useState<"lote" | "producto" | "envase" | "almacen" | "especie" | "mercado" | "estado">("lote");
  const [fProducto, setFProducto] = useState(ALL);
  const [fEspecie, setFEspecie] = useState(ALL);
  const [fEnvase, setFEnvase] = useState(ALL);
  const [fAlmacen, setFAlmacen] = useState(ALL);
  const [fEstado, setFEstado] = useState(ALL);
  const [fMercado, setFMercado] = useState(ALL);
  const [fEtiqueta, setFEtiqueta] = useState<"all" | "si" | "no">("all");
  const [fVenc, setFVenc] = useState<"all" | "vencido" | "7" | "30" | "90" | "vigente">("all");
  const [fTipos, setFTipos] = useState<Set<string>>(new Set(TIPOS_DEFAULT));
  const [search, setSearch] = useState("");

  const toggleTipo = (t: string) => {
    setFTipos((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t); else n.add(t);
      return n;
    });
  };


  const { data, isLoading } = useQuery({
    queryKey: ["rep-gerencia"],
    queryFn: async () => {
      const [prod, alm, ubic, lot, stock, movs, merc] = await Promise.all([
        supabase.from("productos").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("movimientos").select("lote_id, tipo, cantidad_cajas, latas, empaque, ubicacion_origen_id, ubicacion_destino_id, mercado_id, tiene_etiqueta"),
        supabase.from("mercados" as any).select("id, mercado, nivel"),
      ]);
      return {
        productos: prod.data ?? [],
        almacenes: alm.data ?? [],
        ubicaciones: ubic.data ?? [],
        lotes: lot.data ?? [],
        stock: stock.data ?? [],
        movs: movs.data ?? [],
        mercados: (merc.data ?? []) as any[],
      };
    },
  });

  const computed = useMemo(() => {
    if (!data) return null;
    const prodM = new Map(data.productos.map((p: any) => [p.id, p]));
    const ubicM = new Map(data.ubicaciones.map((u: any) => [u.id, u]));
    const almM = new Map(data.almacenes.map((a: any) => [a.id, a]));

    // Agregación pura desde movimientos, agrupada por lote_id
    // Solo cuentan tipos seleccionados en fTipos. Signo por tipo.
    const cajasNetasLote = new Map<string, number>();
    const latasNetasLote = new Map<string, number>();
    const empaquePorLote = new Map<string, number>(); // último empaque no nulo visto
    const etiquetaPorLote = new Map<string, boolean>();
    const mercadoPorLote = new Map<string, string | null>();
    data.movs.forEach((mv: any) => {
      // El empaque se captura de cualquier movimiento, sin filtrar por tipo,
      // para mantener consistencia con Kardex incluso cuando se ocultan tipos.
      if (mv.empaque) empaquePorLote.set(mv.lote_id, Number(mv.empaque));
      if (!fTipos.has(mv.tipo)) return;
      const s = SIGNO[mv.tipo] ?? 0;
      if (s !== 0) {
        const cj = Number(mv.cantidad_cajas || 0);
        const lt = Number(mv.latas || 0);
        if (cj) cajasNetasLote.set(mv.lote_id, (cajasNetasLote.get(mv.lote_id) ?? 0) + s * cj);
        if (lt) latasNetasLote.set(mv.lote_id, (latasNetasLote.get(mv.lote_id) ?? 0) + s * lt);
      }
      if (mv.tiene_etiqueta != null) etiquetaPorLote.set(mv.lote_id, !!mv.tiene_etiqueta);
      if (mv.mercado_id) {
        const nom = (data.mercados.find((mc: any) => mc.id === mv.mercado_id) as any)?.mercado;
        if (nom) mercadoPorLote.set(mv.lote_id, nom);
      }
    });

    type Row = {
      loteId: string;
      codigoLote: string;
      producto: string;
      productoId: string;
      especie: string;
      envase: string;
      estado: string;
      etiqueta: string;
      tieneEtiqueta: boolean;
      mercado: string;
      almacen: string;
      almacenId: string;
      ubicacion: string;
      cajas: number;
      empaque: number;
      latas: number;          // latas sueltas (prorrateo por ubicación)
      totalLatas: number;     // cajas*empaque + sueltas
      fp: string;
      fv: string;
      diasVenc: number;
      valorUnit: number;
      valorTotal: number;
    };

    const rows: Row[] = [];
    data.stock.forEach((s: any) => {
      const totalLatas = Number(s.total_latas ?? 0);
      if (totalLatas <= 0) return;
      const lote: any = data.lotes.find((l: any) => l.id === s.lote_id);
      if (!lote) return;
      const prod: any = prodM.get(lote.producto_id);
      const ubi: any = ubicM.get(s.ubicacion_id);
      const alm: any = ubi ? almM.get(ubi.almacen_id) : null;
      const empaque = Math.max(1, Number(empaquePorLote.get(lote.id) ?? prod?.empaque ?? 48));
      // Fuente de verdad: total_latas del stock. Derivamos cajas y latas sueltas.
      const cajas = Math.floor(totalLatas / empaque);
      const latas = totalLatas - cajas * empaque;
      const valorUnit = Number(prod?.valor ?? 0);
      rows.push({
        loteId: lote.id,
        codigoLote: lote.codigo_lote,
        producto: prod?.descripcion ?? prod?.codigo_base ?? "—",
        productoId: prod?.id ?? "",
        especie: prod?.especie ?? "—",
        envase: prod?.envase ?? "—",
        estado: lote.estado ?? "—",
        etiqueta: lote.etiqueta ?? (etiquetaPorLote.get(lote.id) ? "SI" : "S/E"),
        tieneEtiqueta: !!(etiquetaPorLote.get(lote.id) ?? (lote.etiqueta && lote.etiqueta !== "S/E")),
        mercado: lote.mercado ?? mercadoPorLote.get(lote.id) ?? "—",
        almacen: alm?.nombre ?? "—",
        almacenId: alm?.id ?? "",
        ubicacion: ubi?.codigo ?? "—",
        cajas,
        empaque,
        latas,
        totalLatas,
        fp: lote.fecha_produccion,
        fv: lote.fecha_vencimiento,
        diasVenc: daysUntil(lote.fecha_vencimiento),
        valorUnit,
        valorTotal: valorUnit * (totalLatas / empaque),
      });
    });


    // Listas únicas para filtros
    const especies = Array.from(new Set(data.productos.map((p: any) => p.especie).filter(Boolean))).sort() as string[];
    const envases = Array.from(new Set(data.productos.map((p: any) => p.envase).filter(Boolean))).sort() as string[];
    const estados = Array.from(new Set(data.lotes.map((l: any) => l.estado).filter(Boolean))).sort() as string[];
    const mercadosNombre = Array.from(new Set([
      ...data.mercados.map((m: any) => m.mercado),
      ...rows.map((r) => r.mercado).filter((m) => m && m !== "—"),
    ])).sort();

    return { rows, especies, envases, estados, mercadosNombre, cajasNetasLote, latasNetasLote, empaquePorLote };
  }, [data, fTipos]);

  const filtradas = useMemo(() => {
    if (!computed) return [];
    return computed.rows.filter((r) => {
      if (fProducto !== ALL && r.productoId !== fProducto) return false;
      if (fEspecie !== ALL && r.especie !== fEspecie) return false;
      if (fEnvase !== ALL && r.envase !== fEnvase) return false;
      if (fAlmacen !== ALL && r.almacenId !== fAlmacen) return false;
      if (fEstado !== ALL && r.estado !== fEstado) return false;
      if (fMercado !== ALL && r.mercado !== fMercado) return false;
      if (fEtiqueta === "si" && !r.tieneEtiqueta) return false;
      if (fEtiqueta === "no" && r.tieneEtiqueta) return false;

      if (fVenc === "vencido" && r.diasVenc >= 0) return false;
      if (fVenc === "7" && (r.diasVenc < 0 || r.diasVenc > 7)) return false;
      if (fVenc === "30" && (r.diasVenc < 0 || r.diasVenc > 30)) return false;
      if (fVenc === "90" && (r.diasVenc < 0 || r.diasVenc > 90)) return false;
      if (fVenc === "vigente" && r.diasVenc < 90) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${r.codigoLote} ${r.producto} ${r.especie} ${r.envase} ${r.almacen} ${r.ubicacion} ${r.mercado} ${r.estado}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [computed, fProducto, fEspecie, fEnvase, fAlmacen, fEstado, fMercado, fEtiqueta, fVenc, search]);

  const totals = useMemo(() => {
    const totCajas = filtradas.reduce((s, r) => s + r.cajas, 0);
    const totLatas = filtradas.reduce((s, r) => s + r.latas, 0);
    const totInventario = filtradas.reduce((s, r) => s + r.totalLatas, 0);
    const totValor = filtradas.reduce((s, r) => s + r.valorTotal, 0);
    const lotesUnicos = new Set(filtradas.map((r) => r.loteId)).size;
    return { totCajas, totLatas, totInventario, totValor, lotesUnicos };
  }, [filtradas]);

  // Agrupado dinámico
  const grouped = useMemo(() => {
    const keyOf = (r: typeof filtradas[number]) => {
      switch (vista) {
        case "lote": return { key: r.loteId, label: r.codigoLote, sub: r.producto };
        case "producto": return { key: r.productoId || r.producto, label: r.producto, sub: r.especie };
        case "envase": return { key: r.envase, label: r.envase, sub: "Envase" };
        case "almacen": return { key: r.almacenId || r.almacen, label: r.almacen, sub: "Almacén" };
        case "especie": return { key: r.especie, label: r.especie, sub: "Especie" };
        case "mercado": return { key: r.mercado, label: r.mercado, sub: "Mercado" };
        case "estado": return { key: r.estado, label: r.estado, sub: "Estado" };
      }
    };
    const map = new Map<string, { label: string; sub: string; cajas: number; latas: number; totalLatas: number; valor: number; ubicaciones: Set<string>; lotes: Set<string> }>();
    filtradas.forEach((r) => {
      const { key, label, sub } = keyOf(r);
      const cur = map.get(key) ?? { label, sub, cajas: 0, latas: 0, totalLatas: 0, valor: 0, ubicaciones: new Set(), lotes: new Set() };
      cur.cajas += r.cajas;
      cur.latas += r.latas;
      cur.totalLatas += r.totalLatas;
      cur.valor += r.valorTotal;
      cur.ubicaciones.add(r.ubicacion);
      cur.lotes.add(r.loteId);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalLatas - a.totalLatas);
  }, [filtradas, vista]);

  const clearFilters = () => {
    setFProducto(ALL); setFEspecie(ALL); setFEnvase(ALL); setFAlmacen(ALL);
    setFEstado(ALL); setFMercado(ALL); setFEtiqueta("all"); setFVenc("all"); setSearch("");
    setFTipos(new Set(TIPOS_DEFAULT));
  };


  const inventarioBanner = {
    cajas: totals.totCajas,
    latas: totals.totLatas,
    totalLatas: totals.totInventario,
  };

  const groupedHeaders = ["Agrupado por", "Sub", "Lotes", "Ubic.", "Cajas", "Latas sueltas", "Inventario (latas)", "Valor (S/.)"];
  const groupedRows = () => grouped.map((g) => [g.label, g.sub, g.lotes.size, g.ubicaciones.size, g.cajas, g.latas, g.totalLatas, g.valor.toFixed(2)]);

  const detalleHeaders = ["Lote", "Producto", "Especie", "Envase", "Estado", "Etiqueta", "Mercado", "Almacén", "Ubicación", "Cajas", "Empaque", "Latas sueltas", "Inventario (latas)", "FP", "FV", "Días Venc.", "Valor unit. (S/.)", "Valor total (S/.)"];
  const detalleRows = () => filtradas.map((r) => [
    r.codigoLote, r.producto, r.especie, r.envase, r.estado, r.etiqueta, r.mercado,
    r.almacen, r.ubicacion, r.cajas, r.empaque, r.latas, r.totalLatas, r.fp, r.fv, r.diasVenc,
    r.valorUnit.toFixed(2), r.valorTotal.toFixed(2),
  ]);

  const exportExcel = () => exportXLSX({
    sheetName: `Gerencia-${vista}`,
    headers: groupedHeaders,
    rows: groupedRows(),
    filename: `reporte-gerencia-${vista}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    inventario: inventarioBanner,
  });

  const exportDetalle = () => exportXLSX({
    sheetName: "Detalle",
    headers: detalleHeaders,
    rows: detalleRows(),
    filename: `reporte-gerencia-detalle-${new Date().toISOString().slice(0, 10)}.xlsx`,
    inventario: inventarioBanner,
  });

  const exportPdfResumen = () => exportPDF({
    title: `Reporte Gerencial · Resumen por ${vista}`,
    subtitle: `Generado ${new Date().toLocaleString("es-PE")}`,
    headers: groupedHeaders,
    rows: groupedRows() as (string | number)[][],
    filename: `reporte-gerencia-resumen-${vista}-${new Date().toISOString().slice(0, 10)}.pdf`,
    inventario: inventarioBanner,
  });

  const exportPdfInventario = () => exportPDF({
    title: "Inventario Completo · Stock por Lote y Ubicación",
    subtitle: `Generado ${new Date().toLocaleString("es-PE")} · ${filtradas.length} líneas`,
    headers: detalleHeaders,
    rows: detalleRows() as (string | number)[][],
    filename: `inventario-completo-${new Date().toISOString().slice(0, 10)}.pdf`,
    inventario: inventarioBanner,
  });

  return (
    <div className="space-y-4 pb-12">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-700/30 text-indigo-400 flex items-center justify-center">
          <Briefcase className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reporte Gerencial</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Stock actualizado por cajas y latas · agrupable por lote, producto, envase, almacén, mercado y más</p>
        </div>
      </header>

      {/* Banner Inventario total en latas */}
      <Card className="p-4 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white border-0 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-80">Inventario total</div>
            <div className="text-3xl md:text-4xl font-extrabold leading-tight">
              {formatNumber(totals.totInventario, 0)} <span className="text-base font-medium opacity-90">latas</span>
            </div>
            <div className="text-xs opacity-90 mt-1">
              = {formatNumber(totals.totCajas, 0)} cajas × empaque + {formatNumber(totals.totLatas, 0)} latas sueltas
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={exportPdfResumen}><FileDown className="size-3.5 mr-1" />PDF Resumen</Button>
            <Button variant="secondary" size="sm" onClick={exportPdfInventario}><FileDown className="size-3.5 mr-1" />PDF Inventario Completo</Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Lotes" icon={Layers} value={formatNumber(totals.lotesUnicos, 0)} tone="primary" />
        <Kpi label="Cajas totales" icon={Boxes} value={formatNumber(totals.totCajas, 0)} tone="success" />
        <Kpi label="Inventario (latas)" icon={Package} value={formatNumber(totals.totInventario, 0)} tone="warn" />
        <Kpi label="Valor total" icon={Coins} value={`S/. ${formatNumber(totals.totValor)}`} tone="success" />
      </div>

      {/* Filtros */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="size-4" /> Filtros inteligentes
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={clearFilters}><X className="size-3.5 mr-1" />Limpiar</Button>
            <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="size-3.5 mr-1" />Excel Resumen</Button>
            <Button variant="outline" size="sm" onClick={exportDetalle}><FileSpreadsheet className="size-3.5 mr-1" />Excel Detalle</Button>
            <Button variant="outline" size="sm" onClick={exportPdfResumen}><FileDown className="size-3.5 mr-1" />PDF Resumen</Button>
            <Button variant="outline" size="sm" onClick={exportPdfInventario}><FileDown className="size-3.5 mr-1" />PDF Inventario</Button>
          </div>
        </div>

        {/* Tipo de movimiento (agregación) */}
        <div className="flex items-center gap-2 flex-wrap pt-1 border-t pt-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo mov.</span>
          {TIPOS_MOV.map((t) => {
            const active = fTipos.has(t);
            const s = SIGNO[t] ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTipo(t)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  active
                    ? s > 0 ? "bg-success/15 border-success/40 text-success"
                      : s < 0 ? "bg-destructive/15 border-destructive/40 text-destructive"
                      : "bg-muted border-border text-foreground"
                    : "bg-transparent border-border/60 text-muted-foreground hover:bg-muted"
                }`}
                title={s > 0 ? "Suma (+)" : s < 0 ? "Resta (−)" : "Neutro (0)"}
              >
                {active ? "✓ " : ""}{t}
              </button>
            );
          })}
          <span className="text-[10px] text-muted-foreground ml-auto">
            {fTipos.size} tipo{fTipos.size === 1 ? "" : "s"} activo{fTipos.size === 1 ? "" : "s"} · latas sueltas = Σ movimientos.latas × signo
          </span>
        </div>



        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <Input placeholder="Buscar libre…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
          <FSelect value={fProducto} onChange={setFProducto} placeholder="Producto">
            {(data?.productos ?? []).map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.codigo_base} — {p.descripcion}</SelectItem>
            ))}
          </FSelect>
          <FSelect value={fEspecie} onChange={setFEspecie} placeholder="Especie">
            {(computed?.especies ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </FSelect>
          <FSelect value={fEnvase} onChange={setFEnvase} placeholder="Envase">
            {(computed?.envases ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </FSelect>
          <FSelect value={fAlmacen} onChange={setFAlmacen} placeholder="Almacén">
            {(data?.almacenes ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
          </FSelect>
          <FSelect value={fEstado} onChange={setFEstado} placeholder="Estado">
            {(computed?.estados ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </FSelect>
          <FSelect value={fMercado} onChange={setFMercado} placeholder="Mercado">
            {(computed?.mercadosNombre ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </FSelect>
          <Select value={fEtiqueta} onValueChange={(v: any) => setFEtiqueta(v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Etiqueta (todas)</SelectItem>
              <SelectItem value="si">Con etiqueta</SelectItem>
              <SelectItem value="no">Sin etiqueta</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fVenc} onValueChange={(v: any) => setFVenc(v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Vencimiento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vencimiento (todos)</SelectItem>
              <SelectItem value="vencido">Vencidos</SelectItem>
              <SelectItem value="7">≤ 7 días</SelectItem>
              <SelectItem value="30">≤ 30 días</SelectItem>
              <SelectItem value="90">≤ 90 días</SelectItem>
              <SelectItem value="vigente">{">"} 90 días</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Vista agrupada */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs value={vista} onValueChange={(v: any) => setVista(v)}>
            <TabsList className="grid grid-cols-4 md:grid-cols-7 w-full">
              <TabsTrigger value="lote">Lote</TabsTrigger>
              <TabsTrigger value="producto">Producto</TabsTrigger>
              <TabsTrigger value="envase">Envase</TabsTrigger>
              <TabsTrigger value="almacen">Almacén</TabsTrigger>
              <TabsTrigger value="especie">Especie</TabsTrigger>
              <TabsTrigger value="mercado">Mercado</TabsTrigger>
              <TabsTrigger value="estado">Estado</TabsTrigger>
            </TabsList>
            <TabsContent value={vista} className="mt-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agrupado por</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Lotes</TableHead>
                      <TableHead className="text-right">Ubic.</TableHead>
                      <TableHead className="text-right">Cajas</TableHead>
                      <TableHead className="text-right">Latas sueltas</TableHead>
                      <TableHead className="text-right">Inventario (latas)</TableHead>
                      <TableHead className="text-right">Valor (S/.)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((g, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-semibold">{g.label || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{g.sub}</TableCell>
                        <TableCell className="text-right">{g.lotes.size}</TableCell>
                        <TableCell className="text-right">{g.ubicaciones.size}</TableCell>
                        <TableCell className="text-right font-mono">{formatNumber(g.cajas, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNumber(g.latas, 0)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-primary">{formatNumber(g.totalLatas, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-success">S/. {formatNumber(g.valor)}</TableCell>
                      </TableRow>
                    ))}
                    {grouped.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {isLoading ? "Cargando…" : "Sin datos con los filtros aplicados"}
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </Card>

      {/* Detalle */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Detalle por lote × ubicación</h2>
            <p className="text-xs text-muted-foreground">{filtradas.length} filas</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Envase</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Ubic.</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Etiqueta</TableHead>
                <TableHead>Mercado</TableHead>
                <TableHead className="text-right">Cajas</TableHead>
                <TableHead className="text-right">Emp.</TableHead>
                <TableHead className="text-right">Latas sueltas</TableHead>
                <TableHead className="text-right">Inventario (latas)</TableHead>
                <TableHead className="text-right">FV (días)</TableHead>
                <TableHead className="text-right">Valor (S/.)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.slice(0, 500).map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{r.codigoLote}</TableCell>
                  <TableCell className="text-xs">{r.producto}</TableCell>
                  <TableCell className="text-xs">{r.envase}</TableCell>
                  <TableCell className="text-xs">{r.almacen}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ubicacion}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{r.estado}</Badge></TableCell>
                  <TableCell><Badge variant={r.tieneEtiqueta ? "default" : "outline"} className="text-[10px]">{r.etiqueta}</Badge></TableCell>
                  <TableCell className="text-xs">{r.mercado}</TableCell>
                  <TableCell className="text-right font-mono">{formatNumber(r.cajas, 0)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.empaque}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(r.latas, 0)}</TableCell>
                  <TableCell className="text-right font-mono font-bold text-primary">{formatNumber(r.totalLatas, 0)}</TableCell>
                  <TableCell className={`text-right text-xs ${r.diasVenc < 0 ? "text-destructive" : r.diasVenc < 30 ? "text-warning" : ""}`}>
                    {formatDate(r.fv)} · {r.diasVenc}d
                  </TableCell>
                  <TableCell className="text-right font-mono text-success">S/. {formatNumber(r.valorTotal)}</TableCell>
                </TableRow>
              ))}
              {filtradas.length > 500 && (
                <TableRow><TableCell colSpan={14} className="text-center text-xs text-muted-foreground py-3">
                  Mostrando primeras 500 filas. Exporta a Excel/PDF para ver todo.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: string; tone: "primary" | "success" | "warn"; icon: any }) {
  const cls = { primary: "border-l-primary", success: "border-l-success", warn: "border-l-warning" }[tone];
  return (
    <Card className={`p-3 border-l-4 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-xl font-bold mt-1 truncate">{value}</div>
    </Card>
  );
}

function FSelect({
  value, onChange, placeholder, children,
}: { value: string; onChange: (v: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder} (todos)</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}
