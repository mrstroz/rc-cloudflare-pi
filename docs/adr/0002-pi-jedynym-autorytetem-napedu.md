# ADR-0002: Pi jedynym autorytetem napędu

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | podział odpowiedzialności DO i agenta Pi |

## Kontekst

W torze sterowania uczestniczą trzy strony: panel, Durable Object i agent. Każda widzi inny wycinek stanu i może stracić połączenie z pozostałymi w innym momencie. Gdyby dwie z nich niezależnie decydowały, czy auto jest uzbrojone, przy zerwaniu połączenia ich stany mogą się rozjechać: DO uznaje sesję za zakończoną, a Pi nadal przyjmuje komendy, albo odwrotnie.

Tylko Pi steruje GPIO i tylko Pi ma zegar, który mierzy wiek komend bez synchronizacji ([ADR-0003](0003-token-swiezosci-hmac-z-zegarem-pi.md)). Przegląd briefu (`docs/TRIAGE.md`, punkt 5) potwierdził potrzebę jednego autorytetu napędu i osobnego autorytetu dostępu.

## Decyzja

Pi rozstrzyga uzbrojenie, sesję ruchu, `seq`, świeżość i watchdog ruchu. DO rozstrzyga dostęp: dzierżawę kierowcy i to, czy wiadomość pochodzi od jej właściciela. DO nie prowadzi drugiej maszyny stanów jazdy; pokazuje stan potwierdzony przez Pi.

## Konsekwencje

**Pozytywne:**

- Jedno miejsce prawdy o napędzie, fizycznie przy silnikach.
- Utrata DO lub panelu nie może pozostawić Pi w stanie, o którym nikt nie wie: watchdog ruchu działa lokalnie.

**Negatywne:**

- Panel pokazuje stan z opóźnieniem telemetrii; „gotowe” zawsze oznacza ostatnie potwierdzenie Pi, nie stan bieżący.
- Walidacja struktury odbywa się dwa razy: w DO i na Pi.

**Wymagania:** DO dopisuje `lease_id` do wiadomości przekazywanych do Pi ([02 §1](../spec/02-protokol-v1.md#1-transport-i-zasady-ogólne)); przejęcie czeka na `stopped` od Pi ([03 §6](../spec/03-worker-i-durable-object.md#6-przejęcie)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| DO jako autorytet uzbrojenia, Pi tylko wykonuje | Po zerwaniu połączenia DO–Pi Pi nie wie, czy sesja nadal trwa; DO nie ma zegara, któremu Pi ufa |
| Dwie maszyny stanów (DO i Pi) synchronizowane wiadomościami | Rozjazd stanów przy każdej utracie wiadomości; trzeba by rozstrzygać, która wygrywa |
| Pi bez walidacji struktury, ufa DO | Błąd w DO lub przejęty Worker trafiałby prosto do GPIO |

## Kiedy wrócić do tej decyzji

Gdy jedno konto steruje wieloma autami i potrzebna jest koordynacja między nimi (E7). Autorytet napędu pozostaje przy każdym Pi, ale może dojść warstwa nad DO.
