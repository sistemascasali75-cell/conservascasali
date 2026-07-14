import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatDate } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { toast } from "sonner";
import {
  Plus, Unlock, FileLock2, Pencil, Trash2, Eye, FileDown, FileSpreadsheet,
  Filter, X, TrendingUp, AlertTriangle, CheckCircle2, Package,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/warrants")({
  component: WarrantsPage,
});

const EMPRESAS = ["BENICE MAKER", "DISTRIBUIDORA CASALI", "INVERSIONES CASALI", "CORPORACION LUKA"];
const COLORS = ["#1E3A5F", "#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6"];

function WarrantsPage() {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  // Filtros
  const [fNro, setFNro] = useState("");
  const [fEmpresa, setFEmpresa] = useState<string>("__all");
  const [fFinanciera, setFFinanciera] = useState("");
  const [fEstado, setFEstado] = useState<string>("__all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [fLote, setFLote] = useState("");

  const { data } = useQuery({
    queryKey: ["warrants-all"],
    queryFn: async () => {
      const [w, l, s, p] = await Promise.all([
        supabase.from("warrants").select("*").order("created_at", { ascending: false }),
        supabase.from("lotes").select("*"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("productos").select("*"),
      ]);
      return { warrants: w.data ?? [], lotes: l.data ?? [], stock: s.data ?? [], productos: p.data ?? [] };
    },
  });

  const loteById = useMemo(() => new Map((data?.lotes ?? []).map(l => [l.id, l])), [data]);
  const prodById = useMemo(() => new Map((data?.productos ?? []).map(p => [p.id, p])), [data]);
  const stockByLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.stock ?? []).forEach(s => m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    return m;
  }, [data]);
  const activeByLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.warrants ?? []).filter(w => w.estado === "ACTIVO").forEach(w => {
      m.set(w.lote_id, (m.get(w.lote_id) ?? 0) + Number(w.cantidad_cajas_warrant));
    });
    return m;
  }, [data]);

  const financierasUnicas = useMemo(() => {
    return Array.from(new Set((data?.warrants ?? []).map(w => w.financiera).filter(Boolean))) as string[];
  }, [data]);

  const filtered = useMemo(() => {
    return (data?.warrants ?? []).filter(w => {
      const l = loteById.get(w.lote_id);
      if (fNro && !w.nro_warrant.toLowerCase().includes(fNro.toLowerCase())) return false;
      if (fEmpresa !== "__all" && w.empresa !== fEmpresa) return false;
      if (fFinanciera && !(w.financiera ?? "").toLowerCase().includes(fFinanciera.toLowerCase())) return false;
      if (fEstado !== "__all" && w.estado !== fEstado) return false;
      if (fLote && !(l?.codigo_lote ?? "").toLowerCase().includes(fLote.toLowerCase())) return false;
      if (fDesde && w.fecha_inicio < fDesde) return false;
      if (fHasta && w.fecha_inicio > fHasta) return false;
      return true;
    });
  }, [data, loteById, fNro, fEmpresa, fFinanciera, fEstado, fLote, fDesde, fHasta]);

  const limpiarFiltros = () => {
    setFNro(""); setFEmpresa("__all"); setFFinanciera(""); setFEstado("__all");
    setFDesde(""); setFHasta(""); setFLote("");
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar definitivamente este warrant?")) return;
    const { error } = await supabase.from("warrants").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Warrant eliminado"); qc.invalidateQueries(); }
  };

  const liberar = async (id: string) => {
    if (!confirm("¿Liberar este warrant?")) return;
    const { error } = await supabase.from("warrants").update({
      estado: "LIBERADO", fecha_liberacion: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Warrant liberado"); qc.invalidateQueries(); }
  };

  // --- Export helpers ---
  const buildRows = () => {
    const headers = ["Nº Warrant", "Lote", "Producto", "Empresa", "Financiera", "Inicio", "Fin", "Cajas warrant", "Stock lote", "Holgura", "Estado", "Fecha liberación"];
    const rows = filtered.map(w => {
      const l = loteById.get(w.lote_id);
      const p = l ? prodById.get(l.producto_id) : null;
      const stockTotal = stockByLote.get(w.lote_id) ?? 0;
      const activos = activeByLote.get(w.lote_id) ?? 0;
      return [
        w.nro_warrant,
        l?.codigo_lote ?? "",
        p?.descripcion ?? "",
        w.empresa ?? "",
        w.financiera ?? "",
        w.fecha_inicio ? formatDate(w.fecha_inicio) : "",
        w.fin_warrant ? formatDate(w.fin_warrant) : "",
        Number(w.cantidad_cajas_warrant),
        stockTotal,
        stockTotal - activos,
        w.estado,
        w.fecha_liberacion ? formatDate(w.fecha_liberacion) : "",
      ];
    });
    return { headers, rows };
  };

  const onPDF = async () => {
    const { headers, rows } = buildRows();
    await exportPDF({
      title: "Warrants",
      subtitle: `Registros: ${filtered.length} · Generado ${new Date().toLocaleString("es-PE")}`,
      headers, rows,
      filename: `warrants-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  const onXLSX = async () => {
    const { headers, rows } = buildRows();
    await exportXLSX({
      sheetName: "Warrants",
      headers, rows,
      filename: `warrants-${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  // --- Dashboard data ---
  const dash = useMemo(() => {
    const all = data?.warrants ?? [];
    const activos = all.filter(w => w.estado === "ACTIVO");
    const liberados = all.filter(w => w.estado === "LIBERADO");
    const cajasActivas = activos.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0);
    const cajasLiberadas = liberados.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0);

    const byEmpresa = new Map<string, number>();
    activos.forEach(w => byEmpresa.set(w.empresa ?? "SIN EMPRESA", (byEmpresa.get(w.empresa ?? "SIN EMPRESA") ?? 0) + Number(w.cantidad_cajas_warrant)));
    const empresaData = Array.from(byEmpresa.entries()).map(([name, value]) => ({ name, value }));

    const byFin = new Map<string, number>();
    activos.forEach(w => byFin.set(w.financiera ?? "SIN FIN.", (byFin.get(w.financiera ?? "SIN FIN.") ?? 0) + Number(w.cantidad_cajas_warrant)));
    const finData = Array.from(byFin.entries()).map(([name, cajas]) => ({ name, cajas }));

    // Holguras negativas (críticos)
    const criticos = activos.filter(w => {
      const stk = stockByLote.get(w.lote_id) ?? 0;
      const act = activeByLote.get(w.lote_id) ?? 0;
      return stk - act < 0;
    }).length;

    // Vencimientos próximos (fin_warrant en 30 días)
    const hoy = new Date();
    const en30 = new Date(); en30.setDate(hoy.getDate() + 30);
    const porVencer = activos.filter(w => w.fin_warrant && new Date(w.fin_warrant) <= en30 && new Date(w.fin_warrant) >= hoy).length;
    const vencidos = activos.filter(w => w.fin_warrant && new Date(w.fin_warrant) < hoy).length;

    return { totalActivos: activos.length, totalLiberados: liberados.length, cajasActivas, cajasLiberadas, empresaData, finData, criticos, porVencer, vencidos };
  }, [data, stockByLote, activeByLote]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Warrants</h1>
          <p className="text-muted-foreground">Control de cajas comprometidas con financieras</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button className="h-11"><Plus className="size-4" /> Nuevo warrant</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar warrant</DialogTitle></DialogHeader>
            <WarrantForm
              lotes={data?.lotes ?? []}
              productos={data?.productos ?? []}
              stockByLote={stockByLote}
              activeByLote={activeByLote}
              onDone={() => { setOpenNew(false); qc.invalidateQueries(); }}
            />
          </DialogContent>
        </Dialog>
      </header>

      <Tabs defaultValue="registros" className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-lg">
          <TabsTrigger value="registros">Registros</TabsTrigger>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>

        {/* ================= REGISTROS ================= */}
        <TabsContent value="registros" className="space-y-4">
          <RegistrosView
            warrants={data?.warrants ?? []}
            loteById={loteById}
            prodById={prodById}
            stockByLote={stockByLote}
            activeByLote={activeByLote}
            onView={setViewId}
            onEdit={setEditId}
            onLiberar={liberar}
            onEliminar={eliminar}
          />
        </TabsContent>

        {/* ================= RESUMEN ================= */}
        <TabsContent value="resumen" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Filter className="size-4" /> Filtros</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={limpiarFiltros}><X className="size-3.5" /> Limpiar</Button>
                <Button variant="outline" size="sm" onClick={onPDF}><FileDown className="size-3.5" /> PDF</Button>
                <Button variant="outline" size="sm" onClick={onXLSX}><FileSpreadsheet className="size-3.5" /> Excel</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nº Warrant</Label>
                <Input value={fNro} onChange={e => setFNro(e.target.value)} placeholder="Buscar…" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lote</Label>
                <Input value={fLote} onChange={e => setFLote(e.target.value)} placeholder="Código lote" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                <Select value={fEmpresa} onValueChange={setFEmpresa}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Todas</SelectItem>
                    {EMPRESAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Financiera</Label>
                <Input value={fFinanciera} onChange={e => setFFinanciera(e.target.value)} placeholder="Buscar…" className="h-9" list="fin-list" />
                <datalist id="fin-list">
                  {financierasUnicas.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Estado</Label>
                <Select value={fEstado} onValueChange={setFEstado}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Todos</SelectItem>
                    <SelectItem value="ACTIVO">ACTIVO</SelectItem>
                    <SelectItem value="LIBERADO">LIBERADO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Desde</Label>
                <Input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Hasta</Label>
                <Input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} className="h-9" />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiMini label="Warrants filtrados" value={filtered.length} />
            <KpiMini label="Cajas totales" value={filtered.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0)} decimals={2} />
            <KpiMini label="Activos" value={filtered.filter(w => w.estado === "ACTIVO").length} tone="destructive" />
            <KpiMini label="Liberados" value={filtered.filter(w => w.estado === "LIBERADO").length} tone="success" />
          </div>

          <Card className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Nº Warrant</th>
                  <th className="text-left px-3 py-2">Lote</th>
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-left px-3 py-2">Empresa</th>
                  <th className="text-left px-3 py-2">Financiera</th>
                  <th className="text-left px-3 py-2">Inicio</th>
                  <th className="text-left px-3 py-2">Fin</th>
                  <th className="text-right px-3 py-2">Cajas</th>
                  <th className="text-left px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const l = loteById.get(w.lote_id);
                  const p = l ? prodById.get(l.producto_id) : null;
                  return (
                    <tr key={w.id} className="border-t">
                      <td className="px-3 py-2 font-mono">{w.nro_warrant}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l?.codigo_lote}</td>
                      <td className="px-3 py-2 text-xs">{p?.descripcion}</td>
                      <td className="px-3 py-2">{w.empresa ?? "—"}</td>
                      <td className="px-3 py-2">{w.financiera ?? "—"}</td>
                      <td className="px-3 py-2">{formatDate(w.fecha_inicio)}</td>
                      <td className="px-3 py-2">{w.fin_warrant ? formatDate(w.fin_warrant) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatNumber(w.cantidad_cajas_warrant, 3)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={w.estado === "ACTIVO" ? "destructive" : "outline"}>{w.estado}</Badge>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Sin resultados con los filtros aplicados</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ================= DASHBOARD ================= */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Warrants activos" value={dash.totalActivos} icon={FileLock2} tone="destructive" />
            <KpiCard label="Warrants liberados" value={dash.totalLiberados} icon={CheckCircle2} tone="success" />
            <KpiCard label="Cajas comprometidas" value={dash.cajasActivas} icon={Package} tone="primary" decimals={2} />
            <KpiCard label="Cajas liberadas" value={dash.cajasLiberadas} icon={TrendingUp} tone="muted" decimals={2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <KpiCard label="Lotes con holgura negativa" value={dash.criticos} icon={AlertTriangle} tone="destructive" sub="Cajas warrant > stock" />
            <KpiCard label="Por vencer (30 días)" value={dash.porVencer} icon={AlertTriangle} tone="warning" />
            <KpiCard label="Vencidos" value={dash.vencidos} icon={AlertTriangle} tone="destructive" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Cajas activas por financiera</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dash.finData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="cajas" fill="#1E3A5F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Distribución por empresa (cajas activas)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dash.empresaData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                      {dash.empresaData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Ver detalle */}
      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle del warrant</DialogTitle></DialogHeader>
          {viewId && data && (() => {
            const w = data.warrants.find(x => x.id === viewId);
            if (!w) return null;
            const l = loteById.get(w.lote_id);
            const p = l ? prodById.get(l.producto_id) : null;
            const stk = stockByLote.get(w.lote_id) ?? 0;
            const act = activeByLote.get(w.lote_id) ?? 0;
            return (
              <div className="space-y-2 text-sm">
                <Row k="Nº Warrant" v={w.nro_warrant} />
                <Row k="Estado" v={w.estado} />
                <Row k="Empresa" v={w.empresa ?? "—"} />
                <Row k="Financiera" v={w.financiera ?? "—"} />
                <Row k="Lote" v={l?.codigo_lote ?? "—"} />
                <Row k="Producto" v={p?.descripcion ?? "—"} />
                <Row k="Cajas warrant" v={formatNumber(w.cantidad_cajas_warrant, 3)} />
                <Row k="Stock lote" v={formatNumber(stk)} />
                <Row k="Holgura" v={formatNumber(stk - act)} />
                <Row k="Fecha inicio" v={formatDate(w.fecha_inicio)} />
                <Row k="Fin warrant" v={w.fin_warrant ? formatDate(w.fin_warrant) : "—"} />
                <Row k="Fecha liberación" v={w.fecha_liberacion ? formatDate(w.fecha_liberacion) : "—"} />
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar warrant</DialogTitle></DialogHeader>
          {editId && data && (
            <WarrantForm
              lotes={data.lotes}
              productos={data.productos}
              stockByLote={stockByLote}
              activeByLote={activeByLote}
              existing={data.warrants.find(w => w.id === editId)}
              onDone={() => { setEditId(null); qc.invalidateQueries(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

function KpiMini({ label, value, decimals = 0, tone }: { label: string; value: number; decimals?: number; tone?: "success" | "destructive" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneCls}`}>{formatNumber(value, decimals)}</div>
    </Card>
  );
}

function KpiCard({ label, value, icon: Icon, tone, sub, decimals = 0 }: {
  label: string; value: number; icon: any; tone: "primary" | "success" | "warning" | "destructive" | "muted"; sub?: string; decimals?: number;
}) {
  const toneBg =
    tone === "primary" ? "bg-primary/10 text-primary" :
    tone === "success" ? "bg-success/10 text-success" :
    tone === "warning" ? "bg-warning/10 text-warning" :
    tone === "destructive" ? "bg-destructive/10 text-destructive" :
    "bg-muted text-muted-foreground";
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`size-11 rounded-xl flex items-center justify-center ${toneBg}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold leading-tight">{formatNumber(value, decimals)}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}

function WarrantForm({
  lotes, productos, stockByLote, activeByLote, existing, onDone,
}: {
  lotes: any[];
  productos: any[];
  stockByLote: Map<string, number>;
  activeByLote: Map<string, number>;
  existing?: any;
  onDone: () => void;
}) {
  const [nro, setNro] = useState(existing?.nro_warrant ?? "");
  const [loteId, setLoteId] = useState(existing?.lote_id ?? "");
  const [cantidad, setCantidad] = useState(existing ? String(existing.cantidad_cajas_warrant) : "");
  const [financiera, setFinanciera] = useState(existing?.financiera ?? "");
  const [empresa, setEmpresa] = useState<string>(existing?.empresa ?? "");
  const [fechaInicio, setFechaInicio] = useState(existing?.fecha_inicio ?? new Date().toISOString().slice(0, 10));
  const [finWarrant, setFinWarrant] = useState(existing?.fin_warrant ?? "");
  const [estado, setEstado] = useState(existing?.estado ?? "ACTIVO");
  const [fechaLib, setFechaLib] = useState(existing?.fecha_liberacion ?? "");
  const [saving, setSaving] = useState(false);

  const stockTotal = loteId ? (stockByLote.get(loteId) ?? 0) : 0;
  const activos = loteId ? (activeByLote.get(loteId) ?? 0) : 0;
  const currentQty = existing ? Number(existing.cantidad_cajas_warrant) : 0;
  const holgura = stockTotal - activos + (existing ? currentQty : 0);

  const prodById = useMemo(() => new Map(productos.map((p: any) => [p.id, p])), [productos]);
  const loteOptions = useMemo<SearchSelectOption[]>(() => {
    return lotes.map((l: any) => {
      const prod: any = prodById.get(l.producto_id);
      const stk = stockByLote.get(l.id) ?? 0;
      const act = activeByLote.get(l.id) ?? 0;
      return {
        value: l.id,
        label: l.codigo_lote,
        description: prod ? `${prod.codigo_base} · ${prod.descripcion}` : undefined,
        searchText: `${prod?.codigo_base ?? ""} ${prod?.descripcion ?? ""}`,
        meta: [
          { label: "Stock", value: `${formatNumber(stk)} cj` },
          { label: "Warrant", value: `${formatNumber(act)} cj` },
          { label: "Holgura", value: `${formatNumber(stk - act)} cj` },
          l.estado ? { label: "Estado", value: l.estado } : null,
        ].filter(Boolean) as SearchSelectOption["meta"],
      };
    });
  }, [lotes, prodById, stockByLote, activeByLote]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nro || !loteId || !fechaInicio) { toast.error("Completa warrant, lote y fecha"); return; }
    const c = cantidad.trim() === "" ? 0 : parseFloat(cantidad);
    if (!Number.isFinite(c) || c <= 0) { toast.error("Cantidad inválida"); return; }
    if (c > holgura) {
      toast.error(`Cantidad supera holgura disponible (${formatNumber(holgura)} cj)`);
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        nro_warrant: nro, lote_id: loteId, cantidad_cajas_warrant: c,
        financiera: financiera || null, empresa: empresa || null,
        fecha_inicio: fechaInicio, fin_warrant: finWarrant || null,
        estado, fecha_liberacion: estado === "LIBERADO" ? (fechaLib || new Date().toISOString().slice(0, 10)) : null,
      };
      const { error } = existing
        ? await supabase.from("warrants").update(payload).eq("id", existing.id)
        : await supabase.from("warrants").insert(payload);
      if (error) throw error;
      toast.success(existing ? "Warrant actualizado" : "Warrant registrado");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-1.5">
        <Label>Nº Warrant *</Label>
        <Input value={nro} onChange={(e) => setNro(e.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label>Lote *</Label>
        <SearchSelect
          value={loteId}
          onValueChange={setLoteId}
          options={loteOptions}
          placeholder="Seleccionar lote"
          searchPlaceholder="Buscar lote (código, producto)…"
        />
        {loteId && (
          <p className="text-xs text-muted-foreground">
            Stock: {formatNumber(stockTotal)} · Activos: {formatNumber(activos)} ·
            <span className="font-semibold"> Holgura: {formatNumber(holgura)} cj</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cajas *</Label>
          <Input type="number" step="0.001" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Fecha inicio *</Label>
          <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Fin warrant</Label>
          <Input type="date" value={finWarrant} onChange={(e) => setFinWarrant(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label>Empresa</Label>
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              {EMPRESAS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Financiera</Label>
        <Input value={financiera} onChange={(e) => setFinanciera(e.target.value)} className="h-11" />
      </div>
      {existing && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVO">ACTIVO</SelectItem>
                <SelectItem value="LIBERADO">LIBERADO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {estado === "LIBERADO" && (
            <div className="space-y-1.5">
              <Label>Fecha liberación</Label>
              <Input type="date" value={fechaLib} onChange={(e) => setFechaLib(e.target.value)} className="h-11" />
            </div>
          )}
        </div>
      )}
      <Button type="submit" className="w-full h-11" disabled={saving}>
        {saving ? "Guardando…" : existing ? "Actualizar" : "Registrar warrant"}
      </Button>
    </form>
  );
}

// ============ REGISTROS: agrupados por Nº Warrant ============
function RegistrosView({
  warrants, loteById, prodById, stockByLote, activeByLote,
  onView, onEdit, onLiberar, onEliminar,
}: {
  warrants: any[];
  loteById: Map<string, any>;
  prodById: Map<string, any>;
  stockByLote: Map<string, number>;
  activeByLote: Map<string, number>;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onLiberar: (id: string) => void;
  onEliminar: (id: string) => void;
}) {
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return warrants;
    return warrants.filter(w => {
      const l = loteById.get(w.lote_id);
      const p = l ? prodById.get(l.producto_id) : null;
      return [w.nro_warrant, w.empresa, w.financiera, l?.codigo_lote, p?.descripcion]
        .some((v: any) => (v ?? "").toString().toLowerCase().includes(t));
    });
  }, [warrants, q, loteById, prodById]);

  const grupos = useMemo(() => {
    const m = new Map<string, any[]>();
    shown.forEach(w => {
      const k = w.nro_warrant ?? "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(w);
    });
    return Array.from(m.entries()).map(([nro, items]) => {
      const cajas = items.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0);
      const activos = items.filter(w => w.estado === "ACTIVO").length;
      const liberados = items.filter(w => w.estado === "LIBERADO").length;
      return { nro, items, cajas, activos, liberados };
    }).sort((a, b) => (b.items[0]?.created_at ?? "").localeCompare(a.items[0]?.created_at ?? ""));
  }, [shown]);

  const totals = useMemo(() => {
    const totalCajas = shown.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0);
    const activos = shown.filter(w => w.estado === "ACTIVO");
    const liberados = shown.filter(w => w.estado === "LIBERADO");
    return {
      grupos: grupos.length,
      totalRegistros: shown.length,
      totalCajas,
      cajasActivas: activos.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0),
      cajasLiberadas: liberados.reduce((s, w) => s + Number(w.cantidad_cajas_warrant), 0),
      activos: activos.length,
      liberados: liberados.length,
    };
  }, [shown, grupos]);

  const buildRows = () => {
    const headers = ["Nº Warrant", "Lote", "Producto", "Empresa", "Financiera", "Inicio", "Fin", "Cajas warrant", "Stock lote", "Holgura", "Estado", "Fecha liberación"];
    const rows: (string | number)[][] = [];
    grupos.forEach(g => {
      g.items.forEach(w => {
        const l = loteById.get(w.lote_id);
        const p = l ? prodById.get(l.producto_id) : null;
        const stk = stockByLote.get(w.lote_id) ?? 0;
        const act = activeByLote.get(w.lote_id) ?? 0;
        rows.push([
          w.nro_warrant, l?.codigo_lote ?? "", p?.descripcion ?? "",
          w.empresa ?? "", w.financiera ?? "",
          w.fecha_inicio ? formatDate(w.fecha_inicio) : "",
          w.fin_warrant ? formatDate(w.fin_warrant) : "",
          Number(w.cantidad_cajas_warrant), stk, stk - act, w.estado,
          w.fecha_liberacion ? formatDate(w.fecha_liberacion) : "",
        ]);
      });
      rows.push(["", "", "", "", "", "", `Subtotal ${g.nro}`, g.cajas, "", "", `${g.activos} act · ${g.liberados} lib`, ""]);
    });
    return { headers, rows };
  };

  const onPDF = async () => {
    const { headers, rows } = buildRows();
    await exportPDF({
      title: "Warrants — Registros agrupados",
      subtitle: `${totals.grupos} warrants · ${totals.totalRegistros} registros · ${formatNumber(totals.totalCajas)} cajas · Generado ${new Date().toLocaleString("es-PE")}`,
      headers, rows,
      filename: `warrants-registros-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };
  const onXLSX = async () => {
    const { headers, rows } = buildRows();
    await exportXLSX({
      sheetName: "Registros",
      headers, rows,
      filename: `warrants-registros-${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Encabezado con resumen y acciones */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Nº Warrants</div><div className="text-2xl font-bold">{totals.grupos}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Registros</div><div className="text-2xl font-bold">{totals.totalRegistros}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Cajas totales</div><div className="text-2xl font-bold">{formatNumber(totals.totalCajas)}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Activos</div><div className="text-2xl font-bold text-destructive">{totals.activos}</div><div className="text-xs text-muted-foreground">{formatNumber(totals.cajasActivas)} cj</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Liberados</div><div className="text-2xl font-bold">{totals.liberados}</div><div className="text-xs text-muted-foreground">{formatNumber(totals.cajasLiberadas)} cj</div></Card>
      </div>

      <Card className="p-3 flex items-center justify-between gap-2 flex-wrap">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar Nº warrant, lote, producto, empresa, financiera…"
          className="h-9 max-w-md"
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPDF}><FileDown className="size-3.5" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={onXLSX}><FileSpreadsheet className="size-3.5" /> Excel</Button>
        </div>
      </Card>

      <div className="space-y-3">
        {grupos.map(g => (
          <Card key={g.nro} className="overflow-hidden">
            <div className="bg-muted/60 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 border-b">
              <div className="flex items-center gap-3">
                <FileLock2 className="size-4 text-primary" />
                <span className="font-mono font-semibold">{g.nro}</span>
                <Badge variant="outline">{g.items.length} {g.items.length === 1 ? "lote" : "lotes"}</Badge>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span><span className="text-muted-foreground">Cajas:</span> <b className="tabular-nums">{formatNumber(g.cajas)}</b></span>
                <span className="text-destructive">ACT: {g.activos}</span>
                <span className="text-muted-foreground">LIB: {g.liberados}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Lote / Producto</th>
                    <th className="text-left px-3 py-2">Empresa</th>
                    <th className="text-left px-3 py-2">Financiera</th>
                    <th className="text-left px-3 py-2">Inicio</th>
                    <th className="text-left px-3 py-2">Fin</th>
                    <th className="text-right px-3 py-2">Cajas</th>
                    <th className="text-right px-3 py-2">Stock</th>
                    <th className="text-right px-3 py-2">Holgura</th>
                    <th className="text-left px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map(w => {
                    const l = loteById.get(w.lote_id);
                    const p = l ? prodById.get(l.producto_id) : null;
                    const stk = stockByLote.get(w.lote_id) ?? 0;
                    const holgura = stk - (activeByLote.get(w.lote_id) ?? 0);
                    return (
                      <tr key={w.id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">{l?.codigo_lote}</div>
                          <div className="text-xs text-muted-foreground">{p?.descripcion}</div>
                        </td>
                        <td className="px-3 py-2">{w.empresa ?? "—"}</td>
                        <td className="px-3 py-2">{w.financiera ?? "—"}</td>
                        <td className="px-3 py-2">{formatDate(w.fecha_inicio)}</td>
                        <td className="px-3 py-2">{w.fin_warrant ? formatDate(w.fin_warrant) : "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatNumber(w.cantidad_cajas_warrant, 3)}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(stk)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${holgura < 0 ? "text-destructive" : holgura === 0 ? "text-warning" : ""}`}>
                          {formatNumber(holgura)}
                        </td>
                        <td className="px-3 py-2">
                          {w.estado === "ACTIVO" ? (
                            <Badge variant="destructive"><FileLock2 className="size-3 mr-1" />ACTIVO</Badge>
                          ) : (
                            <Badge variant="outline">LIBERADO {w.fecha_liberacion ? `· ${formatDate(w.fecha_liberacion)}` : ""}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" className="size-8" title="Ver" onClick={() => onView(w.id)}>
                              <Eye className="size-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8" title="Editar" onClick={() => onEdit(w.id)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            {w.estado === "ACTIVO" && (
                              <Button size="icon" variant="ghost" className="size-8" title="Liberar" onClick={() => onLiberar(w.id)}>
                                <Unlock className="size-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="size-8 text-destructive hover:text-destructive" title="Eliminar" onClick={() => onEliminar(w.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
        {grupos.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Sin warrants registrados</Card>
        )}
      </div>
    </div>
  );
}
