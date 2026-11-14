import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { productionOriginProblems } from "./production-origins";

describe("production web origins", () => {
  it("accepts https origins and rejects localhost, wildcards, and empty lists", () => {
    assert.deepEqual(productionOriginProblems("https://app.example.com", "https://app.example.com"), []);
    const problems = productionOriginProblems("http://localhost:8080,*", "http://localhost:8080");
    assert.equal(problems.length >= 2, true);
    assert.equal(productionOriginProblems("", "https://app.example.com").includes("CORS_ORIGIN is empty"), true);
  });
});
