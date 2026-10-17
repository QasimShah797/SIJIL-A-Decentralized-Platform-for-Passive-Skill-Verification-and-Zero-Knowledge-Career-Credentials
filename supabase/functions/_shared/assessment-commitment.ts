/**
 * Same Poseidon commitment implementation as the score-threshold circuit.
 * The Edge Function resolves `circomlibjs` through supabase/functions/deno.json.
 */
export {
  createAssessmentCommitment,
  verifyAssessmentOpening,
} from "./commitment.mjs";
