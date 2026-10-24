# ADR-0010: STOP jako wybieg (enable = 0), bez aktywnego hamowania

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | adapter L298N, zero koła, STOP i watchdog |

## Kontekst

L298N ma dwa sposoby zatrzymania silnika ([nota ST L298, tabela 5](https://www.st.com/resource/en/datasheet/l298.pdf)): enable = 0 wyłącza mostek i koło toczy się swobodnie, a równe stany IN przy enable = 1 dają aktywne hamowanie. Hamowanie zwiera uzwojenie przez mostek i powoduje przepływ prądu, którego dla posiadanych silników i pakietu 4×AAA jeszcze nie zmierzyliśmy ([00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestie 3–4).

Wyłączenie enable to też najprostszy stan do wymuszenia z zewnątrz: helper GPIO i pull-down działają na tych samych dwóch pinach.

## Decyzja

Zero na kole ustawia jego enable na 0. STOP, watchdog i każde rozbrojenie ustawiają oba enable na 0. Aktywnego hamowania nie używamy.

## Konsekwencje

**Pozytywne:**

- Jeden bezpieczny stan dla wszystkich ścieżek zatrzymania, także dla helpera GPIO po awarii procesu.
- Brak prądu hamowania przy niezweryfikowanym zasilaniu.

**Negatywne:**

- STOP nie zatrzymuje kół natychmiast; auto toczy się do zatrzymania. Przy małym, wolnym pojeździe akceptowalne.

**Wymagania:** tabela stanów w adapterze ([07 §3](../spec/07-sprzet-i-naped.md#3-sterowanie-mostkiem)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Aktywne hamowanie przy STOP | Prąd hamowania niezmierzony; wymaga enable = 1, więc nie jest stanem, do którego sprowadza helper |
| Hamowanie przy zerze koła, wybieg przy STOP | Dwa różne zachowania zera i więcej stanów do testów bez potrzeby w MVP |

## Kiedy wrócić do tej decyzji

Gdy pomiary prądu pokażą, że hamowanie jest bezpieczne dla mostka i pakietu, a droga hamowania przy wybiegu okaże się za długa dla prędkości z profilu jazdy.
