import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CandidateDto } from "@intgetion/candidates";
import { getDb } from "@intgetion/kit";
import {
  applyToJob,
  employerCanSeeCandidate,
  expressInterest,
  listEmployerApplications,
  listOwnApplications,
  openApplication,
  patchApplicationStatus,
  readApplicationContacts,
  setApplicationsPorts,
  withdrawOwnApplication,
  type AuditEntry,
  type MemberRole,
} from "./service";

const owner = randomUUID();
const outsider = randomUUID();
const candidate = randomUUID();
const thin = randomUUID();
const companyId = randomUUID();
const jobId = randomUUID();
const closedJobId = randomUUID();

const notices: { type: string; recipientIds: readonly string[] }[] = [];
const audits: AuditEntry[] = [];

const fullProfile = (id: string): CandidateDto =>
  ({
    id,
    fullName: "Anna Kowalska",
    headline: "Senior React engineer",
    desiredTitles: ["Frontend engineer"],
    country: "PL",
    city: "Kraków",
    timezone: "Europe/Warsaw",
    workHoursStart: "09:00",
    workHoursEnd: "17:00",
    workDays: [1, 2, 3, 4, 5],
    workFormats: ["remote"],
    employmentTypes: ["full_time"],
    experienceYears: 7,
    availabilityDate: null,
    salaryMin: { amountMinor: "500000", currency: "EUR", period: "month", basis: "gross" },
    salaryMax: null,
    minOverlapHours: 3,
    summary: null,
    isHidden: false,
    jobSearchStatus: "active",
    completeness: 100,
    missing: [],
    skills: [1, 2, 3, 4, 5].map((n) => ({ skillId: `s${n}`, slug: `s${n}`, level: "expert" })),
    experience: [],
    languages: [{ lang: "en", level: "C1" }],
    preferences: { categories: [], sectors: [], seniority: null, companySizes: [], notes: null },
    unrecognizedSkills: [],
  }) as unknown as CandidateDto;

setApplicationsPorts({
  getOwnCandidate: async (id) =>
    id === candidate ? fullProfile(id) : id === thin ? ({ ...fullProfile(id), skills: [], headline: null, desiredTitles: [] } as CandidateDto) : null,
  findContactEmail: async (id) => (id === candidate ? "anna@example.com" : null),
  getOwnContacts: async (id) =>
    id === candidate
      ? { email: "anna@example.com", phone: "+48123456789", telegram: "anna_dev", linkedinUrl: null, websiteUrl: null, extra: {} }
      : null,
  findMemberRole: async (company, user) => {
    const rows = await getDb().execute<{ role: MemberRole }>(
      sql`select role from public.company_members where company_id = ${company} and user_id = ${user}`,
    );
    return rows[0]?.role ?? null;
  },
  listMemberUserIds: async (company, roles) => {
    const rows = await getDb().execute<{ user_id: string; role: MemberRole }>(
      sql`select user_id, role from public.company_members where company_id = ${company}`,
    );
    return rows.filter((row) => !roles || roles.includes(row.role)).map((row) => row.user_id);
  },
  notify: async (type, recipientIds) => {
    notices.push({ type, recipientIds });
  },
  recordAudit: async (entry) => {
    audits.push(entry);
  },
  rateLimit: async () => {},
});

const description =
  "We are hiring a senior engineer to build the candidate side of the platform with care and tests.";

beforeAll(async () => {
  const db = getDb();
  await db.execute(sql`
    insert into public.users (id, auth_uid) values
      (${owner}, ${randomUUID()}), (${outsider}, ${randomUUID()}),
      (${candidate}, ${randomUUID()}), (${thin}, ${randomUUID()})
  `);
  await db.execute(sql`insert into public.candidate_profiles (user_id) values (${candidate}), (${thin})`);
  await db.execute(sql`
    insert into public.companies (id, name, slug, status) values (${companyId}, 'Apply Co', ${`apply-${companyId.slice(0, 8)}`}, 'verified')
  `);
  await db.execute(sql`insert into public.company_members (company_id, user_id, role) values (${companyId}, ${owner}, 'owner')`);
  await db.execute(sql`
    insert into public.jobs (id, company_id, created_by, title, description, category, employment_type, work_format, application_method, status, published_at)
    values (${jobId}, ${companyId}, ${owner}, 'React engineer', ${description}, 'engineering', 'full_time', 'remote', 'internal', 'published', now()),
           (${closedJobId}, ${companyId}, ${owner}, 'Closed role', ${description}, 'engineering', 'full_time', 'remote', 'internal', 'closed', now())
  `);
});

afterAll(async () => {
  const db = getDb();
  await db.execute(sql`delete from public.companies where id = ${companyId}`);
  await db.execute(sql`delete from public.users where id in (${owner}, ${outsider}, ${candidate}, ${thin})`);
});

beforeEach(() => {
  notices.length = 0;
});

let applicationId = "";

describe("applications in Postgres", () => {
  it("refuses a thin profile and a closed job", async () => {
    await expect(applyToJob(thin, { jobId, coverNote: null })).rejects.toMatchObject({ status: 422 });
    await expect(applyToJob(candidate, { jobId: closedJobId, coverNote: null })).rejects.toBeTruthy();
  });

  it("applies once, tells the recruiters and refuses a second application", async () => {
    const created = await applyToJob(candidate, { jobId, coverNote: "Hello" });
    applicationId = created.id;
    expect(created.status).toBe("applied");
    expect(notices).toContainEqual({ type: "application.created", recipientIds: [owner] });
    await expect(applyToJob(candidate, { jobId, coverNote: null })).rejects.toMatchObject({ status: 409 });
    expect((await listOwnApplications(candidate)).map((a) => a.id)).toContain(applicationId);
  });

  it("shows the application to the company only and marks it viewed on open", async () => {
    const page = await listEmployerApplications(owner, { jobId });
    expect(page.items.map((item) => item.id)).toContain(applicationId);
    await expect(listEmployerApplications(outsider, { jobId })).rejects.toMatchObject({ status: 404 });

    const opened = await openApplication(owner, applicationId);
    expect(opened.status).toBe("viewed");
    expect(notices.map((n) => n.type)).toContain("application.viewed");
    expect(await employerCanSeeCandidate(owner, candidate)).toBe(true);
    expect(await employerCanSeeCandidate(outsider, candidate)).toBe(false);
  });

  it("keeps contacts closed until the employer expresses interest, then audits each read", async () => {
    await expect(readApplicationContacts(owner, applicationId)).rejects.toMatchObject({ status: 404 });
    const interested = await expressInterest(owner, applicationId);
    expect(interested.status).toBe("shortlisted");
    const contacts = await readApplicationContacts(owner, applicationId, "203.0.113.5");
    expect(contacts.email).toBe("anna@example.com");
    expect(audits).toContainEqual(expect.objectContaining({ action: "contacts.read", entityId: applicationId }));
    await expect(readApplicationContacts(outsider, applicationId)).rejects.toMatchObject({ status: 404 });
  });

  it("follows the status rules and lets the candidate withdraw", async () => {
    await expect(patchApplicationStatus(outsider, applicationId, "interview")).rejects.toMatchObject({ status: 404 });
    const interview = await patchApplicationStatus(owner, applicationId, "interview");
    expect(interview.status).toBe("interview");
    expect(notices).toContainEqual({ type: "application.status_changed", recipientIds: [candidate] });
    const withdrawn = await withdrawOwnApplication(candidate, applicationId);
    expect(withdrawn.status).toBe("withdrawn");
    const history = await getDb().execute<{ to_status: string }>(
      sql`select to_status from public.application_status_history where application_id = ${applicationId} order by created_at, id`,
    );
    expect(history.map((row) => row.to_status)).toEqual(
      expect.arrayContaining(["applied", "viewed", "shortlisted", "interview", "withdrawn"]),
    );
  });
});
