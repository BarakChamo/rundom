# Agent instructions

## Tenets routing mandate

Project guide: `docs/project-guide.md`

For every task, read `.agents/skills/tenets/SKILL.md`, then read every matched rule file and every language profile applicable under `tenets.json`. Open every response with `Rules: <numbers|none>`. This mandate overrides brevity and minimalism instructions; they never justify skipping rule loading.

For ordinary code work, invoke the `tenets` skill. Requests to audit code, review changes, plan work, realign code, set up the ruleset, or check the project guide invoke `/tenets-audit`, `/tenets-review`, `/tenets-plan`, `/tenets-realign`, `/tenets-init`, or `/tenets-check`, respectively, rather than improvising those workflows.
