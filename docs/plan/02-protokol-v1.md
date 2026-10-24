# E2. Protokół v1 (wspólne, MVP-B)

**Cel:** wspólny kontrakt wiadomości w `protocol/`, który agent i Durable Object walidują tymi samymi przykładami.

**Koniec etapu:** każdy typ wiadomości ma schemat JSON, przykłady poprawne i niepoprawne oraz wektory testowe tokenu; obie aplikacje mogą z nich korzystać w testach.

**Zależności zewnętrzne:** brak.

## Zadania

- [x] (^) **RC-10** Schematy JSON wszystkich typów v1 w `protocol/` z przykładami poprawnymi
      Spec: [02 §2–§4](../spec/02-protokol-v1.md#2-typy-wiadomości)
      Gotowe, gdy: każdy typ z tabeli 02 §2 ma schemat i co najmniej jeden poprawny przykład.

- [x] (=) **RC-11** Format `freshness_token` i wektory testowe HMAC
      Spec: [02 §5](../spec/02-protokol-v1.md#5-token-świeżości) · ADR: [0003](../adr/0003-token-swiezosci-hmac-z-zegarem-pi.md) · Zależy od: RC-10
      Gotowe, gdy: `protocol/` zawiera wektory (klucz, `session_id`, `issued_pi_ms` → token), a 02 §5 opisuje kodowanie.

- [ ] (=) **RC-12** Przykłady niepoprawne oraz limity rozmiaru i częstotliwości
      Spec: [02 §1](../spec/02-protokol-v1.md#1-transport-i-zasady-ogólne), [03 §4](../spec/03-worker-i-durable-object.md#4-walidacja) · Zależy od: RC-10
      Gotowe, gdy: każdy wiersz tabeli 03 §4 ma przykład odrzucenia, a kwestia 13 w 00 §9 jest zamknięta.
