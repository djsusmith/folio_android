import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.folio.pdf",
  appName: "Folio",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
