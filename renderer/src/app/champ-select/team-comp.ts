import { Component, computed, inject, input } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';

interface TeamSummary {
  known: number;
  /** Fatia estimada de dano mágico (0 a 1) pelas notas do Data Dragon. */
  magicShare: number;
  frontline: number;
}

/** Tanques e lutadores resistentes seguram a luta; o resto precisa de alguém na frente. */
function isFrontline(champion: ChampionInfo): boolean {
  return champion.tags.includes('Tank') || (champion.tags.includes('Fighter') && champion.defense >= 6);
}

function summarize(champions: ChampionInfo[]): TeamSummary {
  const rated = champions.filter((c) => c.attack + c.magic > 0);
  const magicShare = rated.length
    ? rated.reduce((sum, c) => sum + c.magic / (c.attack + c.magic), 0) / rated.length
    : 0.5;
  return { known: champions.length, magicShare, frontline: champions.filter(isFrontline).length };
}

/** Equilíbrio de dano e linha de frente dos dois times, com avisos quando algo falta. */
@Component({
  selector: 'app-team-comp',
  template: `
    @if (ally().known + enemy().known >= 2) {
      @for (row of rows(); track row.label) {
        <div class="team" [class.enemy]="row.enemy">
          <span class="label">{{ row.label }}</span>
          <div class="bar" [attr.aria-label]="row.aria">
            <span class="ad" [style.width.%]="row.ad"></span>
            <span class="ap" [style.width.%]="100 - row.ad"></span>
          </div>
          <span class="split num">{{ row.ad }}% / {{ 100 - row.ad }}%</span>
          <span class="front muted" [title]="'Tanques e lutadores resistentes'">{{ row.frontline }} na frente</span>
        </div>
      }
      <div class="legend muted"><span class="dot ad"></span>físico <span class="dot ap"></span>mágico</div>
      @for (tip of tips(); track tip) {
        <p class="tip">{{ tip }}</p>
      }
    } @else {
      <p class="muted">A composição aparece conforme os campeões são escolhidos.</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 6px;
    }
    .team {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 76px 76px;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .label {
      font-weight: 600;
      color: var(--ally);
    }
    .team.enemy .label {
      color: var(--enemy);
    }
    .bar {
      display: flex;
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--well);
    }
    .ad,
    .ap {
      height: 100%;
      transition: width var(--dur) var(--ease-out);
    }
    .ad {
      background: #e08a3c;
    }
    .ap {
      background: #8f7cf0;
    }
    .split {
      text-align: right;
    }
    .front {
      text-align: right;
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      &.ad {
        margin-left: 0;
      }
      &.ap {
        margin-left: 6px;
      }
    }
    .tip {
      margin: 0;
      padding: 6px 10px;
      border-left: 2px solid var(--accent);
      border-radius: 6px;
      background: var(--well);
      font-size: 12px;
    }
    .muted {
      color: var(--muted);
      font-size: 13px;
    }
  `,
})
export class TeamCompPanel {
  readonly allyChampionIds = input<number[]>([]);
  readonly enemyChampionIds = input<number[]>([]);
  /** Ainda dá para escolher (sem campeão confirmado): os avisos sugerem o que falta. */
  readonly canPick = input(false);

  private readonly ddragon = inject(DataDragonService);

  private readonly champions = (ids: number[]) =>
    ids.map((id) => (id > 0 ? this.ddragon.champion(id) : null)).filter((c): c is ChampionInfo => c !== null);

  protected readonly ally = computed(() => summarize(this.champions(this.allyChampionIds())));
  protected readonly enemy = computed(() => summarize(this.champions(this.enemyChampionIds())));

  protected readonly rows = computed(() =>
    [
      { label: 'Seu time', enemy: false, team: this.ally() },
      { label: 'Inimigo', enemy: true, team: this.enemy() },
    ]
      .filter((row) => row.team.known > 0)
      .map((row) => {
        const ad = Math.round((1 - row.team.magicShare) * 100);
        return {
          label: row.label,
          enemy: row.enemy,
          ad,
          frontline: row.team.frontline,
          aria: `${row.label}: ${ad}% de dano físico`,
        };
      }),
  );

  protected readonly tips = computed(() => {
    const ally = this.ally();
    const enemy = this.enemy();
    const tips: string[] = [];
    if (ally.known >= 3) {
      if (ally.magicShare <= 0.25) {
        tips.push(
          this.canPick()
            ? 'Seu time está quase só no dano físico: um campeão de dano mágico equilibra.'
            : 'Seu time está quase só no dano físico: o inimigo pode fechar com armadura.',
        );
      } else if (ally.magicShare >= 0.7) {
        tips.push(
          this.canPick()
            ? 'Seu time está quase só no dano mágico: um campeão de dano físico equilibra.'
            : 'Seu time está quase só no dano mágico: o inimigo pode fechar com resistência mágica.',
        );
      }
      if (ally.known >= 4 && ally.frontline === 0) {
        tips.push('Seu time não tem linha de frente: falta quem inicie e segure dano.');
      }
    }
    if (enemy.known >= 3) {
      if (enemy.magicShare <= 0.25) tips.push('O inimigo é quase só dano físico: armadura rende mais nesta partida.');
      else if (enemy.magicShare >= 0.7) tips.push('O inimigo é quase só dano mágico: resistência mágica rende mais nesta partida.');
      if (enemy.frontline >= 3) tips.push('O inimigo tem muita linha de frente: dano percentual e penetração ajudam.');
    }
    return tips;
  });
}
