-- 1) Catálogo de actividades
CREATE TABLE IF NOT EXISTS public.actividades (
  nombre text PRIMARY KEY,
  observacion text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actividades TO authenticated;
GRANT ALL ON public.actividades TO service_role;

ALTER TABLE public.actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actividades_select_auth" ON public.actividades;
CREATE POLICY "actividades_select_auth" ON public.actividades
  FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "actividades_write_admin_op" ON public.actividades;
CREATE POLICY "actividades_write_admin_op" ON public.actividades
  FOR ALL TO authenticated
  USING (public.is_operador_or_admin(auth.uid()))
  WITH CHECK (public.is_operador_or_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_actividades_updated ON public.actividades;
CREATE TRIGGER trg_actividades_updated BEFORE UPDATE ON public.actividades
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.actividades(nombre, orden) VALUES
  ('MUESTREO', 1), ('CAMBIO DE LOTE', 2), ('REVISIÓN', 3), ('ETIQUETADO', 4),
  ('SELECCIÓN', 5), ('RE-EMPAQUE', 6), ('OTRO', 99)
ON CONFLICT (nombre) DO NOTHING;

-- 2) Estado de lote en muestreos
ALTER TABLE public.muestreos ADD COLUMN IF NOT EXISTS estado_lote text;

-- 3) Merma de muestreo → lote de merma en TRANSITO / M / M
CREATE OR REPLACE FUNCTION public.registrar_merma_muestreo(
  p_lote_id uuid,
  p_ubic_origen uuid,
  p_total_latas integer,
  p_empaque integer DEFAULT 48,
  p_fecha date DEFAULT CURRENT_DATE,
  p_motivo text DEFAULT NULL,
  p_observacion text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lote record; v_prod record; v_base_m text; v_prod_m uuid;
  v_lote_m uuid; v_alm uuid; v_ubic uuid; v_emp integer;
BEGIN
  IF NOT public.is_operador_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo ADMIN u OPERADOR';
  END IF;
  IF p_total_latas IS NULL OR p_total_latas <= 0 THEN
    RAISE EXCEPTION 'Cantidad de merma inválida';
  END IF;

  SELECT * INTO v_lote FROM public.lotes WHERE id = p_lote_id;
  IF v_lote IS NULL THEN RAISE EXCEPTION 'Lote no existe'; END IF;
  SELECT * INTO v_prod FROM public.productos WHERE id = v_lote.producto_id;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Producto del lote no existe'; END IF;

  v_emp := GREATEST(COALESCE(p_empaque, v_prod.empaque, 48), 1);

  -- Producto espejo de merma: primer carácter → 'M'
  v_base_m := 'M' || substr(v_prod.codigo_base, 2);
  SELECT id INTO v_prod_m FROM public.productos WHERE codigo_base = v_base_m;
  IF v_prod_m IS NULL THEN
    INSERT INTO public.productos(codigo_base, descripcion, especie, presentacion,
      liquido_gobierno, envase, activo, valor, empaque)
    VALUES (v_base_m, 'MERMA · ' || v_prod.descripcion, v_prod.especie, v_prod.presentacion,
      v_prod.liquido_gobierno, v_prod.envase, true, v_prod.valor, v_prod.empaque)
    RETURNING id INTO v_prod_m;
  END IF;

  -- Lote de merma con mismas fechas
  SELECT id INTO v_lote_m FROM public.lotes
   WHERE producto_id = v_prod_m
     AND fecha_produccion = v_lote.fecha_produccion
     AND fecha_vencimiento = v_lote.fecha_vencimiento;
  IF v_lote_m IS NULL THEN
    INSERT INTO public.lotes(producto_id, fecha_produccion, fecha_vencimiento, codigo_lote,
      estado, mercado, costo_por_caja, observacion)
    VALUES (v_prod_m, v_lote.fecha_produccion, v_lote.fecha_vencimiento, 'TMP',
      'MERMA', v_lote.mercado, v_lote.costo_por_caja,
      'MERMA generada desde ' || v_lote.codigo_lote)
    RETURNING id INTO v_lote_m;
  END IF;

  -- Almacén TRANSITO y ubicación sección M / carril M
  SELECT id INTO v_alm FROM public.almacenes WHERE upper(nombre) = 'TRANSITO' LIMIT 1;
  IF v_alm IS NULL THEN
    INSERT INTO public.almacenes(nombre) VALUES ('TRANSITO') RETURNING id INTO v_alm;
  END IF;

  SELECT id INTO v_ubic FROM public.ubicaciones
   WHERE almacen_id = v_alm AND upper(COALESCE(seccion,'')) = 'M' AND upper(COALESCE(carril,'')) = 'M'
   LIMIT 1;
  IF v_ubic IS NULL THEN
    INSERT INTO public.ubicaciones(almacen_id, codigo, seccion, carril, observacion)
    VALUES (v_alm, 'M-M', 'M', 'M', 'Ubicación automática de mermas de muestreo')
    RETURNING id INTO v_ubic;
  END IF;

  -- Salida por merma del lote original
  PERFORM public.registrar_movimiento(
    'MERMA'::public.tipo_mov_t, p_lote_id, 0, p_ubic_origen, NULL, NULL, NULL, NULL,
    COALESCE(p_motivo, 'MERMA MUESTREO'), p_fecha, p_observacion, NULL, NULL, NULL,
    NULL, NULL, NULL, v_emp, false, NULL, NULL, NULL, p_total_latas, NULL, NULL);

  -- Ingreso del lote de merma en TRANSITO / M / M
  PERFORM public.registrar_movimiento(
    'AJUSTE_POSITIVO'::public.tipo_mov_t, v_lote_m, 0, NULL, v_ubic, NULL, NULL, NULL,
    COALESCE(p_motivo, 'MERMA MUESTREO') || ' ← ' || v_lote.codigo_lote, p_fecha,
    p_observacion, NULL, NULL, NULL, NULL, NULL, NULL, v_emp, false, NULL, NULL, NULL,
    p_total_latas, NULL, 'MERMA');

  RETURN v_lote_m;
END $$;

REVOKE ALL ON FUNCTION public.registrar_merma_muestreo(uuid, uuid, integer, integer, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_merma_muestreo(uuid, uuid, integer, integer, date, text, text) TO authenticated;