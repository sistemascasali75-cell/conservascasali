-- Eliminar versión antigua sobrecargada de registrar_movimiento (sin p_empaque/p_donacion/p_autorizado)
-- que causa ambigüedad PGRST203 al llamar por nombre desde el cliente.
DROP FUNCTION IF EXISTS public.registrar_movimiento(
  tipo_mov_t, uuid, numeric, uuid, uuid, uuid, text, text, text, date, text, text, integer, integer, uuid, boolean, text
);