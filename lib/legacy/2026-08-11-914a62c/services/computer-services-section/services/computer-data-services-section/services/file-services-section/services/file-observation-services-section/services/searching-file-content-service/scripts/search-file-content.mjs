#!/usr/bin/env node
import { opendir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EXCLUDES = [".git", ".npm", "node_modules"];
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export async function searchFileContent({
  root,
  search,
  caseSensitive = true,
  exclude = DEFAULT_EXCLUDES,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("root is required");
  if (typeof search !== "string" || search.length === 0) throw new TypeError("search is required");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxBytes must be a positive integer");

  const absoluteRoot = resolve(root);
  const excludedNames = new Set(exclude);
  const matches = [];
  for await (const path of walkFiles(absoluteRoot, excludedNames)) {
    const metadata = await stat(path);
    if (metadata.size === 0 || metadata.size > maxBytes) continue;
    const bytes = await readFile(path);
    if (bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) continue;
    const content = bytes.toString("utf8");
    const haystack = caseSensitive ? content : content.toLocaleLowerCase();
    const needle = caseSensitive ? search : search.toLocaleLowerCase();
    let offset = 0;
    while ((offset = haystack.indexOf(needle, offset)) !== -1) {
      const before = content.slice(0, offset);
      const lineStart = before.lastIndexOf("\n") + 1;
      matches.push(Object.freeze({
        path: relative(absoluteRoot, path).split(sep).join("/"),
        line: before.split("\n").length,
        column: offset - lineStart + 1,
        match: content.slice(offset, offset + search.length),
      }));
      offset += needle.length;
    }
  }
  return Object.freeze(matches);
}

async function* walkFiles(directory, excludedNames) {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (excludedNames.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* walkFiles(path, excludedNames);
    else if (entry.isFile()) yield path;
  }
}

function parseArgs(argv) {
  const options = { exclude: [...DEFAULT_EXCLUDES], caseSensitive: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") options.root = argv[++index];
    else if (argument === "--search") options.search = argv[++index];
    else if (argument === "--exclude") options.exclude.push(argv[++index]);
    else if (argument === "--ignore-case") options.caseSensitive = false;
    else if (argument === "--max-bytes") options.maxBytes = Number(argv[++index]);
    else if (argument === "--help") options.help = true;
    else throw new TypeError(`unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("usage: search-file-content --root <directory> --search <text> [--ignore-case] [--exclude <name>] [--max-bytes <bytes>]\n");
    return;
  }
  for (const match of await searchFileContent(options)) process.stdout.write(`${JSON.stringify(match)}\n`);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
