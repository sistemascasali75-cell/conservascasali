import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type SearchSelectOption = {
  value: string;
  label: string;
  /** Short secondary line (e.g. descripcion) */
  description?: string;
  /** Key:value chips shown under the row (codigo, especie, stock, etc.) */
  meta?: Array<{ label: string; value: React.ReactNode }>;
  /** Optional left badge (e.g. ★ FEFO) */
  badge?: React.ReactNode;
  /** Extra text used by the search filter but not rendered */
  searchText?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** If true, allow clearing via empty option row */
  allowClear?: boolean;
};

export function SearchSelect({
  value,
  onValueChange,
  options,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados",
  disabled,
  className,
  triggerClassName,
  allowClear,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "h-11 w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate text-left">
            {selected ? (
              <span className="inline-flex items-center gap-2">
                {selected.badge}
                <span className="font-medium">{selected.label}</span>
                {selected.description && (
                  <span className="text-muted-foreground hidden sm:inline">
                    — {selected.description}
                  </span>
                )}
              </span>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "p-0 w-[--radix-popover-trigger-width] min-w-[280px]",
          className,
        )}
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            const opt = options.find((o) => o.value === itemValue);
            if (!opt) return 0;
            const haystack = [
              opt.label,
              opt.description,
              opt.searchText,
              ...(opt.meta?.map((m) => `${m.label} ${m.value}`) ?? []),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-4 shrink-0 opacity-50" />
            <CommandInput
              placeholder={searchPlaceholder}
              className="h-10 border-0 focus:ring-0"
            />
          </div>
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange("");
                    setOpen(false);
                  }}
                  className="text-muted-foreground italic"
                >
                  — Limpiar selección —
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  onSelect={(v) => {
                    onValueChange(v);
                    setOpen(false);
                  }}
                  className="flex flex-col items-start gap-1 py-2.5"
                >
                  <div className="flex w-full items-center gap-2">
                    {opt.badge}
                    <span className="font-medium truncate">{opt.label}</span>
                    <Check
                      className={cn(
                        "ml-auto size-4 shrink-0",
                        value === opt.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </div>
                  {opt.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {opt.description}
                    </div>
                  )}
                  {opt.meta && opt.meta.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {opt.meta.map((m, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                        >
                          <span className="opacity-70">{m.label}:</span>
                          <span className="font-mono text-foreground normal-case tracking-normal">
                            {m.value}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
