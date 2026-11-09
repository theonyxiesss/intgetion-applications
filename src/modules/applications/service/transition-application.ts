import { eq } from "drizzle-orm";
import { getDb } from "@intgetion/kit";
import { applicationStatusHistory, applications } from "../../../db";
import { notFound } from "@intgetion/kit";
import { isUuid, type AppTx } from "../repo/applications";
import {
  checkTransition,
  type ApplicationStatus,
  type TransitionActor,
  type TransitionVia,
} from "./transitions";

const DECIDED: ReadonlySet<ApplicationStatus> = new Set([
  "hired",
  "rejected",
  "withdrawn",
]);

export type TransitionCommand = {
  applicationId: string;
  to: ApplicationStatus;
  actor: TransitionActor;
  via: TransitionVia;
  actorId: string;
};

async function writeTransition(tx: AppTx, command: TransitionCommand) {
  if (!isUuid(command.applicationId)) throw notFound();
  const [row] = await tx
    .select()
    .from(applications)
    .where(eq(applications.id, command.applicationId))
    .for("update");
  if (!row) throw notFound();

  checkTransition({
    from: row.status,
    to: command.to,
    actor: command.actor,
    via: command.via,
  });

  const now = new Date();
  const [updated] = await tx
    .update(applications)
    .set({
      status: command.to,
      updatedAt: now,
      viewedAt: command.to === "viewed" ? now : row.viewedAt,
      decidedAt: DECIDED.has(command.to) ? now : row.decidedAt,
    })
    .where(eq(applications.id, row.id))
    .returning();
  if (!updated) throw notFound();

  await tx.insert(applicationStatusHistory).values({
    applicationId: row.id,
    fromStatus: row.status,
    toStatus: command.to,
    actorId: command.actorId,
  });
  return updated;
}

/**
 * The only UPDATE of `applications.status` (D2, D105).
 * Callers must not write that column themselves.
 */
export async function transitionApplication(
  command: TransitionCommand,
  tx?: AppTx,
) {
  if (tx) return writeTransition(tx, command);
  return getDb().transaction((next) => writeTransition(next, command));
}
