import { beforeEach, describe, expect, it, vi } from "vitest";

const APP = "11111111-1111-4111-8111-111111111111";
const JOB = "44444444-4444-4444-8444-444444444444";
const USER = "22222222-2222-4222-8222-222222222222";

const service = vi.hoisted(() => ({
  applyToJob: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", status: "applied" })),
  patchApplicationStatus: vi.fn(async () => ({ status: "interview" })),
  readApplicationContacts: vi.fn(async () => ({ email: "a@example.com" })),
  employerCanSeeCandidate: vi.fn(async () => true),
  listActiveCandidateIds: vi.fn(async () => ["c1"]),
}));

vi.mock("../modules/applications/service", async (orig) => ({
  ...(await orig<typeof import("../modules/applications/service")>()),
  ...service,
}));

const { createApp } = await import("./app");
const TOKEN = "test-applications-token";
const handle = createApp({ serviceToken: TOKEN });

function call(path: string, init: RequestInit & { user?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${TOKEN}`);
  if (init.user) headers.set("x-user-id", init.user);
  return handle(new Request(`http://applications${path}`, { ...init, headers }));
}

beforeEach(() => vi.clearAllMocks());

describe("applications service HTTP", () => {
  it("refuses a wrong token and needs the person to apply", async () => {
    const refused = await handle(
      new Request("http://applications/v1/applications", { method: "POST", headers: { authorization: "Bearer nope" } }),
    );
    expect(refused.status).toBe(401);
    expect((await call("/v1/applications", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("applies with 201 and validates the body", async () => {
    expect((await call("/v1/applications", { method: "POST", user: USER, body: JSON.stringify({ jobId: "x" }) })).status).toBe(400);
    const ok = await call("/v1/applications", { method: "POST", user: USER, body: JSON.stringify({ jobId: JOB }) });
    expect(ok.status).toBe(201);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(service.applyToJob).toHaveBeenCalledWith(USER, { jobId: JOB, coverNote: null });
  });

  it("refuses an unknown status and passes the client address to the contacts audit", async () => {
    const bad = await call(`/v1/applications/${APP}/status`, { method: "PATCH", user: USER, body: JSON.stringify({ to: "promoted" }) });
    expect(bad.status).toBe(400);
    await call(`/v1/applications/${APP}/contacts`, { user: USER, headers: { "x-client-ip": "203.0.113.7" } });
    expect(service.readApplicationContacts).toHaveBeenCalledWith(USER, APP, "203.0.113.7");
  });

  it("answers the module questions of candidates and jobs", async () => {
    const seen = await call("/v1/employer-can-see", { method: "POST", user: USER, body: JSON.stringify({ candidateId: APP }) });
    expect(await seen.json()).toEqual({ allowed: true });
    expect(await (await call(`/v1/jobs/${JOB}/active-candidates`)).json()).toEqual({ candidateIds: ["c1"] });
    expect((await call("/v1/applications/nope")).status).toBe(401);
    expect((await call("/v1/applications/nope", { user: USER })).status).toBe(404);
  });
});
