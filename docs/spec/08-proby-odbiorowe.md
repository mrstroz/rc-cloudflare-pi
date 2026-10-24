# 08. Próby odbiorowe

Próby, które zamykają MVP ([00 §6](00-przeglad-i-zakres.md#6-kryteria-sukcesu)), i miejsce na ich wyniki. Numery prób są stałe; zadania planu odwołują się do nich.

## 1. Zasady prób

- Pierwsze uruchomienie każdego kanału, próby resetu, zawieszenia i awarii procesu: koła uniesione, fizyczny wyłącznik napędu w zasięgu ręki.
- Jazda tylko w kontrolowanym miejscu i w zasięgu wzroku kierowcy, z limitem z profilu jazdy.
- Silnik, który nie rusza, wyłączamy od razu i szukamy przyczyny.
- Internet i Cloudflare nie dają twardego czasu rzeczywistego. Prędkość i timeouty dobieramy z wyników prób.

## 2. Próby odbiorowe MVP

| Nr | Próba | Oczekiwany wynik |
|---|---|---|
| P01 | Lokalny test A i B, osobno i razem | Oba kierunki, regulacja PWM, poprawne przypisanie kół; brak niezamierzonego ruchu drugiego kanału |
| P02 | Kalibracja PWM 100 Hz | Progi startu i podtrzymania oraz dopuszczalne maksimum w obu kierunkach, bez obciążenia i na podłodze; zero i STOP zawsze wyłączają enable |
| P03 | Krótka próba 100% PWM | Napięcie pakietu, napięcie na silnikach, prąd i temperatura; potwierdzony zapas zasilania |
| P04 | Start i reset Pi, normalne zakończenie skryptu | ENA i ENB pozostają lub przechodzą w stan niski; start nie uruchamia silników |
| P05 | Dobór zasilania dla potwierdzonego silnika | Uwzględnione 3–6 V silnika, straty mostka i prąd rozruchu obu napędów; sprawdzone zasilanie logiki L298N |
| P06 | Powerbank i rozruch obu silników | Pi bez resetów i undervoltage przy wybranym porcie i kablu; zapis napięć, nagrzewania, obciążenia i czasu próby |
| P07 | Symulator przez Cloudflare | Przepływ komend i statusów; odrzucenie braku autoryzacji i drugiego kierowcy |
| P08 | Pomiar przed aktywowaniem | Heartbeat przechodzi przez DO do Pi i wraca w telemetrii; profil czasowy dobrany przy wyłączonym napędzie |
| P09 | Zwolnienie suwaka lub klawisza | Zero na odpowiednim kole |
| P10 | STOP, ukrycie karty, utrata fokusu, anulowanie gestu | Oba kanały wyłączone w progach T2 i T3, agent rozbrojony, brak samoczynnego wznowienia |
| P11 | Zerwanie sieci panelu lub Pi | Przy działającym agencie enable LOW w progu T1; wcześniej wykryty błąd zatrzymuje od razu |
| P12 | Komendy z wygasłym tokenem, zdublowane, ze starej sesji, spoza zakresu | Odrzucenie; brak odświeżenia watchdoga i brak ruchu po rozbrojeniu |
| P13 | Stale opóźniony strumień z rosnącym `seq`, starszy niż okno tokenu | Odrzucenie mimo zachowanego porządku; odbiór `drive` nie przedłuża tokenu |
| P14 | Granice budżetu tokenów: interwał 50 ms, jitter, brak kolejnych tokenów | Zmierzony wiek tokenów i odsetek odrzuceń; próg ostrzegania w profilu czasowym poniżej `TTL − T`; TTL w progu T8, bez automatycznego wzrostu; brak wznowienia po rozbrojeniu |
| P15 | Zmieniony czas lub MAC, czas z przyszłości, token starej sesji | Odrzucenie bez odświeżenia watchdoga, mimo poprawnego uwierzytelnienia kierowcy |
| P16 | Zmiana zegara UTC, brak wpisu do estymaty obiegu | UTC nie wpływa na przyjęcie `drive`; niespójny pomiar pokazany jako „brak pomiaru” |
| P17 | Półotwarta karta: brak `heartbeat` i `drive` przez 3 s | Dzierżawa wygasa; spóźniona wiadomość jej nie odnawia; nowy kierowca uzbraja nową sesję |
| P18 | Świadome przejęcie | Stara karta odcięta; Pi potwierdza STOP przed nową dzierżawą; spóźnione stare komendy nie ruszają kół |
| P19 | Ponowne połączenie lub restart agenta | Napęd wyłączony do nowej sesji i świadomego uzbrojenia przy zerowych wejściach |
| P20 | Deploy DO, restart usługi, awaria i zatrzymanie procesu (`SIGSTOP`, `SIGKILL`) | Reconnect bez podchodzenia do auta; helper wyłącza enable dla wybranego backendu w progach T4, T5 i T6; brak wznowienia ruchu |
| P21 | Wbudowany watchdog systemu | Potwierdzony sterownik i timeout; kontrolowany reset z uniesionymi kołami w progu T7; brak ruchu po restarcie |
| P22 | Jazda przez docelowe Wi-Fi lub LTE | Niezależne koła, skręt i obrót w miejscu; zapis opóźnień i przerw w komunikacji |
| P23 | `arm` powtórzony po STOP; `armed` po anulowaniu aktywacji | Brak uzbrojenia po STOP; panel ignoruje spóźnione `armed`, nie pokazuje sterowania i nie wysyła `drive` |
| P24 | Zator: wstrzymany odbiorca po stronie panelu lub Pi, zalew ramek | Kolejki nie rosną ponad limit; pętla utrzymuje okres; zaległe `drive` odrzucone po wieku tokenu; enable LOW w progu T1; brak wznowienia |
| P25 | Droga zatrzymania na podłodze przy limicie z profilu | Od ostatniej przyjętej komendy do zatrzymania kół w progu T9 |
| P26 | Dwa równoczesne `takeover`, przejęcie bez `stopped`, drugie połączenie urządzenia | Drugi `takeover` odrzucony; bez `stopped` w 2 s nikt nie ma dzierżawy; nowe połączenie urządzenia zamyka stare, Pi zaczyna rozbrojone |

P12, P13, P15, P16, P23, P24 i P26 sprawdzamy najpierw testami w trybie symulacji, a potem na uniesionych kołach.

## 3. Wyniki

Żadna z prób P01–P26 nie jest jeszcze zaliczona. Każda wykonana próba dopisuje wiersz: wynik, zmierzone wartości (napięcia, prądy, temperatury, czasy) oraz użyty sprzęt. Wartości kalibracji trafiają dodatkowo do [07 §5](07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja), a profil czasowy do [02 §8](02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe). Wiersz bez numeru próby to sprawdzenie pomocnicze, które żadnej próby nie zalicza.

| Nr | Data | Wynik | Wartości i sprzęt |
|---|---|---|---|
| — (smoke test) | 2026-10-24 | Okablowanie i oba kanały działają | Jednorazowy skrypt poza repo (przed RC-05), GPIO Zero + `lgpio`, PWM 100 Hz, koła uniesione. Piny IN1–IN4 osiągają oba poziomy przy ENA/ENB = LOW. Impulsy 1 s przy duty 0,7 i 1,0: A = lewe koło, B = prawe, oba kierunki, przy 1,0 wyraźnie szybciej; A+B razem 1,5 s przy 1,0. Pi: `throttled=0x0` przez cały test, temperatura SoC 50,6 °C. Wyłącznik baterii wyłączony + 100% na obu kanałach: koła stoją, czyli napęd nie jest zasilany z Pi. Znalezisko: po zamknięciu GPIO Zero ENA wisi na HIGH ([07 §2](07-sprzet-i-naped.md#2-połączenia-i-gpio)). Bez miernika: brak napięć pakietu i silników, prądu i temperatury silników, więc P01, P03 i P05 pozostają otwarte |

## 4. Progi zaliczenia

Próba z czasem lub drogą jest zaliczona, gdy każdy pomiar mieści się w progu. Progi są początkowe; zmiana progu to edycja tej tabeli, nie poszerzenie tolerancji przy próbie.

| Nr | Wielkość | Mierzymy od → do | Próg | Skąd próg |
|---|---|---|---|---|
| T1 | Watchdog ruchu | Ostatni przyjęty `drive` → oba enable LOW | ≤ 430 ms | 400 ms ([05 §3](05-agent-pi.md#3-pętla-sterowania-i-watchdog-ruchu)) plus 30 ms na okres pętli i jitter |
| T2 | STOP na Pi | Odbiór `stop` przez agenta → oba enable LOW | ≤ 20 ms | Jeden okres pętli plus obsługa wiadomości |
| T3 | STOP od kierowcy | Przycisk STOP → `stopped` w panelu | ≤ `freshness_ttl_ms` | Potwierdzenie w budżecie obiegu ([02 §8](02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe)) |
| T4 | Helper GPIO | Start helpera → oba enable LOW i koniec procesu | ≤ 500 ms | Połowa `TimeoutStopSec` ([06 §1](06-nadzor-procesu-i-systemu.md#1-usługa-systemd)) |
| T5 | Zabity proces | `SIGKILL` agenta → oba enable LOW | ≤ 1 s | Wykrycie końca procesu przez `systemd` plus T4 |
| T6 | Zawieszony proces | `SIGSTOP` agenta → oba enable LOW | ≤ 2,5 s | `WatchdogSec` plus T4 |
| T7 | Watchdog systemu | Zawieszenie `systemd` → reset Pi | ≤ `RuntimeWatchdogSec` + 1 s | Do resetu wyjścia mogą sterować napędem ([06 §3](06-nadzor-procesu-i-systemu.md#3-wbudowany-watchdog-pi)); próg dotyczy resetu, nie enable |
| T8 | Maksymalny wiek komendy | — | `freshness_ttl_ms` ≤ 400 ms | Komenda nie starsza niż okno watchdoga ruchu |
| T9 | Droga zatrzymania | Ostatnia przyjęta komenda → koła stoją, na podłodze, przy limicie z profilu | ≤ 50 cm | Mały pojazd w kontrolowanym miejscu; przy przekroczeniu obniżamy limit operatora w [07 §5](07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja) |

Pełny czas reakcji na utratę kontroli składa się z trzech części: komenda w chwili przyjęcia może mieć do T8, ruch trwa do T1 po ostatniej przyjętej komendzie, potem koła toczą się wybiegiem. T9 mierzy dwie ostatnie części razem. T1–T3 mierzy log agenta i panelu zegarami monotonicznymi; dla T4–T7, gdy agent nie działa, potrzebny jest pomiar na pinie spoza procesu agenta. Metodę zapisujemy razem z wynikiem w §3.
