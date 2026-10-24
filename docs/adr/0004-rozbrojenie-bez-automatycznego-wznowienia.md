# ADR-0004: Rozbrojenie po 400 ms bez automatycznego wznowienia

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | watchdog ruchu i odzyskiwanie po przerwie |

## Kontekst

Krótkie przerwy w łączności są przy Wi-Fi i LTE spodziewane. Przegląd briefu (`docs/TRIAGE.md`, punkt 3) zaproponował wariant: zatrzymanie napędu po 400 ms, ale utrzymanie sesji do 2 s, żeby jazda wróciła sama po odzyskaniu łączności. Zmniejsza to liczbę kliknięć, ale pozwala, by ruch wrócił po przerwie bez decyzji kierowcy, w tym na podstawie komendy, która właśnie dotarła z opóźnieniem.

## Decyzja

Po 400 ms bez przyjętego `drive` Pi wyłącza napęd, rozbraja agenta i unieważnia sesję. Rozłączenie, błąd sterowania i restart działają tak samo. Jazda wraca tylko po nowym, świadomym uzbrojeniu przy zerowych wejściach.

## Konsekwencje

**Pozytywne:**

- Opóźniona komenda nie może wznowić ruchu.
- Brak stanu pośredniego „zatrzymane, ale uzbrojone”, który trzeba by wyświetlać i testować.
- Restart procesu lub systemu nie musi odtwarzać sesji; stan rozbrojony jest zawsze punktem startu.

**Negatywne:**

- Każda przerwa dłuższa niż 400 ms wymaga ponownego kliknięcia „Aktywuj sterowanie”.
- Przy słabym łączu jazda będzie się często przerywać; to sygnał do poprawy sieci, nie do zmiany zasady.

**Wymagania:** wyłączenie oszczędzania energii Wi-Fi i pomiar obiegu ([06 §5](../spec/06-nadzor-procesu-i-systemu.md#5-sieć-wi-fi)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Stop po 400 ms, sesja ważna do 2 s, automatyczny powrót jazdy | Ruch wraca bez decyzji kierowcy, także z opóźnionej komendy |
| Dłuższy watchdog (np. 1–2 s) | Auto jedzie dłużej bez kontroli; przerwy nadal wymagają decyzji, co robić po nich |
| Zapis sesji na dysk i wznowienie po restarcie agenta | Restart oznacza nieznany stan; wznowienie po nim jest najmniej przewidywalnym przypadkiem |

## Kiedy wrócić do tej decyzji

Gdy pomiary pokażą częste timeouty mimo poprawionej sieci i dobranego watchdoga. Inny model odzyskiwania wymaga wtedy nowego ADR i osobnych prób.
