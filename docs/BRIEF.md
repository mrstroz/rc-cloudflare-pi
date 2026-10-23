# Internet RC Car — brief MVP

## Cel i zakres

Zbudować mały pojazd sterowany przez internet z przeglądarki telefonu lub komputera. Dwa silniki DC niezależnie napędzają lewe i prawe koło. Skręcanie odbywa się przez różnicę ich prędkości, a obrót w miejscu przez przeciwne kierunki pracy. Nie ma mechanizmu skrętu kół.

Jedno repozytorium zawiera dwie aplikacje: aplikację Cloudflare (panel WWW i backend) oraz agenta Python uruchamianego na Raspberry Pi. MVP obejmuje jedno auto i jednego aktywnego kierowcę. Dokument określa projekt; wartości czasowe są ustawieniami początkowymi do weryfikacji na sprzęcie.

## Architektura

Przeglądarka i Raspberry Pi niezależnie nawiązują szyfrowane połączenia WebSocket do Cloudflare. Worker uwierzytelnia klientów i przekazuje ich do tego samego Durable Object identyfikowanego przez `car_id`. Durable Object przekazuje komendy do Pi, a status i potwierdzenia do przeglądarki.

Raspberry Pi samodzielnie inicjuje połączenie wychodzące. Nie wymaga publicznego IP, przekierowania portów ani Cloudflare Tunnel. PWM i obsługa silników działają lokalnie na Pi. Cloudflare przekazuje wyłącznie zadane wartości sterowania.

## Część 1 — aplikacja Cloudflare

**Stack:** TypeScript, Vue 3 + Vite, Workers Static Assets, Cloudflare Worker, Durable Objects i WebSocket Hibernation API. Wdrożenie przez Wrangler.

### Panel sterowania

- Dwa pionowe suwaki/joysticki, osobno dla lewego i prawego koła, w zakresie od -100% do +100%. Obsługa dwóch palców jednocześnie na telefonie.
- Wartość dodatnia oznacza jazdę do przodu, ujemna do tyłu, zero wyłączenie napędu danego koła.
- Zwolnienie suwaka zeruje dane koło. Utrata fokusu, ukrycie karty lub anulowanie gestu zeruje oba i rozbraja sterowanie.
- Przycisk „Aktywuj sterowanie”, duży przycisk STOP i konfigurowalny limit mocy, domyślnie 30%.
- Statusy: auto offline, gotowe, sterowanie aktywne, zatrzymane, błąd. Osobno status połączenia panelu i świeżość telemetrii auta.
- Pomiar czasu potwierdzenia komendy przez Pi; nie przedstawiać go jako pomiaru fizycznej reakcji silnika.
- Podczas aktywnej jazdy wysyłanie pełnego stanu obu kół co 50 ms (20 Hz), również gdy pozycje suwaków się nie zmieniają.

### Worker i Durable Object

- Worker serwuje panel i obsługuje wejścia WebSocket dla kierowcy oraz urządzenia.
- Osobne uwierzytelnienie: sesja użytkownika dla panelu oraz token urządzenia przypisany do `car_id` dla Pi. Panel i jego WebSocket chronić tym samym mechanizmem logowania; sprawdzać też Origin. Token urządzenia przechowywać jako sekret, bez umieszczania w URL lub frontendzie.
- Jeden Durable Object na `car_id`; najwyżej jeden aktywny kierowca i jedno aktualne połączenie urządzenia. Kolejna karta nie przejmuje kontroli automatycznie.
- Walidacja schematu, ról, zakresów, sesji, numerów komend i ich świeżości. Limit rozmiaru wiadomości i częstotliwości ruchu.
- Natychmiastowe przekazywanie aktualnych komend. Brak kolejki trwałej, historii do odtworzenia i ponawiania starych poleceń jazdy.
- Stan połączeń odtwarzalny po hibernacji przez WebSocket attachments. Nie polegać wyłącznie na polach obiektu w pamięci. Jeśli stanu autoryzacji sterowania nie można pewnie odtworzyć, wymagane ponowne aktywowanie.
- Wykryte rozłączenie kierowcy powoduje STOP i unieważnienie sesji. Lokalny watchdog Pi działa niezależnie, również gdy Cloudflare jeszcze nie wykrył zerwania połączenia.

## Część 2 — agent Python na Raspberry Pi

**Stack:** Raspberry Pi OS, Python, `asyncio`, klient `websockets`, GPIO Zero. Backend GPIO dobrać do modelu Raspberry i systemu. Agent działa jako usługa `systemd` z automatycznym startem i restartem.

### Odpowiedzialności

- Wychodzące połączenie WSS, uwierzytelnienie urządzenia i reconnect z rosnącym odstępem oraz jitterem.
- Start zawsze z wyłączonym napędem. Po reconnect nie wznawiać jazdy; wymagać nowej sesji i świadomego aktywowania w panelu przy zerowych suwakach.
- Walidacja komend także lokalnie: wersja protokołu, sesja, rosnący `seq`, skończone liczby w zakresie -1…1 i termin ważności.
- Oddzielić obsługę sieci od pętli sterowania i watchdoga. Przetwarzać najnowszy ważny stan; nie wykonywać zaległej sekwencji ruchów.
- Sterowanie mostkiem H: kierunek i PWM, limit mocy, konfiguracja pinów oraz odwrócenie kierunku niezależnie dla każdego koła.
- Łagodne przyspieszanie i zwykłe zwalnianie. Zmiana kierunku przechodzi przez zero z przerwą dobraną do sterownika. STOP, timeout i błąd omijają rampę i natychmiast wyłączają napęd.
- Lokalny watchdog wyłącza napęd po 400 ms bez nowej, ważnej komendy `drive`. Ping/pong nie przedłuża pozwolenia na jazdę. Czas lokalnego watchdoga mierzyć zegarem monotonicznym.
- Błąd sterowania, rozłączenie lub wygaśnięcie watchdoga rozbraja agenta i unieważnia sesję; opóźniona komenda nie może sama uruchomić silników.
- Telemetria np. 5 Hz: stan agenta, ostatni przyjęty `seq`, zadane/wysterowane wartości kół i przyczyna zatrzymania. Bez enkoderów nie raportować tych wartości jako zmierzonej prędkości.
- Tryb symulacji bez GPIO do uruchamiania i testowania całego przepływu na komputerze.

### Sprzęt

Zakładamy dwa szczotkowe silniki DC, podwozie i dwa niezależnie napędzane koła. Potrzebny jest dwukanałowy mostek H zgodny z logiką GPIO 3,3 V, dobrany do napięcia i prądu zatrzymanego silnika. DRV8833 jest kandydatem, nie zatwierdzonym wyborem dla nieznanych silników.

Nie zasilać silników z GPIO. Przewidzieć osobną gałąź zasilania silników, stabilizowane zasilanie Pi, wspólną masę, filtrację oraz fizyczny wyłącznik napędu. Wyjścia sterownika powinny domyślnie pozostawać wyłączone przy starcie/resetach Pi.

STOP oznacza wyłączenie napędu, nie gwarantuje natychmiastowego zatrzymania kół; hamowanie/coast zależy od mostka. Watchdog w Pythonie nie chroni przed zawieszeniem systemu lub procesu. Ochronę przed takim przypadkiem zapewnia dodatkowy sprzętowy watchdog odcinający enable/zasilanie sterownika.

## Wspólny protokół v1

JSON przez WSS. Wspólny kontrakt i przykładowe wiadomości znajdują się w `protocol/`. Minimalne typy: `hello`, `arm`, `armed`, `drive`, `stop`, `status`, `error` oraz aplikacyjny ping/pong.

Przykładowa komenda:

```json
{
  "v": 1,
  "type": "drive",
  "session_id": "opaque-session-id",
  "seq": 123,
  "sent_at_ms": 1792756800000,
  "expires_at_ms": 1792756800300,
  "left": 0.7,
  "right": -0.7
}
```

- `session_id` identyfikuje aktualne aktywowanie sterowania potwierdzone przez Pi. Każde ponowne aktywowanie otrzymuje nowy identyfikator; `seq` rośnie w obrębie sesji.
- `left` i `right` to żądane wysterowanie -1…1 przed zastosowaniem lokalnego limitu mocy. Nie są to wartości RPM.
- Początkowa ważność komendy wynosi 300 ms od jej utworzenia. Worker i Pi nie przesuwają terminu ważności przy przekazywaniu.
- Do kontroli świeżości wymagany jest synchronizowany czas Pi oraz oszacowanie przesunięcia zegara przeglądarki względem serwera podczas zestawiania sesji. Gdy niepewność czasu jest zbyt duża względem TTL, nie aktywować jazdy. Sam numer sekwencyjny nie wykrywa opóźnienia transmisji.
- `arm` wymaga neutralnych wartości i potwierdzenia urządzenia. `stop` wyłącza napęd i unieważnia sesję; można go ponowić bez skutków ubocznych. Nie wymaga kolejnego numeru komendy jazdy, ale wymaga autoryzowanego nadawcy.
- Potwierdzenie `seq` oznacza przyjęcie nastawy przez agenta, nie potwierdzenie ruchu koła.

## Układ repozytorium

| Ścieżka | Zawartość |
| --- | --- |
| `BRIEF.md` | Ten brief |
| `README.md` | Uruchomienie, konfiguracja, testy i wdrożenie obu aplikacji |
| `apps/cloudflare/` | Panel Vue, Worker, Durable Object, konfiguracja Wrangler |
| `apps/pi-agent/` | Agent Python, adapter GPIO, symulator, wzór konfiguracji, usługa systemd |
| `protocol/` | Schematy JSON, opis komunikatów i wspólne przykłady do testów |

Konfigurację i sekrety trzymać poza kodem. Repo zawiera wyłącznie wzory bez tokenów. Parametry Pi obejmują URL, `car_id`, token, mapowanie pinów, polaryzację silników, limit PWM, rampę i timeouty.

## Etapy i kryteria gotowości MVP

1. **Połączenie bez sprzętu:** panel → Durable Object → symulator Python, z logowaniem, blokadą drugiego kierowcy i telemetrią.
2. **Logika zatrzymywania:** testy utraty sieci, ukrycia karty, STOP, reconnect, wygasłych/zdublowanych komend i wiadomości ze starej sesji. Po zatrzymaniu zaległe wiadomości nie uruchamiają napędu.
3. **Sprzęt:** konfiguracja mostka i GPIO; próby z uniesionymi kołami oraz niskim limitem mocy. Zweryfikowane oba kierunki, niezależne koła i obrót w miejscu.
4. **Próba jazdy:** pomiar opóźnień na docelowym Wi-Fi/LTE, dobór TTL/watchdoga/rampy. Przy działającym agencie wyłączenie napędu następuje najpóźniej po czasie watchdoga plus zmierzona tolerancja pętli.
5. **Gotowość repo:** instrukcja od czystej instalacji, wdrożenie Cloudflare, instalacja usługi Pi i tryb symulacji. Testy kontraktu protokołu w TypeScript i Pythonie oraz testy utraty kontroli.

## Poza MVP i otwarte ustalenia

Poza zakresem: kamera, autonomiczna jazda, planowanie tras, enkodery/PID, historia przejazdów, wiele aut w panelu, aplikacja mobilna i WebRTC. D1, R2 oraz kolejki nie są potrzebne w torze sterowania MVP.

Przed implementacją warstwy sprzętowej ustalić model Raspberry, rodzaj i parametry silników, sterownik, baterię i przetwornicę. Przed wdrożeniem panelu wybrać mechanizm logowania użytkownika. Resztę można rozpocząć w symulatorze.

Projekt jest przeznaczony do małego, wolnego pojazdu. Internet i Cloudflare nie gwarantują twardego czasu rzeczywistego; dopuszczalną prędkość i timeouty należy dobrać na podstawie prób.

## Dokumentacja referencyjna

- [Cloudflare — Durable Objects i WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare — przykład WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
- [GPIO Zero — urządzenia wyjściowe i Motor](https://gpiozero.readthedocs.io/en/stable/api_output.html)
- [GPIO Zero — backendy GPIO](https://gpiozero.readthedocs.io/en/stable/api_pins.html)
- [Pololu — przykładowy sterownik DRV8833](https://www.pololu.com/product/2130)
