
-- Revoke default PUBLIC execute and grant only to authenticated.
-- Triggers do not require EXECUTE on the role; revoke from PUBLIC entirely.

REVOKE EXECUTE ON FUNCTION public.block_mov_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gen_codigo_lote() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_supervisor_or_admin(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_supervisor_or_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, app_role[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, app_role[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_delete_catalogo(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_catalogo(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid, tipo_mov_t, date, uuid, uuid, uuid, numeric, integer, integer, text, text, uuid, text, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_editar_movimiento(uuid, tipo_mov_t, date, uuid, uuid, uuid, numeric, integer, integer, text, text, uuid, text, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_eliminar_movimiento(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_eliminar_movimiento(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_movimiento(tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.registrar_movimiento_insumo(uuid, tipo_mov_insumo_t, numeric, text, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_movimiento_insumo(uuid, tipo_mov_insumo_t, numeric, text, text, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_lote(uuid, date, date, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_lote(uuid, date, date, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ejecutar_orden_etiquetado(uuid, text, numeric, numeric, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ejecutar_orden_etiquetado(uuid, text, numeric, numeric, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.crear_inventario_fisico(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crear_inventario_fisico(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.aprobar_inventario(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.aprobar_inventario(uuid) TO authenticated;
