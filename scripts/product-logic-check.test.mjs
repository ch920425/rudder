import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const checkScriptPath = path.join(scriptsDir, "product-logic-check.mjs");

function makeFixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "rudder-product-logic-"));
  fs.mkdirSync(path.join(repo, "doc", "product", "domains", "issues"), { recursive: true });
  fs.mkdirSync(path.join(repo, "server", "src", "services"), { recursive: true });
  fs.mkdirSync(path.join(repo, "tests", "e2e"), { recursive: true });
  fs.writeFileSync(path.join(repo, "server", "src", "services", "issues.ts"), "export {}\n");
  fs.writeFileSync(path.join(repo, "tests", "e2e", "issues.spec.ts"), "export {}\n");
  return repo;
}

function writeRegistry(repo, body) {
  fs.writeFileSync(path.join(repo, "doc", "product", "registry.yml"), body);
}

function writeDomainDoc(repo, name, body) {
  fs.writeFileSync(path.join(repo, "doc", "product", "domains", "issues", name), body);
}

function runCheck(repo) {
  return spawnSync("node", [checkScriptPath, "--root", repo, "--json"], {
    encoding: "utf8",
  });
}

test("product logic check validates registry, contract ids, and linked paths", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "    related_code:",
      "      - server/src/services/issues.ts",
      "    related_tests:",
      "      - tests/e2e/issues.spec.ts",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "related_code:",
      "  - server/src/services/issues.ts",
      "related_tests:",
      "  - tests/e2e/issues.spec.ts",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "Issue states must remain visible.",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.errors, []);
    assert.deepEqual(output.contractIds, ["ISSUE.STATE.001"]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check fails on duplicate ids, missing registry entries, and missing paths", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "    related_code:",
      "      - server/src/services/missing.ts",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "  - ISSUE.STATE.002",
      "related_code:",
      "  - server/src/services/issues.ts",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "First definition.",
      "",
      "## ISSUE.STATE.001",
      "",
      "Second definition.",
      "",
      "## ISSUE.STATE.002",
      "",
      "Missing from registry.",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.errors, [
      {
        code: "duplicate_contract_id",
        contractId: "ISSUE.STATE.001",
        locations: [
          "doc/product/domains/issues/state-machines.md",
          "doc/product/domains/issues/state-machines.md",
        ],
      },
      {
        code: "contract_missing_registry_entry",
        contractId: "ISSUE.STATE.002",
        location: "doc/product/domains/issues/state-machines.md",
      },
      {
        code: "registry_path_missing",
        contractId: "ISSUE.STATE.001",
        field: "related_code",
        path: "server/src/services/missing.ts",
      },
    ]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check fails when registry and document contracts diverge", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "  ISSUE.STATE.002:",
      "    owner: product",
      "    domain: issues",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "  ISSUE.STATE.003:",
      "    owner: product",
      "    domain: issues",
      "    docs:",
      "      - doc/product/domains/issues/other.md",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "  - ISSUE.STATE.002",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "Documented contract.",
      "",
      "## ISSUE.STATE.003",
      "",
      "Documented in the wrong file.",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "other.md", [
      "---",
      "title: Other issue contract",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "contract_ids:",
      "  - ISSUE.STATE.003",
      "---",
      "",
      "# Other Issue Contract",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.errors, [
      {
        code: "frontmatter_contract_missing_heading",
        contractId: "ISSUE.STATE.002",
        location: "doc/product/domains/issues/state-machines.md",
      },
      {
        code: "frontmatter_contract_missing_heading",
        contractId: "ISSUE.STATE.003",
        location: "doc/product/domains/issues/other.md",
      },
      {
        code: "registry_contract_missing_heading",
        contractId: "ISSUE.STATE.002",
      },
      {
        code: "registry_contract_heading_outside_docs",
        contractId: "ISSUE.STATE.003",
        docs: ["doc/product/domains/issues/other.md"],
        locations: ["doc/product/domains/issues/state-machines.md"],
      },
    ]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check ignores product template contract placeholders", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "Issue states must remain visible.",
      "",
    ].join("\n"));
    fs.writeFileSync(path.join(repo, "doc", "product", "_template-contract.md"), [
      "---",
      "title: Contract Template",
      "domain: replace-with-domain",
      "status: draft",
      "coverage: seed",
      "contract_ids:",
      "  - DOMAIN.AREA.001",
      "---",
      "",
      "# Contract Title",
      "",
      "## DOMAIN.AREA.001",
      "",
      "Behavior:",
      "",
      "- Observable behavior.",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.errors, []);
    assert.deepEqual(output.contractIds, ["ISSUE.STATE.001"]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check requires headings for active logic contracts", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    spec_depth: logic_contract",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: logic_contract",
      "spec_depth: logic_contract",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "## Contract Summary",
      "",
      "Issue states must remain visible.",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.errors.map((error) => error.code), [
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
      "logic_contract_missing_heading",
    ]);
    assert.equal(output.errors[0].contractId, "ISSUE.STATE.001");
    assert.equal(output.errors[0].heading, "Intent / User Job");
    assert.equal(output.errors[0].location, "doc/product/domains/issues/state-machines.md");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check does not require logic headings for compact contracts", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    spec_depth: compact",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "Issue states must remain visible.",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.deepEqual(output.errors, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check scopes required logic headings to the matching contract section", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    spec_depth: logic_contract",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "  ISSUE.STATE.002:",
      "    owner: product",
      "    domain: issues",
      "    spec_depth: compact",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: logic_contract",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "  - ISSUE.STATE.002",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "## Contract Summary",
      "",
      "Issue states must remain visible.",
      "",
      "## ISSUE.STATE.002",
      "",
      "## Intent / User Job",
      "",
      "## Why / Design Reasoning",
      "",
      "## Actors / Objects / State",
      "",
      "## Entry Points / Inputs",
      "",
      "## Product Logic Flow",
      "",
      "## Decision Table",
      "",
      "## Actor-Visible Input",
      "",
      "## Operator-Visible Output",
      "",
      "## Persisted Evidence",
      "",
      "## Canonical Scenarios",
      "",
      "## Invariants / Non-Goals",
      "",
      "## Drift Boundaries",
      "",
      "## Traceability",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.errors.map((error) => error.heading), [
      "Intent / User Job",
      "Why / Design Reasoning",
      "Actors / Objects / State",
      "Entry Points / Inputs",
      "Product Logic Flow",
      "Decision Table",
      "Actor-Visible Input",
      "Operator-Visible Output",
      "Persisted Evidence",
      "Canonical Scenarios",
      "Invariants / Non-Goals",
      "Drift Boundaries",
      "Traceability",
    ]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("product logic check fails on invalid spec depth values", () => {
  const repo = makeFixtureRepo();
  try {
    writeRegistry(repo, [
      "contracts:",
      "  ISSUE.STATE.001:",
      "    owner: product",
      "    domain: issues",
      "    spec_depth: encyclopedia",
      "    docs:",
      "      - doc/product/domains/issues/state-machines.md",
      "",
    ].join("\n"));
    writeDomainDoc(repo, "state-machines.md", [
      "---",
      "title: Issue state machines",
      "domain: issues",
      "status: active",
      "coverage: seed",
      "spec_depth: verbose",
      "contract_ids:",
      "  - ISSUE.STATE.001",
      "---",
      "",
      "# Issue State Machines",
      "",
      "## ISSUE.STATE.001",
      "",
      "Issue states must remain visible.",
      "",
    ].join("\n"));

    const result = runCheck(repo);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, false);
    assert.deepEqual(output.errors, [
      {
        code: "invalid_spec_depth",
        contractId: "ISSUE.STATE.001",
        value: "encyclopedia",
      },
      {
        code: "invalid_spec_depth",
        path: "doc/product/domains/issues/state-machines.md",
        value: "verbose",
      },
    ]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
