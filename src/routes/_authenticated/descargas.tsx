import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { exportPDF, exportXLSX } from "@/lib/export";
import { FileSpreadsheet, FileText, Download, Database, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/descargas")({
  component: DescargasPage,
});

type Tabla = {
  key: string;
  nombre: string;
  descripcion: string;
  grupo: string;
};

const TABLAS: Tabla[] = [
  { key: "lotes", nombre: "Lotes", descripcion: "Lotes de producción / inventario", grupo: "Inventario" },
  { key: "stock_lote_ubicacion", nombre: "Stock por ubicación", descripcion: "Saldos de lote × ubicación", grupo: "Inventario" },
  { key: "movimientos", nombre: "Movimientos", descripcion: "Entradas, salidas y traslados", grupo: "Inventario" },
  { key: "ubicaciones", nombre: "Ubicaciones", descripcion: "Posiciones del almacén", grupo: "Inventario" },
  { key: "almacenes", nombre: "Almacenes", descripcion: "Almacenes registrados", grupo: "Inventario" },
  { key: "inventario_conteo", nombre: "Conteos físicos", descripcion: "Detalle de conteos", grupo: "Inventario" },
  { key: "inventarios_fisicos", nombre: "Inventarios físicos", descripcion: "Cabeceras de inventarios", grupo: "Inventario" },

  { key: "productos", nombre: "Productos", descripcion: "Catálogo de productos", grupo: "Catálogos" },
  { key: "clientes_proveedores", nombre: "Clientes / Proveedores", descripcion: "Maestro de terceros", grupo: "Catálogos" },
  { key: "estados", nombre: "Estados", descripcion: "Catálogo de estados", grupo: "Catálogos" },
  { key: "mercados", nombre: "Mercados", descripcion: "Mercados de destino", grupo: "Catálogos" },
  { key: "calidad_codigos", nombre: "Códigos de calidad", descripcion: "Catálogo de calidades", grupo: "Catálogos" },

  { key: "insumos", nombre: "Insumos · Catálogo", descripcion: "Maestro de insumos", grupo: "Insumos" },
  { key: "insumos_movimientos", nombre: "Insumos · Movimientos", descripcion: "Todos los movimientos de insumos", grupo: "Insumos" },

  { key: "lances_produccion", nombre: "Lances de producción", descripcion: "Cabeceras de lances", grupo: "Insumos" },
  { key: "lance_insumos", nombre: "Lances · Insumos usados", descripcion: "Detalle de insumos por lance", grupo: "Insumos" },

  { key: "ordenes_etiquetado", nombre: "Órdenes de etiquetado", descripcion: "Cabeceras de etiquetado", grupo: "Operaciones" },
  { key: "warrants", nombre: "Warrants", descripcion: "Documentos de garantía", grupo: "Operaciones" },
  { key: "vales", nombre: "Vales", descripcion: "Vales de salida registrados", grupo: "Operaciones" },

  { key: "ventas_cotizaciones", nombre: "Ventas · Cotizaciones", descripcion: "Cabeceras de cotizaciones", grupo: "Ventas" },
  { key: "ventas_cot_items", nombre: "Ventas · Ítems cotización", descripcion: "Líneas de cotizaciones", grupo: "Ventas" },
  { key: "ventas_ordenes", nombre: "Ventas · Órdenes", descripcion: "Órdenes de venta", grupo: "Ventas" },
  { key: "ventas_orden_items", nombre: "Ventas · Ítems orden", descripcion: "Líneas de órdenes", grupo: "Ventas" },
  { key: "ventas_facturas", nombre: "Ventas · Facturas", descripcion: "Comprobantes emitidos", grupo: "Ventas" },
  { key: "ventas_factura_items", nombre: "Ventas · Ítems factura", descripcion: "Líneas de facturas", grupo: "Ventas" },
  { key: "ventas_guias", nombre: "Ventas · Guías", descripcion: "Guías de remisión", grupo: "Ventas" },
  { key: "ventas_guia_items", nombre: "Ventas · Ítems guía", descripcion: "Líneas de guías", grupo: "Ventas" },
  { key: "ventas_correlativos", nombre: "Ventas · Correlativos", descripcion: "Series y numeración", grupo: "Ventas" },

  { key: "user_roles", nombre: "Roles de usuario", descripcion: "Asignación de roles", grupo: "Seguridad" },
  { key: "admin_audit", nombre: "Auditoría administrativa", descripcion: "Cambios registrados por admin", grupo: "Seguridad" },
];

// ─── Vistas vinculadas (joins tal como se muestran en las páginas) ───
type Vista = {
  key: string;
  nombre: string;
  table: string;
  select: string;
  order?: string;
  expand?: string; // campo array a expandir (una fila por elemento)
};

const VISTAS: Vista[] = [
  {
    key: "stock_detallado",
    nombre: "Stock detallado",
    table: "stock_lote_ubicacion",
    select:
      "cantidad_cajas,total_latas,updated_at,lotes(codigo_lote,estado,etiqueta,mercado,fecha_produccion,fecha_vencimiento,costo_por_caja,productos(codigo_base,descripcion,especie,presentacion,envase,empaque)),ubicaciones(codigo,seccion,carril,almacenes(nombre))",
  },
  {
    key: "movimientos_detalle",
    nombre: "Movimientos detallados",
    table: "movimientos",
    select:
      "*,lotes(codigo_lote,estado,etiqueta,productos(codigo_base,descripcion,envase)),origen:ubicaciones!movimientos_ubicacion_origen_id_fkey(codigo),destino:ubicaciones!movimientos_ubicacion_destino_id_fkey(codigo),clientes_proveedores(nombre,documento),mercados(mercado)",
    order: "fecha",
  },
  {
    key: "insumos_mov_detalle",
    nombre: "Movimientos de insumos detallados",
    table: "insumos_movimientos",
    select: "*,insumos(codigo,insumo,subcategoria,categoria,grupo,unidad,empaque)",
    order: "fecha",
  },
  {
    key: "lances_detalle",
    nombre: "Lances con insumos",
    table: "lances_produccion",
    select: "*,lance_insumos(orden,nombre,presentacion,cantidad,observacion)",
    order: "fecha",
    expand: "lance_insumos",
  },
  {
    key: "inventario_detalle",
    nombre: "Inventarios físicos con conteo",
    table: "inventarios_fisicos",
    select:
      "*,almacenes(nombre),inventario_conteo(cantidad_esperada,cantidad_contada,total_latas_esperadas,total_latas_contadas,lotes(codigo_lote),ubicaciones(codigo))",
    order: "fecha",
    expand: "inventario_conteo",
  },
  {
    key: "cotizaciones_detalle",
    nombre: "Cotizaciones con ítems",
    table: "ventas_cotizaciones",
    select:
      "*,clientes_proveedores(nombre,documento),ventas_cot_items(descripcion,cantidad_cajas,latas,cantidad_latas,precio_unitario,descuento_pct,importe)",
    order: "fecha_emision",
    expand: "ventas_cot_items",
  },
  {
    key: "ordenes_detalle",
    nombre: "Órdenes con ítems",
    table: "ventas_ordenes",
    select:
      "*,clientes_proveedores(nombre,documento),ventas_orden_items(descripcion,cantidad_cajas,latas,cantidad_latas,precio_unitario,importe,lotes(codigo_lote),ubicaciones(codigo))",
    order: "fecha_emision",
    expand: "ventas_orden_items",
  },
  {
    key: "facturas_detalle",
    nombre: "Facturas con ítems",
    table: "ventas_facturas",
    select:
      "*,clientes_proveedores(nombre,documento),ventas_factura_items(descripcion,cantidad_cajas,latas,cantidad_latas,precio_unitario,valor_venta,igv_linea,importe)",
    order: "fecha_emision",
    expand: "ventas_factura_items",
  },
  {
    key: "guias_detalle",
    nombre: "Guías con ítems",
    table: "ventas_guias",
    select:
      "*,clientes_proveedores(nombre,documento),ventas_guia_items(descripcion,cantidad_cajas,latas,cantidad_latas,lotes(codigo_lote),ubicaciones(codigo))",
    order: "fecha_emision",
    expand: "ventas_guia_items",
  },
  {
    key: "warrants_detalle",
    nombre: "Warrants con lote",
    table: "warrants",
    select: "*,lotes(codigo_lote,estado,productos(codigo_base,descripcion))",
    order: "fecha_inicio",
  },
  {
    key: "etiquetado_detalle",
    nombre: "Etiquetado con lotes",
    table: "ordenes_etiquetado",
    select:
      "*,origen:lotes!ordenes_etiquetado_lote_origen_id_fkey(codigo_lote,etiqueta),destino:lotes!ordenes_etiquetado_lote_destino_id_fkey(codigo_lote,etiqueta),ubicaciones(codigo)",
    order: "fecha",
  },
];

function flattenObj(obj: any, prefix = ""): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flattenObj(v, key));
    else if (Array.isArray(v)) out[key] = JSON.stringify(v);
    else out[key] = v ?? "";
  }
  return out;
}

function buildVistaRows(rows: any[], expand?: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  for (const r of rows) {
    if (expand && Array.isArray(r[expand])) {
      const { [expand]: children, ...head } = r;
      const base = flattenObj(head);
      if (!children.length) out.push(base);
      else for (const c of children) out.push({ ...base, ...flattenObj(c, "det") });
    } else {
      out.push(flattenObj(r));
    }
  }
  return out;
}

async function fetchAllRows(key: string, select = "*", order?: string): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  let all: any[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = (supabase as any).from(key).select(select).range(from, from + PAGE - 1);
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function DescargasPage() {
  const [filtro, setFiltro] = useState("");
  const [descargandoTodo, setDescargandoTodo] = useState(false);
  const [descargandoVinc, setDescargandoVinc] = useState(false);

  const descargarVinculadasXLSX = async () => {
    setDescargandoVinc(true);
    const tid = toast.loading("Generando Excel de tablas vinculadas...");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Casali";
      wb.created = new Date();

      const resumen = wb.addWorksheet("Resumen");
      const t1 = resumen.addRow(["TABLAS VINCULADAS (vistas del sistema)"]);
      t1.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      resumen.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      resumen.mergeCells("A1:C1");
      resumen.addRow([`Exportado ${new Date().toLocaleString("es-PE")}`]);
      resumen.addRow([]);
      const hdr = resumen.addRow(["Vista", "Tabla base", "Filas"]);
      hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
      hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

      let total = 0;
      let errores = 0;
      for (const v of VISTAS) {
        toast.loading(`Vinculando ${v.nombre}...`, { id: tid });
        try {
          const raw = await fetchAllRows(v.table, v.select, v.order);
          const rows = buildVistaRows(raw, v.expand);
          resumen.addRow([v.nombre, v.table, rows.length]);
          total += rows.length;
          const ws = wb.addWorksheet(v.nombre.slice(0, 31));
          if (!rows.length) {
            ws.addRow(["(sin registros)"]);
            continue;
          }
          const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
          const h = ws.addRow(headers);
          h.font = { bold: true, color: { argb: "FFFFFFFF" } };
          h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
          ws.views = [{ state: "frozen", ySplit: 1 }];
          for (const r of rows) ws.addRow(headers.map((k) => (r[k] ?? "")));
          ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
          ws.columns.forEach((c) => {
            let max = 12;
            c.eachCell?.({ includeEmpty: false }, (cell) => {
              const l = cell.value ? String(cell.value).length : 0;
              if (l > max) max = l;
            });
            c.width = Math.min(max + 2, 45);
          });
        } catch (e: any) {
          errores++;
          resumen.addRow([v.nombre, v.table, `ERROR: ${e?.message || e}`]);
        }
      }
      const tot = resumen.addRow(["", "TOTAL", total]);
      tot.font = { bold: true };
      resumen.columns.forEach((c) => (c.width = 34));

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tablas-vinculadas-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Vinculadas: ${total.toLocaleString("es-PE")} filas${errores ? ` · ${errores} vista(s) con error` : ""}`,
        { id: tid },
      );
    } catch (e: any) {
      toast.error(`Error: ${e?.message || e}`, { id: tid });
    } finally {
      setDescargandoVinc(false);
    }
  };


  const descargarTodoXLSX = async () => {
    setDescargandoTodo(true);
    const tid = toast.loading("Descargando base de datos completa...");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Casali";
      wb.created = new Date();

      const resumen = wb.addWorksheet("Resumen");
      resumen.addRow(["BASE DE DATOS COMPLETA"]).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      resumen.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      resumen.mergeCells("A1:D1");
      resumen.addRow([`Exportado ${new Date().toLocaleString("es-PE")}`]);
      resumen.addRow([]);
      const hdr = resumen.addRow(["Tabla", "Nombre", "Grupo", "Registros"]);
      hdr.font = { bold: true, color: { argb: "FFFFFFFF" } };
      hdr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

      let totalGlobal = 0;
      let errores = 0;

      for (const t of TABLAS) {
        toast.loading(`Descargando ${t.nombre}...`, { id: tid });
        try {
          const rows = await fetchAllRows(t.key);
          resumen.addRow([t.key, t.nombre, t.grupo, rows.length]);
          totalGlobal += rows.length;
          if (rows.length === 0) {
            const ws = wb.addWorksheet(t.key.slice(0, 31));
            ws.addRow(["(sin registros)"]);
            continue;
          }
          const headers = Object.keys(rows[0]);
          const ws = wb.addWorksheet(t.key.slice(0, 31));
          const h = ws.addRow(headers);
          h.font = { bold: true, color: { argb: "FFFFFFFF" } };
          h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
          for (const r of rows) {
            ws.addRow(headers.map((k) => {
              const v = r[k];
              if (v === null || v === undefined) return "";
              if (typeof v === "object") return JSON.stringify(v);
              return v;
            }));
          }
          ws.columns.forEach((c) => {
            let max = 10;
            c.eachCell?.((cell) => {
              const v = cell.value ? String(cell.value).length : 0;
              if (v > max) max = v;
            });
            c.width = Math.min(max + 2, 50);
          });
        } catch (e: any) {
          errores++;
          resumen.addRow([t.key, t.nombre, t.grupo, `ERROR: ${e?.message || e}`]);
        }
      }

      const totRow = resumen.addRow(["", "", "TOTAL", totalGlobal]);
      totRow.font = { bold: true };
      resumen.columns.forEach((c) => (c.width = 25));

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `base-de-datos-completa-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Descarga completa: ${totalGlobal.toLocaleString("es-PE")} registros${errores ? ` · ${errores} tabla(s) con error` : ""}`, { id: tid });
    } catch (e: any) {
      toast.error(`Error: ${e?.message || e}`, { id: tid });
    } finally {
      setDescargandoTodo(false);
    }
  };

  const { data: counts = {}, isLoading } = useQuery({
    queryKey: ["descargas-counts"],
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(TABLAS.map(async (t) => {
        const { count, error } = await (supabase as any).from(t.key).select("*", { count: "exact", head: true });
        out[t.key] = error ? -1 : (count ?? 0);
      }));
      return out;
    },
  });

  const visible = TABLAS.filter((t) =>
    !filtro ||
    t.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
    t.key.toLowerCase().includes(filtro.toLowerCase()) ||
    t.grupo.toLowerCase().includes(filtro.toLowerCase()),
  );
  const grupos = Array.from(new Set(visible.map((t) => t.grupo)));

  const descargarTabla = async (t: Tabla, kind: "xlsx" | "pdf") => {
    const tid = toast.loading(`Descargando ${t.nombre}...`);
    try {
      const PAGE = 1000;
      let from = 0;
      let all: any[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await (supabase as any).from(t.key).select("*").range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (all.length === 0) {
        toast.error(`Sin registros en ${t.nombre}`, { id: tid });
        return;
      }
      const headers = Object.keys(all[0]);
      const rows = all.map((r) => headers.map((h) => {
        const v = r[h];
        if (v === null || v === undefined) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      }));
      const opts = {
        title: `${t.nombre} · ${all.length.toLocaleString("es-PE")} registros`,
        subtitle: `Tabla ${t.key} · Exportado ${new Date().toLocaleString("es-PE")}`,
        headers, rows, filename: `${t.key}-completo.${kind}`,
        summary: [{ label: "Registros", value: all.length }],
      };
      if (kind === "pdf") await exportPDF(opts);
      else await exportXLSX({ sheetName: t.nombre.slice(0, 30), ...opts });
      toast.success(`${t.nombre} descargado (${all.length} reg.)`, { id: tid });
    } catch (e: any) {
      toast.error(`Error: ${e?.message || e}`, { id: tid });
    }
  };

  const totalRegistros = Object.values(counts).filter((n) => n >= 0).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Download className="size-6" /> Descargas</h1>
        <p className="text-sm text-muted-foreground">Exporta cualquier tabla del sistema completa a Excel o PDF.</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar tabla..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
          </div>
          <Button size="lg" onClick={descargarTodoXLSX} disabled={descargandoTodo} className="gap-2">
            {descargandoTodo ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
            Descargar TODA la base de datos (Excel)
          </Button>
          <Button size="lg" variant="secondary" onClick={descargarVinculadasXLSX} disabled={descargandoVinc} className="gap-2">
            {descargandoVinc ? <Loader2 className="size-5 animate-spin" /> : <Link2 className="size-5" />}
            Descargar TABLAS VINCULADAS ({VISTAS.length} vistas)
          </Button>

          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total registros en el sistema</div>
            <div className="text-3xl font-bold text-primary tabular-nums">
              {isLoading ? <Loader2 className="size-6 animate-spin inline" /> : totalRegistros.toLocaleString("es-PE")}
            </div>
          </div>
        </CardContent>
      </Card>


      {grupos.map((g) => (
        <div key={g} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{g}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.filter((t) => t.grupo === g).map((t) => {
              const n = counts[t.key];
              return (
                <Card key={t.key} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Database className="size-4 text-primary" /> {t.nombre}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{t.descripcion}</p>
                      </div>
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0">{t.key}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between gap-4">
                    <div className="text-center py-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Registros</div>
                      <div className="text-5xl font-black tabular-nums text-primary leading-none mt-1">
                        {isLoading ? <Loader2 className="size-8 animate-spin inline" /> :
                          n < 0 ? <span className="text-rose-500 text-2xl">N/D</span> : n.toLocaleString("es-PE")}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="default" disabled={n <= 0} onClick={() => descargarTabla(t, "xlsx")}>
                        <FileSpreadsheet className="size-4" /> Excel
                      </Button>
                      <Button size="sm" variant="secondary" disabled={n <= 0} onClick={() => descargarTabla(t, "pdf")}>
                        <FileText className="size-4" /> PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {visible.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sin tablas que coincidan con "{filtro}"</CardContent></Card>
      )}
    </div>
  );
}
