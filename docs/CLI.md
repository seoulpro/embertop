# Embertop CLI

[한국어](CLI.ko.md)

The CLI is a terminal-native view of the same telemetry shown in the web
dashboard. Its execution path uses only Node.js built-ins, although cloning the
full repository also installs the web dashboard's development dependencies.

## Installation

From a source checkout:

```bash
cd embertop
npm ci
npm run cli --
```

Optionally link the command into your current Node.js toolchain:

```bash
npm link
embertop
```

## `embertop watch`

`watch` is the default command.

```bash
embertop [watch] [options]
```

Local telemetry:

```bash
embertop --site example.com
```

Local telemetry plus access logs:

```bash
embertop \
  --log /var/log/nginx/access.log \
  --format nginx
```

Remote telemetry:

```bash
EMBERTOP_TOKEN=secret \
  embertop --endpoint https://telemetry.example.com/stream
```

Options:

| Option | Purpose |
|---|---|
| `-e, --endpoint URL` | Consume an Embertop SSE stream |
| `-t, --token TOKEN` | SSE bearer token; prefer `EMBERTOP_TOKEN` |
| `-l, --log PATH` | Tail an access log; repeatable |
| `--format FORMAT` | `auto`, `nginx`, or `json` |
| `--site NAME` | Display label |
| `--interval MS` | Local sampling interval from 750 to 30000 ms |
| `--focus` | Start with metrics and logs hidden |
| `--ascii` | Replace block and line glyphs with ASCII |
| `--json` | Emit JSON Lines |
| `--once` | Emit one JSON frame and exit |
| `--no-color` | Disable ANSI colors |
| `--hide-paths` | Replace request paths with `/…` |

If stdout is not a TTY, JSON Lines mode is selected automatically. This makes
the command safe to use in scripts and pipes.

The terminal UI uses UTF-8 glyphs and a 256-color palette when the environment
advertises them. It falls back to ASCII when the active locale is not UTF-8,
and to a restrained 16-color palette when 256-color support is unavailable.
Use `--ascii` to force ASCII or `NO_COLOR=1` to disable color.

English is the default interface language on every system. Set
`EMBERTOP_LANG=ko` to use the optional Korean interface.

## `embertop serve`

Start the authenticated SSE collector used by the web dashboard and remote
CLIs:

```bash
EMBERTOP_COLLECTOR_TOKEN=secret \
  embertop serve \
  --host 0.0.0.0 \
  --port 4318 \
  --log /var/log/nginx/access.log
```

Binding beyond localhost without a token is rejected.

### Recommended: collector on the server, fire on your machine

Exposing the collector to the internet means running one more authenticated
service. Usually you do not have to. Bind it to localhost and reach it over an
SSH tunnel instead, so SSH stays the only thing authenticating.

On the server:

```bash
embertop serve \
  --host 127.0.0.1 \
  --site example.com \
  --log /var/log/nginx/access.log
```

On your machine, in one terminal:

```bash
ssh -N -L 4318:127.0.0.1:4318 operator@example.com
```

And in another:

```bash
embertop --endpoint http://127.0.0.1:4318/stream
```

The collector does not need `root`. Give its account read-only access to the
log file — the bundled `collector/embertop.service.example` assumes
`User=embertop`, `Group=adm`.

Additional options:

| Option | Purpose |
|---|---|
| `--host HOST` | Listen address |
| `--port PORT` | Listen port |
| `--metrics-url URL` | Poll an existing CPU/memory/load JSON API |
| `--metrics-token TOKEN` | Bearer token for that metrics API |

## `embertop doctor`

Validate the current setup without starting the UI:

```bash
embertop doctor --log /var/log/nginx/access.log
EMBERTOP_TOKEN=secret embertop doctor -e https://host.example/stream
```

It checks the Node.js version, log readability, local metrics or remote SSE,
and collector bind safety.

## Environment variables

Command-line values override environment values.

| Variable | Used by |
|---|---|
| `EMBERTOP_ENDPOINT` | Terminal remote mode |
| `EMBERTOP_TOKEN` | Terminal remote mode |
| `EMBERTOP_SITE_NAME` | All modes (default: `this-machine`) |
| `EMBERTOP_LOG_PATHS` | Local terminal and collector |
| `EMBERTOP_LOG_FORMAT` | Local terminal and collector |
| `EMBERTOP_INCLUDE_PATHS` | Local terminal and collector |
| `EMBERTOP_SAMPLE_INTERVAL_MS` | Local terminal and collector |
| `EMBERTOP_HOST` / `EMBERTOP_PORT` | Collector |
| `EMBERTOP_COLLECTOR_TOKEN` | Collector |
| `EMBERTOP_METRICS_URL` | Local terminal and collector |
| `EMBERTOP_METRICS_TOKEN` | Local terminal and collector |
| `EMBERTOP_LANG` | Terminal UI language (`en` by default, `ko` optional) |
| `NO_COLOR` | Terminal UI |

Tokens supplied as command-line arguments can appear in process listings.
Environment variables are preferred on shared systems.
