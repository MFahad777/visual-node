import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensurePluginReadme } from "../src/plugin-readme.js";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "visual-node-plugin-readme-test-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("ensurePluginReadme", () => {
  it("writes README.PLUGIN.md when the project has none", async () => {
    const readmePath = path.join(projectDir, "README.PLUGIN.md");
    await ensurePluginReadme(projectDir);

    const content = readFileSync(readmePath, "utf8");
    expect(content).toContain("# Creating Custom Plugin Nodes for Visual Node");
    // Covers the field reference, both worked examples, and the limitations section —
    // spot-check a few load-bearing facts rather than snapshotting the whole doc, so
    // future prose edits don't need to touch this test.
    expect(content).toContain('"type": "plugin.myCustomNode"');
    expect(content).toContain("plugin.httpRequest");
    expect(content).toContain("plugin.uuidResponder");
    expect(content).toContain("{{result}}");
    expect(content).toContain("No update-in-place");
  });

  it("never overwrites an existing README.PLUGIN.md, including a user-edited one", async () => {
    const readmePath = path.join(projectDir, "README.PLUGIN.md");
    writeFileSync(readmePath, "# My own notes\nDon't touch this.", "utf8");

    await ensurePluginReadme(projectDir);

    expect(readFileSync(readmePath, "utf8")).toBe("# My own notes\nDon't touch this.");
  });

  it("is idempotent across repeated calls", async () => {
    await ensurePluginReadme(projectDir);
    const first = readFileSync(path.join(projectDir, "README.PLUGIN.md"), "utf8");
    await ensurePluginReadme(projectDir);
    const second = readFileSync(path.join(projectDir, "README.PLUGIN.md"), "utf8");
    expect(second).toBe(first);
  });
});
