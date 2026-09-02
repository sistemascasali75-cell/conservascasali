# Almacen Conservas final

Crea un mini ERP de almacén (WMS) para una planta de conservas de pescado en Perú, llamado "AlmaConserva". Idioma: español. Usa Supabase como base de datos con autenticación por email. Diseño limpio tipo dashboard industrial: sidebar oscura azul marino, contenido claro, tipografía legible, optimizado para uso rápido en almacén (botones grandes, tablas densas con búsqueda instantánea). Debe funcionar bien en tablet.

CONTEXTO DEL NEGOCIO

La empresa almacena conservas de pescado (filete de bonito, atún, jurel, caballa; entero y grated de anchoveta) en latas de distintos envases (1/2 LB, 1/2 LB-108, 1 LB TALL, TINAPON). Todo se controla por LOTE: cada lote tiene código de producto, fecha de producción (FP) y fecha de vencimiento (FV). La unidad de inventario es la caja (admite decimales, ej. 615.13 cajas). Hoy todo se lleva en Excel y hay errores: stocks negativos, lotes duplicados por errores de tipeo y mermas anotadas como texto.

MODELO DE DATOS (tablas Supabase)

productos (catálogo maestro, NO incluye fechas):

codigo_base (ej. "BRFBAA"), descripcion (ej. "FILETE DE BONITO EN ACEITE"), especie (BONITO, ATUN, JUREL, CABALLA, ANCHOVETA), presentacion (FILETE, ENTERO, GRATED), liquido_gobierno (ACEITE, AGUA Y SAL), envase (1/2 LB, 1/2 LB-108, 1 LB TALL, TINAPON), activo (boolean).

lotes (la entidad central):

producto_id (FK), fecha_produccion, fecha_vencimiento, codigo_lote generado automáticamente con formato "BRFBAA FP:10-08-2025 FV:10-08-2029" (solo lectura, nunca tipeado a mano), estado (DISPONIBLE, INMOVILIZADO, POR_CERTIFICAR, EN_PROCESO, CUARENTENA), etiqueta (S/E, CASALI, JAER, ADITA u otra), mercado (QW, M.LOCAL, MUNICIPIO, EXPORTACION), usuario_marca (CASALI, POLAY, ADITA), observacion.

almacenes: nombre (Almacén 1, Almacén 2, Buenos Aires), activo.

ubicaciones: almacen_id (FK), codigo (ej. "21-F", "45-M", "PISO"), donde el formato es número de rack + nivel (A=Alto, M=Medio, F=Fondo) o "PISO".

stock_lote_ubicacion: lote_id, ubicacion_id, cantidad_cajas (decimal, restricción CHECK >= 0, nunca negativo). El stock total de un lote es la suma de sus ubicaciones.

movimientos (kardex inmutable, nunca se edita ni borra, solo se anula con contramovimiento):

tipo (ENTRADA, SALIDA, TRASLADO, AJUSTE_POSITIVO, AJUSTE_NEGATIVO, MERMA), fecha, lote_id, ubicacion_origen_id, ubicacion_destino_id, cantidad_cajas, nro_guia, nro_vale, cliente_proveedor_id (FK), motivo, usuario_id (quien registró), created_at.

clientes_proveedores: nombre, tipo (CLIENTE, PROVEEDOR, AMBOS), documento.

warrants: nro_warrant, lote_id, cantidad_cajas_warrant, financiera, fecha_inicio, fecha_liberacion, estado (ACTIVO, LIBERADO). El sistema calcula "holgura" = stock del lote − cantidad en warrant, y bloquea salidas que dejarían el stock por debajo de lo comprometido en warrant activo.

REGLAS DE NEGOCIO CRÍTICAS

Prohibido stock negativo: una salida mayor al stock disponible se rechaza con mensaje claro mostrando el disponible. Si el conteo físico difiere, se registra un AJUSTE o MERMA explícito con motivo obligatorio.

FEFO: al registrar una salida, sugerir automáticamente el lote con fecha de vencimiento más próxima de ese producto.

El código de lote se genera, nunca se escribe: el usuario selecciona producto del catálogo y pone FP/FV con date pickers; el sistema arma el código. FV se autocompleta como FP + 4 años (editable).

Toda salida/entrada descuenta/suma de una ubicación específica.

Los traslados entre almacenes (ej. a "Buenos Aires") son un solo movimiento TRASLADO, no una salida + entrada manuales.

PANTALLAS FASE 1

Dashboard: tarjetas con stock total en cajas, nº de lotes activos, alertas de vencimiento (lotes que vencen en <90 días en ámbar, vencidos en rojo), lotes inmovilizados, stock comprometido en warrant. Gráfico de barras de stock por producto.

Inventario: tabla de lotes con stock, filtros por producto, almacén, estado, mercado, etiqueta; búsqueda; semáforo de vencimiento; click en lote abre detalle con ubicaciones y su kardex completo.

Registrar Entrada: formulario rápido (producto → FP/FV → cantidad → almacén/ubicación → proveedor → guía).

Registrar Salida: buscar producto → sistema sugiere lote FEFO → ubicación → cantidad (valida disponible) → cliente → guía/vale.

Catálogos: CRUD de productos, almacenes, ubicaciones, clientes/proveedores.

Crea datos de ejemplo realistas: 8 productos, 15 lotes con fechas variadas (algunos por vencer), 3 almacenes, ubicaciones 21-A hasta 51-F, y 20 movimientos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://conservascasali.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/18f7ac1c-e2e5-4fd8-b8bf-b4e1f4daa582).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
