---
tracker:
  kind: linear
  project_slug: "dryrun-3da5934e264f"
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Done
polling:
  interval_ms: 30000
workspace:
  root: ~/symphony-workspaces
hooks:
  after_create: |
    git clone --depth 1 https://github.com/gilquadrosflores/dryrun.git . 2>/dev/null || true
agent:
  max_concurrent_agents: 5
  max_turns: 20
codex:
  command: codex app-server
  approval_policy: never
---

You are working on a Linear ticket `{{ issue.identifier }}`

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
{% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Instructions:

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.
2. Only stop early for a true blocker (missing required auth/permissions/secrets).
3. Final message must report completed actions and blockers only.

Work only in the provided repository copy. Do not touch any other path.
