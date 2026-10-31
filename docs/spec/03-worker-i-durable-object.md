# 03. Worker i Durable Object

Część Cloudflare po stronie serwera. DO pilnuje, kto może wysyłać komendy; o tym, czy koła mogą się kręcić, decyduje Pi ([01 §2](01-architektura.md#2-podział-odpowiedzialności)).

## 1. Worker

- Serwuje panel przez Workers Static Assets.
- Przyjmuje dwa rodzaje połączeń WebSocket: kierowcy (panel) i urządzenia (agent Pi).
- Po uwierzytelnieniu przekazuje połączenie do Durable Object wybranego przez `car_id`.

## 2. Uwierzytelnienie

| Klient | Mechanizm |
|---|---|
| Panel i WebSocket kierowcy | Cloudflare Access; Worker sprawdza JWT Access z nagłówka `Cf-Access-Jwt-Assertion` albo cookie `CF_Authorization` dla strony i WebSocketu. WebSocket dodatkowo wymaga nagłówka `Origin` z listy `ALLOWED_ORIGINS` |
| Agent Pi | Token urządzenia przypisany do `car_id`, przesyłany w nagłówku handshake `Authorization: Bearer <token>`. Nigdy w URL ani we frontendzie |

Bez ważnego JWT strona i WebSocket kierowcy dostają 401, obcy lub brakujący `Origin` daje 403, a nieznany `car_id` przy ważnej sesji 404. Klucze, `iss` i `aud`: [ADR-0013](../adr/0013-cloudflare-access-dla-operatora.md).

Zły lub brakujący token urządzenia i nieznany `car_id` dają tę samą odpowiedź HTTP 401 przed upgrade, więc agent odróżnia je od chwilowej utraty sieci ([05 §2](05-agent-pi.md#2-połączenie)). Worker sprawdza token przed `car_id` i porównuje go w stałym czasie, więc odpowiedź nie zdradza, które `car_id` istnieją. W wersji 1 jest jedno auto: `car_id` i token stoją w zmiennej i sekrecie Workera ([01 §5](01-architektura.md#5-konfiguracja-i-sekrety)).

## 3. Durable Object

- Jeden DO na `car_id`. Najwyżej jedna aktualna dzierżawa kierowcy i jedno połączenie urządzenia.
- Nowe uwierzytelnione połączenie urządzenia zastępuje poprzednie: DO zamyka stare kodem 4001 z powodem `replaced` i traktuje to jak rozłączenie urządzenia. Stan Pi jest nieznany do pierwszego `status` z nowego połączenia, a nowe połączenie Pi zaczyna rozbrojone ([05 §1](05-agent-pi.md#1-stany-agenta), [ADR-0012](../adr/0012-nowsze-polaczenie-urzadzenia-zastepuje-starsze.md)).
- Standardowe WebSockety, bez Hibernation API ([ADR-0007](../adr/0007-standardowe-websockety-bez-hibernacji.md)).
- Utrata instancji lub stanu dzierżawy kończy sterowanie. Panel musi połączyć się ponownie, a kierowca ponownie uzbroić auto. DO nie odtwarza pozwolenia na jazdę ze starej karty.
- DO pokazuje panelowi stan potwierdzony przez Pi oraz to, czy urządzenie jest połączone.

## 4. Walidacja

DO sprawdza każdą wiadomość:

| Sprawdzenie | Przykład odrzucenia |
|---|---|
| Wersja i schemat z `protocol/` | Brak `v`, nieznany `type` |
| Rola nadawcy | `drive` od urządzenia, `armed` od panelu |
| Zakresy i liczby skończone | `left: 1.5`, `right: NaN` |
| Rozmiar wiadomości | Powyżej `max_frame_bytes` z `limits.json` |
| Częstotliwość | Powyżej limitu dla danego typu z `limits.json` |
| Dzierżawa | `drive`, `arm` lub `stop` spoza aktualnej dzierżawy |

Limity rozmiaru i częstotliwości stoją w `protocol/limits.json`, reguły w [02 §10](02-protokol-v1.md#10-pliki-w-protocol) ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 13). Przyjęcie `session_id`, `seq` i tokenu sprawdza dopiero Pi.

## 5. Dzierżawa kierowcy

Dzierżawa należy do jednej karty (jednego połączenia WebSocket), nie do operatora.

| Zdarzenie | Działanie DO | `lease` do kart |
|---|---|---|
| `hello` karty, dzierżawa wolna, nic nie oczekuje | Nadanie (poniżej) | „nadana” z `lease_id` do tej karty |
| `hello` karty, dzierżawa zajęta lub nadanie oczekuje | Brak | „zajęta” do tej karty |
| `takeover` | Przejęcie (§6) | jak w §6 |
| 3 s bez poprawnej wiadomości właściciela | Odcięcie karty, `stop` do Pi, zwolnienie | „utracona” (wygasła) do właściciela, „wolna” do pozostałych |
| Rozłączenie właściciela | `stop` do Pi, zwolnienie | „wolna” do pozostałych |

Każde nadanie przechodzi tę samą drogę. Gdy Pi jest połączone, DO wysyła `stop` z nowym `request_id` i nadaje dzierżawę dopiero po `stopped` z tym `request_id`, czekając najwyżej 2 s. Bez `stopped` w tym czasie nadanie się nie udaje: nikt nie ma dzierżawy, a karta dostaje `error` (brak potwierdzenia STOP) i może ponowić przez `takeover`. Gdy Pi nie jest połączone, DO nadaje od razu, bo nowe połączenie Pi zaczyna rozbrojone; panel pokazuje wtedy auto jako offline, a DO nie deklaruje skutecznego STOP.

- Wolnej dzierżawy nie dziedziczy automatycznie żadna otwarta karta. Karta bierze ją przez `takeover`.
- Dzierżawę odnawiają `heartbeat` i poprawny `drive` od właściciela. Ramki Ping/Pong transportu jej nie odnawiają.
- DO sprawdza termin przy każdej wiadomości. Wiadomość po terminie nie odnawia dzierżawy, nawet jeśli timer sprzątający jeszcze się nie wykonał.
- Nowy kierowca zawsze uzbraja auto w nowej sesji.

Uzasadnienie wartości i wariantów: [ADR-0005](../adr/0005-dzierzawa-kierowcy-i-jawne-przejecie.md).

## 6. Przejęcie

`takeover` od uprawnionego operatora uruchamia kolejność:

1. Unieważnienie starej dzierżawy, jeśli istnieje, i odcięcie starej karty (`lease` „utracona”, powód: przejęta).
2. Nadanie dzierżawy przejmującemu drogą z §5: `stop`, `stopped`, `lease` „nadana”.
3. Osobne uzbrojenie przy neutralnych wejściach.

Gdy nadanie lub przejęcie już oczekuje, kolejny `takeover` dostaje `error` (przejęcie w toku); DO go nie kolejkuje. Brak `stopped` kończy przejęcie tak samo jak każde nadanie z §5. Rozłączenie przejmującego anuluje przejęcie.

## 7. Przekazywanie

- Komendy z aktualnej dzierżawy idą do Pi natychmiast. Nie ma trwałej kolejki, historii do odtworzenia ani ponawiania starych poleceń jazdy.
- DO nie trzyma wiadomości we własnym stanie: każdą przekazuje od razu albo odrzuca. Nadmiar ponad limit częstotliwości dostaje `error`. Bufory runtime i TCP mogą opóźnić ramkę; zaległy `drive` odrzuca Pi po wieku tokenu ([02 §5](02-protokol-v1.md#5-token-świeżości)).
- `heartbeat` idzie do Pi, jeśli jest połączone. Nie odświeża watchdoga ruchu.
- `armed`, `control_token`, `stopped`, `status` i `error` od Pi idą do kierowcy bez zmian. DO nie podmienia tokenów ani nie odnawia ich terminów.
- Wykryte rozłączenie kierowcy powoduje `stop`. Sesję ruchu unieważnia Pi; jego watchdog działa niezależnie, także gdy Cloudflare jeszcze nie wykrył zerwania.
- Restart DO i reconnect nie wznawiają jazdy.

## 8. Poza zakresem

Hibernacja i attachments: tylko warunkowo w E7, gdy ruch w spoczynku spadnie ([ADR-0007](../adr/0007-standardowe-websockety-bez-hibernacji.md)). Wiele aut na jednym koncie operatora: E7. D1, R2 i kolejki nie biorą udziału w torze sterowania.
