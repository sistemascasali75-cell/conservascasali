import { Badge } from "@/components/ui/badge";

const COLORS: Record<string, string> = {
  BORRADOR: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  ENVIADA: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  ACEPTADA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  RECHAZADA: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  VENCIDA: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  CONVERTIDA: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  PENDIENTE: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  RESERVADA: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  PARCIAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  FACTURADA: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  DESPACHADA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  ANULADA: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  EMITIDA: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  PAGADA: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
};

export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const e = estado ?? "—";
  return <Badge variant="outline" className={COLORS[e] ?? "bg-muted"}>{e}</Badge>;
}
