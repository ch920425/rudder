---
name: xurl
description: Use the official xurl CLI for X API v2 reads and approved X/Twitter mutations with secret-safe OAuth handling.
---

# xurl — X API v2

Use this skill when the user asks to read, search, post to, or otherwise operate on X/Twitter through the local `xurl` CLI.

`xurl` is the X developer platform CLI. In Rudder runs, treat **X API v2** as the default and expected API surface. Prefer `xurl` shortcut commands for common actions, and use raw `/2/...` endpoints when a shortcut is missing.

## When To Use

- Search or read public posts, timelines, mentions, users, bookmarks, likes, or follows.
- Draft, post, reply, quote, delete, like, repost, bookmark, follow, block, mute, or DM when the user explicitly requested that action.
- Inspect account identity with `xurl whoami` or credential posture with `xurl auth status`.
- Use raw v2 endpoints such as `xurl /2/users/me` when a direct X API v2 call is clearer than a shortcut.

## Secret Safety

- Never read, print, parse, summarize, upload, or diff `~/.xurl`.
- Never ask the user to paste X client secrets, tokens, bearer tokens, or cookies into chat.
- Never run `xurl` with `--verbose` or `-v`.
- Never pass inline secrets with flags such as `--bearer-token`, `--consumer-key`, `--consumer-secret`, `--access-token`, `--token-secret`, `--client-id`, or `--client-secret`.
- To check auth, only run `xurl auth status`, `xurl auth apps list`, or `xurl whoami`.

## One-Time Setup

The user performs setup outside the agent session because it requires secrets.

1. Create or open an app at `https://developer.x.com/en/portal/dashboard`.
2. Configure the app for **X API v2** with OAuth 2.0 user-context access and redirect URI `http://localhost:8080/callback`.
3. Grant only the scopes needed for the intended work. Read-only research should not require write or DM scopes.
4. Register the app locally:
   ```bash
   xurl auth apps add my-app --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
   ```
5. Authenticate with OAuth 2.0 PKCE:
   ```bash
   xurl auth oauth2 --app my-app
   ```
6. Set the default app and verify:
   ```bash
   xurl auth default my-app
   xurl auth status
   xurl whoami
   ```

## Common Commands

```bash
xurl auth status
xurl whoami
xurl read POST_ID_OR_URL
xurl search "from:XDevelopers lang:en" -n 10
xurl user @XDevelopers
xurl timeline -n 20
xurl mentions -n 10
```

Mutating actions require explicit user intent in the task or a confirmation step when the request is ambiguous:

```bash
xurl post "Text to post"
xurl reply POST_ID "Reply text"
xurl quote POST_ID "Quote text"
xurl delete POST_ID
xurl like POST_ID
xurl repost POST_ID
xurl bookmark POST_ID
xurl follow @handle
xurl dm @handle "message"
```

Raw X API v2 examples:

```bash
xurl /2/users/me
xurl "/2/tweets/search/recent?query=from%3AXDevelopers&max_results=10"
```

## Output Rules

- Summarize relevant JSON fields instead of dumping large responses.
- Preserve post IDs, URLs, author handles, timestamps, and query strings needed for verification.
- If the API returns an auth, scope, rate-limit, or tier error, report the exact non-secret error and the missing permission/tier when clear.
