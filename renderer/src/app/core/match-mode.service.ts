import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { LcuService } from '../lcu/lcu.service';
import { isAndroid } from '../mobile/mobile-client';
import { PreferencesService } from './preferences.service';

/** Carregamento e jogo: aqui o modo partida vira tela cheia de verdade, como a do LoL. */
const FULLSCREEN_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect']);

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

  /** Esc na tela cheia: sai dela só nesta partida (o resto do modo partida continua). */
  private readonly fullscreenDismissed = signal(false);

  /** A janela ocupa o monitor inteiro (tela cheia): o topo usa a largura toda, sem os botões de janela. */
  readonly fullscreen = signal(isFullscreen());

  /** Disponível neste aparelho e ligado nas configurações. */
  readonly enabled = computed(() => !isAndroid && this.prefs.preferences().matchMode);

  readonly active = computed(() => this.enabled() && this.inMatch() && !this.dismissed());

  /** Mostra o botão para voltar ao modo partida (saiu dele nesta partida). */
  readonly canResume = computed(() => this.enabled() && this.inMatch() && this.dismissed());

  constructor() {
    this.listen();
    // Partida terminou: a próxima começa no modo partida de novo.
    effect(() => {
      if (!this.inMatch()) untracked(() => {
        this.dismissed.set(false);
        this.fullscreenDismissed.set(false);
      });
    });
    // A janela acompanha o modo: tela cheia no carregamento e no jogo, aumentada na seleção
    // e no fim de jogo (cada uma com a sua opção), e o tamanho de antes fora da partida.
    effect(() => {
      const prefs = this.prefs.preferences();
      const fullscreen = this.active() && prefs.matchModeFullscreen && !this.fullscreenDismissed() &&
        FULLSCREEN_PHASES.has(this.lcu.state().gameflowPhase ?? '');
      const mode: boolean | 'fullscreen' = fullscreen ? 'fullscreen' : this.active() && prefs.matchModeWindow;
      untracked(() => void window.app?.setMatchWindow?.(mode)?.catch(() => undefined));
    });
  }

  private listen(): void {
    // O PC avisa quando a janela entra e sai da tela cheia (eventos da própria janela).
    window.app?.onFullscreenChanged?.((fullscreen) => this.fullscreen.set(fullscreen === true));
    // Esc sai da tela cheia, como no LoL; o modo partida (menu, timers) continua.
    addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.fullscreen() && this.active()) this.fullscreenDismissed.set(true);
    });
  }

  exit(): void {
    this.dismissed.set(true);
  }

  resume(): void {
    this.dismissed.set(false);
  }
}

/** Janela do tamanho do monitor inteiro: tela cheia (o BrowserWindow não marca display-mode). */
function isFullscreen(): boolean {
  return innerWidth >= screen.width && innerHeight >= screen.height;
}
