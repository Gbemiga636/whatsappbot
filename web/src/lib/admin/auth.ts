import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE,
  createAdminToken,
  readAdminToken,
  verifyAdminCredentials,
} from "./session-token";

export { verifyAdminCredentials, readAdminToken, ADMIN_COOKIE, ADMIN_MAX_AGE };

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Always secure on HTTPS hosts (Netlify). Avoid NODE_ENV quirks on serverless.
  secure: true,
  path: "/",
  maxAge: ADMIN_MAX_AGE,
};

export async function getAdminSession() {
  const jar = await cookies();
  return readAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

/** Attach session cookie to a Route Handler response (required on Netlify/OpenNext). */
export async function attachAdminSessionCookie(res: NextResponse, email: string) {
  const token = await createAdminToken(email);
  res.cookies.set(ADMIN_COOKIE, token, cookieOptions);
  return res;
}

export function clearAdminSessionOnResponse(res: NextResponse) {
  res.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
