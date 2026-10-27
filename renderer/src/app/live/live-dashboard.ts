import { Component, computed, inject, input, signal } from '@angular/core';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LiveEvent, LivePlayer } from '../history/riot.types';
import { positionOrder } from '../stats/match-context';
import { LiveDataService } from './live-data.service';

const DRAGONS: Record<string, { name: string; color: string }> = {
  Fire: { name: 'Infernal', color: '#ff7a45' },
  Water: { name: 'Oceano', color: '#4fc3f7' },
  Earth: { name: 'Montanha', color: '#c08a4e' },
  Air: { name: 'Nuvens', color: '#c3d0e0' },
  Hextech: { name: 'Hextec', color: '#3ad6d6' },
  Chemtech: { name: 'Quimtec', color: '#8bd450' },
  Elder: { name: 'Ancião', color: '#ecd27e' },
};
const LANE_SHORT: Record<string, string> = { TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'ADC', UTILITY: 'SUP' };

/** Dimensões do gráfico de vantagem (SVG em unidades do viewBox). */
const CHART = { width: 640, height: 150, pad: 6 };

/** Feitiço com recarga por cargas: o timer de um uso não diz nada. */
const UNTIMED_SPELLS = new Set(['SummonerSmite']);

/** O que a aba Jogadores sabe de cada um (por Riot ID em minúsculas): grupo e partidas com você. */
export interface PlayerTag {
  party: { color: string; label: string } | null;
  met: { together: number; against: number } | null;
}

interface Matchup {
  lane: string;
  ally: LivePlayer | null;
  enemy: LivePlayer | null;
}

@Component({
  selector: 'app-live-dashboard',
  templateUrl: './live-dashboard.html',
  styleUrl: './live-dashboard.scss',
})
export class LiveDashboardPanel {
  protected readonly live = inject(LiveDataService);
  protected readonly ddragon = inject(DataDragonService);

  readonly tags = input<ReadonlyMap<string, PlayerTag>>(new Map());

  protected readonly data = this.live.data;
  protected readonly clock = this.live.clock;

  protected readonly valueDiff = computed(() => this.live.teamValue().ally - this.live.teamValue().enemy);

  /** Rota a rota: seu jogador x o inimigo da mesma rota (sem rotas, na ordem do jogo). */
  protected readonly matchups = computed<Matchup[]>(() => {
    const players = this.data()?.players ?? [];
    const byLane = (ally: boolean) =>
      players.filter((p) => p.ally === ally).sort((a, b) => positionOrder(a.position) - positionOrder(b.position));
    const allies = byLane(true);
    const enemies = byLane(false);
    const rows: Matchup[] = [];
    for (let i = 0; i < Math.max(allies.length, enemies.length); i++) {
      const ally = allies[i] ?? null;
      const enemy = enemies[i] ?? null;
      rows.push({ lane: LANE_SHORT[ally?.position || enemy?.position || ''] ?? '', ally, enemy });
    }
    return rows;
  });

  protected readonly dead = computed(() => {
    const data = this.data();
    if (!data) return [];
    const elapsed = this.clock() - data.gameTime;
    return data.players
      .filter((p) => p.isDead)
      .map((p) => ({ player: p, seconds: Math.max(0, Math.ceil(p.respawnTimer - elapsed)) }))
      .filter((d) => d.seconds > 0)
      .sort((a, b) => a.seconds - b.seconds);
  });

  protected readonly csPerMinute = (player: LivePlayer) => {
    const minutes = this.clock() / 60;
    return minutes > 0.5 ? (player.cs / minutes).toFixed(1) : '0.0';
  };

  protected tagOf(player: LivePlayer): PlayerTag | null {
    return this.tags().get(player.riotId.toLowerCase()) ?? null;
  }

  protected metText(met: NonNullable<PlayerTag['met']>): string {
    const parts = [
      met.together ? `${met.together}x com você` : '',
      met.against ? `${met.against}x contra você` : '',
    ].filter(Boolean);
    return `Nas suas últimas 10 partidas: ${parts.join(' e ')}`;
  }

  /** Os dois feitiços do jogador, com o tempo que falta se alguém marcou o uso. */
  protected spells(player: LivePlayer) {
    const haste = this.ddragon.summonerHaste(player.items.map((item) => item.id));
    const timers = this.live.spellTimers();
    const clock = this.clock();
    return player.spellKeys.map((key, slot) => {
      const id = this.ddragon.spellIdOf(key);
      const base = this.ddragon.spellCooldown(id);
      const timed = base > 0 && !UNTIMED_SPELLS.has(key);
      const readyAt = timers.get(`${player.riotId}|${slot}`);
      const left = readyAt === undefined ? 0 : Math.ceil(readyAt - clock);
      const name = id ? this.ddragon.spellName(id) : key.replace(/^Summoner/, '');
      const cooldown = Math.round((base * 100) / (100 + haste));
      return {
        slot,
        icon: id ? this.ddragon.spellIconUrl(id) : null,
        name,
        timed,
        cooldown,
        left: left > 0 ? left : 0,
        title: !timed
          ? name
          : left > 0
            ? `${name}: volta em ${this.time(left)}. Clique para desfazer.`
            : `${name} (${this.time(cooldown)}${haste ? `, com ${haste} de aceleração dos itens` : ''}). Clique quando ele usar.`,
      };
    });
  }

  protected toggleSpell(player: LivePlayer, slot: number, cooldown: number): void {
    this.live.toggleSpell(`${player.riotId}|${slot}`, cooldown);
  }

  /** Contagem regressiva até um tempo de jogo; null quando já passou. */
  protected countdown(at: number): string | null {
    const seconds = Math.ceil(at - this.clock());
    return seconds > 0 ? this.time(seconds) : null;
  }

  protected time(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  protected thousands(value: number): string {
    return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  }

  protected signed(value: number): string {
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${this.thousands(Math.abs(value))}`;
  }

  protected dragon(type: string) {
    return DRAGONS[type] ?? { name: type || 'Dragão', color: 'var(--muted)' };
  }

  protected championIcon(player: LivePlayer): string | null {
    const champion = this.ddragon.champion(this.ddragon.championKeyOf(player.championKey));
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  /** Arte larga do campeão, no fundo da linha da rota. */
  protected championArt(player: LivePlayer): string | null {
    const champion = this.ddragon.champion(this.ddragon.championKeyOf(player.championKey));
    return champion ? `url("https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${champion.id}_0.jpg")` : null;
  }

  protected value(player: LivePlayer): number {
    return this.live.itemValue(player);
  }

  protected eventText(event: LiveEvent): string {
    switch (event.kind) {
      case 'kill':
        return `${event.killer || 'Alguém'} abateu ${event.victim}`;
      case 'first-blood':
        return `Primeiro abate: ${event.killer}`;
      case 'multikill':
        return `${event.killer}: ${{ 3: 'Triplo', 4: 'Quádruplo', 5: 'Pentakill' }[Number(event.detail)] ?? 'Multi'} abate`;
      case 'ace':
        return 'Ace: time inteiro abatido';
      case 'dragon': {
        const [type, stolen] = event.detail.split('|');
        return `Dragão ${this.dragon(type).name}${stolen ? ' (roubado)' : ''}`;
      }
      case 'baron':
        return `Barão Na'shor${event.detail === 'stolen' ? ' (roubado)' : ''}`;
      case 'herald':
        return 'Arauto do Vale';
      case 'grubs':
        return 'Larvas do Vazio';
      case 'atakhan':
        return 'Atakhan';
      case 'tower':
        return 'Torre derrubada';
      case 'inhibitor':
        return `Inibidor${event.detail ? ` do ${event.detail.toLowerCase()}` : ''} derrubado`;
    }
  }

  // Gráfico: vantagem em itens ao longo do tempo (positivo = seu time).
  protected readonly chart = computed(() => {
    const samples = this.live.history();
    if (samples.length < 2) return null;
    const { width, height, pad } = CHART;
    const maxAbs = Math.max(1000, ...samples.map((s) => Math.abs(s.diff)));
    const last = samples[samples.length - 1].time;
    const x = (t: number) => pad + (t / Math.max(last, 1)) * (width - pad * 2);
    const y = (d: number) => height / 2 - (d / maxAbs) * (height / 2 - pad);
    const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.time).toFixed(1)},${y(s.diff).toFixed(1)}`).join(' ');
    const area = `${line} L${x(last).toFixed(1)},${height / 2} L${x(samples[0].time).toFixed(1)},${height / 2} Z`;
    return { width, height, line, area, zero: height / 2, maxAbs, last, points: samples.map((s) => ({ ...s, x: x(s.time), y: y(s.diff) })) };
  });

  protected readonly hover = signal<{ time: number; diff: number; x: number; y: number } | null>(null);

  protected hoverChart(event: MouseEvent): void {
    const chart = this.chart();
    const target = event.currentTarget as SVGElement | null;
    if (!chart || !target) return;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * chart.width;
    const nearest = chart.points.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best));
    this.hover.set(nearest);
  }

  protected percent(value: number, total: number): number {
    return total > 0 ? (value / total) * 100 : 0;
  }
}
