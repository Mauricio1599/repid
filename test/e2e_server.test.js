import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// E2E del servidor prototipo (demo): levanta el server real en un puerto
// efímero con persistencia aislada y ejercita toda la API por HTTP, tal
// como lo haría la interfaz web. No requiere conocimientos de mock: es el
// proceso real (`npm start`) con otra puerta y un directorio temporal.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
const DIR = mkdtempSync(join(tmpdir(), 'repid-e2e-'));

let server;
let serverLog = '';

async function waitUp(attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/wallets`);
      if (res.ok) return;
    } catch { /* el server aún no levanta */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('El servidor E2E no respondió');
}

async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

beforeAll(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), REPID_DATA_DIR: DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  await waitUp();
}, 30_000);

afterAll(() => {
  if (server) server.kill();
  rmSync(DIR, { recursive: true, force: true });
});

describe('Servidor prototipo — flujo feliz end-to-end', () => {
  let a; let b; let platform; let spentOutpoint;

  it('crea wallets sintéticas', async () => {
    a = await api('POST', '/api/wallets');
    b = await api('POST', '/api/wallets');
    platform = await api('POST', '/api/wallets');

    const wallets = await api('GET', '/api/wallets');
    expect(wallets.body).toHaveLength(3);
    const pkhs = wallets.body.map((w) => w.pkh);
    expect(pkhs).toContain(a.body.pkh);
  });

  it('mintea una identidad (RFC-001)', async () => {
    const r = await api('POST', '/api/identities', { ownerPkh: a.body.pkh });
    expect(r.status).toBe(201);
    expect(r.body.type).toBe('IDENTITY_GENESIS');
    expect(r.body.ownerPkh).toBe(a.body.pkh);
  });

  it('rechaza una identidad duplicada (409)', async () => {
    const r = await api('POST', '/api/identities', { ownerPkh: a.body.pkh });
    expect(r.status).toBe(409);
  });

  it('registra una interacción con roles explícitos (RFC-002/003)', async () => {
    const r = await api('POST', '/api/interactions', {
      partyA: { pkh: a.body.pkh, role: 'pasajero' },
      partyB: { pkh: b.body.pkh, role: 'conductor' },
    });
    expect(r.status).toBe(201);
    expect(r.body.type).toBe('RECEIPT_GENESIS');
    expect(r.body.roles).toEqual(['pasajero', 'conductor']);
    expect(r.body.ratingRights).toHaveLength(2);
    expect(r.body.txid).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rechaza una interacción sin rol (400)', async () => {
    const r = await api('POST', '/api/interactions', {
      partyA: { pkh: a.body.pkh, role: '' },
      partyB: { pkh: b.body.pkh, role: 'conductor' },
    });
    expect(r.status).toBe(400);
  });

  it('emite una calificación válida (RFC-004)', async () => {
    const rights = await api('GET', '/api/rating-rights');
    const mine = rights.body.find((rr) => rr.ownerPkh === a.body.pkh);
    const r = await api('POST', '/api/ratings', {
      outpoint: mine.outpoint, raterPkh: a.body.pkh, score: 5,
    });
    expect(r.status).toBe(201);
    expect(r.body.type).toBe('RATING_ISSUED');
    expect(r.body.score).toBe(5);
    expect(r.body.valid).toBe(true);
    spentOutpoint = mine.outpoint;
  });

  it('rechaza un score fuera de rango (400) y una Rating Right ya usada (409)', async () => {
    const rights = (await api('GET', '/api/rating-rights')).body;
    const rightB = rights.find((rr) => rr.ownerPkh === b.body.pkh);
    const bad = await api('POST', '/api/ratings', { outpoint: rightB.outpoint, raterPkh: b.body.pkh, score: 9 });
    expect(bad.status).toBe(400);

    const reuse = await api('POST', '/api/ratings', { outpoint: spentOutpoint, raterPkh: a.body.pkh, score: 4 });
    expect(reuse.status).toBe(409);
  });

  it('confirma la interacción desde la plataforma (SPEC-003 RF-06)', async () => {
    const interactions = await api('GET', '/api/interactions');
    const receiptTxid = interactions.body[0].txid;
    const r = await api('POST', '/api/platform-confirmations', {
      platformPkh: platform.body.pkh, receiptTxid,
    });
    expect(r.status).toBe(201);
    expect(r.body.type).toBe('PLATFORM_CONFIRMATION');
    expect(r.body.receiptTxid).toBe(receiptTxid);
    expect(r.body.valid).toBe(true);
  });

  it('rechaza confirmar un Recibo inexistente (404)', async () => {
    const r = await api('POST', '/api/platform-confirmations', {
      platformPkh: platform.body.pkh, receiptTxid: 'aa'.repeat(32),
    });
    expect(r.status).toBe(404);
  });

  it('declara confianza unilateral A→B y una autoconfianza inválida (SPEC-006)', async () => {
    const good = await api('POST', '/api/trust-links', { trusterPkh: a.body.pkh, trustedPkh: b.body.pkh });
    expect(good.status).toBe(201);
    expect(good.body.type).toBe('TRUST_LINK');
    expect(good.body.valid).toBe(true);

    const self = await api('POST', '/api/trust-links', { trusterPkh: a.body.pkh, trustedPkh: a.body.pkh });
    expect(self.status).toBe(201);
    expect(self.body.type).toBe('TRUST_LINK');
    expect(self.body.valid).toBe(false);
  });

  it('rechaza pkhs mal formados (400)', async () => {
    const r = await api('POST', '/api/trust-links', { trusterPkh: 'zz', trustedPkh: b.body.pkh });
    expect(r.status).toBe(400);
  });

  it('el ledger acumula los 5 tipos de hecho', async () => {
    const facts = await api('GET', '/api/facts');
    const types = new Set(facts.body.map((f) => f.type));
    for (const t of ['IDENTITY_GENESIS', 'RECEIPT_GENESIS', 'RATING_ISSUED', 'PLATFORM_CONFIRMATION', 'TRUST_LINK']) {
      expect(types.has(t), `falta ${t} en el ledger`).toBe(true);
    }
  });

  it('la vista indexer expone el feed crudo y el estado interno', async () => {
    const view = await api('GET', '/api/indexer-view');
    expect(view.status).toBe(200);

    const txs = view.body.transactions;
    expect(txs.length).toBeGreaterThanOrEqual(6);
    expect(txs.some((t) => t.factType === 'RATING_ISSUED')).toBe(true);
    expect(txs.some((t) => t.factType === 'PLATFORM_CONFIRMATION')).toBe(true);
    expect(txs.every((t) => (/^[0-9a-f]+$/.test(t.hex)) && /^[0-9a-f]{64}$/.test(t.txid))).toBe(true);

    expect(view.body.stores.receipts.length).toBeGreaterThanOrEqual(1);
    expect(view.body.stores.ratingRights.length).toBeGreaterThanOrEqual(1);
    expect(view.body.storeFile).toMatch(/indexer-store\.json$/);
  });

  it('una transacción desconocida se descarta sin tocar el ledger', async () => {
    const before = (await api('GET', '/api/facts')).body.length;

    const r = await api('POST', '/api/foreign-tx');
    expect(r.status).toBe(201);
    expect(r.body.recognized).toBeNull();

    const view = await api('GET', '/api/indexer-view');
    const latest = view.body.transactions[0];
    expect(latest.txid).toBe(r.body.txid);
    expect(latest.factType).toBeNull();

    const after = (await api('GET', '/api/facts')).body.length;
    expect(after).toBe(before);
  });

  it('el perfil de reputación es auditable hecho por hecho', async () => {
    const profB = await api('GET', `/api/reputation/${b.body.pkh}`);
    expect(profB.status).toBe(200);
    expect(profB.body.ratingsReceived).toHaveLength(1);
    expect(profB.body.ratingsReceived[0].score).toBe(5);
    expect(profB.body.ratingsReceived[0].raterPkh).toBe(a.body.pkh);
    expect(profB.body.avg).toBe('5.0');
    expect(profB.body.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
    expect(profB.body.trustReceived).toHaveLength(1);
    expect(profB.body.trustReceived[0].trusterPkh).toBe(a.body.pkh);
    expect(profB.body.hasIdentity).toBe(false);

    const profA = await api('GET', `/api/reputation/${a.body.pkh}`);
    expect(profA.body.ratingsReceived).toHaveLength(0);
    expect(profA.body.avg).toBeNull();
    expect(profA.body.ratingsIssued).toHaveLength(1);
    expect(profA.body.ratingsIssued[0].score).toBe(5);
    expect(profA.body.hasIdentity).toBe(true);
    expect(profA.body.confirmedReceipts).toHaveLength(1);

    const bad = await api('GET', '/api/reputation/xyz');
    expect(bad.status).toBe(400);
  });

  it('la demo automática convive con datos previos', async () => {
    const before = (await api('GET', '/api/facts')).body.length;
    const r = await api('POST', '/api/demo/run');
    expect(r.status).toBe(201);
    expect(r.body.facts).toBeGreaterThan(before);
  });

  it('la App de ejemplo (freelance) mueve el flujo completo sobre la API', async () => {
    const client = await api('POST', '/api/wallets');
    const pro = await api('POST', '/api/wallets');
    const platform = await api('POST', '/api/wallets');

    const hire = await api('POST', '/api/interactions', {
      partyA: { pkh: client.body.pkh, role: 'cliente' },
      partyB: { pkh: pro.body.pkh, role: 'profesional' },
    });
    expect(hire.status).toBe(201);
    expect(hire.body.roles).toEqual(['cliente', 'profesional']);
    const clientRight = hire.body.ratingRights.find((rr) => rr.ownerPkh === client.body.pkh);
    expect(clientRight).toBeDefined();

    const confirm = await api('POST', '/api/platform-confirmations', {
      platformPkh: platform.body.pkh, receiptTxid: hire.body.txid,
    });
    expect(confirm.status).toBe(201);
    expect(confirm.body.valid).toBe(true);

    const rating = await api('POST', '/api/ratings', {
      outpoint: clientRight.outpoint, raterPkh: client.body.pkh, score: 5,
    });
    expect(rating.status).toBe(201);
    expect(rating.body.valid).toBe(true);

    const prof = await api('GET', `/api/reputation/${pro.body.pkh}`);
    expect(prof.status).toBe(200);
    expect(prof.body.ratingsReceived).toHaveLength(1);
    expect(prof.body.ratingsReceived[0].raterPkh).toBe(client.body.pkh);
    expect(prof.body.avg).toBe('5.0');

    const clientProfile = await api('GET', `/api/reputation/${client.body.pkh}`);
    expect(clientProfile.body.confirmedReceipts).toHaveLength(1);
    expect(clientProfile.body.confirmedReceipts[0].receiptTxid).toBe(hire.body.txid);
  });

  it('transfiere sats P2PKH→P2PKH sin generar un hecho RepID (TASK-026)', async () => {
    const before = (await api('GET', '/api/facts')).body.length;
    const r = await api('POST', '/api/transfer', {
      fromPkh: platform.body.pkh, toPkh: b.body.pkh, amount: 1000,
    });
    expect(r.status).toBe(201);
    expect(r.body.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.fromPkh).toBe(platform.body.pkh);
    expect(r.body.toPkh).toBe(b.body.pkh);
    expect(r.body.amount).toBe('1000');
    expect((await api('GET', '/api/facts')).body.length).toBe(before);
  });

  it('rechaza transferencias con amount inválido (400) y wallets inexistentes (404)', async () => {
    for (const bad of ['0', '-1', 'abc', '1.5', '', '100']) {
      const r = await api('POST', '/api/transfer', {
        fromPkh: a.body.pkh, toPkh: b.body.pkh, amount: bad,
      });
      expect(r.status, `amount=${JSON.stringify(bad)}`).toBe(400);
    }
    const noFrom = await api('POST', '/api/transfer', { fromPkh: 'aa'.repeat(20), toPkh: b.body.pkh, amount: 5 });
    expect(noFrom.status).toBe(404);
    const noTo = await api('POST', '/api/transfer', { fromPkh: a.body.pkh, toPkh: 'aa'.repeat(20), amount: 5 });
    expect(noTo.status).toBe(404);
  });

  it('los endpoints de status/funding expuestos en TASK-025/026 responden según el modo', async () => {
    const status = await api('GET', '/api/status');
    expect(status.body).toEqual({ network: 'mock' });

    const raw = await api('GET', `/api/tx/${'aa'.repeat(32)}/raw`);
    expect(raw.status).toBe(200);
    expect(raw.body.hex).toBeNull();

    const txStatus = await api('GET', `/api/tx/${'aa'.repeat(32)}/status`);
    expect(txStatus.status).toBe(200);
    expect(txStatus.body).toEqual({ confirmed: true, blockHeight: null });

    const missing = await api('GET', `/api/wallets/${'bb'.repeat(20)}`);
    expect(missing.status).toBe(404);
  });
});

describe('Servidor prototipo — reset del demo', () => {
  it('reinicia el estado del prototipo', async () => {
    const reset = await api('POST', '/api/reset');
    expect(reset.status).toBe(200);

    const wallets = await api('GET', '/api/wallets');
    const facts = await api('GET', '/api/facts');
    expect(wallets.body).toHaveLength(0);
    expect(facts.body).toHaveLength(0);

    const view = await api('GET', '/api/indexer-view');
    expect(view.body.transactions).toHaveLength(0);
    expect(view.body.stores.receipts).toHaveLength(0);
  });

  it('la demo automática puebla el flujo completo', async () => {
    const r = await api('POST', '/api/demo/run');
    expect(r.status).toBe(201);
    expect(r.body.wallets).toBe(3);
    expect(r.body.identities).toBe(1);
    expect(r.body.interactions).toBe(2);
    expect(r.body.ratings).toBe(2);
    expect(r.body.confirmations).toBe(1);
    expect(r.body.trustLinks).toBe(1);

    const factsRes = await api('GET', '/api/facts');
    const counts = {};
    for (const f of factsRes.body) counts[f.type] = (counts[f.type] || 0) + 1;
    expect(counts.IDENTITY_GENESIS).toBe(1);
    expect(counts.RECEIPT_GENESIS).toBe(2);
    expect(counts.RATING_ISSUED).toBe(2);
    expect(counts.PLATFORM_CONFIRMATION).toBe(1);
    expect(counts.TRUST_LINK).toBe(1);

    const wallets = (await api('GET', '/api/wallets')).body;
    const prof = await api('GET', `/api/reputation/${wallets[0].pkh}`);
    expect(prof.body.ratingsReceived).toHaveLength(1);
    expect(prof.body.ratingsReceived[0].score).toBe(4);
    expect(prof.body.avg).toBe('4.0');
  });
});