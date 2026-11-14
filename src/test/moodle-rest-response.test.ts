import { describe, expect, it } from "vitest";
import { parseMoodleRestBody } from "../../supabase/functions/moodle-sync/moodle-rest-response.ts";
import { resolveMoodleRestEndpoint } from "../../supabase/functions/moodle-sync/moodle-site-url.ts";

describe("Moodle REST response parsing", () => {
  it("reads a Moodle XML exception instead of calling it HTML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<EXCEPTION class="core\\exception\\moodle_exception">
<ERRORCODE>invalidtoken</ERRORCODE>
<MESSAGE>Invalid token - token not found</MESSAGE>
</EXCEPTION>`;
    const parsed = parseMoodleRestBody("application/xml; charset=utf-8", xml);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.errorcode).toBe("invalidtoken");
      expect(parsed.data.message).toBe("Invalid token - token not found");
    }
  });

  it("still rejects an HTML login page", () => {
    const parsed = parseMoodleRestBody("text/html", "<html><body>Login</body></html>");
    expect(parsed).toEqual({ ok: false, reason: "html" });
  });

  it("calls the Moodle wwwroot when the base URL is only a loopback alias", () => {
    expect(resolveMoodleRestEndpoint(
      "http://127.0.0.1:8000",
      "http://localhost:8000",
    )).toBe("http://localhost:8000/webservice/rest/server.php");
  });

  it("does not retarget a local base URL at a remote expected site", () => {
    expect(resolveMoodleRestEndpoint(
      "http://127.0.0.1:8000",
      "https://sijil-fyp.moodlecloud.com",
    )).toBe("http://127.0.0.1:8000/webservice/rest/server.php");
  });
});
