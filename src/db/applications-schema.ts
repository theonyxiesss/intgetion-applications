import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { applicationStatus } from "./enums";

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull(),
    candidateId: uuid("candidate_id")
      .notNull(),
    coverNote: text("cover_note"),
    status: applicationStatus("status").notNull().default("applied"),
    reapplyCount: smallint("reapply_count").notNull().default(0),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("applications_active_pair_idx")
      .on(table.jobId, table.candidateId)
      .where(sql`${table.status} <> 'withdrawn'`),
    index("applications_candidate_created_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("applications_job_status_created_idx").on(
      table.jobId,
      table.status,
      table.createdAt,
    ),
    check(
      "applications_cover_note_check",
      sql`${table.coverNote} is null or char_length(${table.coverNote}) between 1 and 2000`,
    ),
    check(
      "applications_reapply_count_check",
      sql`${table.reapplyCount} between 0 and 1`,
    ),
  ],
);

/** One row per application, written only inside express-interest (D3). */
export const applicationReveals = pgTable(
  "application_reveals",
  {
    applicationId: uuid("application_id")
      .primaryKey()
      .references(() => applications.id, { onDelete: "cascade" }),
    revealedBy: uuid("revealed_by")
      .notNull(),
    revealedAt: timestamp("revealed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    via: text("via").notNull(),
  },
  (table) => [
    check("application_reveals_via_check", sql`${table.via} = 'shortlisted'`),
  ],
);

export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatus("from_status"),
    toStatus: applicationStatus("to_status").notNull(),
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("application_status_history_application_idx").on(
      table.applicationId,
      table.createdAt,
    ),
  ],
);
