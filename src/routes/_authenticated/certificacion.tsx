import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { ShieldCheck, FlaskConical, Plus, Pencil, Trash2 } from "lucide-react";
import { useRoles } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/certificacion")({
  component: Page,
});

function Page() {
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/30 text-emerald-400 flex items-center justify-center">
          <ShieldCheck className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Certificación y Calidad</h1>
          <p className="text-muted-foreground">Registro de lotes certificados y control de códigos de calidad</p>
        </div>
      </header>

      <Tabs defaultValue="certificacion" className="space-y-4">
        <TabsList>
          <TabsTrigger value="certificacion"><ShieldCheck className="size-4 mr-1" /> Certificación</TabsTrigger>
          <TabsTrigger value="calidad"><FlaskConical className="size-4 mr-1" /> Calidad</TabsTrigger>
        </TabsList>

        <TabsContent value="certificacion" className="space-y-4">
          <CertificacionTab />
        </TabsContent>
        <TabsContent value="calidad" className="space-y-4">
          <CalidadTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CertificacionTab() {
  const qc = useQueryClient();
  const { canApprove } = useRoles();
  const [open, setOpen] = useState<any>(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [certificadora, setCertificadora] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("TODOS");
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["cert"],
    queryFn: async () => {
      const [l, s, p] = await Promise.all([
        supabase.from("lotes").select("*").order("fecha_produccion", { ascending: false }),
        supabase.from("stock_lote_ubicacion").select("lote_id, cantidad_cajas"),
        supabase.from("productos").select("*"),
      ]);
      return { lotes: l.data ?? [], stock: s.data ?? [], prod: p.data ?? [] };
    },
  });

  const stockPorLote = useMemo(() => {
    const m = new Map<string, number>();
    (data?.stock ?? []).forEach((s) => m.set(s.lote_id, (m.get(s.lote_id) ?? 0) + Number(s.cantidad_cajas)));
    return m;
  }, [data]);
  const prodMap = useMemo(() => new Map((data?.prod ?? []).map((p) => [p.id, p])), [data]);

  const lotesFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.lotes ?? [])
      .filter((l: any) => filterEstado === "TODOS" || l.estado === filterEstado)
      .filter((l: any) => {
        if (!q) return true;
        const p: any = prodMap.get(l.producto_id);
        return [l.codigo_lote, p?.descripcion, p?.codigo_base, l.certificadora]
          .some((v) => v && String(v).toLowerCase().includes(q));
      })
      .map((l: any) => ({ ...l, stock: stockPorLote.get(l.id) ?? 0 }));
  }, [data, stockPorLote, filterEstado, search, prodMap]);

  const pendientes = lotesFiltrados.filter((l: any) => l.estado !== "CERTIFICADO");
  const certificados = lotesFiltrados.filter((l: any) => l.estado === "CERTIFICADO");

  const certificar = useMutation({
    mutationFn: async () => {
      if (!certificadora.trim()) throw new Error("Indica la certificadora");
      const { error } = await supabase
        .from("lotes")
        .update({ estado: "CERTIFICADO", fecha_certificacion: fecha, certificadora: certificadora.trim() } as any)
        .eq("id", open.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lote registrado como CERTIFICADO");
      setOpen(null);
      setCertificadora("");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const m: Record<string, number> = { TODOS: 0 };
    (data?.lotes ?? []).forEach((l: any) => {
      m.TODOS++;
      m[l.estado] = (m[l.estado] ?? 0) + 1;
    });
    return m;
  }, [data]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total lotes" value={counts.TODOS ?? 0} tone="default" />
        <StatCard label="Por certificar" value={counts.POR_CERTIFICAR ?? 0} tone="amber" />
        <StatCard label="Certificados" value={counts.CERTIFICADO ?? 0} tone="emerald" />
        <StatCard label="Otros estados" value={(counts.TODOS ?? 0) - (counts.POR_CERTIFICAR ?? 0) - (counts.CERTIFICADO ?? 0)} tone="muted" />
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Buscar</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lote, producto, certificadora…" className="h-9" />
        </div>
        <div className="w-48">
          <Label className="text-xs">Estado</Label>
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="POR_CERTIFICAR">Por certificar</SelectItem>
              <SelectItem value="CERTIFICADO">Certificados</SelectItem>
              <SelectItem value="DISPONIBLE">Disponibles</SelectItem>
              <SelectItem value="OBSERVADO">Observados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Lotes pendientes de certificación ({pendientes.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">FP / FV</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-right px-3 py-2">Stock (cj)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((l: any) => {
                const p: any = prodMap.get(l.producto_id);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{l.codigo_lote}</td>
                    <td className="px-3 py-2">{p?.descripcion ?? p?.codigo_base}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(l.fecha_produccion)} → {formatDate(l.fecha_vencimiento)}</td>
                    <td className="px-3 py-2"><Badge variant="secondary" className="text-xs">{l.estado}</Badge></td>
                    <td className="px-3 py-2 text-right">{formatNumber(l.stock)}</td>
                    <td className="px-3 py-2 text-right">
                      {canApprove ? (
                        <Button size="sm" onClick={() => setOpen(l)}>
                          <ShieldCheck className="size-4 mr-1" /> Certificar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Requiere supervisor</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pendientes.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No hay lotes pendientes</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="px-4 pt-4 font-semibold">Lotes certificados ({certificados.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lote</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-left px-3 py-2">Certificadora</th>
                <th className="text-left px-3 py-2">Fecha cert.</th>
                <th className="text-right px-3 py-2">Stock (cj)</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {certificados.map((l: any) => {
                const p: any = prodMap.get(l.producto_id);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{l.codigo_lote}</td>
                    <td className="px-3 py-2">{p?.descripcion ?? p?.codigo_base}</td>
                    <td className="px-3 py-2">{l.certificadora ?? "—"}</td>
                    <td className="px-3 py-2">{formatDate(l.fecha_certificacion)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(l.stock)}</td>
                    <td className="px-3 py-2"><Badge className="bg-emerald-600">CERTIFICADO</Badge></td>
                  </tr>
                );
              })}
              {certificados.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Sin lotes certificados</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar lote como CERTIFICADO</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-3">
              <div className="text-sm bg-muted p-3 rounded font-mono text-xs">{open.codigo_lote}</div>
              <div>
                <Label>Fecha de certificación</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <Label>Certificadora</Label>
                <Input value={certificadora} onChange={(e) => setCertificadora(e.target.value)} placeholder="SGS, Bureau Veritas, …" />
              </div>
              <Button className="w-full h-11" onClick={() => certificar.mutate()} disabled={certificar.isPending}>
                {certificar.isPending ? "Guardando…" : "Marcar como CERTIFICADO"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "default" | "amber" | "emerald" | "muted" }) {
  const t = {
    default: "text-foreground",
    amber: "text-amber-500",
    emerald: "text-emerald-500",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${t}`}>{formatNumber(value)}</div>
    </Card>
  );
}

// =============== CALIDAD TAB ===============

type CalidadRow = {
  id: string;
  item: number | null;
  usuario: string | null;
  producto: string | null;
  presentacion: string | null;
  lote_codigo: string | null;
  xcertif: number | null;
  producido: number | null;
  codificado: string | null;
  certifica: string | null;
  fecha_certif: string | null;
  obs: string | null;
};

const EMPTY_CALIDAD: Partial<CalidadRow> = {
  item: null, usuario: "", producto: "", presentacion: "", lote_codigo: "",
  xcertif: null, producido: null, codificado: "SI", certifica: "SI", fecha_certif: null, obs: "",
};

function CalidadTab() {
  const qc = useQueryClient();
  const { isAdmin, canApprove } = useRoles();
  const canWrite = isAdmin || canApprove;
  const [search, setSearch] = useState("");
  const [fUsuario, setFUsuario] = useState("TODOS");
  const [fObs, setFObs] = useState("TODOS");
  const [fCertifica, setFCertifica] = useState("TODOS");
  const [edit, setEdit] = useState<Partial<CalidadRow> | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["calidad-codigos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("calidad_codigos")
        .select("*")
        .order("item", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalidadRow[];
    },
  });

  const usuarios = useMemo(() => Array.from(new Set(rows.map((r) => r.usuario).filter(Boolean))) as string[], [rows]);
  const obsList = useMemo(() => Array.from(new Set(rows.map((r) => r.obs).filter(Boolean))) as string[], [rows]);
  const certificaList = useMemo(() => Array.from(new Set(rows.map((r) => r.certifica).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fUsuario !== "TODOS" && r.usuario !== fUsuario) return false;
      if (fObs !== "TODOS" && r.obs !== fObs) return false;
      if (fCertifica !== "TODOS" && r.certifica !== fCertifica) return false;
      if (!q) return true;
      return [r.lote_codigo, r.producto, r.presentacion, r.obs, r.usuario].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [rows, search, fUsuario, fObs, fCertifica]);

  const totales = useMemo(() => {
    const totalCajas = filtered.reduce((s, r) => s + Number(r.xcertif ?? 0), 0);
    const certificados = filtered.filter((r) => r.certifica === "SI").length;
    return { totalCajas, certificados, total: filtered.length };
  }, [filtered]);

  const save = useMutation({
    mutationFn: async (r: Partial<CalidadRow>) => {
      const payload: any = {
        item: r.item, usuario: r.usuario || null, producto: r.producto || null,
        presentacion: r.presentacion || null, lote_codigo: r.lote_codigo || null,
        xcertif: r.xcertif, producido: r.producido || null, codificado: r.codificado || null,
        certifica: r.certifica || null, fecha_certif: r.fecha_certif || null, obs: r.obs || null,
      };
      if (r.id) {
        const { error } = await (supabase as any).from("calidad_codigos").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("calidad_codigos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Registro guardado");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["calidad-codigos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("calidad_codigos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro eliminado");
      qc.invalidateQueries({ queryKey: ["calidad-codigos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Registros" value={totales.total} tone="default" />
        <StatCard label="Certificados (SI)" value={totales.certificados} tone="emerald" />
        <StatCard label="Total cajas (xCertif)" value={totales.totalCajas} tone="amber" />
        <StatCard label="Usuarios distintos" value={usuarios.length} tone="muted" />
      </div>

      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">Buscar</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Lote, producto, presentación…" className="h-9" />
        </div>
        <div className="w-40">
          <Label className="text-xs">Usuario</Label>
          <Select value={fUsuario} onValueChange={setFUsuario}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              {usuarios.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">Certifica</Label>
          <Select value={fCertifica} onValueChange={setFCertifica}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              {certificaList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Label className="text-xs">Observación</Label>
          <Select value={fObs} onValueChange={setFObs}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todas</SelectItem>
              {obsList.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canWrite && (
          <Button onClick={() => setEdit({ ...EMPTY_CALIDAD })}><Plus className="size-4 mr-1" /> Nuevo</Button>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2">Item</th>
                <th className="text-left px-2 py-2">Usuario</th>
                <th className="text-left px-2 py-2">Producto</th>
                <th className="text-left px-2 py-2">Presentación</th>
                <th className="text-left px-2 py-2">Lote / Código certif.</th>
                <th className="text-right px-2 py-2">xCertif</th>
                <th className="text-center px-2 py-2">Producido</th>
                <th className="text-center px-2 py-2">Codificado</th>
                <th className="text-center px-2 py-2">Certifica</th>
                <th className="text-left px-2 py-2">Fecha certif.</th>
                <th className="text-left px-2 py-2">Obs.</th>
                {canWrite && <th className="text-right px-2 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-2 py-1.5">{r.item ?? "—"}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-xs">{r.usuario ?? "—"}</Badge></td>
                  <td className="px-2 py-1.5">{r.producto ?? "—"}</td>
                  <td className="px-2 py-1.5">{r.presentacion ?? "—"}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.lote_codigo ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{r.xcertif ? formatNumber(r.xcertif) : "—"}</td>
                  <td className="px-2 py-1.5 text-center font-mono">{r.producido != null ? formatNumber(r.producido) : "—"}</td>
                  <td className="px-2 py-1.5 text-center">{r.codificado ?? "—"}</td>
                  <td className="px-2 py-1.5 text-center">
                    {r.certifica === "SI"
                      ? <Badge className="bg-emerald-600 text-xs">SI</Badge>
                      : <Badge variant="secondary" className="text-xs">{r.certifica ?? "—"}</Badge>}
                  </td>
                  <td className="px-2 py-1.5">{r.fecha_certif ? formatDate(r.fecha_certif) : "—"}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-xs">{r.obs ?? "—"}</Badge></td>
                  {canWrite && (
                    <td className="px-2 py-1.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEdit(r)} title="Editar"><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm("¿Eliminar registro?")) remove.mutate(r.id); }} title="Eliminar"><Trash2 className="size-4 text-destructive" /></Button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={canWrite ? 12 : 11} className="text-center py-8 text-muted-foreground">Sin registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Editar registro de calidad" : "Nuevo registro de calidad"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Item"><Input type="number" value={edit.item ?? ""} onChange={(e) => setEdit({ ...edit, item: e.target.value ? Number(e.target.value) : null })} /></Fld>
              <Fld label="Usuario"><Input value={edit.usuario ?? ""} onChange={(e) => setEdit({ ...edit, usuario: e.target.value })} placeholder="CASALI / POLAY" /></Fld>
              <Fld label="Producto" full><Input value={edit.producto ?? ""} onChange={(e) => setEdit({ ...edit, producto: e.target.value })} /></Fld>
              <Fld label="Presentación"><Input value={edit.presentacion ?? ""} onChange={(e) => setEdit({ ...edit, presentacion: e.target.value })} placeholder="1/2 LB" /></Fld>
              <Fld label="xCertif"><Input type="number" step="0.01" value={edit.xcertif ?? ""} onChange={(e) => setEdit({ ...edit, xcertif: e.target.value ? Number(e.target.value) : null })} /></Fld>
              <Fld label="Lote / Código certif." full><Input value={edit.lote_codigo ?? ""} onChange={(e) => setEdit({ ...edit, lote_codigo: e.target.value })} placeholder="BRFBAA FP:DD MM YYYY FV:DD MM YYYY" /></Fld>
              <Fld label="Producido" full>
                <Input type="number" step="0.01" value={edit.producido ?? ""}
                  onChange={(e) => setEdit({ ...edit, producido: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="Cantidad producida (numérico)" />
              </Fld>
              <Fld label="Codificado">
                <Select value={edit.codificado ?? ""} onValueChange={(v) => setEdit({ ...edit, codificado: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="SI">SI</SelectItem><SelectItem value="-">-</SelectItem></SelectContent>
                </Select>
              </Fld>
              <Fld label="Certifica">
                <Select value={edit.certifica ?? ""} onValueChange={(v) => setEdit({ ...edit, certifica: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="SI">SI</SelectItem><SelectItem value="-">-</SelectItem></SelectContent>
                </Select>
              </Fld>
              <Fld label="Fecha certif."><Input type="date" value={edit.fecha_certif ?? ""} onChange={(e) => setEdit({ ...edit, fecha_certif: e.target.value || null })} /></Fld>
              <Fld label="Observación" full><Input value={edit.obs ?? ""} onChange={(e) => setEdit({ ...edit, obs: e.target.value })} placeholder="QW, LOCAL, MUNICIPIO…" /></Fld>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={() => edit && save.mutate(edit)} disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fld({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
