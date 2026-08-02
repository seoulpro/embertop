# Embertop

Embertop reads CPU, memory, load average, and web-server access logs on a single host and
draws them as one continuously updating terminal view, so request traffic and system
pressure are visible side by side without running a metrics stack.

*Ambient observability for people who run things.*

[![CI](https://github.com/seoulpro/embertop/actions/workflows/ci.yml/badge.svg)](https://github.com/seoulpro/embertop/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/embertop.svg)](https://www.npmjs.com/package/embertop)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.13-brightgreen.svg)](package.json)

[한국어](README.ko.md) · [CLI guide](docs/CLI.md) · [Integration](docs/INTEGRATION.md) · [Security](SECURITY.md) · [Notices](THIRD-PARTY-NOTICES.md)

![Embertop — every request leaves a spark](public/og.png)

Embertop turns live machine activity into a campfire. CPU raises the flame,
memory brightens the ember bed, and each new access-log entry becomes a spark.
There are no charts to study, thresholds to tune, or alerts to acknowledge.
Leave it running in a spare terminal and let the shape of the fire tell you
when something changes.

In Korean, *bulmeong* (불멍) is the quiet pleasure of staring into a fire.
Embertop brings that feeling to a machine you look after. Its name pairs
`ember` with `top`, a nod to the terminal monitor.

```bash
npm install --global embertop
embertop
```

## Reading the fire

Public-facing servers attract more than human visitors. Embertop separates who
is making a request from how the server responds.

| Spark | Meaning |
|---|---|
| Warm orange, rises | A browser-like visitor |
| Cyan | A crawler that identified itself — Googlebot, Bingbot, AhrefsBot |
| Ashy violet | A non-browser or unidentified client: `curl`, a script, or a blank user agent |
| Amber, fizzles at knee height | A 4xx response: the server refused or could not find the request |
| Red, big burst | A 5xx response: the server failed while handling the request |

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
| `embertop watch` | The fire in your terminal; this is the default command. | Your laptop or the server itself |
| `embertop serve` | A small collector that exposes telemetry over SSE. | The server being watched |
| Web dashboard | Optional browser view of the same stream. | Behind your backoffice auth |

The CLI execution path uses only Node.js built-ins and starts no background
service. Install the npm package globally to use the `embertop` command in the
examples below. From a source checkout, run `npm ci` once and replace
`embertop` with `npm run cli --`.

## Watch a local machine

```bash
embertop
```

With no log configured, Embertop shows system activity only. Add one or more
readable access logs to turn newly appended requests into sparks:

```bash
embertop --log /var/log/nginx/access.log
embertop -l /var/log/nginx/site-a.log -l /var/log/nginx/site-b.log
```

Nginx and JSON formats are detected automatically. Only lines written *after*
Embertop starts are read, so existing log contents are never replayed.

Keys: `f` focus, `space` or `p` pause, `h` help, `q` quit.

### Platform notes

Embertop requires Node.js 22.13 or newer. Local sampling does not require
elevated privileges, but each operating system exposes a slightly different
view of memory and load:

| Platform | Local readings | Notes |
|---|---|---|
| Linux | CPU, memory based on `MemAvailable`, one-minute load average | Primary server target; CI and the bundled systemd/Nginx examples run on Linux |
| macOS | CPU, a `memory_pressure`-derived memory percentage, one-minute load average | Suitable for a local Terminal preview; the memory value is not identical to Activity Monitor's “Memory Used” |
| Windows | CPU and memory from Node.js system APIs | Node.js reports load average as `0` on Windows; no Windows service template is included |

Access-log tailing works wherever Node.js can read the file. The
`/var/log/nginx/...` paths in this README and the bundled service files are
Linux examples, not cross-platform defaults. Current automated tests run on
Linux; macOS and Windows behaviour should be checked on the target machine.

## Watch a remote server

The recommended setup: run the collector on the server, bound to localhost,
and reach it over an SSH tunnel. No new listening port on the internet, no new
credentials — SSH is already the authentication.

**On the server**, as an unprivileged user with read access to the log:

```bash
embertop serve --host 127.0.0.1 --site example.com --log /var/log/nginx/embertop-access.log
```

**On your machine**, open the tunnel:

```bash
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:4318:127.0.0.1:4318 operator@example.com
```

**Then, in another terminal**, sit down in front of the fire:

```bash
embertop --endpoint http://127.0.0.1:4318/stream
```

The explicit local bind keeps the forwarded port on loopback even if the SSH
client is configured otherwise. `ExitOnForwardFailure=yes` exits immediately
when the tunnel cannot be established.

The collector needs no root. Read-only access to the log file is enough. The
bundled systemd unit is a Linux example and assumes `User=embertop`,
`Group=adm`; distributions that assign logs to another group need that value
changed. Binding `serve` to a non-loopback address without a token is refused.

## Optional: the web dashboard

Worth running when you want a wall display, or a panel inside a backoffice
several people already sign into. It is a Next.js app that proxies the
collector, so browsers never see the collector address or its token.

With no upstream configured it reads **the machine visible to the Node.js
process**, using the same sampler as the CLI. On a regular host or VM, that is
the host itself. In a container, the values are whatever the runtime exposes
and are not guaranteed to match cgroup limits or the physical host. Use a
collector or `EMBERTOP_METRICS_URL` when you need an explicit metrics source.

A fresh checkout shows real local readings immediately:

```bash
npm ci && npm run dev
```

Point it at readable access logs with `EMBERTOP_LOG_PATHS`. Embertop has no
synthetic mode: every frame it draws comes from a live sampler or stream.

### Running it for real

The build produces a **self-contained `.next/standalone` directory**, including
its runtime `node_modules`. The server needs a compatible Node.js runtime, but
does not need a separate `npm install`:

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

The current standalone bundle contains no native binaries. Release builds are
verified on Linux; build and test on the target operating system when
deploying elsewhere or after changing the dependency graph.

> [!IMPORTANT]
> Embertop has no login of its own. Put the web dashboard behind the
> authentication that already protects your backoffice. Request rates and
> traffic patterns are operational information even after visitor identifiers
> are removed.

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

Traffic data is operational data. Embertop sanitizes each event before it is
emitted:

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

This does not rewrite the source log. `EMBERTOP_INCLUDE_PATHS=false` (or
`--hide-paths`) changes the path in emitted events, not a line Nginx already
wrote to disk. Use the privacy-minimized source log in the
[integration guide](docs/INTEGRATION.md) when you do not want IP addresses,
referrers, or query strings in Embertop's own access log.

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

## Related projects

- [process-leash](https://github.com/seoulpro/process-leash) — limits for individual
  process trees, where Embertop reports the host totals they contribute to.
- [tallyburn](https://github.com/seoulpro/tallyburn) — a companion terminal monitor for
  token usage instead of host resources.

## License

[MIT](LICENSE) © Sumin Lim. Bundled third-party material is listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
