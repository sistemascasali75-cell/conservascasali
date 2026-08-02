import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const isInsumosQuery = (queryKey: readonly unknown[]) => {
  const root = String(queryKey[0] ?? "");
  return root.startsWith("insumo") || root === "vales-movs" || root === "ctrl-rows";
};

export function useInsumosRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({
        predicate: (query) => isInsumosQuery(query.queryKey),
      });
    };

    const channel = supabase
      .channel("insumos-saldos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "insumos_movimientos" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "insumos" },
        refresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}