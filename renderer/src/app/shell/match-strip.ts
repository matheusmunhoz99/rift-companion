import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LcuService } from '../lcu/lcu.service';
import { LiveDataService } from '../live/live-data.service';

interface StripItem {
  label: string;
  value: string;
  /** soon = falta 1 minuto ou menos; alive = no mapa agora; turn = sua vez na seleção. */
  tone: 'soon' | 'alive' | 'turn' | null;
  title?: string;
}

/** Até quantos objetivos aparecem no topo. */
const MAX_OBJECTIVES = 3;

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Faixa do modo partida no topo do app, visível em qualquer aba: na seleção, o tempo da vez
 * e o aviso de quando é a sua; na partida, os próximos objetivos com contagem regressiva e os
 * inibidores voltando. São os mesmos dados do painel "Ao vivo", resumidos numa linha.
 */
@Component({
  selector: 'app-match-strip',
  template: `
    @for (item of items(); track item.label) {
      <span class="item" [attr.data-tone]="item.tone" [title]="item.title ?? ''">
        <span class="label">{{ item.label }}</span>
        <strong class="value num">{{ item.value }}</strong>
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
    }

    .item {
      --tone: var(--border-strong);
      display: inline-flex;
      flex: none;
      align-items: baseline;
      gap: 7px;
      padding: 4px 10px;
      border: 1px solid color-mix(in srgb, var(--tone) 60%, var(--border));
      border-radius: 999px;
      background: color-mix(in srgb, var(--tone) 10%, var(--surface));
      font-size: 12px;
      white-space: nowrap;

      &[data-tone='soon'] {
        --tone: var(--warning);
      }

      &[data-tone='alive'] {
        --tone: var(--success);
      }

      // Sua vez na seleção: o aviso mais importante, pulsa até você agir.
      &[data-tone='turn'] {
        --tone: var(--accent);
        animation: pulse 1.2s ease-in-out infinite;
      }
    }

    @keyframes pulse {
      50% {
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
      }
    }

    .label {
      color: var(--muted);
      font-weight: 600;
    }

    .value {
      color: var(--text);
      font-size: 14px;
    }

    [data-tone='soon'] .value {
      color: var(--warning);
    }

    [data-tone='alive'] .value {
      color: var(--success);
    }

    [data-tone='turn'] .value {
      color: var(--accent);
    }
  `,
})
export class MatchStrip {
  private readonly lcu = inject(LcuService);
  private readonly live = inject(LiveDataService);
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 500);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly items = computed<StripItem[]>(() => {
    const state = this.lcu.state();
    const phase = state.gameflowPhase;

    if (phase === 'ChampSelect' && state.champSelect) {
      const session = state.champSelect;
      const left = session.timerEndsAt ? Math.max(0, Math.ceil((session.timerEndsAt - this.now()) / 1000)) : null;
      const turn = session.banActionId != null ? 'banir' : session.pickActionId !== null ? 'escolher' : null;
      const items: StripItem[] = [];
      if (turn) items.push({ label: `Sua vez de ${turn}`, value: left !== null ? clock(left) : 'agora', tone: 'turn' });
      else if (left !== null) items.push({ label: 'Tempo da fase', value: clock(left), tone: left <= 10 ? 'soon' : null });
      return items;
    }

    if (phase !== 'InProgress' && phase !== 'Reconnect') return [];
    const data = this.live.data();
    if (!data) return [];
    const now = this.live.clock();
    const items: StripItem[] = [];

    const objectives = data.objectives
      .filter((o) => o.state !== 'done')
      .map((o) => ({ o, left: o.at - now }))
      .sort((a, b) => a.left - b.left)
      .slice(0, MAX_OBJECTIVES);
    for (const { o, left } of objectives) {
      items.push(
        left > 0
          ? { label: o.name, value: clock(left), tone: left <= 60 ? 'soon' : null, title: `${o.name} nasce aos ${clock(o.at)}` }
          : { label: o.name, value: 'no mapa', tone: 'alive' },
      );
    }

    for (const inhib of data.timers?.inhibitors ?? []) {
      const left = inhib.respawnAt - now;
      if (left <= 0) continue;
      items.push({
        label: `Inibidor ${inhib.ally ? 'seu' : 'deles'}${inhib.lane ? ` (${inhib.lane})` : ''}`,
        value: clock(left),
        tone: left <= 30 ? 'soon' : null,
        title: inhib.ally ? 'Seu inibidor volta em' : 'O inibidor inimigo volta em',
      });
    }
    return items;
  });
}
