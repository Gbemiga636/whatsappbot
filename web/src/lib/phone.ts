/** Canonical NG phone → 234… (same rules as WhatsApp bot). */
export function normalizePhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  const p = normalizePhone(phone);
  if (!p) return String(phone || "");
  if (p.startsWith("234") && p.length === 13) {
    return `0${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}`;
  }
  return `+${p}`;
}

export function isValidNgPhone(phone: string): boolean {
  const p = normalizePhone(phone);
  return /^234[789]\d{9}$/.test(p);
}
