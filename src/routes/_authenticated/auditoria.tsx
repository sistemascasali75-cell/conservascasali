import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Activity, FileDown, Clock, Boxes, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, AlertTriangle, Replace, Plus, Minus } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";


export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaPage,
});

const TIPO_META: Record<string, { label: string; color: string; Icon: any }> = {
  ENTRADA:          { label: "Entrada",         color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", Icon: ArrowDownToLine },
  SALIDA:           { label: "Salida",          color: "text-orange-500 bg-orange-500/10 border-orange-500/30",   Icon: ArrowUpFromLine },
  TRASLADO:         { label: "Traslado",        color: "text-sky-500 bg-sky-500/10 border-sky-500/30",            Icon: ArrowLeftRight },
  MERMA:            { label: "Merma",           color: "text-destructive bg-destructive/10 border-destructive/30", Icon: AlertTriangle },
  AJUSTE_POSITIVO:  { label: "Ajuste +",        color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30", Icon: Plus },
  AJUSTE_NEGATIVO:  { label: "Ajuste −",        color: "text-amber-500 bg-amber-500/10 border-amber-500/30",       Icon: Minus },
  CAMBIO:           { label: "Cambio de lote",  color: "text-violet-500 bg-violet-500/10 border-violet-500/30",    Icon: Replace },
};

function AuditoriaPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/30 text-violet-400 flex items-center justify-center">
          <Activity className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Auditoría</h1>
          <p className="text-muted-foreground">Trazabilidad de todos los movimientos · timeline por lote · filtros dinámicos por usuario y detalle</p>
        </div>
      </header>

      <Tabs defaultValue="movimientos">
        <TabsList>
          <TabsTrigger value="movimientos"><Activity className="size-4 mr-1.5" />Movimientos</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="size-4 mr-1.5" />Timeline por Lote</TabsTrigger>
        </TabsList>
        <TabsContent value="movimientos" className="mt-4">
          <MovimientosAuditoria />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineLote />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* =========================== MOVIMIENTOS =========================== */
function MovimientosAuditoria() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const [desde, setDesde] = useState(monthAgo.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(today);
  const [tipo, setTipo] = useState<string>("TODOS");
  const [usuario, setUsuario] = useState<string>("TODOS");
  const [loteId, setLoteId] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["audit-mov", desde, hasta, tipo],
    queryFn: async () => {
      let q = supabase.from("movimientos").select("*").gte("fecha", desde).lte("fecha", hasta).order("created_at", { ascending: false }).limit(1000);
      if (tipo !== "TODOS") q = q.eq("tipo", tipo as any);
      const { data: movs } = await q;

      const loteIds = [...new Set((movs ?? []).map(m => m.lote_id))];
      const ubicIds = [...new Set([
        ...(movs ?? []).map(m => m.ubicacion_origen_id),
        ...(movs ?? []).map(m => m.ubicacion_destino_id),
      ].filter(Boolean))] as string[];
      const cliIds = [...new Set((movs ?? []).map(m => m.cliente_proveedor_id).filter(Boolean))] as string[];

      const [lotes, ubics, clientes, productos] = await Promise.all([
        loteIds.length ? supabase.from("lotes").select("*").in("id", loteIds) : Promise.resolve({ data: [] as any[] }),
        ubicIds.length ? supabase.from("ubicaciones").select("*").in("id", ubicIds) : Promise.resolve({ data: [] as any[] }),
        cliIds.length ? supabase.from("clientes_proveedores").select("*").in("id", cliIds) : Promise.resolve({ data: [] as any[] }),
        supabase.from("productos").select("id, codigo_base, descripcion"),
      ]);

      return {
        movs: movs ?? [],
        loteById: new Map((lotes.data ?? []).map((l: any) => [l.id, l])),
        ubicById: new Map((ubics.data ?? []).map((u: any) => [u.id, u])),
        cliById: new Map((clientes.data ?? []).map((c: any) => [c.id, c])),
        prodById: new Map((productos.data ?? []).map((p: any) => [p.id, p])),
      };
    },
  });

  const usuarios = useMemo(
    () => Array.from(new Set((data?.movs ?? []).map((m: any) => m.usuario_nombre).filter(Boolean))) as string[],
    [data],
  );
  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    const ids = new Set((data?.movs ?? []).map((m: any) => m.lote_id));
    return Array.from(ids).map((id) => {
      const l: any = data?.loteById.get(id as string);
      const p: any = l ? data?.prodById.get(l.producto_id) : null;
      return {
        value: id as string,
        label: l?.codigo_lote ?? "—",
        description: p ? `${p.codigo_base} · ${p.descripcion ?? ""}` : undefined,
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.movs.filter((m: any) => {
      if (usuario !== "TODOS" && m.usuario_nombre !== usuario) return false;
      if (loteId && m.lote_id !== loteId) return false;
      if (!q) return true;
      const l: any = data.loteById.get(m.lote_id);
      const c: any = data.cliById.get(m.cliente_proveedor_id ?? "");
      return [l?.codigo_lote, m.nro_guia, m.nro_vale, m.nro_warrant, m.observaciones, m.motivo, m.tercero, c?.nombre, m.usuario_nombre]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [data, search, usuario, loteId]);

  const stats = useMemo(() => {
    const byTipo = new Map<string, { reg: number; cajas: number; latas: number }>();
    let totalCajas = 0, totalLatas = 0;
    filtered.forEach((m: any) => {
      const cur = byTipo.get(m.tipo) ?? { reg: 0, cajas: 0, latas: 0 };
      cur.reg += 1;
      cur.cajas += Number(m.cantidad_cajas || 0);
      cur.latas += Number(m.latas || 0);
      byTipo.set(m.tipo, cur);
      totalCajas += Number(m.cantidad_cajas || 0);
      totalLatas += Number(m.latas || 0);
    });
    return { byTipo, totalCajas, totalLatas, totalReg: filtered.length };
  }, [filtered]);

  const buildExportRows = () => {
    if (!data) return { headers: [] as string[], rows: [] as (string | number)[][] };
    const headers = [
      "Fecha", "Hora", "Tipo", "Usuario", "Lote", "Cajas", "Latas", "Empaque",
      "Origen", "Destino", "Cliente", "Tercero", "Guía", "Vale", "Warrant",
      "Etiqueta", "Mercado", "Estado lote", "Donación", "Autorizado",
      "Motivo", "Observaciones",
    ];
    const rows = filtered.map((m: any) => {
      const l: any = data.loteById.get(m.lote_id);
      const orig: any = data.ubicById.get(m.ubicacion_origen_id ?? "");
      const dest: any = data.ubicById.get(m.ubicacion_destino_id ?? "");
      const cli: any = data.cliById.get(m.cliente_proveedor_id ?? "");
      return [
        formatDate(m.fecha),
        new Date(m.created_at).toLocaleTimeString(),
        m.tipo,
        m.usuario_nombre ?? "",
        l?.codigo_lote ?? "",
        Number(m.cantidad_cajas ?? 0),
        Number(m.latas ?? 0),
        Number(m.empaque ?? 48),
        orig?.codigo ?? "",
        dest?.codigo ?? "",
        cli?.nombre ?? "",
        m.tercero ?? "",
        m.nro_guia ?? "",
        m.nro_vale ?? "",
        m.nro_warrant ?? "",
        m.etiqueta ?? "",
        "",
        m.estado_lote ?? "",
        m.donacion ? "SÍ" : "NO",
        m.autorizado ?? "",
        m.motivo ?? "",
        m.observaciones ?? "",
      ];
    });
    return { headers, rows };
  };

  const exportCsv = () => {
    const { headers, rows } = buildExportRows();
    const csv = [headers.join(","),
      ...rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `auditoria_${desde}_${hasta}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportToPdf = async () => {
    const { headers, rows } = buildExportRows();
    await exportPDF({
      title: "Auditoría de movimientos",
      subtitle: `${formatDate(desde)} → ${formatDate(hasta)} · ${filtered.length} registros`,
      headers, rows,
      filename: `auditoria_${desde}_${hasta}.pdf`,
    });
  };

  const exportToXlsx = async () => {
    const { headers, rows } = buildExportRows();
    await exportXLSX({
      sheetName: "Auditoría",
      headers, rows,
      filename: `auditoria_${desde}_${hasta}.xlsx`,
    });
  };



  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                {Object.keys(TIPO_META).map((k) => <SelectItem key={k} value={k}>{TIPO_META[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Usuario</Label>
            <SearchSelect
              value={usuario === "TODOS" ? "" : usuario}
              onValueChange={(v) => setUsuario(v || "TODOS")}
              placeholder="Todos los usuarios"
              searchPlaceholder="Buscar usuario…"
              allowClear
              options={usuarios.map((u) => ({ value: u, label: u }))}
            />
          </div>

          <div className="lg:col-span-2">
            <Label className="text-xs">Lote</Label>
            <SearchSelect value={loteId} onValueChange={setLoteId} options={loteOptions}
              placeholder="Todos los lotes" searchPlaceholder="Buscar lote…" allowClear />
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Input placeholder="Buscar texto libre (guía, motivo, tercero, observaciones, cliente)…"
            value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 flex-1 min-w-[240px]" />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <FileDown className="size-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportToXlsx} disabled={!data} className="border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10">
            <FileDown className="size-4 mr-1" />Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPdf} disabled={!data} className="border-rose-500/50 text-rose-700 hover:bg-rose-500/10">
            <FileDown className="size-4 mr-1" />PDF
          </Button>
        </div>

      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Registros" value={String(stats.totalReg)} Icon={Activity} />
        <KPI label="Total cajas" value={formatNumber(stats.totalCajas)} Icon={Boxes} />
        <KPI label="Total latas" value={formatNumber(stats.totalLatas)} Icon={Boxes} />
        <KPI label="Usuarios activos" value={String(usuarios.length)} Icon={Activity} />
      </div>

      {/* Resumen por tipo */}
      <Card className="p-4">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">Resumen por tipo</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {Object.entries(TIPO_META).map(([k, meta]) => {
            const s = stats.byTipo.get(k) ?? { reg: 0, cajas: 0, latas: 0 };
            const Icon = meta.Icon;
            return (
              <div key={k} className={`rounded-lg border p-2 ${meta.color}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold"><Icon className="size-3.5" />{meta.label}</div>
                <div className="text-lg font-bold mt-1">{s.reg}</div>
                <div className="text-[10px] opacity-80">{formatNumber(s.cajas)} cj · {formatNumber(s.latas)} lt</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha / Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead className="text-right">Cajas</TableHead>
                <TableHead className="text-right">Latas</TableHead>
                <TableHead>Origen → Destino</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tercero</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sin movimientos en el rango</TableCell></TableRow>
              )}
              {filtered.map((m: any) => {
                const l: any = data?.loteById.get(m.lote_id);
                const orig: any = data?.ubicById.get(m.ubicacion_origen_id ?? "");
                const dest: any = data?.ubicById.get(m.ubicacion_destino_id ?? "");
                const cli: any = data?.cliById.get(m.cliente_proveedor_id ?? "");
                const meta = TIPO_META[m.tipo] ?? { label: m.tipo, color: "bg-muted", Icon: Activity };
                const Icon = meta.Icon;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>{formatDate(m.fecha)}</div>
                      <div className="text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                        <Icon className="size-3" />{meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{m.usuario_nombre ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{l?.codigo_lote ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(m.cantidad_cajas, 3)}</TableCell>
                    <TableCell className="text-right text-xs">{m.latas != null ? formatNumber(m.latas) : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {orig?.codigo ?? "—"} {m.ubicacion_destino_id && <span className="text-muted-foreground">→ {dest?.codigo ?? "—"}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{cli?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-xs">{m.tercero ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[240px] truncate" title={[m.motivo, m.observaciones].filter(Boolean).join(" · ")}>
                      {m.motivo ?? m.observaciones ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, Icon }: { label: string; value: string; Icon: any }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="size-4" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-bold text-lg">{value}</div>
      </div>
    </Card>
  );
}

/* =========================== TIMELINE POR LOTE =========================== */
function TimelineLote() {
  const [loteId, setLoteId] = useState("");

  const { data: lotes } = useQuery({
    queryKey: ["audit-lotes"],
    queryFn: async () => {
      const { data: l } = await supabase.from("lotes").select("id, codigo_lote, producto_id, estado, fecha_vencimiento, fecha_produccion").order("codigo_lote");
      const { data: p } = await supabase.from("productos").select("id, codigo_base, descripcion");
      return { lotes: l ?? [], prodById: new Map((p ?? []).map((x: any) => [x.id, x])) };
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ["audit-timeline", loteId],
    enabled: !!loteId,
    queryFn: async () => {
      const { data: movs } = await supabase.from("movimientos").select("*").eq("lote_id", loteId).order("created_at", { ascending: true });
      const ubicIds = [...new Set([
        ...(movs ?? []).map(m => m.ubicacion_origen_id),
        ...(movs ?? []).map(m => m.ubicacion_destino_id),
      ].filter(Boolean))] as string[];
      const cliIds = [...new Set((movs ?? []).map(m => m.cliente_proveedor_id).filter(Boolean))] as string[];
      const [ubics, clientes] = await Promise.all([
        ubicIds.length ? supabase.from("ubicaciones").select("id, codigo").in("id", ubicIds) : Promise.resolve({ data: [] as any[] }),
        cliIds.length ? supabase.from("clientes_proveedores").select("id, nombre").in("id", cliIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      return {
        movs: movs ?? [],
        ubicById: new Map((ubics.data ?? []).map((u: any) => [u.id, u])),
        cliById: new Map((clientes.data ?? []).map((c: any) => [c.id, c])),
      };
    },
  });

  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    return (lotes?.lotes ?? []).map((l: any) => {
      const p: any = lotes?.prodById.get(l.producto_id);
      return {
        value: l.id, label: l.codigo_lote,
        description: p ? `${p.codigo_base} · ${p.descripcion ?? ""}` : undefined,
        searchText: `${p?.codigo_base ?? ""} ${p?.descripcion ?? ""} ${l.estado ?? ""}`,
        meta: [
          l.estado ? { label: "Estado", value: l.estado } : null,
          l.fecha_vencimiento ? { label: "FV", value: formatDate(l.fecha_vencimiento) } : null,
        ].filter(Boolean) as SearchSelectOption["meta"],
      };
    });
  }, [lotes]);

  const loteSel = useMemo(() => (lotes?.lotes ?? []).find((l: any) => l.id === loteId), [lotes, loteId]);
  const prodSel: any = loteSel ? lotes?.prodById.get(loteSel.producto_id) : null;

  // Stock running por movimiento (estimado, sólo informativo)
  const stockProgression = useMemo(() => {
    let stk = 0;
    return (timeline?.movs ?? []).map((m: any) => {
      if (["ENTRADA", "AJUSTE_POSITIVO"].includes(m.tipo)) stk += Number(m.cantidad_cajas);
      else if (["SALIDA", "MERMA", "AJUSTE_NEGATIVO"].includes(m.tipo)) stk -= Number(m.cantidad_cajas);
      // TRASLADO y CAMBIO no afectan el stock total del mismo lote (CAMBIO sí, pero hay dos registros)
      if (m.tipo === "CAMBIO" && m.ubicacion_origen_id) stk -= Number(m.cantidad_cajas);
      if (m.tipo === "CAMBIO" && m.ubicacion_destino_id) stk += Number(m.cantidad_cajas);
      return { ...m, _stock: stk };
    });
  }, [timeline]);

  const buildTimelineRows = () => {
    const headers = [
      "Fecha", "Hora", "Tipo", "Usuario", "Cajas", "Latas", "Empaque",
      "Origen", "Destino", "Cliente", "Tercero", "Guía", "Vale", "Warrant",
      "Etiqueta", "Mercado", "Estado lote", "Donación", "Autorizado",
      "Stock acumulado", "Motivo", "Observaciones",
    ];
    const rows = stockProgression.map((m: any) => {
      const orig: any = timeline?.ubicById.get(m.ubicacion_origen_id ?? "");
      const dest: any = timeline?.ubicById.get(m.ubicacion_destino_id ?? "");
      const cli: any = timeline?.cliById.get(m.cliente_proveedor_id ?? "");
      return [
        formatDate(m.fecha),
        new Date(m.created_at).toLocaleTimeString(),
        m.tipo,
        m.usuario_nombre ?? "",
        Number(m.cantidad_cajas ?? 0),
        Number(m.latas ?? 0),
        Number(m.empaque ?? 48),
        orig?.codigo ?? "",
        dest?.codigo ?? "",
        cli?.nombre ?? "",
        m.tercero ?? "",
        m.nro_guia ?? "",
        m.nro_vale ?? "",
        m.nro_warrant ?? "",
        m.etiqueta ?? "",
        "",
        m.estado_lote ?? "",
        m.donacion ? "SÍ" : "NO",
        m.autorizado ?? "",
        Number(m._stock ?? 0),
        m.motivo ?? "",
        m.observaciones ?? "",
      ];
    });
    return { headers, rows };
  };

  const fname = (ext: string) => `timeline_${loteSel?.codigo_lote?.replace(/\s+/g, "_") ?? "lote"}.${ext}`;
  const subtitle = loteSel
    ? `${loteSel.codigo_lote} · ${prodSel ? `${prodSel.codigo_base} ${prodSel.descripcion ?? ""}` : ""} · ${stockProgression.length} movimientos`
    : "";

  const exportTlPdf = async () => {
    const { headers, rows } = buildTimelineRows();
    await exportPDF({ title: "Timeline por lote", subtitle, headers, rows, filename: fname("pdf") });
  };
  const exportTlXlsx = async () => {
    const { headers, rows } = buildTimelineRows();
    await exportXLSX({ sheetName: "Timeline", headers, rows, filename: fname("xlsx") });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <Label className="text-xs">Lote a auditar</Label>
        <div className="mt-1">
          <SearchSelect value={loteId} onValueChange={setLoteId} options={loteOptions}
            placeholder="Selecciona un lote para ver su trazabilidad completa" searchPlaceholder="Buscar lote (código, producto)…" />
        </div>
        {loteSel && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Info label="Código" value={loteSel.codigo_lote} mono />
            <Info label="Producto" value={prodSel ? `${prodSel.codigo_base} · ${prodSel.descripcion ?? ""}` : "—"} />
            <Info label="Estado" value={loteSel.estado ?? "—"} />
            <Info label="FV" value={loteSel.fecha_vencimiento ? formatDate(loteSel.fecha_vencimiento) : "—"} />
          </div>
        )}
        {loteId && stockProgression.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportTlXlsx} className="border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10">
              <FileDown className="size-4 mr-1" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={exportTlPdf} className="border-rose-500/50 text-rose-700 hover:bg-rose-500/10">
              <FileDown className="size-4 mr-1" />PDF
            </Button>
          </div>
        )}
      </Card>

      {!loteId && (
        <Card className="p-8 text-center text-muted-foreground">
          Selecciona un lote para ver el timeline cronológico completo.
        </Card>
      )}



      {loteId && (
        <Card className="p-6">
          {stockProgression.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin movimientos registrados para este lote.</p>
          ) : (
            <ol className="relative border-l-2 border-border ml-3 space-y-6">
              {stockProgression.map((m: any) => {
                const meta = TIPO_META[m.tipo] ?? { label: m.tipo, color: "bg-muted", Icon: Activity };
                const Icon = meta.Icon;
                const orig: any = timeline?.ubicById.get(m.ubicacion_origen_id ?? "");
                const dest: any = timeline?.ubicById.get(m.ubicacion_destino_id ?? "");
                const cli: any = timeline?.cliById.get(m.cliente_proveedor_id ?? "");
                return (
                  <li key={m.id} className="ml-6">
                    <span className={`absolute -left-[14px] flex items-center justify-center size-7 rounded-full border-2 border-background ${meta.color}`}>
                      <Icon className="size-3.5" />
                    </span>
                    <div className="rounded-lg border p-3 bg-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${meta.color} border`}>{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(m.fecha)} · {new Date(m.created_at).toLocaleTimeString()}</span>
                          {m.usuario_nombre && <Badge variant="outline" className="text-xs">👤 {m.usuario_nombre}</Badge>}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatNumber(m.cantidad_cajas, 3)} cj{m.latas != null && ` · ${formatNumber(m.latas)} lt`}</div>
                          <div className="text-[11px] text-muted-foreground">Stock acumulado: {formatNumber(m._stock)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3 text-xs">
                        {orig && <Info label="Origen" value={orig.codigo} />}
                        {dest && <Info label="Destino" value={dest.codigo} />}
                        {cli && <Info label="Cliente" value={cli.nombre} />}
                        {m.tercero && <Info label="Tercero" value={m.tercero} />}
                        {m.nro_guia && <Info label="Guía" value={m.nro_guia} />}
                        {m.nro_vale && <Info label="Vale" value={m.nro_vale} />}
                        {m.nro_warrant && <Info label="Warrant" value={m.nro_warrant} />}
                      </div>
                      {(m.motivo || m.observaciones) && (
                        <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                          {m.motivo && <div><b>Motivo:</b> {m.motivo}</div>}
                          {m.observaciones && <div><b>Obs:</b> {m.observaciones}</div>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border bg-muted/30 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${mono ? "font-mono" : ""} truncate`} title={value}>{value}</div>
    </div>
  );
}
