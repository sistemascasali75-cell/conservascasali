// Decodificador del código base de producto.
// Formato: [EE][C][S][L][N+]  Ejemplo: BREEAA
//   EE = Empresa (2 letras)
//   C  = Tipo de corte / presentación (1 letra)
//   S  = Especie (1 letra)
//   L  = Líquido de gobierno (1 letra)
//   N+ = Correlativo (1 o más caracteres)

export const EMPRESAS: Record<string, string> = {
  BR: "BRANSOMAR S.A.C",
};

export const CORTES: Record<string, string> = {
  E: "ENTERO",
  F: "FILETE",
  P: "FILETE CON PIEL",
  Z: "FILETE CON SANGACHO",
  N: "FILETE SIN SANGACHO",
  C: "CUBOS",
  M: "MEDALLON",
  G: "GRATED",
  K: "TROZOS",
  S: "SOLIDO",
  L: "LOMITOS",
};

export const ESPECIES: Record<string, string> = {
  C: "CABALLA",
  J: "JUREL",
  K: "CALAMAR",
  S: "SARDINA",
  M: "MELVA",
  P: "POTA",
  A: "ATUN",
  T: "TRUCHA",
  Q: "PULPO",
  B: "BONITO",
  E: "ANCHOVETA",
};

export const LIQUIDOS: Record<string, string> = {
  S: "AGUA Y SAL",
  T: "SALSA DE TOMATE",
  P: "SALSA DE TOMATE PICANTE",
  I: "SALSA DE ESCABECHE",
  A: "ACEITE",
};

export const CORTES_LABEL: Record<string, string> = {
  ...CORTES,
  GRATED: "DESMENUZADO (GRATED)",
};
export const LIQUIDOS_LABEL: Record<string, string> = {
  ...LIQUIDOS,
  ACEITE: "ACEITE VEGETAL",
};

export type CodigoDecoded = {
  raw: string;
  empresa?: string;
  empresaNombre?: string;
  corteLetra?: string;
  corte?: string;
  especieLetra?: string;
  especie?: string;
  liquidoLetra?: string;
  liquido?: string;
  correlativo?: string;
  isValid: boolean;
  descripcion: string;
};

export function decodeCodigo(code: string): CodigoDecoded {
  const raw = (code ?? "").trim().toUpperCase();
  const result: CodigoDecoded = { raw, isValid: false, descripcion: "" };
  if (raw.length < 5) return result;

  const empresa = raw.slice(0, 2);
  const c = raw[2];
  const s = raw[3];
  const l = raw[4];
  const correlativo = raw.slice(5);

  result.empresa = empresa;
  result.empresaNombre = EMPRESAS[empresa];
  result.corteLetra = c;
  result.corte = CORTES[c];
  result.especieLetra = s;
  result.especie = ESPECIES[s];
  result.liquidoLetra = l;
  result.liquido = LIQUIDOS[l];
  result.correlativo = correlativo || undefined;

  result.isValid = !!(result.corte && result.especie && result.liquido);

  const parts = [result.especie, result.corte, result.liquido].filter(Boolean);
  result.descripcion = parts.join(" EN ").replace(/ EN ([A-Z ]+)$/, " EN $1");
  // Construye: "<ESPECIE> <CORTE> EN <LIQUIDO>"
  if (result.especie && result.corte && result.liquido) {
    result.descripcion = `${result.especie} ${CORTES_LABEL[result.corte] ?? result.corte} EN ${LIQUIDOS_LABEL[result.liquido] ?? result.liquido}`;
  } else {
    result.descripcion = parts.join(" · ");
  }

  return result;
}
