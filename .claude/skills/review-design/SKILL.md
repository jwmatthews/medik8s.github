---
name: review-design
description: Perform a structured CNCF-style design review of a proposal under designs/ or of a PR that changes them. Use when asked to review a design document, to check a proposal before merge, or to decide whether a proposal may move to implementable status.
---

# review-design — review a design document

A review here gates remediation behavior that can reboot hosts and fence
nodes. Calibrate accordingly.

## Procedure

### 1. Validate mechanically

```bash
node scripts/validate-designs.cjs
```

Fix or flag everything it reports before reviewing content.

### 2. Check lifecycle hygiene

- The status transition is allowed (see the table in `designs/AGENTS.md`).
- `updated` was bumped and the status change is its own PR, not folded into
  content edits.
- `id` matches the file name; no `0000-` draft names on `main`.
- `reviewers` is populated before `provisional`.

### 3. Review the content

| Section | What passes |
| --- | --- |
| Summary | One paragraph, names the affected projects. |
| Motivation | The problem is evidenced (issues, incidents, `tracking` ids), not asserted. |
| Goals / Non-Goals | Goals are specific and verifiable; non-goals are real exclusions a reviewer would expect, not strawmen. |
| Design | API/schema contracts spelled out field by field; cross-project blast radius enumerated per project. |
| Risks & Security | Privilege boundaries and forgeable inputs addressed; failure modes that surface as reboots or split-brain, not just failed tests; every concern carries a proposed mitigation. |
| Alternatives | Real trade-offs, each with why it loses — not strawmen. |
| Rollout | Migration and rollback are concrete; graduation criteria are objective. |

Distinguish *does* from *will be*: use "does" only for behavior that ships
today, "will" for proposed behavior. A concern without a proposed resolution
is an opinion — say what information would resolve it and who has it.

### 4. Gate `implementable`

Block the transition to `implementable` when any of the following is missing:
complete frontmatter, populated reviewers, adequate coverage of every core
section, a rollback path, and graduation criteria. Say so explicitly with the
blocking findings.

### 5. Report

Findings ordered by severity, each citing `file:line` (or section) with a
concrete failure scenario, then a verdict: **approve**, **needs changes**, or
**blocked** (with the blocking items). Never approve a proposal you have not
read in full; if you delegate exploration, verify the load-bearing claims
yourself.

For imported documents (moved from a repo-local `docs/design/`), additionally
verify the body is unchanged apart from the documented metadata mapping, and
that the original location is linked from the Summary.
