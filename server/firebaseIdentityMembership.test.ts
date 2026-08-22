import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const readProjectFile = (fileName: string) => fs.readFileSync(path.join(projectRoot, fileName), 'utf8');

describe('Firebase-only identity and clinic-membership contract', () => {
  const appSource = readProjectFile('client/index.html');
  const rules = readProjectFile('firestore.rules');
  const bootstrapScript = readProjectFile('scripts/sync-firebase-clinic-members.mjs');
  const accountGateway = readProjectFile('server/clinicAccountGateway.ts');

  it('authenticates with the submitted Firebase email/password only', () => {
    expect(appSource).toContain('async signInFirebaseForLocalUser(localUser, options = {})');
    expect(appSource).toContain('const firebaseEmail = String(localUser.firebaseEmail || this.firebaseEmailForUser(localUser.email)).trim().toLowerCase();');
    expect(appSource).toContain('firebaseAuth.signInWithEmailAndPassword(firebaseEmail, firebasePassword)');
    expect(appSource).toContain('const { firebasePassword: suppliedFirebasePassword = \'\' } = options;');
    expect(appSource).toContain('if (!navigator.onLine || !this.cloudSyncEnabled || !firebaseAuth)');
    expect(appSource).toContain('const enteredEmail = this.resolveFirebaseLoginEmail(enteredLogin);');
    expect(appSource).toContain('{ firebasePassword: enteredPassword }');
    expect(appSource).not.toContain('localCredentialsMatch');
    expect(appSource).not.toContain('signInAnonymously');
    expect(appSource).not.toContain('createIfMissing');
    expect(appSource).not.toContain('allowAnonymousFallback');
    expect(appSource).not.toContain('String(admin?.password || this.currentUser?.password || \'\')');
    expect(appSource).not.toContain('localUser?.password');
  });

  it('resolves admin aliases to Firebase email and prefers a stored firebaseEmail', () => {
    const extractMethod = (methodName: string) => {
      const match = appSource.match(new RegExp(`\\n                ${methodName}\\([^\\n]*\\) \\{[\\s\\S]*?\\n                \\},`));
      if (!match) throw new Error(`Unable to extract ${methodName} from client/index.html`);
      return new Function(`return ({ ${match[0]} }).${methodName}`)();
    };
    const firebaseEmailForUser = extractMethod('firebaseEmailForUser');
    const resolveFirebaseLoginEmail = extractMethod('resolveFirebaseLoginEmail');
    const context = {
      users: [{ email: 'admin', firebaseEmail: 'owner@example.com' }],
      firebaseEmailForUser
    };

    expect(firebaseEmailForUser.call(context, 'admin')).toBe('admin@solimedical.local');
    expect(resolveFirebaseLoginEmail.call(context, 'admin')).toBe('owner@example.com');
    expect(resolveFirebaseLoginEmail.call({ users: [], firebaseEmailForUser }, 'admin')).toBe('admin@solimedical.local');
  });

  it('requires active clinic membership after Firebase Auth succeeds', () => {
    expect(appSource).toContain('const membershipActive = await this.refreshFirebaseMembershipStatus(credential.user);');
    expect(appSource).toContain('if (!firebaseLogin.membershipActive)');
    expect(appSource).toContain('async hydrateLocalUserFromFirebaseUser(firebaseUser)');
    expect(appSource).toContain('firebaseAuth.onAuthStateChanged(async user => {');
    expect(appSource).toContain('if (!hydratedUser || hydratedUser.active === false)');
    expect(appSource).toContain('await firebaseAuth.signOut().catch(() => {});');
    expect(appSource).toContain("this.attachFirebaseUidToLocalUser(matchedUser, uid, 'active');");
  });

  it('does not restore local-only sessions or device trust as authentication', () => {
    expect(appSource).toContain("if (!raw || !this.isPermanentFirebaseUser())");
    expect(appSource).toContain("localStorage.setItem(this.sessionKey, JSON.stringify({ userId, firebaseUid:");
    expect(appSource).not.toContain('navigator.onLine || this.isDeviceTrustValid(user)');
    expect(appSource).not.toContain('if (this.cloudSyncEnabled && !trustedForThisUser) this.enrollDevice(matchedUser)');
    expect(appSource).not.toContain("mode: 'online-first-local-afterward'");
  });

  it('removes legacy passwords and recovery secrets while normalizing users', () => {
    expect(appSource).toContain('password: _legacyPassword');
    expect(appSource).toContain('securityAnswerHash: _legacySecurityAnswerHash');
    expect(appSource).toContain('securityQuestion: _legacySecurityQuestion');
    expect(appSource).toContain('mergeCloudUsers(remoteUsers)');
    expect(appSource).not.toContain('mergeCloudUsersWithLocalCredentials');
    expect(appSource).not.toContain("password: '1234'");
    expect(appSource).not.toContain("password: '1111'");
    expect(appSource).not.toContain('x-model="u.password"');
  });

  it('uses Firebase password reset links instead of local security questions', () => {
    expect(appSource).toContain('firebaseAuth.sendPasswordResetEmail(enteredEmail)');
    expect(appSource).toContain('إرسال رابط من Firebase');
    expect(appSource).not.toContain('استعادة محلية');
    expect(appSource).not.toContain('إجابة الأمان غير صحيحة.');
    expect(appSource).not.toContain('admin.password = newPassword');
    expect(appSource).not.toContain('const previousPassword = String(admin.password || \'\');');
  });

  it('uses Firebase reauthentication for reset and idle unlock', () => {
    expect(appSource).toContain('await identity.reauthenticateWithCredential(credential);');
    expect(appSource).toContain('async unlockIdleSession()');
    expect(appSource).toContain('const resetPassword = String(this.cloudResetPasswordInput || \'\');');
    expect(appSource).not.toContain('const expectedPassword = String(admin?.password || this.currentUser?.password || \'\');');
    expect(appSource).not.toContain('String(this.idleUnlockPassword) !== password');
  });

  it('creates team users through the trusted gateway with a transient password', () => {
    expect(appSource).toContain('async callClinicAccountGateway(action, user, options = {})');
    expect(appSource).toContain('password: action === \'upsert\' && options.password ? String(options.password) : undefined');
    expect(appSource).toContain('const firebasePassword = this.newUserForm.password.trim();');
    expect(appSource).toContain('syncUserMembership(newUser.id, { silent: true, firebasePassword })');
    expect(appSource).toContain('async sendFirebasePasswordResetForUser(userId)');
    expect(appSource).toContain('firebaseAuth.sendPasswordResetEmail(email)');
    expect(appSource).not.toContain('localUser?.password');
  });

  it('keeps the trusted gateway responsible for Auth and membership administration', () => {
    expect(accountGateway).toContain('auth.verifyIdToken(idToken, true)');
    expect(accountGateway).toContain('await auth.createUser(');
    expect(accountGateway).toContain('await auth.updateUser(authUser.uid');
    expect(accountGateway).toContain('members');
    expect(accountGateway).toContain('membership.data()?.role !== "owner"');
    expect(accountGateway).not.toContain('collection("patients")');
  });

  it('does not create Firebase Auth users from local passwords in the bootstrap script', () => {
    expect(bootstrapScript).toContain('async function findExistingAuthUser(auth, user)');
    expect(bootstrapScript).toContain('const existingOnly = true;');
    expect(bootstrapScript).toContain("reason: 'firebase_identity_missing'");
    expect(bootstrapScript).not.toContain('user?.password');
    expect(bootstrapScript).not.toContain('auth.createUser');
  });

  it('keeps membership creation outside browser rules', () => {
    expect(appSource).toContain('async refreshFirebaseMembershipStatus(user = firebaseAuth?.currentUser)');
    expect(appSource).toContain('المسار الموثوق فقط (Firebase Admin SDK أو Firebase Console)');
    expect(appSource).not.toContain('provisionMembershipForOtherUser(');
    expect(rules).toContain('match /members/{memberUid}');
    expect(rules).toContain('allow create, update, delete: if false;');
  });
});
