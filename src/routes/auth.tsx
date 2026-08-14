import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Fish, ShieldCheck, Snowflake, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

export const ROLE_SESSION_KEY = "role-verified-v1";

const ROLE_PASSWORDS: Record<string, { password: string; label: string }> = {
  ADMIN: { password: "2026", label: "Administrador" },
  OPERADOR: { password: "o2026", label: "Operador" },
  INSUMOS: { password: "i2026", label: "Insumos" },
  VISITA: { password: "v2026", label: "Visita" },
};

function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"google" | "role">("google");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("ADMIN");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  // Detectar si ya hay sesión Google → pasar a paso de rol
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user) {
        // Si ya verificó rol en esta sesión del navegador → ir a la app
        if (sessionStorage.getItem(ROLE_SESSION_KEY)) {
          navigate({ to: "/" });
          return;
        }
        setUserEmail(data.user.email ?? null);
        setStep("role");
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email ?? null);
      setStep("role");
    } catch (e: any) {
      toast.error(e.message ?? "Error con Google");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cfg = ROLE_PASSWORDS[role];
    if (!cfg) return;
    if (password.trim() !== cfg.password) {
      toast.error("Contraseña de rol incorrecta");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc("claim_role_with_password", {
        p_role: role as any,
        p_password: password.trim(),
      });
      if (error) throw error;
      sessionStorage.setItem(
        ROLE_SESSION_KEY,
        JSON.stringify({ role, ts: Date.now() }),
      );
      window.dispatchEvent(new Event("role-verified-changed"));
      toast.success(`Bienvenido, ${cfg.label}`);
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo asignar el rol");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    sessionStorage.removeItem(ROLE_SESSION_KEY);
    window.dispatchEvent(new Event("role-verified-changed"));
    await supabase.auth.signOut();
    setStep("google");
    setUserEmail(null);
    setPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy via-slate-900 to-slate-950 p-4 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 size-96 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-32 size-96 bg-cyan-500/15 rounded-full blur-3xl" />

      <Card className="w-full max-w-md p-10 space-y-8 relative backdrop-blur-sm border-white/10">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="size-16 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/30">
            <Fish className="size-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AlmaConserva</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sistema de gestión de almacén frigorífico
            </p>
          </div>
        </div>

        {step === "google" ? (
          <div className="space-y-3">
            <Button
              type="button"
              className="w-full h-12 text-base gap-3 bg-white text-slate-900 hover:bg-slate-100"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" className="size-5">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
              </svg>
              {loading ? "Conectando…" : "Continuar con Google"}
            </Button>
            <p className="text-xs text-muted-foreground text-center px-4">
              Paso 1 de 2: identifícate con tu cuenta Google autorizada.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRoleSubmit} className="space-y-5">
            <div className="text-center text-sm text-muted-foreground">
              Conectado como <span className="text-foreground font-medium">{userEmail}</span>
              <br />
              <span className="text-xs">Paso 2 de 2: selecciona tu rol e ingresa la contraseña.</span>
            </div>

            <div className="space-y-2">
              <Label>Rol</Label>
              <RadioGroup value={role} onValueChange={setRole} className="grid grid-cols-2 gap-2">
                {Object.entries(ROLE_PASSWORDS).map(([key, cfg]) => (
                  <label
                    key={key}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 cursor-pointer transition ${
                      role === key
                        ? "border-primary bg-primary/10"
                        : "border-white/10 hover:border-white/20"
                    }`}
                  >
                    <RadioGroupItem value={key} className="sr-only" />
                    <span className="text-xs font-medium">{cfg.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-password">Contraseña de rol</Label>
              <Input
                id="role-password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Requerida"
                required
              />
            </div>

            <div className="space-y-2">
              <Button type="submit" className="w-full h-11">
                Ingresar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full h-9 text-xs gap-2"
                onClick={handleSignOut}
              >
                <LogOut className="size-3" /> Cambiar de cuenta Google
              </Button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Acceso seguro
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Snowflake className="size-4 text-cyan-400" />
            Trazabilidad total
          </div>
        </div>
      </Card>
    </div>
  );
}
