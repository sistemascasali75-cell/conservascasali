export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_audit: {
        Row: {
          accion: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          reverted: boolean
          reverted_at: string | null
          reverted_by: string | null
          row_pk: string
          tabla: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          accion: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          reverted?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          row_pk: string
          tabla: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          reverted?: boolean
          reverted_at?: string | null
          reverted_by?: string | null
          row_pk?: string
          tabla?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      almacenes: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      calidad_codigos: {
        Row: {
          certifica: string | null
          codificado: string | null
          created_at: string
          fecha_certif: string | null
          id: string
          item: number | null
          lote_codigo: string | null
          obs: string | null
          presentacion: string | null
          producido: number | null
          producto: string | null
          updated_at: string
          usuario: string | null
          xcertif: number | null
        }
        Insert: {
          certifica?: string | null
          codificado?: string | null
          created_at?: string
          fecha_certif?: string | null
          id?: string
          item?: number | null
          lote_codigo?: string | null
          obs?: string | null
          presentacion?: string | null
          producido?: number | null
          producto?: string | null
          updated_at?: string
          usuario?: string | null
          xcertif?: number | null
        }
        Update: {
          certifica?: string | null
          codificado?: string | null
          created_at?: string
          fecha_certif?: string | null
          id?: string
          item?: number | null
          lote_codigo?: string | null
          obs?: string | null
          presentacion?: string | null
          producido?: number | null
          producto?: string | null
          updated_at?: string
          usuario?: string | null
          xcertif?: number | null
        }
        Relationships: []
      }
      clientes_proveedores: {
        Row: {
          activo: boolean
          condicion_pago: string | null
          created_at: string
          direccion: string | null
          documento: string | null
          email: string | null
          id: string
          nombre: string
          telefono: string | null
          tipo: Database["public"]["Enums"]["tipo_cp_t"]
        }
        Insert: {
          activo?: boolean
          condicion_pago?: string | null
          created_at?: string
          direccion?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nombre: string
          telefono?: string | null
          tipo: Database["public"]["Enums"]["tipo_cp_t"]
        }
        Update: {
          activo?: boolean
          condicion_pago?: string | null
          created_at?: string
          direccion?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
          tipo?: Database["public"]["Enums"]["tipo_cp_t"]
        }
        Relationships: []
      }
      estados: {
        Row: {
          created_at: string
          nombre: string
          observacion: string | null
          orden: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          nombre: string
          observacion?: string | null
          orden?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          nombre?: string
          observacion?: string | null
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      insumos: {
        Row: {
          activo: boolean
          categoria: string
          codigo: string
          created_at: string
          descripcion: string | null
          empaque: string
          formato: string | null
          grupo: string
          id: string
          insumo: string
          provee: string | null
          saldo_inicial: number
          stock_min_und: number
          subcategoria: string
          und_x_empaque: number
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          descripcion?: string | null
          empaque: string
          formato?: string | null
          grupo?: string
          id?: string
          insumo: string
          provee?: string | null
          saldo_inicial?: number
          stock_min_und?: number
          subcategoria: string
          und_x_empaque?: number
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          descripcion?: string | null
          empaque?: string
          formato?: string | null
          grupo?: string
          id?: string
          insumo?: string
          provee?: string | null
          saldo_inicial?: number
          stock_min_und?: number
          subcategoria?: string
          und_x_empaque?: number
          unidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      insumos_movimientos: {
        Row: {
          cantidad: number
          clase: string
          created_at: string
          fecha: string
          id: string
          insumo_id: string
          nro_guia: string | null
          observacion: string | null
          proveedor: string | null
          saldo_post: number | null
          tipo_mov: Database["public"]["Enums"]["tipo_mov_insumo_t"]
          transportista: string | null
          usuario_id: string | null
          vale_num: string | null
        }
        Insert: {
          cantidad: number
          clase: string
          created_at?: string
          fecha?: string
          id?: string
          insumo_id: string
          nro_guia?: string | null
          observacion?: string | null
          proveedor?: string | null
          saldo_post?: number | null
          tipo_mov: Database["public"]["Enums"]["tipo_mov_insumo_t"]
          transportista?: string | null
          usuario_id?: string | null
          vale_num?: string | null
        }
        Update: {
          cantidad?: number
          clase?: string
          created_at?: string
          fecha?: string
          id?: string
          insumo_id?: string
          nro_guia?: string | null
          observacion?: string | null
          proveedor?: string | null
          saldo_post?: number | null
          tipo_mov?: Database["public"]["Enums"]["tipo_mov_insumo_t"]
          transportista?: string | null
          usuario_id?: string | null
          vale_num?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumos_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "vista_insumos_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_conteo: {
        Row: {
          cantidad_contada: number | null
          cantidad_esperada: number
          created_at: string
          id: string
          inventario_id: string
          lote_id: string
          total_latas_contadas: number | null
          total_latas_esperadas: number
          ubicacion_id: string
        }
        Insert: {
          cantidad_contada?: number | null
          cantidad_esperada?: number
          created_at?: string
          id?: string
          inventario_id: string
          lote_id: string
          total_latas_contadas?: number | null
          total_latas_esperadas?: number
          ubicacion_id: string
        }
        Update: {
          cantidad_contada?: number | null
          cantidad_esperada?: number
          created_at?: string
          id?: string
          inventario_id?: string
          lote_id?: string
          total_latas_contadas?: number | null
          total_latas_esperadas?: number
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_conteo_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios_fisicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_conteo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_conteo_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "inventario_conteo_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      inventarios_fisicos: {
        Row: {
          almacen_id: string
          aprobado_at: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_inv_fisico_t"]
          fecha: string
          id: string
          numero: number
          observacion: string | null
          supervisor_id: string | null
          usuario_id: string | null
        }
        Insert: {
          almacen_id: string
          aprobado_at?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_inv_fisico_t"]
          fecha?: string
          id?: string
          numero?: number
          observacion?: string | null
          supervisor_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          almacen_id?: string
          aprobado_at?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_inv_fisico_t"]
          fecha?: string
          id?: string
          numero?: number
          observacion?: string | null
          supervisor_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventarios_fisicos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      lance_insumos: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          insumo_id: string | null
          lance_id: string
          movimiento_insumo_id: string | null
          nombre: string
          observacion: string | null
          orden: number
          presentacion: string | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          insumo_id?: string | null
          lance_id: string
          movimiento_insumo_id?: string | null
          nombre: string
          observacion?: string | null
          orden?: number
          presentacion?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          insumo_id?: string | null
          lance_id?: string
          movimiento_insumo_id?: string | null
          nombre?: string
          observacion?: string | null
          orden?: number
          presentacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lance_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lance_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "vista_insumos_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lance_insumos_lance_id_fkey"
            columns: ["lance_id"]
            isOneToOne: false
            referencedRelation: "lances_produccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lance_insumos_movimiento_insumo_id_fkey"
            columns: ["movimiento_insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lance_insumos_movimiento_insumo_id_fkey"
            columns: ["movimiento_insumo_id"]
            isOneToOne: false
            referencedRelation: "vista_insumos_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      lances_produccion: {
        Row: {
          aceite: string | null
          agua: string | null
          carros: number
          created_at: string
          envasado: string | null
          envasado_cajas: number
          envasado_latas: number
          envase: string
          estado: string
          fecha: string
          hora_registro: string | null
          id: string
          lance_prod_cajas: number
          lance_prod_latas: number
          lance_real_cajas: number
          lance_real_latas: number
          latas_por_caja: number
          merma_malas_cajas: number
          merma_malas_latas: number
          merma_maquina_cajas: number
          merma_maquina_latas: number
          merma_muestras_cajas: number
          merma_muestras_latas: number
          merma_pruebas_cajas: number
          merma_pruebas_latas: number
          numero: number
          observaciones: string | null
          packing: number
          parametros_extra: Json
          petroleo: number | null
          petroleo_unidad: string | null
          producto: string
          registrado_por: string | null
          updated_at: string
          usuario_cliente: string
        }
        Insert: {
          aceite?: string | null
          agua?: string | null
          carros?: number
          created_at?: string
          envasado?: string | null
          envasado_cajas?: number
          envasado_latas?: number
          envase?: string
          estado?: string
          fecha?: string
          hora_registro?: string | null
          id?: string
          lance_prod_cajas?: number
          lance_prod_latas?: number
          lance_real_cajas?: number
          lance_real_latas?: number
          latas_por_caja?: number
          merma_malas_cajas?: number
          merma_malas_latas?: number
          merma_maquina_cajas?: number
          merma_maquina_latas?: number
          merma_muestras_cajas?: number
          merma_muestras_latas?: number
          merma_pruebas_cajas?: number
          merma_pruebas_latas?: number
          numero?: number
          observaciones?: string | null
          packing?: number
          parametros_extra?: Json
          petroleo?: number | null
          petroleo_unidad?: string | null
          producto?: string
          registrado_por?: string | null
          updated_at?: string
          usuario_cliente?: string
        }
        Update: {
          aceite?: string | null
          agua?: string | null
          carros?: number
          created_at?: string
          envasado?: string | null
          envasado_cajas?: number
          envasado_latas?: number
          envase?: string
          estado?: string
          fecha?: string
          hora_registro?: string | null
          id?: string
          lance_prod_cajas?: number
          lance_prod_latas?: number
          lance_real_cajas?: number
          lance_real_latas?: number
          latas_por_caja?: number
          merma_malas_cajas?: number
          merma_malas_latas?: number
          merma_maquina_cajas?: number
          merma_maquina_latas?: number
          merma_muestras_cajas?: number
          merma_muestras_latas?: number
          merma_pruebas_cajas?: number
          merma_pruebas_latas?: number
          numero?: number
          observaciones?: string | null
          packing?: number
          parametros_extra?: Json
          petroleo?: number | null
          petroleo_unidad?: string | null
          producto?: string
          registrado_por?: string | null
          updated_at?: string
          usuario_cliente?: string
        }
        Relationships: []
      }
      lotes: {
        Row: {
          certificadora: string | null
          codigo_lote: string
          costo_por_caja: number
          created_at: string
          estado: string
          etiqueta: string | null
          fecha_certificacion: string | null
          fecha_produccion: string
          fecha_vencimiento: string
          id: string
          mercado: string | null
          observacion: string | null
          producto_id: string
          usuario_marca: string | null
        }
        Insert: {
          certificadora?: string | null
          codigo_lote: string
          costo_por_caja?: number
          created_at?: string
          estado?: string
          etiqueta?: string | null
          fecha_certificacion?: string | null
          fecha_produccion: string
          fecha_vencimiento: string
          id?: string
          mercado?: string | null
          observacion?: string | null
          producto_id: string
          usuario_marca?: string | null
        }
        Update: {
          certificadora?: string | null
          codigo_lote?: string
          costo_por_caja?: number
          created_at?: string
          estado?: string
          etiqueta?: string | null
          fecha_certificacion?: string | null
          fecha_produccion?: string
          fecha_vencimiento?: string
          id?: string
          mercado?: string | null
          observacion?: string | null
          producto_id?: string
          usuario_marca?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      mercados: {
        Row: {
          created_at: string
          datos: string | null
          id: string
          mercado: string
          nivel: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          datos?: string | null
          id?: string
          mercado: string
          nivel?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          datos?: string | null
          id?: string
          mercado?: string
          nivel?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      movimientos: {
        Row: {
          autorizado: string | null
          cantidad_cajas: number | null
          certificacion: string | null
          cliente_proveedor_id: string | null
          created_at: string
          donacion: boolean
          empaque: number
          estado_lote: string | null
          etiqueta: string | null
          fecha: string
          guia_id: string | null
          id: string
          inicia_warrant: string | null
          latas: number | null
          lote_id: string
          mercado_id: string | null
          motivo: string | null
          nro_guia: string | null
          nro_vale: string | null
          nro_warrant: string | null
          observaciones: string | null
          piso: number | null
          tamano: string | null
          tercero: string | null
          tiene_etiqueta: boolean
          tiene_warrant: boolean
          tipo: Database["public"]["Enums"]["tipo_mov_t"]
          total_latas: number
          ubicacion_destino_id: string | null
          ubicacion_origen_id: string | null
          usuario_id: string | null
          usuario_nombre: string | null
          vence_warrant: string | null
        }
        Insert: {
          autorizado?: string | null
          cantidad_cajas?: number | null
          certificacion?: string | null
          cliente_proveedor_id?: string | null
          created_at?: string
          donacion?: boolean
          empaque?: number
          estado_lote?: string | null
          etiqueta?: string | null
          fecha?: string
          guia_id?: string | null
          id?: string
          inicia_warrant?: string | null
          latas?: number | null
          lote_id: string
          mercado_id?: string | null
          motivo?: string | null
          nro_guia?: string | null
          nro_vale?: string | null
          nro_warrant?: string | null
          observaciones?: string | null
          piso?: number | null
          tamano?: string | null
          tercero?: string | null
          tiene_etiqueta?: boolean
          tiene_warrant?: boolean
          tipo: Database["public"]["Enums"]["tipo_mov_t"]
          total_latas?: number
          ubicacion_destino_id?: string | null
          ubicacion_origen_id?: string | null
          usuario_id?: string | null
          usuario_nombre?: string | null
          vence_warrant?: string | null
        }
        Update: {
          autorizado?: string | null
          cantidad_cajas?: number | null
          certificacion?: string | null
          cliente_proveedor_id?: string | null
          created_at?: string
          donacion?: boolean
          empaque?: number
          estado_lote?: string | null
          etiqueta?: string | null
          fecha?: string
          guia_id?: string | null
          id?: string
          inicia_warrant?: string | null
          latas?: number | null
          lote_id?: string
          mercado_id?: string | null
          motivo?: string | null
          nro_guia?: string | null
          nro_vale?: string | null
          nro_warrant?: string | null
          observaciones?: string | null
          piso?: number | null
          tamano?: string | null
          tercero?: string | null
          tiene_etiqueta?: boolean
          tiene_warrant?: boolean
          tipo?: Database["public"]["Enums"]["tipo_mov_t"]
          total_latas?: number
          ubicacion_destino_id?: string | null
          ubicacion_origen_id?: string | null
          usuario_id?: string | null
          usuario_nombre?: string | null
          vence_warrant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_cliente_proveedor_id_fkey"
            columns: ["cliente_proveedor_id"]
            isOneToOne: false
            referencedRelation: "clientes_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "ventas_guias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_mercado_id_fkey"
            columns: ["mercado_id"]
            isOneToOne: false
            referencedRelation: "mercados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      muestreos: {
        Row: {
          actividad: string
          aplicado: boolean
          carril: string | null
          created_at: string
          empaque: number
          fecha: string
          id: string
          lote_id: string
          merma_cajas: number
          merma_latas: number
          merma_total_latas: number
          nuevo_lote_id: string | null
          observacion: string | null
          revisado: boolean
          total_latas: number
          ubicacion_id: string | null
          updated_at: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          actividad?: string
          aplicado?: boolean
          carril?: string | null
          created_at?: string
          empaque?: number
          fecha?: string
          id?: string
          lote_id: string
          merma_cajas?: number
          merma_latas?: number
          merma_total_latas?: number
          nuevo_lote_id?: string | null
          observacion?: string | null
          revisado?: boolean
          total_latas?: number
          ubicacion_id?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          actividad?: string
          aplicado?: boolean
          carril?: string | null
          created_at?: string
          empaque?: number
          fecha?: string
          id?: string
          lote_id?: string
          merma_cajas?: number
          merma_latas?: number
          merma_total_latas?: number
          nuevo_lote_id?: string | null
          observacion?: string | null
          revisado?: boolean
          total_latas?: number
          ubicacion_id?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "muestreos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestreos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "muestreos_nuevo_lote_id_fkey"
            columns: ["nuevo_lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "muestreos_nuevo_lote_id_fkey"
            columns: ["nuevo_lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "muestreos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_etiquetado: {
        Row: {
          cantidad_etiquetada: number
          created_at: string
          etiqueta_destino: string
          fecha: string
          id: string
          lote_destino_id: string | null
          lote_origen_id: string
          merma_proceso: number
          observacion: string | null
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          cantidad_etiquetada: number
          created_at?: string
          etiqueta_destino: string
          fecha?: string
          id?: string
          lote_destino_id?: string | null
          lote_origen_id: string
          merma_proceso?: number
          observacion?: string | null
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          cantidad_etiquetada?: number
          created_at?: string
          etiqueta_destino?: string
          fecha?: string
          id?: string
          lote_destino_id?: string | null
          lote_origen_id?: string
          merma_proceso?: number
          observacion?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_etiquetado_lote_destino_id_fkey"
            columns: ["lote_destino_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_etiquetado_lote_destino_id_fkey"
            columns: ["lote_destino_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "ordenes_etiquetado_lote_origen_id_fkey"
            columns: ["lote_origen_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_etiquetado_lote_origen_id_fkey"
            columns: ["lote_origen_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "ordenes_etiquetado_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          codigo_base: string
          created_at: string
          descripcion: string
          empaque: number
          envase: Database["public"]["Enums"]["envase_t"]
          especie: Database["public"]["Enums"]["especie_t"]
          id: string
          liquido_gobierno: Database["public"]["Enums"]["liquido_t"]
          presentacion: Database["public"]["Enums"]["presentacion_t"]
          valor: number | null
        }
        Insert: {
          activo?: boolean
          codigo_base: string
          created_at?: string
          descripcion: string
          empaque?: number
          envase: Database["public"]["Enums"]["envase_t"]
          especie: Database["public"]["Enums"]["especie_t"]
          id?: string
          liquido_gobierno: Database["public"]["Enums"]["liquido_t"]
          presentacion: Database["public"]["Enums"]["presentacion_t"]
          valor?: number | null
        }
        Update: {
          activo?: boolean
          codigo_base?: string
          created_at?: string
          descripcion?: string
          empaque?: number
          envase?: Database["public"]["Enums"]["envase_t"]
          especie?: Database["public"]["Enums"]["especie_t"]
          id?: string
          liquido_gobierno?: Database["public"]["Enums"]["liquido_t"]
          presentacion?: Database["public"]["Enums"]["presentacion_t"]
          valor?: number | null
        }
        Relationships: []
      }
      stock_lote_ubicacion: {
        Row: {
          cantidad_cajas: number
          id: string
          lote_id: string
          total_latas: number
          ubicacion_id: string
          updated_at: string
        }
        Insert: {
          cantidad_cajas?: number
          id?: string
          lote_id: string
          total_latas?: number
          ubicacion_id: string
          updated_at?: string
        }
        Update: {
          cantidad_cajas?: number
          id?: string
          lote_id?: string
          total_latas?: number
          ubicacion_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lote_ubicacion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lote_ubicacion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "stock_lote_ubicacion_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicaciones: {
        Row: {
          activo: boolean
          almacen_id: string
          carril: string | null
          codigo: string
          created_at: string
          id: string
          observacion: string | null
          pallets: number | null
          seccion: string | null
        }
        Insert: {
          activo?: boolean
          almacen_id: string
          carril?: string | null
          codigo: string
          created_at?: string
          id?: string
          observacion?: string | null
          pallets?: number | null
          seccion?: string | null
        }
        Update: {
          activo?: boolean
          almacen_id?: string
          carril?: string | null
          codigo?: string
          created_at?: string
          id?: string
          observacion?: string | null
          pallets?: number | null
          seccion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ubicaciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vales: {
        Row: {
          autorizado: string | null
          created_at: string
          descripcion: string | null
          estado: string
          fecha: string
          id: string
          nro_vale: number
          observacion: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          autorizado?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          fecha?: string
          id?: string
          nro_vale: number
          observacion?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          autorizado?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          fecha?: string
          id?: string
          nro_vale?: number
          observacion?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      ventas_correlativos: {
        Row: {
          serie: string
          siguiente_numero: number
          updated_at: string
        }
        Insert: {
          serie: string
          siguiente_numero?: number
          updated_at?: string
        }
        Update: {
          serie?: string
          siguiente_numero?: number
          updated_at?: string
        }
        Relationships: []
      }
      ventas_cot_items: {
        Row: {
          cantidad_cajas: number
          cantidad_latas: number
          cotizacion_id: string
          created_at: string
          descripcion: string
          descuento_pct: number
          empaque: number
          id: string
          importe: number
          latas: number
          orden: number | null
          precio_unitario: number
          producto_id: string
          unidad_precio: string
        }
        Insert: {
          cantidad_cajas?: number
          cantidad_latas?: number
          cotizacion_id: string
          created_at?: string
          descripcion: string
          descuento_pct?: number
          empaque?: number
          id?: string
          importe?: number
          latas?: number
          orden?: number | null
          precio_unitario?: number
          producto_id: string
          unidad_precio?: string
        }
        Update: {
          cantidad_cajas?: number
          cantidad_latas?: number
          cotizacion_id?: string
          created_at?: string
          descripcion?: string
          descuento_pct?: number
          empaque?: number
          id?: string
          importe?: number
          latas?: number
          orden?: number | null
          precio_unitario?: number
          producto_id?: string
          unidad_precio?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cot_items_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "ventas_cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cot_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_cotizaciones: {
        Row: {
          cliente_id: string
          codigo: string
          condicion_pago: string | null
          created_at: string
          descuento_global: number
          estado: Database["public"]["Enums"]["ventas_estado_cot_t"]
          fecha_emision: string
          fecha_validez: string | null
          id: string
          igv: number
          moneda: string
          numero: number
          observaciones: string | null
          serie: string
          subtotal: number
          tipo_cambio: number | null
          total: number
          updated_at: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          cliente_id: string
          codigo: string
          condicion_pago?: string | null
          created_at?: string
          descuento_global?: number
          estado?: Database["public"]["Enums"]["ventas_estado_cot_t"]
          fecha_emision?: string
          fecha_validez?: string | null
          id?: string
          igv?: number
          moneda?: string
          numero: number
          observaciones?: string | null
          serie?: string
          subtotal?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          cliente_id?: string
          codigo?: string
          condicion_pago?: string | null
          created_at?: string
          descuento_global?: number
          estado?: Database["public"]["Enums"]["ventas_estado_cot_t"]
          fecha_emision?: string
          fecha_validez?: string | null
          id?: string
          igv?: number
          moneda?: string
          numero?: number
          observaciones?: string | null
          serie?: string
          subtotal?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_factura_items: {
        Row: {
          cantidad_cajas: number
          cantidad_latas: number
          created_at: string
          descripcion: string
          descuento_pct: number
          empaque: number
          factura_id: string
          id: string
          igv_linea: number
          importe: number
          latas: number
          orden: number | null
          precio_unitario: number
          producto_id: string
          tipo_afectacion_igv: string
          unidad_precio: string
          valor_venta: number
        }
        Insert: {
          cantidad_cajas?: number
          cantidad_latas?: number
          created_at?: string
          descripcion: string
          descuento_pct?: number
          empaque?: number
          factura_id: string
          id?: string
          igv_linea?: number
          importe?: number
          latas?: number
          orden?: number | null
          precio_unitario?: number
          producto_id: string
          tipo_afectacion_igv?: string
          unidad_precio?: string
          valor_venta?: number
        }
        Update: {
          cantidad_cajas?: number
          cantidad_latas?: number
          created_at?: string
          descripcion?: string
          descuento_pct?: number
          empaque?: number
          factura_id?: string
          id?: string
          igv_linea?: number
          importe?: number
          latas?: number
          orden?: number | null
          precio_unitario?: number
          producto_id?: string
          tipo_afectacion_igv?: string
          unidad_precio?: string
          valor_venta?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_factura_items_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "ventas_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_factura_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_facturas: {
        Row: {
          cliente_id: string
          cliente_razon_social: string | null
          cliente_ruc: string | null
          codigo: string
          condicion_pago: string | null
          created_at: string
          descuento: number
          estado: Database["public"]["Enums"]["ventas_estado_fac_t"]
          fecha_emision: string
          fecha_vencimiento: string | null
          hash_cpe: string | null
          id: string
          igv: number
          moneda: string
          numero: number
          observaciones: string | null
          op_exonerada: number
          op_gravada: number
          op_inafecta: number
          orden_id: string | null
          prestamo: boolean
          serie: string
          tipo_cambio: number | null
          tipo_comprobante: string
          total: number
          updated_at: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          cliente_id: string
          cliente_razon_social?: string | null
          cliente_ruc?: string | null
          codigo: string
          condicion_pago?: string | null
          created_at?: string
          descuento?: number
          estado?: Database["public"]["Enums"]["ventas_estado_fac_t"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          hash_cpe?: string | null
          id?: string
          igv?: number
          moneda?: string
          numero: number
          observaciones?: string | null
          op_exonerada?: number
          op_gravada?: number
          op_inafecta?: number
          orden_id?: string | null
          prestamo?: boolean
          serie?: string
          tipo_cambio?: number | null
          tipo_comprobante?: string
          total?: number
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          cliente_id?: string
          cliente_razon_social?: string | null
          cliente_ruc?: string | null
          codigo?: string
          condicion_pago?: string | null
          created_at?: string
          descuento?: number
          estado?: Database["public"]["Enums"]["ventas_estado_fac_t"]
          fecha_emision?: string
          fecha_vencimiento?: string | null
          hash_cpe?: string | null
          id?: string
          igv?: number
          moneda?: string
          numero?: number
          observaciones?: string | null
          op_exonerada?: number
          op_gravada?: number
          op_inafecta?: number
          orden_id?: string | null
          prestamo?: boolean
          serie?: string
          tipo_cambio?: number | null
          tipo_comprobante?: string
          total?: number
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_facturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_facturas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ventas_ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_guia_items: {
        Row: {
          cantidad_cajas: number
          cantidad_latas: number
          created_at: string
          descripcion: string
          empaque: number
          guia_id: string
          id: string
          latas: number | null
          lote_id: string
          movimiento_id: string | null
          orden: number | null
          orden_item_id: string | null
          producto_id: string
          ubicacion_id: string
        }
        Insert: {
          cantidad_cajas?: number
          cantidad_latas?: number
          created_at?: string
          descripcion: string
          empaque?: number
          guia_id: string
          id?: string
          latas?: number | null
          lote_id: string
          movimiento_id?: string | null
          orden?: number | null
          orden_item_id?: string | null
          producto_id: string
          ubicacion_id: string
        }
        Update: {
          cantidad_cajas?: number
          cantidad_latas?: number
          created_at?: string
          descripcion?: string
          empaque?: number
          guia_id?: string
          id?: string
          latas?: number | null
          lote_id?: string
          movimiento_id?: string | null
          orden?: number | null
          orden_item_id?: string | null
          producto_id?: string
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_guia_items_guia_id_fkey"
            columns: ["guia_id"]
            isOneToOne: false
            referencedRelation: "ventas_guias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_guia_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_guia_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "ventas_guia_items_orden_item_id_fkey"
            columns: ["orden_item_id"]
            isOneToOne: false
            referencedRelation: "ventas_orden_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_guia_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_guia_items_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_guias: {
        Row: {
          bultos: number | null
          cliente_id: string
          codigo: string
          conductor: string | null
          created_at: string
          emitida_at: string | null
          estado: Database["public"]["Enums"]["ventas_estado_guia_t"]
          factura_id: string | null
          fecha_emision: string
          fecha_traslado: string | null
          id: string
          motivo_traslado: string | null
          numero: number
          observaciones: string | null
          orden_id: string | null
          peso_total_kg: number | null
          placa: string | null
          punto_llegada: string | null
          punto_partida: string | null
          serie: string
          transportista: string | null
          transportista_ruc: string | null
          updated_at: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          bultos?: number | null
          cliente_id: string
          codigo: string
          conductor?: string | null
          created_at?: string
          emitida_at?: string | null
          estado?: Database["public"]["Enums"]["ventas_estado_guia_t"]
          factura_id?: string | null
          fecha_emision?: string
          fecha_traslado?: string | null
          id?: string
          motivo_traslado?: string | null
          numero: number
          observaciones?: string | null
          orden_id?: string | null
          peso_total_kg?: number | null
          placa?: string | null
          punto_llegada?: string | null
          punto_partida?: string | null
          serie?: string
          transportista?: string | null
          transportista_ruc?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          bultos?: number | null
          cliente_id?: string
          codigo?: string
          conductor?: string | null
          created_at?: string
          emitida_at?: string | null
          estado?: Database["public"]["Enums"]["ventas_estado_guia_t"]
          factura_id?: string | null
          fecha_emision?: string
          fecha_traslado?: string | null
          id?: string
          motivo_traslado?: string | null
          numero?: number
          observaciones?: string | null
          orden_id?: string | null
          peso_total_kg?: number | null
          placa?: string | null
          punto_llegada?: string | null
          punto_partida?: string | null
          serie?: string
          transportista?: string | null
          transportista_ruc?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_guias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_guias_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "ventas_facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_guias_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ventas_ordenes"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_orden_items: {
        Row: {
          cantidad_cajas: number
          cantidad_despachada_cajas: number | null
          cantidad_latas: number
          cantidad_reservada_cajas: number | null
          created_at: string
          descripcion: string
          descuento_pct: number
          empaque: number
          id: string
          importe: number
          latas: number
          lote_id: string | null
          orden: number | null
          orden_id: string
          precio_unitario: number
          producto_id: string
          ubicacion_id: string | null
          unidad_precio: string
        }
        Insert: {
          cantidad_cajas?: number
          cantidad_despachada_cajas?: number | null
          cantidad_latas?: number
          cantidad_reservada_cajas?: number | null
          created_at?: string
          descripcion: string
          descuento_pct?: number
          empaque?: number
          id?: string
          importe?: number
          latas?: number
          lote_id?: string | null
          orden?: number | null
          orden_id: string
          precio_unitario?: number
          producto_id: string
          ubicacion_id?: string | null
          unidad_precio?: string
        }
        Update: {
          cantidad_cajas?: number
          cantidad_despachada_cajas?: number | null
          cantidad_latas?: number
          cantidad_reservada_cajas?: number | null
          created_at?: string
          descripcion?: string
          descuento_pct?: number
          empaque?: number
          id?: string
          importe?: number
          latas?: number
          lote_id?: string | null
          orden?: number | null
          orden_id?: string
          precio_unitario?: number
          producto_id?: string
          ubicacion_id?: string | null
          unidad_precio?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_orden_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_orden_items_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "ventas_orden_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ventas_ordenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_orden_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_orden_items_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_ordenes: {
        Row: {
          cliente_id: string
          codigo: string
          condicion_pago: string | null
          cotizacion_id: string | null
          created_at: string
          direccion_entrega: string | null
          estado: Database["public"]["Enums"]["ventas_estado_ov_t"]
          fecha_emision: string
          fecha_entrega: string | null
          id: string
          igv: number
          moneda: string
          numero: number
          observaciones: string | null
          oc_cliente_ref: string | null
          serie: string
          subtotal: number
          tipo_cambio: number | null
          total: number
          updated_at: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          cliente_id: string
          codigo: string
          condicion_pago?: string | null
          cotizacion_id?: string | null
          created_at?: string
          direccion_entrega?: string | null
          estado?: Database["public"]["Enums"]["ventas_estado_ov_t"]
          fecha_emision?: string
          fecha_entrega?: string | null
          id?: string
          igv?: number
          moneda?: string
          numero: number
          observaciones?: string | null
          oc_cliente_ref?: string | null
          serie?: string
          subtotal?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          cliente_id?: string
          codigo?: string
          condicion_pago?: string | null
          cotizacion_id?: string | null
          created_at?: string
          direccion_entrega?: string | null
          estado?: Database["public"]["Enums"]["ventas_estado_ov_t"]
          fecha_emision?: string
          fecha_entrega?: string | null
          id?: string
          igv?: number
          moneda?: string
          numero?: number
          observaciones?: string | null
          oc_cliente_ref?: string | null
          serie?: string
          subtotal?: number
          tipo_cambio?: number | null
          total?: number
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_ordenes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_ordenes_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "ventas_cotizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      warrants: {
        Row: {
          cantidad_cajas_warrant: number
          created_at: string
          empresa: string | null
          estado: Database["public"]["Enums"]["estado_warrant_t"]
          fecha_inicio: string
          fecha_liberacion: string | null
          fin_warrant: string | null
          financiera: string | null
          id: string
          lote_id: string
          nro_warrant: string
          total_latas_warrant: number
        }
        Insert: {
          cantidad_cajas_warrant: number
          created_at?: string
          empresa?: string | null
          estado?: Database["public"]["Enums"]["estado_warrant_t"]
          fecha_inicio: string
          fecha_liberacion?: string | null
          fin_warrant?: string | null
          financiera?: string | null
          id?: string
          lote_id: string
          nro_warrant: string
          total_latas_warrant?: number
        }
        Update: {
          cantidad_cajas_warrant?: number
          created_at?: string
          empresa?: string | null
          estado?: Database["public"]["Enums"]["estado_warrant_t"]
          fecha_inicio?: string
          fecha_liberacion?: string | null
          fin_warrant?: string | null
          financiera?: string | null
          id?: string
          lote_id?: string
          nro_warrant?: string
          total_latas_warrant?: number
        }
        Relationships: [
          {
            foreignKeyName: "warrants_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warrants_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
        ]
      }
    }
    Views: {
      v_stock_disponible_fefo: {
        Row: {
          cantidad_cajas: number | null
          codigo_lote: string | null
          estado: string | null
          etiqueta: string | null
          fecha_vencimiento: string | null
          lote_id: string | null
          mercado: string | null
          producto_id: string | null
          ubicacion_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lote_ubicacion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lote_ubicacion_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "stock_lote_ubicacion_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_latas_ubic: {
        Row: {
          latas: number | null
          lote_id: string | null
          ubicacion_id: string | null
        }
        Relationships: []
      }
      v_stock_lote: {
        Row: {
          codigo_lote: string | null
          comprometido_warrant: number | null
          estado: string | null
          etiqueta: string | null
          fecha_produccion: string | null
          fecha_vencimiento: string | null
          holgura: number | null
          lote_id: string | null
          mercado: string | null
          producto_id: string | null
          stock_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_insumos_movimientos: {
        Row: {
          cantidad: number | null
          categoria: string | null
          clase: string | null
          codigo: string | null
          created_at: string | null
          fecha: string | null
          grupo: string | null
          id: string | null
          insumo_id: string | null
          nro_guia: string | null
          observacion: string | null
          proveedor: string | null
          saldo_post: number | null
          subcategoria: string | null
          tipo_mov: Database["public"]["Enums"]["tipo_mov_insumo_t"] | null
          transportista: string | null
          usuario_id: string | null
          vale_num: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumos_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_movimientos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "vista_insumos_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_insumos_stock: {
        Row: {
          activo: boolean | null
          categoria: string | null
          codigo: string | null
          descripcion: string | null
          empaque: string | null
          estado: string | null
          formato: string | null
          grupo: string | null
          id: string | null
          ingresos: number | null
          insumo: string | null
          provee: string | null
          saldo_emp: number | null
          saldo_inicial: number | null
          saldo_und: number | null
          salidas: number | null
          stock_min_und: number | null
          subcategoria: string | null
          ult_mov: string | null
          und_x_empaque: number | null
          unidad: string | null
        }
        Relationships: []
      }
      vista_lote_movimientos_latas: {
        Row: {
          cajas_derivadas: number | null
          codigo_lote: string | null
          created_at: string | null
          delta_latas: number | null
          empaque: number | null
          fecha: string | null
          id: string | null
          latas_derivadas: number | null
          lote_id: string | null
          motivo: string | null
          nro_guia: string | null
          nro_vale: string | null
          observaciones: string | null
          producto: string | null
          producto_codigo: string | null
          tipo: Database["public"]["Enums"]["tipo_mov_t"] | null
          total_latas: number | null
          ubic_destino: string | null
          ubic_origen: string | null
          ubicacion_destino_id: string | null
          ubicacion_origen_id: string | null
          usuario_nombre: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "v_stock_lote"
            referencedColumns: ["lote_id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _admin_recalc_mov: {
        Args: { p_dest: string; p_lote: string; p_orig: string }
        Returns: undefined
      }
      _admin_table_allowed: { Args: { p_tabla: string }; Returns: boolean }
      admin_delete_catalogo: {
        Args: { p_id: string; p_tabla: string }
        Returns: undefined
      }
      admin_delete_row: {
        Args: { p_id: string; p_tabla: string }
        Returns: undefined
      }
      admin_editar_insumo_mov: {
        Args: {
          p_cantidad: number
          p_fecha: string
          p_insumo_id: string
          p_mov: string
          p_nro_guia: string
          p_observacion: string
          p_proveedor: string
          p_saldo_post: number
          p_tipo: Database["public"]["Enums"]["tipo_mov_insumo_t"]
          p_transportista: string
          p_vale_num: string
        }
        Returns: undefined
      }
      admin_editar_movimiento: {
        Args: {
          p_autorizado?: string
          p_cantidad_cajas: number
          p_cliente: string
          p_donacion?: boolean
          p_empaque?: number
          p_fecha: string
          p_latas: number
          p_lote_id: string
          p_mercado_id?: string
          p_motivo: string
          p_mov: string
          p_nro_guia: string
          p_nro_vale: string
          p_nro_warrant: string
          p_observaciones: string
          p_piso: number
          p_tamano?: string
          p_tercero?: string
          p_tiene_etiqueta?: boolean
          p_tipo: Database["public"]["Enums"]["tipo_mov_t"]
          p_ubic_destino: string
          p_ubic_origen: string
        }
        Returns: undefined
      }
      admin_eliminar_insumo_mov: { Args: { p_mov: string }; Returns: undefined }
      admin_eliminar_movimiento: { Args: { p_mov: string }; Returns: undefined }
      admin_list_table_columns: {
        Args: { p_tabla: string }
        Returns: {
          column_default: string
          column_name: string
          data_type: string
          is_nullable: string
          ordinal_position: number
          udt_name: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          last_sign_in_at: string
          roles: Database["public"]["Enums"]["app_role"][]
          user_id: string
        }[]
      }
      admin_revert_audit: { Args: { p_audit_id: string }; Returns: Json }
      admin_set_user_roles: {
        Args: {
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_user: string
        }
        Returns: undefined
      }
      admin_update_row: {
        Args: { p_id: string; p_patch: Json; p_tabla: string }
        Returns: Json
      }
      aprobar_inventario: { Args: { p_inventario: string }; Returns: number }
      cambiar_lote: {
        Args: {
          p_cantidad: number
          p_estado_destino?: string
          p_fecha?: string
          p_fp_destino?: string
          p_fv_destino?: string
          p_latas?: number
          p_lote_origen: string
          p_observaciones?: string
          p_producto_destino?: string
          p_ubicacion: string
        }
        Returns: string
      }
      claim_role_with_password: {
        Args: {
          p_password: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      crear_inventario_fisico: {
        Args: { p_almacen: string; p_observacion?: string }
        Returns: string
      }
      ejecutar_orden_etiquetado: {
        Args: {
          p_cantidad_etiquetada: number
          p_etiqueta_destino: string
          p_lote_origen: string
          p_merma_proceso: number
          p_observacion?: string
          p_ubicacion: string
        }
        Returns: string
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_operador_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_or_admin: { Args: { _user_id: string }; Returns: boolean }
      recalc_saldos_insumo: { Args: { p_insumo: string }; Returns: undefined }
      recalc_stock_lote_ubic: {
        Args: { p_lote: string; p_ubic: string }
        Returns: undefined
      }
      registrar_movimiento: {
        Args: {
          p_autorizado?: string
          p_cantidad?: number
          p_cliente_proveedor?: string
          p_donacion?: boolean
          p_empaque?: number
          p_estado_lote?: string
          p_fecha?: string
          p_inicia_warrant?: string
          p_latas?: number
          p_lote_id: string
          p_mercado_id?: string
          p_motivo?: string
          p_nro_guia?: string
          p_nro_vale?: string
          p_nro_warrant?: string
          p_observaciones?: string
          p_piso?: number
          p_tamano?: string
          p_tercero?: string
          p_tiene_etiqueta?: boolean
          p_tipo: Database["public"]["Enums"]["tipo_mov_t"]
          p_total_latas?: number
          p_ubic_destino?: string
          p_ubic_origen?: string
          p_vence_warrant?: string
        }
        Returns: string
      }
      registrar_movimiento_insumo: {
        Args: {
          p_cantidad: number
          p_fecha?: string
          p_insumo_id: string
          p_nro_guia?: string
          p_observacion?: string
          p_proveedor?: string
          p_tipo: Database["public"]["Enums"]["tipo_mov_insumo_t"]
          p_transportista?: string
          p_vale_num?: string
        }
        Returns: string
      }
      upsert_lote: {
        Args: {
          p_estado: string
          p_fp: string
          p_fv: string
          p_mercado?: string
          p_producto: string
        }
        Returns: string
      }
      ventas_anular_factura: {
        Args: { p_fac: string; p_motivo?: string }
        Returns: undefined
      }
      ventas_anular_guia: {
        Args: { p_guia: string; p_motivo?: string }
        Returns: undefined
      }
      ventas_convertir_cot_a_orden: { Args: { p_cot: string }; Returns: string }
      ventas_convertir_factura_a_guia: {
        Args: { p_fac: string }
        Returns: string
      }
      ventas_convertir_orden_a_factura: {
        Args: { p_ov: string; p_serie?: string; p_tipo?: string }
        Returns: string
      }
      ventas_convertir_orden_a_guia: { Args: { p_ov: string }; Returns: string }
      ventas_emitir_guia: { Args: { p_guia: string }; Returns: undefined }
      ventas_next_codigo: { Args: { p_serie: string }; Returns: string }
    }
    Enums: {
      app_role: "ADMIN" | "OPERADOR" | "VISITA" | "INSUMOS"
      cot_estado_t:
        | "BORRADOR"
        | "ENVIADA"
        | "ACEPTADA"
        | "CONVERTIDA"
        | "ANULADA"
      envase_t: "1/2 LB" | "1/2 LB-108" | "1 LB TALL" | "TINAPON"
      especie_t:
        | "BONITO"
        | "ATUN"
        | "JUREL"
        | "CABALLA"
        | "ANCHOVETA"
        | "CALAMAR"
        | "SARDINA"
        | "MELVA"
        | "POTA"
        | "TRUCHA"
        | "PULPO"
      estado_inv_fisico_t:
        | "BORRADOR"
        | "EN_CONTEO"
        | "PENDIENTE_APROBACION"
        | "APROBADO"
        | "CANCELADO"
      estado_lote_t:
        | "DISPONIBLE"
        | "INMOVILIZADO"
        | "POR_CERTIFICAR"
        | "EN_PROCESO"
        | "CUARENTENA"
        | "CERTIFICADO"
      estado_warrant_t: "ACTIVO" | "LIBERADO"
      factura_estado_t: "EMITIDA" | "ANULADA"
      guia_estado_t: "BORRADOR" | "EMITIDA" | "ANULADA"
      liquido_t:
        | "ACEITE"
        | "AGUA Y SAL"
        | "SALSA DE TOMATE"
        | "SALSA DE TOMATE PICANTE"
        | "SALSA DE ESCABECHE"
      orden_estado_t: "PENDIENTE" | "FACTURADA" | "DESPACHADA" | "ANULADA"
      presentacion_t:
        | "FILETE"
        | "ENTERO"
        | "GRATED"
        | "FILETE CON PIEL"
        | "FILETE CON SANGACHO"
        | "FILETE SIN SANGACHO"
        | "CUBOS"
        | "MEDALLON"
        | "TROZOS"
        | "SOLIDO"
        | "LOMITOS"
      tipo_cp_t: "CLIENTE" | "PROVEEDOR" | "AMBOS"
      tipo_mov_insumo_t:
        | "INGRESO_GUIA"
        | "STOCK_INICIAL"
        | "DEVOLUCION"
        | "AJUSTE_POS"
        | "PRODUCCION"
        | "MUESTRAS"
        | "CALIBRACION"
        | "MERMA"
        | "PRESTAMO"
        | "AJUSTE_NEG"
      tipo_mov_t:
        | "ENTRADA"
        | "SALIDA"
        | "TRASLADO"
        | "AJUSTE_POSITIVO"
        | "AJUSTE_NEGATIVO"
        | "MERMA"
        | "CAMBIO"
      venta_moneda_t: "PEN" | "USD"
      ventas_estado_cot_t:
        | "BORRADOR"
        | "ENVIADA"
        | "ACEPTADA"
        | "RECHAZADA"
        | "VENCIDA"
        | "CONVERTIDA"
      ventas_estado_fac_t: "EMITIDA" | "PAGADA" | "ANULADA"
      ventas_estado_guia_t: "BORRADOR" | "EMITIDA" | "ANULADA"
      ventas_estado_ov_t:
        | "PENDIENTE"
        | "RESERVADA"
        | "PARCIAL"
        | "FACTURADA"
        | "DESPACHADA"
        | "ANULADA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["ADMIN", "OPERADOR", "VISITA", "INSUMOS"],
      cot_estado_t: [
        "BORRADOR",
        "ENVIADA",
        "ACEPTADA",
        "CONVERTIDA",
        "ANULADA",
      ],
      envase_t: ["1/2 LB", "1/2 LB-108", "1 LB TALL", "TINAPON"],
      especie_t: [
        "BONITO",
        "ATUN",
        "JUREL",
        "CABALLA",
        "ANCHOVETA",
        "CALAMAR",
        "SARDINA",
        "MELVA",
        "POTA",
        "TRUCHA",
        "PULPO",
      ],
      estado_inv_fisico_t: [
        "BORRADOR",
        "EN_CONTEO",
        "PENDIENTE_APROBACION",
        "APROBADO",
        "CANCELADO",
      ],
      estado_lote_t: [
        "DISPONIBLE",
        "INMOVILIZADO",
        "POR_CERTIFICAR",
        "EN_PROCESO",
        "CUARENTENA",
        "CERTIFICADO",
      ],
      estado_warrant_t: ["ACTIVO", "LIBERADO"],
      factura_estado_t: ["EMITIDA", "ANULADA"],
      guia_estado_t: ["BORRADOR", "EMITIDA", "ANULADA"],
      liquido_t: [
        "ACEITE",
        "AGUA Y SAL",
        "SALSA DE TOMATE",
        "SALSA DE TOMATE PICANTE",
        "SALSA DE ESCABECHE",
      ],
      orden_estado_t: ["PENDIENTE", "FACTURADA", "DESPACHADA", "ANULADA"],
      presentacion_t: [
        "FILETE",
        "ENTERO",
        "GRATED",
        "FILETE CON PIEL",
        "FILETE CON SANGACHO",
        "FILETE SIN SANGACHO",
        "CUBOS",
        "MEDALLON",
        "TROZOS",
        "SOLIDO",
        "LOMITOS",
      ],
      tipo_cp_t: ["CLIENTE", "PROVEEDOR", "AMBOS"],
      tipo_mov_insumo_t: [
        "INGRESO_GUIA",
        "STOCK_INICIAL",
        "DEVOLUCION",
        "AJUSTE_POS",
        "PRODUCCION",
        "MUESTRAS",
        "CALIBRACION",
        "MERMA",
        "PRESTAMO",
        "AJUSTE_NEG",
      ],
      tipo_mov_t: [
        "ENTRADA",
        "SALIDA",
        "TRASLADO",
        "AJUSTE_POSITIVO",
        "AJUSTE_NEGATIVO",
        "MERMA",
        "CAMBIO",
      ],
      venta_moneda_t: ["PEN", "USD"],
      ventas_estado_cot_t: [
        "BORRADOR",
        "ENVIADA",
        "ACEPTADA",
        "RECHAZADA",
        "VENCIDA",
        "CONVERTIDA",
      ],
      ventas_estado_fac_t: ["EMITIDA", "PAGADA", "ANULADA"],
      ventas_estado_guia_t: ["BORRADOR", "EMITIDA", "ANULADA"],
      ventas_estado_ov_t: [
        "PENDIENTE",
        "RESERVADA",
        "PARCIAL",
        "FACTURADA",
        "DESPACHADA",
        "ANULADA",
      ],
    },
  },
} as const
