import { importPKCS8, SignJWT } from "jose";

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type FirebaseAccessToken = {
  token: string;
  expiresAt: number;
};

let cachedAccessToken: FirebaseAccessToken | null = null;

function readFirebaseServiceAccount(): FirebaseServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");

  let account: Partial<FirebaseServiceAccount>;
  try {
    account = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON");
  }

  if (!account.client_email || !account.private_key || !account.project_id) {
    throw new Error("Firebase service account is missing client_email, private_key, or project_id");
  }

  return account as FirebaseServiceAccount;
}

export async function getFirebaseFirestoreAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const account = readFirebaseServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Firebase service account authorization failed (${tokenResponse.status})`);
  }

  const payload = (await tokenResponse.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("Firebase authorization did not return an access token");

  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 300) - 60) * 1000,
  };

  return cachedAccessToken.token;
}

export function getFirebaseProjectId(): string {
  return readFirebaseServiceAccount().project_id;
}
