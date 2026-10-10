import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { searchFileContent } from "../scripts/search-file-content.mjs";

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
