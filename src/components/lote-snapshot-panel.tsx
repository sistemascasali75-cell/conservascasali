import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

interface LoteSnapshot {
  estado?: string | null;
  mercado?: string | null;
  etiqueta?: string | null;
  certificadora?: string | null;
  fecha_certificacion?: string | null;
}

interface Props {
  lote?: LoteSnapshot | null;
  warrantsActivos?: number;
  showWarrant?: boolean;
}

export function LoteSnapshotPanel({ lote, warrantsActivos = 0, showWarrant = true }: Props) {
  if (!lote) return null;
  const tieneEtiqueta = !!lote.etiqueta && lote.etiqueta !== "S/E";
  const tieneWarrant = warrantsActivos > 0;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <Field label="Estado">
        <Badge variant="secondary">{lote.estado ?? "—"}</Badge>
      </Field>
      <Field label="Mercado">
        <Badge variant="outline">{lote.mercado ?? "—"}</Badge>
      </Field>
      <Field label="Certificación">
        <span className="text-foreground">
          {lote.certificadora ? lote.certificadora : "—"}
          {lote.fecha_certificacion ? ` · ${lote.fecha_certificacion}` : ""}
        </span>
      </Field>
      <Field label="Etiqueta">
        <CheckRow on={tieneEtiqueta} text={lote.etiqueta ?? "Sin etiqueta"} />
      </Field>
      {showWarrant && (
        <Field label="Warrant activo">
          <CheckRow on={tieneWarrant} text={tieneWarrant ? `${warrantsActivos} cajas comprometidas` : "Sin warrant"} />
        </Field>
      )}
    </div>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function CheckRow({ on, text }: { on: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center justify-center size-5 rounded ${on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
        {on ? <Check className="size-3" /> : <X className="size-3" />}
      </span>
      <span className="text-xs">{text}</span>
    </div>
  );
}
