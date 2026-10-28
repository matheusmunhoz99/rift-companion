import { Component, signal } from '@angular/core';
import { Icon } from '../ui/icon';

/** Versão cujas novidades esta tela apresenta; trocar quando houver outra grande. */
const RELEASE = '1.0';
const SEEN_KEY = 'rift.whatsNewSeen';

const HIGHLIGHTS = [
  {
    icon: 'swords',
    title: 'Seleção de campeões nova',
    text: 'Os dois times lado a lado em cards com a arte de cada campeão, banimentos, tempo e quem está escolhendo. Tudo numa tela só.',
  },
  {
    icon: 'live',
    title: 'Partida ao vivo',
    text: 'Cards de cada jogador com elo, runas e dano físico e mágico do campeão. No ARAM, sem rotas nem dragões.',
  },
  {
    icon: 'layers',
    title: 'Fim de partida',
    text: 'Sua nota num anel, os 3 melhores da partida e a explicação de como a nota é calculada.',
  },
  {
    icon: 'history',
    title: 'Histórico completo',
    text: 'Inclusive as partidas de ARAM: Desordem, que a API da Riot não entrega.',
  },
  {
    icon: 'chat',
    title: 'Modo invisível confiável',
    text: '"Abrir LoL" fecha e reabre o Riot Client sozinho, mesmo depois de uma atualização da Riot.',
  },
  {
    icon: 'play',
    title: 'No celular também',
    text: 'O app para Android controla o LoL do PC: fila, aceitar partida, seleção e partida ao vivo.',
  },
];

/**
 * Apresentação da 1.0 na primeira vez que ela abre (também para quem vinha do beta).
 * Lembra no próprio aparelho.
 */
@Component({
  selector: 'app-whats-new',
  imports: [Icon],
  template: `
    @if (open()) {
      <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="whats-new-title" (click)="close()">
        <article class="sheet" (click)="$event.stopPropagation()">
          <header class="hero">
            <span class="badge">Versão oficial</span>
            <h2 id="whats-new-title">Rift Companion <span class="num">1.0</span></h2>
            <p>Saiu do beta. Quase tudo foi refeito desde as primeiras versões: veja o que mudou.</p>
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
            <span class="muted small">Obrigado a quem usou e testou o beta.</span>
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
