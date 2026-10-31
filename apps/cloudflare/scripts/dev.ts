/**
 * `pnpm dev` (docs/adr/0013): makes a throwaway Access signing key, prints a JWT for the
 * `CF_Authorization` cookie on http://localhost:8787 and starts `wrangler dev` with the
 * public key set. The key lives only in this process; nothing about it is written to disk.
 */
import { spawn } from "node:child_process";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const TEAM_DOMAIN = "dev.cloudflareaccess.local";
const AUDIENCE = "rc-dev";
const VALID_SECONDS = 12 * 60 * 60;

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "dev", alg: "RS256" }] };

const now = Math.floor(Date.now() / 1000);
const jwt = await new SignJWT({ email: "operator@localhost" })
  .setProtectedHeader({ alg: "RS256", kid: "dev" })
  .setIssuer(`https://${TEAM_DOMAIN}`)
  .setAudience(AUDIENCE)
  .setIssuedAt(now)
  .setExpirationTime(now + VALID_SECONDS)
  .sign(privateKey);

console.log(
  `Operator session for this run, set as cookie on localhost:8787:\nCF_Authorization=${jwt}\n`,
);

const vars = {
  ACCESS_JWKS: JSON.stringify(jwks),
  ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  ACCESS_AUD: AUDIENCE,
};
const args = [
  "wrangler",
  "dev",
  ...Object.entries(vars).flatMap(([key, value]) => ["--var", `${key}:${value}`]),
  ...process.argv.slice(2),
];
const wrangler = spawn("pnpm", ["exec", ...args], { stdio: "inherit" });
wrangler.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
