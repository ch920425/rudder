---
name: research-routing
description: Route current developer documentation through Context7 MCP and broader source-backed web research through Exa MCP.
---

# Research Routing

Use this skill when the user asks for current documentation, API/library/framework/SDK/CLI/cloud-service guidance, or explicit source-backed research.

## Tool Routes

- Use **Context7** first for developer documentation: libraries, frameworks, SDKs, APIs, CLIs, cloud services, setup/configuration syntax, migration notes, and troubleshooting against current docs.
- Use **Exa** for broader web research after Context7 is not enough: current source discovery, primary-source lookup, recent public information, comparisons, recommendations, or exact links/quotes.
- Prefer official or primary sources. Distinguish direct source facts from local inference.
- Do not silently replace Context7 or Exa with generic search. If the expected MCP tool is unavailable in the run, state the limitation and choose the best available fallback only after naming the gap.

## Practical Flow

1. Classify the request as developer-doc lookup, broader web research, or both.
2. For developer docs, query Context7 and cite the relevant official docs.
3. For broader web research, query Exa and prefer primary sources.
4. Summarize with source links and any uncertainty. Keep implementation advice tied to the cited source state.

## Failure Handling

- If Context7 is missing for a docs task, say that current-doc lookup is unavailable and avoid pretending memory is current.
- If Exa is missing for broader research, say so before falling back to any other available search path.
- If sources conflict, report the conflict and prefer the newest official source unless there is a concrete reason not to.
