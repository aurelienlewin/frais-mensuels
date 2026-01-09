export function eurosToCents(euros: number) {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number) {
  return cents / 100;
}

export function formatEUR(cents: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(centsToEuros(cents));
}

