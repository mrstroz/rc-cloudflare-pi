# 04. Panel sterowania

Panel w wersji 1: dwa suwaki, klawiatura, aktywacja, STOP i minimalne statusy. Panel nie zastępuje lokalnego zatrzymywania na Pi; każde jego zabezpieczenie jest dodatkowe.

## 1. Wejścia

| Wejście | Lewe koło | Prawe koło |
|---|---|---|
| Suwak pionowy, -100%…+100% | lewy suwak | prawy suwak |
| Klawiatura | `W` przód, `S` tył | `↑` przód, `↓` tył |

- Wartość dodatnia oznacza jazdę do przodu, ujemna do tyłu, zero wyłącza napęd koła. Do protokołu idzie zakres -1…1 ([02 §3](02-protokol-v1.md#3-komenda-drive)).
- Klawiatura pozwala sprawdzić oba kanały jednocześnie na komputerze bez obsługi dwóch palców. Wartość zadawana klawiszem jest otwarta ([00 §9](00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 12).

## 2. Zerowanie i rozbrojenie

| Zdarzenie | Skutek |
|---|---|
| Zwolnienie suwaka lub klawisza | Zero na tym kole |
| Utrata fokusu okna | Zero na obu kołach i `stop` |
| Ukrycie karty | Zero na obu kołach i `stop` |
| Anulowanie gestu dotykowego | Zero na obu kołach i `stop` |
| Przycisk STOP | `stop` |

Po każdym `stop` panel czeka na nowe świadome uzbrojenie. Nic nie wznawia jazdy samo.

## 3. Aktywacja i STOP

- Przycisk „Aktywuj sterowanie” wysyła `arm` z nowym `request_id`, tylko gdy karta ma dzierżawę, a oba wejścia są na zerze.
- Do czasu `armed` aktywacja oczekuje. STOP, ukrycie karty i utrata fokusu anulują ją i wysyłają `stop`. Utrata dzierżawy też ją anuluje; `stop` wysyła wtedy DO. `armed` z innym `request_id` albo po anulowaniu panel ignoruje: nie pokazuje „Sterowanie aktywne” i nie zaczyna wysyłać `drive` ([02 §4](02-protokol-v1.md#4-arm-i-stop)).
- Przycisk „Przejmij” wysyła `takeover`, gdy dzierżawa jest zajęta przez inną kartę albo wolna ([03 §6](03-worker-i-durable-object.md#6-przejęcie)).
- Duży przycisk STOP jest widoczny przez cały czas, także przed uzbrojeniem.
- Po reconnect, przejęciu lub wygaśnięciu dzierżawy aktywacja jest zawsze ręczna i przy zerowych wejściach.
- Pi odrzuca `arm` bez skalibrowanego profilu jazdy i profilu czasowego. Panel pokazuje powód zamiast podnosić limit.

## 4. Wysyłanie

- W uzbrojonej sesji panel co 50 ms wysyła pełny stan obu kół, także gdy wejścia się nie zmieniają.
- Każda ramka powstaje z aktualnego stanu wejść i zawiera najnowszy otrzymany token. Panel nie podmienia tokenu w zaległej ramce i po odzyskaniu łączności nie wysyła zaległej sekwencji.
- W widocznej karcie panel co 1 s wysyła `heartbeat` z rosnącym `heartbeat_seq`, także bez jazdy.
- Gdy `bufferedAmount` WebSocketu jest większy od zera, panel pomija bieżący takt `drive` lub `heartbeat` zamiast dokładać ramkę do kolejki; następny takt wysyła aktualny stan. `stop` panel wysyła zawsze.

## 5. Statusy

| Status | Kiedy |
|---|---|
| Auto offline | DO nie ma połączenia urządzenia |
| Zajęte | Dzierżawę ma inna karta (`lease` „zajęta”); panel pokazuje „Przejmij” |
| Gotowe | Pi połączone i rozbrojone |
| Sterowanie aktywne | Pi potwierdziło `armed` w tej dzierżawie |
| Zatrzymane | Pi rozbrojone po sesji ruchu; panel pokazuje przyczynę z telemetrii |
| Błąd | `error` od DO lub Pi, którego nie rozwiązuje ponowne uzbrojenie |

Osobno panel pokazuje stan własnego połączenia z DO i świeżość ostatniej telemetrii auta.

## 6. Estymata obiegu

Panel liczy estymatę według [02 §7](02-protokol-v1.md#7-estymata-obiegu): przed uzbrojeniem z heartbeatów, w sesji z `drive`. W wersji 1 próbki trafiają do logu przeglądarki, z którego powstaje profil czasowy. Brak świeżego pomiaru jest pokazywany jako „brak pomiaru”, nigdy jako zero.

## 7. Poza zakresem

Etap E6: pełna obsługa dwóch palców jednocześnie, widoczny czas potwierdzenia komendy z ostrzeżeniem według profilu czasowego, czytelne statusy świeżości telemetrii i regulacja limitu mocy w panelu. W wersji 1 limit mocy pochodzi z profilu jazdy na Pi.
