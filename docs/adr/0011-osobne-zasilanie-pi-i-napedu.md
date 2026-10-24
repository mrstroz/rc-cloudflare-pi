# ADR-0011: Osobne zasilanie Pi i napędu, logika L298N z 5 V Pi

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | zasilanie Pi, L298N i silników |

## Kontekst

Rozruch dwóch silników może pobierać łącznie około 3 A przy 6 V (dane sprzedawcy, [07 §4](../spec/07-sprzet-i-naped.md#4-zasilanie)), a pakiet 4×AAA może przy tym mocno spaść. Pi 4B wymaga stabilnego 5 V / 3 A; spadek napięcia przy rozruchu oznacza reset komputera, który steruje napędem.

Moduł L298N ma regulator 5 V zasilany z wejścia silników, włączany zworką CON5. Przy pakiecie 4×AAA wejście jest bliskie minimum modułu (5 V), a sam zakres 5–12 V nie potwierdza poprawnej pracy regulatora przy każdym napięciu. Posiadany powerbank USB-C jest dostępny jako osobne źródło dla Pi.

## Decyzja

Pi zasila wyłącznie powerbank przez USB-C. Pakiet 4×AAA zasila wyłącznie napęd; koszyk nie ma wyłącznika. Logikę L298N zasila pin 5 V Pi przy zdjętej zworce CON5. Masa jest wspólna; prąd silników wraca do baterii przez moduł, nie przez Pi.

## Konsekwencje

**Pozytywne:**

- Rozruch silników nie ciągnie napięcia zasilania Pi.
- Wyjęcie ogniw odcina silniki bez wyłączania Pi.
- Logika mostka ma stabilne 5 V niezależnie od stanu baterii.

**Negatywne:**

- Linia 5 V Pi zostaje zasilona przy zawieszonym systemie, więc logika mostka się nie wyłącza; zabezpieczeniem jest wyłącznie enable = 0.
- Bez wyłącznika odcięcie napędu wymaga wyjęcia ogniw; przy jeździe po ziemi nie da się go wykonać szybko ([00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 16).
- Dwa źródła do ładowania lub wymiany.

**Wymagania:** zdjęta zworka CON5 (dwa źródła 5 V przy założonej zworce są niedopuszczalne), sprawdzenie portu i kabla powerbanku (P06).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Pi z regulatora L298N | Regulator zasilany z 4×AAA; reset Pi przy rozruchu silników |
| Pi i napęd z jednego pakietu | Ten sam spadek napięcia przy rozruchu dotyka Pi |
| Logika L298N z regulatora modułu (CON5 założona) | Przy 4×AAA wejście jest na granicy minimum modułu; praca regulatora niepotwierdzona |

## Kiedy wrócić do tej decyzji

Gdy próby P03–P05 wskażą zmianę pakietu napędu lub mostka. Wyższe napięcie napędu może pozwolić wrócić do regulatora modułu, po sprawdzeniu jego pracy.
