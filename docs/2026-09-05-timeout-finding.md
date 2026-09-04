# Webflow Cloud request timeout: what the 20 seconds is

Measured 5 September 2026 (01:05 to 01:10 IST) against the standalone staging app
`https://fdf-script-staging.webflow.io` (Astro 7.3, `@astrojs/cloudflare` 14.3, Workers runtime),
from curl on a Mumbai connection (Cloudflare colo CCU). Three SSE probes, each an Astro API
route returning a `ReadableStream` with `Content-Type: text/event-stream`.

| Probe | What it does | Expected if wall clock | Expected if TTFB | Expected if idle | Observed |
|---|---|---|---|---|---|
| `stream` | headers at once, one event per second for 45 s | cut at 20 s | completes | completes | **completed**: 45 events, `done` at 45.0 s stream time, 46 s wall |
| `ttfb` | headers at once, first body byte after 25 s | cut at 20 s | cut at 20 s | cut at 20 s | **cut at 21 s** with 200 headers received and zero body bytes |
| `idle` | events 1 to 9, then 25 s of silence, then 10 to 40 | cut at 20 s | completes | cut at ~29 s | **cut at 29 s**: events 1 to 9 received, nothing after |

## Finding

**The 20 seconds is an idle timeout on the response body.** It resets every time a byte
reaches the client. A response can run indefinitely (45 s tested) as long as something is
written at least every 20 seconds. Response headers on their own do not count as activity
(the `ttfb` probe received its headers immediately and was still cut at 21 s).

Chunks are delivered in real time through Cloudflare and the Webflow proxy: curl timestamps
show each event arriving within the same second it was sent, with `Transfer-Encoding: chunked`
and `Cache-Control: private, no-cache` (Webflow rewrites that header on every response).

## Consequence for Phase 2

The direct streaming design in the spec stands. No start-and-reconnect job is needed.
Two rules in the analyser route:

1. Send the `meta` SSE event immediately on request, before the Claude call starts.
2. While no text delta has arrived (model thinking, candidate query, cold start), write an
   SSE comment line (`: ping`) every 5 seconds. Stop once deltas flow; Claude deltas arrive
   many times a second, so a stall longer than 20 s mid-generation would mean the upstream
   call itself failed, which the route reports as an `error` event.

A 15 second ceiling is the safe design target for any silence, leaving a 5 second margin.

## Raw evidence

Saved beside this file in the session scratchpad at the time of measurement:
`probe-stream.txt` (92 lines, 1 s to 46 s), `probe-ttfb.txt` (0 lines, headers only),
`probe-idle.txt` (18 lines, last event `{"i":9,"t":8000}` at 9 s, connection closed at 29 s).
