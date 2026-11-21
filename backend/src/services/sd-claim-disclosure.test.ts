import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
});
