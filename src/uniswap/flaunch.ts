// Top Flaunch coins on Base by 24h volume, via the Flaunch data API
// (api-v2.flayerlabs.xyz). The API sends no CORS headers and sits behind
// Cloudflare bot protection, so requests go through the Vite proxy at
// /flaunch-api. Every coin trades against ETH (Uniswap v4 hooked pools);
// the Trading API routes them as CLASSIC swaps.
import type { Address } from 'viem';
import type { PoolInfo } from '../bridge/events';
import { WETH9_BASE } from './types';

const URL = '/flaunch-api/v1/base/coins/top?sort=volume&limit=';
const BYPASS_KEY: string | undefined = import.meta.env.VITE_FLAUNCH_BYPASS_KEY;

const CACHE_MS = 60_000;
let cache: { at: number; pools: PoolInfo[] } | null = null;

interface FlaunchCoin {
  tokenAddress: string;
  symbol: string;
  name: string;
  twentyFourHourVolumeUSD: string;
  marketCapUSD: string;
}

export async function fetchTopFlaunchCoins(count = 5): Promise<PoolInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.pools.slice(0, count);

  const res = await fetch(`${URL}${count}`, {
    headers: {
      Accept: 'application/json',
      ...(BYPASS_KEY ? { 'x-flaunch-swapboy-bypass': BYPASS_KEY } : {}),
    },
  });
  if (!res.ok) throw new Error(`Flaunch API ${res.status}`);
  const body = (await res.json()) as { data: FlaunchCoin[] };
  if (!Array.isArray(body.data) || body.data.length === 0) throw new Error('Flaunch API: no coins');

  const pools: PoolInfo[] = body.data.map((c) => ({
    poolAddress: c.tokenAddress,
    name: c.symbol,
    feeTier: '',
    volume24hUsd: Number(c.twentyFourHourVolumeUSD) || 0,
    tvlUsd: Number(c.marketCapUSD) || 0,
    token0: { address: c.tokenAddress as Address, symbol: c.symbol },
    token1: { address: WETH9_BASE, symbol: 'WETH' },
  }));
  cache = { at: Date.now(), pools };
  return pools.slice(0, count);
}
