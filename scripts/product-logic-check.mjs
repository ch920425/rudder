#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const json = args.includes("--json");
const rootArgIndex = args.indexOf("--root");
const root = rootArgIndex >= 0 && args[rootArgIndex + 1]
  ? path.resolve(args[rootArgIndex + 1])
  : process.cwd();

const productRoot = path.join(root, "doc", "product");
const registryPath = path.join(productRoot, "registry.yml");
const pathFields = new Set(["docs", "related_code", "related_tests", "related_plans"]);

function normalizeRelative(value) {
  return value.split(path.sep).join("/");
}

function toRelative(filePath) {
  return normalizeRelative(path.relative(root, filePath));
}

function isReadableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      if (entry.name.startsWith("_")) continue;
      files.push(fullPath);
    }
  }
  return files.sort();
}

function parseYamlScalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSimpleYamlMap(text) {
  const lines = text.split(/\r?\n/);
  const rootMap = {};
  const stack = [{ indent: -1, value: rootMap }];

  function parentFor(indent) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    return stack[stack.length - 1].value;
  }

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();
    const parent = parentFor(indent);

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) continue;
      parent.push(parseYamlScalar(trimmed.slice(2)));
      continue;
    }

    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const rest = match[2];
    if (rest.trim()) {
      parent[key] = parseYamlScalar(rest);
      continue;
    }

    const nextLine = lines.slice(lines.indexOf(line) + 1).find((candidate) => candidate.trim());
    const nextTrimmed = nextLine?.trim() ?? "";
    const value = nextTrimmed.startsWith("- ") ? [] : {};
    parent[key] = value;
    stack.push({ indent, value });
  }

  return rootMap;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  return parseSimpleYamlMap(text.slice(4, end));
}

function readRegistry() {
  if (!isReadableFile(registryPath)) return { contracts: {}, errors: [{
    code: "registry_missing",
    path: "doc/product/registry.yml",
  }] };
  const parsed = parseSimpleYamlMap(fs.readFileSync(registryPath, "utf8"));
  const contracts = parsed.contracts && typeof parsed.contracts === "object" && !Array.isArray(parsed.contracts)
    ? parsed.contracts
    : {};
  return { contracts, errors: [] };
}

function collectDocumentContracts(files) {
  const occurrences = [];
  const frontmatterContracts = new Map();

  for (const file of files) {
    const relative = toRelative(file);
    const text = fs.readFileSync(file, "utf8");
    const frontmatter = parseFrontmatter(text);
    const declared = Array.isArray(frontmatter.contract_ids)
      ? frontmatter.contract_ids.filter((entry) => typeof entry === "string")
      : [];
    for (const contractId of declared) {
      const entries = frontmatterContracts.get(contractId) ?? [];
      entries.push(relative);
      frontmatterContracts.set(contractId, entries);
    }

    const headingRegex = /^##\s+([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)+)\s*$/gm;
    let match;
    while ((match = headingRegex.exec(text)) !== null) {
      occurrences.push({ contractId: match[1], location: relative });
    }
  }

  return { occurrences, frontmatterContracts };
}

function pathExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function validateRegistryPaths(contracts) {
  const errors = [];
  for (const [contractId, entry] of Object.entries(contracts)) {
    if (!entry || typeof entry !== "object") continue;
    for (const field of pathFields) {
      const values = entry[field];
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        if (typeof value !== "string" || !value.trim()) continue;
        if (!pathExists(value)) {
          errors.push({
            code: "registry_path_missing",
            contractId,
            field,
            path: value,
          });
        }
      }
    }
  }
  return errors;
}

function validate() {
  const { contracts, errors } = readRegistry();
  const contractIds = Object.keys(contracts).sort();
  const files = readMarkdownFiles(productRoot);
  const { occurrences, frontmatterContracts } = collectDocumentContracts(files);
  const grouped = new Map();

  for (const occurrence of occurrences) {
    const entries = grouped.get(occurrence.contractId) ?? [];
    entries.push(occurrence.location);
    grouped.set(occurrence.contractId, entries);
  }

  for (const [contractId, locations] of [...grouped.entries()].sort()) {
    if (locations.length > 1) {
      errors.push({
        code: "duplicate_contract_id",
        contractId,
        locations,
      });
    }
  }

  for (const occurrence of occurrences) {
    if (!Object.prototype.hasOwnProperty.call(contracts, occurrence.contractId)) {
      errors.push({
        code: "contract_missing_registry_entry",
        contractId: occurrence.contractId,
        location: occurrence.location,
      });
    }
  }

  for (const [contractId, locations] of [...frontmatterContracts.entries()].sort()) {
    for (const location of locations) {
      const headingsInFile = grouped.get(contractId)?.filter((headingLocation) => headingLocation === location) ?? [];
      if (headingsInFile.length === 0) {
        errors.push({
          code: "frontmatter_contract_missing_heading",
          contractId,
          location,
        });
      }
    }
  }

  for (const contractId of contractIds) {
    const headingLocations = grouped.get(contractId) ?? [];
    const registryDocs = contracts[contractId]?.docs;
    const docs = Array.isArray(registryDocs)
      ? registryDocs.filter((entry) => typeof entry === "string")
      : [];
    if (headingLocations.length === 0) {
      errors.push({
        code: "registry_contract_missing_heading",
        contractId,
      });
      continue;
    }
    if (docs.length > 0 && !headingLocations.some((location) => docs.includes(location))) {
      errors.push({
        code: "registry_contract_heading_outside_docs",
        contractId,
        docs,
        locations: headingLocations,
      });
    }
  }

  errors.push(...validateRegistryPaths(contracts));

  return {
    ok: errors.length === 0,
    contractIds,
    checkedFiles: files.map(toRelative),
    errors,
  };
}

const result = validate();

if (json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.ok) {
  console.log(`product-logic-check: ${result.contractIds.length} contract(s) valid.`);
} else {
  console.error(`product-logic-check: ${result.errors.length} error(s).`);
  for (const error of result.errors) {
    console.error(`  ${error.code}: ${error.contractId ?? error.path ?? ""}`);
  }
}

process.exit(result.ok ? 0 : 1);
