import type { Address, Hex } from 'viem';

// The contract between the synchronous game engine and the async outside world
// (wagmi wallet actions + HTTP). Two one-way channels:
//   engine.emit(EngineToReact)  -> handled by bridge/walletBridge.ts
//   engine.dispatch(ReactToEngine) -> queued, drained at the start of the next tick
// Requests that can race carry a `seq`; stale responses are dropped by the scene.

export type TxTag = 'cancel' | 'approval' | 'swap';

export interface TxRequest {
  to: Address;
  data: Hex;
  value: string;
  chainId?: number;
  gasLimit?: string;
}

export interface PoolToken {
  address: Address;
  symbol: string;
}

export interface PoolInfo {
  poolAddress: string;
  /** e.g. "WETH/USDC 0.05%" */
  name: string;
  /** Stat shown next to the name in the pool list; defaults to 24h volume. */
  detail?: string;
  feeTier: string;
  volume24hUsd: number;
  tvlUsd: number;
  token0: PoolToken;
  token1: PoolToken;
}

export interface TokenMeta {
  /** Zero address for native ETH. */
  address: Address;
  symbol: string;
  decimals: number;
  /** Base units as decimal string. */
  balance: string;
  isNative: boolean;
}

export interface QuoteParams {
  /** Zero address = native ETH. The bridge fills in the connected swapper. */
  tokenIn: Address;
  tokenOut: Address;
  /** Base units, decimal string. */
  amount: string;
  /** Decimals of tokenOut, for formatting the quoted output. */
  outDecimals: number;
}

export type EngineToReact =
  | { type: 'GET_CONNECTORS' }
  | { type: 'CONNECT'; connectorUid: string }
  | { type: 'FETCH_POOLS' }
  | { type: 'FETCH_TOKEN_META'; seq: number; sell: PoolToken; buy: PoolToken }
  | { type: 'FETCH_QUOTE'; seq: number; params: QuoteParams }
  | { type: 'CHECK_APPROVAL'; seq: number; token: Address; amount: string }
  | { type: 'SIGN_PERMIT'; seq: number; permitData: Record<string, unknown> }
  | {
      type: 'BUILD_SWAP';
      seq: number;
      quote: unknown;
      signature?: Hex;
      permitData?: Record<string, unknown> | null;
    }
  | { type: 'SEND_TX'; seq: number; tag: TxTag; tx: TxRequest };

export type ReactToEngine =
  | { type: 'CONNECTORS'; list: { uid: string; name: string }[] }
  | { type: 'CONNECTED'; address: Address }
  | { type: 'CONNECT_FAILED'; message: string }
  | { type: 'POOLS'; pools: PoolInfo[] }
  | { type: 'POOLS_FAILED'; message: string }
  | { type: 'TOKEN_META'; seq: number; sell: TokenMeta; buy: TokenMeta }
  | { type: 'TOKEN_META_FAILED'; seq: number; message: string }
  | {
      type: 'QUOTE';
      seq: number;
      quote: unknown;
      /** Human-formatted output amount, e.g. "24.3102". */
      outFormatted: string;
      gasUsd: string | null;
      permitData: Record<string, unknown> | null;
    }
  | { type: 'QUOTE_FAILED'; seq: number; message: string }
  | { type: 'APPROVAL_STATUS'; seq: number; cancel: TxRequest | null; approval: TxRequest | null }
  | { type: 'APPROVAL_FAILED'; seq: number; message: string }
  | { type: 'PERMIT_SIGNED'; seq: number; signature: Hex }
  | { type: 'PERMIT_REJECTED'; seq: number }
  | { type: 'SWAP_TX'; seq: number; tx: TxRequest }
  | { type: 'SWAP_TX_FAILED'; seq: number; message: string; expired: boolean }
  | { type: 'TX_SENT'; seq: number; tag: TxTag; hash: Hex }
  | { type: 'TX_CONFIRMED'; seq: number; tag: TxTag; ok: boolean; hash: Hex }
  | { type: 'TX_REJECTED'; seq: number; tag: TxTag }
  | { type: 'TX_FAILED'; seq: number; tag: TxTag; message: string };
