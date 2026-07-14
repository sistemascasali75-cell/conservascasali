import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatNumber, venceColor, daysUntil } from "@/lib/format";
import { fetchEmpaquePorLote, resolveEmpaque } from "@/lib/empaque";
import { Search, FileLock2, Printer, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/inventario")({
  component: Inventario,
});

function Inventario() {
  const [q, setQ] = useState("");
  const [prodFilter, setProdFilter] = useState("all");
  const [almFilter, setAlmFilter] = useState("all");
  const [estFilter, setEstFilter] = useState("all");
  const [mercadoFilter, setMercadoFilter] = useState("all");
  const [openLote, setOpenLote] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const [lotesR, stockR, prodR, almR, ubR, wR, empMap] = await Promise.all([
        supabase.from("lotes").select("*").order("fecha_vencimiento"),
        supabase.from("stock_lote_ubicacion").select("*"),
        supabase.from("productos").select("*"),
        supabase.from("almacenes").select("*"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("warrants").select("*").eq("estado", "ACTIVO"),
        fetchEmpaquePorLote(),
      ]);
      return {
        lotes: lotesR.data ?? [],
        stock: stockR.data ?? [],
        productos: prodR.data ?? [],
        almacenes: almR.data ?? [],
        ubicaciones: ubR.data ?? [],
        warrants: wR.data ?? [],
        empaquePorLote: empMap,
      };
    },
  });

  const prodById = useMemo(
    () => new Map((data?.productos ?? []).map((p) => [p.id, p])),
    [data],
  );

  const warrantByLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.warrants ?? []).forEach((w) => m.set(w.lote_id, (m.get(w.lote_id) ?? 0) + Number(w.cantidad_cajas_warrant)));
    return m;
  }, [data]);

  // Fuente de verdad: total_latas por lote (suma de stock_lote_ubicacion.total_latas)
  const latasPorLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.stock ?? []).forEach((s: any) =>
      m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.total_latas ?? 0)),
    );
    return m;
  }, [data]);

  const empaqueLote = (loteId: string) => {
    const l: any = (data?.lotes ?? []).find((x: any) => x.id === loteId);
    const p: any = l ? prodById.get(l.producto_id) : null;
    return resolveEmpaque(loteId, data?.empaquePorLote, p?.empaque);
  };

  const stockPorLote = useMemo(() => {
    const m = new Map<string, { cajas: number; sueltas: number; total: number }>();
    (data?.lotes ?? []).forEach((l: any) => {
      const total = latasPorLote.get(l.id) ?? 0;
      const emp = empaqueLote(l.id);
      m.set(l.id, { cajas: Math.floor(total / emp), sueltas: total % emp, total });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, latasPorLote]);


  const ubicById = useMemo(
    () => new Map((data?.ubicaciones ?? []).map((u) => [u.id, u])),
    [data],
  );
  const almById = useMemo(
    () => new Map((data?.almacenes ?? []).map((a) => [a.id, a])),
    [data],
  );

  const lotesView = useMemo(() => {
    return (data?.lotes ?? [])
      .filter((l) => {
        if (prodFilter !== "all" && l.producto_id !== prodFilter) return false;
        if (estFilter !== "all" && l.estado !== estFilter) return false;
        if (mercadoFilter !== "all" && l.mercado !== mercadoFilter) return false;
        if (almFilter !== "all") {
          const ubicsDelLote = (data?.stock ?? [])
            .filter((s) => s.lote_id === l.id)
            .map((s) => ubicById.get(s.ubicacion_id)?.almacen_id);
          if (!ubicsDelLote.includes(almFilter)) return false;
        }
        if (q) {
          const p = prodById.get(l.producto_id);
          const text = `${l.codigo_lote} ${p?.descripcion ?? ""}`.toLowerCase();
          if (!text.includes(q.toLowerCase())) return false;
        }
        return true;
      })
      .map((l) => {
        const st = stockPorLote.get(l.id) ?? { cajas: 0, sueltas: 0, total: 0 };
        return { ...l, stockCajas: st.cajas, stockSueltas: st.sueltas, stockTotalLatas: st.total };
      });
  }, [data, q, prodFilter, estFilter, mercadoFilter, almFilter, prodById, ubicById, stockPorLote]);

  const resumen = useMemo(() => {
    const totalCajas = lotesView.reduce((s, l) => s + Number(l.stockCajas ?? 0), 0);
    const totalSueltas = lotesView.reduce((s, l) => s + Number(l.stockSueltas ?? 0), 0);
    const totalLatas = lotesView.reduce((s, l) => s + Number(l.stockTotalLatas ?? 0), 0);
    const totalLotes = lotesView.length;
    const productosSet = new Set(lotesView.map((l) => l.producto_id));
    const porEstado = new Map<string, number>();
    const porMercado = new Map<string, number>();
    let venceCritico = 0;
    let venceProx = 0;
    lotesView.forEach((l) => {
      porEstado.set(l.estado, (porEstado.get(l.estado) ?? 0) + Number(l.stockCajas ?? 0));
      const m = l.mercado ?? "—";
      porMercado.set(m, (porMercado.get(m) ?? 0) + Number(l.stockCajas ?? 0));
      const c = venceColor(l.fecha_vencimiento);
      if (c === "danger") venceCritico += Number(l.stockCajas ?? 0);
      else if (c === "warn") venceProx += Number(l.stockCajas ?? 0);
    });
    return { totalCajas, totalSueltas, totalLatas, totalLotes, productos: productosSet.size, porEstado, porMercado, venceCritico, venceProx };
  }, [lotesView]);


  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Inventario</h1>
        <p className="text-muted-foreground">Lotes y stock por ubicación</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Total cajas</div>
          <div className="text-2xl font-bold">{formatNumber(resumen.totalCajas, 3)}</div>
          <div className="text-xs text-muted-foreground mt-1">{resumen.totalLotes} lotes · {resumen.productos} productos</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Inventario (latas)</div>
          <div className="text-2xl font-bold text-primary">{formatNumber(resumen.totalLatas, 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatNumber(resumen.totalCajas, 0)} cajas + {formatNumber(resumen.totalSueltas, 0)} latas sueltas
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Por vencer (≤30d)</div>
          <div className="text-2xl font-bold text-warning">{formatNumber(resumen.venceProx, 3)}</div>
          <div className="text-xs text-muted-foreground mt-1">cajas próximas</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Crítico / vencido</div>
          <div className="text-2xl font-bold text-destructive">{formatNumber(resumen.venceCritico, 3)}</div>
          <div className="text-xs text-muted-foreground mt-1">cajas</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Por estado</div>
          <div className="space-y-0.5 text-sm max-h-24 overflow-auto">
            {Array.from(resumen.porEstado.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
              <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground truncate">{k}</span><span className="font-semibold tabular-nums">{formatNumber(v)}</span></div>
            ))}
            {resumen.porEstado.size === 0 && <div className="text-muted-foreground text-xs">—</div>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Por mercado</div>
          <div className="space-y-0.5 text-sm max-h-24 overflow-auto">
            {Array.from(resumen.porMercado.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
              <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground truncate">{k}</span><span className="font-semibold tabular-nums">{formatNumber(v)}</span></div>
            ))}
            {resumen.porMercado.size === 0 && <div className="text-muted-foreground text-xs">—</div>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar lote o producto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <FilterSel value={prodFilter} onChange={setProdFilter} placeholder="Producto">
            {(data?.productos ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.codigo_base} — {p.descripcion}</SelectItem>
            ))}
          </FilterSel>
          <FilterSel value={almFilter} onChange={setAlmFilter} placeholder="Almacén">
            {(data?.almacenes ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
            ))}
          </FilterSel>
          <FilterSel value={estFilter} onChange={setEstFilter} placeholder="Estado">
            {["DISPONIBLE", "CERTIFICADO", "POR_CERTIFICAR", "INMOVILIZADO", "EN_PROCESO", "CUARENTENA"].map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </FilterSel>
          <FilterSel value={mercadoFilter} onChange={setMercadoFilter} placeholder="Mercado">
            {["QW", "M.LOCAL", "MUNICIPIO", "EXPORTACION"].map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </FilterSel>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2.5">Código de lote</th>
                <th className="text-left px-3 py-2.5">Producto</th>
                <th className="text-left px-3 py-2.5">FP</th>
                <th className="text-left px-3 py-2.5">FV</th>
                <th className="text-left px-3 py-2.5">Estado</th>
                <th className="text-left px-3 py-2.5">Etiqueta</th>
                <th className="text-left px-3 py-2.5">Mercado</th>
                <th className="text-right px-3 py-2.5">Cajas</th>
                <th className="text-right px-3 py-2.5">Latas sueltas</th>
                <th className="text-right px-3 py-2.5">Inventario (latas)</th>

              </tr>
            </thead>
            <tbody>
              {lotesView.map((l) => {
                const color = venceColor(l.fecha_vencimiento);
                const p = prodById.get(l.producto_id);
                return (
                  <tr
                    key={l.id}
                    className="border-t hover:bg-accent/40 cursor-pointer"
                    onClick={() => setOpenLote(l.id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {l.codigo_lote}
                        {warrantByLote.has(l.id) && (
                          <span title={`Warrant activo: ${formatNumber(warrantByLote.get(l.id))} cj`}>
                            <FileLock2 className="size-3.5 text-destructive" />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2">{p?.descripcion}</td>
                    <td className="px-3 py-2">{formatDate(l.fecha_produccion)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className={`size-2 rounded-full ${
                            color === "danger" ? "bg-destructive" : color === "warn" ? "bg-warning" : "bg-success"
                          }`}
                        />
                        {formatDate(l.fecha_vencimiento)}
                        <span className="text-xs text-muted-foreground">
                          ({daysUntil(l.fecha_vencimiento)}d)
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={l.estado === "DISPONIBLE" ? "default" : "secondary"}>{l.estado}</Badge>
                    </td>
                    <td className="px-3 py-2">{l.etiqueta ?? "—"}</td>
                    <td className="px-3 py-2">{l.mercado ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(l.stockCajas, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(l.stockSueltas, 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">{formatNumber(l.stockTotalLatas, 0)}</td>
                  </tr>
                );
              })}
              {lotesView.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">

                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!openLote} onOpenChange={(o) => !o && setOpenLote(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {openLote && (
            <LoteDetail
              loteId={openLote}
              ubicById={ubicById}
              almById={almById}
              prodById={prodById}
              empaquePorLote={data?.empaquePorLote}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSel({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos — {placeholder}</SelectItem>
        {children}
      </SelectContent>
    </Select>
  );
}

function LoteDetail({
  loteId,
  ubicById,
  almById,
  prodById,
  empaquePorLote,
}: {
  loteId: string;
  ubicById: Map<string, any>;
  almById: Map<string, any>;
  prodById: Map<string, any>;
  empaquePorLote?: Map<string, number>;
}) {
  const { data } = useQuery({
    queryKey: ["lote-detail", loteId],
    queryFn: async () => {
      const [loteR, stockR, movR] = await Promise.all([
        supabase.from("lotes").select("*").eq("id", loteId).single(),
        supabase.from("stock_lote_ubicacion").select("*").eq("lote_id", loteId),
        supabase.from("movimientos").select("*").eq("lote_id", loteId).order("created_at", { ascending: false }),
      ]);
      return { lote: loteR.data, stock: stockR.data ?? [], movs: movR.data ?? [] };
    },
  });

  if (!data?.lote) return null;
  const p = prodById.get(data.lote.producto_id);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono text-base">{data.lote.codigo_lote}</SheetTitle>
      </SheetHeader>
      <div className="space-y-5 mt-4">
        <Card className="p-4 space-y-1 text-sm">
          <div><span className="text-muted-foreground">Producto:</span> {p?.descripcion}</div>
          <div><span className="text-muted-foreground">FP / FV:</span> {formatDate(data.lote.fecha_produccion)} → {formatDate(data.lote.fecha_vencimiento)}</div>
          <div><span className="text-muted-foreground">Estado:</span> {data.lote.estado}</div>
          <div><span className="text-muted-foreground">Etiqueta:</span> {data.lote.etiqueta ?? "—"} · <span className="text-muted-foreground">Mercado:</span> {data.lote.mercado ?? "—"}</div>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Ubicaciones</h3>
            <Link to="/kardex" search={{ lote: loteId } as any}>
              <Button variant="outline" size="sm"><BookOpen className="size-4 mr-1" />Ver kardex</Button>
            </Link>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Almacén</th>
                  <th className="text-left px-3 py-2">Ubicación</th>
                  <th className="text-right px-3 py-2">Cajas</th>
                  <th className="text-right px-3 py-2">Latas sueltas</th>
                  <th className="text-right px-3 py-2">Inventario (latas)</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.stock.filter((s) => Number(s.total_latas ?? 0) > 0).map((s) => {
                  const u = ubicById.get(s.ubicacion_id);
                  const a = u ? almById.get(u.almacen_id) : null;
                  const emp = resolveEmpaque(loteId, empaquePorLote, p?.empaque);
                  const tot = Number(s.total_latas ?? 0);
                  const cj = Math.floor(tot / emp);
                  const su = tot % emp;
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{a?.nombre}</td>
                      <td className="px-3 py-2 font-mono">{u?.codigo}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(cj, 0)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(su, 0)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">{formatNumber(tot, 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <a
                          href={`/etiqueta/${loteId}?ubicacion=${s.ubicacion_id}&cantidad=${cj}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="sm"><Printer className="size-4" /></Button>
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

        </div>

        <div>
          <h3 className="font-semibold mb-2">Kardex</h3>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Fecha</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Origen → Destino</th>
                  <th className="text-right px-3 py-2">Cajas</th>
                  <th className="text-left px-3 py-2">Guía/Vale</th>
                </tr>
              </thead>
              <tbody>
                {data.movs.map((m) => {
                  const ori = m.ubicacion_origen_id ? ubicById.get(m.ubicacion_origen_id)?.codigo : null;
                  const dst = m.ubicacion_destino_id ? ubicById.get(m.ubicacion_destino_id)?.codigo : null;
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-2">{formatDate(m.fecha)}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{m.tipo}</Badge></td>
                      <td className="px-3 py-2 font-mono text-xs">{ori ?? "—"} → {dst ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(m.cantidad_cajas, 3)}</td>
                      <td className="px-3 py-2 text-xs">{m.nro_guia ?? m.nro_vale ?? "—"}</td>
                    </tr>
                  );
                })}
                {data.movs.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
