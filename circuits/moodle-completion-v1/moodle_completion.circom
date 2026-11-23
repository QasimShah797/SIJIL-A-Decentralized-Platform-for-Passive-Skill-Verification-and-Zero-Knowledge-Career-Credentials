pragma circom 2.1.9;

// SIJIL moodle-completion-v1
//
// Proves: completed and required are u32, required > 0, and
//   completed * 100 >= required * thresholdPercent
// without revealing completed or required.
//
// Commitment:
//   Poseidon(domain("SIJIL-MOODLE-v1"), completed, required, blinding, learnerId, evidenceId)
//
// Public signals: [thresholdPercent, commitment]
// Development circuit. Moodle authenticity is enforced by the backend attestation.

include "comparators.circom";
include "poseidon.circom";

template MoodleCompletionAtLeast() {
    signal input completed;
    signal input required;
    signal input blinding;
    signal input learnerId;
    signal input evidenceId;
    signal input thresholdPercent;
    signal input commitment;

    // Domain: big-endian integer of UTF-8 "SIJIL-MOODLE-v1"
    signal domain;
    domain <== 0x53494a494c2d4d4f4f444c452d7631;

    component completedBits = Num2Bits(32);
    completedBits.in <== completed;
    component requiredBits = Num2Bits(32);
    requiredBits.in <== required;
    component thresholdBits = Num2Bits(8);
    thresholdBits.in <== thresholdPercent;

    // thresholdPercent in 0..100
    component thresholdLe100 = LessEqThan(8);
    thresholdLe100.in[0] <== thresholdPercent;
    thresholdLe100.in[1] <== 100;
    thresholdLe100.out === 1;

    // required >= 1
    component requiredGe1 = GreaterEqThan(32);
    requiredGe1.in[0] <== required;
    requiredGe1.in[1] <== 1;
    requiredGe1.out === 1;

    // completed <= required (cannot claim more completions than activities)
    component completedLeRequired = LessEqThan(32);
    completedLeRequired.in[0] <== completed;
    completedLeRequired.in[1] <== required;
    completedLeRequired.out === 1;

    // completed * 100 and required * thresholdPercent fit in 40 bits for u32*100
    signal left;
    signal right;
    left <== completed * 100;
    right <== required * thresholdPercent;

    component leftBits = Num2Bits(40);
    leftBits.in <== left;
    component rightBits = Num2Bits(40);
    rightBits.in <== right;

    component ge = GreaterEqThan(40);
    ge.in[0] <== left;
    ge.in[1] <== right;
    ge.out === 1;

    component hasher = Poseidon(6);
    hasher.inputs[0] <== domain;
    hasher.inputs[1] <== completed;
    hasher.inputs[2] <== required;
    hasher.inputs[3] <== blinding;
    hasher.inputs[4] <== learnerId;
    hasher.inputs[5] <== evidenceId;
    commitment === hasher.out;
}

component main {public [thresholdPercent, commitment]} = MoodleCompletionAtLeast();
