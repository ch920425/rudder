# Rudder Mintlify Docs

This directory contains the first Mintlify documentation site for Rudder.

## Local Development

From the repository root:

```bash
pnpm docs:dev
```

Validate the docs project:

```bash
pnpm docs:validate
```

## Deployment

Configure Mintlify to use this repository with `docs/` as the docs root, then attach the production custom domain:

```text
doc.rudder.zeeland.studio
```

There is no existing Vercel or Mintlify project metadata in this repository. Domain setup requires access to the Mintlify workspace and DNS provider.

## Current Content Status

ZST-149 and ZST-150 were still in progress when this skeleton was created. The current pages are seeded from repository docs and README assets so the site can run locally before the final information architecture, copy, and screenshot set lands.
