# Backoffice integration

[한국어](INTEGRATION.ko.md)

Embertop separates visualization from collection. If your backoffice already
has authentication, CPU metrics, and Nginx logs, you can keep that setup and
add a thin telemetry layer.

## Recommended placement

```text
browser
  └─ https://example.com/backoffice/embertop
       └─ Embertop /api/stream (same origin)
            └─ http://127.0.0.1:4318/stream (Bearer token)
                 ├─ existing metrics JSON API
                 └─ Nginx access.log

terminal
  ├─ local operating-system metrics and logs
  └─ the same collector /stream endpoint
```

Place a live web dashboard behind the authentication already protecting your
backoffice. Run the collector on localhost when the UI server and collector
share a machine.

For the path shown above, build the web app with
`EMBERTOP_BASE_PATH=/backoffice/embertop`. The base path is compiled into
client asset and API URLs, so rebuild after changing it.

## Reuse an existing metrics API

Set `EMBERTOP_METRICS_URL` on the collector or local CLI. The response may be
the metrics object itself or an object containing a `metrics` property.

```json
{
  "cpu": 27.1,
  "memory": 58.4,
  "load1": 0.72
}
```

CPU and memory are percentages from 0 to 100. Load is a non-negative number.
Missing values use the local operating-system measurement.

## Connect access logs

Embertop reads Nginx and structured JSON access logs. The recommended Nginx
format minimizes what Embertop's source log records:

```nginx
log_format embertop '- - - [$time_local] '
  '"$request_method $uri $server_protocol" $status $body_bytes_sent '
  '"-" "$http_user_agent" $request_time';

access_log /var/log/nginx/embertop-access.log embertop;
```

This dedicated log does not write a client IP, referrer, or query string.
`$uri` is Nginx's normalized current path without query arguments. The path and
User-Agent still remain in the source log; Embertop uses the latter to reduce a
request to a high-level human, crawler, or unknown classification.

Ordinary combined logs remain supported, but they can retain client IPs,
referrers, and full request lines with query strings on disk before Embertop
reads them. Embertop removes or masks those fields in the event it emits; it
does not rewrite an existing source log.

Give the collector read-only access to the log, restrict who else can read it,
and keep retention no longer than your operating needs. Do not grant the
collector write permission. A ready-to-adapt snippet is included at
`deploy/nginx-access-log.example.conf`.

## Reverse-proxy SSE

Disable buffering along the SSE path:

```nginx
location /internal/embertop-stream {
    proxy_pass http://127.0.0.1:4318/stream;
    proxy_http_version 1.1;
    proxy_set_header Authorization "Bearer ${EMBERTOP_COLLECTOR_TOKEN}";
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

How environment variables are inserted into Nginx configuration depends on
your deployment system. Never commit the real token.

## Check a running deployment

The following commands use common unit names; substitute the names used by your
installation:

```bash
sudo systemctl status embertop-collector embertop-web
sudo journalctl -f -u embertop-collector -u embertop-web
```

Validate log access and parsing without starting the UI:

```bash
embertop doctor --log /var/log/nginx/embertop-access.log
```

`doctor` reports the Node.js version, log readability, local metrics or remote
stream reachability, and collector bind safety.

## Provide SSE directly

You may skip the bundled collector if your backoffice already emits SSE. Each
`data:` payload must follow this shape:

```json
{
  "schema": 1,
  "sequence": 42,
  "at": "2026-07-26T03:04:05.000Z",
  "source": "live",
  "site": "example.com",
  "metrics": {
    "cpu": 23.4,
    "memory": 51.2,
    "load1": 0.48,
    "requestsPerMinute": 12,
    "crawlersPerMinute": 3
  },
  "visits": [
    {
      "id": "unique-event-id",
      "at": "2026-07-26T03:04:04.500Z",
      "kind": "human",
      "method": "GET",
      "path": "/notes",
      "status": 200,
      "durationMs": 38,
      "agent": "Safari"
    }
  ]
}
```

Do not reuse event IDs. Return `Content-Type: text/event-stream`.
The web proxy accepts only schema version 1 frames, drops unknown fields, and
re-applies text, number, and path sanitization before sending data to the
browser.

## Before a public release

1. Confirm that backoffice authentication covers the web route.
2. Confirm that collector tokens never appear in browser developer tools.
3. Confirm that the source log has the intended fields, permissions, rotation,
   and retention.
4. Test emitted paths containing queries, numeric IDs, UUIDs, and long tokens.
5. Confirm that `/api/stream` is not cached by a CDN.
6. Confirm that web and terminal clients reconnect after an interruption.
