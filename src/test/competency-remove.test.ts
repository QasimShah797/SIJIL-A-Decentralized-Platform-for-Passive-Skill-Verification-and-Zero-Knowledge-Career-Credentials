import { describe, expect, it } from "vitest";
import { blockingForeignTable } from "@/lib/db/competency-cleanup";

describe("declared competency removal", () => {
  it("reads the blocking table from a foreign-key error", () => {
    expect(blockingForeignTable({
      code: "23503",
      message: 'update or delete on table "declared_skills" violates foreign key constraint "wallet_competency_records_competency_id_fkey" on table "wallet_competency_records"',
      details: 'Key (id)=(abc) is still referenced from table "wallet_competency_records".',
    })).toBe("wallet_competency_records");
  });

  it("ignores the parent table when only declared_skills is named", () => {
    expect(blockingForeignTable({
      message: 'update or delete on table "declared_skills" violates foreign key constraint "some_fkey"',
    })).toBeNull();
  });
});
