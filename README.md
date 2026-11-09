# INTGETION Applications Service

Applications for INTGETION JOB LIST: applying to a job (eligibility, one application per job, re-apply after withdrawal), the status pipeline with its history, the employer's list and open view, expressing interest, and the contact reveal behind it (D16, D23).

Runs as its own HTTP process with its own tables and migration. Developed separately; the platform is not wired to it yet.

## Run

```bash
npm install
cp .env.example .env   # fill in values
npm run migrate        # application tables only
npm run dev            # http://localhost:4090
```

Checks: `npm run typecheck`, `npm test`. Integration tests run only when `DATABASE_URL` is set.

## How callers talk to it

Every request except `GET /health` needs `Authorization: Bearer <APPLICATIONS_SERVICE_TOKEN>`. Routes acting for a person need `x-user-id` (checked before the body and the id); the contacts read passes `x-client-ip` to the audit. Answers are `cache-control: no-store`. Errors are `{ "error": { "code", "message", "details?" } }`.

## API

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/health` | — | `{ ok }` |
| POST | `/v1/applications` | candidate | `{ jobId, coverNote? }` → 201; 422 below the profile bar, 409 if already applied |
| GET | `/v1/me/applications` | candidate | own applications |
| POST | `/v1/applications/:id/withdraw` | candidate | withdraw |
| GET | `/v1/jobs/:jobId/applications?cursor&limit&status` | company member | applications to a job |
| GET | `/v1/applications/:id` | company member / candidate | open (marks viewed for the company) |
| PATCH | `/v1/applications/:id/status` | recruiter | `{ to }` along the allowed transitions |
| POST | `/v1/applications/:id/express-interest` | company member | shortlists and opens contacts |
| GET | `/v1/applications/:id/contacts` | company member | contacts once revealed; each read audited |
| GET | `/v1/me/accessible-contacts` | company member | applications with open contacts |
| POST | `/v1/employer-can-see` | candidates | `{ candidateId }` → `{ allowed }` for the viewer in `x-user-id` |
| GET | `/v1/jobs/:jobId/active-candidates` | jobs | `{ candidateIds }` told when a job closes |
| GET | `/v1/jobs/:jobId/status-counts` | module | counts by status |

Candidates (`employer-can-see`) and jobs (`active-candidates`) ask the platform for these today; at integration they point here.

## What it calls

| Service | Calls |
|---|---|
| candidates | `GET /v1/me/candidate` as the candidate (profile for the eligibility check) |
| contacts | `GET /v1/contacts/:id/email`, `GET /v1/contacts/:id` |
| companies | `GET /v1/companies/:id/members/:userId/role`, `GET /v1/companies/:id/members` |
| notifications | `POST /v1/notify` (`application.created`, `viewed`, `status_changed`, `withdrawn`, reveal notices; failures logged, never block) |
| platform (`PLATFORM_URL`, `PLATFORM_CALLBACK_TOKEN`) | `POST /api/internal/applications/audit`, `POST /api/internal/applications/rate-limit` (`{ bucket, key }` → 2xx or 429) |

## Data

Tables owned by applications: `applications`, `application_status_history`, `application_reveals`, type `application_status`. One migration, `migrations/0008_applications.sql`, generated from a schema dump of a database migrated to the latest platform state; a dump of the result matches the platform exactly. On a live database it changes nothing; checked against a non-superuser owner with rows present.

Reads (never writes): `jobs`, `companies`, `company_members`, `candidate_profiles`, `user_profiles`. CI builds them from the real migrations of companies, jobs and candidates in `test/sql/pre/` plus platform helpers.

The cross-module tests that saved a full candidate profile, contacts and the skill seed in one process stay in the platform; this repo tests the module with its own ports against Postgres.

## Packages inside

- `.` — service functions, rules, schemas, DTOs, `setApplicationsPorts`
- `./ports` — `setApplicationsPorts()`
- `./server` — `createApp()` HTTP handler

Depends on `@intgetion/kit` (v0.3.1), `@intgetion/candidates` (v0.1.0, completeness rules and types) and `@intgetion/companies` (v0.1.1, URL rule) by git tag.

`./db` — table definitions (Drizzle) for read-only use by other modules.
