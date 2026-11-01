import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeAndroid } from './app/mobile/mobile-client';

initializeAndroid();

// Erros não tratados da interface vão para o relatório anônimo (o processo principal decide se envia).
const sendReport = (context: string, error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  void window.app?.report(context, err.message, err.stack);
};
window.addEventListener('error', (event) => sendReport('window', event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => sendReport('promise', event.reason));

// Imagem que não carregou (ícone novo que o Data Dragon ainda não tem, modo especial,
// internet instável) some em vez de mostrar o ícone de imagem quebrada.
document.addEventListener(
  'error',
  (event) => {
    if (event.target instanceof HTMLImageElement) event.target.classList.add('img-broken');
  },
  true,
);
document.addEventListener(
  'load',
  (event) => {
    if (event.target instanceof HTMLImageElement) event.target.classList.remove('img-broken');
  },
  true,
);

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
