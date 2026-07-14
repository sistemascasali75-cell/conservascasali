
-- 1) Drop view exposing auth.users
DROP VIEW IF EXISTS public.v_usuarios;

-- 2) Recreate v_stock_lote with security_invoker so RLS applies as the querying user
DROP VIEW IF EXISTS public.v_stock_lote;
CREATE VIEW public.v_stock_lote
WITH (security_invoker = true) AS
SELECT l.id AS lote_id,
       l.codigo_lote,
       l.producto_id,
       l.fecha_produccion,
       l.fecha_vencimiento,
       l.estado,
       l.etiqueta,
       l.mercado,
       COALESCE(s.total, 0::numeric) AS stock_total,
       COALESCE(w.total_warrant, 0::numeric) AS comprometido_warrant,
       (COALESCE(s.total, 0::numeric) - COALESCE(w.total_warrant, 0::numeric)) AS holgura
FROM public.lotes l
LEFT JOIN (
  SELECT lote_id, sum(cantidad_cajas) AS total
  FROM public.stock_lote_ubicacion GROUP BY lote_id
) s ON s.lote_id = l.id
LEFT JOIN (
  SELECT lote_id, sum(cantidad_cajas_warrant) AS total_warrant
  FROM public.warrants WHERE estado = 'ACTIVO'::estado_warrant_t
  GROUP BY lote_id
) w ON w.lote_id = l.id;

GRANT SELECT ON public.v_stock_lote TO authenticated;
GRANT SELECT ON public.v_stock_lote TO service_role;

-- 3) Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.block_mov_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Movimientos no pueden modificarse ni eliminarse';
END;
$$;

-- 4) Tighten always-true policies — require authenticated session / role

-- inventario_conteo: only authenticated users
DROP POLICY IF EXISTS "all ic" ON public.inventario_conteo;
CREATE POLICY "ic select" ON public.inventario_conteo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ic insert" ON public.inventario_conteo
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ic update" ON public.inventario_conteo
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ic delete" ON public.inventario_conteo
  FOR DELETE TO authenticated
  USING (public.is_supervisor_or_admin(auth.uid()));

-- inventarios_fisicos
DROP POLICY IF EXISTS "ins if" ON public.inventarios_fisicos;
DROP POLICY IF EXISTS "upd if" ON public.inventarios_fisicos;
CREATE POLICY "if insert" ON public.inventarios_fisicos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "if update" ON public.inventarios_fisicos
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- lotes insert
DROP POLICY IF EXISTS "ins lotes" ON public.lotes;
CREATE POLICY "ins lotes" ON public.lotes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- movimientos insert
DROP POLICY IF EXISTS "auth insert mov" ON public.movimientos;
CREATE POLICY "auth insert mov" ON public.movimientos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ordenes_etiquetado insert
DROP POLICY IF EXISTS "ins oe" ON public.ordenes_etiquetado;
CREATE POLICY "ins oe" ON public.ordenes_etiquetado
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 5) Revoke EXECUTE on SECURITY DEFINER functions from anon/public; grant to authenticated where needed
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_supervisor_or_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supervisor_or_admin(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.aprobar_inventario(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_inventario(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crear_inventario_fisico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_inventario_fisico(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ejecutar_orden_etiquetado(uuid, text, numeric, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ejecutar_orden_etiquetado(uuid, text, numeric, numeric, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user_role() TO service_role;
