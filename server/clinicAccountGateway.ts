import type { Express, Request, Response } from "express";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";

const clinicId = process.env.FIREBASE_CLINIC_ID || "shared-clinic-v1";
const projectId = process.env.FIREBASE_PROJECT_ID || "clinic1-ba255";
const gatewayPath = "/api/clinic-members";
const allowedOrigins = new Set([
  "https://solimedical.github.io",
  "https://medicenter-h9mjj4tn.manus.space",
  "http://localhost:3000",
]);

class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const memberInputSchema = z.object({
  localUserId: z.string().trim().min(1).max(80),
  fullName: z.string().trim().min(1).max(140),
  email: z.string().trim().min(1).max(180),
  firebaseEmail: z.string().trim().email().max(180).optional(),
  password: z.string().min(6).max(128).optional(),
  role: z.string().trim().min(1).max(100),
  active: z.boolean(),
  firebaseUid: z.string().trim().min(1).max(160).optional(),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upsert"), member: memberInputSchema }),
  z.object({ action: z.literal("delete"), member: memberInputSchema.pick({ localUserId: true, email: true, firebaseEmail: true, firebaseUid: true }) }),
]);

type MemberInput = z.infer<typeof memberInputSchema>;

function firebaseEmailForUser(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("@")) return normalized;
  const safeLocalPart = Array.from(normalized)
    .map(character => /[a-z0-9._+-]/.test(character) ? character : `u${character.codePointAt(0)?.toString(16)}`)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "user";
  return `${safeLocalPart}@solimedical.local`;
}

function membershipRoleForUser(role: string) {
  if (role === "admin") return "admin";
  const normalized = String(role || "").toLowerCase();
  return normalized.includes("طبيب") || normalized.includes("clinician") || normalized.includes("doctor")
    ? "clinician"
    : "assistant";
}

function initializeFirebaseAdmin() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new GatewayError(503, "خدمة إدارة الحسابات غير مهيأة بعد.");
  let serviceAccount: { project_id?: string; private_key?: string; client_email?: string; projectId?: string; privateKey?: string; clientEmail?: string };
  try {
    serviceAccount = JSON.parse(raw) as typeof serviceAccount;
  } catch {
    throw new GatewayError(503, "تعذر قراءة إعدادات خدمة إدارة الحسابات.");
  }
  const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
  const privateKey = serviceAccount.private_key || serviceAccount.privateKey;
  const credentialProjectId = serviceAccount.project_id || serviceAccount.projectId || projectId;
  if (!clientEmail || !privateKey) {
    throw new GatewayError(503, "إعدادات خدمة إدارة الحسابات غير مكتملة.");
  }
  const normalizedServiceAccount: ServiceAccount = {
    projectId: credentialProjectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
  return initializeApp({ credential: cert(normalizedServiceAccount), projectId: credentialProjectId });
}

function applyCors(req: Request, res: Response) {
  const origin = req.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

async function requireActiveOwner(req: Request) {
  const authorization = req.get("authorization") || "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!idToken) throw new GatewayError(401, "يلزم تسجيل دخول المدير بهوية Firebase دائمة.");

  initializeFirebaseAdmin();
  const auth = getAuth();
  const db = getFirestore();
  const decoded = await auth.verifyIdToken(idToken, true).catch(() => {
    throw new GatewayError(401, "انتهت جلسة المدير أو تعذر التحقق منها. أعد تسجيل الدخول.");
  });
  const membership = await db.collection("clinics").doc(clinicId).collection("members").doc(decoded.uid).get();
  if (!membership.exists || membership.data()?.status !== "active" || membership.data()?.role !== "owner") {
    throw new GatewayError(403, "هذه العملية متاحة لمالك العيادة النشط فقط.");
  }
  return { auth, db, ownerUid: decoded.uid };
}

async function upsertClinicMember(member: MemberInput, ownerUid: string) {
  const auth = getAuth();
  const db = getFirestore();
  const firebaseEmail = String(member.firebaseEmail || firebaseEmailForUser(member.email)).trim().toLowerCase();
  let authUser;
  let createdAuthUser = false;
  try {
    authUser = await auth.getUserByEmail(firebaseEmail);
  } catch (error: any) {
    if (error?.code !== "auth/user-not-found") throw error;
    if (!member.password) throw new GatewayError(400, "كلمة المرور مطلوبة لإنشاء حساب جديد.");
    authUser = await auth.createUser({ email: firebaseEmail, password: member.password, displayName: member.fullName, disabled: !member.active });
    createdAuthUser = true;
  }

  if (!createdAuthUser && (!member.firebaseUid || member.firebaseUid !== authUser.uid)) {
    throw new GatewayError(409, "اسم الدخول مرتبط بالفعل بحساب آخر؛ استخدم اسماً مختلفاً ولا يُعاد ربطه تلقائياً.");
  }

  const memberRef = db.collection("clinics").doc(clinicId).collection("members").doc(authUser.uid);
  try {
    await db.runTransaction(async transaction => {
      const previous = await transaction.get(memberRef);
      const existing = previous.exists ? previous.data() : undefined;
      if (existing?.role === "owner" && authUser.uid !== ownerUid) {
        throw new GatewayError(403, "لا يمكن تعديل أو استبدال عضوية مالك العيادة.");
      }
      if (existing?.localUserId && String(existing.localUserId) !== member.localUserId) {
        throw new GatewayError(409, "اسم الدخول مرتبط مسبقاً بحساب محلي مختلف.");
      }
      transaction.set(memberRef, {
        status: member.active ? "active" : "suspended",
        role: membershipRoleForUser(member.role),
        firebaseEmail,
        localUserId: member.localUserId,
        createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
        createdBy: existing?.createdBy || ownerUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: ownerUid,
      }, { merge: true });
    });
    if (!createdAuthUser) {
      await auth.updateUser(authUser.uid, { displayName: member.fullName, disabled: !member.active });
    }
  } catch (error) {
    if (createdAuthUser) await auth.deleteUser(authUser.uid).catch(() => undefined);
    throw error;
  }
  return { uid: authUser.uid, firebaseEmail, status: member.active ? "active" : "suspended" };
}

async function deleteClinicMember(member: Pick<MemberInput, "localUserId" | "email" | "firebaseEmail" | "firebaseUid">, ownerUid: string) {
  const auth = getAuth();
  const db = getFirestore();
  const authUser = member.firebaseUid
    ? await auth.getUser(member.firebaseUid)
    : await auth.getUserByEmail(String(member.firebaseEmail || firebaseEmailForUser(member.email)).trim().toLowerCase());
  if (authUser.uid === ownerUid) throw new GatewayError(403, "لا يمكن حذف حساب مالك العيادة.");

  const memberRef = db.collection("clinics").doc(clinicId).collection("members").doc(authUser.uid);
  const membership = await memberRef.get();
  if (membership.data()?.role === "owner") throw new GatewayError(403, "لا يمكن حذف عضوية مالك العيادة.");
  if (membership.exists && String(membership.data()?.localUserId || "") !== member.localUserId) {
    throw new GatewayError(409, "لا تتطابق بيانات الحساب المطلوب حذفه.");
  }
  await auth.deleteUser(authUser.uid);
  await memberRef.delete();
  return { uid: authUser.uid };
}

export function registerClinicAccountGateway(app: Express) {
  app.options(gatewayPath, (req, res) => {
    applyCors(req, res);
    res.sendStatus(204);
  });
  app.post(gatewayPath, async (req, res) => {
    applyCors(req, res);
    try {
      const request = requestSchema.parse(req.body);
      const { ownerUid } = await requireActiveOwner(req);
      if (request.action === "upsert") {
        const result = await upsertClinicMember(request.member, ownerUid);
        res.status(200).json({ ok: true, result });
        return;
      }
      const result = await deleteClinicMember(request.member, ownerUid);
      res.status(200).json({ ok: true, result });
    } catch (error: any) {
      const status = error instanceof GatewayError ? error.status : 500;
      const message = error instanceof GatewayError ? error.message : "تعذر تنفيذ إدارة الحساب بأمان. لم تُحذف بيانات المرضى.";
      if (status >= 500) console.error("Clinic account gateway failed:", error);
      res.status(status).json({ ok: false, message });
    }
  });
}
