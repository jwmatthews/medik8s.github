# AGENTS.md — Design documents (`designs/`)

CNCF-inspired (KEP / OTEP style) design proposals for the medik8s
organization. Everything under `designs/` is isolated from GitHub's org-wide
community-health-file inheritance, so nothing here leaks into other
repositories.

**Read order:** the [common agent guide](../AGENTS.md), then this file.

## Routing

| Change affects | Location |
| --- | --- |
| 2+ projects, or an org-wide convention | `designs/shared/` |
| One project | `designs/<github-repo-name>/` |

- Project folders are named after the GitHub repository (lowercase
  kebab-case), not the abbreviation (NHC, SNR, …). Create the folder on first
  use.
- `projects` frontmatter must match the location: exactly `[<folder>]` in a
  project folder; must include `shared` under `shared/`.
- **Repo-local designs are not deprecated.** Operator repos may keep
  single-repo designs in their own `docs/design/` (for example SBR's
  `storage-arbitrated-remediation.md`). Use `designs/` when you want org-wide
  visibility or the proposal spans projects, and cross-link the two when both
  exist.

## Naming & numbering

- `NNNN-kebab-case-short-title.md`, or `NNNN-short-slug/README.md` for
  multi-file proposals (diagrams, review notes and implementation plans live
  next to `README.md` as supporting material).
- `NNNN` is the **pull-request number in this repository**. Draft as
  `0000-short-slug.md`, then rename to the PR number before merge — updating
  the file name and the frontmatter `id` in lockstep, with the H1 heading kept
  in sync with `title`. The validator warns about `0000-` files on PRs and
  rejects them on `main`.
- Reserved: `0000` (template and unnumbered drafts), `9990-9999` (worked
  examples).
- Slugs are immutable — never put dates, statuses or versions in file or
  folder names.

## Frontmatter

```yaml
---
id: "0042"                    # required, matches NNNN, zero-padded, quoted
title: "Human readable title" # required
projects:                     # required, list; see Routing
  - shared
authors:                      # required, list of GitHub usernames
  - octocat
reviewers: []                 # optional, list
status: draft                 # required: draft | provisional | implementable
                              # implemented | deferred | rejected | superseded
created: 2026-11-17           # required, YYYY-MM-DD
updated: 2026-11-17           # required once status leaves draft
tracking:                     # optional, Jira / RFE ids
  - RHWA-1839
target_release: "5.9.0"       # optional
depends_on:                   # optional, ids of proposals this builds on
  - "0012"
superseded_by: "0043"         # required when status is superseded
---
```

Unknown keys are rejected. Validate with
`node scripts/validate-designs.cjs` (also enforced by CI).

## Status lifecycle

`draft` → `provisional` → `implementable` → `implemented`, plus the terminal
states `deferred`, `rejected`, `superseded`.

| From | Allowed next |
| --- | --- |
| draft | provisional, deferred, rejected |
| provisional | implementable, draft, deferred, rejected |
| implementable | implemented, deferred, rejected, superseded |
| implemented | superseded |
| deferred | provisional, rejected, superseded |
| rejected, superseded | terminal — rework becomes a new proposal |

A status change updates `updated` and lands in its own PR, not folded into
content edits.

## No index

There is intentionally **no `designs/README.md`**: a static index table causes
merge conflicts between concurrent proposals. Use the `query-designs` skill,
which scans frontmatter, instead.

## Skills

- Creating a proposal → `scaffold-design`
- Reviewing a proposal or a PR that touches `designs/` → `review-design`
- Finding or filtering proposals → `query-designs`

## Importing an existing design

Existing documents — repo-local `docs/design/` files, ad-hoc working folders,
PR-canonical mirrors — can move here without rewriting content:

- Map the header table to frontmatter: Status → `status` ("Proposal for
  review" → `provisional`, "Approved"/"Final" → `implementable`, "Shipped" →
  `implemented`), Target release → `target_release`, Tracking → `tracking`.
- Keep the body as-is; numbered sections and section indexes are fine.
- Companion files (concern lists, implementation plans, review notes) become
  supporting files in the proposal folder; `README.md` carries the
  frontmatter.
- Inline Mermaid blocks render on GitHub, so a text-only document with
  diagrams can stay single-file.
- Keep `created` as the original authoring date and link the previous
  location from the Summary.
