# 07. Sprzęt i napęd

Posiadany zestaw, sposób sterowania mostkiem i profil jazdy. Parametry egzemplarzy nie są jeszcze zmierzone; tabele mówią wprost, co jest potwierdzone, a co jest daną katalogową.

## 1. Zestaw

| Element | Konfiguracja | Stan |
|---|---|---|
| Komputer | Raspberry Pi 4 Model B Rev 1.4 | Potwierdzony |
| Zasilanie Pi | Posiadany powerbank przez USB-C; wymaganie 5 V / 3 A | Bez ostrzeżeń undervoltage (`throttled=0x0`) przy obu silnikach na 100% z uniesionymi kołami (2026-10-24); model, port i kabel do zapisania, próba P06 otwarta |
| Sterownik | L298N, Botland MOD-03164 | Posiadany; zworki ENA, ENB i CON5 zdjęte (2026-10-24) |
| Napęd | 2× szczotkowy silnik DC z przekładnią TT, roboczo 3–6 V, jeden na koło | Oba kanały kręcą w obu kierunkach (smoke test, [08 §3](08-proby-odbiorowe.md#3-wyniki)); SKU niepotwierdzony, DNG-16016 jako punkt odniesienia (§7) |
| Zasilanie napędu | Koszyk 4×AAA przez fizyczny wyłącznik | Wyłącznik odcina napęd: przy wyłączonym i 100% PWM koła stoją. Rodzaj ogniw i napięcie pod obciążeniem do sprawdzenia; brak miernika |
| System | Debian GNU/Linux 13 (trixie) z repozytoriami Raspberry Pi, kernel 6.18.50+rpt-rpi-v8, Python 3.13.5 | Potwierdzony 2026-10-24 |
| Backend PWM | GPIO Zero 2.0.1 z `lgpio` 0.2.2 (pakiety systemowe `python3-gpiozero`, `python3-lgpio`) | Kandydat; działa w smoke teście. Wybór zamyka próba helpera RC-04 ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 2) |

Podwójny wał silnika należy do jednego napędu i nie daje drugiego kanału.

## 2. Połączenia i GPIO

Instrukcja montażu i rysunek: [POLACZENIA.md](../POLACZENIA.md), [PNG](../diagrams/pi4b-l298n-polaczenia.png), [SVG](../diagrams/pi4b-l298n-polaczenia.svg). Źródłem danych pinów jest [mapa JSON](../diagrams/pi4b-l298n-connections.json).

| L298N | GPIO (BCM) | Pin fizyczny | Rola |
|---|---|---|---|
| ENA | GPIO12 | 32 | PWM kanału A (lewe koło) |
| IN1 | GPIO17 | 11 | Kierunek A |
| IN2 | GPIO27 | 13 | Kierunek A |
| IN3 | GPIO22 | 15 | Kierunek B |
| IN4 | GPIO23 | 16 | Kierunek B |
| ENB | GPIO13 | 33 | PWM kanału B (prawe koło) |
| +5V | 5 V | 2 | Zasilanie logiki L298N z Pi |
| GND | GND | 6 | Wspólna masa |

Piny i odwrócenie kierunku każdego koła są w konfiguracji agenta ([01 §5](01-architektura.md#5-konfiguracja-i-sekrety)). Zworki ENA, ENB i regulatora 5V-EN (CON5) są zdjęte. Okablowanie potwierdzone 2026-10-24: kanał A to lewe koło, kanał B prawe, a `IN1=1, IN2=0` i `IN3=1, IN4=0` kręcą koła do przodu, więc żadne koło nie wymaga odwrócenia.

GPIO12 i GPIO13 mają domyślny pull-down tylko po resecie. Zamknięcie urządzeń GPIO Zero z backendem `lgpio` zwalnia piny jako wejścia **bez** pull-down; w smoke teście GPIO12 (ENA) czytało wtedy HIGH, bo wejście L298N bez zworki podciąga linię. Dlatego każdy program sterujący mostkiem, agent i helper kończą pracę, ustawiając ENA i ENB jako wyjścia LOW (np. `pinctrl set 12,13 op dl`), zamiast zwalniać piny. Zewnętrzne 10 kΩ ENA–GND i ENB–GND są zalecane, decyzja zależy od próby P04 ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 14); do tego czasu ich nie ma. Żaden pull-down nie wymusi LOW na pinie aktywnie sterowanym w stan wysoki.

## 3. Sterowanie mostkiem

| EN | IN pary | Skutek | Użycie |
|---|---|---|---|
| 0 | dowolne | Mostek wyłączony, wybieg | Zero koła, STOP, watchdog |
| PWM | przeciwne | Obrót w jednym z kierunków | Jazda |
| 1 | równe | Aktywne hamowanie | Nieużywane |

Który stan IN oznacza „przód”, ustala test okablowania; odwrócenie robi konfiguracja. Adapter nigdy nie ustawia EN > 0 przy równych IN, także chwilowo: przy zmianie kierunku najpierw zeruje EN, potem przestawia IN, potem ustawia wypełnienie; zmiana wypełnienia w tym samym kierunku rusza tylko EN. STOP oznacza wybieg, nie natychmiastowe zatrzymanie kół ([ADR-0010](../adr/0010-stop-jako-wybieg.md)). Źródło: [nota ST L298, tabela 5](https://www.st.com/resource/en/datasheet/l298.pdf).

Próg stanu wysokiego wejść L298 to minimum 2,3 V, więc GPIO 3,3 V przy wspólnej masie wystarcza. Na GPIO Pi nigdy nie trafia 5 V.

## 4. Zasilanie

- Pi: wyłącznie powerbank przez USB-C. Pakiet napędu nie zasila Pi, a regulator L298N nie zasila Pi ([ADR-0011](../adr/0011-osobne-zasilanie-pi-i-napedu.md)).
- Napęd: plus 4×AAA przez fizyczny wyłącznik na zacisk `+12V` modułu, minus na `GND`. Napis `+12V` oznacza wejście zasilania mostka, nie napięcie dla tych silników.
- Logika L298N: 5 V z pinu 2 Pi, regulator modułu odłączony zworką CON5. Linia 5 V Pi może pozostać zasilana przy zawieszonym systemie, więc wyłączenie logiki mostka nie jest zabezpieczeniem.

| Wielkość | Wartość | Źródło |
|---|---|---|
| Warunek zasilania mostka | `VS ≥ VIH + 2,5 V`, przy 3,3 V około 5,8 V | Nota ST, tabela 4 |
| Spadek na całym mostku | Do 3,2 V przy 1 A, do 4,9 V przy 2 A | Nota ST |
| Prąd kanału modułu | 2 A | Botland MOD-03164 |
| Zakres zasilania modułu | 5–12 V | Botland MOD-03164 |
| Prąd zatrzymanego wirnika | 1,5 A przy 6 V, około 3 A dla obu | Sprzedawca, niezweryfikowane |
| 4×AAA alkaliczne / NiMH | Nominalnie 6 V / 4,8 V | Nominał ogniw |

Nominalne 4,8 V NiMH nie spełnia warunku ST ani minimum modułu. Pakiet alkaliczny też może spaść poniżej 5,8 V pod obciążeniem. AAA nie wykluczają przeciążenia: zablokowany silnik może się nagrzewać.

## 5. Profil jazdy i kalibracja

PWM na enable, początkowo 100 Hz. Kalibrację robimy po ustaleniu odwrócenia kierunku, więc „przód” i „tył” to kierunki logiczne koła. Wartości wyznaczamy osobno dla każdego koła i kierunku, bez obciążenia i na podłodze.

| Parametr | Znaczenie |
|---|---|
| `min_start_duty` | Najmniejsze duty, przy którym stojące koło rusza |
| `min_run_duty` | Najmniejsze duty, przy którym toczące się koło nie staje. Zapisujemy do strojenia w E6; mapowanie w wersji 1 go nie używa |
| `max_duty` | Największe duty dopuszczalne po pomiarze prądu i temperatury |
| `deadband` | Część zakresu wejścia wokół zera, która daje zero; jedna dla obu kół |
| `limit` | Limit operatora: górna granica duty, w wersji 1 z konfiguracji Pi |

Wejście `x` z `drive` (-1…1, po walidacji z [05 §5](05-agent-pi.md#5-przyjęcie-drive)) zamienia się na duty tak:

```text
s = min_start_duty[koło, kierunek]
g = min(max_duty[koło, kierunek], limit)

|x| ≤ deadband  →  duty = 0, enable = 0
w przeciwnym razie  →  kierunek = znak x
                       duty = s + (|x| − deadband) / (1 − deadband) × (g − s)
```

Najmniejsze niezerowe duty to więc `min_start_duty`: koło zawsze dostaje wysterowanie, przy którym rusza z miejsca. Odwrócenie z konfiguracji zmienia tylko stany IN danego koła, nie wybór wiersza kalibracji.

Profil jest spójny, gdy dla każdego koła i kierunku `g ≥ s`. Profil niespójny (na przykład limit operatora poniżej `min_start_duty`) blokuje uzbrojenie z czytelnym powodem; limit nie rośnie automatycznie. Nie ma niejawnego impulsu 100% przy rozruchu.

| Parametr | Lewe przód | Lewe tył | Prawe przód | Prawe tył |
|---|---|---|---|---|
| `min_start_duty` | nie zmierzono | nie zmierzono | nie zmierzono | nie zmierzono |
| `min_run_duty` | nie zmierzono | nie zmierzono | nie zmierzono | nie zmierzono |
| `max_duty` | nie zmierzono | nie zmierzono | nie zmierzono | nie zmierzono |

Deadband i limit operatora: nie ustalone ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 6). Uzasadnienie kalibracji zamiast stałego limitu: [ADR-0009](../adr/0009-kalibracja-pwm-zamiast-stalego-limitu.md).

## 6. Diagnostyka lokalna

Skrypt diagnostyczny w `apps/pi-agent/` działa bez panelu i Cloudflare:

- uruchamia kanał A i B osobno i razem, w obu kierunkach, z zadanym duty,
- każda próba ma jawny, krótki limit czasu; napęd nie czeka włączony na kolejne polecenie,
- dopuszcza duty do 1,0 dopiero po sprawdzeniu zasilania,
- wyłącza oba enable po zakończeniu próby i po obsłużonym błędzie.

Składnia: README aplikacji i `rc-diagnostics --help`. Limity: próba trwa najwyżej 3 s (domyślnie 1 s), duty powyżej 0,9 wymaga flagi `--power-checked`. Skrypt kończy każdą pracę zwolnieniem pinów, a potem helperem GPIO ([06 §2](06-nadzor-procesu-i-systemu.md#2-helper-gpio)), także po błędzie, Ctrl-C, SIGTERM i SIGHUP (zerwana sesja SSH). Kody wyjścia: 0 koniec, 1 błąd próby lub helpera (błąd helpera wygrywa z kodem sygnału: enable mogą być w górze), 2 odmowa argumentów lub konfiguracji, 128 + numer sygnału (130 dla Ctrl-C).

Przy 100% mierzymy napięcie pakietu i napięcie między wyjściami silnika. Przy PWM odczyt zwykłego miernika nie opisuje pełnego przebiegu, a iloczyn duty × napięcie nie przewiduje rozruchu. Silnika, który nie rusza, nie zostawiamy pod prądem.

## 7. Dane katalogowe silnika

Punkt odniesienia DNG-16016 ([Botland](https://botland.com.pl/silniki-dc-katowe-z-przekladnia/16016-silnik-dc-148-3-6v-z-podwojnym-walem-200rpm-5904422344078.html), [karta](https://botland.com.pl/index.php?controller=attachment&id_attachment=4965)). Dane nie opisują jeszcze posiadanych egzemplarzy.

| Napięcie | Prąd bez obciążenia | Obroty bez obciążenia | Prąd zatrzymania |
|---|---|---|---|
| 3 V | 150 mA | 120 lub 90 obr./min (sprzeczne dane sklepu) | 1,1 A |
| 4,5 V | 155 mA | 185 obr./min | 1,2 A |
| 6 V | 160 mA | 200 obr./min ±10% | 1,5 A |

Przekładnia 1:48, wał 5,4 mm, brak enkodera. Moment: 0,8 kg·cm według sklepu, minimum 1 kg·cm według karty. Prąd bez obciążenia nie jest limitem prądu rozruchowego.

## 8. Poza zakresem

Enkodery, pomiar prądu i baterii: E7. Aktywne hamowanie: nieużywane do czasu weryfikacji prądów. Zasilanie silników napięciem powyżej ich zakresu 3–6 V na zaciskach: wykluczone.
