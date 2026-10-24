# E5. Integracja i próby odbiorowe (oba, MVP-B)

**Cel:** cały tor przeglądarka → Cloudflare → Pi → napęd działa przez docelowe łącze i przechodzi próby odbiorowe.

**Koniec etapu:** kierowca przejeżdża autem krótki odcinek w kontrolowanym miejscu; wszystkie próby z [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp) mają wynik w 08 §3, a profil czasowy ma zmierzone wartości. To zamyka MVP ([00 §6](../spec/00-przeglad-i-zakres.md#6-kryteria-sukcesu)).

**Zależności zewnętrzne:** decyzja o docelowej sieci i miejscu jazdy, złożone podwozie ([00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestie 9 i 10).

## Zadania

- [ ] (^) **RC-33** Wdrożenie Workera z sekretami i połączenie agenta na Pi
      Spec: [00 §7](../spec/00-przeglad-i-zakres.md#7-środowiska), [01 §5](../spec/01-architektura.md#5-konfiguracja-i-sekrety) · Zależy od: RC-17, RC-21, RC-25, RC-32, RC-41
      Gotowe, gdy: agent uruchomiony jako usługa łączy się z wdrożonym Workerem, a panel pokazuje „Gotowe”.

- [ ] (=) **RC-34** Symulator przez Cloudflare: przepływ komend, autoryzacja, drugi kierowca
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp) · Zależy od: RC-33
      Gotowe, gdy: P07 zaliczona.

- [ ] (^) **RC-35** Wi-Fi bez oszczędzania energii i pomiar obiegu z heartbeatów przy rozbrojonym napędzie
      Spec: [02 §8](../spec/02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe), [06 §5](../spec/06-nadzor-procesu-i-systemu.md#5-sieć-wi-fi) · Zależy od: RC-19, RC-33 · Blokada: 00 §9, kwestia 9
      Gotowe, gdy: P08 zaliczona, a `freshness_ttl_ms` i próg ostrzegania są wpisane w 02 §8.

- [ ] (=) **RC-36** Weryfikacja wieku tokenów i odrzuceń przy wybranym TTL
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp), [02 §8](../spec/02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe) · Zależy od: RC-08, RC-09, RC-18, RC-35
      Gotowe, gdy: P12–P16 zaliczone na uniesionych kołach.

- [ ] (=) **RC-37** Próby panelu i dzierżawy na uniesionych kołach
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp) · Zależy od: RC-29, RC-36, RC-42
      Gotowe, gdy: P09, P10, P17, P18, P23 i P26 zaliczone.

- [ ] (=) **RC-38** Próby utraty łącza, reconnectu, deployu DO i awarii procesu
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp), [06 §4](../spec/06-nadzor-procesu-i-systemu.md#4-trzy-poziomy-nadzoru) · Zależy od: RC-22, RC-36
      Gotowe, gdy: P11, P19 i P20 zaliczone w progach T1, T4, T5 i T6 z 08 §4.

- [ ] (=) **RC-44** Próba zatoru: wstrzymany odbiorca i zalew ramek
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp), [02 §5](../spec/02-protokol-v1.md#5-token-świeżości) · Zależy od: RC-36, RC-41, RC-43
      Gotowe, gdy: P24 zaliczona.

- [ ] (=) **RC-45** Droga zatrzymania na podłodze przy limicie z profilu
      Spec: [08 §4](../spec/08-proby-odbiorowe.md#4-progi-zaliczenia) · Zależy od: RC-38
      Gotowe, gdy: P25 zaliczona w progu T9; przy przekroczeniu limit operatora jest obniżony w 07 §5, a próba powtórzona.

- [ ] (=) **RC-39** Jazda przez docelowe łącze: oba koła, skręt, obrót w miejscu
      Spec: [08 §2](../spec/08-proby-odbiorowe.md#2-próby-odbiorowe-mvp), [00 §6](../spec/00-przeglad-i-zakres.md#6-kryteria-sukcesu) · Zależy od: RC-37, RC-38, RC-44, RC-45 · Blokada: [00 §9, kwestia 10](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie)
      Gotowe, gdy: P22 zaliczona i spełnione wszystkie kryteria z 00 §6.

- [ ] (=) **RC-40** `README.md`: połączenia, konfiguracja, uruchomienie, testy i wdrożenie obu aplikacji
      Spec: [01 §4](../spec/01-architektura.md#4-układ-repozytorium) · Zależy od: RC-33
      Gotowe, gdy: z czystego klonu da się według README uruchomić agenta w trybie symulacji i panel lokalnie.

## Uwagi

Warunki rozpoczęcia wymuszają zależności zadań:

- Integracja (RC-33) startuje, gdy agent ma sesje, tokeny, telemetrię i ograniczone bufory (E3), a Cloudflare ma dzierżawę i panel (E4).
- Każda próba z uzbrojonym napędem (od RC-36) wymaga zamkniętych prób zasilania i kalibracji z E1 (RC-07, RC-08, RC-09) oraz mapowania profilu (RC-18).
- Bez profilu czasowego z RC-35 Pi odrzuca `arm`, dlatego pomiar obiegu idzie przed wszystkimi próbami z uzbrojonym napędem.
