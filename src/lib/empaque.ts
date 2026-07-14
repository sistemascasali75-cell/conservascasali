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
