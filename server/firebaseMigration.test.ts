import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(projectRoot, 'client/index.html'), 'utf8');
const adminMigrationScript = readFileSync(resolve(projectRoot, 'scripts/migrate-firestore-v2.mjs'), 'utf8');
const topLevelMigrationScript = readFileSync(resolve(projectRoot, 'scripts/migrate-firestore-top-level-v3.mjs'), 'utf8');

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

  it('يعتمد مخزن الوثائق التشغيلي بعد تحقق المصدر القديم ويجعل الوثيقة القديمة بيانات وصفية فقط', () => {
    expect(indexHtml).toContain('isV2OperationalSyncActive(migration = this.dataMigration)');
    expect(indexHtml).toContain('isTopLevelOperationalSyncActive(migration = this.dataMigration)');
    expect(indexHtml).toContain('isOperationalDocumentSyncActive(migration = this.dataMigration)');
    expect(indexHtml).toContain('async startV2OperationalSync()');
    expect(indexHtml).toContain('async pushStateToV2()');
    expect(indexHtml).toContain('if (this.isOperationalDocumentSyncActive()) return this.getLegacyOperationalSnapshot();');
    expect(indexHtml).toContain("if (this.isOperationalDocumentSyncActive()) this.pushStateToV2();");
    expect(indexHtml).toContain('hydrateV2StateFromCollectionCache()');
    expect(indexHtml).toContain("dualWriteStatus: 'pending_retry'");
    expect(indexHtml).toContain('this.dataMigration?.status !== \'completed\'');
    expect(indexHtml).toContain("return ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'expenses', 'waitingQueue', 'auditLogs', 'archiveManifests', 'settings', 'catalogs']");
    expect(indexHtml).toContain('this.stopV2OperationalSync();');
  });

  it('لا يعلن انقطاعاً محلياً كاذباً إذا تأجلت أو فشلت دفعة V3 بينما مستمعات القراءة الموثقة سليمة', () => {
    expect(indexHtml).toContain("const syncError = result?.error || new Error('تعذرت مزامنة وثائق V3.')");
    expect(indexHtml).toContain('syncError.deferred = Boolean(result?.deferred);');
    expect(indexHtml).toContain('const authenticatedCloudSessionReady = Boolean(');
    expect(indexHtml).toContain('navigator.onLine && this.cloudAuthReady && this.cloudMembershipReady');
    expect(indexHtml).toContain("this.cloudStatus = authenticatedCloudSessionReady ? 'online' : 'offline';");
    expect(indexHtml).toContain('تم تأجيل مزامنة مجموعات Firestore ${schemaLabel}');
  });

  it('يفصل صحة الاتصال المؤكدة بالعضوية عن تعذر تحميل مجموعة V3 فرعية ويستأنف مراقبتها', () => {
    expect(indexHtml).toContain("this.cloudStatus = isActiveMember && navigator.onLine ? 'online' : 'offline';");
    expect(indexHtml).toContain('const results = await Promise.allSettled(names.map(name => this.getOperationalCollectionQuery(name).get()));');
    expect(indexHtml).toContain('this.v2OperationalErrors = failedCollections;');
    expect(indexHtml).toContain("this.v2OperationalReady = failedCollections.length === 0;");
    expect(indexHtml).toContain("if (!this.cloudAuthReady || !this.cloudMembershipReady || !navigator.onLine) this.cloudStatus = 'offline';");
    expect(indexHtml).not.toContain("console.error(`تعذر متابعة مجموعة V2 ${name}:`, error);\n                                this.cloudStatus = 'offline';");
  });

  it('يوفر ترحيلاً مستقلاً غير مدمر إلى مجموعات المستوى الأعلى بعزل طبيب واحد لكل clinicId', () => {
    expect(topLevelMigrationScript).toContain("target: 'top-level-collections'");
    expect(topLevelMigrationScript).toContain("tenantModel: 'one-doctor-one-clinic'");
    expect(topLevelMigrationScript).toContain('clinicId, sourceDocumentId, schemaVersion: 3');
    expect(topLevelMigrationScript).toContain("where('clinicId', '==', clinicId)");
    expect(topLevelMigrationScript).toContain('legacyDocumentRetained: true');
    expect(topLevelMigrationScript).toContain('nestedV2Retained: true');
    expect(topLevelMigrationScript).toContain("const execute = process.argv.includes('--execute')");
    expect(topLevelMigrationScript).toContain("const finalize = process.argv.includes('--finalize')");
    expect(topLevelMigrationScript).not.toContain("from 'firebase-admin/auth'");
  });

  it('يبني معرفات علوية ثابتة ويستعلم دائماً داخل clinicId الحالي عند اعتماد V3', () => {
    expect(indexHtml).toContain('getTopLevelDocumentId(name, sourceDocumentId)');
    expect(indexHtml).toContain("this.getTopLevelCollection(name).where('clinicId', '==', String(this.cloudClinicId))");
    expect(indexHtml).toContain('sourceDocumentId');
    expect(indexHtml).toContain('topLevelMigrationId');
  });

  it('يغطي كل أقسام البيانات التشغيلية من دون إنشاء نسخة مكررة لكل صفحة واجهة', () => {
    const operationalDeclaration = "return ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'expenses', 'waitingQueue', 'auditLogs', 'archiveManifests', 'settings', 'catalogs']";
    expect(indexHtml).toContain(operationalDeclaration);
    expect(indexHtml).toContain("add('settings', 'general'");
    expect(indexHtml).toContain("add('catalogs', 'clinical'");
    expect(indexHtml).toContain("add('catalogs', 'templates'");
    expect(indexHtml).toContain("add('visits', visitId");
    expect(indexHtml).not.toContain("collection('dashboard')");
    expect(indexHtml).not.toContain("collection('reports')");
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

describe('إعادة ضبط البيانات التجريبية الصريحة', () => {
  it('تطلب تأكيداً مكتوباً بأن البيانات تجريبية وكلمة مرور المدير قبل أي حذف', () => {
    expect(indexHtml).toContain("cloudResetDemoAcknowledgement: ''");
    expect(indexHtml).toContain("String(this.cloudResetDemoAcknowledgement || '').trim() !== 'بيانات تجريبية'");
    expect(indexHtml).toContain("String(this.cloudResetConfirmation || '').trim() !== 'حذف'");
    expect(indexHtml).toContain('الرقم السري للمدير غير صحيح');
    expect(indexHtml).toContain('هذه نافذة للبيانات التجريبية المعروفة فقط');
  });

  it('يمسح سجلات V2 السريرية والمالية في دفعة واحدة بعد التأكيد ويحتفظ بالإعدادات والحسابات', () => {
    expect(indexHtml).toContain('getDemoResetV2CollectionNames()');
    expect(indexHtml).toContain("return ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'expenses', 'waitingQueue', 'auditLogs', 'archiveManifests']");
    expect(indexHtml).toContain('v2Documents.forEach(document => batch.delete(document.ref))');
    expect(indexHtml).toContain("operation: 'explicit-demo-reset'");
    expect(indexHtml).toContain('demoDataAcknowledged: true');
  });

  it('يرفض إعادة ضبط كبيرة من الواجهة بدلاً من تنفيذ حذف جزئي غير آمن', () => {
    expect(indexHtml).toContain('if (v2Documents.length > 400)');
    expect(indexHtml).toContain("throw new Error('demo-reset-document-limit')");
    expect(indexHtml).toContain('لم تُمسح أي بيانات');
  });
});
