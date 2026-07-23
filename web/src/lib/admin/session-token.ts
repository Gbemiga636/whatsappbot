const COOKIE = "bygate_admin_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function secret() {
  return process.env.ADMIN_SESSION_SECRET || "bygate-admin-dev-secret";
}

function expectedEmail() {
  return (process.env.ADMIN_EMAIL || "gboisholaja@gmail.com").trim().toLowerCase();
}

async function hmacHex(message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAdminToken(email: string) {
  const exp = Date.now() + MAX_AGE * 1000;
  // Encode email so dots in addresses don't break token parsing
  const emailPart = Buffer.from(email.toLowerCase(), "utf8").toString("base64url");
  const body = `${emailPart}.${exp}`;
  const sig = await hmacHex(body);
  return `${body}.${sig}`;
}

export async function readAdminToken(token: string | undefined | null) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailPart, expStr, sig] = parts;
  const body = `${emailPart}.${expStr}`;
  const expected = await hmacHex(body);
  if (sig !== expected) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  let email = "";
  try {
    email = Buffer.from(emailPart, "base64url").toString("utf8").toLowerCase();
  } catch {
    return null;
  }
  if (!email || email !== expectedEmail()) return null;
  return { email };
}

export function verifyAdminCredentials(email: string, password: string) {
  const e = email.trim().toLowerCase();
  const p = password;
  const wantEmail = expectedEmail();
  const wantPass = process.env.ADMIN_PASSWORD || "";
  return e === wantEmail && !!wantPass && p === wantPass;
}

export { COOKIE as ADMIN_COOKIE, MAX_AGE as ADMIN_MAX_AGE };
