import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type OAuthResult = {
  data?: {
    client?: { name?: string } | null;
    redirect_url?: string | null;
    redirect_to?: string | null;
  } | null;
  error?: { message: string } | null;
};

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Falta authorization_id");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { needsAuth: true as const, details: null };
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return { needsAuth: false as const, details: data ?? null };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <p className="text-sm text-muted-foreground">
        No se pudo cargar la solicitud de autorización: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const { needsAuth, details } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("El servidor de autorización no devolvió una URL de retorno.");
      return;
    }
    window.location.href = target;
  }

  async function signIn() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.href,
      });
      if (result.error) throw result.error;
    } catch (e) {
      setBusy(false);
      setError((e as Error).message ?? "No se pudo iniciar sesión");
    }
  }

  const clientName = details?.client?.name ?? "la aplicación";

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">
          {needsAuth ? "Inicia sesión para continuar" : `Conectar ${clientName}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {needsAuth
            ? "Debes identificarte con tu cuenta autorizada antes de aprobar esta conexión."
            : `${clientName} podrá consultar los datos de AlmaConserva actuando como tu usuario, con tus mismos permisos.`}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {needsAuth ? (
          <Button className="w-full" disabled={busy} onClick={signIn}>
            Continuar con Google
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
              Aprobar
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => decide(false)}
            >
              Rechazar
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}
