import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Catálogos y datos del WMS rara vez cambian dentro de una sesión;
        // mantener resultados frescos durante 60s reduce roundtrips visibles.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload on hover/focus → navegación percibida casi instantánea.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultPreloadDelay: 30,
  });

  return router;
};
