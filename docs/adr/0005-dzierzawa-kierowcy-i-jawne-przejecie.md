# ADR-0005: Dzierżawa kierowcy z terminem i jawne przejęcie

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | dostęp do sterowania w Durable Object |

## Kontekst

Jedno auto ma jednego kierowcę. Karta przeglądarki może jednak zniknąć bez zamknięcia połączenia: telefon traci zasięg, system usypia kartę, połączenie zostaje półotwarte. Blokada bez terminu odcięłaby wtedy auto do czasu, aż Cloudflare wykryje zerwanie. Przekazanie sterowania nowej karcie bez potwierdzenia od Pi mogłoby zostawić auto w ruchu ze starej sesji.

Przegląd briefu (`docs/TRIAGE.md`, punkt 5) wskazał potrzebę wygasania blokady i odzyskania dostępu.

## Decyzja

DO nadaje dzierżawę jednej karcie: przy jej `hello`, gdy dzierżawa jest wolna, albo na jej `takeover`. Każde nadanie czeka na `stopped` od połączonego Pi, najwyżej 2 s; gdy Pi nie jest połączone, DO nadaje od razu. Panel dostaje stan dzierżawy i `lease_id` w wiadomości `lease`.

Dzierżawa wygasa po 3 s bez poprawnej wiadomości aplikacyjnej od właściciela; podtrzymują ją heartbeat co 1 s i `drive`. Termin jest sprawdzany przy każdej wiadomości. Wolnej dzierżawy nikt nie dziedziczy automatycznie, a `takeover` w trakcie innego nadania jest odrzucany ([03 §5–§6](../spec/03-worker-i-durable-object.md#5-dzierżawa-kierowcy)).

## Konsekwencje

**Pozytywne:**

- Porzucona karta zwalnia auto po 3 s bez udziału człowieka.
- Przejęcie nigdy nie dziedziczy sesji ruchu poprzedniego kierowcy.
- Spóźniona wiadomość nie odnawia dzierżawy, nawet gdy timer sprzątający jeszcze się nie wykonał.

**Negatywne:**

- Karta w tle traci dzierżawę; powrót do niej wymaga ponownego uzbrojenia.
- Gdy Pi jest połączone, ale nie odpowiada, przejęcie kończy się po 2 s błędem i nikt nie ma dzierżawy.
- Dwóch operatorów klikających „Przejmij” jednocześnie: jeden dostaje błąd i musi ponowić.

**Wymagania:** heartbeat co 1 s w widocznej karcie ([04 §4](../spec/04-panel-sterowania.md#4-wysyłanie)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Blokada do zamknięcia WebSocketu | Półotwarte połączenie blokuje auto na czas nieokreślony |
| Odnawianie dzierżawy ramkami Ping/Pong transportu | Ping/Pong przechodzi także z karty uśpionej lub porzuconej przez użytkownika |
| Ostatnio połączona albo następna otwarta karta automatycznie dostaje dzierżawę | Dzierżawę dostałaby karta, na którą nikt nie patrzy, albo druga karta przejęłaby jadące auto bez potwierdzenia STOP |
| Przejęcie bez czekania na `stopped` | Nowy kierowca widziałby „gotowe”, gdy Pi może jeszcze wykonywać starą sesję |
| Kolejka albo „ostatni wygrywa” przy równoczesnych przejęciach | Wynik zależy od kolejności dostarczenia; przejmujący nie wie, czy dostanie auto |
| Odmowa nadania, dopóki Pi jest offline | Nie dodaje bezpieczeństwa: nowe połączenie Pi zaczyna rozbrojone, a kierowca i tak musi uzbroić auto |

## Kiedy wrócić do tej decyzji

Gdy pomiary pokażą, że 3 s jest za krótkie dla docelowego łącza (dzierżawa wygasa przy normalnej jeździe) albo dochodzi wielu kierowców z rolami (E7).
