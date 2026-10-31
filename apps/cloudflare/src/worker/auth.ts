import { createLocalJWKSet, createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { JSONWebKeySet, JWTVerifyGetKey } from "jose";

const encoder = new TextEncoder();

async function digest(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(text));
}

/** Compares two secrets in constant time; hashing first hides the length of either. */
export async function secretsEqual(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer (\S+)$/.exec(request.headers.get("Authorization") ?? "");
  return match?.[1] ?? null;
}

/**
 * Device handshake check (docs/spec/03 §2). The token is checked before `car_id`, and both
 * failures give the same answer, so the response does not reveal which car ids exist.
 */
export async function isAuthorizedDevice(
  request: Request,
  carId: string,
  env: Env,
): Promise<boolean> {
  const token = bearerToken(request);
  const tokenOk = token !== null && (await secretsEqual(token, env.DEVICE_TOKEN));
  return tokenOk && carId === env.CAR_ID;
}

const ACCESS_HEADER = "Cf-Access-Jwt-Assertion";
const ACCESS_COOKIE = "CF_Authorization";

/** Reads a cookie value as sent; Access does not quote `CF_Authorization`. */
function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return value.join("=");
    }
  }
  return null;
}

/** The Access JWT: Access sets the header on proxied requests and the cookie in the browser. */
function accessToken(request: Request): string | null {
  return request.headers.get(ACCESS_HEADER) ?? cookie(request, ACCESS_COOKIE);
}

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

/**
 * `ACCESS_JWKS` replaces the team's key set for tests and `wrangler dev` only; it never
 * appears in `wrangler.jsonc` (docs/adr/0013).
 */
function accessKeys(env: Env): JWTVerifyGetKey {
  if (env.ACCESS_JWKS !== undefined) {
    return createLocalJWKSet(JSON.parse(env.ACCESS_JWKS) as JSONWebKeySet);
  }
  const url = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  let keys = remoteKeySets.get(url);
  if (keys === undefined) {
    keys = createRemoteJWKSet(new URL(url));
    remoteKeySets.set(url, keys);
  }
  return keys;
}

/** Operator check for the panel page and the driver WebSocket (docs/spec/03 §2). */
export async function isAuthorizedOperator(request: Request, env: Env): Promise<boolean> {
  const token = accessToken(request);
  if (token === null) {
    return false;
  }
  try {
    await jwtVerify(token, accessKeys(env), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
    });
    return true;
  } catch (error) {
    if (error instanceof errors.JOSEError) {
      return false;
    }
    throw error;
  }
}

/** The driver WebSocket must come from one of the panel's own origins, not any page. */
export function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("Origin");
  return (
    origin !== null && env.ALLOWED_ORIGINS.split(",").some((allowed) => allowed.trim() === origin)
  );
}
