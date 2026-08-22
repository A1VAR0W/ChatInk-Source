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
    // Android 10/11 already resizes the activity through adjustResize. Enabling
    // Capacitor's fullscreen workaround as well can reserve the IME height twice.
    Keyboard: { resizeOnFullScreen: false },
    // Android 15+ needs Capacitor's edge-to-edge insets. MainActivity changes
    // this to `disable` only on Android 14 and older, where adjustResize is used.
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
