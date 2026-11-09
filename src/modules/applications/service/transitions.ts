import { errorCodes, HttpError } from "@intgetion/kit";

/** Section 4.2. Terminal statuses have no outgoing edge. */
export const APPLICATION_STATUSES = [
  "applied",
  "viewed",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const TERMINAL_APPLICATION_STATUSES = [
  "hired",
  "rejected",
  "withdrawn",
] as const satisfies readonly ApplicationStatus[];

export type TransitionActor = "employer" | "candidate";

/** How the caller is trying to move the application (D75). */
export type TransitionVia =
  "patch" | "express_interest" | "auto_view" | "withdraw";

export type TransitionEdge = {
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: TransitionActor;
  via: TransitionVia;
};

/**
 * The only allowed edges (section 4.2). E is employer, C is candidate.
 * `viewed` is the automatic open, `shortlisted` is express-interest only.
 */
export const TRANSITIONS: readonly TransitionEdge[] = [
  { from: "applied", to: "viewed", actor: "employer", via: "auto_view" },
  {
    from: "applied",
    to: "shortlisted",
    actor: "employer",
    via: "express_interest",
  },
  { from: "applied", to: "rejected", actor: "employer", via: "patch" },
  { from: "applied", to: "withdrawn", actor: "candidate", via: "withdraw" },
  {
    from: "viewed",
    to: "shortlisted",
    actor: "employer",
    via: "express_interest",
  },
  { from: "viewed", to: "rejected", actor: "employer", via: "patch" },
  { from: "viewed", to: "withdrawn", actor: "candidate", via: "withdraw" },
  { from: "shortlisted", to: "interview", actor: "employer", via: "patch" },
  { from: "shortlisted", to: "rejected", actor: "employer", via: "patch" },
  { from: "shortlisted", to: "withdrawn", actor: "candidate", via: "withdraw" },
  { from: "interview", to: "offer", actor: "employer", via: "patch" },
  { from: "interview", to: "rejected", actor: "employer", via: "patch" },
  { from: "interview", to: "withdrawn", actor: "candidate", via: "withdraw" },
  { from: "offer", to: "hired", actor: "employer", via: "patch" },
  { from: "offer", to: "rejected", actor: "employer", via: "patch" },
  { from: "offer", to: "withdrawn", actor: "candidate", via: "withdraw" },
];

/** Not in the section 6 catalogue; recorded in D75. `src/lib/http` stays unchanged. */
export const EXPRESS_INTEREST_REQUIRED = "EXPRESS_INTEREST_REQUIRED";

export type TransitionInput = {
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: TransitionActor;
  via: TransitionVia;
};

function invalidTransition(): HttpError {
  return new HttpError(
    409,
    errorCodes.invalidTransition,
    "This status change is not allowed",
  );
}

/**
 * Section 4.2. Returns nothing when the edge is allowed.
 * Wrong actor or a missing edge is 409, not 403 (D75).
 */
export function checkTransition(input: TransitionInput): void {
  const sameEdge = TRANSITIONS.filter(
    (edge) => edge.from === input.from && edge.to === input.to,
  );
  if (sameEdge.length === 0) throw invalidTransition();

  const forActor = sameEdge.filter((edge) => edge.actor === input.actor);
  if (forActor.length === 0) throw invalidTransition();

  const exact = forActor.find((edge) => edge.via === input.via);
  if (exact) return;

  if (input.to === "shortlisted") {
    throw new HttpError(
      422,
      EXPRESS_INTEREST_REQUIRED,
      "Shortlisted is only reached through express interest",
    );
  }
  throw invalidTransition();
}

/** Employer buttons. Reads `TRANSITIONS`; it does not add edges (D117). */
export function employerPatchTargets(
  from: ApplicationStatus,
): ApplicationStatus[] {
  return TRANSITIONS.filter(
    (edge) =>
      edge.from === from && edge.actor === "employer" && edge.via === "patch",
  ).map((edge) => edge.to);
}
