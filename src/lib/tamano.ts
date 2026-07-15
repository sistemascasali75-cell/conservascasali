// Reglas de "Tamaño" según el envase del producto
// - 1/2 LB      -> default "109", opción "108"
// - 1 LB TALL   -> default "1 LB TALL", opción "TINAPON"
// - Otros       -> vacío / libre (sin opciones sugeridas)

export type TamanoConfig = {
  options: string[];
  defaultValue: string;
};

export function getTamanoConfig(envase?: string | null): TamanoConfig {
  const e = (envase ?? "").trim().toUpperCase();
  if (e === "1/2 LB") return { options: ["109", "108"], defaultValue: "109" };
  if (e === "1 LB TALL") return { options: ["1 LB TALL", "TINAPON"], defaultValue: "1 LB TALL" };
  return { options: [], defaultValue: "" };
}

export function defaultTamano(envase?: string | null): string {
  return getTamanoConfig(envase).defaultValue;
}
