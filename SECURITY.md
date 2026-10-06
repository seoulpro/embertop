# Security policy

## Supported versions

Security fixes are applied to the latest version on the default branch.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting when it is available for the
repository. Otherwise, use the contact channel at
[limsumin.com](https://limsumin.com). Do not include real access logs, IP
addresses, authorization tokens, session identifiers, or private endpoint URLs
in a public issue.

## Threat model

Embertop treats telemetry as sensitive operational data.

- The browser connects only to the same-origin `/api/stream` route.
- Upstream credentials are read from server-side environment variables.
- The web proxy drops unknown fields and re-applies path and text sanitization
  to custom upstream SSE frames.
- The collector does not emit client IP addresses.
- Query strings are dropped before an event is emitted.
- Numeric IDs, UUIDs, and long token-shaped path segments are redacted.
- Machine hostnames are not emitted unless an operator explicitly sets a site
  label.
- The collector binds to localhost by default and requires a token when
  configured to listen on a non-loopback address.
- Terminal mode uses the same redaction path as the collector.
- Tokens passed with `--token` may be visible in operating-system process
  listings. Prefer `EMBERTOP_TOKEN` or `EMBERTOP_COLLECTOR_TOKEN`.
- Redaction applies to the event Embertop emits, not to an existing Nginx
  source log. A combined log can retain client IPs, referrers, and query strings
  before Embertop reads it. `EMBERTOP_INCLUDE_PATHS=false` and `--hide-paths`
  change emitted data only. Prefer a privacy-minimized source log, restrict
  access to it, and keep retention short.

Embertop does not implement user authentication. Deploy it behind the
authentication and authorization already protecting your backoffice. A public
UI can reveal traffic patterns even when individual visitors are anonymized.

## Secrets

Never commit `.env` files or real collector configuration. Rotate
`EMBERTOP_COLLECTOR_TOKEN`, `EMBERTOP_UPSTREAM_TOKEN`, and
`EMBERTOP_METRICS_TOKEN` after any suspected disclosure.

## Dependency audits

`npm run audit:dependencies` blocks high- or critical-severity findings in
runtime dependencies and any unrecognized high- or critical-severity finding
in development dependencies.

The policy temporarily recognizes
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
in the Next.js ESLint plugin's development-only glob stack. The advisory affects
`braces` through 3.0.3 and has no patched release as of October 6, 2026. The
plugin uses this stack for repository root patterns; this project's ESLint
configuration uses the default working directory and accepts no external
patterns. The affected packages are absent from production-only installs.
Runtime findings remain blocked without exceptions. Remove this development
exception when the plugin supports a patched dependency chain.
