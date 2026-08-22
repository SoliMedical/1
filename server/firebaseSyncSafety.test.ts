import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const pagePath = new URL("../client/index.html", import.meta.url);

type FakeBatch = {
  sets: Array<{ ref: any; data: any; options: any }>;
  set: (ref: any, data: any, options: any) => void;
  commit: () => Promise<void>;
};

function createFirestoreStub() {
  const batches: FakeBatch[] = [];
  const makeCollection = (path: string): any => ({
    id: path.split("/").at(-1),
    path,
    doc(id: string) {
      const ref: any = {
        id: String(id),
        path: `${path}/${id}`,
        parent: { id: path.split("/").at(-1) },
        collection(name: string) {
          return makeCollection(`${path}/${id}/${name}`);
        },
        doc(childId: string) {
          return makeCollection(`${path}/${id}`).doc(childId);
        },
      };
      return ref;
    },
    where() {
      return {
        get: async () => ({ docs: [] }),
        onSnapshot: () => () => undefined,
      };
    },
  });
  const firestore: any = {
    collection: (name: string) => makeCollection(name),
    doc: (path: string) => {
      const parts = path.split("/");
      const parent = parts.at(-2) || "";
      const id = parts.at(-1) || "";
      return { id, path, parent: { id } , collection: (name: string) => makeCollection(`${path}/${name}`) };
    },
    batch: () => {
      const batch: FakeBatch = {
        sets: [],
        set(ref, data, options) {
          this.sets.push({ ref, data, options });
        },
        commit: async () => undefined,
      };
      batches.push(batch);
      return batch;
    },
    enablePersistence: async () => undefined,
  };
  firestore.FieldValue = { delete: () => ({ __delete: true }) };
  return { firestore, batches };
}

async function createAppData({
  storage = new Map<string, string>(),
  firebaseConfigured = false,
}: { storage?: Map<string, string>; firebaseConfigured?: boolean } = {}) {
  const html = await readFile(pagePath, "utf8");
  const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .find(script => script.includes("Alpine.data('appData'"));
  if (!source) throw new Error("تعذر العثور على تعريف تطبيق العيادة.");

  let onAlpineInit: (() => void) | undefined;
  let appFactory: (() => Record<string, unknown>) | undefined;
  const { firestore, batches } = createFirestoreStub();
  const windowStub: any = {
    SOLI_FIREBASE_CONFIG: firebaseConfigured ? { apiKey: "test-key" } : {},
    location: { search: "", hash: "" },
    setTimeout,
    clearTimeout,
    addEventListener: () => undefined,
    crypto: { randomUUID: () => "test-device" },
  };
  const context = vm.createContext({
    Alpine: {
      data: (name: string, factory: () => Record<string, unknown>) => {
        if (name === "appData") appFactory = factory;
      },
    },
    firebase: {
      initializeApp: () => undefined,
      auth: () => ({ currentUser: null, onAuthStateChanged: () => undefined }),
      firestore: () => firestore,
      storage: () => ({}),
    },
    document: {
      addEventListener: (name: string, callback: () => void) => {
        if (name === "alpine:init") onAlpineInit = callback;
      },
      querySelectorAll: () => [],
    },
    window: windowStub,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    navigator: { onLine: true },
    URLSearchParams,
    URL,
    console,
    confirm: () => true,
    alert: () => undefined,
    setTimeout,
    clearTimeout,
    Date,
    Math,
  });

  new vm.Script(source, { filename: "index.html:inline-app-script" }).runInContext(context);
  onAlpineInit?.();
  if (!appFactory) throw new Error("تعذر إنشاء حالة تطبيق العيادة.");
  return { app: appFactory() as Record<string, any>, storage, batches };
}

function activateOperationalSync(app: Record<string, any>) {
  app.cloudClinicId = "clinic-1";
  app.syncDeviceId = "device-1";
  app.dataMigration = { status: "completed", migrationId: "migration-1", dualWriteEnabled: true };
  app.cloudSyncEnabled = true;
  app.cloudAuthReady = true;
  app.cloudMembershipReady = true;
  app.persistState = () => undefined;
  app.queueCloudSync = () => undefined;
  app.$nextTick = (callback: () => void) => callback();
  app.renderIcons = () => undefined;
}

describe("مزامنة Soli Medical Offline-first", () => {
  it("يحفظ outbox الحذف بعد انقطاع الاتصال وإعادة فتح التطبيق", async () => {
    const storage = new Map<string, string>();
    const first = await createAppData({ storage });
    const app = first.app;
    const realPersistState = app.persistState.bind(app);
    activateOperationalSync(app);
    app.localChangesPending = false;
    app.patients = [{ id: "p1", fullName: "مريض مشترك", records: [{ id: "v1", patientId: "p1" }] }, { id: "p2", fullName: "مريض مشترك", records: [] }];
    app.prescriptions = [{ id: "rx1", patientId: "p1", patientName: "مريض مشترك" }, { id: "rx2", patientId: "p2", patientName: "مريض مشترك" }];
    app.appointments = [{ id: "a1", patientId: "p1" }, { id: "a2", patientId: "p2" }];
    app.invoices = [{ id: "i1", patientId: "p1" }, { id: "i2", patientId: "p2" }];
    app.waitingQueue = [{ id: "q1", patientId: "p1" }, { id: "q2", patientId: "p2" }];
    app.deletePatient("p1");
    app.syncJournal.pendingState = true;
    realPersistState();

    const reopened = (await createAppData({ storage })).app;
    reopened.loadPersistedState();
    expect(reopened.localChangesPending).toBe(true);
    expect(reopened.syncJournal.pendingOperations.map((item: any) => `${item.collection}/${item.documentId}`)).toEqual(expect.arrayContaining([
      "patients/p1", "visits/v1", "prescriptions/rx1", "appointments/a1", "invoices/i1", "waitingQueue/q1",
    ]));
    expect(reopened.syncJournal.pendingOperations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ documentId: "p2" }),
      expect.objectContaining({ documentId: "rx2" }),
    ]));
    expect(reopened.patients).toEqual([{ id: "p2", fullName: "مريض مشترك", records: [] }]);
  });

  it("يكتب tombstone محددًا باستخدام set ولا ينفذ batch.delete", async () => {
    const { app, batches } = await createAppData({ firebaseConfigured: true });
    activateOperationalSync(app);
    app.patients = [];
    app.prescriptions = [];
    app.appointments = [];
    app.invoices = [];
    app.waitingQueue = [];
    app.syncJournal = {
      version: 1,
      pendingState: true,
      pendingOperations: [{ operationId: "patients/p1", kind: "tombstone", collection: "patients", documentId: "p1", patientId: "p1", sequence: 7, deletedAt: "2026-08-22T00:00:00.000Z", writerId: "device-1" }],
      completedTombstones: [],
      nextSequence: 7,
      lastAppliedRemoteRevision: 0,
      baseRevision: 0,
    };
    app.waitForCloudAuthReady = async () => true;
    app.saveV2MirrorFingerprints = () => undefined;
    app.persistState = () => undefined;
    app.v2OperationalCollectionCache = {};
    const result = await app.flushV2MirroredChanges({ operationalWrite: true });
    const deleteSet = batches.flatMap(batch => batch.sets).find(call => call.ref.path === "clinics/clinic-1/patients/p1" && call.data._deleted === true);
    expect(result.ok).toBe(true);
    expect(deleteSet).toMatchObject({ data: { _deleted: true, sourceDocumentId: "p1", syncSequence: 7 } });
    expect(batches.every(batch => typeof (batch as any).delete !== "function")).toBe(true);
    expect(app.syncJournal.pendingOperations).toHaveLength(0);
    expect(app.syncJournal.completedTombstones).toEqual([expect.objectContaining({ collection: "patients", documentId: "p1" })]);

    app.dataMigration.topLevelCollections = { status: "completed", migrationId: "top-level-1", dualWriteEnabled: true };
    app.syncJournal = {
      ...app.syncJournal,
      pendingState: true,
      pendingOperations: [{ operationId: "patients/p2", kind: "tombstone", collection: "patients", documentId: "p2", patientId: "p2", sequence: 8, deletedAt: "2026-08-22T00:00:00.000Z", writerId: "device-1" }],
    };
    await app.flushV2MirroredChanges({ operationalWrite: true });
    const topLevelSet = batches.flatMap(batch => batch.sets).find(call => call.ref.path === "patients/clinic-1__p2" && call.data._deleted === true);
    expect(topLevelSet).toMatchObject({ data: { _deleted: true, clinicId: "clinic-1", sourceDocumentId: "p2" } });
  });

  it("يحافظ على عدم تأثر المريض ذي الاسم نفسه ويمنع snapshot أثناء وجود pending", async () => {
    const { app } = await createAppData();
    activateOperationalSync(app);
    app.patients = [{ id: "p1", fullName: "اسم متكرر", records: [] }, { id: "p2", fullName: "اسم متكرر", records: [] }];
    app.prescriptions = [{ id: "rx1", patientId: "p1" }, { id: "rx2", patientId: "p2" }];
    app.deletePatient("p1");
    expect(app.prescriptions).toEqual([{ id: "rx2", patientId: "p2" }]);

    app.v2OperationalReady = true;
    app.localChangesPending = true;
    app.syncJournal.pendingState = true;
    app.v2OperationalCollectionCache = { patients: [{ id: "p2", _documentId: "p2" }] };
    expect(app.applyV2RemoteState()).toBe(false);
  });

  it("يثبت visitId وpatientId في الزيارة الجديدة ويستدعي الحفظ والمزامنة صراحة", async () => {
    const { app } = await createAppData({ firebaseConfigured: true });
    app.patients = [{ id: "p1", fullName: "مريض", phone: "", visitType: "كشف", selectedSymptoms: [], records: [] }];
    app.selectedPatientForRecord = app.patients[0];
    app.newRecordForm = {
      selectedDiagnosesList: ["تشخيص"],
      customDiagnosis: "",
      selectedVitals: [],
      customVital: "",
      selectedLabTests: [],
      customLabTest: "",
      selectedRadiology: [],
      customRadiology: "",
      selectedMedicinesWithDosage: [],
      nextFollowUpDate: "",
      generalNotes: "",
    };
    let persisted = 0;
    let queued = 0;
    app.persistState = () => { persisted += 1; };
    app.queueCloudSync = () => { queued += 1; };
    app.removeFromQueueForPatient = () => undefined;
    app.renderIcons = () => undefined;
    app.addMedicalRecord();
    const firstVisit = app.selectedPatientForRecord.records[0];
    expect(firstVisit.id).toMatch(/^REC-/);
    expect(firstVisit.patientId).toBe("p1");
    expect(persisted).toBeGreaterThan(0);
    expect(queued).toBeGreaterThan(0);

    const operations = app.buildV2MigrationOperations({ patients: [{ ...app.selectedPatientForRecord }], prescriptions: [], appointments: [], invoices: [], expenses: [], waitingQueue: [], auditLog: [], archiveManifests: [] }, "migration-1", "2026-08-22T00:00:00.000Z");
    const visitOperation = operations.find((operation: any) => operation.ref.parent.id === "visits");
    expect(visitOperation.ref.id).toBe(firstVisit.id);
    expect(visitOperation.data.patientId).toBe("p1");
  });

  it("لا يحجب فشل مجموعات الإدارة الاختيارية ظهور الزيارة على جهاز عضو عادي", async () => {
    const { app } = await createAppData();
    activateOperationalSync(app);
    app.dataMigration = { status: "completed", migrationId: "migration-1", dualWriteEnabled: true };
    expect(app.isOptionalV2OperationalCollection("visits")).toBe(false);
    expect(app.isOptionalV2OperationalCollection("auditLogs")).toBe(true);
    expect(app.isOptionalV2OperationalCollection("archiveManifests")).toBe(true);
    expect(app.isOptionalV2OperationalCollection("settings")).toBe(true);

    app.v2OperationalCollectionCache = {
      patients: [{ id: "p1", fullName: "مريض", _documentId: "p1" }],
      visits: [{ id: "v1", patientId: "p1", diagnosis: "تشخيص", _documentId: "v1" }],
      appointments: [], invoices: [], prescriptions: [], expenses: [], waitingQueue: [], catalogs: []
    };
    const hydrated = app.hydrateV2StateFromCollectionCache();
    expect(hydrated.patients).toEqual([expect.objectContaining({ id: "p1", records: [{ id: "v1", diagnosis: "تشخيص" }] })]);
    expect(hydrated.auditLog).toBeUndefined();
    expect(hydrated.archiveManifests).toBeUndefined();
  });

  it("يحمّل الزيارة على الجهاز الثاني رغم رفض مجموعات الإدارة غير اللازمة", async () => {
    const { app } = await createAppData({ firebaseConfigured: true });
    activateOperationalSync(app);
    app.dataMigration = { status: "completed", migrationId: "migration-1", dualWriteEnabled: true };
    const remoteDocs: Record<string, Array<{ id: string; data: Record<string, any> }>> = {
      patients: [{ id: "p1", data: { id: "p1", fullName: "مريض" } }],
      visits: [{ id: "v1", data: { id: "v1", patientId: "p1", diagnosis: "تشخيص" } }],
      appointments: [], invoices: [], prescriptions: [], expenses: [], waitingQueue: [], catalogs: []
    };
    app.getOperationalCollectionQuery = (name: string) => ({
      get: async () => {
        if (app.isOptionalV2OperationalCollection(name)) throw new Error("permission-denied");
        return { docs: (remoteDocs[name] || []).map(document => ({ id: document.id, data: () => document.data })) };
      },
      onSnapshot: () => () => undefined,
    });
    await app.startV2OperationalSync();

    expect(app.v2OperationalReady).toBe(true);
    expect(app.v2OperationalErrors).toEqual(expect.arrayContaining(["auditLogs", "archiveManifests", "settings"]));
    expect(app.patients[0]).toMatchObject({ id: "p1", records: [{ id: "v1", diagnosis: "تشخيص" }] });
  });

  it("يملأ معرفًا ثابتًا للسجل القديم مرة واحدة ولا يغيره عند إعادة الترتيب", async () => {
    const { app } = await createAppData();
    app.patients = [{ id: "p1", fullName: "مريض", records: [{ date: "2026-08-01" }, { id: "old-2", date: "2026-08-02" }] }];
    expect(app.normalizeStableVisitIds()).toBe(true);
    const stableId = app.patients[0].records[0].id;
    app.patients[0].records.reverse();
    expect(app.normalizeStableVisitIds()).toBe(false);
    expect(app.patients[0].records.find((visit: any) => visit.date === "2026-08-01").id).toBe(stableId);
  });

  it("يتجاهل سجلًا قديمًا في الكاش بعد tombstone مؤكد حتى عند إعادة الترطيب", async () => {
    const { app } = await createAppData();
    activateOperationalSync(app);
    app.v2OperationalReady = true;
    app.localChangesPending = false;
    app.syncJournal = {
      version: 1,
      pendingState: false,
      pendingOperations: [],
      completedTombstones: [{ operationId: "patients/p1", kind: "tombstone", collection: "patients", documentId: "p1", sequence: 4, deletedAt: "2026-08-22T00:00:00.000Z", writerId: "device-1" }],
      nextSequence: 4,
      lastAppliedRemoteRevision: 0,
      baseRevision: 0,
    };
    app.v2OperationalCollectionCache = { patients: [{ id: "p1", fullName: "قديم", _documentId: "p1" }] };
    app.applyPendingSyncOperationsToCache();
    const applied = app.applyV2RemoteState();
    expect(applied).toBe(true);
    expect(app.patients.some((patient: any) => String(patient.id) === "p1")).toBe(false);
  });
});
