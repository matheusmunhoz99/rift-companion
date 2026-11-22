import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { MatchSummary } from './local-history';

/**
 * Guarda localmente, entre sessões, uma versão enxuta das SUAS partidas, para o "com quem já
 * joguei" cruzar com muito mais do que as últimas 20 — sem nenhuma chamada extra à Riot: só
 * reaproveita as partidas que o app já busca (histórico e encontros). Dedup por matchId, com teto.
 */

export interface StoredParticipant {
  puuid: string;
  riotId: string;
  championId: number;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
}

export interface StoredMatch {
  matchId: string;
  queueId: number;
  gameEndTimestamp: number;
  participants: StoredParticipant[];
}

const CAP = 1000;

type RememberInput = Pick<MatchSummary, 'matchId' | 'queueId' | 'gameEndTimestamp' | 'participants'>;

function trim(match: RememberInput): StoredMatch {
  return {
    matchId: match.matchId,
    queueId: match.queueId,
    gameEndTimestamp: match.gameEndTimestamp,
    participants: match.participants.map((p) => ({
      puuid: p.puuid,
      riotId: p.riotId,
      championId: p.championId,
      teamId: p.teamId,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
    })),
  };
}

export class EncountersStore {
  private matches = new Map<string, StoredMatch>();

  constructor(private readonly file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as StoredMatch[];
      if (Array.isArray(raw)) for (const m of raw) if (m?.matchId) this.matches.set(m.matchId, m);
    } catch {
      // Sem arquivo ainda (ou inválido): começa vazio.
    }
  }

  /** Junta partidas novas (ignora as que já tem). Salva só se algo mudou. */
  remember(summaries: RememberInput[]): void {
    let changed = false;
    for (const s of summaries) {
      if (!s?.matchId || this.matches.has(s.matchId)) continue;
      this.matches.set(s.matchId, trim(s));
      changed = true;
    }
    if (changed) this.save();
  }

  /** Todas as partidas guardadas (mais recentes primeiro). */
  list(): StoredMatch[] {
    return [...this.matches.values()].sort((a, b) => b.gameEndTimestamp - a.gameEndTimestamp);
  }

  private save(): void {
    const all = this.list().slice(0, CAP);
    this.matches = new Map(all.map((m) => [m.matchId, m]));
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(all));
    } catch {
      // Sem conseguir salvar: segue com o que está em memória nesta sessão.
    }
  }
}
