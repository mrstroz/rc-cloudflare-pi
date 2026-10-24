# ADR-0008: Nadzór przez systemd, helper GPIO i wbudowany watchdog Pi

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | agent Pi, zachowanie przy awarii procesu i systemu |

## Kontekst

Watchdog ruchu ([05 §3](../spec/05-agent-pi.md#3-pętla-sterowania-i-watchdog-ruchu)) działa tylko wtedy, gdy działa agent. Zawieszony lub zabity proces może zostawić PWM włączony: blok `finally` nie wykona się po `SIGKILL`, a PWM sprzętowy lub obsługiwany przez osobny daemon może działać dalej po zakończeniu Pythona.

Domyślny watchdog usługi `systemd` wysyła SIGABRT, a zapis core dump opóźnia zakończenie ([systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)). Pi 4B ma wbudowany watchdog sprzętowy, który `systemd` obsługuje przez `RuntimeWatchdogSec` ([systemd-system.conf](https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html)). Przegląd briefu (`docs/TRIAGE.md`, punkt 4) przeniósł reconnect, usługę i watchdogi do MVP.

## Decyzja

Agent działa jako usługa `Type=notify` z `WatchdogSec=2s`, `WatchdogSignal=SIGKILL` i `TimeoutStopSec=1s`, karmiąc watchdog po zdrowej iteracji pętli. `ExecStartPre` i `ExecStopPost` uruchamiają helper, który wyłącza oba enable. Backend PWM to GPIO Zero z `lgpio`, a helper używa `pinctrl` z pakietów Raspberry Pi, który ustawia stan pada poza procesem. Wbudowany watchdog Pi działa przez `RuntimeWatchdogSec`, początkowo 8 s. Konfiguracja: [06](../spec/06-nadzor-procesu-i-systemu.md).

## Konsekwencje

**Pozytywne:**

- Zawieszona pętla kończy się zabiciem procesu i wyłączeniem enable bez udziału człowieka.
- Bez zakupu dodatkowego sprzętu.

**Negatywne:**

- Trzy mechanizmy w trzech skalach czasu; żaden nie gwarantuje zatrzymania w 400 ms przy awarii procesu.
- Wbudowany watchdog restartuje całe Pi i nie odcina napędu; do restartu wyjścia mogą sterować silnikami.
- Helper zależy od `pinctrl` z pakietów Raspberry Pi; zmiana backendu lub systemu wymaga powtórzenia próby helpera ([08 §3](../spec/08-proby-odbiorowe.md#3-wyniki)).

**Wymagania:** odcięcie napędu przy każdej próbie (przy uniesionych kołach wyjęcie ogniw; jazda po ziemi czeka na [00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 16); próby P20 i P21 ([08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Tylko `finally` w Pythonie | Nie wykonuje się po `SIGKILL` i nie zatrzymuje PWM obsługiwanego poza procesem |
| Domyślny `WatchdogSignal` (SIGABRT) | Core dump wydłuża czas do zakończenia procesu |
| `WATCHDOG=1` z osobnego timera | Timer działa dalej przy zawieszonej pętli sterowania i maskuje awarię |
| Zakup zewnętrznego watchdoga sprzętowego | Nie jest potrzebny do nadzorowanych prób MVP; wbudowany watchdog Pi pokrywa reset systemu |
| Drugi proces obsługujący `/dev/watchdog0` | Konflikt z `systemd` o to samo urządzenie |

## Kiedy wrócić do tej decyzji

Gdy auto ma jeździć bez nadzoru człowieka przy wyłączniku albo próby P20–P21 pokażą czas wyłączenia napędu nie do przyjęcia. Wtedy potrzebne jest odcięcie zasilania napędu niezależne od Pi.
