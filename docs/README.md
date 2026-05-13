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

The first implementation pass uses the ZST-149 IA/content draft and the ZST-150 screenshot set. The current pages are intentionally concise so the site can run and validate while deeper guides continue to expand.
