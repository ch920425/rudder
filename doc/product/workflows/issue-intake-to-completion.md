---
title: Issue Intake To Completion
status: active
coverage: seed
edit_policy: user_confirmed_only
---

# Issue Intake To Completion

This is a composed workflow view. It cites owning contracts and must not define
new product rules.

- Create issue: `ISSUE.WORKFLOW.001`.
- Assign or checkout: `ROUTING.ASSIGNMENT.001`, `ROUTING.CHECKOUT.001`.
- Wake and run agent: `RUN.WAKEUP.001`, `RUN.EXECUTION.001`.
- Load instructions and context: `AGENT.INSTRUCTIONS.001`.
- Persist run evidence: `RUN.RESULT.001`.
- Enter review when required: `ISSUE.STATE.001`, `ROUTING.REVIEWER.001`.
- Release or follow-up: `RUN.ADMISSION.001`.
