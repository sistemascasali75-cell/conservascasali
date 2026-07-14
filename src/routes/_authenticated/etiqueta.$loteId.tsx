import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/etiqueta/$loteId")({
  validateSearch: (s: Record<string, unknown>) => ({
    ubicacion: typeof s.ubicacion === "string" ? s.ubicacion : undefined,
    cantidad: typeof s.cantidad === "string" ? s.cantidad : undefined,
  }),
  component: Page,
});

function Page() {
  const { loteId } = Route.useParams();
  const search = Route.useSearch();
  const [qr, setQr] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["etq", loteId],
    queryFn: async () => {
      const [l, p, s, u, a] = await Promise.all([
        supabase.from("lotes").select("*").eq("id", loteId).single(),
        supabase.from("productos").select("*"),
        supabase.from("stock_lote_ubicacion").select("*").eq("lote_id", loteId),
        supabase.from("ubicaciones").select("*"),
        supabase.from("almacenes").select("*"),
      ]);
      return { lote: l.data, prod: p.data ?? [], stock: s.data ?? [], ubic: u.data ?? [], alm: a.data ?? [] };
    },
  });

  useEffect(() => {
    if (!data?.lote) return;
    QRCode.toDataURL(data.lote.codigo_lote, { width: 220, margin: 1 }).then(setQr);
  }, [data?.lote]);

  if (!data?.lote) return <div className="p-8">Cargando…</div>;
  const lote = data.lote;
  const producto = data.prod.find((p) => p.id === lote.producto_id);
  const ubic = search.ubicacion ? data.ubic.find((u) => u.id === search.ubicacion) : null;
  const alm = ubic ? data.alm.find((a) => a.id === ubic.almacen_id) : null;
  const cantidad = search.cantidad
    ? Number(search.cantidad)
    : data.stock.find((s) => s.ubicacion_id === search.ubicacion)?.cantidad_cajas ??
      data.stock.reduce((acc, s) => acc + Number(s.cantidad_cajas), 0);

  return (
    <div className="min-h-screen bg-muted/30 p-6 print:bg-white print:p-0">
      <div className="max-w-md mx-auto space-y-3 print:max-w-none print:m-0">
        <div className="flex gap-2 print:hidden">
          <Button onClick={() => window.print()} className="flex-1"><Printer className="size-4 mr-2" />Imprimir</Button>
          <Button variant="outline" onClick={() => window.close()}>Cerrar</Button>
        </div>

        <div className="bg-white border-2 border-black rounded-md p-5 space-y-3 print:border print:rounded-none print:shadow-none">
          <div className="text-center border-b-2 border-black pb-2">
            <div className="text-xs font-bold tracking-widest">ALMACONSERVA · WMS</div>
            <div className="text-lg font-bold">ETIQUETA DE PALLET / RACK</div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
            <div className="space-y-1.5 text-sm">
              <div><span className="text-[10px] uppercase opacity-60 block">Producto</span><strong>{producto?.descripcion}</strong></div>
              <div><span className="text-[10px] uppercase opacity-60 block">Código de lote</span><span className="font-mono text-xs">{lote.codigo_lote}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[10px] uppercase opacity-60 block">FP</span><strong>{formatDate(lote.fecha_produccion)}</strong></div>
                <div><span className="text-[10px] uppercase opacity-60 block">FV</span><strong>{formatDate(lote.fecha_vencimiento)}</strong></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[10px] uppercase opacity-60 block">Etiqueta</span><strong>{lote.etiqueta ?? "S/E"}</strong></div>
                <div><span className="text-[10px] uppercase opacity-60 block">Estado</span><strong>{lote.estado}</strong></div>
              </div>
            </div>
            {qr && <img src={qr} alt="QR" className="w-28 h-28" />}
          </div>

          <div className="border-t-2 border-black pt-2 grid grid-cols-2 gap-2">
            <div className="text-center">
              <div className="text-[10px] uppercase opacity-60">Ubicación</div>
              <div className="text-3xl font-black font-mono">{ubic?.codigo ?? "—"}</div>
              <div className="text-xs">{alm?.nombre}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] uppercase opacity-60">Cajas</div>
              <div className="text-3xl font-black">{formatNumber(cantidad, 0)}</div>
            </div>
          </div>

          <div className="text-[9px] text-center opacity-60 border-t pt-1">
            Impreso: {new Date().toLocaleString("es-PE")}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A6; margin: 5mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
