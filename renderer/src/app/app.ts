import { Component, computed, inject, signal } from '@angular/core';
import { BuildPanel } from './builds/build-panel';
import { DataDragonService } from './data-dragon/data-dragon.service';
import { HistoryView } from './history/history-view';
import { LcuService } from './lcu/lcu.service';

const STATUS_LABELS = {
  'waiting-client': 'Aguardando o cliente do LoL',
  connecting: 'Conectando…',
  connected: 'Conectado ao cliente',
} as const;

const PHASE_LABELS: Record<string, string> = {
  None: 'No menu',
  Lobby: 'No lobby',
  Matchmaking: 'Procurando partida',
  ReadyCheck: 'Partida encontrada',
  ChampSelect: 'Seleção de campeões',
  GameStart: 'Iniciando partida',
  InProgress: 'Em partida',
  Reconnect: 'Reconectar',
  WaitingForStats: 'Aguardando estatísticas',
  PreEndOfGame: 'Fim de jogo',
  EndOfGame: 'Fim de jogo',
};

const POSITION_LABELS: Record<string, string> = {
  top: 'Topo',
  jungle: 'Selva',
  middle: 'Meio',
  bottom: 'Atirador',
  utility: 'Suporte',
};

@Component({
  selector: 'app-root',
  imports: [BuildPanel, HistoryView],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly lcu = inject(LcuService);
  protected readonly ddragon = inject(DataDragonService);

  protected readonly state = this.lcu.state;
  protected readonly tab = signal<'client' | 'history'>('client');
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.state().status]);

  protected readonly phaseLabel = computed(() => {
    const phase = this.state().gameflowPhase;
    return phase ? (PHASE_LABELS[phase] ?? phase) : '—';
  });

  protected readonly profileIconUrl = computed(() => {
    const summoner = this.state().summoner;
    return summoner ? this.ddragon.profileIconUrl(summoner.profileIconId) : null;
  });

  protected readonly selectedChampion = computed(() => {
    const champSelect = this.state().champSelect;
    if (!champSelect) return null;
    const championId = champSelect.championId || champSelect.pickIntentChampionId;
    const champion = championId ? this.ddragon.champion(championId) : null;
    return {
      locked: champSelect.championId > 0,
      champion,
      iconUrl: champion ? this.ddragon.championIconUrl(champion) : null,
      position: POSITION_LABELS[champSelect.assignedPosition] ?? null,
    };
  });

  protected readonly positions = Object.entries(POSITION_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  /** Campeão/rota escolhidos à mão, usados fora da seleção de campeões. */
  protected readonly manualChampionId = signal(0);
  protected readonly manualPosition = signal('');

  protected readonly inChampSelect = computed(() => !!this.state().champSelect);

  protected readonly buildChampionId = computed(() => {
    const champSelect = this.state().champSelect;
    if (champSelect) return champSelect.championId || champSelect.pickIntentChampionId;
    return this.manualChampionId();
  });

  protected readonly buildPosition = computed(() => {
    const champSelect = this.state().champSelect;
    return champSelect ? champSelect.assignedPosition : this.manualPosition();
  });
}
