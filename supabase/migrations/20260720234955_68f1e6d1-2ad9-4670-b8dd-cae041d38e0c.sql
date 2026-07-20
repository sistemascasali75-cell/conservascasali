
CREATE TABLE public.vales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'SALIDA',
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  nro_vale INTEGER NOT NULL,
  descripcion TEXT,
  estado TEXT NOT NULL DEFAULT 'EMITIDO' CHECK (estado IN ('EMITIDO','ANULADO','USADO','PENDIENTE')),
  autorizado TEXT,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vales_nro_vale_idx ON public.vales(nro_vale);
CREATE INDEX vales_fecha_idx ON public.vales(fecha DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vales TO authenticated;
GRANT ALL ON public.vales TO service_role;

ALTER TABLE public.vales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vales_select_auth" ON public.vales FOR SELECT TO authenticated USING (true);
CREATE POLICY "vales_admin_all" ON public.vales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'OPERADOR') OR public.has_role(auth.uid(), 'INSUMOS'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN') OR public.has_role(auth.uid(), 'OPERADOR') OR public.has_role(auth.uid(), 'INSUMOS'));

CREATE TRIGGER vales_updated_at BEFORE UPDATE ON public.vales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.vales (tipo, fecha, nro_vale, descripcion, estado, autorizado) VALUES
('SALIDA','2026-07-01'::date,1,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-01'::date,2,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-01'::date,3,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-02'::date,4,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-02'::date,4,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-03'::date,5,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-03'::date,6,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-03'::date,7,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-04'::date,8,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-04'::date,9,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-04'::date,10,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-04'::date,11,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-04'::date,12,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-04'::date,13,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-06'::date,14,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-06'::date,15,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,16,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,16,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,16,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,17,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,17,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,18,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,19,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-07'::date,20,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-08'::date,21,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-08'::date,22,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-08'::date,23,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-08'::date,24,NULL,'ANULADO',NULL),
('SALIDA','2026-07-08'::date,25,NULL,'EMITIDO',NULL),
('SALIDA','2026-07-09'::date,26,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-09'::date,27,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-10'::date,28,NULL,'EMITIDO','Karla Carrillo'),
('SALIDA','2026-07-10'::date,28,NULL,'EMITIDO','Karla Carrillo'),
('SALIDA','2026-07-10'::date,28,NULL,'EMITIDO','Karla Carrillo'),
('SALIDA','2026-07-10'::date,28,NULL,'EMITIDO','Karla Carrillo'),
('SALIDA','2026-07-10'::date,28,NULL,'EMITIDO','Karla Carrillo'),
('SALIDA','2026-07-10'::date,29,NULL,'EMITIDO',NULL),
('SALIDA','2026-07-10'::date,29,NULL,'EMITIDO',NULL),
('SALIDA','2026-07-11'::date,30,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-10'::date,31,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-10'::date,32,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-11'::date,33,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-11'::date,34,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-11'::date,35,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-11'::date,36,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-11'::date,36,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-12'::date,37,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-12'::date,38,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-13'::date,39,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-13'::date,40,NULL,'ANULADO',NULL),
('SALIDA','2026-07-13'::date,41,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,41,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,41,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,42,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,43,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,43,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,44,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,44,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,45,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-13'::date,46,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-14'::date,47,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-15'::date,48,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-15'::date,48,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-15'::date,49,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-15'::date,50,'MARCOS DE MADERA','EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-16'::date,51,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-16'::date,52,NULL,'ANULADO',NULL),
('SALIDA','2026-07-16'::date,53,NULL,'EMITIDO','Zariana Maroquin'),
('SALIDA','2026-07-16'::date,54,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-16'::date,55,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-16'::date,56,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-17'::date,57,NULL,'EMITIDO','Ricardo Carrillo'),
('SALIDA','2026-07-17'::date,58,NULL,'EMITIDO','Zariana Maroquin'),
('SALIDA','2026-07-17'::date,59,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-18'::date,60,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-18'::date,61,NULL,'EMITIDO','Fiorella Llauce'),
('SALIDA','2026-07-18'::date,62,NULL,'EMITIDO','Zariana Maroquin'),
('SALIDA','2026-07-18'::date,63,NULL,'EMITIDO','Fiorella Llauce');
