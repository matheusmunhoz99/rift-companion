import { Injectable, effect, inject, untracked } from '@angular/core';
import { PreferencesService } from '../core/preferences.service';
import { campNames } from './jungle-timers';
import { LiveDataService } from './live-data.service';

/** Aviso do campo da selva marcado: quantos segundos antes de ele voltar. */
const CAMP_WARNING_S = 15;
/** Janela do aviso: abrir o app depois disso não fala um aviso velho. */
const CAMP_WINDOW_S = 6;

/**
 * Avisos falados durante a partida, com a voz do Windows em português: objetivos (o
 * processo principal decide quando, os mesmos avisos do chat) e os campos da selva que você
 * marcou ("Seu azul volta em 15 segundos"). Também manda os campos marcados para o overlay.
 */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private readonly prefs = inject(PreferencesService);
  private readonly live = inject(LiveDataService);
  private readonly announced = new Set<string>();

  constructor() {
    window.app?.onSpeak?.((text) => this.say(text));

    // O overlay (outra janela) mostra a contagem dos campos marcados aqui.
    effect(() => {
      const camps = [...this.live.campTimers()].map(([key, backAt]) => ({ key, name: campNames(key)?.short ?? key, backAt }));
      window.app?.setCampTimers?.(camps);
    });

    effect(() => {
      const now = this.live.clock();
      const marks = this.live.campTimers();
      untracked(() => {
        if (!marks.size) {
          this.announced.clear();
          return;
        }
        for (const [key, backAt] of marks) {
          const left = backAt - now;
          const id = `${key}@${backAt}`;
          if (left > CAMP_WARNING_S || left <= CAMP_WARNING_S - CAMP_WINDOW_S || this.announced.has(id)) continue;
          this.announced.add(id);
          const names = campNames(key);
          if (names) this.say(`${names.spoken} volta em ${CAMP_WARNING_S} segundos`);
        }
      });
    });
  }

  /** Fala a frase (respeita a opção e o volume). `force`: exemplo nas configurações. */
  say(text: string, force = false): void {
    const { voiceAlerts, voiceVolume } = this.prefs.preferences();
    if ((!voiceAlerts && !force) || typeof speechSynthesis === 'undefined') return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    const voice = this.voice();
    if (voice) utterance.voice = voice;
    utterance.volume = Math.min(1, Math.max(0.1, voiceVolume));
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  }

  /** Uma voz em português (de preferência do Brasil); a Maria vem com o Windows em pt-BR. */
  private voice(): SpeechSynthesisVoice | null {
    const voices = speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang === 'pt-BR' && /maria|francisca|thalita/i.test(v.name)) ??
      voices.find((v) => v.lang.replace('_', '-').toLowerCase() === 'pt-br') ??
      voices.find((v) => v.lang.toLowerCase().startsWith('pt')) ??
      null
    );
  }
}
