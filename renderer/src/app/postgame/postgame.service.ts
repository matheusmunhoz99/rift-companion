import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { PostGame } from '../history/riot.types';

/** Última partida terminada (placar do cliente), guardada pelo processo principal. */
@Injectable({ providedIn: 'root' })
export class PostGameService {
  readonly game = signal<PostGame | null>(null);

  constructor() {
    if (!window.riot) return;
    void window.riot.getPostGame().then(
      (game) => game && this.game.set(game),
      () => undefined,
    );
    const stop = window.riot.onPostGame((game) => this.game.set(game));
    inject(DestroyRef).onDestroy(stop);
  }
}
