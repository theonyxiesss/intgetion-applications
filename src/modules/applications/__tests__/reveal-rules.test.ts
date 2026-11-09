import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES } from "../service";
import { contactsOpen, expressInterestPlan } from "../service/reveal-rules";

describe("D23 contact access", () => {
  it("is open only for shortlisted, interview, offer and hired", () => {
    const open = APPLICATION_STATUSES.filter((status) => contactsOpen(status));
    expect(open).toEqual(["shortlisted", "interview", "offer", "hired"]);
    for (const status of [
      "applied",
      "viewed",
      "rejected",
      "withdrawn",
    ] as const) {
      expect(contactsOpen(status)).toBe(false);
    }
  });
});

describe("express-interest idempotency", () => {
  it("repeats only when shortlisted already has a reveal", () => {
    expect(expressInterestPlan("shortlisted", true)).toBe("repeat");
    expect(expressInterestPlan("applied", false)).toBe("commit");
    expect(expressInterestPlan("viewed", false)).toBe("commit");
    for (const status of APPLICATION_STATUSES) {
      if (status === "applied" || status === "viewed") {
        expect(expressInterestPlan(status, true)).toBe("reject");
      }
      if (status !== "shortlisted") {
        expect(expressInterestPlan(status, true)).not.toBe("repeat");
      }
    }
    expect(expressInterestPlan("shortlisted", false)).toBe("reject");
    expect(expressInterestPlan("interview", true)).toBe("reject");
    expect(expressInterestPlan("rejected", true)).toBe("reject");
    expect(expressInterestPlan("withdrawn", true)).toBe("reject");
  });
});
