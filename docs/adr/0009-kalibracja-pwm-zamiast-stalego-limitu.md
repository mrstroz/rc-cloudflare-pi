# ADR-0009: Kalibracja PWM zamiast stałego limitu mocy

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | profil jazdy, diagnostyka MVP-A |

## Kontekst

Pierwsza wersja briefu ograniczała PWM do 30%. Pakiet 4×AAA daje nominalnie 6 V, a L298N traci do 3,2 V przy 1 A ([nota ST L298](https://www.st.com/resource/en/datasheet/l298.pdf)). Przy 30% silnik może w ogóle nie ruszyć. Przegląd (`docs/TRIAGE.md`, punkt 1) zaproponował stałe 40–60% i stwierdził, że AAA nie przeciążą silnika.

Oba twierdzenia są za mocne. Rozruch zależy od częstotliwości, prądu, obciążenia i stanu baterii, więc „30% = 1 V” to uproszczenie. Silnik zablokowany przy niskim napięciu nadal pobiera prąd i się nagrzewa; brak pomiaru prądu nie jest ochroną nadprądową.

## Decyzja

Limit jazdy wynika z pomiaru. Diagnostyka dopuszcza krótkie próby do `max_duty=1.0` po sprawdzeniu zasilania, przy PWM 100 Hz. Dla każdego koła i kierunku wyznaczamy `min_start_duty`, `min_run_duty` i `max_duty`. Wejście poza deadbandem mapujemy liniowo na przedział od `min_start_duty` do mniejszej z wartości `max_duty` i limitu operatora. Bez kalibracji albo przy pustym przedziale jazda jest zablokowana ([07 §5](../spec/07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja)).

## Konsekwencje

**Pozytywne:**

- Profil jazdy opiera się na zachowaniu posiadanych egzemplarzy, nie na danych katalogowych.
- Pomiar przy 100% wcześnie pokazuje, czy zasilanie lub mostek trzeba zmienić.

**Negatywne:**

- Próby przy 100% wymagają kontroli napięcia, prądu i temperatury oraz uniesionych kół.
- Kalibrację trzeba powtórzyć po zmianie ogniw, silników lub mostka.

**Wymagania:** miernik, fizyczny wyłącznik napędu, próby P02 i P03 ([08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Stały limit 30% | Przy stratach L298N i AAA silnik może nie ruszyć |
| Stały zakres 40–60% | Hipoteza bez pomiaru; nie uwzględnia różnic kół i kierunków |
| Niejawny impuls 100% przy rozruchu | Przekracza limit operatora bez jego wiedzy |
| Dolna granica mapowania na `min_run_duty` | Stojące koło przy małym wejściu nie ruszy; przełączanie progów start/ruch wymaga wiedzy, czy koło się toczy, której bez enkoderów nie mamy |
| Automatyczne podnoszenie limitu do `min_start_duty` | Ukrywa, że limit operatora nie pozwala ruszyć; zamiast tego ruch jest blokowany z powodem |

## Kiedy wrócić do tej decyzji

Gdy dochodzą enkodery i regulacja PID (E7): sterowanie prędkością zastępuje wtedy otwartą pętlę duty.
