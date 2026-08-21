import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const readProjectFile = (fileName: string) => fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

describe('Firebase permanent identity and clinic-membership bridge', () => {
  const appSource = readProjectFile('client/index.html');
  const rules = readProjectFile('firestore.rules');
  const bootstrapScript = readProjectFile('scripts/sync-firebase-clinic-members.mjs');

  it('prefers email/password Firebase identities while retaining an explicit anonymous offline fallback', () => {
    expect(appSource).toContain('async signInFirebaseForLocalUser(localUser, options = {})');
    expect(appSource).toContain('firebaseAuth.signInWithEmailAndPassword(firebaseEmail, firebasePassword)');
    expect(appSource).toContain('firebaseAuth.createUserWithEmailAndPassword(firebaseEmail, firebasePassword)');
    expect(appSource).toContain('firebaseAuth.signInAnonymously()');
    expect(appSource).toContain("this.firebaseIdentityStatus = 'احتياطي مؤقت'");
  });

  it('keeps the durable Firebase-identity bridge internal to preserve the local sign-in interface', () => {
    expect(appSource).toContain('async provisionPersistentFirebaseIdentityForCurrentUser()');
    expect(appSource).toContain('firebaseAuth.currentUser?.isAnonymous');
    expect(appSource).toContain('allowAnonymousFallback: false');
    expect(appSource).toContain("signInCode.includes('invalid-credential')");
    expect(appSource).not.toContain('x-show="!isPermanentFirebaseUser()"');
    expect(appSource).toContain('isPermanentFirebaseUser(user = firebaseAuth?.currentUser)');
  });

  it('identifies the local four-character administrator password as a Firebase setup prerequisite without disabling local or anonymous operation', () => {
    expect(appSource).toContain("const passwordError = { code: 'local-password-too-short' }");
    expect(appSource).toContain("this.firebaseIdentityIssueCode = passwordError.code");
    expect(appSource).toContain('كلمة مرور المدير المحلية الحالية أقصر من 6 أحرف');
    expect(appSource).toContain('return { ok: false, persistent: false, fallback: true, error: passwordError }');
    expect(appSource).toContain('newPassword && newPassword.length < 6');
    expect(appSource).not.toContain('الإجراء المطلوب: احفظ كلمة مرور جديدة من 6 أحرف أو أرقام على الأقل');
  });

  it('keeps Firebase setup helpers out of the doctor settings interface', () => {
    expect(appSource).toContain('focusAdminPasswordUpdateForFirebase()');
    expect(appSource).toContain("document.getElementById('admin-security-new-password')");
    expect(appSource).not.toContain('الانتقال الآمن لتحديث كلمة المرور');
    expect(appSource).not.toContain('id="admin-security-recovery"');
  });

  it('keeps Firebase passwords and recovery answers out of Firestore snapshots', () => {
    expect(appSource).toContain('getCloudSafeUsers(users = this.users)');
    expect(appSource).toContain('const { password, securityAnswerHash, securityQuestion, ...cloudUser } = user;');
    expect(appSource).toContain('getCloudSyncSnapshot()');
    expect(appSource).toContain("snapshot[key] = key === 'users' ? this.getCloudSafeUsers(this.users) : this[key];");
    expect(appSource).toContain('mergeCloudUsersWithLocalCredentials(remoteUsers)');
  });

  it('provisions new employee identities through a secondary app without replacing the administrator session', () => {
    expect(appSource).toContain('async createFirebaseIdentityForNewUser(localUser)');
    expect(appSource).toContain('firebase.initializeApp(firebaseConfig, secondaryName)');
    expect(appSource).toContain('secondaryApp.auth()');
    expect(appSource).toContain('await secondaryApp.delete()');
  });

  it('shows membership state but cannot grant it from a browser after live rules are deployed', () => {
    expect(appSource).toContain('async refreshFirebaseMembershipStatus(user = firebaseAuth?.currentUser)');
    expect(appSource).toContain('async ensureClinicMembership()');
    expect(appSource).toContain('منعت قواعد Firebase إنشاء العضوية من المتصفح');
    expect(rules).toContain('match /members/{memberUid}');
    expect(rules).toContain('allow create, update, delete: if false;');
  });

  it('does not treat an anonymous Firebase session as cloud-sync ready after membership rules are live', () => {
    expect(appSource).toContain('cloudMembershipReady: false');
    expect(appSource).toContain('this.cloudAuthReady = permanentIdentity;');
    expect(appSource).toContain('if (!permanentIdentity) {');
    expect(appSource).toContain('this.cloudMembershipReady = Boolean(isActiveMember);');
    expect(appSource).toContain('!this.cloudMembershipReady');
    expect(appSource).toContain('allowAnonymousFallback: false');
  });

  it('creates or restores memberships only through the trusted Admin SDK script', () => {
    expect(bootstrapScript).toContain("from 'firebase-admin/app'");
    expect(bootstrapScript).toContain('getAuth()');
    expect(bootstrapScript).toContain("db.collection('clinics').doc(clinicId).collection('members').doc(authUser.uid)");
    expect(bootstrapScript).toContain("status: existing?.status || 'active'");
    expect(bootstrapScript).toContain("createdBy: existing?.createdBy || 'scripts/sync-firebase-clinic-members.mjs'");
  });
});
