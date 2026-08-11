import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "stock_insumos",
  title: "Stock de insumos",
  description: "Consulta el saldo actual de insumos (tapas, envases, cartón, etc.).",
  inputSchema: {
    texto: z.string().trim().optional().describe("Filtro parcial por nombre del insumo."),
    limite: z.number().int().min(1).max(200).default(100).describe("Máximo de filas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ texto, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase.from("vista_insumos_stock").select("*").limit(limite ?? 100);
    if (texto) q = q.ilike("nombre", `%${texto}%`);
    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data ?? []) }],
          structuredContent: { insumos: data ?? [] },
        };
  },
});
