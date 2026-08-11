import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "movimientos_almacen",
  title: "Movimientos de almacén",
  description:
    "Lista movimientos de almacén de conservas (entradas, salidas, traslados) con filtros por tipo, fechas y número de vale.",
  inputSchema: {
    tipo: z.string().trim().optional().describe("Tipo de movimiento, por ejemplo ENTRADA o SALIDA."),
    nro_vale: z.string().trim().optional().describe("Filtro parcial por número de vale."),
    desde: z.string().trim().optional().describe("Fecha inicial YYYY-MM-DD."),
    hasta: z.string().trim().optional().describe("Fecha final YYYY-MM-DD."),
    limite: z.number().int().min(1).max(300).default(50).describe("Máximo de filas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tipo, nro_vale, desde, hasta, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("movimientos")
      .select("*, lotes(codigo_lote, productos(descripcion))")
      .order("fecha", { ascending: false })
      .limit(limite ?? 50);
    if (tipo) q = q.eq("tipo", tipo.toUpperCase());
    if (nro_vale) q = q.ilike("nro_vale", `%${nro_vale}%`);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data ?? []) }],
          structuredContent: { movimientos: data ?? [] },
        };
  },
});
