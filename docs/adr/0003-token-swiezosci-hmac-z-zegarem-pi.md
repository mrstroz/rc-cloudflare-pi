# ADR-0003: Token świeżości z czasem monotonicznym Pi i HMAC sesji

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | protokół v1, przyjmowanie `drive` na Pi |

## Kontekst

Pi 4B nie ma podtrzymywanego bateryjnie zegara RTC, a zegar przeglądarki nie jest źródłem, któremu można powierzyć decyzję o ruchu. Porównywanie czasu UTC panelu i Pi odpada.

Sam `seq` i watchdog nie wystarczają. Kontrprzykład z przeglądu (`docs/TRIAGE.md`, punkt 2): ramki powstają co 50 ms, ale wszystkie docierają z opóźnieniem 350 ms. `seq` rośnie, watchdog 400 ms co chwilę dostaje komendę, a „bierz najnowszą” wybiera stan sprzed 350 ms. Strumień stale opóźniony przechodzi bez wykrycia.

Surowy czas Pi odesłany przez panel można zmienić lub oszacować. Uwierzytelnienie kierowcy daje dostęp do sterowania, ale nie dowodzi, że znacznik wydało Pi.

## Decyzja

Pi co `token_interval_ms` wydaje token z `issued_pi_ms` (czas monotoniczny od początku sesji) i HMAC-SHA256 po wersji, `session_id` i tym czasie. Klucz jest losowy na sesję i istnieje tylko w pamięci Pi. Panel odsyła najnowszy token bez zmian w każdym `drive`; Pi sprawdza MAC i `0 ≤ teraz − issued ≤ freshness_ttl_ms`. Szczegóły: [02 §5](../spec/02-protokol-v1.md#5-token-świeżości).

## Konsekwencje

**Pozytywne:**

- Wiek komendy ograniczony bez synchronizacji zegarów; zmiana czasu UTC nie wpływa na jazdę.
- Brak listy wydanych tokenów: Pi przechowuje tylko klucz sesji.
- Rozbrojenie lub reconnect unieważnia wszystkie stare tokeny jednym ruchem.

**Negatywne:**

- Budżet obiegu Pi → panel → Pi to około `TTL − token_interval_ms`; przez LTE może nie wystarczyć.
- 20 tokenów na sekundę zwiększa ruch przez DO.
- Token nie dowodzi aktualności fizycznego zamiaru operatora, tylko wiek ramki.

**Wymagania:** pomiar obiegu przed jazdą i dobór TTL ([02 §8](../spec/02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe)); porównanie MAC przez `hmac.compare_digest`.

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| `sent_at_ms` i `expires_at_ms` w UTC z przeglądarki | Wymaga zgodnych zegarów Pi i przeglądarki; Pi nie ma RTC |
| Brak kontroli wieku, tylko `seq` i watchdog | Nie wykrywa stale opóźnionego strumienia (kontrprzykład wyżej) |
| Losowe tokeny z listą wydanych na Pi | Ten sam efekt, ale Pi musi przechowywać i sprzątać zbiór tokenów |
| Echo surowego `issued_pi_ms` bez podpisu | Panel może podać dowolny czas; uwierzytelnienie nie zapewnia pochodzenia znacznika |
| Odnawianie terminu przy przekazywaniu przez DO | Pośrednik przedłużałby ważność opóźnionych ramek |

## Kiedy wrócić do tej decyzji

- Gdy potrzebny TTL na docelowym łączu jest nie do przyjęcia mimo poprawy sieci.
- Gdy sterowanie przechodzi na bezpośrednie łącze o przewidywalnym opóźnieniu (np. WebRTC w E7).

## Historia decyzji

Pierwszy wariant po przeglądzie wydawał tokeny co 100 ms, co przy przykładowym TTL 300 ms zostawiało około 200 ms budżetu. Interwał 50 ms daje około 250 ms.
