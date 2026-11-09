import { describe, expect, it } from "vitest";
import { HttpError } from "@intgetion/kit";
import { CANDIDATE_DTO_KEYS } from "@intgetion/candidates";
import {
  EMPLOYER_APPLICATION_DTO_KEYS,
  EXPRESS_INTEREST_REQUIRED,
  checkTransition,
  employerNotification,
  employerPatchTargets,
  needsAutoView,
} from "../service";

describe("employer pipeline rules", () => {
  it("auto-views only the first open of applied", () => {
    expect(needsAutoView("applied")).toBe(true);
    expect(needsAutoView("viewed")).toBe(false);
    expect(needsAutoView("shortlisted")).toBe(false);
    expect(needsAutoView("hired")).toBe(false);
  });

  it("offers only patch edges, never shortlisted", () => {
    expect(employerPatchTargets("viewed")).toEqual(["rejected"]);
    expect(employerPatchTargets("shortlisted")).toEqual([
      "interview",
      "rejected",
    ]);
    expect(employerPatchTargets("interview")).toEqual(["offer", "rejected"]);
    expect(employerPatchTargets("offer")).toEqual(["hired", "rejected"]);
    for (const from of [
      "applied",
      "viewed",
      "shortlisted",
      "interview",
      "offer",
    ] as const) {
      expect(employerPatchTargets(from)).not.toContain("shortlisted");
    }
    expect(() =>
      checkTransition({
        from: "viewed",
        to: "shortlisted",
        actor: "employer",
        via: "patch",
      }),
    ).toThrow(HttpError);
    try {
      checkTransition({
        from: "viewed",
        to: "shortlisted",
        actor: "employer",
        via: "patch",
      });
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        code: EXPRESS_INTEREST_REQUIRED,
      });
    }
  });

  it("names notification events without sending them", () => {
    expect(
      employerNotification({
        from: "applied",
        to: "viewed",
        via: "auto_view",
      }),
    ).toBe("application.viewed");
    expect(
      employerNotification({
        from: "viewed",
        to: "viewed",
        via: "auto_view",
      }),
    ).toBeNull();
    expect(
      employerNotification({
        from: "viewed",
        to: "rejected",
        via: "patch",
      }),
    ).toBe("application.status_changed");
  });

  it("keeps contacts off the employer profile and application DTOs", () => {
    expect(CANDIDATE_DTO_KEYS).not.toContain("contacts");
    expect(EMPLOYER_APPLICATION_DTO_KEYS).not.toContain("contacts");
    expect(EMPLOYER_APPLICATION_DTO_KEYS).not.toContain("email");
    expect(EMPLOYER_APPLICATION_DTO_KEYS).not.toContain("authUid");
    const profile = Object.fromEntries(
      CANDIDATE_DTO_KEYS.map((key) => [key, null]),
    );
    expect(profile).not.toHaveProperty("contacts");
  });
});
