#!/usr/bin/env node
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
  console.log("تم تفعيل حاجز الإصدار المحلي: سيُفحص أي دفع قبل إرساله.");
} catch (error) {
  console.error(`تعذر تفعيل حاجز الإصدار: ${error.message}`);
  process.exitCode = 1;
}
