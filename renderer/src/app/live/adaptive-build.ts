import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LivePlayer } from '../history/riot.types';
import { ChampionDamageService } from '../stats/champion-damage.service';
import type { EnemyDamage, Situational } from '../stats/stats.types';
import { LiveDataService } from './live-data.service';

/** A partir desta fatia o time inimigo conta como "maioria mágico" ou "maioria físico". */
const MAJORITY = 0.6;

interface EnemyRead {
  ap: number;
  ad: number;
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
          <span class="bar" [title]="'Físico ' + pct(r.ad) + ' · mágico ' + pct(r.ap)">
            <i class="ad" [style.width.%]="r.ad * 100"></i>
            <i class="ap" [style.width.%]="r.ap * 100"></i>
          </span>
          <span class="legend">
            <span class="ad">{{ pct(r.ad) }} físico</span>
            <span class="ap">{{ pct(r.ap) }} mágico</span>
          </span>
        </div>
        <p class="advice">
          {{ advice(r.profile) }}
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
    }
    .legend {
      display: flex;
      grid-column: 2;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;

      .ad { color: var(--enemy); }
      .ap { color: var(--ally); }
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
    let ap = 0;
    let ad = 0;
    for (const enemy of enemies) {
      const split = this.damage.of(this.ddragon.championKeyOf(enemy.championKey));
      if (!split) continue;
      // Quem já comprou mais e abateu mais pesa mais: é dele o dano que você vai levar.
      const weight = 1 + this.live.itemValue(enemy) / 3000 + enemy.kills * 0.25;
      ap += split.ap * weight;
      ad += (split.ad + split.true) * weight;
    }
    const total = ap + ad;
    if (!total) return null;
    const share = { ap: ap / total, ad: ad / total };
    const profile: EnemyDamage = share.ap >= MAJORITY ? 'ap' : share.ad >= MAJORITY ? 'ad' : 'mixed';
    return { ...share, profile, threat: this.threat(enemies) };
  });

  /** Itens contra o perfil de dano que você ainda não tem (até 4). */
  protected readonly items = computed(() => {
    const owned = new Set((this.me()?.items ?? []).map((item) => item.id));
    return (this.situational()?.items ?? []).filter((item) => !owned.has(item.itemId)).slice(0, 4);
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

  protected advice(profile: EnemyDamage): string {
    if (profile === 'ap') return 'O time inimigo é maioria mágico: resistência mágica rende mais agora.';
    if (profile === 'ad') return 'O time inimigo é maioria físico: armadura rende mais agora.';
    return 'Dano inimigo misto: equilibre armadura e resistência mágica.';
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
