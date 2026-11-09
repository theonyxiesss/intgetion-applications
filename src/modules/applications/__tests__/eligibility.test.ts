import { afterEach, describe, expect, it, vi } from "vitest";
import * as candidates from "@intgetion/candidates";
import { HttpError } from "@intgetion/kit";
import {
  checkApplyEligibility,
  checkApplyTarget,
  checkReapply,
  type ApplyTarget,
} from "../service";
import type { CompletenessInput } from "@intgetion/candidates";

function thrown(run: () => void): HttpError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
  throw new Error("expected an HttpError");
}

function complete(): CompletenessInput {
  return {
    fullName: "Ada Lovelace",
    headline: "Engineer",
    desiredTitles: ["Backend engineer"],
    timezone: "Europe/Berlin",
    workHoursStart: "09:00",
    workHoursEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    skillCount: 3,
    experienceYears: 5,
    languageCount: 1,
    salaryMin: BigInt(100),
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    salaryBasis: "gross",
    workFormats: ["remote"],
    employmentTypes: ["full_time"],
    contactEmail: "ada@example.com",
  };
}

/** timezone + skills + email + name + schedule + one language + format = 60. */
function atSixty(): CompletenessInput {
  return {
    ...complete(),
    headline: null,
    desiredTitles: [],
    experienceYears: null,
    salaryMin: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryBasis: null,
  };
}

describe("apply eligibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects 59 percent and allows 60 when the three required fields are present", () => {
    vi.spyOn(candidates, "profileCompleteness").mockReturnValueOnce({
      score: 59,
      missing: ["headline"],
    });
    const under = thrown(() => checkApplyEligibility(atSixty()));
    expect(under.status).toBe(422);
    expect(under.code).toBe("PROFILE_INCOMPLETE");
    expect(under.details).toEqual({
      completeness: 59,
      missing: ["headline"],
    });

    vi.spyOn(candidates, "profileCompleteness").mockReturnValueOnce({
      score: 60,
      missing: [],
    });
    expect(() => checkApplyEligibility(atSixty())).not.toThrow();
  });

  it("allows a real snapshot of 60 and rejects the same snapshot at 55", () => {
    expect(() => checkApplyEligibility(atSixty())).not.toThrow();

    const under = thrown(() =>
      checkApplyEligibility({
        ...atSixty(),
        workFormats: [],
        employmentTypes: [],
      }),
    );
    expect(under.status).toBe(422);
    expect(under.code).toBe("PROFILE_INCOMPLETE");
    expect(under.details).toMatchObject({ completeness: 55 });
  });

  it.each([
    ["timezone", { timezone: null }, ["timezone"]],
    ["skills", { skillCount: 2 }, ["skills"]],
    ["contact_email", { contactEmail: null }, ["contact_email"]],
  ] as const)("rejects a full profile missing %s", (_part, patch, missing) => {
    const error = thrown(() =>
      checkApplyEligibility({ ...complete(), ...patch }),
    );
    expect(error.status).toBe(422);
    expect(error.code).toBe("PROFILE_INCOMPLETE");
    expect(error.details).toEqual({
      completeness: 100 - (missing[0] === "skills" ? 15 : 10),
      missing: [...missing],
    });
  });
});

describe("apply target", () => {
  it("sends an imported job to the external url", () => {
    const target: ApplyTarget = {
      origin: "imported",
      externalUrl: "https://example.com/jobs/1",
      status: "published",
    };
    const error = thrown(() => checkApplyTarget(target));
    expect(error.status).toBe(422);
    expect(error.code).toBe("EXTERNAL_APPLY");
    expect(error.details).toEqual({
      externalUrl: "https://example.com/jobs/1",
    });
  });

  it("does not hand back an apply address that is not http or https", () => {
    const error = thrown(() =>
      checkApplyTarget({
        origin: "imported",
        externalUrl: "javascript:alert(1)",
        status: "published",
      }),
    );
    expect(error.details).toEqual({ externalUrl: null });
  });

  it("prefers the external error when an imported job is also unpublished", () => {
    const error = thrown(() =>
      checkApplyTarget({
        origin: "imported",
        externalUrl: null,
        status: "draft",
      }),
    );
    expect(error.code).toBe("EXTERNAL_APPLY");
    expect(error.details).toEqual({ externalUrl: null });
  });

  it.each(["draft", "closed"] as const)(
    "rejects a %s internal job",
    (status) => {
      const error = thrown(() =>
        checkApplyTarget({
          origin: "internal",
          externalUrl: null,
          status,
        }),
      );
      expect(error.status).toBe(422);
      expect(error.code).toBe("JOB_NOT_PUBLISHED");
    },
  );

  it("allows a published internal job", () => {
    expect(() =>
      checkApplyTarget({
        origin: "internal",
        externalUrl: null,
        status: "published",
      }),
    ).not.toThrow();
  });
});

describe("reapply", () => {
  it("allows the first application", () => {
    expect(() => checkReapply([])).not.toThrow();
  });

  it("rejects an active duplicate", () => {
    for (const status of ["applied", "viewed", "rejected", "hired"] as const) {
      const error = thrown(() => checkReapply([{ status, reapplyCount: 0 }]));
      expect(error.status).toBe(409);
      expect(error.code).toBe("ALREADY_APPLIED");
    }
  });

  it("allows one reapply after a withdrawal", () => {
    expect(() =>
      checkReapply([{ status: "withdrawn", reapplyCount: 0 }]),
    ).not.toThrow();
  });

  it("rejects a second withdrawal and a repeat past the limit", () => {
    const secondWithdrawal = thrown(() =>
      checkReapply([
        { status: "withdrawn", reapplyCount: 0 },
        { status: "withdrawn", reapplyCount: 1 },
      ]),
    );
    const pastLimit = thrown(() =>
      checkReapply([{ status: "withdrawn", reapplyCount: 1 }]),
    );
    expect(secondWithdrawal.status).toBe(409);
    expect(secondWithdrawal.code).toBe("REAPPLY_LIMIT");
    expect(pastLimit.status).toBe(409);
    expect(pastLimit.code).toBe("REAPPLY_LIMIT");
  });

  it("reports an active reapply as a duplicate, not as the limit", () => {
    const error = thrown(() =>
      checkReapply([
        { status: "withdrawn", reapplyCount: 0 },
        { status: "applied", reapplyCount: 1 },
      ]),
    );
    expect(error.code).toBe("ALREADY_APPLIED");
  });
});
