pragma circom 2.1.9;

// SIJIL score-threshold-v1
//
// Proves: the private integer score is in 0..100, the public threshold is in
// 0..100, score >= threshold, and
//
//   commitment = Poseidon(domain, score, blinding, learnerId, attemptId)
//
// with the circomlib Poseidon (BN254, t = nInputs + 1).
//
// Domain is the big-endian integer of the UTF-8 bytes of "SIJIL-ASSESS-v1"
// (15 bytes, 120 bits), which is the field element
// 432447140727981111453175978658723377.
//
// learnerId and attemptId are private committed values. This circuit does not
// authenticate them against SIJIL. A satisfying proof is not an issuer
// signature, a revocation check, or a Fabric anchor.
//
// Public signal order, and the only public signals:
//   [0] threshold
//   [1] commitment
// There is no public output. score and blinding never leave the witness.

include "comparators.circom";
include "poseidon.circom";

template ScoreAtLeast() {
    signal input score;
    signal input blinding;
    signal input learnerId;
    signal input attemptId;
    signal input threshold;
    signal input commitment;

    // Fixed domain separator. Not a witness hint: `<==` emits a constraint.
    signal domain;
    domain <== 432447140727981111453175978658723377;

    // 8-bit decomposition forces an integer in 0..255. LessEqThan then
    // tightens that to 0..100. circomlib's bit hints are constrained by
    // out[i] * (out[i] - 1) === 0 and by the weighted sum equaling the input.
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

    // Range checks above keep score + 1 inside 8 bits, so this comparison
    // cannot be satisfied by a field wrap.
    component scoreGeThreshold = GreaterEqThan(8);
    scoreGeThreshold.in[0] <== score;
    scoreGeThreshold.in[1] <== threshold;
    scoreGeThreshold.out === 1;

    component hasher = Poseidon(5);
    hasher.inputs[0] <== domain;
    hasher.inputs[1] <== score;
    hasher.inputs[2] <== blinding;
    hasher.inputs[3] <== learnerId;
    hasher.inputs[4] <== attemptId;
    commitment === hasher.out;
}

component main {public [threshold, commitment]} = ScoreAtLeast();
