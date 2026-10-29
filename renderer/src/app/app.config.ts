import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';

/** Erros do Angular também vão para o relatório anônimo, sem deixar de aparecer no console. */
class ReportingErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    console.error(error);
    const err = error instanceof Error ? error : new Error(String(error));
    void window.app?.report('angular', err.message, err.stack);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
  ],
};
