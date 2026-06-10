import type { Address } from 'viem';

export const BASE_CHAIN_ID = 8453;

export const NATIVE_ETH = '0x0000000000000000000000000000000000000000' as Address;
export const WETH9_BASE = '0x4200000000000000000000000000000000000006' as Address;

// Recorded for a future direct-contract SwapProvider fallback (not used by the
// Trading API path). Addresses verified against Uniswap/docs Base-Deployments.md.
export const QUOTER_V2_BASE = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as Address;
export const SWAP_ROUTER_02_BASE = '0x2626664c2603336E57B271c5C0b26F421741e481' as Address;
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address;

/** WETH is displayed and transacted as native ETH (Trading API wraps natively). */
export function toTradeAddress(addr: Address): Address {
  return addr.toLowerCase() === WETH9_BASE.toLowerCase() ? NATIVE_ETH : addr;
}

export function displaySymbol(symbol: string): string {
  return symbol.toUpperCase() === 'WETH' ? 'ETH' : symbol;
}
