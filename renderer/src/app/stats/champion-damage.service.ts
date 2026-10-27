import { Injectable, inject, signal } from '@angular/core';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import type { ChampionDamageShare } from './stats.types';

/** Fatias de dano de um campeão (somam 1) e de onde vieram. */
export interface DamageSplit {
  ap: number;
  ad: number;
  true: number;
  /** true = dano real medido nas partidas Mestre+; false = estimativa pelas notas do Data Dragon. */
  measured: boolean;
}

/** Abaixo disso a amostra real é pequena demais e vale a estimativa. */
const MIN_GAMES = 20;
const REFRESH_MS = 30 * 60_000;

/**
 * Perfil de dano de cada campeão. Prefere o dano real causado a campeões nas
 * partidas Mestre+ coletadas pelo servidor; sem amostra, estima pelas notas de
 * ataque e magia do Data Dragon.
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
    const champion = this.ddragon.champion(championId);
    return champion ? estimate(champion) : null;
  }

  /** Média do time: quanto do dano dele é mágico, físico e verdadeiro. */
  team(championIds: number[]): DamageSplit | null {
    const splits = championIds.map((id) => this.of(id)).filter((s): s is DamageSplit => s !== null);
    if (!splits.length) return null;
    const sum = (key: 'ap' | 'ad' | 'true') => splits.reduce((total, s) => total + s[key], 0) / splits.length;
    return { ap: sum('ap'), ad: sum('ad'), true: sum('true'), measured: splits.every((s) => s.measured) };
  }
}

/**
 * Estimativa pelas notas de ataque e magia (0 a 10). As notas puxam para o meio
 * (Ahri: 3 de ataque e 8 de magia); um leve contraste aproxima do dano real.
 */
function estimate(champion: ChampionInfo): DamageSplit {
  const total = champion.attack + champion.magic;
  const share = total > 0 ? champion.magic / total : 0.5;
  const ap = Math.min(0.95, Math.max(0.05, (share - 0.5) * 1.5 + 0.5));
  return { ap, ad: 1 - ap, true: 0, measured: false };
}
