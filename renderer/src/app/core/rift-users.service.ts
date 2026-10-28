import { Injectable, signal } from '@angular/core';

declare global {
  interface Window {
    riftUsers?: { lookup(riotIds: string[]): Promise<string[]> };
  }
}

/**
 * Quem também usa o Rift Companion (por Riot ID). As telas pedem os jogadores que
 * mostram; o servidor só recebe um código de cada nick, calculado no PC.
 */
@Injectable({ providedIn: 'root' })
export class RiftUsersService {
  private readonly users = signal<ReadonlySet<string>>(new Set());
  private readonly asked = new Set<string>();

  /** Usa o Rift Companion (só depois de `check` ter respondido). */
  has(riotId: string | null | undefined): boolean {
    return !!riotId && this.users().has(normalize(riotId));
  }

  /** Pergunta pelos jogadores ainda não consultados nesta abertura do app. */
  check(riotIds: Array<string | null | undefined>): void {
    const pending = riotIds
      .filter((id): id is string => !!id && id.includes('#'))
      .filter((id) => !this.asked.has(normalize(id)));
    if (!pending.length || !window.riftUsers) return;
    for (const id of pending) this.asked.add(normalize(id));
    void window.riftUsers.lookup(pending).then(
      (found) => {
        if (!found.length) return;
        this.users.update((current) => new Set([...current, ...found.map(normalize)]));
      },
      // Sem resposta: tenta de novo na próxima vez que esses jogadores aparecerem.
      () => pending.forEach((id) => this.asked.delete(normalize(id))),
    );
  }
}

function normalize(riotId: string): string {
  return riotId.trim().toLowerCase();
}
