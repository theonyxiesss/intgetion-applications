import { getDb } from "@intgetion/kit";
import { applicationsPorts, type ContactsView as ContactsDto } from "../../../ports";
import { errorCodes, forbidden, HttpError, notFound } from "@intgetion/kit";
import {
  toEmployerApplicationDto,
  type EmployerApplicationDto,
} from "../api/dto";
import {
  findApplication,
  findReveal,
  insertReveal,
  listOpenContactApplications,
  lockApplication,
} from "../repo/applications";
import { contactsOpen, expressInterestPlan } from "./reveal-rules";
import { transitionApplication } from "./transition-application";
import { checkTransition } from "./transitions";

const RECRUITER = new Set(["owner", "admin", "recruiter"]);

export type ExpressInterestHooks = {
  /** Test seam. Throws inside the transaction, after the status write. */
  beforeReveal?: () => Promise<void>;
};

/**
 * 9A sends `mutual_interest.revealed` to the candidate and to recruiter+
 * members after a new reveal. 5C only names the event; a repeat sends nothing.
 */
export function revealNotification(
  created: boolean,
): "mutual_interest.revealed" | null {
  return created ? "mutual_interest.revealed" : null;
}

export async function expressInterest(
  userId: string,
  applicationId: string,
  hooks?: ExpressInterestHooks,
): Promise<EmployerApplicationDto> {
  const preview = await findApplication(applicationId);
  if (!preview) throw notFound();
  const role = await applicationsPorts().findMemberRole(preview.companyId, userId);
  if (!role) throw notFound();
  if (!RECRUITER.has(role)) throw forbidden();

  const outcome = await getDb().transaction(async (tx) => {
    const locked = await lockApplication(applicationId, tx);
    if (!locked) throw notFound();
    const reveal = await findReveal(applicationId, tx);
    const plan = expressInterestPlan(locked.status, Boolean(reveal));
    if (plan === "reject") {
      checkTransition({
        from: locked.status,
        to: "shortlisted",
        actor: "employer",
        via: "express_interest",
      });
      throw new HttpError(
        409,
        errorCodes.invalidTransition,
        "This status change is not allowed",
      );
    }
    if (plan === "commit") {
      await transitionApplication(
        {
          applicationId,
          to: "shortlisted",
          actor: "employer",
          via: "express_interest",
          actorId: userId,
        },
        tx,
      );
      if (hooks?.beforeReveal) await hooks.beforeReveal();
      await insertReveal(tx, { applicationId, revealedBy: userId });
    }
    const row = await findApplication(applicationId, tx);
    if (!row) throw notFound();
    return {
      application: toEmployerApplicationDto(row),
      created: plan === "commit",
    };
  });

  if (revealNotification(outcome.created)) {
    const members = await applicationsPorts().listMemberUserIds(preview.companyId);
    await applicationsPorts().notify(
      "mutual_interest.revealed",
      [preview.candidateId, ...members],
      {
        applicationId: preview.id,
        jobId: preview.jobId,
        jobTitle: preview.jobTitle,
      },
    );
  }
  return outcome.application;
}

export async function listAccessibleContacts(userId: string) {
  return listOpenContactApplications(userId);
}

/**
 * Company member, open status, and a reveal row. Otherwise 404 (D16, D23).
 * A successful read is audited after the lookup. `recordAudit` uses its own
 * connection, so it runs only once the read has succeeded.
 */
export async function readApplicationContacts(
  userId: string,
  applicationId: string,
  ip?: string | null,
): Promise<ContactsDto> {
  const row = await findApplication(applicationId);
  if (!row) throw notFound();
  const role = await applicationsPorts().findMemberRole(row.companyId, userId);
  if (!role) throw notFound();
  if (!contactsOpen(row.status)) throw notFound();
  const reveal = await findReveal(applicationId);
  if (!reveal) throw notFound();
  const contacts = await applicationsPorts().getOwnContacts(row.candidateId);
  if (!contacts) throw notFound();
  await applicationsPorts().recordAudit({
    actorId: userId,
    action: "contacts.read",
    entityType: "application",
    entityId: row.id,
    diff: { status: row.status },
    ip,
  });
  return contacts;
}
