---
name: scaffold-design
description: Create a new design document under designs/ from the CNCF-aligned template. Use when the user asks to create, draft or scaffold a design doc, proposal or KEP-style document for a medik8s project, or to import an existing design (for example from an operator repo's docs/design/) into the org-wide designs/ directory.
---

# scaffold-design — create a design document

Turn an idea (or an existing document) into a properly placed, properly named
proposal under `designs/`. Read `designs/AGENTS.md` first — it is the
authority for everything below.

## Procedure

### 1. Determine the target folder

- Affects 2+ projects, or an org-wide convention → `designs/shared/`.
- Affects one project → `designs/<github-repo-name>/` — the folder is named
  after the GitHub repository (`node-healthcheck-operator`), not the
  abbreviation (NHC). Ask the user only when the affected projects are
  genuinely unclear.
- A repo-local design in an operator's `docs/design/` stays where it is
  unless the user wants org-wide visibility — never move it on your own.

### 2. Determine the format

- Text-only (inline Mermaid is fine — GitHub renders it) → single file
  `NNNN-short-slug.md`.
- Needs diagrams, schemas or companion files (concern lists, implementation
  plans, review notes) → folder `NNNN-short-slug/` with the proposal in
  `README.md` and supporting files next to it.

### 3. Derive the slug

Short (≤ 5 words), lowercase kebab-case, from the title. Immutable once
merged — no dates, statuses or versions.

### 4. Create the file

Copy `designs/0000-template.md` to the chosen location as
`0000-<slug>.md` (or `0000-<slug>/README.md`) and fill the frontmatter:

- `id: "0000"` until the PR number is known (see step 6).
- `status: draft`, `created:` today's date.
- `authors:` — the user's GitHub username (ask if you cannot determine it;
  `gh api user --jq .login` works when authenticated as them).
- `projects:` — per the routing rules in step 1.

When importing an existing document, follow the "Importing an existing
design" section of `designs/AGENTS.md`: map the header table to frontmatter,
keep the body (including numbered sections and section indexes) as-is, move
companion files into the proposal folder, keep the original `created` date.

### 5. Validate

```bash
node scripts/validate-designs.cjs
```

Fix every error before handing the file back. A `0000-` warning is expected
at this stage.

### 6. Tell the user what happens next

- Open a PR from a fork against `medik8s/.github` `main` (see CONTRIBUTING).
- After the PR number is known, rename `0000-<slug>` to `<PR-number>-<slug>`
  and update the `id` in the frontmatter to match, before merge.
- Suggest submitting as a draft / WIP title to save CI resources.
- Offer the `review-design` skill before the proposal moves beyond
  `provisional`.
