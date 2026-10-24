# ADR-0001: Wychodzące WSS z Pi do Durable Object

| Pole | Wartość |
|---|---|
| **Status** | Zaakceptowany |
| **Data** | 2026-10-24 |
| **Dotyczy** | tor komunikacji przeglądarka → Cloudflare → Pi |

## Kontekst

Auto ma działać przez docelowe Wi-Fi lub LTE ([00 §9](../spec/00-przeglad-i-zakres.md#9-otwarte-kwestie), kwestia 9). W obu przypadkach Pi zwykle nie ma publicznego adresu: siedzi za NAT routera albo operatora. Panel i Pi muszą się spotkać w jednym miejscu, które zna stan obu połączeń i może pilnować dzierżawy kierowcy.

Durable Object daje jedną instancję na klucz (`car_id`), która utrzymuje WebSockety obu stron i serializuje obsługę ich wiadomości.

## Decyzja

Pi samo otwiera wychodzące połączenie WSS do Workera, który kieruje je do DO auta. Przeglądarka łączy się z tym samym DO. PWM i sterowanie silnikami zostają lokalnie na Pi.

## Konsekwencje

**Pozytywne:**

- Brak publicznego IP, przekierowania portów i dodatkowego daemona na Pi.
- Ten sam mechanizm działa w sieci domowej i przez LTE.
- DO ma oba połączenia, więc może odciąć starego kierowcę i wysłać STOP do Pi.

**Negatywne:**

- Każda komenda przechodzi przez Cloudflare, co dodaje opóźnienie; budżet świeżości musi je pomieścić ([02 §8](../spec/02-protokol-v1.md#8-budżet-świeżości-i-parametry-czasowe)).
- Deploy Workera może zakończyć WebSockety DO, więc reconnect agenta należy do MVP.

**Wymagania:** reconnect agenta ([05 §2](../spec/05-agent-pi.md#2-połączenie)), token urządzenia jako sekret ([03 §2](../spec/03-worker-i-durable-object.md#2-uwierzytelnienie)).

## Rozważane warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Serwer na Pi z publicznym IP i przekierowaniem portów | LTE zwykle nie daje publicznego adresu; otwarty port na Pi wystawia urządzenie sterujące napędem |
| Cloudflare Tunnel do serwera na Pi | Wymaga osobnego daemona i serwera na Pi, a i tak potrzebny jest punkt, który pilnuje dzierżawy kierowcy |
| WebRTC przeglądarka ↔ Pi | Potrzebuje sygnalizacji i rozwiązania NAT; przeniesione do E7 razem z wideo |

## Kiedy wrócić do tej decyzji

- Gdy zmierzony obieg przez Cloudflare nie mieści się w akceptowalnym TTL, a poprawa łącza nie pomaga.
- Gdy dochodzi wideo w czasie rzeczywistym (E7) i WebRTC staje się potrzebne niezależnie od sterowania.
