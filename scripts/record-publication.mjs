#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractAppVersion } from "./release-guard.mjs";

export const PUBLISH_LOG_PATH = "docs/PUBLISH_LOG.md";
export const PUBLISH_LOG_HEADER = `# سجل النشر

يسجل هذا الملف تلقائياً الإصدارات التي أكمل **GitHub Pages** نشرها بنجاح. لا تُضاف أي خانة هنا قبل نجاح النشر الفعلي.

| الإصدار | الالتزام | حالة GitHub Pages | تاريخ النجاح (UTC) | رابط التشغيل |
| --- | --- | --- | --- | --- |
`;

export function createPublicationMarker(entry) {
  return `<!-- soli-publication:${entry.version}:${entry.commit} -->`;
}

export function createPublicationRow(entry) {
  const marker = createPublicationMarker(entry);
  return `${marker}\n| ${entry.version} | [\`${entry.commit.slice(0, 7)}\`](https://github.com/SoliMedical/1/commit/${entry.commit}) | ناجح | ${entry.publishedAt} | [فتح التشغيل](${entry.runUrl}) |`;
}

export function updatePublicationLog(current, entry) {
  const marker = createPublicationMarker(entry);
  const versionMarker = `<!-- soli-publication:${entry.version}:`;
  if (current.includes(marker) || current.includes(versionMarker)) {
    return { changed: false, content: current };
  }

  const content = current.endsWith("\n") ? current : `${current}\n`;
  return {
    changed: true,
    content: `${content}${createPublicationRow(entry)}\n`,
  };
}

function getArgument(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const root = resolve(getArgument("root") ?? process.cwd());
  const indexPath = resolve(root, "client/index.html");
  const logPath = resolve(root, PUBLISH_LOG_PATH);
  const [index, currentLog] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(logPath, "utf8"),
  ]);

  const version = getArgument("version") ?? extractAppVersion(index);
  const commit = getArgument("commit") ?? process.env.GITHUB_SHA;
  const runUrl = getArgument("run-url");
  const publishedAt = getArgument("published-at") ?? new Date().toISOString().replace(".000", "");

  if (!version || !commit || !runUrl) {
    throw new Error("يلزم توفير رقم الإصدار والالتزام ورابط تشغيل GitHub Pages.");
  }

  const result = updatePublicationLog(currentLog, { commit, publishedAt, runUrl, version });
  if (result.changed) await writeFile(logPath, result.content);
  console.log(result.changed ? `سُجل نجاح نشر ${version}.` : `نجاح ${version} مسجل مسبقاً.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(`تعذر تحديث سجل النشر: ${error.message}`);
    process.exitCode = 1;
  });
}
