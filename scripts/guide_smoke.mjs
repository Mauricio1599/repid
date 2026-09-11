// Smoke de guía: levanta el server REAL con persistencia temporal y
// ejecuta el flujo de GUIA_DE_PRUEBAS tal como lo haría la interfaz.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const PORT = 3911;
const BASE = `http://localhost:${PORT}`;
const DIR = `${process.env.TEMP || process.env.TMP}\\repid-guide-smoke`;
mkdirSync(DIR, { recursive: true });

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT, REPID_DATA_DIR: DIR },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
server.stdout.on('data', (d) => { bootLog += d; });
server.stderr.on('data', (d) => { bootLog += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${BASE}/api/wallets`); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('no levantó');
}
const api = async (path, method = 'GET', body) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r;
};

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  [${extra}]` : ''}`);
  if (!ok) failures += 1;
};

try {
  await waitUp();
  check('mensaje de arranque claro en el log', bootLog.includes('Abrí la interfaz en tu navegador') && bootLog.includes(`http://localhost:${PORT}`));

  // Prueba 1 — crear 3 wallets
  const w = [];
  for (let i = 0; i < 3; i += 1) w.push((await api('/api/wallets', 'POST')).ok ? (await fetch(`${BASE}/api/wallets`).then((r) => r.json()))[i] : null);
  check('3 wallets creadas', w.length === 3 && w.every((x) => x?.pkh));
  const r = await fetch(`${BASE}/api/wallets`).then((r) => r.json());
  check('3 direcciones en la lista Wallets', r.length === 3 && r.every((x) => x && x.pkh));

  // Prueba 2 — mintear identidad (wallet 1)
  const id1 = await api('/api/identities', 'POST', { ownerPkh: r[0].pkh });
  check('identidad minteada (201)', id1.status === 201);
  const id2 = await api('/api/identities', 'POST', { ownerPkh: r[0].pkh });
  check('identidad duplicada rechazada (409)', id2.status === 409);

  // Prueba 3 — interacción pasajero/conductor
  const itx = await api('/api/interactions', 'POST', {
    partyA: { pkh: r[0].pkh, role: 'pasajero' },
    partyB: { pkh: r[1].pkh, role: 'conductor' },
  });
  check('interacción registrada (201)', itx.status === 201);

  // Prueba 4 — rol vacío → 400
  const bad = await api('/api/interactions', 'POST', {
    partyA: { pkh: r[0].pkh, role: '' },
    partyB: { pkh: r[1].pkh, role: 'conductor' },
  });
  check('rol vacío rechazado (400)', bad.status === 400);

  // Prueba 5 — calificación 5 (wallet 1 con su Rating Right)
  const rights = await fetch(`${BASE}/api/rating-rights`).then((x) => x.json());
  const mine = rights.find((rr) => rr.ownerPkh === r[0].pkh);
  const rating = await api('/api/ratings', 'POST', { outpoint: mine.outpoint, raterPkh: r[0].pkh, score: 5 });
  check('calificación 5 emitida (201)', rating.status === 201 && rating.ok);

  // Prueba 6 — right gastada ya no disponible
  const rightsAfter = await fetch(`${BASE}/api/rating-rights`).then((x) => x.json());
  check('Rating Right de w1 ya no aparece', !rightsAfter.some((rr) => rr.ownerPkh === r[0].pkh));

  // Prueba 7 — plataforma confirma (wallet 3, sin identidad)
  const interactions = await fetch(`${BASE}/api/interactions`).then((x) => x.json());
  const conf = await api('/api/platform-confirmations', 'POST', { platformPkh: r[2].pkh, receiptTxid: interactions[0].txid });
  check('plataforma confirma sin identidad (201)', conf.status === 201 && conf.ok);

  // Prueba 8 — trust link A→B
  const trust = await api('/api/trust-links', 'POST', { trusterPkh: r[0].pkh, trustedPkh: r[1].pkh });
  check('confianza A→B declarada (201)', trust.status === 201 && trust.ok);

  // Prueba 10 — los 5 tipos de hecho en el ledger
  const facts = await fetch(`${BASE}/api/facts`).then((x) => x.json());
  const types = new Set(facts.map((f) => f.type));
  const haveAll = ['IDENTITY_GENESIS', 'RECEIPT_GENESIS', 'RATING_ISSUED', 'PLATFORM_CONFIRMATION', 'TRUST_LINK'].every((t) => types.has(t));
  check('5 tipos de hecho en el Ledger', haveAll, facts.map((f) => f.type).join(', '));

  // Prueba 12 — vista indexer: feed crudo + estado interno
  const view = await fetch(`${BASE}/api/indexer-view`).then((x) => x.json());
  check('feed del nodo con hex + txids', view.transactions.length >= 5 && view.transactions.every((t) => t.hex && /^[0-9a-f]{64}$/.test(t.txid)));
  check('estado interno: receipts indexados', view.stores.receipts.length >= 1);
  check('archivo de persistencia reportado', /indexer-store\.json$/.test(view.storeFile));

  // Prueba 13 — transacción desconocida: descartada sin tocar el ledger
  const factsBeforeForeign = (await fetch(`${BASE}/api/facts`).then((x) => x.json())).length;
  const foreign = await api('/api/foreign-tx', 'POST');
  check('transacción desconocida enviada (201)', foreign.status === 201);
  const view2 = await fetch(`${BASE}/api/indexer-view`).then((x) => x.json());
  check('descartada en el feed (factType null)', view2.transactions[0].factType === null && view2.transactions[0].txid === (await foreign.json()).txid);
  const factsAfterForeign = (await fetch(`${BASE}/api/facts`).then((x) => x.json())).length;
  check('ledger intacto tras la transacción ajena', factsAfterForeign === factsBeforeForeign);

  // Prueba 11/14 — reset limpia todo (incluye vista indexer)
  const reset = await api('/api/reset', 'POST');
  const walletsAfter = await fetch(`${BASE}/api/wallets`).then((x) => x.json());
  const factsAfter = await fetch(`${BASE}/api/facts`).then((x) => x.json());
  const viewAfter = await fetch(`${BASE}/api/indexer-view`).then((x) => x.json());
  check('reset limpia wallets, Ledger y vista indexer', reset.ok && walletsAfter.length === 0 && factsAfter.length === 0 && viewAfter.transactions.length === 0 && viewAfter.stores.receipts.length === 0);

  // Prueba 15 — demo automática
  const demo = await api('/api/demo/run', 'POST');
  const demoBody = demo.ok ? await demo.json() : null;
  check('demo automática: resumen completo (201)', demo.status === 201 && demoBody.wallets === 3 && demoBody.identities === 1 && demoBody.interactions === 2 && demoBody.ratings === 2 && demoBody.confirmations === 1 && demoBody.trustLinks === 1);

  // Prueba 16 — perfil de reputación auditable
  const demoWallets = await fetch(`${BASE}/api/wallets`).then((x) => x.json());
  const prof = await fetch(`${BASE}/api/reputation/${demoWallets[0].pkh}`).then((x) => x.json());
  check('perfil wallet 1: 1 rating, avg 4.0, con identidad', prof.ratingsReceived.length === 1 && prof.ratingsReceived[0].score === 4 && prof.avg === '4.0' && prof.hasIdentity === true && prof.distribution[4] === 1);
  const profB = await fetch(`${BASE}/api/reputation/${demoWallets[1].pkh}`).then((x) => x.json());
  check('perfil wallet 2: 1 rating 5 y 1 trust recibido', profB.ratingsReceived.length === 1 && profB.ratingsReceived[0].score === 5 && profB.avg === '5.0' && profB.trustReceived.length === 1);
  const badProf = await api('/api/reputation/xyz');
  check('pkh malformado rechazado (400)', badProf.status === 400);

  console.log(failures === 0 ? '\nTODO OK — guía manual verificada sobre el servidor real.' : `\n${failures} fallos.`);
} catch (e) {
  console.error('ERROR de flujo:', e.message);
  console.error('Log del server:', bootLog.slice(0, 800));
  failures += 1;
} finally {
  server.kill();
  setTimeout(() => rmSync(DIR, { recursive: true, force: true }), 300);
  process.exitCode = failures === 0 ? 0 : 1;
}