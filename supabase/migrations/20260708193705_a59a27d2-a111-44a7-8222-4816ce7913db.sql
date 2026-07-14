ALTER VIEW public.v_stock_disponible_fefo SET (security_invoker = true);
ALTER VIEW public.v_stock_lote SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.upsert_lote(uuid, date, date, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_stock_lote_ubic(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_sync_stock_from_mov() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_lote(uuid, date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_stock_lote_ubic(uuid, uuid) TO authenticated, service_role;