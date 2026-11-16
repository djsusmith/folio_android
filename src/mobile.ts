import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const ON_DEVICE_AI_KEY = "folio:ondevice-ai";

export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

export function isDesktopAiAvailable(): boolean {
  return typeof window !== "undefined" && !!window.folioDesktop?.ai;
}

export function isOnDeviceAiEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(ON_DEVICE_AI_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOnDeviceAiEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (enabled) localStorage.setItem(ON_DEVICE_AI_KEY, "1");
    else localStorage.removeItem(ON_DEVICE_AI_KEY);
  } catch {
    // Ignore storage quota / private mode failures.
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Save or share exported bytes. Uses Capacitor Filesystem + Share on Android,
 * and falls back to browser download on web/desktop.
 */
export async function saveOrShareBytes(
  name: string,
  bytes: Uint8Array,
  mimeType: string,
  customNativeExport?: (name: string, bytes: Uint8Array, mimeType: string) => Promise<void>,
): Promise<void> {
  if (customNativeExport) {
    await customNativeExport(name, bytes, mimeType);
    return;
  }

  if (isNativeAndroid()) {
    const safeName = name.replace(/[^\w.\-() ]+/g, "_");
    const result = await Filesystem.writeFile({
      path: `export/${Date.now()}-${safeName}`,
      data: uint8ToBase64(bytes),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: name,
      url: result.uri,
      dialogTitle: `Save or share ${name}`,
    });
    return;
  }

  const blob = new Blob([bytes.slice()], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Register Android hardware back button handler. Returns a cleanup function.
 */
export function registerAndroidBackHandler(onBack: () => boolean): () => void {
  if (!isNativeAndroid()) return () => {};
  let removed = false;
  const listenerPromise = CapApp.addListener("backButton", () => {
    const handled = onBack();
    if (!handled) void CapApp.exitApp();
  });
  return () => {
    if (removed) return;
    removed = true;
    void listenerPromise.then(handle => handle.remove());
  };
}

/**
 * Listen for Android ACTION_VIEW file/URL intents via Capacitor App plugin.
 */
export function registerAndroidOpenUrlHandler(onOpenUrl: (url: string) => void): () => void {
  if (!isNativeAndroid()) return () => {};
  let removed = false;
  void CapApp.getLaunchUrl().then(launch => {
    if (!removed && launch?.url) onOpenUrl(launch.url);
  });
  const listenerPromise = CapApp.addListener("appUrlOpen", ({ url }) => {
    if (url) onOpenUrl(url);
  });
  return () => {
    if (removed) return;
    removed = true;
    void listenerPromise.then(handle => handle.remove());
  };
}
