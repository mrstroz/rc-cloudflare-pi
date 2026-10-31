# ADR-0013: Cloudflare Access uwierzytelnia operatora

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-31 |
| **Dotyczy** | Worker: strona panelu i WebSocket kierowcy |

## Kontekst

Panel i WebSocket kierowcy wymagają tego samego logowania operatora ([03 §2](../spec/03-worker-i-durable-object.md#2-uwierzytelnienie)); do decyzji panel nie wychodzi do internetu ([00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 1). Wersja 1 ma jednego operatora ([BRIEF](../BRIEF.md), MVP-B). WebSocket z przeglądarki nie może wysłać własnego nagłówka, ale wysyła cookie domeny.

## Decyzja

Operatora uwierzytelnia Cloudflare Access. Worker dodatkowo sprawdza JWT Access z nagłówka `Cf-Access-Jwt-Assertion` albo z cookie `CF_Authorization`: podpis RS256 kluczami zespołu (`https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`), `iss` zespołu, `aud` aplikacji i `exp`. Bez ważnego JWT strona i WebSocket kierowcy dostają 401.

## Konsekwencje

**Pozytywne:**

- Projekt nie przechowuje haseł ani sesji; logowanie, MFA i lista operatorów są w panelu Zero Trust.
- Ten sam JWT chroni stronę i WebSocket kierowcy, bo przeglądarka wysyła cookie także przy upgrade.
- Sprawdzenie w Workerze działa również wtedy, gdy ktoś dotrze do Workera z pominięciem Access (np. adres `workers.dev`).

**Negatywne:**

- Konto Cloudflare z Zero Trust jest warunkiem udostępnienia panelu.
- Lokalnie nie ma Access. Testy i `pnpm dev` podpisują JWT własnym, jednorazowym kluczem.

**Wymagania:**

- Zmienne `ACCESS_TEAM_DOMAIN` i `ACCESS_AUD` w `wrangler.jsonc` mają wartości aplikacji Access przed wdrożeniem; wartości wzorcowe niczego nie przepuszczają.
- `ACCESS_JWKS` (zbiór kluczy podany wprost) zastępuje klucze zespołu i istnieje tylko w testach i w `pnpm dev` (`apps/cloudflare/scripts/dev.ts`). Nie stoi w `wrangler.jsonc`, co sprawdza test `apps/cloudflare/test/node/wrangler-config.test.ts`. W kodzie nie ma flagi wyłączającej sprawdzenie.

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Własne logowanie z hasłem w sekrecie Workera i cookie sesji HMAC | Własny kod haseł, sesji, limitów prób i wylogowania; większa powierzchnia ataku przy jednym operatorze |
| Tylko Access, bez sprawdzenia JWT w Workerze | Worker osiągalny z pominięciem Access przepuściłby każdego |

## Kiedy wrócić do tej decyzji

Gdy operatorzy nie mogą mieć kont w Access (np. publiczny dostęp gości) albo gdy projekt przechodzi na inne konto bez Zero Trust.
