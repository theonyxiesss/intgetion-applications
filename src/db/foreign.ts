import { pgTable, text, uuid } from "drizzle-orm/pg-core";

/*
 * Read-only views of tables other modules own: jobs (jobs), companies and
 * company_members (companies), candidate_profiles (candidates) and
 * user_profiles (users). Applications never writes them.
 */

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id").notNull(),
  title: text("title").notNull(),
  status: text("status")
    .$type<"draft" | "pending_moderation" | "published" | "paused" | "expired" | "closed" | "removed">()
    .notNull(),
  source: text("source").$type<"internal" | "imported">().notNull(),
  applicationUrl: text("application_url"),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export const companyMembers = pgTable("company_members", {
  companyId: uuid("company_id").notNull(),
  userId: uuid("user_id").notNull(),
  role: text("role").$type<"owner" | "admin" | "recruiter" | "member">().notNull(),
});

export const candidateProfiles = pgTable("candidate_profiles", {
  userId: uuid("user_id").primaryKey(),
});

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name"),
});
