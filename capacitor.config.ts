import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.fjw.deepseek.mobile",
  appName: "DeepSeek",
  webDir: "dist",
  plugins: {
    Keyboard: { resize: "native" },
    LocalNotifications: { presentationOptions: ["banner", "list", "sound"] },
    SplashScreen: { launchAutoHide: true },
  },
};
export default config;
