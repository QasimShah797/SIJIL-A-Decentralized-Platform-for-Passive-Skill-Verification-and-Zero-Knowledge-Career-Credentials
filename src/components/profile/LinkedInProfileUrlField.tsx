import { ExternalLink, Linkedin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/sijil/Field";
import { StatusBadge } from "@/components/sijil/StatusBadge";
import {
  isOptionalLinkedInProfileUrlValid,
  normalizeLinkedInProfileUrl,
} from "@/lib/linkedin-profile-url";

type LinkedInProfileUrlFieldProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
};

export function LinkedInProfileUrlField({
  value,
  onChange,
  readOnly = false,
  disabled = false,
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

  if (readOnly) {
    if (!normalizedUrl) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">LinkedIn profile URL</div>
          <StatusBadge variant="outline">Profile link saved</StatusBadge>
        </div>
        <a
          href={normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
        >
          {normalizedUrl}
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      </div>
    );
  }

  return (
    <Field
      label="LinkedIn profile URL"
      hint="Add your public LinkedIn profile URL."
    >
      <div className="space-y-2">
        <div className="relative">
          <Linkedin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://www.linkedin.com/in/username"
            className="pl-9"
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
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="outline">Profile link saved</StatusBadge>
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open profile
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}
      </div>
    </Field>
  );
}
