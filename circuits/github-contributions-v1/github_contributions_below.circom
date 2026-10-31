pragma circom 2.1.9;

// SIJIL GitHub contribution below-threshold companion circuit.
// Development circuit. GitHub authenticity must be checked by the backend.
//
// Proves: count and threshold are u32, count < threshold, and
// Poseidon(domain("SIJIL-GITHUB-v1"), count, blinding, learnerId, snapshotId)
// equals the public commitment.
//
// A valid Below proof is not a failed AtLeast proof.
//
// Public signals: [threshold, commitment]

include "comparators.circom";
include "poseidon.circom";

template GitHubContributionsBelow() {
    signal input count;
    signal input blinding;
    signal input learnerId;
    signal input snapshotId;
    signal input threshold;
    signal input commitment;

    signal domain;
    domain <== 0x53494a494c2d4749544855422d7631;

    component countBits = Num2Bits(32);
    countBits.in <== count;

    component thresholdBits = Num2Bits(32);
    thresholdBits.in <== threshold;

    component comparison = LessThan(32);
    comparison.in[0] <== count;
    comparison.in[1] <== threshold;
    comparison.out === 1;

    component hasher = Poseidon(5);
    hasher.inputs[0] <== domain;
    hasher.inputs[1] <== count;
    hasher.inputs[2] <== blinding;
    hasher.inputs[3] <== learnerId;
    hasher.inputs[4] <== snapshotId;

    commitment === hasher.out;
}

component main {public [threshold, commitment]} =
    GitHubContributionsBelow();
