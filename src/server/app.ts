import { z, ZodError } from "zod";
import {
  HttpError,
  httpErrorResponse,
  notFound,
  reportError,
  validationError,
} from "@intgetion/kit";
import * as apps from "../modules/applications/service";
import { isUuid, requireCaller, requireServiceToken } from "./auth";

export type AppConfig = { serviceToken: string };

const MAX_JSON = 16 * 1024;
const idsBody = z.object({ candidateId: z.string().uuid() }).strict();

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_JSON) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Body too large");
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw validationError({ body: "invalid json" });
  }
  return schema.parse(json);
}

function idParam(value: string | undefined): string {
  if (!value || !isUuid(value)) throw notFound();
  return value;
}

type Route = {
  method: string;
  pattern: RegExp;
  run: (request: Request, params: string[], url: URL) => Promise<unknown>;
};

const routes: Route[] = [
  {
    method: "POST",
    pattern: /^\/v1\/applications$/,
    run: async (request) => {
      const { userId } = requireCaller(request);
      const input = await parseBody(request, apps.createApplicationInput);
      const created = await apps.applyToJob(userId, {
        jobId: input.jobId,
        coverNote: input.coverNote ?? null,
      });
      return Response.json({ application: created }, { status: 201 });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/me\/applications$/,
    run: async (request) => ({
      applications: await apps.listOwnApplications(requireCaller(request).userId),
    }),
  },
  {
    method: "GET",
    pattern: /^\/v1\/jobs\/([^/]+)\/applications$/,
    run: async (request, [jobId], url) => {
      const { userId } = requireCaller(request);
      const query = apps.listApplicationsQuery.parse({
        jobId: idParam(jobId),
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      });
      return apps.listEmployerApplications(userId, {
        jobId: query.jobId!,
        cursor: query.cursor,
        limit: query.limit,
        status: query.status,
      });
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/applications\/([^/]+)$/,
    run: async (request, [id]) => ({
      application: await apps.openApplication(requireCaller(request).userId, idParam(id)),
    }),
  },
  {
    method: "PATCH",
    pattern: /^\/v1\/applications\/([^/]+)\/status$/,
    run: async (request, [id]) => {
      const { userId } = requireCaller(request);
      const { to } = await parseBody(request, apps.patchApplicationStatusInput);
      return { application: await apps.patchApplicationStatus(userId, idParam(id), to) };
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/applications\/([^/]+)\/withdraw$/,
    run: async (request, [id]) => ({
      application: await apps.withdrawOwnApplication(requireCaller(request).userId, idParam(id)),
    }),
  },
  {
    method: "POST",
    pattern: /^\/v1\/applications\/([^/]+)\/express-interest$/,
    run: async (request, [id]) => ({
      application: await apps.expressInterest(requireCaller(request).userId, idParam(id)),
    }),
  },
  {
    method: "GET",
    pattern: /^\/v1\/applications\/([^/]+)\/contacts$/,
    run: async (request, [id]) => {
      const { userId } = requireCaller(request);
      return {
        contacts: await apps.readApplicationContacts(userId, idParam(id), request.headers.get("x-client-ip")),
      };
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/me\/accessible-contacts$/,
    run: async (request) => ({
      applications: await apps.listAccessibleContacts(requireCaller(request).userId),
    }),
  },
  {
    method: "POST",
    pattern: /^\/v1\/employer-can-see$/,
    run: async (request) => {
      const { userId } = requireCaller(request);
      const { candidateId } = await parseBody(request, idsBody);
      return { allowed: await apps.employerCanSeeCandidate(userId, candidateId) };
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/jobs\/([^/]+)\/active-candidates$/,
    run: async (_request, [jobId]) => ({
      candidateIds: await apps.listActiveCandidateIds(idParam(jobId)),
    }),
  },
  {
    method: "GET",
    pattern: /^\/v1\/jobs\/([^/]+)\/status-counts$/,
    run: async (_request, [jobId]) => ({
      counts: await apps.countByStatusForJob(idParam(jobId)),
    }),
  },
];

export function toResponse(error: unknown): Response {
  if (error instanceof HttpError) return httpErrorResponse(error);
  if (error instanceof ZodError) {
    return httpErrorResponse(validationError(error.issues));
  }
  reportError(error, "applications-service");
  return Response.json(
    { error: { code: "INTERNAL", message: "Internal error" } },
    { status: 500 },
  );
}

export function createApp(config: AppConfig) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true });
      }
      requireServiceToken(request, config.serviceToken);
      for (const route of routes) {
        if (route.method !== request.method) continue;
        const match = route.pattern.exec(url.pathname);
        if (!match) continue;
        const result = await route.run(request, match.slice(1), url);
        if (result instanceof Response) {
          result.headers.set("cache-control", "no-store");
          return result;
        }
        return Response.json(result, { headers: { "cache-control": "no-store" } });
      }
      throw notFound();
    } catch (error) {
      return toResponse(error);
    }
  };
}
