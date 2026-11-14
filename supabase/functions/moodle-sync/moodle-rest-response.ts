/**
 * Pure Moodle REST body parsing. Moodle's default format is XML, and an
 * exception document starts with "<", which must not be reported as an HTML page.
 */

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTag(body: string, tag: string): string | undefined {
  const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return undefined;
  return decodeXml(match[1].trim());
}

/** Moodle webservice exception XML → the same shape as a JSON exception. */
export function parseMoodleXmlException(bodyText: string): Record<string, unknown> | null {
  if (!/<EXCEPTION\b/i.test(bodyText) && !/<ERRORCODE>/i.test(bodyText)) return null;
  const errorcode = xmlTag(bodyText, "ERRORCODE");
  const message = xmlTag(bodyText, "MESSAGE");
  if (!errorcode && !message) return null;
  const classMatch = bodyText.match(/<EXCEPTION\b[^>]*\bclass="([^"]+)"/i);
  return {
    exception: classMatch?.[1] ?? "moodle_exception",
    errorcode: errorcode ?? "",
    message: message ?? "Moodle API request failed",
  };
}

export function parseMoodleRestBody(
  contentType: string,
  bodyText: string,
): { ok: true; data: Record<string, unknown> } | { ok: false; reason: "empty" | "html" | "invalid" } {
  const text = bodyText.trim();
  if (!text) return { ok: false, reason: "empty" };

  const type = contentType.toLowerCase();
  const xmlException = parseMoodleXmlException(text);
  if (type.includes("xml") || text.startsWith("<?xml") || xmlException) {
    if (!xmlException) return { ok: false, reason: "invalid" };
    return { ok: true, data: xmlException };
  }

  if (type.includes("text/html") || /^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text)) {
    return { ok: false, reason: "html" };
  }

  try {
    return { ok: true, data: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
