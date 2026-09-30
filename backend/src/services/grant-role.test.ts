import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../constants/roles";
import { upsertGrantedRole, type RoleTableClient } from "./grant-role";

type RoleRow = { user_id: string; role: string };

function memoryClient(rows: RoleRow[]): RoleTableClient & { ops: string[] } {
  const ops: string[] = [];
  return {
    ops,
    from(table: string) {
      assert.equal(table, "user_roles");
      return {
        upsert: async (row: RoleRow, options: { onConflict: string }) => {
          ops.push(`upsert:${options.onConflict}`);
          assert.equal(options.onConflict, "user_id");
          const idx = rows.findIndex((existing) => existing.user_id === row.user_id);
          if (idx >= 0) rows[idx] = { user_id: row.user_id, role: row.role };
          else rows.push({ user_id: row.user_id, role: row.role });
          return { error: null };
        },
        delete: () => {
          ops.push("delete");
          return {
            eq: async () => ({ error: null }),
          };
        },
        insert: async () => {
          ops.push("insert");
          return { error: null };
        },
      };
    },
  };
}

describe("grant-role upsert", () => {
  it("replaces an existing learner with reviewer in a single upsert on user_id", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const rows: RoleRow[] = [{ user_id: userId, role: ROLES.LEARNER }];
    const client = memoryClient(rows);
    await upsertGrantedRole(client, userId, ROLES.REVIEWER);
    assert.deepEqual(rows, [{ user_id: userId, role: ROLES.REVIEWER }]);
    assert.deepEqual(client.ops, ["upsert:user_id"]);
  });

  it("is idempotent when re-run for the same reviewer", async () => {
    const userId = "22222222-2222-2222-2222-222222222222";
    const rows: RoleRow[] = [{ user_id: userId, role: ROLES.LEARNER }];
    const client = memoryClient(rows);
    await upsertGrantedRole(client, userId, ROLES.REVIEWER);
    await upsertGrantedRole(client, userId, ROLES.REVIEWER);
    assert.deepEqual(rows, [{ user_id: userId, role: ROLES.REVIEWER }]);
    assert.deepEqual(client.ops, ["upsert:user_id", "upsert:user_id"]);
  });
});
