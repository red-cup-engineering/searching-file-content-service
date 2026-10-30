import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { searchFileContent } from "../scripts/search-file-content.mjs";

const execFileAsync = promisify(execFile);

test("searchFileContent reports literal matches and skips excluded and binary files", async () => {
  const root = await mkdtemp(join(tmpdir(), "search-file-content-"));
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "src", "example.txt"), "first needle\nNeedle again\n");
    await writeFile(join(root, "node_modules", "ignored.txt"), "needle\n");
    await writeFile(join(root, "binary.bin"), Buffer.from([110, 101, 101, 100, 108, 101, 0]));

    const sensitive = await searchFileContent({ root, search: "needle" });
    assert.deepEqual(sensitive, [{ path: "src/example.txt", line: 1, column: 7, match: "needle" }]);

    const insensitive = await searchFileContent({ root, search: "needle", caseSensitive: false });
    assert.equal(insensitive.length, 2);
    assert.deepEqual(insensitive.map(({ line, column }) => ({ line, column })), [{ line: 1, column: 7 }, { line: 2, column: 1 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI emits NDJSON matches from explicit arguments", async () => {
  const root = await mkdtemp(join(tmpdir(), "search-file-content-cli-"));
  try {
    await writeFile(join(root, "one.txt"), "needle\n");
    const script = join(import.meta.dirname, "..", "scripts", "search-file-content.mjs");
    const { stdout } = await execFileAsync("node", [script, "--root", root, "--search", "needle"]);
    assert.equal(JSON.parse(stdout).path, "one.txt");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
