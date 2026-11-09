import { describe, expect, it, vi } from "vitest";
import { httpApplicationsPorts } from "./remote-ports";

function setup(answer: (url: string) => Response) {
  const fetchImpl = vi.fn(async (url: string) => answer(url));
  const ports = httpApplicationsPorts({
    candidates: { url: "https://candidates.test", token: "ca" },
    contacts: { url: "https://contacts.test", token: "co" },
    companies: { url: "https://companies.test", token: "cm" },
    notifications: { url: "https://notifications.test", token: "n" },
    platform: { url: "https://platform.test", token: "p" },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const sent = (i = 0) => fetchImpl.mock.calls[i] as unknown as [string, RequestInit];
  return { ports, sent };
}
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe("applications remote ports", () => {
  it("reads the candidate as that person and maps no profile to null", async () => {
    const { ports, sent } = setup(() => new Response(null, { status: 404 }));
    await expect(ports.getOwnCandidate("c1")).resolves.toBeNull();
    expect(sent()[0]).toBe("https://candidates.test/v1/me/candidate");
    expect(header(sent()[1], "x-user-id")).toBe("c1");
    expect(header(sent()[1], "authorization")).toBe("Bearer ca");
  });

  it("filters company members by role", async () => {
    const { ports } = setup(() =>
      Response.json({
        members: [
          { user_id: "o", role: "owner" },
          { user_id: "m", role: "member" },
          { user_id: "r", role: "recruiter" },
        ],
      }),
    );
    await expect(ports.listMemberUserIds("c", ["owner", "recruiter"])).resolves.toEqual(["o", "r"]);
    await expect(ports.listMemberUserIds("c")).resolves.toEqual(["o", "m", "r"]);
  });

  it("turns a platform 429 into a rate-limit error and never throws on a failed notice", async () => {
    const { ports } = setup((url) => new Response(null, { status: url.includes("rate-limit") ? 429 : 503 }));
    await expect(ports.rateLimit("apply", "c1")).rejects.toMatchObject({ status: 429 });
    await expect(ports.notify("application.created", ["u"], {})).resolves.toBeUndefined();
  });
});
