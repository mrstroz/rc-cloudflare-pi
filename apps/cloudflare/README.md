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
| Lokalny serwer na `localhost:8787` | `cp .dev.vars.example .dev.vars`, potem `pnpm dev` |

Każde polecenie najpierw uruchamia `pnpm gen`: kompiluje schematy z `protocol/` do walidatorów Ajv standalone w `src/generated/` (poza repozytorium), bo Workers nie pozwalają kompilować schematów w runtime ([02 §10](../../docs/spec/02-protokol-v1.md#10-pliki-w-protocol)). `pnpm test` i `pnpm dev` budują też panel do `dist/client`, bo Worker serwuje go przez Workers Static Assets. `pnpm typecheck` sprawdza też, czy `worker-configuration.d.ts` odpowiada `wrangler.jsonc`; po zmianie konfiguracji: `pnpm exec wrangler types`.

## Logowanie lokalnie

Na produkcji operatora wpuszcza Cloudflare Access ([ADR-0013](../../docs/adr/0013-cloudflare-access-dla-operatora.md)). `pnpm dev` tworzy na czas uruchomienia własny klucz, podaje Workerowi jego część publiczną i wypisuje JWT. W przeglądarce trzeba ustawić cookie `CF_Authorization` z tą wartością dla `localhost:8787` (narzędzia deweloperskie, Application → Cookies). Klucz istnieje tylko w pamięci procesu; po restarcie potrzebny jest nowy JWT.
