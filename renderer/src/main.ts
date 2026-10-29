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

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
