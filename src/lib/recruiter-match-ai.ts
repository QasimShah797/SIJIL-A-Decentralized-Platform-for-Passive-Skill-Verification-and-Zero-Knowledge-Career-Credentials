import { supabase } from "@/integrations/supabase/client";
import { parseInterpretedAsk, type InterpretedAsk } from "@/lib/recruiter-match";

export type RecruiterMatchTurn = {
  role: "recruiter" | "bot";
  text: string;
};

/**
 * Ask Gemini (same provider chain as practical-task MCQs) to interpret a
 * recruiter question. The model only sees the question, competency names,
 * and display names — not hidden credential fields.
 */
export async function interpretRecruiterQuestion(input: {
  question: string;
  knownSkills: string[];
  learnerNames: string[];
  institutions?: string[];
  history?: RecruiterMatchTurn[];
}): Promise<InterpretedAsk> {
  const { data, error } = await supabase.functions.invoke("recruiter-match", {
    body: {
      question: input.question.slice(0, 600),
      knownSkills: input.knownSkills.slice(0, 60),
      learnerNames: input.learnerNames.slice(0, 60),
      institutions: (input.institutions ?? []).slice(0, 40),
      history: (input.history ?? []).slice(-6).map((turn) => ({
        role: turn.role,
        text: turn.text.slice(0, 400),
      })),
    },
  });

  if (error) {
    throw new Error(error.message || "Gemini request failed");
  }

  const parsed = parseInterpretedAsk(data);
  if (!parsed) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error?: unknown }).error ?? "")
      : "";
    throw new Error(message || "Gemini returned an unusable answer");
  }

  return parsed;
}
