// Imperative bridge between the game engine and the async outside world.
// Uses wagmi/actions (stable surface) rather than React hooks — the engine
// emits requests, this module performs them and dispatches results back.
import {
  connect,
  getAccount,
  getBalance,
  getConnectors,
  readContract,
  sendTransaction,
  signTypedData,
  waitForTransactionReceipt,
} from 'wagmi/actions';
import { erc20Abi, formatUnits, type Address, type TypedDataDomain } from 'viem';
import { base } from 'wagmi/chains';
import { config } from '../wagmi';
import type { EngineToReact, PoolToken, TokenMeta } from './events';
import type { GameEngine } from '../engine/engine';
import { fetchTopPools } from '../uniswap/pools';
import {
  checkApproval,
  getQuote,
  getSwap,
  validateSwapTx,
  TradingApiError,
  type ClassicQuoteResponse,
} from '../uniswap/tradingApi';
import { NATIVE_ETH, WETH9_BASE } from '../uniswap/types';
import { trimAmount } from '../engine/amount';

function isUserRejection(err: unknown): boolean {
  let c: unknown = err;
  while (c && typeof c === 'object') {
    const e = c as { code?: number; name?: string; cause?: unknown };
    if (e.code === 4001 || e.name === 'UserRejectedRequestError') return true;
    c = e.cause;
  }
  return false;
}

function message(err: unknown): string {
  if (err instanceof TradingApiError) return err.message;
  if (err instanceof Error) {
    const short = (err as { shortMessage?: string }).shortMessage;
    return short ?? err.message;
  }
  return String(err);
}

function requireAddress(): Address {
  const address = getAccount(config).address;
  if (!address) throw new Error('Wallet not connected');
  return address;
}

async function tokenMeta(token: PoolToken, owner: Address): Promise<TokenMeta> {
  if (token.address.toLowerCase() === WETH9_BASE.toLowerCase()) {
    const bal = await getBalance(config, { address: owner, chainId: base.id });
    return {
      address: NATIVE_ETH,
      symbol: 'ETH',
      decimals: 18,
      balance: bal.value.toString(),
      isNative: true,
    };
  }
  const [decimals, symbol, balance] = await Promise.all([
    readContract(config, { abi: erc20Abi, address: token.address, functionName: 'decimals', chainId: base.id }),
    readContract(config, { abi: erc20Abi, address: token.address, functionName: 'symbol', chainId: base.id }),
    readContract(config, {
      abi: erc20Abi,
      address: token.address,
      functionName: 'balanceOf',
      args: [owner],
      chainId: base.id,
    }),
  ]);
  return {
    address: token.address,
    symbol,
    decimals: Number(decimals),
    balance: (balance as bigint).toString(),
    isNative: false,
  };
}

export function attachWalletBridge(engine: GameEngine): () => void {
  const handle = async (e: EngineToReact): Promise<void> => {
    switch (e.type) {
      case 'GET_CONNECTORS': {
        // EIP-6963 announcements can land moments after page load.
        let list = getConnectors(config);
        if (list.length === 0) {
          await new Promise((r) => setTimeout(r, 400));
          list = getConnectors(config);
        }
        engine.dispatch({
          type: 'CONNECTORS',
          list: list.map((c) => ({ uid: c.uid, name: c.name })),
        });
        return;
      }
      case 'CONNECT': {
        try {
          const connector = getConnectors(config).find((c) => c.uid === e.connectorUid);
          if (!connector) throw new Error('Wallet not found');
          const res = await connect(config, { connector, chainId: base.id });
          const address = res.accounts[0];
          if (!address) throw new Error('No account');
          engine.dispatch({ type: 'CONNECTED', address });
        } catch (err) {
          // A connector that is already connected counts as success.
          const existing = getAccount(config).address;
          if (existing) {
            engine.dispatch({ type: 'CONNECTED', address: existing });
            return;
          }
          console.error('[bridge] connect failed:', err);
          engine.dispatch({ type: 'CONNECT_FAILED', message: message(err) });
        }
        return;
      }
      case 'FETCH_POOLS': {
        try {
          engine.dispatch({ type: 'POOLS', pools: await fetchTopPools(5) });
        } catch (err) {
          engine.dispatch({ type: 'POOLS_FAILED', message: message(err) });
        }
        return;
      }
      case 'FETCH_TOKEN_META': {
        try {
          const owner = requireAddress();
          const [sell, buy] = await Promise.all([tokenMeta(e.sell, owner), tokenMeta(e.buy, owner)]);
          engine.dispatch({ type: 'TOKEN_META', seq: e.seq, sell, buy });
        } catch (err) {
          engine.dispatch({ type: 'TOKEN_META_FAILED', seq: e.seq, message: message(err) });
        }
        return;
      }
      case 'FETCH_QUOTE': {
        try {
          const swapper = requireAddress();
          const quote = await getQuote({
            swapper,
            tokenIn: e.params.tokenIn,
            tokenOut: e.params.tokenOut,
            amount: e.params.amount,
          });
          const outRaw = BigInt(quote.quote.output.amount);
          engine.dispatch({
            type: 'QUOTE',
            seq: e.seq,
            quote,
            outFormatted: trimAmount(formatUnits(outRaw, e.params.outDecimals)),
            gasUsd: quote.quote.gasFeeUSD
              ? Number(quote.quote.gasFeeUSD) < 0.005
                ? '<0.01'
                : Number(quote.quote.gasFeeUSD).toFixed(2)
              : null,
            permitData: quote.permitData,
          });
        } catch (err) {
          engine.dispatch({ type: 'QUOTE_FAILED', seq: e.seq, message: message(err) });
        }
        return;
      }
      case 'CHECK_APPROVAL': {
        try {
          const walletAddress = requireAddress();
          const res = await checkApproval({ walletAddress, token: e.token, amount: e.amount });
          engine.dispatch({
            type: 'APPROVAL_STATUS',
            seq: e.seq,
            cancel: res.cancel ?? null,
            approval: res.approval ?? null,
          });
        } catch (err) {
          engine.dispatch({ type: 'APPROVAL_FAILED', seq: e.seq, message: message(err) });
        }
        return;
      }
      case 'SIGN_PERMIT': {
        try {
          const pd = e.permitData as {
            domain: TypedDataDomain;
            types: Record<string, { name: string; type: string }[]>;
            values: Record<string, unknown>;
            primaryType?: string;
          };
          const signature = await signTypedData(config, {
            domain: pd.domain,
            types: pd.types,
            primaryType: pd.primaryType ?? 'PermitSingle',
            message: pd.values,
          });
          engine.dispatch({ type: 'PERMIT_SIGNED', seq: e.seq, signature });
        } catch (err) {
          if (isUserRejection(err)) engine.dispatch({ type: 'PERMIT_REJECTED', seq: e.seq });
          else engine.dispatch({ type: 'PERMIT_REJECTED', seq: e.seq });
        }
        return;
      }
      case 'BUILD_SWAP': {
        try {
          const res = await getSwap(e.quote as ClassicQuoteResponse, e.signature);
          validateSwapTx(res.swap);
          engine.dispatch({ type: 'SWAP_TX', seq: e.seq, tx: res.swap });
        } catch (err) {
          const expired =
            err instanceof TradingApiError &&
            typeof err.detail === 'object' &&
            err.detail !== null &&
            (err.detail as { expired?: boolean }).expired === true;
          engine.dispatch({ type: 'SWAP_TX_FAILED', seq: e.seq, message: message(err), expired });
        }
        return;
      }
      case 'SEND_TX': {
        try {
          const hash = await sendTransaction(config, {
            to: e.tx.to,
            data: e.tx.data,
            value: BigInt(e.tx.value || '0'),
            gas: e.tx.gasLimit ? BigInt(e.tx.gasLimit) : undefined,
            chainId: base.id,
          });
          engine.dispatch({ type: 'TX_SENT', seq: e.seq, tag: e.tag, hash });
          const receipt = await waitForTransactionReceipt(config, { hash, chainId: base.id });
          engine.dispatch({
            type: 'TX_CONFIRMED',
            seq: e.seq,
            tag: e.tag,
            ok: receipt.status === 'success',
            hash,
          });
        } catch (err) {
          if (isUserRejection(err)) {
            engine.dispatch({ type: 'TX_REJECTED', seq: e.seq, tag: e.tag });
          } else {
            engine.dispatch({ type: 'TX_FAILED', seq: e.seq, tag: e.tag, message: message(err) });
          }
        }
        return;
      }
      default:
        return;
    }
  };

  return engine.onEmit((e) => {
    void handle(e);
  });
}
