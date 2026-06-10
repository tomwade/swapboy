// Uniswap Trading API client, ported from the prior working integration
// (public-events/Uniswap Trading API/swap-widget). Differences here:
// requests go through the Vite dev proxy at /uniswap-api which injects
// x-api-key server-side — the key never reaches the client bundle.
import { isAddress, isHex, type Address, type Hex } from 'viem';
import { BASE_CHAIN_ID } from './types';

const API_BASE = '/uniswap-api';

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'x-universal-router-version': '2.0',
} as const;

export type ApprovalTx = {
  to: Address;
  from: Address;
  data: Hex;
  value: string;
  chainId: number;
  gasLimit?: string;
};

export type CheckApprovalResponse = {
  approval: ApprovalTx | null;
  cancel?: ApprovalTx | null;
};

export type ClassicQuote = {
  input: { token: string; amount: string };
  output: { token: string; amount: string };
  slippage: number;
  gasFee: string;
  gasFeeUSD?: string;
};

export type ClassicQuoteResponse = {
  routing: 'CLASSIC' | 'WRAP' | 'UNWRAP';
  quote: ClassicQuote;
  permitData: Record<string, unknown> | null;
  requestId?: string;
};

export type SwapTx = {
  to: Address;
  from: Address;
  data: Hex;
  value: string;
  chainId: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

export type SwapResponse = {
  swap: SwapTx;
  requestId?: string;
};

export class TradingApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = 'TradingApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? (data as { detail?: string }).detail
        : undefined;
    throw new TradingApiError(detail ?? `Trading API ${path} failed (${res.status})`, res.status, data);
  }
  return data as T;
}

export async function checkApproval(params: {
  walletAddress: Address;
  token: Address;
  amount: string;
}): Promise<CheckApprovalResponse> {
  return postJson<CheckApprovalResponse>('/check_approval', {
    ...params,
    chainId: BASE_CHAIN_ID,
  });
}

export async function getQuote(params: {
  swapper: Address;
  tokenIn: Address;
  tokenOut: Address;
  amount: string;
}): Promise<ClassicQuoteResponse> {
  // Skill rules: chain IDs as STRINGS. routingPreference must be BEST_PRICE or
  // FASTEST (the API rejects CLASSIC); on Base, BEST_PRICE returns CLASSIC routes.
  return postJson<ClassicQuoteResponse>('/quote', {
    swapper: params.swapper,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    tokenInChainId: String(BASE_CHAIN_ID),
    tokenOutChainId: String(BASE_CHAIN_ID),
    amount: params.amount,
    type: 'EXACT_INPUT',
    slippageTolerance: 0.5,
    routingPreference: 'BEST_PRICE',
    protocols: ['V2', 'V3', 'V4'],
  });
}

export async function getSwap(
  quoteResponse: ClassicQuoteResponse,
  permit2Signature?: Hex,
): Promise<SwapResponse> {
  // Skill rules: spread the quote into the body (never {quote: ...}); strip
  // permitData/permitTransaction; signature+permitData both or neither.
  const { permitData, ...cleanQuote } = quoteResponse as ClassicQuoteResponse & {
    permitTransaction?: unknown;
  };
  delete (cleanQuote as { permitTransaction?: unknown }).permitTransaction;

  const body: Record<string, unknown> = { ...cleanQuote };
  if (permit2Signature && permitData && typeof permitData === 'object') {
    body.signature = permit2Signature;
    body.permitData = permitData;
  }
  return postJson<SwapResponse>('/swap', body);
}

/** Empty calldata means the quote expired — re-quote and retry. */
export function validateSwapTx(tx: SwapTx): void {
  const data = tx?.data as string | undefined;
  if (!data || data === '' || data === '0x') {
    throw new TradingApiError('swap.data is empty — quote expired', 0, { expired: true });
  }
  if (!isHex(tx.data)) throw new Error('swap.data is not valid hex');
  if (!isAddress(tx.to)) throw new Error('swap.to is not a valid address');
  if (tx.value === undefined || tx.value === null) throw new Error('swap.value is missing');
}
