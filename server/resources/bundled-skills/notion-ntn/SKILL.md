---
name: notion-ntn
description: Use the ntn CLI for Notion API work: search, page reads, markdown import/export, data-source queries, and Notion Workers.
---

# Notion via `ntn`

Use this skill when the user asks to read, search, create, update, or export Notion content through the local `ntn` CLI.

Prefer `ntn` when installed. It is the shortest path for Notion API calls, markdown page import/export, file uploads, data-source queries, and Notion Workers.

## When To Use

- Search Notion pages or data sources.
- Read page metadata, page blocks, or page markdown.
- Create or update pages from markdown.
- Query Notion data sources.
- Use Notion Workers or `ntn files` workflows when requested.

## Auth And Secret Safety

- `ntn` should use `NOTION_API_TOKEN`; many local environments mirror this from `NOTION_API_KEY`.
- Never print, inspect, or ask the user to paste Notion tokens.
- Never dump shell env wholesale. Check only whether a token variable is present when needed.
- If a page or data source returns 404, first suspect that the Notion integration has not been shared with that object.

Recommended headless environment:

```bash
export NOTION_API_TOKEN="$NOTION_API_KEY"
export NOTION_KEYRING=0
```

## Common Commands

```bash
ntn --version
ntn api v1/search query="page title"
ntn api v1/pages/{page_id}
ntn api v1/pages/{page_id}/markdown
ntn api v1/blocks/{page_id}/children
```

Create a page from markdown:

```bash
ntn api v1/pages \
  parent[page_id]=PARENT_PAGE_ID \
  properties[title][0][text][content]="Notes from meeting" \
  markdown="# Agenda

- Item one
- Item two"
```

Patch page markdown:

```bash
ntn api v1/pages/{page_id}/markdown -X PATCH \
  markdown="## Update

Shipped the prototype."
```

Query a data source:

```bash
ntn api v1/data_sources/{data_source_id}/query -X POST \
  filter[property]=Status filter[select][equals]=Active
```

For complex filters, pipe JSON:

```bash
printf '%s\n' '{"filter":{"property":"Status","select":{"equals":"Active"}}}' \
  | ntn api v1/data_sources/{data_source_id}/query -X POST --json -
```

## Output Rules

- Prefer markdown reads for model-facing synthesis.
- For updates, report the target page/data-source ID and the changed section.
- For large search results, summarize the top relevant matches and keep raw JSON out of the answer unless the user asks for it.
- If `ntn` is unavailable, say so and use direct Notion HTTP only if the task still has a safe token path available.
