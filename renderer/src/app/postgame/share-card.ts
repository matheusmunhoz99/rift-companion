import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { DataDragonService } from '../data-dragon/data-dragon.service';
import type { PostGame, PostGamePlayer } from '../history/riot.types';

const MULTIKILL: Record<number, string> = { 2: 'Abate duplo', 3: 'Abate triplo', 4: 'Abate quádruplo', 5: 'PENTAKILL' };

/**
 * Card do fim de jogo para mandar no WhatsApp ou postar: arte do campeão, resultado, nota,
 * KDA e os destaques, com a marca do Rift Companion. A imagem é a própria tela (o processo
 * principal recorta o card), então sai igual ao que aparece aqui.
 */
@Component({
  selector: 'app-share-card',
  template: `
    <div class="backdrop" (click)="closed.emit()">
      <div class="dialog" role="dialog" aria-label="Compartilhar partida" (click)="$event.stopPropagation()">
        @if (card(); as c) {
          <div #card class="card" [class.win]="c.win === true" [class.loss]="c.win === false">
            <img class="art" [src]="c.art" alt="" (load)="artReady.set(true)" (error)="artReady.set(true)" />
            <span class="shade" aria-hidden="true"></span>

            <div class="top">
              <span class="result">{{ c.result }}</span>
              <span class="meta">{{ c.mode }} · {{ c.duration }}</span>
            </div>

            <div class="hero">
              <span class="champ">{{ c.champion }}</span>
              <span class="player">{{ c.player }} · nível {{ c.level }}</span>
              <div class="badges">
                @if (c.mvp) {
                  <span class="badge gold">{{ c.mvp }}</span>
                }
                @if (c.multikill) {
                  <span class="badge hot">{{ c.multikill }}</span>
                }
              </div>
            </div>

            <div class="score" [attr.data-tone]="c.tone">
              <strong class="num">{{ c.score }}</strong>
              <span>nota · {{ c.rank }}º de 10</span>
            </div>

            <div class="stats">
              <span class="stat wide">
                <strong class="num">{{ c.kda }}</strong>
                <small>KDA {{ c.kdaRatio }}</small>
              </span>
              <span class="stat"><strong class="num">{{ c.damage }}</strong><small>de dano</small></span>
              <span class="stat"><strong class="num">{{ c.cs }}</strong><small>CS · {{ c.csMin }}/min</small></span>
              <span class="stat"><strong class="num">{{ c.kp }}%</strong><small>participação</small></span>
              <span class="stat"><strong class="num">{{ c.vision }}</strong><small>de visão</small></span>
            </div>

            <div class="brand">
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="M16 1.8 28.3 8.9V23.1L16 30.2 3.7 23.1V8.9Z" fill="#141821" stroke="#ff8a5c" stroke-width="1.6" />
                <path d="M16 6.5 23 16 16 25.5 9 16Z" fill="#e8455a" />
                <path d="M8.6 12.6 23.4 19.4" stroke="#141821" stroke-width="1.8" />
              </svg>
              <span>Rift <b>Companion</b></span>
              <em>matheusmunhoz99.github.io/rift-companion</em>
            </div>
          </div>

          <div class="actions">
            @if (canCapture) {
              <button type="button" class="btn" [disabled]="busy() || !artReady()" (click)="capture('copy')">
                {{ busy() === 'copy' ? 'Copiando…' : 'Copiar imagem' }}
              </button>
              <button type="button" class="btn ghost" [disabled]="busy() || !artReady()" (click)="capture('save')">
                {{ busy() === 'save' ? 'Salvando…' : 'Salvar imagem' }}
              </button>
            } @else {
              <p class="muted">Tire um print da tela para compartilhar.</p>
            }
            <button type="button" class="btn ghost" (click)="closed.emit()">Fechar</button>
          </div>
          @if (canCapture) {
            <p class="hint">Copie e cole direto no WhatsApp, Discord ou Instagram (Ctrl+V).</p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(5, 7, 11, 0.78);
      backdrop-filter: blur(4px);
    }
    .dialog {
      display: grid;
      justify-items: center;
      gap: 12px;
      max-height: 100%;
      overflow: auto;
    }
    .card {
      --side: var(--win);
      position: relative;
      width: min(540px, 86vw, calc(100vh - 150px));
      aspect-ratio: 1;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr auto auto;
      grid-template-columns: 1fr auto;
      gap: 0 16px;
      padding: 26px 28px 20px;
      border-radius: 18px;
      background: #0b0d13;
      color: #f1f3f8;
      font-family: var(--font-ui);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    }
    .card.loss {
      --side: var(--loss);
    }
    .art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 20%;
    }
    .shade {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(8, 10, 15, 0.55) 0%, rgba(8, 10, 15, 0.05) 32%, rgba(8, 10, 15, 0.6) 62%, rgba(8, 10, 15, 0.96) 100%),
        linear-gradient(90deg, color-mix(in srgb, var(--side) 30%, transparent), transparent 60%);
    }
    .card > :not(.art, .shade) {
      position: relative;
    }
    .top {
      grid-column: 1 / -1;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .result {
      font-family: var(--font-display);
      font-size: 44px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--side);
      text-shadow: 0 2px 18px rgba(0, 0, 0, 0.6);
    }
    .meta {
      font-size: 13px;
      font-weight: 600;
      color: rgba(241, 243, 248, 0.85);
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
    }
    .hero {
      grid-column: 1;
      align-self: end;
      display: grid;
      gap: 4px;
      padding-bottom: 14px;
    }
    .champ {
      font-family: var(--font-display);
      font-size: 40px;
      font-weight: 800;
      line-height: 1;
      text-shadow: 0 2px 14px rgba(0, 0, 0, 0.7);
    }
    .player {
      font-size: 14px;
      color: rgba(241, 243, 248, 0.8);
    }
    .badges {
      display: flex;
      gap: 6px;
      margin-top: 6px;
      min-height: 24px;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .badge.gold {
      background: #f5c451;
      color: #241a02;
    }
    .badge.hot {
      background: #ff6a3d;
      color: #1b0b05;
    }
    .score {
      --tone: #f5c451;
      grid-column: 2;
      align-self: end;
      display: grid;
      justify-items: center;
      gap: 2px;
      margin-bottom: 14px;
      padding: 12px 16px;
      border: 2px solid var(--tone);
      border-radius: 16px;
      background: rgba(8, 10, 15, 0.7);
    }
    .score[data-tone='good'] {
      --tone: #34d399;
    }
    .score[data-tone='bad'] {
      --tone: #aeb4c2;
    }
    .score strong {
      font-family: var(--font-display);
      font-size: 42px;
      font-weight: 800;
      line-height: 1;
      color: var(--tone);
    }
    .score span {
      font-size: 11px;
      color: rgba(241, 243, 248, 0.75);
      white-space: nowrap;
    }
    .stats {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1.3fr repeat(4, 1fr);
      gap: 8px;
      padding: 12px 0 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.14);
    }
    .stat {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .stat strong {
      font-family: var(--font-display);
      font-size: 22px;
      font-weight: 700;
      line-height: 1.1;
    }
    .stat.wide strong {
      font-size: 26px;
    }
    .stat small {
      font-size: 11px;
      color: rgba(241, 243, 248, 0.65);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .brand {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }
    .brand svg {
      width: 20px;
      height: 20px;
    }
    .brand b {
      color: #ff8a5c;
    }
    .brand em {
      margin-left: auto;
      font-size: 11px;
      font-style: normal;
      color: rgba(241, 243, 248, 0.55);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--muted);
    }
  `,
})
export class ShareCard {
  readonly game = input.required<PostGame>();
  readonly player = input.required<PostGamePlayer>();
  readonly modeTitle = input('');
  readonly closed = output<void>();

  private readonly ddragon = inject(DataDragonService);
  private readonly toast = inject(ToastService);
  private readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');
  protected readonly busy = signal<'copy' | 'save' | null>(null);
  protected readonly artReady = signal(false);
  protected readonly canCapture = !!window.app?.captureImage;

  constructor() {
    // A tela da partida cria um contexto próprio para "position: fixed": o card sobe para o
    // body e cobre a janela toda (o Angular remove o nó de onde ele estiver ao fechar).
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    afterNextRender(() => document.body.appendChild(host));
    inject(DestroyRef).onDestroy(() => host.remove());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') this.closed.emit();
    };
    document.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', onKey));
  }

  protected readonly card = computed(() => {
    const game = this.game();
    const me = this.player();
    const champion = this.ddragon.champion(me.championId);
    const team = game.players.filter((p) => p.teamId === me.teamId);
    const bestOfTeam = team.every((p) => p.rank >= me.rank);
    const minutes = game.durationSeconds / 60;
    const teamKills = team.reduce((total, p) => total + p.kills, 0);
    return {
      win: game.myTeamWon,
      result: game.myTeamWon === null ? 'Fim de partida' : game.myTeamWon ? 'Vitória' : 'Derrota',
      mode: this.modeTitle() || 'Partida',
      duration: `${Math.floor(game.durationSeconds / 60)}:${String(game.durationSeconds % 60).padStart(2, '0')}`,
      art: champion ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg` : '',
      champion: champion?.name ?? '',
      player: me.riotId.split('#')[0],
      level: me.level,
      mvp: me.rank === 1 ? 'MVP da partida' : bestOfTeam ? 'Melhor do time' : null,
      multikill: MULTIKILL[Math.min(5, me.largestMultiKill)] ?? null,
      score: me.score.toFixed(1),
      rank: me.rank,
      // Mesmas faixas do anel da nota no fim de jogo.
      tone: me.score >= 8 ? 'good' : me.score >= 6 ? 'mid' : 'bad',
      kda: `${me.kills}/${me.deaths}/${me.assists}`,
      kdaRatio: me.deaths ? ((me.kills + me.assists) / me.deaths).toFixed(1) : 'Perfeito',
      damage: me.damageToChampions >= 1000 ? `${(me.damageToChampions / 1000).toFixed(1)}k` : String(me.damageToChampions),
      cs: me.cs,
      csMin: minutes > 0 ? (me.cs / minutes).toFixed(1) : '0',
      kp: teamKills ? Math.round(((me.kills + me.assists) / teamKills) * 100) : 0,
      vision: me.vision,
    };
  });

  protected async capture(action: 'copy' | 'save'): Promise<void> {
    const element = this.cardRef()?.nativeElement;
    if (!element || !window.app?.captureImage) return;
    this.busy.set(action);
    try {
      const r = element.getBoundingClientRect();
      const c = this.card();
      const name = `rift-${c.champion.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.kda.replace(/\//g, '-')}`;
      const done = await window.app.captureImage({ x: r.x, y: r.y, width: r.width, height: r.height }, action, name);
      if (done) this.toast.show(action === 'copy' ? 'Imagem copiada: é só colar (Ctrl+V).' : 'Imagem salva.', 'success');
    } catch {
      this.toast.show('Não foi possível gerar a imagem.', 'error');
    } finally {
      this.busy.set(null);
    }
  }
}
