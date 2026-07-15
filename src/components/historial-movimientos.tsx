import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/use-role";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Check, X, FileDown } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { LatasInput } from "@/components/latas-input";
import { TamanoSelect } from "@/components/tamano-select";

type TipoMov = "ENTRADA" | "SALIDA" | "TRASLADO" | "MERMA" | "AJUSTE_POSITIVO" | "AJUSTE_NEGATIVO" | "CAMBIO";

interface Props {
  tipo: TipoMov;
  title?: string;
  limit?: number;
}

export function HistorialMovimientos({ tipo, title = "Historial de registros", limit = 30 }: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useRoles();
  const [editing, setEditing] = useState<any | null>(null);
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["historial-mov", tipo, limit],
    queryFn: async () => {
      const { data: movs } = await supabase
        .from("movimientos")
        .select("*")
        .eq("tipo", tipo)
        .order("created_at", { ascending: false })
        .limit(limit);
      const lotesIds = [...new Set((movs ?? []).map((m) => m.lote_id))];
      const ubicIds = [...new Set([
        ...(movs ?? []).map((m) => m.ubicacion_origen_id),
        ...(movs ?? []).map((m) => m.ubicacion_destino_id),
      ].filter(Boolean))] as string[];
      const cliIds = [...new Set((movs ?? []).map((m) => m.cliente_proveedor_id).filter(Boolean))] as string[];
      const userIds = [...new Set((movs ?? []).map((m) => m.usuario_id).filter(Boolean))] as string[];
      const mercIds = [...new Set((movs ?? []).map((m: any) => m.mercado_id).filter(Boolean))] as string[];

      const [lotes, ubics, clientes, mercs] = await Promise.all([
        lotesIds.length
          ? supabase.from("lotes").select("id, codigo_lote, producto_id").in("id", lotesIds)
          : Promise.resolve({ data: [] as any[] }),
        ubicIds.length
          ? supabase.from("ubicaciones").select("id, codigo").in("id", ubicIds)
          : Promise.resolve({ data: [] as any[] }),
        cliIds.length
          ? supabase.from("clientes_proveedores").select("id, nombre").in("id", cliIds)
          : Promise.resolve({ data: [] as any[] }),
        mercIds.length
          ? (supabase.from("mercados" as any).select("id, mercado").in("id", mercIds) as any)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Best-effort lookup of user display name via user_roles join (auth.users isn't exposed)
      const userMap = new Map<string, string>();
      userIds.forEach((id) => userMap.set(id, id.slice(0, 8)));

      return {
        movs: movs ?? [],
        loteById: new Map((lotes.data ?? []).map((l) => [l.id, l])),
        ubicById: new Map((ubics.data ?? []).map((u) => [u.id, u])),
        cliById: new Map((clientes.data ?? []).map((c) => [c.id, c])),
        mercadoById: new Map(((mercs as any).data ?? []).map((m: any) => [m.id, m.mercado])),
        userMap,
      };
    },
  });


  const filtered = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return data.movs;
    return data.movs.filter((m: any) => {
      const lote = data.loteById.get(m.lote_id);
      const cli = data.cliById.get(m.cliente_proveedor_id ?? "");
      return [
        lote?.codigo_lote, m.nro_guia, m.nro_vale, m.nro_warrant,
        m.observaciones, m.etiqueta, data.mercadoById.get(m.mercado_id), cli?.nombre,
        m.usuario_nombre, m.tercero, m.motivo,
      ].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [data, filter]);

  function exportCsv() {
    if (!data) return;
    const rows = filtered.map((m: any) => {
      const lote = data.loteById.get(m.lote_id);
      const origen = data.ubicById.get(m.ubicacion_origen_id ?? "");
      const destino = data.ubicById.get(m.ubicacion_destino_id ?? "");
      const cli = data.cliById.get(m.cliente_proveedor_id ?? "");
      return {
        Fecha: formatDate(m.fecha),
        Usuario: m.usuario_nombre ?? "",
        Lote: lote?.codigo_lote ?? "",
        Cajas: m.cantidad_cajas,
        Latas: m.latas ?? "",
        TotalLatas: m.total_latas ?? (Number(m.cantidad_cajas || 0) * 48) + Number(m.latas || 0),
        Origen: origen?.codigo ?? "",
        Destino: destino?.codigo ?? "",
        Cliente: cli?.nombre ?? "",
        Tercero: m.tercero ?? "",
        Guía: m.nro_guia ?? "",
        Vale: m.nro_vale ?? "",
        NroWarrant: m.nro_warrant ?? "",
        Warrant: m.tiene_warrant ? "Sí" : "No",
        Etiqueta: m.etiqueta ?? "",
        TieneEtiqueta: m.tiene_etiqueta ? "Sí" : "No",
        Mercado: data.mercadoById.get(m.mercado_id) ?? "",
        Certificación: m.certificacion ?? "",
        Tamaño: m.tamano ?? "",
        Estado: m.estado_lote ?? "",
        Observaciones: m.observaciones ?? "",
        Motivo: m.motivo ?? "",
      };
    });
    const headers = Object.keys(rows[0] ?? { x: "" });
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial_${tipo.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b bg-muted/40">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">Últimos {limit} movimientos · {filtered.length} mostrados</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por lote, guía, cliente…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 w-56"
          />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
            <FileDown className="size-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Cajas</TableHead>
              <TableHead className="text-right">Latas</TableHead>
              <TableHead className="text-right">Total latas</TableHead>
              {tipo !== "ENTRADA" && <TableHead>Origen</TableHead>}
              {tipo !== "SALIDA" && <TableHead>Destino</TableHead>}
              <TableHead>Cliente/Prov.</TableHead>
              <TableHead>Tercero</TableHead>
              <TableHead>Guía / Vale</TableHead>
              <TableHead className="text-center">Warrant</TableHead>
              <TableHead className="text-center">Etiqueta</TableHead>
              <TableHead>Mercado</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Observaciones</TableHead>
              {isAdmin && <TableHead className="text-right">Acción</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={18} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={18} className="text-center text-muted-foreground py-8">Sin movimientos</TableCell></TableRow>
            )}
            {filtered.map((m: any) => {
              const lote = data?.loteById.get(m.lote_id);
              const origen = data?.ubicById.get(m.ubicacion_origen_id ?? "");
              const destino = data?.ubicById.get(m.ubicacion_destino_id ?? "");
              const cli = data?.cliById.get(m.cliente_proveedor_id ?? "");
              const userLabel = m.usuario_nombre ?? data?.userMap.get(m.usuario_id ?? "") ?? "—";
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.fecha)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap" title={userLabel}>{userLabel}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap" title={lote?.codigo_lote}>{lote?.codigo_lote ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatNumber(m.cantidad_cajas, 3)}</TableCell>
                  <TableCell className="text-right text-xs">{m.latas != null ? formatNumber(m.latas) : "—"}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {formatNumber(m.total_latas ?? (Number(m.cantidad_cajas || 0) * 48) + Number(m.latas || 0))}
                  </TableCell>
                  {tipo !== "ENTRADA" && <TableCell className="text-xs">{origen?.codigo ?? "—"}</TableCell>}
                  {tipo !== "SALIDA" && <TableCell className="text-xs">{destino?.codigo ?? "—"}</TableCell>}
                  <TableCell className="text-xs">{cli?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap" title={m.tercero ?? ""}>{m.tercero ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {m.nro_guia ?? "—"}{m.nro_vale ? ` / ${m.nro_vale}` : ""}
                  </TableCell>
                  <TableCell className="text-center">
                    <BoolMark on={m.tiene_warrant} hint={m.nro_warrant} />
                  </TableCell>
                  <TableCell className="text-center">
                    <BoolMark on={m.tiene_etiqueta} hint={m.etiqueta} />
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{(data?.mercadoById.get(m.mercado_id) as string) ?? "—"}</Badge></TableCell>
                  <TableCell className="text-xs">{m.tamano ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">{m.estado_lote ?? "—"}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[220px] truncate" title={m.observaciones}>{m.observaciones ?? "—"}</TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(m)} title="Editar">
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditDialog
          mov={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["historial-mov", tipo] });
            toast.success("Movimiento actualizado");
          }}
        />
      )}
    </Card>
  );
}

function BoolMark({ on, hint }: { on: boolean; hint?: string | null }) {
  return (
    <span title={hint ?? undefined} className={`inline-flex items-center justify-center size-6 rounded ${on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
      {on ? <Check className="size-3.5" /> : <X className="size-3.5" />}
    </span>
  );
}

function EditDialog({ mov, onClose, onSaved }: { mov: any; onClose: () => void; onSaved: () => void }) {
  const [fecha, setFecha] = useState(mov.fecha);
  const [guia, setGuia] = useState(mov.nro_guia ?? "");
  const [vale, setVale] = useState(mov.nro_vale ?? "");
  const [motivo, setMotivo] = useState(mov.motivo ?? "");
  const [observaciones, setObs] = useState(mov.observaciones ?? "");
  const [nroWarrant, setNroW] = useState(mov.nro_warrant ?? "");
  const [tercero, setTercero] = useState(mov.tercero ?? "");
  const [tamano, setTamano] = useState(mov.tamano ?? "");
  const initTotal = mov.total_latas != null
    ? Number(mov.total_latas)
    : Number(mov.cantidad_cajas || 0) * Number(mov.empaque || 48) + Number(mov.latas || 0);
  const [totalLatas, setTotalLatas] = useState<number | "">(initTotal);
  const empaqueVal = Number(mov.empaque || 48);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const t = typeof totalLatas === "number" ? totalLatas : 0;
      const cajas = Math.floor(t / Math.max(1, empaqueVal));
      const latasResiduo = t % Math.max(1, empaqueVal);
      const { error } = await supabase.rpc("admin_editar_movimiento", {
        p_mov: mov.id,
        p_fecha: fecha,
        p_cantidad_cajas: cajas,
        p_latas: latasResiduo,
        p_nro_guia: guia || null,
        p_nro_vale: vale || null,
        p_cliente: mov.cliente_proveedor_id,
        p_motivo: motivo || null,
        p_observaciones: observaciones || null,
        p_nro_warrant: nroWarrant || null,
        p_tercero: tercero || null,
        p_empaque: empaqueVal,
        p_tamano: tamano || null,
      } as any);
      if (error) throw error;
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar movimiento (Admin)</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
          <div className="space-y-1.5 col-span-2">
            <Label>Cantidad (latas totales)</Label>
            <LatasInput totalLatas={totalLatas} onChange={setTotalLatas} empaque={empaqueVal} size="lg" />
          </div>
          <div className="space-y-1.5"><Label>N° Guía</Label><Input value={guia} onChange={(e) => setGuia(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>N° Vale</Label><Input value={vale} onChange={(e) => setVale(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>N° Warrant</Label><Input value={nroWarrant} onChange={(e) => setNroW(e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Tercero</Label><Input value={tercero} onChange={(e) => setTercero(e.target.value)} placeholder="Nombre del tercero / transportista" /></div>
          <div className="col-span-2 space-y-1.5"><Label>Tamaño</Label><TamanoSelect value={tamano} onChange={setTamano} autoDefault={false} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Motivo</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Observaciones</Label><Textarea rows={3} value={observaciones} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
