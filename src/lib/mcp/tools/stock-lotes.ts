import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "stock_lotes",
  title: "Stock por lote",
  description:
    "Consulta el stock actual de conservas por lote (cajas disponibles), con filtro opcional por código de lote.",
  inputSchema: {
    codigo_lote: z.string().trim().optional().describe("Filtro parcial por código de lote."),
    limite: z.number().int().min(1).max(200).default(50).describe("Máximo de filas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ codigo_lote, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase.from("v_stock_lote").select("*").limit(limite ?? 50);
    if (codigo_lote) q = q.ilike("codigo_lote", `%${codigo_lote}%`);
    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data ?? []) }],
          structuredContent: { stock: data ?? [] },
        };
  },
});
