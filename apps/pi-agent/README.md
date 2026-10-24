# pi-agent

Agent Python na Raspberry Pi ([spec 05](../../docs/spec/05-agent-pi.md)). Pełna instrukcja uruchomienia i wdrożenia powstaje w RC-40, w głównym `README.md`.

## Środowisko

Na Pi `gpiozero` i `lgpio` pochodzą z pakietów systemowych (`python3-gpiozero`, `python3-lgpio`; wersje w [07 §1](../../docs/spec/07-sprzet-i-naped.md#1-zestaw)), dlatego venv widzi pakiety systemowe:

```sh
cd apps/pi-agent
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -e '.[dev]'
```

Na komputerze bez GPIO wystarcza zwykły venv (`python3 -m venv .venv`); `gpiozero` instaluje się wtedy z PyPI, a testy używają atrapy pinów.

## Polecenia

| Co | Polecenie |
|---|---|
| Testy | `.venv/bin/pytest` |
| Lint | `.venv/bin/ruff check . && .venv/bin/ruff format --check .` |
| Typy | `.venv/bin/mypy` |
| Diagnostyka kół (po sprawdzeniu zasilania) | `.venv/bin/rc-diagnostics --config /etc/rc-agent/config.toml --duty 0.5 --all` |
| Helper GPIO (ENA i ENB na LOW) | `.venv/bin/rc-gpio-helper --config /etc/rc-agent/config.toml` |

## Konfiguracja

Wzór: [`config.example.toml`](config.example.toml). Na Pi kopia leży poza repozytorium, np. `/etc/rc-agent/config.toml` z prawami `600`, bo zawiera token urządzenia. Wartości jeszcze niezmierzone są we wzorze zakomentowane; bez nich Pi odrzuca `arm`.
