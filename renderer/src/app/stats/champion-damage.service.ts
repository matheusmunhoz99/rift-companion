import { Injectable, inject, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { BASELINE_DAMAGE, baselineDamageOf, estimateDamage, type DamageSplit } from './match-context';
import type { ChampionDamageShare } from './stats.types';

export { baselineDamageOf, type DamageSplit };

/** Abaixo disso a amostra real é pequena demais e vale a estimativa. */
const MIN_GAMES = 20;
const REFRESH_MS = 30 * 60_000;

/**
 * Perfil de dano de cada campeão. Prefere o dano real causado a campeões nas
 * partidas Mestre+ coletadas pelo servidor; sem amostra da rede, usa a base medida
 * Mestre+ embutida; para campeão inédito, estima pelas notas do Data Dragon.
 */
@Injectable({ providedIn: 'root' })
export class ChampionDamageService {
  private readonly ddragon = inject(DataDragonService);
  private readonly table = signal<Record<number, ChampionDamageShare>>({});
  private loadedAt = 0;

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!window.stats?.damage || Date.now() - this.loadedAt < REFRESH_MS) return;
    this.loadedAt = Date.now();
    try {
      this.table.set((await window.stats.damage()) ?? {});
    } catch {
      this.loadedAt = 0;
    }
  }

  of(championId: number): DamageSplit | null {
    const real = this.table()[championId];
    if (real && real.games >= MIN_GAMES) return { ap: real.ap, ad: real.ad, true: real.true, measured: true };
    const baseline = BASELINE_DAMAGE[championId];
    if (baseline) return { ap: baseline[0], ad: baseline[1], true: baseline[2], measured: true };
    const champion = this.ddragon.champion(championId);
    return champion ? estimateDamage(champion) : null;
  }

  /** Média do time: quanto do dano dele é mágico, físico e verdadeiro. */
  team(championIds: number[]): DamageSplit | null {
    const splits = championIds.map((id) => this.of(id)).filter((s): s is DamageSplit => s !== null);
    if (!splits.length) return null;
    const sum = (key: 'ap' | 'ad' | 'true') => splits.reduce((total, s) => total + s[key], 0) / splits.length;
    return { ap: sum('ap'), ad: sum('ad'), true: sum('true'), measured: splits.every((s) => s.measured) };
  }
}
