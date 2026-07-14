
-- 1) Recreate public views with security_invoker = true so they honor caller's RLS
ALTER VIEW public.v_stock_lote SET (security_invoker = true);
ALTER VIEW public.vista_insumos_stock SET (security_invoker = true);
ALTER VIEW public.vista_insumos_movimientos SET (security_invoker = true);

-- 2) Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER RPCs (kept available to authenticated/service_role)
REVOKE EXECUTE ON FUNCTION public.admin_editar_insumo_mov(uuid, date, uuid, tipo_mov_insumo_t, numeric, text, text, text, text, text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_eliminar_insumo_mov(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_insumo(uuid, tipo_mov_insumo_t, numeric, text, text, date, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_editar_insumo_mov(uuid, date, uuid, tipo_mov_insumo_t, numeric, text, text, text, text, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_eliminar_insumo_mov(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_insumo(uuid, tipo_mov_insumo_t, numeric, text, text, date, text, text, text) TO authenticated, service_role;

-- 3) Tighten INSERT policy that used WITH CHECK (true)
DROP POLICY IF EXISTS insumos_mov_write_auth ON public.insumos_movimientos;
CREATE POLICY insumos_mov_write_auth
  ON public.insumos_movimientos
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (usuario_id IS NULL OR usuario_id = auth.uid()));
