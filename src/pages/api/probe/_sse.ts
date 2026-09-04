// Phase 0 timeout probes. Deleted after the finding is recorded.
export function sse(total: number, firstDelayMs: number, gapAtSec: number | null, gapMs: number) {
  const enc = new TextEncoder();
  const started = Date.now();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return new ReadableStream({
    async start(ctrl) {
      const send = (s: string) => ctrl.enqueue(enc.encode(s));
      if (firstDelayMs > 0) await wait(firstDelayMs);
      for (let i = 1; i <= total; i++) {
        if (gapAtSec !== null && i === gapAtSec) await wait(gapMs);
        send(`event: tick\ndata: {"i":${i},"t":${Date.now() - started}}\n\n`);
        await wait(1000);
      }
      send(`event: done\ndata: {"t":${Date.now() - started}}\n\n`);
      ctrl.close();
    },
  });
}
export const headers = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  "x-accel-buffering": "no",
};
