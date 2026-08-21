import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');

describe('قواعد Firestore للمجموعات العليا', () => {
  it('تحمي كل المجموعات التشغيلية العليا بحد عضوية clinicId', () => {
    ['patients', 'visits', 'prescriptions', 'appointments', 'invoices', 'expenses', 'waitingQueue', 'settings', 'catalogs', 'auditLogs', 'archiveManifests']
      .forEach(collection => expect(rules).toContain(`match /${collection}/{recordId}`));
    expect(rules).toContain('resource.data.clinicId is string && isMember(resource.data.clinicId)');
    expect(rules).not.toContain('match /{collection}/{documentId}');
  });

  it('يرفض حذف السجلات من المتصفح ويمنع نقل السجل بين العيادات', () => {
    expect(rules).toContain('return resource.data.clinicId == request.resource.data.clinicId;');
    expect((rules.match(/allow delete: if false;/g) || []).length).toBeGreaterThanOrEqual(12);
  });

  it('يبقي منح عضوية العيادة محصوراً في الإدارة ولا يمنح تطبيق المتصفح صلاحية ذاتية', () => {
    expect(rules).toContain('match /members/{memberUid}');
    expect(rules).toContain('allow create, update, delete: if false;');
  });
});
