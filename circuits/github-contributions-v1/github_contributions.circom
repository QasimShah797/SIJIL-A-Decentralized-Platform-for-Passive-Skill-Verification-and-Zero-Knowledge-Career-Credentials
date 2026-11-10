pragma circom 2.1.9;

// SIJIL GitHub contribution threshold proof v1.
// Development circuit. GitHub authenticity must be checked by the backend.
//
// Public signals: [threshold, commitment]
// Private signals: count, blinding, learnerId, snapshotId
//
// Commitment:
// Poseidon(domain("SIJIL-GITHUB-v1"), count, blinding, learnerId, snapshotId)

include "comparators.circom";
include "poseidon.circom";

template GitHubContributionsAtLeast() {
    signal input count;
    signal input blinding;
    signal input learnerId;
    signal input snapshotId;

    signal input threshold;
    signal input commitment;

    // Domain separator: big-endian UTF-8 integer of "SIJIL-GITHUB-v1".
    signal domain;
    domain <== 0x53494a494c2d4749544855422d7631;

    // Restrict both numbers to unsigned 32-bit integers.
    component countBits = Num2Bits(32);
    countBits.in <== count;

    component thresholdBits = Num2Bits(32);
    thresholdBits.in <== threshold;

    // Prove count >= threshold.
    component comparison = GreaterEqThan(32);
    comparison.in[0] <== count;
    comparison.in[1] <== threshold;
    comparison.out === 1;

    // Bind the private count to the public commitment.
    component hasher = Poseidon(5);
    hasher.inputs[0] <== domain;
    hasher.inputs[1] <== count;
    hasher.inputs[2] <== blinding;
    hasher.inputs[3] <== learnerId;
    hasher.inputs[4] <== snapshotId;

    commitment === hasher.out;
}

component main {public [threshold, commitment]} =
    GitHubContributionsAtLeast();
