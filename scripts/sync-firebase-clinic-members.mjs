import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'clinic1-ba255';
const clinicId = process.env.FIREBASE_CLINIC_ID || 'shared-clinic-v1';
const cloudDocPath = process.env.FIREBASE_LEGACY_DOC_PATH || 'soliMedicalApp/sharedClinicData';

function firebaseEmailForUser(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('@')) return normalized;
  const safeLocalPart = Array.from(normalized)
    .map(character => /[a-z0-9._+-]/.test(character) ? character : `u${character.codePointAt(0).toString(16)}`)
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'user';
  return `${safeLocalPart}@solimedical.local`;
}

function membershipRoleForUser(user) {
  if (String(user?.id) === '1') return 'owner';
  if (user?.role === 'admin') return 'admin';
  const role = String(user?.role || '').toLowerCase();
  return role.includes('طبيب') || role.includes('clinician') || role.includes('doctor') ? 'clinician' : 'assistant';
}

function initializeAdmin() {
  if (getApps().length) return getApps()[0];
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawServiceAccount) {
    return initializeApp({ credential: cert(JSON.parse(rawServiceAccount)), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId });
}

async function findOrCreateAuthUser(auth, user) {
  const email = firebaseEmailForUser(user.email);
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    const password = String(user?.password || '');
    if (password.length < 6) {
      throw new Error(`لا يمكن إنشاء هوية ${email}: كلمة المرور المحلية أقل من 6 أحرف. حدّث كلمة المرور من التطبيق ثم أعد تشغيل الأداة.`);
    }
    return auth.createUser({ email, password, displayName: String(user.fullName || '').trim() || undefined });
  }
}

async function main() {
  initializeAdmin();
  const auth = getAuth();
  const db = getFirestore();
  const legacySnapshot = await db.doc(cloudDocPath).get();
  if (!legacySnapshot.exists) throw new Error(`لم توجد وثيقة البيانات القديمة: ${cloudDocPath}`);
  const users = Array.isArray(legacySnapshot.data()?.users) ? legacySnapshot.data().users : [];
  const activeUsers = users.filter(user => user?.email && user?.active !== false);
  if (!activeUsers.length) throw new Error('لم توجد حسابات محلية نشطة يمكن ربطها بـ Firebase Authentication.');

  const summary = [];
  for (const user of activeUsers) {
    const authUser = await findOrCreateAuthUser(auth, user);
    const role = membershipRoleForUser(user);
    const memberRef = db.collection('clinics').doc(clinicId).collection('members').doc(authUser.uid);
    await db.runTransaction(async transaction => {
      const previous = await transaction.get(memberRef);
      const existing = previous.exists ? previous.data() : {};
      transaction.set(memberRef, {
        status: existing?.status || 'active',
        role: existing?.role || role,
        firebaseEmail: authUser.email || firebaseEmailForUser(user.email),
        localUserId: String(user.id ?? ''),
        createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
        createdBy: existing?.createdBy || 'scripts/sync-firebase-clinic-members.mjs',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
    summary.push({ localUserId: String(user.id ?? ''), role, uid: authUser.uid });
  }

  console.log(JSON.stringify({ projectId, clinicId, processed: summary.length, memberships: summary }, null, 2));
}

main().catch(error => {
  console.error(`فشلت مزامنة هويات Firebase وعضويات العيادة: ${error.message}`);
  process.exitCode = 1;
});
