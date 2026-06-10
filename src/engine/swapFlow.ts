// The nurse's "SWAP TOKENS" flow: an explicit FSM driven by the game loop,
// with all async work delegated to the bridge via engine.emit/dispatch.
import { formatUnits } from 'viem';
import type { Hex } from 'viem';
import type { GameEngine } from './engine';
import type { PoolInfo, ReactToEngine, TokenMeta, TxRequest, TxTag } from '../bridge/events';
import { DialogBox } from './dialog';
import { Menu } from './menu';
import { AmountEntry, trimAmount } from './amount';
import { drawWindow } from './window';
import { FONT } from '../gfx/assets';
import { formatUsdCompact } from '../uniswap/pools';
import { displaySymbol, toTradeAddress } from '../uniswap/types';
import { music } from '../audio/music';
import { sfxDenied, sfxItemGet, ITEM_GET_SECONDS } from '../audio/sfx';
import dialogData from '../data/dialog.json';

type State =
  | 'fetch_pools'
  | 'pool_list'
  | 'direction'
  | 'fetch_meta'
  | 'amount'
  | 'quoting'
  | 'confirm'
  | 'requote_before_swap'
  | 'check_approval'
  | 'tx_wallet'
  | 'tx_mining'
  | 'permit'
  | 'build'
  | 'build_requote'
  | 'swap_wallet'
  | 'swap_mining'
  | 'result';

const QUOTE_REFRESH_FRAMES = 20 * 60; // ~20s
const QUOTE_STALE_FRAMES = 50 * 60; // ~50s
const ETH_GAS_RESERVE = 500_000_000_000_000n; // 0.0005 ETH headroom

function shortHash(h: string): string {
  return `${h.slice(0, 8)}..${h.slice(-4)}`;
}

export class SwapFlow {
  finished = false;

  private state: State = 'fetch_pools';
  private dialog = new DialogBox();
  private menu: Menu | null = null;
  private amountEntry: AmountEntry | null = null;

  private pools: PoolInfo[] = [];
  private pool: PoolInfo | null = null;
  private sellSide: 0 | 1 = 0;
  private sellMeta: TokenMeta | null = null;
  private buyMeta: TokenMeta | null = null;
  private amount = 0n;

  private quote: unknown = null;
  private outFormatted = '';
  private gasUsd: string | null = null;
  private permitData: Record<string, unknown> | null = null;
  private signature: Hex | undefined;
  private framesSinceQuote = 0;
  private requoteRetried = false;
  private txQueue: { tag: TxTag; tx: TxRequest }[] = [];

  private expect = 0;

  constructor(private engine: GameEngine) {
    this.dialog.openWaiting(dialogData.swap_fetch_pools.pages[0]!);
    engine.emit({ type: 'FETCH_POOLS' });
  }

  private emitSeq(make: (seq: number) => Parameters<GameEngine['emit']>[0]): void {
    this.expect = this.engine.nextSeq();
    this.engine.emit(make(this.expect));
  }

  private fail(pages: string[], backTo: 'confirm' | 'exit'): void {
    sfxDenied();
    this.menu = null;
    this.state = 'result';
    this.resultBackTo = backTo;
    this.dialog.open(pages);
  }

  private resultBackTo: 'confirm' | 'exit' = 'exit';

  // ---------------------------------------------------------------- actions

  onAction(a: ReactToEngine): void {
    if ('seq' in a && a.seq !== this.expect) return; // stale response

    switch (a.type) {
      case 'POOLS': {
        if (this.state !== 'fetch_pools') return;
        this.pools = a.pools;
        this.dialog.close();
        this.state = 'pool_list';
        this.menu = new Menu({
          items: [
            ...a.pools.map((p) => ({
              label: p.name.slice(0, 16),
              detail: `${formatUsdCompact(p.volume24hUsd)} VOL`,
            })),
            { label: 'CANCEL' },
          ],
          tx: 0,
          ty: 0,
          tw: 20,
        });
        return;
      }
      case 'POOLS_FAILED': {
        this.fail(dialogData.swap_pools_failed.pages, 'exit');
        return;
      }
      case 'TOKEN_META': {
        if (this.state !== 'fetch_meta') return;
        this.sellMeta = a.sell;
        this.buyMeta = a.buy;
        const balance = BigInt(a.sell.balance);
        const max = a.sell.isNative
          ? balance > ETH_GAS_RESERVE
            ? balance - ETH_GAS_RESERVE
            : 0n
          : balance;
        this.amountEntry = new AmountEntry({
          decimals: a.sell.decimals,
          max,
          balance,
          symbol: displaySymbol(a.sell.symbol).slice(0, 6),
        });
        this.state = 'amount';
        this.dialog.open(dialogData.swap_amount.pages, { holdAtEnd: true });
        return;
      }
      case 'TOKEN_META_FAILED': {
        this.fail([a.message.slice(0, 70)], 'exit');
        return;
      }
      case 'QUOTE': {
        this.quote = a.quote;
        this.outFormatted = a.outFormatted;
        this.gasUsd = a.gasUsd;
        this.permitData = a.permitData;
        this.framesSinceQuote = 0;
        if (this.state === 'quoting') {
          this.state = 'confirm';
          this.dialog.open(['Deal?'], { holdAtEnd: true });
          this.menu = new Menu({ items: [{ label: 'YES' }, { label: 'NO' }], tx: 14, ty: 5 });
        } else if (this.state === 'requote_before_swap') {
          this.proceedFromConfirm();
        } else if (this.state === 'build_requote') {
          this.emitBuild();
        }
        return;
      }
      case 'QUOTE_FAILED': {
        if (this.state === 'confirm') return; // background refresh failed; keep old quote
        this.fail(dialogData.swap_quote_failed.pages, 'exit');
        return;
      }
      case 'APPROVAL_STATUS': {
        if (this.state !== 'check_approval') return;
        this.txQueue = [];
        if (a.cancel) this.txQueue.push({ tag: 'cancel', tx: a.cancel });
        if (a.approval) this.txQueue.push({ tag: 'approval', tx: a.approval });
        this.nextTxOrPermit();
        return;
      }
      case 'APPROVAL_FAILED': {
        this.fail([a.message.slice(0, 70)], 'confirm');
        return;
      }
      case 'PERMIT_SIGNED': {
        if (this.state !== 'permit') return;
        this.signature = a.signature;
        this.emitBuild();
        return;
      }
      case 'PERMIT_REJECTED': {
        this.backToConfirm(dialogData.swap_rejected.pages);
        return;
      }
      case 'SWAP_TX': {
        if (this.state !== 'build') return;
        this.state = 'swap_wallet';
        this.dialog.openWaiting(dialogData.swap_wallet.pages[0]!);
        this.emitSeq((seq) => ({ type: 'SEND_TX', seq, tag: 'swap', tx: a.tx }));
        return;
      }
      case 'SWAP_TX_FAILED': {
        if (a.expired && !this.requoteRetried) {
          this.requoteRetried = true;
          this.state = 'build_requote';
          this.dialog.openWaiting(dialogData.swap_quoting.pages[0]!);
          this.emitQuote();
          return;
        }
        this.fail([a.message.slice(0, 70)], 'confirm');
        return;
      }
      case 'TX_SENT': {
        if (a.tag === 'swap') {
          this.state = 'swap_mining';
          this.dialog.openWaiting(dialogData.swap_mining.pages[0]!);
        } else {
          this.state = 'tx_mining';
          this.dialog.openWaiting(dialogData.swap_approval.pages[0]!);
        }
        return;
      }
      case 'TX_CONFIRMED': {
        if (a.tag === 'swap') {
          if (a.ok) {
            music.duck(ITEM_GET_SECONDS + 1);
            sfxItemGet();
            this.menu = null;
            this.state = 'result';
            this.resultBackTo = 'exit';
            const sym = displaySymbol(this.buyMeta?.symbol ?? '');
            this.dialog.open([
              `You got ${this.outFormatted} ${sym}!`,
              `TX ${shortHash(a.hash)}`,
              dialogData.swap_exit.pages[0]!,
            ]);
          } else {
            this.fail(dialogData.swap_reverted.pages, 'exit');
          }
          return;
        }
        if (!a.ok) {
          this.fail(dialogData.swap_reverted.pages, 'confirm');
          return;
        }
        this.nextTxOrPermit();
        return;
      }
      case 'TX_REJECTED': {
        this.backToConfirm(dialogData.swap_rejected.pages);
        return;
      }
      case 'TX_FAILED': {
        this.fail([a.message.slice(0, 70)], a.tag === 'swap' ? 'exit' : 'confirm');
        return;
      }
      default:
        return;
    }
  }

  // ----------------------------------------------------------------- update

  update(): void {
    const input = this.engine.input;

    if (this.state === 'confirm') {
      this.framesSinceQuote++;
      if (this.framesSinceQuote === QUOTE_REFRESH_FRAMES) this.emitQuote();
    }

    switch (this.state) {
      case 'pool_list': {
        const res = this.menu!.update(input);
        if (!res) return;
        if (res.kind === 'cancel' || res.index >= this.pools.length) {
          this.exit();
          return;
        }
        this.pool = this.pools[res.index]!;
        this.menu = new Menu({
          items: [
            { label: displaySymbol(this.pool.token0.symbol).slice(0, 8) },
            { label: displaySymbol(this.pool.token1.symbol).slice(0, 8) },
            { label: 'CANCEL' },
          ],
          tx: 12,
          ty: 3,
        });
        this.state = 'direction';
        this.dialog.open(dialogData.swap_direction.pages, { holdAtEnd: true });
        return;
      }
      case 'direction': {
        if (this.dialog.active) this.dialog.update(input);
        const res = this.menu!.update(input);
        if (!res) return;
        if (res.kind === 'cancel' || res.index === 2) {
          this.reopenPoolList();
          return;
        }
        this.sellSide = res.index as 0 | 1;
        this.menu = null;
        this.state = 'fetch_meta';
        this.dialog.openWaiting('Checking the bag');
        const pool = this.pool!;
        const sell = this.sellSide === 0 ? pool.token0 : pool.token1;
        const buy = this.sellSide === 0 ? pool.token1 : pool.token0;
        this.emitSeq((seq) => ({ type: 'FETCH_TOKEN_META', seq, sell, buy }));
        return;
      }
      case 'amount': {
        if (this.dialog.active) this.dialog.update(input);
        const res = this.amountEntry!.update(input);
        if (!res) return;
        if (res === 'cancel') {
          this.amountEntry = null;
          this.reopenPoolList();
          return;
        }
        this.amount = this.amountEntry!.value;
        this.amountEntry = null;
        this.state = 'quoting';
        this.requoteRetried = false;
        this.signature = undefined;
        this.dialog.openWaiting(dialogData.swap_quoting.pages[0]!);
        this.emitQuote();
        return;
      }
      case 'confirm': {
        if (this.dialog.active) this.dialog.update(input);
        const res = this.menu!.update(input);
        if (!res) return;
        if (res.kind === 'cancel' || res.index === 1) {
          this.exitWithGoodbye();
          return;
        }
        this.menu = null;
        if (this.framesSinceQuote > QUOTE_STALE_FRAMES) {
          this.state = 'requote_before_swap';
          this.dialog.openWaiting(dialogData.swap_quoting.pages[0]!);
          this.emitQuote();
          return;
        }
        this.proceedFromConfirm();
        return;
      }
      case 'result': {
        this.dialog.update(input);
        if (this.dialog.done) {
          this.dialog.close();
          if (this.resultBackTo === 'confirm' && this.quote !== null) {
            this.state = 'confirm';
            this.dialog.open(['Deal?'], { holdAtEnd: true });
            this.menu = new Menu({ items: [{ label: 'YES' }, { label: 'NO' }], tx: 14, ty: 5 });
          } else {
            this.exit();
          }
        }
        return;
      }
      default:
        return;
    }
  }

  // ------------------------------------------------------------ transitions

  private reopenPoolList(): void {
    this.menu = new Menu({
      items: [
        ...this.pools.map((p) => ({
          label: p.name.slice(0, 16),
          detail: `${formatUsdCompact(p.volume24hUsd)} VOL`,
        })),
        { label: 'CANCEL' },
      ],
      tx: 0,
      ty: 0,
      tw: 20,
    });
    this.dialog.close();
    this.state = 'pool_list';
  }

  private emitQuote(): void {
    const pool = this.pool!;
    const sell = this.sellSide === 0 ? pool.token0 : pool.token1;
    const buy = this.sellSide === 0 ? pool.token1 : pool.token0;
    this.emitSeq((seq) => ({
      type: 'FETCH_QUOTE',
      seq,
      params: {
        tokenIn: toTradeAddress(sell.address),
        tokenOut: toTradeAddress(buy.address),
        amount: this.amount.toString(),
        outDecimals: this.buyMeta?.decimals ?? 18,
      },
    }));
  }

  private proceedFromConfirm(): void {
    if (this.sellMeta!.isNative) {
      this.permitOrBuild();
      return;
    }
    this.state = 'check_approval';
    this.dialog.openWaiting(dialogData.swap_approval.pages[0]!);
    this.emitSeq((seq) => ({
      type: 'CHECK_APPROVAL',
      seq,
      token: this.sellMeta!.address,
      amount: this.amount.toString(),
    }));
  }

  private nextTxOrPermit(): void {
    const next = this.txQueue.shift();
    if (next) {
      this.state = 'tx_wallet';
      this.dialog.openWaiting(dialogData.swap_wallet.pages[0]!);
      this.emitSeq((seq) => ({ type: 'SEND_TX', seq, tag: next.tag, tx: next.tx }));
      return;
    }
    this.permitOrBuild();
  }

  private permitOrBuild(): void {
    if (this.permitData) {
      this.state = 'permit';
      this.dialog.openWaiting(dialogData.swap_permit.pages[0]!);
      this.emitSeq((seq) => ({ type: 'SIGN_PERMIT', seq, permitData: this.permitData! }));
      return;
    }
    this.emitBuild();
  }

  private emitBuild(): void {
    this.state = 'build';
    this.dialog.openWaiting(dialogData.swap_quoting.pages[0]!);
    this.emitSeq((seq) => ({
      type: 'BUILD_SWAP',
      seq,
      quote: this.quote,
      signature: this.signature,
      permitData: this.permitData,
    }));
  }

  private backToConfirm(pages: string[]): void {
    sfxDenied();
    this.menu = null;
    this.state = 'result';
    this.resultBackTo = 'confirm';
    this.dialog.open(pages);
  }

  private exitWithGoodbye(): void {
    this.menu = null;
    this.state = 'result';
    this.resultBackTo = 'exit';
    this.dialog.open(dialogData.swap_exit.pages);
  }

  private exit(): void {
    this.dialog.close();
    this.menu = null;
    this.finished = true;
  }

  // ------------------------------------------------------------------ draw

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === 'confirm' || this.state === 'requote_before_swap') {
      this.drawConfirmPanel(ctx);
    }
    this.dialog.draw(ctx, this.engine.frame);
    this.menu?.draw(ctx);
    this.amountEntry?.draw(ctx);
  }

  private drawConfirmPanel(ctx: CanvasRenderingContext2D): void {
    const font = FONT();
    const sellSym = displaySymbol(this.sellMeta?.symbol ?? '');
    const buySym = displaySymbol(this.buyMeta?.symbol ?? '');
    const payStr = `${trimAmount(formatUnits(this.amount, this.sellMeta?.decimals ?? 18), 7)} ${sellSym}`;
    const getStr = `${trimAmount(this.outFormatted, 7)} ${buySym}`;
    drawWindow(ctx, 0, 3, 14, 8);
    font.drawTile(ctx, 'PAY', 1, 4);
    font.drawTile(ctx, payStr.slice(0, 12), 1, 5);
    font.drawTile(ctx, 'GET~', 1, 7);
    font.drawTile(ctx, getStr.slice(0, 12), 1, 8);
    font.drawTile(ctx, `FEE $${this.gasUsd ?? '?'}`.slice(0, 12), 1, 9);
  }
}
