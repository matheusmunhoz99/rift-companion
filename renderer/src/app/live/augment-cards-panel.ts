import { Component, computed, input, signal } from '@angular/core';
import {
  findChampionMeta,
  rankAugmentsForChampion,
  type AugmentEvaluation,
  type AugmentRarity,
  type AugmentTier,
} from './aram-augments';

@Component({
  selector: 'app-augment-cards-panel',
  standalone: true,
  template: `
    <section class="aug-panel">
      <header class="aug-head">
        <div>
          <h4>Cartas de Aprimoramento · {{ championName() }}</h4>
          <p class="muted">
            Avaliação (<strong>Boa</strong>, <strong>Média</strong> ou <strong>Ruim</strong>) e
            <strong>% de escolha</strong> de cada carta para {{ championName() }} no ARAM: Desordem.
          </p>
        </div>
        <div class="aug-controls">
          <input
            type="search"
            class="aug-search"
            placeholder="Buscar carta (ex.: Hora da Jinx, Armas…)"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
          <div class="aug-filters">
            @for (f of rarityFilters; track f.value) {
              <button
                type="button"
                class="filter-btn"
                [class.active]="rarity() === f.value"
                (click)="rarity.set(f.value)"
              >
                {{ f.label }}
              </button>
            }
          </div>
          <div class="aug-filters">
            @for (t of tierFilters; track t.value) {
              <button
                type="button"
                class="filter-btn"
                [attr.data-tier]="t.value"
                [class.active]="tierFilter() === t.value"
                (click)="tierFilter.set(t.value)"
              >
                {{ t.label }}
              </button>
            }
          </div>
        </div>
      </header>

      <div class="aug-grid">
        @for (item of visibleCards(); track item.augment.id) {
          <article class="aug-card" [attr.data-tier]="item.tier" [attr.data-rarity]="item.augment.rarity">
            <div class="aug-card-top">
              <span class="rarity-dot" [attr.data-rarity]="item.augment.rarity">
                {{ rarityLabel(item.augment.rarity) }}
              </span>
              <span class="tier-badge" [attr.data-tier]="item.tier">
                {{ item.tierLabel }} · {{ item.pickRate }}%
              </span>
            </div>
            <strong class="aug-name">{{ item.augment.name }}</strong>
            <span class="aug-reason">{{ item.reason }}</span>
          </article>
        } @empty {
          <p class="muted">Nenhuma carta encontrada para esse filtro.</p>
        }
      </div>

      @if (filteredCards().length > limit() && !query()) {
        <button type="button" class="show-more" (click)="limit.set(limit() + 36)">
          Mostrar mais cartas ({{ filteredCards().length - limit() }} restantes)
        </button>
      }
    </section>
  `,
  styles: [`
    .aug-panel {
      background: var(--surface, #121621);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .aug-head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }
    .aug-head h4 {
      margin: 0 0 4px;
      font-size: 15px;
      font-weight: 700;
      color: #f8fafc;
    }
    .aug-head p {
      margin: 0;
      font-size: 12.5px;
    }
    .aug-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .aug-search {
      background: rgba(8, 10, 16, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      color: #f1f5f9;
      padding: 6px 11px;
      font-size: 12.5px;
      min-width: 230px;
      outline: none;
    }
    .aug-search:focus {
      border-color: #60a5fa;
    }
    .aug-filters {
      display: flex;
      background: rgba(8, 10, 16, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 2px;
      gap: 2px;
    }
    .filter-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 11.5px;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: 6px;
      cursor: pointer;
    }
    .filter-btn.active {
      background: rgba(255, 255, 255, 0.12);
      color: #f8fafc;
    }
    .aug-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 10px;
    }
    .aug-card {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(15, 20, 32, 0.85);
      border: 1.5px solid rgba(255, 255, 255, 0.08);
    }
    .aug-card[data-tier="boa"] {
      border-color: rgba(16, 185, 129, 0.55);
      background: linear-gradient(180deg, rgba(6, 36, 28, 0.65), rgba(12, 18, 28, 0.9));
    }
    .aug-card[data-tier="media"] {
      border-color: rgba(245, 158, 11, 0.45);
      background: linear-gradient(180deg, rgba(38, 26, 8, 0.55), rgba(12, 18, 28, 0.9));
    }
    .aug-card[data-tier="ruim"] {
      border-color: rgba(239, 68, 68, 0.4);
      background: linear-gradient(180deg, rgba(38, 12, 14, 0.5), rgba(12, 18, 28, 0.9));
    }
    .aug-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .rarity-dot {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: #94a3b8;
    }
    .rarity-dot[data-rarity="prismatic"] {
      color: #c084fc;
    }
    .rarity-dot[data-rarity="gold"] {
      color: #fbbf24;
    }
    .rarity-dot[data-rarity="silver"] {
      color: #cbd5e1;
    }
    .tier-badge {
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .tier-badge[data-tier="boa"] {
      background: #10b981;
      color: #022c22;
    }
    .tier-badge[data-tier="media"] {
      background: #f59e0b;
      color: #271300;
    }
    .tier-badge[data-tier="ruim"] {
      background: #ef4444;
      color: #fff;
    }
    .aug-name {
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
    }
    .aug-reason {
      font-size: 11.5px;
      color: #94a3b8;
      line-height: 1.25;
    }
    .show-more {
      margin-top: 12px;
      width: 100%;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .show-more:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  `],
})
export class AugmentCardsPanel {
  readonly champion = input.required<number | string>();

  protected readonly query = signal('');
  protected readonly rarity = signal<'all' | AugmentRarity>('all');
  protected readonly tierFilter = signal<'all' | AugmentTier>('all');
  protected readonly limit = signal(24);

  protected readonly rarityFilters: Array<{ value: 'all' | AugmentRarity; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'prismatic', label: 'Prismáticas' },
    { value: 'gold', label: 'Ouro' },
    { value: 'silver', label: 'Prata' },
  ];

  protected readonly tierFilters: Array<{ value: 'all' | AugmentTier; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'boa', label: 'Boas' },
    { value: 'media', label: 'Médias' },
    { value: 'ruim', label: 'Ruins' },
  ];

  protected readonly championName = computed(() => {
    const meta = findChampionMeta(this.champion());
    return meta?.name ?? String(this.champion() || 'seu campeão');
  });

  protected readonly allRanked = computed<AugmentEvaluation[]>(() =>
    rankAugmentsForChampion(this.champion()),
  );

  protected readonly filteredCards = computed(() => {
    const q = this.query()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    const r = this.rarity();
    const t = this.tierFilter();
    return this.allRanked().filter((item) => {
      if (r !== 'all' && item.augment.rarity !== r) return false;
      if (t !== 'all' && item.tier !== t) return false;
      if (!q) return true;
      const nameNorm = (item.augment.name + ' ' + (item.augment.alt ?? ''))
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return nameNorm.includes(q);
    });
  });

  protected readonly visibleCards = computed(() => {
    const list = this.filteredCards();
    return this.query() ? list : list.slice(0, this.limit());
  });

  protected rarityLabel(r: AugmentRarity): string {
    return r === 'prismatic' ? 'Prismática' : r === 'gold' ? 'Ouro' : 'Prata';
  }
}
