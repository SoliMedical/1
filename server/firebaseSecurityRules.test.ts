import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const readProjectFile = (fileName: string) => fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

describe('Firebase clinic-membership security rules', () => {
  const firestoreRules = readProjectFile('firestore.rules');
  const storageRules = readProjectFile('storage.rules');
  const firebaseConfig = readProjectFile('firebase.json');

  it('requires an authenticated active membership before accessing the legacy or V2 clinic data', () => {
    expect(firestoreRules).toContain('function isMember(clinicId)');
    expect(firestoreRules).toContain("membership(clinicId).data.status == 'active'");
    expect(firestoreRules).toContain("isMember('shared-clinic-v1')");
    expect(firestoreRules).toContain('match /clinics/{clinicId}');
  });

  it('preserves medical records and audit entries from client-side deletion', () => {
    ['patients', 'visits', 'prescriptions', 'appointments', 'invoices', 'expenses', 'auditLogs', 'archiveManifests'].forEach(collection => {
      expect(firestoreRules).toContain(`match /${collection}/{`);
    });
    expect(firestoreRules).toContain('Audit contents are immutable');
    expect(firestoreRules).toContain("allow delete: if false;");
  });

  it('keeps membership assignment outside browser privileges and limits clinic management to owner or admin', () => {
    expect(firestoreRules).toContain('match /members/{memberUid}');
    expect(firestoreRules).toContain("['owner', 'admin']");
    expect(firestoreRules).toContain('allow create, update, delete: if false;');
    expect(firestoreRules).toContain('match /migrationManifests/{migrationId}');
  });

  it('limits Storage to authenticated clinic members and bounded clinic-logo uploads', () => {
    expect(storageRules).toContain('firestore.get(/databases/(default)/documents/clinics/$(clinicId)/members/$(request.auth.uid))');
    expect(storageRules).toContain("request.resource.size < 2 * 1024 * 1024");
    expect(storageRules).toContain("request.resource.contentType.matches('image/(webp|png|jpeg)')");
    expect(storageRules).toContain('match /clinics/{clinicId}/branding/{fileName}');
    expect(storageRules).toContain('allow delete: if false;');
  });

  it('binds Firebase deployment configuration to both security-rule files', () => {
    expect(firebaseConfig).toContain('"rules": "firestore.rules"');
    expect(firebaseConfig).toContain('"rules": "storage.rules"');
  });
});
