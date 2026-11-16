import { describe, expect, it, vi } from "vitest";
import { isDesktopAiAvailable, isOnDeviceAiEnabled, setOnDeviceAiEnabled, saveOrShareBytes } from "./mobile";

describe("mobile platform helpers", () => {
  it("hides desktop AI when window.folioDesktop.ai is absent", () => {
    expect(isDesktopAiAvailable()).toBe(false);
  });

  it("persists optional on-device AI toggle", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    expect(isOnDeviceAiEnabled()).toBe(false);
    setOnDeviceAiEnabled(true);
    expect(isOnDeviceAiEnabled()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("saveOrShareBytes uses custom native exporter when provided", async () => {
    const nativeExport = vi.fn().mockResolvedValue(undefined);
    await saveOrShareBytes("test.pdf", new Uint8Array([1, 2, 3]), "application/pdf", nativeExport);
    expect(nativeExport).toHaveBeenCalledWith("test.pdf", new Uint8Array([1, 2, 3]), "application/pdf");
  });
});
