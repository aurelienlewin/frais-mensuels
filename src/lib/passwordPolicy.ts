function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function passwordPolicy(email: string, password: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const pw = password ?? '';
  if (pw.length < 12) reasons.push('12 caractères minimum');
  if (pw.length > 128) reasons.push('128 caractères maximum');
  const lower = /[a-z]/.test(pw);
  const upper = /[A-Z]/.test(pw);
  const digit = /\d/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;
  if (classes < 3) reasons.push('Au moins 3 types: minuscule, majuscule, chiffre, symbole');

  const emailNorm = normalizeEmail(email);
  const emailUser = emailNorm.split('@')[0] ?? '';
  if (emailUser && pw.toLowerCase().includes(emailUser) && emailUser.length >= 3) {
    reasons.push("Ne doit pas contenir l'email");
  }

  const common = new Set([
    'password',
    'password123',
    '123456',
    '12345678',
    '123456789',
    'qwerty',
    'azerty',
    '111111',
    '000000',
    'letmein',
    'admin',
    'welcome',
  ]);
  if (common.has(pw.trim().toLowerCase())) reasons.push('Mot de passe trop commun');

  return { ok: reasons.length === 0, reasons };
}

export function passwordScore(email: string, password: string): 0 | 1 | 2 | 3 | 4 {
  const policy = passwordPolicy(email, password);
  if (password.length === 0) return 0;
  if (policy.ok && password.length >= 16) return 4;
  if (policy.ok) return 3;
  if (policy.reasons.length <= 1) return 2;
  return 1;
}

