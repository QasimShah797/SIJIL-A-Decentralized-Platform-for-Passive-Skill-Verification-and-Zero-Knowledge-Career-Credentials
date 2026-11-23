import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@supabase/supabase-js";
import { isSupabaseEmailConfirmed } from "./email-confirmed";

function user(partial: Partial<User>): User {
  return {
    id: "u1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    ...partial,
  } as User;
}

describe("isSupabaseEmailConfirmed", () => {
  it("allows confirmed email users", () => {
    assert.equal(
      isSupabaseEmailConfirmed(user({ email_confirmed_at: "2026-01-01T00:00:00Z" })),
      true,
    );
  });

  it("allows OAuth users without relying on a client boolean", () => {
    assert.equal(
      isSupabaseEmailConfirmed(
        user({
          identities: [{
            provider: "github",
            id: "gh1",
            user_id: "u1",
            identity_id: "i1",
            identity_data: {},
            created_at: "",
            last_sign_in_at: "",
            updated_at: "",
          }],
        }),
      ),
      true,
    );
  });

  it("denies unverified email/password users for learner API access", () => {
    assert.equal(
      isSupabaseEmailConfirmed(
        user({
          email_confirmed_at: undefined,
          identities: [{
            provider: "email",
            id: "e1",
            user_id: "u1",
            identity_id: "i1",
            identity_data: {},
            created_at: "",
            last_sign_in_at: "",
            updated_at: "",
          }],
        }),
      ),
      false,
    );
  });
});
