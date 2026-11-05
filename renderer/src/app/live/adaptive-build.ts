import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LivePlayer } from '../history/riot.types';
import { ChampionDamageService } from '../stats/champion-damage.service';
import type { EnemyDamage, Situational } from '../stats/stats.types';
import { LiveDataService } from './live-data.service';

/** A partir desta fatia (entre físico e mágico) o time inimigo conta como "maioria mágico" ou "maioria físico". */
const MAJORITY = 0.6;

/** Todas as botas (nível 1, 2 e evoluções): quem já tem bota não recebe sugestão de comprar outra. */
const ALL_BOOTS = new Set([
  1001, 3006, 3008, 3009, 3010, 3013, 3020, 3047, 3111, 3117, 3158, 3168, 3170, 3171, 3172, 3173, 3174, 3175, 3176,
]);

/** Evoluções automáticas de Lágrima -> item de origem nas estatísticas. */
const EVOLVED_TO_BASE: Record<number, number> = {
  3040: 3003,
  3042: 3004,
  3121: 3119,
  2530: 2526,
};

/**
 * Fatia de dano físico x mágico x verdadeiro do time inimigo agora: cada campeão pesa pelo que já
 * investiu em itens e pelos abates (é dele o dano que você vai levar). null sem dados de dano.
 * O dano verdadeiro não entra como físico para não sugerir armadura contra dano verdadeiro.
 */
export function enemyDamageRead(
  enemies: LivePlayer[],
  damageOf: (enemy: LivePlayer) => { ap: number; ad: number; true: number } | null,
  itemValue: (enemy: LivePlayer) => number,
): { ap: number; ad: number; true: number; profile: EnemyDamage } | null {
  let ap = 0;
  let ad = 0;
  let trueDmg = 0;
  for (const enemy of enemies) {
    const split = damageOf(enemy);
    if (!split) continue;
    const weight = 1 + itemValue(enemy) / 3000 + enemy.kills * 0.25;
    ap += split.ap * weight;
    ad += split.ad * weight;
    trueDmg += split.true * weight;
  }
  const total = ap + ad + trueDmg;
  if (!total) return null;
  const mitigable = ap + ad;
  const apMitigable = mitigable > 0 ? ap / mitigable : 0.5;
  const adMitigable = 1 - apMitigable;
  const profile: EnemyDamage =
    apMitigable >= MAJORITY ? 'ap' : adMitigable >= MAJORITY ? 'ad' : 'mixed';
  return { ap: ap / total, ad: ad / total, true: trueDmg / total, profile };
}

interface EnemyRead {
  ap: number;
  ad: number;
  true: number;
  profile: EnemyDamage;
  /** O inimigo mais perigoso agora (mais abates e ouro em itens), se algum se destaca. */
  threat: { player: LivePlayer; kda: string } | null;
}

/**
 * Build adaptativa durante a partida: lê o dano do time inimigo agora (cada campeão pesado
 * pelo que já investiu em itens e pelos abates) e mostra os itens que jogadores Mestre+ do
 * seu campeão mais compram contra esse perfil, sem repetir o que você já tem.
 */
@Component({
  selector: 'app-adaptive-build',
  template: `
    @if (read(); as r) {
      <div class="adaptive">
        <div class="read">
          <span class="read-title">Dano inimigo agora</span>
          <span class="bar" [title]="'Físico ' + pct(r.ad) + ' · mágico ' + pct(r.ap) + (r.true >= 0.05 ? ' · verdadeiro ' + pct(r.true) : '')">
            <i class="ad" [style.width.%]="r.ad * 100"></i>
            <i class="ap" [style.width.%]="r.ap * 100"></i>
            @if (r.true >= 0.05) {
              <i class="true" [style.width.%]="r.true * 100"></i>
            }
          </span>
          <span class="legend">
            <span class="ad">{{ pct(r.ad) }} físico</span>
            @if (r.true >= 0.05) {
              <span class="true">{{ pct(r.true) }} verd.</span>
            }
            <span class="ap">{{ pct(r.ap) }} mágico</span>
          </span>
        </div>
        <p class="advice">
          {{ advice(r.profile, r.true) }}
          @if (r.threat; as t) {
            <span class="threat">Cuidado com <strong>{{ t.player.championName }}</strong> ({{ t.kda }}).</span>
          }
        </p>
        @if (items().length) {
          <div class="items" aria-label="Próximos itens contra este time">
            @for (item of items(); track item.itemId) {
              <span class="item" [title]="ddragon.itemName(item.itemId) + ': ' + pct(item.share) + ' dos jogadores Mestre+ compram contra esse time'">
                @if (ddragon.itemIconUrl(item.itemId); as src) {<img [src]="src" [alt]="ddragon.itemName(item.itemId)" />}
                <span class="item-name">{{ ddragon.itemName(item.itemId) }}</span>
              </span>
            }
          </div>
        } @else if (loading()) {
          <span class="muted small">Buscando os itens contra este time…</span>
        }
      </div>
    }
  `,
  styles: `
    .adaptive {
      display: grid;
      gap: 6px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
    .read {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 4px 10px;
    }
    .read-title {
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }
    .bar {
      display: flex;
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      background: var(--well);

      .ad { background: var(--enemy); }
      .ap { background: var(--ally); }
      .true { background: #e2e8f0; }
    }
    .legend {
      display: flex;
      grid-column: 2;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;

      .ad { color: var(--enemy); }
      .ap { color: var(--ally); }
      .true { color: var(--muted); }
    }
    .advice {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.4;
    }
    .threat {
      color: var(--warning);
    }
    /* Uma linha só: os próximos itens, sem empurrar o painel para baixo. */
    .items {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 4px 6px 4px 4px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--well);

      img {
        flex: none;
        width: 24px;
        height: 24px;
        border-radius: 5px;
      }
    }
    .item-name {
      overflow: hidden;
      font-size: 11.5px;
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  `,
})
export class AdaptiveBuild {
  private readonly live = inject(LiveDataService);
  private readonly damage = inject(ChampionDamageService);
  protected readonly ddragon = inject(DataDragonService);

  private readonly situational = signal<Situational | null>(null);
  /** Último pedido: uma resposta atrasada de um perfil antigo não sobrescreve a nova. */
  private requested: string | null = null;
  protected readonly loading = signal(false);

  private readonly me = computed(() => this.live.data()?.players.find((p) => p.isMe) ?? null);

  protected readonly read = computed<EnemyRead | null>(() => {
    const enemies = (this.live.data()?.players ?? []).filter((p) => !p.ally);
    const read = enemyDamageRead(
      enemies,
      (enemy) => this.damage.of(this.ddragon.championKeyOf(enemy.championKey)),
      (enemy) => this.live.itemValue(enemy),
    );
    return read ? { ...read, threat: this.threat(enemies) } : null;
  });

  /** Itens contra o perfil de dano que realmente sobem nesse cenário e que você ainda não tem (até 4). */
  protected readonly items = computed(() => {
    const myItems = (this.me()?.items ?? []).map((item) => item.id);
    const owned = new Set(myItems.flatMap((id) => (EVOLVED_TO_BASE[id] ? [id, EVOLVED_TO_BASE[id]] : [id])));
    const hasBoots = myItems.some((id) => ALL_BOOTS.has(id));
    const profile = this.read()?.profile ?? 'mixed';
    let bootSuggested = false;
    const result = [];
    for (const item of this.situational()?.items ?? []) {
      if (owned.has(item.itemId)) continue;
      if (profile === 'ap' && item.itemId === 3047) continue;
      if (profile === 'ad' && item.itemId === 3111) continue;
      if ((profile === 'ap' || profile === 'ad') && item.lift < 1.08) continue;
      if (ALL_BOOTS.has(item.itemId)) {
        if (hasBoots || bootSuggested || item.lift < 1.15) continue;
        bootSuggested = true;
      }
      result.push(item);
      if (result.length === 4) break;
    }
    return result;
  });

  constructor() {
    // Busca os itens quando muda o seu campeão ou o perfil de dano inimigo (não a cada leitura).
    const request = computed(() => {
      const me = this.me();
      const profile = this.read()?.profile;
      if (!me || !profile) return null;
      return `${this.ddragon.championKeyOf(me.championKey)}|${me.position || ''}|${profile}`;
    });
    effect(() => {
      const key = request();
      untracked(() => void this.load(key));
    });
  }

  protected advice(profile: EnemyDamage, trueShare = 0): string {
    const trueNote = trueShare >= 0.15 ? ' (vida e escudos ajudam contra o dano verdadeiro)' : '';
    if (profile === 'ap') return `O time inimigo é maioria mágico: resistência mágica rende mais agora${trueNote}.`;
    if (profile === 'ad') return `O time inimigo é maioria físico: armadura rende mais agora${trueNote}.`;
    return `Dano inimigo misto: equilibre armadura e resistência mágica${trueNote}.`;
  }

  protected pct(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  /** Um inimigo que se destaca: pelo menos 4 abates e mais que o segundo. */
  private threat(enemies: LivePlayer[]): EnemyRead['threat'] {
    const sorted = [...enemies].sort((a, b) => b.kills - a.kills || this.live.itemValue(b) - this.live.itemValue(a));
    const top = sorted[0];
    if (!top || top.kills < 4 || top.kills <= (sorted[1]?.kills ?? 0)) return null;
    return { player: top, kda: `${top.kills}/${top.deaths}/${top.assists}` };
  }

  private async load(key: string | null): Promise<void> {
    this.requested = key;
    if (!key || !window.stats) {
      this.situational.set(null);
      return;
    }
    const [championId, position, profile] = key.split('|');
    this.loading.set(true);
    try {
      const stats = await window.stats.champion(Number(championId), position || null, null, profile as EnemyDamage);
      if (this.requested === key) this.situational.set(stats?.situational ?? null);
    } catch {
      if (this.requested === key) this.situational.set(null);
    } finally {
      if (this.requested === key) this.loading.set(false);
    }
  }
}
