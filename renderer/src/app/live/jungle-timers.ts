import { Component, computed, inject } from '@angular/core';
import { DEFAULT_JUNGLE, campTiming, type CampKind } from './jungle-timings';
import { LiveDataService } from './live-data.service';

interface Camp {
  id: string;
  name: string;
  kind: CampKind;
  /** Para a voz: "Seu azul", "Azul inimigo". */
  mine?: string;
  theirs?: string;
}

/**
 * Tempos dos campos no Summoner's Rift. A API do jogo não avisa quando um campo morre,
 * então cada um é um toque: "morreu agora" e o app conta até ele voltar.
 */
export const CAMPS: Camp[] = [
  { id: 'blue', name: 'Azul', kind: 'buff', mine: 'Seu azul', theirs: 'Azul inimigo' },
  { id: 'red', name: 'Vermelho', kind: 'buff', mine: 'Seu vermelho', theirs: 'Vermelho inimigo' },
  { id: 'gromp', name: 'Sapo', kind: 'large', mine: 'Seu sapo', theirs: 'Sapo inimigo' },
  { id: 'wolves', name: 'Lobos', kind: 'small', mine: 'Seus lobos', theirs: 'Lobos inimigos' },
  { id: 'raptors', name: 'Aves', kind: 'small', mine: 'Suas aves', theirs: 'Aves inimigas' },
  { id: 'krugs', name: 'Krugs', kind: 'large', mine: 'Seus krugs', theirs: 'Krugs inimigos' },
];
export const RIVER: Camp[] = [
  { id: 'scuttle-top', name: 'Caranguejo de cima', kind: 'scuttle' },
  { id: 'scuttle-bot', name: 'Caranguejo de baixo', kind: 'scuttle' },
];

interface CampState {
  key: string;
  camp: Camp;
  respawn: number;
  /** dead = marcado como morto, contando; upcoming = ainda não nasceu; alive = no mapa. */
  state: 'dead' | 'upcoming' | 'alive';
  left: number;
}

/** Faixa embaixo das rotas: sua selva | rio | selva inimiga, espelhando os times. */
@Component({
  selector: 'app-jungle-timers',
  template: `
    <div class="jungle">
      <span class="title" title="A API do jogo não avisa quando um campo morre: toque no campo quando ele morrer e o app conta até ele voltar. Toque de novo para desfazer. No jogo: Ctrl+Alt+1 seu azul, 2 seu vermelho, 3 azul inimigo, 4 vermelho inimigo, 5 caranguejo de cima, 6 de baixo.">
        Selva <span class="hint">toque quando o campo morrer · no jogo: Ctrl+Alt+1 a 6</span>
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
    const timings = this.live.data()?.jungle ?? DEFAULT_JUNGLE;
    const state = (side: string, camp: Camp): CampState => {
      const key = `${side}:${camp.id}`;
      const { first, respawn } = campTiming(camp.kind, timings);
      const backAt = marks.get(key);
      if (backAt !== undefined && backAt > now) return { key, camp, respawn, state: 'dead', left: backAt - now };
      if (now < first) return { key, camp, respawn, state: 'upcoming', left: first - now };
      return { key, camp, respawn, state: 'alive', left: 0 };
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
    this.live.toggleCamp(c.key, c.respawn);
  }

  protected clock(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

/** Nomes de um campo marcado ("ally:blue"): curto para o overlay e por extenso para a voz. */
export function campNames(key: string): { short: string; spoken: string } | null {
  const [side, id] = key.split(':');
  if (side === 'river') {
    const camp = RIVER.find((c) => c.id === id);
    return camp ? { short: id === 'scuttle-top' ? 'Carang. cima' : 'Carang. baixo', spoken: camp.name } : null;
  }
  const camp = CAMPS.find((c) => c.id === id);
  if (!camp) return null;
  return side === 'ally'
    ? { short: camp.name, spoken: camp.mine ?? camp.name }
    : { short: `${camp.name} inim.`, spoken: camp.theirs ?? `${camp.name} inimigo` };
}
