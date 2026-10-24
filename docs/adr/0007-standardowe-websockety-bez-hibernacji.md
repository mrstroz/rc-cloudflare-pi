# ADR-0007: Standardowe WebSockety w Durable Object, bez hibernacji

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | Durable Object, MVP i E6 |

## Kontekst

WebSocket Hibernation API pozwala Cloudflare usunąć DO z pamięci po okresie bezczynności i obudzić go przy następnej wiadomości ([Cloudflare, WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)). Oszczędność wymaga jednak, żeby taki okres wystąpił.

Agent wysyła telemetrię około 5 Hz w każdym stanie ([02 §6](../spec/02-protokol-v1.md#6-telemetria-status)), a w trakcie jazdy dochodzą tokeny i komendy po 20 Hz. DO nie jest więc bezczynny, dopóki Pi jest połączone. Hibernacja wymaga też zapisania w attachments stanu dzierżawy, jej terminu i reguł wygasania, a każdy błąd odtworzenia dotyczy dostępu do sterowania.

## Decyzja

DO używa standardowych WebSocketów bez Hibernation API w MVP i w E6. Utrata instancji kończy sterowanie i wymaga ponownego połączenia oraz uzbrojenia.

## Konsekwencje

**Pozytywne:**

- Stan dzierżawy żyje tylko w pamięci instancji; nie ma ścieżki, która odtwarza pozwolenie ze starej karty.
- Mniej kodu i mniej przypadków do testów.

**Negatywne:**

- DO pozostaje w pamięci, dopóki Pi jest połączone; koszt czasu działania nie spada w spoczynku.

**Wymagania:** brak.

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Hibernation API od MVP | Przy telemetrii 5 Hz nie daje oszczędności, a dokłada odtwarzanie dzierżawy |
| Hibernacja w E6 | Ten sam powód; usunięta z E6 po przeglądzie (`docs/TRIAGE.md`, druga runda) |

## Kiedy wrócić do tej decyzji

Gdy ruch w spoczynku spadnie: brak aktywnej dzierżawy, telemetria tylko przy zmianie stanu lub rzadko i brak częstego timera. Zakres musi wtedy obejmować zapis stanu połączeń i dzierżawy, jej termin i bezpieczne wygasanie.
