import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const pagePath = new URL("../client/index.html", import.meta.url);
const serviceWorkerPath = new URL("../client/public/sw.js", import.meta.url);

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
      name: "قائمة: التهاب الأنف التحسسي",
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

  it("يعدل محتوى قائمة محفوظة من الإعدادات ويحافظ على هوية القائمة", async () => {
    const { app } = await createAppData();
    let persistCalls = 0;
    let syncCalls = 0;
    app.persistState = () => { persistCalls += 1; };
    app.queueCloudSync = () => { syncCalls += 1; };
    app.recordAudit = () => undefined;
    app.showFlashNotice = () => undefined;
    app.$nextTick = (callback: () => void) => callback();
    app.renderIcons = () => undefined;
    app.diagnosesMasterList = [];
    app.recurringNotesList = [];
    app.recurringMedicinesList = [];
    app.recurringPrescriptionLists = [{
      id: "list-1", name: "قائمة: قديمة", diagnoses: ["تشخيص قديم"], notes: "ملاحظة قديمة",
      medicines: [{ name: "دواء قديم", timing: "مرة", extraDosageNotes: "قبل الأكل" }], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: ""
    }];

    app.openRecurringPrescriptionListEditor("list-1");
    app.recurringPrescriptionListDraft = {
      name: "قائمة: محدثة",
      diagnosesText: "تشخيص أول\nتشخيص ثان",
      notes: "ملاحظة محدثة",
      medicines: [{ name: "دواء جديد", timing: "كل 12 ساعة", extraDosageNotes: "بعد الأكل" }]
    };
    app.saveRecurringPrescriptionListEditor();

    expect(app.recurringPrescriptionLists).toEqual([expect.objectContaining({
      id: "list-1", name: "قائمة: محدثة", diagnoses: ["تشخيص أول", "تشخيص ثان"], notes: "ملاحظة محدثة",
      medicines: [{ name: "دواء جديد", timing: "كل 12 ساعة", extraDosageNotes: "بعد الأكل" }]
    })]);
    expect(app.selectedRecurringPrescriptionListId).toBe("list-1");
    expect(app.editingRecurringPrescriptionListId).toBe("");
    expect(persistCalls).toBe(1);
    expect(syncCalls).toBe(1);

    app.newRecordForm = { selectedDiagnosesList: [], customDiagnosis: "", generalNotes: "", selectedMedicinesWithDosage: [] };
    app.applyRecurringPrescriptionList("list-1");
    expect(app.newRecordForm).toMatchObject({
      selectedDiagnosesList: ["تشخيص أول", "تشخيص ثان"],
      generalNotes: "ملاحظة محدثة",
      selectedMedicinesWithDosage: [{ name: "دواء جديد", timing: "كل 12 ساعة", extraDosageNotes: "بعد الأكل" }]
    });
  });

  it("يلغي تحرير القائمة من دون تغيير البيانات المحفوظة", async () => {
    const { app } = await createAppData();
    app.$nextTick = (callback: () => void) => callback();
    app.renderIcons = () => undefined;
    app.recurringPrescriptionLists = [{
      id: "list-cancel", name: "قائمة ثابتة", diagnoses: ["تشخيص محفوظ"], notes: "ملاحظة محفوظة",
      medicines: [{ name: "دواء محفوظ", timing: "مرة", extraDosageNotes: "" }], createdAt: "", updatedAt: ""
    }];

    app.openRecurringPrescriptionListEditor("list-cancel");
    app.recurringPrescriptionListDraft.notes = "تغيير غير محفوظ";
    app.recurringPrescriptionListDraft.medicines[0].name = "دواء مختلف";
    app.closeRecurringPrescriptionListEditor();

    expect(app.editingRecurringPrescriptionListId).toBe("");
    expect(app.recurringPrescriptionLists[0]).toMatchObject({
      notes: "ملاحظة محفوظة",
      medicines: [{ name: "دواء محفوظ", timing: "مرة", extraDosageNotes: "" }]
    });
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

  it("يبقي الزر الأصلي والقائمة المنسدلة وحماية النماذج الطبية من اقتراحات كلمات المرور", async () => {
    const html = await readFile(pagePath, "utf8");
    const serviceWorker = await readFile(serviceWorkerPath, "utf8");

    expect(html).toContain("حفظ عناصر الروشتة كقائمة متكررة");
    expect(html).toContain('id="recurring-prescription-list"');
    expect(html).toContain("preventPasswordSuggestionsInClinicalForms()");
    expect(html).toContain("data-soli-non-auth");
    expect(html).toContain('input[type="tel"]');
    expect(html).toContain("openRecurringPrescriptionListEditor(listId)");
    expect(html).toContain("saveRecurringPrescriptionListEditor()");
    expect(html).toContain("حفظ التعديل");
    expect(html).toContain("const SOLI_APP_VERSION = 'v1.5.4'");
    expect(html).toContain("updateViaCache: 'none'");
    expect(html).toContain("sw.js?v=soli-v1.5.4");
    expect(serviceWorker).toContain('const CACHE_NAME = "soli-medical-pwa-v9"');
  });
});
