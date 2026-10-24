# Dokumentacja: Internet RC Car

Pojazd z dwoma silnikami DC sterowany z przeglądarki przez Cloudflare. Dwie aplikacje: `apps/cloudflare/` (TypeScript) i `apps/pi-agent/` (Python na Raspberry Pi).

## Jak korzystać

Specyfikacja (`spec/`) opisuje, **co** robi system i jak łączy się z resztą. ADR (`adr/`) zapisują, **dlaczego** wybrano dane rozwiązanie i co odrzucono. Plan (`plan/`) mówi, **kiedy i co teraz**.

Zaczynasz pracę? [`plan/roadmap.md`](plan/roadmap.md) jest jedynym miejscem, do którego trzeba zajrzeć najpierw.

Zmieniasz działanie? Najpierw specyfikacja, potem kod; poprawiaj to, co jest, zamiast dopisywać, że się zmieniło. Zmieniasz decyzję architektoniczną? Aktualizuj ADR, który ją zawiera; nowy ADR jest dla nowej decyzji albo zastąpionej w całości. Starych ADR nie usuwamy.

## Specyfikacja

| Dokument | Zawartość |
|---|---|
| [`spec/00-przeglad-i-zakres.md`](spec/00-przeglad-i-zakres.md) | Cel, główna zasada, zakres, kryteria sukcesu, środowiska, słownik, otwarte kwestie |
| [`spec/01-architektura.md`](spec/01-architektura.md) | Tor komunikacji, podział odpowiedzialności, stack, układ repo, konfiguracja |
| [`spec/02-protokol-v1.md`](spec/02-protokol-v1.md) | Typy wiadomości, `drive`, `arm`/`stop`, token świeżości, telemetria, budżet czasu |
| [`spec/03-worker-i-durable-object.md`](spec/03-worker-i-durable-object.md) | Worker, uwierzytelnienie, DO i połączenie urządzenia, walidacja, dzierżawa, przejęcie |
| [`spec/04-panel-sterowania.md`](spec/04-panel-sterowania.md) | Wejścia, zerowanie, aktywacja, wysyłanie, statusy |
| [`spec/05-agent-pi.md`](spec/05-agent-pi.md) | Stany agenta, połączenie, watchdog ruchu, sesja, przyjęcie `drive` |
| [`spec/06-nadzor-procesu-i-systemu.md`](spec/06-nadzor-procesu-i-systemu.md) | `systemd`, helper GPIO, wbudowany watchdog, Wi-Fi |
| [`spec/07-sprzet-i-naped.md`](spec/07-sprzet-i-naped.md) | Zestaw, GPIO, mostek, zasilanie, profil jazdy, diagnostyka |
| [`spec/08-proby-odbiorowe.md`](spec/08-proby-odbiorowe.md) | Próby P01–P26, wyniki i progi zaliczenia T1–T9 |

## Plan prac

| Dokument | Zawartość |
|---|---|
| [`plan/README.md`](plan/README.md) | Format zadania, identyfikatory, definicja ukończenia, jak zlecać pracę |
| [`plan/roadmap.md`](plan/roadmap.md) | Stan na dziś, etapy, kolejność, ryzyka |

## Decyzje architektoniczne

| ADR | Decyzja | Status |
|---|---|---|
| [0001](adr/0001-wychodzace-wss-z-pi-do-durable-object.md) | Pi otwiera wychodzące WSS do Durable Object; bez publicznego IP i tunelu | Zaakceptowany |
| [0002](adr/0002-pi-jedynym-autorytetem-napedu.md) | Pi rozstrzyga napęd, DO rozstrzyga dostęp | Zaakceptowany |
| [0003](adr/0003-token-swiezosci-hmac-z-zegarem-pi.md) | Token świeżości z czasem monotonicznym Pi i HMAC sesji | Zaakceptowany |
| [0004](adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md) | Rozbrojenie po 400 ms bez automatycznego wznowienia | Zaakceptowany |
| [0005](adr/0005-dzierzawa-kierowcy-i-jawne-przejecie.md) | Dzierżawa kierowcy 3 s i jawne przejęcie z potwierdzonym STOP | Zaakceptowany |
| [0006](adr/0006-heartbeat-zamiast-ping-pong.md) | Heartbeat zamiast aplikacyjnego ping/pong | Zaakceptowany |
| [0007](adr/0007-standardowe-websockety-bez-hibernacji.md) | Standardowe WebSockety w DO, bez hibernacji | Zaakceptowany |
| [0008](adr/0008-nadzor-systemd-i-helper-gpio.md) | Nadzór przez systemd, helper GPIO i wbudowany watchdog Pi | Zaakceptowany |
| [0009](adr/0009-kalibracja-pwm-zamiast-stalego-limitu.md) | Kalibracja PWM zamiast stałego limitu mocy | Zaakceptowany |
| [0010](adr/0010-stop-jako-wybieg.md) | STOP jako wybieg (enable = 0), bez aktywnego hamowania | Zaakceptowany |
| [0011](adr/0011-osobne-zasilanie-pi-i-napedu.md) | Osobne zasilanie Pi i napędu, logika L298N z 5 V Pi | Zaakceptowany |
| [0012](adr/0012-nowsze-polaczenie-urzadzenia-zastepuje-starsze.md) | Nowsze połączenie urządzenia zastępuje starsze | Zaakceptowany |

Szablon nowego ADR: [`adr/template.md`](adr/template.md).

## Pozostałe pliki

| Plik | Co zawiera |
|---|---|
| [`BRIEF.md`](BRIEF.md) | Brief wyjściowy projektu. Źródło spec i ADR; przy rozbieżności obowiązuje `spec/` |
| [`TRIAGE.md`](TRIAGE.md) | Przegląd uwag do briefu z 2026-10-24, dwie rundy. Źródło ADR 0002–0009 |
| [`POLACZENIA.md`](POLACZENIA.md) | Instrukcja montażu Pi 4B, L298N i silników; spec odwołuje się do niej w [07 §2](spec/07-sprzet-i-naped.md#2-połączenia-i-gpio) |
| `diagrams/` | Rysunek połączeń (PNG, SVG), mapa pinów JSON (źródło danych rysunku) i prompt odrzuconej próby `imagegen`, którego nie używamy jako instrukcji |

## Konwencje

- Dokumentacja po polsku; `CLAUDE.md` i commity po angielsku. Specyfikacja `NN-nazwa.md`, ADR `NNNN-nazwa.md`.
- Etapy oznaczamy `E1`…`E7`. Etapy briefu mapują się tak: Etap 1 (MVP) = E1–E5, w tym MVP-A = E1 i MVP-B = E2–E5; Etap 2 = E6, Etap 3 = E7.
- Zadania mają prefiks `RC`, numeracja ciągła w całym projekcie.
- Odwołania do kodu to ścieżki względem korzenia repozytorium, np. `apps/pi-agent/…:41`.
- Daty w formacie `RRRR-MM-DD`, bez wyrażeń względnych.
