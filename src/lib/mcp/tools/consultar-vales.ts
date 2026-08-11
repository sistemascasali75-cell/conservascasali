import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "consultar_vales",
  title: "Consultar vales",
  description: "Consulta vales registrados y su seguimiento, con filtro por número o estado.",
  inputSchema: {
    nro_vale: z.string().trim().optional().describe("Filtro parcial por número de vale."),
    limite: z.number().int().min(1).max(200).default(50).describe("Máximo de filas."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ nro_vale, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase.from("vales").select("*").limit(limite ?? 50);
    if (nro_vale) q = q.ilike("nro_vale", `%${nro_vale}%`);
    const { data, error } = await q;
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data ?? []) }],
          structuredContent: { vales: data ?? [] },
        };
  },
});
