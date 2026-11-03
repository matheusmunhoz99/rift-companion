import path from 'node:path';
import { appLog } from '../app-log';
import type { LcuConnector } from '../lcu/connector';
import { fetchRawGameData } from '../overlay/live-client';
import { captureMinimap, readMinimapLayout, saveSample, type MinimapCapture, type MinimapLayout } from './screen-vision';

const SAMPLE_EVERY_MS = 15_000;
const IN_GAME = new Set(['InProgress', 'Reconnect']);

export interface VisionStatus {
  /** Última captura: null = ainda não capturou nesta partida; true = veio preta (tela cheia exclusiva). */
  black: boolean | null;
  /** Amostras gravadas nesta partida. */
  samples: number;
  folder: string;
}

/**
 * Visão da tela: o canto do minimapa vai junto na leitura da IA e, com o gravador ligado,
 * vira amostras para calibrar a detecção automática dos campos da selva. Só durante a
 * partida, e só o recorte do minimapa (nada do resto da tela sai do PC).
 */
export class VisionController {
  private timer: NodeJS.Timeout | null = null;
  private layout: MinimapLayout | null = null;
  private gameKey: string | null = null;
  private status: VisionStatus;

  constructor(
    private readonly connector: LcuConnector,
    private readonly samplesDirectory: string,
    private readonly prefs: () => { screenVision: boolean; visionSamples: boolean },
  ) {
    this.status = { black: null, samples: 0, folder: samplesDirectory };
    connector.on('state', () => this.sync());
  }

  getStatus(): VisionStatus {
    return { ...this.status };
  }

  sync(): void {
    const inGame = IN_GAME.has(this.connector.getState().gameflowPhase ?? '');
    const want = inGame && this.prefs().visionSamples;
    if (!inGame) {
      this.layout = null;
      this.gameKey = null;
      this.status = { black: null, samples: 0, folder: this.samplesDirectory };
    }
    if (want && !this.timer) {
      this.timer = setInterval(() => void this.sample(), SAMPLE_EVERY_MS);
      appLog('visão: gravador de amostras do minimapa ligado');
    } else if (!want && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Recorte do minimapa agora (para a leitura da IA); null fora da partida ou com a opção desligada. */
  async minimap(): Promise<MinimapCapture | null> {
    if (!this.prefs().screenVision || !IN_GAME.has(this.connector.getState().gameflowPhase ?? '')) return null;
    return this.capture();
  }

  private async capture(): Promise<MinimapCapture | null> {
    try {
      this.layout ??= await readMinimapLayout(this.connector.getCredentials()?.installDirectory ?? null);
      const capture = await captureMinimap(this.layout);
      if (capture && capture.black !== this.status.black) {
        appLog(capture.black ? 'visão: a captura veio preta (jogo em tela cheia exclusiva?)' : 'visão: captura do minimapa funcionando');
      }
      if (capture) this.status.black = capture.black;
      return capture;
    } catch (error) {
      appLog(`visão: falha na captura: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private async sample(): Promise<void> {
    const raw = await fetchRawGameData().catch(() => null);
    const gameTime = (raw as { gameData?: { gameTime?: number } } | null)?.gameData?.gameTime;
    if (typeof gameTime !== 'number') return;
    // Uma pasta por partida, pelo horário em que ela começou.
    this.gameKey ??= new Date(Date.now() - gameTime * 1000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const capture = await this.capture();
    if (!capture) return;
    if (saveSample(this.samplesDirectory, this.gameKey, gameTime, capture)) this.status.samples++;
  }

  folder(): string {
    return this.gameKey ? path.join(this.samplesDirectory, this.gameKey) : this.samplesDirectory;
  }
}
