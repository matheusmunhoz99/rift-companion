import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.workscanner.riftcompanion',
  appName: 'Rift Companion',
  webDir: 'dist/renderer/browser',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#0f1219', allowMixedContent: false },
  plugins: { CapacitorHttp: { enabled: true } },
};
export default config;
