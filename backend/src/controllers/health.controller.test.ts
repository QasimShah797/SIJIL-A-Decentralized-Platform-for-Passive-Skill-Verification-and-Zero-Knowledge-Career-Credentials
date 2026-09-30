import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { publicHealthPayload } from "./health.payload";

describe("public health", () => {
  it("returns only status", () => {
    assert.deepEqual(publicHealthPayload(), { status: "ok" });
    assert.deepEqual(Object.keys(publicHealthPayload()), ["status"]);
  });
});
