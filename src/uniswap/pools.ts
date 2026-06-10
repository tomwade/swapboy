// Top Uniswap pools on Base by 24h volume, via GeckoTerminal's keyless public
// API (CORS *). Cached for 60s — well under the 30 calls/min limit.
import type { Address } from 'viem';
import type { PoolInfo } from '../bridge/events';

const URL =
  'https://api.geckoterminal.com/api/v2/networks/base/dexes/uniswap-v3-base/pools' +
  '?sort=h24_volume_usd_desc&include=base_token,quote_token&page=1';

const CACHE_MS = 60_000;
let cache: { at: number; pools: PoolInfo[] } | null = null;

interface GtToken {
  id: string;
  attributes: { address: string; symbol: string };
}

interface GtPool {
  id: string;
  attributes: {
    name: string;
    address: string;
    volume_usd: { h24: string };
    reserve_in_usd: string;
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
  };
}

export async function fetchTopPools(count = 5): Promise<PoolInfo[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.pools.slice(0, count);

  const res = await fetch(URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const body = (await res.json()) as { data: GtPool[]; included: GtToken[] };

  const tokens = new Map(body.included.map((t) => [t.id, t.attributes]));
  const pools: PoolInfo[] = [];
  for (const p of body.data) {
    const base = tokens.get(p.relationships.base_token.data.id);
    const quote = tokens.get(p.relationships.quote_token.data.id);
    if (!base || !quote) continue;
    const feeMatch = p.attributes.name.match(/([\d.]+)%/);
    pools.push({
      poolAddress: p.attributes.address,
      name: `${base.symbol}/${quote.symbol} ${feeMatch?.[0] ?? ''}`.trim(),
      feeTier: feeMatch?.[0] ?? '?',
      volume24hUsd: Number(p.attributes.volume_usd.h24) || 0,
      tvlUsd: Number(p.attributes.reserve_in_usd) || 0,
      token0: { address: base.address as Address, symbol: base.symbol },
      token1: { address: quote.address as Address, symbol: quote.symbol },
    });
    if (pools.length >= 20) break;
  }
  cache = { at: Date.now(), pools };
  return pools.slice(0, count);
}

export function formatUsdCompact(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
