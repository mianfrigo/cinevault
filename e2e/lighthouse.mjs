// Lighthouse (mobile, simulated throttling: the defaults) against the PRODUCTION build served by the e2e
// stack. The stack's TMDB is the stub, and TMDB images come from a local HTTPS server standing in for
// image.tmdb.org (Chrome maps that host to it), so the run does not depend on TMDB or its CDN.
// Google Fonts is the one real external request, as in production.
//
//   node lighthouse.mjs [runs] [--4g]   (default 3 runs per page; the median is reported;
//                                        --4g: 9 Mbps, 170 ms RTT, 4x CPU instead of the default Slow 4G)
//
// Needs Google Chrome (found by chrome-launcher; CHROME_PATH to override) and openssl (Git for Windows ships one) for a throwaway cert.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { registerCleanup, startStack, WEB_ORIGIN } from './stack.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '.lighthouse');
const IMAGE_PORT = 4011;
const FOUR_G = process.argv.includes('--4g');
const PROFILE = FOUR_G ? '4g' : 'default';
const RUNS = Number(process.argv.find((a) => /^[0-9]+$/.test(a)) ?? 3);
const PAGES = ['/', '/title/movie/603'];

/** A smooth gradient PNG of the requested size (small on the wire: the numbers measure our code, not a CDN). */
function png(w, h) {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      rows[o + 1 + x * 3] = (30 + (x * 40) / w) | 0;
      rows[o + 2 + x * 3] = (40 + (y * 40) / h) | 0;
      rows[o + 3 + x * 3] = 70;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function imageServer() {
  mkdirSync(DIR, { recursive: true });
  const key = join(DIR, 'key.pem');
  const cert = join(DIR, 'cert.pem');
  if (!existsSync(cert)) {
    const openssl = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'].find(
      (bin) => spawnSync(bin, ['version']).status === 0,
    );
    if (!openssl) throw new Error('openssl not found (needed for a throwaway certificate)');
    const r = spawnSync(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '2',
        '-subj',
        '/CN=image.tmdb.org',
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`openssl failed: ${r.stderr.slice(-300)}`);
  }
  const cache = new Map();
  return createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    const w = Number(/\/t\/p\/w(\d+)\//.exec(req.url ?? '')?.[1] ?? 342);
    const h = /backdrop/.test(req.url ?? '') ? Math.round(w * 0.5625) : Math.round(w * 1.5);
    const k = `${w}x${h}`;
    if (!cache.has(k)) cache.set(k, png(w, h));
    res.writeHead(200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(cache.get(k));
  });
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

let stack;
let images;
let chrome;
// Ctrl-C or SIGTERM at any point stops the image server and Chrome too (the stack registers its own).
registerCleanup(async () => {
  await chrome?.kill();
  images?.close();
});
try {
  // Everything that gets started is torn down by the finally below, whichever step fails.
  images = imageServer();
  await new Promise((resolve, reject) => {
    images.once('error', reject);
    images.listen(IMAGE_PORT, '127.0.0.1', resolve);
  });
  stack = await startStack();
  chrome = await launch({
    chromeFlags: [
      '--headless=new',
      `--host-resolver-rules=MAP image.tmdb.org 127.0.0.1:${IMAGE_PORT}`,
      '--ignore-certificate-errors',
    ],
  });
  const summary = {};
  for (const path of PAGES) {
    await fetch(`${WEB_ORIGIN}${path}`).then((r) => r.arrayBuffer()); // warm the API cache like a second visitor
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const { lhr } = await lighthouse(`${WEB_ORIGIN}${path}`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        ...(FOUR_G && {
          throttling: {
            rttMs: 170,
            throughputKbps: 9000,
            requestLatencyMs: 170 * 3.75,
            downloadThroughputKbps: 9000 * 0.9,
            uploadThroughputKbps: 9000 * 0.9,
            cpuSlowdownMultiplier: 4,
          },
        }),
      });
      writeFileSync(
        join(DIR, `${path === '/' ? 'home' : 'title'}-${PROFILE}-${i + 1}.json`),
        JSON.stringify(lhr),
      );
      const num = (id) => lhr.audits[id].numericValue;
      runs.push({
        performance: Math.round(lhr.categories.performance.score * 100),
        accessibility: Math.round(lhr.categories.accessibility.score * 100),
        bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
        seo: Math.round(lhr.categories.seo.score * 100),
        fcpMs: Math.round(num('first-contentful-paint')),
        lcpMs: Math.round(num('largest-contentful-paint')),
        cls: Number(num('cumulative-layout-shift').toFixed(3)),
        tbtMs: Math.round(num('total-blocking-time')),
        speedIndexMs: Math.round(num('speed-index')),
        transferKb: Math.round(num('total-byte-weight') / 1024),
        failing: Object.values(lhr.audits)
          .filter(
            (a) =>
              a.score !== null &&
              a.score < 0.9 &&
              a.scoreDisplayMode !== 'informative' &&
              a.scoreDisplayMode !== 'notApplicable',
          )
          .map((a) => `${a.id}=${a.score}`),
      });
    }
    const med = {};
    for (const k of Object.keys(runs[0]).filter((k) => k !== 'failing'))
      med[k] = median(runs.map((r) => r[k]));
    summary[path] = { median: med, runs };
  }
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await chrome?.kill();
  images?.close();
  await stack?.stop();
}
