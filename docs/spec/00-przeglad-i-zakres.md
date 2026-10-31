# 00. Przegląd i zakres

## Informacje o dokumencie

| Pole | Wartość |
|---|---|
| **Projekt** | Internet RC Car |
| **Repozytorium** | `rc-cloudflare-pi` |
| **Data utworzenia** | 2026-10-24 |
| **Status** | Szkic. Spec powstała z [briefu](../BRIEF.md) i [triage](../TRIAGE.md), przed napisaniem kodu i przed pierwszym pomiarem |

---

## 1. Cel

Mały pojazd z dwoma silnikami DC, sterowany przez internet z przeglądarki telefonu lub komputera. Skręt powstaje z różnicy prędkości kół, obrót w miejscu z przeciwnych kierunków; nie ma mechanizmu skrętu kół.

Wersja 1 odpowiada na trzy pytania:

1. Czy posiadane Pi 4B, L298N, dwa silniki TT, pakiet 4×AAA i powerbank działają razem z użytecznym momentem?
2. Czy tor przeglądarka → Cloudflare → Pi mieści się w budżecie świeżości przez docelowe łącze?
3. Czy napęd wyłącza się po STOP, utracie komend i awarii procesu, bez samoczynnego wznowienia?

## 2. Główna zasada

**Koło kręci się tylko na podstawie świeżej komendy przyjętej przez Pi w uzbrojonej sesji; każda niepewność kończy się rozbrojeniem.**

Z tej zasady wynika, że Pi jest jedynym autorytetem napędu ([ADR-0002](../adr/0002-pi-jedynym-autorytetem-napedu.md)), wiek komendy sprawdza zegar Pi, a nie zegar przeglądarki ([ADR-0003](../adr/0003-token-swiezosci-hmac-z-zegarem-pi.md)), a po przerwie jazda nie wraca sama ([ADR-0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md)). Wyklucza też kolejkowanie komend, odtwarzanie sesji z dysku i przedłużanie terminów przez pośredników.

## 3. Zakres wersji 1

Wersja 1 to MVP z briefu: etapy E1–E5.

| Obszar | W zakresie |
|---|---|
| Sprzęt | Lokalny test Pi → L298N → silniki, kalibracja PWM, pomiary zasilania ([07](07-sprzet-i-naped.md)) |
| Protokół | Protokół v1 w `protocol/`: schematy JSON i wspólne przykłady ([02](02-protokol-v1.md)) |
| Cloudflare | Worker, jeden Durable Object na auto, ochrona panelu i WebSocketu, token urządzenia ([03](03-worker-i-durable-object.md)) |
| Panel | Dwa suwaki, klawiatura, aktywacja, STOP, minimalne statusy ([04](04-panel-sterowania.md)) |
| Agent Pi | WSS z reconnectem, sesja ruchu, tokeny świeżości, watchdog ruchu, telemetria, tryb symulacji ([05](05-agent-pi.md)) |
| Nadzór | Usługa `systemd` z watchdogiem, helper GPIO, wbudowany watchdog Pi ([06](06-nadzor-procesu-i-systemu.md)) |
| Próby | Próby odbiorowe i zapis wyników ([08](08-proby-odbiorowe.md)) |
| Instrukcja | `README.md`: połączenia, konfiguracja, uruchomienie, testy, wdrożenie obu aplikacji |

## 4. Poza zakresem wersji 1

| Element | Uzasadnienie |
|---|---|
| Obsługa dwóch palców, widoczny czas potwierdzenia, regulacja limitu mocy w panelu | Etap E6; wymaga działającego toru i wyników MVP. Dodatek, bez przepisywania |
| Rampy przyspieszania i zwalniania, strojenie PWM i okien czasowych | Etap E6; parametry wynikają z pomiarów MVP |
| Kamera, enkodery, PID, pomiar baterii i prądu, historia przejazdów, autonomia | Etap E7; każda funkcja wymaga osobnego zakresu |
| Wiele aut, aplikacja mobilna, WebRTC | Etap E7. Wiele aut to dodatek: DO jest już per `car_id` |
| D1, R2, kolejki | Tor sterowania nie przechowuje ani nie odtwarza komend ([03 §7](03-worker-i-durable-object.md#7-przekazywanie)) |
| Hibernacja Durable Object | Przy telemetrii 5 Hz nie daje oszczędności ([ADR-0007](../adr/0007-standardowe-websockety-bez-hibernacji.md)) |
| Zewnętrzny watchdog sprzętowy | Wystarczają trzy poziomy nadzoru z [06 §4](06-nadzor-procesu-i-systemu.md#4-trzy-poziomy-nadzoru) ([ADR-0008](../adr/0008-nadzor-systemd-i-helper-gpio.md)) |
| Automatyczne wznowienie jazdy po przerwie | Odrzucone ([ADR-0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md)) |

## 5. Użytkownicy

| Rola | Potrzeba |
|---|---|
| Operator | Zalogować się do panelu, zobaczyć stan auta i połączenia, świadomie przejąć sterowanie |
| Kierowca | Sterować oboma kołami z telefonu lub komputera i zatrzymać auto jednym przyciskiem |
| Osoba przy aucie | Wykonać próby sprzętowe z uniesionymi kołami i ogniwami napędu w zasięgu ręki (auto nie ma wyłącznika napędu) |

W wersji 1 wszystkie trzy role pełni zwykle jedna osoba.

## 6. Kryteria sukcesu

Warunek zamknięcia MVP:

1. Oba kanały kręcą w obu kierunkach z regulacją PWM (próby P01–P02, [08 §2](08-proby-odbiorowe.md#2-próby-odbiorowe-mvp)).
2. Pi zasilane z powerbanku nie restartuje się przy rozruchu obu silników (P06).
3. Kierowca steruje autem przez docelowe łącze: oba koła, skręt, obrót w miejscu (P22).
4. Napęd wyłącza się po STOP, utracie komend i awarii procesu w progach z [08 §4](08-proby-odbiorowe.md#4-progi-zaliczenia), bez samoczynnego wznowienia (P10, P11, P19, P20, P25).
5. Wyniki w [08 §3](08-proby-odbiorowe.md#3-wyniki) obejmują użyte ogniwa i powerbank, napięcia pod obciążeniem, kalibrację PWM, temperatury, opóźnienia i zmierzone czasy każdego watchdoga.

Wynik E1 może wskazać, że zasilanie lub mostek trzeba zmienić przed jazdą. To też jest zamknięcie pytania 1 z §1.

## 7. Środowiska

| Środowisko | Gdzie | Uwagi |
|---|---|---|
| Lokalne | Komputer dewelopera | Agent w trybie symulacji, Worker przez `wrangler dev` |
| Pi | Raspberry Pi 4B, Raspberry Pi OS | Agent jako usługa `systemd`; ręczne uruchomienie do diagnostyki |
| Cloudflare | Workers + Durable Objects, wdrożenie przez Wrangler | Jedno środowisko; osobnego stagingu nie planujemy |

## 8. Słownik

| Termin | Znaczenie |
|---|---|
| Auto | Pojazd identyfikowany przez `car_id`. W wersji 1 jedno |
| Agent | Program Python na Pi w `apps/pi-agent/` |
| Panel | Aplikacja Vue w przeglądarce, serwowana przez Worker |
| Operator | Zalogowany użytkownik panelu |
| Kierowca | Operator, który ma aktualną dzierżawę |
| Dzierżawa | Nadane przez DO prawo jednej karty panelu do wysyłania komend (`lease_id`); wygasa po 3 s ciszy |
| Uzbrojenie | Przejście agenta w stan przyjmowania `drive` (`arm` → `armed`). W panelu przycisk „Aktywuj sterowanie” |
| Rozbrojenie | Oba enable na 0, unieważnienie sesji ruchu i jej tokenów |
| Sesja ruchu | Okres od uzbrojenia do rozbrojenia, oznaczony `session_id` nadanym przez Pi |
| Token świeżości | `freshness_token`: czas monotoniczny Pi podpisany HMAC sesji ([02 §5](02-protokol-v1.md#5-token-świeżości)) |
| Profil jazdy | Kalibracja PWM, deadband i limit mocy ([07 §5](07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja)) |
| Profil czasowy | `token_interval_ms`, `freshness_ttl_ms` i próg ostrzegania ([02 §8](02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe)) |
| Watchdog ruchu | Rozbrojenie po 400 ms bez przyjętego `drive`, mierzone na Pi |
| Watchdog procesu | `WatchdogSec` usługi `systemd` |
| Watchdog systemu | Wbudowany watchdog Pi obsługiwany przez `RuntimeWatchdogSec` |
| Helper GPIO | Osobny program wyłączający oba enable poza procesem agenta |
| Wybieg | Enable = 0: mostki wyłączone, koło toczy się swobodnie. Tak działa STOP |
| Estymata obiegu | Przybliżenie czasu panel → Pi → panel. Nie jest opóźnieniem w jedną stronę |
| Wysterowanie | Zadana wartość koła (-1…1 lub duty). Nie jest zmierzoną prędkością |
| Kanał A, kanał B | Wyjścia L298N; umownie A = lewe koło, B = prawe |
| Tryb symulacji | Agent bez GPIO, do testów całego przepływu na komputerze |

## 9. Otwarte kwestie

Numery kwestii są stałe, bo plan się do nich odwołuje. Rozstrzygnięta kwestia zostaje w tabeli z odpowiedzią i odnośnikiem do sekcji, która ją zawiera; wiersza nie usuwamy.

| # | Pytanie | Warianty | Co to rozstrzygnie |
|---|---|---|---|
| 1 | Jak uwierzytelniać operatora panelu i jego WebSocketu? | Rozstrzygnięta 2026-10-31: Cloudflare Access z kontrolą JWT w Workerze, [03 §2](03-worker-i-durable-object.md#2-uwierzytelnienie), [ADR-0013](../adr/0013-cloudflare-access-dla-operatora.md) | Decyzja właściciela projektu przed udostępnieniem panelu w internecie |
| 2 | Która wersja Raspberry Pi OS i który backend PWM GPIO Zero? | Rozstrzygnięta: GPIO Zero z `lgpio` dla PWM i helper na `pinctrl`, [07 §1](07-sprzet-i-naped.md#1-zestaw); wynik w [08 §3](08-proby-odbiorowe.md#3-wyniki) | Sprawdzenie OS na Pi i próba helpera GPIO po zabiciu procesu z aktywnym PWM |
| 3 | Jakie są parametry posiadanych silników? | DNG-16016 lub inny TT 3–6 V | Oznaczenia na obudowie i pomiar prądu przy 100% PWM |
| 4 | Czy pakiet 4×AAA daje pod obciążeniem `VS ≥ 5,8 V` i wystarczający moment? | Alkaliczne; inne ogniwa; inny pakiet lub mostek | Próba 100% PWM (P03, P05) |
| 5 | Czy powerbank (model, port, kabel) utrzymuje Pi przy rozruchu silników? | Obecny port i kabel; inny port lub kabel | Próba P06 bez resetów i ostrzeżeń undervoltage |
| 6 | Jakie są `min_start_duty`, `min_run_duty`, `max_duty`, deadband i limit operatora? | Wartości z pomiaru; 40–60% to tylko hipoteza | Kalibracja 100 Hz (P02) |
| 7 | Jak długa przerwa przy zmianie kierunku? | Wartość w ms | Próba na uniesionych kołach przed pierwszą jazdą |
| 8 | Jakie `freshness_ttl_ms` i jaki próg ostrzegania? | `TTL ≥ RTT_p99 + T + margines` | Pomiar obiegu z heartbeatów na docelowym łączu (P08), potem weryfikacja wieku tokenów (P14) |
| 9 | Jaka sieć i jakie miejsce pierwszej jazdy? | Wi-Fi; LTE | Decyzja właściciela projektu przed próbą P22 |
| 10 | Podwozie, koła i obciążenie? | — | Potwierdzenie dwóch niezależnych napędów na złożonym aucie |
| 11 | Czy `/dev/watchdog0` działa i jaki timeout system faktycznie stosuje? | — | Sprawdzenie na docelowym OS (P21) |
| 12 | Jaką wartość zadaje wciśnięty klawisz? | Rozstrzygnięta 2026-10-31: ±1 ograniczane profilem jazdy na Pi, [04 §1](04-panel-sterowania.md#1-wejścia) | Pierwsza próba klawiatury na symulatorze |
| 13 | Jakie limity rozmiaru i częstotliwości wiadomości stosuje DO? | Rozstrzygnięta: `protocol/limits.json`, wartości i reguły w [02 §10](02-protokol-v1.md#10-pliki-w-protocol) | Schematy w `protocol/` (RC-12) |
| 14 | Czy dodać zewnętrzne 10 kΩ ENA–GND i ENB–GND? | Z rezystorami; bez | Próba P04: start, reset i odłączenie Pi bez ruchu kół |
| 15 | Jak agent kończy pracę przy błędzie trwałym (odrzucony token, zła konfiguracja, błąd helpera), skoro `systemd` restartuje go co 1 s? | Kod wyjścia z `RestartPreventExitStatus`; długi odstęp ponowień w procesie | Projekt usługi `systemd` i próba z błędnym tokenem na Pi |
| 16 | Czym odcinamy napęd przy jeździe po ziemi, skoro koszyk 4×AAA nie ma wyłącznika? | Wyłącznik w przewodzie plus; wyjęcie ogniw; inne odcięcie niezależne od Pi | Decyzja właściciela projektu przed pierwszą jazdą po ziemi (P22, P25); przy uniesionych kołach wystarcza wyjęcie ogniw. Właściciel nie planuje wyłącznika (2026-10-24) |
