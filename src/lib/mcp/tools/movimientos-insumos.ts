import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "movimientos_insumos",
  title: "Movimientos de insumos",
  description:
    "Lista movimientos de insumos (ingresos y salidas) con su saldo, filtrables por insumo y rango de fechas.",
  inputSchema: {
    insumo: z.string().trim().optional().describe("Filtro parcial por nombre del insumo."),
    desde: z.string().trim().optional().describe("Fecha inicial YYYY-MM-DD."),
    hasta: z.string().trim().optional().describe("Fecha final YYYY-MM-DD."),
    limite: z.number().int().min(1).max(300).default(50).describe("Máximo de filas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ insumo, desde, hasta, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("vista_insumos_movimientos")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(limite ?? 50);
    if (insumo) q = q.ilike("nombre", `%${insumo}%`);
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
