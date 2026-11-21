pragma circom 2.1.9;

// SIJIL peer-review-count-v1
//
// Proves: eligible review count >= threshold without revealing the count
// or reviewer identities.
//
// Commitment:
//   Poseidon(domain("SIJIL-PEER-v1"), count, blinding, learnerId, evidenceId)
//
// Public signals: [threshold, commitment]
// Development circuit. Eligibility is enforced by the backend.

include "comparators.circom";
include "poseidon.circom";

template PeerReviewCountAtLeast() {
    signal input count;
    signal input blinding;
    signal input learnerId;
    signal input evidenceId;
    signal input threshold;
    signal input commitment;

    signal domain;
    domain <== 0x53494a494c2d504545522d7631;

    component countBits = Num2Bits(32);
    countBits.in <== count;
    component thresholdBits = Num2Bits(32);
    thresholdBits.in <== threshold;

    component comparison = GreaterEqThan(32);
    comparison.in[0] <== count;
    comparison.in[1] <== threshold;
    comparison.out === 1;

    component hasher = Poseidon(5);
    hasher.inputs[0] <== domain;
    hasher.inputs[1] <== count;
    hasher.inputs[2] <== blinding;
    hasher.inputs[3] <== learnerId;
    hasher.inputs[4] <== evidenceId;
    commitment === hasher.out;
}

component main {public [threshold, commitment]} = PeerReviewCountAtLeast();
