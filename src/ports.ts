import type { CandidateDto } from "@intgetion/candidates";

export type MemberRole = "owner" | "admin" | "recruiter" | "member";

export type ContactsView = {
  email: string;
  phone: string | null;
  telegram: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  extra: Record<string, string>;
};

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  diff?: Record<string, unknown> | null;
  reason?: string | null;
  ip?: string | null;
};

export type ApplicationsPorts = {
  /** candidates: the candidate's own profile, or null without one. */
  getOwnCandidate: (candidateId: string) => Promise<CandidateDto | null>;
  /** contacts: the contact email, and the full contacts once revealed (D16). */
  findContactEmail: (candidateId: string) => Promise<string | null>;
  getOwnContacts: (candidateId: string) => Promise<ContactsView | null>;
  /** companies: a member's role, and member ids (optionally by role). */
  findMemberRole: (companyId: string, userId: string) => Promise<MemberRole | null>;
  listMemberUserIds: (companyId: string, roles?: readonly MemberRole[]) => Promise<string[]>;
  /** notifications: deliver a notice; failures are logged, never thrown. */
  notify: (type: string, recipientIds: readonly string[], payload: unknown) => Promise<void>;
  /** platform: append an audit row. */
  recordAudit: (entry: AuditEntry) => Promise<void>;
  /** platform: count one hit; throws a 429 HttpError when over the limit. */
  rateLimit: (bucket: string, key: string) => Promise<void>;
};

let ports: ApplicationsPorts | null = null;

export function setApplicationsPorts(next: ApplicationsPorts): void {
  ports = next;
}

export function applicationsPorts(): ApplicationsPorts {
  if (!ports) throw new Error("applications ports are not configured");
  return ports;
}
