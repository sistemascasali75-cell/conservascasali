
-- lances_produccion: replace permissive policies with role checks
DROP POLICY IF EXISTS lances_read_auth ON public.lances_produccion;
DROP POLICY IF EXISTS lances_insert_auth ON public.lances_produccion;
DROP POLICY IF EXISTS lances_update_auth ON public.lances_produccion;

CREATE POLICY lances_read_roles ON public.lances_produccion
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

CREATE POLICY lances_insert_roles ON public.lances_produccion
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  );

CREATE POLICY lances_update_roles ON public.lances_produccion
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  );

-- lance_insumos: replace permissive policies with role checks
DROP POLICY IF EXISTS lance_ins_read_auth ON public.lance_insumos;
DROP POLICY IF EXISTS lance_ins_insert_auth ON public.lance_insumos;
DROP POLICY IF EXISTS lance_ins_update_auth ON public.lance_insumos;
DROP POLICY IF EXISTS lance_ins_delete_auth ON public.lance_insumos;

CREATE POLICY lance_ins_read_roles ON public.lance_insumos
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

CREATE POLICY lance_ins_insert_roles ON public.lance_insumos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  );

CREATE POLICY lance_ins_update_roles ON public.lance_insumos
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  );

CREATE POLICY lance_ins_delete_roles ON public.lance_insumos
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'ADMIN'::app_role)
    OR public.has_role(auth.uid(), 'OPERADOR'::app_role)
    OR public.has_role(auth.uid(), 'INSUMOS'::app_role)
  );

-- vales: restrict SELECT to users with a role
DROP POLICY IF EXISTS vales_select_auth ON public.vales;

CREATE POLICY vales_select_roles ON public.vales
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid()));

-- Revoke public/anon EXECUTE on registrar_movimiento (SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric, p_ubic_origen uuid, p_ubic_destino uuid,
  p_cliente_proveedor uuid, p_nro_guia text, p_nro_vale text, p_motivo text, p_fecha date,
  p_observaciones text, p_nro_warrant text, p_latas integer, p_piso integer, p_mercado_id uuid,
  p_tiene_etiqueta boolean, p_tercero text, p_empaque integer, p_donacion boolean, p_autorizado text,
  p_inicia_warrant date, p_vence_warrant date, p_total_latas integer, p_tamano text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_movimiento(
  p_tipo tipo_mov_t, p_lote_id uuid, p_cantidad numeric, p_ubic_origen uuid, p_ubic_destino uuid,
  p_cliente_proveedor uuid, p_nro_guia text, p_nro_vale text, p_motivo text, p_fecha date,
  p_observaciones text, p_nro_warrant text, p_latas integer, p_piso integer, p_mercado_id uuid,
  p_tiene_etiqueta boolean, p_tercero text, p_empaque integer, p_donacion boolean, p_autorizado text,
  p_inicia_warrant date, p_vence_warrant date, p_total_latas integer, p_tamano text
) TO authenticated;
