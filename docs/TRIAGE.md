# Triage uwag do briefu — 24 października 2026

Dokument obejmuje dwie rundy przeglądu. Poniżej decyzje przyjęte do briefu, z rozróżnieniem poprawnych obserwacji i zbyt mocnych wniosków; uzupełnienia z drugiej rundy są na końcu. Bieżący wariant to podpisany znacznik czasu Pi co 50 ms, bez listy tokenów, z TTL dobieranym po pomiarze obiegu. To przegląd projektu i dokumentacji; nie wykonano jeszcze pomiarów ani testów na aucie.

| # | Ocena | Decyzja do MVP |
| --- | --- | --- |
| 1. PWM 30%, AAA i L298N | Trafna diagnoza ryzyka braku rozruchu; niepoprawna pewność, że przeciążenie jest niemożliwe i że rozruch wymaga dokładnie 40–60% | Usuwamy sztywne 30%. Diagnostyczny zakres do 100%, PWM 100 Hz, obowiązkowa kalibracja progów i pomiary pod obciążeniem. Limit jazdy wynika z pomiarów |
| 2. Zegary i świeżość | Trafny problem operacyjny; watchdog i `seq` nie zastępują kontroli wieku komendy | Usuwamy znaczniki UTC z komend. Zastępujemy je krótkotrwałymi tokenami wydawanymi przez Pi, sprawdzanymi jego zegarem monotonicznym. Dodajemy estymatę czasu obiegu |
| 3. Timeout 400 ms / rozbrojenie dopiero 2 s | Wygodniejsze wznowienie, ale świadomie dopuszcza ruch po opóźnionej wiadomości | Odrzucamy automatyczne wznowienie w MVP. Po 400 ms nadal STOP i rozbrojenie. Przyjmujemy diagnostykę/wyłączenie Wi-Fi power saving |
| 4. Reconnect i systemd | Trafna zmiana priorytetu; nadzór systemd i wbudowany watchdog ograniczają ryzyko, ale nie dają niezależnego odcięcia napędu | Przenosimy reconnect, usługę, watchdog procesu i helper GPIO do MVP. Wbudowany watchdog Pi także do konfiguracji i testów MVP; bez zakupu dodatkowego urządzenia |
| 5. Autorytet Pi i wygasanie blokady | Trafna potrzeba podziału odpowiedzialności oraz odzyskania dostępu | Pi rozstrzyga stan napędu/sesję/seq/świeżość, DO dzierżawę kierowcy i dostęp. Dzierżawa 3 s, heartbeat 1 s, przejęcie z potwierdzonym STOP |

## 1. Rozruch, zakres PWM i zasilanie

Warunek `VS ≥ VIH + 2,5 V` jest zapisany w tabeli 4 [noty ST L298](https://www.st.com/resource/en/datasheet/l298.pdf). Dla sygnału HIGH około 3,3 V daje około 5,8 V. Zgadzamy się więc, że nominalne 4,8 V NiMH nie zapewnia tego zapasu, a 4×AAA alkaliczne trzeba sprawdzić podczas obciążenia. Straty mostka są istotne; poprawne podłączenie nie gwarantuje użytecznego momentu przy tym zasilaniu.

Wyliczenie „30% = około 1 V, więc na pewno nie ruszy” jest uproszczeniem. PWM podaje impulsy, a rozruch zależy także od częstotliwości, prądu, obciążenia i baterii. **Nie przyjmujemy twierdzenia, że AAA uniemożliwiają przeciążenie:** silnik może pozostać zablokowany i się nagrzewać. Brak elektronicznego pomiaru prądu nie jest ochroną nadprądową.

Wprowadzamy krótkie próby do 100%, z kontrolą napięcia/prądu/temperatury, i zapis `min_start_duty`, `min_run_duty`, dopuszczalnego maksimum oraz obciążenia. 40–60% pozostaje hipotezą do sprawdzenia. 100 Hz to sensowna wartość początkowa, zgodna z domyślną częstotliwością [PWMOutputDevice w GPIO Zero](https://gpiozero.readthedocs.io/en/stable/api_output.html#gpiozero.PWMOutputDevice). Nie jest to potwierdzenie optymalnej częstotliwości tego napędu.

`max_duty=1.0` w diagnostyce nie wymusza pełnego wysterowania na początku jazdy. Zero i STOP pozostają zerem; mapowanie z kalibrowanym minimum nie przekracza limitu operatora ani nie dodaje niejawnego impulsu rozruchowego.

## 2. Brak wspólnego zegara nie może oznaczać braku kontroli świeżości

Problem UTC jest zasadny: Pi 4B nie zapewnia podtrzymywanego czasu tak jak Pi z bateryjnym RTC, a czas przeglądarki nie jest źródłem, któremu warto powierzać decyzję o wykonaniu ruchu. Nie opieramy protokołu jazdy na synchronizacji tych zegarów. Poprawny czas OS dla walidacji certyfikatów WSS nadal trzeba zapewnić.

Kontrprzykład dla usunięcia świeżości bez zamiennika: wiadomości powstają co 50 ms, ale wszystkie docierają z opóźnieniem 350 ms. Numery `seq` rosną, watchdog 400 ms co chwilę dostaje komendę, a „bierz najnowszą” wybiera stan sprzed 350 ms — starszy niż ilustracyjne okno 300 ms. Przy opóźnieniu większym od watchdoga pierwsza sesja może zostać rozbrojona, ale nie uzasadnia to ogólnej tezy o wykrywaniu wieku komend. Zwiększenie tolerancji/wznawianie po timeoutcie dodatkowo pogarsza tę własność.

**Przyjęty mechanizm po drugiej rundzie:** Pi co 50 ms wydaje znacznik własnego czasu monotonicznego z HMAC wiążącym go z sesją. Panel odsyła go bez zmian w `drive`; Pi sprawdza sesję, MAC, `seq` i wiek według swojego zegara. Nie ma zbioru wydanych tokenów, a TTL i ostrzeżenie dobieramy po pomiarach. Odbiór komendy nie odnawia ważności. Klucz sesji jest tylko na Pi i znika przy rozbrojeniu, co unieważnia stare tokeny. Komenda utworzona po poznaniu tokenu nie może być starsza od niego. Szczegóły budżetu i uproszczenia są opisane w drugiej rundzie poniżej.

Wymagany jest obieg Pi → panel → Pi mieszczący się w oknie tokenu. Jeżeli docelowe LTE go nie zapewnia, odnotujemy ograniczenie i jawnie dobierzemy parametry; nie przedłużamy terminów przy przekazywaniu. Usuwamy pola UTC dopiero razem z tym zamiennikiem, a nie jako niezależne uproszczenie implementacji.

Wzór `performance.now() − sent[last_seq] − seq_age_ms` przyjmujemy do diagnostyki. Odejmuje czas od przyjęcia komendy do utworzenia telemetrii na Pi, pozostawiając przybliżenie obiegu w obie strony. **Nie mierzy opóźnienia jednokierunkowego.** Historia musi uwzględniać sesję, a nieznane potwierdzenia nie dają wyniku. Po drugiej rundzie próg ostrzegania zależy od budżetu, a nie od stałych 500 ms; do kalibracji przed jazdą używamy analogicznego pomiaru z heartbeatów.

## 3. Wznawianie jazdy i Wi-Fi

Wariant „stop po 400 ms, sesja do 2 s” rzeczywiście zmniejsza liczbę kliknięć, ale pozwala, by po przerwie ruch wrócił bez nowego aktywowania. Odrzucamy go w pierwszej wersji. Jeżeli pomiary pokażą częste timeouty, najpierw poprawiamy sieć i dobieramy timeout; ewentualny inny model odzyskiwania wymaga osobnej decyzji i prób.

[NetworkManager dokumentuje `802-11-wireless.powersave=2` jako wyłączenie oszczędzania energii](https://networkmanager.dev/docs/api/latest/settings-802-11-wireless.html). Przyjmujemy konfigurację i porównanie pomiarów przed/po. Domyślna wartość profilu może odsyłać do ustawienia globalnego, więc nie wpisujemy uniwersalnego twierdzenia „na każdym Pi 4 jest włączone i powoduje 100–300 ms”. W poleceniu `nmcli` wskazujemy profil/UUID, niekoniecznie SSID; zmianę trzeba zastosować.

## 4. Nadzór procesu i systemu bez zakupu watchdoga

Reconnect przenosimy do MVP: [aktualizacja kodu DO może zakończyć jego WebSockety](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), a [iterator `websockets.asyncio.client.connect` obsługuje ponawianie błędów przejściowych z backoffem](https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html). To przywrócenie łączności, nie wznowienie ruchu; trzeba też obsłużyć zamknięcie już otwartego połączenia i błędy uwierzytelnienia.

Przyjmujemy `Restart=always`, `WatchdogSec=2s` i powiadomienia po zdrowych iteracjach sterowania. Uzupełniamy je o szybkie zakończenie (`WatchdogSignal=SIGKILL`), ograniczony czas zatrzymywania i helper wyłączający GPIO przed startem i po zakończeniu usługi. Domyślny watchdog usługi wysyła SIGABRT; zapis core dump może opóźnić zakończenie. `ExecStopPost` musi umieć rzeczywiście wyłączyć backend PWM, także po zabiciu Pythona. Sam wpis w unit file nie dowodzi wyłączenia napędu. [Dokumentacja systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).

`RuntimeWatchdogSec` wykorzysta istniejący watchdog sprzętowy Pi, więc nie wymaga zakupu. Nie jest to jednak drugi watchdog aplikacji: obsługuje go systemd, a zadziałanie powoduje restart całego Pi. Nie każdy częściowy hang zatrzyma karmienie watchdoga; przed restartem piny mogą nadal sterować silnikami. Zaczynamy od 8 s, potwierdzamy dostępność urządzenia i rzeczywisty timeout. Konfiguracja kernel/firmware jest zależna od wersji OS. [systemd-system.conf](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html), [Raspberry Pi — kernel_watchdog_timeout](https://www.raspberrypi.com/documentation/computers/config_txt.html#kernel_watchdog_timeout).

Trzy mechanizmy mają różne zakresy: około 400 ms bez ważnych komend; około 2 s bez oznak zdrowia procesu plus jego zakończenie/helper; watchdog systemu w skali sekund plus reset. Nie przedstawiamy ich jako jednej gwarancji zatrzymania w 400 ms. Sprawdzamy brak samoczynnego ruchu po każdym restarcie.

## 5. Pi rozstrzyga jazdę, DO rozstrzyga dostęp

Nie rezygnujemy z walidacji struktury i uprawnień na serwerze ani z ponownej walidacji na urządzeniu. Rezygnujemy z dwóch niezależnych interpretacji tego, czy napęd jest uzbrojony: `armed`, sesja, przyjęty `seq`, tokeny i stan napędu należą do Pi. DO prowadzi osobny, potrzebny stan dzierżawy i sprawdza, czy wiadomość pochodzi od jej właściciela.

Dzierżawa wygasa po 3 s; panel w widocznej karcie wysyła heartbeat co 1 s, a podczas jazdy również komendy co 50 ms. Heartbeat nie przedłuża lokalnego pozwolenia na ruch. Sprawdzamy termin przy każdej wiadomości, aby zaległa wiadomość nie odnowiła dzierżawy tylko dlatego, że timer sprzątający wykona się później.

Przejęcie jest jawne: odcięcie starej karty, STOP z identyfikatorem żądania, potwierdzenie Pi, następnie nowa dzierżawa i osobne aktywowanie przy neutralnych wejściach. Przy nieobecnym Pi nie deklarujemy skutecznego STOP. Po utracie/wygaśnięciu dzierżawy nowa karta również potrzebuje nowej sesji z Pi; stare ramki nie są odtwarzane.

## Rezystory i powerbank

Mapowanie fizyczne/BCM pozostaje poprawne. Wybrane GPIO12/13/17/22/23/27 mają domyślny pull-down w [tabeli 5 dokumentacji Pi 4B](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf). Dodatkowe 10 kΩ przy enable są zalecane, lecz opcjonalne w nadzorowanych próbach po zweryfikowaniu startu, resetu i odłączenia. Nie wymuszą LOW na aktywnie sterowanym wyjściu. Nie opieramy ochrony na założeniu, że logika L298N wyłączy się razem z zatrzymanym/zawieszonym OS — linia 5 V Pi może pozostawać zasilana.

**Źródło zasilania Pi jest już wybrane: posiadany powerbank przez USB-C.** Do potwierdzenia pozostają model, parametry konkretnego portu/kabla i stabilność pod obciążeniem; przyjmujemy wymaganie 5 V / 3 A dla zestawu. AAA zasilają tylko napęd. Zaktualizowano brief, instrukcję oraz opisy na SVG/PNG, zachowując mapowanie pinów.

## Druga runda — budżet czasu i uproszczenia

| Zgłoszenie | Ocena | Przyjęta zmiana |
| --- | --- | --- |
| Budżet TTL tokenu i zbyt późne ostrzeżenie | Trafne; dokładny moment odrzucania zależy też od fazy i jitteru | Interwał 50 ms. Jawny wzór `RTT_max ≈ TTL − interwał`. TTL i ostrzeżenie ustalane z pomiarów MVP-B; 300 ms tylko jako przykład, bez stałego ostrzeżenia 500 ms |
| Heartbeat i ping/pong | Trafna redundancja na poziomie aplikacji | Usuwamy aplikacyjne `ping`/`pong`. Transportowe ramki WebSocket zostają w gestii biblioteki/runtime. Heartbeat mierzy też pełny obieg do Pi, korzystając ze zwykłej telemetrii |
| Hibernacja przy telemetrii 5 Hz | Trafne | Usuwamy z etapu 2. Ewentualny powrót dopiero po ograniczeniu ruchu w spoczynku i określeniu odtwarzania/wygasania dzierżaw |
| Opis silników i trzy punkty watchdoga | Trafna uwaga redakcyjna; dokładnego SKU nadal nie potwierdzamy | Konfiguracja implementacji: 2×TT, roboczo 3–6 V; DNG-16016 to katalogowy punkt odniesienia. Jedna reguła watchdoga w odpowiedzialnościach agenta |
| Echo czasu Pi zamiast zbioru tokenów | Przyjmujemy uproszczenie ze sprawdzaniem autentyczności znacznika | Znacznik czasu monotonicznego + HMAC sesji, bez listy wydanych tokenów. Nie przyjmujemy dowolnego, niepodpisanego znacznika od panelu |

### Budżet czasu

Przy równomiernym dostarczaniu tokenów co `T` ich wiek po odbiorze komendy to w przybliżeniu `RTT_token + faza`, gdzie faza mieści się między 0 a T. Nominalny budżet pełnego obiegu to `TTL − T`; jitter, harmonogram przeglądarki i brak kolejnych tokenów zmniejszają zapas. Przy 300/100 ms budżet wynosił około 200 ms; po zmianie interwału na 50 ms wynosi około 250 ms. To nie jest równoważne dawnym 300 ms na samą drogę komendy.

„Przy 200 ms część odrzucana” nie jest ścisłą granicą bez jitteru: przy idealnie stałym obiegu 200 ms tokeny wydawane co 100 ms miałyby wiek poniżej 300 ms. W praktyce przy tej granicy niemal brak zapasu. „Ostrzeżenie 500 ms nigdy się nie pokaże” także jest zbyt kategoryczne: może dotrzeć opóźniona telemetria już po STOP. Nie będzie to jednak użyteczne ostrzeżenie wyprzedzające, więc tę część poprawki przyjmujemy.

Przed jazdą heartbeat z panelu przechodzi przez DO do Pi. Telemetria zwraca identyfikator dzierżawy, `last_heartbeat_seq` i lokalny `heartbeat_age_ms`; analogiczny do `drive` wzór daje próbki obiegu przy rozbrojonym napędzie. Nie potrzebujemy jeszcze TTL, ważnych komend jazdy ani nowego typu aplikacyjnego ping. Zbieramy wartości typowe, p95/p99 i skoki; dobieramy TTL z zapasem na interwał oraz jitter, ale też z ograniczeniem dopuszczalnego wieku polecenia. Następnie weryfikujemy rzeczywisty wiek tokenu i odrzucenia. Obieg heartbeat/telemetria ma przeciwny kierunek i inny harmonogram, więc sam percentyl z tego pomiaru nie jest gwarancją dla tokenów.

Przykład `TTL=300 ms, T=50 ms, ostrzeżenie=150–200 ms` ilustruje dobór. Nie jest zatwierdzonym profilem LTE. Bez wybranego profilu nie uzbrajamy napędu; nie dopasowujemy TTL automatycznie podczas ruchu. Watchdog 400 ms bez poprawnego `drive` pozostaje niezależny.

### Echo czasu bez przechowywania tokenów

Wariant z echem własnego czasu Pi usuwa potrzebę porównywania zegarów i listy wydanych losowych wartości. [Zegar monotoniczny Pythona](https://docs.python.org/3/library/time.html#time.monotonic_ns) nie zależy od aktualizacji zegara systemowego. Używamy całkowitych milisekund względem początku sesji.

Surowy `issued_pi_ms` można jednak zmienić lub oszacować, więc nie dowodzi on, że Pi wydało daną wartość. Uwierzytelnienie daje dostęp do sterowania, ale nie zapewnia pochodzenia znacznika. Żeby zachować dotychczasowy warunek „czas wystawiło Pi”, kodujemy znacznik wraz z HMAC-SHA256 wiążącym wersję, sesję i czas. Klucz losujemy na sesję, przechowujemy tylko na Pi; panel odsyła niezmieniony token. Pi sprawdza MAC oraz `0 ≤ teraz − issued ≤ TTL`, odrzuca czas z przyszłości, stare sesje i niepoprawne liczby. Do sprawdzenia MAC użyć porównania przeznaczonego do uwierzytelnień. [Python — HMAC i compare_digest](https://docs.python.org/3/library/hmac.html).

To mała zmiana wewnętrznego formatu `freshness_token`, a nie druga autoryzacja użytkownika. Nie wiąże całego przyszłego `drive` z tokenem i nie dowodzi aktualności fizycznego zamiaru operatora; ogranicza wiek ramki utworzonej po poznaniu znacznika. Panel nadal tworzy ramkę z najnowszych wejść i nie odświeża starych komend przez podmianę tokenu.

### Ping/pong i hibernacja

[Dokumentacja websockets](https://websockets.readthedocs.io/en/stable/topics/keepalive.html) rozróżnia transportowe ramki Ping/Pong od mechanizmów aplikacyjnych w przeglądarce, która nie wystawia tych ramek w API. Nasz `heartbeat` oraz `status` już obsługują tę drugą rolę, więc osobny aplikacyjny ping/pong nie jest potrzebny. Ramki transportowe nie odnawiają dzierżawy ani pozwolenia na jazdę.

Cloudflare opisuje przejście do hibernacji po okresie bezczynności, z dodatkowymi warunkami. Przy wiadomościach agenta 5 Hz nie zakładamy takiego okresu, a standardowe WebSockety i tak nie używają Hibernation API. Hibernacja wraca wyłącznie jako warunkowe nice to have po ograniczeniu ruchu przy braku kierowcy; odtwarzanie dzierżawy i jej terminu musi być wtedy częścią zakresu. [Lifecycle DO](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/), [WebSocket Hibernation i attachments](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
