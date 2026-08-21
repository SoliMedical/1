import { describe, expect, it } from 'vitest';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'node:fs';

describe('اعتماد Firebase الإداري للترحيل', () => {
  const credentialValidation = process.env.RUN_FIREBASE_ADMIN_CREDENTIAL_TEST === 'true' ? it : it.skip;

  credentialValidation('يتحقق من الوصول بمطالعة صفحة مستخدمين واحدة فقط دون إنشاء أو تعديل أي هوية', async () => {
    const credentialFile = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
    const raw = credentialFile ? readFileSync(credentialFile, 'utf8') : (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '');
    expect(raw, 'يلزم اعتماد Firebase الإداري لتشغيل ترحيل V2').toBeTruthy();
    const serviceAccount = JSON.parse(raw!);
    const app = getApps().find(candidate => candidate.name === 'migration-credential-check')
      || initializeApp({
        credential: cert(serviceAccount),
        projectId: 'clinic1-ba255'
      }, 'migration-credential-check');
    const page = await getAuth(app).listUsers(1);
    expect(Array.isArray(page.users)).toBe(true);
  }, 20_000);
});
