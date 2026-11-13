import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import JourneyPage from "@/pages/learner/JourneyPage";
import {
  buildLearnerJourneyPath,
  fetchLearnerJourney,
  type JourneyEventDto,
  type LearnerJourneyResponse,
} from "@/services/api/journey.api";
import {
  formatJourneyLmsGrade,
  isMoodleJourneyMetadata,
  mergeJourneyEvents,
} from "@/lib/journey-events";
import {
  GITHUB_SNAPSHOT_LABEL,
  claimsLiveBlockchainVerification,
  integrityStatusLabel,
  verificationClassLabel,
} from "@/lib/journey-labels";

vi.mock("@/services/api/journey.api", async () => {
  const actual = await vi.importActual<typeof import("@/services/api/journey.api")>(
    "@/services/api/journey.api",
  );
  return {
    ...actual,
    fetchLearnerJourney: vi.fn(),
  };
});

vi.mock("@/components/sijil/LearnerWorkspaceShell", () => ({
  LearnerWorkspaceShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/sijil/SkeletonLoader", () => ({
  PageSkeleton: () => <div>Loading skeleton</div>,
}));

function baseEvent(partial: Partial<JourneyEventDto> & Pick<JourneyEventDto, "eventId" | "eventType" | "title">): JourneyEventDto {
  return {
    competencyId: "22222222-2222-4222-8222-222222222222",
    competencyName: "React",
    occurredAt: "2026-03-15T14:00:00.000Z",
    recordedAt: "2026-03-15T14:00:00.000Z",
    sourceSystem: "mcq",
    verificationClass: "skill_assessed",
    evidenceReference: { table: "mcq_task_attempts", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    integrityStatus: "not_applicable",
    metadata: {},
    provenanceKind: "derived_v1",
    ...partial,
  };
}

function sampleResponse(overrides: Partial<LearnerJourneyResponse> = {}): LearnerJourneyResponse {
  return {
    schemaVersion: 1,
    generatedAt: "2026-11-03T00:00:00.000Z",
    learnerUserId: "11111111-1111-4111-8111-111111111111",
    disclaimers: {
      absenceOfEvidenceNotAbsenceOfSkill: true,
      sourceReportedIsNotSkillAssessed: true,
    },
    events: [
      baseEvent({
        eventId: "mcq:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        eventType: "assessment_completed",
        title: "React practical assessment",
        metadata: { scorePercent: 45, passed: false },
      }),
      baseEvent({
        eventId: "ghact:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        eventType: "github_activity_observed",
        title: "Commit on org/react-demo",
        occurredAt: "2026-07-02T09:12:00.000Z",
        recordedAt: "2026-07-03T01:00:00.000Z",
        sourceSystem: "github",
        verificationClass: "source_reported",
        evidenceReference: { table: "github_activities", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        integrityStatus: "unchecked",
        metadata: { activityType: "commit" },
      }),
      baseEvent({
        eventId: "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:issued",
        eventType: "credential_issued",
        title: "React Competency Credential",
        occurredAt: "2026-10-10T12:00:00.000Z",
        recordedAt: "2026-10-10T12:00:00.000Z",
        sourceSystem: "credential",
        verificationClass: "sijil_recorded",
        evidenceReference: { table: "credentials", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        integrityStatus: "unchecked",
        metadata: { dbAnchorStatus: "anchored", hasAssessmentCommitment: false },
      }),
    ],
    skillGrowth: [
      {
        competencyId: "22222222-2222-4222-8222-222222222222",
        competencyName: "React",
        points: [
          {
            attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            occurredAt: "2026-03-15T14:00:00.000Z",
            scorePercent: 45,
            passed: false,
          },
          {
            attemptId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            occurredAt: "2026-10-01T16:00:00.000Z",
            scorePercent: 90,
            passed: true,
          },
        ],
      },
    ],
    page: {
      limit: 50,
      nextCursor: null,
      truncatedSources: [],
      incomplete: false,
    },
    ...overrides,
  };
}

function renderJourney() {
  return render(
    <MemoryRouter initialEntries={["/learner/journey"]}>
      <Routes>
        <Route path="/learner/journey" element={<JourneyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("journey labels", () => {
  it("maps verification classes accurately", () => {
    expect(verificationClassLabel("source_reported")).toBe("Source-reported");
    expect(verificationClassLabel("sijil_recorded")).toBe("SIJIL-recorded");
    expect(verificationClassLabel("skill_assessed")).toBe("SIJIL-assessed");
    expect(verificationClassLabel("integrity_checked")).toBe("Integrity-checked");
  });

  it("does not claim live blockchain verification for unchecked or hash_matches", () => {
    expect(integrityStatusLabel("unchecked")).toBe("Integrity not checked");
    expect(integrityStatusLabel("hash_matches")).toBe("Hash matches stored record");
    expect(claimsLiveBlockchainVerification("unchecked")).toBe(false);
    expect(claimsLiveBlockchainVerification("not_applicable")).toBe(false);
    expect(claimsLiveBlockchainVerification("hash_matches")).toBe(false);
    expect(claimsLiveBlockchainVerification("unavailable")).toBe(false);
    expect(claimsLiveBlockchainVerification("ledger_active")).toBe(true);
    expect(claimsLiveBlockchainVerification("ledger_revoked")).toBe(true);
    expect(integrityStatusLabel("hash_matches")).not.toMatch(/blockchain/i);
    expect(integrityStatusLabel("ledger_active")).not.toMatch(/Blockchain Verified/i);
  });

  it("formats Moodle journey grade metadata without inventing scores", () => {
    expect(isMoodleJourneyMetadata({ platform: "Moodle" })).toBe(true);
    expect(isMoodleJourneyMetadata({ platform: "GitHub" })).toBe(false);
    expect(formatJourneyLmsGrade({ grade: 85, gradeMax: 100 })).toBe("85/100");
    expect(formatJourneyLmsGrade({ grade: null, gradeMax: 100 })).toBeNull();
    expect(formatJourneyLmsGrade({})).toBeNull();
  });
});

describe("journey event merge", () => {
  it("deduplicates overlapping pages by eventId and keeps issued/revoked separate", () => {
    const issued = baseEvent({
      eventId: "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:issued",
      eventType: "credential_issued",
      title: "React Competency Credential",
      occurredAt: "2026-10-10T12:00:00.000Z",
      recordedAt: "2026-10-10T12:00:00.000Z",
      sourceSystem: "credential",
      verificationClass: "sijil_recorded",
      integrityStatus: "unchecked",
    });
    const revoked = baseEvent({
      eventId: "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:revoked",
      eventType: "credential_revoked",
      title: "React Competency Credential revoked",
      occurredAt: "2026-11-01T12:00:00.000Z",
      recordedAt: "2026-11-01T12:00:00.000Z",
      sourceSystem: "credential",
      verificationClass: "sijil_recorded",
      integrityStatus: "unchecked",
    });
    const page1 = [issued];
    const page2Overlap = [issued, revoked];
    const merged = mergeJourneyEvents(page1, page2Overlap, "append");
    expect(merged.map((e) => e.eventId)).toEqual([
      "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:revoked",
      "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:issued",
    ]);
  });
});

describe("journey API path builder", () => {
  it("never embeds a learner id and supports filters/cursor", () => {
    const path = buildLearnerJourneyPath({
      limit: 50,
      cursor: "abc",
      competencyId: "22222222-2222-4222-8222-222222222222",
      eventTypes: ["assessment_completed"],
    });
    expect(path.startsWith("/learner/journey?")).toBe(true);
    expect(path).toContain("cursor=abc");
    expect(path).toContain("competencyId=22222222-2222-4222-8222-222222222222");
    expect(path).toContain("eventTypes=assessment_completed");
    expect(path.toLowerCase()).not.toContain("learneruserid");
    expect(path).not.toContain("11111111-1111-4111-8111-111111111111");
  });
});

describe("JourneyPage", () => {
  beforeEach(() => {
    vi.mocked(fetchLearnerJourney).mockReset();
  });

  it("renders timeline events, growth chart points, and verification labels", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(sampleResponse());
    renderJourney();

    expect(await screen.findByRole("heading", { name: "My Skill Journey" })).toBeInTheDocument();
    expect(screen.getByText("React practical assessment")).toBeInTheDocument();
    expect(screen.getByText("Commit on org/react-demo")).toBeInTheDocument();
    expect(screen.getAllByText("Source-reported").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SIJIL-assessed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Integrity not checked").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Skill growth chart")).toBeInTheDocument();
    expect(screen.getByText("Assessment score history")).toBeInTheDocument();
    expect(screen.getByText(/React: 45%/)).toBeInTheDocument();
    expect(screen.getByText(/React: 90%/)).toBeInTheDocument();
    expect(screen.queryByText(/Blockchain Verified/i)).toBeNull();
    expect(JSON.stringify(sampleResponse())).not.toMatch(/answer_key|blinding|disclosure_token|proofValue/);
  });

  it("shows empty history state without claiming missing skills", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(
      sampleResponse({
        events: [],
        skillGrowth: [],
      }),
    );
    renderJourney();
    expect(await screen.findByText(/No recorded journey events yet/i)).toBeInTheDocument();
    expect(screen.getByText(/does not mean you lack skills/i)).toBeInTheDocument();
    expect(screen.getByText(/No historical assessment scores yet/i)).toBeInTheDocument();
  });

  it("shows incomplete history warning from page.incomplete", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(
      sampleResponse({
        page: {
          limit: 50,
          nextCursor: null,
          truncatedSources: ["github_activities:row_cap"],
          incomplete: true,
        },
      }),
    );
    renderJourney();
    expect(await screen.findByText(/Some historical records may be missing/i)).toBeInTheDocument();
    expect(screen.getByText(/github activities \(safety limit reached\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Loaded so far/i).length).toBeGreaterThan(0);
  });

  it("loads more with cursor pagination", async () => {
    vi.mocked(fetchLearnerJourney)
      .mockResolvedValueOnce(
        sampleResponse({
          page: {
            limit: 50,
            nextCursor: "cursor-1",
            truncatedSources: [],
            incomplete: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        sampleResponse({
          events: [
            baseEvent({
              eventId: "sup:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              eventType: "supporting_evidence_added",
              title: "Portfolio PDF",
              occurredAt: "2026-08-01T00:00:00.000Z",
              recordedAt: "2026-08-01T00:00:00.000Z",
              sourceSystem: "supporting",
              verificationClass: "sijil_recorded",
              evidenceReference: { table: "supporting_records", id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
            }),
          ],
          page: {
            limit: 50,
            nextCursor: null,
            truncatedSources: [],
            incomplete: false,
          },
        }),
      );

    renderJourney();
    expect(await screen.findByText("React practical assessment")).toBeInTheDocument();
    expect(fetchLearnerJourney).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cursor: null, limit: 50 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Load more/i }));
    expect(await screen.findByText("Portfolio PDF")).toBeInTheDocument();
    expect(fetchLearnerJourney).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-1" }),
    );
  });

  it("preserves loaded content when Load More fails and retries with the same cursor", async () => {
    vi.mocked(fetchLearnerJourney)
      .mockResolvedValueOnce(
        sampleResponse({
          page: {
            limit: 50,
            nextCursor: "cursor-1",
            truncatedSources: [],
            incomplete: false,
          },
        }),
      )
      .mockRejectedValueOnce(new Error("API 503: unavailable"))
      .mockResolvedValueOnce(
        sampleResponse({
          events: [
            baseEvent({
              eventId: "sup:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              eventType: "supporting_evidence_added",
              title: "Portfolio PDF",
              occurredAt: "2026-08-01T00:00:00.000Z",
              recordedAt: "2026-08-01T00:00:00.000Z",
              sourceSystem: "supporting",
              verificationClass: "sijil_recorded",
              evidenceReference: {
                table: "supporting_records",
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              },
            }),
          ],
          page: {
            limit: 50,
            nextCursor: null,
            truncatedSources: [],
            incomplete: false,
          },
        }),
      );

    renderJourney();
    expect(await screen.findByText("React practical assessment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Load more/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Could not load more events/i)).toBeInTheDocument();
    expect(screen.getByText("React practical assessment")).toBeInTheDocument();
    expect(screen.getByText(/React: 45%/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not load your skill journey/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Retry$/i }));
    expect(await screen.findByText("Portfolio PDF")).toBeInTheDocument();
    expect(fetchLearnerJourney).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-1" }),
    );
    expect(fetchLearnerJourney).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ cursor: "cursor-1" }),
    );
  });

  it("deduplicates overlapping Load More pages in the UI", async () => {
    const overlapping = baseEvent({
      eventId: "mcq:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      eventType: "assessment_completed",
      title: "React practical assessment",
    });
    vi.mocked(fetchLearnerJourney)
      .mockResolvedValueOnce(
        sampleResponse({
          events: [overlapping],
          page: {
            limit: 50,
            nextCursor: "cursor-1",
            truncatedSources: [],
            incomplete: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        sampleResponse({
          events: [
            overlapping,
            baseEvent({
              eventId: "sup:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              eventType: "supporting_evidence_added",
              title: "Portfolio PDF",
              occurredAt: "2026-08-01T00:00:00.000Z",
              recordedAt: "2026-08-01T00:00:00.000Z",
              sourceSystem: "supporting",
              verificationClass: "sijil_recorded",
              evidenceReference: {
                table: "supporting_records",
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              },
            }),
          ],
          page: {
            limit: 50,
            nextCursor: null,
            truncatedSources: [],
            incomplete: false,
          },
        }),
      );

    renderJourney();
    expect(await screen.findByText("React practical assessment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Load more/i }));
    expect(await screen.findByText("Portfolio PDF")).toBeInTheDocument();
    expect(screen.getAllByText("React practical assessment")).toHaveLength(1);
  });

  it("keeps credential issued and revoked as separate timeline rows", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(
      sampleResponse({
        events: [
          baseEvent({
            eventId: "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:issued",
            eventType: "credential_issued",
            title: "React Competency Credential",
            occurredAt: "2026-10-10T12:00:00.000Z",
            recordedAt: "2026-10-10T12:00:00.000Z",
            sourceSystem: "credential",
            verificationClass: "sijil_recorded",
            integrityStatus: "unchecked",
            evidenceReference: { table: "credentials", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
          }),
          baseEvent({
            eventId: "cred:cccccccc-cccc-4ccc-8ccc-cccccccccccc:revoked",
            eventType: "credential_revoked",
            title: "React Competency Credential revoked",
            occurredAt: "2026-11-01T12:00:00.000Z",
            recordedAt: "2026-11-01T12:00:00.000Z",
            sourceSystem: "credential",
            verificationClass: "sijil_recorded",
            integrityStatus: "unchecked",
            evidenceReference: { table: "credentials", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
          }),
        ],
        skillGrowth: [],
      }),
    );
    renderJourney();
    // Timeline + credential milestones panels both list titles.
    expect((await screen.findAllByText(/^React Competency Credential revoked$/)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/^React Competency Credential$/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Credential issued/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Credential revoked/).length).toBeGreaterThan(0);
  });

  it("shows GitHub snapshot label for snapshotOnly metadata", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(
      sampleResponse({
        events: [
          baseEvent({
            eventId: "ghev:ffffffff-ffff-4fff-8fff-ffffffffffff",
            eventType: "github_project_evidence_synced",
            title: "org/react-demo",
            occurredAt: "2026-09-01T00:00:00.000Z",
            recordedAt: "2026-09-02T00:00:00.000Z",
            sourceSystem: "github",
            verificationClass: "source_reported",
            evidenceReference: { table: "evidence_records", id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
            integrityStatus: "unchecked",
            metadata: { snapshotOnly: true },
          }),
        ],
        skillGrowth: [],
      }),
    );
    renderJourney();
    expect(await screen.findByText("org/react-demo")).toBeInTheDocument();
    expect(screen.getByText(GITHUB_SNAPSHOT_LABEL)).toBeInTheDocument();
    expect(screen.getAllByText("Source-reported").length).toBeGreaterThan(0);
  });

  it("shows Moodle assignment with Java skill, grade 85/100, and Source-reported (not SIJIL-assessed)", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(
      sampleResponse({
        events: [
          baseEvent({
            eventId: "lms:moodle_assignment_1",
            eventType: "supporting_evidence_added",
            title: "Java Programming Fundamentals",
            competencyId: "2ec5680a-8f24-4216-95e7-22035d36155c",
            competencyName: "Java",
            occurredAt: "2026-11-08T21:28:46.761Z",
            recordedAt: "2026-11-08T21:28:46.761Z",
            sourceSystem: "supporting",
            verificationClass: "source_reported",
            evidenceReference: {
              table: "evidence_records",
              id: "c1bad133-78a2-4be3-b8d2-f11ea898bbe7",
              externalId: "moodle_assignment_1",
            },
            integrityStatus: "unchecked",
            metadata: {
              platform: "Moodle",
              courseName: "Java",
              assignmentName: "Java Programming Fundamentals",
              grade: 85,
              gradeMax: 100,
              moodleCourseId: 2,
              moodleAssignmentId: 1,
              sourceReportedIsNotSkillAssessed: true,
            },
          }),
        ],
        skillGrowth: [],
      }),
    );
    renderJourney();
    expect(await screen.findByText("Java Programming Fundamentals")).toBeInTheDocument();
    expect(screen.getByText(/Supporting evidence added · Java · Moodle · Grade 85\/100/i)).toBeInTheDocument();
    expect(screen.getAllByText("Source-reported").length).toBeGreaterThan(0);
    expect(screen.queryByText("SIJIL-assessed")).toBeNull();
  });

  it("hides assessment chart when a non-assessment event-type filter is active", async () => {
    vi.mocked(fetchLearnerJourney)
      .mockResolvedValueOnce(sampleResponse())
      .mockResolvedValueOnce(
        sampleResponse({
          events: [
            baseEvent({
              eventId: "ghact:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              eventType: "github_activity_observed",
              title: "Commit on org/react-demo",
              sourceSystem: "github",
              verificationClass: "source_reported",
              integrityStatus: "unchecked",
              evidenceReference: {
                table: "github_activities",
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              },
            }),
          ],
        }),
      );

    renderJourney();
    expect(await screen.findByText(/React: 45%/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Event type"), {
      target: { value: "github_activity_observed" },
    });

    expect(
      await screen.findByText(/Assessment score history is hidden while the timeline is filtered/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/React: 45%/)).toBeNull();
  });

  it("resets pagination when filters change", async () => {
    vi.mocked(fetchLearnerJourney)
      .mockResolvedValueOnce(
        sampleResponse({
          page: {
            limit: 50,
            nextCursor: "cursor-1",
            truncatedSources: [],
            incomplete: false,
          },
        }),
      )
      .mockResolvedValueOnce(sampleResponse({ events: [], skillGrowth: [] }));

    renderJourney();
    expect(await screen.findByText("React practical assessment")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Event type"), {
      target: { value: "assessment_completed" },
    });

    await screen.findByText(/No recorded journey events yet/i);
    expect(fetchLearnerJourney).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: null,
        eventTypes: ["assessment_completed"],
      }),
    );
  });

  it("shows full-page error state with retry on initial load failure", async () => {
    vi.mocked(fetchLearnerJourney)
      .mockRejectedValueOnce(new Error("API 503: unavailable"))
      .mockResolvedValueOnce(sampleResponse({ events: [], skillGrowth: [] }));
    renderJourney();
    expect(await screen.findByText(/Could not load your skill journey/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByText(/No recorded journey events yet/i)).toBeInTheDocument();
  });

  it("is mounted only under the learner journey path in this harness", async () => {
    vi.mocked(fetchLearnerJourney).mockResolvedValue(sampleResponse({ events: [] }));
    render(
      <MemoryRouter initialEntries={["/recruiter/search"]}>
        <Routes>
          <Route path="/learner/journey" element={<JourneyPage />} />
          <Route path="/recruiter/search" element={<div>Recruiter home</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Recruiter home")).toBeInTheDocument();
    expect(screen.queryByText("My Skill Journey")).toBeNull();
    expect(fetchLearnerJourney).not.toHaveBeenCalled();
  });
});
