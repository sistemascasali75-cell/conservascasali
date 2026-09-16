import { supabase } from "@/integrations/supabase/client";

/**
 * Empaque efectivo por lote — fuente de verdad consistente con el Kardex.
 *
 * Prioridad:
 *   1) `movimientos.empaque` más reciente para el lote (lo que muestra el Kardex).
 *   2) `productos.empaque` (fallback si el lote nunca tuvo movimientos con empaque).
 *   3) 48 (fallback histórico).
 *
 * De esta forma, si en Kardex un lote se registra con empaque=24, el
 * Inventario, Mapa y Reporte Gerencial mostrarán el mismo desglose
 * cajas + latas sueltas que el Kardex.
 */
export async function fetchEmpaquePorLote(): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("movimientos")
    .select("lote_id, empaque, created_at")
    .not("empaque", "is", null)
    .order("created_at", { ascending: true });
  const m = new Map<string, number>();
  (data ?? []).forEach((mv: any) => {
    if (mv.empaque) m.set(mv.lote_id, Math.max(1, Number(mv.empaque)));
  });
  return m;
}

export function resolveEmpaque(
  loteId: string,
  empaquePorLote: Map<string, number> | undefined | null,
  productoEmpaque?: number | null,
): number {
  return Math.max(
    1,
    Number(empaquePorLote?.get(loteId) ?? productoEmpaque ?? 48),
  );
}

/**
 * Latas totales disponibles en una fila de `stock_lote_ubicacion`.
 * `total_latas` es la fuente de verdad; si no existe se deriva de cajas.
 */
export function latasDeStock(
  s: { total_latas?: number | null; cantidad_cajas?: number | null },
  empaque = 48,
): number {
  const tl = Number(s?.total_latas ?? 0);
  if (tl > 0) return tl;
  return Math.round(Number(s?.cantidad_cajas ?? 0) * Math.max(1, empaque));
}

/** "2 cajas + 29 latas" a partir de latas totales. */
export function desgloseLatas(totalLatas: number, empaque = 48): string {
  const emp = Math.max(1, Number(empaque) || 48);
  const t = Math.max(0, Math.round(Number(totalLatas) || 0));
  return `${Math.floor(t / emp)} cajas + ${t % emp} latas`;
}
