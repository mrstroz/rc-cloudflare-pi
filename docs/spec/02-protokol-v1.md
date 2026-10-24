# 02. Protokół v1

Wspólny kontrakt panelu, Durable Object i agenta. Schematy JSON i przykłady powstają w `protocol/`; ten dokument opisuje semantykę, którą schematy muszą zachować. Kodowanie pól, których tu nie wymieniono, ustalają schematy.

## 1. Transport i zasady ogólne

- JSON przez WSS. Każda wiadomość ma `v: 1` i `type`.
- Nie ma aplikacyjnych `ping`/`pong`. Ramki Ping/Pong transportu WebSocket obsługuje biblioteka lub runtime; służą tylko utrzymaniu połączenia i nie odnawiają dzierżawy ani pozwolenia na ruch ([ADR-0006](../adr/0006-heartbeat-zamiast-ping-pong.md)).
- Dzierżawę nadaje DO, sesję ruchu i tokeny nadaje Pi. DO dopisuje `lease_id` do wiadomości przekazywanych do Pi. Wiadomość panelu z własnym `lease_id` jest odrzucana jako niezgodna ze schematem.
- Strukturę waliduje DO i ponownie Pi. Semantyczne przyjęcie `session_id`, `seq` i tokenu należy wyłącznie do Pi.
- Liczby muszą być skończone. `NaN`, `Infinity` i wartości spoza zakresu są odrzucane.

## 2. Typy wiadomości

| Typ | Kierunek | Pola znane z założeń | Znaczenie |
|---|---|---|---|
| `hello` | panel → DO, Pi → DO | `v` | Pierwsza wiadomość połączenia. Panel dostaje w odpowiedzi `lease` |
| `lease` | DO → panel | stan, `lease_id`, powód | Dzierżawa nadana, utracona, zajęta przez inną kartę albo wolna ([03 §5](03-worker-i-durable-object.md#5-dzierżawa-kierowcy)) |
| `heartbeat` | panel → DO → Pi | `heartbeat_seq` | Co 1 s w widocznej karcie. Odnawia dzierżawę, służy do pomiaru obiegu. Nie jest komendą ruchu |
| `takeover` | panel → DO | — | Świadome przejęcie sterowania albo wzięcie wolnej dzierżawy ([03 §6](03-worker-i-durable-object.md#6-przejęcie)) |
| `arm` | panel → DO → Pi | `request_id` | Prośba o uzbrojenie przy neutralnych wejściach |
| `armed` | Pi → DO → panel | `request_id`, `session_id`, `freshness_token` | Uzbrojenie przyjęte, pierwszy token |
| `control_token` | Pi → DO → panel | `session_id`, `freshness_token` | Nowy token co `token_interval_ms` w uzbrojonej sesji |
| `drive` | panel → DO → Pi | §3 | Pełny stan obu kół |
| `stop` | panel → DO → Pi, DO → Pi | `request_id` | Rozbrojenie |
| `stopped` | Pi → DO → panel | `request_id`, przyczyna | Potwierdzenie rozbrojenia |
| `status` | Pi → DO → panel | §6 | Telemetria |
| `error` | odbiorca → nadawca | powód | Odrzucenie wiadomości |

## 3. Komenda `drive`

```json
{
  "v": 1,
  "type": "drive",
  "session_id": "opaque-session-id",
  "seq": 123,
  "freshness_token": "opaque-signed-pi-monotonic-stamp",
  "left": 0.7,
  "right": -0.7
}
```

- `left` i `right` to żądane wysterowanie -1…1 przed lokalnym limitem mocy. Dodatnie: do przodu, ujemne: do tyłu, zero: koło wyłączone. To nie są obroty na minutę.
- `seq` rośnie w obrębie sesji ruchu. Pi przyjmuje tylko `seq` większy od ostatnio przyjętego.
- Potwierdzenie `seq` w telemetrii oznacza przyjęcie nastawy przez agenta, nie ruch koła.
- Tylko komenda przyjęta przez Pi odświeża watchdog ruchu ([05 §3](05-agent-pi.md#3-pętla-sterowania-i-watchdog-ruchu)).
- Nie ma pól czasu UTC (`sent_at_ms`, `expires_at_ms`). Wiek komendy ogranicza token (§5).

## 4. `arm` i `stop`

- `arm` wymaga neutralnych wejść, aktualnej dzierżawy i skonfigurowanego profilu na Pi. Każde uzbrojenie dostaje nowy `session_id`.
- Pi przyjmuje każdy `request_id` żądania `arm` najwyżej raz w obrębie dzierżawy. Powtórzenie w trakcie sesji, którą to żądanie utworzyło, powtarza `armed` bez tworzenia drugiej sesji. Powtórzenie po rozbrojeniu dostaje `error` i nie uzbraja auta. Zbiór zużytych identyfikatorów jest ograniczony i znika razem z dzierżawą.
- `arm` ze starego połączenia lub starej dzierżawy nie uzbraja auta.
- Panel pamięta `request_id` oczekującej aktywacji. STOP, ukrycie karty i utrata fokusu anulują ją i wysyłają `stop`, więc Pi kończy rozbrojone także wtedy, gdy zdążyło uzbroić. Utrata dzierżawy też ją anuluje, a `stop` wysyła wtedy DO. `armed` z innym `request_id` albo po anulowaniu panel ignoruje ([04 §3](04-panel-sterowania.md#3-aktywacja-i-stop)).
- `stop` wyłącza napęd i unieważnia sesję oraz jej tokeny. Jest idempotentny, nie wymaga `seq`, a jego `request_id` wraca w `stopped` z przyczyną bieżącego rozbrojenia, jak `stop_cause` w `status` (`stop_command`, gdy rozbroił go ten `stop`; `null`, gdy agent od startu nie był uzbrojony).
- DO wysyła `stop` sam, gdy dzierżawa wygaśnie, kierowca się rozłączy albo trwa przejęcie.

## 5. Token świeżości

Pi wydaje token w `armed`, a potem co `token_interval_ms` w uzbrojonej sesji. Token zawiera:

| Składnik | Treść |
|---|---|
| `issued_pi_ms` | Całkowite milisekundy z `time.monotonic_ns()` liczone od początku sesji |
| MAC | HMAC-SHA256 kluczem sesji po wersji protokołu, `session_id` i `issued_pi_ms` |

Kodowanie:

| Element | Zapis |
|---|---|
| `session_id` | 22 znaki base64url bez paddingu (128 bitów losowych) |
| `issued_pi_ms` | Liczba całkowita 0…2^53−1, dziesiętnie bez zer wiodących (`0` dla zera) |
| Wejście MAC | Bajty ASCII: `v1`, LF, `session_id`, LF, `issued_pi_ms`. Alfabet `session_id` nie zawiera LF, więc granice pól są jednoznaczne |
| Klucz | 32 losowe bajty |
| MAC | Pełne HMAC-SHA256, 32 bajty |
| Token | `<issued_pi_ms>.<MAC w base64url bez paddingu>`, 43 znaki MAC. Ostatni znak niesie 4 bity, więc w zapisie kanonicznym jego dwa najniższe bity są zerowe |

Base64url to alfabet z RFC 4648 §5 (`-` i `_`). Pi sprawdza token w tej kolejności: pełne dopasowanie wzorca (tylko ASCII), potem kodowanie oczekiwanego tokenu dla `issued_pi_ms` z odebranego i `session_id` bieżącej sesji Pi (nie z ramki), na końcu porównanie obu napisów jako bajtów ASCII przez `hmac.compare_digest`. Inny zapis tego samego MAC (niekanoniczny ostatni znak, zera wiodące) jest odrzucany. Wzorzec napisu: `freshness_token` w `protocol/schemas/common.schema.json`. Wektory testowe, w tym negatywne: `protocol/vectors/token-v1.json`.

Klucz HMAC jest losowy, nowy dla każdej sesji, istnieje tylko w pamięci Pi i znika przy rozbrojeniu lub reconnect. To unieważnia wszystkie tokeny starej sesji. Pi nie przechowuje listy wydanych tokenów.

Przy `drive` Pi sprawdza format, bieżącą sesję, MAC porównaniem `hmac.compare_digest` oraz `0 ≤ now_pi_ms − issued_pi_ms ≤ freshness_ttl_ms`. Czas z przyszłości jest odrzucany.

Panel dołącza do każdej nowej ramki najnowszy token, bez zmian. DO przekazuje tokeny natychmiast i ich nie podmienia. Odbiór komendy nie odnawia terminu tokenu. Ponieważ ramka powstaje po poznaniu tokenu, wiek ważnego tokenu ogranicza wiek komendy; nie dowodzi natomiast aktualności fizycznego zamiaru operatora ([ADR-0003](../adr/0003-token-swiezosci-hmac-z-zegarem-pi.md)).

Każdy bufor po drodze (przeglądarka, runtime Cloudflare, TCP, biblioteka `websockets`) może zatrzymać ramkę. Przed wykonaniem zaległej ramki chroni wiek tokenu, nie rozmiar bufora. Bufory ograniczamy po to, żeby zator nie rósł bez końca: panel pomija takt ([04 §4](04-panel-sterowania.md#4-wysyłanie)), DO niczego nie kolejkuje ([03 §7](03-worker-i-durable-object.md#7-przekazywanie)), agent ma ograniczoną kolejkę ([05 §2](05-agent-pi.md#2-połączenie)).

## 6. Telemetria `status`

Około 5 Hz, także gdy agent jest rozbrojony.

| Pole | Znaczenie |
|---|---|
| `state` | Rozbrojony (`disarmed`) lub uzbrojony (`armed`) ([05 §1](05-agent-pi.md#1-stany-agenta)) |
| `session_id` | Bieżąca sesja ruchu albo `null` |
| `last_seq`, `seq_age_ms` | Ostatni przyjęty `seq` i czas od jego przyjęcia |
| `command_left`, `command_right` | Zadane wartości z ostatniego przyjętego `drive` |
| `output_left`, `output_right` | Wysterowanie po profilu jazdy; nie zmierzona prędkość |
| `stop_cause` | Ostatni powód rozbrojenia albo `null` przed pierwszym |
| `lease_id` | Dzierżawa, z którą Pi wiąże heartbeat i sesję |
| `last_heartbeat_seq`, `heartbeat_age_ms` | Ostatni heartbeat i czas od jego odbioru |

Wiek to czas od odebrania komunikatu do utworzenia telemetrii, mierzony na Pi zegarem monotonicznym. Brak komunikatu oznacza `null`.

## 7. Estymata obiegu

Panel zapamiętuje ograniczoną historię `sent[session_id, seq] = performance.now()`. Estymata to:

```text
performance.now() − sent[session_id, last_seq] − seq_age_ms
```

Przed uzbrojeniem panel liczy to samo z `sent_heartbeat[lease_id, heartbeat_seq]` i `heartbeat_age_ms`. Ten wariant nie wymaga sesji ruchu, GPIO ani ustalonego TTL.

Wynik to przybliżenie obiegu komenda + telemetria. Nie dzielimy go przez dwa i nie nazywamy opóźnieniem jednokierunkowym. Obcy identyfikator, brak wpisu albo wynik ujemny lub niespójny dają „brak pomiaru”. Historię czyści zmiana sesji lub dzierżawy, a brak postępu potwierdzeń oznacza pomiar nieaktualny.

## 8. Budżet świeżości i parametry czasowe

Przy tokenach wydawanych co `T` bez jitteru wiek tokenu po powrocie do Pi to około `RTT_token + faza`, gdzie `0 ≤ faza < T`. Nominalny budżet pełnego obiegu Pi → panel → Pi:

```text
RTT_max ≈ freshness_ttl_ms − token_interval_ms
```

Jitter, harmonogram przeglądarki i utrata kolejnych tokenów zmniejszają ten zapas. Przykład obliczeniowy, nie profil: `TTL=300 ms` i `T=50 ms` dają około 250 ms budżetu i ostrzeżenie w okolicy 150–200 ms.

| Parametr | Wartość początkowa | Gdzie działa |
|---|---|---|
| `token_interval_ms` | 50 ms | Pi |
| `freshness_ttl_ms` | Nieustalony ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 8); najwyżej 400 ms ([08 §4](08-proby-odbiorowe.md#4-progi-zaliczenia), T8) | Pi |
| Próg ostrzegania | Nieustalony; poniżej `TTL − T` | Profil czasowy |
| Okres `drive` | 50 ms (20 Hz), także przy niezmienionych wejściach | Panel |
| Okres `heartbeat` | 1 s w widocznej karcie, także bez jazdy | Panel |
| Wygaśnięcie dzierżawy | 3 s | DO |
| Telemetria | Około 5 Hz | Pi |
| Watchdog ruchu | 400 ms | Pi |
| Okres pętli sterowania | 10 ms | Pi |
| Oczekiwanie na `stopped` przy nadaniu dzierżawy | 2 s | DO |

Wartości są początkowe i podlegają weryfikacji na sprzęcie. Bez skonfigurowanego profilu czasowego Pi odrzuca `arm`.

TTL dobieramy tak: przy rozbrojonym napędzie zbieramy próbki obiegu z heartbeatów na docelowym łączu (typowe, p95, p99, skoki), przyjmujemy `TTL ≥ RTT_p99 + T + margines`, nie więcej niż 400 ms, a potem sprawdzamy rzeczywisty wiek tokenów i odsetek odrzuceń. Heartbeat płynie w przeciwnym kierunku niż tokeny i ma inny harmonogram, dlatego druga weryfikacja jest konieczna. Jeśli wymagany TTL przekracza 400 ms, poprawiamy łącze; TTL nie rośnie automatycznie ani podczas jazdy.

## 9. Poza zakresem

Synchronizacja zegarów (NTP, offset przeglądarki) nie bierze udziału w decyzji o wykonaniu komendy. Poprawny czas systemowy potrzebny do weryfikacji certyfikatów WSS zapewnia OS.

## 10. Pliki w `protocol/`

Schematy i przykłady są źródłem kodowania pól. Mapa plików: [`protocol/README.md`](../../protocol/README.md). Wartości zamkniętych słowników (`error_reason`, stan i powód `lease`, `stop_cause`, stan agenta) stoją w `schemas/common.schema.json`.

- **Dialekt.** JSON Schema 2020-12 w podzbiorze obsługiwanym przez Ajv w Workers i przez `jsonschema`: `$schema`, `$id`, `$ref`, `$defs`, `type`, `properties`, `required`, `additionalProperties`, `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `items`, `minItems`, `oneOf`, `title`, `description`. Bez `format`. `pattern` to `^…$(?!\n)` z prostych klas ASCII: w Pythonie samo `$` dopuszcza końcowy `\n`, w JavaScripcie nie, a dodatkowe wyrażenie wyrównuje oba silniki.
- **Odcinki.** `message-types.json` wylicza, kto komu wysyła każdy typ (`panel`, `server`, `device`); kluczem wpisu jest (typ, od, do). Typy przekazywane do Pi mają dwie formy: `*.client` (panel → DO, bez `lease_id`) i `*.forwarded` (DO → Pi, `lease_id` wymagane). DO budując wiadomość dla Pi tworzy nowy obiekt z pól formy `client` i własnym `lease_id`. `stop` wysłany przez DO ma `lease_id` dzierżawy kończonej albo nadawanej; Pi wykonuje `stop` niezależnie od niego.
- **Schematy.** Każdy ma `additionalProperties: false`. Liczby całkowite zapisane jako `1.0` przechodzą schemat; agent normalizuje je po walidacji.
- **Ścisły parser.** Pi sprawdza kolejno rozmiar ramki, ścisły parse i schemat. Parse odrzuca `NaN`, `Infinity`, `-Infinity`, liczby poza zakresem zmiennoprzecinkowym (`1e400`) i zduplikowane klucze, zanim zastosuje schemat. Na DO wystarcza `JSON.parse` i schemat, bo DO przekazuje do Pi nowo zbudowany obiekt.
- **Reguły odbiorcy**, które nie wynikają ze schematu:

| Wiersz 03 §4 | Reguła | `error_reason` |
|---|---|---|
| Wersja i schemat, zakresy i liczby skończone | Ramka nie przechodzi schematu odcinka | `invalid_message` |
| Rola nadawcy | Typ nie ma w `message-types.json` odcinka (typ, od, do) tego połączenia | `wrong_role` |
| Rozmiar | Ramka ma więcej niż `max_frame_bytes` bajtów UTF-8 (limit włącznie) | `frame_too_large` |
| Częstotliwość | W oknie przesuwnym `[t, t + window_ms)` na połączeniu jest więcej niż `max` wiadomości tego typu | `rate_limited` |
| Dzierżawa | Nadawca `arm`, `stop` albo `drive` nie trzyma aktualnej dzierżawy | `lease_mismatch` |

- **Limity** stoją w `limits.json`: `max_frame_bytes` i dla każdego typu wysyłanego przez panel lub Pi `max` wiadomości w oknie `window_ms`. Okno ma 1 s. `max` to dwukrotność częstotliwości z §8 (zapas na grupowanie ramek w przeglądarce i TCP): `drive` i `control_token` 40, `status` 10. `heartbeat` ma 4: dwukrotność 1 Hz to 2, ale jitter timera po wznowieniu karty łatwo daje 3 ramki w oknie, a odrzucony `heartbeat` nie odnawia dzierżawy. Akcje operatora (`arm`, `stop`, `takeover`) i odpowiedzi mają limity rzędu kilku na sekundę; `error` ma 40, bo Pi odpowiada nim na każdy odrzucony `drive`. `max_frame_bytes` to 1024, około trzykrotność największej poprawnej wiadomości (`status`).
- **Kolejność sprawdzeń odbiorcy:** rozmiar, parse (na Pi ścisły), rola, częstotliwość, schemat, dzierżawa. Pierwsza złamana reguła wyznacza `error_reason`. Brak `type`, typ niebędący napisem albo spoza `message-types.json` to `invalid_message`; reguła roli dotyczy znanych typów. Do okna częstotliwości liczą się ramki, które ta reguła przepuściła.
- **Przykłady.** `examples/valid` i `examples/invalid` mają jeden kształt pliku (`examples/case.schema.json`): ramki jako surowy tekst, odcinek, kontekst, oczekiwany powód ostatniej ramki (`null` = przyjęta; wcześniejsze ramki przypadku są przyjęte). Bez kontekstu nadawca trzyma dzierżawę. Przypadek dla reguły roli, rozmiaru, częstotliwości i dzierżawy ma w `twin` listę bliźniaków z `examples/valid`, które różnią się tylko badanym czynnikiem; wymóg sprawdza test, nie schemat. Limity: `limits.json`.
