import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import {
  Plus, Trash2, FileSpreadsheet, FileText, Factory, Eye, Search,
  Package, AlertTriangle, TrendingDown, ClipboardList, Link2, History, Pencil,
} from "lucide-react";
import { useRoles } from "@/hooks/use-role";

import { SearchSelect } from "@/components/ui/search-select";

export const Route = createFileRoute("/_authenticated/lance-produccion")({
  component: LanceProduccionPage,
});

type Lance = {
  id: string; numero: number; fecha: string;
  usuario_cliente: string; producto: string; envase: string; latas_por_caja: number;
  packing?: number | null; estado?: string | null;
  envasado: string | null; aceite: string | null; agua: string | null;
  parametros_extra: { nombre: string; valor: string; unidad?: string }[];
  carros: number;
  envasado_cajas: number; envasado_latas: number;
  lance_prod_cajas: number; lance_prod_latas: number;
  lance_real_cajas: number; lance_real_latas: number;
  merma_pruebas_cajas: number; merma_pruebas_latas: number;
  merma_malas_cajas: number; merma_malas_latas: number;
  merma_maquina_cajas: number; merma_maquina_latas: number;
  merma_muestras_cajas: number; merma_muestras_latas: number;
  observaciones: string | null;
  created_at: string;
};


type LanceInsumoRow = {
  id?: string;
  orden: number;
  insumo_id: string | null;
  nombre: string;
  presentacion: string;
  cantidad: number;
  observacion?: string | null;
  movimiento_insumo_id?: string | null;
};

type InsumoCat = { id: string; codigo: string; insumo: string; formato: string | null; unidad: string };

const ENVASES = ["1/2 LB", "1 LB TALL", "TINAPON", "OTRO"];
const LATAS_POR_CAJA_DEFAULT: Record<string, number> = { "1/2 LB": 48, "1 LB TALL": 24, "TINAPON": 24, "OTRO": 48 };
const CLIENTE_DEFAULT = "CASALI - QALIWARMA";
const ENVASADO_GR_OPTS = ["107 - 108", "112 - 113"];

// Insumos por defecto según el reporte
const INSUMOS_TEMPLATE: Omit<LanceInsumoRow, "orden">[] = [
  { insumo_id: null, nombre: "T/# Envases", presentacion: "", cantidad: 0 },
  { insumo_id: null, nombre: "T/ Tapa", presentacion: "", cantidad: 0 },
  { insumo_id: null, nombre: "Goma Espesante", presentacion: "", cantidad: 0 },
  { insumo_id: null, nombre: "Sal", presentacion: "SACO X 25 KLS", cantidad: 0 },
  { insumo_id: null, nombre: "Pasta de Tomate", presentacion: "", cantidad: 0 },
  { insumo_id: null, nombre: "Ayudin 2.6 Litros", presentacion: "UND X 2.6 LITROS", cantidad: 0 },
  { insumo_id: null, nombre: "CIF (UN)", presentacion: "UND X 450ML", cantidad: 0 },
  { insumo_id: null, nombre: "Aceite (LTS)", presentacion: "VEGETAL", cantidad: 0 },
  { insumo_id: null, nombre: "Doña Gusta (PQTS)", presentacion: "", cantidad: 0 },
  { insumo_id: null, nombre: "Ajinomoto (KLS)", presentacion: "", cantidad: 0 },
];

const totalLatas = (cajas: number, latas: number, lpc = 48) => cajas * lpc + latas;

function LanceProduccionPage() {
  const { isAdmin } = useRoles();
  const qc = useQueryClient();
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Lance | null>(null);
  const [openDetail, setOpenDetail] = useState<Lance | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");

  const { data: lances = [], isLoading } = useQuery({
    queryKey: ["lances", from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lances_produccion").select("*")
        .gte("fecha", from).lte("fecha", to)
        .order("fecha", { ascending: false })
        .order("numero", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lance[];
    },
  });

  const { data: insumosCat = [] } = useQuery({
    queryKey: ["insumos-catalogo-lance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insumos")
        .select("id,codigo,insumo,formato,unidad").eq("activo", true)
        .order("insumo");
      if (error) throw error;
      return (data ?? []) as InsumoCat[];
    },
  });

  const { data: productosCat = [] } = useQuery({
    queryKey: ["productos-catalogo-lance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("productos")
        .select("id,descripcion,envase").eq("activo", true)
        .order("descripcion");
      if (error) throw error;
      // Deduplicar por descripción (case-insensitive) para no mostrar el mismo producto dos veces
      const seen = new Set<string>();
      const unique: { id: string; descripcion: string; envase: string | null }[] = [];
      for (const p of (data ?? []) as any[]) {
        const k = (p.descripcion ?? "").trim().toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        unique.push(p);
      }
      return unique;
    },
  });


  // Últimas 10 SALIDAS de insumos → catálogo filtrado para vincular
  const { data: insumosSalidaRecent = [] } = useQuery({
    queryKey: ["insumos-salida-recientes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("insumos_movimientos")
        .select("insumo_id, fecha, created_at")
        .eq("clase", "SALIDA")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const seen = new Set<string>();
      const list: string[] = [];
      for (const r of (data ?? []) as any[]) {
        if (r.insumo_id && !seen.has(r.insumo_id)) {
          seen.add(r.insumo_id);
          list.push(r.insumo_id);
          if (list.length >= 10) break;
        }
      }
      return list;
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return lances;
    return lances.filter((l) =>
      l.producto.toLowerCase().includes(term) ||
      l.usuario_cliente.toLowerCase().includes(term) ||
      String(l.numero).includes(term),
    );
  }, [lances, q]);

  // Métricas del período
  const kpis = useMemo(() => {
    const totalLances = lances.length;
    let totalReal = 0, totalProd = 0, totalMermas = 0;
    lances.forEach((l) => {
      totalProd += totalLatas(l.lance_prod_cajas, l.lance_prod_latas, l.latas_por_caja);
      totalReal += totalLatas(l.lance_real_cajas, l.lance_real_latas, l.latas_por_caja);
      totalMermas +=
        totalLatas(l.merma_pruebas_cajas, l.merma_pruebas_latas, l.latas_por_caja) +
        totalLatas(l.merma_malas_cajas, l.merma_malas_latas, l.latas_por_caja) +
        totalLatas(l.merma_maquina_cajas, l.merma_maquina_latas, l.latas_por_caja) +
        totalLatas(l.merma_muestras_cajas, l.merma_muestras_latas, l.latas_por_caja);
    });
    return { totalLances, totalReal, totalProd, totalMermas };
  }, [lances]);

  const exportLista = async (kind: "xlsx" | "pdf") => {
    const headers = ["N°", "Fecha", "Producto", "Cliente", "Envase", "Cajas Real (latas)", "Cajas Proyectado (latas)", "Mermas (latas)"];
    const rows = filtered.map((l) => {
      const mermaLatas =
        totalLatas(l.merma_pruebas_cajas, l.merma_pruebas_latas, l.latas_por_caja) +
        totalLatas(l.merma_malas_cajas, l.merma_malas_latas, l.latas_por_caja) +
        totalLatas(l.merma_maquina_cajas, l.merma_maquina_latas, l.latas_por_caja) +
        totalLatas(l.merma_muestras_cajas, l.merma_muestras_latas, l.latas_por_caja);
      return [
        l.numero, l.fecha, l.producto, l.usuario_cliente, l.envase,
        `${formatNumber(l.lance_real_cajas, 0)} cajas (${formatNumber(totalLatas(l.lance_real_cajas, l.lance_real_latas, l.latas_por_caja), 0)} latas)`,
        `${formatNumber(l.lance_prod_cajas, 0)} cajas (${formatNumber(totalLatas(l.lance_prod_cajas, l.lance_prod_latas, l.latas_por_caja), 0)} latas)`,
        mermaLatas,
      ];
    });
    const opts = {
      title: "Lances de Producción",
      subtitle: `${from} a ${to} · ${filtered.length} lances`,
      headers, rows,
      filename: `lances-produccion.${kind}`,
      summary: [
        { label: "Lances", value: kpis.totalLances },
        { label: "Total real", value: `${formatNumber(filtered.reduce((a, l) => a + l.lance_real_cajas, 0), 0)} cajas (${formatNumber(kpis.totalReal, 0)} latas)` },
        { label: "Total mermas", value: formatNumber(kpis.totalMermas, 0) },
      ],
    };
    if (kind === "xlsx") await exportXLSX({ sheetName: "Lances", ...opts });
    else await exportPDF(opts);
  };

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("lances_produccion").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lance eliminado"); qc.invalidateQueries({ queryKey: ["lances"] }); },
    onError: (e: any) => toast.error(e.message ?? "Error al eliminar"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Factory className="size-6" /> Lance de Producción</h1>
          <p className="text-sm text-muted-foreground">Registro detallado de cada lance con vinculación a insumos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportLista("xlsx")}><FileSpreadsheet className="size-4" /> Excel</Button>
          <Button variant="outline" onClick={() => exportLista("pdf")}><FileText className="size-4" /> PDF</Button>
          <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild><Button onClick={() => setEditing(null)}><Plus className="size-4" /> Nuevo lance</Button></DialogTrigger>
            <LanceFormDialog
              key={editing?.id ?? "new"}
              initial={editing}
              insumosCat={insumosCat}
              productosCat={productosCat}
              insumosSalidaRecent={insumosSalidaRecent}
              onDone={() => { setOpenForm(false); setEditing(null); qc.invalidateQueries({ queryKey: ["lances"] }); }}
            />
          </Dialog>

        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI icon={<ClipboardList className="size-4" />} label="Lances" value={kpis.totalLances} />
        <KPI icon={<Package className="size-4" />} label="Real (cajas/latas)" value={`${formatNumber(lances.reduce((a, l) => a + l.lance_real_cajas, 0), 0)} / ${formatNumber(kpis.totalReal, 0)}`} tone="emerald" />
        <KPI icon={<Factory className="size-4" />} label="Proyectado (cajas/latas)" value={`${formatNumber(lances.reduce((a, l) => a + l.lance_prod_cajas, 0), 0)} / ${formatNumber(kpis.totalProd, 0)}`} />
        <KPI icon={<TrendingDown className="size-4" />} label="Mermas (latas)" value={formatNumber(kpis.totalMermas, 0)} tone="rose" />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5 flex-1 min-w-[220px]">
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Producto, cliente o N°…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Lista de lances</TabsTrigger>
          <TabsTrigger value="resumen">Resumen por producto</TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader><CardTitle className="text-base">Lances ({filtered.length})</CardTitle></CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Envase</TableHead>
                    <TableHead className="text-right">Real (latas)</TableHead>
                    <TableHead className="text-right">Proyectado (latas)</TableHead>
                    <TableHead className="text-right">Mermas</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-6">Cargando…</TableCell></TableRow>}
                  {!isLoading && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Sin lances en el período</TableCell></TableRow>
                  )}
                  {filtered.map((l) => {
                    const mermaLatas =
                      totalLatas(l.merma_pruebas_cajas, l.merma_pruebas_latas, l.latas_por_caja) +
                      totalLatas(l.merma_malas_cajas, l.merma_malas_latas, l.latas_por_caja) +
                      totalLatas(l.merma_maquina_cajas, l.merma_maquina_latas, l.latas_por_caja) +
                      totalLatas(l.merma_muestras_cajas, l.merma_muestras_latas, l.latas_por_caja);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono">#{l.numero}</TableCell>
                        <TableCell>{l.fecha}</TableCell>
                        <TableCell className="font-medium">{l.producto}</TableCell>
                        <TableCell className="text-xs">{l.usuario_cliente}</TableCell>
                        <TableCell><Badge variant="outline">{l.envase}</Badge></TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold text-emerald-700">{formatNumber(l.lance_real_cajas, 0)} cajas</span>
                          <div className="text-[10px] text-muted-foreground">({formatNumber(totalLatas(l.lance_real_cajas, l.lance_real_latas, l.latas_por_caja), 0)} latas)</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold">{formatNumber(l.lance_prod_cajas, 0)} cajas</span>
                          <div className="text-[10px] text-muted-foreground">({formatNumber(totalLatas(l.lance_prod_cajas, l.lance_prod_latas, l.latas_por_caja), 0)} latas)</div>
                        </TableCell>
                        <TableCell className="text-right text-rose-600">{formatNumber(mermaLatas, 0)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => setOpenDetail(l)}><Eye className="size-4" /></Button>
                            {isAdmin && (
                              <Button size="icon" variant="ghost" onClick={() => {
                                if (confirm(`¿Eliminar lance #${l.numero}?`)) delMut.mutate(l.id);
                              }}><Trash2 className="size-4 text-rose-600" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumen">
          <ResumenPorProducto lances={filtered} />
        </TabsContent>
      </Tabs>

      <LanceDetailDialog lance={openDetail} onClose={() => setOpenDetail(null)} />
    </div>
  );
}

function KPI({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "emerald" | "rose" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ResumenPorProducto({ lances }: { lances: Lance[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, { producto: string; envase: string; lances: number; real: number; prod: number; mermas: number }>();
    lances.forEach((l) => {
      const k = `${l.producto}||${l.envase}`;
      const cur = m.get(k) ?? { producto: l.producto, envase: l.envase, lances: 0, real: 0, prod: 0, mermas: 0 };
      cur.lances += 1;
      cur.real += totalLatas(l.lance_real_cajas, l.lance_real_latas, l.latas_por_caja);
      cur.prod += totalLatas(l.lance_prod_cajas, l.lance_prod_latas, l.latas_por_caja);
      cur.mermas +=
        totalLatas(l.merma_pruebas_cajas, l.merma_pruebas_latas, l.latas_por_caja) +
        totalLatas(l.merma_malas_cajas, l.merma_malas_latas, l.latas_por_caja) +
        totalLatas(l.merma_maquina_cajas, l.merma_maquina_latas, l.latas_por_caja) +
        totalLatas(l.merma_muestras_cajas, l.merma_muestras_latas, l.latas_por_caja);
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.real - a.real);
  }, [lances]);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Resumen por producto · envase</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead><TableHead>Envase</TableHead>
              <TableHead className="text-right">Lances</TableHead>
              <TableHead className="text-right">Real (latas)</TableHead>
              <TableHead className="text-right">Proyectado (latas)</TableHead>
              <TableHead className="text-right">Mermas</TableHead>
              <TableHead className="text-right">% Merma</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.producto}</TableCell>
                <TableCell><Badge variant="outline">{r.envase}</Badge></TableCell>
                <TableCell className="text-right">{r.lances}</TableCell>
                <TableCell className="text-right text-emerald-700 font-semibold">{formatNumber(r.real, 0)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.prod, 0)}</TableCell>
                <TableCell className="text-right text-rose-600">{formatNumber(r.mermas, 0)}</TableCell>
                <TableCell className="text-right">{r.prod > 0 ? formatNumber((r.mermas / r.prod) * 100, 2) : "0.00"}%</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin datos</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------------- */
/* FORM DIALOG                                                                */
/* ------------------------------------------------------------------------- */

function LanceFormDialog({
  insumosCat, productosCat, insumosSalidaRecent, onDone,
}: {
  insumosCat: InsumoCat[];
  productosCat: { id: string; descripcion: string; envase: string | null }[];
  insumosSalidaRecent: string[];
  onDone: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [usuarioCliente, setUsuarioCliente] = useState(CLIENTE_DEFAULT);
  const [producto, setProducto] = useState("");
  const [productoCustom, setProductoCustom] = useState(false);
  const [envase, setEnvase] = useState("1/2 LB");
  const [latasPorCaja, setLatasPorCaja] = useState(48);
  const [envasado, setEnvasado] = useState("");
  const [envasadoCustom, setEnvasadoCustom] = useState(false);
  const [aceite, setAceite] = useState("");
  const [agua, setAgua] = useState("");
  const [carros, setCarros] = useState(0);

  const [envasadoCajas, setEnvasadoCajas] = useState(0);
  const [envasadoLatasSueltas, setEnvasadoLatasSueltas] = useState(0);
  const [prodCajas, setProdCajas] = useState(0);
  const [prodLatas, setProdLatas] = useState(0);
  const [realCajas, setRealCajas] = useState(0);
  const [realLatas, setRealLatas] = useState(0);

  const [mPruebas, setMPruebas] = useState({ c: 0, l: 0 });
  const [mMalas, setMMalas] = useState({ c: 0, l: 0 });
  const [mMaquina, setMMaquina] = useState({ c: 0, l: 0 });
  const [mMuestras, setMMuestras] = useState({ c: 0, l: 0 });

  const [observaciones, setObservaciones] = useState("");
  const [insumos, setInsumos] = useState<LanceInsumoRow[]>(
    INSUMOS_TEMPLATE.map((t, i) => ({ ...t, orden: i })),
  );
  const [registrarMovs, setRegistrarMovs] = useState(true);

  const totalEnvasado = totalLatas(envasadoCajas, envasadoLatasSueltas, latasPorCaja);
  const totalProd = totalLatas(prodCajas, prodLatas, latasPorCaja);
  const totalReal = totalLatas(realCajas, realLatas, latasPorCaja);
  const totalMermas =
    totalLatas(mPruebas.c, mPruebas.l, latasPorCaja) +
    totalLatas(mMalas.c, mMalas.l, latasPorCaja) +
    totalLatas(mMaquina.c, mMaquina.l, latasPorCaja) +
    totalLatas(mMuestras.c, mMuestras.l, latasPorCaja);

  const qc = useQueryClient();

  const onEnvaseChange = (v: string) => {
    setEnvase(v);
    setLatasPorCaja(LATAS_POR_CAJA_DEFAULT[v] ?? 48);
  };

  const updIns = (i: number, patch: Partial<LanceInsumoRow>) => {
    setInsumos((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addIns = () => setInsumos((p) => [...p, { orden: p.length, insumo_id: null, nombre: "", presentacion: "", cantidad: 0 }]);
  const rmIns = (i: number) => setInsumos((p) => p.filter((_, idx) => idx !== i));

  const saveMut = useMutation({
    mutationFn: async (opts: { estado: "BORRADOR" | "COMPLETO" }) => {
      if (!producto.trim()) throw new Error("Producto es requerido");
      if (opts.estado === "COMPLETO" && totalReal <= 0 && totalEnvasado <= 0)
        throw new Error("Ingresa el lance real o el envasado antes de guardar como completo");
      const { data: userRes } = await supabase.auth.getUser();

      const payload = {
        fecha, usuario_cliente: usuarioCliente, producto, envase, latas_por_caja: latasPorCaja,
        packing: latasPorCaja,
        estado: opts.estado,
        envasado: envasado || null, aceite: aceite || null, agua: agua || null,
        parametros_extra: [],
        carros,
        envasado_cajas: envasadoCajas, envasado_latas: envasadoLatasSueltas,
        lance_prod_cajas: prodCajas, lance_prod_latas: prodLatas,
        lance_real_cajas: realCajas, lance_real_latas: realLatas,
        merma_pruebas_cajas: mPruebas.c, merma_pruebas_latas: mPruebas.l,
        merma_malas_cajas: mMalas.c, merma_malas_latas: mMalas.l,
        merma_maquina_cajas: mMaquina.c, merma_maquina_latas: mMaquina.l,
        merma_muestras_cajas: mMuestras.c, merma_muestras_latas: mMuestras.l,
        observaciones: observaciones || null,
        registrado_por: userRes.user?.id ?? null,
      };

      const { data: lance, error } = await (supabase as any)
        .from("lances_produccion").insert(payload).select("*").single();
      if (error) throw error;

      const shouldRegisterMovs = opts.estado === "COMPLETO" && registrarMovs;

      // Insertar insumos + registrar movimientos SALIDA en insumos_movimientos si vinculados
      for (const row of insumos) {
        if (!row.nombre.trim() || row.cantidad <= 0) continue;
        let movId: string | null = null;
        if (shouldRegisterMovs && row.insumo_id) {
          const { data: movData, error: movErr } = await (supabase as any).rpc("registrar_movimiento_insumo", {
            p_insumo_id: row.insumo_id,
            p_tipo: "PRODUCCION",
            p_cantidad: row.cantidad,
            p_nro_guia: null,
            p_observacion: `Lance #${lance.numero} · ${producto}`,
            p_fecha: fecha,
            p_vale_num: `LANCE-${lance.numero}`,
            p_proveedor: null,
            p_transportista: null,
          });
          if (movErr) console.warn("mov insumo error", row.nombre, movErr);
          else movId = movData as any;
        }
        await (supabase as any).from("lance_insumos").insert({
          lance_id: lance.id,
          orden: row.orden,
          insumo_id: row.insumo_id,
          nombre: row.nombre,
          presentacion: row.presentacion || null,
          cantidad: row.cantidad,
          observacion: row.observacion || null,
          movimiento_insumo_id: movId,
        });
      }
      return opts.estado;
    },
    onSuccess: (estado) => {
      toast.success(estado === "BORRADOR" ? "Borrador guardado" : "Lance registrado");
      qc.invalidateQueries();
      onDone();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });


  return (
    <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><Factory className="size-5" /> Nuevo Lance de Producción</DialogTitle>
      </DialogHeader>

      <div className="space-y-6">
        {/* Datos generales */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Datos generales</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
            <Field label="Cliente / Usuario"><Input value={usuarioCliente} onChange={(e) => setUsuarioCliente(e.target.value)} placeholder={CLIENTE_DEFAULT} /></Field>
            <Field label="Producto" className="md:col-span-2">
              {productoCustom ? (
                <div className="flex gap-1">
                  <Input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Escribir producto…" autoFocus />
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setProductoCustom(false); setProducto(""); }}>↩</Button>
                </div>
              ) : (
                <Select value={producto} onValueChange={(v) => { if (v === "__custom__") { setProductoCustom(true); setProducto(""); } else { setProducto(v); const p = productosCat.find(x => x.descripcion === v); if (p?.envase && ENVASES.includes(p.envase)) onEnvaseChange(p.envase); } }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar producto del catálogo…" /></SelectTrigger>
                  <SelectContent>
                    {productosCat.map((p) => (
                      <SelectItem key={p.id} value={p.descripcion}>{p.descripcion}{p.envase ? ` · ${p.envase}` : ""}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">✎ Escribir manualmente…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Envase">
              <Select value={envase} onValueChange={onEnvaseChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENVASES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Packing (latas/caja)">
              <Select value={String(latasPorCaja)} onValueChange={(v) => setLatasPorCaja(+v || 48)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="48">48 latas / caja</SelectItem>
                  <SelectItem value="24">24 latas / caja</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="N° Carros"><Input type="number" value={carros} onChange={(e) => setCarros(+e.target.value || 0)} /></Field>

          </div>
        </section>

        <Separator />

        {/* Parámetros */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">I · Parámetros de producción</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Envasado (gr)">
              {envasadoCustom ? (
                <div className="flex gap-1">
                  <Input value={envasado} onChange={(e) => setEnvasado(e.target.value)} placeholder="Escribir…" autoFocus />
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEnvasadoCustom(false); setEnvasado(""); }}>↩</Button>
                </div>
              ) : (
                <Select value={envasado} onValueChange={(v) => { if (v === "__custom__") { setEnvasadoCustom(true); setEnvasado(""); } else setEnvasado(v); }}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {ENVASADO_GR_OPTS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    <SelectItem value="__custom__">✎ Escribir manualmente…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Aceite (ml)"><Input value={aceite} onChange={(e) => setAceite(e.target.value)} placeholder="45" /></Field>
            <Field label="Agua (ml)"><Input value={agua} onChange={(e) => setAgua(e.target.value)} placeholder="25 / 26" /></Field>
          </div>
        </section>

        <Separator />

        {/* Resumen de producción */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">II · Resumen de producción</h3>
            <div className="text-[11px] text-muted-foreground">
              Ingresa el <b>total de latas</b> · se convierte en cajas + sueltas usando <b>packing = {latasPorCaja}</b>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SmartLatasCard tone="sky" label="Total envasado"
              cajas={envasadoCajas} latas={envasadoLatasSueltas} lpc={latasPorCaja}
              setC={setEnvasadoCajas} setL={setEnvasadoLatasSueltas} />
            <SmartLatasCard tone="slate" label="Proyectado (latas)"
              cajas={prodCajas} latas={prodLatas} lpc={latasPorCaja}
              setC={setProdCajas} setL={setProdLatas} />
            <SmartLatasCard tone="amber" label="Real (latas)"
              cajas={realCajas} latas={realLatas} lpc={latasPorCaja}
              setC={setRealCajas} setL={setRealLatas} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div>Δ Proyectado - Real: <span className="font-semibold">{formatNumber(totalProd - totalReal, 0)}</span></div>
            <div>Δ Real - Envasado: <span className={`font-semibold ${totalReal - totalEnvasado < 0 ? "text-rose-600" : "text-emerald-700"}`}>{formatNumber(totalReal - totalEnvasado, 0)}</span></div>
            <div>Δ Envasado - Proyectado: <span className="font-semibold">{formatNumber(totalEnvasado - totalProd, 0)}</span></div>
          </div>
        </section>


        <Separator />

        {/* Mermas */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">III · Detalle de mermas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MermaRow label="Pruebas de cierre" v={mPruebas} set={setMPruebas} lpc={latasPorCaja} />
            <MermaRow label="Malas en envasado" v={mMalas} set={setMMalas} lpc={latasPorCaja} />
            <MermaRow label="Falla de máquina" v={mMaquina} set={setMMaquina} lpc={latasPorCaja} />
            <MermaRow label="Latas abiertas / Muestras" v={mMuestras} set={setMMuestras} lpc={latasPorCaja} />
          </div>
          <div className="text-right text-sm bg-rose-50 dark:bg-rose-950/20 rounded p-2">
            Total mermas: <span className="font-bold text-rose-700">{formatNumber(totalMermas, 0)}</span> latas
          </div>
        </section>

        <Separator />

        {/* Insumos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">IV · Insumos consumidos</h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={registrarMovs} onChange={(e) => setRegistrarMovs(e.target.checked)} />
                Registrar salidas en insumos (los vinculados)
              </label>
              <Button size="sm" variant="outline" onClick={addIns}><Plus className="size-4" /> Añadir</Button>
            </div>
          </div>
          <div className="space-y-2">
            {insumos.map((r, i) => (
              <InsumoRow
                key={i}
                idx={i}
                row={r}
                insumosCat={insumosCat}
                insumosSalidaRecent={insumosSalidaRecent}
                onChange={(patch) => updIns(i, patch)}
                onRemove={() => rmIns(i)}
              />
            ))}
            {insumos.length === 0 && (
              <div className="text-xs text-muted-foreground text-center border rounded-lg p-4">
                Sin insumos. Usa <b>Añadir</b> para agregar uno.
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="size-3" />
            Solo los insumos vinculados al catálogo generarán un movimiento de salida tipo <b>PRODUCCIÓN</b>.
          </div>
        </section>

        <Separator />

        {/* Resumen final inteligente */}
        <ResumenFinal
          latasPorCaja={latasPorCaja}
          totalEnvasado={totalEnvasado}
          totalProd={totalProd}
          totalReal={totalReal}
          envasadoCajas={envasadoCajas}
          envasadoLatas={envasadoLatasSueltas}
          prodCajas={prodCajas}
          prodLatas={prodLatas}
          realCajas={realCajas}
          realLatas={realLatas}
          insumos={insumos}
        />

        <Separator />

        <section className="space-y-2">
          <Label>Observaciones</Label>
          <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} />
        </section>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={() => saveMut.mutate({ estado: "BORRADOR" })} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Guardando…" : "Guardar borrador"}
        </Button>
        <Button onClick={() => saveMut.mutate({ estado: "COMPLETO" })} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Guardando…" : "Registrar lance completo"}
        </Button>
      </DialogFooter>

    </DialogContent>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SmartLatasCard({
  tone, label, cajas, latas, lpc, setC, setL,
}: {
  tone: "sky" | "slate" | "amber";
  label: string;
  cajas: number; latas: number; lpc: number;
  setC: (n: number) => void; setL: (n: number) => void;
}) {
  const total = totalLatas(cajas, latas, lpc);
  const toneCls = tone === "sky" ? "bg-sky-50/50 dark:bg-sky-950/20 border-sky-200"
    : tone === "amber" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200"
    : "";
  const textCls = tone === "sky" ? "text-sky-700"
    : tone === "amber" ? "text-amber-700" : "text-muted-foreground";
  const totalCls = tone === "sky" ? "text-sky-700"
    : tone === "amber" ? "text-emerald-700" : "text-foreground";

  const onTotalChange = (raw: string) => {
    const n = Math.max(0, Math.floor(+raw || 0));
    const emp = Math.max(1, lpc || 48);
    setC(Math.floor(n / emp));
    setL(n % emp);
  };

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${toneCls}`}>
      <div className="flex items-baseline justify-between flex-wrap gap-1">
        <span className={`text-xs font-semibold ${textCls}`}>{label}</span>
        <span className="text-sm font-bold tabular-nums">{formatNumber(cajas, 0)} cajas <span className="text-[10px] font-normal text-muted-foreground">({formatNumber(total, 0)} latas)</span></span>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wider">Latas totales</Label>
        <Input
          type="number" min="0" step="1"
          value={total || ""}
          onChange={(e) => onTotalChange(e.target.value)}
          placeholder="0"
          className="h-10 text-lg font-bold tabular-nums"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Cajas</Label>
          <Input type="number" min="0" value={cajas || ""} onChange={(e) => setC(Math.max(0, +e.target.value || 0))} className="tabular-nums" />
        </div>
        <div>
          <Label className="text-[10px]">Latas sueltas</Label>
          <Input type="number" min="0" value={latas || ""} onChange={(e) => setL(Math.max(0, +e.target.value || 0))} className="tabular-nums" />
        </div>
      </div>
      <div className="text-right text-[11px] text-muted-foreground">
        Total <span className={`font-bold ${totalCls}`}>{formatNumber(total, 0)}</span> latas
        <span className="opacity-70"> · {cajas}c × {lpc} + {latas}l</span>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------------- */
/* RESUMEN FINAL INTELIGENTE                                                  */
/* ------------------------------------------------------------------------- */

function ResumenFinal({
  latasPorCaja, totalEnvasado, totalProd, totalReal,
  envasadoCajas, envasadoLatas, prodCajas, prodLatas, realCajas, realLatas,
  insumos,
}: {
  latasPorCaja: number;
  totalEnvasado: number; totalProd: number; totalReal: number;
  envasadoCajas: number; envasadoLatas: number;
  prodCajas: number; prodLatas: number;
  realCajas: number; realLatas: number;
  insumos: LanceInsumoRow[];
}) {
  // Referencia principal para tapas / envases = latas envasadas (o real si no hay envasado)
  const ref = totalEnvasado > 0 ? totalEnvasado : totalReal;

  const matchQty = (patterns: RegExp[]) =>
    insumos
      .filter((r) => r.nombre && patterns.some((p) => p.test(r.nombre)))
      .reduce((a, r) => a + (Number(r.cantidad) || 0), 0);

  const tapasQty = matchQty([/tapa/i]);
  const envasesQty = matchQty([/envase/i, /lata/i]);
  // cartón / cajas
  const cartonQty = matchQty([/cart[oó]n/i, /caja/i]);

  const cajasRef = Math.ceil(ref / Math.max(1, latasPorCaja));

  const analisis = [
    {
      concepto: "Tapas",
      esperado: ref,
      real: tapasQty,
      referencia: "latas envasadas",
    },
    {
      concepto: "Envases (latas)",
      esperado: ref,
      real: envasesQty,
      referencia: "latas envasadas",
    },
    {
      concepto: "Cartón (cajas)",
      esperado: cajasRef,
      real: cartonQty,
      referencia: `cajas ≈ ⌈latas / ${latasPorCaja}⌉`,
    },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        V · Resumen final & análisis de diferencias
      </h3>

      {/* Totales de cajas / latas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ResumenCard tone="sky" label="Total envasado" cajas={envasadoCajas} latas={envasadoLatas} total={totalEnvasado} lpc={latasPorCaja} />
        <ResumenCard tone="slate" label="Lance proyectado" cajas={prodCajas} latas={prodLatas} total={totalProd} lpc={latasPorCaja} />
        <ResumenCard tone="amber" label="Lance real (validado)" cajas={realCajas} latas={realLatas} total={totalReal} lpc={latasPorCaja} />
      </div>

      {/* Diferencias */}
      <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Diferencias generales (latas)</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          <DiffPill label="Real − Envasado" v={totalReal - totalEnvasado} />
          <DiffPill label="Real − Proyectado" v={totalReal - totalProd} />
          <DiffPill label="Envasado − Proyectado" v={totalEnvasado - totalProd} />
        </div>
      </div>

      {/* Análisis de insumos vs latas/cajas */}
      <div className="rounded-lg border overflow-hidden">
        <div className="p-2 text-xs font-semibold bg-muted flex items-center justify-between">
          <span>Análisis de diferencias · insumos vs referencia ({formatNumber(ref, 0)} latas · {formatNumber(cajasRef, 0)} cajas)</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Esperado</TableHead>
              <TableHead className="text-right">Registrado</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead className="text-right">% desvío</TableHead>
              <TableHead className="text-xs">Referencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analisis.map((a) => {
              const diff = a.real - a.esperado;
              const pct = a.esperado > 0 ? (diff / a.esperado) * 100 : 0;
              const tone = a.real === 0 ? "text-muted-foreground" : Math.abs(pct) < 2 ? "text-emerald-700" : Math.abs(pct) < 5 ? "text-amber-700" : "text-rose-700";
              return (
                <TableRow key={a.concepto}>
                  <TableCell className="font-medium">{a.concepto}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.esperado, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(a.real, 0)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${tone}`}>{diff > 0 ? "+" : ""}{formatNumber(diff, 0)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${tone}`}>{a.esperado > 0 ? `${pct > 0 ? "+" : ""}${formatNumber(pct, 2)}%` : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.referencia}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="p-2 text-[11px] text-muted-foreground bg-muted/40 flex items-center gap-1">
          <AlertTriangle className="size-3" />
          El análisis detecta insumos por nombre: <b>tapa</b>, <b>envase/lata</b>, <b>cartón/caja</b>. Vincula al catálogo para movimientos automáticos.
        </div>
      </div>
    </section>
  );
}

function ResumenCard({ tone, label, cajas, latas, total, lpc }: {
  tone: "sky" | "slate" | "amber"; label: string; cajas: number; latas: number; total: number; lpc: number;
}) {
  const toneCls = tone === "sky" ? "bg-sky-50 border-sky-200 dark:bg-sky-950/20" :
    tone === "amber" ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20" : "bg-muted/30";
  const textCls = tone === "sky" ? "text-sky-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className={`text-[11px] uppercase tracking-wider font-semibold ${textCls}`}>{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(cajas, 0)} <span className="text-xs font-normal text-muted-foreground">cajas ({formatNumber(total, 0)} latas)</span></div>
      <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
        {latas} latas sueltas · ×{lpc}
      </div>
    </div>
  );
}

function DiffPill({ label, v }: { label: string; v: number }) {
  const tone = v === 0 ? "bg-muted text-foreground" : v > 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300";
  return (
    <div className={`rounded-md px-3 py-2 flex items-center justify-between ${tone}`}>
      <span className="text-xs">{label}</span>
      <span className="font-bold tabular-nums">{v > 0 ? "+" : ""}{formatNumber(v, 0)}</span>
    </div>
  );
}


function MermaRow({ label, v, set, lpc }: { label: string; v: { c: number; l: number }; set: (v: { c: number; l: number }) => void; lpc: number }) {
  return (
    <div className="rounded-md border p-2 space-y-1">
      <div className="text-xs font-medium">{label}</div>
      <div className="grid grid-cols-3 gap-1.5 items-end">
        <div><Label className="text-[10px]">Cajas</Label><Input type="number" value={v.c || ""} onChange={(e) => set({ ...v, c: +e.target.value || 0 })} /></div>
        <div><Label className="text-[10px]">Latas</Label><Input type="number" value={v.l || ""} onChange={(e) => set({ ...v, l: +e.target.value || 0 })} /></div>
        <div className="text-right text-xs pb-2">= <span className="font-semibold">{formatNumber(totalLatas(v.c, v.l, lpc), 0)}</span></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* INSUMO ROW (búsqueda rápida + últimos 8 movimientos)                       */
/* ------------------------------------------------------------------------- */

type InsumoMovRecent = {
  id: string; fecha: string; tipo_mov: string; cantidad: number;
  nro_guia: string | null; vale_num: string | null; observacion: string | null;
};

function InsumoRow({
  idx, row, insumosCat, insumosSalidaRecent, onChange, onRemove,
}: {
  idx: number;
  row: LanceInsumoRow;
  insumosCat: InsumoCat[];
  insumosSalidaRecent: string[];
  onChange: (patch: Partial<LanceInsumoRow>) => void;
  onRemove: () => void;
}) {
  const options = useMemo(() => {
    // Preservar el orden de últimos SALIDA (más reciente primero)
    const filtered = insumosSalidaRecent.length > 0
      ? (insumosSalidaRecent
          .map((id) => insumosCat.find((c) => c.id === id))
          .filter(Boolean) as InsumoCat[])
      : insumosCat;
    return filtered.map((c) => ({
      value: c.id,
      label: `${c.codigo} · ${c.insumo}`,
      description: c.formato ?? undefined,
      searchText: `${c.codigo} ${c.insumo} ${c.formato ?? ""}`,
    }));
  }, [insumosCat, insumosSalidaRecent]);

  const { data: recent = [] } = useQuery({
    queryKey: ["insumo-movs-recent", row.insumo_id],
    enabled: !!row.insumo_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("insumos_movimientos")
        .select("id,fecha,tipo_mov,cantidad,nro_guia,vale_num,observacion,created_at")
        .eq("insumo_id", row.insumo_id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as InsumoMovRecent[];
    },
  });

  const linked = !!row.insumo_id;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${linked ? "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200" : ""}`}>
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-12 md:col-span-1 text-xs text-muted-foreground md:pb-2">#{idx + 1}</div>
        <div className="col-span-12 md:col-span-4 space-y-1">
          <Label className="text-[10px] flex items-center gap-1">
            <Link2 className={`size-3 ${linked ? "text-emerald-600" : "text-muted-foreground"}`} /> Vincular al catálogo
          </Label>
          <SearchSelect
            value={row.insumo_id ?? ""}
            onValueChange={(v) => {
              const ins = insumosCat.find((x) => x.id === v);
              onChange({
                insumo_id: v || null,
                nombre: ins ? ins.insumo : row.nombre,
                presentacion: ins?.formato ?? row.presentacion,
              });
            }}
            options={options}
            placeholder="— sin vincular —"
            searchPlaceholder="Buscar por código o nombre…"
            allowClear
          />
        </div>
        <div className="col-span-6 md:col-span-3 space-y-1">
          <Label className="text-[10px]">Nombre</Label>
          <Input value={row.nombre} onChange={(e) => onChange({ nombre: e.target.value })} placeholder="Nombre" />
        </div>
        <div className="col-span-6 md:col-span-2 space-y-1">
          <Label className="text-[10px]">Presentación</Label>
          <Input value={row.presentacion} onChange={(e) => onChange({ presentacion: e.target.value })} placeholder="—" />
        </div>
        <div className="col-span-10 md:col-span-1 space-y-1">
          <Label className="text-[10px]">Cantidad</Label>
          <Input
            type="number" step="any" className="text-right"
            value={row.cantidad || ""}
            onChange={(e) => onChange({ cantidad: +e.target.value || 0 })}
          />
        </div>
        <div className="col-span-2 md:col-span-1 flex justify-end md:pb-1">
          <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="size-4 text-rose-600" /></Button>
        </div>
      </div>

      {linked && (
        <div className="rounded-md border bg-background p-2 space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
            <History className="size-3" />
            Últimos 8 movimientos del insumo · click para autollenar cantidad
          </div>
          {recent.length === 0 && (
            <div className="text-[11px] text-muted-foreground italic">Sin movimientos previos registrados</div>
          )}
          {recent.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {recent.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChange({ cantidad: Number(m.cantidad) })}
                  className="text-left text-[11px] rounded border bg-card hover:bg-accent px-2 py-1 flex items-center justify-between gap-2 transition-colors"
                  title={m.observacion ?? undefined}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-muted-foreground">{m.fecha}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{m.tipo_mov}</Badge>
                    {m.nro_guia && <span className="text-muted-foreground truncate">G:{m.nro_guia}</span>}
                    {m.vale_num && <span className="text-muted-foreground truncate">V:{m.vale_num}</span>}
                  </span>
                  <span className="font-semibold whitespace-nowrap">{formatNumber(Number(m.cantidad), 2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



/* ------------------------------------------------------------------------- */
/* DETAIL DIALOG                                                              */
/* ------------------------------------------------------------------------- */

function LanceDetailDialog({ lance, onClose }: { lance: Lance | null; onClose: () => void }) {
  const { data: items = [] } = useQuery({
    queryKey: ["lance-insumos", lance?.id],
    enabled: !!lance,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("lance_insumos")
        .select("*").eq("lance_id", lance!.id).order("orden");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!lance) return null;
  const lpc = lance.latas_por_caja;
  const totalReal = totalLatas(lance.lance_real_cajas, lance.lance_real_latas, lpc);
  const totalProd = totalLatas(lance.lance_prod_cajas, lance.lance_prod_latas, lpc);
  const totalEnv = totalLatas(lance.envasado_cajas ?? 0, lance.envasado_latas ?? 0, lpc);
  const mermas = [
    ["Pruebas de cierre", lance.merma_pruebas_cajas, lance.merma_pruebas_latas],
    ["Malas en envasado", lance.merma_malas_cajas, lance.merma_malas_latas],
    ["Falla de máquina", lance.merma_maquina_cajas, lance.merma_maquina_latas],
    ["Latas abiertas / Muestras", lance.merma_muestras_cajas, lance.merma_muestras_latas],
  ] as [string, number, number][];
  const totalMermas = mermas.reduce((a, [, c, l]) => a + totalLatas(c, l, lpc), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lance #{lance.numero} · {lance.fecha}</DialogTitle>
          <div className="text-sm text-muted-foreground">{lance.producto} · {lance.usuario_cliente}</div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Info label="Envase" value={lance.envase} />
            <Info label="Latas/caja" value={lpc} />
            <Info label="Carros" value={lance.carros} />
            <Info label="Envasado" value={lance.envasado ?? "—"} />
            <Info label="Aceite" value={lance.aceite ?? "—"} />
            <Info label="Agua" value={lance.agua ?? "—"} />
          </div>

          <div className="rounded-lg border">
            <div className="p-2 text-xs font-semibold bg-muted">Resumen</div>
            <Table>
              <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Cajas</TableHead><TableHead className="text-right">Latas</TableHead><TableHead className="text-right">Total latas</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Lance proyectado</TableCell><TableCell className="text-right">{lance.lance_prod_cajas}</TableCell><TableCell className="text-right">{lance.lance_prod_latas}</TableCell><TableCell className="text-right">{formatNumber(totalProd, 0)}</TableCell></TableRow>
                <TableRow className="bg-sky-50 dark:bg-sky-950/20"><TableCell>Total envasado</TableCell><TableCell className="text-right">{lance.envasado_cajas ?? 0}</TableCell><TableCell className="text-right">{lance.envasado_latas ?? 0}</TableCell><TableCell className="text-right font-semibold text-sky-700">{formatNumber(totalEnv, 0)}</TableCell></TableRow>
                <TableRow><TableCell>Lance proyectado</TableCell><TableCell className="text-right">{lance.lance_prod_cajas}</TableCell><TableCell className="text-right">{lance.lance_prod_latas}</TableCell><TableCell className="text-right">{formatNumber(totalProd, 0)}</TableCell></TableRow>
                <TableRow className="bg-amber-50 dark:bg-amber-950/20"><TableCell>Lance real</TableCell><TableCell className="text-right">{lance.lance_real_cajas}</TableCell><TableCell className="text-right">{lance.lance_real_latas}</TableCell><TableCell className="text-right font-semibold text-emerald-700">{formatNumber(totalReal, 0)}</TableCell></TableRow>
                <TableRow><TableCell>Δ Real − Envasado</TableCell><TableCell colSpan={2}></TableCell><TableCell className="text-right font-semibold">{formatNumber(totalReal - totalEnv, 0)}</TableCell></TableRow>
                <TableRow><TableCell>Δ Proyectado − Real</TableCell><TableCell colSpan={2}></TableCell><TableCell className="text-right">{formatNumber(totalProd - totalReal, 0)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border">
            <div className="p-2 text-xs font-semibold bg-muted">Mermas</div>
            <Table>
              <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead className="text-right">Cajas</TableHead><TableHead className="text-right">Latas</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {mermas.map(([n, c, l]) => (
                  <TableRow key={n}><TableCell>{n}</TableCell><TableCell className="text-right">{c}</TableCell><TableCell className="text-right">{l}</TableCell><TableCell className="text-right">{formatNumber(totalLatas(c, l, lpc), 0)}</TableCell></TableRow>
                ))}
                <TableRow className="font-semibold bg-rose-50 dark:bg-rose-950/20"><TableCell>TOTAL</TableCell><TableCell colSpan={2}></TableCell><TableCell className="text-right text-rose-700">{formatNumber(totalMermas, 0)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border">
            <div className="p-2 text-xs font-semibold bg-muted">Insumos ({items.length})</div>
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Insumo</TableHead><TableHead>Presentación</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Mov.</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((r: any, i: number) => (
                  <TableRow key={r.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.nombre}</TableCell>
                    <TableCell className="text-xs">{r.presentacion ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatNumber(r.cantidad, 2)}</TableCell>
                    <TableCell>{r.movimiento_insumo_id ? <Badge variant="outline" className="text-emerald-700"><Link2 className="size-3" /> Vinculado</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-3 text-muted-foreground">Sin insumos</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>

          {lance.observaciones && (
            <div className="text-sm"><b>Observaciones:</b> {lance.observaciones}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded border p-2"><div className="text-[10px] text-muted-foreground uppercase">{label}</div><div className="text-sm font-medium">{value}</div></div>;
}
