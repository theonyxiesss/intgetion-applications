import { publicHttpUrl } from "@intgetion/companies";
import { profileCompleteness, type CompletenessInput, type CompletenessPart } from "@intgetion/candidates";
import { errorCodes, HttpError } from "@intgetion/kit";
import type { ApplicationStatus } from "./transitions";

/** D15. The completeness formula only yields multiples of 5; 59 still fails. */
export const APPLY_MIN_COMPLETENESS = 60;

/** The three fields D15 requires in addition to the score. */
export const APPLY_REQUIRED_PARTS = [
  "timezone",
  "skills",
  "contact_email",
] as const satisfies readonly CompletenessPart[];

const REQUIRED = new Set<CompletenessPart>(APPLY_REQUIRED_PARTS);

export type ApplyEligibilityDetails = {
  completeness: number;
  missing: CompletenessPart[];
};

/**
 * D15. The score and `missing` come from `profileCompleteness`; this function
 * does not keep its own weights.
 */
export function checkApplyEligibility(
  profileSnapshot: CompletenessInput,
): void {
  const { score, missing } =
    profileCompleteness(profileSnapshot);
  const requiredMissing = missing.some((part) => REQUIRED.has(part));
  if (score >= APPLY_MIN_COMPLETENESS && !requiredMissing) return;

  throw new HttpError(
    422,
    errorCodes.profileIncomplete,
    "Complete the profile before applying",
    { completeness: score, missing } satisfies ApplyEligibilityDetails,
  );
}

export const JOB_ORIGINS = ["internal", "imported"] as const;
export type JobOrigin = (typeof JOB_ORIGINS)[number];

export const JOB_STATUSES = [
  "draft",
  "pending_moderation",
  "published",
  "paused",
  "expired",
  "closed",
  "removed",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type ApplyTarget = {
  origin: JobOrigin;
  externalUrl: string | null;
  status: JobStatus;
};

/**
 * D8. An imported job never creates an application row.
 * Import is checked before publication (D78).
 */
export function checkApplyTarget(target: ApplyTarget): void {
  if (target.origin === "imported") {
    throw new HttpError(
      422,
      errorCodes.externalApply,
      "Apply on the external site",
      { externalUrl: publicHttpUrl(target.externalUrl) },
    );
  }
  if (target.status !== "published") {
    throw new HttpError(
      422,
      errorCodes.jobNotPublished,
      "This job is not open for applications",
    );
  }
}

export type PriorApplication = {
  status: ApplicationStatus;
  reapplyCount: number;
};

/**
 * D27. `existingForJobAndCandidate` is the history of this pair.
 * See D76 for how the single reapply and the second withdrawal interact.
 */
export function checkReapply(
  existingForJobAndCandidate: readonly PriorApplication[],
): void {
  const active = existingForJobAndCandidate.some(
    (row) => row.status !== "withdrawn",
  );
  if (active) {
    throw new HttpError(
      409,
      errorCodes.alreadyApplied,
      "You already applied to this job",
    );
  }

  const withdrawn = existingForJobAndCandidate.filter(
    (row) => row.status === "withdrawn",
  );
  const repeatAlreadyUsed = withdrawn.some((row) => row.reapplyCount >= 1);
  if (withdrawn.length >= 2 || repeatAlreadyUsed) {
    throw new HttpError(
      409,
      errorCodes.reapplyLimit,
      "You cannot apply to this job again",
    );
  }
}
