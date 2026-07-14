import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Package, Tag, FileText, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Result =
  | { kind: "producto"; id: string; title: string; subtitle: string }
  | { kind: "lote"; id: string; title: string; subtitle: string }
  | { kind: "movimiento"; id: string; title: string; subtitle: string }
  | { kind: "cliente"; id: string; title: string; subtitle: string };

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const term = `%${q}%`;
      const [pr, lo, mo, cl] = await Promise.all([
        supabase.from("productos").select("id,codigo_base,descripcion").or(`codigo_base.ilike.${term},descripcion.ilike.${term}`).limit(6),
        supabase.from("lotes").select("id,codigo_lote").ilike("codigo_lote", term).limit(6),
        supabase.from("movimientos").select("id,lote_id,tipo,nro_guia,nro_vale").or(`nro_guia.ilike.${term},nro_vale.ilike.${term}`).limit(6),
        supabase.from("clientes_proveedores").select("id,nombre,documento,tipo").or(`nombre.ilike.${term},documento.ilike.${term}`).limit(6),
      ]);
      const r: Result[] = [
        ...(pr.data ?? []).map((p) => ({ kind: "producto" as const, id: p.id, title: p.descripcion, subtitle: p.codigo_base })),
        ...(lo.data ?? []).map((l) => ({ kind: "lote" as const, id: l.id, title: l.codigo_lote, subtitle: "Lote" })),
        ...(mo.data ?? []).map((m) => ({ kind: "movimiento" as const, id: m.id, title: `${m.tipo} · ${m.nro_guia ?? m.nro_vale ?? ""}`, subtitle: "Movimiento" })),
        ...(cl.data ?? []).map((c) => ({ kind: "cliente" as const, id: c.id, title: c.nombre, subtitle: `${c.tipo} · ${c.documento ?? ""}` })),
      ];
      setResults(r);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    if (r.kind === "lote") navigate({ to: "/kardex", search: { lote: r.id } as any });
    else if (r.kind === "producto") navigate({ to: "/kardex", search: { producto: r.id } as any });
    else if (r.kind === "movimiento") navigate({ to: "/inventario" });
    else if (r.kind === "cliente") navigate({ to: "/catalogos" });
  };

  const icons = {
    producto: Package,
    lote: Tag,
    movimiento: FileText,
    cliente: Users,
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 h-9 w-full max-w-md rounded-md border bg-background hover:bg-accent text-sm text-muted-foreground"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar producto, lote, guía, cliente…</span>
        <kbd className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Ctrl K</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0">
          <div className="border-b p-3">
            <Input
              autoFocus
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 border-0 focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {results.length === 0 && q.length >= 2 && (
              <div className="p-8 text-center text-sm text-muted-foreground">Sin resultados</div>
            )}
            {results.length === 0 && q.length < 2 && (
              <div className="p-8 text-center text-sm text-muted-foreground">Escribe al menos 2 caracteres</div>
            )}
            {results.map((r) => {
              const Icon = icons[r.kind];
              return (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => go(r)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-accent text-left border-b last:border-0"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
