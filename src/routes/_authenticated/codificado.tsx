import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { formatNumber, formatDate } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Barcode,
  FileDown,
  FileSpreadsheet,
  Save,
  Trash2,
  AlertTriangle,
  CalendarRange,
  Coins,
  Boxes,
  Sun,
  Moon,
  Cog,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Search,
} from "lucide-react";


export const Route = createFileRoute("/_authenticated/codificado")({
  component: CodificadoPage,
  head: () => ({
    meta: [
      { title: "Codificado de Lotes | Almacén Conservas" },
      {
        name: "description",
        content:
          "Control de codificación de lotes por máquina y turno, con tarifas editables, pagos semanales (viernes a jueves) y exportación a PDF y Excel.",
      },
      { property: "og:title", content: "Codificado de Lotes | Almacén Conservas" },
      {
        property: "og:description",
        content: "Registro de cajas codificadas por máquina, tarifas de pago y liquidación semanal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Maquina = "MAQ-1" | "MAQ-2" | "MAQ-3" | "MAQ-4";
const MAQUINAS: Maquina[] = ["MAQ-1", "MAQ-2", "MAQ-3", "MAQ-4"];

type Turno = "DIA" | "NOCHE";

type Registro = {
  id: string;
  fecha: string;
  lote_id: string | null;
  codigo_lote: string;
  descripcion: string | null;
  maquina: string;
  turno: string;
  cajas: number;
  tarifa: number;
  importe: number;
  observacion: string | null;
};

type Tarifa = { id: string; maquina: string; turno: string; tarifa: number };

/* ---------- semana viernes → jueves ---------- */
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function weekStart(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  // getUTCDay: 5 = viernes
  const diff = (d.getUTCDay() - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return toISO(d);
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
function weekLabel(startISO: string) {
  const end = addDays(startISO, 6);
  const f = (s: string) => s.slice(8, 10) + "-" + s.slice(5, 7);
  return `${f(startISO)} al ${f(end)}`;
}

function soles(n: number) {
  return "S/ " + formatNumber(n, 2);
}

function CodificadoPage() {
  const qc = useQueryClient();
  const hoy = toISO(new Date());

  /* ---------- data ---------- */
  const tarifasQ = useQuery({
    queryKey: ["codificado-tarifas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("codificado_tarifas")
        .select("id,maquina,turno,tarifa")
        .order("maquina")
        .order("turno");
      if (error) throw error;
      return (data ?? []) as Tarifa[];
    },
  });

  const registrosQ = useQuery({
    queryKey: ["codificado-registros"],
    queryFn: async () =>
      fetchAllRows<Registro>((from, to) =>
        supabase
          .from("codificado_registros")
          .select("id,fecha,lote_id,codigo_lote,descripcion,maquina,turno,cajas,tarifa,importe,observacion")
          .order("fecha", { ascending: false })
          .range(from, to),
      ),
  });

  const lotesQ = useQuery({
    queryKey: ["codificado-lotes"],
    queryFn: async () =>
      fetchAllRows<any>((from, to) =>
        supabase
          .from("lotes")
          .select("id,codigo_lote,estado,fecha_produccion,fecha_vencimiento,productos(descripcion)")
          .order("fecha_produccion", { ascending: false })
          .range(from, to),
      ),
  });

  const tarifaDe = (maquina: string, turno: string) =>
    Number(tarifasQ.data?.find((t) => t.maquina === maquina && t.turno === (maquina === "MAQ-1" ? turno : "DIA"))?.tarifa ?? 0);

  /* ---------- formulario ---------- */
  const [fecha, setFecha] = useState(hoy);
  const [loteId, setLoteId] = useState("");
  const [maquina, setMaquina] = useState<Maquina>("MAQ-1");
  const [turno, setTurno] = useState<Turno>("DIA");
  const [cajas, setCajas] = useState("");
  const [observacion, setObservacion] = useState("");
  const [saving, setSaving] = useState(false);

  const loteOptions = useMemo(
    () =>
      (lotesQ.data ?? []).map((l) => ({
        value: l.id as string,
        label: l.codigo_lote as string,
        description: (l.productos?.descripcion as string) ?? "",
        meta: [
          { label: "FP", value: formatDate(l.fecha_produccion) },
          { label: "FV", value: formatDate(l.fecha_vencimiento) },
          { label: "Estado", value: l.estado ?? "—" },
        ],
      })),
    [lotesQ.data],
  );

  const loteSel = useMemo(
    () => (lotesQ.data ?? []).find((l) => l.id === loteId),
    [lotesQ.data, loteId],
  );

  const tarifaActual = tarifaDe(maquina, turno);
  const cajasNum = Number(cajas) || 0;
  const pagoPreview = Math.round(cajasNum * tarifaActual * 100) / 100;

  const duplicado = useMemo(() => {
    if (!loteSel) return false;
    const t = maquina === "MAQ-1" ? turno : "DIA";
    return (registrosQ.data ?? []).some(
      (r) =>
        r.fecha === fecha &&
        r.maquina === maquina &&
        r.turno === t &&
        r.codigo_lote === loteSel.codigo_lote,
    );
  }, [registrosQ.data, fecha, maquina, turno, loteSel]);

  const guardar = async () => {
    if (!loteSel) return toast.error("Selecciona un lote");
    if (cajasNum <= 0) return toast.error("Ingresa la cantidad de cajas");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("codificado_registros").insert({
      fecha,
      lote_id: loteSel.id,
      codigo_lote: loteSel.codigo_lote,
      descripcion: loteSel.productos?.descripcion ?? null,
      maquina,
      turno: maquina === "MAQ-1" ? turno : "DIA",
      cajas: cajasNum,
      tarifa: tarifaActual,
      observacion: observacion || null,
      usuario_id: userRes?.user?.id ?? null,
      usuario_nombre: userRes?.user?.email ?? null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Registrado · ${formatNumber(cajasNum, 0)} cajas · ${soles(pagoPreview)}`);
    setCajas("");
    setObservacion("");
    qc.invalidateQueries({ queryKey: ["codificado-registros"] });
  };

  const eliminar = async (id: string) => {
    const { error } = await supabase.from("codificado_registros").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Registro eliminado");
    qc.invalidateQueries({ queryKey: ["codificado-registros"] });
  };

  /* ---------- tarifas editables ---------- */
  const [tarifaEdit, setTarifaEdit] = useState<Record<string, string>>({});
  const guardarTarifa = async (t: Tarifa) => {
    const raw = tarifaEdit[t.id];
    const val = Number(raw);
    if (raw === undefined || !isFinite(val) || val < 0) return;
    const { error } = await supabase.from("codificado_tarifas").update({ tarifa: val }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success(`Tarifa ${t.maquina}${t.maquina === "MAQ-1" ? " " + t.turno : ""} = ${soles(val)}`);
    setTarifaEdit((s) => {
      const c = { ...s };
      delete c[t.id];
      return c;
    });
    qc.invalidateQueries({ queryKey: ["codificado-tarifas"] });
  };

  /* ---------- filtros / semana ---------- */
  const [semana, setSemana] = useState(() => weekStart(hoy));
  const [modoSemana, setModoSemana] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [maqFiltro, setMaqFiltro] = useState<"TODAS" | Maquina>("TODAS");
  const [q, setQ] = useState("");

  const rangoDesde = modoSemana ? semana : desde;
  const rangoHasta = modoSemana ? addDays(semana, 6) : hasta;

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (registrosQ.data ?? []).filter((r) => {
      if (rangoDesde && r.fecha < rangoDesde) return false;
      if (rangoHasta && r.fecha > rangoHasta) return false;
      if (maqFiltro !== "TODAS" && r.maquina !== maqFiltro) return false;
      if (term && !`${r.codigo_lote} ${r.descripcion ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [registrosQ.data, rangoDesde, rangoHasta, maqFiltro, q]);

  const dupKeys = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of filtrados) {
      const k = `${r.codigo_lote}|${r.maquina}|${r.turno}|${r.fecha}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return new Set([...count.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [filtrados]);

  const porMaquina = useMemo(() => {
    const cols: { key: string; maquina: string; turno: string; label: string }[] = [
      { key: "MAQ-1|DIA", maquina: "MAQ-1", turno: "DIA", label: "MAQ-1 Día" },
      { key: "MAQ-1|NOCHE", maquina: "MAQ-1", turno: "NOCHE", label: "MAQ-1 Noche" },
      { key: "MAQ-2|DIA", maquina: "MAQ-2", turno: "DIA", label: "MAQ-2" },
      { key: "MAQ-3|DIA", maquina: "MAQ-3", turno: "DIA", label: "MAQ-3" },
      { key: "MAQ-4|DIA", maquina: "MAQ-4", turno: "DIA", label: "MAQ-4" },
    ];
    return cols.map((c) => {
      const rows = filtrados.filter((r) => r.maquina === c.maquina && r.turno === c.turno);
      return {
        ...c,
        cajas: rows.reduce((a, r) => a + Number(r.cajas || 0), 0),
        pago: rows.reduce((a, r) => a + Number(r.importe || 0), 0),
        registros: rows.length,
        tarifa: tarifaDe(c.maquina, c.turno),
      };
    });
  }, [filtrados, tarifasQ.data]);

  const totalCajas = filtrados.reduce((a, r) => a + Number(r.cajas || 0), 0);
  const totalPago = filtrados.reduce((a, r) => a + Number(r.importe || 0), 0);

  const porFecha = useMemo(() => {
    const map = new Map<string, { cajas: number; pago: number }>();
    for (const r of filtrados) {
      const cur = map.get(r.fecha) ?? { cajas: 0, pago: 0 };
      cur.cajas += Number(r.cajas || 0);
      cur.pago += Number(r.importe || 0);
      map.set(r.fecha, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  const filtroTexto = [
    modoSemana ? `Semana ${weekLabel(semana)} (vie–jue)` : `Rango ${desde || "inicio"} → ${hasta || "hoy"}`,
    `Máquina: ${maqFiltro === "TODAS" ? "todas" : maqFiltro}`,
    q ? `Búsqueda: "${q}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const headers = ["Fecha", "Código de lote", "Descripción", "Máquina", "Turno", "Cajas", "Tarifa S/", "Pago S/"];
  const rows = filtrados.map((r) => [
    formatDate(r.fecha),
    r.codigo_lote,
    r.descripcion ?? "",
    r.maquina,
    r.turno,
    Number(r.cajas),
    Number(r.tarifa),
    Number(r.importe),
  ]);
  const summary = [
    { label: "Total cajas", value: formatNumber(totalCajas, 0) },
    { label: "Total a pagar", value: soles(totalPago) },
    ...porMaquina
      .filter((m) => m.cajas > 0)
      .map((m) => ({ label: m.label, value: `${formatNumber(m.cajas, 0)} cj · ${soles(m.pago)}` })),
  ];

  const doPDF = () =>
    exportPDF({
      title: "Control de Codificado de Lotes",
      subtitle: filtroTexto,
      headers,
      rows,
      filename: `codificado_${rangoDesde || "todo"}.pdf`,
      summary,
      inventario: { cajas: 0, latas: 0, totalLatas: 0 },
      sections: [
        {
          title: "Resumen por máquina y turno",
          headers: ["Máquina / turno", "Tarifa S/", "Registros", "Cajas", "Pago S/"],
          rows: porMaquina.map((m) => [
            m.label,
            formatNumber(m.tarifa, 2),
            m.registros,
            formatNumber(m.cajas, 0),
            formatNumber(m.pago, 2),
          ]),
        },
      ],
    });

  const doXLS = () =>
    exportXLSX({
      sheetName: "Codificado",
      headers,
      rows,
      filename: `codificado_${rangoDesde || "todo"}.xlsx`,
      summary,
      inventario: { cajas: 0, latas: 0, totalLatas: 0 },
    });

  /* ---------- UI ---------- */
  return (
    <div className="space-y-6">
      {/* Header industrial */}
      <div className="rounded-2xl bg-[#0f2440] text-white p-5 md:p-6 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(90% 60% at 0% 0%, rgba(245,158,11,0.25) 0%, transparent 55%), repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 8px, transparent 8px 16px)",
          }}
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="size-12 rounded-xl bg-amber-400 text-[#0f2440] flex items-center justify-center shadow-lg">
            <Barcode className="size-6" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Codificado de Lotes</h1>
            <p className="text-white/60 text-xs uppercase tracking-[0.18em] mt-1">
              Control de planta · pago por caja codificada
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl bg-white/10 px-4 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/60">Cajas</div>
              <div className="font-mono text-lg font-bold">{formatNumber(totalCajas, 0)}</div>
            </div>
            <div className="rounded-xl bg-amber-400 text-[#0f2440] px-4 py-2">
              <div className="text-[10px] uppercase tracking-wider opacity-70">A pagar</div>
              <div className="font-mono text-lg font-bold">{soles(totalPago)}</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="registrar">
        <TabsList>
          <TabsTrigger value="registrar">Registrar</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="registros">Registros</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
        </TabsList>

        {/* ---------------- REGISTRAR ---------------- */}
        <TabsContent value="registrar" className="mt-4">
          <Card className="p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="font-mono" />
              </div>
              <div className="md:col-span-2">
                <Label>Lote</Label>
                <SearchSelect
                  value={loteId}
                  onValueChange={setLoteId}
                  options={loteOptions}
                  placeholder="Buscar lote registrado…"
                  searchPlaceholder="Código de lote o producto…"
                  allowClear
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="md:col-span-2">
                <Label className="mb-2 block">Máquina</Label>
                <div className="grid grid-cols-4 gap-2">
                  {MAQUINAS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMaquina(m);
                        if (m !== "MAQ-1") setTurno("DIA");
                      }}
                      className={cn(
                        "rounded-lg border px-2 py-3 text-sm font-mono font-semibold transition-all",
                        maquina === m
                          ? "bg-[#0f2440] text-white border-[#0f2440] shadow-md"
                          : "bg-card hover:border-amber-400",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Turno</Label>
                {maquina === "MAQ-1" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {(["DIA", "NOCHE"] as Turno[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTurno(t)}
                        className={cn(
                          "rounded-lg border px-2 py-3 text-xs font-semibold uppercase flex items-center justify-center gap-1.5 transition-all",
                          turno === t
                            ? "bg-amber-400 text-[#0f2440] border-amber-400 shadow-md"
                            : "bg-card hover:border-amber-400",
                        )}
                      >
                        {t === "DIA" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                        {t === "DIA" ? "Día" : "Noche"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
                    Turno único (día) en {maquina}
                  </div>
                )}
              </div>
              <div>
                <Label>Cantidad de cajas</Label>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={cajas}
                  onChange={(e) => setCajas(e.target.value)}
                  className="font-mono text-lg h-11"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label>Observación</Label>
              <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder="Opcional" />
            </div>

            {/* Cálculo en vivo */}
            <div className="rounded-xl border bg-[#0f2440]/[0.04] p-4 grid gap-4 sm:grid-cols-4">
              <Metric label="Tarifa aplicada" value={soles(tarifaActual)} />
              <Metric label="Cajas" value={formatNumber(cajasNum, 0)} />
              <Metric label="Pago calculado" value={soles(pagoPreview)} accent />
              <div className="flex items-end">
                <Button onClick={guardar} disabled={saving} className="w-full h-11">
                  <Save className="size-4 mr-2" /> Guardar
                </Button>
              </div>
            </div>

            {duplicado && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="size-4 mt-0.5 text-amber-600" />
                <span>
                  Ya existe un registro con el mismo lote, máquina, turno y fecha. Verifica antes de guardar para no
                  duplicar el pago.
                </span>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ---------------- DASHBOARD ---------------- */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <FiltrosBar
            {...{
              modoSemana,
              setModoSemana,
              semana,
              setSemana,
              desde,
              setDesde,
              hasta,
              setHasta,
              maqFiltro,
              setMaqFiltro,
              q,
              setQ,
              doPDF,
              doXLS,
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {porMaquina.map((m) => (
              <Card key={m.key} className="p-4 border-t-4 border-t-[#0f2440]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold">{m.label}</span>
                  <Badge variant="secondary" className="font-mono">{soles(m.tarifa)}</Badge>
                </div>
                <div className="mt-3 font-mono text-2xl font-bold">{formatNumber(m.cajas, 0)}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">cajas codificadas</div>
                <div className="mt-2 rounded-lg bg-amber-400/20 px-2 py-1.5 font-mono text-sm font-bold text-amber-700 dark:text-amber-300">
                  {soles(m.pago)}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">{m.registros} registros</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
                <Boxes className="size-4 text-[#0f2440]" /> Detalle por día
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                      <th className="py-2">Fecha</th>
                      <th className="py-2 text-right">Cajas</th>
                      <th className="py-2 text-right">Pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porFecha.map(([f, v]) => (
                      <tr key={f} className="border-b last:border-0">
                        <td className="py-2 font-mono">{formatDate(f)}</td>
                        <td className="py-2 text-right font-mono">{formatNumber(v.cajas, 0)}</td>
                        <td className="py-2 text-right font-mono font-semibold">{soles(v.pago)}</td>
                      </tr>
                    ))}
                    {porFecha.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-muted-foreground">
                          Sin registros en el rango
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#0f2440] text-white">
                      <td className="py-2 px-2 font-semibold">TOTAL</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{formatNumber(totalCajas, 0)}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{soles(totalPago)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
                <Coins className="size-4 text-amber-500" /> Participación por máquina
              </div>
              <div className="space-y-3">
                {porMaquina.map((m) => {
                  const pct = totalCajas > 0 ? (m.cajas / totalCajas) * 100 : 0;
                  return (
                    <div key={m.key}>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span>{m.label}</span>
                        <span>
                          {formatNumber(m.cajas, 0)} cj · {formatNumber(pct, 1)}%
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#0f2440] to-amber-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- REGISTROS ---------------- */}
        <TabsContent value="registros" className="mt-4 space-y-4">
          <FiltrosBar
            {...{
              modoSemana,
              setModoSemana,
              semana,
              setSemana,
              desde,
              setDesde,
              hasta,
              setHasta,
              maqFiltro,
              setMaqFiltro,
              q,
              setQ,
              doPDF,
              doXLS,
            }}
          />
          {dupKeys.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-amber-600" />
              {dupKeys.size} combinación(es) duplicada(s) de lote + máquina + turno + fecha, resaltadas abajo.
            </div>
          )}
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="bg-[#0f2440] text-white text-left text-xs uppercase tracking-wider">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Código de lote</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3">Máquina</th>
                  <th className="p-3">Turno</th>
                  <th className="p-3 text-right">Cajas</th>
                  <th className="p-3 text-right">Tarifa</th>
                  <th className="p-3 text-right">Pago</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const dup = dupKeys.has(`${r.codigo_lote}|${r.maquina}|${r.turno}|${r.fecha}`);
                  return (
                    <tr key={r.id} className={cn("border-b last:border-0", dup && "bg-amber-500/10")}>
                      <td className="p-3 font-mono whitespace-nowrap">{formatDate(r.fecha)}</td>
                      <td className="p-3 font-mono text-xs">{r.codigo_lote}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-[220px] truncate">{r.descripcion}</td>
                      <td className="p-3 font-mono">{r.maquina}</td>
                      <td className="p-3">
                        <Badge variant={r.turno === "NOCHE" ? "default" : "secondary"}>{r.turno}</Badge>
                      </td>
                      <td className="p-3 text-right font-mono">{formatNumber(r.cajas, 0)}</td>
                      <td className="p-3 text-right font-mono">{formatNumber(r.tarifa, 2)}</td>
                      <td className="p-3 text-right font-mono font-semibold">{soles(Number(r.importe))}</td>
                      <td className="p-3 text-right">
                        <Button size="icon" variant="ghost" onClick={() => eliminar(r.id)} aria-label="Eliminar">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Sin registros para los filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ---------------- TARIFAS ---------------- */}
        <TabsContent value="tarifas" className="mt-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 text-sm font-semibold">
              <Cog className="size-4" /> Tarifas de pago por caja
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(tarifasQ.data ?? []).map((t) => {
                const val = tarifaEdit[t.id] ?? String(t.tarifa);
                const dirty = tarifaEdit[t.id] !== undefined && Number(tarifaEdit[t.id]) !== Number(t.tarifa);
                return (
                  <div key={t.id} className="rounded-xl border p-4">
                    <div className="font-mono font-bold">
                      {t.maquina}
                      {t.maquina === "MAQ-1" && (
                        <span className="ml-2 text-xs uppercase text-muted-foreground">{t.turno}</span>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={val}
                        onChange={(e) => setTarifaEdit((s) => ({ ...s, [t.id]: e.target.value }))}
                        className="font-mono"
                      />
                      <Button onClick={() => guardarTarifa(t)} disabled={!dirty} variant={dirty ? "default" : "outline"}>
                        <Save className="size-4" />
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Se aplica a los nuevos registros de {t.maquina}
                      {t.maquina === "MAQ-1" ? ` en turno ${t.turno.toLowerCase()}` : ""}.
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-mono text-xl font-bold",
          accent && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FiltrosBar(props: {
  modoSemana: boolean;
  setModoSemana: (v: boolean) => void;
  semana: string;
  setSemana: (v: string) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  maqFiltro: "TODAS" | Maquina;
  setMaqFiltro: (v: "TODAS" | Maquina) => void;
  q: string;
  setQ: (v: string) => void;
  doPDF: () => void;
  doXLS: () => void;
}) {
  const {
    modoSemana,
    setModoSemana,
    semana,
    setSemana,
    desde,
    setDesde,
    hasta,
    setHasta,
    maqFiltro,
    setMaqFiltro,
    q,
    setQ,
    doPDF,
    doXLS,
  } = props;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          <button
            onClick={() => setModoSemana(true)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-semibold",
              modoSemana ? "bg-[#0f2440] text-white" : "text-muted-foreground",
            )}
          >
            Semana
          </button>
          <button
            onClick={() => setModoSemana(false)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-semibold",
              !modoSemana ? "bg-[#0f2440] text-white" : "text-muted-foreground",
            )}
          >
            Rango libre
          </button>
        </div>

        {modoSemana ? (
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setSemana(addDays(semana, -7))} aria-label="Semana anterior">
              <ChevronLeft className="size-4" />
            </Button>
            <div className="rounded-lg border px-3 py-2 font-mono text-sm flex items-center gap-2">
              <CalendarRange className="size-4 text-muted-foreground" />
              {weekLabel(semana)}
              <span className="text-[10px] uppercase text-muted-foreground">vie–jue</span>
            </div>
            <Button size="icon" variant="outline" onClick={() => setSemana(addDays(semana, 7))} aria-label="Semana siguiente">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="font-mono" />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="font-mono" />
            </div>
          </>
        )}

        <div className="min-w-[140px]">
          <Label className="text-xs">Máquina</Label>
          <Select value={maqFiltro} onValueChange={(v) => setMaqFiltro(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas</SelectItem>
              {MAQUINAS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Buscar lote / producto</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="BRFBAA…" className="font-mono" />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={doXLS}>
            <FileSpreadsheet className="size-4 mr-2" /> Excel
          </Button>
          <Button variant="outline" onClick={doPDF}>
            <FileDown className="size-4 mr-2" /> PDF
          </Button>
        </div>
      </div>
    </Card>
  );
}
