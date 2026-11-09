import type { ApplicationStatus } from "./transitions";

/** Statuses in which a company may read contacts (D23). */
export const CONTACTS_OPEN_STATUSES = [
  "shortlisted",
  "interview",
  "offer",
  "hired",
] as const satisfies readonly ApplicationStatus[];

export function contactsOpen(status: ApplicationStatus): boolean {
  return (CONTACTS_OPEN_STATUSES as readonly ApplicationStatus[]).includes(
    status,
  );
}

/**
 * `repeat` — already shortlisted with a reveal row: do not insert again.
 * `commit` — applied or viewed, no reveal yet.
 * `reject` — table 4.2 has no express-interest edge from this status.
 */
export function expressInterestPlan(
  status: ApplicationStatus,
  hasReveal: boolean,
): "repeat" | "commit" | "reject" {
  if (status === "shortlisted" && hasReveal) return "repeat";
  if ((status === "applied" || status === "viewed") && !hasReveal) {
    return "commit";
  }
  return "reject";
}
