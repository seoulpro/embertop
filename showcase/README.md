# Showcase collector

**This is not part of Embertop.** It is a standalone script that emits
*synthetic* telemetry, used only to host a public demo of the interface where
there is no real server to watch.

Nothing here is published to npm or reachable from the application. Embertop itself never generates fake data: with no
collector configured the web server reads the machine it is running on, and
the CLI always reads the real thing.

## Running it

```bash
node showcase/collector.mjs --port 4318
```

Then point an Embertop web instance at it:

```bash
EMBERTOP_UPSTREAM_URL=http://127.0.0.1:4318/stream npm run dev
```

The generated mix — visitors, search crawlers, and a trickle of unidentified
probes collecting 404s — is modelled on what a small public site actually
receives, so the interface demonstrates the behaviour it was built for.

## Deploying a public demo

Run the collector and the web app side by side on the same host, with the
collector bound to localhost. Label the page as a demonstration wherever you
link to it — the interface reports every frame as `live`, because from its
point of view the frames are real.
