import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "buscar_productos",
  title: "Buscar productos",
  description: "Busca productos del catálogo por texto en su descripción o código.",
  inputSchema: {
    texto: z.string().trim().min(1).describe("Texto a buscar en descripción o código del producto."),
    limite: z.number().int().min(1).max(100).default(20).describe("Máximo de resultados."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ texto, limite }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "No autenticado" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .or(`descripcion.ilike.%${texto}%,codigo.ilike.%${texto}%`)
      .limit(limite ?? 20);
    return error
      ? { content: [{ type: "text", text: error.message }], isError: true }
      : {
          content: [{ type: "text", text: JSON.stringify(data ?? []) }],
          structuredContent: { productos: data ?? [] },
        };
  },
});
