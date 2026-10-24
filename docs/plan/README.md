# Plan prac

`spec/` mówi, **co** budujemy, `adr/` mówi, **dlaczego**, a ten katalog mówi, **kiedy i co teraz**.

Plan nie opisuje działania systemu. Każde zadanie wskazuje sekcję specyfikacji, w której to działanie jest zapisane. Poprawka w specyfikacji nie wymaga więc zmiany tutaj, a przesunięcie zadania nie dotyka specyfikacji.

## Pliki

| Plik | Zawartość |
|---|---|
| [`roadmap.md`](roadmap.md) | Stan na dziś, etapy, kolejność, ryzyka |
| [`01-pi-test-lokalny.md`](01-pi-test-lokalny.md) | E1: Python, test lokalny Pi → L298N → silniki (MVP-A) |
| [`02-protokol-v1.md`](02-protokol-v1.md) | E2: wspólne, kontrakt w `protocol/` |
| [`03-agent-pi.md`](03-agent-pi.md) | E3: Python, agent z WSS, sesją, watchdogiem i `systemd` |
| [`04-cloudflare.md`](04-cloudflare.md) | E4: Cloudflare, Worker, Durable Object i panel |
| [`05-integracja-i-proby.md`](05-integracja-i-proby.md) | E5: oba, wdrożenie, profil czasowy i próby odbiorowe |
| [`06-wygoda-i-powtarzalnosc.md`](06-wygoda-i-powtarzalnosc.md) | E6: Etap 2 briefu |
| [`07-nice-to-have.md`](07-nice-to-have.md) | E7: Etap 3 briefu |

## Format zadania

```markdown
- [ ] (^) **RC-12** <co powstaje>
      Spec: [02 §1](../spec/02-protokol-v1.md#1-transport-i-zasady-ogólne) · Zależy od: RC-11
      Gotowe, gdy: <jeden warunek, sprawdzalny>

- [-] (v) **RC-14** ~~<czego postanowiliśmy nie budować>~~
      **Odrzucone RRRR-MM-DD.** <dlaczego, w jednym lub dwóch zdaniach>
```

- **Checkbox** niesie stan: `[ ]` otwarte, `[x]` zrobione, `[-]` odrzucone.
- **Priorytet** stoi między checkboxem a numerem. `(^)`: reszta etapu na nie czeka. `(=)`: domyślny, potrzebne, ale nic nie blokuje. `(v)`: etap zamyka się bez niego. Brak znacznika oznacza `(=)`. Najwyżej jedna trzecia otwartych zadań etapu może mieć `(^)`.
- **Tytuł** mówi, co powstaje, nie jak.
- **Spec** i **ADR**: linki względne, z numerem sekcji w tekście. Najwyżej dwa dokumenty na zadanie.
- **Zależy od**: tylko zadania z tego planu.
- **Blokada**: coś spoza planu, co musi się rozstrzygnąć wcześniej. Śledzone wyłącznie w tabeli otwartych kwestii [`spec/00` §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie). Zablokowane zadanie czeka, aż ta kwestia zostanie zamknięta.
- **Gotowe, gdy**: tylko tam, gdzie warunek nie wynika z tytułu. Jeden warunek, sprawdzalny testem albo na działającym systemie.
- **Jedna linia kontekstu** pod otwartym zadaniem: dlaczego istnieje albo co pokazał pomiar. Nie opis działania.
- **Odrzucone**: `[-]`, przekreślony tytuł i datowana notka `**Odrzucone RRRR-MM-DD.**` z powodem. Numer zostaje.

## Identyfikatory i commity

Numeracja `RC-NN` biegnie przez cały projekt, niezależnie od pliku i etapu. Numerów nie używamy ponownie. Jedno zadanie to jeden commit z identyfikatorem w wiadomości, po angielsku, np. `feat: RC-11 freshness token test vectors`.

## Definicja ukończenia

1. Testy, typy i lint aplikacji, której dotyczy zadanie, przechodzą. Polecenia dla `apps/cloudflare/` dopisze RC-23.
   - `apps/pi-agent/` (z katalogu aplikacji, venv według [jej README](../../apps/pi-agent/README.md)): `.venv/bin/pytest`, `.venv/bin/ruff check .`, `.venv/bin/ruff format --check .`, `.venv/bin/mypy`. Testy zawsze używają atrapy pinów GPIO Zero i nie ruszają silników.
2. Zmiana kontraktu: schemat i przykłady w `protocol/` w tym samym commicie, a walidatory obu aplikacji przechodzą przykłady (od RC-10).
3. Próba na sprzęcie: zasady z [08 §1](../spec/08-proby-odbiorowe.md#1-zasady-prób), wynik dopisany w [08 §3](../spec/08-proby-odbiorowe.md#3-wyniki).
4. Żadnych sekretów w repozytorium, tylko wzory konfiguracji.
5. Jeśli zadanie zmieniło działanie względem specyfikacji: **najpierw poprawiona specyfikacja, potem kod.**
6. Checkbox zaznacza ten, kto skończył zadanie, w tym samym commicie co kod.

## Jak zlecać pracę

„Zrób RC-12” wystarczy. Kolejność: przeczytać zadanie i podlinkowane sekcje specyfikacji, zaimplementować, zaznaczyć checkbox i zaktualizować „Stan na dziś” w [`roadmap.md`](roadmap.md), commit.

Gdy zadanie okaże się zależne od czegoś, czego nie ma w planie, dodajemy nowe zadanie zamiast rozdmuchiwać bieżące.
