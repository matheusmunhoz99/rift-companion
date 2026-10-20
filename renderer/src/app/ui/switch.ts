import { Component, input, output } from '@angular/core';

/** Botão liga/desliga com rótulo e descrição opcional. */
@Component({
  selector: 'app-switch',
  template: `
    <label class="switch">
      <span class="text">
        <span class="label">{{ label() }}</span>
        @if (description()) {
          <span class="description">{{ description() }}</span>
        }
      </span>
      <input
        type="checkbox"
        role="switch"
        [checked]="checked()"
        (change)="toggled.emit($any($event.target).checked)"
      />
      <span class="track"><span class="thumb"></span></span>
    </label>
  `,
  styles: `
    .switch {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 2px 0;
      cursor: pointer;
    }
    .text {
      display: grid;
      flex: 1;
      gap: 2px;
    }
    .label {
      font-weight: 600;
    }
    .description {
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.45;
    }
    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .track {
      position: relative;
      flex-shrink: 0;
      width: 42px;
      height: 24px;
      border: 1px solid var(--border-strong);
      border-radius: 12px;
      background: var(--surface-3);
      transition:
        background var(--dur) var(--ease-out),
        border-color var(--dur) var(--ease-out);
    }
    .switch:hover .track {
      border-color: #475064;
    }
    .thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--muted);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      transition:
        transform var(--dur) var(--ease-spring),
        background var(--dur) var(--ease-out);
    }
    input:checked + .track {
      border-color: transparent;
      background: var(--accent);
    }
    input:checked + .track .thumb {
      transform: translateX(18px);
      background: var(--accent-ink);
    }
    input:focus-visible + .track {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
  `,
})
export class Switch {
  readonly label = input.required<string>();
  readonly description = input<string>('');
  readonly checked = input(false);
  readonly toggled = output<boolean>();
}
