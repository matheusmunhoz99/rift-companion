import { Component, computed, inject } from '@angular/core';
import { LiveDataService } from './live-data.service';

interface Camp {
  id: string;
  name: string;
  /** Primeiro surgimento e volta depois de morto (segundos de jogo). */
  first: number;
  respawn: number;
}

/**
 * Tempos dos campos no Summoner's Rift. A API do jogo não avisa quando um campo morre,
 * então cada um é um toque: "morreu agora" e o app conta até ele voltar.
 */
const CAMPS: Camp[] = [
  { id: 'blue', name: 'Azul', first: 90, respawn: 300 },
  { id: 'red', name: 'Vermelho', first: 90, respawn: 300 },
  { id: 'gromp', name: 'Sapo', first: 102, respawn: 135 },
  { id: 'wolves', name: 'Lobos', first: 90, respawn: 135 },
  { id: 'raptors', name: 'Aves', first: 90, respawn: 135 },
  { id: 'krugs', name: 'Krugs', first: 102, respawn: 135 },
];
const RIVER: Camp[] = [
  { id: 'scuttle-top', name: 'Caranguejo de cima', first: 210, respawn: 150 },
  { id: 'scuttle-bot', name: 'Caranguejo de baixo', first: 210, respawn: 150 },
];

interface CampState {
  key: string;
  camp: Camp;
  /** dead = marcado como morto, contando; upcoming = ainda não nasceu; alive = no mapa. */
  state: 'dead' | 'upcoming' | 'alive';
  left: number;
}

/** Faixa embaixo das rotas: sua selva | rio | selva inimiga, espelhando os times. */
@Component({
  selector: 'app-jungle-timers',
  template: `
    <div class="jungle">
      <span class="title" title="A API do jogo não avisa quando um campo morre: toque no campo quando ele morrer e o app conta até ele voltar. Toque de novo para desfazer.">
        Selva <span class="hint">toque no campo quando ele morrer</span>
      </span>
      <div class="sides">
        @for (group of groups(); track group.side) {
          <div class="group" [attr.data-side]="group.side">
            <span class="group-title">{{ group.title }}</span>
            <div class="camps">
              @for (c of group.camps; track c.key) {
                <button
                  type="button"
                  class="camp"
                  [attr.data-camp]="c.camp.id"
                  [attr.data-state]="c.state"
                  [title]="c.state === 'dead' ? c.camp.name + ' volta em ' + clock(c.left) + ' (toque para desfazer)' : c.state === 'upcoming' ? c.camp.name + ' nasce em ' + clock(c.left) : c.camp.name + ' no mapa: toque quando morrer'"
                  (click)="toggle(c)"
                >
                  <span class="camp-name">{{ c.camp.name }}</span>
                  <strong class="camp-time num">{{ c.state === 'alive' ? 'vivo' : clock(c.left) }}</strong>
                </button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    .jungle {
      display: grid;
      gap: 6px;
      margin-top: 6px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }
    .title {
      display: flex;
      align-items: baseline;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    .hint {
      color: var(--faint);
      font-size: 11px;
      font-weight: 500;
    }
    .sides {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 3fr);
      gap: 12px;
    }
    .group {
      display: grid;
      align-content: start;
      gap: 4px;
      min-width: 0;

      &[data-side='ally'] .group-title { color: var(--ally); }
      &[data-side='enemy'] .group-title { color: var(--enemy); text-align: right; }
      &[data-side='river'] .camps { grid-template-columns: 1fr; }
    }
    .group-title {
      color: var(--faint);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .camps {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
    }
    .camp {
      --camp: var(--muted);

      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 6px;
      min-width: 0;
      padding: 5px 8px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--well);
      color: var(--text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);

      &[data-camp='blue'] { --camp: #4fa3ff; }
      &[data-camp='red'] { --camp: #ff6b57; }
      &[data-camp^='scuttle'] { --camp: #4fd1c5; }

      &:hover {
        border-color: var(--camp);
      }

      // Morto e contando: cor do campo e o tempo em destaque.
      &[data-state='dead'] {
        border-color: color-mix(in srgb, var(--camp) 60%, var(--border));
        background: color-mix(in srgb, var(--camp) 14%, var(--well));

        .camp-time {
          color: var(--text);
        }
      }

      &[data-state='alive'] .camp-time {
        color: var(--success);
        font-size: 11px;
      }

      &[data-state='upcoming'] .camp-time {
        color: var(--muted);
      }
    }
    .camp-name {
      overflow: hidden;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .camp-time {
      flex: none;
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    @container (max-width: 640px) {
      .sides {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class JungleTimers {
  private readonly live = inject(LiveDataService);

  protected readonly groups = computed(() => {
    const now = this.live.clock();
    const marks = this.live.campTimers();
    const state = (side: string, camp: Camp): CampState => {
      const key = `${side}:${camp.id}`;
      const backAt = marks.get(key);
      if (backAt !== undefined && backAt > now) return { key, camp, state: 'dead', left: backAt - now };
      if (now < camp.first) return { key, camp, state: 'upcoming', left: camp.first - now };
      return { key, camp, state: 'alive', left: 0 };
    };
    return [
      { title: 'Sua selva', side: 'ally', camps: CAMPS.map((c) => state('ally', c)) },
      { title: 'Rio', side: 'river', camps: RIVER.map((c) => state('river', c)) },
      { title: 'Selva inimiga', side: 'enemy', camps: CAMPS.map((c) => state('enemy', c)) },
    ];
  });

  protected toggle(c: CampState): void {
    // Antes de nascer não há o que marcar.
    if (c.state === 'upcoming') return;
    this.live.toggleCamp(c.key, c.camp.respawn);
  }

  protected clock(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
