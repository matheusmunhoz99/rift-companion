import { Component, signal } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAndroid } from './mobile-client';

interface UpdaterPlugin {
  info(): Promise<{ versionCode: number; versionName: string }>;
  install(options: { url: string }): Promise<void>;
  addListener(event: 'progress', handler: (data: { progress: number }) => void): Promise<{ remove: () => void }>;
}

interface AndroidManifest {
  versionCode: number;
  versionName: string;
  url: string;
  notes?: string;
}

const MANIFEST_URL = 'https://rift-api.workscanner.com.br/downloads/android.json';
const updater = registerPlugin<UpdaterPlugin>('RiftUpdater');

export const androidUpdate = signal<AndroidManifest | null>(null);
export const androidUpdateState = signal<'idle' | 'installing' | 'error'>('idle');
export const androidUpdateProgress = signal(0);

/** Procura uma versão nova do APK no servidor e avisa se houver. Só no Android. */
export async function checkAndroidUpdate(): Promise<void> {
  if (!isAndroid) return;
  try {
    const [installed, response] = await Promise.all([
      updater.info(),
      fetch(`${MANIFEST_URL}?t=${Date.now()}`),
    ]);
    if (!response.ok) return;
    const manifest = (await response.json()) as AndroidManifest;
    if (manifest?.versionCode > installed.versionCode && manifest.url?.startsWith('https://')) {
      androidUpdate.set(manifest);
    }
  } catch {
    // Sem internet ou servidor fora: tenta de novo na próxima abertura.
  }
}

export async function installAndroidUpdate(): Promise<void> {
  const manifest = androidUpdate();
  if (!manifest || androidUpdateState() === 'installing') return;
  androidUpdateState.set('installing');
  androidUpdateProgress.set(0);
  const listener = await updater.addListener('progress', ({ progress }) => androidUpdateProgress.set(progress));
  try {
    await updater.install({ url: manifest.url });
    // O instalador do Android assume a partir daqui.
  } catch {
    androidUpdateState.set('error');
  } finally {
    void listener.remove();
    if (androidUpdateState() === 'installing') androidUpdateState.set('idle');
  }
}

export function dismissAndroidUpdate(): void {
  androidUpdate.set(null);
}

@Component({
  selector: 'app-android-update',
  template: `
    @if (update(); as u) {
      <div class="android-update" role="status">
        <div class="info">
          <strong>Atualização disponível</strong>
          <span>Versão {{ u.versionName }}{{ u.notes ? ' · ' + u.notes : '' }}</span>
        </div>
        @if (state() === 'installing') {
          <div class="bar"><span [style.width.%]="progress() * 100"></span></div>
        } @else {
          <div class="actions">
            <button type="button" class="btn small" (click)="install()">Atualizar</button>
            <button type="button" class="btn ghost small" (click)="dismiss()">Depois</button>
          </div>
        }
        @if (state() === 'error') {
          <span class="err">Não foi possível atualizar. Tente de novo.</span>
        }
      </div>
    }
  `,
  styles: `
    .android-update {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 14px;
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
      border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--accent-soft), transparent 70%);
      margin-bottom: 16px;
    }
    .info {
      display: grid;
      flex: 1;
      min-width: 150px;
      gap: 2px;
    }
    .info strong {
      font-size: 14px;
    }
    .info span {
      font-size: 12px;
      color: var(--muted);
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .bar {
      flex: 1 1 100%;
      height: 6px;
      border-radius: 3px;
      overflow: hidden;
      background: var(--well);
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--accent);
      transition: width 0.1s linear;
    }
    .err {
      flex: 1 1 100%;
      font-size: 12px;
      color: var(--danger);
    }
  `,
})
export class AndroidUpdate {
  protected readonly update = androidUpdate;
  protected readonly state = androidUpdateState;
  protected readonly progress = androidUpdateProgress;
  protected install = installAndroidUpdate;
  protected dismiss = dismissAndroidUpdate;
}
