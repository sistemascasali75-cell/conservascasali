import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTamanoConfig } from "@/lib/tamano";

interface Props {
  envase?: string | null;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  autoDefault?: boolean; // aplica default cuando cambia el envase y no hay valor
}

/**
 * Selector de "Tamaño". Muestra un dropdown con las opciones sugeridas para el
 * envase (o un input libre si el envase no tiene reglas). Auto-completa el valor
 * por defecto cuando cambia el envase y el valor está vacío.
 */
export function TamanoSelect({ envase, value, onChange, className, autoDefault = true }: Props) {
  const { options, defaultValue } = getTamanoConfig(envase);

  useEffect(() => {
    if (!autoDefault) return;
    if (!value && defaultValue) onChange(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envase]);

  if (options.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Tamaño (opcional)"
        className={className ?? "h-11"}
      />
    );
  }

  return (
    <Select value={value || defaultValue} onValueChange={onChange}>
      <SelectTrigger className={className ?? "h-11"}>
        <SelectValue placeholder="Seleccionar tamaño" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}{o === defaultValue ? " · por defecto" : ""}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
