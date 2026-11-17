// @ts-check

// Behavior tests for scripts/validate-designs.cjs: frontmatter parsing,
// naming and routing rules, schema validation, and the repository's own
// designs/ tree.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  parseFrontmatter,
  validateTree,
} = require("../scripts/validate-designs.cjs");

/**
 * @returns {string} A fresh empty directory to use as a designs/ root.
 */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "designs-validate-"));
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {string} content
 * @returns {string} The written path.
 */
function write(root, rel, content) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

/**
 * Overrides accepted by the proposal fixture builder.
 * @typedef {Object} ProposalOptions
 * @property {string} [id]
 * @property {string} [title]
 * @property {string[]} [projects]
 * @property {string[]} [authors]
 * @property {string} [status]
 * @property {string} [created]
 * @property {string} [updated]
 * @property {string} [superseded_by]
 */

/**
 * Build a valid single-project proposal body.
 * @param {ProposalOptions} [overrides]
 * @returns {string}
 */
function proposal(overrides = {}) {
  const values = {
    id: "0042",
    title: "Example proposal",
    projects: ["node-healthcheck-operator"],
    authors: ["octocat"],
    status: "provisional",
    created: "2026-01-02",
    updated: "2026-01-03",
    ...overrides,
  };
  const lines = ["---", `id: "${values.id}"`, `title: "${values.title}"`];
  lines.push("projects:");
  for (const project of values.projects) {
    lines.push(`  - ${project}`);
  }
  lines.push("authors:");
  for (const author of values.authors) {
    lines.push(`  - ${author}`);
  }
  lines.push(`status: ${values.status}`, `created: ${values.created}`);
  if (values.updated !== undefined) {
    lines.push(`updated: ${values.updated}`);
  }
  if (values.superseded_by !== undefined) {
    lines.push(`superseded_by: "${values.superseded_by}"`);
  }
  lines.push("---", "", "# Example proposal", "");
  return lines.join("\n");
}

test("parseFrontmatter reads scalars, lists and comments", () => {
  const { data, errors } = parseFrontmatter(
    [
      "---",
      'title: "Quoted title"',
      "authors:",
      "  - octocat",
      "  - mona",
      "tracking: [RHWA-1, RHWA-2]",
      "# a full-line comment",
      "status: draft",
      "---",
      "body",
    ].join("\n"),
  );
  assert.deepEqual(errors, []);
  assert.equal(data["title"], "Quoted title");
  assert.deepEqual(data["authors"], ["octocat", "mona"]);
  assert.deepEqual(data["tracking"], ["RHWA-1", "RHWA-2"]);
  assert.equal(data["status"], "draft");
});

test("parseFrontmatter strips inline comments outside quoted values", () => {
  const { data, errors } = parseFrontmatter(
    [
      "---",
      'title: "Supports #123 in quotes" # trailing comment',
      "projects:",
      "  - node-healthcheck-operator",
      "authors:",
      "  - octocat",
      "status: draft # work in progress",
      "tracking: [RHWA-1, RHWA-2] # ids",
      "---",
      "body",
    ].join("\n"),
  );
  assert.deepEqual(errors, []);
  assert.equal(data["title"], "Supports #123 in quotes");
  assert.deepEqual(data["projects"], ["node-healthcheck-operator"]);
  assert.equal(data["status"], "draft");
  assert.deepEqual(data["tracking"], ["RHWA-1", "RHWA-2"]);
});

test("parseFrontmatter keeps collecting block lists across blanks and comments", () => {
  const { data, errors } = parseFrontmatter(
    [
      "---",
      "tracking:",
      "  # Jira and RFE ids",
      "  - RHWA-1839",
      "",
      "  - RFE-9581",
      "status: draft",
      "---",
      "body",
    ].join("\n"),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(data["tracking"], ["RHWA-1839", "RFE-9581"]);
  assert.equal(data["status"], "draft");
});

test("parseFrontmatter reports malformed input", () => {
  assert.notEqual(parseFrontmatter("no frontmatter").errors.length, 0);
  assert.notEqual(
    parseFrontmatter("---\nkey: value\n").errors.length,
    0,
    "missing closing delimiter",
  );
  const duplicate = parseFrontmatter(
    "---\nstatus: draft\nstatus: draft\n---\n",
  );
  assert.ok(duplicate.errors.some((error) => error.includes("duplicate")));
});

test("a valid tree passes with no errors", () => {
  const root = makeRoot();
  write(root, "AGENTS.md", "# guide\n");
  write(root, "0000-template.md", '---\nid: "0000"\n---\n');
  write(root, "node-healthcheck-operator/0042-example-proposal.md", proposal());
  write(
    root,
    "shared/0043-cross-cutting/README.md",
    proposal({
      id: "0043",
      projects: ["shared", "storage-based-remediation"],
    }).replace(
      "status: provisional",
      'status: provisional\ntarget_release: "5.9.0"\ndepends_on:\n  - "0042"',
    ),
  );
  // Supporting material inside a proposal folder is allowed.
  write(root, "shared/0043-cross-cutting/notes.md", "notes\n");
  write(root, "shared/0043-cross-cutting/diagram.svg", "<svg/>\n");

  const out = validateTree(root);
  assert.deepEqual(out.errors, []);
  assert.equal(out.proposals, 2);
});

test("misplaced and misnamed files are rejected", () => {
  const root = makeRoot();
  write(root, "README.md", "# index\n");
  write(root, "loose-proposal.md", proposal());
  write(root, "node-healthcheck-operator/notes.md", "notes\n");
  write(root, "node-healthcheck-operator/diagram.svg", "<svg/>\n");
  write(root, "0099-top-level-folder/README.md", proposal({ id: "0099" }));

  const out = validateTree(root);
  assert.ok(out.errors.some((error) => error.startsWith("README.md:")));
  assert.ok(out.errors.some((error) => error.includes("loose-proposal.md:")));
  assert.ok(out.errors.some((error) => error.includes("notes.md:")));
  assert.ok(out.errors.some((error) => error.includes("diagram.svg:")));
  assert.ok(
    out.errors.some((error) => error.includes("0099-top-level-folder")),
  );
});

test("frontmatter schema violations are rejected", () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0044-schema.md",
    proposal({
      id: "0045",
      status: "final",
      updated: "January 3rd",
    }),
  );

  const out = validateTree(root);
  assert.ok(out.errors.some((error) => error.includes("does not match")));
  assert.ok(out.errors.some((error) => error.includes("not one of")));
  assert.ok(out.errors.some((error) => error.includes("YYYY-MM-DD")));
});

test('"updated" is required once status leaves draft', () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0046-no-update.md",
    proposal({ id: "0046", updated: undefined }),
  );
  write(
    root,
    "node-healthcheck-operator/0047-draft-ok.md",
    proposal({ id: "0047", status: "draft", updated: undefined }),
  );

  const out = validateTree(root);
  assert.ok(
    out.errors.some((error) => error.includes('"updated" is required')),
  );
});

test('"updated" supplied as a non-scalar is rejected even for drafts', () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0056-list-updated.md",
    proposal({ id: "0056", status: "draft", updated: undefined }).replace(
      "created: 2026-01-02",
      "created: 2026-01-02\nupdated:\n  - 2026-01-03",
    ),
  );

  const out = validateTree(root);
  assert.ok(
    out.errors.some(
      (error) =>
        error.includes("0056") && error.includes('"updated" must be a'),
    ),
  );
});

test("routing rules are enforced", () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0048-claims-shared.md",
    proposal({ id: "0048", projects: ["shared"] }),
  );
  write(
    root,
    "shared/0049-not-shared/README.md",
    proposal({
      id: "0049",
      projects: ["node-healthcheck-operator"],
    }),
  );

  const out = validateTree(root);
  assert.ok(
    out.errors.some(
      (error) => error.includes("0048") && error.includes("must list projects"),
    ),
  );
  assert.ok(
    out.errors.some(
      (error) => error.includes("0049") && error.includes('include "shared"'),
    ),
  );
});

test("unknown frontmatter keys are rejected", () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0050-unknown.md",
    proposal({ id: "0050" }).replace(
      "status: provisional",
      "project: nhc\nstatus: provisional",
    ),
  );

  const out = validateTree(root);
  assert.ok(
    out.errors.some((error) => error.includes("unknown frontmatter key")),
  );
});

test("superseded proposals require superseded_by", () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0051-superseded.md",
    proposal({ id: "0051", status: "superseded" }),
  );
  write(
    root,
    "node-healthcheck-operator/0052-ok.md",
    proposal({
      id: "0052",
      status: "superseded",
      superseded_by: "0053",
    }),
  );

  const out = validateTree(root);
  assert.ok(out.errors.some((error) => error.includes("superseded_by")));
});

test("duplicate ids are rejected", () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0054-dup.md",
    proposal({ id: "0054" }),
  );
  write(root, "self-node-remediation/0054-dup.md", proposal({ id: "0054" }));

  const out = validateTree(root);
  assert.ok(out.errors.some((error) => error.includes("duplicate id 0054")));
});

test("0000 drafts warn by default and fail in strict mode", () => {
  const root = makeRoot();
  write(
    root,
    "node-healthcheck-operator/0000-work-in-progress.md",
    proposal({ id: "0000", status: "draft", updated: undefined }),
  );

  const relaxed = validateTree(root);
  assert.deepEqual(relaxed.errors, []);
  assert.equal(relaxed.warnings.length, 1);

  const strict = validateTree(root, { strict: true });
  assert.equal(strict.errors.length, 1);
  assert.ok(strict.errors[0]?.includes("0000-work-in-progress.md"));
});

test("proposal folders need a README.md", () => {
  const root = makeRoot();
  write(root, "shared/0055-no-readme/notes.md", "notes\n");

  const out = validateTree(root);
  assert.ok(out.errors.some((error) => error.includes("no README.md")));
});

test("reserved example ids are protected", () => {
  const root = makeRoot();
  write(
    root,
    "shared/9995-not-an-example/README.md",
    proposal({ id: "9995", projects: ["shared"] }),
  );

  const out = validateTree(root);
  assert.ok(
    out.errors.some((error) => error.includes("reserved for worked examples")),
  );
});

test("the repository's own designs tree validates", () => {
  const out = validateTree(path.join(__dirname, "..", "designs"));
  assert.deepEqual(out.errors, []);
  assert.ok(out.proposals >= 2, "expected the worked examples to be found");
});
