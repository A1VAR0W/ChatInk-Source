import type { CapacitorConfig } from '@capacitor/cli';

const isPreproduction = process.env.CHATINK_BUILD_CHANNEL === 'preproduction';

const config: CapacitorConfig = {
  appId: isPreproduction ? 'com.gmail.alvaroaguileracuesta.preproduction' : 'com.gmail.alvaroaguileracuesta',
  appName: isPreproduction ? 'ChatInk PRE' : 'ChatInk',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
  },
  plugins: {
    Keyboard: { resizeOnFullScreen: true },
  },
};

export default config;
