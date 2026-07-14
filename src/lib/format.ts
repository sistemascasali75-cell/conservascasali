export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return "0";
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(n));
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

export function daysUntil(d: string | null | undefined): number {
  if (!d) return Infinity;
  const target = new Date(d + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function venceColor(d: string | null | undefined): "ok" | "warn" | "danger" {
  const days = daysUntil(d);
  if (days < 0) return "danger";
  if (days < 90) return "warn";
  return "ok";
}

export function addYearsISO(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCFullYear(dt.getUTCFullYear() + years);
  return dt.toISOString().slice(0, 10);
}
