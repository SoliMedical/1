import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const indexHtml = readFileSync(resolve(projectRoot, 'client/index.html'), 'utf8');

describe('ترحيل Firebase V2 غير المدمر', () => {
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

  it('يمنع تشغيل الترحيل دون اتصال ويبقي قراءة المخطط القديم قائمة بعد النسخ', () => {
    expect(indexHtml).toContain('!navigator.onLine || !(await this.waitForCloudAuthReady())');
    expect(indexHtml).toContain('يستمر التطبيق بالقراءة من المخطط القديم');
    expect(indexHtml).toContain('لم تُحذف البيانات القديمة');
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
