const COOKIE = "bygate_user_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return (
    process.env.USER_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "bygate-user-dev-secret"
  );
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

export async function createUserToken(phone: string) {
  const phonePart = Buffer.from(phone, "utf8").toString("base64url");
  const exp = Date.now() + MAX_AGE * 1000;
  const body = `${phonePart}.${exp}`;
  const sig = await hmacHex(body);
  return `${body}.${sig}`;
}

export async function readUserToken(token: string | undefined | null) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [phonePart, expStr, sig] = parts;
  const body = `${phonePart}.${expStr}`;
  const expected = await hmacHex(body);
  if (sig !== expected) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  let phone = "";
  try {
    phone = Buffer.from(phonePart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!phone) return null;
  return { phone };
}

export { COOKIE as USER_COOKIE, MAX_AGE as USER_MAX_AGE };
