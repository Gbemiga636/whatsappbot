import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_MAX_AGE,
  createAdminToken,
  readAdminToken,
  verifyAdminCredentials,
} from "./session-token";

export { verifyAdminCredentials, readAdminToken, ADMIN_COOKIE };

export async function getAdminSession() {
  const jar = await cookies();
  return readAdminToken(jar.get(ADMIN_COOKIE)?.value);
}

export async function setAdminSessionCookie(email: string) {
  const jar = await cookies();
  const token = await createAdminToken(email);
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
}

export async function clearAdminSessionCookie() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}
