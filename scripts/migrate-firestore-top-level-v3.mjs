import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const projectId = process.env.FIREBASE_PROJECT_ID || 'clinic1-ba255';
const clinicId = process.env.FIREBASE_CLINIC_ID || 'shared-clinic-v1';
const legacyDocPath = process.env.FIREBASE_LEGACY_DOC_PATH || 'soliMedicalApp/sharedClinicData';
const batchSize = 400;
const maxDocumentBytes = 900_000;
const dataCollections = ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'expenses', 'waitingQueue', 'auditLogs', 'archiveManifests'];

function argValue(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function safeId(value, fallback) {
  const candidate = String(value ?? fallback ?? '').trim().replace(/\//g, '_');
  if (!candidate) throw new Error(`تعذر إنشاء معرّف ثابت لـ ${fallback}.`);
  return candidate;
}
function topLevelId(collection, sourceId) { return safeId(`${clinicId}__${safeId(sourceId, collection)}`, `${collection}-record`); }
function sanitize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || typeof value.toDate === 'function') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, sanitize(entry)]));
}
function countLegacy(state) {
  const patients = Array.isArray(state?.patients) ? state.patients : [];
  return { patients: patients.length, visits: patients.reduce((total, patient) => total + (Array.isArray(patient?.records) ? patient.records.length : 0), 0), appointments: (state?.appointments || []).length, invoices: (state?.invoices || []).length, prescriptions: (state?.prescriptions || []).length, expenses: (state?.expenses || []).length, waitingQueue: (state?.waitingQueue || []).length, auditLogs: (state?.auditLog || []).length, archiveManifests: (state?.archiveManifests || []).length, settings: 1, catalogs: 2 };
}
function buildOperations({ state, db, migrationId, migratedAt }) {
  const operations = [];
  const add = (collection, id, data) => {
    const sourceDocumentId = safeId(id, `${collection}-${operations.length}`);
    const payload = sanitize({ ...data, clinicId, sourceDocumentId, schemaVersion: 3, topLevelMigrationId: migrationId, topLevelMigratedAt: migratedAt });
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes > maxDocumentBytes) throw new Error(`وثيقة ${collection}/${sourceDocumentId} حجمها ${bytes} بايت؛ لم تُكتب أي بيانات.`);
    operations.push({ collection, ref: db.collection(collection).doc(topLevelId(collection, sourceDocumentId)), data: payload });
  };
  (state.patients || []).forEach((patient, patientIndex) => {
    const { records = [], ...profile } = patient || {};
    const patientId = safeId(patient?.id, `patient-${patientIndex}`);
    add('patients', patientId, { ...profile, legacyId: String(patient?.id || patientId), searchName: String(patient?.fullName || patient?.name || '').trim().toLowerCase() });
    (Array.isArray(records) ? records : []).forEach((visit, visitIndex) => {
      const visitId = safeId(visit?.id, `${patientId}-visit-${visitIndex}`);
      add('visits', visitId, { ...visit, legacyId: String(visit?.id || visitId), patientId, patientLegacyId: String(patient?.id || patientId) });
    });
  });
  [['appointments', state.appointments], ['invoices', state.invoices], ['prescriptions', state.prescriptions], ['expenses', state.expenses], ['waitingQueue', state.waitingQueue]].forEach(([collection, items]) => (items || []).forEach((item, index) => {
    const id = safeId(item?.id, `${collection}-${index}`); add(collection, id, { ...item, legacyId: String(item?.id || id) });
  }));
  add('settings', 'general', { doctorInfo: state.doctorInfo || {}, clinics: state.clinics || [], visitTypePrices: state.visitTypePrices || {}, idleLockEnabled: Boolean(state.idleLockEnabled), idleLockMinutes: Number(state.idleLockMinutes || 15), branding: { logoUrl: state.clinicLogoUrl || '', logoStoragePath: state.clinicLogoStoragePath || '' } });
  add('catalogs', 'clinical', { symptomsList: state.symptomsList || [], chronicDiseasesList: state.chronicDiseasesList || [], diagnosesMasterList: state.diagnosesMasterList || [], medicinesMasterList: state.medicinesMasterList || [], labTestsMasterList: state.labTestsMasterList || [], radiologyMasterList: state.radiologyMasterList || [], vitalSignsMasterList: state.vitalSignsMasterList || [], expenseCategories: state.expenseCategories || [], recordFormSections: state.recordFormSections || [] });
  add('catalogs', 'templates', { recurringPrescriptionLists: state.recurringPrescriptionLists || [], recurringNotesList: state.recurringNotesList || [], recurringMedicinesList: state.recurringMedicinesList || [] });
  (state.auditLog || []).forEach((entry, index) => { const id = safeId(entry?.id, `audit-${index}`); add('auditLogs', id, { ...entry, legacyId: String(entry?.id || id) }); });
  (state.archiveManifests || []).forEach((entry, index) => { const id = safeId(entry?.id, `archive-${index}`); add('archiveManifests', id, { ...entry, legacyId: String(entry?.id || id) }); });
  return operations;
}
async function initializeAdmin() {
  if (getApps().length) return getApps()[0];
  const credentialFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  const raw = credentialFile ? readFileSync(credentialFile, 'utf8') : (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
  if (!raw) throw new Error('لم يتوفر اعتماد Firebase الإداري؛ لا يمكن تشغيل ترحيل V3 آمن من متصفح عام.');
  return initializeApp({ credential: cert(JSON.parse(raw)), projectId });
}
async function verifyMigration({ db, migrationId, expected }) {
  const collections = Object.keys(expected);
  const values = await Promise.all(collections.map(async collection => {
    const snapshot = await db.collection(collection).where('clinicId', '==', clinicId).get();
    return [collection, snapshot.docs.filter(doc => doc.data()?.topLevelMigrationId === migrationId).length];
  }));
  const actual = Object.fromEntries(values);
  const mismatches = collections.filter(collection => actual[collection] !== expected[collection]);
  return { actual, matches: mismatches.length === 0, mismatches };
}
async function executeMigration({ db, operations, migrationId, expected }) {
  const clinicRef = db.collection('clinics').doc(clinicId);
  const manifestRef = clinicRef.collection('migrationManifests').doc(migrationId);
  await manifestRef.set({ migrationId, schemaVersion: 3, status: 'running', target: 'top-level-collections', expected, operationCount: operations.length, sourcePath: legacyDocPath, legacyDocumentRetained: true, nestedV2Retained: true, startedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (let offset = 0; offset < operations.length; offset += batchSize) {
    const batch = db.batch(); operations.slice(offset, offset + batchSize).forEach(({ ref, data }) => batch.set(ref, data, { merge: true })); await batch.commit();
  }
  await manifestRef.set({ status: 'copied', completedAt: FieldValue.serverTimestamp() }, { merge: true });
}
async function finalizeMigration({ db, migrationId, expected, actual }) {
  const legacyRef = db.doc(legacyDocPath); const clinicRef = db.collection('clinics').doc(clinicId); const manifestRef = clinicRef.collection('migrationManifests').doc(migrationId); const finalizedAt = new Date().toISOString();
  await db.runTransaction(async transaction => {
    const legacySnapshot = await transaction.get(legacyRef);
    if (!legacySnapshot.exists) throw new Error(`لم تعد وثيقة البيانات القديمة موجودة: ${legacyDocPath}`);
    const legacyState = legacySnapshot.data() || {}; const previous = legacyState.dataMigration || {}; const existing = previous.topLevelCollections || {};
    if (existing.status === 'completed' && existing.migrationId && existing.migrationId !== migrationId) throw new Error('يوجد ترحيل علوي مكتمل مختلف بالفعل؛ لم تتغير حالة المصدر.');
    transaction.set(legacyRef, { dataMigration: { ...previous, topLevelCollections: { status: 'completed', migrationId, schemaVersion: 3, tenantModel: 'one-doctor-one-clinic', sourceDocumentRetained: true, nestedV2Retained: true, dualWriteEnabled: true, expected, verifiedCounts: actual, finalizedAt } } }, { merge: true });
    transaction.set(clinicRef, { clinicId, topLevelMigrationState: 'completed', activeTopLevelMigrationId: migrationId, tenantModel: 'one-doctor-one-clinic', legacyDocumentRetained: true, nestedV2Retained: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(manifestRef, { status: 'verified', verifiedCounts: actual, verifiedAt: FieldValue.serverTimestamp(), legacyDocumentRetained: true, nestedV2Retained: true, loginFlowChanged: false }, { merge: true });
  });
}
async function main() {
  const execute = process.argv.includes('--execute'); const verify = process.argv.includes('--verify'); const finalize = process.argv.includes('--finalize');
  if ([execute, verify, finalize].filter(Boolean).length > 1) throw new Error('اختر وضعاً واحداً فقط: المعاينة أو التنفيذ أو التحقق أو الاعتماد.');
  const migrationId = argValue('--migration-id') || `top-level-v3-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await initializeAdmin(); const db = getFirestore(); const snapshot = await db.doc(legacyDocPath).get();
  if (!snapshot.exists) throw new Error(`لم توجد وثيقة البيانات القديمة: ${legacyDocPath}`);
  const state = snapshot.data() || {}; const expected = countLegacy(state); const operations = buildOperations({ state, db, migrationId, migratedAt: new Date().toISOString() });
  const report = { mode: finalize ? 'finalize' : (verify ? 'verify' : (execute ? 'execute' : 'dry-run')), projectId, clinicId, legacyDocPath, migrationId, target: 'top-level-collections', tenantModel: 'one-doctor-one-clinic', expected, operationCount: operations.length, batchCount: Math.ceil(operations.length / batchSize), legacyDocumentRetained: true, nestedV2Retained: true, loginFlowChanged: false };
  if (verify || finalize) { const validation = await verifyMigration({ db, migrationId, expected }); if (finalize && validation.matches) await finalizeMigration({ db, migrationId, expected, actual: validation.actual }); console.log(JSON.stringify({ ...report, validation, status: finalize ? (validation.matches ? 'completed' : 'not-finalized') : 'verified' }, null, 2)); if (!validation.matches) process.exitCode = 1; return; }
  if (!execute) { console.log(JSON.stringify(report, null, 2)); return; }
  await executeMigration({ db, operations, migrationId, expected }); console.log(JSON.stringify({ ...report, status: 'copied' }, null, 2));
}
main().catch(error => { console.error(`فشل ترحيل Firestore V3: ${error.message}`); process.exitCode = 1; });
