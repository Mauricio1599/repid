// RepID — network-processor (Chipnet real, TASK-023)
//
// Por cada operación de red se ejecuta a este script como CHILD PROCESS
// aislado: una sola operación por proceso. La razón es el hallazgo C1 de
// la spike (TASK-022): @electrum-cash/network puede congelar el event loop
// del proceso completo al encolar más de un request sobre una conexión
// persistente. Encerrado en un child process, un cuelgue solo se cobra al
// hijo: el servidor lo mata y reintenta, y el proceso Express jamás se
// bloquea.
//
// Uso (invocado por el servidor):
//   node context/network-processor.mjs <op> <jsonArgs>
//
// Ops:
//   height             → altura actual
//   fee                → fee rate en sat/byte (estimatefee 1 bloque)
//   utxos {address}    → UTXOs (incluye tokens, formato cashscript)
//   broadcast {hex}    → txid (o el error del nodo real)
//   rawtx {txid}       → hex crudo de una transacción
//   status {txid}      → { confirmed, blockHeight } (mempool vs confirmada)
//
// Contrato de salida: una única línea JSON:
//   {"ok":true,"result":...} | {"ok":false,"error":"..."}
import { ElectrumClient } from '@electrum-cash/network';
import { cashAddressToLockingBytecode } from '@bitauth/libauth';
import { createHash } from 'node:crypto';

const HOST = process.env.REPID_CHIPNET_HOST || 'chipnet.imaginary.cash';
const [op, argsJson] = process.argv.slice(2);
const args = (() => {
  try { return JSON.parse(argsJson ?? '{}'); } catch { return {}; }
})();

const respond = (payload) => {
  console.log(JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  process.exit(0);
};
const fail = (error) => respond({ ok: false, error: String(error?.message ?? error).split('\n')[0] });

// Transforma token_data de electrum al shape que usa cashscript en
// Utxo.token (amount como bigint; acá viaja como string en JSON).
function parseToken(tokenData) {
  if (!tokenData) return undefined;
  const token = {
    category: tokenData.category,
    amount: tokenData.amount ?? '0',
  };
  if (tokenData.nft) {
    token.nft = {
      capability: tokenData.nft.capability,
      commitment: tokenData.nft.commitment ?? '',
    };
  }
  return token;
}

async function main() {
  const client = new ElectrumClient(`RepID-${process.pid}`, '1.4.1', HOST);
  let result = null;

  try {
    await client.connect();

    if (op === 'height') {
      const r = await client.request('blockchain.headers.subscribe');
      result = r?.height ?? null;
    } else if (op === 'fee') {
      const feeBchPerKb = await client.request('blockchain.estimatefee', args.blocks ?? 1);
      result = feeBchPerKb > 0
        ? Math.max(1, Math.round((Number(feeBchPerKb) * 100_000_000) / 1000))
        : 1;
    } else if (op === 'utxos') {
      // Las addresses del server son token-aware (prefijo cashaddr 'z'):
      // exigimos tokenSupport: true para que no falle la decodificación.
      // En esta versión de libauth, cashAddressToLockingBytecode devuelve
      // { bytecode, prefix, tokenSupport } — no los bytes directos.
      const decoded = cashAddressToLockingBytecode(args.address, true);
      const lockResult = decoded && typeof decoded === 'object' && decoded.bytecode instanceof Uint8Array
        ? decoded.bytecode
        : decoded;
      if (typeof lockResult === 'string') fail(`dirección inválida: ${lockResult}`);
      if (!(lockResult instanceof Uint8Array)) fail('dirección inválida');
      const digest = createHash('sha256').update(Buffer.from(lockResult)).digest();
      digest.reverse();
      const scriptHash = digest.toString('hex');
      const raw = await client.request('blockchain.scripthash.listunspent', scriptHash, 'include_tokens');
      result = raw.map((u) => ({
        txid: u.tx_hash,
        vout: u.tx_pos,
        satoshis: u.value,
        token: parseToken(u.token_data),
      }));
    } else if (op === 'broadcast') {
      result = await client.request('blockchain.transaction.broadcast', args.hex);
    } else if (op === 'rawtx') {
      result = await client.request('blockchain.transaction.get', args.txid);
    } else if (op === 'status') {
      const status = await client.request('blockchain.transaction.get_status', args.txid);
      result = status
        ? { confirmed: status.confirmed === true, blockHeight: status.height ?? null }
        : { confirmed: false, blockHeight: null };
    } else {
      fail(`op desconocida: ${op}`);
    }

    await client.disconnect().catch(() => {});
    respond({ ok: true, result });
  } catch (e) {
    fail(`[${op}] ${String(e?.message ?? e).slice(0, 200)}`);
  }
}

main();