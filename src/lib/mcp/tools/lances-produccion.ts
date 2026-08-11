import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "lances_produccion",
  title: "Lances de producción",
  description:
    "Lista lances de producción con sus cajas/latas proyectadas, reales y envasadas, y los insumos consumidos.",
  inputSchema: {
    desde: z.string().trim().optional().describe("Fecha inicial YYYY-MM-DD."),
    hasta: z.string().trim().optional().describe("Fecha final YYYY-MM-DD."),
    estado: z.enum(["BORRADOR", "COMPLETO"]).optional().describe("Estado del lance."),
    limite: z.number().int().min(1).max(100).default(20).describe("Máximo de lances."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ desde, hasta, estado, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("lances_produccion")
      .select("*, lance_insumos(*)")
      .order("fecha", { ascending: false })
      .limit(limite ?? 20);
    if (desde) q = q.gte("fecha", desde);
    if (hasta) q = q.lte("fecha", hasta);
    if (estado) q = q.eq("estado", estado);
    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data ?? []) }],
          structuredContent: { lances: data ?? [] },
        };
  },
});
