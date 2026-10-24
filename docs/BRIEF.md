# Internet RC Car — brief projektu i etapy realizacji

## Cel i zakres

Zbudować mały pojazd sterowany przez internet z przeglądarki telefonu lub komputera. Dwa silniki DC niezależnie napędzają lewe i prawe koło. Skręcanie odbywa się przez różnicę ich prędkości, a obrót w miejscu przez przeciwne kierunki pracy. Nie ma mechanizmu skrętu kół.

Jedno repozytorium zawiera dwie aplikacje: aplikację Cloudflare (panel WWW i backend) oraz agenta Python uruchamianego na Raspberry Pi. Projekt zaczyna się od jednego auta i jednego aktywnego kierowcy. Pierwszym celem jest szybkie sprawdzenie, czy posiadane Pi, sterownik L298N, silniki, zasilanie i połączenie internetowe działają razem poprawnie.

Dokument opisuje także docelową rozbudowę. O zakresie pierwszej implementacji decyduje poniższy podział. Wartości czasowe i limit mocy są ustawieniami początkowymi do weryfikacji na sprzęcie.

Decyzje po przeglądzie uwag do briefu: [triage i uzasadnienie zmian](TRIAGE.md).

## Priorytety i kolejność implementacji

### Etap 1 — MVP: sprawdzenie posiadanego zestawu

MVP ma dwa kolejne punkty kontrolne. Wynik testu lokalnego powinien być dostępny przed ukończeniem aplikacji Cloudflare. Konfiguracja napędu do implementacji to dwa silniki DC z przekładnią typu TT, roboczo 3–6 V; dane DNG-16016 są katalogowym punktem odniesienia, nie potwierdzonym SKU egzemplarzy. Nie czekamy na identyfikację SKU z pracą nad kodem; przed próbą napędu sprawdzamy zasilanie, oznaczenia i rzeczywiste zachowanie silników.

**MVP-A — test lokalny Pi → L298N → silniki:**

- Zapis konfiguracji Pi 4B, dwóch napędów TT i zasilania; sprawdzenie oznaczeń/napięcia silników, połączeń, zworek i mapowania GPIO.
- Minimalny adapter L298N i lokalny skrypt diagnostyczny, bez panelu i Cloudflare. Skrypt uruchamia osobno kanał A i B w obu kierunkach, pozwala sprawdzić PWM i wyłącza wyjścia po zakończeniu lub obsłużonym błędzie. Każda próba ruchu ma krótki, jawnie ustawiony limit czasu; nie pozostawia napędu włączonego w oczekiwaniu na kolejne polecenie.
- Konfigurowalne piny i odwrócenie kierunku każdego koła. Kalibracja PWM zamiast stałego limitu 30%: diagnostyka dopuszcza krótkie próby aż do `max_duty=1.0` (100%) po sprawdzeniu zasilania. Początkowa częstotliwość 100 Hz; pomiar progu rozruchu i podtrzymania ruchu każdego koła w obu kierunkach. Nie przyjmować 40–60% jako gotowej kalibracji.
- Pomiar napięcia pakietu i silników, prądu oraz temperatury przy 100% PWM: najpierw koła uniesione, następnie krótka próba pod obciążeniem. Profil jazdy powstaje z wyników; brak ruchu nie uzasadnia pozostawiania zablokowanego silnika pod prądem.
- Pierwsze próby z uniesionymi kołami i dostępnym fizycznym wyłącznikiem napędu. Sprawdzenie startu/resetu Pi, kierunków, niezależności kanałów, spadków napięcia, nagrzewania i ewentualnych restartów Pi przy rozruchu silników.

**MVP-B — test całego toru przeglądarka → Cloudflare → Pi → napęd:**

- Minimalny Worker, jeden Durable Object i wychodzące połączenie WSS agenta. Jeden samochód, jeden operator; ochrona panelu i WebSocketu oraz osobny token urządzenia są wymagane już tutaj.
- Prosty panel z dwoma suwakami, aktywowaniem sterowania, STOP oraz informacją o połączeniu i przyczynie zatrzymania. Na komputerze także klawiatura: W/S sterują lewym kołem, strzałki góra/dół prawym; zwolnienie klawisza zeruje dane koło. Pozwala to sprawdzić oba kanały jednocześnie bez obsługi dwóch palców, którą dopracujemy w etapie 2.
- Protokół v1, walidacja po obu stronach, świeżość komend, blokada drugiego kierowcy, lokalny watchdog i ponowne aktywowanie po utracie kontroli. Te mechanizmy należą do MVP.
- Minimalna telemetria: stan agenta, ostatni przyjęty `seq`, wysterowanie kół i przyczyna zatrzymania. Logi wystarczają do pomiaru czasu potwierdzenia i diagnozowania problemów.
- Przed próbą jazdy pomiar obiegu panel → Pi → panel z heartbeatów i telemetrii, również przy rozbrojonym napędzie. Na tej podstawie ustalić TTL tokenu świeżości i wcześniejsze ostrzeżenie; nie aktywować jazdy bez skonfigurowanego profilu czasowego.
- Agent z automatycznym reconnectem oraz usługa `systemd` z restartem, watchdogiem procesu i procedurą wyłączenia GPIO. Wbudowany watchdog Pi jako dodatkowy mechanizm restartu systemu, po sprawdzeniu na docelowym OS. Tryb symulacji i ręczne uruchomienie pozostają dostępne do diagnostyki.
- Próba obu kół, skrętu i obrotu w miejscu przez internet, następnie krótka jazda z limitem dobranym w MVP-A, w kontrolowanym miejscu i w zasięgu wzroku operatora. Pi zasila posiadany powerbank przez USB-C; napęd ma osobny pakiet 4×AAA.
- Krótka instrukcja połączeń, konfiguracji, uruchomienia i wdrożenia oraz zapis wyników prób. Testy poprawnych i niepoprawnych komend oraz utraty kontroli są częścią MVP.

**Warunek zamknięcia MVP:** potwierdzone działanie obu kanałów i PWM, stabilne zasilanie Pi z powerbanku, sterowanie przez docelowe połączenie internetowe oraz wyłączenie napędu po STOP, utracie komend i awarii procesu. Wynik zawiera użyte ogniwa i powerbank, napięcia pod obciążeniem, kalibrację PWM, obserwacje temperatury, opóźnienia i zmierzone czasy poszczególnych watchdogów. Jeśli zapas napięcia lub momentu nie wystarcza, wynik MVP-A może wskazać konieczność zmiany zasilania/mostka przed jazdą.

### Etap 2 — kolejna implementacja: wygodne i powtarzalne użytkowanie

- Dopracowany panel telefonu: dwa palce jednocześnie, czytelne statusy połączeń i świeżości telemetrii, widoczny czas potwierdzenia komendy oraz regulacja limitu mocy.
- Dopracowanie diagnostyki i instalacji usługi; podstawowe `systemd`, reconnect i watchdogy należą już do MVP. Odzyskanie połączenia nadal wymaga ręcznego aktywowania jazdy.
- Strojenie ramp przyspieszania/zwalniania, przerwy zmiany kierunku, częstotliwości PWM, okna świeżości i watchdoga na podstawie wyników MVP; szersze próby na docelowym Wi-Fi/LTE.
- Pełna instrukcja instalacji od czystego systemu, uporządkowana diagnostyka oraz szersze testy kontraktu w TypeScript i Pythonie oraz restartów.

### Etap 3 — nice to have

Kamera/podgląd wideo, enkodery i regulacja prędkości PID, pomiar baterii i prądu, historia przejazdów, wiele aut, aplikacja mobilna, WebRTC oraz eksperymenty z autonomią i planowaniem tras. Każda z tych funkcji wymaga osobnego zakresu po sprawdzeniu podstawowego zestawu. D1, R2 i kolejki nie są potrzebne w torze sterowania MVP.

Hibernację DO rozważyć dopiero przy ograniczeniu ruchu w spoczynku: brak aktywnej dzierżawy, telemetria na zmianę stanu lub dostatecznie rzadko i brak częstego timera. Przy stałej telemetrii 5 Hz nie zakładamy oszczędności. Ewentualne attachments muszą obejmować stan połączeń/dzierżawy, jej termin i bezpieczne wygasanie; nie jest to wymaganie etapu 2.

Nie planujemy zakupu zewnętrznego watchdoga do MVP. Używamy watchdoga komend, nadzoru procesu przez systemd i wbudowanego watchdoga Pi. Ten ostatni restartuje komputer; nie odcina osobno napędu. Fizyczny wyłącznik i nadzorowane próby pozostają potrzebne, a ograniczenia czasów reakcji są opisane poniżej.

## Architektura

Przeglądarka i Raspberry Pi niezależnie nawiązują szyfrowane połączenia WebSocket do Cloudflare. Worker uwierzytelnia klientów i przekazuje ich do tego samego Durable Object identyfikowanego przez `car_id`. Durable Object przekazuje komendy do Pi, a status i potwierdzenia do przeglądarki.

Raspberry Pi samodzielnie inicjuje połączenie wychodzące. Nie wymaga publicznego IP, przekierowania portów ani Cloudflare Tunnel. PWM i obsługa silników działają lokalnie na Pi. Cloudflare przekazuje wyłącznie zadane wartości sterowania.

## Część 1 — aplikacja Cloudflare

**Stack:** TypeScript, Vue 3 + Vite, Workers Static Assets, Cloudflare Worker i Durable Objects ze standardowymi WebSocketami. Wdrożenie przez Wrangler. Hibernacja nie należy do MVP ani etapu 2.

### Panel sterowania

Poniższy opis obejmuje panel po etapie 2. MVP realizuje podstawowe suwaki i klawiaturę, aktywowanie, STOP, zerowanie po utracie interakcji i minimalne statusy wskazane wyżej; pełna obsługa dwóch palców oraz wizualizacja opóźnień dochodzą później.

- Dwa pionowe suwaki/joysticki, osobno dla lewego i prawego koła, w zakresie od -100% do +100%. Obsługa dwóch palców jednocześnie na telefonie.
- Wartość dodatnia oznacza jazdę do przodu, ujemna do tyłu, zero wyłączenie napędu danego koła.
- Zwolnienie suwaka lub klawisza zeruje dane koło. Utrata fokusu, ukrycie karty lub anulowanie gestu zeruje oba i rozbraja sterowanie.
- Przycisk „Aktywuj sterowanie”, duży przycisk STOP i konfigurowalny limit PWM z profilu ustalonego w MVP-A. Bez kalibracji jazda jest zablokowana; nie narzucamy domyślnych 30%.
- Statusy: auto offline, gotowe, sterowanie aktywne, zatrzymane, błąd. Osobno status połączenia panelu i świeżość telemetrii auta.
- Pomiar obiegu bez porównywania zegarów UTC, z heartbeatów i potwierdzeń `drive` według sekcji protokołu. To przybliżenie RTT, nie czas reakcji silnika ani opóźnienie w jedną stronę. Ostrzeżenie wynika z profilu i jest niższe niż budżet `TTL − interwał_tokenu`; np. 150–200 ms przy ilustracyjnym TTL 300 ms i interwale 50 ms. Nie używamy stałego progu 500 ms. Brak świeżego pomiaru pokazywać oddzielnie; panel nie zastępuje lokalnego zatrzymywania.
- Podczas aktywnej jazdy, już w MVP, wysyłanie pełnego stanu obu kół co 50 ms (20 Hz), również gdy wejścia operatora się nie zmieniają.

### Worker i Durable Object

- Worker serwuje panel i obsługuje wejścia WebSocket dla kierowcy oraz urządzenia.
- Osobne uwierzytelnienie: sesja użytkownika dla panelu oraz token urządzenia przypisany do `car_id` dla Pi. Panel i jego WebSocket chronić tym samym mechanizmem logowania; sprawdzać też Origin. Token urządzenia przechowywać jako sekret, bez umieszczania w URL lub frontendzie.
- Jeden Durable Object na `car_id`; najwyżej jedna aktualna dzierżawa kierowcy i jedno połączenie urządzenia. DO jest autorytetem dostępu do toru komunikacji; **Pi jest jedynym autorytetem aktywowania napędu**, sesji ruchu, `seq`, świeżości i watchdoga. DO nie tworzy drugiej maszyny stanów jazdy; pokazuje stan potwierdzony przez Pi oraz jego aktualność.
- DO waliduje wersję i schemat wiadomości, rolę nadawcy, zakresy, rozmiar i częstotliwość; przepuszcza komendy tylko z aktualnej dzierżawy. Semantyczne przyjęcie `session_id`, `seq` i tokenu świeżości należy do Pi. Walidacja struktury także na Pi pozostaje wymagana.
- Dzierżawa kierowcy wygasa po 3 s bez poprawnej wiadomości aplikacyjnej od jej właściciela. Panel w widocznej karcie wysyła `heartbeat` z `heartbeat_seq` co 1 s także bez jazdy; poprawne `drive` również podtrzymuje dzierżawę. Heartbeat DO przekazuje do Pi, jeżeli jest online, do pomiaru pełnego obiegu z telemetrii. Nie jest on komendą ruchu i nie odświeża watchdoga napędu. Ping/pong transportowy nie odnawia dzierżawy. Wiadomość po terminie nie odnawia jej, nawet gdy sprzątający timer jeszcze nie wykonał się.
- Po wygaśnięciu DO odcina starą kartę od wysyłania, wysyła STOP i zwalnia dzierżawę; następny operator nadal musi aktywować nową sesję na Pi. „Przejmij” jest świadomą akcją uprawnionego operatora: unieważnienie starej dzierżawy → STOP → potwierdzone `stopped` przez Pi → nowa dzierżawa i osobne aktywowanie przy zerowych wejściach. Przy braku potwierdzenia nie udawać, że auto jest gotowe.
- Natychmiastowe przekazywanie aktualnych komend. Brak kolejki trwałej, historii do odtworzenia i ponawiania starych poleceń jazdy.
- W MVP i etapie 2 użyć standardowych WebSocketów bez hibernacji. Utrata instancji lub stanu dzierżawy kończy sterowanie i wymaga ponownego połączenia oraz aktywowania; nie odtwarzać pozwolenia na jazdę ze starej karty.
- Wykryte rozłączenie kierowcy powoduje żądanie STOP; sesję ruchu unieważnia Pi. Lokalny watchdog Pi działa niezależnie, również gdy Cloudflare jeszcze nie wykrył zerwania połączenia. Restart DO i reconnect nie wznawiają jazdy.

## Część 2 — agent Python na Raspberry Pi

**Stack:** Raspberry Pi OS, Python, `asyncio`, klient `websockets`, GPIO Zero. Backend GPIO dobrać i przypiąć do modelu Pi 4B oraz systemu. Już w MVP-B agent działa jako usługa `systemd`; tryb ręczny służy diagnostyce.

### Odpowiedzialności

- Wychodzące połączenie WSS, uwierzytelnienie urządzenia i automatyczny reconnect już w MVP. Użyć iteratora `async for ws in connect(...)` z `websockets.asyncio.client`: biblioteka ponawia błędy przejściowe z rosnącym odstępem. Błędów tokenu/konfiguracji nie traktować jak zwykłej chwilowej utraty sieci. Obsłużyć również zamknięcie istniejącego połączenia; przypiąć wersję biblioteki.
- Start zawsze z wyłączonym napędem. Po reconnect nie wznawiać jazdy; wymagać nowej sesji i świadomego aktywowania w panelu przy zerowych suwakach.
- Pi generuje `session_id` dopiero w potwierdzeniu `armed`, wiąże go z dzierżawą kierowcy i generuje tokeny świeżości. Waliduje wersję protokołu, sesję, rosnący `seq`, skończone liczby -1…1 i ważność tokenu według własnego zegara monotonicznego.
- Oddzielić obsługę sieci od pętli sterowania i watchdoga. Przetwarzać najnowszy ważny stan; nie wykonywać zaległej sekwencji ruchów.
- Sterowanie mostkiem H: kierunek i PWM, limit mocy, konfiguracja pinów oraz odwrócenie kierunku niezależnie dla każdego koła.
- W MVP zmiana kierunku przechodzi przez zero z przerwą ustaloną przed próbą na sprzęcie. Dopracowane rampy łagodnego przyspieszania i zwykłego zwalniania dochodzą w etapie 2. STOP, timeout i błąd zawsze omijają rampę i natychmiast wyłączają napęd.
- Watchdog mierzony zegarem monotonicznym po 400 ms bez nowego, ważnego `drive` wyłącza napęd, rozbraja agenta i unieważnia sesję. Tak samo działają błąd sterowania i rozłączenie. Heartbeat, telemetria, tokeny oraz transportowe ping/pong nie przedłużają pozwolenia na ruch; opóźniona komenda nie może go wznowić. Nie zachowujemy sesji do 2 s w celu automatycznego powrotu jazdy.
- Telemetria np. 5 Hz: stan agenta, `session_id`, `last_seq`, `seq_age_ms`, zadane/wysterowane wartości kół i przyczyna zatrzymania. Dodatkowo identyfikator dzierżawy, `last_heartbeat_seq` i `heartbeat_age_ms` do pomiarów także przed aktywowaniem. Wiek oznacza czas od odebrania danego komunikatu do utworzenia telemetrii, mierzony na Pi monotonicznie; brak komunikatu oznaczać `null`. Bez enkoderów nie raportować wysterowania jako zmierzonej prędkości.
- Tryb symulacji bez GPIO do uruchamiania i testowania całego przepływu na komputerze.

### Nadzór procesu, systemu i odzyskanie połączenia — MVP

- Usługa: `Type=notify`, `NotifyAccess=main`, `Restart=always`, `RestartSec=1s`, `WatchdogSec=2s`. `WATCHDOG=1` wysyłać po wykonaniu zdrowej iteracji pętli sterowania, nie z niezależnego timera, który mógłby maskować zawieszenie. Pętla działa również przy braku sieci, z napędem wyłączonym.
- Ustawić `WatchdogSignal=SIGKILL` i krótki `TimeoutStopSec` (początkowo 1 s), aby nie opierać reakcji na domyślnym SIGABRT i długim zapisie core dump. Nie traktować 2 s jako gwarantowanego czasu fizycznego zatrzymania: dochodzi wykonanie procedury wyłączenia i tolerancja systemu.
- `ExecStartPre` i `ExecStopPost` wywołują lokalny helper wyłączający **oba ENA/ENB**, również po przerwaniu procesu. Helper musi działać dla wybranego backendu, zatrzymać istniejący PWM, przełączyć piny na wyjścia LOW i zakończyć się w ograniczonym czasie. Samo `finally` Pythona nie wystarcza; wyjście procesu ani rezystor nie gwarantują zakończenia PWM sprzętowego/obsługiwanego przez osobny daemon. Błąd helpera blokuje uruchomienie/aktywowanie do usunięcia przyczyny.
- Wbudowany watchdog Pi skonfigurować przez `RuntimeWatchdogSec`, początkowo 8 s, po sprawdzeniu urządzenia `/dev/watchdog0`, sterownika i rzeczywiście zastosowanego timeoutu. Konfigurację firmware/kernel dostosować do zainstalowanego OS. Nie uruchamiać równolegle drugiego procesu obsługującego ten sam watchdog.
- Wbudowany watchdog reaguje, gdy systemd przestaje go obsługiwać; nie wykrywa każdego częściowego zawieszenia. Nie gwarantuje wyłączenia silników w 400 ms: do restartu wyjścia mogą nadal sterować napędem. Testy resetu i zawieszenia tylko z uniesionymi kołami i dostępnym wyłącznikiem.
- Reconnect przywraca komunikację, a restart usług/systemu stan rozbrojony. Nowe aktywowanie w panelu jest zawsze świadome; nie odtwarzać sesji ruchu z dysku.

### Sieć Pi — konfiguracja do pomiarów

Przy NetworkManager sprawdzić bieżący stan power saving i wyłączyć go w profilu używanym do jazdy:

```sh
nmcli connection modify "<nazwa-lub-UUID-profilu>" 802-11-wireless.powersave 2
```

Ustawienie zastosować przez reaktywację profilu przy zatrzymanym napędzie i zweryfikować efekt. Nazwa profilu nie musi być SSID. Nie zakładamy, że oszczędzanie jest zawsze domyślnie włączone ani że odpowiada za konkretny skok opóźnienia bez pomiaru. Optymalizacja sieci nie zmienia zasad świeżości i rozbrajania.

### Sprzęt

Potwierdzony komputer to **Raspberry Pi 4 Model B**, zasilany przez USB-C z **posiadanego powerbanku**. Sprawdzić model powerbanku, parametry konkretnego portu 5 V / 3 A i stabilność z użytym przewodem. Posiadany pakiet napędu to koszyk **4×AAA**; rodzaj ogniw i wydajność pod obciążeniem pozostają do sprawdzenia. Proponowane połączenia, piny i ustawienia zworek: [instrukcja](POLACZENIA.md), [schemat PNG](diagrams/pi4b-l298n-polaczenia.png), [schemat SVG](diagrams/pi4b-l298n-polaczenia.svg). Regulator modułu jest odłączony zworką CON5, logikę L298N zasila pin 5 V Pi, a baterie wyłącznie napęd.

**Konfiguracja napędu: dwa szczotkowe silniki DC z przekładnią typu TT, roboczo 3–6 V, po jednym na koło. Posiadany sterownik: L298N z Botland, MOD-03164.** Dokładny SKU silników nie jest potwierdzony; poniższa karta DNG-16016 służy do orientacyjnego doboru prób, a parametry egzemplarzy sprawdzamy w MVP-A.

#### Silniki TT — katalogowy punkt odniesienia DNG-16016

Dane robocze według [strony silnika Botland](https://botland.com.pl/silniki-dc-katowe-z-przekladnia/16016-silnik-dc-148-3-6v-z-podwojnym-walem-200rpm-5904422344078.html); nie są jeszcze potwierdzeniem parametrów posiadanych egzemplarzy:

| Parametr | Dane katalogowe |
| --- | --- |
| Typ | Silnik DC z przekładnią 1:48 i podwójnym wałem |
| Zasilanie | 3–6 V na zaciskach silnika |
| Prędkość przy 6 V | Około 200 obr./min, tolerancja ±10% |
| Moment deklarowany przez sklep | 0,8 kg·cm; bez jednoznacznego określenia warunków pomiaru |
| Wał | Średnica 5,4 mm, spłaszczenia po obu stronach |
| Enkoder | Brak; sterowanie PWM bez pomiaru rzeczywistej prędkości |

Strona sklepu podaje również następujące punkty pracy:

| Napięcie silnika | Prąd bez obciążenia | Prędkość bez obciążenia | Prąd zatrzymanego wirnika (stall current) |
| --- | --- | --- | --- |
| 3 V | 150 mA | 120 obr./min* | 1,1 A |
| 4,5 V | 155 mA | 185 obr./min | 1,2 A |
| 6 V | 160 mA | 200 obr./min | 1,5 A |

\* W sekcji specyfikacji ta sama strona podaje przy 3 V wartość 90 obr./min ±10%, inną niż 120 obr./min w opisie. Nie przyjmujemy jednej z nich jako pewnej.

[Załączona karta katalogowa](https://botland.com.pl/index.php?controller=attachment&id_attachment=4965) potwierdza zakres 3–6 V i około 200 obr./min przy 6 V. Podaje prąd bez obciążenia 150–200 mA oraz moment minimum 1000 gf·cm (1 kg·cm), a więc dane częściowo inne niż opis sklepu. Karta jest oznaczona jako orientacyjna i nie podaje stall current. Wartości prądu zatrzymania z tabeli traktujemy jako dane sprzedawcy do weryfikacji. Prąd 150–160 mA nie jest limitem prądu rozruchowego ani pracy pod obciążeniem.

**Konsekwencje dla projektu i prób MVP:**

- Podwójny wał należy do jednego napędu; nie daje dwóch niezależnych kanałów. Projekt wymaga dwóch silników, po jednym na koło.
- Wstępnie deklarowane 1,5 A przy 6 V mieści się poniżej katalogowego maksimum 2 A kanału L298N. To nie zatwierdza całego zestawu: pozostają straty mostka, temperatura, rozruch i obciążenie obu kół. Dwa silniki mogą łącznie pobierać około 3 A przy zatrzymaniu wirników przy 6 V na ich zaciskach; uwzględnić to przy doborze gałęzi zasilania napędu.
- Zakres 3–6 V dotyczy silnika. Oznaczenie `+12V` na module nie wyznacza napięcia dla tych silników. Zasilanie mostka dobrać z uwzględnieniem jego strat; ograniczenie PWM samo w sobie nie uzasadnia zasilania silników 12 V. Nie zakładać stałego spadku napięcia na L298N ani braku możliwości przeciążenia przy AAA.
- Przed jazdą sprawdzić rozruch przy niskim PWM, pobór prądu i nagrzewanie oraz poprawne zasilanie logiki mostka przy wybranym napięciu napędu. Jeśli silnik nie rusza, wyłączyć napęd i ustalić przyczynę; nie pozostawiać go zablokowanego. Spadki na L298N mogą ograniczać moment i użyteczny zakres regulacji dla silników 3–6 V.

#### Posiadany moduł L298N

Według [specyfikacji modułu Botland](https://botland.com.pl/sterowniki-silnikow-moduly/3164-l298n-dwukanalowy-sterownik-silnikow-modul-12v-2a-5904422359317.html):

| Parametr | Dane modułu |
| --- | --- |
| Kanały | Dwa silniki DC z niezależnym kierunkiem i PWM |
| Zasilanie silników | Do 12 V; tabela parametrów podaje 5–12 V |
| Zasilanie logiki | 5 V; wbudowany regulator odłączany zworką |
| Maksymalny prąd | 2 A na kanał |
| Połączenia | Zaciski śrubowe zasilania i silników, goldpiny sterowania 2,54 mm |
| Mechanika | Radiator; płytka 44 × 44 × 30 mm |

Przypisanie złączy z tej samej dokumentacji:

| Złącze | Rola w projekcie |
| --- | --- |
| `OUT1`, `OUT2` | Silnik A, umownie lewe koło |
| `OUT3`, `OUT4` | Silnik B, umownie prawe koło |
| `IN1`, `IN2` | Kierunek A |
| `IN3`, `IN4` | Kierunek B |
| `ENA`, `ENB` | PWM/enable A i B; zworki domyślnie łączą je z 5 V |
| `+12V`, `GND` | Zasilanie silników i masa |
| `+5V` | Zasilanie logiki po odłączeniu regulatora zworką 5V |

**Ustalenia projektowe do podłączenia:** zdjąć zworki ENA/ENB przed połączeniem z GPIO; PWM podawać osobno na oba enable. Zworka regulatora 5V jest oddzielna. Przed włączeniem zasilania ustalić jej pozycję i sposób zasilania logiki dla posiadanego egzemplarza. Sam zakres 5–12 V nie potwierdza poprawnej pracy regulatora przy każdym napięciu wejściowym.

Według [noty ST L298, sekcje 4–5](https://www.st.com/resource/en/datasheet/l298.pdf) próg stanu wysokiego wejść kierunku i enable wynosi minimum 2,3 V. Wynika z tego zgodność sterowania sygnałem GPIO 3,3 V przy wspólnej masie, mimo zasilania logiki 5 V. Nie doprowadzać 5 V do GPIO Pi. Limit 2 A nie jest gwarancją pracy ciągłej gotowej płytki w dowolnych warunkach chłodzenia. Mostek ma znaczne straty: maksymalny spadek na całym mostku wynosi 3,2 V przy 1 A i 4,9 V przy 2 A, w warunkach podanych przez ST. Uwzględnić to przy doborze napięcia silników i kontroli nagrzewania; nie podnosić zasilania ponad limit modułu na podstawie parametrów samego układu scalonego.

Adapter GPIO ma jawnie obsługiwać cztery wejścia kierunku i dwa enable/PWM. Dla `EN=1` przeciwne stany pary `IN` wybierają kierunek; przypisanie „przód” ustala test okablowania. **Zero danego koła ustawia jego enable na 0; STOP i watchdog ustawiają oba enable na 0 — wyłączenie mostków i wybieg (coast).** Równe stany `IN` przy `EN=1` dają aktywne hamowanie; nie używamy go domyślnie przed weryfikacją prądów. Zachowanie enable i hamowania opisuje [nota ST, tabela 5](https://www.st.com/resource/en/datasheet/l298.pdf).

Nie zasilać silników z GPIO. Osobna gałąź zasilania napędu, wspólna masa, filtracja i fizyczny wyłącznik są wymagane. Nie zasilać Pi z regulatora L298N. Wybrane GPIO12/13 dla enable mają domyślny pull-down po resecie; start agenta i helper dodatkowo ustawiają LOW. Zewnętrzne 10 kΩ są zalecanym dodatkiem, opcjonalnym dla nadzorowanych prób MVP po sprawdzeniu rozruchu, resetu i odłączenia Pi. Ani wewnętrzny, ani zewnętrzny pull-down nie wymusi LOW na pinie aktywnie utrzymywanym w stanie wysokim. Zasilanie 5 V na headerze Pi może pozostać obecne przy zatrzymanym systemie — nie zakładać wyłączenia logiki L298N przy zawieszeniu/reboocie Pi.

STOP oznacza wyłączenie mostków i wybieg, nie natychmiastowe zatrzymanie kół. Ochronę przed awarią procesu/systemu rozszerzają opisane wyżej mechanizmy systemd i wbudowany watchdog Pi; nie są niezależnym od komputera odcięciem zasilania napędu.

### Kalibracja zasilania i PWM — MVP-A

Do pierwszej próby przyjmujemy świeże ogniwa alkaliczne 4×1,5 V, jeśli są dostępne; nie gwarantuje to odpowiedniego napięcia pod obciążeniem. Nota ST podaje `VS ≥ VIH + 2,5 V`; dla poziomu HIGH około 3,3 V przyjmujemy wymagany zapas około 5,8 V na wejściu mostka. Nominalne 4,8 V NiMH go nie zapewnia, a pakiet alkaliczny również może spaść poniżej niego. Działanie poza tym warunkiem nie jest potwierdzeniem zgodności ze specyfikacją.

- Ustawić PWM 100 Hz na enable. Krótkimi próbami wyznaczyć `min_start_duty`, `min_run_duty` i dopuszczalne `max_duty` osobno dla kół/kierunków, z uwzględnieniem obciążenia i spadku napięcia baterii. Diagnostyczne 100% nie oznacza automatycznie pełnej mocy podczas każdej jazdy.
- Przy 100% zmierzyć napięcie pakietu oraz między dwoma wyjściami danego silnika; przy PWM odczyt zwykłego miernika nie opisuje pełnego przebiegu. Zależność duty × napięcie nie wystarcza do przewidzenia rozruchu.
- Profil jazdy definiuje deadband i zmierzone `min_duty` potrzebne do startu. Poza deadband można mapować zakres wejścia na `min_duty…max_duty`; zero zawsze daje zero. Jeśli limit operatora jest niższy niż `min_duty`, nie podnosić go automatycznie — ruch jest zablokowany z czytelnym powodem. Nie dodawać niejawnego impulsu 100%.
- Przeciążenie/zablokowanie silnika pozostaje możliwe. Jeżeli przy poprawnym zasilaniu i 100% nie ma wystarczającego rozruchu, odnotować ograniczenie zestawu; nie zwiększać napięcia ponad dopuszczalne wartości silników/modułu.

## Wspólny protokół v1

JSON przez WSS. Wspólny kontrakt i przykładowe wiadomości mają znaleźć się w `protocol/`. Typy aplikacyjne: `hello`, `heartbeat`, `takeover`, `arm`, `armed`, `control_token`, `drive`, `stop`, `stopped`, `status`, `error`. Nie definiujemy aplikacyjnych `ping`/`pong`; ramki Ping/Pong transportu WebSocket obsługuje biblioteka/runtime i służą tylko utrzymaniu połączenia. Heartbeat i telemetria zapewniają kontrolę aplikacyjną, także w przeglądarce. Dzierżawę nadaje DO, a sesję ruchu i tokeny Pi; DO wiąże komunikaty z dzierżawą po stronie serwera, bez zaufania do identyfikatora podsuniętego przez klienta.

Przykładowa komenda:

```json
{
  "v": 1,
  "type": "drive",
  "session_id": "opaque-session-id",
  "seq": 123,
  "freshness_token": "opaque-signed-pi-monotonic-stamp",
  "left": 0.7,
  "right": -0.7
}
```

- `session_id` generuje Pi w `armed` i wiąże z aktualną dzierżawą kierowcy. Każde aktywowanie ma nowy identyfikator; `seq` rośnie w obrębie sesji. Tylko przyjęta przez Pi komenda może odświeżyć watchdog ruchu.
- `left` i `right` to żądane wysterowanie -1…1 przed zastosowaniem lokalnego limitu mocy. Nie są to wartości RPM.
- Nie używamy `sent_at_ms`, `expires_at_ms`, NTP ani offsetu zegara przeglądarki do decyzji o wykonaniu komendy. Poprawny czas systemowy potrzebny m.in. do weryfikacji certyfikatów WSS pozostaje zadaniem OS.
- **Świeżość bez synchronizacji zegarów i listy tokenów:** w `armed`, a potem co 50 ms w uzbrojonej sesji Pi wydaje token zawierający swój `issued_pi_ms` i HMAC-SHA256 wiążący wersję, `session_id` oraz ten czas. Czas to całkowite milisekundy z `monotonic_ns()` względem początku sesji. Losowy klucz HMAC istnieje tylko na Pi, jest nowy dla każdej sesji i znika przy rozbrojeniu/reconnect. Panel odsyła cały token bez zmian. Pi sprawdza format, bieżącą sesję, MAC i `0 ≤ now_pi_ms − issued_pi_ms ≤ freshness_ttl_ms`; nie przechowuje zbioru wydanych tokenów. Nie odsyłamy samego, dowolnie edytowalnego czasu — uwierzytelnienie kierowcy nie potwierdza, że znacznik wydało Pi.
- DO przekazuje token od razu i panel dołącza najnowszy do `drive`. Odbiór komendy nie odnawia terminu. Ponieważ token z poprawnym MAC musiał zostać wydany przez Pi, jego wiek ogranicza wiek komendy. Sam `seq`, watchdog i wybieranie najnowszej wiadomości nie wykrywają stale opóźnionego strumienia.
- Panel tworzy nowe ramki z aktualnego stanu wejść; nie podmienia tokenu w zaległej komendzie. DO również nie podmienia tokenów ani nie odnawia ich terminów. Brak świeżego tokenu nie uprawnia do wysyłania zaległej sekwencji po odzyskaniu łączności.
- `arm` wymaga neutralnych wejść, uprawnionej dzierżawy i potwierdzenia Pi. Żądania `arm` mają `request_id`: duplikat w aktualnej sesji nie tworzy drugiej sesji; żądanie ze starego połączenia/dzierżawy nie może uzbroić auta. `stop` wyłącza napęd i unieważnia sesję oraz tokeny; jest idempotentny, ma `request_id` potwierdzany w `stopped` i nie wymaga kolejnego numeru jazdy. DO może wysłać go po utracie/przejęciu dzierżawy.
- Potwierdzenie `seq` oznacza przyjęcie nastawy przez agenta, nie potwierdzenie ruchu koła.
- Panel zapamiętuje ograniczoną historię `sent[session_id, seq] = performance.now()`. Estymata `performance.now() − sent[last_seq] − seq_age_ms` odejmuje pobyt na Pi, pozostawiając przybliżenie obiegu komenda + telemetria. Przed jazdą analogicznie używamy `sent_heartbeat[lease_id, heartbeat_seq]` i `heartbeat_age_ms`; ten pomiar nie wymaga sesji ruchu, GPIO ani już ustalonego TTL. Nie dzielić wyniku przez dwa i nie nazywać go opóźnieniem jednokierunkowym; asymetria ścieżek oznacza też, że nie jest to dokładny pomiar obiegu tokenu. Przy obcym identyfikatorze, brakującym wpisie lub ujemnym/niespójnym wyniku pokazać „brak pomiaru”. Historię czyścić po zmianie sesji/dzierżawy, a brak postępu potwierdzeń pokazywać jako nieaktualny pomiar.

### Budżet świeżości i pomiary w MVP-B

Dla regularnego wydawania tokenów co `T`, bez jitteru, wiek tokenu po powrocie do Pi wynosi w przybliżeniu `RTT_token + faza`, gdzie `0 ≤ faza < T`. Stąd nominalnie:

```text
RTT_max ≈ freshness_ttl_ms − token_interval_ms
```

To budżet pełnego obiegu Pi → panel → Pi dla całego cyklu tokenów, a nie samej drogi komendy do Pi. Część komend może jeszcze przechodzić przy obiegu między `TTL − T` a `TTL`, zależnie od fazy. Opóźnienia obsługi zdarzeń, nierównomierne dostarczanie i utrata kolejnych tokenów dodatkowo zmniejszają zapas. Dawnego TTL komendy w jedną stronę nie można przepisać 1:1 na TTL tokenu.

**TTL nie ma jeszcze zatwierdzonej wartości dla auta.** Najpierw przy rozbrojonym napędzie zebrać próbki obiegu z heartbeatów na docelowym Wi-Fi/LTE, określić typowe wartości, p95/p99 i skoki. Wstępny dobór to `TTL ≥ RTT_p99 + T + margines`, z uwzględnieniem dopuszczalnego wieku polecenia; następnie sprawdzić rzeczywisty wiek tokenów i odrzucenia w symulatorze/na uniesionych kołach. Estymata z heartbeatów przebiega w przeciwnym kierunku i nie obejmuje identycznego harmonogramu, dlatego wymaga zapasu i tej drugiej weryfikacji. Jeśli potrzebny TTL jest nieakceptowalny dla jazdy, poprawiamy łącze; nie poszerzamy go automatycznie. `freshness_ttl_ms` i próg ostrzegania trafiają do profilu przed aktywowaniem, watchdog ruchu pozostaje oddzielnym limitem 400 ms.

Przykład obliczeniowy, nie gotowy profil: `TTL=300 ms`, `T=50 ms` daje około 250 ms nominalnego budżetu obiegu; ostrzeżenie może być ustawione na 150–200 ms, z zapasem przed granicą. Wcześniejsze `T=100 ms` zostawiało około 200 ms. Ostrzeżenie 500 ms mogło pojawić się dopiero po zatrzymaniu lub z opóźnionego potwierdzenia, więc nie było użytecznym progiem wyprzedzającym.

## Układ repozytorium

| Ścieżka | Zawartość |
| --- | --- |
| `docs/BRIEF.md` | Ten brief |
| `README.md` | Uruchomienie, konfiguracja, testy i wdrożenie obu aplikacji |
| `apps/cloudflare/` | Panel Vue, Worker, Durable Object, konfiguracja Wrangler |
| `apps/pi-agent/` | Agent Python, adapter GPIO, symulator, wzór konfiguracji, usługa systemd |
| `protocol/` | Schematy JSON, opis komunikatów i wspólne przykłady do testów |

Konfigurację i sekrety trzymać poza kodem. Repo zawiera wyłącznie wzory bez sekretów. Parametry Pi obejmują URL, `car_id`, token uwierzytelnienia urządzenia, piny, polaryzację, kalibrację/minimum/maksimum PWM, deadband, częstotliwość PWM, rampę i profil czasowy (`token_interval_ms=50`, dobrany `freshness_ttl_ms`, próg ostrzegania oraz timeouty). Klucz HMAC i dane sesji ruchu istnieją tylko w pamięci Pi, bez listy tokenów i bez przekazywania klucza do panelu.

## Próby odbiorowe MVP

| Próba | Oczekiwany wynik |
| --- | --- |
| Lokalny test A i B, osobno i razem | Oba kierunki, regulacja PWM, poprawne przypisanie kół; brak niezamierzonego ruchu drugiego kanału |
| Kalibracja PWM 100 Hz | Zapis progów startu i podtrzymania oraz dopuszczalnego maksimum w obu kierunkach, bez obciążenia i na podłodze; zero/STOP zawsze wyłącza enable |
| Krótka próba 100% PWM | Pomiar napięcia pakietu, napięcia na silnikach, prądu i temperatury; potwierdzenie zapasu zasilania, brak założenia „AAA nie przeciążą silnika” |
| Start/reset Pi i normalne zakończenie skryptu | ENA/ENB pozostają lub przechodzą w stan niski; start nie uruchamia silników |
| Dobór zasilania dla potwierdzonego modelu silnika | Uwzględniony zakres 3–6 V silników DNG-16016, straty mostka i prąd rozruchowy obu napędów; sprawdzone zasilanie logiki L298N |
| Powerbank Pi i rozruch obu silników | Stabilne zasilanie Pi z wybranego portu/kabla, brak resetów/undervoltage; zapis napięć i nagrzewania przy określonym obciążeniu oraz czasie próby |
| Symulator przez Cloudflare | Przepływ komend i statusów; odrzucanie braku autoryzacji i drugiego kierowcy |
| Pomiar przed aktywowaniem | Heartbeat przechodzi przez DO do Pi i wraca w telemetrii; da się dobrać profil TTL/ostrzeżenia przy wyłączonym napędzie i bez aplikacyjnego ping/pong |
| Zwolnienie suwaka lub klawisza | Zerowanie odpowiedniego koła |
| STOP, ukrycie karty, utrata fokusu, anulowanie gestu | Wyłączenie obu kanałów i rozbrojenie; brak samoczynnego wznowienia |
| Zerwanie sieci panelu lub Pi | Przy działającym agencie wyłączenie napędu najpóźniej po 400 ms od ostatniej ważnej komendy plus zmierzona tolerancja pętli; wcześniejszy wykryty błąd zatrzymuje od razu |
| Komendy z wygasłym tokenem, zdublowane, ze starej sesji lub spoza zakresu | Odrzucenie; brak odświeżenia watchdoga i brak uruchomienia po rozbrojeniu |
| Stale opóźniony strumień z rosnącym seq, starszy niż okno tokenu | Odrzucenie mimo zachowanego porządku wiadomości; brak przedłużenia ważności tokenu przez odbiór drive |
| Granice budżetu tokenów, interwał 50 ms, jitter i brak kolejnych tokenów | Zmierzony wiek/odsetek odrzuceń; ostrzeżenie poniżej budżetu, bez automatycznego zwiększania TTL; brak wznowienia po rozbrojeniu |
| Zmieniony czas/MAC, czas z przyszłości i token starej sesji | Odrzucenie bez odświeżenia watchdoga, mimo poprawnego uwierzytelnienia kierowcy |
| Zmiana zegara UTC, brak wpisu do estymaty czasu obiegu | Brak wpływu UTC na przyjęcie drive na istniejącym połączeniu; niespójny pomiar w panelu pokazany jako niedostępny |
| Półotwarta karta / brak heartbeat przez 3 s | Wygaśnięcie dzierżawy; spóźniona wiadomość jej nie odnawia; nowy operator musi aktywować nową sesję |
| Świadome przejęcie sterowania | Stara karta odcięta; Pi potwierdza STOP przed nową dzierżawą/aktywacją; spóźnione stare komendy nie ruszają kół |
| Ponowne połączenie lub restart agenta | Napęd wyłączony do nowej sesji i świadomego aktywowania przy zerowych suwakach |
| Deploy DO, restart usługi, awaria i zatrzymanie procesu (SIGSTOP/SIGKILL) | Reconnect bez podchodzenia do auta; systemd/helper wyłącza enable dla wybranego backendu, zapis zmierzonego czasu; brak wznowienia ruchu |
| Wbudowany watchdog systemu | Potwierdzony sterownik i timeout, kontrolowana próba resetu z uniesionymi kołami; brak ruchu po restarcie i zapis czasu do wyłączenia napędu |
| Próba przez docelowe Wi-Fi/LTE | Niezależne koła, skręt i obrót; zapis opóźnień i przerw w komunikacji |

## Otwarte ustalenia

| Element | Stan / dane potrzebne do dalszej pracy |
| --- | --- |
| Sterownik | Posiadany moduł L298N MOD-03164; potwierdzić oznaczenia i ustawienia zworek na egzemplarzu |
| Napęd | Konfiguracja: 2×DC z przekładnią typu TT, roboczo 3–6 V. DNG-16016 jest punktem odniesienia; do sprawdzenia parametry egzemplarzy, rozbieżności danych katalogowych i kalibracja z L298N |
| Raspberry Pi | Potwierdzony Pi 4 Model B; do uzupełnienia wersja systemu i backend PWM; proponowane GPIO w instrukcji połączeń |
| Zasilanie | Koszyk 4×AAA dla napędu; potwierdzić ogniwa, napięcie pod obciążeniem i wydajność. Pi: posiadany powerbank przez USB-C, do sprawdzenia port 5 V / 3 A i kabel. Wspólna masa, CON5 zdjęta, logika L298N z 5 V Pi |
| Mechanika | Podwozie, koła, obciążenie; potwierdzenie dwóch niezależnych napędów DC |
| Dostęp do panelu | Wybrać prosty mechanizm uwierzytelnienia operatora obejmujący także WebSocket przed udostępnieniem przez internet |
| Sieć | Docelowe Wi-Fi/LTE i warunki pierwszej próby |
| Profil czasowy | Pomiar obiegu przed jazdą; TTL i próg ostrzegania do doboru w MVP-B, interwał tokenów 50 ms; następnie weryfikacja wieku tokenów/jitteru |

Instrukcja połączeń opisuje Pi 4B z powerbankiem i dwa napędy TT z pakietem 4×AAA. Napięcia, wydajność zasilania i kalibrację sprawdzamy w MVP-A, profil czasowy w MVP-B; sam fakt posiadania powerbanku nie potwierdza parametrów jego portu.

Projekt jest przeznaczony do małego, wolnego pojazdu. Internet i Cloudflare nie gwarantują twardego czasu rzeczywistego; dopuszczalną prędkość i timeouty należy dobrać na podstawie prób.

## Dokumentacja referencyjna

- [Cloudflare — Durable Objects i WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [GPIO Zero — urządzenia wyjściowe i Motor](https://gpiozero.readthedocs.io/en/stable/api_output.html)
- [GPIO Zero — backendy GPIO](https://gpiozero.readthedocs.io/en/stable/api_pins.html)
- [Botland — katalogowy punkt odniesienia TT: DNG-16016, 1:48, 3–6 V, 200 RPM](https://botland.com.pl/silniki-dc-katowe-z-przekladnia/16016-silnik-dc-148-3-6v-z-podwojnym-walem-200rpm-5904422344078.html)
- [Karta katalogowa silnika podlinkowana przez Botland — dane orientacyjne](https://botland.com.pl/index.php?controller=attachment&id_attachment=4965)
- [Botland — posiadany moduł L298N 12 V / 2 A, MOD-03164](https://botland.com.pl/sterowniki-silnikow-moduly/3164-l298n-dwukanalowy-sterownik-silnikow-modul-12v-2a-5904422359317.html)
- [STMicroelectronics — nota katalogowa L298, progi logiczne, straty napięcia i sterowanie mostkiem](https://www.st.com/resource/en/datasheet/l298.pdf)
- [websockets — klient asyncio i automatyczne ponawianie połączenia](https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html)
- [systemd — nadzór usługi i ExecStopPost](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd — RuntimeWatchdogSec](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html)
- [Raspberry Pi — watchdog kernela](https://www.raspberrypi.com/documentation/computers/config_txt.html#kernel_watchdog_timeout)
- [NetworkManager — Wi-Fi power saving](https://networkmanager.dev/docs/api/latest/settings-802-11-wireless.html)
- [Python — monotonic_ns](https://docs.python.org/3/library/time.html#time.monotonic_ns)
- [Python — HMAC](https://docs.python.org/3/library/hmac.html)
- [websockets — transportowy keepalive i ograniczenia przeglądarek](https://websockets.readthedocs.io/en/stable/topics/keepalive.html)
