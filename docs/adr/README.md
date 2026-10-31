# Decyzje architektoniczne (ADR)

Każdy plik zapisuje jedną decyzję: kontekst, wybór, konsekwencje i odrzucone warianty. Za pół roku ma dać się odtworzyć, **dlaczego** coś wygląda tak, a nie inaczej, bez przekopywania historii commitów.

## Zasady

- Jeden plik, jedna decyzja. Nazwa `NNNN-krotki-opis.md`, numeracja kolejna.
- ADR jest aktualny. Gdy ta sama decyzja zmienia się w szczegółach, poprawiamy treść tak, żeby opisywała decyzję obowiązującą: bez sekcji „korekta” i bez starej wartości obok nowej. Nowy ADR jest dla nowej decyzji albo decyzji zastąpionej w całości, ze statusem „Zastępuje ADR-XXXX”; stary dostaje „Zastąpiony przez ADR-YYYY”.
- Wcześniejszą decyzję można zostawić w krótkiej sekcji „Historia decyzji” na końcu, tylko jeśli wyjaśnia, dlaczego architektura wygląda tak, jak wygląda.
- Statusy: **Propozycja** → **Zaakceptowany** → **Zastąpiony** / **Odrzucony**. **Otwarty** oznacza decyzję świadomie odłożoną, z wypisanymi wariantami i kryterium rozstrzygnięcia.
- ADR zapisuje decyzję i jej powody. Jak działa funkcja, opisuje `docs/spec/`.

Decyzje 0001–0011 pochodzą z [briefu](../BRIEF.md) i [triage](../TRIAGE.md) z 2026-10-24, decyzja 0012 z przeglądu planu z tego samego dnia, decyzja 0013 z rozstrzygnięcia kwestii 1 przy RC-25.

## Rejestr

| ADR | Decyzja | Status | Data |
|---|---|---|---|
| [0001](0001-wychodzace-wss-z-pi-do-durable-object.md) | Pi otwiera wychodzące WSS do Durable Object; bez publicznego IP i tunelu | Zaakceptowany | 2026-10-24 |
| [0002](0002-pi-jedynym-autorytetem-napedu.md) | Pi rozstrzyga napęd, DO rozstrzyga dostęp | Zaakceptowany | 2026-10-24 |
| [0003](0003-token-swiezosci-hmac-z-zegarem-pi.md) | Token świeżości z czasem monotonicznym Pi i HMAC sesji | Zaakceptowany | 2026-10-24 |
| [0004](0004-rozbrojenie-bez-automatycznego-wznowienia.md) | Rozbrojenie po 400 ms bez automatycznego wznowienia | Zaakceptowany | 2026-10-24 |
| [0005](0005-dzierzawa-kierowcy-i-jawne-przejecie.md) | Dzierżawa kierowcy 3 s i jawne przejęcie z potwierdzonym STOP | Zaakceptowany | 2026-10-24 |
| [0006](0006-heartbeat-zamiast-ping-pong.md) | Heartbeat zamiast aplikacyjnego ping/pong | Zaakceptowany | 2026-10-24 |
| [0007](0007-standardowe-websockety-bez-hibernacji.md) | Standardowe WebSockety w DO, bez hibernacji | Zaakceptowany | 2026-10-24 |
| [0008](0008-nadzor-systemd-i-helper-gpio.md) | Nadzór przez systemd, helper GPIO i wbudowany watchdog Pi | Zaakceptowany | 2026-10-24 |
| [0009](0009-kalibracja-pwm-zamiast-stalego-limitu.md) | Kalibracja PWM zamiast stałego limitu mocy | Zaakceptowany | 2026-10-24 |
| [0010](0010-stop-jako-wybieg.md) | STOP jako wybieg (enable = 0), bez aktywnego hamowania | Zaakceptowany | 2026-10-24 |
| [0011](0011-osobne-zasilanie-pi-i-napedu.md) | Osobne zasilanie Pi i napędu, logika L298N z 5 V Pi | Zaakceptowany | 2026-10-24 |
| [0012](0012-nowsze-polaczenie-urzadzenia-zastepuje-starsze.md) | Nowsze połączenie urządzenia zastępuje starsze | Zaakceptowany | 2026-10-24 |
| [0013](0013-cloudflare-access-dla-operatora.md) | Cloudflare Access uwierzytelnia operatora, Worker sprawdza JWT | Zaakceptowany | 2026-10-31 |

Szablon: [`template.md`](template.md).
