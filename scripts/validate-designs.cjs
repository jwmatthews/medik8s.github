// @ts-check

// Validate design documents under designs/.
//
// Checks file naming (NNNN-kebab-case), folder routing (shared/ vs project
// folders), and the YAML frontmatter schema defined in designs/AGENTS.md.
// Exits non-zero when any file is invalid; --strict additionally rejects
// unnumbered 0000- drafts (used for runs against main).

const fs = require("node:fs");
const path = require("node:path");

// -----------------------------------------------------------------------------
// Rules — keep in sync with designs/AGENTS.md
// -----------------------------------------------------------------------------

/** Allowed values for the `status` frontmatter key. */
const STATUSES = [
  "draft",
  "provisional",
  "implementable",
  "implemented",
  "deferred",
  "rejected",
  "superseded",
];

/** Every frontmatter key the schema knows; anything else is an error. */
const KNOWN_KEYS = [
  "id",
  "title",
  "projects",
  "authors",
  "reviewers",
  "status",
  "created",
  "updated",
  "superseded_by",
  "tracking",
  "target_release",
  "depends_on",
];

/** Frontmatter keys every proposal must carry. */
const REQUIRED_KEYS = [
  "id",
  "title",
  "projects",
  "authors",
  "status",
  "created",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d{4}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROPOSAL_FILE_RE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const PROPOSAL_DIR_RE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Non-proposal files allowed directly under designs/. */
const ROOT_EXEMPT_FILES = new Set(["AGENTS.md", "0000-template.md"]);

/** Worked examples keep ids 9990-9999; real proposals use PR numbers. */
const RESERVED_ID_MIN = 9990;
const EXAMPLE_PATHS = new Set([
  "shared/9999-example-remediation-progress-conditions/README.md",
  "node-healthcheck-operator/9998-example-escalation-timeout-budget.md",
]);

// -----------------------------------------------------------------------------
// Frontmatter parsing (a YAML subset: scalars, flow and block lists, comments)
// -----------------------------------------------------------------------------

/**
 * Parsed frontmatter: scalars as strings, lists as arrays of strings.
 * @typedef {Record<string, string | string[]>} Frontmatter
 */

/**
 * @typedef {Object} ValidationOutput
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {number} proposals Count of proposal entry files seen.
 */

/**
 * Strip one layer of matching quotes from a scalar value.
 * @param {string} value
 * @returns {string}
 */
function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}

/**
 * Remove an inline comment (` # …`) that starts outside a quoted string;
 * `#` characters inside quotes are part of the value.
 * @param {string} value
 * @returns {string}
 */
function stripInlineComment(value) {
  let quote = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) {
      if (char === quote) {
        quote = "";
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "#" && (i === 0 || /\s/.test(value[i - 1] ?? ""))) {
      return value.slice(0, i);
    }
  }
  return value;
}

/**
 * Parse the YAML subset used by design frontmatter: scalars, flow lists
 * (`[a, b]`), block lists (`key:` followed by `- item` lines), duplicate-key
 * detection, full-line comments, and inline comments outside quotes.
 * @param {string} text
 * @returns {{data: Frontmatter, errors: string[]}}
 */
function parseFrontmatter(text) {
  /** @type {Frontmatter} */
  const data = {};
  /** @type {string[]} */
  const errors = [];
  const lines = text.split(/\r?\n/);

  if (lines[0] === undefined || lines[0].trim() !== "---") {
    return { data, errors: ["missing opening '---' delimiter"] };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { data, errors: ["missing closing '---' delimiter"] };
  }

  for (let i = 1; i < end; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(trimmed);
    if (!match) {
      errors.push(`line ${i + 1}: cannot parse "${trimmed}"`);
      continue;
    }
    const key = match[1] ?? "";
    const value = stripInlineComment(match[2] ?? "").trim();

    if (Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push(`line ${i + 1}: duplicate key "${key}"`);
      continue;
    }

    if (value === "") {
      // Block list: collect the following "- item" lines. Blank lines and
      // full-line comments between items are skipped without ending the
      // list; any other non-list line (the next metadata entry) ends it.
      const items = [];
      let j = i + 1;
      while (j < end) {
        const line = lines[j] ?? "";
        const trimmedLine = line.trim();
        if (trimmedLine === "" || trimmedLine.startsWith("#")) {
          j++;
          continue;
        }
        const item = /^\s+-\s+(.*)$/.exec(line);
        if (!item) {
          break;
        }
        items.push(stripQuotes(item[1].trim()));
        j++;
      }
      data[key] = items;
      i = j - 1;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      data[key] =
        inner === ""
          ? []
          : inner.split(",").map((item) => stripQuotes(item.trim()));
    } else {
      data[key] = stripQuotes(value);
    }
  }

  return { data, errors };
}

// -----------------------------------------------------------------------------
// Schema validation
// -----------------------------------------------------------------------------

/**
 * @param {Frontmatter} data
 * @param {string} key
 * @returns {boolean}
 */
function hasKey(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/**
 * @param {Frontmatter} data
 * @param {string} key
 * @returns {string | undefined}
 */
function scalar(data, key) {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * @param {Frontmatter} data
 * @param {string} key
 * @returns {string[] | undefined}
 */
function list(data, key) {
  const value = data[key];
  return Array.isArray(value) ? value : undefined;
}

/**
 * Validate one proposal entry file (a single-file proposal, or the README.md
 * of a proposal folder).
 * @param {string} relPath Path relative to designs/.
 * @param {string} numberFromName The NNNN part of the file or folder name.
 * @param {'shared' | 'project'} folderKind Kind of the containing folder.
 * @param {string} folderName Name of the containing folder.
 * @param {string} text File contents.
 * @param {ValidationOutput} out
 * @returns {string | undefined} The proposal id, for duplicate detection.
 */
function validateProposal(
  relPath,
  numberFromName,
  folderKind,
  folderName,
  text,
  out,
) {
  /**
   * @param {string} message
   */
  const fail = (message) => out.errors.push(`${relPath}: ${message}`);

  const { data, errors } = parseFrontmatter(text);
  for (const error of errors) {
    fail(error);
  }
  if (errors.length > 0) {
    return undefined;
  }

  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.includes(key)) {
      fail(`unknown frontmatter key "${key}"`);
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (!hasKey(data, key)) {
      fail(`missing required frontmatter key "${key}"`);
    }
  }

  const id = scalar(data, "id");
  if (id === undefined) {
    fail('"id" must be a quoted scalar, e.g. id: "0042"');
  } else if (!ID_RE.test(id)) {
    fail(`"id" must be four digits, got "${id}"`);
  } else if (id !== numberFromName) {
    fail(`"id" ${id} does not match the ${numberFromName} in the file name`);
  } else if (Number(id) >= RESERVED_ID_MIN && !EXAMPLE_PATHS.has(relPath)) {
    fail(`ids ${RESERVED_ID_MIN}-9999 are reserved for worked examples`);
  }

  const title = scalar(data, "title");
  if (title === undefined || title.trim() === "") {
    fail('"title" must be a non-empty string');
  }

  const projects = list(data, "projects");
  if (projects === undefined) {
    fail('"projects" must be a list');
  } else if (projects.length === 0) {
    fail('"projects" must not be empty');
  } else {
    for (const project of projects) {
      if (project !== "shared" && !SLUG_RE.test(project)) {
        fail(`invalid project name "${project}"`);
      }
    }
    if (folderKind === "project") {
      if (projects.length !== 1 || projects[0] !== folderName) {
        fail(
          `proposal in ${folderName}/ must list projects: [${folderName}] ` +
            "(cross-project proposals belong in shared/)",
        );
      }
    } else if (!projects.includes("shared")) {
      fail('proposal in shared/ must include "shared" in projects');
    }
  }

  const authors = list(data, "authors");
  if (authors === undefined || authors.length === 0) {
    fail('"authors" must be a non-empty list of GitHub usernames');
  }

  if (hasKey(data, "reviewers") && !Array.isArray(data["reviewers"])) {
    fail('"reviewers" must be a list');
  }
  if (hasKey(data, "tracking") && !Array.isArray(data["tracking"])) {
    fail('"tracking" must be a list');
  }
  if (hasKey(data, "depends_on") && !Array.isArray(data["depends_on"])) {
    fail('"depends_on" must be a list of proposal ids');
  }
  if (
    hasKey(data, "target_release") &&
    typeof data["target_release"] !== "string"
  ) {
    fail('"target_release" must be a string');
  }

  const status = scalar(data, "status");
  if (status === undefined) {
    fail('"status" must be a string');
  } else if (!STATUSES.includes(status)) {
    fail(`"status" "${status}" is not one of: ${STATUSES.join(", ")}`);
  }

  const created = scalar(data, "created");
  if (created === undefined || !DATE_RE.test(created)) {
    fail('"created" must be a YYYY-MM-DD date');
  }

  const updated = scalar(data, "updated");
  if (
    hasKey(data, "updated") &&
    (updated === undefined || !DATE_RE.test(updated))
  ) {
    fail('"updated" must be a YYYY-MM-DD date');
  }
  if (status !== undefined && status !== "draft" && !hasKey(data, "updated")) {
    fail('"updated" is required once status leaves draft');
  }

  const supersededBy = scalar(data, "superseded_by");
  if (status === "superseded") {
    if (supersededBy === undefined || !ID_RE.test(supersededBy)) {
      fail('status "superseded" requires "superseded_by" with a four-digit id');
    }
  } else if (supersededBy !== undefined) {
    fail('"superseded_by" is only valid with status "superseded"');
  }

  return id;
}

/**
 * Record a validated proposal for id uniqueness and 0000-draft warnings.
 * @param {string | undefined} id
 * @param {string} relPath
 * @param {string} numberFromName
 * @param {ValidationOutput} out
 * @param {Map<string, string[]>} ids
 * @param {boolean} strict
 */
function recordProposal(id, relPath, numberFromName, out, ids, strict) {
  out.proposals += 1;

  if (numberFromName === "0000") {
    const message =
      `${relPath}: still named 0000-; rename to this PR's number before ` +
      "merge";
    if (strict) {
      out.errors.push(message);
    } else {
      out.warnings.push(message);
    }
    return;
  }

  if (id === undefined || id === "0000") {
    return;
  }
  const previous = ids.get(id);
  if (previous) {
    previous.push(relPath);
    out.errors.push(`duplicate id ${id} in: ${previous.join(", ")}`);
  } else {
    ids.set(id, [relPath]);
  }
}

// -----------------------------------------------------------------------------
// Tree walk
// -----------------------------------------------------------------------------

/**
 * Validate every design document under a directory.
 * @param {string} rootDir Absolute path to the designs/ directory.
 * @param {{strict?: boolean}} [options]
 * @returns {ValidationOutput}
 */
function validateTree(rootDir, options) {
  const strict = options?.strict ?? false;
  /** @type {ValidationOutput} */
  const out = { errors: [], warnings: [], proposals: 0 };
  /** @type {Map<string, string[]>} */
  const ids = new Map();

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isFile()) {
      if (!entry.name.endsWith(".md") || ROOT_EXEMPT_FILES.has(entry.name)) {
        continue;
      }
      if (entry.name === "README.md") {
        out.errors.push(
          "README.md: designs/ intentionally has no index README; " +
            "use the query-designs skill",
        );
      } else {
        out.errors.push(
          `${entry.name}: proposals belong in shared/ or a project folder, ` +
            "not directly under designs/",
        );
      }
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }

    const folderName = entry.name;
    const folderKind = folderName === "shared" ? "shared" : "project";
    if (folderKind === "project") {
      if (PROPOSAL_DIR_RE.test(folderName)) {
        out.errors.push(
          `${folderName}: proposal folder at the top level; proposal ` +
            "folders belong inside shared/ or a project folder",
        );
        continue;
      }
      if (!SLUG_RE.test(folderName)) {
        out.errors.push(
          `${folderName}: project folder names must be lowercase kebab-case ` +
            "GitHub repository names",
        );
        continue;
      }
    }

    const folderDir = path.join(rootDir, folderName);
    for (const file of fs.readdirSync(folderDir, { withFileTypes: true })) {
      if (file.name.startsWith(".")) {
        continue;
      }
      const fileRel = `${folderName}/${file.name}`;
      if (file.isFile()) {
        if (file.name === "README.md") {
          out.errors.push(
            `${fileRel}: README.md is only used inside proposal folders`,
          );
          continue;
        }
        if (!file.name.endsWith(".md")) {
          out.errors.push(`${fileRel}: assets belong inside a proposal folder`);
          continue;
        }
        const match = PROPOSAL_FILE_RE.exec(file.name);
        if (!match) {
          out.errors.push(`${fileRel}: name must be NNNN-kebab-case-title.md`);
          continue;
        }
        const text = fs.readFileSync(path.join(folderDir, file.name), "utf8");
        const id = validateProposal(
          fileRel,
          match[1] ?? "",
          folderKind,
          folderName,
          text,
          out,
        );
        recordProposal(id, fileRel, match[1] ?? "", out, ids, strict);
        continue;
      }
      if (file.isDirectory()) {
        const dirMatch = PROPOSAL_DIR_RE.exec(file.name);
        if (!dirMatch) {
          out.errors.push(
            `${fileRel}: unexpected directory; proposal folders are ` +
              "NNNN-kebab-case-title/",
          );
          continue;
        }
        const proposalDir = path.join(folderDir, file.name);
        const readme = path.join(proposalDir, "README.md");
        if (!fs.existsSync(readme)) {
          out.errors.push(`${fileRel}: proposal folder has no README.md`);
          continue;
        }
        const text = fs.readFileSync(readme, "utf8");
        const id = validateProposal(
          `${fileRel}/README.md`,
          dirMatch[1] ?? "",
          folderKind,
          folderName,
          text,
          out,
        );
        recordProposal(id, fileRel, dirMatch[1] ?? "", out, ids, strict);
        // Everything else inside a proposal folder is supporting material.
      }
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

/**
 * @param {string[]} argv
 * @returns {number} Process exit code.
 */
function main(argv) {
  const strict = argv.includes("--strict");
  const rootArg = argv.find((arg) => !arg.startsWith("--"));
  const rootDir = rootArg
    ? path.resolve(rootArg)
    : path.join(__dirname, "..", "designs");

  if (!fs.existsSync(rootDir)) {
    console.error(`error: designs directory not found: ${rootDir}`);
    return 1;
  }

  const { errors, warnings, proposals } = validateTree(rootDir, { strict });
  const annotate = process.env.GITHUB_ACTIONS === "true";

  for (const warning of warnings) {
    console.log(annotate ? `::warning::${warning}` : `warning: ${warning}`);
  }
  for (const error of errors) {
    console.log(annotate ? `::error::${error}` : `error: ${error}`);
  }
  console.log(
    `validated ${proposals} proposal(s) under ${rootDir}` +
      (errors.length > 0 ? `: ${errors.length} error(s)` : ": ok"),
  );
  return errors.length > 0 ? 1 : 0;
}

module.exports = { parseFrontmatter, validateTree, STATUSES };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
