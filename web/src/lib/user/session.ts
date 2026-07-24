import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  USER_COOKIE,
  USER_MAX_AGE,
  createUserToken,
  readUserToken,
} from "./session-token";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Secure cookies break on http://localhost during `next dev`
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: USER_MAX_AGE,
};

export async function getUserSession() {
  const jar = await cookies();
  return readUserToken(jar.get(USER_COOKIE)?.value);
}

export async function attachUserSessionCookie(res: NextResponse, phone: string) {
  const token = await createUserToken(phone);
  res.cookies.set(USER_COOKIE, token, cookieOptions);
  return res;
}

export function clearUserSessionOnResponse(res: NextResponse) {
  res.cookies.set(USER_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
