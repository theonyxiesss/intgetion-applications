import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const statusUpdate =
  /update\s*\(\s*applications\s*\)|update\s+public\.applications/gi;

/**
 * True when an update of applications sets `status`. The SET clause runs to
 * `where` (raw SQL) or to the closing brace of `.set({...})` (Drizzle), so
 * other columns (10C clears `cover_note`) do not trip the rule.
 */
function writesStatus(text: string): boolean {
  for (const match of text.matchAll(statusUpdate)) {
    const rest = text.slice(match.index + match[0].length);
    const end = rest.search(/\bwhere\b|\}\s*\)/i);
    const clause = end === -1 ? rest : rest.slice(0, end);
    if (/\bstatus\b/.test(clause)) return true;
  }
  return false;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      found.push(full);
    }
  }
  return found;
}

describe("application status writes", () => {
  it("updates applications.status only inside transitionApplication", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(path.join(root, "src"))) {
      const rel = path.relative(root, file).replaceAll("\\", "/");
      if (rel.endsWith(".test.ts") || rel.includes("/__tests__/")) continue;
      if (
        rel === "src/modules/applications/service/transition-application.ts"
      ) {
        continue;
      }
      const text = readFileSync(file, "utf8");
      if (writesStatus(text)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });

  it("flags status in a SET clause and ignores other columns", () => {
    expect(
      writesStatus("update public.applications set status = 'x' where id = 1"),
    ).toBe(true);
    expect(writesStatus("db.update(applications).set({ status: next })")).toBe(
      true,
    );
    expect(
      writesStatus(
        "update public.applications set cover_note = null where status = 'x'",
      ),
    ).toBe(false);
  });
});
