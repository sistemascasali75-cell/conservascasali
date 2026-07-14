# Rediseño: Latas como unidad maestra

## Concepto clave

`total_latas` pasa a ser el **campo maestro** de cantidad. Se ingresa/edita en latas; el sistema calcula automáticamente:

- `cantidad_cajas = floor(total_latas / empaque)` (cajas enteras)
- `latas = total_latas % empaque` (residuo, latas sueltas)

Ejemplo con empaque=48: `125 latas` → `2 cajas + 29 latas`.

## 1. Migración de base de datos (una sola vez)

### `movimientos`
- Asegurar columna `total_latas integer` (ya existe).
- **Backfill único**: `UPDATE movimientos SET total_latas = COALESCE(cantidad_cajas,0)::int * COALESCE(empaque,48) + COALESCE(latas,0) WHERE total_latas IS NULL OR total_latas = 0`.
- Después: recalcular `cantidad_cajas = total_latas / empaque` y `latas = total_latas % empaque` para todos los registros históricos.
- Nuevo trigger `tg_mov_normaliza_latas` (BEFORE INSERT/UPDATE):
  - Si `total_latas` cambió → recalcula cajas y latas.
  - Si `cantidad_cajas` o `latas` cambiaron → recalcula `total_latas`.
  - `total_latas` es campo editable directo.

### `stock_lote_ubicacion`
- Agregar columna `total_latas integer NOT NULL DEFAULT 0`.
- Backfill: `total_latas = cantidad_cajas * empaque_producto` (empaque tomado del producto del lote).
- Nueva función `recalc_stock_lote_ubic` que reconstruye stock sumando `total_latas` de movimientos y deriva `cantidad_cajas`.

### RPCs a actualizar
- `registrar_movimiento(...)`: aceptar parámetro `p_total_latas` (opcional). Si viene, usa ese; si no, calcula desde cajas+latas. Escribe siempre `total_latas`, `cantidad_cajas`, `latas`.
- `admin_editar_movimiento(...)`: añadir `p_total_latas`.
- Validación de stock: comparar contra `total_latas` disponible en la ubicación, no cajas.
- `ventas_emitir_guia`, `cambiar_lote`, `ejecutar_orden_etiquetado`, `aprobar_inventario`: trabajar en latas totales.

### Vistas / kardex
- Recrear `vista_kardex` (o equivalente) exponiendo `total_latas_entrada`, `total_latas_salida`, `saldo_total_latas`, y derivados `cajas_derivadas`, `latas_derivadas`.

## 2. Componentes UI compartidos

Nuevo `<LatasInput>`:
- Input principal: **Total latas** (numérico).
- Muestra en vivo: `= X cajas + Y latas` (según empaque).
- Empaque configurable (48 por defecto, editable por lote/producto).
- Opción "modo cajas": permite escribir cajas y latas por separado y sincroniza `total_latas`.

Nuevo `<LatasDisplay>`:
- Muestra `1,234 latas` en grande + `(25 cajas + 34 latas)` como sublínea.
- Reemplaza los `formatNumber(cantidad_cajas)` dispersos.

## 3. Pantallas afectadas

| Pantalla | Cambio |
|----------|--------|
| Entrada | Formulario usa `<LatasInput>`; muestra desglose |
| Salida | Igual + validación stock en latas |
| Traslado | Igual + selector muestra stock en latas |
| Mermas | Igual |
| Ajustes (+/−) | Igual |
| Mapa almacén | Cada carril muestra `total_latas` grande y `(cajas+latas)` chico; traslado desde mapa prellena con `total_latas` del stock |
| Kardex | Columnas: Ingreso (latas), Salida (latas), Saldo (latas), Saldo (cajas+latas derivado) |
| Inventario | Igual patrón |
| Reportes (analítica, valorizado, vencimientos, despachos, gerencia) | Totales en latas; cajas derivadas |
| Ventas → Órdenes / Guías / Facturas | Líneas capturan `total_latas`; muestra cajas+latas. `precio_unitario` puede ser por lata o por caja (se conserva `unidad_precio`). |
| Inventario físico (conteo) | Conteo en latas |

## 4. Reportes por lote

Nueva vista `vista_lote_movimientos_latas`:
- Por cada lote: fecha, tipo, `total_latas`, `cajas_derivadas`, `latas_derivadas`, saldo acumulado en latas.
- Alimenta pestaña "Movimientos por lote" en Kardex y en snapshot del lote.

## 5. Orden de implementación

1. Migración BD (esquema + backfill + triggers + RPCs).
2. Componentes `<LatasInput>` / `<LatasDisplay>`.
3. Formularios de captura (entrada, salida, traslado, mermas).
4. Mapa almacén + inventario + kardex.
5. Ventas (órdenes, guías, facturas).
6. Reportes y descargas.

## Notas técnicas

- Empaque se lee del producto (columna existente) con fallback 48.
- Los triggers existentes `tg_mov_recalc_latas` y `tg_ventas_*_calc` se reemplazan por la nueva normalización basada en `total_latas`.
- `cantidad_cajas` pasa a ser **derivado** en movimientos pero se mantiene almacenado para no romper queries existentes.
- Los reportes viejos que agrupan por `cantidad_cajas` seguirán funcionando; se añaden columnas de latas.
- Migración es idempotente: si se corre 2 veces no duplica.

Confirma para empezar por la migración de BD.