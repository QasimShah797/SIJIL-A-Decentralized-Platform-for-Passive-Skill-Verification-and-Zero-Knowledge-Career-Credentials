import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canClientGrantRole, isSingleRoleAssignment, ROLES } from "./roles";

describe("user_roles client grants", () => {
  it("does not allow a learner to grant themselves reviewer or admin", () => {
    assert.equal(canClientGrantRole(ROLES.LEARNER), true);
    assert.equal(canClientGrantRole(ROLES.RECRUITER), true);
    assert.equal(canClientGrantRole(ROLES.REVIEWER), false);
    assert.equal(canClientGrantRole(ROLES.ADMIN), false);
    assert.equal(canClientGrantRole(ROLES.INSTITUTION), false);
  });

  it("does not allow a user to hold learner and recruiter together", () => {
    assert.equal(isSingleRoleAssignment([ROLES.LEARNER, ROLES.RECRUITER]), false);
    assert.equal(isSingleRoleAssignment([ROLES.LEARNER]), true);
    assert.equal(isSingleRoleAssignment([ROLES.RECRUITER, ROLES.RECRUITER]), true);
  });
});
