import { describe, expect, it } from "vitest";
import {
  createPublicationMarker,
  updatePublicationLog,
} from "../scripts/record-publication.mjs";

const entry = {
  commit: "ea250e52c62fd19315b681f430e2a245211e9d0d",
  publishedAt: "2026-08-20T14:12:00Z",
  runUrl: "https://github.com/SoliMedical/1/actions/runs/32378576403",
  version: "v1.5.5",
};

describe("publication log", () => {
  it("يضيف صف نجاح يتضمن الإصدار والالتزام ورابط تشغيل Pages", () => {
    const result = updatePublicationLog("# سجل النشر\n", entry);

    expect(result.changed).toBe(true);
    expect(result.content).toContain(createPublicationMarker(entry));
    expect(result.content).toContain("v1.5.5");
    expect(result.content).toContain("ea250e5");
    expect(result.content).toContain(entry.runUrl);
  });

  it("لا يكرر السجل عندما يعاد تشغيل نفس نشر الإصدار والالتزام", () => {
    const first = updatePublicationLog("# سجل النشر\n", entry);
    const second = updatePublicationLog(first.content, entry);

    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("لا يكرر السجل عندما تأتي نقطة تحقق لاحقة بالإصدار نفسه", () => {
    const first = updatePublicationLog("# سجل النشر\n", entry);
    const laterCheckpoint = updatePublicationLog(first.content, {
      ...entry,
      commit: "8d116dbd772e2ad1c1b490c8b9c7f4189b67642b",
      runUrl: "https://github.com/SoliMedical/1/actions/runs/32399270745",
    });

    expect(laterCheckpoint.changed).toBe(false);
    expect(laterCheckpoint.content).toBe(first.content);
  });
});
