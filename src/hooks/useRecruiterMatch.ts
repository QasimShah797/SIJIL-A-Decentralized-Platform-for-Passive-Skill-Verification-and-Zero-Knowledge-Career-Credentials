import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  sanitizeQuestion,
  validateRecruiterMatchAnswer,
  type RecruiterMatchAnswer,
} from "@/lib/recruiter-match-response";

export type MatchStatus = "idle" | "loading" | "success" | "error";

type InvokeFailure = { message: string; code: string; status: number | null; upstreamMessage: string | null };

function statusOf(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("status" in value)) return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function failureFromRecord(record: { error?: unknown; message?: unknown; msg?: unknown; code?: unknown; upstreamStatus?: unknown; upstreamMessage?: unknown }, fallback: string): InvokeFailure | null {
  const detail = record.error || record.message || record.msg;
  if (!detail) return null;
  return {
    message: String(detail),
    code: typeof record.code === "string" && record.code ? record.code : "UNKNOWN",
    status: typeof record.upstreamStatus === "number" ? record.upstreamStatus : null,
    upstreamMessage: typeof record.upstreamMessage === "string" ? record.upstreamMessage.slice(0, 300) : null,
  };
}

async function readInvokeError(error: unknown): Promise<InvokeFailure> {
  const fallback = error instanceof Error && error.message
    ? error.message
    : "SIJIL Match could not answer just now.";
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context
    : null;
  const status = statusOf(context);
  if (!context) {
    const network = /failed to (send|fetch)|network/i.test(fallback);
    return { message: fallback, code: network ? "NETWORK" : "UNKNOWN", status, upstreamMessage: null };
  }
  if (typeof context.json !== "function") {
    const parsed = failureFromRecord(context as { error?: unknown; message?: unknown; code?: unknown }, fallback);
    return parsed ? { ...parsed, status: parsed.status ?? status } : { message: fallback, code: "UNKNOWN", status, upstreamMessage: null };
  }
  try {
    const body = await context.json();
    if (body && typeof body === "object") {
      const parsed = failureFromRecord(body as { error?: unknown; message?: unknown; code?: unknown }, fallback);
      if (parsed) return { ...parsed, status: parsed.status ?? status };
    }
  } catch {
    try {
      if (typeof context.text === "function") {
        const text = (await context.text()).trim();
        if (text) return { message: text.slice(0, 240), code: "UNKNOWN", status, upstreamMessage: null };
      }
    } catch {
      return { message: fallback, code: "UNKNOWN", status, upstreamMessage: null };
    }
  }
  return { message: fallback, code: "UNKNOWN", status, upstreamMessage: null };
}

export function useRecruiterMatch() {
  const [data, setData] = useState<RecruiterMatchAnswer | null>(null);
  const [status, setStatus] = useState<MatchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reset = useCallback(() => {
    requestId.current += 1;
    setData(null);
    setStatus("idle");
    setError(null);
  }, []);

  const ask = useCallback(async (question: string, opts?: { candidateIds?: string[]; allowedIds?: string[] }) => {
    const cleaned = sanitizeQuestion(question);
    if (!cleaned) {
      setStatus("error");
      setError("Enter a question of up to 500 characters.");
      return { stale: false, answer: null, message: "Enter a question of up to 500 characters.", code: "BAD_JSON", status: 400, upstreamMessage: null };
    }
    const id = ++requestId.current;
    setStatus("loading");
    setError(null);
    try {
      const { data: payload, error: invokeError } = await supabase.functions.invoke("recruiter-match", {
        body: {
          question: cleaned,
          candidateIds: (opts?.candidateIds ?? []).slice(0, 20),
        },
      });
      if (id !== requestId.current) return { stale: true, answer: null, message: null, code: null, status: null, upstreamMessage: null };
      if (invokeError) {
        const failure = await readInvokeError(invokeError);
        console.info("recruiter-match failed", { code: failure.code, status: failure.status });
        const coded = new Error(failure.message) as Error & { code?: string; status?: number | null; upstreamMessage?: string | null };
        coded.code = failure.code;
        coded.status = failure.status;
        coded.upstreamMessage = failure.upstreamMessage;
        throw coded;
      }
      if (payload && typeof payload === "object" && "error" in payload && (payload as { error?: unknown }).error) {
        const coded = new Error(String((payload as { error: unknown }).error)) as Error & { code?: string };
        const code = (payload as { code?: unknown }).code;
        coded.code = typeof code === "string" ? code : "UNKNOWN";
        console.info("recruiter-match failed", { code: coded.code, status: null });
        throw coded;
      }
      const parsed = validateRecruiterMatchAnswer(payload, opts?.allowedIds ?? []);
      if (!parsed) {
        const coded = new Error("SIJIL Match returned an unusable answer.") as Error & { code?: string };
        coded.code = "BAD_JSON";
        console.info("recruiter-match failed", { code: "BAD_JSON", status: 200 });
        throw coded;
      }
      setData(parsed);
      setStatus("success");
      return { stale: false, answer: parsed, message: null, code: null, status: 200, upstreamMessage: null };
    } catch (err) {
      if (id !== requestId.current) return { stale: true, answer: null, message: null, code: null, status: null, upstreamMessage: null };
      const message = err instanceof Error ? err.message : "SIJIL Match could not answer just now.";
      const code = err && typeof err === "object" && "code" in err && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : "UNKNOWN";
      const httpStatus = err && typeof err === "object" && "status" in err && typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : null;
      const upstreamMessage = err && typeof err === "object" && "upstreamMessage" in err && typeof (err as { upstreamMessage?: unknown }).upstreamMessage === "string"
        ? (err as { upstreamMessage: string }).upstreamMessage
        : null;
      if (code === "UNKNOWN") console.info("recruiter-match failed", { code, status: httpStatus });
      setData(null);
      setStatus("error");
      setError(message);
      return { stale: false, answer: null, message, code, status: httpStatus, upstreamMessage };
    }
  }, []);

  return { ask, data, status, error, reset };
}
