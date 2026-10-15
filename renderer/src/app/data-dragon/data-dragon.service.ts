import { Injectable, computed, signal } from '@angular/core';

export interface ChampionInfo {
  key: number;
  id: string;
  name: string;
}

interface RuneStyle {
  id: number;
  name: string;
  icon: string;
  slots: Array<{ runes: Array<{ id: number; name: string; icon: string }> }>;
}

const BASE_URL = 'https://ddragon.leagueoflegends.com';

/** Dados estáticos públicos da Riot (campeões, runas, feitiços, itens) via Data Dragon. */
@Injectable({ providedIn: 'root' })
export class DataDragonService {
  readonly version = signal<string | null>(null);
  private readonly champions = signal<Map<number, ChampionInfo>>(new Map());
  private readonly runeIcons = signal<Map<number, string>>(new Map());
  private readonly runeNames = signal<Map<number, string>>(new Map());
  private readonly spells = signal<Map<number, { name: string; image: string }>>(new Map());
  private readonly itemNames = signal<Map<number, string>>(new Map());

  readonly championList = computed(() =>
    [...this.champions().values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  );

  constructor() {
    void this.load();
  }

  champion(key: number): ChampionInfo | null {
    return this.champions().get(key) ?? null;
  }

  championIconUrl(champion: ChampionInfo): string | null {
    const version = this.version();
    return version ? `${BASE_URL}/cdn/${version}/img/champion/${champion.id}.png` : null;
  }

  profileIconUrl(iconId: number): string | null {
    const version = this.version();
    return version ? `${BASE_URL}/cdn/${version}/img/profileicon/${iconId}.png` : null;
  }

  /** Runas e árvores; fragmentos de atributo (5xxx) não têm ícone no Data Dragon. */
  runeIconUrl(id: number): string | null {
    const icon = this.runeIcons().get(id);
    return icon ? `${BASE_URL}/cdn/img/${icon}` : null;
  }

  runeName(id: number): string {
    return this.runeNames().get(id) ?? String(id);
  }

  spellIconUrl(id: number): string | null {
    const version = this.version();
    const spell = this.spells().get(id);
    return version && spell ? `${BASE_URL}/cdn/${version}/img/spell/${spell.image}` : null;
  }

  spellName(id: number): string {
    return this.spells().get(id)?.name ?? String(id);
  }

  itemIconUrl(id: number): string | null {
    const version = this.version();
    return version ? `${BASE_URL}/cdn/${version}/img/item/${this.baseItemId(id)}.png` : null;
  }

  itemName(id: number): string {
    return this.itemNames().get(this.baseItemId(id)) ?? String(id);
  }

  /**
   * Alguns modos usam variantes com prefixo (ex.: 323075 = Armadura de Espinhos 3075)
   * que não existem no Data Dragon; nesse caso usa o item base.
   */
  baseItemId(id: number): number {
    const items = this.itemNames();
    if (items.size === 0 || items.has(id) || id < 100000) return id;
    const base = id % 10000;
    return items.has(base) ? base : id;
  }

  private async load(): Promise<void> {
    try {
      const versions: string[] = await getJson(`${BASE_URL}/api/versions.json`);
      const version = versions[0];
      const data = `${BASE_URL}/cdn/${version}/data/pt_BR`;

      const [champions, runes, spells, items] = await Promise.all([
        getJson<{ data: Record<string, { key: string; id: string; name: string }> }>(
          `${data}/champion.json`,
        ),
        getJson<RuneStyle[]>(`${data}/runesReforged.json`),
        getJson<{ data: Record<string, { key: string; name: string; image: { full: string } }> }>(
          `${data}/summoner.json`,
        ),
        getJson<{ data: Record<string, { name: string }> }>(`${data}/item.json`),
      ]);

      this.champions.set(
        new Map(
          Object.values(champions.data).map((c) => [
            Number(c.key),
            { key: Number(c.key), id: c.id, name: c.name },
          ]),
        ),
      );

      const runeIcons = new Map<number, string>();
      const runeNames = new Map<number, string>();
      for (const style of runes) {
        runeIcons.set(style.id, style.icon);
        runeNames.set(style.id, style.name);
        for (const slot of style.slots) {
          for (const rune of slot.runes) {
            runeIcons.set(rune.id, rune.icon);
            runeNames.set(rune.id, rune.name);
          }
        }
      }
      this.runeIcons.set(runeIcons);
      this.runeNames.set(runeNames);

      this.spells.set(
        new Map(
          Object.values(spells.data).map((s) => [
            Number(s.key),
            { name: s.name, image: s.image.full },
          ]),
        ),
      );

      this.itemNames.set(
        new Map(Object.entries(items.data).map(([id, item]) => [Number(id), item.name])),
      );
      this.version.set(version);
    } catch {
      // Sem internet: a tela continua funcionando, apenas sem nomes e ícones.
    }
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} em ${url}`);
  return response.json() as Promise<T>;
}
