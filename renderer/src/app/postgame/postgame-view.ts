import { Component, computed, inject, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { PostGamePlayer } from '../history/riot.types';
import { NavigationService } from '../core/navigation.service';
import { LcuService } from '../lcu/lcu.service';
import { queueName } from '../riot/labels';
import { PostGameService } from './postgame.service';

type MetricKey =
  | 'damageToChampions'
  | 'damageTaken'
  | 'damageMitigated'
  | 'gold'
  | 'cs'
  | 'vision'
  | 'healing'
  | 'structureDamage';

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'damageToChampions', label: 'Dano a campeões' },
  { key: 'damageTaken', label: 'Dano recebido' },
  { key: 'damageMitigated', label: 'Dano mitigado' },
  { key: 'gold', label: 'Ouro' },
  { key: 'cs', label: 'CS' },
  { key: 'vision', label: 'Visão' },
  { key: 'healing', label: 'Cura' },
  { key: 'structureDamage', label: 'Estruturas' },
];

/** O placar do fim de jogo traz só o modo interno, não o número da fila. */
const MODE_NAMES: Record<string, string> = {
  RANKED_SOLO_5x5: 'Ranqueada Solo/Duo',
  RANKED_FLEX_SR: 'Ranqueada Flex',
  NORMAL: 'Normal',
  SWIFTPLAY: 'Partida Rápida',
  CLASSIC: 'Partida',
  ARAM: 'ARAM',
  KIWI: 'ARAM: Desordem',
  CHERRY: 'Arena',
  URF: 'URF',
  ARURF: 'URF',
  ONEFORALL: 'Um por Todos',
  ULTBOOK: 'Livro de Ultimates',
  NEXUSBLITZ: 'Blitz do Nexus',
  STRAWBERRY: 'Swarm',
  PRACTICETOOL: 'Modo de treino',
};

const MULTIKILL: Record<number, string> = {
  2: 'Abate duplo',
  3: 'Abate triplo',
  4: 'Abate quádruplo',
  5: 'Pentakill',
};

/**
 * O que entra na nota (os mesmos pesos do cálculo em electron/lcu/postgame.ts).
 * Cada quesito compara você com o melhor da partida naquele quesito.
 */
const FORMULA: Array<{ label: string; weight: number; detail: string }> = [
  { label: 'Participação em abates', weight: 20, detail: '(abates + assistências) ÷ abates do seu time' },
  { label: 'Dano a campeões', weight: 20, detail: 'dano total causado a campeões inimigos' },
  { label: 'KDA', weight: 16, detail: '(abates + assistências) ÷ mortes' },
  { label: 'Ouro', weight: 10, detail: 'ouro ganho na partida' },
  { label: 'Visão', weight: 10, detail: 'placar de visão (sentinelas colocadas e destruídas)' },
  { label: 'Linha de frente', weight: 9, detail: 'dano recebido + dano mitigado' },
  { label: 'CS', weight: 6, detail: 'tropas e monstros abatidos' },
  { label: 'Estruturas', weight: 5, detail: 'dano a torres e inibidores' },
  { label: 'Vitória', weight: 4, detail: 'bônus para quem venceu' },
  { label: 'Mortes', weight: -12, detail: 'desconta quanto mais você morreu' },
];

interface Highlight {
  title: string;
  player: PostGamePlayer;
  value: string;
  /** "bom" (dourado) ou "ruim" (o lanterna do quesito). */
  tone: 'good' | 'bad' | 'neutral';
}

/**
 * Fim de partida: pódio dos 3 melhores, ranking de 1 a 10 pela nota, gráficos
 * por estatística e os destaques (quem mais fez e quem mais sofreu).
 */
@Component({
  selector: 'app-postgame-view',
  templateUrl: './postgame-view.html',
  styleUrl: './postgame-view.scss',
})
export class PostGameView {
  protected readonly ddragon = inject(DataDragonService);
  private readonly nav = inject(NavigationService);
  private readonly lcu = inject(LcuService);
  protected readonly game = inject(PostGameService).game;

  protected readonly metrics = METRICS;
  protected readonly metric = signal<MetricKey>('damageToChampions');
  protected readonly formula = FORMULA;
  protected readonly showFormula = signal(false);

  /** Arte do seu campeão no fundo do resultado. */
  protected readonly heroArt = computed(() => {
    const me = this.me();
    const champion = me ? this.ddragon.champion(me.championId) : null;
    return champion ? `url("https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg")` : null;
  });

  protected art(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? `url("${this.ddragon.championLoadingUrl(champion)}")` : null;
  }

  /** Anel da nota: comprimento do traço (circunferência 2πr com r = 52). */
  protected ringDash(score: number): string {
    const length = 2 * Math.PI * 52;
    return `${(Math.max(0, Math.min(10, score)) / 10) * length} ${length}`;
  }

  protected perMinute(value: number, seconds: number): string {
    return seconds > 0 ? (value / (seconds / 60)).toFixed(1) : '0';
  }

  /** Seu time; sem você na lista (espectador), o time azul. */
  private readonly myTeam = computed(() => this.game()?.players.find((p) => p.isMe)?.teamId ?? 100);
  protected readonly me = computed(() => this.game()?.players.find((p) => p.isMe) ?? null);

  protected readonly ranking = computed(() =>
    [...(this.game()?.players ?? [])].sort((a, b) => a.rank - b.rank),
  );
  /** Ordem do pódio: 2º, 1º, 3º. */
  protected readonly podium = computed(() => {
    const [first, second, third] = this.ranking();
    return [second, first, third].filter((p): p is PostGamePlayer => !!p);
  });

  protected readonly bars = computed(() => {
    const key = this.metric();
    const players = [...(this.game()?.players ?? [])].sort((a, b) => b[key] - a[key]);
    const max = Math.max(1, ...players.map((p) => p[key]));
    return players.map((p) => ({ player: p, value: p[key], width: (p[key] / max) * 100 }));
  });

  /** Como o dano de cada time se dividiu entre os 5. */
  protected readonly damageSplit = computed(() => {
    const players = this.game()?.players ?? [];
    return [true, false].map((ally) => ({
      ally,
      players: players
        .filter((p) => (p.teamId === this.myTeam()) === ally)
        .sort((a, b) => b.damageShare - a.damageShare),
    }));
  });

  protected readonly highlights = computed<Highlight[]>(() => {
    const players = this.game()?.players ?? [];
    if (!players.length) return [];
    const top = (pick: (p: PostGamePlayer) => number) =>
      players.reduce((best, p) => (pick(p) > pick(best) ? p : best));
    const list: Highlight[] = [];
    const add = (
      title: string,
      pick: (p: PostGamePlayer) => number,
      format: (p: PostGamePlayer) => string,
      tone: Highlight['tone'] = 'good',
    ) => {
      const player = top(pick);
      if (pick(player) > 0) list.push({ title, player, value: format(player), tone });
    };
    add(
      'Mais dano',
      (p) => p.damageToChampions,
      (p) => this.thousands(p.damageToChampions),
    );
    add(
      'Mais dano recebido',
      (p) => p.damageTaken,
      (p) => this.thousands(p.damageTaken),
      'neutral',
    );
    add(
      'Mais abates',
      (p) => p.kills,
      (p) => `${p.kills} abates`,
    );
    add(
      'Melhor KDA',
      (p) => this.kdaValue(p),
      (p) => this.kda(p),
    );
    const multi = top((p) => p.largestMultiKill);
    if (multi.largestMultiKill >= 2) {
      list.push({
        title: 'Maior multiabate',
        player: multi,
        value: MULTIKILL[Math.min(5, multi.largestMultiKill)],
        tone: 'good',
      });
    }
    add(
      'Mais visão',
      (p) => p.vision,
      (p) => `${p.vision} de visão`,
    );
    add(
      'Mais ouro',
      (p) => p.gold,
      (p) => this.thousands(p.gold),
    );
    add(
      'Mais CS',
      (p) => p.cs,
      (p) => `${p.cs} CS`,
    );
    add(
      'Mais cura',
      (p) => p.healing,
      (p) => this.thousands(p.healing),
      'neutral',
    );
    add(
      'Mais dano em torres',
      (p) => p.structureDamage,
      (p) => this.thousands(p.structureDamage),
    );
    add(
      'Morreu mais',
      (p) => p.deaths,
      (p) => `${p.deaths} mortes`,
      'bad',
    );
    return list;
  });

  protected readonly title = computed(() => {
    const game = this.game();
    if (!game) return '';
    if (game.queueId) return queueName(game.queueId);
    return MODE_NAMES[game.queueType] ?? MODE_NAMES[game.gameMode] ?? 'Partida';
  });

  protected ally(player: PostGamePlayer): boolean {
    return player.teamId === this.myTeam();
  }

  protected icon(championId: number): string | null {
    const champion = this.ddragon.champion(championId);
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected championName(championId: number): string {
    return this.ddragon.champion(championId)?.name ?? '';
  }

  protected name(riotId: string): string {
    return riotId.split('#')[0] || 'Jogador';
  }

  protected kdaValue(p: PostGamePlayer): number {
    return (p.kills + p.assists) / Math.max(1, p.deaths);
  }

  protected kda(p: PostGamePlayer): string {
    return p.deaths === 0 ? 'Perfeito' : `${this.kdaValue(p).toFixed(2)} KDA`;
  }

  protected thousands(value: number): string {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  }

  protected duration(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  }

  protected ago(timestamp: number): string {
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`;
  }

  /** Cor da nota: verde a partir de 8, âmbar de 6 a 8, cinza abaixo. */
  protected scoreTone(score: number): string {
    return score >= 8 ? 'high' : score >= 6 ? 'mid' : 'low';
  }

  protected openPlayer(player: PostGamePlayer): void {
    if (player.riotId.includes('#'))
      this.nav.openPlayer(player.riotId, this.lcu.state().platformId);
  }
}
