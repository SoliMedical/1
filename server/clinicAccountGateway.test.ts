import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "server/clinicAccountGateway.ts"), "utf8");

describe("clinic account self-service gateway", () => {
  it("verifies a current Firebase identity and an active owner membership before every mutation", () => {
    expect(source).toContain("auth.verifyIdToken(idToken, true)");
    expect(source).toContain("membership.data()?.status !== \"active\"");
    expect(source).toContain("membership.data()?.role !== \"owner\"");
  });

  it("creates and maintains memberships through the Admin SDK rather than browser Firestore writes", () => {
    expect(source).toContain("from \"firebase-admin/auth\"");
    expect(source).toContain("from \"firebase-admin/firestore\"");
    expect(source).toContain('collection("members").doc(authUser.uid)');
    expect(source).toContain('status: member.active ? "active" : "suspended"');
    expect(source).toContain("member.firebaseUid !== authUser.uid");
    expect(source).toContain("اسم الدخول مرتبط بالفعل بحساب آخر");
  });

  it("prevents removal or replacement of the clinic owner and never targets patient collections", () => {
    expect(source).toContain('existing?.role === "owner"');
    expect(source).toContain('if (authUser.uid === ownerUid)');
    expect(source).toContain("await auth.deleteUser(authUser.uid)");
    expect(source).not.toContain('collection("patients")');
    expect(source).not.toContain('collection("visits")');
  });

  it("limits cross-origin access to the published application origins", () => {
    expect(source).toContain('"https://solimedical.github.io"');
    expect(source).toContain('"https://medicenter-h9mjj4tn.manus.space"');
    expect(source).toContain("Access-Control-Allow-Origin");
  });
});
