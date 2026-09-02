import { FieldRow } from "@/components/sijil/FieldRow";
import { titleCaseLabel } from "@/lib/shared-presentation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function renderPrimitive(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function DisclosureValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <div className="grid gap-3">
        {value.map((item, index) => (
          <div key={index} className="rounded-xl border border-border/60 p-3">
            {isRecord(item) ? (
              Object.entries(item).map(([key, nested]) => (
                <FieldRow key={key} label={titleCaseLabel(key)} value={renderPrimitive(nested)} />
              ))
            ) : (
              <div className="text-sm">{renderPrimitive(item)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, nested]) => {
      if (nested == null) return false;
      if (Array.isArray(nested)) return nested.length > 0;
      if (isRecord(nested)) return Object.keys(nested).length > 0;
      if (typeof nested === "string") return nested.trim().length > 0;
      return true;
    });
    if (entries.length === 0) return null;

    return (
      <div className="space-y-4">
        {entries.map(([key, nested]) => (
          <div key={key} className="space-y-3">
            {Array.isArray(nested) || isRecord(nested) ? (
              <>
                <div className="text-sm font-medium">{titleCaseLabel(key)}</div>
                <DisclosureValue value={nested} />
              </>
            ) : (
              <FieldRow label={titleCaseLabel(key)} value={renderPrimitive(nested)} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return <div className="text-sm">{renderPrimitive(value)}</div>;
}

export function DisclosedPayloadView({
  payload,
  fields,
}: {
  payload: Record<string, unknown>;
  fields: { id: string; label: string; value: string }[];
}) {
  const payloadEntries = Object.entries(payload).filter(([, value]) => value != null);
  if (payloadEntries.length > 0) {
    return <DisclosureValue value={payload} />;
  }

  return (
    <>
      {fields.map((field) => (
        <FieldRow key={field.id} label={field.label} value={field.value} />
      ))}
    </>
  );
}
