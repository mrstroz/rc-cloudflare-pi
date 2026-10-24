# 05. Agent Pi

Program Python na Raspberry Pi. Jest jedynym autorytetem napędu: uzbraja, prowadzi sesję ruchu, wydaje tokeny, przyjmuje komendy i pilnuje watchdoga ruchu ([ADR-0002](../adr/0002-pi-jedynym-autorytetem-napedu.md)).

## 1. Stany agenta

| Zdarzenie | Ze stanu | Do stanu | Napęd |
|---|---|---|---|
| Start procesu | — | rozbrojony | oba enable = 0 |
| `arm` spełniający §4 | rozbrojony | uzbrojony | bez zmian (wejścia neutralne) |
| Przyjęty `drive` (§5) | uzbrojony | uzbrojony | wysterowanie według profilu |
| `stop` | dowolny | rozbrojony | oba enable = 0 |
| `motion_watchdog_ms` bez przyjętego `drive` | uzbrojony | rozbrojony | oba enable = 0 |
| Błąd sterowania | uzbrojony | rozbrojony | oba enable = 0 |
| Rozłączenie z DO | uzbrojony | rozbrojony | oba enable = 0 |
| Reconnect | rozbrojony | rozbrojony | bez zmian |

Każde rozbrojenie unieważnia sesję ruchu, jej `seq` i klucz HMAC. Stan nie jest zapisywany na dysk, więc restart procesu lub systemu zawsze kończy się stanem rozbrojonym ([ADR-0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md)).

## 2. Połączenie

- Agent otwiera wychodzące WSS do Workera i uwierzytelnia się tokenem urządzenia w nagłówku handshake ([03 §2](03-worker-i-durable-object.md#2-uwierzytelnienie)).
- Reconnect przez iterator `async for ws in connect(...)` z `websockets.asyncio.client`; biblioteka ponawia błędy przejściowe z rosnącym odstępem. Wersja biblioteki jest przypięta.
- Odrzucony token lub błędna konfiguracja nie są traktowane jak chwilowa utrata sieci: agent loguje przyczynę i nie ponawia połączenia w zwykłej pętli. Jak to współgra z `Restart=always`, jest otwarte ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 15).
- Zamknięcie już otwartego połączenia rozbraja agenta. Reconnect przywraca komunikację, nie jazdę.
- Kolejka przychodząca jest ograniczona (`max_queue` biblioteki `websockets`, rozmiar w konfiguracji). Zaległe `drive` z kolejki przechodzą zwykłe sprawdzenia z §5, więc ramka starsza niż token jest odrzucana.
- Wysyłanie nie blokuje pętli sterowania. Gdy poprzednia telemetria lub token czeka na wysłanie, nowsza ramka tego rodzaju ją zastępuje. Odpowiedzi na żądania (`armed`, `stopped`, `error`) nie są pomijane.

## 3. Pętla sterowania i watchdog ruchu

- Obsługa sieci, pętla sterowania i watchdog są oddzielone. Pętla działa także bez sieci, z wyłączonym napędem.
- Pętla bierze najnowszy ważny stan; nie wykonuje zaległej sekwencji ruchów.
- Pętla działa z okresem 10 ms (wartość początkowa) i w każdej iteracji sprawdza termin watchdoga.
- Watchdog ruchu mierzy czas od ostatniego przyjętego `drive`, a przed pierwszym od `armed`, zegarem monotonicznym. Po `motion_watchdog_ms` (wartość początkowa 400 ms, najwyżej 400 ms, T1 w [08 §4](08-proby-odbiorowe.md#4-progi-zaliczenia)) wyłącza napęd, rozbraja agenta i unieważnia sesję.
- Przy odbiorze `drive` agent najpierw sprawdza termin watchdoga. Jeśli minął, rozbraja się i odrzuca komendę, nawet gdy iteracja pętli jeszcze tego nie zrobiła.
- `stop` wyłącza oba enable najpóźniej w ciągu jednego okresu pętli od odbioru.
- Watchdoga nie przedłużają: `heartbeat`, telemetria, wydanie tokenu, ramki Ping/Pong. Opóźniona komenda nie może wznowić ruchu po rozbrojeniu.
- Zdrowa iteracja pętli wysyła `WATCHDOG=1` do `systemd` ([06 §1](06-nadzor-procesu-i-systemu.md#1-usługa-systemd)).

## 4. Uzbrojenie i sesja ruchu

`arm` uzbraja agenta, gdy:

1. pochodzi z aktualnej dzierżawy (`lease_id` dopisany przez DO),
2. wejścia w żądaniu są neutralne,
3. profil jazdy jest skalibrowany i spójny ([07 §5](07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja)), a profil czasowy ma `freshness_ttl_ms`,
4. helper GPIO zakończył się powodzeniem przy starcie usługi.

Wtedy agent generuje nowy `session_id`, losuje nowy klucz HMAC, wiąże sesję z `lease_id` i odpowiada `armed` z pierwszym tokenem. Każdy `request_id` żądania `arm` agent przyjmuje najwyżej raz w obrębie dzierżawy: powtórzenie w bieżącej sesji powtarza `armed`, powtórzenie po rozbrojeniu dostaje `error` ([02 §4](02-protokol-v1.md#4-arm-i-stop)). Kolejne tokeny agent wydaje co `token_interval_ms` ([02 §5](02-protokol-v1.md#5-token-świeżości)).

## 5. Przyjęcie `drive`

Agent sprawdza kolejno:

| Krok | Odrzucenie, gdy |
|---|---|
| Termin watchdoga | Minęło ponad `motion_watchdog_ms` od ostatniego przyjętego `drive` lub od `armed`; agent najpierw się rozbraja |
| Struktura według `protocol/` | Brak pola, zły typ, `v ≠ 1` |
| Sesja | `session_id` inny niż bieżący lub brak uzbrojenia |
| Dzierżawa | `lease_id` inny niż związany z sesją |
| `seq` | Nie większy od ostatnio przyjętego |
| Wartości | `left` lub `right` nieskończone albo poza -1…1 |
| Token | Zły format, zły MAC, czas z przyszłości, wiek powyżej `freshness_ttl_ms` |

Odrzucona komenda nie odświeża watchdoga i nie zmienia wysterowania; agent odpowiada `error`. Przyjęta komenda odświeża watchdog i ustawia nowe wartości kół.

## 6. Wysterowanie kół

- Wartość -1…1 przechodzi przez profil jazdy ([07 §5](07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja)) i odwrócenie kierunku danego koła.
- Zmiana kierunku przechodzi przez zero z przerwą z konfiguracji ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 7).
- STOP, timeout i błąd natychmiast ustawiają oba enable na 0, bez przerwy i bez rampy.
- Zero na kole ustawia jego enable na 0 ([07 §3](07-sprzet-i-naped.md#3-sterowanie-mostkiem)).

## 7. Telemetria

Około 5 Hz, w każdym stanie, z polami z [02 §6](02-protokol-v1.md#6-telemetria-status). Bez enkoderów agent nie raportuje wysterowania jako zmierzonej prędkości.

## 8. Tryb symulacji

Agent uruchomiony bez GPIO zastępuje mostek atrapą, która zapisuje stany enable i kierunku. Pozwala uruchomić cały przepływ (Cloudflare, panel, sesje, tokeny, watchdog) na komputerze. Tryb symulacji i ręczne uruchomienie pozostają dostępne obok usługi `systemd`.

## 9. Poza zakresem

Rampy łagodnego przyspieszania i zwalniania: E6. Enkodery i PID: E7. Zapis sesji ruchu na dysk i automatyczne wznowienie: odrzucone ([ADR-0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md)).
