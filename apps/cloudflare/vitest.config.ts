import { cloudflareTest } from "@cloudflare/vitest-plugin";
import vue from "@vitejs/plugin-vue";
import { exportJWK, generateKeyPair } from "jose";
import { defineConfig } from "vitest/config";

/** A throwaway Access signing key per test run; its public half stands in for the team JWKS. */
async function testAccessKeys(): Promise<{ jwks: string; privateJwk: string }> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const kid = "test";
  return {
    jwks: JSON.stringify({ keys: [{ ...(await exportJWK(publicKey)), kid, alg: "RS256" }] }),
    privateJwk: JSON.stringify({ ...(await exportJWK(privateKey)), kid, alg: "RS256" }),
  };
}

export default defineConfig(async () => {
  const access = await testAccessKeys();
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  DEVICE_TOKEN: "test-device-token",
                  ACCESS_JWKS: access.jwks,
                  TEST_ACCESS_PRIVATE_JWK: access.privateJwk,
                },
              },
            }),
          ],
          test: { name: "worker", include: ["test/worker/**/*.test.ts"] },
        },
        {
          plugins: [vue()],
          test: { name: "panel", include: ["test/panel/**/*.test.ts"], environment: "happy-dom" },
        },
        {
          test: { name: "node", include: ["test/node/**/*.test.ts"], environment: "node" },
        },
      ],
    },
  };
});
