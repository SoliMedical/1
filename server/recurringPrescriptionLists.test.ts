import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const pagePath = new URL("../index.html", import.meta.url);

async function createAppData() {
  const html = await readFile(pagePath, "utf8");
  const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .find(script => script.includes("Alpine.data('appData'"));
  if (!source) throw new Error("تعذر العثور على تعريف تطبيق العيادة.");

  let onAlpineInit: (() => void) | undefined;
  let appFactory: (() => Record<string, unknown>) | undefined;
  const localStorage = new Map<string, string>();
  const alerts: string[] = [];
  const windowStub = {
    SOLI_FIREBASE_CONFIG: {},
    location: { search: "", hash: "" },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  };
  const context = vm.createContext({
    Alpine: {
      data: (name: string, factory: () => Record<string, unknown>) => {
        if (name === "appData") appFactory = factory;
      },
    },
    document: {
      addEventListener: (name: string, callback: () => void) => {
        if (name === "alpine:init") onAlpineInit = callback;
      },
    },
    window: windowStub,
    localStorage: {
      getItem: (key: string) => localStorage.get(key) ?? null,
      setItem: (key: string, value: string) => localStorage.set(key, value),
    },
    URLSearchParams,
    URL,
    console,
    confirm: () => true,
    alert: (message?: string) => alerts.push(String(message || "")),
  });

  new vm.Script(source, { filename: "index.html:inline-app-script" }).runInContext(context);
  onAlpineInit?.();
  if (!appFactory) throw new Error("تعذر إنشاء حالة تطبيق العيادة.");
  return { app: appFactory() as Record<string, any>, alerts };
}

describe("قوائم الروشتة المتكررة", () => {
  it("يحفظ قالباً كاملاً ثم يعيد التشخيص والملاحظات والجرعات عند تحميله", async () => {
    const { app } = await createAppData();
    const audit: unknown[][] = [];
    const notices: unknown[][] = [];
    app.persistState = () => undefined;
    app.queueCloudSync = () => undefined;
    app.recordAudit = (...args: unknown[]) => audit.push(args);
    app.showFlashNotice = (...args: unknown[]) => notices.push(args);
    app.$nextTick = (callback: () => void) => callback();
    app.renderIcons = () => undefined;
    app.diagnosesMasterList = [];
    app.recurringNotesList = [];
    app.recurringMedicinesList = [];
    app.recurringPrescriptionLists = [];
    app.newRecurringPrescriptionListName = "حساسية موسمية";
    app.newRecordForm = {
      selectedDiagnosesList: ["التهاب الأنف التحسسي"],
      customDiagnosis: "",
      generalNotes: "تجنب المثيرات والمتابعة عند الحاجة.",
      selectedMedicinesWithDosage: [
        { name: "لوراتادين", timing: "مرة يومياً", extraDosageNotes: "بعد الأكل" },
      ],
    };

    app.saveRecurringItemsFromPrescription();

    expect(app.recurringPrescriptionLists).toHaveLength(1);
    expect(app.recurringPrescriptionLists[0]).toMatchObject({
      name: "حساسية موسمية",
      diagnoses: ["التهاب الأنف التحسسي"],
      notes: "تجنب المثيرات والمتابعة عند الحاجة.",
      medicines: [{ name: "لوراتادين", timing: "مرة يومياً", extraDosageNotes: "بعد الأكل" }],
    });
    expect(app.selectedRecurringPrescriptionListId).toBe(app.recurringPrescriptionLists[0].id);
    expect(audit).toHaveLength(1);

    app.newRecordForm = {
      selectedDiagnosesList: [],
      customDiagnosis: "تشخيص مؤقت",
      generalNotes: "ملاحظة مؤقتة",
      selectedMedicinesWithDosage: [],
    };
    app.applyRecurringPrescriptionList(app.recurringPrescriptionLists[0].id);

    expect(app.newRecordForm).toMatchObject({
      selectedDiagnosesList: ["التهاب الأنف التحسسي"],
      customDiagnosis: "",
      generalNotes: "تجنب المثيرات والمتابعة عند الحاجة.",
      selectedMedicinesWithDosage: [{ name: "لوراتادين", timing: "مرة يومياً", extraDosageNotes: "بعد الأكل" }],
    });
    expect(notices.at(-1)?.[0]).toContain("تم تحميل");
  });

  it("يرفض حفظ قائمة فارغة", async () => {
    const { app, alerts } = await createAppData();
    app.persistState = () => undefined;
    app.queueCloudSync = () => undefined;
    app.recordAudit = () => undefined;
    app.showFlashNotice = () => undefined;
    app.recurringPrescriptionLists = [];
    app.newRecordForm = {
      selectedDiagnosesList: [],
      customDiagnosis: "",
      generalNotes: "",
      selectedMedicinesWithDosage: [],
    };
    app.lastPrescriptionReusableData = null;

    app.saveRecurringItemsFromPrescription();

    expect(app.recurringPrescriptionLists).toHaveLength(0);
    expect(alerts.at(-1)).toContain("أدخل تشخيصاً أو ملاحظة أو دواءً");
  });
});
