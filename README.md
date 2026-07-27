# Embertop

**Ambient observability for people who run things.**

[![CI](https://github.com/seoulpro/embertop/actions/workflows/ci.yml/badge.svg)](https://github.com/seoulpro/embertop/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen.svg)](package.json)

[한국어](README.ko.md) · [CLI guide](docs/CLI.md) · [Integration](docs/INTEGRATION.md) · [Security](SECURITY.md) · [Notices](THIRD-PARTY-NOTICES.md)

![Embertop — every request leaves a spark](public/og.png)

Embertop turns a server's traffic into a campfire. Every request is a spark,
CPU lifts the flame, and memory keeps the ember bed glowing. There are no
charts, no thresholds, and nothing to acknowledge — you just leave it burning
in a spare terminal and glance over now and then.

Koreans call sitting and staring into a fire *bulmeong* (불멍). This is that,
for the machine you are responsible for. The name pairs `ember` with `top`, a
nod to the Unix monitor you leave running in a spare terminal.

```bash
npx embertop
```

## Reading the fire

Anything reachable from the internet gets more than visitors, so the fire
distinguishes what is knocking from what the server said back.

| Spark | Meaning |
|---|---|
| Warm orange, rises | A visitor was served |
| Cyan | A crawler that named itself — Googlebot, Bingbot, AhrefsBot |
| Ashy violet | Something that did not identify itself: `curl`, a script, a blank agent |
| Amber, fizzles at knee height | 4xx. The request never became a page, so it does not feed the flame |
| Red, big burst | 5xx. Your server broke, not the caller |

Under the readings, two one-minute bands give the same information as a shape
rather than a stream: who is knocking, and what they got. Each band is
captioned in the colours of its own segments, so there is no key to look up,
and a class with no traffic is not mentioned at all — which makes one showing
up the thing you notice.

A quiet site is a mostly-orange band over a mostly-grey one. When `unidentified`
and `refused` start growing together, somebody is walking your paths looking
for `/wp-login.php`. That is a normal Tuesday, and worth knowing without
reading a single line.

The bands are tallied from the request stream in the client, so they work
against any source implementing the documented schema, including your own.

## What this is not

It is not a monitoring system. It does not alert, page, retain history, or
replace Grafana, Netdata, or `htop`. It answers one question — *is anything
happening right now?* — and answers it without asking you to read anything.

## Two commands and an optional web page

Embertop is CLI-first. The terminal UI is the product; the web dashboard is a
companion for wall displays and existing backoffices.

| | What it is | Where it runs |
|---|---|---|
| `embertop watch` | The fire, in your terminal. The default command. | Your laptop, or straight on the box |
| `embertop serve` | A small collector that exposes telemetry over SSE. | The server being watched |
| Web dashboard | Optional browser view of the same stream. | Behind your backoffice auth |

The CLI's execution path uses only Node.js built-ins. Nothing is installed to
watch a local machine.

## Watch a local machine

```bash
npx embertop
```

CPU, memory, and load average, with no configuration and no elevated
privileges. Add access logs to turn requests into sparks:

```bash
embertop --log /var/log/nginx/access.log
embertop -l /var/log/nginx/site-a.log -l /var/log/nginx/site-b.log
```

Nginx and JSON formats are detected automatically. Only lines written *after*
Embertop starts are read, so existing log contents are never replayed.

Keys: `f` focus, `space` or `p` pause, `h` help, `q` quit.

## Watch a remote server

The recommended setup: run the collector on the server, bound to localhost,
and reach it over an SSH tunnel. No new listening port on the internet, no new
credentials — SSH is already the authentication.

**On the server**, as an unprivileged user with read access to the log:

```bash
embertop serve --host 127.0.0.1 --site example.com --log /var/log/nginx/access.log
```

**On your machine**, open the tunnel:

```bash
ssh -N -L 4318:127.0.0.1:4318 operator@example.com
```

**Then, in another terminal**, sit down in front of the fire:

```bash
embertop --endpoint http://127.0.0.1:4318/stream
```

The collector needs no root. Read-only access to the log file is enough — the
bundled unit file assumes `User=embertop`, `Group=adm`. Binding `serve` to a
non-loopback address without a token is refused.

## Optional: the web dashboard

Worth running when you want a wall display, or a panel inside a backoffice
several people already sign into. It is a Next.js app that proxies the
collector, so browsers never see the collector address or its token.

With no upstream configured it reads **the machine it is running on**, using
the same sampler as the CLI — so a fresh checkout shows real readings
immediately, with no configuration:

```bash
npm ci && npm run dev
```

Point it at access logs the same way as the CLI, with `EMBERTOP_LOG_PATHS`.
Embertop has no synthetic mode: every frame it draws is something that
actually happened.

### Running it for real

The build produces a **self-contained directory** — about 22 MB, its own
`node_modules` included — that runs on plain Node with no install step on the
server:

```bash
npm ci && npm run build
```

That leaves everything needed in `.next/standalone`. Copy it to the server and
start it:

```bash
rsync -a .next/standalone/ operator@example.com:/opt/embertop/web/
```

```bash
NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 node /opt/embertop/web/server.js
```

`deploy/embertop-web.service.example` is a systemd unit for exactly that, and
`deploy/nginx.example.conf` fronts it — with SSE buffering turned off, which
matters: buffer the stream and the fire appears frozen. There is a matching
unit for the collector at `collector/embertop.service.example`.

You can build anywhere with the same major Node version: nothing in the output
is architecture-specific, because the shipped runtime contains no native
binaries at all.

> [!IMPORTANT]
> Embertop has no login of its own. Put the web dashboard behind the
> authentication that already protects your backoffice. Request rates and
> traffic patterns are operational information even when every visitor is
> anonymous.

See [the integration guide](docs/INTEGRATION.md) for reverse-proxy layouts,
subpath deployment, and reusing an existing metrics API.

## Scripting

When stdout is not a terminal, the CLI emits JSON Lines instead of drawing:

```bash
embertop --once | jq .metrics
embertop --json >> telemetry.jsonl
```

`embertop doctor` validates a setup — Node version, log readability, remote
stream reachability, collector bind safety — without starting the UI.

## Privacy

Traffic data is operational data, so the redaction happens at collection, not
at display:

- Client IP addresses are never emitted.
- Query strings are dropped.
- Numeric IDs, UUIDs, and token-shaped path segments are redacted.
- `--hide-paths` replaces every path with `/…`.
- Existing log contents are not replayed on startup.
- Machine hostnames are not emitted by default; use `--site` or
  `EMBERTOP_SITE_NAME` to opt into an explicit label.
- The collector binds to localhost by default and requires a token otherwise.
- Upstream credentials stay server-side; the web proxy re-sanitizes anything
  it receives from a custom SSE source.

Read [SECURITY.md](SECURITY.md) before any public deployment.

## Development

Node.js 22.13 or newer.

```bash
npm ci
npm run cli -- --once     # one JSON frame
npm run dev               # web dashboard reading this machine
npm run typecheck
npm run lint
npm test
```

CI verifies the web build, CLI behaviour, privacy parsers, and package
contents on every pull request. Contributions are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Sumin Lim. Bundled third-party material is listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
