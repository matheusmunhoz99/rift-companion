import type { LiveDashboard } from './live-dashboard';

/** Avisa este tempo antes do objetivo nascer. */
const SPAWN_WARNING_S = 60;
/** Perto demais para avisar "em 1 min" (o próximo aviso, "nasceu", já vem). */
const TOO_CLOSE_S = 8;
/** Só anuncia "nasceu" logo depois (ao abrir o app no meio da partida, não repete o que já está no mapa). */
const JUST_SPAWNED_S = 20;
const INHIBITOR_WARNING_S = 30;

export interface ObjectiveAlert {
  /** Identifica o aviso: cada um sai uma vez só por partida. */
  id: string;
  text: string;
}

/**
 * Avisos de objetivos para o chat do LoL (contato Rift Companion, só você vê):
 * 1 min antes de cada objetivo nascer, quando ele nasce e antes de um inibidor voltar.
 * Função pura; quem chama guarda os ids já enviados.
 */
export function objectiveAlerts(dashboard: LiveDashboard, sent: ReadonlySet<string>): ObjectiveAlert[] {
  const now = dashboard.gameTime;
  const alerts: ObjectiveAlert[] = [];
  const add = (id: string, text: string) => {
    if (!sent.has(id)) alerts.push({ id, text });
  };

  for (const objective of dashboard.objectives) {
    if (objective.state === 'done') continue;
    const left = objective.at - now;
    if (objective.state === 'upcoming' && left > TOO_CLOSE_S && left <= SPAWN_WARNING_S) {
      add(`${objective.key}:${objective.at}:soon`, `${objective.name} nasce em ${duration(left)} (aos ${clock(objective.at)}).`);
    }
    if (objective.state === 'alive' && now - objective.at <= JUST_SPAWNED_S) {
      add(`${objective.key}:${objective.at}:up`, `${objective.name} nasceu: está no mapa agora.`);
    }
  }

  for (const inhibitor of dashboard.timers?.inhibitors ?? []) {
    const left = inhibitor.respawnAt - now;
    if (left > 0 && left <= INHIBITOR_WARNING_S) {
      const whose = inhibitor.ally ? 'Seu inibidor' : 'Inibidor inimigo';
      const lane = inhibitor.lane ? ` do ${inhibitor.lane}` : '';
      add(`inhib:${inhibitor.ally}:${inhibitor.lane}:${inhibitor.respawnAt}`, `${whose}${lane} volta em ${duration(left)}.`);
    }
  }
  return alerts;
}

/** "1 min", "45 s". */
function duration(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 55 ? '1 min' : `${s} s`;
}

/** Relógio de jogo: "15:00". */
function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
