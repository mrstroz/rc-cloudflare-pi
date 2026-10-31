# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Internet RC car: a two-motor car driven from a browser through Cloudflare. A Raspberry Pi 4B drives the motors through an L298N bridge.

## Core principle

A wheel turns only on a fresh command that the Pi accepted in an armed session. Any uncertainty disarms the car (`docs/spec/00-przeglad-i-zakres.md` §2). This rules out command queues, restoring sessions from disk, automatic resume after a break and intermediaries that extend deadlines. Check every design choice against it.

## Architecture

```text
Browser (panel) ──WSS──┐
                       ├──► Worker ──► Durable Object (car_id)
Raspberry Pi (agent) ──WSS──┘
```

- The Pi opens an outbound WSS to the Durable Object. It has no public IP and no tunnel (ADR-0001). PWM runs locally on the Pi; only the target values go through Cloudflare.
- The DO is the authority for **access**: driver lease, structure and sender validation, forwarding. The Pi is the only authority for **drive**: arming, motion session, freshness tokens, `seq`, motion watchdog (ADR-0002). Do not add a second drive state machine to the DO or the panel.
- Freshness tokens are HMAC-signed with the Pi's monotonic clock (ADR-0003), never the browser clock.

| Path | Contents | State |
|---|---|---|
| `apps/pi-agent/` | Python 3.13 agent: L298N adapter, GPIO helper, wheel diagnostics, config loader | E1 in progress; the WSS agent (E3) is not written yet |
| `apps/cloudflare/` | TypeScript Worker, Durable Object, Vue 3 panel (pnpm, Wrangler, Vitest) | E4 done locally (Worker, DO, panel, tests); not deployed, Access placeholders |
| `protocol/` | The v1 contract shared by both apps: JSON schemas, valid/invalid examples, token test vectors, `limits.json` | E2 done; see `protocol/README.md` |

A contract change updates the schema and the examples in `protocol/` in the same commit, and both apps' validators must pass the examples. The Python reference reader of `protocol/` lives in `apps/pi-agent/tests/protocol_support.py`.

## Documentation (`docs/`)

The docs are the source of truth for what the system does. Read them before you write code. They are in Polish; `CLAUDE.md` and commit messages are in English.

- `docs/plan/roadmap.md` — read first in every session. Its "Stan na dziś" table says what is done and what is next.
- `docs/spec/` — **what** the system does, in numbered sections `NN-name.md`. Map in `docs/README.md`.
- `docs/adr/` — **why** each decision was made, `NNNN-name.md`. Old ADRs are never deleted.
- `docs/plan/` — **when and what now**: one file per milestone `E1`…`E7`, tasks `RC-NN`. Task format, priorities `(^)`/`(=)`/`(v)` and the definition of done are in `docs/plan/README.md`.
- `docs/BRIEF.md` and `docs/TRIAGE.md` are inputs. When they disagree with `spec/`, the spec wins.

Rules:

- If a change alters behaviour, update the spec first, then the code. Correct the existing text; do not append "this changed" notes.
- A changed decision updates the ADR that holds it. A new ADR is only for a new decision or one replaced entirely (template `docs/adr/template.md`).
- Plan tasks link to spec sections and do not restate behaviour.
- Blockers outside the plan are tracked only in the open-questions table, `docs/spec/00-przeglad-i-zakres.md` §9. Question numbers are fixed; resolved rows stay with their answer.
- One task = one commit, e.g. `feat: RC-11 freshness token encoding and HMAC test vectors`. The task checkbox and "Stan na dziś" in the roadmap change in the same commit as the code.
- Hardware trial results go to `docs/spec/08-proby-odbiorowe.md` §3.

### `project-docs` skills

Work in this repo goes through the `project-docs` plugin skills:

| Skill | Use it for |
|---|---|
| `project-docs:docs-task` | Doing a task ("zrób RC-13", "co teraz", "next task") and closing the docs loop after any change: spec, ADR, blocker, checkbox, roadmap. It stages a commit proposal and does not commit. |
| `project-docs:docs-summary` | Read-only status of the plan ("co zostało", "pokaż zadania"). |
| `project-docs:docs-style` | Before you write or edit any spec, ADR or plan text. |

`docs-init` is not used here because the tree exists. `docs-sync` (GitHub Issues) is off: there is no `docs/docs.config.json`.

## Commands (`apps/pi-agent/`)

Run from `apps/pi-agent/`. Set up the venv as in `apps/pi-agent/README.md`. On the Pi it uses `--system-site-packages`.

```sh
.venv/bin/pytest                                         # all tests
.venv/bin/pytest tests/test_l298n_truth_table.py         # one file
.venv/bin/pytest tests/test_config.py -k <name>          # one test
.venv/bin/pytest tests/test_protocol_*.py                # protocol contract only
.venv/bin/ruff check . ../../protocol/tools --config pyproject.toml
.venv/bin/ruff format --check . ../../protocol/tools --config pyproject.toml
.venv/bin/mypy                                           # strict; also covers protocol/tools
.venv/bin/python ../../protocol/tools/gen_token_vectors.py --check   # token vectors up to date
```

All four checks (pytest, ruff check, ruff format, mypy) must pass for a task to be done. `tests/conftest.py` sets the GPIO Zero mock pin factory at import time, so tests never drive real pins, also on the Pi. JSON files in `protocol/` use the canonical form given in `protocol/README.md`.

## Commands (`apps/cloudflare/`)

Run from `apps/cloudflare/` after `pnpm install`. Node 22, pnpm 11.

```sh
pnpm test                       # builds the panel, then Vitest: worker project in workerd, panel project in happy-dom
pnpm exec vitest run --project worker test/worker/device.test.ts   # one file
pnpm typecheck                  # wrangler types --check, then vue-tsc --build
pnpm lint                       # eslint (type-checked) and prettier --check
pnpm dev                        # builds the panel, wrangler dev on localhost:8787; prints a CF_Authorization cookie (ADR-0013)
```

All three checks (test, typecheck, lint) must pass for a task to be done. After a `wrangler.jsonc` change run `pnpm exec wrangler types` and commit `worker-configuration.d.ts`. Each script first runs `pnpm gen`, which compiles `protocol/` into `src/generated/` (Ajv standalone validators, hops, limits; gitignored). The Worker's protocol case runner is `test/worker/protocol-cases.test.ts`; it and `apps/pi-agent/tests/test_protocol_*.py` must both pass after a contract change.

## Raspberry Pi

### Connecting

- `ssh pi` — alias in `~/.ssh/config` (`raspberrypi.local`, user `mstroz`, key `~/.ssh/pi`).
- Pi 4B, Debian 13 (trixie), Python 3.13, passwordless `sudo`. GPIO Zero runs on `lgpio` from system packages (`python3-gpiozero`, `python3-lgpio`). It is the chosen backend, and the helper uses `pinctrl` (open question 2, resolved by the RC-04 trial in `docs/spec/08-proby-odbiorowe.md` §3).
- Paths differ: the repo is `~/apps/extra/rc-cloudflare-pi` on the laptop and `~/apps/rc-cloudflare-pi` on the Pi.

### Getting code onto the Pi

The Pi holds a git clone that tracks `origin/main` (GitHub over SSH). Code reaches it only through GitHub:

1. Push from the laptop. Ask the user before pushing; unpushed and uncommitted work is not visible on the Pi.
2. On the Pi: `ssh pi 'cd ~/apps/rc-cloudflare-pi && git status --short && git pull --ff-only'`. The worktree there must stay clean; never edit files on the Pi.
3. When `apps/pi-agent/pyproject.toml` changed: `ssh pi 'cd ~/apps/rc-cloudflare-pi/apps/pi-agent && .venv/bin/pip install -e ".[dev]"'`.

### Testing on the Pi

The tests are safe to run on the Pi at any time:

```sh
ssh pi 'cd ~/apps/rc-cloudflare-pi/apps/pi-agent && .venv/bin/pytest && .venv/bin/ruff check . ../../protocol/tools --config pyproject.toml && .venv/bin/ruff format --check . ../../protocol/tools --config pyproject.toml && .venv/bin/mypy'
```

Check that the real GPIO stack loads, without touching any pin:

```sh
ssh pi 'cd ~/apps/rc-cloudflare-pi/apps/pi-agent && .venv/bin/python -c "from gpiozero.pins.lgpio import LGPIOFactory; LGPIOFactory().close()"'
```

### Hardware

- `rc-diagnostics` turns the wheels. Run it only when the user asks for it and has confirmed the drive power is checked. Limits and exit codes: `docs/spec/07-sprzet-i-naped.md` §6.
- `rc-diagnostics` and `rc-gpio-helper` need `--config /etc/rc-agent/config.toml` (mode `600`, outside the repo, holds `device_token`). The user creates it from `apps/pi-agent/config.example.toml`; do not create or print it yourself.
- Code that drives the bridge must end by setting ENA and ENB as outputs at LOW, not by releasing the pins. With `lgpio`, a released ENA reads HIGH because the L298N input pulls it up (`docs/spec/07-sprzet-i-naped.md` §2).
- Wiring and BCM pins: `docs/POLACZENIA.md` and `docs/spec/07-sprzet-i-naped.md` §2.
- lgpio leaves a `.lgd-nfy*` FIFO in the working directory of any process that opened GPIO. Git ignores it.
