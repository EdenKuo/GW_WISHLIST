import { jwtVerify, SignJWT, createRemoteJWKSet } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

export interface GoogleProfile {
  email: string;
  email_verified: boolean;
  name?: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string
): Promise<GoogleProfile> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });

  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("Google token 未提供 email");
  }

  return {
    email: payload.email,
    email_verified: Boolean(payload.email_verified),
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}

export function isWhitelisted(email: string, adminEmails: string): boolean {
  const list = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天

export async function createSessionCookie(
  email: string,
  secret: string
): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function verifySessionCookie(
  cookieHeader: string | null,
  secret: string
): Promise<{ email: string } | null> {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(
    new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`)
  );
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(
      match[1],
      new TextEncoder().encode(secret)
    );
    if (typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
