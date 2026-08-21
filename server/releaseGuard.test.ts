import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractAppVersion,
  normalizeRemoteUrl,
  verifyReleaseGuard,
} from "../scripts/release-guard.mjs";
import { OFFICIAL_REMOTE_NAME, prepareOfficialRelease } from "../scripts/publish-official.mjs";

const temporaryRoots: string[] = [];

async function makeReleaseRoot() {
  const root = await mkdtemp(join(tmpdir(), "soli-release-guard-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "client/public"), { recursive: true });

  const files: Record<string, string> = {
    "client/index.html": "const SOLI_APP_VERSION = 'v1.5.5';",
    "index.html": "const SOLI_APP_VERSION = 'v1.5.5';",
    "client/soli-interface-enhancements.js": "export const language = 'ar';",
    "soli-interface-enhancements.js": "export const language = 'ar';",
    "client/soli-interface-enhancements.css": ":root { color-scheme: dark; }",
    "soli-interface-enhancements.css": ":root { color-scheme: dark; }",
    "client/public/sw.js": "self.addEventListener('fetch', () => {});",
    "sw.js": "self.addEventListener('fetch', () => {});",
  };

  await Promise.all(Object.entries(files).map(([path, content]) => writeFile(join(root, path), content)));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("release guard", () => {
  it("يطبع روابط HTTPS وSSH في صيغة موحدة آمنة", () => {
    expect(normalizeRemoteUrl("https://token@github.com/SoliMedical/1.git")).toBe("github.com/solimedical/1");
    expect(normalizeRemoteUrl("git@github.com:SoliMedical/1.git")).toBe("github.com/solimedical/1");
    expect(extractAppVersion("const SOLI_APP_VERSION = 'v1.5.5';")).toBe("v1.5.5");
  });

  it("يسمح فقط بمستودع SoliMedical/1 عندما تكون ملفات Pages متطابقة", async () => {
    const result = await verifyReleaseGuard({
      root: await makeReleaseRoot(),
      remoteUrl: "https://github.com/SoliMedical/1.git",
    });

    expect(result).toMatchObject({ ok: true, version: "v1.5.5" });
  });

  it("يرفض المستودع الخطأ وملفات Pages غير المتطابقة", async () => {
    const root = await makeReleaseRoot();
    await writeFile(join(root, "sw.js"), "stale worker");

    const result = await verifyReleaseGuard({
      root,
      remoteUrl: "https://github.com/SoliMedical/2.git",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("github.com/solimedical/2");
    expect(result.errors.join("\n")).toContain("client/public/sw.js ↔ sw.js");
  });

  it("يجهّز الدفع من remote رسمي ثابت ولا يستخدم user_github المتغير", async () => {
    const root = await makeReleaseRoot();
    const result = await prepareOfficialRelease({
      root,
      readRemote: (remoteName) => {
        expect(remoteName).toBe(OFFICIAL_REMOTE_NAME);
        return "https://github.com/SoliMedical/1.git";
      },
    });

    expect(result).toMatchObject({ ok: true, version: "v1.5.5" });
  });

  it("يرفض أمر النشر الرسمي إذا لم يكن مسار official_repo1 هو المستودع المعتمد", async () => {
    const result = await prepareOfficialRelease({
      root: await makeReleaseRoot(),
      readRemote: () => "https://github.com/SoliMedical/2.git",
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("github.com/solimedical/2");
  });

  it("يفرض حاجز تطابق ملفات Pages داخل مسار النشر الخادمي", async () => {
    const pagesWorkflow = await readFile(join(process.cwd(), ".github/workflows/pages.yml"), "utf8");
    expect(pagesWorkflow).toContain("node scripts/release-guard.mjs --remote-name origin");
  });
});
