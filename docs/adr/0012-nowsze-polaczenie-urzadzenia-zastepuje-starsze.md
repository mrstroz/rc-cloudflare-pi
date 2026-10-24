# ADR-0012: Nowsze połączenie urządzenia zastępuje starsze

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | połączenie agenta Pi z Durable Object |

## Kontekst

DO dopuszcza najwyżej jedno połączenie urządzenia na `car_id` ([03 §3](../spec/03-worker-i-durable-object.md#3-durable-object)). Po krótkiej utracie Wi-Fi lub LTE agent łączy się ponownie, zanim DO zauważy, że stare połączenie jest martwe; półotwarty WebSocket wygląda dla DO na żywy aż do wykrycia zerwania. Deploy Workera również kończy połączenia i wymusza reconnect ([ADR-0001](0001-wychodzace-wss-z-pi-do-durable-object.md)).

Agent zaczyna każde połączenie w stanie rozbrojonym, a rozłączenie zawsze go rozbraja ([05 §1](../spec/05-agent-pi.md#1-stany-agenta)).

## Decyzja

Nowe połączenie z poprawnym tokenem urządzenia zastępuje poprzednie. DO zamyka stare połączenie i traktuje to jak rozłączenie urządzenia; stan Pi jest nieznany do pierwszego `status` z nowego połączenia.

## Konsekwencje

**Pozytywne:**

- Reconnect po przerwie działa od razu, bez czekania, aż DO wykryje martwe połączenie.
- Nie ma dwóch źródeł `status` i tokenów dla jednego auta.

**Negatywne:**

- Każdy, kto ma token urządzenia, może odłączyć prawdziwe Pi. Posiadacz tokenu i tak może się pod nie podszyć, więc ochroną pozostaje sekret tokenu.
- Kierowca po każdym reconnect Pi musi ponownie uzbroić auto.

**Wymagania:** nowe połączenie Pi zaczyna rozbrojone; próba P26 ([08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Odrzucenie nowego połączenia, dopóki stare jest otwarte | Po przerwie w sieci Pi jest odcięte do czasu wykrycia martwego połączenia przez DO |
| Dwa połączenia urządzenia naraz | Dwa źródła `status` i tokenów; DO musiałby wybierać, któremu wierzyć |

## Kiedy wrócić do tej decyzji

Gdy jedno auto ma więcej niż jedno urządzenie albo gdy pojawi się podejrzenie wycieku tokenu. Wtedy potrzebna jest osobna tożsamość urządzenia, a nie jeden wspólny sekret.
