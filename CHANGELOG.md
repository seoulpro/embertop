# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Added a privacy-minimized Nginx source-log example that omits client IPs,
  referrers, and query arguments, and clarified the boundary between source-log
  contents and Embertop's emitted-event redaction.
- Made SSH preview examples bind explicitly to loopback and documented direct
  terminal, web-tunnel, service-status, journal, and `doctor` checks.

## [0.3.0] - 2026-07-28

### Added

- A deployment path built on the standalone output: a systemd unit
  (`deploy/embertop-web.service.example`) and an Nginx front
  (`deploy/nginx.example.conf`) with SSE buffering disabled, because a buffered
  stream makes the fire look frozen. `npm run build` produces a self-contained
  ~22 MB directory that runs on plain Node with no install step on the server.
- `THIRD-PARTY-NOTICES.md` and `licenses/Instrument-Sans-OFL.txt`. OFL-1.1
  requires its text to accompany the font wherever it is redistributed, so the
  full licence is vendored alongside the bundled `.woff2` files.
- Tests covering the default web path: that it reports `mode: local`, streams
  the real host's readings, and keeps every connected client on one shared
  sampler rather than letting two tabs split the access-log lines.
- Traffic is now read on two axes instead of one. **Who** knocked (visitor,
  named crawler, or unidentified) and what **result** they got (served, 4xx,
  5xx) are tracked separately, shown as two one-minute stacked bands in both
  the web readout and the terminal, and reflected in the spark colours.
  Previously only 5xx was distinguished, so scanning traffic — which is almost
  entirely 4xx from unidentified agents — was drawn exactly like a visitor.
- 4xx sparks fizzle at knee height instead of rising: a request that never
  became a page does not feed the flame.
- `lib/traffic.mjs`, a shared rolling one-minute tally used by both surfaces.
  It reads the visit stream rather than new collector counters, so it also
  works against a custom SSE source implementing the documented schema.
- `--hearth-x` / `--hearth-y` custom properties so the stylesheet decides where
  the fire sits at each breakpoint.

### Removed

- **The synthetic demo stream is gone from the product.** With no collector
  configured, `/api/stream` now samples the machine the web server runs on
  using the same `TelemetrySource` as `embertop watch`, so a fresh checkout
  shows real readings with no configuration. `"demo"` is no longer a value in
  the telemetry schema, and nothing in the shipped code can fabricate a frame.
  A standalone generator for hosting a public demonstration lives in
  `showcase/`, outside the application and excluded from the npm package.
- `sharp` and its `libvips` binary (LGPL-3.0-or-later) are no longer traced
  into the standalone output. Nothing here uses `next/image`, so image
  optimization is disabled; the shipped runtime is down to nine packages
  (eight MIT, one Apache-2.0) and 22 MB instead of 38 MB.

### Changed

- Aligned the Embertop name across the CLI command, environment-variable
  namespace, deployment examples, and public repository metadata.
- Each band captions itself with words in the colours of its own segments, so
  there is no separate key to cross-reference; the standalone legend is gone.
- Tightened the readout: the crawler percentage was saying what the band
  already shows, and the request totals moved onto the band heading. The
  request log now fills the height this frees rather than ending in dead space.
- Rebuilt the fire renderer around a proportional hearth, near-black charred
  fuel bands, a flame column coloured by height rather than by particle age,
  an ember bed that spills in front of the fuel, and smoke that catches
  firelight instead of glowing. Particles are blitted from a baked sprite cache
  rather than allocating a gradient per particle per frame.
- The web canvas is now full-bleed, so the fire is the page instead of a widget
  on it, and "just the fire" no longer resizes the canvas mid-flame.
- Redesigned the web interface around flat hairline surfaces and a single
  typeface (Instrument Sans), replacing the card-and-blur treatment.
- Redesigned the terminal UI to match: the flame is shaped by a density
  falloff instead of raw noise so it tapers to a tip, the hearth gained crossed
  logs over a graded coal bed, readings and the request log became aligned
  columns, and the marketing lines were dropped. `f` now grows the fire to fill
  the space it frees.
- Documentation now leads with the CLI, and presents the web dashboard as an
  optional companion behind existing backoffice authentication.

### Fixed

- Canvas sizing used `getBoundingClientRect()`, which includes CSS transforms
  and inflated the backing store on a scaled stage. It now uses the layout box.
- Particles in flight are re-anchored to the hearth on resize instead of being
  stranded at their old coordinates.

## [0.2.0]

### Added

- `embertop watch`, `embertop serve`, and `embertop doctor`.
- Nginx and JSON access-log parsing with privacy redaction at collection time.
- Web dashboard with a same-origin SSE proxy.
- A systemd unit example for running the collector as a service.
