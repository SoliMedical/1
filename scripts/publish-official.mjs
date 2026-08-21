#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { validateTargetRemote, verifyReleaseGuard } from "./release-guard.mjs";

export const OFFICIAL_REMOTE_NAME = "official_repo1";

function readGitRemote(remoteName) {
  return execFileSync("git", ["remote", "get-url", remoteName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export async function prepareOfficialRelease({
  root = process.cwd(),
  readRemote = readGitRemote,
} = {}) {
  const remoteUrl = readRemote(OFFICIAL_REMOTE_NAME);
  const target = validateTargetRemote(remoteUrl);
  if (!target.valid) {
    return {
      ok: false,
      remoteUrl,
      errors: [`المسار ${OFFICIAL_REMOTE_NAME} غير مصرح به: ${target.normalized || "غير معروف"}.`],
    };
  }

  const release = await verifyReleaseGuard({ root: resolve(root), remoteUrl });
  return { ...release, remoteUrl };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const result = await prepareOfficialRelease();
  if (!result.ok) {
    console.error("فشل النشر الرسمي قبل الدفع:");
    result.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`تم التحقق من ${result.version} للنشر إلى ${OFFICIAL_REMOTE_NAME} فقط.`);
  if (!execute) {
    console.log("لم يُنفذ دفع. استخدم --execute فقط بعد نجاح التحقق.");
    return;
  }

  execFileSync("git", ["push", OFFICIAL_REMOTE_NAME, "HEAD:main"], { stdio: "inherit" });
  console.log("اكتمل الدفع إلى المستودع الرسمي.");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(`تعذر تجهيز النشر الرسمي: ${error.message}`);
    process.exitCode = 1;
  });
}
