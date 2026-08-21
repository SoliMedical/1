import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'clinic1-ba255';
const clinicId = process.env.FIREBASE_CLINIC_ID || 'shared-clinic-v1';
const legacyDocPath = process.env.FIREBASE_LEGACY_DOC_PATH || 'soliMedicalApp/sharedClinicData';
const batchSize = 400;
const maxDocumentBytes = 900_000;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function safeId(value, fallback) {
  const candidate = String(value ?? fallback ?? '').trim().replace(/\//g, '_');
  if (!candidate) throw new Error(`تعذر إنشاء معرّف ثابت لـ ${fallback}.`);
  return candidate;
}

function sanitize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || typeof value.toDate === 'function') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, sanitize(entry)]));
}

function documentBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function countLegacy(state) {
  const patients = Array.isArray(state?.patients) ? state.patients : [];
  return {
    patients: patients.length,
    visits: patients.reduce((total, patient) => total + (Array.isArray(patient?.records) ? patient.records.length : 0), 0),
    appointments: Array.isArray(state?.appointments) ? state.appointments.length : 0,
    invoices: Array.isArray(state?.invoices) ? state.invoices.length : 0,
    prescriptions: Array.isArray(state?.prescriptions) ? state.prescriptions.length : 0,
    expenses: Array.isArray(state?.expenses) ? state.expenses.length : 0,
    waitingQueue: Array.isArray(state?.waitingQueue) ? state.waitingQueue.length : 0,
    auditLogs: Array.isArray(state?.auditLog) ? state.auditLog.length : 0,
    archiveManifests: Array.isArray(state?.archiveManifests) ? state.archiveManifests.length : 0,
    settings: 1,
    catalogs: 2
  };
}

function buildOperations({ state, db, migrationId, migratedAt }) {
  const clinicRef = db.collection('clinics').doc(clinicId);
  const operations = [];
  const add = (collection, id, data) => {
    const payload = sanitize({ ...data, schemaVersion: 2, migrationId, migratedAt });
    const bytes = documentBytes(payload);
    if (bytes > maxDocumentBytes) {
      throw new Error(`وثيقة ${collection}/${id} حجمها ${bytes} بايت، وهو أكبر من حد الأمان للترحيل. لم تُكتب أي بيانات.`);
    }
    operations.push({ collection, ref: clinicRef.collection(collection).doc(safeId(id, `${collection}-${operations.length}`)), data: payload });
  };

  (state.patients || []).forEach((patient, patientIndex) => {
    const { records = [], ...profile } = patient || {};
    const patientId = safeId(patient?.id, `patient-${patientIndex}`);
    add('patients', patientId, {
      ...profile,
      legacyId: String(patient?.id || patientId),
      searchName: String(patient?.fullName || patient?.name || '').trim().toLowerCase()
    });
    (Array.isArray(records) ? records : []).forEach((visit, visitIndex) => {
      const visitId = safeId(visit?.id, `${patientId}-visit-${visitIndex}`);
      add('visits', visitId, {
        ...visit,
        legacyId: String(visit?.id || visitId),
        patientId,
        patientLegacyId: String(patient?.id || patientId)
      });
    });
  });

  [
    ['appointments', state.appointments],
    ['invoices', state.invoices],
    ['prescriptions', state.prescriptions],
    ['expenses', state.expenses],
    ['waitingQueue', state.waitingQueue]
  ].forEach(([collection, items]) => (items || []).forEach((item, index) => {
    const id = safeId(item?.id, `${collection}-${index}`);
    add(collection, id, { ...item, legacyId: String(item?.id || id) });
  }));

  add('settings', 'general', {
    doctorInfo: state.doctorInfo || {},
    clinics: state.clinics || [],
    visitTypePrices: state.visitTypePrices || {},
    idleLockEnabled: Boolean(state.idleLockEnabled),
    idleLockMinutes: Number(state.idleLockMinutes || 15),
    branding: {
      logoUrl: state.clinicLogoUrl || '',
      logoStoragePath: state.clinicLogoStoragePath || ''
    }
  });
  add('catalogs', 'clinical', {
    symptomsList: state.symptomsList || [],
    chronicDiseasesList: state.chronicDiseasesList || [],
    diagnosesMasterList: state.diagnosesMasterList || [],
    medicinesMasterList: state.medicinesMasterList || [],
    labTestsMasterList: state.labTestsMasterList || [],
    radiologyMasterList: state.radiologyMasterList || [],
    vitalSignsMasterList: state.vitalSignsMasterList || [],
    expenseCategories: state.expenseCategories || [],
    recordFormSections: state.recordFormSections || []
  });
  add('catalogs', 'templates', {
    recurringPrescriptionLists: state.recurringPrescriptionLists || [],
    recurringNotesList: state.recurringNotesList || [],
    recurringMedicinesList: state.recurringMedicinesList || []
  });
  (state.auditLog || []).forEach((entry, index) => {
    const auditId = safeId(entry?.id, `audit-${index}`);
    add('auditLogs', auditId, { ...entry, legacyId: String(entry?.id || auditId) });
  });
  (state.archiveManifests || []).forEach((entry, index) => {
    const archiveId = safeId(entry?.id, `archive-${index}`);
    add('archiveManifests', archiveId, { ...entry, legacyId: String(entry?.id || archiveId) });
  });
  return { clinicRef, operations };
}

async function initializeAdmin() {
  if (getApps().length) return getApps()[0];
  const credentialFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const raw = credentialFile ? readFileSync(credentialFile, 'utf8') : (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
  if (!raw) throw new Error('لم يتوفر اعتماد Firebase الإداري. لا يمكن تشغيل ترحيل آمن من متصفح عام.');
  try {
    return initializeApp({ credential: cert(JSON.parse(raw)), projectId });
  } catch (error) {
    throw new Error(`تعذر تهيئة اعتماد Firebase الإداري: ${error.message}`);
  }
}

async function executeMigration({ db, clinicRef, operations, migrationId, expected }) {
  const manifestRef = clinicRef.collection('migrationManifests').doc(migrationId);
  await clinicRef.set({ schemaVersion: 2, clinicId, legacySourcePath: legacyDocPath, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await manifestRef.set({
    migrationId,
    status: 'running',
    sourcePath: legacyDocPath,
    expected,
    operationCount: operations.length,
    batchSize,
    legacyDocumentRetained: true,
    startedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  for (let offset = 0; offset < operations.length; offset += batchSize) {
    const batch = db.batch();
    operations.slice(offset, offset + batchSize).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
  await manifestRef.set({ status: 'copied', completedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function verifyMigration({ db, migrationId, expected }) {
  const clinicRef = db.collection('clinics').doc(clinicId);
  const collections = Object.keys(expected);
  const actualEntries = await Promise.all(collections.map(async collection => {
    const snapshot = await clinicRef.collection(collection).where('migrationId', '==', migrationId).get();
    return [collection, snapshot.size];
  }));
  const actual = Object.fromEntries(actualEntries);
  const mismatches = collections.filter(collection => actual[collection] !== expected[collection]);
  return { actual, matches: mismatches.length === 0, mismatches };
}

async function finalizeVerifiedMigration({ db, migrationId, expected, actual }) {
  const legacyRef = db.doc(legacyDocPath);
  const clinicRef = db.collection('clinics').doc(clinicId);
  const manifestRef = clinicRef.collection('migrationManifests').doc(migrationId);
  const finalizedAt = new Date().toISOString();

  await db.runTransaction(async transaction => {
    const legacySnapshot = await transaction.get(legacyRef);
    if (!legacySnapshot.exists) throw new Error(`لم تعد وثيقة البيانات القديمة موجودة: ${legacyDocPath}`);
    const legacyState = legacySnapshot.data() || {};
    const previousMigration = legacyState.dataMigration || {};
    if (previousMigration.status === 'completed' && previousMigration.migrationId && previousMigration.migrationId !== migrationId) {
      throw new Error('يوجد ترحيل مكتمل مختلف بالفعل؛ لم تتغير حالة المصدر القديم.');
    }
    const previousMeta = legacyState._syncMeta || {};
    transaction.set(legacyRef, {
      dataMigration: {
        status: 'completed',
        migrationId,
        sourceDocumentRetained: true,
        dualWriteEnabled: true,
        expected,
        verifiedCounts: actual,
        finalizedAt
      },
      _syncMeta: {
        ...previousMeta,
        revision: Number(previousMeta.revision || 0) + 1,
        writerId: 'firebase-admin-v2-migration',
        updatedAt: finalizedAt,
        operation: 'v2-migration-finalized'
      }
    }, { merge: true });
    transaction.set(clinicRef, {
      schemaVersion: 2,
      clinicId,
      migrationState: 'completed',
      activeMigrationId: migrationId,
      legacyDocumentRetained: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(manifestRef, {
      status: 'verified',
      verifiedCounts: actual,
      verifiedAt: FieldValue.serverTimestamp(),
      legacyDocumentRetained: true,
      loginFlowChanged: false
    }, { merge: true });
  });
}

async function main() {
  const execute = process.argv.includes('--execute');
  const verify = process.argv.includes('--verify');
  const finalize = process.argv.includes('--finalize');
  const migrationId = argValue('--migration-id') || `legacy-v2-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if ([execute, verify, finalize].filter(Boolean).length > 1) throw new Error('اختر وضعاً واحداً فقط: المعاينة أو التنفيذ أو التحقق أو الاعتماد.');
  await initializeAdmin();
  const db = getFirestore();
  const legacySnapshot = await db.doc(legacyDocPath).get();
  if (!legacySnapshot.exists) throw new Error(`لم توجد وثيقة البيانات القديمة: ${legacyDocPath}`);
  const state = legacySnapshot.data() || {};
  const expected = countLegacy(state);
  const { clinicRef, operations } = buildOperations({ state, db, migrationId, migratedAt: new Date().toISOString() });
  const report = { mode: finalize ? 'finalize' : (execute ? 'execute' : 'dry-run'), projectId, clinicId, legacyDocPath, migrationId, expected, operationCount: operations.length, batchCount: Math.ceil(operations.length / batchSize), legacyDocumentRetained: true, loginFlowChanged: false };
  if (verify) {
    const validation = await verifyMigration({ db, migrationId, expected });
    console.log(JSON.stringify({ ...report, mode: 'verify', validation }, null, 2));
    if (!validation.matches) process.exitCode = 1;
    return;
  }
  if (finalize) {
    const validation = await verifyMigration({ db, migrationId, expected });
    if (!validation.matches) {
      console.log(JSON.stringify({ ...report, validation, status: 'not-finalized' }, null, 2));
      process.exitCode = 1;
      return;
    }
    await finalizeVerifiedMigration({ db, migrationId, expected, actual: validation.actual });
    console.log(JSON.stringify({ ...report, validation, status: 'completed', dualWriteEnabled: true }, null, 2));
    return;
  }
  if (!execute) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  await executeMigration({ db, clinicRef, operations, migrationId, expected });
  console.log(JSON.stringify({ ...report, status: 'copied' }, null, 2));
}

main().catch(error => {
  console.error(`فشل ترحيل Firestore V2: ${error.message}`);
  process.exitCode = 1;
});
