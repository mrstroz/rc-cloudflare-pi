# ADR-0006: Heartbeat zamiast aplikacyjnego ping/pong

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | protokół v1, kontrola żywotności połączeń |

## Kontekst

Przeglądarkowe API WebSocket nie wystawia ramek Ping/Pong transportu, więc panel nie może ich wysyłać ani obserwować ([websockets, keepalive](https://websockets.readthedocs.io/en/stable/topics/keepalive.html)). Panel i tak wysyła `heartbeat` co 1 s, a Pi wysyła telemetrię około 5 Hz z `last_heartbeat_seq` i `heartbeat_age_ms`. Pierwsza wersja briefu miała dodatkowo aplikacyjne `ping`/`pong`; przegląd (`docs/TRIAGE.md`, druga runda) wskazał tę redundancję.

## Decyzja

Protokół nie ma typów `ping` i `pong`. Kontrolę aplikacyjną zapewniają `heartbeat` i `status`. Ramki Ping/Pong transportu zostają w gestii biblioteki i runtime, tylko do utrzymania połączenia.

## Konsekwencje

**Pozytywne:**

- Mniej typów wiadomości do walidacji po obu stronach.
- Heartbeat przechodzi przez DO do Pi, więc mierzy pełny obieg także przed uzbrojeniem ([02 §7](../spec/02-protokol-v1.md#7-estymata-obiegu)).

**Negatywne:**

- Heartbeat pełni trzy role (dzierżawa, pomiar, żywotność) i żadna z nich nie może przedłużać pozwolenia na ruch; testy muszą to sprawdzać osobno.

**Wymagania:** ani heartbeat, ani Ping/Pong nie odświeżają watchdoga ruchu ([05 §3](../spec/05-agent-pi.md#3-pętla-sterowania-i-watchdog-ruchu)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Aplikacyjne `ping`/`pong` obok heartbeatu | Dubluje heartbeat i telemetrię, nie daje nowej informacji |
| Wyłącznie Ping/Pong transportu | Niewidoczne w przeglądarce; nie mierzy obiegu do Pi |

## Kiedy wrócić do tej decyzji

Gdy pojawi się klient bez telemetrii (np. obserwator bez dzierżawy), który potrzebuje pomiaru obiegu niezależnie od Pi.
