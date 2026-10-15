import { Component, signal } from '@angular/core';
import type { OverlayData } from '../core/app.types';

/** Conteúdo da janela transparente exibida sobre o jogo. */
@Component({
  selector: 'app-overlay-view',
  template: `
    @if (data(); as d) {
      <div class="bar">
        <span class="time">{{ clock(d.gameTime) }}</span>
        @if (d.me; as me) {
          <span class="sep"></span>
          <span class="stat"><b>{{ me.kills }}</b>/<b class="deaths">{{ me.deaths }}</b>/<b>{{ me.assists }}</b></span>
          <span class="stat"><b>{{ me.cs }}</b> CS <small>{{ me.csPerMinute.toFixed(1) }}/min</small></span>
          <span class="stat gold"><b>{{ me.gold }}</b> ouro</span>
        }
        <span class="sep"></span>
        <span class="stat score">
          <b class="ally">{{ d.teamKills.ally }}</b> <small>abates</small> <b class="enemy">{{ d.teamKills.enemy }}</b>
        </span>
        @if (hasObjectives(d)) {
          <span class="sep"></span>
          <span class="stat"><small>Dragões</small> <b class="ally">{{ d.objectives.dragons.ally }}</b>:<b class="enemy">{{ d.objectives.dragons.enemy }}</b></span>
          <span class="stat"><small>Barões</small> <b class="ally">{{ d.objectives.barons.ally }}</b>:<b class="enemy">{{ d.objectives.barons.enemy }}</b></span>
          <span class="stat"><small>Torres</small> <b class="ally">{{ d.objectives.towers.ally }}</b>:<b class="enemy">{{ d.objectives.towers.enemy }}</b></span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding-top: 4px;
      -webkit-user-select: none;
      user-select: none;
    }
    .bar {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 7px 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      background: rgba(8, 9, 14, 0.82);
      color: #eef1f7;
      font-size: 13px;
      white-space: nowrap;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
    }
    .time {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #ff6a7c;
    }
    .sep {
      width: 1px;
      height: 16px;
      background: rgba(255, 255, 255, 0.15);
    }
    b {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    small {
      margin: 0 4px;
      color: #8a92a6;
      font-size: 11px;
    }
    .deaths,
    .enemy {
      color: #ff6a7c;
    }
    .ally {
      color: #6aa6ff;
    }
    .gold b {
      color: #f5c451;
    }
  `,
})
export class OverlayView {
  protected readonly data = signal<OverlayData | null>(null);

  constructor() {
    window.app?.onOverlayData((data) => this.data.set(data));
  }

  protected clock(seconds: number): string {
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  /** Modos de Summoner's Rift mostram objetivos; ARAM e outros, só se houver algum. */
  protected hasObjectives(d: OverlayData): boolean {
    if (d.gameMode === 'CLASSIC' || d.gameMode === 'SWIFTPLAY') return true;
    return Object.values(d.objectives).some((count) => count.ally + count.enemy > 0);
  }
}
