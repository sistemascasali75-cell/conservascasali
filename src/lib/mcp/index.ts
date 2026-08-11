import { auth, defineMcp } from "@lovable.dev/mcp-js";
import buscarProductos from "./tools/buscar-productos";
import stockLotes from "./tools/stock-lotes";
import stockInsumos from "./tools/stock-insumos";
import movimientosInsumos from "./tools/movimientos-insumos";
import movimientosAlmacen from "./tools/movimientos-almacen";
import lancesProduccion from "./tools/lances-produccion";
import consultarVales from "./tools/consultar-vales";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "almacen-conservas-final",
  title: "Almacen Conservas final",
  version: "0.1.0",
  instructions:
    "Herramientas de solo lectura del WMS AlmaConserva: stock de lotes de conservas, stock y movimientos de insumos, movimientos de almacén, lances de producción y vales. Actúan como el usuario conectado, respetando sus permisos.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    buscarProductos,
    stockLotes,
    stockInsumos,
    movimientosInsumos,
    movimientosAlmacen,
    lancesProduccion,
    consultarVales,
  ],
});
