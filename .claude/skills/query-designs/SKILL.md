---
name: query-designs
description: List, filter and summarize design documents under designs/ by project, status, author or keyword by scanning their YAML frontmatter. Use when asked what design proposals exist, which proposals are implementable, or what was decided about a topic. Replaces a static designs/README.md index.
---

# query-designs — find design documents

There is intentionally no index file under `designs/` (a static table causes
merge conflicts between concurrent proposals). The frontmatter of every
proposal is the index — scan it on demand.

## Procedure

### 1. Collect the proposals

Entry files are `designs/**/NNNN-slug.md` and `designs/**/NNNN-slug/README.md`.
Exclude `designs/AGENTS.md` and `designs/0000-template.md`. Supporting files
inside proposal folders are not proposals.

### 2. Read the frontmatter

The validator module exports its parser — reuse it rather than re-implementing
YAML. The command below selects only the entry-file patterns from step 1
(supporting Markdown files are skipped) and passes the paths null-delimited,
so filenames containing spaces stay a single argument:

```bash
find designs -type f -name '*.md' -print0 | xargs -0 node -e '
  const { parseFrontmatter } = require("./scripts/validate-designs.cjs");
  const fs = require("node:fs");
  const isEntry = (file) =>
    /\/\d{4}-[^/]+\.md$/.test(file) ||
    /\/\d{4}-[^/]+\/README\.md$/.test(file);
  for (const file of process.argv.slice(1)) {
    if (!isEntry(file) || file.endsWith("0000-template.md")) continue;
    const { data } = parseFrontmatter(fs.readFileSync(file, "utf8"));
    console.log(JSON.stringify({ file, ...data }));
  }'
```

For keyword searches, grep the bodies as well — frontmatter only carries
structured metadata.

### 3. Filter and answer

Filter by project (`projects`), state (`status`), author (`authors`), date
(`updated`), or tracking id (`tracking`). Present the result as a table:

| id | title | projects | status | updated | file |
| --- | --- | --- | --- | --- | --- |

Link each row to its file path so the user can open it directly.

### 4. Scope notes

- `0000-` files are in-flight drafts — say so when listing them.
- ids `9990-9999` are worked examples, not decisions.
- Designs that live in an operator repo's own `docs/design/` are outside this
  index; if the topic might also be covered there, say so rather than claiming
  "nothing found".
- Answering a query never edits files. If the data looks stale or wrong, run
  `node scripts/validate-designs.cjs` and report what it says.
