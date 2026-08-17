#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(process.cwd());
const allowedHtml = new Set([
  "index.html",
  "sales/index.html",
  "client/index.html",
  "client/src/SoliMedical-source.html",
]);
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build"]);
const blockedName = /(^|[-_.])(legacy|old|backup|bak|copy|demo|sample|example|tmp)([-_.]|$)/i;
const errors = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    const rel = relative(root, absolute).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      await walk(absolute);
      continue;
    }
    if (blockedName.test(entry.name)) {
      errors.push(`اسم ملف ممنوع أو يحتاج مراجعة: ${rel}`);
    }
    if (entry.name.toLowerCase().endsWith(".html") && !allowedHtml.has(rel)) {
      errors.push(`ملف HTML إضافي غير مسموح: ${rel}`);
    }
  }
}

await walk(root);

if (errors.length) {
  console.error("فشل فحص المستودع:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("نجح فحص المستودع: لا توجد ملفات تجريبية أو نسخ HTML قديمة غير مسموح بها.");
