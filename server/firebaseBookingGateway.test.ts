import { describe, expect, it } from "vitest";
import { getFirebaseFirestoreAccessToken, getFirebaseProjectId } from "./firebaseBookingGateway";

describe("Firebase booking gateway credentials", () => {
  it("authorizes the configured service account through Google's OAuth token endpoint", async () => {
    const token = await getFirebaseFirestoreAccessToken();

    expect(getFirebaseProjectId()).toBeTruthy();
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(20);
  }, 20_000);
});
