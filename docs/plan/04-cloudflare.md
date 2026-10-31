# E4. Cloudflare: Worker, Durable Object i panel (TypeScript, MVP-B)

**Cel:** Worker, Durable Object i panel przekazują sterowanie jednego kierowcy do Pi, z ochroną dostępu i dzierżawą.

**Koniec etapu:** lokalnie (`wrangler dev`) z atrapą urządzenia panel uzbraja auto, wysyła `drive` z suwaków i klawiatury, a STOP, ukrycie karty, wygaśnięcie dzierżawy i drugi kierowca zachowują się według [03](../spec/03-worker-i-durable-object.md) i [04](../spec/04-panel-sterowania.md).

**Zależności zewnętrzne:** brak; kwestia 1 w [00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie) (logowanie operatora) jest rozstrzygnięta. Sprzęt niepotrzebny.

## Zadania

- [x] (^) **RC-23** Szkielet `apps/cloudflare/`: Vue 3 + Vite, Worker, Durable Object, Wrangler, testy, typy, lint
      Spec: [01 §3](../spec/01-architektura.md#3-stack), [03 §1](../spec/03-worker-i-durable-object.md#1-worker)
      Gotowe, gdy: `wrangler dev` serwuje pusty panel, a polecenia testów, typów i lintera są dopisane do definicji ukończenia.

- [x] (^) **RC-24** Połączenie urządzenia: token, kierowanie do DO po `car_id`, zastępowanie starszego połączenia
      Spec: [03 §2–§3](../spec/03-worker-i-durable-object.md#2-uwierzytelnienie) · ADR: [0012](../adr/0012-nowsze-polaczenie-urzadzenia-zastepuje-starsze.md) · Zależy od: RC-23
      Gotowe, gdy: test Workera odrzuca zły token urządzenia, a drugie poprawne połączenie zamyka pierwsze.

- [x] (=) **RC-25** Uwierzytelnienie operatora panelu i WebSocketu kierowcy, sprawdzenie `Origin`
      Spec: [03 §2](../spec/03-worker-i-durable-object.md#2-uwierzytelnienie) · Zależy od: RC-23 · Blokada: [00 §9, kwestia 1](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie)
      Gotowe, gdy: WebSocket kierowcy bez sesji operatora albo z obcego `Origin` jest odrzucany.

- [x] (=) **RC-26** Walidacja wiadomości w DO według `protocol/`
      Spec: [03 §4](../spec/03-worker-i-durable-object.md#4-walidacja) · Zależy od: RC-12, RC-24
      Gotowe, gdy: wszystkie przykłady z `protocol/` dają w teście Workera oczekiwany wynik, także dla wektorów tokenu, a walidatory są kompilowane przy buildzie (Ajv standalone).

- [x] (^) **RC-27** Dzierżawa kierowcy: nadanie z komunikatem `lease`, termin 3 s, heartbeat
      Spec: [03 §5](../spec/03-worker-i-durable-object.md#5-dzierżawa-kierowcy) · ADR: [0005](../adr/0005-dzierzawa-kierowcy-i-jawne-przejecie.md) · Zależy od: RC-26
      Gotowe, gdy: testy pokrywają nadanie przy `hello` po `stopped`, wygaśnięcie po 3 s, wiadomość po terminie i stan „zajęta” dla drugiej karty.

- [ ] (=) **RC-28** Przekazywanie komend i odpowiedzi Pi, `stop` po wygaśnięciu i rozłączeniu
      Spec: [03 §7](../spec/03-worker-i-durable-object.md#7-przekazywanie) · Zależy od: RC-27
      Gotowe, gdy: test z atrapą urządzenia: `drive` spoza dzierżawy nie dociera do Pi, a rozłączenie kierowcy wysyła `stop`.

- [ ] (=) **RC-29** Świadome przejęcie: potwierdzony STOP, limit 2 s, odrzucenie równoczesnego `takeover`
      Spec: [03 §6](../spec/03-worker-i-durable-object.md#6-przejęcie) · Zależy od: RC-28
      Gotowe, gdy: testy z atrapą urządzenia: bez `stopped` w 2 s nikt nie ma dzierżawy, a drugi `takeover` w trakcie pierwszego dostaje `error`.

- [ ] (=) **RC-30** Panel: suwaki, klawiatura i zerowanie
      Spec: [04 §1–§2](../spec/04-panel-sterowania.md#1-wejścia) · Zależy od: RC-23
      Gotowe, gdy: test komponentu: ukrycie karty i utrata fokusu zerują oba koła i wysyłają `stop`.
      Zamyka kwestię 12 w 00 §9 (wartość zadawana klawiszem).

- [ ] (=) **RC-31** Panel: aktywacja, STOP, `drive` co 50 ms, heartbeat i statusy
      Spec: [04 §3–§5](../spec/04-panel-sterowania.md#3-aktywacja-i-stop) · Zależy od: RC-28, RC-30
      Gotowe, gdy: z atrapą urządzenia panel uzbraja auto, wysyła `drive` z najnowszym tokenem i pokazuje przyczynę zatrzymania.

- [ ] (=) **RC-32** Estymata obiegu w panelu i log próbek
      Spec: [04 §6](../spec/04-panel-sterowania.md#6-estymata-obiegu), [02 §7](../spec/02-protokol-v1.md#7-estymata-obiegu) · Zależy od: RC-31
      Gotowe, gdy: test: obcy identyfikator, brak wpisu i wynik ujemny dają „brak pomiaru”.

- [ ] (=) **RC-42** Panel: anulowanie oczekującej aktywacji i ignorowanie spóźnionego `armed`
      Spec: [04 §3](../spec/04-panel-sterowania.md#3-aktywacja-i-stop), [02 §4](../spec/02-protokol-v1.md#4-arm-i-stop) · Zależy od: RC-31
      Gotowe, gdy: test komponentu: `armed` po STOP lub z obcym `request_id` nie zmienia statusu i nie uruchamia wysyłania `drive`.

- [ ] (=) **RC-43** Panel: pomijanie taktu przy zatorze WebSocketu
      Spec: [04 §4](../spec/04-panel-sterowania.md#4-wysyłanie) · Zależy od: RC-31
      Gotowe, gdy: test: przy `bufferedAmount > 0` takt `drive` jest pominięty, a `stop` wysłany.

## Uwagi

E4 nie potrzebuje sprzętu i może iść równolegle z E1. Brief wymaga tylko, żeby wynik E1 był znany przed ukończeniem aplikacji Cloudflare.
