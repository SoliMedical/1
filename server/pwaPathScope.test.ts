import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("PWA scope for GitHub Pages", () => {
  it("uses a relative manifest start URL and scope", async () => {
    const manifest = await readFile(join(process.cwd(), "client/public/manifest.webmanifest"), "utf8");
    expect(manifest).toContain('"start_url": "./"');
    expect(manifest).toContain('"scope": "./"');
  });

  it("installs an app shell within the registered scope only", async () => {
    const serviceWorker = await readFile(join(process.cwd(), "client/public/sw.js"), "utf8");
    expect(serviceWorker).toContain("const SCOPE_PATH = new URL(self.registration.scope).pathname");
    expect(serviceWorker).toContain("`${SCOPE_PATH}manifest.webmanifest`");
    expect(serviceWorker).not.toContain('"/icons/medicenter-icon.png"');
  });
});
