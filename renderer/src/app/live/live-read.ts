import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { PreferencesService } from '../core/preferences.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { LiveDashboard, LiveRead, LiveReadRequest } from '../history/riot.types';
import { LcuService } from '../lcu/lcu.service';
import { ChampionDamageService } from '../stats/champion-damage.service';
import { enemyDamageRead } from './adaptive-build';
import { LiveDataService } from './live-data.service';
import { readTrigger, sessionKey, type ReadMark } from './live-read-trigger';
import { VoiceService } from './voice.service';

/** O botão "Ler agora" espera isso entre um pedido e outro. */
const MANUAL_GAP_MS = 20_000;
const TRIGGER_LABEL: Record<LiveReadRequest['trigger'], string> = {
  death: 'depois da sua morte',
  periodic: 'leitura de rotina',
  manual: 'pedida por você',
};

/**
 * Leitura da partida por IA, na aba Ao vivo: como está a partida para você agora e 2 ou 3
 * caminhos possíveis, cada um com o motivo. Opções, não ordens: quem decide é você. Pede
 * uma leitura quando você morre, de rotina a cada 4 min e no botão "Ler agora".
 */
@Component({
  selector: 'app-live-read',
  template: `
    @if (enabled() && live.data()) {
      <section class="ai" [class.loading]="loading()">
        <header>
          <span class="badge">IA</span>
          <strong>Leitura da partida</strong>
          @if (shown(); as s) {
            <span class="when">aos {{ clock(s.at) }} · {{ triggerLabel(s.trigger) }}</span>
          }
          <button type="button" class="btn ghost small" [disabled]="loading() || cooling()" (click)="manual()">
            {{ loading() ? 'Lendo…' : 'Ler agora' }}
          </button>
        </header>
        @if (shown(); as s) {
          <p class="situation">{{ s.read.situacao }}</p>
          @if (s.read.atencao) {
            <p class="warn">{{ s.read.atencao }}</p>
          }
          <ol class="options">
            @for (o of s.read.opcoes; track $index) {
              <li>
                <strong>{{ o.titulo }}</strong>
                @if (o.motivo) {<span>{{ o.motivo }}</span>}
              </li>
            }
          </ol>
          @if (s.read.itens.length) {
            <div class="items">
              @for (id of s.read.itens; track id) {
                <span class="item" [title]="ddragon.itemName(id)">
                  @if (ddragon.itemIconUrl(id); as src) {<img [src]="src" [alt]="ddragon.itemName(id)" />}
                  {{ ddragon.itemName(id) }}
                </span>
              }
            </div>
          }
          <p class="note">Opções para você escolher, lidas do placar do jogo. A decisão é sua.</p>
        } @else if (loading()) {
          <p class="muted">Lendo o placar da partida…</p>
        } @else if (failed()) {
          <p class="muted">Não deu para ler agora. Tente de novo em alguns segundos.</p>
        } @else {
          <p class="muted">A primeira leitura sai aos 3 minutos, quando você morrer ou no botão "Ler agora".</p>
        }
      </section>
    }
  `,
  styles: `
    .ai {
      display: grid;
      gap: 8px;
      margin-top: 10px;
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
      border-radius: var(--radius-sm);
      background: linear-gradient(180deg, var(--accent-soft), transparent 70%), var(--surface);
      transition: opacity var(--dur);
    }
    .ai.loading .situation,
    .ai.loading .options {
      opacity: 0.6;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 10px;
    }
    header .btn {
      margin-left: auto;
    }
    .badge {
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-ink);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .when {
      color: var(--faint);
      font-size: 12px;
    }
    p {
      margin: 0;
    }
    .situation {
      line-height: 1.45;
    }
    .warn {
      padding: 6px 10px;
      border-left: 3px solid var(--warning);
      border-radius: var(--radius-xs);
      background: color-mix(in srgb, var(--warning) 12%, transparent);
      font-size: 13px;
    }
    .options {
      display: grid;
      gap: 6px;
      margin: 0;
      padding-left: 20px;
    }
    .options li strong,
    .options li span {
      display: block;
    }
    .options li::marker {
      color: var(--accent);
      font-weight: 700;
    }
    .options span {
      color: var(--muted);
      font-size: 13px;
    }
    .items {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px 3px 3px;
      border-radius: var(--radius-xs);
      background: var(--surface-2);
      font-size: 12px;
    }
    .item img {
      width: 22px;
      height: 22px;
      border-radius: 4px;
    }
    .note,
    .muted {
      color: var(--faint);
      font-size: 12px;
    }
  `,
})
export class LiveReadPanel {
  protected readonly live = inject(LiveDataService);
  protected readonly ddragon = inject(DataDragonService);
  private readonly prefs = inject(PreferencesService);
  private readonly lcu = inject(LcuService);
  private readonly damage = inject(ChampionDamageService);
  private readonly voice = inject(VoiceService);

  protected readonly enabled = computed(() => this.prefs.preferences().liveRead && !!window.riot?.getLiveRead);
  protected readonly shown = signal<{ read: LiveRead; at: number; trigger: LiveReadRequest['trigger'] } | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly cooling = signal(false);
  private mark: ReadMark = { at: null, deaths: 0 };
  private session: string | null = null;
  private lastManual = 0;

  constructor() {
    effect(() => {
      const data = this.live.data();
      if (!data) {
        // Partida acabou: a próxima começa do zero.
        untracked(() => this.reset());
        return;
      }
      if (!this.enabled()) return;
      const me = data.players.find((p) => p.isMe);
      if (!me) return;
      untracked(() => {
        const trigger = readTrigger(data.gameTime, me.deaths, me.isDead, this.mark);
        if (trigger && !this.loading()) void this.request(data, trigger);
      });
    });
  }

  protected manual(): void {
    const data = this.live.data();
    if (!data || Date.now() - this.lastManual < MANUAL_GAP_MS) return;
    this.lastManual = Date.now();
    this.cooling.set(true);
    setTimeout(() => this.cooling.set(false), MANUAL_GAP_MS);
    void this.request(data, 'manual');
  }

  private reset(): void {
    this.mark = { at: null, deaths: 0 };
    this.session = null;
    this.shown.set(null);
    this.failed.set(false);
  }

  private async request(data: LiveDashboard, trigger: LiveReadRequest['trigger']): Promise<void> {
    const me = data.players.find((p) => p.isMe);
    if (!me || !window.riot?.getLiveRead) return;
    // Marca antes do pedido: a leitura do jogo chega a cada 2 s e não deve repetir o pedido.
    this.mark = { at: data.gameTime, deaths: me.deaths };
    this.session ??= sessionKey(data.me?.riotId ?? me.riotId, Math.round((Date.now() / 1000 - data.gameTime) / 60));
    this.loading.set(true);
    this.failed.set(false);
    try {
      const response = await window.riot.getLiveRead(this.toRequest(data, trigger, this.session));
      if (!this.live.data()) return;
      if (response?.read) {
        this.shown.set({ read: response.read, at: data.gameTime, trigger });
        if (trigger === 'death') this.speak(response.read);
      } else {
        this.failed.set(true);
      }
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Morto, esperando renascer: a voz lê as opções (com os avisos falados ligados). */
  private speak(read: LiveRead): void {
    const { voiceAlerts, liveReadVoice } = this.prefs.preferences();
    if (!voiceAlerts || !liveReadVoice || !read.opcoes.length) return;
    const options = read.opcoes.map((o, i) => `${i === 0 ? 'Uma opção' : 'Outra'}: ${o.titulo}`).join('. ');
    this.voice.say(`Leitura da partida. ${options}.`);
  }

  private toRequest(data: LiveDashboard, trigger: LiveReadRequest['trigger'], session: string): LiveReadRequest {
    const damage = enemyDamageRead(
      data.players.filter((p) => !p.ally),
      (enemy) => this.damage.of(this.ddragon.championKeyOf(enemy.championKey)),
      (enemy) => this.live.itemValue(enemy),
    );
    const objectives = data.objectives
      .filter((o) => o.state !== 'done')
      .map((o) => (o.state === 'alive' || o.at <= data.gameTime ? `${o.name} vivo` : `${o.name} nasce aos ${this.clock(o.at)}`));
    for (const inhibitor of data.timers?.inhibitors ?? []) {
      if (inhibitor.respawnAt > data.gameTime) {
        objectives.push(`${inhibitor.ally ? 'Seu inibidor' : 'Inibidor inimigo'}${inhibitor.lane ? ` do ${inhibitor.lane}` : ''} volta aos ${this.clock(inhibitor.respawnAt)}`);
      }
    }
    const team = (t: LiveDashboard['teams']['ally']) => ({
      kills: t.kills, towers: t.towers, inhibitors: t.inhibitors, dragons: t.dragons, barons: t.barons, heralds: t.heralds, grubs: t.grubs,
    });
    return {
      session,
      platformId: this.lcu.state().platformId ?? 'BR1',
      queueId: 0,
      mapId: data.mapNumber ?? null,
      gameMode: data.gameMode,
      gameTime: Math.round(data.gameTime),
      trigger,
      myGold: Math.round(data.me?.currentGold ?? 0),
      enemyDamage: damage?.profile ?? null,
      players: data.players
        .map((p) => ({
          champion: p.championName,
          championId: this.ddragon.championKeyOf(p.championKey),
          ally: p.ally,
          me: p.isMe,
          position: p.position ? p.position.toUpperCase() : null,
          level: p.level,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          cs: p.cs,
          items: p.items.map((item) => item.id).filter((id) => id > 0),
          itemValue: Math.round(this.live.itemValue(p)),
          dead: p.isDead,
        }))
        .filter((p) => p.championId > 0),
      teams: { ally: team(data.teams.ally), enemy: team(data.teams.enemy) },
      objectives: objectives.slice(0, 6),
    };
  }

  protected clock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  protected triggerLabel(trigger: LiveReadRequest['trigger']): string {
    return TRIGGER_LABEL[trigger];
  }
}
