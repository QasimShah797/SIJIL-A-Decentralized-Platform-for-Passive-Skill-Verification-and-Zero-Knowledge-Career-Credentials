import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPublicShareEmailHtml, buildPublicShareEmailText } from "./publicShareEmail";

describe("public share email content", () => {
  it("includes the skill name and verification URL in plain text", () => {
    const text = buildPublicShareEmailText({
      skillName: "TypeScript",
      verifyUrl: "http://localhost:8080/credential/abc-token",
    });
    assert.match(text, /Credential: TypeScript/);
    assert.match(text, /http:\/\/localhost:8080\/credential\/abc-token/);
    assert.match(text, /No SIJIL account is required/);
    assert.match(text, /Build\. Prove\. Verify\./);
  });

  it("builds branded HTML with a verification button and escaped content", () => {
    const html = buildPublicShareEmailHtml({
      skillName: 'Java <script>alert("x")</script>',
      verifyUrl: "http://localhost:8080/credential/token-1",
    });
    assert.match(html, /View Verified Credential/);
    assert.match(html, /http:\/\/localhost:8080\/credential\/token-1/);
    assert.match(html, /Java &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /SIJIL/);
  });
});
