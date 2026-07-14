import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/format";
import { exportPDF, exportXLSX } from "@/lib/export";
import { FileDown, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kardex")({
  validateSearch: (s: Record<string, unknown>) => ({
    lote: typeof s.lote === "string" ? s.lote : undefined,
    producto: typeof s.producto === "string" ? s.producto : undefined,
  }),
  component: Kardex,
});

function Kardex() {
  const search = Route.useSearch();
  const [tipo, setTipo] = useState<"lote" | "producto">(search.lote ? "lote" : "producto");
  const [seleccion, setSeleccion] = useState<string>(search.lote ?? search.producto ?? "");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const { data: base } = useQuery({
    queryKey: ["kardex-base"],
    queryFn: async () => {
      const [p, l, u, c] = await Promise.all([
        supabase.from("productos").select("*").order("descripcion"),
        supabase.from("lotes").select("*").order("codigo_lote"),
        supabase.from("ubicaciones").select("*"),
        supabase.from("clientes_proveedores").select("*"),
      ]);
      return { productos: p.data ?? [], lotes: l.data ?? [], ubic: u.data ?? [], clientes: c.data ?? [] };
    },
  });

  const lotesFiltrados = useMemo(() => {
    if (!base) return [];
    if (tipo === "lote") return base.lotes;
    if (!seleccion) return [];
    return base.lotes.filter((l) => l.producto_id === seleccion);
  }, [tipo, seleccion, base]);

  const { data: movs } = useQuery({
    queryKey: ["kardex-movs", tipo, seleccion, desde, hasta],
    enabled: !!seleccion && !!base,
    queryFn: async () => {
      const loteIds = tipo === "lote" ? [seleccion] : lotesFiltrados.map((l) => l.id);
      if (loteIds.length === 0) return [];
      let q = supabase.from("movimientos").select("*").in("lote_id", loteIds).order("created_at", { ascending: true });
      if (desde) q = q.gte("fecha", desde);
      if (hasta) q = q.lte("fecha", hasta);
      const { data } = await q;
      return data ?? [];
    },
  });

  const ubicById = useMemo(() => new Map((base?.ubic ?? []).map((u) => [u.id, u])), [base]);
  const loteById = useMemo(() => new Map((base?.lotes ?? []).map((l) => [l.id, l])), [base]);
  const cliById = useMemo(() => new Map((base?.clientes ?? []).map((c) => [c.id, c])), [base]);

  const SIGNO: Record<string, number> = {
    ENTRADA: 1,
    AJUSTE_POSITIVO: 1,
    SALIDA: -1,
    MERMA: -1,
    AJUSTE_NEGATIVO: -1,
    TRASLADO: 0,
  };

  const rows = useMemo(() => {
    if (!movs) return [];
    let saldoLatas = 0;
    return movs.map((m: any) => {
      const signo = SIGNO[m.tipo] ?? 0;
      const totalLatasMov = Number(m.total_latas ?? 0);
      const emp = Math.max(1, Number(m.empaque ?? 48));
      saldoLatas += signo * totalLatasMov;
      const cajasSaldo = Math.floor(saldoLatas / emp);
      const latasSaldo = saldoLatas % emp;
      const l = loteById.get(m.lote_id);
      const c = m.cliente_proveedor_id ? cliById.get(m.cliente_proveedor_id) : null;
      return {
        fecha: m.fecha,
        codigo: l?.codigo_lote ?? "",
        tipo: m.tipo,
        origen: m.ubicacion_origen_id ? ubicById.get(m.ubicacion_origen_id)?.codigo : "",
        destino: m.ubicacion_destino_id ? ubicById.get(m.ubicacion_destino_id)?.codigo : "",
        entradaLatas: signo > 0 ? totalLatasMov : 0,
        salidaLatas: signo < 0 ? totalLatasMov : 0,
        saldoLatas: tipo === "lote" ? saldoLatas : null,
        saldoCajasLatas: tipo === "lote" ? `${cajasSaldo}c + ${latasSaldo}l` : null,
        cliente: c?.nombre ?? "",
        guia: m.nro_guia ?? m.nro_vale ?? "",
        motivo: m.motivo ?? "",
        empaque: emp,
      };
    });
  }, [movs, loteById, ubicById, cliById, tipo]);

  const titulo = useMemo(() => {
    if (tipo === "lote") {
      const l = base?.lotes.find((x) => x.id === seleccion);
      return l ? `Kardex Lote ${l.codigo_lote}` : "Kardex por Lote";
    }
    const p = base?.productos.find((x) => x.id === seleccion);
    return p ? `Kardex Producto ${p.codigo_base} — ${p.descripcion}` : "Kardex por Producto";
  }, [tipo, seleccion, base]);

  const headers = ["Fecha", "Lote", "Tipo", "Origen", "Destino", "Entrada (latas)", "Salida (latas)", "Saldo (latas)", "Saldo (cajas+latas)", "Cliente/Prov.", "Guía/Vale", "Motivo"];
  const dataRows = rows.map((r) => [
    formatDate(r.fecha),
    r.codigo,
    r.tipo,
    r.origen ?? "",
    r.destino ?? "",
    r.entradaLatas || "",
    r.salidaLatas || "",
    r.saldoLatas ?? "",
    r.saldoCajasLatas ?? "",
    r.cliente,
    r.guia,
    r.motivo,
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Kardex</h1>
        <p className="text-muted-foreground">Movimientos cronológicos con saldo corrido</p>
      </header>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Select value={tipo} onValueChange={(v: any) => { setTipo(v); setSeleccion(""); }}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lote">Por Lote</SelectItem>
              <SelectItem value="producto">Por Producto</SelectItem>
            </SelectContent>
          </Select>
          <div className="md:col-span-2">
            <SearchSelect
              value={seleccion}
              onValueChange={setSeleccion}
              placeholder={tipo === "lote" ? "Seleccionar lote…" : "Seleccionar producto…"}
              searchPlaceholder={tipo === "lote" ? "Buscar lote…" : "Buscar producto…"}
              options={
                tipo === "lote"
                  ? (base?.lotes ?? []).map((l): SearchSelectOption => ({ value: l.id, label: l.codigo_lote }))
                  : (base?.productos ?? []).map((p): SearchSelectOption => ({
                      value: p.id,
                      label: p.codigo_base ?? "",
                      description: p.descripcion ?? undefined,
                    }))
              }
            />
          </div>

          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-10" />
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-10" />
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => exportXLSX({ sheetName: "Kardex", headers, rows: dataRows, filename: `${titulo}.xlsx` })}
          >
            <FileSpreadsheet className="size-4 mr-2" /> Excel
          </Button>
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() => exportPDF({ title: titulo, headers, rows: dataRows, filename: `${titulo}.pdf` })}
          >
            <FileDown className="size-4 mr-2" /> PDF
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                {headers.map((h) => (
                  <th key={h} className={`px-3 py-2 ${h.startsWith("Entrada") || h.startsWith("Salida") || h.startsWith("Saldo") ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{formatDate(r.fecha)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{r.tipo}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.origen || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.destino || "—"}</td>
                  <td className="px-3 py-2 text-right text-success tabular-nums">{r.entradaLatas ? formatNumber(r.entradaLatas, 0) : "—"}</td>
                  <td className="px-3 py-2 text-right text-destructive tabular-nums">{r.salidaLatas ? formatNumber(r.salidaLatas, 0) : "—"}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{r.saldoLatas !== null ? formatNumber(r.saldoLatas, 0) : "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{r.saldoCajasLatas ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.cliente || "—"}</td>
                  <td className="px-3 py-2 text-xs">{r.guia || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.motivo || "—"}</td>
                </tr>
              ))}
              {!seleccion && (
                <tr><td colSpan={12} className="text-center py-10 text-muted-foreground">Selecciona un {tipo === "lote" ? "lote" : "producto"} para ver el kardex</td></tr>
              )}
              {seleccion && rows.length === 0 && (
                <tr><td colSpan={12} className="text-center py-10 text-muted-foreground">Sin movimientos en el rango</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
