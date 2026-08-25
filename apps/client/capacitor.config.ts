import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

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
    // Android already resizes the activity through adjustResize. Enabling
    // Capacitor's fullscreen workaround as well can reserve the IME height twice.
    // iOS explicitly keeps the native WebView resize rather than relying on
    // JavaScript viewport measurements.
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: false,
      autoBackdropColor: 'auto',
    },
    // Android 15+ needs Capacitor's edge-to-edge insets. MainActivity changes
    // this to `disable` only on Android 14 and older, where adjustResize is used.
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
