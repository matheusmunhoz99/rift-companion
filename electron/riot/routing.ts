export type RegionalRoute = 'americas' | 'europe' | 'asia' | 'sea';

export interface Platform {
  id: string;
  label: string;
  regional: RegionalRoute;
}

export const PLATFORMS: Platform[] = [
  { id: 'BR1', label: 'Brasil', regional: 'americas' },
  { id: 'NA1', label: 'América do Norte', regional: 'americas' },
  { id: 'LA1', label: 'América Latina Norte', regional: 'americas' },
  { id: 'LA2', label: 'América Latina Sul', regional: 'americas' },
  { id: 'EUW1', label: 'Europa Oeste', regional: 'europe' },
  { id: 'EUN1', label: 'Europa Nórdica e Leste', regional: 'europe' },
  { id: 'TR1', label: 'Turquia', regional: 'europe' },
  { id: 'RU', label: 'Rússia', regional: 'europe' },
  { id: 'ME1', label: 'Oriente Médio', regional: 'europe' },
  { id: 'KR', label: 'Coreia', regional: 'asia' },
  { id: 'JP1', label: 'Japão', regional: 'asia' },
  { id: 'OC1', label: 'Oceania', regional: 'sea' },
  { id: 'SG2', label: 'Singapura', regional: 'sea' },
  { id: 'TW2', label: 'Taiwan', regional: 'sea' },
  { id: 'VN2', label: 'Vietnã', regional: 'sea' },
];

/** Região informada pelo cliente (/riotclient/region-locale) para a plataforma da API. */
const CLIENT_REGION_TO_PLATFORM: Record<string, string> = {
  BR: 'BR1',
  NA: 'NA1',
  LA1: 'LA1',
  LAN: 'LA1',
  LA2: 'LA2',
  LAS: 'LA2',
  EUW: 'EUW1',
  EUNE: 'EUN1',
  TR: 'TR1',
  RU: 'RU',
  ME1: 'ME1',
  KR: 'KR',
  JP: 'JP1',
  OC1: 'OC1',
  OCE: 'OC1',
  SG2: 'SG2',
  TW2: 'TW2',
  VN2: 'VN2',
};

export function platformFromClientRegion(region: string): string | null {
  return CLIENT_REGION_TO_PLATFORM[region.toUpperCase()] ?? null;
}

export function findPlatform(id: string): Platform {
  const platform = PLATFORMS.find((p) => p.id === id);
  if (!platform) throw new Error(`Região desconhecida: ${id}`);
  return platform;
}
