import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type { OverlayData, OverlayPlayer } from '../core/app.types';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import { nextSkill, parseSkillKey, skillAdviceSupported } from './skill-advice';

const SKILL_KEYS = ['Q', 'W', 'E', 'R'];
const SHORT_NAMES: Record<string, string> = {
  dragon: 'Dragão',
  grubs: 'Larvas',
  herald: 'Arauto',
  atakhan: 'Atakhan',
  baron: 'Barão',
};

interface SkillPlan {
  championId: number;
  position: string | null;
  start: number[];
  order: number[];
}

/** Conteúdo da janela transparente exibida sobre o jogo. */
@Component({
  selector: 'app-overlay-view',
  templateUrl: './overlay-view.html',
  styleUrl: './overlay-view.scss',
})
export class OverlayView {
  private readonly ddragon = inject(DataDragonService);

  protected readonly data = signal<OverlayData | null>(null);
  private readonly receivedAt = signal(0);
  private readonly now = signal(Date.now());
  private readonly plan = signal<SkillPlan | null>(null);

  /** O jogo é lido a cada 2 s; entre leituras o relógio anda sozinho (o jogo não pausa). */
  protected readonly clock = computed(() => {
    const data = this.data();
    return data ? data.gameTime + Math.max(0, (this.now() - this.receivedAt()) / 1000) : 0;
  });

  protected readonly championId = computed(() => {
    const key = this.data()?.me?.championKey;
    return key ? this.ddragon.championKeyOf(key) : 0;
  });

  /** Você menos o inimigo da sua rota: CS, nível e valor dos itens. */
  protected readonly lane = computed(() => {
    const d = this.data();
    if (!d?.me || !d.opponent) return null;
    const champion = this.ddragon.champion(this.ddragon.championKeyOf(d.opponent.championKey));
    return {
      name: d.opponent.championName,
      icon: champion ? this.ddragon.championIconUrl(champion) : null,
      cs: d.me.cs - d.opponent.cs,
      level: d.me.level - d.opponent.level,
      gold: this.itemValue(d.me) - this.itemValue(d.opponent),
    };
  });

  /** Habilidade a evoluir agora, pela ordem mais jogada do campeão na rota. */
  protected readonly skill = computed(() => {
    const me = this.data()?.me;
    const plan = this.plan();
    if (!me?.skills || !plan || plan.championId !== this.championId() || plan.order.length === 0) return null;
    const next = nextSkill(me.level, me.skills, plan.start, plan.order);
    const icons = this.ddragon.abilities().get(plan.championId);
    return {
      next: next === null ? null : { key: SKILL_KEYS[next], icon: icons?.[next]?.icon ?? null },
      order: plan.order.map((i) => SKILL_KEYS[i]),
    };
  });

  protected readonly upcoming = computed(() => {
    const d = this.data();
    if (!d) return [];
    const clock = this.clock();
    return d.upcoming.map((o) => {
      const left = Math.ceil(o.at - clock);
      const alive = o.state === 'alive' || left <= 0;
      return {
        key: o.key,
        name: o.name === 'Dragão Ancião' ? 'Ancião' : (SHORT_NAMES[o.key] ?? o.name),
        alive,
        soon: !alive && left <= 60,
        label: alive ? 'vivo' : this.time(left),
      };
    });
  });

  constructor() {
    window.app?.onOverlayData((data) => {
      this.data.set(data);
      this.receivedAt.set(Date.now());
    });
    const tick = setInterval(() => this.now.set(Date.now()), 500);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));

    effect(() => {
      const championId = this.championId();
      const me = this.data()?.me;
      if (!championId || !me || !skillAdviceSupported(me.championKey)) return;
      const position = me.position || null;
      untracked(() => this.loadPlan(championId, position));
    });
  }

  private loadPlan(championId: number, position: string | null): void {
    const current = this.plan();
    if (current && current.championId === championId && current.position === position) return;
    // Marca antes de buscar: a leitura chega a cada 2 s e não deve repetir a consulta.
    this.plan.set({ championId, position, start: [], order: [] });
    void this.ddragon.loadAbilities(championId);
    window.stats
      ?.champion(championId, position)
      .then((stats) => {
        if (this.plan()?.championId !== championId) return;
        this.plan.set({
          championId,
          position,
          start: parseSkillKey(stats?.skillStart?.[0]?.key),
          order: parseSkillKey(stats?.skillOrder?.[0]?.key).filter((i) => i < 3),
        });
      })
      .catch(() => undefined);
  }

  private itemValue(player: OverlayPlayer): number {
    return player.items.reduce((total, item) => total + this.ddragon.itemCost(item.id) * Math.max(item.count, 1), 0);
  }

  protected time(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  protected gold(value: number): string {
    const abs = Math.abs(value);
    const text = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(abs);
    return value > 0 ? `+${text}` : value < 0 ? `-${text}` : '0';
  }

  /** Modos de Summoner's Rift mostram objetivos; ARAM e outros, só se houver algum. */
  protected hasObjectives(d: OverlayData): boolean {
    if (d.gameMode === 'CLASSIC' || d.gameMode === 'SWIFTPLAY') return true;
    return Object.values(d.objectives).some((count) => count.ally + count.enemy > 0);
  }
}
