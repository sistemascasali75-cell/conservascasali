import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { fetchAllRows } from "@/lib/fetch-all";
import { exportPDF, exportXLSX } from "@/lib/export";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ClipboardCheck, FileSpreadsheet, FileText, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes/inventariados")({
  head: () => ({ meta: [
    { title: "Lotes inventariados · Reporte" },
    { name: "description", content: "Reporte gerencial de lotes con movimientos marcados como inventariados." },
  ] }),
  component: Page,
});

const TIPOS = ["ENTRADA", "SALIDA", "TRASLADO", "MERMA", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"];
const signo = (t: string) => (t === "ENTRADA" || t === "AJUSTE_POSITIVO" ? 1 : t === "TRASLADO" ? 0 : -1);

function Page() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("all");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["rep-inventariados"],
    queryFn: async () => {
      const [movs, l, p, u, a] = await Promise.all([
        fetchAllRows((from, to) => (supabase as any).from("movimientos").select("*").eq("inventariado", true).order("fecha", { ascending: false }).range(from, to)),
        fetchAllRows((from, to) => (supabase as any).from("lotes").select("id,codigo_lote,producto_id,fecha_vencimiento,estado").range(from, to)),
        supabase.from("productos").select("id,descripcion"),
        supabase.from("ubicaciones").select("id,codigo,almacen_id"),
        supabase.from("almacenes").select("id,nombre"),
      ]);
      return { movs: movs as any[], lotes: l as any[], productos: p.data ?? [], ubic: u.data ?? [], alm: a.data ?? [] };
    },
  });

  const grupos = useMemo(() => {
    if (!data) return [];
    const lm = new Map(data.lotes.map((x) => [x.id, x]));
    const pm = new Map((data.productos as any[]).map((x) => [x.id, x.descripcion]));
    const um = new Map((data.ubic as any[]).map((x) => [x.id, x]));
    const am = new Map((data.alm as any[]).map((x) => [x.id, x.nombre]));
    const s = q.toLowerCase();
    const map = new Map<string, any>();
    for (const m of data.movs) {
      if (tipo !== "all" && m.tipo !== tipo) continue;
      if (desde && m.fecha < desde) continue;
      if (hasta && m.fecha > hasta) continue;
      const lote = lm.get(m.lote_id);
      const producto = lote ? pm.get(lote.producto_id) ?? "" : "";
      const ub = um.get(m.ubicacion_destino_id ?? m.ubicacion_origen_id);
      const ubic = ub ? `${am.get(ub.almacen_id) ?? ""} · ${ub.codigo}` : "—";
      if (s && ![lote?.codigo_lote, producto, m.nro_guia, m.nro_vale, ubic, m.observaciones].some((x) => (x ?? "").toLowerCase().includes(s))) continue;
      const g = map.get(m.lote_id) ?? { id: m.lote_id, codigo: lote?.codigo_lote ?? "—", producto, estado: m.estado_lote ?? lote?.estado ?? "", fv: lote?.fecha_vencimiento, movs: [], ing: 0, sal: 0, ultima: "" };
      const lat = Number(m.total_latas || 0);
      const sg = signo(m.tipo);
      if (sg > 0) g.ing += lat; else if (sg < 0) g.sal += lat;
      if (m.fecha > g.ultima) g.ultima = m.fecha;
      g.movs.push({ ...m, ubic, emp: Number(m.empaque || 48) });
      map.set(m.lote_id, g);
    }
    return Array.from(map.values()).sort((a, b) => b.ultima.localeCompare(a.ultima));
  }, [data, q, tipo, desde, hasta]);

  const kpi = useMemo(() => {
    const movs = grupos.reduce((a, g) => a + g.movs.length, 0);
    const ing = grupos.reduce((a, g) => a + g.ing, 0);
    const sal = grupos.reduce((a, g) => a + g.sal, 0);
    return { lotes: grupos.length, movs, ing, sal, neto: ing - sal };
  }, [grupos]);

  const desmarcar = async (id: string) => {
    const { error } = await (supabase as any).rpc("set_movimiento_inventariado", { p_id: id, p_valor: false });
    if (error) return toast.error(error.message);
    toast.success("Movimiento desmarcado");
    qc.invalidateQueries({ queryKey: ["rep-inventariados"] });
  };

  const cajasTxt = (lat: number, emp = 48) => `${formatNumber(Math.floor(lat / emp), 0)} cj + ${formatNumber(lat % emp, 0)} lt`;
  const filtroTxt = [tipo !== "all" && `Tipo: ${tipo}`, desde && `Desde ${desde}`, hasta && `Hasta ${hasta}`, q && `Búsqueda: "${q}"`].filter(Boolean).join(" · ") || "Sin filtros";

  const headers = ["Lote", "Producto", "Estado", "F. Venc.", "Movs", "Ingresos (latas)", "Salidas (latas)", "Neto (latas)", "Última fecha"];
  const rows = () => grupos.map((g) => [g.codigo, g.producto, g.estado, g.fv ?? "", g.movs.length, g.ing, g.sal, g.ing - g.sal, g.ultima]);
  const summary = [
    { label: "Lotes", value: kpi.lotes }, { label: "Movimientos", value: kpi.movs },
    { label: "Ingresos (latas)", value: formatNumber(kpi.ing, 0) }, { label: "Salidas (latas)", value: formatNumber(kpi.sal, 0) },
    { label: "Neto (latas)", value: formatNumber(kpi.neto, 0) },
  ];
  const exportar = async (kind: "pdf" | "xlsx") => {
    if (kind === "pdf") {
      await exportPDF({
        title: "Reporte gerencial · Lotes inventariados",
        subtitle: `${filtroTxt} · ${new Date().toLocaleString("es-PE")}`,
        headers, rows: rows(), filename: "lotes-inventariados.pdf", summary,
        inventario: { cajas: 0, latas: 0, totalLatas: 0 },
        sections: [{
          title: "Detalle de movimientos inventariados",
          headers: ["Lote", "Fecha", "Tipo", "Ubicación", "Cajas", "Latas", "Total latas", "Guía/Vale", "Observación"],
          rows: grupos.flatMap((g) => g.movs.map((m: any) => [g.codigo, m.fecha, m.tipo, m.ubic, m.cantidad_cajas ?? 0, m.latas ?? 0, m.total_latas, m.nro_guia ?? m.nro_vale ?? "", m.observaciones ?? ""])),
        }],
      });
    } else {
      await exportXLSX({ sheetName: "Inventariados", headers, rows: rows(), filename: "lotes-inventariados.xlsx", summary, inventario: { cajas: 0, latas: 0, totalLatas: 0 } });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="size-6 text-primary" /> Lotes inventariados</h1>
          <p className="text-sm text-muted-foreground">Solo lotes con movimientos marcados como inventariados.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportar("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
          <Button size="sm" onClick={() => exportar("pdf")}><FileText className="size-4" /> PDF (filtros)</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[["Lotes", kpi.lotes], ["Movimientos", kpi.movs], ["Ingresos (latas)", kpi.ing], ["Salidas (latas)", kpi.sal], ["Neto (latas)", kpi.neto]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className="text-2xl font-bold font-mono">{formatNumber(Number(v), 0)}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Lotes ({grupos.length}) <span className="text-xs font-normal text-muted-foreground ml-2">{filtroTxt}</span></CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Lote, producto, guía, ubicación…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} />
            <Input type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!isLoading && grupos.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No hay lotes con la casilla "Inventariado" activa.</p>}
          {grupos.map((g) => {
            const abierto = !!open[g.id];
            const neto = g.ing - g.sal;
            return (
              <div key={g.id} className="rounded-lg border">
                <button className="w-full flex flex-wrap items-center gap-3 p-3 text-left hover:bg-muted/50" onClick={() => setOpen((o) => ({ ...o, [g.id]: !abierto }))}>
                  {abierto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  <span className="font-mono font-semibold">{g.codigo}</span>
                  <span className="text-sm text-muted-foreground flex-1 min-w-[160px]">{g.producto}</span>
                  {g.estado && <Badge variant="outline">{g.estado}</Badge>}
                  <Badge variant="secondary">{g.movs.length} movs</Badge>
                  <span className="text-xs font-mono">+{formatNumber(g.ing, 0)} / −{formatNumber(g.sal, 0)}</span>
                  <span className={`text-sm font-mono font-bold ${neto < 0 ? "text-destructive" : "text-primary"}`}>{formatNumber(neto, 0)} lt</span>
                </button>
                {abierto && (
                  <div className="border-t overflow-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Ubicación</TableHead>
                        <TableHead className="text-right">Total latas</TableHead><TableHead>Equivalente</TableHead>
                        <TableHead>Guía/Vale</TableHead><TableHead>Observación</TableHead><TableHead>Inventariado</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {g.movs.map((m: any) => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs">{m.fecha}</TableCell>
                            <TableCell><Badge variant={signo(m.tipo) > 0 ? "default" : "secondary"}>{m.tipo}</Badge></TableCell>
                            <TableCell className="text-xs">{m.ubic}</TableCell>
                            <TableCell className="text-right font-mono">{formatNumber(Number(m.total_latas || 0), 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{cajasTxt(Number(m.total_latas || 0), m.emp)}</TableCell>
                            <TableCell className="text-xs">{m.nro_guia ?? m.nro_vale ?? "—"}</TableCell>
                            <TableCell className="text-xs max-w-xs truncate">{m.observaciones ?? ""}</TableCell>
                            <TableCell><Checkbox checked onCheckedChange={() => desmarcar(m.id)} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
