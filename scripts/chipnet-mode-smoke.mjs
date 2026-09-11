// TASK-023 — smoke del modo chipnet (server real, sin tBCH)
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const PORT = 3788;
const DATA = 'data_chipnet_smoke';

const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms)),
]);

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) process.exit(1);
};

let server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), REPID_NETWORK: 'chipnet', REPID_DATA_DIR: DATA },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
server.stderr.on('data', (d) => { stderr += d; });

const api = async (method, path, body) => {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let w1Pkh = null;

await withTimeout(new Promise((resolve) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Abrí la interfaz')) resolve(); });
}), 20000, 'arranque server').catch(() => {});

try {
  const w1 = await api('POST', '/api/wallets');
  const w2 = await api('POST', '/api/wallets');
  w1Pkh = w1.body.pkh;
  check('2 wallets creadas en chipnet', w1.status === 201 && w2.status === 201, `addr ${w1.body.address?.slice(0, 20)}…`);

  const ident = await api('POST', '/api/identities', { ownerPkh: w1.body.pkh });
  check('génesis identity en chipnet sin tBCH → 409 (necesita funding real)', ident.status === 409 && /tbch\.googol\.cash/.test(ident.body.error ?? ''), ident.body.error?.slice(0, 70));

  const foreign = await api('POST', '/api/foreign-tx');
  check('foreign-tx sin tBCH → 409 con pista de faucet', foreign.status === 409 && /tbch\.googol\.cash/.test(foreign.body.error ?? ''), foreign.body.error);

  // La wallet no tiene identidad (nunca se minteó), pero al faltar fondos
  // el error debe ser de funding, no de "identidad duplicada".
  const ident2 = await api('POST', '/api/identities', { ownerPkh: w1.body.pkh });
  check('mint repetido sin identidad previa → igualmente 409 por falta de fondos', ident2.status === 409);

  const demo = await api('POST', '/api/demo/run');
  check('demo/run sin tBCH → 409 con pista de faucet (TASK-025) y no 501', demo.status === 409 && /tbch\.googol\.cash/.test(demo.body.error ?? ''), demo.body.error?.slice(0, 70));

  const bal = await api('GET', `/api/wallets/${w1.body.pkh}`);
  check('GET /api/wallets/:pkh → 200 con balance 0 y address', bal.status === 200 && bal.body.balanceSats === '0' && !!bal.body.address, `addr ${bal.body.address?.slice(0, 20)}…`);

  const txStatus = await api('GET', `/api/tx/${'0'.repeat(64)}/status`);
  check('GET /api/tx/:txid/status → 200 con shape confirmado/mempool', txStatus.status === 200 && typeof txStatus.body.confirmed === 'boolean', `confirmed=${txStatus.body.confirmed}`);

  server.kill();
  check('smoke chipnet (1ra pasada) completado', true);
} catch (err) {
  server.kill();
  console.log('ERROR:', err.message);
  if (stderr) console.log('server stderr:', stderr.slice(0, 400));
  process.exit(1);
}

// TASK-025 — las wallets deben sobrevivir el reinicio del proceso (su
// persistencia está aislada en REPID_DATA_DIR/wallet.json).
await withTimeout(new Promise((resolve) => {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), REPID_NETWORK: 'chipnet', REPID_DATA_DIR: DATA },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => { stderr += d; });
  server.stdout.on('data', (d) => { if (String(d).includes('Abrí la interfaz')) resolve(); });
}), 20000, 'arranque server 2da pasada').catch(() => {});

try {
  const reloaded = await api('GET', '/api/wallets');
  const w1Reloaded = reloaded.body.some((w) => w.pkh === w1Pkh);
  check('wallets persistidas recargadas tras reinicio (TASK-025)', reloaded.status === 200 && w1Reloaded, `${reloaded.body.length} wallets recargadas`);
} catch (err) {
  server.kill();
  console.log('ERROR:', err.message);
  if (stderr) console.log('server stderr:', stderr.slice(0, 400));
  process.exit(1);
}

server.kill();
rmSync(DATA, { recursive: true, force: true });
process.exit(0);