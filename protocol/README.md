# protocol/

Kontrakt protokołu v1 ([spec 02](../docs/spec/02-protokol-v1.md)). Zasady, dialekt i reguły odbiorcy: [02 §10](../docs/spec/02-protokol-v1.md#10-pliki-w-protocol).

| Ścieżka | Zawartość |
|---|---|
| `schemas/common.schema.json` | Wspólne definicje: identyfikatory, liczniki, wysterowanie koła, wzorzec tokenu, zamknięte słowniki |
| `schemas/<typ>.schema.json` | Schemat wiadomości; `<typ>.client` i `<typ>.forwarded` dla typów z `lease_id` |
| `message-types.json` | Odcinki: kto komu wysyła każdy typ |
| `examples/case.schema.json` | Kształt pliku przypadku |
| `examples/valid`, `examples/invalid` | Przypadki przyjęte i odrzucone |
| `vectors/token-v1.json` | Wektory testowe tokenu: poprawne i odrzucane z powodem |
| `tools/gen_token_vectors.py` | Odtwarza wektory (`--check` sprawdza, czy plik jest aktualny) |
| `limits.json` | Limity rozmiaru i częstotliwości |

Testy: z `apps/pi-agent/` polecenie `.venv/bin/pytest tests/test_protocol_*.py`.

Pliki JSON mają postać kanoniczną: `python3 -m json.tool --no-ensure-ascii --indent 2 <plik> > <tymczasowy> && mv <tymczasowy> <plik>`.
