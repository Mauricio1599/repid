// RepID — TASK-026: E2E Chipnet con tBCH real.
//
// Levanta un server aislado en modo chipnet (REPID_DATA_DIR = data_chipnet_e2e)
// y ejecuta el flujo completo (demo) contra la red de pruebas real. Verifica:
//   1. cream una wallet y su saldo on-chain (si es 0 → instrucciones de
//      funding y salida 2: el test quedó "pendiente de tBCH", no falló).
//   2. demo/run: 3 wallets, 1 identidad, 2 interacciones, 2 calificaciones,
//      1 confirmación de plataforma y 1 trust link — todo broadcast real.
//   3. cada tx que produjo un hecho existe en la red (rawtx del worker) y
//      tiene estado de confirmación visible (mempool o confirmada + altura).
//   4. un perfil de reputación se construye desde los hechos on-chain.
//
// Requiere tBCH: el faucet tbch.googol.cash es manual (captcha). La dirección
// a fondear se muestra al correr sin fondos. Correr:
//   node scripts/chipnet-e2e.mjs

import { spawn } from 'node:child_process';

const PORT = 3789;
const DATA = 'data_chipnet_e2e';

const withTimeout = (p, ms, label) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms)),
]);

const api = async (method, path, body) => {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), REPID_NETWORK: 'chipnet', REPID_DATA_DIR: DATA },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stderr.on('data', (d) => { serverLog += d; });
server.stdout.on('data', (d) => { serverLog += d; });

await withTimeout(new Promise((resolve) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Abrí la interfaz')) resolve(); });
}), 20000, 'arranque server').catch(() => {
  console.log('ERROR: el server no arrancó en 20s\n', serverLog.slice(0, 600));
  server.kill();
  process.exit(1);
});

const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!ok) throw new Error(`check fallido: ${label}`);
};

try {
  let walletPool = [];
  {
    const res = await api('GET', '/api/wallets');
    walletPool = res.body;
  }
  if (walletPool.length === 0) {
    const created = await api('POST', '/api/wallets');
    check('wallet creada en Chipnet', created.status === 201 && !!created.body.address, created.body.address?.slice(0, 22) + '…');
    walletPool = [created.body];
  }
  check('wallets disponibles en Chipnet', walletPool.length > 0, `${walletPool.length} wallets`);

  const balances = [];
  for (const w of walletPool) {
    const bal = await api('GET', `/api/wallets/${w.pkh}`);
    balances.push(bal);
  }
  check('saldos consultables on-chain', balances.every((b) => b.status === 200));

  const funded = balances.find((b) => b.body.balanceSats !== '0');
  if (!funded) {
    const w = walletPool[0];
    console.log('\n────────────────────────────────────────────────────────────────');
    console.log('E2E Chipnet esperando tBCH real.');
    console.log(`Fundá esta dirección en el faucet (manual, captcha):`);
    console.log(`  ${w.address}`);
    console.log('  https://tbch.googol.cash');
    console.log('Luego volvé a correr:  node scripts/chipnet-e2e.mjs');
    console.log('(El server y su persistencia quedan intactos para reintentar.)');
    console.log('────────────────────────────────────────────────────────────────');
    server.kill();
    process.exit(2);
  }
  const funder = balances.find((b) => b.body.balanceSats !== '0');
  console.log(`  wallet con tBCH: ${funder.body.address.slice(0, 24)}… (${funder.body.balanceSats} sats)`);

  const summary = await api('POST', '/api/demo/run');
  check('demo completa broadcast en Chipnet', summary.status === 201,
    `${summary.body.facts} hechos (${summary.body.wallets} wallets, ${summary.body.ratings} calificaciones)`);

  const facts = await api('GET', '/api/facts');
  const byType = (t) => facts.body.filter((f) => f.type === t).length;
  check('génesis de identidad on-chain', byType('IDENTITY_GENESIS') === 1);
  check('interacciones on-chain', byType('RECEIPT_GENESIS') === 2);
  check('calificaciones on-chain', byType('RATING_ISSUED') === 2);
  check('confirmación de plataforma on-chain', byType('PLATFORM_CONFIRMATION') === 1);
  check('trust link on-chain', byType('TRUST_LINK') === 1);

  const anyMempool = [];
  for (const fact of facts.body) {
    const status = await api('GET', `/api/tx/${fact.txid}/status`);
    const raw = await api('GET', `/api/tx/${fact.txid}/raw`);
    if (raw.status !== 200 || !raw.body.hex) throw new Error(`tx ${fact.txid} no existe en la red`);
    if (!status.body.confirmed) anyMempool.push(fact.txid);
    console.log(`  tx ${fact.txid} ${status.body.confirmed
      ? `confirmada (bloque ${status.body.blockHeight})`
      : 'en mempool'}  [${fact.type.slice(0, 22)}]`);
  }
  check(`todas las txs existen en Chipnet (rawtx descargado del worker)`, true, `${facts.body.length} txs`);
  console.log(anyMempool.length ? `  (${anyMempool.length} todavía en mempool: ${anyMempool.join(', ')}…)` : '  todas confirmadas.');

  const ratedPkh = facts.body.find((f) => f.type === 'RATING_ISSUED')?.raterPkh;
  const rated = facts.body.find((f) => f.type === 'RATING_ISSUED');
  const profile = await api('GET', `/api/reputation/${rated ? rated.rateePkh : ratedPkh}`);
  check('reputación construida desde hechos reales', profile.status === 200 && profile.body.avg !== null, `avg=${profile.body.avg} (${profile.body.ratingsReceived?.length ?? 0} calificaciones)`);

  // TASK-026 — espera de confirmación: en Chipnet un bloque suele llegar en
  // segundos. Esperamos hasta ~90 s para ver al menos una tx confirmada y
  // asentar la altura real (si sigue en mempool no es fallo: ya está en la red).
  const firstTxid = facts.body[0].txid;
  for (let i = 0; i < 30; i += 1) {
    const status = await api('GET', `/api/tx/${firstTxid}/status`);
    if (status.body.confirmed) {
      console.log(`  ✓ ${firstTxid} confirmada en bloque ${status.body.blockHeight} (chipnet)`);
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
} catch (err) {
  server.kill();
  console.log('ERROR:', err.message);
  console.log('server log:', serverLog.slice(0, 600));
  process.exit(1);
}

server.kill();
// Nota de diseño: NO se borra REPID_DATA_DIR a propósito — las wallets de
// prueba (tBCH) y los hechos quedan accesibles para re-verificar txids o
// reintentar. Para limpiar: borrá la carpeta data_chipnet_e2e manualmente.
console.log('\nE2E Chipnet completado: flow real validado contra la red de pruebas.');
console.log(`(Persistencia conservada en ${DATA}/ para re-verificación — borrala a mano cuando quieras.)`);
process.exit(0);