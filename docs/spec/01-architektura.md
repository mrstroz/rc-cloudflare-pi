# 01. Architektura i podział odpowiedzialności

Dwie aplikacje w jednym repozytorium i jeden wspólny kontrakt. Ten dokument mówi, kto za co odpowiada; szczegóły każdej części są w dokumentach 02–07.

## 1. Tor komunikacji

```text
Przeglądarka (panel) ──WSS──┐
                            ├──► Worker ──► Durable Object (car_id)
Raspberry Pi (agent) ──WSS──┘
```

Przeglądarka i Pi niezależnie otwierają szyfrowane połączenia WebSocket do Cloudflare. Worker uwierzytelnia każdego klienta i przekazuje go do Durable Object o nazwie z `car_id`. DO przekazuje komendy do Pi, a potwierdzenia i telemetrię do panelu.

Pi samo inicjuje połączenie wychodzące, więc nie potrzebuje publicznego IP, przekierowania portów ani Cloudflare Tunnel ([ADR-0001](../adr/0001-wychodzace-wss-z-pi-do-durable-object.md)). PWM i sterowanie silnikami działają lokalnie na Pi; przez Cloudflare idą tylko zadane wartości.

## 2. Podział odpowiedzialności

| Element | Odpowiada za | Nie odpowiada za |
|---|---|---|
| Panel | Odczyt wejść, wysyłanie pełnego stanu kół co 50 ms, heartbeat, wyświetlanie stanu potwierdzonego przez Pi | Decyzję, czy auto jest uzbrojone |
| Worker | Serwowanie panelu, uwierzytelnienie operatora i urządzenia, kierowanie do DO | Stan sterowania |
| Durable Object | Dzierżawa kierowcy, walidacja struktury i nadawcy, natychmiastowe przekazywanie | Uzbrojenie, sesję ruchu, `seq`, świeżość, watchdog |
| Agent Pi | Uzbrojenie, sesja ruchu, tokeny świeżości, `seq`, watchdog ruchu, wysterowanie mostka | Dostęp operatorów i dzierżawę |

DO jest autorytetem dostępu do toru komunikacji, Pi jest jedynym autorytetem napędu ([ADR-0002](../adr/0002-pi-jedynym-autorytetem-napedu.md)). DO nie prowadzi drugiej maszyny stanów jazdy: pokazuje stan potwierdzony przez Pi i jego aktualność.

## 3. Stack

| Aplikacja | Technologie |
|---|---|
| `apps/cloudflare/` | TypeScript, Vue 3 + Vite, Workers Static Assets, Cloudflare Worker, Durable Objects ze standardowymi WebSocketami, Wrangler |
| `apps/pi-agent/` | Raspberry Pi OS, Python, `asyncio`, klient `websockets` (`websockets.asyncio.client`, wersja przypięta), GPIO Zero z backendem przypiętym do Pi 4B i OS |
| `protocol/` | Schematy JSON, opis komunikatów, wspólne przykłady do testów obu aplikacji |

Backend GPIO Zero nie jest jeszcze wybrany ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 2).

## 4. Układ repozytorium

| Ścieżka | Zawartość |
|---|---|
| `README.md` | Uruchomienie, konfiguracja, testy i wdrożenie obu aplikacji |
| `apps/cloudflare/` | Panel Vue, Worker, Durable Object, konfiguracja Wrangler |
| `apps/pi-agent/` | Agent, adapter L298N, skrypt diagnostyczny, helper GPIO, tryb symulacji, wzór konfiguracji, unit `systemd` |
| `protocol/` | Kontrakt protokołu v1 ([02](02-protokol-v1.md)) |
| `docs/` | Spec, ADR, plan i dokumenty wejściowe ([mapa](../README.md)) |

## 5. Konfiguracja i sekrety

Repozytorium zawiera wyłącznie wzory konfiguracji, bez sekretów.

| Gdzie | Parametry |
|---|---|
| Pi (plik poza repozytorium) | URL Workera, `car_id`, token urządzenia, piny, odwrócenie kierunku każdego koła, profil jazdy ([07 §5](07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja)), częstotliwość PWM, przerwa przy zmianie kierunku, profil czasowy ([02 §8](02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe)) |
| Cloudflare (sekrety Workera) | Token urządzenia dla `car_id`, dane mechanizmu logowania operatora |
| Tylko pamięć Pi | Klucz HMAC i dane sesji ruchu. Nie trafiają na dysk ani do panelu |

Token urządzenia nie trafia do URL ani do kodu frontendu ([03 §2](03-worker-i-durable-object.md#2-uwierzytelnienie)).

## 6. Poza zakresem

Wiele aut, WebRTC i aplikacja mobilna: etap E7 ([00 §4](00-przeglad-i-zakres.md#4-poza-zakresem-wersji-1)). Trwałe przechowywanie komend lub telemetrii: brak, tor sterowania nie odtwarza historii.
