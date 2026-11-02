import { Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import type { ScreenLayout } from '../core/screen-layout';
import { Icon } from './icon';

/**
 * Botão "Organizar": a pessoa escolhe a ordem das seções da tela e quais aparecem.
 * Fica salvo neste aparelho (ScreenLayout).
 */
@Component({
  selector: 'app-layout-menu',
  imports: [Icon],
  template: `
    <button
      type="button"
      class="trigger"
      [class.custom]="!layout().isDefault()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      title="Escolher a ordem das seções e quais aparecem"
      (click)="open.set(!open())"
    >
      <app-icon name="layout" [size]="16" />
      <span>Organizar</span>
    </button>

    @if (open()) {
      <div class="panel" role="dialog" aria-label="Organizar a tela">
        <header>
          <strong>Organizar a tela</strong>
          <span>De cima para baixo. Fica salvo neste aparelho.</span>
        </header>
        <ol>
          @for (item of layout().items(); track item.id; let first = $first; let last = $last) {
            <li [class.off]="!item.visible">
              <span class="pos num">{{ item.index + 1 }}</span>
              <span class="text">
                <span class="label">{{ item.label }}</span>
                <span class="desc">{{ item.description }}</span>
              </span>
              <span class="actions">
                <button
                  type="button"
                  class="icon-btn"
                  [disabled]="first"
                  [attr.aria-label]="'Subir ' + item.label"
                  title="Subir"
                  (click)="layout().move(item.id, -1)"
                >
                  <app-icon name="arrow-up" [size]="15" />
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  [disabled]="last"
                  [attr.aria-label]="'Descer ' + item.label"
                  title="Descer"
                  (click)="layout().move(item.id, 1)"
                >
                  <app-icon name="arrow-down" [size]="15" />
                </button>
                <button
                  type="button"
                  class="icon-btn eye"
                  [class.on]="item.visible"
                  [attr.aria-pressed]="item.visible"
                  [attr.aria-label]="(item.visible ? 'Esconder ' : 'Mostrar ') + item.label"
                  [title]="item.visible ? 'Esconder' : 'Mostrar'"
                  (click)="layout().setVisible(item.id, !item.visible)"
                >
                  <app-icon [name]="item.visible ? 'eye' : 'eye-off'" [size]="15" />
                </button>
              </span>
            </li>
          }
        </ol>
        <footer>
          <button type="button" class="link" [disabled]="layout().isDefault()" (click)="layout().reset()">Voltar ao padrão</button>
          <button type="button" class="btn small" (click)="open.set(false)">Pronto</button>
        </footer>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }

    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 5px 11px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition:
        color var(--dur-fast) var(--ease-out),
        border-color var(--dur-fast) var(--ease-out);

      &:hover,
      &[aria-expanded='true'] {
        border-color: #454d5e;
        color: var(--text);
      }

      // Já personalizada: o ícone ganha a cor de destaque, para lembrar que não é o padrão.
      &.custom app-icon {
        color: var(--accent);
      }
    }

    .panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 40;
      width: min(380px, calc(100vw - 32px));
      padding: 14px;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow:
        0 18px 48px -16px rgba(0, 0, 0, 0.7),
        inset 0 1px 0 var(--highlight);
      animation: pop var(--dur) var(--ease-out);
    }

    @keyframes pop {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }

    header {
      display: grid;
      gap: 2px;
      margin-bottom: 10px;

      strong {
        font-family: var(--font-display);
        font-size: 15px;
      }

      span {
        color: var(--muted);
        font-size: 12px;
      }
    }

    ol {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 8px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface-2);

      &.off {
        background: transparent;
        border-style: dashed;

        .label,
        .pos {
          color: var(--faint);
        }
      }
    }

    .pos {
      flex: none;
      width: 16px;
      color: var(--accent);
      font-size: 14px;
      font-weight: 700;
      text-align: center;
    }

    .text {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    .label {
      font-size: 13px;
      font-weight: 600;
    }

    .desc {
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1.35;
    }

    .actions {
      display: flex;
      flex: none;
      gap: 2px;
    }

    .icon-btn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid transparent;
      border-radius: var(--radius-xs);
      background: none;
      color: var(--muted);
      cursor: pointer;

      &:hover:not(:disabled) {
        border-color: var(--border-strong);
        background: var(--surface-3);
        color: var(--text);
      }

      &:disabled {
        opacity: 0.3;
        cursor: default;
      }

      &.eye.on {
        color: var(--accent);
      }
    }

    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 12px;
    }

    .link {
      padding: 0;
      border: none;
      background: none;
      color: var(--muted);
      font-size: 12px;
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;

      &:hover:not(:disabled) {
        color: var(--text);
      }

      &:disabled {
        opacity: 0.4;
        cursor: default;
        text-decoration: none;
      }
    }
  `,
})
export class LayoutMenu {
  readonly layout = input.required<ScreenLayout>();
  protected readonly open = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);

  @HostListener('document:click', ['$event'])
  protected outside(event: MouseEvent): void {
    // composedPath é o caminho no momento do clique: vale mesmo se o botão clicado mudar de lugar.
    if (this.open() && !event.composedPath().includes(this.host.nativeElement)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.open.set(false);
  }
}
