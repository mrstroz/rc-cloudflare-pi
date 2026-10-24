# E1. Pi lokalnie: test Pi → L298N → silniki (Python, MVP-A)

**Cel:** potwierdzić, że posiadane Pi, L298N, silniki i zasilanie działają razem, i wyznaczyć profil jazdy z pomiarów.

**Koniec etapu:** lokalny skrypt kręci każdym kołem w obu kierunkach z zadanym PWM i wyłącza enable po każdej próbie; profil jazdy w [07 §5](../spec/07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja) ma zmierzone wartości albo wynik mówi, co trzeba zmienić w zasilaniu lub mostku.

**Zależności zewnętrzne:** fizyczny dostęp do auta, miernik, świeże ogniwa alkaliczne 4×AAA.

## Zadania

- [x] (^) **RC-01** Szkielet `apps/pi-agent/`: pakiet Python, przypięte zależności, testy, lint, wzór konfiguracji
      Spec: [01 §4–§5](../spec/01-architektura.md#4-układ-repozytorium)
      Gotowe, gdy: polecenia testów i lintera przechodzą i są dopisane do definicji ukończenia w [README](README.md).

- [ ] (=) **RC-02** Inwentaryzacja zestawu: wersja OS, kandydat na backend PWM, oznaczenia silników, ogniwa, powerbank, zworki
      Spec: [07 §1](../spec/07-sprzet-i-naped.md#1-zestaw)
      Gotowe, gdy: 07 §1 podaje wersję OS, kandydata na backend PWM i oznaczenia z obudów silników.
      OS, backend i zworki wpisane po smoke teście 2026-10-24; brakuje oznaczeń silników, rodzaju ogniw i modelu powerbanku.

- [x] (^) **RC-03** Adapter L298N: cztery wyjścia kierunku, dwa enable z PWM, piny i odwrócenie z konfiguracji
      Spec: [07 §3](../spec/07-sprzet-i-naped.md#3-sterowanie-mostkiem) · ADR: [0010](../adr/0010-stop-jako-wybieg.md) · Zależy od: RC-01
      Gotowe, gdy: testy na atrapie pinów GPIO Zero potwierdzają każdy wiersz tabeli 07 §3 i oba enable = 0 po `stop`.

- [ ] (=) **RC-04** Helper GPIO wyłączający ENA i ENB dla wybranego backendu
      Spec: [06 §2](../spec/06-nadzor-procesu-i-systemu.md#2-helper-gpio) · Zależy od: RC-01, RC-02
      Gotowe, gdy: po `kill -9` procesu z aktywnym PWM helper ustawia oba enable LOW, zmierzone na pinach.
      Zamyka kwestię 2 w 00 §9; od wyniku zależy projekt usługi w E3.

- [ ] (^) **RC-05** Skrypt diagnostyczny kanałów A i B z limitem czasu każdej próby
      Spec: [07 §6](../spec/07-sprzet-i-naped.md#6-diagnostyka-lokalna) · Zależy od: RC-03
      Gotowe, gdy: próba P01 zaliczona na uniesionych kołach.

- [ ] (=) **RC-06** Próba startu, resetu i odłączenia Pi bez ruchu kół
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp), [07 §2](../spec/07-sprzet-i-naped.md#2-połączenia-i-gpio) · Zależy od: RC-04, RC-05
      Gotowe, gdy: P04 zaliczona, a decyzja o rezystorach 10 kΩ (kwestia 14 w 00 §9) jest wpisana w 07 §2.

- [ ] (=) **RC-07** Próba 100% PWM: napięcie pakietu i silników, prąd, temperatura
      Spec: [07 §4](../spec/07-sprzet-i-naped.md#4-zasilanie) · ADR: [0011](../adr/0011-osobne-zasilanie-pi-i-napedu.md) · Zależy od: RC-05
      Gotowe, gdy: P03 i P05 mają wynik w 08 §3, a kwestie 3 i 4 w 00 §9 są zamknięte.
      Wynik może wymusić zmianę pakietu lub mostka przed jazdą.

- [ ] (=) **RC-08** Kalibracja PWM 100 Hz każdego koła i kierunku
      Spec: [07 §5](../spec/07-sprzet-i-naped.md#5-profil-jazdy-i-kalibracja) · ADR: [0009](../adr/0009-kalibracja-pwm-zamiast-stalego-limitu.md) · Zależy od: RC-07
      Gotowe, gdy: tabela profilu w 07 §5 nie zawiera „nie zmierzono”, a kwestia 6 w 00 §9 jest zamknięta.

- [ ] (=) **RC-09** Próba powerbanku przy rozruchu obu silników
      Spec: [07 §4](../spec/07-sprzet-i-naped.md#4-zasilanie) · Zależy od: RC-05
      Gotowe, gdy: P06 zaliczona, a kwestia 5 w 00 §9 jest zamknięta.

## Uwagi

Próba 100% (RC-07) idzie przed kalibracją, bo diagnostyka dopuszcza pełne wysterowanie dopiero po sprawdzeniu zasilania. E1 nie wymaga Cloudflare ani protokołu, więc E2 → E4 można prowadzić równolegle.
