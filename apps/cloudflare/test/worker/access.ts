import { env } from "cloudflare:workers";
import { importJWK, SignJWT } from "jose";

/** Signs an Access-shaped JWT with the per-run test key from vitest.config.ts. */
export async function accessJwt(claims: { iss?: string; aud?: string; expSeconds?: number } = {}) {
  const jwk = (env as Env & { TEST_ACCESS_PRIVATE_JWK: string }).TEST_ACCESS_PRIVATE_JWK;
  const key = await importJWK(JSON.parse(jwk) as Parameters<typeof importJWK>[0], "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "operator@rc.example" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(claims.iss ?? `https://${env.ACCESS_TEAM_DOMAIN}`)
    .setAudience(claims.aud ?? env.ACCESS_AUD)
    .setIssuedAt(now)
    .setExpirationTime(now + (claims.expSeconds ?? 300))
    .sign(key);
}
