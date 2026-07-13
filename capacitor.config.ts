import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mashpotato.app',
  appName: 'Mash Potato',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      // Show alerts even while the app is foregrounded (a groupmate locking
      // in mid-session is exactly when you're looking at the app).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
