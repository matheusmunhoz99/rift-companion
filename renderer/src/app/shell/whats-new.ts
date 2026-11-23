import { Component, signal } from '@angular/core';
import { Icon } from '../ui/icon';

/** Versão cujas novidades esta tela apresenta; trocar quando houver outra grande. */
const RELEASE = '1.27.1';
const SEEN_KEY = 'rift.whatsNewSeen';

const HIGHLIGHTS = [
  {
    icon: 'eye',
    title: 'Radar Visual do Jungler Inimigo pelo Minimapa',
    text: 'Em Summoner’s Rift e no Modo de treino (Sem Bordas ou Janela), o app identifica automaticamente onde o Jungler inimigo apareceu no minimapa, mostra o rastro recente, avisa no chat do LoL e em voz alta (quando ativos) e funciona tanto no PC quanto no celular Android.',
  },
  {
    icon: 'chat',
    title: 'Limpeza automática do chat no LoL',
    text: 'Ao fim de cada partida, o Rift Companion apaga sozinho os avisos de Dragão/Barão/Arauto do contato Rift Companion e zera a notificação não lida.',
  },
  {
    icon: 'swords',
    title: 'Tela Jogar redesenhada e convites ao vivo',
    text: 'Crie sala, aceite convites recebidos de amigos e aceite ou recuse partidas direto pelo Rift Companion, com visual novo para os slots do Jogo Dinâmico.',
  },
  {
    icon: 'progress',
    title: 'Gráficos de fim de jogo vs. oponente de rota',
    text: 'No fim da partida, veja sua evolução minuto a minuto em Ouro, XP e CS comparada ao seu oponente direto, além da divisão exata do seu dano (físico, mágico e verdadeiro).',
  },
  {
    icon: 'linked',
    title: 'Acervo local de 1.000 partidas em "Já jogaram com você"',
    text: 'O app agora guarda um resumo leve das suas últimas 1.000 partidas no seu PC (sem chamadas extras à Riot), reconhecendo quem você já enfrentou semanas atrás.',
  },
  {
    icon: 'eye',
    title: 'Alertas de itens críticos inimigos ao vivo',
    text: 'Na aba Ao vivo, o app avisa na hora quando um inimigo fecha itens que viram lutas — como Ampulheta de Zhonya, Anjo Guardião, Limiar da Noite, Bandana de Mercúrio ou Rabadon.',
  },
  {
    icon: 'progress',
    title: 'Ranking dos amigos no Progresso',
    text: 'Veja o ranking de todos os seus amigos do LoL (Solo/Duo e Flex): elo da temporada, pico, PDL ganho desde segunda-feira e sequências — com botão "Copiar imagem" pronto para o grupo.',
  },
  {
    icon: 'user',
    title: 'Os dois elos nos cards + detector de smurf',
    text: 'Cada jogador na partida mostra Solo/Duo e Flex juntos, além de sinalizar contas de nível baixo com elo alto ("Provável smurf").',
  },
  {
    icon: 'plan',
    title: 'Plano de jogo e leitura tática por IA no Rift',
    text: 'A IA analisa os dois times na tela de carregamento e acompanha a sua partida (mortes, itens e ritmo Mestre+) trazendo opções práticas para você decidir.',
  },
  {
    icon: 'chat',
    title: 'Avisos falados e atalhos da selva',
    text: 'Voz em português para objetivos e campos marcados (Ctrl+Alt+1..6 sem sair do jogo), além de Ctrl+Shift+R para alternar para o app sem Alt+Tab.',
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
            <p>Nova tela Jogar com convites, gráficos de fim de jogo, acervo de 1.000 partidas e alertas de itens críticos: veja o que mudou.</p>
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
