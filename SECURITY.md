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

Embertop does not implement user authentication. Deploy it behind the
authentication and authorization already protecting your backoffice. A public
UI can reveal traffic patterns even when individual visitors are anonymized.

## Secrets

Never commit `.env` files or real collector configuration. Rotate
`EMBERTOP_COLLECTOR_TOKEN`, `EMBERTOP_UPSTREAM_TOKEN`, and
`EMBERTOP_METRICS_TOKEN` after any suspected disclosure.
