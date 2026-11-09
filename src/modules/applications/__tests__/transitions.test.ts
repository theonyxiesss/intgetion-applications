import { describe, expect, it } from "vitest";
import { HttpError } from "@intgetion/kit";
import {
  APPLICATION_STATUSES,
  EXPRESS_INTEREST_REQUIRED,
  checkTransition,
  type ApplicationStatus,
  type TransitionActor,
  type TransitionVia,
} from "../service";

const ACTORS = [
  "employer",
  "candidate",
] as const satisfies readonly TransitionActor[];
const VIAS = [
  "patch",
  "express_interest",
  "auto_view",
  "withdraw",
] as const satisfies readonly TransitionVia[];

/** Section 4.2, written out so the test does not read the implementation table. */
const ALLOWED: ReadonlyArray<{
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: TransitionActor;
  via: TransitionVia;
}> = [
  { from: "applied", to: "viewed", actor: "employer", via: "auto_view" },
  {
    from: "applied",
    to: "shortlisted",
    actor: "employer",
    via: "express_interest",
  },
  { from: "applied", to: "rejected", actor: "employer", via: "patch" },
  { from: "applied", to: "withdrawn", actor: "candidate", via: "withdraw" },
  {
    from: "viewed",
    to: "shortlisted",
    actor: "employer",
    via: "express_interest",
  },
  { from: "viewed", to: "rejected", actor: "employer", via: "patch" },
  { from: "viewed", to: "withdrawn", actor: "candidate", via: "withdraw" },
  { from: "shortlisted", to: "interview", actor: "employer", via: "patch" },
  { from: "shortlisted", to: "rejected", actor: "employer", via: "patch" },
  { from: "shortlisted", to: "withdrawn", actor: "candidate", via: "withdraw" },
  { from: "interview", to: "offer", actor: "employer", via: "patch" },
  { from: "interview", to: "rejected", actor: "employer", via: "patch" },
  { from: "interview", to: "withdrawn", actor: "candidate", via: "withdraw" },
  { from: "offer", to: "hired", actor: "employer", via: "patch" },
  { from: "offer", to: "rejected", actor: "employer", via: "patch" },
  { from: "offer", to: "withdrawn", actor: "candidate", via: "withdraw" },
];

function edgeKey(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: TransitionActor,
): string {
  return `${from}|${to}|${actor}`;
}

const allowedVia = new Map(
  ALLOWED.map((edge) => [edgeKey(edge.from, edge.to, edge.actor), edge.via]),
);

function thrown(run: () => void): HttpError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
  throw new Error("expected an HttpError");
}

describe("application transitions", () => {
  it("allows every section 4.2 edge and rejects every other pair", () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        for (const actor of ACTORS) {
          const via = allowedVia.get(edgeKey(from, to, actor));
          if (via) {
            expect(() =>
              checkTransition({ from, to, actor, via }),
            ).not.toThrow();
            for (const other of VIAS) {
              if (other === via) continue;
              const error = thrown(() =>
                checkTransition({ from, to, actor, via: other }),
              );
              if (to === "shortlisted") {
                expect(error.status).toBe(422);
                expect(error.code).toBe(EXPRESS_INTEREST_REQUIRED);
              } else {
                expect(error.status).toBe(409);
                expect(error.code).toBe("INVALID_TRANSITION");
              }
            }
            continue;
          }

          for (const attempted of VIAS) {
            const error = thrown(() =>
              checkTransition({ from, to, actor, via: attempted }),
            );
            expect(error.status).toBe(409);
            expect(error.code).toBe("INVALID_TRANSITION");
          }
        }
      }
    }
  });

  it("reaches shortlisted only through express interest, from applied and viewed", () => {
    for (const from of ["applied", "viewed"] as const) {
      const patched = thrown(() =>
        checkTransition({
          from,
          to: "shortlisted",
          actor: "employer",
          via: "patch",
        }),
      );
      expect(patched.status).toBe(422);
      expect(patched.code).toBe(EXPRESS_INTEREST_REQUIRED);

      expect(() =>
        checkTransition({
          from,
          to: "shortlisted",
          actor: "employer",
          via: "express_interest",
        }),
      ).not.toThrow();
    }
  });

  it("marks viewed only through auto_view and only from applied", () => {
    expect(() =>
      checkTransition({
        from: "applied",
        to: "viewed",
        actor: "employer",
        via: "auto_view",
      }),
    ).not.toThrow();

    const patched = thrown(() =>
      checkTransition({
        from: "applied",
        to: "viewed",
        actor: "employer",
        via: "patch",
      }),
    );
    expect(patched.status).toBe(409);

    for (const from of APPLICATION_STATUSES) {
      if (from === "applied") continue;
      const error = thrown(() =>
        checkTransition({
          from,
          to: "viewed",
          actor: "employer",
          via: "auto_view",
        }),
      );
      expect(error.status).toBe(409);
      expect(error.code).toBe("INVALID_TRANSITION");
    }
  });

  it("uses 409 when the actor has no such edge", () => {
    const candidateRejects = thrown(() =>
      checkTransition({
        from: "applied",
        to: "rejected",
        actor: "candidate",
        via: "patch",
      }),
    );
    const employerWithdraws = thrown(() =>
      checkTransition({
        from: "applied",
        to: "withdrawn",
        actor: "employer",
        via: "withdraw",
      }),
    );
    expect(candidateRejects.status).toBe(409);
    expect(employerWithdraws.status).toBe(409);
    expect(candidateRejects.code).toBe("INVALID_TRANSITION");
    expect(employerWithdraws.code).toBe("INVALID_TRANSITION");
  });
});
