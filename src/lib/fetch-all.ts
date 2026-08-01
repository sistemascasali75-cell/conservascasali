/**
 * Trae TODOS los registros de una consulta Supabase paginando de 1000 en 1000
 * (PostgREST limita cada respuesta a 1000 filas por defecto).
 *
 * Uso:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("vista_insumos_movimientos").select("*").range(from, to)
 *   );
 */
export async function fetchAllRows<T = any>(
  makeQuery: (from: number, to: number) => any,
  pageSize = 1000,
  maxRows = 100000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = (data ?? []) as T[];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return all;
}
