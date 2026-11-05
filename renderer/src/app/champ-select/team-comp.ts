import { Component, computed, inject, input } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import { ChampionDamageService, type DamageSplit } from '../stats/champion-damage.service';

interface TeamSummary {
  known: number;
  /** Fatia de dano mágico entre mágico e físico (0 a 1), para avisos de armadura/RM. */
  magicShare: number;
  ap: number;
  ad: number;
  true: number;
  frontline: number;
}

/** Tanques e lutadores resistentes seguram a luta; o resto precisa de alguém na frente. */
function isFrontline(champion: ChampionInfo): boolean {
  return champion.tags.includes('Tank') || (champion.tags.includes('Fighter') && champion.defense >= 6);
}

function summarize(
  champions: ChampionInfo[],
  damageOf: (championId: number) => DamageSplit | null,
): TeamSummary {
  const splits = champions
    .map((c) => damageOf(c.key))
    .filter((s): s is DamageSplit => s !== null);
  const avg = (key: 'ap' | 'ad' | 'true') =>
    splits.length ? splits.reduce((sum, s) => sum + s[key], 0) / splits.length : key === 'true' ? 0 : 0.5;
  const ap = avg('ap');
  const ad = avg('ad');
  const t = avg('true');
  const mitigated = ap + ad;
  const magicShare = mitigated > 0 ? ap / mitigated : 0.5;
  return {
    known: champions.length,
    magicShare,
    ap,
    ad,
    true: t,
    frontline: champions.filter(isFrontline).length,
  };
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
            <span class="ap" [style.width.%]="row.ap"></span>
            @if (row.true >= 5) {
              <span class="true" [style.width.%]="row.true"></span>
            }
          </div>
          <span class="split num">{{ row.ad }}% / {{ row.ap }}%</span>
          <span class="front muted" [title]="'Tanques e lutadores resistentes'">{{ row.frontline }} na frente</span>
        </div>
      }
      <div class="legend muted">
        <span class="dot ad"></span>físico
        <span class="dot ap"></span>mágico
        @if (hasTrueDamage()) {
          <span class="dot true"></span>verdadeiro
        }
      </div>
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
    .ap,
    .true {
      height: 100%;
      transition: width var(--dur) var(--ease-out);
    }
    .ad {
      background: #e08a3c;
    }
    .ap {
      background: #8f7cf0;
    }
    .true {
      background: #e2e8f0;
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
      &.ap,
      &.true {
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
  private readonly damage = inject(ChampionDamageService);

  private readonly champions = (ids: number[]) =>
    ids.map((id) => (id > 0 ? this.ddragon.champion(id) : null)).filter((c): c is ChampionInfo => c !== null);

  protected readonly ally = computed(() =>
    summarize(this.champions(this.allyChampionIds()), (id) => this.damage.of(id)),
  );
  protected readonly enemy = computed(() =>
    summarize(this.champions(this.enemyChampionIds()), (id) => this.damage.of(id)),
  );

  protected readonly rows = computed(() =>
    [
      { label: 'Seu time', enemy: false, team: this.ally() },
      { label: 'Inimigo', enemy: true, team: this.enemy() },
    ]
      .filter((row) => row.team.known > 0)
      .map((row) => {
        const truePct = Math.round(row.team.true * 100);
        const showTrue = truePct >= 5 ? truePct : 0;
        const ad = Math.round(row.team.ad * 100);
        const ap = Math.max(0, 100 - ad - showTrue);
        return {
          label: row.label,
          enemy: row.enemy,
          ad,
          ap,
          true: showTrue,
          frontline: row.team.frontline,
          aria: `${row.label}: ${ad}% de dano físico e ${ap}% mágico`,
        };
      }),
  );

  protected readonly hasTrueDamage = computed(() => this.rows().some((r) => r.true >= 5));

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
