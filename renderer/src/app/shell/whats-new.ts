import { Component, signal } from '@angular/core';
import { Icon } from '../ui/icon';

/** Versão cujas novidades esta tela apresenta; trocar quando houver outra grande. */
const RELEASE = '1.21';
const SEEN_KEY = 'rift.whatsNewSeen';

const HIGHLIGHTS = [
  {
    icon: 'plan',
    title: 'Selva automática pela tela',
    text: 'O LoL escreve no minimapa quanto falta para cada campo que o seu time viu morrer (1:57, 40, 2m+). O app lê esse número na tela a cada segundo e conta sozinho até o campo voltar, sem você apertar nada. Só lê a tela, não toca no jogo.',
  },
  {
    icon: 'eye',
    title: 'Overlay com a IA por cima do jogo',
    text: 'A leitura da IA aparece numa linha do overlay (a primeira opção e o alerta), junto com objetivos, inibidores e a selva. É uma janela separada: não injeta nada no jogo.',
  },
  {
    icon: 'display',
    title: 'Sem bordas com um clique',
    text: 'Em Configurações › Overlay, o botão troca o jogo para Sem bordas pelo próprio cliente do LoL. Mesmo desempenho da tela cheia, e o overlay e a visão da IA passam a funcionar.',
  },
  {
    icon: 'display',
    title: 'A IA vê o seu minimapa',
    text: 'Em cada leitura o app recorta só o canto do minimapa da tela e manda junto: a IA vê inimigos visíveis, sentinelas e os timers que o próprio LoL desenha. Precisa do jogo em Sem bordas (em Tela cheia o Windows entrega a tela preta).',
  },
  {
    icon: 'refresh',
    title: 'Timers mais rápidos',
    text: 'O app lê o jogo a cada 1 segundo (antes 2 a 3): objetivos, inibidores, overlay e avisos falados saem quase na hora.',
  },
  {
    icon: 'eye',
    title: 'A IA acompanha a sua partida',
    text: 'Ela anota suas mortes (e quem te matou), os itens que você comprou, o CS e o ouro contra o oponente e a média Mestre+ no mesmo minuto. A cada leitura diz o que você está acertando, onde dá para melhorar e os caminhos possíveis.',
  },
  {
    icon: 'plan',
    title: 'Selva no tempo certo e atalhos no jogo',
    text: 'Tempos dos campos do patch 26.1 (e da Partida Rápida, que volta mais rápido). Matou o vermelho? Ctrl+Alt+2 sem sair do jogo: o app conta e a voz confirma. Ctrl+Alt+1 a 6 marcam buffs e caranguejos.',
  },
  {
    icon: 'chat',
    title: 'Avisos falados',
    text: 'Uma voz em português avisa no fone: "Dragão em 30 segundos", "Barão nasceu", inibidores voltando e os campos da selva que você marcou. Funciona com o jogo em tela cheia. Volume em Configurações.',
  },
  {
    icon: 'user',
    title: 'Para você, na seleção',
    text: 'Na hora de escolher, seus campeões que mais ganham nesta rota, cruzados com o confronto contra o inimigo da sua rota. Um clique e já escolhe.',
  },
  {
    icon: 'linked',
    title: 'Com quem você ganha mais',
    text: 'No Progresso: sozinho x em grupo, cada parceiro de duo com as vitórias juntos e seus campeões que mais ganham.',
  },
  {
    icon: 'swords',
    title: 'Card do fim de jogo',
    text: 'O botão "Compartilhar" no fim de jogo gera uma imagem 1080×1080 com a arte do campeão, nota, KDA e destaques. Copie e cole no WhatsApp, Discord ou Instagram.',
  },
  {
    icon: 'eye',
    title: 'Selva e inibidores no overlay',
    text: 'O overlay por cima do jogo ganha uma linha com os campos da selva marcados e os inibidores voltando.',
  },
  {
    icon: 'display',
    title: 'Ctrl+Shift+R',
    text: 'Mostra o app por cima do jogo e, apertando de novo, volta para o jogo. Sem Alt+Tab.',
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
            <h2 id="whats-new-title">Rift Companion <span class="num">{{ release }}</span></h2>
            <p>A IA acompanhando a sua partida, a selva no tempo certo e atalhos dentro do jogo: veja o que mudou.</p>
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
  protected readonly release = RELEASE;
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
