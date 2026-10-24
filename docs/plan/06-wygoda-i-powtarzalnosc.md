# E6. Wygoda i powtarzalność (Etap 2 briefu)

**Cel:** wygodne sterowanie z telefonu i powtarzalna instalacja, z parametrami dostrojonymi według wyników MVP.

**Koniec etapu:** kierowca steruje dwoma palcami jednocześnie, widzi czas potwierdzenia komendy i świeżość telemetrii oraz reguluje limit mocy w panelu; agent instaluje się od czystego systemu według instrukcji; rampy, przerwa zmiany kierunku, PWM, okno świeżości i watchdog są dostrojone na docelowym Wi-Fi i LTE.

**Zależności zewnętrzne:** zamknięte E5.

## Zadania

Zadania dopiszemy, gdy etap stanie się bieżący: ich zakres zależy od pomiarów E5. Zakres etapu: [00 §4](../spec/00-przeglad-i-zakres.md#4-poza-zakresem-wersji-1), [04 §7](../spec/04-panel-sterowania.md#7-poza-zakresem), [05 §9](../spec/05-agent-pi.md#9-poza-zakresem).

## Uwagi

Odzyskanie połączenia nadal wymaga ręcznego uzbrojenia ([ADR-0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md)). Hibernacja DO nie należy do E6 ([ADR-0007](../adr/0007-standardowe-websockety-bez-hibernacji.md)).
