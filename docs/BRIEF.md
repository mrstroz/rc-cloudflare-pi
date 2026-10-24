# Internet RC Car — brief projektu i etapy realizacji

## Cel i zakres

Zbudować mały pojazd sterowany przez internet z przeglądarki telefonu lub komputera. Dwa silniki DC niezależnie napędzają lewe i prawe koło. Skręcanie odbywa się przez różnicę ich prędkości, a obrót w miejscu przez przeciwne kierunki pracy. Nie ma mechanizmu skrętu kół.

Jedno repozytorium zawiera dwie aplikacje: aplikację Cloudflare (panel WWW i backend) oraz agenta Python uruchamianego na Raspberry Pi. Projekt zaczyna się od jednego auta i jednego aktywnego kierowcy. Pierwszym celem jest szybkie sprawdzenie, czy posiadane Pi, sterownik L298N, silniki, zasilanie i połączenie internetowe działają razem poprawnie.

Dokument opisuje także docelową rozbudowę. O zakresie pierwszej implementacji decyduje poniższy podział. Wartości czasowe i limit mocy są ustawieniami początkowymi do weryfikacji na sprzęcie.

## Priorytety i kolejność implementacji

### Etap 1 — MVP: sprawdzenie posiadanego zestawu

MVP ma dwa kolejne punkty kontrolne. Wynik testu lokalnego powinien być dostępny przed ukończeniem aplikacji Cloudflare. Wstępnie przyjmujemy silniki DNG-16016 opisane w sekcji sprzętowej; model wymaga potwierdzenia. Prace nad protokołem i symulatorem mogą trwać niezależnie, ale przed zatwierdzeniem zasilania oraz próbą napędu trzeba potwierdzić silniki i pozostałe elementy zestawu.

**MVP-A — test lokalny Pi → L298N → silniki:**

- Potwierdzenie modelu Pi, parametrów silników i zasilania; zapis połączeń, ustawienia zworek oraz mapowania GPIO.
- Minimalny adapter L298N i lokalny skrypt diagnostyczny, bez panelu i Cloudflare. Skrypt uruchamia osobno kanał A i B w obu kierunkach, pozwala sprawdzić PWM i wyłącza wyjścia po zakończeniu lub obsłużonym błędzie. Każda próba ruchu ma krótki, jawnie ustawiony limit czasu; nie pozostawia napędu włączonego w oczekiwaniu na kolejne polecenie.
- Konfigurowalne piny, odwrócenie kierunku każdego koła i lokalny limit PWM, początkowo maksymalnie 30%. Taki limit nie zastępuje doboru zasilania i sprawdzenia prądu silników.
- Pierwsze próby z uniesionymi kołami i dostępnym fizycznym wyłącznikiem napędu. Sprawdzenie startu/resetu Pi, kierunków, niezależności kanałów, spadków napięcia, nagrzewania i ewentualnych restartów Pi przy rozruchu silników.

**MVP-B — test całego toru przeglądarka → Cloudflare → Pi → napęd:**

- Minimalny Worker, jeden Durable Object i wychodzące połączenie WSS agenta. Jeden samochód, jeden operator; ochrona panelu i WebSocketu oraz osobny token urządzenia są wymagane już tutaj.
- Prosty panel z dwoma suwakami, aktywowaniem sterowania, STOP oraz informacją o połączeniu i przyczynie zatrzymania. Na komputerze także klawiatura: W/S sterują lewym kołem, strzałki góra/dół prawym; zwolnienie klawisza zeruje dane koło. Pozwala to sprawdzić oba kanały jednocześnie bez obsługi dwóch palców, którą dopracujemy w etapie 2.
- Protokół v1, walidacja po obu stronach, świeżość komend, blokada drugiego kierowcy, lokalny watchdog i ponowne aktywowanie po utracie kontroli. Te mechanizmy należą do MVP.
- Minimalna telemetria: stan agenta, ostatni przyjęty `seq`, wysterowanie kół i przyczyna zatrzymania. Logi wystarczają do pomiaru czasu potwierdzenia i diagnozowania problemów.
- Agent uruchamiany ręcznie oraz tryb symulacji bez GPIO. Przy zerwaniu połączenia agent wyłącza napęd; ręczne ponowne uruchomienie jest wystarczające do pierwszych prób.
- Próba obu kół, skrętu i obrotu w miejscu przez internet, następnie krótka jazda przy małej mocy w kontrolowanym miejscu, w zasięgu wzroku operatora.
- Krótka instrukcja połączeń, konfiguracji, uruchomienia i wdrożenia oraz zapis wyników prób. Testy poprawnych i niepoprawnych komend oraz utraty kontroli są częścią MVP.

**Warunek zamknięcia MVP:** potwierdzone działanie obu kanałów i PWM, stabilne zasilanie Pi, sterowanie przez docelowe połączenie internetowe oraz wyłączenie napędu po STOP i utracie komend. Wynik zawiera użyte zasilanie, limit PWM, obserwacje temperatury, opóźnienia i zmierzoną tolerancję watchdoga. Jeśli silniki nie startują przy przyjętym limicie, najpierw diagnozujemy zasilanie, straty mostka i obciążenie.

### Etap 2 — kolejna implementacja: wygodne i powtarzalne użytkowanie

- Dopracowany panel telefonu: dwa palce jednocześnie, czytelne statusy połączeń i świeżości telemetrii, widoczny czas potwierdzenia komendy oraz regulacja limitu mocy.
- Agent jako usługa `systemd`, automatyczny start i restart oraz reconnect z rosnącym odstępem i jitterem. Automatyczne odzyskanie połączenia nadal wymaga ręcznego aktywowania jazdy.
- WebSocket Hibernation API i poprawne odtwarzanie stanu Durable Object z attachments.
- Strojenie ramp przyspieszania/zwalniania, przerwy zmiany kierunku, częstotliwości PWM, TTL i watchdoga na podstawie wyników MVP; szersze próby na docelowym Wi-Fi/LTE.
- Pełna instrukcja instalacji od czystego systemu, uporządkowana diagnostyka oraz szersze testy kontraktu w TypeScript i Pythonie, restartów i hibernacji.

### Etap 3 — nice to have

Kamera/podgląd wideo, enkodery i regulacja prędkości PID, pomiar baterii i prądu, historia przejazdów, wiele aut, aplikacja mobilna, WebRTC oraz eksperymenty z autonomią i planowaniem tras. Każda z tych funkcji wymaga osobnego zakresu po sprawdzeniu podstawowego zestawu. D1, R2 i kolejki nie są potrzebne w torze sterowania MVP.

Dodatkowy sprzętowy watchdog odcinający enable lub zasilanie jest rozszerzeniem ochrony przed zawieszeniem Pi. Nie jest warunkiem nadzorowanych prób stanowiskowych MVP; przed użytkowaniem wymagającym ochrony także przy zawieszeniu systemu należy go uwzględnić.

## Architektura

Przeglądarka i Raspberry Pi niezależnie nawiązują szyfrowane połączenia WebSocket do Cloudflare. Worker uwierzytelnia klientów i przekazuje ich do tego samego Durable Object identyfikowanego przez `car_id`. Durable Object przekazuje komendy do Pi, a status i potwierdzenia do przeglądarki.

Raspberry Pi samodzielnie inicjuje połączenie wychodzące. Nie wymaga publicznego IP, przekierowania portów ani Cloudflare Tunnel. PWM i obsługa silników działają lokalnie na Pi. Cloudflare przekazuje wyłącznie zadane wartości sterowania.

## Część 1 — aplikacja Cloudflare

**Stack:** TypeScript, Vue 3 + Vite, Workers Static Assets, Cloudflare Worker i Durable Objects. Wdrożenie przez Wrangler. WebSocket Hibernation API dochodzi w etapie 2.

### Panel sterowania

Poniższy opis obejmuje panel po etapie 2. MVP realizuje podstawowe suwaki i klawiaturę, aktywowanie, STOP, zerowanie po utracie interakcji i minimalne statusy wskazane wyżej; pełna obsługa dwóch palców oraz wizualizacja opóźnień dochodzą później.

- Dwa pionowe suwaki/joysticki, osobno dla lewego i prawego koła, w zakresie od -100% do +100%. Obsługa dwóch palców jednocześnie na telefonie.
- Wartość dodatnia oznacza jazdę do przodu, ujemna do tyłu, zero wyłączenie napędu danego koła.
- Zwolnienie suwaka lub klawisza zeruje dane koło. Utrata fokusu, ukrycie karty lub anulowanie gestu zeruje oba i rozbraja sterowanie.
- Przycisk „Aktywuj sterowanie”, duży przycisk STOP i konfigurowalny limit mocy, domyślnie 30%.
- Statusy: auto offline, gotowe, sterowanie aktywne, zatrzymane, błąd. Osobno status połączenia panelu i świeżość telemetrii auta.
- Pomiar czasu potwierdzenia komendy przez Pi; nie przedstawiać go jako pomiaru fizycznej reakcji silnika.
- Podczas aktywnej jazdy, już w MVP, wysyłanie pełnego stanu obu kół co 50 ms (20 Hz), również gdy wejścia operatora się nie zmieniają.

### Worker i Durable Object

- Worker serwuje panel i obsługuje wejścia WebSocket dla kierowcy oraz urządzenia.
- Osobne uwierzytelnienie: sesja użytkownika dla panelu oraz token urządzenia przypisany do `car_id` dla Pi. Panel i jego WebSocket chronić tym samym mechanizmem logowania; sprawdzać też Origin. Token urządzenia przechowywać jako sekret, bez umieszczania w URL lub frontendzie.
- Jeden Durable Object na `car_id`; najwyżej jeden aktywny kierowca i jedno aktualne połączenie urządzenia. Kolejna karta nie przejmuje kontroli automatycznie.
- Walidacja schematu, ról, zakresów, sesji, numerów komend i ich świeżości. Limit rozmiaru wiadomości i częstotliwości ruchu.
- Natychmiastowe przekazywanie aktualnych komend. Brak kolejki trwałej, historii do odtworzenia i ponawiania starych poleceń jazdy.
- W MVP użyć standardowych WebSocketów bez hibernacji; utrata instancji lub jej stanu kończy sterowanie i wymaga ponownego połączenia oraz aktywowania. W etapie 2 stan połączeń odtwarzalny po hibernacji przez WebSocket attachments. Nie polegać wyłącznie na polach obiektu w pamięci. Jeśli stanu autoryzacji sterowania nie można pewnie odtworzyć, wymagane ponowne aktywowanie.
- Wykryte rozłączenie kierowcy powoduje STOP i unieważnienie sesji. Lokalny watchdog Pi działa niezależnie, również gdy Cloudflare jeszcze nie wykrył zerwania połączenia.

## Część 2 — agent Python na Raspberry Pi

**Stack:** Raspberry Pi OS, Python, `asyncio`, klient `websockets`, GPIO Zero. Backend GPIO dobrać do modelu Raspberry i systemu. W MVP uruchomienie ręczne; w etapie 2 usługa `systemd` z automatycznym startem i restartem.

### Odpowiedzialności

- Wychodzące połączenie WSS i uwierzytelnienie urządzenia. W MVP po zerwaniu wystarcza ręczne uruchomienie agenta; automatyczny reconnect z rosnącym odstępem i jitterem dochodzi w etapie 2.
- Start zawsze z wyłączonym napędem. Po reconnect nie wznawiać jazdy; wymagać nowej sesji i świadomego aktywowania w panelu przy zerowych suwakach.
- Walidacja komend także lokalnie: wersja protokołu, sesja, rosnący `seq`, skończone liczby w zakresie -1…1 i termin ważności.
- Oddzielić obsługę sieci od pętli sterowania i watchdoga. Przetwarzać najnowszy ważny stan; nie wykonywać zaległej sekwencji ruchów.
- Sterowanie mostkiem H: kierunek i PWM, limit mocy, konfiguracja pinów oraz odwrócenie kierunku niezależnie dla każdego koła.
- W MVP zmiana kierunku przechodzi przez zero z przerwą ustaloną przed próbą na sprzęcie. Dopracowane rampy łagodnego przyspieszania i zwykłego zwalniania dochodzą w etapie 2. STOP, timeout i błąd zawsze omijają rampę i natychmiast wyłączają napęd.
- Lokalny watchdog wyłącza napęd po 400 ms bez nowej, ważnej komendy `drive`. Ping/pong nie przedłuża pozwolenia na jazdę. Czas lokalnego watchdoga mierzyć zegarem monotonicznym.
- Błąd sterowania, rozłączenie lub wygaśnięcie watchdoga rozbraja agenta i unieważnia sesję; opóźniona komenda nie może sama uruchomić silników.
- Telemetria np. 5 Hz: stan agenta, ostatni przyjęty `seq`, zadane/wysterowane wartości kół i przyczyna zatrzymania. Bez enkoderów nie raportować tych wartości jako zmierzonej prędkości.
- Tryb symulacji bez GPIO do uruchamiania i testowania całego przepływu na komputerze.

### Sprzęt

Potwierdzony komputer to **Raspberry Pi 4 Model B**. Posiadany pakiet napędu to koszyk **4×AAA**; typ ogniw i wydajność pod obciążeniem pozostają do sprawdzenia. Pi wymaga osobnego, stabilizowanego zasilania USB-C 5 V / 3 A. Proponowane połączenia stanowiskowe, piny i ustawienia zworek: [instrukcja](POLACZENIA.md), [schemat PNG](diagrams/pi4b-l298n-polaczenia.png), [schemat SVG](diagrams/pi4b-l298n-polaczenia.svg). W tym wariancie regulator modułu jest odłączony zworką CON5, a logikę L298N zasila pin 5 V Pi; baterie zasilają wyłącznie napęd.

Zakładamy dwa szczotkowe silniki DC, podwozie i dwa niezależnie napędzane koła. **Posiadany sterownik to moduł L298N z Botland, indeks MOD-03164. Prawdopodobny model silników to DC 1:48, 3–6 V, podwójny wał, 200 RPM, indeks DNG-16016.** Model i liczba posiadanych silników wymagają potwierdzenia. Zgodność zestawu oceniamy na podstawie potwierdzonego modelu, zasilania i obciążenia.

#### Prawdopodobne silniki — DNG-16016

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
- Zakres 3–6 V dotyczy silnika. Oznaczenie `+12V` na module nie wyznacza napięcia dla tych silników. Zasilanie mostka dobrać z uwzględnieniem jego strat; limit PWM 30% sam w sobie nie uzasadnia zasilania silników 12 V. Nie zakładać też stałego spadku napięcia na L298N.
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

Nie zasilać silników z GPIO. Przewidzieć osobną gałąź zasilania silników, stabilizowane zasilanie Pi, wspólną masę, filtrację oraz fizyczny wyłącznik napędu. Nie planować zasilania Pi z regulatora modułu L298N. Wyjścia sterownika mają domyślnie pozostawać wyłączone przy starcie/resetach Pi: zapewnić sprzętowe podciągnięcie ENA/ENB do masy (np. rezystorami pull-down, po weryfikacji płytki), niezależne od startu skryptu. Proponowane GPIO dla Pi 4B są w instrukcji połączeń; backend GPIO i częstotliwość PWM wymagają weryfikacji na systemie docelowym.

STOP oznacza wyłączenie napędu, nie gwarantuje natychmiastowego zatrzymania kół; hamowanie/coast zależy od mostka. Watchdog w Pythonie nie chroni przed zawieszeniem systemu lub procesu. Ochronę przed takim przypadkiem zapewnia dodatkowy sprzętowy watchdog odcinający enable/zasilanie sterownika.

## Wspólny protokół v1

JSON przez WSS. Wspólny kontrakt i przykładowe wiadomości mają znaleźć się w `protocol/`. Minimalne typy: `hello`, `arm`, `armed`, `drive`, `stop`, `status`, `error` oraz aplikacyjny ping/pong.

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
| `docs/BRIEF.md` | Ten brief |
| `README.md` | Uruchomienie, konfiguracja, testy i wdrożenie obu aplikacji |
| `apps/cloudflare/` | Panel Vue, Worker, Durable Object, konfiguracja Wrangler |
| `apps/pi-agent/` | Agent Python, adapter GPIO, symulator, wzór konfiguracji, usługa systemd |
| `protocol/` | Schematy JSON, opis komunikatów i wspólne przykłady do testów |

Konfigurację i sekrety trzymać poza kodem. Repo zawiera wyłącznie wzory bez tokenów. Parametry Pi obejmują URL, `car_id`, token, mapowanie pinów, polaryzację silników, limit PWM, rampę i timeouty.

## Próby odbiorowe MVP

| Próba | Oczekiwany wynik |
| --- | --- |
| Lokalny test A i B, osobno i razem | Oba kierunki, regulacja PWM, poprawne przypisanie kół; brak niezamierzonego ruchu drugiego kanału |
| Start/reset Pi i normalne zakończenie skryptu | ENA/ENB pozostają lub przechodzą w stan niski; start nie uruchamia silników |
| Dobór zasilania dla potwierdzonego modelu silnika | Uwzględniony zakres 3–6 V silników DNG-16016, straty mostka i prąd rozruchowy obu napędów; sprawdzone zasilanie logiki L298N |
| Rozruch obu silników | Brak resetów Pi; zapis napięć i obserwacji nagrzewania przy określonym obciążeniu oraz czasie próby |
| Symulator przez Cloudflare | Przepływ komend i statusów; odrzucanie braku autoryzacji i drugiego kierowcy |
| Zwolnienie suwaka lub klawisza | Zerowanie odpowiedniego koła |
| STOP, ukrycie karty, utrata fokusu, anulowanie gestu | Wyłączenie obu kanałów i rozbrojenie; brak samoczynnego wznowienia |
| Zerwanie sieci panelu lub Pi | Przy działającym agencie wyłączenie napędu najpóźniej po 400 ms od ostatniej ważnej komendy plus zmierzona tolerancja pętli; wcześniejszy wykryty błąd zatrzymuje od razu |
| Komendy wygasłe, zdublowane, ze starej sesji lub spoza zakresu | Odrzucenie; brak odświeżenia watchdoga i brak uruchomienia po rozbrojeniu |
| Ponowne połączenie lub restart agenta | Napęd wyłączony do nowej sesji i świadomego aktywowania przy zerowych suwakach |
| Próba przez docelowe Wi-Fi/LTE | Niezależne koła, skręt i obrót; zapis opóźnień i przerw w komunikacji |

## Otwarte ustalenia

| Element | Stan / dane potrzebne do dalszej pracy |
| --- | --- |
| Sterownik | Posiadany moduł L298N MOD-03164; potwierdzić oznaczenia i ustawienia zworek na egzemplarzu |
| Silniki | Prawdopodobnie DNG-16016: 1:48, 3–6 V, 200 RPM przy 6 V, stall current według sklepu do 1,5 A przy 6 V; potwierdzić model i dwie sztuki, zweryfikować rozbieżności danych oraz współpracę z L298N |
| Raspberry Pi | Potwierdzony Pi 4 Model B; do uzupełnienia wersja systemu i backend PWM; proponowane GPIO w instrukcji połączeń |
| Zasilanie | Koszyk 4×AAA dla napędu; potwierdzić rodzaj ogniw, napięcie pod obciążeniem i wydajność prądową. Dla Pi osobne USB-C 5 V / 3 A; wariant mobilny zasilania Pi do ustalenia. Wspólna masa, regulator CON5 wyłączony, logika L298N z 5 V Pi |
| Mechanika | Podwozie, koła, obciążenie; potwierdzenie dwóch niezależnych napędów DC |
| Dostęp do panelu | Wybrać prosty mechanizm uwierzytelnienia operatora obejmujący także WebSocket przed udostępnieniem przez internet |
| Sieć | Docelowe Wi-Fi/LTE i warunki pierwszej próby |

Dane silników są wstępne, a pozostałe dane sprzętowe uzupełnimy po ich dostarczeniu. Instrukcja połączeń opisuje proponowany wariant stanowiskowy dla Pi 4B i 4×AAA. Jego działanie, napięcia oraz wydajność zasilania należy potwierdzić w MVP-A; wariant mobilny zasilania Pi pozostaje otwarty.

Projekt jest przeznaczony do małego, wolnego pojazdu. Internet i Cloudflare nie gwarantują twardego czasu rzeczywistego; dopuszczalną prędkość i timeouty należy dobrać na podstawie prób.

## Dokumentacja referencyjna

- [Cloudflare — Durable Objects i WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Cloudflare — przykład WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)
- [GPIO Zero — urządzenia wyjściowe i Motor](https://gpiozero.readthedocs.io/en/stable/api_output.html)
- [GPIO Zero — backendy GPIO](https://gpiozero.readthedocs.io/en/stable/api_pins.html)
- [Botland — prawdopodobny silnik DC 1:48, 3–6 V, podwójny wał, 200 RPM, DNG-16016](https://botland.com.pl/silniki-dc-katowe-z-przekladnia/16016-silnik-dc-148-3-6v-z-podwojnym-walem-200rpm-5904422344078.html)
- [Karta katalogowa silnika podlinkowana przez Botland — dane orientacyjne](https://botland.com.pl/index.php?controller=attachment&id_attachment=4965)
- [Botland — posiadany moduł L298N 12 V / 2 A, MOD-03164](https://botland.com.pl/sterowniki-silnikow-moduly/3164-l298n-dwukanalowy-sterownik-silnikow-modul-12v-2a-5904422359317.html)
- [STMicroelectronics — nota katalogowa L298, progi logiczne, straty napięcia i sterowanie mostkiem](https://www.st.com/resource/en/datasheet/l298.pdf)
