import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtsResume } from "@/components/public/AtsResume";
import { buildAtsResume, extractAtsHeadings } from "@/lib/public-credential";
import { atsResumeToPdfBlob } from "@/lib/wallet-resume-export";

describe("AtsResume semantic HTML", () => {
  it("exposes heading tags and real skill anchors for ATS parsers", () => {
    const resume = buildAtsResume({
      competency: { competencyId: "comp-1", name: "React.js" },
      learner: {
        name: "Ada Lovelace",
        careerGoal: "Build verifiable career credentials.",
        institution: "CUST",
        program: "Computer Science",
      },
      skills: [{ competencyId: "comp-1", name: "React.js" }],
      evidence: { github: { repos: [{ full_name: "ada/sijil" }] } },
      credentialMetadata: [{ skill_name: "SIJIL Frontend credential" }],
    }, "share-token-1", "comp-1");

    const { container } = render(<AtsResume resume={resume} />);
    const headings = [...container.querySelectorAll("h1, h2")].map((node) => node.textContent);
    expect(headings).toContain("Ada Lovelace");
    expect(extractAtsHeadings(headings.join("\n"))).toEqual([
      "SUMMARY",
      "EDUCATION",
      "SKILLS",
      "ADDITIONAL INFORMATION",
    ]);
    expect(container.querySelectorAll("table")).toHaveLength(0);
    const skillLink = container.querySelector('a[href="/credential/share-token-1/competency/comp-1"]');
    expect(skillLink?.querySelector("[data-skill-name]")?.textContent).toBe("React.js");
  });

  it("lists only competency names in Skills, each as a public evidence link", () => {
    const resume = buildAtsResume({
      competency: { competencyId: "comp-1", name: "TypeScript" },
      learner: { name: "Ada Lovelace", skillsSummary: "typescript, github, moodle" },
      skills: [
        { competencyId: "comp-1", name: "TypeScript" },
        { competencyId: "comp-2", name: "PostgreSQL" },
      ],
      evidence: { github: { repos: [{ full_name: "ada/sijil" }] } },
    }, "share-token-2", "comp-1");

    const { container } = render(<AtsResume resume={resume} />);
    const skillNames = [...container.querySelectorAll("[data-skill-name]")].map((node) => node.textContent);

    expect(skillNames).toEqual(["TypeScript", "PostgreSQL"]);
    expect(resume.skills.every((skill) => skill.href.includes("/competency/"))).toBe(true);
    expect(resume.skills.map((skill) => skill.name)).not.toContain("ada/sijil");
    expect(resume.skills.map((skill) => skill.name)).not.toContain("typescript, github, moodle");
  });

  it("omits the profile image when the learner hid it", () => {
    const resume = buildAtsResume({
      competency: { competencyId: "comp-1", name: "React.js" },
      learner: { name: "Ada Lovelace", photoUrl: "https://cdn.example/ada.jpg", photoHidden: true },
    }, "share-token-1", "comp-1");

    const { container } = render(<AtsResume resume={resume} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("AL");
  });

  it("writes competency names and live evidence links into the PDF", async () => {
    const resume = buildAtsResume({
      competency: { competencyId: "comp-1", name: "TypeScript" },
      skills: [
        { competencyId: "comp-1", name: "TypeScript" },
        {
          competencyId: "comp-2",
          name: "PostgreSQL",
          evidence: { github: { repos: [{ full_name: "ada/db", primary_language: "SQL", commit_count: 9 }] } },
        },
      ],
      evidence: { github: { repos: [{ full_name: "ada/sijil", primary_language: "TypeScript", commit_count: 42 }] } },
    }, "share-token-2", "comp-1");

    expect(resume.skills.map((skill) => skill.name)).toEqual(["TypeScript", "PostgreSQL"]);
    expect(resume.skills[0]?.href).toContain("/competency/comp-1");
    expect(resume.skills[0]?.ledger?.some((item) => item.source === "github")).toBe(true);
    expect(resume.skills[1]?.ledger?.some((item) => item.title === "ada/db")).toBe(true);

    const blob = atsResumeToPdfBlob(resume, "http://localhost:8080");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(200);
  });
});
