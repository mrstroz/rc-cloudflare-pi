# E3. Agent Pi (Python, MVP-B)

**Cel:** agent łączy się z Cloudflare, przyjmuje tylko świeże i ważne komendy i po każdej niepewności wraca do stanu rozbrojonego.

**Koniec etapu:** agent działa na Pi jako usługa `systemd`; w trybie symulacji przechodzi testy protokołu, sesji, tokenów i watchdoga ruchu, a na Pi wyłącza napęd po zabiciu procesu.

**Zależności zewnętrzne:** brak. Do testów połączenia wystarcza lokalny serwer WebSocket; z prawdziwym Workerem agent łączy się w E5.

## Zadania

- [ ] (=) **RC-13** Tryb symulacji: atrapa mostka zapisująca stany enable i kierunku
      Spec: [05 §8](../spec/05-agent-pi.md#8-tryb-symulacji) · Zależy od: RC-03

- [ ] (^) **RC-14** Pętla sterowania oddzielona od sieci, z watchdogiem ruchu 400 ms
      Spec: [05 §1](../spec/05-agent-pi.md#1-stany-agenta), [05 §3](../spec/05-agent-pi.md#3-pętla-sterowania-i-watchdog-ruchu) · ADR: [0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md) · Zależy od: RC-13
      Gotowe, gdy: test w trybie symulacji: `drive` po 400 ms od poprzedniego jest odrzucany, a oba enable = 0 w progu T1 z 08 §4.

- [ ] (=) **RC-15** Walidacja struktury wiadomości według `protocol/`
      Spec: [05 §5](../spec/05-agent-pi.md#5-przyjęcie-drive) · Zależy od: RC-12
      Gotowe, gdy: wszystkie przykłady z `protocol/` dają w teście agenta oczekiwany wynik.
      Z E2: ścisły parser z `tests/protocol_support.py` przenieść do `src/`; liczby całkowite `1.0` normalizować po walidacji; zdecydować, czy `jsonschema` jest zależnością runtime na Pi.

- [ ] (^) **RC-16** Uzbrojenie, sesja ruchu, `stop` i `stopped` z `request_id`
      Spec: [05 §4](../spec/05-agent-pi.md#4-uzbrojenie-i-sesja-ruchu), [02 §4](../spec/02-protokol-v1.md#4-arm-i-stop) · Zależy od: RC-14, RC-15
      Gotowe, gdy: testy pokrywają powtórzony `request_id` w sesji i po STOP, `arm` ze starej dzierżawy i `arm` przy niespójnym profilu.

- [ ] (=) **RC-17** Tokeny świeżości: wydawanie co 50 ms i sprawdzanie przy `drive`
      Spec: [02 §5](../spec/02-protokol-v1.md#5-token-świeżości), [05 §5](../spec/05-agent-pi.md#5-przyjęcie-drive) · Zależy od: RC-11, RC-16
      Gotowe, gdy: przypadki P12, P13 i P15 z 08 §2 przechodzą jako testy w trybie symulacji.
      Z E2: powody odrzucenia tokenu (`format`, `mac` z wektorów) trafiają do `error_reason` w `common.schema.json` razem z przykładem.

- [ ] (=) **RC-18** Profil jazdy: mapowanie -1…1 na duty, blokada niespójnego profilu, przerwa przy zmianie kierunku
      Spec: [07 §5](../spec/07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja), [05 §6](../spec/05-agent-pi.md#6-wysterowanie-kół) · Zależy od: RC-03
      Gotowe, gdy: testy mapowania pokrywają deadband, obie granice przedziału z 07 §5 i odrzucenie `arm` przy pustym przedziale.
      Przerwę przy zmianie kierunku (kwestia 7 w 00 §9) ustala próba na uniesionych kołach.

- [ ] (=) **RC-19** Telemetria około 5 Hz z wiekiem komunikatów
      Spec: [02 §6](../spec/02-protokol-v1.md#6-telemetria-status), [05 §7](../spec/05-agent-pi.md#7-telemetria) · Zależy od: RC-16
      Gotowe, gdy: test pokazuje `null` w polach wieku przed pierwszym `drive` i heartbeatem.

- [ ] (^) **RC-20** Połączenie WSS z tokenem urządzenia i reconnectem
      Spec: [05 §2](../spec/05-agent-pi.md#2-połączenie) · ADR: [0001](../adr/0001-wychodzace-wss-z-pi-do-durable-object.md) · Zależy od: RC-14
      Gotowe, gdy: test z lokalnym serwerem WebSocket pokazuje rozbrojenie po zerwaniu i ponowne połączenie bez uzbrojenia.

- [ ] (=) **RC-41** Ograniczone bufory agenta: kolejka przychodząca i nieblokujące wysyłanie telemetrii i tokenów
      Spec: [05 §2](../spec/05-agent-pi.md#2-połączenie) · Zależy od: RC-19, RC-20
      Gotowe, gdy: test ze wstrzymanym odbiorcą: pętla utrzymuje okres 10 ms, a kolejki nie przekraczają limitu.

- [ ] (=) **RC-21** Usługa `systemd` z watchdogiem procesu i helperem GPIO
      Spec: [06 §1](../spec/06-nadzor-procesu-i-systemu.md#1-usługa-systemd) · ADR: [0008](../adr/0008-nadzor-systemd-i-helper-gpio.md) · Zależy od: RC-04, RC-14
      Gotowe, gdy: `SIGSTOP` i `SIGKILL` agenta na Pi kończą się restartem w stanie rozbrojonym, a helper mieści się w progu T4 z 08 §4.
      Zamyka kwestię 15 w 00 §9 (błąd trwały a `Restart=always`).

- [ ] (=) **RC-22** Wbudowany watchdog Pi przez `RuntimeWatchdogSec`
      Spec: [06 §3](../spec/06-nadzor-procesu-i-systemu.md#3-wbudowany-watchdog-pi) · Zależy od: RC-21
      Gotowe, gdy: P21 zaliczona, a kwestia 11 w 00 §9 zamknięta.

## Uwagi

RC-13, RC-14 i RC-18 potrzebują tylko adaptera z E1 (RC-03), więc ruszają przed końcem pomiarów. Wartości profilu z RC-08 trafiają do konfiguracji, nie do kodu.
