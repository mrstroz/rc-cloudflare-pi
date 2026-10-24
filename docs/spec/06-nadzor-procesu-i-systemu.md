# 06. Nadzór procesu i systemu

Co wyłącza napęd, gdy sam agent przestaje działać. Żaden z tych mechanizmów nie jest niezależnym od komputera odcięciem zasilania napędu; tę rolę przy uniesionych kołach pełni wyjęcie ogniw napędu ([07 §4](07-sprzet-i-naped.md#4-zasilanie)); odcięcie przy jeździe po ziemi to [00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 16.

## 1. Usługa systemd

Agent działa jako usługa `systemd` już w MVP.

| Ustawienie | Wartość początkowa | Powód |
|---|---|---|
| `Type` | `notify` | Agent sam zgłasza gotowość i zdrowie |
| `NotifyAccess` | `main` | Tylko główny proces może karmić watchdog |
| `Restart` | `always` | Restart po każdym zakończeniu |
| `RestartSec` | `1s` | |
| `WatchdogSec` | `2s` | |
| `WatchdogSignal` | `SIGKILL` | Bez domyślnego SIGABRT i zapisu core dump, który opóźnia zakończenie |
| `TimeoutStopSec` | `1s` | Krótkie zatrzymanie |
| `ExecStartPre`, `ExecStopPost` | helper GPIO (§2) | Wyłączenie enable przed startem i po każdym zakończeniu |

`WATCHDOG=1` agent wysyła po zdrowej iteracji pętli sterowania, nie z osobnego timera, który mógłby maskować zawieszenie pętli. 2 s nie jest gwarantowanym czasem fizycznego zatrzymania: dochodzi czas helpera i tolerancja systemu.

## 2. Helper GPIO

Osobny program wywoływany przez `ExecStartPre` i `ExecStopPost`. Musi:

- działać dla wybranego backendu PWM ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 2),
- zatrzymać istniejący PWM, także sprzętowy lub obsługiwany przez osobny daemon,
- ustawić oba enable (GPIO12, GPIO13) jako wyjścia LOW,
- zakończyć się w ciągu 500 ms ([08 §4](08-proby-odbiorowe.md#4-progi-zaliczenia), T4); komenda dostaje limit czasu 0,4 s.

Piny bierze z tabeli `[pins]` konfiguracji agenta, a potem sprawdza całą konfigurację. Błąd w innej tabeli nie zmienia wyłączanych pinów, ale kończy helper kodem 2. Gdy `[pins]` nie da się wczytać albo plik jest nieczytelny, helper wyłącza domyślne GPIO12 i GPIO13 ([07 §2](07-sprzet-i-naped.md#2-połączenia-i-gpio)) i kończy się kodem 2. Tak samo postępuje przy błędnych argumentach: wyłącza domyślne piny, wypisuje powód i kończy się kodem 2. Kod 2 ma zablokować start usługi na złej konfiguracji lub wywołaniu. Bez `--config` helper wyłącza domyślne piny i kończy się kodem 0. `--help` kończy się kodem 0 i niczego nie wyłącza. Kod 1 oznacza błąd samej komendy i ma pierwszeństwo przed 2: piny mogły nie zostać wyłączone.

Blok `finally` w Pythonie nie wystarcza: nie wykona się po `SIGKILL`, a samo zakończenie procesu ani rezystor nie gwarantują wyłączenia PWM. Błąd helpera blokuje start usługi i uzbrojenie do usunięcia przyczyny ([05 §4](05-agent-pi.md#4-uzbrojenie-i-sesja-ruchu)).

## 3. Wbudowany watchdog Pi

- `RuntimeWatchdogSec` początkowo 8 s, po sprawdzeniu, że istnieje `/dev/watchdog0`, działa sterownik i system stosuje zadany timeout. Konfiguracja kernela i firmware zależy od wersji OS ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 11).
- Watchdogiem zarządza wyłącznie `systemd`; nie uruchamiamy drugiego procesu obsługującego to samo urządzenie.
- Reaguje, gdy `systemd` przestaje go karmić. Nie wykrywa każdego częściowego zawieszenia, a do restartu wyjścia GPIO mogą nadal sterować napędem.

## 4. Trzy poziomy nadzoru

| Mechanizm | Wyzwalacz | Skala czasu | Skutek |
|---|---|---|---|
| Watchdog ruchu | Brak przyjętego `drive` | 400 ms | Rozbrojenie w działającym agencie ([05 §3](05-agent-pi.md#3-pętla-sterowania-i-watchdog-ruchu)) |
| Watchdog procesu | Brak `WATCHDOG=1` | Około 2 s plus helper | `SIGKILL`, helper GPIO, restart usługi w stanie rozbrojonym |
| Watchdog systemu | `systemd` przestaje karmić `/dev/watchdog0` | Sekundy (początkowo 8 s) plus reset | Restart całego Pi |

Mechanizmy mają różne zakresy i nie składają się w jedną gwarancję zatrzymania w 400 ms. Progi zaliczenia dla każdego poziomu i łańcuch czasu do zatrzymania kół: [08 §4](08-proby-odbiorowe.md#4-progi-zaliczenia). Po każdym restarcie sprawdzamy brak samoczynnego ruchu. Próby resetu i zawieszenia wykonujemy tylko z uniesionymi kołami i ogniwami napędu w zasięgu ręki ([08 §1](08-proby-odbiorowe.md#1-zasady-prób)).

## 5. Sieć Wi-Fi

Przy NetworkManager sprawdzamy bieżący stan oszczędzania energii i wyłączamy je w profilu używanym do jazdy:

```sh
nmcli connection modify "<nazwa-lub-UUID-profilu>" 802-11-wireless.powersave 2
```

Zmianę stosujemy przez reaktywację profilu przy zatrzymanym napędzie i sprawdzamy jej efekt. Nazwa profilu nie musi być SSID. Pomiary obiegu porównujemy przed i po zmianie; nie zakładamy z góry, że oszczędzanie jest włączone ani że powoduje konkretny skok opóźnienia. Optymalizacja sieci nie zmienia zasad świeżości i rozbrajania.

## 6. Poza zakresem

Zewnętrzny watchdog sprzętowy i niezależne od Pi odcięcie zasilania napędu ([ADR-0008](../adr/0008-nadzor-systemd-i-helper-gpio.md)). Pełna instrukcja instalacji od czystego systemu: E6.
