import { cloudflareTest } from "@cloudflare/vitest-plugin";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
        test: { name: "worker", include: ["test/worker/**/*.test.ts"] },
      },
      {
        plugins: [vue()],
        test: { name: "panel", include: ["test/panel/**/*.test.ts"], environment: "happy-dom" },
      },
    ],
  },
});
