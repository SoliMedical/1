#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const OFFICIAL_REPOSITORY = "github.com/SoliMedical/1";
export const REQUIRED_RELEASE_FILES = [
  ["client/index.html", "index.html"],
  ["client/soli-interface-enhancements.js", "soli-interface-enhancements.js"],
  ["client/soli-interface-enhancements.css", "soli-interface-enhancements.css"],
  ["client/public/sw.js", "sw.js"],
];

export function normalizeRemoteUrl(remoteUrl = "") {
  return remoteUrl
    .trim()
    .replace(/^https?:\/\/(?:[^@/]+@)?/, "")
    .replace(/^git@/, "")
    .replace(/:/, "/")
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

export function validateTargetRemote(remoteUrl) {
  const normalized = normalizeRemoteUrl(remoteUrl);
  return {
    normalized,
    expected: OFFICIAL_REPOSITORY.toLowerCase(),
    valid: normalized === OFFICIAL_REPOSITORY.toLowerCase(),
  };
}

export function extractAppVersion(source) {
  return source.match(/SOLI_APP_VERSION\s*=\s*['"](v\d+\.\d+\.\d+)['"]/)?.[1] ?? null;
}

export async function inspectReleaseFiles(root) {
  const errors = [];
  let version = null;

  for (const [sourcePath, publishedPath] of REQUIRED_RELEASE_FILES) {
    const [source, published] = await Promise.all([
      readFile(resolve(root, sourcePath)),
      readFile(resolve(root, publishedPath)),
    ]);

    if (!source.equals(published)) {
      errors.push(`ملفا النشر غير متطابقين: ${sourcePath} ↔ ${publishedPath}`);
    }

    if (sourcePath === "client/index.html") {
      version = extractAppVersion(source.toString("utf8"));
    }
  }

  if (!version) {
    errors.push("لم يُعثر على SOLI_APP_VERSION صالح في client/index.html.");
  }

  return { errors, version };
}

export async function verifyReleaseGuard({ root = process.cwd(), remoteUrl }) {
  const target = validateTargetRemote(remoteUrl);
  const releaseFiles = await inspectReleaseFiles(root);
  const errors = [...releaseFiles.errors];

  if (!target.valid) {
    errors.unshift(
      `وجهة النشر غير مصرح بها: ${target.normalized || "غير معروفة"}. الوجهة المطلوبة هي ${target.expected}.`,
    );
  }

  return {
    errors,
    ok: errors.length === 0,
    remote: target.normalized,
    version: releaseFiles.version,
  };
}

function getArgument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readGitRemote(remoteName) {
  return execFileSync("git", ["remote", "get-url", remoteName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function main() {
  const root = resolve(getArgument("root") ?? process.cwd());
  const remoteName = getArgument("remote-name") ?? "user_github";
  const remoteUrl = getArgument("remote-url") ?? readGitRemote(remoteName);
  const result = await verifyReleaseGuard({ root, remoteUrl });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result));
  } else if (result.ok) {
    console.log(`نجح حاجز الإصدار: ${result.version} جاهز للنشر إلى ${result.remote}.`);
  } else {
    console.error("فشل حاجز الإصدار:");
    for (const error of result.errors) console.error(`- ${error}`);
  }

  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(`تعذر تشغيل حاجز الإصدار: ${error.message}`);
    process.exitCode = 1;
  });
}
