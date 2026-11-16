import { describe, expect, it, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  keys: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
}));

import { installedScanLanguages, installScanLanguage } from "./scanLanguagePacks";

describe("scanLanguagePacks offline bundled languages", () => {
  it("reports eng, ben, and ara as pre-installed without cached keys", async () => {
    const installed = await installedScanLanguages();
    expect(installed.has("eng")).toBe(true);
    expect(installed.has("ben")).toBe(true);
    expect(installed.has("ara")).toBe(true);
  });

  it("installScanLanguage is a no-op for bundled eng, ben, and ara", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const controller = new AbortController();
    await installScanLanguage("eng", controller.signal);
    await installScanLanguage("ben", controller.signal);
    await installScanLanguage("ara", controller.signal);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
