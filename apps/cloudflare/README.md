# cloudflare

Worker, Durable Object i panel Vue ([spec 03](../../docs/spec/03-worker-i-durable-object.md), [spec 04](../../docs/spec/04-panel-sterowania.md)). Pełna instrukcja wdrożenia powstaje w RC-40, w głównym `README.md`.

## Środowisko

Node 22 i pnpm 11:

```sh
cd apps/cloudflare
pnpm install
```

## Polecenia

| Co | Polecenie |
|---|---|
| Testy (Worker w `workerd`, panel w `happy-dom`) | `pnpm test` |
| Typy | `pnpm typecheck` |
| Lint i format | `pnpm lint` |
| Lokalny serwer na `localhost:8787` | `pnpm dev` |

`pnpm test` i `pnpm dev` najpierw budują panel do `dist/client`, bo Worker serwuje go przez Workers Static Assets. `pnpm typecheck` sprawdza też, czy `worker-configuration.d.ts` odpowiada `wrangler.jsonc`; po zmianie konfiguracji: `pnpm exec wrangler types`.
