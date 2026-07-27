# Contributing

Thanks for helping keep Embertop calm and safe to run.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Scope

Embertop is deliberately small. It shows whether something is happening right
now, and does not try to become a monitoring system. Changes that keep it
quiet and glanceable are the easiest to land; alerting, history, and
configuration surfaces are usually out of scope.

## Development

```bash
npm ci
npm run cli -- --once     # one JSON frame, no UI
npm run dev               # web dashboard reading this machine
```

Before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm audit --omit=dev
```

`npm test` builds the web app first, so it takes a minute.

## What we look for

- Anything that moves honours `prefers-reduced-motion`.
- New telemetry fields have a clear visual purpose and carry no personal data.
- Parser, privacy, and schema changes come with tests.
- The CLI's execution path stays on Node.js built-ins.
- User-visible changes get a line in [CHANGELOG.md](CHANGELOG.md) under
  `Unreleased`.

## Log fixtures

Use documentation-only IP ranges such as `192.0.2.0/24`, `198.51.100.0/24`,
and `203.0.113.0/24`. Never commit real access logs, query strings, tokens, or
visitor identifiers.

## Commits

Prefer focused commits with a concise imperative subject.

## Security

Do not open a public issue for a vulnerability. Follow
[SECURITY.md](SECURITY.md).
