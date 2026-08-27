import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  Factory,
  ArrowUpFromLine,
  Shuffle,
  Settings,
  Fish,
  LogOut,
  Grid3x3,
  AlertTriangle,
  FileLock2,
  BookOpen,
  CalendarClock,
  DollarSign,
  Truck,
  Tag,
  ShieldCheck,
  ClipboardList,
  BarChart3,
  ShieldAlert,
  Upload,
  Boxes,
  Users,
  Activity,
  History,
  FileText,
  ShoppingCart,
  Receipt,
  FileOutput,
  Store,
  ChevronDown,
  Layers,
  Beaker,
  ShoppingBag,
  LineChart,
  Cog,
  Eye,
  Menu,
  X,
  Ticket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/global-search";
import { useRoles } from "@/hooks/use-role";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionRole, installReadOnlyGuardIfNeeded } from "@/lib/session-role";


type Item = { to: string; label: string; icon: any; roles?: ("ADMIN" | "OPERADOR" | "VISITA" | "INSUMOS")[]; section: string; operador?: boolean };

const SECTIONS = [
  { key: "General", label: "General", icon: LayoutDashboard },
  { key: "Operaciones", label: "Operaciones", icon: Layers },
  { key: "Insumos", label: "Insumos", icon: Beaker },
  { key: "Ventas", label: "Ventas", icon: ShoppingBag },
  { key: "Reportes", label: "Reportes", icon: LineChart },
  { key: "Gestión", label: "Gestión", icon: Cog },
] as const;

// operador: true → visible para rol OPERADOR exclusivo (sin ADMIN).
const items: Item[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, section: "General", operador: true },
  { to: "/inventario", label: "Inventario", icon: Package, section: "General", operador: true },
  { to: "/mapa", label: "Mapa de almacén", icon: Grid3x3, section: "General", operador: true },
  { to: "/kardex", label: "Kardex", icon: BookOpen, section: "General", operador: true },

  { to: "/entrada", label: "Registrar Entrada", icon: ArrowDownToLine, section: "Operaciones", operador: true },
  { to: "/salida", label: "Registrar Salida", icon: ArrowUpFromLine, section: "Operaciones", operador: true },
  { to: "/traslado", label: "Traslado", icon: Shuffle, section: "Operaciones", operador: true },
  { to: "/muestreo", label: "Muestreo", icon: Beaker, section: "Operaciones", operador: true },
  { to: "/etiquetado", label: "Etiquetado", icon: Tag, section: "Operaciones", operador: true },
  { to: "/certificacion", label: "Certificación", icon: ShieldCheck, section: "Operaciones", operador: true },
  { to: "/mermas", label: "Mermas y Ajustes", icon: AlertTriangle, section: "Operaciones", roles: ["ADMIN", "OPERADOR"], operador: true },
  { to: "/inventario-fisico", label: "Toma de inventario", icon: ClipboardList, section: "Operaciones", operador: true },
  { to: "/control-vales", label: "Control de vales", icon: Ticket, section: "Operaciones", operador: true },

  { to: "/insumos", label: "Stock de insumos", icon: Boxes, section: "Insumos" },
  { to: "/insumos/mapa", label: "Mapa de insumos", icon: Grid3x3, section: "Insumos" },
  { to: "/insumos/movimientos", label: "Movimientos insumos", icon: Shuffle, section: "Insumos" },
  { to: "/insumos/reportes", label: "Reportes insumos", icon: BarChart3, section: "Insumos" },
  { to: "/insumos/control", label: "Control insumos", icon: ClipboardList, section: "Insumos", roles: ["ADMIN", "INSUMOS"] },
  { to: "/lance-produccion", label: "Lance de Producción", icon: Factory, section: "Insumos" },
  { to: "/insumos/catalogo", label: "Catálogo insumos", icon: Settings, section: "Insumos", roles: ["ADMIN", "OPERADOR", "INSUMOS"] },

  { to: "/ventas", label: "Panel de ventas", icon: Store, section: "Ventas" },
  { to: "/ventas/cotizaciones", label: "Cotizaciones", icon: FileText, section: "Ventas" },
  { to: "/ventas/ordenes", label: "Órdenes de compra", icon: ShoppingCart, section: "Ventas" },
  { to: "/ventas/facturas", label: "Facturas", icon: Receipt, section: "Ventas" },
  { to: "/ventas/guias", label: "Guías de salida", icon: FileOutput, section: "Ventas" },

  { to: "/reportes", label: "Panel de reportes", icon: BarChart3, section: "Reportes", operador: true },
  { to: "/reportes/analitica", label: "Analítica avanzada", icon: BarChart3, section: "Reportes" },
  { to: "/reportes/vencimientos", label: "Vencimientos", icon: CalendarClock, section: "Reportes" },
  { to: "/reportes/valorizado", label: "Inv. valorizado", icon: DollarSign, section: "Reportes" },
  { to: "/reportes/despachos", label: "Despachos", icon: Truck, section: "Reportes" },
  { to: "/descargas", label: "Descargas", icon: Upload, section: "Reportes" },
  { to: "/auditoria", label: "Auditoría", icon: Activity, section: "Reportes" },
  { to: "/historial", label: "Historial", icon: History, section: "Reportes" },

  { to: "/warrants", label: "Warrants", icon: FileLock2, section: "Gestión", roles: ["ADMIN", "OPERADOR"], operador: true },
  { to: "/catalogos", label: "Catálogos", icon: Settings, section: "Gestión", roles: ["ADMIN", "OPERADOR"], operador: true },
  { to: "/importar", label: "Importar datos", icon: Upload, section: "Gestión", roles: ["ADMIN", "OPERADOR"] },
  { to: "/admin", label: "Panel administrativo", icon: ShieldAlert, section: "Gestión", roles: ["ADMIN"] },
  { to: "/control-total", label: "Control total (tablas)", icon: Cog, section: "Gestión", roles: ["ADMIN"] },
  { to: "/usuarios", label: "Control de usuarios", icon: Users, section: "Gestión", roles: ["ADMIN"] },
];


const OPEN_KEY = "sidebar-open-sections-v2";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { roles, isAdmin, isOperador } = useRoles();
  const sessionRole = useSessionRole();
  const isVisita = sessionRole === "VISITA";
  const isInsumosSession = sessionRole === "INSUMOS";
  const isOperadorOnly = isOperador && !isAdmin;
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    installReadOnlyGuardIfNeeded();
  }, [sessionRole]);

  // Realtime: cualquier cambio en tablas de stock/movimientos invalida las
  // queries de todas las pantallas (Inventario, Mapa, Kardex, Reportes…).
  const qc = useQueryClient();
  useEffect(() => {
    const invalidate = () => qc.invalidateQueries();
    const ch = supabase
      .channel("realtime-stock")
      .on("postgres_changes", { event: "*", schema: "public", table: "movimientos" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_lote_ubicacion" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "lotes" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const handleSignOut = async () => {
    sessionStorage.removeItem("role-verified-v1");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const visible = useMemo(
    () => items.filter((it) => {
      if (isInsumosSession && (it.section === "Ventas" || it.section === "Gestión")) return false;
      // Rol OPERADOR (exclusivo): sólo módulos General, Operaciones, Panel de reportes, Catálogos y Warrants
      if (isOperadorOnly && !it.operador) return false;
      return !it.roles || it.roles.some((r) => roles.includes(r));
    }),
    [roles, isInsumosSession, isOperadorOnly],
  );


  const activeSection = useMemo(() => {
    const match = visible.find((it) => {
      const exact = it.to === "/" || it.to === "/reportes" || it.to === "/insumos" || it.to === "/ventas";
      return exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");
    });
    return match?.section ?? "General";
  }, [pathname, visible]);

  const [openSection, setOpenSection] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(OPEN_KEY);
    } catch {
      return null;
    }
  });

  // Ensure active section is open
  useEffect(() => {
    setOpenSection((cur) => (cur === activeSection ? cur : activeSection));
  }, [activeSection]);

  useEffect(() => {
    try {
      if (openSection) sessionStorage.setItem(OPEN_KEY, openSection);
      else sessionStorage.removeItem(OPEN_KEY);
    } catch {}
  }, [openSection]);

  const toggle = (k: string) => setOpenSection((cur) => (cur === k ? null : k));


  const isItemActive = (to: string) => {
    const exact = to === "/" || to === "/reportes" || to === "/insumos" || to === "/ventas";
    return exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border relative overflow-hidden">
        {/* Ambient gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 60% at 0% 0%, color-mix(in oklab, var(--sidebar-primary) 22%, transparent) 0%, transparent 55%), radial-gradient(80% 40% at 100% 100%, color-mix(in oklab, var(--sidebar-primary) 12%, transparent) 0%, transparent 60%)",
          }}
        />
        <div className="relative z-10 flex items-center gap-3 px-5 py-5 border-b border-sidebar-border/60 backdrop-blur">
          <div className="size-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-sidebar-primary/60 flex items-center justify-center shadow-lg shadow-sidebar-primary/30 ring-1 ring-white/10">
            <Fish className="size-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <div className="font-bold tracking-tight text-[15px] leading-tight">AlmaConserva</div>
            <div className="text-[10px] uppercase opacity-60 tracking-[0.18em] mt-0.5">Warehouse Suite</div>
          </div>
        </div>

        <nav className="relative z-10 flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {SECTIONS.map(({ key, label, icon: SectionIcon }) => {
            const sectionItems = visible.filter((it) => it.section === key);
            if (sectionItems.length === 0) return null;
            const isOpen = openSection === key;
            const isActiveSection = activeSection === key;
            return (
              <div key={key} className="group/section">
                <button
                  onClick={() => toggle(key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-wider transition-all",
                    isActiveSection
                      ? "bg-sidebar-accent/70 text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                  )}
                  aria-expanded={isOpen}
                >
                  <span
                    className={cn(
                      "size-7 rounded-md flex items-center justify-center transition-colors",
                      isActiveSection
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/30"
                        : "bg-sidebar-accent/60 text-sidebar-foreground/80",
                    )}
                  >
                    <SectionIcon className="size-4" />
                  </span>
                  <span className="flex-1 text-left text-[11px]">{label}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 opacity-60 transition-transform duration-300",
                      isOpen && "rotate-180",
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="overflow-hidden mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="ml-4 pl-3 border-l border-sidebar-border/60 space-y-0.5 py-1">
                      {sectionItems.map((it) => {
                        const active = isItemActive(it.to);
                        return (
                          <Link
                            key={it.to}
                            to={it.to}
                            className={cn(
                              "group relative flex items-center gap-2.5 pl-3 pr-3 py-2 rounded-md text-[13px] font-medium transition-all",
                              active
                                ? "bg-gradient-to-r from-sidebar-primary to-sidebar-primary/70 text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/25"
                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground hover:translate-x-0.5",
                            )}
                          >
                            {active && (
                              <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-full bg-sidebar-primary" />
                            )}
                            <it.icon className={cn("size-4 shrink-0", active ? "" : "opacity-70")} />
                            <span className="truncate">{it.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

            );
          })}
        </nav>

        <div className="relative z-10 border-t border-sidebar-border/60 px-4 py-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="opacity-60 uppercase tracking-wider">Rol</span>
            <span className="font-semibold px-2 py-0.5 rounded-md bg-sidebar-accent/60 text-sidebar-foreground">
              {roles.length > 0 ? roles.join(", ") : "—"}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="relative z-10 flex items-center gap-3 px-5 py-3.5 text-sm border-t border-sidebar-border/60 hover:bg-sidebar-accent/60 transition-colors"
        >
          <LogOut className="size-4" />
          Cerrar sesión
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="size-10 rounded-lg bg-sidebar-accent/60 flex items-center justify-center active:scale-95 transition"
            aria-label="Menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="size-9 rounded-lg bg-gradient-to-br from-sidebar-primary to-sidebar-primary/60 flex items-center justify-center shadow-md">
            <Fish className="size-4 text-sidebar-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm leading-tight truncate">AlmaConserva</div>
            <div className="text-[10px] uppercase opacity-60 tracking-wider">
              {isOperadorOnly ? "Modo Operador" : roles[0] ?? "—"}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="size-10 rounded-lg bg-sidebar-accent/60 flex items-center justify-center active:scale-95 transition"
            aria-label="Salir"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        {!isOperadorOnly && (
          <nav className="flex gap-1 px-2 pb-2 overflow-x-auto">
            {visible.map((it) => {
              const active = isItemActive(it.to);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs whitespace-nowrap",
                    active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-sidebar-accent/40",
                  )}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Drawer móvil: grid de botones grandes (rol Operador exclusivo lo aprovecha) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center gap-3 px-4 py-4 border-b bg-sidebar text-sidebar-foreground">
            <div className="size-10 rounded-xl bg-gradient-to-br from-sidebar-primary to-sidebar-primary/60 flex items-center justify-center shadow-lg">
              <Fish className="size-5 text-sidebar-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">AlmaConserva</div>
              <div className="text-[11px] uppercase opacity-70 tracking-wider">
                {isOperadorOnly ? "Panel Operador · móvil" : "Menú"}
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="size-10 rounded-lg bg-sidebar-accent/60 flex items-center justify-center active:scale-95"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {SECTIONS.map(({ key, label, icon: SectionIcon }) => {
              const sectionItems = visible.filter((it) => it.section === key);
              if (sectionItems.length === 0) return null;
              return (
                <section key={key}>
                  <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                    <SectionIcon className="size-4" />
                    {label}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {sectionItems.map((it) => {
                      const active = isItemActive(it.to);
                      return (
                        <Link
                          key={it.to}
                          to={it.to}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "relative flex flex-col items-start gap-3 rounded-2xl p-4 min-h-[110px] border transition-all active:scale-[0.97]",
                            active
                              ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground border-primary/40 shadow-lg shadow-primary/25"
                              : "bg-card border-border hover:border-primary/40",
                          )}
                        >
                          <div
                            className={cn(
                              "size-11 rounded-xl flex items-center justify-center",
                              active
                                ? "bg-white/20 text-primary-foreground"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            <it.icon className="size-5" />
                          </div>
                          <div className="text-sm font-semibold leading-tight">
                            {it.label}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="border-t p-3 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Rol: <strong className="text-foreground">{roles.join(", ") || "—"}</strong>
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive font-medium active:scale-95"
            >
              <LogOut className="size-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}


      <main className={cn("flex-1 min-w-0 md:pt-0", isOperadorOnly ? "pt-16" : "pt-24")}>
        <div className="hidden md:flex items-center gap-3 px-8 py-3 border-b bg-background sticky top-0 z-10">
          <GlobalSearch />
        </div>
        {isVisita && (
          <div className="bg-amber-500/15 border-b border-amber-500/40 text-amber-900 dark:text-amber-200 px-4 md:px-8 py-2 flex items-center gap-2 text-sm font-medium">
            <Eye className="size-4" />
            Modo VISITA · solo lectura. No es posible crear, editar ni eliminar registros.
          </div>
        )}
        {isInsumosSession && (
          <div className="bg-emerald-500/15 border-b border-emerald-500/40 text-emerald-900 dark:text-emerald-200 px-4 md:px-8 py-2 flex items-center gap-2 text-sm font-medium">
            <Eye className="size-4" />
            Modo INSUMOS · control total del módulo Insumos. El resto del sistema es solo lectura.
          </div>
        )}
        <div className="p-4 md:p-8">{children}</div>
      </main>

    </div>
  );
}
