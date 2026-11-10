pragma circom 2.1.9;

// SIJIL score-threshold-v1 below-threshold companion circuit.
//
// Proves: score and threshold are in 0..100, score < threshold, and
//   commitment = Poseidon(domain, score, blinding, learnerId, attemptId)
// with the same domain as score_threshold.circom ("SIJIL-ASSESS-v1").
//
// A valid proof with this circuit is cryptographically distinct from a failed
// AtLeast proof. Never treat a failed AtLeast proof as evidence of BELOW_THRESHOLD.
//
// Public signals: [threshold, commitment]

include "comparators.circom";
include "poseidon.circom";

template ScoreBelow() {
    signal input score;
    signal input blinding;
    signal input learnerId;
    signal input attemptId;
    signal input threshold;
    signal input commitment;

    signal domain;
    domain <== 432447140727981111453175978658723377;

    component scoreBits = Num2Bits(8);
    scoreBits.in <== score;
    component scoreLe100 = LessEqThan(8);
    scoreLe100.in[0] <== score;
    scoreLe100.in[1] <== 100;
    scoreLe100.out === 1;

    component thresholdBits = Num2Bits(8);
    thresholdBits.in <== threshold;
    component thresholdLe100 = LessEqThan(8);
    thresholdLe100.in[0] <== threshold;
    thresholdLe100.in[1] <== 100;
    thresholdLe100.out === 1;

    component scoreLtThreshold = LessThan(8);
    scoreLtThreshold.in[0] <== score;
    scoreLtThreshold.in[1] <== threshold;
    scoreLtThreshold.out === 1;

    component hasher = Poseidon(5);
    hasher.inputs[0] <== domain;
    hasher.inputs[1] <== score;
    hasher.inputs[2] <== blinding;
    hasher.inputs[3] <== learnerId;
    hasher.inputs[4] <== attemptId;
    commitment === hasher.out;
}

component main {public [threshold, commitment]} = ScoreBelow();
