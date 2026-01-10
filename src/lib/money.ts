export function eurosToCents(euros: number) {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number) {
  return cents / 100;
}

export function parseEuroAmount(raw: string): number | null {
  const s0 = raw.trim();
  if (!s0) return null;
  const s = s0.replace(/[\u00a0\u202f\s]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatEUR(cents: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(centsToEuros(cents));
}
