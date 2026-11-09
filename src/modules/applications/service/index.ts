/**
 * Public service surface.
 * Other modules may import only this file, never this module's repo.
 * 5A's `transitionApplication()` must call `checkTransition` and must not
 * duplicate the table (D2, D79).
 */
export {
  APPLY_MIN_COMPLETENESS,
  APPLY_REQUIRED_PARTS,
  JOB_ORIGINS,
  JOB_STATUSES,
  checkApplyEligibility,
  checkApplyTarget,
  checkReapply,
} from "./eligibility";
export type {
  ApplyEligibilityDetails,
  ApplyTarget,
  JobOrigin,
  JobStatus,
  PriorApplication,
} from "./eligibility";
export {
  APPLICATION_STATUSES,
  EXPRESS_INTEREST_REQUIRED,
  TERMINAL_APPLICATION_STATUSES,
  TRANSITIONS,
  checkTransition,
  employerPatchTargets,
} from "./transitions";
export type {
  ApplicationStatus,
  TransitionActor,
  TransitionEdge,
  TransitionInput,
  TransitionVia,
} from "./transitions";
export {
  applyToJob,
  getOwnApplication,
  listOwnApplicationCards,
  listOwnApplications,
  patchApplicationStatus,
  withdrawOwnApplication,
} from "./apply-service";
export {
  createApplicationInput,
  listApplicationsQuery,
  patchApplicationStatusInput,
} from "../schemas";
export type {
  CreateApplicationInput,
  PatchApplicationStatusInput,
} from "../schemas";
export {
  APPLICATION_DTO_KEYS,
  EMPLOYER_APPLICATION_DTO_KEYS,
  toApplicationDto,
  toEmployerApplicationDto,
} from "../api/dto";
export type { ApplicationDto, EmployerApplicationDto } from "../api/dto";
export {
  employerCanSeeCandidate,
  employerMayOpen,
  employerNotification,
  listEmployerApplications,
  needsAutoView,
  openApplication,
} from "./employer-service";
export {
  countByStatusForJob,
  listActiveCandidateIds,
} from "../repo/applications";
export { transitionApplication } from "./transition-application";
export type { TransitionCommand } from "./transition-application";
export {
  CONTACTS_OPEN_STATUSES,
  contactsOpen,
  expressInterestPlan,
} from "./reveal-rules";
export {
  expressInterest,
  listAccessibleContacts,
  readApplicationContacts,
  revealNotification,
} from "./reveal-service";
export type { ExpressInterestHooks } from "./reveal-service";
export { setApplicationsPorts } from "../../../ports";
export type { ApplicationsPorts, ContactsView, MemberRole, AuditEntry } from "../../../ports";
