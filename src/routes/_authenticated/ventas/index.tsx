import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Store, FileText, ShoppingCart, Receipt, FileOutput, TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { EstadoBadge } from "@/components/ventas/estado-badge";

export const Route = createFileRoute("/_authenticated/ventas/")({
  component: VentasDashboard,
});

function VentasDashboard() {
  const { data } = useQuery({
    queryKey: ["ventas-dashboard"],
    queryFn: async () => {
      const [cot, ov, fac, gr] = await Promise.all([
        supabase.from("ventas_cotizaciones").select("id,codigo,cliente_id,fecha_emision,total,estado").order("created_at", { ascending: false }).limit(5),
        supabase.from("ventas_ordenes").select("id,codigo,cliente_id,fecha_emision,total,estado").order("created_at", { ascending: false }).limit(5),
        supabase.from("ventas_facturas").select("id,codigo,cliente_id,fecha_emision,total,estado").order("created_at", { ascending: false }).limit(5),
        supabase.from("ventas_guias").select("id,codigo,cliente_id,fecha_emision,estado").order("created_at", { ascending: false }).limit(5),
      ]);
      const clientes = await supabase.from("clientes_proveedores").select("id,nombre");
      const cliMap = new Map((clientes.data ?? []).map((c: any) => [c.id, c.nombre]));
      const totalFacturado = (fac.data ?? []).filter((f: any) => f.estado !== "ANULADA").reduce((a: number, f: any) => a + Number(f.total ?? 0), 0);
      return {
        cot: cot.data ?? [], ov: ov.data ?? [], fac: fac.data ?? [], gr: gr.data ?? [],
        cliMap, totalFacturado,
      };
    },
  });

  const kpi = [
    { label: "Cotizaciones", icon: FileText, value: data?.cot.length ?? 0, to: "/ventas/cotizaciones", color: "from-blue-500/20 to-blue-700/30 text-blue-400" },
    { label: "Órdenes de compra", icon: ShoppingCart, value: data?.ov.length ?? 0, to: "/ventas/ordenes", color: "from-violet-500/20 to-violet-700/30 text-violet-400" },
    { label: "Facturas", icon: Receipt, value: data?.fac.length ?? 0, to: "/ventas/facturas", color: "from-emerald-500/20 to-emerald-700/30 text-emerald-400" },
    { label: "Guías", icon: FileOutput, value: data?.gr.length ?? 0, to: "/ventas/guias", color: "from-orange-500/20 to-orange-700/30 text-orange-400" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/40 text-primary flex items-center justify-center">
          <Store className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Módulo de Ventas</h1>
          <p className="text-muted-foreground">Cotización → Orden → Factura / Guía · la guía descuenta stock</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpi.map((k) => (
          <Link key={k.to} to={k.to} className="block">
            <Card className="p-4 hover:shadow-md transition-shadow">
              <div className={`size-10 rounded-lg bg-gradient-to-br ${k.color} flex items-center justify-center mb-2`}>
                <k.icon className="size-5" />
              </div>
              <div className="text-2xl font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/30">
        <div className="flex items-center gap-3">
          <TrendingUp className="size-6 text-emerald-400" />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total facturado (últimas 5)</div>
            <div className="text-3xl font-bold">S/ {formatNumber(data?.totalFacturado ?? 0)}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentList title="Cotizaciones recientes" rows={data?.cot ?? []} cliMap={data?.cliMap} to="/ventas/cotizaciones" />
        <RecentList title="Órdenes recientes" rows={data?.ov ?? []} cliMap={data?.cliMap} to="/ventas/ordenes" />
        <RecentList title="Facturas recientes" rows={data?.fac ?? []} cliMap={data?.cliMap} to="/ventas/facturas" />
        <RecentList title="Guías recientes" rows={data?.gr ?? []} cliMap={data?.cliMap} to="/ventas/guias" />
      </div>
    </div>
  );
}

function RecentList({ title, rows, cliMap, to }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{title}</h3>
        <Link to={to} className="text-xs text-primary hover:underline">Ver todos →</Link>
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">Sin registros</div>}
        {rows.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-semibold">{r.codigo}</span>
              <span className="text-muted-foreground truncate">{cliMap?.get?.(r.cliente_id) ?? "—"}</span>
            </div>
            <div className="flex items-center gap-3">
              {r.total != null && <span className="tabular-nums font-medium">{formatNumber(Number(r.total))}</span>}
              <EstadoBadge estado={r.estado} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
