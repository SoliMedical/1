import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'clinic1-ba255';
const clinicId = process.env.FIREBASE_CLINIC_ID || 'shared-clinic-v1';
const ownerLocalId = '1';

function initializeAdmin() {
  if (getApps().length) return getApps()[0];
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON غير متاح.');
  const serviceAccount = JSON.parse(rawServiceAccount);
  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  try {
    return initializeApp({ credential: cert(serviceAccount), projectId });
  } catch (error) {
    const key = String(serviceAccount.private_key || '');
    const diagnostics = {
      hasProjectId: Boolean(serviceAccount.project_id),
      hasClientEmail: Boolean(serviceAccount.client_email),
      keyHasPemHeader: key.includes('BEGIN PRIVATE KEY'),
      keyHasPemFooter: key.includes('END PRIVATE KEY'),
      keyHasLineBreaks: key.includes('\n'),
      keyLength: key.length,
    };
    throw new Error(`تعذر قراءة اعتماد Firebase (${JSON.stringify(diagnostics)}).`);
  }
}

async function main() {
  initializeAdmin();
  const db = getFirestore();
  const auth = getAuth();
  const legacy = await db.doc('soliMedicalApp/sharedClinicData').get();
  const users = Array.isArray(legacy.data()?.users) ? legacy.data().users : [];
  const owner = users.find(user => String(user?.id ?? '') === ownerLocalId);
  if (!owner?.firebaseUid) throw new Error('لم تُعثر هوية Firebase مرتبطة بحساب المدير في البيانات المحفوظة.');

  const authUser = await auth.getUser(owner.firebaseUid);
  const member = await db.collection('clinics').doc(clinicId).collection('members').doc(owner.firebaseUid).get();
  const v3Collections = ['patients', 'visits', 'appointments', 'invoices', 'prescriptions', 'expenses', 'waitingQueue', 'auditLogs', 'archiveManifests', 'settings', 'catalogs'];
  const v3Counts = Object.fromEntries(await Promise.all(v3Collections.map(async name => {
    const snapshot = await db.collection(name).where('clinicId', '==', clinicId).count().get();
    return [name, snapshot.data().count];
  })));

  console.log(JSON.stringify({
    projectId,
    clinicId,
    ownerIdentity: {
      uidMatchesStoredReference: authUser.uid === owner.firebaseUid,
      accountDisabled: Boolean(authUser.disabled),
      emailVerified: Boolean(authUser.emailVerified),
      providerIds: (authUser.providerData || []).map(provider => provider.providerId),
    },
    ownerMembership: {
      exists: member.exists,
      active: member.data()?.status === 'active',
      role: member.data()?.role || null,
      localUserIdMatches: String(member.data()?.localUserId || '') === ownerLocalId,
    },
    v3Counts,
  }, null, 2));
}

main().catch(error => {
  console.error(`فشل فحص الجاهزية للقراءة فقط: ${error.message}`);
  process.exitCode = 1;
});
