# Roadmap

## Stan na dziś

| Pole | Wartość |
|---|---|
| **Etap** | E1. Pi lokalnie: w toku, 0 z 9. E2 → E4 mogą iść równolegle |
| **Ostatnio ukończone** | Nic; dokumentacja założona 2026-10-24 |
| **Następne** | [RC-01](01-pi-test-lokalny.md) szkielet agenta. Równolegle: RC-02 inwentaryzacja sprzętu i [RC-10](02-protokol-v1.md) schematy protokołu |

Tę tabelę zastępuje ten, kto kończy zadanie. To jedyne miejsce, do którego trzeba zajrzeć na początku sesji.

## Etapy

| Etap | Plik | Cel | Co działa na końcu | Postęp |
|---|---|---|---|---|
| **E1** | [01-pi-test-lokalny](01-pi-test-lokalny.md) | Python: test Pi → L298N → silniki (MVP-A) | Oba koła kręcą się z lokalnego skryptu; profil jazdy zmierzony | 0/9 |
| **E2** | [02-protokol-v1](02-protokol-v1.md) | Wspólne: kontrakt v1 w `protocol/` | Schematy, przykłady i wektory tokenu dla obu aplikacji | 0/3 |
| **E3** | [03-agent-pi](03-agent-pi.md) | Python: agent z WSS, sesją, tokenami, watchdogiem i `systemd` | Agent jako usługa na Pi; testy protokołu i utraty kontroli w symulacji | 0/11 |
| **E4** | [04-cloudflare](04-cloudflare.md) | Cloudflare: Worker, Durable Object, panel | Panel steruje atrapą urządzenia lokalnie, z dzierżawą i ochroną dostępu | 0/12 |
| **E5** | [05-integracja-i-proby](05-integracja-i-proby.md) | Oba: wdrożenie, profil czasowy, próby odbiorowe | Jazda przez docelowe łącze; MVP zamknięte | 0/10 |
| **E6** | [06-wygoda-i-powtarzalnosc](06-wygoda-i-powtarzalnosc.md) | Etap 2 briefu: wygoda i powtarzalność | Dwa palce, widoczne opóźnienia, regulacja mocy, dostrojone parametry | — |
| **E7** | [07-nice-to-have](07-nice-to-have.md) | Etap 3 briefu: rozszerzenia | Zależnie od wybranej funkcji | — |

45 zadań w E1–E5. Jedno zadanie to jedna sesja i jeden commit.

## Dlaczego w tej kolejności

E1 idzie pierwszy, bo jego wynik może unieważnić założenie o zasilaniu: jeśli 4×AAA przez L298N nie dają momentu, trzeba zmienić pakiet lub mostek, zanim powstanie cokolwiek, co zakłada jazdę. E1 nie potrzebuje protokołu ani Cloudflare.

Tor Cloudflare nie potrzebuje sprzętu, więc E2 → E4 może iść równolegle z E1. Brief stawia jeden warunek: wynik E1 ma być znany przed ukończeniem aplikacji Cloudflare. E2 stoi przed E3 i E4, bo obie aplikacje walidują te same przykłady; kontrakt zmieniony po napisaniu dwóch walidatorów oznacza poprawki w dwóch miejscach.

E3 korzysta z adaptera i helpera GPIO z E1 (RC-03, RC-04). Część E3 (RC-13, RC-14, RC-18) może ruszyć zaraz po RC-03.

E5 łączy wszystko. Pomiar obiegu (RC-35) idzie przed próbami z uzbrojonym napędem, bo bez profilu czasowego Pi odrzuca `arm`.

E6 i E7 dostaną zadania dopiero po E5: ich parametry wynikają z pomiarów MVP.

## Ryzyka wyciągnięte przed kolejkę

| Ryzyko | Co robimy | Kiedy |
|---|---|---|
| 4×AAA przez L298N nie dają `VS ≥ 5,8 V` ani momentu do rozruchu | Krótka próba 100% PWM z pomiarem napięć, prądu i temperatury | RC-07, E1 |
| Powerbank nie utrzymuje Pi przy rozruchu obu silników | Próba P06 z wybranym portem i kablem | RC-09, E1 |
| Helper nie wyłącza PWM wybranego backendu po `SIGKILL` | Próba helpera przed projektowaniem usługi | RC-04, E1 |
| Obieg przez docelowe łącze nie mieści się w akceptowalnym TTL | Pomiar z heartbeatów przy rozbrojonym napędzie, pierwszy po wdrożeniu | RC-35, E5 |
| Brak decyzji o logowaniu operatora blokuje udostępnienie panelu | Kwestia 1 w [00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie) do rozstrzygnięcia przed RC-25 | E4 |

## Czego w planie nie ma

Zakres poza wersją 1 opisuje [00 §4](../spec/00-przeglad-i-zakres.md#4-poza-zakresem-wersji-1). Świadomie odrzucone, a nie tylko odłożone: automatyczne wznowienie jazdy ([ADR-0004](../adr/0004-rozbrojenie-bez-automatycznego-wznowienia.md)), aplikacyjne ping/pong ([ADR-0006](../adr/0006-heartbeat-zamiast-ping-pong.md)), zewnętrzny watchdog sprzętowy ([ADR-0008](../adr/0008-nadzor-systemd-i-helper-gpio.md)) i aktywne hamowanie ([ADR-0010](../adr/0010-stop-jako-wybieg.md)).
