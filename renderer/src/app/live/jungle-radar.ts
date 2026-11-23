import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { JungleRadarState } from '../core/app.types';
import { PreferencesService } from '../core/preferences.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { isAndroid } from '../mobile/mobile-client';
import { LiveDataService } from './live-data.service';

@Component({
  selector: 'app-jungle-radar',
  standalone: true,
  template: `
    @if (enabled()) {
      <section class="radar-card" aria-label="Radar do Jungler inimigo">
        <header class="radar-head">
          <span class="timer-title">Radar do Jungler</span>
          @if (radar()?.championName; as jg) {
            <span class="jg-name">{{ jg }}</span>
          }
        </header>

        @if (radar()?.black) {
          <div class="radar-black">
            <p class="muted">Jogo em Tela Cheia Exclusiva: captura do minimapa veio preta.</p>
            @if (canSetBorderless) {
              <button type="button" class="btn small" [disabled]="switching()" (click)="toBorderless()">
                {{ switching() ? 'Mudando…' : 'Mudar para Sem bordas' }}
              </button>
            }
          </div>
        } @else {
          <div class="radar-map">
            @if (mapUrl(); as url) {
              <img class="map-bg" [src]="url" alt="Minimapa de Summoner's Rift" />
            }
            @if (trailPoints(); as pts) {
              <svg class="trail-svg" viewBox="0 0 100 100" aria-hidden="true">
                <polyline class="trail-line" [attr.points]="pts" />
                @for (p of radar()?.trail ?? []; track $index) {
                  @if ($index < (radar()?.trail?.length ?? 0) - 1) {
                    <circle class="trail-dot" [attr.cx]="p.u * 100" [attr.cy]="p.v * 100" r="2.2" />
                  }
                }
              </svg>
            }
            @if (radar()?.lastSeen; as seen) {
              <span
                class="jg-pin"
                [class.fresh]="secondsAgo() !== null && secondsAgo()! < 15"
                [style.left.%]="seen.u * 100"
                [style.top.%]="seen.v * 100"
                [title]="seen.zone"
              >
                @if (champIcon(); as icon) {
                  <img [src]="icon" [alt]="radar()?.championName ?? 'Jungler'" />
                }
              </span>
            }
          </div>

          @if (radar()?.lastSeen; as seen) {
            <div class="radar-status" [attr.data-tone]="urgency()">
              <strong class="zone">{{ seen.zone }}</strong>
              <span class="ago num">{{ statusLabel() }}</span>
            </div>
          } @else {
            <p class="radar-wait muted">Aguardando o jungler inimigo aparecer no minimapa…</p>
          }
        }
      </section>
    }
  `,
  styles: [`
    .radar-card {
      display: grid;
      gap: 6px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }
    .radar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .timer-title {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .jg-name {
      color: var(--enemy-text, var(--danger));
      font-size: 12px;
      font-weight: 700;
    }
    .radar-map {
      position: relative;
      width: 100%;
      max-width: 192px;
      aspect-ratio: 1;
      margin: 0 auto;
      overflow: hidden;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: #090d14;
    }
    .map-bg {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.88;
    }
    .trail-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .trail-line {
      fill: none;
      stroke: rgba(244, 67, 88, 0.72);
      stroke-width: 1.6;
      stroke-dasharray: 3 2;
    }
    .trail-dot {
      fill: rgba(244, 67, 88, 0.75);
      stroke: #0b0d13;
      stroke-width: 0.7;
    }
    .jg-pin {
      position: absolute;
      width: 24px;
      height: 24px;
      border: 2px solid #f44358;
      border-radius: 50%;
      background: #0b0d13;
      overflow: hidden;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 8px rgba(244, 67, 88, 0.75);
    }
    .jg-pin.fresh {
      animation: radar-pulse 1.5s infinite;
    }
    .jg-pin img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    @keyframes radar-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(244, 67, 88, 0.75); }
      60% { box-shadow: 0 0 0 8px rgba(244, 67, 88, 0); }
    }
    .radar-status {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      padding: 5px 8px;
      border-radius: var(--radius-sm);
      background: var(--well);
      font-size: 12px;
    }
    .radar-status[data-tone="fresh"] .ago {
      color: #34d399;
      font-weight: 700;
    }
    .radar-status[data-tone="warn"] .ago {
      color: #fbbf24;
      font-weight: 700;
    }
    .radar-status[data-tone="mia"] .ago {
      color: var(--enemy-text, var(--danger));
      font-weight: 700;
    }
    .radar-wait,
    .radar-black p {
      margin: 0;
      font-size: 11.5px;
      line-height: 1.35;
    }
    .radar-black {
      display: grid;
      gap: 6px;
    }
  `],
})
export class JungleRadar {
  private readonly prefs = inject(PreferencesService);
  private readonly ddragon = inject(DataDragonService);
  private readonly live = inject(LiveDataService);

  protected readonly radar = signal<JungleRadarState | null>(null);
  protected readonly switching = signal(false);
  protected readonly canSetBorderless = !isAndroid && !!window.app?.setBorderless;

  protected readonly enabled = computed(() => this.prefs.preferences().jungleRadar);

  protected readonly mapUrl = computed(() => {
    const v = this.ddragon.version();
    return v ? `https://ddragon.leagueoflegends.com/cdn/${v}/img/map/map11.png` : null;
  });

  protected readonly champIcon = computed(() => {
    const key = this.radar()?.championKey;
    const id = key ? this.ddragon.championKeyOf(key) : 0;
    const champ = id ? this.ddragon.champion(id) : null;
    return champ ? this.ddragon.championIconUrl(champ) : null;
  });

  protected readonly trailPoints = computed(() => {
    const trail = this.radar()?.trail ?? [];
    if (trail.length < 2) return null;
    return trail.map((p) => `${(p.u * 100).toFixed(1)},${(p.v * 100).toFixed(1)}`).join(' ');
  });

  protected readonly secondsAgo = computed(() => {
    const seen = this.radar()?.lastSeen;
    if (!seen) return null;
    return Math.max(0, Math.floor(this.live.clock() - seen.gameTime));
  });

  protected readonly urgency = computed<'fresh' | 'warn' | 'mia'>(() => {
    const s = this.secondsAgo();
    if (s === null || s < 15) return 'fresh';
    return s < 45 ? 'warn' : 'mia';
  });

  protected readonly statusLabel = computed(() => {
    const s = this.secondsAgo();
    if (s === null) return '';
    if (s < 15) return `Visto agora · ${s}s`;
    if (s < 45) return `Há ${s}s`;
    const m = Math.floor(s / 60);
    const rem = String(s % 60).padStart(2, '0');
    return `Sumido há ${m}:${rem}`;
  });

  constructor() {
    const bridge = window.app;
    if (!bridge) return;
    void bridge.getJungleRadar?.().then((s) => {
      if (s) this.radar.set(s);
    });
    const unsub = bridge.onJungleRadar?.((s) => this.radar.set(s));
    const poll = isAndroid
      ? setInterval(() => {
          void bridge.getJungleRadar?.().then((s) => {
            if (s) this.radar.set(s);
          });
        }, 2_000)
      : null;

    inject(DestroyRef).onDestroy(() => {
      unsub?.();
      if (poll) clearInterval(poll);
    });
  }

  protected async toBorderless(): Promise<void> {
    if (!window.app?.setBorderless) return;
    this.switching.set(true);
    try {
      await window.app.setBorderless();
    } finally {
      this.switching.set(false);
    }
  }
}
