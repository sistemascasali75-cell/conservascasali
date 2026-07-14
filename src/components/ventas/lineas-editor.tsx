import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Trash2, Plus } from "lucide-react";
import { formatNumber } from "@/lib/format";

export type LineaEditable = {
  id?: string;
  producto_id: string;
  descripcion: string;
  cantidad_cajas: number;
  empaque: number;
  precio_unitario: number;
  descuento_pct: number;
  unidad_precio?: "CAJA" | "LATA";
  lote_id?: string | null;
  ubicacion_id?: string | null;
};

export type ProductoOpt = { id: string; codigo_base: string; descripcion?: string | null; empaque_default?: number };

export function LineasEditor({
  lineas,
  onChange,
  productos,
  showUnidad = false,
  showLoteUbic = false,
  loteOptionsByProducto,
  ubicOptionsByLote,
  disabled,
}: {
  lineas: LineaEditable[];
  onChange: (l: LineaEditable[]) => void;
  productos: ProductoOpt[];
  showUnidad?: boolean;
  showLoteUbic?: boolean;
  loteOptionsByProducto?: Map<string, SearchSelectOption[]>;
  ubicOptionsByLote?: Map<string, SearchSelectOption[]>;
  disabled?: boolean;
}) {
  const productoOpts = useMemo<SearchSelectOption[]>(
    () =>
      productos.map((p) => ({
        value: p.id,
        label: p.descripcion || p.codigo_base,
        description: p.descripcion ? p.codigo_base : undefined,
      })),
    [productos]
  );

  const update = (idx: number, patch: Partial<LineaEditable>) => {
    const next = lineas.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const addLinea = () => {
    onChange([
      ...lineas,
      {
        producto_id: "",
        descripcion: "",
        cantidad_cajas: 0,
        empaque: 48,
        precio_unitario: 0,
        descuento_pct: 0,
        unidad_precio: "CAJA",
      },
    ]);
  };

  const importeLinea = (l: LineaEditable) => {
    const cant = (l.unidad_precio ?? "CAJA") === "LATA" ? l.cantidad_cajas * l.empaque : l.cantidad_cajas;
    return cant * l.precio_unitario * (1 - (l.descuento_pct || 0) / 100);
  };

  const totalGeneral = lineas.reduce((a, l) => a + importeLinea(l), 0);

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-2 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-right w-32">Cajas</th>
              <th className="px-2 py-2 text-right w-24">Empaque</th>
              {showUnidad && <th className="px-2 py-2 text-center w-24">Unid. precio</th>}
              <th className="px-2 py-2 text-right w-36">P. unitario</th>
              <th className="px-2 py-2 text-right w-28">% Dcto</th>
              {showLoteUbic && <th className="px-2 py-2 text-left w-52">Lote</th>}
              {showLoteUbic && <th className="px-2 py-2 text-left w-44">Ubicación</th>}
              <th className="px-2 py-2 text-right w-28">Importe</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr>
                <td colSpan={showUnidad || showLoteUbic ? 10 : 8} className="px-3 py-6 text-center text-muted-foreground">
                  Sin líneas. Añade una para comenzar.
                </td>
              </tr>
            )}
            {lineas.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1 min-w-[260px]">
                  <SearchSelect
                    value={l.producto_id}
                    onValueChange={(v) => {
                      const p = productos.find((pp) => pp.id === v);
                      update(i, {
                        producto_id: v,
                        descripcion: p?.descripcion ?? p?.codigo_base ?? "",
                        empaque: p?.empaque_default ?? l.empaque ?? 48,
                      });
                    }}
                    options={productoOpts}
                    placeholder="Buscar producto"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={l.cantidad_cajas}
                    onChange={(e) => update(i, { cantidad_cajas: Number(e.target.value) || 0 })}
                    className="h-10 text-right text-base font-medium tabular-nums min-w-[110px]"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={l.empaque}
                    onChange={(e) => update(i, { empaque: Number(e.target.value) || 48 })}
                    className="h-10 text-right text-base tabular-nums min-w-[80px]"
                    disabled={disabled}
                  />
                </td>
                {showUnidad && (
                  <td className="px-2 py-1">
                    <select
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={l.unidad_precio ?? "CAJA"}
                      onChange={(e) => update(i, { unidad_precio: e.target.value as any })}
                      disabled={disabled}
                    >
                      <option value="CAJA">CAJA</option>
                      <option value="LATA">LATA</option>
                    </select>
                  </td>
                )}
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={l.precio_unitario}
                    onChange={(e) => update(i, { precio_unitario: Number(e.target.value) || 0 })}
                    className="h-10 text-right text-base font-medium tabular-nums min-w-[130px]"
                    disabled={disabled}
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={l.descuento_pct}
                    onChange={(e) => update(i, { descuento_pct: Number(e.target.value) || 0 })}
                    className="h-10 text-right text-base tabular-nums min-w-[100px]"
                    disabled={disabled}
                  />
                </td>
                {showLoteUbic && (
                  <td className="px-2 py-1">
                    <SearchSelect
                      value={l.lote_id ?? ""}
                      onValueChange={(v) => update(i, { lote_id: v, ubicacion_id: null })}
                      options={loteOptionsByProducto?.get(l.producto_id) ?? []}
                      placeholder="Lote (FEFO)"
                      disabled={disabled || !l.producto_id}
                      allowClear
                    />
                  </td>
                )}
                {showLoteUbic && (
                  <td className="px-2 py-1">
                    <SearchSelect
                      value={l.ubicacion_id ?? ""}
                      onValueChange={(v) => update(i, { ubicacion_id: v })}
                      options={ubicOptionsByLote?.get(l.lote_id ?? "") ?? []}
                      placeholder="Ubicación"
                      disabled={disabled || !l.lote_id}
                      allowClear
                    />
                  </td>
                )}
                <td className="px-2 py-1 text-right font-semibold tabular-nums">
                  {formatNumber(importeLinea(l))}
                </td>
                <td className="px-2 py-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(lineas.filter((_, j) => j !== i))}
                    disabled={disabled}
                  >
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr>
              <td colSpan={(showUnidad ? 1 : 0) + (showLoteUbic ? 2 : 0) + 6} className="px-2 py-2 text-right font-semibold">
                Subtotal
              </td>
              <td className="px-2 py-2 text-right font-bold tabular-nums">{formatNumber(totalGeneral)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addLinea} disabled={disabled}>
        <Plus className="size-4 mr-1" /> Agregar línea
      </Button>
    </div>
  );
}
