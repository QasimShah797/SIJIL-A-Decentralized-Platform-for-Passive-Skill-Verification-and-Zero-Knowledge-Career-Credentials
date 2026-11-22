import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDisclosuresForSelection,
  buildSelectiveDisclosureManifest,
  createClaimSalt,
  verifyDisclosuresAgainstManifest,
  SD_SCHEME_CRYPTO,
} from "./sd-claim-disclosure";

describe("sd-claim-digest-v1", () => {
  it("accepts disclosures whose digests are in the signed manifest", () => {
    const salt = createClaimSalt();
    const claims = [
      { claimId: "learner_name", value: "eesha", salt },
      { claimId: "competency_name", value: "Typescript", salt: createClaimSalt() },
    ];
    const manifest = buildSelectiveDisclosureManifest(claims);
    assert.equal(manifest.scheme, SD_SCHEME_CRYPTO);
    assert.equal(manifest.sd.length, 2);

    const released = [claims[0]];
    const checked = verifyDisclosuresAgainstManifest(manifest, released);
    assert.equal(checked.ok, true);
    if (checked.ok) {
      assert.equal(checked.releasedDigests.length, 1);
      assert.equal(checked.withheldDigests.length, 1);
    }
  });

  it("rejects a forged disclosure value", () => {
    const salt = createClaimSalt();
    const manifest = buildSelectiveDisclosureManifest([
      { claimId: "learner_name", value: "eesha", salt },
    ]);
    const checked = verifyDisclosuresAgainstManifest(manifest, [
      { claimId: "learner_name", value: "attacker", salt },
    ]);
    assert.equal(checked.ok, false);
  });

  it("rejects a disclosure that uses the wrong salt", () => {
    const salt = createClaimSalt();
    const manifest = buildSelectiveDisclosureManifest([
      { claimId: "issue_date", value: "2026-11-18", salt },
    ]);
    const checked = verifyDisclosuresAgainstManifest(manifest, [
      { claimId: "issue_date", value: "2026-11-18", salt: createClaimSalt() },
    ]);
    assert.equal(checked.ok, false);
  });

  it("keeps withheld digests confidential when only one claim is released", () => {
    const claims = [
      { claimId: "learner_name", value: "eesha", salt: createClaimSalt() },
      { claimId: "competency_name", value: "Typescript", salt: createClaimSalt() },
      { claimId: "issue_date", value: "2026-11-18", salt: createClaimSalt() },
    ];
    const manifest = buildSelectiveDisclosureManifest(claims);
    const checked = verifyDisclosuresAgainstManifest(manifest, [claims[0]]);
    assert.equal(checked.ok, true);
    if (checked.ok) {
      assert.equal(checked.releasedDigests.length, 1);
      assert.equal(checked.withheldDigests.length, 2);
      assert.equal(checked.withheldDigests.includes(checked.releasedDigests[0]), false);
      // Hidden claim values/salts are not part of the verifier output.
      assert.equal(JSON.stringify(checked).includes("Typescript"), false);
      assert.equal(JSON.stringify(checked).includes(claims[1].salt), false);
    }
  });

  it("maps selected share fields to issuer disclosures and leaves others withheld", () => {
    const claims = [
      { claimId: "competency_name", value: "Typescript", salt: createClaimSalt() },
      { claimId: "issue_date", value: "2026-11-18", salt: createClaimSalt() },
      { claimId: "holder_did", value: "did:example:holder", salt: createClaimSalt() },
    ];
    const manifest = buildSelectiveDisclosureManifest(claims);
    const disclosures = buildDisclosuresForSelection({
      selectedFields: ["competency_name", "timestamps"],
      storedClaims: claims,
    });
    assert.equal(disclosures.length, 2);
    assert.equal(disclosures.some((d) => d.claimId === "holder_did"), false);
    const checked = verifyDisclosuresAgainstManifest(manifest, disclosures);
    assert.equal(checked.ok, true);
    if (checked.ok) {
      assert.equal(checked.withheldDigests.length, 1);
    }
  });
});
