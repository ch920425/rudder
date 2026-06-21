---
title: Agent Work Loop
status: active
coverage: seed
edit_policy: user_confirmed_only
---

# Agent Work Loop

This is a composed workflow view. It is not an owning source of behavior.

Path:

1. Issue state and local mutation: `ISSUE.STATE.001`,
   `ISSUE.WORKFLOW.001`.
2. Assignment or reviewer routing: `ROUTING.ASSIGNMENT.001`,
   `ROUTING.REVIEWER.001`.
3. Wakeup admission: `RUN.WAKEUP.001`, `RUN.ADMISSION.001`.
4. Runtime instruction/context loading: `AGENT.INSTRUCTIONS.001`.
5. Adapter execution and result persistence: `RUN.EXECUTION.001`,
   `RUN.RESULT.001`.
6. Release, promotion, or follow-up: `RUN.ADMISSION.001`.
