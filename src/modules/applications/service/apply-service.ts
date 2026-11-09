import { getDb } from "@intgetion/kit";
import { applicationStatusHistory, applications } from "../../../db";
import { errorCodes, forbidden, HttpError, notFound } from "@intgetion/kit";
import type { CandidateDto, CompletenessInput } from "@intgetion/candidates";
import { applicationsPorts } from "../../../ports";
import { toApplicationDto, type ApplicationDto } from "../api/dto";
import {
  findApplication,
  findJobForApply,
  listForCandidate,
  listPairHistory,
} from "../repo/applications";
import {
  checkApplyEligibility,
  checkApplyTarget,
  checkReapply,
} from "./eligibility";
import { transitionApplication } from "./transition-application";
import type { ApplicationStatus } from "./transitions";

const RECRUITER = new Set(["owner", "admin", "recruiter"]);

function snapshot(
  profile: CandidateDto,
  contactEmail: string | null,
): CompletenessInput {
  return {
    fullName: profile.fullName,
    headline: profile.headline,
    desiredTitles: profile.desiredTitles,
    timezone: profile.timezone,
    workHoursStart: profile.workHoursStart,
    workHoursEnd: profile.workHoursEnd,
    workDays: profile.workDays,
    skillCount: profile.skills.length,
    experienceYears: profile.experienceYears,
    languageCount: profile.languages.length,
    salaryMin: profile.salaryMin ? BigInt(profile.salaryMin.amountMinor) : null,
    salaryCurrency: profile.salaryMin?.currency ?? null,
    salaryPeriod: profile.salaryMin?.period ?? null,
    salaryBasis: profile.salaryMin?.basis ?? null,
    workFormats: profile.workFormats,
    employmentTypes: profile.employmentTypes,
    contactEmail,
  };
}

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current && typeof current === "object";
    depth += 1
  ) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export async function applyToJob(
  candidateId: string,
  input: { jobId: string; coverNote: string | null },
): Promise<ApplicationDto> {
  const job = await findJobForApply(input.jobId);
  if (!job) throw notFound();
  checkApplyTarget({
    origin: job.source,
    externalUrl: job.applicationUrl,
    status: job.status,
  });

  const profile = await applicationsPorts().getOwnCandidate(candidateId);
  if (!profile) throw notFound();
  const email = await applicationsPorts().findContactEmail(candidateId);
  checkApplyEligibility(snapshot(profile, email));

  const history = await listPairHistory(job.id, candidateId);
  checkReapply(history);
  const reapplyCount = history.some((row) => row.status === "withdrawn")
    ? 1
    : 0;

  await applicationsPorts().rateLimit("apply", candidateId);
  const coverNote =
    input.coverNote && input.coverNote.length > 0 ? input.coverNote : null;

  try {
    const created = await getDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(applications)
        .values({
          jobId: job.id,
          candidateId,
          coverNote,
          status: "applied",
          reapplyCount,
        })
        .returning();
      if (!row) throw notFound();
      await tx.insert(applicationStatusHistory).values({
        applicationId: row.id,
        fromStatus: null,
        toStatus: "applied",
        actorId: candidateId,
      });
      return row;
    });
    const members = await applicationsPorts().listMemberUserIds(job.companyId, [
      "owner",
      "admin",
      "recruiter",
    ]);
    await applicationsPorts().notify("application.created", members, {
      applicationId: created.id,
      jobId: job.id,
      jobTitle: job.title,
      candidateId,
    });
    return toApplicationDto({ ...created, jobTitle: job.title });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (postgresCode(error) === "23505") {
      throw new HttpError(
        409,
        errorCodes.alreadyApplied,
        "You already applied to this job",
      );
    }
    throw error;
  }
}

export async function listOwnApplications(
  candidateId: string,
): Promise<ApplicationDto[]> {
  const rows = await listForCandidate(candidateId);
  return rows.map((row) => toApplicationDto(row));
}

/** Page row for `/applications` (DESIGN 9.8): company sits beside the job. */
export async function listOwnApplicationCards(candidateId: string) {
  const rows = await listForCandidate(candidateId);
  return rows.map((row) => ({
    ...toApplicationDto(row),
    companyName: row.companyName,
    companySlug: row.companySlug,
  }));
}

export async function getOwnApplication(
  candidateId: string,
  applicationId: string,
): Promise<ApplicationDto> {
  const row = await findApplication(applicationId);
  if (!row || row.candidateId !== candidateId) throw notFound();
  return toApplicationDto(row);
}

export async function withdrawOwnApplication(
  candidateId: string,
  applicationId: string,
): Promise<ApplicationDto> {
  const row = await findApplication(applicationId);
  if (!row || row.candidateId !== candidateId) throw notFound();
  const updated = await transitionApplication({
    applicationId: row.id,
    to: "withdrawn",
    actor: "candidate",
    via: "withdraw",
    actorId: candidateId,
  });
  const members = await applicationsPorts().listMemberUserIds(row.companyId);
  await applicationsPorts().notify("application.withdrawn", members, {
    applicationId: row.id,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    candidateId,
  });
  return toApplicationDto({ ...updated, jobTitle: row.jobTitle });
}

export async function patchApplicationStatus(
  userId: string,
  applicationId: string,
  to: ApplicationStatus,
): Promise<ApplicationDto> {
  const row = await findApplication(applicationId);
  if (!row) throw notFound();

  let actor: "candidate" | "employer";
  if (row.candidateId === userId) {
    actor = "candidate";
  } else {
    const role = await applicationsPorts().findMemberRole(row.companyId, userId);
    if (!role) throw notFound();
    if (!RECRUITER.has(role)) throw forbidden();
    actor = "employer";
  }

  const updated = await transitionApplication({
    applicationId: row.id,
    to,
    actor,
    via: "patch",
    actorId: userId,
  });
  if (actor === "employer") {
    await applicationsPorts().notify("application.status_changed", [row.candidateId], {
      applicationId: row.id,
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      status: updated.status,
    });
  }
  return toApplicationDto({ ...updated, jobTitle: row.jobTitle });
}
