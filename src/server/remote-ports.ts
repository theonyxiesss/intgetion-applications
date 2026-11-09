import { HttpError, logger } from "@intgetion/kit";
import type { ApplicationsPorts, MemberRole } from "../ports";

export type Endpoint = { url: string; token: string };

export type RemoteConfig = {
  candidates: Endpoint;
  contacts: Endpoint;
  companies: Endpoint;
  notifications: Endpoint;
  platform: Endpoint;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Ports answered by candidates, contacts, companies, notifications and the platform (audit, limits). */
export function httpApplicationsPorts(config: RemoteConfig): ApplicationsPorts {
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 5000;
  const json = { "content-type": "application/json" };

  async function call(to: Endpoint, path: string, init: RequestInit = {}) {
    return doFetch(`${to.url.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${to.token}`, ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  async function read<T>(to: Endpoint, path: string, init?: RequestInit): Promise<T | null> {
    const response = await call(to, path, init);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
  }
  const enc = encodeURIComponent;

  return {
    async getOwnCandidate(candidateId) {
      return read(config.candidates, "/v1/me/candidate", { headers: { "x-user-id": candidateId } });
    },
    async findContactEmail(candidateId) {
      return (await read<{ email: string | null }>(config.contacts, `/v1/contacts/${enc(candidateId)}/email`))?.email ?? null;
    },
    async getOwnContacts(candidateId) {
      return read(config.contacts, `/v1/contacts/${enc(candidateId)}`);
    },
    async findMemberRole(companyId, userId) {
      const body = await read<{ role: MemberRole | null }>(
        config.companies,
        `/v1/companies/${enc(companyId)}/members/${enc(userId)}/role`,
      );
      return body?.role ?? null;
    },
    async listMemberUserIds(companyId, roles) {
      const body = await read<{ members: { user_id: string; role: MemberRole }[] }>(
        config.companies,
        `/v1/companies/${enc(companyId)}/members`,
      );
      return (body?.members ?? [])
        .filter((member) => !roles || roles.includes(member.role))
        .map((member) => member.user_id);
    },
    async notify(type, recipientIds, payload) {
      try {
        const response = await call(config.notifications, "/v1/notify", {
          method: "POST",
          headers: json,
          body: JSON.stringify({ type, recipientIds, payload }),
        });
        if (!response.ok) throw new Error(`notify answered ${response.status}`);
      } catch (error) {
        logger.error({ err: error, type }, "applications: notify failed");
      }
    },
    async recordAudit(entry) {
      const response = await call(config.platform, "/api/internal/applications/audit", {
        method: "POST",
        headers: json,
        body: JSON.stringify(entry),
      });
      if (!response.ok) throw new Error(`audit answered ${response.status}`);
    },
    async rateLimit(bucket, key) {
      const response = await call(config.platform, "/api/internal/applications/rate-limit", {
        method: "POST",
        headers: json,
        body: JSON.stringify({ bucket, key }),
      });
      if (response.status === 429) {
        throw new HttpError(429, "RATE_LIMITED", "Too many requests", undefined, {
          "retry-after": response.headers.get("retry-after") ?? "60",
        });
      }
      if (!response.ok) throw new Error(`rate-limit answered ${response.status}`);
    },
  };
}
