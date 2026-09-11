// RepID — ChipnetNetworkProvider (TASK-023)
//
// Implementa la interfaz NetworkProvider de CashScript (la mínima que usa
// TransactionBuilder) virtualizando cada operación de red hacia un CHILD
// PROCESS aislado (context/network-processor.mjs). Así, el cuelgue
// intermitente del event loop que reproduce el stack electrum-cash
// (hallazgo C1, TASK-022) queda contenido: el servidor Express nunca se
// bloquea; si el worker cuelga se lo mata y se reintenta.
import { spawn } from 'node:child_process';
import { Network } from 'cashscript';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, '..', 'context', 'network-processor.mjs');
const OPERATION_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;

function runNetworkOp(op, args = {}) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      const child = spawn(process.execPath, [WORKER, op, JSON.stringify(args)], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        fail(new Error(`[chipnet] ${op}: el worker se colgó (${OPERATION_TIMEOUT_MS}ms) — red o lib inestable`));
      }, OPERATION_TIMEOUT_MS);

      const fail = (err) => {
        if (attempts < MAX_RETRIES) {
          attempts += 1;
          return attempt();
        }
        reject(err);
      };

      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          const reason = stderr.trim().slice(0, 200) || `exit ${code}`;
          return fail(new Error(`[chipnet] ${op}: ${reason}`));
        }
        const line = stdout.trim().split('\n').pop();
        try {
          const response = JSON.parse(line);
          if (response.ok) return resolve(response.result);
          return fail(new Error(`[chipnet] ${op}: ${response.error}`));
        } catch {
          return fail(new Error(`[chipnet] ${op}: salida no-JSON del worker`));
        }
      });
    };
    attempt();
  });
}

export class ChipnetNetworkProvider {
  constructor() {
    this.network = Network.CHIPNET;
  }

  getUtxos(address) {
    return runNetworkOp('utxos', { address }).then((utxos) => utxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      satoshis: BigInt(u.satoshis),
      token: u.token
        ? { ...u.token, amount: BigInt(u.token.amount) }
        : undefined,
    })));
  }

  getBlockHeight() {
    return runNetworkOp('height');
  }

  sendRawTransaction(txHex) {
    return runNetworkOp('broadcast', { hex: txHex });
  }

  getRawTransaction(txid) {
    return runNetworkOp('rawtx', { txid });
  }

  txStatus(txid) {
    return runNetworkOp('status', { txid });
  }
}

let cachedFeeRate = null;
let cachedFeeAt = 0;

export async function chipnetFeeRate() {
  if (cachedFeeRate !== null && Date.now() - cachedFeeAt < 60_000) return cachedFeeRate;
  cachedFeeRate = await runNetworkOp('fee');
  cachedFeeAt = Date.now();
  return cachedFeeRate;
}