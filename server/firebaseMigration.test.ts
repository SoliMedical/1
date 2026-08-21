import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(projectRoot, 'client/index.html'), 'utf8');
const adminMigrationScript = readFileSync(resolve(projectRoot, 'scripts/migrate-firestore-v2.mjs'), 'utf8');

describe('ترحيل Firebase V2 غير المدمر', () => {
  it('يوفر أداة إدارية للمعاينة الافتراضية والتنفيذ الصريح بلا اعتماد على تسجيل دخول التطبيق', () => {
    expect(adminMigrationScript).toContain("const execute = process.argv.includes('--execute')");
    expect(adminMigrationScript).toContain("mode: finalize ? 'finalize' : (execute ? 'execute' : 'dry-run')");
    expect(adminMigrationScript).toContain('legacyDocumentRetained: true');
    expect(adminMigrationScript).toContain('loginFlowChanged: false');
    expect(adminMigrationScript).not.toContain("from 'firebase-admin/auth'");
  });

  it('يحمّل Firebase Storage Compat ولا يعيد مزامنة شعار Base64 ضمن المفاتيح الدائمة', () => {
    expect(indexHtml).toContain('firebase-storage-compat.js');
    expect(indexHtml).toContain('firebaseStorage = firebase.storage()');
    expect(indexHtml).toMatch(/persistentKeys:\s*\[[^\]]*'clinicLogoUrl'[^\]]*'clinicLogoStoragePath'/);
    expect(indexHtml).not.toMatch(/persistentKeys:\s*\[[^\]]*'clinicLogoDataUrl'/);
    expect(indexHtml).toContain("clinicLogoDataUrl: firebase.firestore.FieldValue.delete()");
    expect(indexHtml).toContain('getClinicLogoSrc()');
  });

  it('ينشئ وثائق مستقلة ومعرّف ترحيل ثابت ودفعات أقل من حد Firestore', () => {
    expect(indexHtml).toContain("add('patients', patientId");
    expect(indexHtml).toContain("add('visits', visitId");
    expect(indexHtml).toContain("getV2Collection('migrationManifests')");
    expect(indexHtml).toContain('const migrationId = this.dataMigration?.migrationId ||');
    expect(indexHtml).toContain('offset += 400');
    expect(indexHtml).toContain('batch.set(operation.ref, operation.data, { merge: true })');
    expect(indexHtml).toContain('legacyDocumentRetained: true');
  });

  it('يشمل سجلات التدقيق وبيانات الأرشفة المستقلة ضمن نسخة V2', () => {
    expect(indexHtml).toContain("add('auditLogs', auditId");
    expect(indexHtml).toContain("add('archiveManifests', archiveId");
    expect(indexHtml).toMatch(/persistentKeys:\s*\[[^\]]*'auditLog'[^\]]*'archiveManifests'/);
    expect(indexHtml).toContain('createArchiveManifest(');
    expect(indexHtml).toContain('markArchiveRecordRestored(');
  });

  it('يمنع تشغيل الترحيل دون اتصال ويحفظ الوثيقة القديمة كنسخة استرداد بعد النسخ', () => {
    expect(indexHtml).toContain('!navigator.onLine || !(await this.waitForCloudAuthReady())');
    expect(indexHtml).toContain('getLegacyOperationalSnapshot()');
    expect(indexHtml).toContain('It deliberately does not');
    expect(indexHtml).toContain('لم تُحذف البيانات القديمة');
  });

  it('يعتمد V2 تشغيلياً بعد تحقق المصدر القديم ويجعل الوثيقة القديمة بيانات وصفية فقط', () => {
    expect(indexHtml).toContain('isV2OperationalSyncActive(migration = this.dataMigration)');
    expect(indexHtml).toContain('async startV2OperationalSync()');
    expect(indexHtml).toContain('async pushStateToV2()');
    expect(indexHtml).toContain('if (this.isV2OperationalSyncActive()) return this.getLegacyOperationalSnapshot();');
    expect(indexHtml).toContain("if (this.isV2OperationalSyncActive()) this.pushStateToV2();");
    expect(indexHtml).toContain('hydrateV2StateFromCollectionCache()');
    expect(indexHtml).toContain("dualWriteStatus: 'pending_retry'");
    expect(indexHtml).toContain('this.dataMigration?.status !== \'completed\'');
    expect(indexHtml).toContain("return ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'expenses', 'waitingQueue', 'auditLogs', 'archiveManifests', 'settings', 'catalogs']");
    expect(indexHtml).toContain('this.stopV2OperationalSync();');
  });

  it('يوفر تقرير مطابقة بعد الترحيل قبل أي تحويل قراءة مستقبلي', () => {
    expect(indexHtml).toContain('async verifyV2MigrationConsistency()');
    expect(indexHtml).toContain("'auditLogs', 'archiveManifests'");
    expect(indexHtml).toContain('validation.matches');
    expect(indexHtml).toContain('التحقق من المطابقة');
  });

  it('يوفر تحققاً إدارياً للقراءة فقط يطابق أعداد وثائق V2 بمعرّف الترحيل', () => {
    expect(adminMigrationScript).toContain("const verify = process.argv.includes('--verify')");
    expect(adminMigrationScript).toContain("where('migrationId', '==', migrationId).get()");
    expect(adminMigrationScript).toContain("mode: 'verify'");
    expect(adminMigrationScript).toContain('legacyDocumentRetained: true');
    expect(adminMigrationScript).toContain('loginFlowChanged: false');
  });

  it('لا يعتمد حالة الترحيل أو يفعّل الكتابة المزدوجة إلا بعد المطابقة ويحميها من نسخة محلية أقدم', () => {
    expect(adminMigrationScript).toContain("const finalize = process.argv.includes('--finalize')");
    expect(adminMigrationScript).toContain('if (!validation.matches)');
    expect(adminMigrationScript).toContain("status: 'completed'");
    expect(adminMigrationScript).toContain('dualWriteEnabled: true');
    expect(indexHtml).toContain('const verifiedRemoteMigration = data?.dataMigration?.status === \'completed\'');
    expect(indexHtml).toContain("if (key === 'dataMigration' && verifiedRemoteMigration)");
    expect(indexHtml).toContain('يبقى كل من الدخول المحلي ومصدر القراءة كما هما');
  });
});

describe('أرشفة العرض الآمنة', () => {
  it('تستبعد المؤرشف من قائمة اليوم وتوفر استعادته بدلاً من حذفه', () => {
    expect(indexHtml).toContain("const matchesArchive = this.showArchivedAppointments ? Boolean(item.archivedAt) : !item.archivedAt;");
    expect(indexHtml).toContain('archiveEligibleAppointments()');
    expect(indexHtml).toContain('restoreArchivedAppointment(id)');
    expect(indexHtml).toContain('archiveStaleWaitingQueue()');
    expect(indexHtml).toContain('تمت أرشفة عرض');
  });

  it('يحوّل الموعد المكتمل إلى حالة محفوظة بدلاً من إزالته من قائمة المواعيد', () => {
    const completeStart = indexHtml.indexOf('completeAppointment(appointment) {');
    const completeSection = indexHtml.slice(completeStart, completeStart + 1400);
    expect(completeSection).toContain("appointment.status = 'completed'");
    expect(completeSection).toContain('appointment.completedAt');
    expect(completeSection).not.toContain("this.appointments = (this.appointments || []).filter(item => String(item.id) !== String(appointment.id))");
  });
});
