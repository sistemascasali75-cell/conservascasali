import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type SessionRole = "ADMIN" | "OPERADOR" | "VISITA" | "INSUMOS" | null;

export const ROLE_SESSION_KEY = "role-verified-v1";

export function getSessionRole(): SessionRole {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROLE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed?.role ?? null) as SessionRole;
  } catch {
    return null;
  }
}

export function useSessionRole(): SessionRole {
  const [role, setRole] = useState<SessionRole>(() => getSessionRole());
  useEffect(() => {
    const handler = () => setRole(getSessionRole());
    handler();
    window.addEventListener("storage", handler);
    window.addEventListener("focus", handler);
    window.addEventListener("role-verified-changed", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("focus", handler);
      window.removeEventListener("role-verified-changed", handler);
    };
  }, []);
  return role;
}


export function useIsReadOnly() {
  const r = useSessionRole();
  return r === "VISITA" || r === "INSUMOS";
}

/* ============== Read-only guard (monkey-patch supabase) ==============
   VISITA  → todas las escrituras bloqueadas.
   INSUMOS → solo puede escribir en tablas/RPC del módulo de insumos. */

let installed = false;

const READ_RPCS = new Set<string>([
  "admin_list_users",
  "has_role",
  "is_supervisor_or_admin",
]);

// Whitelist de escritura para INSUMOS (control total del módulo Insumos)
const INSUMOS_WRITE_TABLES = new Set<string>([
  "insumos",
  "insumos_movimientos",
  "vista_insumos_movimientos",
  "lances_produccion",
  "lance_insumos",
  "vales",
]);
const INSUMOS_WRITE_RPCS = new Set<string>([
  "registrar_movimiento_insumo",
  "admin_editar_insumo_mov",
  "admin_eliminar_insumo_mov",
]);

const deniedResult = {
  data: null,
  error: { message: "Modo solo lectura: tu cuenta no puede modificar datos en esta sección.", name: "ReadOnly", code: "READ_ONLY" },
};

function makeDeniedThenable(): any {
  const target: any = function () {};
  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: any) => {
          toast.error(deniedResult.error.message);
          return Promise.resolve(resolve(deniedResult));
        };
      }
      if (prop === "catch" || prop === "finally") {
        return () => makeDeniedThenable();
      }
      return () => makeDeniedThenable();
    },
    apply() {
      return makeDeniedThenable();
    },
  };
  return new Proxy(target, handler);
}

export function installReadOnlyGuardIfNeeded() {
  if (installed) return;
  installed = true;

  // El guard se instala una sola vez, pero evalúa el rol EN CADA LLAMADA.
  // Así, si el usuario vuelve a autenticarse como ADMIN/OPERADOR en la misma
  // pestaña (sin recargar), las escrituras dejan de estar bloqueadas.
  const isBlocked = () => {
    const role = getSessionRole();
    return role === "VISITA" || role === "INSUMOS";
  };

  const origFrom = (supabase as any).from.bind(supabase);
  (supabase as any).from = (table: string) => {
    const builder = origFrom(table);
    if (!isBlocked()) return builder;
    const isInsumos = getSessionRole() === "INSUMOS";
    if (isInsumos && INSUMOS_WRITE_TABLES.has(table)) return builder;
    (["insert", "update", "upsert", "delete"] as const).forEach((m) => {
      const orig = (builder as any)[m].bind(builder);
      (builder as any)[m] = (...args: any[]) => {
        if (!isBlocked()) return orig(...args);
        if (getSessionRole() === "INSUMOS" && INSUMOS_WRITE_TABLES.has(table)) return orig(...args);
        toast.error(deniedResult.error.message);
        return makeDeniedThenable();
      };
    });
    return builder;
  };

  const origRpc = (supabase as any).rpc.bind(supabase);
  (supabase as any).rpc = (fn: string, ...rest: any[]) => {
    if (!isBlocked()) return origRpc(fn, ...rest);
    if (READ_RPCS.has(fn)) return origRpc(fn, ...rest);
    if (getSessionRole() === "INSUMOS" && INSUMOS_WRITE_RPCS.has(fn)) return origRpc(fn, ...rest);
    toast.error(deniedResult.error.message);
    return makeDeniedThenable();
  };
}

