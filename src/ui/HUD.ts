import type { BlackMarket, UpgradeItem } from '../game/BlackMarket';
import type { Economy } from '../game/Economy';
import type { HeatSystem } from '../game/HeatSystem';
import type { EventEngine } from '../game/EventEngine';

/**
 * Full cyberpunk HUD:
 *  - Speedometer (bottom-right)
 *  - Mode badge
 *  - Heat bar (top, animated)
 *  - Dual currency counters (bottom-left corner)
 *  - Contextual prompt
 *  - Shop overlay (opened via shop button)
 *  - Event notification banner
 *  - Mute toggle
 */
export class HUD {
  private speedVal: HTMLDivElement;
  private modeBadge: HTMLDivElement;
  private prompt: HTMLDivElement;
  private muteBtn: HTMLDivElement;
  private lastSpeed = -1;
  private promptText = '';

  private heatFill: HTMLDivElement;
  private heatLabel: HTMLDivElement;
  private heatBar: HTMLDivElement;

  private cashEl: HTMLDivElement;
  private dirtyEl: HTMLDivElement;

  private eventBanner: HTMLDivElement;
  private eventTitle: HTMLDivElement;
  private eventDesc: HTMLDivElement;
  private eventTimer: HTMLDivElement;
  private eventAccept: HTMLButtonElement;
  private eventDecline: HTMLButtonElement;

  private shopOverlay: HTMLDivElement;
  private shopOpen = false;

  onToggleMute: (() => boolean) | null = null;
  onAcceptEvent: (() => void) | null = null;
  onDeclineEvent: (() => void) | null = null;
  onBuyItem: ((item: UpgradeItem) => void) | null = null;

  constructor(
    uiRoot: HTMLElement,
    public readonly topLeft: HTMLDivElement = document.createElement('div'),
    private market?: BlackMarket,
    _economy?: Economy,
    _heat?: HeatSystem,
    _events?: EventEngine,
  ) {
    this.topLeft.className = 'hud-top';
    uiRoot.appendChild(this.topLeft);

    this.modeBadge = this.mk('div', 'mode-badge', 'ON FOOT');
    this.topLeft.appendChild(this.modeBadge);

    // ---- Heat bar (full-width top strip) ----
    this.heatBar = this.mk('div', 'heat-bar-wrap');
    const heatTrack = this.mk('div', 'heat-track');
    this.heatFill = this.mk('div', 'heat-fill');
    this.heatLabel = this.mk('div', 'heat-label', 'HEAT');
    heatTrack.appendChild(this.heatFill);
    this.heatBar.appendChild(this.heatLabel);
    this.heatBar.appendChild(heatTrack);
    uiRoot.appendChild(this.heatBar);

    // ---- Speedometer ----
    const speedo = this.mk('div', 'speedo');
    this.speedVal = this.mk('div', 'val', '0');
    const unit = this.mk('div', 'unit', 'KM/H');
    speedo.appendChild(this.speedVal);
    speedo.appendChild(unit);
    uiRoot.appendChild(speedo);

    // ---- Dual currency (bottom-left above joystick hint) ----
    const wallet = this.mk('div', 'wallet');
    const cashRow = this.mk('div', 'wallet-row');
    cashRow.appendChild(this.mk('span', 'wallet-icon clean', '$'));
    this.cashEl = this.mk('div', 'wallet-val clean', '500');
    cashRow.appendChild(this.cashEl);
    const dirtyRow = this.mk('div', 'wallet-row');
    dirtyRow.appendChild(this.mk('span', 'wallet-icon dirty', '⬡'));
    this.dirtyEl = this.mk('div', 'wallet-val dirty', '0');
    dirtyRow.appendChild(this.dirtyEl);
    wallet.appendChild(cashRow);
    wallet.appendChild(dirtyRow);
    uiRoot.appendChild(wallet);

    // ---- Context prompt ----
    this.prompt = this.mk('div', 'prompt');
    this.prompt.style.display = 'none';
    uiRoot.appendChild(this.prompt);

    // ---- Event banner ----
    this.eventBanner = this.mk('div', 'event-banner');
    this.eventBanner.style.display = 'none';
    this.eventTitle = this.mk('div', 'event-title', '');
    this.eventDesc = this.mk('div', 'event-desc', '');
    this.eventTimer = this.mk('div', 'event-timer', '');
    const eventBtns = this.mk('div', 'event-btns');
    this.eventAccept = this.mkBtn('ACCEPT', 'event-btn accept');
    this.eventDecline = this.mkBtn('DECLINE', 'event-btn decline');
    this.eventAccept.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onAcceptEvent?.();
      this.hideBanner();
    });
    this.eventDecline.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onDeclineEvent?.();
      this.hideBanner();
    });
    eventBtns.appendChild(this.eventAccept);
    eventBtns.appendChild(this.eventDecline);
    this.eventBanner.appendChild(this.eventTitle);
    this.eventBanner.appendChild(this.eventDesc);
    this.eventBanner.appendChild(this.eventTimer);
    this.eventBanner.appendChild(eventBtns);
    uiRoot.appendChild(this.eventBanner);

    // ---- Shop button + overlay ----
    const shopBtn = this.mk('div', 'shop-btn', '⬡ MARKET');
    shopBtn.style.pointerEvents = 'auto';
    shopBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.toggleShop(); });
    uiRoot.appendChild(shopBtn);

    this.shopOverlay = this.buildShopOverlay();
    document.body.appendChild(this.shopOverlay);

    // ---- Mute ----
    this.muteBtn = this.mk('div', 'mute-btn', '\u{1F50A}');
    this.muteBtn.style.pointerEvents = 'auto';
    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.onToggleMute) {
        const muted = this.onToggleMute();
        this.muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
      }
    });
    uiRoot.appendChild(this.muteBtn);
  }

  // ---- public setters called from Game ----

  setSpeed(kmh: number): void {
    const v = Math.round(kmh);
    if (v !== this.lastSpeed) {
      this.lastSpeed = v;
      this.speedVal.textContent = String(v);
    }
  }

  setMode(mode: 'walk' | 'drive'): void {
    this.modeBadge.textContent = mode === 'drive' ? 'DRIVING' : 'ON FOOT';
  }

  setPrompt(text: string | null): void {
    const t = text ?? '';
    if (t === this.promptText) return;
    this.promptText = t;
    if (t) {
      this.prompt.textContent = t;
      this.prompt.style.display = 'block';
    } else {
      this.prompt.style.display = 'none';
    }
  }

  setHeat(heat: number, tier: number): void {
    this.heatFill.style.width = `${(heat * 100).toFixed(1)}%`;
    this.heatBar.dataset['tier'] = String(tier);
    // Color transitions: 0=cyan, 1=yellow, 2=orange, 3=red, 4=crimson flash
    const colors = ['#00ffe0', '#f0e000', '#ff8800', '#ff2a50', '#ff002a'];
    this.heatFill.style.background = colors[tier] ?? colors[4]!;
    if (tier >= 3) {
      this.heatBar.classList.add('heat-alert');
    } else {
      this.heatBar.classList.remove('heat-alert');
    }
  }

  setEconomy(cash: number, dirty: number): void {
    this.cashEl.textContent = this.fmt(cash);
    this.dirtyEl.textContent = this.fmt(dirty);
  }

  showEventOffer(title: string, desc: string, timeLeft: number): void {
    this.eventTitle.textContent = title;
    this.eventDesc.textContent = desc;
    this.eventTimer.textContent = `${Math.ceil(timeLeft)}s`;
    this.eventAccept.style.display = 'block';
    this.eventDecline.style.display = 'block';
    this.eventBanner.classList.remove('active-mission');
    this.eventBanner.style.display = 'flex';
  }

  showActiveMission(title: string, progress: number, timeLeft: number): void {
    this.eventTitle.textContent = title;
    this.eventDesc.textContent = `Complete the objective — ${timeLeft}s remaining`;
    this.eventTimer.textContent = `${Math.round(progress * 100)}%`;
    this.eventAccept.style.display = 'none';
    this.eventDecline.style.display = 'none';
    this.eventBanner.classList.add('active-mission');
    this.eventBanner.style.display = 'flex';
  }

  hideBanner(): void {
    this.eventBanner.style.display = 'none';
  }

  refreshShop(): void {
    if (this.shopOpen) {
      // Rebuild shop items to reflect new levels/affordability.
      const body = this.shopOverlay.querySelector('.shop-items');
      if (body) {
        body.innerHTML = '';
        this.populateShopItems(body as HTMLDivElement);
      }
    }
  }

  // ---- shop overlay ----

  private buildShopOverlay(): HTMLDivElement {
    const overlay = this.mk('div', 'shop-overlay');
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'auto';

    const header = this.mk('div', 'shop-header');
    header.appendChild(this.mk('div', 'shop-title', '⬡ BLACK MARKET'));
    const closeBtn = this.mkBtn('✕', 'shop-close');
    closeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.closeShop(); });
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const items = this.mk('div', 'shop-items');
    this.populateShopItems(items);
    overlay.appendChild(items);

    return overlay;
  }

  private populateShopItems(container: HTMLElement): void {
    if (!this.market) return;
    for (const item of this.market.catalog) {
      const card = this.mk('div', 'shop-card');
      const canAfford = this.market.canAfford(item);
      const maxed = this.market.isMaxed(item);
      const level = this.market.level(item.id);
      if (!canAfford || maxed) card.classList.add('disabled');

      const icon = this.mk('div', 'shop-icon', this.svgIcon(item.icon));
      const info = this.mk('div', 'shop-info');
      const label = this.mk('div', 'shop-label', item.label);
      const desc = this.mk('div', 'shop-desc', item.description);
      const meta = this.mk('div', 'shop-meta');
      if (item.maxLevel < 99) {
        meta.appendChild(this.mk('span', 'shop-level', `LV ${level}/${item.maxLevel}`));
      }
      const price = this.mk('span', 'shop-price', maxed ? 'MAXED' : `$${item.price}`);
      meta.appendChild(price);
      info.appendChild(label);
      info.appendChild(desc);
      info.appendChild(meta);
      card.appendChild(icon);
      card.appendChild(info);

      if (!maxed) {
        card.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.onBuyItem?.(item);
          this.refreshShop();
        });
      }
      container.appendChild(card);
    }
  }

  private svgIcon(id: string): string {
    const icons: Record<string, string> = {
      scrub:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
      turbo:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      grip:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>',
      scrambler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h4M18 12h4M12 2v4M12 18v4"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/></svg>',
      launder:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12l3 3 5-5"/></svg>',
      armour:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L4 6v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V6L12 2z"/></svg>',
    };
    return icons[id] ?? `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`;
  }

  private toggleShop(): void {
    this.shopOpen ? this.closeShop() : this.openShop();
  }

  private openShop(): void {
    this.shopOpen = true;
    this.refreshShop();
    this.shopOverlay.style.display = 'flex';
  }

  private closeShop(): void {
    this.shopOpen = false;
    this.shopOverlay.style.display = 'none';
  }

  // ---- helpers ----

  private mk<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  private mkBtn(text: string, cls: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = cls;
    btn.textContent = text;
    btn.type = 'button';
    return btn;
  }

  private fmt(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
  }
}
