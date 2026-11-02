import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { LcuService } from '../lcu/lcu.service';
import { isAndroid } from '../mobile/mobile-client';
import { PreferencesService } from './preferences.service';

/** Da seleção de campeões ao fim de jogo: o trecho em que o app vira "modo partida". */
const MATCH_PHASES = new Set([
  'ChampSelect',
  'GameStart',
  'InProgress',
  'Reconnect',
  'WaitingForStats',
  'PreEndOfGame',
  'EndOfGame',
]);

/**
 * Modo partida: enquanto a partida acontece (seleção, carregamento, jogo e fim de jogo) o
 * app usa a tela toda: o menu vira só ícones, o conteúdo fica mais largo, o topo mostra o
 * relógio e os próximos objetivos e (se a pessoa quiser) a janela cresce para a área útil do
 * monitor. Ao sair do fim de jogo tudo volta ao normal sozinho.
 *
 * Liga e desliga nas configurações; "Tela normal" sai só desta partida.
 */
@Injectable({ providedIn: 'root' })
export class MatchModeService {
  private readonly lcu = inject(LcuService);
  private readonly prefs = inject(PreferencesService);

  /** A partida está em andamento (da seleção ao fim de jogo). */
  readonly inMatch = computed(() => MATCH_PHASES.has(this.lcu.state().gameflowPhase ?? ''));

  /** A pessoa saiu do modo só nesta partida ("Tela normal"). */
  private readonly dismissed = signal(false);

  /** Disponível neste aparelho e ligado nas configurações. */
  readonly enabled = computed(() => !isAndroid && this.prefs.preferences().matchMode);

  readonly active = computed(() => this.enabled() && this.inMatch() && !this.dismissed());

  /** Mostra o botão para voltar ao modo partida (saiu dele nesta partida). */
  readonly canResume = computed(() => this.enabled() && this.inMatch() && this.dismissed());

  constructor() {
    // Partida terminou: a próxima começa no modo partida de novo.
    effect(() => {
      if (!this.inMatch()) untracked(() => this.dismissed.set(false));
    });
    // A janela acompanha o modo (e a opção de aumentá-la).
    effect(() => {
      const expand = this.active() && this.prefs.preferences().matchModeWindow;
      untracked(() => void window.app?.setMatchWindow?.(expand)?.catch(() => undefined));
    });
  }

  exit(): void {
    this.dismissed.set(true);
  }

  resume(): void {
    this.dismissed.set(false);
  }
}
