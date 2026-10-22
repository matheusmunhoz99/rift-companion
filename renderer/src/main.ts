import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeAndroid } from './app/mobile/mobile-client';

initializeAndroid();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
