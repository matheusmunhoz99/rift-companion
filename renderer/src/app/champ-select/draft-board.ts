import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DataDragonService, type ChampionInfo } from '../data-dragon/data-dragon.service';
import type { ChampSelectState, TeamMember } from '../lcu/lcu.types';

const POSITION_SHORT: Record<string, string> = {
  top: 'TOP', jungle: 'JG', middle: 'MID', bottom: 'ADC', utility: 'SUP',
};
const POSITION_NAMES: Record<string, string> = {
  top: 'Topo', jungle: 'Selva', middle: 'Meio', bottom: 'Atirador', utility: 'Suporte',
};

interface Slot {
  member: TeamMember;
  champion: ChampionInfo | null;
  /** Ainda não confirmado: só olhando (hover) ou escolhido sem travar. */
  tentative: boolean;
  status: string;
}

/**
 * Quadro da seleção: os dois times lado a lado, quem está escolhendo ou banindo,
 * os inimigos aparecendo conforme confirmam, os banimentos e o tempo da fase.
 */
@Component({
  selector: 'app-draft-board',
  imports: [NgTemplateOutlet],
  templateUrl: './draft-board.html',
  styleUrl: './draft-board.scss',
})
export class DraftBoard {
  readonly session = input.required<ChampSelectState>();

  protected readonly ddragon = inject(DataDragonService);
  private readonly now = signal(Date.now());

  constructor() {
    // Só o relógio da fase depende disso; 4 vezes por segundo deixa o número certinho.
    const timer = setInterval(() => this.now.set(Date.now()), 250);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** ARAM: sem rotas nem banimentos; o campeão vem sorteado (ou dos oferecidos). */
  protected readonly aram = computed(() => this.session().benchEnabled);

  protected readonly secondsLeft = computed(() => {
    const endsAt = this.session().timerEndsAt;
    return endsAt ? Math.max(0, Math.ceil((endsAt - this.now()) / 1000)) : null;
  });

  protected readonly myTurn = computed<'pick' | 'ban' | null>(() => {
    const session = this.session();
    if (session.banActionId != null) return 'ban';
    return session.pickActionId !== null ? 'pick' : null;
  });

  protected readonly phaseLabel = computed(() => {
    const session = this.session();
    switch (session.phase) {
      case 'PLANNING': return 'Declarando intenções';
      case 'FINALIZATION': return session.benchEnabled ? 'Trocas e banco' : 'Últimos ajustes';
      case 'GAME_STARTING': return 'A partida vai começar';
      default: {
        if (session.subsetPicks) return 'Escolha inicial';
        if (session.benchEnabled) return 'Campeões sorteados';
        const banning = [...session.team, ...(session.enemies ?? [])].some((m) => m.acting === 'ban');
        return banning ? 'Banimentos' : 'Escolhas';
      }
    }
  });

  protected readonly allies = computed(() => this.session().team.map((m) => this.slot(m, true)));
  protected readonly enemies = computed(() => (this.session().enemies ?? []).map((m) => this.slot(m, false)));

  protected readonly bans = computed(() => {
    const bans = this.session().bans ?? { ally: [], enemy: [] };
    return { ally: bans.ally.map((id) => this.ddragon.champion(id)), enemy: bans.enemy.map((id) => this.ddragon.champion(id)) };
  });

  protected icon(champion: ChampionInfo | null): string | null {
    return champion ? this.ddragon.championIconUrl(champion) : null;
  }

  protected art(champion: ChampionInfo | null): string | null {
    return champion ? `url("${this.ddragon.championCenteredUrl(champion)}")` : null;
  }

  protected spellIcon(id: number | undefined): string | null {
    return id ? this.ddragon.spellIconUrl(id) : null;
  }

  protected position(member: TeamMember): { short: string; name: string } | null {
    if (this.aram()) return null;
    const key = member.assignedPosition?.toLowerCase();
    return POSITION_SHORT[key] ? { short: POSITION_SHORT[key], name: POSITION_NAMES[key] } : null;
  }

  private slot(member: TeamMember, ally: boolean): Slot {
    const id = member.championId || member.hoverChampionId || 0;
    const champion = id ? this.ddragon.champion(id) : null;
    const locked = member.locked ?? member.championId > 0;
    const tentative = !!champion && !locked;
    let status: string;
    if (member.acting === 'ban') status = 'Banindo…';
    else if (member.acting === 'pick') status = champion ? `Olhando ${champion.name}` : 'Escolhendo…';
    else if (champion) status = locked ? champion.name : `Quer ${champion.name}`;
    else status = ally ? 'Aguardando' : 'Escondido';
    if (locked && champion) status = champion.name;
    return { member, champion, tentative, status };
  }
}

