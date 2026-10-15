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
      cursor: pointer;
    }
    .text {
      display: grid;
      gap: 2px;
      flex: 1;
    }
    .label {
      font-weight: 600;
    }
    .description {
      color: var(--muted);
      font-size: 12px;
    }
    input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .track {
      position: relative;
      flex-shrink: 0;
      width: 40px;
      height: 22px;
      border-radius: 11px;
      background: var(--surface-3);
      transition: background 0.15s;
    }
    .thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--muted);
      transition: transform 0.15s, background 0.15s;
    }
    input:checked + .track {
      background: var(--accent);
    }
    input:checked + .track .thumb {
      transform: translateX(18px);
      background: #fff;
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
