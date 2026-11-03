import { Component, signal } from '@angular/core';
import { Icon } from '../ui/icon';

/** Versão cujas novidades esta tela apresenta; trocar quando houver outra grande. */
const RELEASE = '1.15';
const SEEN_KEY = 'rift.whatsNewSeen';

const HIGHLIGHTS = [
  {
    icon: 'live',
    title: 'Tela cheia na partida',
    text: 'No carregamento e no jogo o app fica em tela cheia como a do LoL: sem borda nem barra de tarefas. No segundo monitor entra na hora; no mesmo do jogo, quando você vem para o app. Esc sai.',
  },
  {
    icon: 'plan',
    title: 'Timers da selva',
    text: 'Na aba Ao vivo, toque no campo quando ele morrer (azul, vermelho, caranguejo...) e o app conta até ele voltar, da sua selva e da inimiga.',
  },
  {
    icon: 'book',
    title: 'Build que se adapta',
    text: 'Durante a partida o app lê o dano do time inimigo agora e mostra os próximos itens que jogadores Mestre+ do seu campeão compram contra ele. E avisa quem está forte.',
  },
  {
    icon: 'swords',
    title: 'Placar no fim de jogo',
    text: 'Os dois times lado a lado logo de cara: KDA, CS, dano, itens, nota e quem jogou de Duo ou Trio. O coach vem depois.',
  },
  {
    icon: 'layout',
    title: 'Você organiza a tela',
    text: 'O botão "Organizar" muda a ordem das seções e esconde o que você não usa. Na partida, os times já vêm primeiro.',
  },
  {
    icon: 'linked',
    title: 'Duo e Trio com certeza',
    text: 'Lido do próprio cliente do LoL, nos dois times, e marcado também na lista do histórico, sem abrir a partida.',
  },
];

/**
 * Novidades da versão na primeira vez que ela abre. Lembra no próprio aparelho.
 */
@Component({
  selector: 'app-whats-new',
  imports: [Icon],
  template: `
    @if (open()) {
      <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" (click)="close()">
        <article class="sheet" (click)="$event.stopPropagation()">
          <header class="hero">
            <span class="badge">Novidades</span>
            <h2 id="whats-new-title">Rift Companion <span class="num">1.14</span></h2>
            <p>Mais leitura de jogo, mais clareza e mais velocidade: veja o que mudou.</p>
          </header>
          <ul class="highlights">
            @for (item of highlights; track item.title) {
              <li>
                <span class="icon"><app-icon [name]="item.icon" [size]="20" /></span>
                <span>
                  <strong>{{ item.title }}</strong>
                  <span class="muted">{{ item.text }}</span>
                </span>
              </li>
            }
          </ul>
          <footer class="actions">
            <span class="muted small">Boas partidas.</span>
            <button type="button" class="btn big" (click)="close()">Começar</button>
          </footer>
        </article>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 60;
      display: grid;
      place-items: center;
      padding: 24px max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
      background: rgb(4 6 10 / 72%);
      backdrop-filter: blur(6px);
      animation: fade var(--dur) var(--ease-out);
    }
    .sheet {
      width: min(760px, 100%);
      max-height: 100%;
      overflow-y: auto;
      border: 1px solid var(--border-strong);
      border-radius: calc(var(--radius) + 4px);
      background: var(--surface);
      box-shadow: 0 30px 80px rgb(0 0 0 / 55%);
      animation: rise var(--dur-slow) var(--ease-spring);
    }
    .hero {
      display: grid;
      gap: 8px;
      padding: 28px 28px 22px;
      border-bottom: 1px solid var(--border);
      background:
        radial-gradient(120% 140% at 0% 0%, var(--accent-soft), transparent 60%),
        radial-gradient(90% 120% at 100% 0%, var(--ally-soft), transparent 55%);
    }
    .badge {
      justify-self: start;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-ink);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(28px, 4vw, 38px);
      line-height: 1.05;
      text-wrap: balance;
    }
    h2 .num {
      color: var(--accent);
    }
    .hero p {
      margin: 0;
      max-width: 52ch;
      color: var(--muted);
    }
    .highlights {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 0;
      padding: 20px 28px;
      list-style: none;
    }
    .highlights li {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--well);
    }
    .highlights li > span:last-child {
      display: grid;
      gap: 3px;
      font-size: 13px;
      line-height: 1.4;
    }
    .highlights strong {
      font-size: 14px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--accent-soft);
      color: var(--accent);
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 28px 24px;
    }
    @media (max-width: 640px) {
      .highlights {
        grid-template-columns: 1fr;
        padding: 16px 18px;
      }
      .hero {
        padding: 22px 18px 18px;
      }
      .actions {
        padding: 0 18px 18px;
        flex-direction: column-reverse;
        align-items: stretch;
      }
    }
    @keyframes fade {
      from { opacity: 0; }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
    }
    @media (prefers-reduced-motion: reduce) {
      .backdrop, .sheet { animation: none; }
    }
  `,
})
export class WhatsNew {
  protected readonly highlights = HIGHLIGHTS;
  protected readonly open = signal(shouldShow());

  protected close(): void {
    this.open.set(false);
    try {
      localStorage.setItem(SEEN_KEY, RELEASE);
    } catch {
      // Sem armazenamento: aparece de novo na próxima vez, sem outro efeito.
    }
  }
}

function shouldShow(): boolean {
  // Prints de revisão (#view=...) ficam sem ela, a não ser que peçam (#whatsnew).
  if (location.hash.includes('whatsnew')) return true;
  if (location.hash.includes('view=')) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== RELEASE;
  } catch {
    return false;
  }
}
