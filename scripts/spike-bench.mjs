// THROWAWAY — F-02 go/no-go spike (pdf-render-pipeline). Deleted in Phase 5.
//
// Fires N sequential authenticated GETs at the deployed spike PDF endpoint,
// timing each round-trip, and prints the wall-clock distribution (min / p50 /
// p95 / max / mean). Run `wrangler tail` in another terminal during the window
// to capture per-request cpuTime (the 10 ms-free / 30 s-paid CPU gate).
//
// Auth: pass a valid session cookie via SPIKE_COOKIE (the script does NOT log
// in per request — the login route is throttled per-IP). Get one with:
//   curl -s -c jar -X POST <BASE>/api/auth/login -H "Origin: <BASE>" \
//        --data-urlencode user=... --data-urlencode password=... ; grep ml_session jar
//
// Usage:
//   SPIKE_COOKIE="ml_session=..." node scripts/spike-bench.mjs \
//     --url https://maintenance-ledger.rpuczel.workers.dev/api/spike-pdf --n 50

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url", "https://maintenance-ledger.rpuczel.workers.dev/api/spike-pdf");
const n = Number(arg("n", "50"));
const cookie = process.env.SPIKE_COOKIE ?? "";

if (!cookie) {
  console.error("ERROR: set SPIKE_COOKIE env to a valid 'ml_session=...' cookie.");
  process.exit(1);
}

function pct(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

const times = [];
let firstBytes = 0;
let okCount = 0;

console.log(`Benchmarking ${n} authed GETs -> ${url}\n`);

for (let i = 0; i < n; i++) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: { cookie }, redirect: "manual" });
  const buf = await res.arrayBuffer();
  const dt = performance.now() - t0;

  if (res.status === 200 && (res.headers.get("content-type") ?? "").includes("pdf")) {
    okCount++;
    times.push(dt);
    if (!firstBytes) firstBytes = buf.byteLength;
  } else {
    console.error(`  [${i}] unexpected: HTTP ${res.status} ${res.headers.get("content-type")}`);
    if (res.status === 302) {
      console.error("  -> redirected (cookie likely invalid/expired). Aborting.");
      process.exit(1);
    }
  }
  process.stdout.write(`\r  ${i + 1}/${n} (${dt.toFixed(0)} ms)        `);
}

console.log("\n");

times.sort((a, b) => a - b);
const mean = times.reduce((s, x) => s + x, 0) / times.length;

console.log(`Results over ${okCount}/${n} successful renders (${firstBytes} bytes each):`);
console.log(`  min   : ${times[0].toFixed(0)} ms`);
console.log(`  p50   : ${pct(times, 50).toFixed(0)} ms`);
console.log(`  p95   : ${pct(times, 95).toFixed(0)} ms`);
console.log(`  max   : ${times[times.length - 1].toFixed(0)} ms`);
console.log(`  mean  : ${mean.toFixed(0)} ms`);
console.log(`\nWall-clock NFR (5 s p95): ${pct(times, 95) < 5000 ? "PASS" : "FAIL"} (p95=${pct(times, 95).toFixed(0)} ms)`);
console.log("CPU vs 10 ms free / 30 s paid: read cpuTime from `wrangler tail` for the same window.");
