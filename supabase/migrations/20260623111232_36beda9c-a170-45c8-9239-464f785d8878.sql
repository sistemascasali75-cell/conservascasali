ALTER TABLE public.ubicaciones
  ADD COLUMN IF NOT EXISTS seccion text,
  ADD COLUMN IF NOT EXISTS carril text,
  ADD COLUMN IF NOT EXISTS pallets integer,
  ADD COLUMN IF NOT EXISTS observacion text;

WITH src(alm_nombre, seccion, carril, pallets, observacion) AS (
  VALUES
('Almacen 1','A','24',9,NULL),('Almacen 1','A','25',9,NULL),('Almacen 1','A','26',9,NULL),('Almacen 1','A','27',9,NULL),('Almacen 1','A','28',9,NULL),('Almacen 1','A','29',9,NULL),('Almacen 1','A','30',9,NULL),('Almacen 1','A','31',9,NULL),('Almacen 1','A','32',9,NULL),('Almacen 1','A','33',9,NULL),('Almacen 1','A','34',9,NULL),('Almacen 1','A','35',9,NULL),('Almacen 1','A','36',9,NULL),('Almacen 1','A','37',9,NULL),('Almacen 1','A','38',9,NULL),('Almacen 1','A','39',9,NULL),('Almacen 1','A','40',9,NULL),('Almacen 1','A','41',9,NULL),('Almacen 1','A','42',9,NULL),('Almacen 1','A','43',9,NULL),('Almacen 1','A','44',9,NULL),('Almacen 1','A','45',9,NULL),('Almacen 1','A','46',9,NULL),('Almacen 1','A','47',9,NULL),('Almacen 1','A','48',9,NULL),('Almacen 1','A','49',9,NULL),('Almacen 1','A','50',9,NULL),('Almacen 1','A','51',9,NULL),('Almacen 1','A','52',9,NULL),('Almacen 1','A','53',9,'ETIQUETAS'),('Almacen 1','A','54',9,'ETIQUETAS'),
('Almacen 1','B','1',NULL,NULL),('Almacen 1','B','2',NULL,NULL),('Almacen 1','B','3',NULL,NULL),('Almacen 1','B','4',NULL,NULL),('Almacen 1','B','5',NULL,NULL),('Almacen 1','B','6',NULL,NULL),('Almacen 1','B','7',NULL,NULL),('Almacen 1','B','8',NULL,NULL),('Almacen 1','B','9',NULL,NULL),('Almacen 1','B','10',NULL,NULL),('Almacen 1','B','11',NULL,NULL),('Almacen 1','B','12',NULL,NULL),('Almacen 1','B','13',NULL,NULL),('Almacen 1','B','14',NULL,NULL),('Almacen 1','B','15',NULL,NULL),('Almacen 1','B','16',NULL,NULL),('Almacen 1','B','17',NULL,NULL),('Almacen 1','B','18',NULL,NULL),('Almacen 1','B','19',NULL,NULL),('Almacen 1','B','20',NULL,NULL),('Almacen 1','B','21',NULL,NULL),('Almacen 1','B','22',NULL,NULL),
('Almacen 2','L','14',NULL,NULL),('Almacen 2','L','15',NULL,NULL),('Almacen 2','L','16',NULL,NULL),('Almacen 2','L','17',NULL,NULL),('Almacen 2','L','18',NULL,NULL),('Almacen 2','L','19',NULL,NULL),('Almacen 2','L','20',NULL,NULL),('Almacen 2','L','22',NULL,NULL),('Almacen 2','L','23',NULL,NULL),('Almacen 2','L','24',NULL,NULL),('Almacen 2','L','25',NULL,NULL),('Almacen 2','L','26',NULL,NULL),('Almacen 2','L','27',NULL,NULL),('Almacen 2','L','28',NULL,NULL),('Almacen 2','L','29',NULL,NULL),('Almacen 2','L','30',NULL,NULL),('Almacen 2','L','31',NULL,NULL),('Almacen 2','L','32',NULL,NULL),('Almacen 2','L','33',NULL,NULL),('Almacen 2','L','34',NULL,NULL),('Almacen 2','L','35',NULL,NULL),('Almacen 2','L','36',NULL,NULL),('Almacen 2','L','37',NULL,NULL),('Almacen 2','L','38',NULL,NULL),('Almacen 2','L','39',NULL,NULL),('Almacen 2','L','40',NULL,NULL),('Almacen 2','L','41',NULL,NULL),('Almacen 2','L','42',NULL,NULL),('Almacen 2','L','43',NULL,NULL),('Almacen 2','L','44',NULL,NULL),('Almacen 2','L','45',NULL,NULL),('Almacen 2','L','46',NULL,NULL),('Almacen 2','L','47',NULL,NULL),('Almacen 2','L','48',NULL,NULL),('Almacen 2','L','49',NULL,NULL),('Almacen 2','L','50',NULL,NULL),('Almacen 2','L','51',NULL,NULL)
)
INSERT INTO public.ubicaciones (almacen_id, codigo, seccion, carril, pallets, observacion)
SELECT a.id, s.seccion || '-' || s.carril, s.seccion, s.carril, s.pallets, s.observacion
FROM src s JOIN public.almacenes a ON a.nombre = s.alm_nombre
ON CONFLICT (almacen_id, codigo) DO UPDATE
  SET seccion = EXCLUDED.seccion,
      carril = EXCLUDED.carril,
      pallets = EXCLUDED.pallets,
      observacion = EXCLUDED.observacion;