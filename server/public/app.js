const state = {
  wallets: [],
  ratingRights: [],
  interactions: [],
  network: 'mock',
};

const toastEl = document.getElementById('toast');
function showToast(message, kind) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', kind === 'error');
  toastEl.classList.toggle('success', kind === 'success');
  toastEl.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove('visible'), 4000);
}
function showError(message) { showToast(message, 'error'); }
function showSuccess(message) { showToast(message, 'success'); }

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

function short(hex) {
  if (!hex) return '';
  return hex.length > 16 ? `${hex.slice(0, 8)}…${hex.slice(-6)}` : hex;
}

function walletLabel(pkh) {
  const match = state.wallets.find((w) => w.pkh === pkh);
  return match ? short(match.pkh) : short(pkh);
}

// --- Carga de datos y render --------------------------------------------

function formatSats(n) {
  return `${Number(n).toLocaleString('es-AR')} sat`;
}

async function loadWallets() {
  state.wallets = await api('/api/wallets');

  const list = document.getElementById('wallet-list');
  list.innerHTML = state.wallets.length
    ? state.wallets.map((w) => `<li>
        <code>${short(w.pkh)}</code>
        <button class="mini" data-action="check-balance" data-pkh="${w.pkh}">Saldo</button>
      </li>`).join('')
    : '<li>Sin wallets todavía.</li>';

  const options = state.wallets
    .map((w) => `<option value="${w.pkh}">${short(w.pkh)}</option>`)
    .join('');
  for (const id of ['identity-owner', 'interaction-party-a', 'interaction-party-b', 'platform-pkh', 'trust-trust', 'trust-trusted', 'reputation-pkh', 'app-client', 'app-pro', 'app-platform']) {
    const select = document.getElementById(id);
    const previous = select.value;
    select.innerHTML = options || '<option value="">— crea una wallet primero —</option>';
    if ([...select.options].some((o) => o.value === previous)) select.value = previous;
  }
}

async function loadRatingRights() {
  state.ratingRights = await api('/api/rating-rights');
  const select = document.getElementById('rating-right');
  select.innerHTML = state.ratingRights.length
    ? state.ratingRights
      .map((rr) => `<option value="${rr.outpoint}">${walletLabel(rr.ownerPkh)} → ${walletLabel(rr.ratesPkh)}</option>`)
      .join('')
    : '<option value="">— sin Rating Rights disponibles —</option>';
}

const FACT_LABELS = {
  IDENTITY_GENESIS: 'Identidad minteada',
  RECEIPT_GENESIS: 'Interacción registrada',
  RATING_ISSUED: 'Calificación emitida',
  PLATFORM_CONFIRMATION: 'Interacción confirmada',
  TRUST_LINK: 'Confianza declarada',
};

function renderFact(fact) {
  const time = new Date(fact.at).toLocaleTimeString();
  let detail = '';
  if (fact.type === 'IDENTITY_GENESIS') {
    detail = `owner=${short(fact.ownerPkh)} categoría=${short(fact.identityCategory)}`;
  } else if (fact.type === 'RECEIPT_GENESIS') {
    const [a, b] = fact.ratingRights;
    detail = `${short(a.ownerPkh)} ⇄ ${short(b.ownerPkh)} · categoría=${short(fact.receiptCategory)}`;
  } else if (fact.type === 'RATING_ISSUED') {
    detail = `${short(fact.raterPkh)} → ${short(fact.rateePkh)} · puntaje=${fact.score}`;
  } else if (fact.type === 'PLATFORM_CONFIRMATION') {
    detail = `${short(fact.platformPkh)} corroboró ${short(fact.receiptTxid)}${fact.valid ? '' : ' · INVÁLIDA'}`;
  } else if (fact.type === 'TRUST_LINK') {
    detail = `${short(fact.trusterPkh)} confía en ${short(fact.trustedPkh)}${fact.valid ? '' : ' · INVÁLIDO (autoconfianza)'}`;
  }
  return `<li>
    <span class="fact-dot ${fact.type}"></span>
    <span class="fact-time">${time}</span>
    <span class="fact-body">
      <strong>${FACT_LABELS[fact.type] || fact.type}</strong>
      <span class="fact-data">${detail}</span>
      <span class="fact-data">tx=${short(fact.txid)}</span>
    </span>
  </li>`;
}

async function loadFacts() {
  const facts = await api('/api/facts');
  const log = document.getElementById('fact-log');
  log.innerHTML = facts.length
    ? facts.slice().reverse().map(renderFact).join('')
    : '<li class="fact-empty">Todavía no hay hechos. Crea una wallet para empezar.</li>';
}

async function loadInteractions() {
  state.interactions = await api('/api/interactions');
  const select = document.getElementById('platform-receipt');
  select.innerHTML = state.interactions.length
    ? state.interactions
      .map((fact) => {
        const [a, b] = fact.ratingRights ?? [];
        return `<option value="${fact.txid}">${short(a?.ownerPkh)} ⇄ ${short(b?.ownerPkh)} · ${short(fact.txid)}</option>`;
      })
      .join('')
    : '<option value="">— sin interacciones registradas —</option>';
}

async function refreshAll() {
  await loadWallets();
  await loadRatingRights();
  await loadInteractions();
  await loadFacts();
  await loadIndexerView();
}

// --- Vista indexer ---------------------------------------------------------

const RAW_LABELS = { ...FACT_LABELS };

function renderRawTx(tx) {
  const recognized = tx.factType !== null;
  const size = Math.floor(tx.hex.length / 2);
  const label = recognized ? (RAW_LABELS[tx.factType] || tx.factType) : 'Descartada (no es RepID)';
  const time = new Date(tx.at).toLocaleTimeString();
  return `<li>
    <details class="raw-tx">
      <summary>
        <span class="raw-badge ${recognized ? 'ok' : 'no'}">${recognized ? 'Reconocida' : 'Descartada'}</span>
        <span class="raw-status pending" data-txid="${tx.txid}" data-status="unknown">…</span>
        <span class="fact-time">${time}</span>
        <strong>${label}${recognized ? '' : ''}</strong>
        <span class="fact-data">tx=${short(tx.txid)} · ${size} bytes</span>
      </summary>
      <pre class="raw-hex">${tx.hex}</pre>
    </details>
  </li>`;
}

async function checkTxStatuses(transactions) {
  for (const tx of transactions) {
    const el = document.querySelector(`[data-txid="${tx.txid}"]`);
    if (!el) continue;
    try {
      const status = state.network === 'chipnet'
        ? await api(`/api/tx/${tx.txid}/status`)
        : { confirmed: true, blockHeight: null };
      const label = status.confirmed
        ? `confirmada${status.blockHeight ? ` · bloque ${status.blockHeight}` : ''}`
        : 'en mempool';
      el.textContent = label;
      el.dataset.status = status.confirmed ? 'confirmed' : 'pending';
    } catch {
      el.textContent = 'estado no disponible';
    }
  }
}

async function loadIndexerView() {
  const view = await api('/api/indexer-view');
  const feed = document.getElementById('raw-feed');
  feed.innerHTML = view.transactions.length
    ? view.transactions.map(renderRawTx).join('')
    : '<li class="fact-empty">Todavía no llegó ninguna transacción.</li>';
  await checkTxStatuses(view.transactions);

  const rrList = document.getElementById('indexer-rating-rights');
  rrList.innerHTML = view.stores.ratingRights.length
    ? view.stores.ratingRights.map(([outpoint, info]) => `<li><code>${outpoint}</code> → owner=${walletLabel(info.ownerPkh)} rates=${walletLabel(info.ratesPkh)}</li>`).join('')
    : '<li>Ninguna.</li>';

  const receiptsList = document.getElementById('indexer-receipts');
  receiptsList.innerHTML = view.stores.receipts.length
    ? view.stores.receipts.map(([txid, info]) => `<li><code>${short(txid)}</code> → owner=${walletLabel(info.receiptOwnerPkh)}</li>`).join('')
    : '<li>Ninguno.</li>';

  document.getElementById('indexer-store-file').textContent = `Persistido en: ${view.storeFile} (carpeta data/).`;
}

// --- Perfil de reputación (interpretación off-chain) ----------------------

function distributionBars(distribution) {
  const max = Math.max(...Object.values(distribution), 1);
  return Object.entries(distribution).map(([score, count]) => {
    const pct = Math.round((count / max) * 100);
    return `<div class="dist-row">
      <span class="dist-score">${score}</span>
      <div class="dist-track"><div class="dist-fill" style="width:${pct}%"></div></div>
      <span class="dist-count">${count}</span>
    </div>`;
  }).join('');
}

function listItems(items, labelOf) {
  return items.map((it) => `<li>${labelOf(it)} · tx=${short(it.txid)}</li>`).join('');
}

function renderReputation(profile, cardId = 'reputation-card') {
  const card = document.getElementById(cardId);
  const n = profile.ratingsReceived.length;
  const identity = profile.hasIdentity
    ? `<li>Identidad <strong>sí</strong> (tx=${short(profile.identityTxid)})</li>`
    : '<li>Identidad: <strong>no</strong> (solo wallet)</li>';

  card.innerHTML = `
    <div class="rep-summary">
      <div>
        <span class="rep-label">promedio recibido</span>
        <span class="rep-avg">${profile.avg ?? '—'}</span>
        <span class="rep-label">de ${n} calificación${n === 1 ? '' : 'es'}</span>
      </div>
      <div>
        <span class="rep-label">confianza recibida</span>
        <span class="rep-avg small">${profile.trustReceived.length}</span>
        <span class="rep-label">recibos confirmados</span>
        <span class="rep-avg small">${profile.confirmedReceipts.length}</span>
      </div>
    </div>
    <ul class="store-list">${identity}</ul>
    <h4>Distribución de puntajes recibidos (1–5)</h4>
    <div class="dist">${distributionBars(profile.distribution)}</div>
    ${n ? `<h4>Calificaciones recibidas (auditables)</h4><ul class="store-list">${listItems(profile.ratingsReceived, (r) => `puntaje ${r.score} · de ${walletLabel(r.raterPkh)}`)}</ul>` : ''}
    ${profile.ratingsIssued.length ? `<h4>Calificaciones emitidas</h4><ul class="store-list">${listItems(profile.ratingsIssued, (r) => `puntaje ${r.score} · a ${walletLabel(r.rateePkh)}`)}</ul>` : ''}
    ${profile.trustReceived.length ? `<h4>Quién confía en esta persona</h4><ul class="store-list">${listItems(profile.trustReceived, (t) => `confiar en ella: ${walletLabel(t.trusterPkh)}`)}</ul>` : ''}
    ${profile.confirmedReceipts.length ? `<h4>Interacciones confirmadas por plataforma</h4><ul class="store-list">${listItems(profile.confirmedReceipts, (c) => `recibo ${short(c.receiptTxid)}`)}</ul>` : ''}
  `;
}

// --- Acciones -------------------------------------------------------------

async function withDisabled(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
  }
}

// --- App de ejemplo (freelance) -------------------------------------------

const appState = { tasks: [] };

function appAppendRaw(text) {
  const el = document.getElementById('app-raw');
  el.appendChild(document.createElement('div'));
  el.lastChild.textContent = text.trimEnd();
  while (el.childElementCount >= 40) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

async function appCall(method, path, body) {
  appAppendRaw(`▶ ${method} ${path}\n${body ? JSON.stringify(body, null, 1) : ''}`);
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  appAppendRaw(`→ ${res.status} ${JSON.stringify(json)}`);
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

function appPicked() {
  const clientPkh = document.getElementById('app-client').value;
  const proPkh = document.getElementById('app-pro').value;
  const platformPkh = document.getElementById('app-platform').value;
  if (!clientPkh || !proPkh) throw new Error('Elegí cliente y profesional.');
  if (clientPkh === proPkh) throw new Error('El cliente y el profesional deben ser wallets distintas.');
  if (!platformPkh) throw new Error('Elegí una wallet para la plataforma.');
  return { clientPkh, proPkh, platformPkh };
}

function renderAppHistory() {
  const el = document.getElementById('app-history');
  el.innerHTML = appState.tasks.length
    ? appState.tasks.map((t, i) => `<li>
        <strong>#${i + 1}</strong> · ${t.taskType} ·
        recibo <code>${short(t.txid)}</code> ·
        ${t.confirmed ? 'confirmada ✓' : 'sin confirmar'} ·
        ${t.rated ? `calificada (${t.score}) ✓` : 'sin calificar'}
      </li>`).join('')
    : '<li>Sin tareas todavía.</li>';
}

document.addEventListener('click', (event) => {
  const tabButton = event.target.closest('button.tab');
  if (tabButton) {
    const tab = tabButton.dataset.tab;
    for (const btn of document.querySelectorAll('.tab')) {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('active', panel.id === `tab-${tab}`);
    }
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'create-wallet') {
    withDisabled(button, async () => {
      await api('/api/wallets', { method: 'POST' });
      await refreshAll();
      showSuccess('Wallet creada.');
    });
  }

  if (action === 'check-balance') {
    withDisabled(button, async () => {
      const pkh = button.dataset.pkh;
      const info = await api(`/api/wallets/${pkh}`);
      const badge = state.network === 'chipnet' ? 'tBCH' : 'de juguete';
      const li = button.closest('li');
      li.innerHTML = `<code>${short(pkh)}</code>
        <span class="wallet-balance">${formatSats(info.balanceSats)} ${badge}${info.hasIdentity ? ' · tiene identidad' : ''}</span>${
          state.network === 'chipnet'
            ? `<div class="wallet-address">${info.address}</div>`
            : ''
        }
        <button class="mini" data-action="check-balance" data-pkh="${pkh}">Saldo</button>`;
      showSuccess(`Wallet ${short(pkh)}: ${formatSats(info.balanceSats)} ${badge}.`);
    });
  }

  if (action === 'show-reputation') {
    withDisabled(button, async () => {
      const pkh = document.getElementById('reputation-pkh').value;
      if (!pkh) throw new Error('Elegí una wallet primero.');
      const profile = await api(`/api/reputation/${pkh}`);
      renderReputation(profile);
      showSuccess(`Perfil de ${short(pkh)} cargado.`);
    });
  }

  if (action === 'run-demo') {
    withDisabled(button, async () => {
      const summary = await api('/api/demo/run', { method: 'POST' });
      await refreshAll();
      showSuccess(`Demo lista: ${summary.facts} hechos (${summary.wallets} wallets, ${summary.ratings} calificaciones).`);
    });
  }

  if (action === 'send-foreign') {
    withDisabled(button, async () => {
      await api('/api/foreign-tx', { method: 'POST' });
      await loadIndexerView();
      showSuccess('Transacción desconocida enviada y descartada por el indexer.');
    });
  }

  if (action === 'mint-identity') {
    withDisabled(button, async () => {
      const ownerPkh = document.getElementById('identity-owner').value;
      if (!ownerPkh) throw new Error('Elegí una wallet primero.');
      await api('/api/identities', { method: 'POST', body: JSON.stringify({ ownerPkh }) });
      await loadFacts();
      showSuccess('Identidad minteada.');
    });
  }

  if (action === 'create-interaction') {
    withDisabled(button, async () => {
      const partyAPkh = document.getElementById('interaction-party-a').value;
      const partyBPkh = document.getElementById('interaction-party-b').value;
      const roleA = document.getElementById('interaction-role-a').value;
      const roleB = document.getElementById('interaction-role-b').value;
      if (!partyAPkh || !partyBPkh) throw new Error('Elegí ambas partes.');
      await api('/api/interactions', {
        method: 'POST',
        body: JSON.stringify({
          partyA: { pkh: partyAPkh, role: roleA },
          partyB: { pkh: partyBPkh, role: roleB },
        }),
      });
      await loadRatingRights();
      await loadInteractions();
      await loadFacts();
      showSuccess('Interacción registrada.');
    });
  }

  if (action === 'create-platform-confirmation') {
    withDisabled(button, async () => {
      const platformPkh = document.getElementById('platform-pkh').value;
      const receiptTxid = document.getElementById('platform-receipt').value;
      if (!platformPkh || !receiptTxid) throw new Error('Elegí plataforma e interacción.');
      await api('/api/platform-confirmations', {
        method: 'POST',
        body: JSON.stringify({ platformPkh, receiptTxid }),
      });
      await loadFacts();
      showSuccess('Interacción confirmada por la plataforma.');
    });
  }

  if (action === 'create-trust-link') {
    withDisabled(button, async () => {
      const trusterPkh = document.getElementById('trust-trust').value;
      const trustedPkh = document.getElementById('trust-trusted').value;
      if (!trusterPkh || !trustedPkh) throw new Error('Elegí ambas wallets.');
      if (trusterPkh === trustedPkh) throw new Error('Elegí wallets distintas para no autoconfianza.');
      await api('/api/trust-links', {
        method: 'POST',
        body: JSON.stringify({ trusterPkh, trustedPkh }),
      });
      await loadFacts();
      showSuccess('Confianza declarada.');
    });
  }

  if (action === 'reset-demo') {
    withDisabled(button, async () => {
      await api('/api/reset', { method: 'POST' });
      await refreshAll();
      showSuccess('Demo reiniciado. Podés volver a empezar.');
    });
  }

  if (action === 'issue-rating') {
    withDisabled(button, async () => {
      const outpoint = document.getElementById('rating-right').value;
      if (!outpoint) throw new Error('No hay Rating Right seleccionada.');
      const rr = state.ratingRights.find((r) => r.outpoint === outpoint);
      const score = Number(document.getElementById('rating-score').value);
      await api('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({ outpoint, raterPkh: rr.ownerPkh, score }),
      });
      await loadRatingRights();
      await loadFacts();
      showSuccess('Calificación emitida.');
    });
  }

  if (action === 'app-hire') {
    withDisabled(button, async () => {
      const { clientPkh, proPkh } = appPicked();
      const taskType = document.getElementById('app-task').value;
      const fact = await appCall('POST', '/api/interactions', {
        partyA: { pkh: clientPkh, role: 'cliente' },
        partyB: { pkh: proPkh, role: 'profesional' },
      });
      const clientRight = (fact.ratingRights ?? []).find((rr) => rr.ownerPkh === clientPkh);
      appState.tasks.push({
        txid: fact.txid,
        taskType,
        clientPkh,
        proPkh,
        clientRight: clientRight?.outpoint,
        confirmed: false,
        rated: false,
        score: null,
      });
      renderAppHistory();
      await loadRatingRights();
      await loadInteractions();
      await loadFacts();
      showSuccess(`Tarea «${taskType}» registrada on-chain (Recibo).`);
    });
  }

  if (action === 'app-confirm') {
    withDisabled(button, async () => {
      const { platformPkh } = appPicked();
      const pending = [...appState.tasks].reverse().find((t) => !t.confirmed);
      if (!pending) throw new Error('No hay ninguna tarea sin confirmar.');
      const conf = await appCall('POST', '/api/platform-confirmations', {
        platformPkh, receiptTxid: pending.txid,
      });
      pending.confirmed = true;
      renderAppHistory();
      await loadFacts();
      showSuccess(conf.valid ? 'Plataforma confirmó la tarea on-chain.' : 'Confirmación inválida en el índice.');
    });
  }

  if (action === 'app-rate') {
    withDisabled(button, async () => {
      const score = Number(document.getElementById('app-score').value);
      const pending = [...appState.tasks].reverse().find((t) => !t.rated);
      if (!pending) throw new Error('No hay ninguna tarea sin calificar.');
      if (!pending.clientRight) throw new Error('No se retuvo la Rating Right del cliente.');
      const rating = await appCall('POST', '/api/ratings', {
        outpoint: pending.clientRight, raterPkh: pending.clientPkh, score,
      });
      pending.rated = true;
      pending.score = score;
      renderAppHistory();
      await loadRatingRights();
      await loadFacts();
      showSuccess(`Calificación ${score}/5 asentada on-chain.`);
    });
  }

  if (action === 'app-reputation') {
    withDisabled(button, async () => {
      const { proPkh } = appPicked();
      const profile = await appCall('GET', `/api/reputation/${proPkh}`);
      renderReputation(profile, 'app-reputation-card');
      renderAppHistory();
      showSuccess(`Perfil del profesional cargado (avg=${profile.avg ?? '—'}).`);
    });
  }

  if (action === 'app-trust') {
    withDisabled(button, async () => {
      const { clientPkh, proPkh } = appPicked();
      await appCall('POST', '/api/trust-links', { trusterPkh: clientPkh, trustedPkh: proPkh });
      await loadFacts();
      showSuccess('Confianza declarada on-chain (cliente → profesional).');
    });
  }
});

document.getElementById('rating-score').addEventListener('input', (event) => {
  document.getElementById('rating-score-output').textContent = event.target.value;
});

document.getElementById('app-score').addEventListener('input', (event) => {
  document.getElementById('app-score-output').textContent = event.target.value;
});

async function boot() {
  const status = await api('/api/status');
  state.network = status.network;
  const tag = document.getElementById('network-tag');
  tag.textContent = status.network === 'chipnet'
    ? 'Red real Chipnet (tBCH) — las wallets son claves de prueba persistidas localmente; el indexer escucha transacciones reales.'
    : 'Red simulada (Mock) — sin fondos reales.';
}

boot().then(refreshAll);
