// SIJIL - shared mock data using W3C VC / DID / Open Badges 3.0 style fields
export type Role = "learner" | "institution" | "recruiter";

export const learnerProfile = {
  name: "Syed Qasim Ali Shah Kazmi",
  did: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSrnFVMoRjPwZsBHeZJF",
  email: "qasim.kazmi@students.cust.edu.pk",
  studentId: "FA22-BSE-114",
  program: "BS Software Engineering",
  batch: "Fall 2022",
  institution: "CUST",
  avatar: "QK",
};

// Decay threshold (days) — skill considered "decaying" when no related sync after this period
export const SKILL_DECAY_DAYS = 90;

export type DeclaredSkill = {
  id: string;
  name: string;
  domain: string;
  status: string;
  description: string;
  pipelineStage?: string;
  // ISO date — last time a related LMS/GitHub activity was synced for this skill
  lastRelatedActivityAt: string | null;
  // ISO date — last time credentials were synced/issued for this skill (controls one-attempt rule reset)
  lastCredentialSyncAt: string | null;
};

// Helper to produce ISO date offset by N days from today
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export const declaredSkills: DeclaredSkill[] = [
  { id: "sk-001", name: "React.js", domain: "Frontend Development", status: "Credential Issued", description: "Component design, hooks, state management", lastRelatedActivityAt: daysAgo(12), lastCredentialSyncAt: daysAgo(20) },
  { id: "sk-002", name: "Node.js & Express", domain: "Backend Development", status: "Evidence Linked", description: "REST APIs, middleware, authentication", lastRelatedActivityAt: daysAgo(40), lastCredentialSyncAt: null },
  { id: "sk-003", name: "PostgreSQL", domain: "Databases", status: "Evidence Linked", description: "Relational schemas, query optimization", lastRelatedActivityAt: daysAgo(120), lastCredentialSyncAt: daysAgo(150) },
  { id: "sk-004", name: "Data Analysis with Python", domain: "Data Science", status: "Credential Issued", description: "Pandas, NumPy, exploratory analysis", lastRelatedActivityAt: daysAgo(8), lastCredentialSyncAt: daysAgo(30) },
  { id: "sk-005", name: "Docker & Containers", domain: "DevOps", status: "Skill Claimed", description: "Containerization fundamentals", lastRelatedActivityAt: daysAgo(200), lastCredentialSyncAt: null },
];

export const integrations = [
  { id: "lms", name: "LMS", status: "Available", lastSync: null as string | null, records: 0 },
  { id: "github", name: "GitHub", status: "Available", lastSync: null as string | null, records: 0 },
  { id: "ext", name: "External Certificate Upload", status: "Available", lastSync: null as string | null, records: 0 },
];

export const importedActivity: { id: string; source: string; title: string; date: string; skill: string; status: string }[] = [];

// Per-skill practical task definitions. Duration varies by task type.
export type SkillTask = {
  skillId: string;
  title: string;
  type: "Coding" | "Debugging" | "MCQ + Short Answer" | "Design" | "Hands-on";
  durationMinutes: number;
  prompt: string;
  starterCode?: string;
  expectedDeliverable: string;
};

export const skillTaskBank: Record<string, SkillTask> = {
  "sk-001": {
    skillId: "sk-001",
    title: "Build a controlled form component in React",
    type: "Coding",
    durationMinutes: 25,
    prompt:
      "Implement a React component `LoginForm` with controlled inputs (email, password), client-side validation (email format, min 8-char password), and an `onSubmit` handler that calls a passed-in prop. No external form library.",
    starterCode: `import { useState } from "react";\n\nexport function LoginForm({ onSubmit }) {\n  // your code here\n}\n`,
    expectedDeliverable: "Single .jsx/.tsx file or pasted code in the editor.",
  },
  "sk-002": {
    skillId: "sk-002",
    title: "Fix a broken JWT verification middleware",
    type: "Debugging",
    durationMinutes: 30,
    prompt:
      "The provided Express middleware accepts expired tokens and does not check the issuer. Fix it so expired tokens are rejected (401) and the issuer claim must equal `did:web:issuer.sijil.edu.pk`.",
    starterCode: `function verifyJwt(req, res, next) {\n  const token = req.headers.authorization?.split(" ")[1];\n  // BUG: no expiry check, no issuer check\n  req.user = decode(token);\n  next();\n}\n`,
    expectedDeliverable: "Patched middleware file and a 1-paragraph note on what was fixed.",
  },
  "sk-003": {
    skillId: "sk-003",
    title: "Write a normalized schema + 2 queries",
    type: "Hands-on",
    durationMinutes: 20,
    prompt:
      "Design a 3-table PostgreSQL schema for Students, Courses, Enrollments. Then write: (1) query to list all courses for a student, (2) query to find courses with > 50 enrollments.",
    expectedDeliverable: "DDL + 2 SELECT statements.",
  },
  "sk-004": {
    skillId: "sk-004",
    title: "Exploratory data analysis on a CSV",
    type: "Coding",
    durationMinutes: 35,
    prompt:
      "Given a sales.csv (columns: date, region, product, units, revenue), compute monthly revenue per region and identify the top 3 products by total units. Use pandas.",
    starterCode: `import pandas as pd\n\ndf = pd.read_csv("sales.csv")\n# your analysis here\n`,
    expectedDeliverable: "Single .py file or notebook cell with your code and printed results.",
  },
  "sk-005": {
    skillId: "sk-005",
    title: "Write a multi-stage Dockerfile",
    type: "Hands-on",
    durationMinutes: 15,
    prompt:
      "Write a multi-stage Dockerfile for a Node.js app: build stage installs deps and runs `npm run build`; final stage uses node:20-alpine, copies only `dist/` and `package.json`, runs as non-root.",
    expectedDeliverable: "Dockerfile contents.",
  },
};

/** Resolve a practical task template for a declared skill (by name matching). */
export function getTaskForSkill(skill: DeclaredSkill): SkillTask {
  const n = skill.name.toLowerCase();
  if (n.includes("react")) return { ...skillTaskBank["sk-001"], skillId: skill.id };
  if (n.includes("node") || n.includes("express")) return { ...skillTaskBank["sk-002"], skillId: skill.id };
  if (n.includes("postgres") || n.includes("sql")) return { ...skillTaskBank["sk-003"], skillId: skill.id };
  if (n.includes("python") || n.includes("data")) return { ...skillTaskBank["sk-004"], skillId: skill.id };
  if (n.includes("docker") || n.includes("devops")) return { ...skillTaskBank["sk-005"], skillId: skill.id };
  return {
    skillId: skill.id,
    title: `Demonstrate ${skill.name}`,
    type: "Hands-on",
    durationMinutes: 20,
    prompt: `Complete a practical demonstration of your ${skill.name} skills. Submit your work below.`,
    expectedDeliverable: "Written response or code in the editor.",
  };
}

export const validationSummary = {
  skill: "React.js",
  result: "Passed",
  status: "Validated",
  evaluatedOn: "2026-04-20",
  sources: ["LMS", "GitHub", "Practical Submission"],
  reviewCount: 3,
  supportingRecords: 7,
  latestActivity: "2026-04-25",
  task: "Debug Broken Login Function",
  rows: [
    { name: "LMS Assignment: SPA with React Router", type: "LMS", date: "24 Apr 2026", role: "Primary evidence" },
    { name: "GitHub PR #22 — sijil-frontend", type: "GitHub", date: "22 Apr 2026", role: "Code contribution" },
    { name: "Practical Task #401 — Login Fix", type: "Practical Submission", date: "25 Apr 2026", role: "Hands-on artifact" },
    { name: "Mentor Review — Dr. S. Aslam", type: "Review", date: "20 Apr 2026", role: "Contextual review" },
  ],
};

export const credentials = [
  {
    id: "urn:uuid:3f2a8b7e-6a14-4e5d-90a1-cc4b6d2100a1",
    name: "Verified Full-Stack Development Credential",
    type: ["VerifiableCredential", "AchievementCredential"],
    issuer: "COMSATS University Islamabad",
    issuerDid: "did:web:issuer.sijil.edu.pk",
    holderDid: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSrnFVMoRjPwZsBHeZJF",
    validFrom: "2026-04-18T09:30:00Z",
    verification: "Verified",
    attestation: "Approved",
    supportingRecords: 7,
    skill: "React.js + Node.js",
  },
  {
    id: "urn:uuid:8d5c1a02-2f47-4b88-b12d-7a91e0ef4310",
    name: "Verified Data Analysis Credential",
    type: ["VerifiableCredential", "AchievementCredential"],
    issuer: "COMSATS University Islamabad",
    issuerDid: "did:web:issuer.sijil.edu.pk",
    holderDid: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSrnFVMoRjPwZsBHeZJF",
    validFrom: "2026-04-10T11:00:00Z",
    verification: "Verified",
    attestation: "Approved",
    supportingRecords: 5,
    skill: "Data Analysis with Python",
  },
  {
    id: "urn:uuid:b21f9e44-9c30-4a55-9f0d-31d2a7e1b990",
    name: "Open Badges 3.0 — Database Fundamentals",
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: "DataCamp",
    issuerDid: "did:web:issuer.datacamp.com",
    holderDid: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSrnFVMoRjPwZsBHeZJF",
    validFrom: "2026-03-22T15:12:00Z",
    verification: "Verified",
    attestation: "External",
    supportingRecords: 2,
    skill: "PostgreSQL",
  },
  {
    id: "urn:uuid:c47a1d22-5e88-4a11-bb39-7d8e4f2a1b01",
    name: "Verified JavaScript Proficiency Credential",
    type: ["VerifiableCredential", "AchievementCredential"],
    issuer: "CUST",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSrnFVMoRjPwZsBHeZJF",
    validFrom: "2026-04-05T10:00:00Z",
    verification: "Verified",
    attestation: "Approved",
    supportingRecords: 4,
    skill: "JavaScript",
  },
  {
    id: "urn:uuid:d58b2e33-6f99-4b22-cc4a-8e9f5a3b2c12",
    name: "Verified TypeScript Proficiency Credential",
    type: ["VerifiableCredential", "AchievementCredential"],
    issuer: "CUST",
    issuerDid: "did:web:issuer.cust.edu.pk",
    holderDid: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSrnFVMoRjPwZsBHeZJF",
    validFrom: "2026-04-12T10:00:00Z",
    verification: "Verified",
    attestation: "Approved",
    supportingRecords: 3,
    skill: "TypeScript",
  },
];

export const candidates = [
  {
    id: "cand-1",
    name: "Ayesha Khan",
    topSkill: "React.js",
    evidence: 12,
    reviews: 6,
    attestation: "Approved",
    institution: "COMSATS University Islamabad",
    credentialCount: 3,
  },
  {
    id: "cand-2",
    name: "Bilal Ahmed",
    topSkill: "Node.js & Express",
    evidence: 9,
    reviews: 4,
    attestation: "Approved",
    institution: "NUST",
    credentialCount: 2,
  },
  {
    id: "cand-3",
    name: "Hira Saleem",
    topSkill: "Data Analysis with Python",
    evidence: 14,
    reviews: 7,
    attestation: "Approved",
    institution: "LUMS",
    credentialCount: 4,
  },
  {
    id: "cand-4",
    name: "Usman Tariq",
    topSkill: "Cloud / DevOps",
    evidence: 6,
    reviews: 2,
    attestation: "Partial",
    institution: "FAST NUCES",
    credentialCount: 1,
  },
];

export type AttestationStatus =
  | "Pending Attestation"
  | "Attestation Approved"
  | "Attestation Rejected"
  | "Needs Clarification";

export type AttestationRecord = {
  id: string;
  student: string;
  studentId: string;
  program: string;
  batch: string;
  email: string;
  skillId: string;
  skill: string;
  validationResult: "Passed" | "Pending" | "Failed";
  validationStatus: "Validated" | "Under Review" | "Rejected";
  lastEvaluated: string;
  evidenceCount: number;
  reviewCount: number;
  readiness: "Ready for Attestation" | "Pending Evidence" | "Ready for Credential Issuance" | "Pending Institution Attestation";
  status: AttestationStatus;
  submittedAt: string;
  remarks?: string;
  source?: string;
  institutionName?: string;
  practicalScore?: number;
  practicalFeedback?: string;
  learnerUserId?: string;
  evidence: { id: string; name: string; type: "LMS" | "GitHub" | "Practical Submission" | "External Certificate" | "Review"; date: string; role: string; status: string }[];
  task: { title: string; relatedSkill: string; attemptId: string; submissionType: "Manual" | "Auto-Submitted"; submittedAt: string; reviewStatus: string; artifactSummary: string };
  reviews: { name: string; type: "Mentor" | "Teacher" | "Reviewer"; outcome: "Endorsed" | "Approved with notes" | "Needs work"; feedback: string }[];
};

export const attestationQueue: AttestationRecord[] = [
  {
    id: "att-1",
    student: "Ayesha Khan",
    studentId: "FA22-BSE-114",
    program: "BS Software Engineering",
    batch: "Fall 2022",
    email: "ayesha.khan@students.comsats.edu.pk",
    skillId: "sk-001",
    skill: "React.js + Node.js",
    validationResult: "Passed",
    validationStatus: "Validated",
    lastEvaluated: "2026-04-25",
    evidenceCount: 7,
    reviewCount: 3,
    readiness: "Ready for Attestation",
    status: "Pending Attestation",
    submittedAt: "2026-04-26",
    evidence: [
      { id: "ev-1", name: "LMS Assignment: SPA with React Router", type: "LMS", date: "24 Apr 2026", role: "Primary evidence", status: "Verified" },
      { id: "ev-2", name: "GitHub PR #22 — sijil-frontend", type: "GitHub", date: "22 Apr 2026", role: "Code contribution", status: "Verified" },
      { id: "ev-3", name: "Practical Task #401 — Login Fix", type: "Practical Submission", date: "25 Apr 2026", role: "Hands-on artifact", status: "Submitted" },
      { id: "ev-4", name: "External Cert — Meta Frontend", type: "External Certificate", date: "10 Mar 2026", role: "Supplementary", status: "Verified" },
      { id: "ev-5", name: "Mentor Review — Dr. S. Aslam", type: "Review", date: "20 Apr 2026", role: "Contextual review", status: "Endorsed" },
    ],
    task: {
      title: "Build a controlled form component in React",
      relatedSkill: "React.js",
      attemptId: "att-401",
      submissionType: "Manual",
      submittedAt: "25 Apr 2026 14:32",
      reviewStatus: "Reviewed",
      artifactSummary: "Single .tsx file with controlled inputs, validation, and onSubmit handler.",
    },
    reviews: [
      { name: "Dr. S. Aslam", type: "Mentor", outcome: "Endorsed", feedback: "Solid grasp of authentication flows and component design." },
      { name: "A. Raza", type: "Teacher", outcome: "Approved with notes", feedback: "Consistent submissions throughout the module." },
      { name: "M. Iqbal", type: "Reviewer", outcome: "Endorsed", feedback: "Code quality and structure meet expectations." },
    ],
  },
  {
    id: "att-2",
    student: "Bilal Ahmed",
    studentId: "FA22-BSE-091",
    program: "BS Software Engineering",
    batch: "Fall 2022",
    email: "bilal.ahmed@students.comsats.edu.pk",
    skillId: "sk-002",
    skill: "Node.js & Express",
    validationResult: "Passed",
    validationStatus: "Validated",
    lastEvaluated: "2026-04-22",
    evidenceCount: 5,
    reviewCount: 2,
    readiness: "Ready for Attestation",
    status: "Pending Attestation",
    submittedAt: "2026-04-23",
    evidence: [
      { id: "ev-1", name: "LMS Quiz: Express Middleware", type: "LMS", date: "18 Apr 2026", role: "Primary evidence", status: "Verified" },
      { id: "ev-2", name: "GitHub Repo — sijil-api", type: "GitHub", date: "20 Apr 2026", role: "Code contribution", status: "Verified" },
      { id: "ev-3", name: "Practical Task #402 — JWT Fix", type: "Practical Submission", date: "22 Apr 2026", role: "Hands-on artifact", status: "Submitted" },
    ],
    task: {
      title: "Fix a broken JWT verification middleware",
      relatedSkill: "Node.js & Express",
      attemptId: "att-402",
      submissionType: "Auto-Submitted",
      submittedAt: "22 Apr 2026 11:00",
      reviewStatus: "Reviewed",
      artifactSummary: "Patched middleware adding expiry + issuer checks; short note on fixes.",
    },
    reviews: [
      { name: "Dr. S. Aslam", type: "Mentor", outcome: "Approved with notes", feedback: "Good fix; could add unit test for issuer mismatch." },
      { name: "F. Khalid", type: "Reviewer", outcome: "Endorsed", feedback: "Submission meets the rubric." },
    ],
  },
  {
    id: "att-3",
    student: "Hira Saleem",
    studentId: "FA21-BSCS-204",
    program: "BS Computer Science",
    batch: "Fall 2021",
    email: "hira.saleem@students.lums.edu.pk",
    skillId: "sk-004",
    skill: "Data Analysis with Python",
    validationResult: "Passed",
    validationStatus: "Validated",
    lastEvaluated: "2026-04-19",
    evidenceCount: 9,
    reviewCount: 5,
    readiness: "Ready for Attestation",
    status: "Pending Attestation",
    submittedAt: "2026-04-20",
    evidence: [
      { id: "ev-1", name: "LMS Notebook: Pandas EDA", type: "LMS", date: "12 Apr 2026", role: "Primary evidence", status: "Verified" },
      { id: "ev-2", name: "GitHub Notebook — sales-analysis", type: "GitHub", date: "15 Apr 2026", role: "Code contribution", status: "Verified" },
      { id: "ev-3", name: "Practical Task #404 — Sales EDA", type: "Practical Submission", date: "19 Apr 2026", role: "Hands-on artifact", status: "Submitted" },
      { id: "ev-4", name: "External Cert — DataCamp Python", type: "External Certificate", date: "01 Mar 2026", role: "Supplementary", status: "Verified" },
    ],
    task: {
      title: "Exploratory data analysis on a CSV",
      relatedSkill: "Data Analysis with Python",
      attemptId: "att-404",
      submissionType: "Manual",
      submittedAt: "19 Apr 2026 16:10",
      reviewStatus: "Reviewed",
      artifactSummary: "Notebook with monthly revenue per region and top-3 products by units.",
    },
    reviews: [
      { name: "Dr. N. Mahmood", type: "Mentor", outcome: "Endorsed", feedback: "Clear, well-structured analysis." },
      { name: "S. Tariq", type: "Teacher", outcome: "Endorsed", feedback: "Exceeds rubric on insight quality." },
    ],
  },
  {
    id: "att-4",
    student: "Usman Tariq",
    studentId: "FA22-BSCS-188",
    program: "BS Computer Science",
    batch: "Fall 2022",
    email: "usman.tariq@students.nuces.edu.pk",
    skillId: "sk-005",
    skill: "Docker & Containers",
    validationResult: "Pending",
    validationStatus: "Under Review",
    lastEvaluated: "2026-04-15",
    evidenceCount: 3,
    reviewCount: 1,
    readiness: "Pending Evidence",
    status: "Needs Clarification",
    submittedAt: "2026-04-16",
    remarks: "Multi-stage Dockerfile missing non-root user step — please resubmit.",
    evidence: [
      { id: "ev-1", name: "Practical Task #405 — Dockerfile", type: "Practical Submission", date: "15 Apr 2026", role: "Hands-on artifact", status: "Submitted" },
      { id: "ev-2", name: "GitHub Repo — node-docker-demo", type: "GitHub", date: "14 Apr 2026", role: "Code contribution", status: "Verified" },
    ],
    task: {
      title: "Write a multi-stage Dockerfile",
      relatedSkill: "Docker & Containers",
      attemptId: "att-405",
      submissionType: "Manual",
      submittedAt: "15 Apr 2026 09:45",
      reviewStatus: "Needs Resubmission",
      artifactSummary: "Dockerfile present but missing non-root user directive.",
    },
    reviews: [
      { name: "K. Younis", type: "Reviewer", outcome: "Needs work", feedback: "Resubmit with non-root USER directive." },
    ],
  },
];

// In-memory mutable copy + simple subscription for institution actions
let _attestations: AttestationRecord[] = [...attestationQueue];
const _listeners = new Set<() => void>();
export function getAttestations(): AttestationRecord[] { return _attestations; }
export function subscribeAttestations(cb: () => void) { _listeners.add(cb); return () => { _listeners.delete(cb); }; }
export function updateAttestation(id: string, patch: Partial<AttestationRecord>) {
  _attestations = _attestations.map((a) => (a.id === id ? { ...a, ...patch } : a));
  _listeners.forEach((l) => l());
}

// ===== Skill velocity / decay helpers =====
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function isSkillDecaying(skill: DeclaredSkill, thresholdDays = SKILL_DECAY_DAYS): boolean {
  const d = daysSince(skill.lastRelatedActivityAt);
  if (d === null) return true;
  return d > thresholdDays;
}

export function getDecayingSkills(skills: DeclaredSkill[] = declaredSkills): DeclaredSkill[] {
  return skills.filter((s) => isSkillDecaying(s));
}

// ===== Practical attempt store (localStorage) =====
// One attempt per skill, locked until lastCredentialSyncAt changes.
export type AttemptRecord = {
  skillId: string;
  attemptId: string;
  startedAt: string;
  endsAt: string;
  durationMinutes: number;
  status: "in_progress" | "submitted" | "auto_submitted" | "expired_no_submission" | "passed";
  submission: string;
  credentialSyncSnapshot: string | null;
  passed?: boolean;
  score?: number;
  feedback?: string;
};

const ATTEMPT_KEY = "sijil.attempts.v1";

export function readAttempts(): Record<string, AttemptRecord> {
  try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || "{}"); } catch { return {}; }
}
export function writeAttempts(map: Record<string, AttemptRecord>) {
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(map));
}
export function getAttempt(skillId: string): AttemptRecord | null {
  return readAttempts()[skillId] ?? null;
}
export function saveAttempt(rec: AttemptRecord) {
  const all = readAttempts();
  all[rec.skillId] = rec;
  writeAttempts(all);
}

// Skill is "locked" (cannot start a new attempt) if an attempt exists AND
// the credential sync snapshot still matches the skill's current lastCredentialSyncAt.
export function isAttemptLocked(skill: DeclaredSkill): boolean {
  const a = getAttempt(skill.id);
  if (!a) return false;
  return (a.credentialSyncSnapshot ?? null) === (skill.lastCredentialSyncAt ?? null);
}

// ===== Candidate verifiable skills (recruiter-facing) =====
// Each candidate has a structured set of verifiable skills with evidence counts,
// attestation source and a linked credential id (when issued).
export type CandidateSkill = {
  skill: string;
  domain: string;
  evidence: number;          // count of supporting records
  reviews: number;           // count of mentor/teacher endorsements
  lmsRecords: number;
  githubRecords: number;
  practicalTask: "Submitted" | "Auto-Submitted" | "—";
  externalCert: "Available" | "—";
  attestation: "Approved" | "Partial" | "Pending";
  attestationSource: string; // institution name
  attestationDid: string;    // institution DID
  credentialId: string | null;
};

export const candidateSkills: Record<string, CandidateSkill[]> = {
  "cand-1": [
    { skill: "React.js", domain: "Frontend", evidence: 12, reviews: 6, lmsRecords: 4, githubRecords: 5, practicalTask: "Submitted", externalCert: "Available", attestation: "Approved", attestationSource: "COMSATS University Islamabad", attestationDid: "did:web:issuer.sijil.edu.pk", credentialId: "urn:uuid:3f2a8b7e-6a14-4e5d-90a1-cc4b6d2100a1" },
    { skill: "Node.js & Express", domain: "Backend", evidence: 8, reviews: 4, lmsRecords: 3, githubRecords: 4, practicalTask: "Auto-Submitted", externalCert: "—", attestation: "Approved", attestationSource: "COMSATS University Islamabad", attestationDid: "did:web:issuer.sijil.edu.pk", credentialId: "urn:uuid:3f2a8b7e-6a14-4e5d-90a1-cc4b6d2100a1" },
    { skill: "PostgreSQL", domain: "Databases", evidence: 5, reviews: 3, lmsRecords: 2, githubRecords: 1, practicalTask: "Submitted", externalCert: "Available", attestation: "Partial", attestationSource: "DataCamp", attestationDid: "did:web:issuer.datacamp.com", credentialId: "urn:uuid:b21f9e44-9c30-4a55-9f0d-31d2a7e1b990" },
  ],
  "cand-2": [
    { skill: "Node.js & Express", domain: "Backend", evidence: 9, reviews: 4, lmsRecords: 4, githubRecords: 4, practicalTask: "Auto-Submitted", externalCert: "—", attestation: "Approved", attestationSource: "NUST", attestationDid: "did:web:issuer.nust.edu.pk", credentialId: null },
    { skill: "React.js", domain: "Frontend", evidence: 5, reviews: 2, lmsRecords: 2, githubRecords: 2, practicalTask: "Submitted", externalCert: "—", attestation: "Approved", attestationSource: "NUST", attestationDid: "did:web:issuer.nust.edu.pk", credentialId: null },
  ],
  "cand-3": [
    { skill: "Data Analysis with Python", domain: "Data Science", evidence: 14, reviews: 7, lmsRecords: 5, githubRecords: 6, practicalTask: "Submitted", externalCert: "Available", attestation: "Approved", attestationSource: "LUMS", attestationDid: "did:web:issuer.lums.edu.pk", credentialId: "urn:uuid:8d5c1a02-2f47-4b88-b12d-7a91e0ef4310" },
    { skill: "PostgreSQL", domain: "Databases", evidence: 6, reviews: 2, lmsRecords: 2, githubRecords: 2, practicalTask: "Submitted", externalCert: "—", attestation: "Approved", attestationSource: "LUMS", attestationDid: "did:web:issuer.lums.edu.pk", credentialId: null },
  ],
  "cand-4": [
    { skill: "Docker & Containers", domain: "DevOps", evidence: 6, reviews: 2, lmsRecords: 2, githubRecords: 3, practicalTask: "Submitted", externalCert: "—", attestation: "Partial", attestationSource: "FAST NUCES", attestationDid: "did:web:issuer.nuces.edu.pk", credentialId: null },
  ],
};

// ===== Selective Disclosure presentations (shared store) =====
// When a learner shares a credential, a Verifiable Presentation token is created.
// Recruiter opens it via /recruiter/verify/:token and only sees disclosed fields.
export type DisclosedField = { id: string; label: string; value: string };
export type SharedPresentation = {
  token: string;
  credentialId: string;
  candidateId: string;          // candidate this presentation is bound to
  recipient: string;            // human label of verifier
  recipientDid: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  disclosedFields: DisclosedField[]; // only these are revealed
  hiddenFields: string[];            // labels of hidden fields (count visible to verifier)
  // Cryptographic proof metadata used by the recruiter-side integrity check
  proof: {
    type: string;
    cryptosuite: string;
    created: string;
    verificationMethod: string;
    proofValue: string;
  };
};

const PRES_KEY = "sijil.presentations.v1";

function readPresentations(): Record<string, SharedPresentation> {
  try { return JSON.parse(localStorage.getItem(PRES_KEY) || "{}"); } catch { return {}; }
}
function writePresentations(map: Record<string, SharedPresentation>) {
  localStorage.setItem(PRES_KEY, JSON.stringify(map));
}

export function getPresentation(token: string): SharedPresentation | null {
  // Check seeded demo presentations first (so recruiter screens always have data),
  // then fall back to learner-created ones in localStorage.
  return seededPresentations[token] ?? readPresentations()[token] ?? null;
}

export function savePresentation(p: SharedPresentation) {
  const all = readPresentations();
  all[p.token] = p;
  writePresentations(all);
}

export function revokePresentation(token: string) {
  const all = readPresentations();
  if (all[token]) { all[token].revoked = true; writePresentations(all); }
}

// Seeded presentations let the recruiter-side flow always have something to verify
// even before the learner actively shares a credential in this session.
export const seededPresentations: Record<string, SharedPresentation> = {
  "9f3a-21cc-4b88-7d11": {
    token: "9f3a-21cc-4b88-7d11",
    credentialId: "urn:uuid:3f2a8b7e-6a14-4e5d-90a1-cc4b6d2100a1",
    candidateId: "cand-1",
    recipient: "TalentBridge HR",
    recipientDid: "did:web:verifier.talentbridge.io",
    createdAt: "2026-04-26T10:00:00Z",
    expiresAt: "2026-07-26T10:00:00Z",
    revoked: false,
    disclosedFields: [
      { id: "credentialName", label: "Credential name", value: "Verified Full-Stack Development Credential" },
      { id: "skill", label: "Skill / achievement", value: "React.js + Node.js" },
      { id: "verification", label: "Verification status", value: "Verified" },
      { id: "issuer", label: "Issuer", value: "COMSATS University Islamabad" },
      { id: "validFrom", label: "Issue date (validFrom)", value: "2026-04-18" },
      { id: "evidenceSummary", label: "Selected supporting record summary", value: "4 records (LMS, GitHub, Practical, External)" },
    ],
    hiddenFields: ["Student ID", "Full evidence history", "Internal metadata", "Review metadata"],
    proof: {
      type: "DataIntegrityProof",
      cryptosuite: "eddsa-2022",
      created: "2026-04-18T09:30:14Z",
      verificationMethod: "did:web:issuer.sijil.edu.pk#key-1",
      proofValue: "0xA91F3C77B82D4E19D55C031F92B7E04AC8",
    },
  },
};

// ===== Peer Review module =====
// SIJIL peer review is a context-based trust signal — never an expert/beginner judgement.
// Reviews can ONLY be given by verified contributors of the same project.
export type ReviewerRelationship =
  | "Teammate"
  | "Mentor"
  | "Teacher"
  | "Class Fellow"
  | "Project Collaborator"
  | "Supervisor";

export type ContextSource = "GitHub" | "LMS" | "Spark" | "Manual Project";
export type ContextStatus = "Context Verified" | "Context Pending" | "Context Not Verified";
export type Recommendation = "Recommended" | "Needs More Evidence" | "Cannot Confirm";
export type TrustWeight = "High Trust" | "Medium Trust" | "Low Trust" | "Blocked";
export type ReviewOrigin = "SIJIL" | "SIJIL Form Review" | "GitHub PR" | "GitHub Issue" | "LMS Assignment" | "LMS Teacher" | "Spark Comment";
export type ContributorVerification = "Contributor Verified" | "Contributor Pending Verification" | "Not a Project Contributor";

// A project contributor pulled from a source platform (GitHub repo, LMS group, Spark project, manual team).
export type ProjectContributor = {
  id: string;            // stable id within the project
  name: string;
  handle?: string;       // e.g. github login
  email?: string;        // used for review invites
  role: ReviewerRelationship;
  avatarUrl?: string;
};

export type Project = {
  id: string;
  name: string;
  source: ContextSource;
  url?: string;
  evidenceLabel: string;     // what learner linked as evidence
  linkedSkills: string[];    // skill names this project supports
  contributors: ProjectContributor[];
};

export type PeerReview = {
  id: string;
  reviewerName: string;
  reviewerRole: ReviewerRelationship;
  source: ContextSource;
  origin: ReviewOrigin;
  skill: string;
  projectId?: string;
  projectName?: string;
  evidenceLabel: string;
  evidenceUrl?: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  recommendation?: Recommendation;
  date: string;              // ISO
  contextStatus: ContextStatus;
  contributorVerification?: ContributorVerification;
  trustWeight: TrustWeight;
  imported: boolean;
};

// Demo / sample projects (would come from GitHub / LMS / Spark APIs in production).
export const seedProjects: Project[] = [
  {
    id: "proj-gh-react",
    name: "ReactTest",
    source: "GitHub",
    url: "https://github.com/example/ReactTest",
    evidenceLabel: "GitHub repo: example/ReactTest",
    linkedSkills: ["JavaScript", "React.js"],
    contributors: [
      { id: "c-1", name: "octocat", handle: "octocat", email: "octocat@example.com", role: "Project Collaborator" },
      { id: "c-2", name: "M. Iqbal", handle: "miqbal", email: "miqbal@example.com", role: "Project Collaborator" },
      { id: "c-3", name: "Hira Saleem", handle: "hira-s", email: "hira.saleem@example.com", role: "Teammate" },
    ],
  },
  {
    id: "proj-gh-grocery",
    name: "grocery-subscription",
    source: "GitHub",
    url: "https://github.com/example/grocery-subscription",
    evidenceLabel: "GitHub repo: example/grocery-subscription",
    linkedSkills: ["JavaScript"],
    contributors: [
      { id: "c-4", name: "M. Iqbal", handle: "miqbal", email: "miqbal@example.com", role: "Project Collaborator" },
      { id: "c-5", name: "Bilal Ahmed", handle: "bilalahmed", email: "bilal@example.com", role: "Teammate" },
    ],
  },
  {
    id: "proj-lms-cse411",
    name: "CSE-411 Final Project",
    source: "LMS",
    evidenceLabel: "Moodle group project: SPA with React Router",
    linkedSkills: ["React.js"],
    contributors: [
      { id: "c-6", name: "Dr. S. Aslam", email: "s.aslam@cust.edu.pk", role: "Teacher" },
      { id: "c-7", name: "A. Raza", email: "a.raza@cust.edu.pk", role: "Supervisor" },
      { id: "c-8", name: "Bilal Ahmed", email: "bilal@example.com", role: "Teammate" },
    ],
  },
  {
    id: "proj-spark-wallet",
    name: "SIJIL Wallet UI",
    source: "Spark",
    evidenceLabel: "Spark project: SIJIL wallet UI",
    linkedSkills: ["TypeScript", "React.js"],
    contributors: [
      { id: "c-9", name: "Hira Saleem", email: "hira.saleem@example.com", role: "Teammate" },
      { id: "c-10", name: "M. Iqbal", email: "miqbal@example.com", role: "Project Collaborator" },
    ],
  },
];

const PROJECTS_KEY = "sijil.projects.v1";
export function getProjects(): Project[] {
  try { const raw = localStorage.getItem(PROJECTS_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return seedProjects;
}
export function saveProjects(list: Project[]) { localStorage.setItem(PROJECTS_KEY, JSON.stringify(list)); }

// Review invitations sent to verified contributors (simulates an email link).
export type InvitationStatus = "Pending" | "Sent" | "Completed" | "Expired";
export type ReviewInvitation = {
  id: string;
  projectId: string;
  projectName: string;
  source: ContextSource;
  contributorId: string;
  contributorName: string;
  contributorEmail?: string;
  contributorRole: ReviewerRelationship;
  learnerName: string;
  skill: string;
  status: InvitationStatus;
  sentAt: string;
  completedReviewId?: string;
  reviewLink?: string;
  token?: string;
  expiresAt?: string;
};

const INV_KEY = "sijil.reviewInvitations.v1";
export function getInvitations(): ReviewInvitation[] {
  try { const raw = localStorage.getItem(INV_KEY); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
  return [];
}
export function saveInvitations(list: ReviewInvitation[]) { localStorage.setItem(INV_KEY, JSON.stringify(list)); }
export function addInvitation(i: ReviewInvitation) { saveInvitations([i, ...getInvitations()]); }
export function findInvitation(id: string): ReviewInvitation | undefined {
  return getInvitations().find((x) => x.id === id);
}
export function updateInvitation(id: string, patch: Partial<ReviewInvitation>) {
  const list = getInvitations().map((x) => (x.id === id ? { ...x, ...patch } : x));
  saveInvitations(list);
}

// Verify a contributor truly belongs to the project (would call source platform API in production).
export function verifyContributor(projectId: string, contributorId: string): ContributorVerification {
  const proj = getProjects().find((p) => p.id === projectId);
  if (!proj) return "Not a Project Contributor";
  return proj.contributors.some((c) => c.id === contributorId)
    ? "Contributor Verified"
    : "Not a Project Contributor";
}

export function trustWeightFor(rel: ReviewerRelationship, contextVerified: boolean): TrustWeight {
  if (!contextVerified) return "Low Trust";
  switch (rel) {
    case "Teacher":
    case "Mentor":
    case "Teammate": return "High Trust";
    case "Project Collaborator": return "High Trust";
    case "Class Fellow": return "Medium Trust";
    default: return "Low Trust";
  }
}

// Demo / sample reviews — covers SIJIL native, GitHub PR, Moodle LMS feedback, Spark comments.
// Every imported review is automatically tied to a project + a verified contributor.
export const seedPeerReviews: PeerReview[] = [
  {
    id: "pr-001",
    reviewerName: "Dr. S. Aslam",
    reviewerRole: "Teacher",
    source: "LMS",
    origin: "LMS Teacher",
    skill: "React.js",
    projectId: "proj-lms-cse411",
    projectName: "CSE-411 Final Project",
    evidenceLabel: "Moodle: SPA with React Router (CSE-411)",
    evidenceUrl: "#",
    rating: 5,
    comment: "Strong understanding of component composition and routing. Clean state lifting in the cart flow.",
    recommendation: "Recommended",
    date: daysAgo(8),
    contextStatus: "Context Verified",
    contributorVerification: "Contributor Verified",
    trustWeight: "High Trust",
    imported: true,
  },
  {
    id: "pr-002",
    reviewerName: "A. Raza",
    reviewerRole: "Supervisor",
    source: "LMS",
    origin: "LMS Assignment",
    skill: "React.js",
    projectId: "proj-lms-cse411",
    projectName: "CSE-411 Final Project",
    evidenceLabel: "Moodle assignment feedback (CSE-411)",
    rating: 4,
    comment: "Consistent submissions; minor issues with async/await in the last task.",
    recommendation: "Recommended",
    date: daysAgo(20),
    contextStatus: "Context Verified",
    contributorVerification: "Contributor Verified",
    trustWeight: "High Trust",
    imported: true,
  },
  {
    id: "pr-003",
    reviewerName: "M. Iqbal",
    reviewerRole: "Project Collaborator",
    source: "GitHub",
    origin: "GitHub PR",
    skill: "JavaScript",
    projectId: "proj-gh-grocery",
    projectName: "grocery-subscription",
    evidenceLabel: "PR #14 — grocery-subscription",
    evidenceUrl: "https://github.com/example/grocery-subscription/pull/14",
    rating: 4,
    comment: "Reviewed checkout module. Logic is sound; suggested extracting the cart reducer.",
    recommendation: "Recommended",
    date: daysAgo(14),
    contextStatus: "Context Verified",
    contributorVerification: "Contributor Verified",
    trustWeight: "High Trust",
    imported: true,
  },
  {
    id: "pr-004",
    reviewerName: "Hira Saleem",
    reviewerRole: "Teammate",
    source: "Spark",
    origin: "Spark Comment",
    skill: "TypeScript",
    projectId: "proj-spark-wallet",
    projectName: "SIJIL Wallet UI",
    evidenceLabel: "Spark project: SIJIL wallet UI",
    rating: 5,
    comment: "Strong type design across the wallet store. Easy to extend.",
    recommendation: "Recommended",
    date: daysAgo(6),
    contextStatus: "Context Verified",
    contributorVerification: "Contributor Verified",
    trustWeight: "High Trust",
    imported: true,
  },
];

const PR_KEY = "sijil.peerReviews.v1";
function readPRs(): PeerReview[] {
  try {
    const raw = localStorage.getItem(PR_KEY);
    if (!raw) return seedPeerReviews;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : seedPeerReviews;
  } catch { return seedPeerReviews; }
}
function writePRs(list: PeerReview[]) {
  localStorage.setItem(PR_KEY, JSON.stringify(list));
}
export function getPeerReviews(): PeerReview[] { return readPRs(); }
export function addPeerReview(p: PeerReview) { writePRs([p, ...readPRs()]); }

export type TrustSignals = {
  total: number;
  verifiedContext: number;
  imported: number;
  sijil: number;
  highTrust: number;
  pending: number;
};

export function computeTrustSignals(list: PeerReview[] = readPRs()): TrustSignals {
  return {
    total: list.length,
    verifiedContext: list.filter((r) => r.contextStatus === "Context Verified").length,
    imported: list.filter((r) => r.imported).length,
    sijil: list.filter((r) => r.origin === "SIJIL").length,
    highTrust: list.filter((r) => r.trustWeight === "High Trust").length,
    pending: list.filter((r) => r.contextStatus === "Context Pending").length,
  };
}

// ===== Hybrid contributor-review automation =====
// Demo "existing platform reviews" — simulates what we'd pull from GitHub PR
// reviews, LMS feedback, Spark comments etc. Keyed by `${projectId}:${contributorId}`.
export type ExistingPlatformReview = {
  origin: ReviewOrigin;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  recommendation: Recommendation;
  url?: string;
};

export const existingPlatformReviews: Record<string, ExistingPlatformReview> = {
  "proj-gh-react:c-2": {
    origin: "GitHub PR",
    rating: 5,
    comment: "Reviewed PR #8 — clean component split and good prop typing.",
    recommendation: "Recommended",
    url: "https://github.com/example/ReactTest/pull/8",
  },
  "proj-gh-grocery:c-4": {
    origin: "GitHub PR",
    rating: 4,
    comment: "Reviewed PR #14 — checkout logic sound; suggested extracting reducer.",
    recommendation: "Recommended",
    url: "https://github.com/example/grocery-subscription/pull/14",
  },
  "proj-lms-cse411:c-6": {
    origin: "LMS Teacher",
    rating: 5,
    comment: "Strong understanding of component composition and routing.",
    recommendation: "Recommended",
  },
  "proj-lms-cse411:c-7": {
    origin: "LMS Assignment",
    rating: 4,
    comment: "Consistent submissions; minor async/await issues.",
    recommendation: "Recommended",
  },
  "proj-spark-wallet:c-9": {
    origin: "Spark Comment",
    rating: 5,
    comment: "Strong type design across the wallet store. Easy to extend.",
    recommendation: "Recommended",
  },
};

export type ContributorReviewStatus =
  | "Imported Review Found"
  | "Invite Sent"
  | "Review Pending"
  | "Review Received"
  | "Not a Project Contributor";

export type ContributorRow = {
  contributor: ProjectContributor;
  project: Project;
  status: ContributorReviewStatus;
  lastInviteAt: string | null;
  invitationId?: string;
  reviewId?: string;
};

function findExistingReviewForContributor(
  projectId: string, contributor: ProjectContributor, list: PeerReview[],
): PeerReview | undefined {
  return list.find((r) =>
    r.projectId === projectId &&
    (r.reviewerName === contributor.name || r.reviewerName === contributor.handle),
  );
}

export function getContributorRows(project: Project): ContributorRow[] {
  const reviews = getPeerReviews();
  const invs = getInvitations();
  return project.contributors.map((c) => {
    const review = findExistingReviewForContributor(project.id, c, reviews);
    const inv = invs.find((i) => i.projectId === project.id && i.contributorId === c.id);
    const verified = project.contributors.some((x) => x.id === c.id);
    if (!verified) {
      return { contributor: c, project, status: "Not a Project Contributor", lastInviteAt: null };
    }
    if (review) {
      return {
        contributor: c, project,
        status: review.imported ? "Imported Review Found" : "Review Received",
        lastInviteAt: inv?.sentAt ?? null,
        invitationId: inv?.id, reviewId: review.id,
      };
    }
    if (inv) {
      return {
        contributor: c, project,
        status: inv.status === "Completed" ? "Review Received" : inv.status === "Sent" ? "Invite Sent" : "Review Pending",
        lastInviteAt: inv.sentAt, invitationId: inv.id,
      };
    }
    return { contributor: c, project, status: "Review Pending", lastInviteAt: null };
  });
}

// Auto-detect & process contributors for a project:
// - Import existing platform reviews
// - Auto-send invites to contributors with no review yet
// Avoids duplicates. Returns counts.
export function autoProcessProjectContributors(
  project: Project, learnerName: string, skill: string,
): { imported: number; invited: number; skipped: number } {
  const reviews = getPeerReviews();
  const invs = getInvitations();
  let imported = 0, invited = 0, skipped = 0;

  for (const c of project.contributors) {
    const existingReview = findExistingReviewForContributor(project.id, c, reviews);
    if (existingReview) { skipped++; continue; }

    const platformReview = existingPlatformReviews[`${project.id}:${c.id}`];
    if (platformReview) {
      const rec: PeerReview = {
        id: `pr-auto-${project.id}-${c.id}-${Date.now()}`,
        reviewerName: c.handle ?? c.name,
        reviewerRole: c.role,
        source: project.source,
        origin: platformReview.origin,
        skill,
        projectId: project.id,
        projectName: project.name,
        evidenceLabel: `${project.evidenceLabel} — auto-imported ${platformReview.origin}`,
        evidenceUrl: platformReview.url ?? project.url,
        rating: platformReview.rating,
        comment: platformReview.comment,
        recommendation: platformReview.recommendation,
        date: new Date().toISOString(),
        contextStatus: "Context Verified",
        contributorVerification: "Contributor Verified",
        trustWeight: trustWeightFor(c.role, true),
        imported: true,
      };
      addPeerReview(rec);
      imported++;
      continue;
    }

    const dup = invs.find((i) => i.projectId === project.id && i.contributorId === c.id);
    if (dup) { skipped++; continue; }

    const inv: ReviewInvitation = {
      id: `inv-auto-${project.id}-${c.id}-${Date.now()}`,
      projectId: project.id,
      projectName: project.name,
      source: project.source,
      contributorId: c.id,
      contributorName: c.name,
      contributorEmail: c.email,
      contributorRole: c.role,
      learnerName,
      skill,
      status: "Sent",
      sentAt: new Date().toISOString(),
    };
    addInvitation(inv);
    invited++;
  }
  return { imported, invited, skipped };
}

export function resendInvitation(id: string) {
  updateInvitation(id, { status: "Sent", sentAt: new Date().toISOString() });
}
