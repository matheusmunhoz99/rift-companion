import { desktopCapturer, screen, type NativeImage } from 'electron';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Configurações do jogo que mudam onde o minimapa fica (Config/game.cfg). */
export interface MinimapLayout {
  width: number;
  height: number;
  /** 0 a 3 no jogo; quanto maior, maior o minimapa. */
  scale: number;
  /** Minimapa no canto esquerdo. */
  flipped: boolean;
}

export interface MinimapCapture {
  /** Recorte do canto do minimapa em JPEG (até 512 px de lado). */
  jpeg: Buffer;
  /** Quadro todo preto: o jogo em tela cheia exclusiva não deixa capturar. */
  black: boolean;
  at: number;
}

const OUT_SIZE = 512;
/** Amostras guardadas por partida para calibrar o detector (uma a cada 15 s dá uns 40 min). */
const MAX_SAMPLES = 160;

export async function readMinimapLayout(installDirectory: string | null): Promise<MinimapLayout> {
  const fallback: MinimapLayout = { width: 1920, height: 1080, scale: 1, flipped: false };
  for (const directory of [installDirectory, 'C:\\Riot Games\\League of Legends'].filter((d): d is string => !!d)) {
    try {
      const cfg = await readFile(path.join(directory, 'Config', 'game.cfg'), 'utf8');
      const value = (key: string) => cfg.match(new RegExp(`^\\s*${key}\\s*=\\s*([\\d.]+)`, 'm'))?.[1];
      return {
        width: Number(value('Width')) || fallback.width,
        height: Number(value('Height')) || fallback.height,
        scale: Number(value('MinimapScale') ?? 1),
        flipped: value('FlipMiniMap') === '1',
      };
    } catch {
      // Tenta o próximo diretório.
    }
  }
  return fallback;
}

/**
 * Região do minimapa na tela (pixels da captura). O minimapa é quadrado e fica no canto de
 * baixo; o lado cresce com a escala do jogo. A conta é larga de propósito (pega um pouco de
 * borda): a IA e o detector procuram o mapa dentro do recorte.
 */
export function minimapRegion(layout: MinimapLayout, captureWidth: number, captureHeight: number) {
  const fraction = Math.min(0.5, 0.2 + 0.075 * Math.max(0, Math.min(3, layout.scale)));
  const side = Math.round(captureHeight * fraction);
  return {
    x: layout.flipped ? 0 : captureWidth - side,
    y: captureHeight - side,
    width: side,
    height: side,
  };
}

/** Quadro preto (ou quase): média de brilho baixa numa grade de pontos. */
export function isBlack(bitmap: Buffer, width: number, height: number): boolean {
  if (!width || !height || bitmap.length < width * height * 4) return true;
  let sum = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 24));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      sum += bitmap[i] + bitmap[i + 1] + bitmap[i + 2];
      count++;
    }
  }
  return sum / (count * 3) < 6;
}

/**
 * Captura a tela principal (onde o jogo abre) e recorta o canto do minimapa. Só lê pixels
 * da tela, como um programa de gravação: não toca no jogo nem na memória dele.
 */
export async function captureMinimap(layout: MinimapLayout): Promise<MinimapCapture | null> {
  const primary = screen.getPrimaryDisplay();
  const size = {
    width: Math.round(primary.size.width * primary.scaleFactor),
    height: Math.round(primary.size.height * primary.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const source = sources.find((s) => s.display_id === String(primary.id)) ?? sources[0];
  if (!source) return null;
  const image: NativeImage = source.thumbnail;
  const { width, height } = image.getSize();
  if (!width || !height) return null;
  const region = minimapRegion(layout, width, height);
  const crop = image.crop(region);
  const black = isBlack(crop.toBitmap(), region.width, region.height);
  const out = region.width > OUT_SIZE ? crop.resize({ width: OUT_SIZE, height: OUT_SIZE, quality: 'good' }) : crop;
  return { jpeg: out.toJPEG(82), black, at: Date.now() };
}

/** Guarda uma amostra do minimapa da partida (só com o gravador ligado nas configurações). */
export function saveSample(directory: string, gameKey: string, gameTime: number, capture: MinimapCapture): boolean {
  const folder = path.join(directory, gameKey);
  mkdirSync(folder, { recursive: true });
  if (readdirSync(folder).length >= MAX_SAMPLES) return false;
  const t = Math.round(gameTime);
  const name = `t${String(Math.floor(t / 60)).padStart(2, '0')}m${String(t % 60).padStart(2, '0')}s${capture.black ? '-preto' : ''}.jpg`;
  writeFileSync(path.join(folder, name), capture.jpeg);
  return true;
}
