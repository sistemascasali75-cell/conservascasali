
-- Bypass del trigger que bloquea updates de movimientos
DO $$
BEGIN
  PERFORM set_config('app.bypass_movimientos_block','true', true);

  -- 1) BACKFILL total_latas
  UPDATE public.movimientos
  SET total_latas = GREATEST(
    COALESCE(cantidad_cajas,0)::int * COALESCE(NULLIF(empaque,0), 48)
    + COALESCE(latas,0), 0)
  WHERE COALESCE(total_latas,0) = 0
    AND (COALESCE(cantidad_cajas,0) > 0 OR COALESCE(latas,0) > 0);

  -- 2) Renormalizar cajas/latas desde total_latas
  UPDATE public.movimientos
  SET cantidad_cajas = FLOOR(COALESCE(total_latas,0)::numeric / GREATEST(COALESCE(empaque,48),1)),
      latas = COALESCE(total_latas,0) % GREATEST(COALESCE(empaque,48),1)
  WHERE COALESCE(total_latas,0) > 0;
END $$;

-- 3) Stock backfill
UPDATE public.stock_lote_ubicacion s
SET total_latas = GREATEST(
  COALESCE(s.cantidad_cajas,0)::int * COALESCE(NULLIF(p.empaque,0), 48), 0)
FROM public.lotes l
JOIN public.productos p ON p.id = l.producto_id
WHERE s.lote_id = l.id
  AND COALESCE(s.total_latas,0) = 0
  AND COALESCE(s.cantidad_cajas,0) > 0;

UPDATE public.stock_lote_ubicacion s
SET cantidad_cajas = FLOOR(COALESCE(s.total_latas,0)::numeric / GREATEST(COALESCE(p.empaque,48),1))
FROM public.lotes l
JOIN public.productos p ON p.id = l.producto_id
WHERE s.lote_id = l.id;

-- 4) TRIGGER: total_latas como fuente de verdad
CREATE OR REPLACE FUNCTION public.tg_mov_recalc_latas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_emp integer; v_from_total boolean;
BEGIN
  v_emp := GREATEST(COALESCE(NEW.empaque, 48), 1);
  NEW.empaque := v_emp;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.total_latas,0) > 0 THEN
      NEW.cantidad_cajas := FLOOR(NEW.total_latas::numeric / v_emp);
      NEW.latas := NEW.total_latas % v_emp;
    ELSE
      NEW.total_latas := COALESCE(NEW.cantidad_cajas,0)::integer * v_emp + COALESCE(NEW.latas,0);
      NEW.cantidad_cajas := FLOOR(NEW.total_latas::numeric / v_emp);
      NEW.latas := NEW.total_latas % v_emp;
    END IF;
  ELSE
    v_from_total := (NEW.total_latas IS DISTINCT FROM OLD.total_latas)
                 OR (NEW.empaque IS DISTINCT FROM OLD.empaque);
    IF v_from_total THEN
      NEW.cantidad_cajas := FLOOR(COALESCE(NEW.total_latas,0)::numeric / v_emp);
      NEW.latas := COALESCE(NEW.total_latas,0) % v_emp;
    ELSIF (NEW.cantidad_cajas IS DISTINCT FROM OLD.cantidad_cajas)
       OR (NEW.latas IS DISTINCT FROM OLD.latas) THEN
      NEW.total_latas := COALESCE(NEW.cantidad_cajas,0)::integer * v_emp + COALESCE(NEW.latas,0);
      NEW.cantidad_cajas := FLOOR(NEW.total_latas::numeric / v_emp);
      NEW.latas := NEW.total_latas % v_emp;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 5) recalc stock reforzado
CREATE OR REPLACE FUNCTION public.recalc_stock_lote_ubic(p_lote uuid, p_ubic uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_latas integer; v_emp integer;
BEGIN
  IF p_lote IS NULL OR p_ubic IS NULL THEN RETURN; END IF;
  SELECT GREATEST(COALESCE(p.empaque,48),1) INTO v_emp
    FROM public.lotes l JOIN public.productos p ON p.id=l.producto_id WHERE l.id = p_lote;
  IF v_emp IS NULL THEN v_emp := 48; END IF;

  SELECT COALESCE(SUM(CASE
    WHEN tipo IN ('ENTRADA','AJUSTE_POSITIVO') AND ubicacion_destino_id = p_ubic THEN COALESCE(total_latas,0)
    WHEN tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') AND ubicacion_origen_id = p_ubic THEN -COALESCE(total_latas,0)
    WHEN tipo IN ('TRASLADO','CAMBIO') AND ubicacion_destino_id = p_ubic THEN COALESCE(total_latas,0)
    WHEN tipo IN ('TRASLADO','CAMBIO') AND ubicacion_origen_id = p_ubic THEN -COALESCE(total_latas,0)
    ELSE 0 END),0)
  INTO v_latas
  FROM public.movimientos
  WHERE lote_id = p_lote AND (ubicacion_origen_id = p_ubic OR ubicacion_destino_id = p_ubic);

  v_latas := GREATEST(v_latas, 0);
  IF v_latas <= 0 THEN
    DELETE FROM public.stock_lote_ubicacion WHERE lote_id = p_lote AND ubicacion_id = p_ubic;
  ELSE
    INSERT INTO public.stock_lote_ubicacion(lote_id, ubicacion_id, cantidad_cajas, total_latas)
    VALUES (p_lote, p_ubic, FLOOR(v_latas::numeric / v_emp), v_latas)
    ON CONFLICT (lote_id, ubicacion_id)
    DO UPDATE SET cantidad_cajas = FLOOR(v_latas::numeric / v_emp),
                  total_latas = v_latas, updated_at = now();
  END IF;
END $function$;

-- 6) Recalcular todos los stocks desde movimientos
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT lote_id, ubicacion_origen_id AS ubic FROM public.movimientos WHERE ubicacion_origen_id IS NOT NULL
    UNION
    SELECT DISTINCT lote_id, ubicacion_destino_id AS ubic FROM public.movimientos WHERE ubicacion_destino_id IS NOT NULL
  LOOP
    PERFORM public.recalc_stock_lote_ubic(r.lote_id, r.ubic);
  END LOOP;
END $$;

-- 7) Vista de movimientos por lote (en latas)
CREATE OR REPLACE VIEW public.vista_lote_movimientos_latas AS
SELECT
  m.id, m.fecha, m.tipo, m.lote_id,
  l.codigo_lote, p.codigo_base AS producto_codigo, p.descripcion AS producto,
  m.empaque, m.total_latas,
  FLOOR(COALESCE(m.total_latas,0)::numeric / GREATEST(COALESCE(m.empaque,48),1)) AS cajas_derivadas,
  COALESCE(m.total_latas,0) % GREATEST(COALESCE(m.empaque,48),1) AS latas_derivadas,
  CASE
    WHEN m.tipo IN ('ENTRADA','AJUSTE_POSITIVO') THEN COALESCE(m.total_latas,0)
    WHEN m.tipo IN ('SALIDA','MERMA','AJUSTE_NEGATIVO') THEN -COALESCE(m.total_latas,0)
    ELSE 0 END AS delta_latas,
  m.ubicacion_origen_id, uo.codigo AS ubic_origen,
  m.ubicacion_destino_id, ud.codigo AS ubic_destino,
  m.nro_guia, m.nro_vale, m.motivo, m.observaciones, m.usuario_nombre, m.created_at
FROM public.movimientos m
JOIN public.lotes l ON l.id = m.lote_id
JOIN public.productos p ON p.id = l.producto_id
LEFT JOIN public.ubicaciones uo ON uo.id = m.ubicacion_origen_id
LEFT JOIN public.ubicaciones ud ON ud.id = m.ubicacion_destino_id;

GRANT SELECT ON public.vista_lote_movimientos_latas TO authenticated;
