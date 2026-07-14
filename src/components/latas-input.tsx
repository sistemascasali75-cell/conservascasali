import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Boxes, Package, Calculator } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LatasInputProps {
  /** Total de latas (fuente de verdad). */
  totalLatas: number | "";
  onChange: (totalLatas: number | "") => void;
  empaque?: number;
  /** Opcional: máximo permitido (para validar stock). */
  max?: number | null;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  /** @deprecated ahora siempre se muestran ambos campos */
  allowCajasInput?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  showBreakdown?: boolean;
}

/**
 * Input dinámico bidireccional en LATAS TOTALES.
 * Al hacer foco/click en Cantidad, se activan las casillas virtuales de
 * CAJAS y LATAS. Editar cualquiera de los tres campos recalcula los otros
 * en tiempo real. Fuente de verdad: total_latas = cajas * empaque + latas.
 */
export function LatasInput({
  totalLatas,
  onChange,
  empaque = 48,
  max = null,
  disabled = false,
  autoFocus = false,
  placeholder = "Total de latas",
  className = "",
  size = "md",
  showBreakdown = true,
}: LatasInputProps) {
  const emp = Math.max(1, empaque || 48);
  const total = typeof totalLatas === "number" ? totalLatas : 0;
  const derivedCajas = Math.floor(total / emp);
  const derivedLatas = total % emp;

  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<"total" | "cajas" | "latas" | null>(null);
  const [cajasStr, setCajasStr] = useState(total ? String(derivedCajas) : "");
  const [latasStr, setLatasStr] = useState(total ? String(derivedLatas) : "");
  const rootRef = useRef<HTMLDivElement>(null);

  // Sincroniza los sub-campos cuando el total cambia desde afuera
  // o cuando el usuario está editando el total directamente.
  useEffect(() => {
    if (focus === "cajas" || focus === "latas") return;
    if (total === 0 && totalLatas === "") {
      setCajasStr("");
      setLatasStr("");
    } else {
      setCajasStr(String(derivedCajas));
      setLatasStr(String(derivedLatas));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalLatas, empaque]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!expanded) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setExpanded(false);
        setFocus(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [expanded]);

  const excedeMax = max != null && total > max;

  const inputBase =
    size === "lg"
      ? "h-12 text-lg font-bold"
      : size === "sm"
      ? "h-9"
      : "h-11 text-base font-semibold";

  const commitTotal = (raw: string) => {
    if (raw === "") return onChange("");
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    onChange(n);
  };

  const commitCajasLatas = (c: string, l: string) => {
    const cNum = c.trim() === "" ? 0 : Math.max(0, Number.parseInt(c, 10) || 0);
    const lNum = l.trim() === "" ? 0 : Math.max(0, Number.parseInt(l, 10) || 0);
    const nuevo = cNum * emp + lNum;
    if (c === "" && l === "") onChange("");
    else onChange(nuevo);
  };

  return (
    <div ref={rootRef} className={cn("space-y-2", className)}>
      {/* Casilla principal: TOTAL DE LATAS */}
      <div
        className={cn(
          "rounded-lg border transition-all",
          expanded
            ? "border-primary/60 ring-2 ring-primary/20 bg-primary/5"
            : "border-input",
          excedeMax && "border-destructive/70 ring-2 ring-destructive/20",
        )}
      >
        <div className="p-2">
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={totalLatas}
            onChange={(e) => commitTotal(e.target.value)}
            onFocus={() => {
              setExpanded(true);
              setFocus("total");
            }}
            onClick={() => setExpanded(true)}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            className={cn(inputBase, "border-0 shadow-none focus-visible:ring-0 bg-transparent px-2")}
          />
        </div>

        {/* Casillas virtuales de CAJAS + LATAS (se activan al hacer click) */}
        {expanded && !disabled && (
          <div className="border-t bg-background/60 backdrop-blur px-3 py-3 rounded-b-lg animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              <Calculator className="size-3" />
              <span>Casillas virtuales · escribe cajas o latas y se suma automáticamente</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-end gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mb-1">
                  <Boxes className="size-3" /> Cajas
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={cajasStr}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "");
                    setCajasStr(v);
                    commitCajasLatas(v, latasStr);
                  }}
                  onFocus={() => setFocus("cajas")}
                  onBlur={() => setFocus(null)}
                  placeholder="0"
                  className={cn(
                    inputBase,
                    "text-center tabular-nums",
                    focus === "cajas" && "ring-2 ring-primary/40",
                  )}
                />
                <div className="text-[10px] text-muted-foreground text-center mt-0.5">
                  × {emp} = {formatNumber((Number.parseInt(cajasStr, 10) || 0) * emp, 0)}
                </div>
              </div>
              <div className="pb-3 text-lg font-bold text-muted-foreground">+</div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mb-1">
                  <Package className="size-3" /> Latas sueltas
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={latasStr}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, "");
                    setLatasStr(v);
                    commitCajasLatas(cajasStr, v);
                  }}
                  onFocus={() => setFocus("latas")}
                  onBlur={() => setFocus(null)}
                  placeholder="0"
                  className={cn(
                    inputBase,
                    "text-center tabular-nums",
                    focus === "latas" && "ring-2 ring-primary/40",
                  )}
                />
                <div className="text-[10px] text-muted-foreground text-center mt-0.5">
                  0 – ∞
                </div>
              </div>
              <div className="pb-3 text-lg font-bold text-muted-foreground">=</div>
              <div className="pb-1 text-right">
                <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total</div>
                <div
                  className={cn(
                    "font-black tabular-nums leading-none",
                    size === "lg" ? "text-2xl" : "text-xl",
                    excedeMax ? "text-destructive" : "text-primary",
                  )}
                >
                  {formatNumber(total, 0)}
                </div>
                <div className="text-[10px] text-muted-foreground">latas</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showBreakdown && (
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <Badge
            variant={excedeMax ? "destructive" : "outline"}
            className="border-primary/40 bg-primary/10 text-primary font-semibold"
          >
            {formatNumber(total, 0)} latas
          </Badge>
          <span className="text-muted-foreground">=</span>
          <Badge variant="secondary" className="gap-1">
            <Boxes className="size-3" /> {formatNumber(derivedCajas, 0)} cajas
          </Badge>
          <span className="text-muted-foreground">+</span>
          <Badge variant="secondary" className="gap-1">
            <Package className="size-3" /> {derivedLatas} latas
          </Badge>
          <span className="text-muted-foreground/70">· ×{emp}</span>
          {excedeMax && (
            <Badge variant="destructive" className="text-[10px]">
              Excede stock ({formatNumber(max ?? 0, 0)})
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Muestra un total de latas con desglose en cajas + latas residuo.
 */
export function LatasDisplay({
  total,
  empaque = 48,
  size = "md",
  inline = false,
}: {
  total: number | null | undefined;
  empaque?: number | null;
  size?: "sm" | "md" | "lg";
  inline?: boolean;
}) {
  const emp = Math.max(1, empaque || 48);
  const t = Number(total ?? 0);
  const cajas = Math.floor(t / emp);
  const residuo = t % emp;
  const bigCls =
    size === "lg" ? "text-2xl font-bold" : size === "sm" ? "text-sm font-semibold" : "text-base font-bold";
  const subCls = size === "lg" ? "text-xs" : "text-[11px]";

  if (inline) {
    return (
      <span className="inline-flex items-baseline gap-1.5">
        <span className={bigCls + " tabular-nums"}>{formatNumber(t, 0)}</span>
        <span className="text-xs text-muted-foreground">latas</span>
        <span className="text-[11px] text-muted-foreground/80">
          ({cajas}c + {residuo}l)
        </span>
      </span>
    );
  }

  return (
    <div className="leading-tight">
      <div className={bigCls + " tabular-nums"}>
        {formatNumber(t, 0)} <span className="text-xs font-normal text-muted-foreground">latas</span>
      </div>
      <div className={subCls + " text-muted-foreground tabular-nums"}>
        {formatNumber(cajas, 0)} cajas + {residuo} latas · ×{emp}
      </div>
    </div>
  );
}

/** Helper: convierte cantidad de latas a { cajas, latas } */
export function splitLatas(totalLatas: number, empaque: number): { cajas: number; latas: number } {
  const emp = Math.max(1, empaque || 48);
  const t = Math.max(0, Math.floor(totalLatas || 0));
  return { cajas: Math.floor(t / emp), latas: t % emp };
}
