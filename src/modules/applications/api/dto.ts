import type { ApplicationStatus } from "../service/transitions";

/** Fields a candidate may see on their own application. */
export type ApplicationDto = {
  id: string;
  jobId: string;
  jobTitle: string;
  status: ApplicationStatus;
  coverNote: string | null;
  reapplyCount: number;
  createdAt: string;
};

export const APPLICATION_DTO_KEYS = [
  "id",
  "jobId",
  "jobTitle",
  "status",
  "coverNote",
  "reapplyCount",
  "createdAt",
] as const;

/** Employer pipeline row. Still no contacts, login email, or auth uid (P3). */
export type EmployerApplicationDto = ApplicationDto & {
  candidateId: string;
  candidateName: string | null;
};

export const EMPLOYER_APPLICATION_DTO_KEYS = [
  ...APPLICATION_DTO_KEYS,
  "candidateId",
  "candidateName",
] as const;

export function toApplicationDto(row: {
  id: string;
  jobId: string;
  jobTitle: string;
  status: ApplicationStatus;
  coverNote: string | null;
  reapplyCount: number;
  createdAt: Date;
}): ApplicationDto {
  return {
    id: row.id,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    status: row.status,
    coverNote: row.coverNote,
    reapplyCount: row.reapplyCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toEmployerApplicationDto(row: {
  id: string;
  jobId: string;
  jobTitle: string;
  status: ApplicationStatus;
  coverNote: string | null;
  reapplyCount: number;
  createdAt: Date;
  candidateId: string;
  candidateName: string | null;
}): EmployerApplicationDto {
  return {
    ...toApplicationDto(row),
    candidateId: row.candidateId,
    candidateName: row.candidateName,
  };
}
