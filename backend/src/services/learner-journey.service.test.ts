/**
 * Phase 1 learner journey aggregation — mocked stores only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../utils/AppError";
import { learnerJourneyQuerySchema } from "../validators/learner-journey.validator";
import {
  JOURNEY_SOURCE_PAGE_SIZE,
  collectPagedRows,
  compareJourneyRank,
  decodeJourneyCursor,
  getLearnerJourney,
  mapCredentialEvents,
  mapGithubActivityEvents,
  mapGithubEvidenceEvents,
  mapLmsEvidenceEvents,
  mapMcqEvents,
  sanitizeGithubActivityTitleForDisplay,
  type JourneySourceFetch,
  type LearnerJourneyStore,
} from "./learner-journey.service";

const LEARNER = "11111111-1111-4111-8111-111111111111";
const SKILL = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function ok(
  rows: Record<string, unknown>[],
  extra?: Partial<Extract<JourneySourceFetch, { ok: true }>>,
): JourneySourceFetch {
  return { ok: true, rows, capped: false, ...extra };
}

function fail(error = "boom"): JourneySourceFetch {
  return { ok: false, error };
}

function makeIds(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index).padStart(12, "0");
    return {
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${n}`,
      activity_title: `act-${index}`,
      occurred_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString(),
      synced_at: new Date(Date.UTC(2026, 0, 1, 1, 0, index % 60)).toISOString(),
    };
  });
}

/** Simulates PostgREST .range(from, to) inclusive over an in-memory table. */
function rangeSlice<T>(rows: T[], from: number, to: number): T[] {
  return rows.slice(from, to + 1);
}

function emptyStore(overrides: Partial<LearnerJourneyStore> = {}): LearnerJourneyStore {
  return {
    fetchMcqAttempts: async () => ok([]),
    fetchCredentials: async () => ok([]),
    fetchSupportingRecords: async () => ok([]),
    fetchGithubActivities: async () => ok([]),
    fetchEvidenceRecords: async () => ok([]),
    fetchLmsEvidenceRecords: async () => ok([]),
    fetchSkillEvidenceLinks: async () => ok([]),
    fetchDeclaredSkills: async () => ok([{ id: SKILL, name: "React" }]),
    ...overrides,
  };
}

function assertNoSecrets(payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const needle of [
    "answer_key",
    "learner_answers",
    "blinding",
    "proofValue",
    "credential_document",
    "correctOptionId",
    "disclosure_token",
  ]) {
    assert.equal(text.includes(needle), false, `leaked ${needle}`);
  }
}

describe("learner journey query validation", () => {
  it("rejects invalid limit and cursor-sized junk via schema", () => {
    assert.equal(learnerJourneyQuerySchema.safeParse({ limit: 0 }).success, false);
    assert.equal(learnerJourneyQuerySchema.safeParse({ limit: 101 }).success, false);
    assert.equal(learnerJourneyQuerySchema.safeParse({ competencyId: "not-uuid" }).success, false);
    assert.equal(learnerJourneyQuerySchema.safeParse({ eventTypes: "not_a_type" }).success, false);
  });

  it("defaults limit to 50", () => {
    const parsed = learnerJourneyQuerySchema.parse({});
    assert.equal(parsed.limit, 50);
  });
});

describe("learner journey mapping", () => {
  const maps = {
    byId: new Map([[SKILL, "React"]]),
    byName: new Map([["react", SKILL]]),
  };

  it("includes completed MCQ attempts and excludes in-progress", () => {
    const { events, growth } = mapMcqEvents([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        skill_id: SKILL,
        competency_name: "React",
        title: "React quiz",
        status: "completed",
        percentage: 45,
        correct_count: 5,
        total_questions: 10,
        passed: false,
        submitted_at: "2026-03-15T14:00:00.000Z",
        created_at: "2026-03-15T13:00:00.000Z",
        answer_key: [{ correctOptionId: "A" }],
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        skill_id: SKILL,
        status: "in_progress",
        percentage: null,
        created_at: "2026-03-16T14:00:00.000Z",
      },
    ], maps);

    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, "assessment_completed");
    assert.equal(events[0].verificationClass, "skill_assessed");
    assert.equal(growth.length, 1);
    assert.equal(growth[0].scorePercent, 45);
    assertNoSecrets(events);
  });

  it("does not invent skill-growth points without percentage or submitted_at", () => {
    const { growth } = mapMcqEvents([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        skill_id: SKILL,
        status: "completed",
        passed: true,
        created_at: "2026-03-15T14:00:00.000Z",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        skill_id: SKILL,
        status: "completed",
        percentage: 90,
        created_at: "2026-03-16T14:00:00.000Z",
        // no submitted_at → event may use created_at fallback, but no growth point
      },
    ], maps);
    assert.equal(growth.length, 0);
  });

  it("emits separate issued and revoked credential events and classifies conservatively", () => {
    const events = mapCredentialEvents([
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "React Credential",
        skill_name: "React",
        valid_from: "2026-10-10T12:00:00.000Z",
        created_at: "2026-10-10T12:00:00.000Z",
        revoked_at: "2026-10-20T12:00:00.000Z",
        anchor_status: "anchored",
        credential_document: { credentialSubject: { skill: "React" } },
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "Assessed Credential",
        skill_name: "React",
        valid_from: "2026-10-11T12:00:00.000Z",
        created_at: "2026-10-11T12:00:00.000Z",
        credential_document: {
          credentialSubject: {
            assessmentCommitment: {
              version: 1,
              scheme: "poseidon",
              circuitId: "score-threshold-v1",
              attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              commitment: "123",
            },
          },
        },
      },
    ], maps);

    assert.equal(events.filter((e) => e.eventType === "credential_issued").length, 2);
    assert.equal(events.filter((e) => e.eventType === "credential_revoked").length, 1);
    const plain = events.find((e) => e.eventId.endsWith(":issued") && e.title === "React Credential");
    const assessed = events.find((e) => e.title === "Assessed Credential");
    assert.equal(plain?.verificationClass, "sijil_recorded");
    assert.equal(assessed?.verificationClass, "skill_assessed");
    assert.equal(plain?.integrityStatus, "unchecked");
    assertNoSecrets(events);
  });

  it("labels GitHub activity as source_reported", () => {
    const events = mapGithubActivityEvents([
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        linked_skill_id: SKILL,
        activity_type: "commit",
        activity_title: "feat: hooks",
        repo_name: "org/app",
        occurred_at: "2026-07-02T09:12:00.000Z",
        synced_at: "2026-07-03T01:00:00.000Z",
        external_id: "commit:1",
      },
    ], maps);
    assert.equal(events[0].verificationClass, "source_reported");
    assert.equal(events[0].sourceSystem, "github");
  });

  it("sanitizes stored PR titles that interpolated undefined/null placeholders", () => {
    assert.equal(
      sanitizeGithubActivityTitleForDisplay("PR #11 merged: undefined", "pull_request"),
      "PR #11 merged: Untitled pull request",
    );
    assert.equal(
      sanitizeGithubActivityTitleForDisplay("PR #11 opened: null", "pull_request"),
      "PR #11 opened: Untitled pull request",
    );
    assert.equal(
      sanitizeGithubActivityTitleForDisplay("Issue #3 closed: undefined", "issue"),
      "Issue #3 closed: Untitled issue",
    );
    assert.equal(
      sanitizeGithubActivityTitleForDisplay("PR #7: undefined (open)", "pull_request"),
      "PR #7: Untitled pull request (open)",
    );
  });

  it("preserves legitimate titles that contain the word undefined", () => {
    const title = "PR #2 opened: Handle undefined values in parser";
    assert.equal(sanitizeGithubActivityTitleForDisplay(title, "pull_request"), title);
  });

  it("maps malformed stored PR activity to a readable display title without changing provenance", () => {
    const events = mapGithubActivityEvents([
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        linked_skill_id: SKILL,
        activity_type: "pull_request",
        activity_title: "PR #11 merged: undefined",
        repo_name: "org/app",
        occurred_at: "2026-07-02T09:12:00.000Z",
        synced_at: "2026-07-03T01:00:00.000Z",
        external_id: "pr:11:merged:1",
      },
    ], maps);
    assert.equal(events[0].title, "PR #11 merged: Untitled pull request");
    assert.equal(events[0].verificationClass, "source_reported");
    assert.equal(events[0].integrityStatus, "unchecked");
    assert.equal(events[0].eventId, "ghact:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
    assert.equal(events[0].metadata?.activityType, "pull_request");
  });
});

describe("getLearnerJourney", () => {
  it("returns only the authenticated learner identity and disclaimers", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore(),
      () => new Date("2026-11-03T00:00:00.000Z"),
    );
    assert.equal(data.learnerUserId, LEARNER);
    assert.equal(data.disclaimers.absenceOfEvidenceNotAbsenceOfSkill, true);
    assert.equal(data.disclaimers.sourceReportedIsNotSkillAssessed, true);
    assert.equal(data.events.length, 0);
    assert.equal(data.page.incomplete, false);
  });

  it("builds skill growth only from real scored completed attempts", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchMcqAttempts: async () => ok([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            skill_id: SKILL,
            competency_name: "React",
            title: "A",
            status: "completed",
            percentage: 45,
            passed: false,
            submitted_at: "2026-03-15T14:00:00.000Z",
            created_at: "2026-03-15T13:00:00.000Z",
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            skill_id: SKILL,
            competency_name: "React",
            title: "B",
            status: "completed",
            percentage: 90,
            passed: true,
            submitted_at: "2026-10-01T16:00:00.000Z",
            created_at: "2026-10-01T15:00:00.000Z",
          },
          {
            id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            skill_id: SKILL,
            status: "completed",
            percentage: null,
            submitted_at: "2026-05-01T16:00:00.000Z",
            created_at: "2026-05-01T15:00:00.000Z",
          },
        ]),
      }),
    );

    assert.equal(data.skillGrowth.length, 1);
    assert.deepEqual(
      data.skillGrowth[0].points.map((p) => p.scorePercent),
      [45, 90],
    );
  });

  it("sorts chronologically with stable eventId tie-break", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchGithubActivities: async () => ok([
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            activity_title: "B",
            occurred_at: "2026-07-02T09:12:00.000Z",
            synced_at: "2026-07-03T01:00:00.000Z",
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            activity_title: "A",
            occurred_at: "2026-07-02T09:12:00.000Z",
            synced_at: "2026-07-03T01:00:00.000Z",
          },
        ]),
        fetchSupportingRecords: async () => ok([
          {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            title: "Upload",
            occurred_at: "2026-08-01T00:00:00.000Z",
            created_at: "2026-08-01T00:00:00.000Z",
            skill_id: SKILL,
          },
        ]),
      }),
    );

    assert.deepEqual(
      data.events.map((e) => e.eventId),
      [
        "sup:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        "ghact:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "ghact:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
    );
  });

  it("paginates mixed sources without duplicates or skips", async () => {
    const store = emptyStore({
      fetchMcqAttempts: async () => ok([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          skill_id: SKILL,
          status: "completed",
          percentage: 40,
          submitted_at: "2026-01-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
          title: "M1",
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          skill_id: SKILL,
          status: "completed",
          percentage: 50,
          submitted_at: "2026-02-01T00:00:00.000Z",
          created_at: "2026-02-01T00:00:00.000Z",
          title: "M2",
        },
      ]),
      fetchGithubActivities: async () => ok([
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          activity_title: "G1",
          occurred_at: "2026-03-01T00:00:00.000Z",
          synced_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          activity_title: "G2",
          occurred_at: "2026-04-01T00:00:00.000Z",
          synced_at: "2026-04-01T00:00:00.000Z",
        },
      ]),
      fetchCredentials: async () => ok([
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          name: "Cred",
          skill_name: "React",
          valid_from: "2026-05-01T00:00:00.000Z",
          created_at: "2026-05-01T00:00:00.000Z",
        },
      ]),
    });

    const page1 = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({ limit: 2 }),
      store,
    );
    assert.equal(page1.events.length, 2);
    assert.ok(page1.page.nextCursor);

    const page2 = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({ limit: 2, cursor: page1.page.nextCursor! }),
      store,
    );
    assert.equal(page2.events.length, 2);
    assert.ok(page2.page.nextCursor);

    const page3 = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({ limit: 2, cursor: page2.page.nextCursor! }),
      store,
    );
    assert.equal(page3.events.length, 1);
    assert.equal(page3.page.nextCursor, null);

    const ids = [...page1.events, ...page2.events, ...page3.events].map((e) => e.eventId);
    assert.equal(ids.length, new Set(ids).size);
    assert.deepEqual(ids, [
      "cred:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee:issued",
      "ghact:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "ghact:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "mcq:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "mcq:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
  });

  it("rejects invalid cursors", async () => {
    await assert.rejects(
      () => getLearnerJourney(
        LEARNER,
        { ...learnerJourneyQuerySchema.parse({}), cursor: "%%%" },
        emptyStore(),
      ),
      (err: unknown) => err instanceof AppError && err.statusCode === 400,
    );
  });

  it("reports partial source failures without claiming empty history is complete", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchMcqAttempts: async () => fail("relation missing"),
        fetchGithubActivities: async () => ok([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            activity_title: "ok",
            occurred_at: "2026-07-02T09:12:00.000Z",
            synced_at: "2026-07-03T01:00:00.000Z",
          },
        ]),
      }),
    );
    assert.equal(data.page.incomplete, true);
    assert.deepEqual(data.page.truncatedSources, ["mcq_task_attempts"]);
    assert.equal(data.events.length, 1);
  });

  it("fails closed when every source is unavailable", async () => {
    await assert.rejects(
      () => getLearnerJourney(
        LEARNER,
        learnerJourneyQuerySchema.parse({}),
        emptyStore({
          fetchMcqAttempts: async () => fail(),
          fetchCredentials: async () => fail(),
          fetchSupportingRecords: async () => fail(),
          fetchGithubActivities: async () => fail(),
          fetchEvidenceRecords: async () => fail(),
          fetchLmsEvidenceRecords: async () => fail(),
          fetchSkillEvidenceLinks: async () => fail(),
          fetchDeclaredSkills: async () => fail(),
        }),
      ),
      (err: unknown) => err instanceof AppError && err.statusCode === 503,
    );
  });

  it("does not treat empty successful fetches as a negative skill claim", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore(),
    );
    assert.equal(data.events.length, 0);
    assert.equal(data.skillGrowth.length, 0);
    assert.equal(data.disclaimers.absenceOfEvidenceNotAbsenceOfSkill, true);
    assert.equal(data.page.incomplete, false);
  });

  it("filters by competencyId without leaking other learners' ids as input", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({ competencyId: SKILL }),
      emptyStore({
        fetchMcqAttempts: async () => ok([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            skill_id: SKILL,
            status: "completed",
            percentage: 70,
            submitted_at: "2026-03-15T14:00:00.000Z",
            created_at: "2026-03-15T14:00:00.000Z",
            title: "mine",
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            skill_id: OTHER,
            competency_name: "Other",
            status: "completed",
            percentage: 80,
            submitted_at: "2026-04-15T14:00:00.000Z",
            created_at: "2026-04-15T14:00:00.000Z",
            title: "other skill",
          },
        ]),
        fetchDeclaredSkills: async () => ok([
          { id: SKILL, name: "React" },
          { id: OTHER, name: "Other" },
        ]),
      }),
    );
    assert.equal(data.events.every((e) => e.competencyId === SKILL), true);
    assert.equal(data.skillGrowth.every((s) => s.competencyId === SKILL), true);
  });
});

describe("journey cursor helpers", () => {
  it("round-trips cursor payloads", () => {
    const encoded = Buffer.from(
      JSON.stringify({ t: "2026-01-01T00:00:00.000Z", i: "mcq:x" }),
      "utf8",
    ).toString("base64url");
    assert.deepEqual(decodeJourneyCursor(encoded), {
      t: "2026-01-01T00:00:00.000Z",
      i: "mcq:x",
    });
  });

  it("orders ranked events by epoch ms with deterministic eventId tie-break", () => {
    const a = {
      sortMs: Date.parse("2026-01-01T00:00:00.000Z"),
      sortTime: "2026-01-01T00:00:00.000Z",
      event: { eventId: "a" },
    };
    const b = {
      sortMs: Date.parse("2026-01-01T00:00:00.000Z"),
      sortTime: "2026-01-01T00:00:00.000Z",
      event: { eventId: "b" },
    };
    assert.ok(compareJourneyRank(a as never, b as never) < 0);
  });

  it("treats offset-equivalent ISO timestamps as the same instant", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchGithubActivities: async () => ok([
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            activity_title: "offset",
            occurred_at: "2026-07-02T10:12:00.000+01:00",
            synced_at: "2026-07-03T01:00:00.000Z",
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            activity_title: "zulu",
            occurred_at: "2026-07-02T09:12:00.000Z",
            synced_at: "2026-07-03T01:00:00.000Z",
          },
        ]),
      }),
    );
    assert.deepEqual(
      data.events.map((e) => e.eventId),
      [
        "ghact:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "ghact:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ],
    );
  });
});

describe("collectPagedRows source pagination", () => {
  it("fetches 999 rows in one page without capping", async () => {
    const rows = makeIds(999);
    const calls: Array<[number, number]> = [];
    const result = await collectPagedRows(async (from, to) => {
      calls.push([from, to]);
      return { rows: rangeSlice(rows, from, to) };
    }, { pageSize: JOURNEY_SOURCE_PAGE_SIZE, rowCap: 10_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 999);
    assert.equal(result.capped, false);
    assert.deepEqual(calls, [[0, 999]]);
  });

  it("fetches exactly 1,000 rows then confirms exhaustion with an empty/short next intent", async () => {
    const rows = makeIds(1000);
    const calls: Array<[number, number]> = [];
    const result = await collectPagedRows(async (from, to) => {
      calls.push([from, to]);
      return { rows: rangeSlice(rows, from, to) };
    }, { pageSize: 1000, rowCap: 10_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 1000);
    assert.equal(result.capped, false);
    assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  });

  it("fetches 1,001 rows across two pages without duplicates", async () => {
    const rows = makeIds(1001);
    const result = await collectPagedRows(async (from, to) => ({
      rows: rangeSlice(rows, from, to),
    }), { pageSize: 1000, rowCap: 10_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 1001);
    assert.equal(result.capped, false);
    const ids = result.rows.map((row) => String(row.id));
    assert.equal(ids.length, new Set(ids).size);
    assert.equal(ids[0], rows[0].id);
    assert.equal(ids[1000], rows[1000].id);
  });

  it("fetches 2,000+ rows across multiple pages", async () => {
    const rows = makeIds(2500);
    const calls: Array<[number, number]> = [];
    const result = await collectPagedRows(async (from, to) => {
      calls.push([from, to]);
      return { rows: rangeSlice(rows, from, to) };
    }, { pageSize: 1000, rowCap: 10_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 2500);
    assert.equal(result.capped, false);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("reports row_cap when the safety cap is hit", async () => {
    const rows = makeIds(150);
    const result = await collectPagedRows(async (from, to) => ({
      rows: rangeSlice(rows, from, to),
    }), { pageSize: 50, rowCap: 100 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 100);
    assert.equal(result.capped, true);
    assert.equal(result.incompleteReason, "row_cap");
  });

  it("keeps earlier pages and marks partial_page when a later page fails", async () => {
    const rows = makeIds(1500);
    const result = await collectPagedRows(async (from, to) => {
      if (from >= 1000) return { error: "timeout on page 2" };
      return { rows: rangeSlice(rows, from, to) };
    }, { pageSize: 1000, rowCap: 10_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.rows.length, 1000);
    assert.equal(result.capped, true);
    assert.equal(result.incompleteReason, "partial_page");
  });

  it("fails closed when the first page errors", async () => {
    const result = await collectPagedRows(async () => ({ error: "boom" }), {
      pageSize: 1000,
      rowCap: 10_000,
    });
    assert.equal(result.ok, false);
  });
});

describe("journey incomplete reporting for capped sources", () => {
  it("surfaces row_cap in truncatedSources and incomplete", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchGithubActivities: async () => ok(makeIds(5), {
          capped: true,
          incompleteReason: "row_cap",
        }),
      }),
    );
    assert.equal(data.page.incomplete, true);
    assert.deepEqual(data.page.truncatedSources, ["github_activities:row_cap"]);
    assert.equal(data.events.length, 5);
    assertNoSecrets(data);
  });

  it("surfaces partial_page truncation distinctly", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchMcqAttempts: async () => ok([], {
          capped: true,
          incompleteReason: "partial_page",
        }),
        fetchGithubActivities: async () => ok([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            activity_title: "ok",
            occurred_at: "2026-07-02T09:12:00.000Z",
            synced_at: "2026-07-03T01:00:00.000Z",
          },
        ]),
      }),
    );
    assert.equal(data.page.incomplete, true);
    assert.ok(data.page.truncatedSources.includes("mcq_task_attempts:partial_page"));
  });

  it("paginates a large sourced event set without duplicate or skipped ids", async () => {
    const activities = makeIds(120);
    const store = emptyStore({
      fetchGithubActivities: async () => ok(activities),
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const data = await getLearnerJourney(
        LEARNER,
        learnerJourneyQuerySchema.parse({ limit: 25, cursor }),
        store,
      );
      for (const event of data.events) seen.push(event.eventId);
      if (!data.page.nextCursor) break;
      cursor = data.page.nextCursor;
    }
    assert.equal(seen.length, 120);
    assert.equal(seen.length, new Set(seen).size);
  });
});

describe("LMS / Moodle evidence journey mapping", () => {
  const JAVA = "2ec5680a-8f24-4216-95e7-22035d36155c";
  const EVIDENCE = "c1bad133-78a2-4be3-b8d2-f11ea898bbe7";
  const LINK = "688b256e-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const maps = {
    byId: new Map([[JAVA, "Java"]]),
    byName: new Map([["java", JAVA]]),
  };

  const moodleRow = {
    id: EVIDENCE,
    user_id: LEARNER,
    mapped_skill_id: JAVA,
    suggested_skill_name: "Java",
    source: "LMS",
    repository_name: "Java Programming Fundamentals",
    repository_url: "https://sijil-lms.duckdns.org",
    description: "Java Programming Fundamentals",
    status: "verified",
    external_id: "moodle_assignment_1",
    metadata: {
      platform: "Moodle",
      course_name: "Java Course",
      assignment_name: "Java Programming Fundamentals",
      grade: 85,
      grade_max: 100,
      grade_percentage: 85,
      moodle_course_id: 2,
      moodle_assignment_id: 1,
    },
    sync_date: "2026-11-08T12:00:00.000Z",
    last_updated: "2026-11-08T12:00:00.000Z",
    created_at: "2026-11-08T11:00:00.000Z",
  };

  const linkRow = {
    id: LINK,
    user_id: LEARNER,
    skill_id: JAVA,
    evidence_record_id: EVIDENCE,
    linked_at: "2026-11-08T12:05:00.000Z",
  };

  it("maps Moodle Java evidence 85/100 as supporting_evidence_added source_reported", () => {
    const events = mapLmsEvidenceEvents([moodleRow], [linkRow], maps, LEARNER);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.eventType, "supporting_evidence_added");
    assert.equal(event.verificationClass, "source_reported");
    assert.equal(event.sourceSystem, "supporting");
    assert.equal(event.competencyId, JAVA);
    assert.equal(event.competencyName, "Java");
    assert.equal(event.eventId, "lms:moodle_assignment_1");
    assert.equal(event.provenanceKind, "derived_v1");
    assert.equal(event.metadata.grade, 85);
    assert.equal(event.metadata.gradeMax, 100);
    assert.equal(event.metadata.gradePercentage, 85);
    assert.equal(event.metadata.moodleCourseId, 2);
    assert.equal(event.metadata.moodleAssignmentId, 1);
    assert.equal(event.metadata.platform, "Moodle");
    assert.equal(event.metadata.courseName, "Java Course");
    assert.equal(event.metadata.assignmentName, "Java Programming Fundamentals");
    assert.equal(event.metadata.sourceReportedIsNotSkillAssessed, true);
    assert.equal("evidenceStatus" in event.metadata, false);
    assert.notEqual(event.verificationClass, "skill_assessed");
    assertNoSecrets(events);
  });

  it("excludes unlinked LMS evidence", () => {
    assert.equal(mapLmsEvidenceEvents([moodleRow], [], maps, LEARNER).length, 0);
  });

  it("excludes cross-user evidence and cross-user links", () => {
    const otherEvidence = { ...moodleRow, user_id: OTHER, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
    const otherLink = {
      ...linkRow,
      user_id: OTHER,
      evidence_record_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    };
    assert.equal(mapLmsEvidenceEvents([otherEvidence], [otherLink], maps, LEARNER).length, 0);
    assert.equal(
      mapLmsEvidenceEvents([moodleRow], [{ ...linkRow, user_id: OTHER }], maps, LEARNER).length,
      0,
    );
  });

  it("dedupes duplicate LMS rows with the same external_id", () => {
    const dup = { ...moodleRow, id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" };
    const links = [
      linkRow,
      { ...linkRow, id: "ffffffff-ffff-4fff-8fff-ffffffffffff", evidence_record_id: dup.id },
    ];
    const events = mapLmsEvidenceEvents([moodleRow, dup], links, maps, LEARNER);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventId, "lms:moodle_assignment_1");
  });

  it("includes LMS evidence with missing grade without inventing scores", () => {
    const row = {
      ...moodleRow,
      metadata: {
        platform: "Moodle",
        course_name: "Java Course",
        assignment_name: "Java Programming Fundamentals",
        grade: null,
        grade_max: null,
        moodle_course_id: 2,
        moodle_assignment_id: 1,
      },
    };
    const events = mapLmsEvidenceEvents([row], [linkRow], maps, LEARNER);
    assert.equal(events.length, 1);
    assert.equal(events[0].metadata.grade, null);
    assert.equal(events[0].metadata.gradeMax, null);
    assert.equal(events[0].verificationClass, "source_reported");
  });

  it("includes LMS evidence with sparse provenance metadata", () => {
    const row = {
      ...moodleRow,
      repository_url: null,
      metadata: {},
      repository_name: "Sparse assignment",
    };
    const events = mapLmsEvidenceEvents([row], [linkRow], maps, LEARNER);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Sparse assignment");
    assert.equal(events[0].metadata.platform, "Moodle");
    assert.equal(events[0].metadata.moodleCourseId, null);
    assert.equal(events[0].metadata.grade, null);
  });

  it("does not emit LMS events from GitHub evidence mapper", () => {
    assert.equal(mapGithubEvidenceEvents([moodleRow], maps).length, 0);
  });

  it("getLearnerJourney surfaces one Moodle item and preserves GitHub mapping", async () => {
    const ghEvidenceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchDeclaredSkills: async () => ok([
          { id: JAVA, name: "Java" },
          { id: SKILL, name: "React" },
        ]),
        fetchLmsEvidenceRecords: async (uid) => {
          assert.equal(uid, LEARNER);
          return ok([moodleRow]);
        },
        fetchSkillEvidenceLinks: async (uid) => {
          assert.equal(uid, LEARNER);
          return ok([linkRow]);
        },
        fetchEvidenceRecords: async (uid) => {
          assert.equal(uid, LEARNER);
          return ok([
            {
              id: ghEvidenceId,
              mapped_skill_id: SKILL,
              source: "GitHub",
              repository_name: "org/react-app",
              repository_url: "https://github.com/org/react-app",
              language: "TypeScript",
              commit_count: 12,
              sync_date: "2026-07-01T00:00:00.000Z",
              last_updated: "2026-07-01T00:00:00.000Z",
              created_at: "2026-07-01T00:00:00.000Z",
              status: "Mapped",
              external_id: "repo:1",
            },
          ]);
        },
      }),
      () => new Date("2026-11-09T00:00:00.000Z"),
    );

    const lms = data.events.filter((e) => e.eventId.startsWith("lms:"));
    const gh = data.events.filter((e) => e.eventId.startsWith("ghev:"));
    assert.equal(lms.length, 1);
    assert.equal(gh.length, 1);
    assert.equal(lms[0].metadata.grade, 85);
    assert.equal(lms[0].metadata.gradeMax, 100);
    assert.equal(lms[0].verificationClass, "source_reported");
    assert.equal(gh[0].eventType, "github_project_evidence_synced");
    assert.equal(gh[0].verificationClass, "source_reported");
    assert.equal("evidenceStatus" in lms[0].metadata, false);
    assertNoSecrets(data);
  });

  it("getLearnerJourney falls back to mapped_skill_id when skill link fetch fails", async () => {
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchDeclaredSkills: async () => ok([{ id: JAVA, name: "Java" }]),
        fetchLmsEvidenceRecords: async () => ok([moodleRow]),
        fetchSkillEvidenceLinks: async () => fail("links unavailable"),
      }),
    );
    const lms = data.events.filter((e) => e.eventId.startsWith("lms:"));
    assert.equal(lms.length, 1);
    assert.equal(lms[0].competencyId, JAVA);
    assert.equal(lms[0].verificationClass, "source_reported");
    assert.ok(data.page.truncatedSources.includes("skill_evidence_links"));
    assert.equal(data.page.incomplete, true);
  });

  it("getLearnerJourney excludes LMS rows when link fetch fails and mapped skill is foreign", async () => {
    const foreignMapped = {
      ...moodleRow,
      mapped_skill_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    };
    const data = await getLearnerJourney(
      LEARNER,
      learnerJourneyQuerySchema.parse({}),
      emptyStore({
        fetchDeclaredSkills: async () => ok([{ id: JAVA, name: "Java" }]),
        fetchLmsEvidenceRecords: async () => ok([foreignMapped]),
        fetchSkillEvidenceLinks: async () => fail("links unavailable"),
      }),
    );
    assert.equal(data.events.filter((e) => e.eventId.startsWith("lms:")).length, 0);
  });
});
