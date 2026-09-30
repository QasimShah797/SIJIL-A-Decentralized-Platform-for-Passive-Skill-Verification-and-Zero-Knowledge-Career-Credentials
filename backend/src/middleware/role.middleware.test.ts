import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { REVIEWER_ROLES } from "./role.middleware";
import { ROLES } from "../constants/roles";

describe("reviewer role guard", () => {
  it("allows reviewer, legacy institution, and admin", () => {
    assert.deepEqual(REVIEWER_ROLES, [ROLES.REVIEWER, ROLES.INSTITUTION, ROLES.ADMIN]);
  });
});
