import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import type { ItemBuild, RunePageSuggestion } from '../builds/builds.types';
import { ToastService, errorText } from '../core/toast.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { LcuService } from '../lcu/lcu.service';
import {
  STATS_POSITIONS,
  parseRuneKey,
  percent,
  statsPositionLabel,
  type ChampionStats,
  type StatsOption,
} from './stats.types';
import {
  allPositionsTierList,
  damageProfile,
  guessLaneOpponent,
  guessOwnPosition,
} from './match-context';

/** Estatísticas agregadas (Mestre+ BR, EUW e KR) de um campeão, com importação das opções. */
@Component({
  selector: 'app-champion-stats',
  templateUrl: './champion-stats.html',
  styleUrl: './champion-stats.scss',
  host: { '[class.wide]': 'wide()' },
})
export class ChampionStatsPanel {
  readonly championId = input.required<number>();
  /** Em duas colunas (aba da partida ao vivo), para caber sem rolar. */
  readonly wide = input(false);
  /** Rota pedida (ex.: a da seleção); sem ela, usa a rota mais jogada do campeão. */
  readonly position = input<string | null>(null);
  /** Campeões do time inimigo na partida (seleção ou partida ao vivo): ativa a build da partida. */
  readonly enemyIds = input<number[]>([]);
  /** Campeões do seu time: na partida ao vivo, sem rota informada, deduzem a sua. */
  readonly allyIds = input<number[]>([]);

  protected readonly ddragon = inject(DataDragonService);
  private readonly lcu = inject(LcuService);
  private readonly toast = inject(ToastService);

  protected readonly stats = signal<ChampionStats | null>(null);
  protected readonly loading = signal(false);
  protected readonly selectedPosition = signal<string | null>(null);
  /** Oponente escolhido (build contra ele); null mostra a build geral. */
  protected readonly opponentId = signal<number | null>(null);
  protected readonly busy = signal<string | null>(null);
  /** Oponente de rota detectado pelos campeões inimigos (antes de qualquer escolha manual). */
  protected readonly detectedOpponentId = signal<number | null>(null);

  /** Perfil de dano estimado do time inimigo. */
  protected readonly enemyProfile = computed(() =>
    damageProfile(this.enemyIds().map((id) => this.ddragon.champion(id))),
  );
  protected readonly matchMode = computed(() => this.enemyIds().some((id) => id > 0));
  protected readonly damageLabel = (damage: string) =>
    damage === 'ap' ? 'dano mágico' : damage === 'ad' ? 'dano físico' : 'dano misto';

  protected readonly percent = percent;
  protected readonly positionLabel = statsPositionLabel;
  protected readonly connected = computed(() => this.lcu.state().status === 'connected');
  protected readonly inChampSelect = computed(
    () => this.lcu.state().gameflowPhase === 'ChampSelect',
  );

  protected readonly positions = computed(() => {
    const available = new Map((this.stats()?.positions ?? []).map((p) => [p.position, p]));
    return STATS_POSITIONS.filter((p) => available.has(p.value)).map((p) => ({
      ...p,
      ...available.get(p.value)!,
    }));
  });

  constructor() {
    effect(() => {
      const championId = this.championId();
      const position = this.position()?.toUpperCase() || null;
      const enemies = this.enemyIds().filter((id) => id > 0);
      const allies = this.allyIds().filter((id) => id > 0);
      this.ddragon.version();
      untracked(() => {
        this.selectedPosition.set(position);
        void this.loadForMatch(championId, position, enemies, allies);
      });
    });
    effect(() => {
      if (this.ddragon.version()) void this.ddragon.loadAbilities(this.championId());
    });
  }

  protected selectPosition(position: string): void {
    this.selectedPosition.set(position);
    void this.loadForMatch(
      this.championId(),
      position,
      this.enemyIds().filter((id) => id > 0),
    );
  }

  protected selectOpponent(opponentId: number | null): void {
    this.opponentId.set(opponentId);
    void this.load(
      this.championId(),
      this.stats()?.position ?? this.selectedPosition(),
      opponentId,
    );
  }

  /**
   * Itens situacionais que valem destacar: fora do núcleo escolhido e comprados
   * pelo menos 10% mais vezes contra este perfil de dano do que no geral.
   */
  protected readonly situationalPicks = computed(() => {
    const s = this.stats();
    const core = new Set((s?.core?.[0]?.key ?? '').split(',').map(Number));
    return (s?.situational?.items ?? [])
      .filter((i) => !core.has(i.itemId) && i.lift >= 1.1)
      .slice(0, 6);
  });

  /** Melhores e piores confrontos (já filtrados por amostra mínima no servidor). */
  protected readonly bestMatchups = computed(() =>
    [...(this.stats()?.matchups ?? [])].sort((a, b) => b.winRate - a.winRate).slice(0, 5),
  );
  protected readonly worstMatchups = computed(() =>
    [...(this.stats()?.matchups ?? [])].sort((a, b) => a.winRate - b.winRate).slice(0, 5),
  );

  protected readonly opponentOptions = computed(() =>
    this.ddragon.championList().filter((c) => c.key !== this.championId()),
  );

  /** Ordem de habilidades: "1,3,2" -> [{ key: 'Q', ... }, ...]. */
  protected skills(key: string) {
    const list = this.ddragon.abilities().get(this.championId());
    return key.split(',').map((slot) => {
      const index = Number(slot) - 1;
      return {
        key: ['Q', 'W', 'E', 'R'][index],
        icon: list?.[index]?.icon ?? null,
        name: list?.[index]?.name ?? '',
      };
    });
  }

  protected rune(option: StatsOption) {
    const page = parseRuneKey(option.key);
    return {
      ...page,
      keystone: page.perks[0],
      minor: page.perks.slice(1, 6),
      shards: page.perks.slice(6),
    };
  }

  protected spells(option: StatsOption): number[] {
    return option.key.split(',').map(Number);
  }

  protected items(option: StatsOption): number[] {
    return option.key.split(',').map(Number);
  }

  protected async importRunes(option: StatsOption): Promise<void> {
    const { primary, sub, perks } = parseRuneKey(option.key);
    const champion = this.ddragon.champion(this.championId())?.name ?? 'Campeão';
    const page: RunePageSuggestion = {
      recommendationId: `stats:${option.key}`,
      keystone: { id: perks[0], name: this.ddragon.runeName(perks[0]), styleId: primary },
      primaryStyleId: primary,
      secondaryStyleId: sub,
      perks: perks.map((id) => ({ id, name: this.ddragon.runeName(id), styleId: 0 })),
      summonerSpellIds: this.stats()?.spells?.[0] ? this.spells(this.stats()!.spells![0]) : [],
    };
    await this.run(`runes:${option.key}`, async () => {
      const result = await window.builds!.applyRunes(
        page,
        `${champion} ${this.ddragon.runeName(perks[0])}`,
        this.inChampSelect(),
      );
      this.toast.show(
        `Runas em "${result.pageName}"${result.spellsApplied ? ' + feitiços' : ''}.`,
        'success',
      );
    });
  }

  protected async importItems(core: StatsOption): Promise<void> {
    const stats = this.stats();
    const champion = this.ddragon.champion(this.championId())?.name ?? 'Campeão';
    const boots = stats?.boots?.[0] ? [Number(stats.boots[0].key)] : [];
    const build: ItemBuild = {
      file: `stats-${this.championId()}-${core.key}`,
      championId: this.championId(),
      position: stats?.position?.toLowerCase() ?? null,
      title: `${champion} · Mestre+ ${percent(core.winRate, 0)}`,
      maps: [11],
      blocks: [
        ...(stats?.start?.[0]
          ? [{ name: 'Itens iniciais', items: this.items(stats.start[0]) }]
          : []),
        { name: `Núcleo (${percent(core.winRate, 0)} de vitórias)`, items: this.items(core) },
        ...(boots.length ? [{ name: 'Botas', items: boots }] : []),
        ...(this.situationalPicks().length
          ? [
              {
                name: `Contra este time (${this.damageLabel(stats!.situational!.damage)})`,
                items: this.situationalPicks().map((i) => i.itemId),
              },
            ]
          : []),
      ],
    };
    await this.run(`items:${core.key}`, async () => {
      const title = await window.builds!.applyItems(this.championId(), build);
      this.toast.show(`Conjunto "${title}" salvo. Aparece na loja durante a partida.`, 'success');
    });
  }

  /** Build da partida: detecta o oponente de rota e pede os itens para o perfil de dano inimigo. */
  private async loadForMatch(
    championId: number,
    position: string | null,
    enemies: number[],
    allies: number[] = [],
  ): Promise<void> {
    let opponent: number | null = null;
    if (enemies.length > 0) {
      const tierList = await allPositionsTierList();
      // Sem rota informada: deduz pelo seu time; sem time, usa a mais jogada do campeão.
      position ??=
        (allies.length > 0 ? guessOwnPosition(championId, allies, tierList) : null) ??
        [...tierList]
          .filter((t) => t.championId === championId)
          .sort((a, b) => b.games - a.games)[0]?.position ??
        null;
      if (position) this.selectedPosition.set(position);
      opponent = guessLaneOpponent(position, enemies, tierList);
    }
    this.detectedOpponentId.set(opponent);
    this.opponentId.set(opponent);
    await this.load(championId, position, opponent);
  }

  private async load(
    championId: number,
    position: string | null,
    opponentId: number | null,
  ): Promise<void> {
    if (!window.stats) return;
    this.loading.set(true);
    try {
      this.stats.set(
        await window.stats.champion(
          championId,
          position,
          opponentId,
          this.enemyProfile()?.damage ?? null,
        ),
      );
    } catch {
      this.stats.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private async run(key: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    try {
      await action();
    } catch (error) {
      this.toast.show(errorText(error), 'error');
    } finally {
      this.busy.set(null);
    }
  }
}
