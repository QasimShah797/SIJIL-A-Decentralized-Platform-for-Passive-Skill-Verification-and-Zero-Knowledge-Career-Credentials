import { ExternalLink, Linkedin, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/sijil/Field";
import {
  isOptionalLinkedInProfileUrlValid,
  normalizeLinkedInProfileUrl,
} from "@/lib/linkedin-profile-url";
import { cn } from "@/lib/utils";

type LinkedInProfileUrlFieldProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  /** When read-only and no URL yet — opens edit mode */
  onAddClick?: () => void;
};

function linkedInHandle(url: string) {
  try {
    const normalized = normalizeLinkedInProfileUrl(url);
    const match = normalized.match(/linkedin\.com\/in\/([^/?#]+)/i);
    return match?.[1] ? `@${match[1]}` : null;
  } catch {
    return null;
  }
}

export function LinkedInProfileUrlField({
  value,
  onChange,
  readOnly = false,
  disabled = false,
  onAddClick,
}: LinkedInProfileUrlFieldProps) {
  const trimmed = value.trim();
  const isValid = trimmed === "" || isOptionalLinkedInProfileUrlValid(trimmed);
  let normalizedUrl: string | null = null;
  if (trimmed && isValid) {
    try {
      normalizedUrl = normalizeLinkedInProfileUrl(trimmed);
    } catch {
      normalizedUrl = null;
    }
  }

  if (readOnly && !normalizedUrl) {
    return (
      <button
        type="button"
        onClick={onAddClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-[#e2e8f0] bg-white p-4 text-left transition-colors hover:border-[#023E8A]/30 hover:bg-[#f8fafc]",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A66C2]/10">
          <Linkedin className="h-5 w-5 text-[#0A66C2]" aria-hidden />
        </div>
        <span className="flex items-center gap-2 text-sm font-medium text-[#334155]">
          <Plus className="h-4 w-4 text-[#64748b]" />
          Add LinkedIn (Optional)
        </span>
      </button>
    );
  }

  if (readOnly && normalizedUrl) {
    const handle = linkedInHandle(trimmed);
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A66C2]/10">
            <Linkedin className="h-5 w-5 text-[#0A66C2]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[#334155]">LinkedIn</span>
              <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-medium text-[#059669]">
                Profile link saved
              </span>
            </div>
            {handle ? <p className="mt-0.5 text-sm font-medium text-[#334155]">{handle}</p> : null}
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#64748b] hover:text-[#023E8A] hover:underline break-all"
            >
              {normalizedUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        </div>
        {onAddClick ? (
          <button
            type="button"
            onClick={onAddClick}
            className="text-xs font-medium text-[#023E8A] hover:underline"
          >
            Edit LinkedIn URL
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e2e8f0] bg-white p-4">
      <Field label="LinkedIn profile URL" hint="Add your public LinkedIn profile URL (optional).">
        <div className="space-y-2">
          <div className="relative">
            <Linkedin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0A66C2]" />
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://www.linkedin.com/in/username"
              className="rounded-xl pl-9"
              disabled={disabled}
              inputMode="url"
              autoComplete="url"
              aria-invalid={trimmed !== "" && !isValid}
            />
          </div>
          {trimmed && !isValid ? (
            <p className="text-xs text-destructive">
              Enter a valid LinkedIn profile URL, for example: https://www.linkedin.com/in/username
            </p>
          ) : null}
          {normalizedUrl ? (
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#023E8A] hover:underline"
            >
              Open profile
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </Field>
    </div>
  );
}
