import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "ADMIN" | "OPERADOR" | "VISITA" | "INSUMOS";

export function useRoles() {
  const { data, isLoading } = useQuery({
    queryKey: ["mi-rol"],
    queryFn: async (): Promise<AppRole[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      return (rows ?? []).map((r) => r.role as AppRole);
    },
  });
  const roles = data ?? [];
  return {
    roles,
    isLoading,
    isAdmin: roles.includes("ADMIN"),
    isOperador: roles.includes("OPERADOR"),
    isVisita: roles.includes("VISITA"),
    isInsumos: roles.includes("INSUMOS"),
    // Aliases retro-compatibles
    isSupervisor: roles.includes("OPERADOR"),
    isAlmacenero: roles.includes("VISITA"),
    canManageCatalogs: roles.includes("ADMIN") || roles.includes("OPERADOR"),
    // Control total del módulo Insumos (catálogo, movimientos, lances, vales)
    canManageInsumos:
      roles.includes("ADMIN") || roles.includes("OPERADOR") || roles.includes("INSUMOS"),
    canApprove: roles.includes("ADMIN") || roles.includes("OPERADOR"),
    has: (r: AppRole) => roles.includes(r),
    hasAny: (rs: AppRole[]) => rs.some((r) => roles.includes(r)),
  };
}
