# Autonomous dev pipeline

For every coding task, act as the orchestrator and delegate to subagents in this order. Do not write production code yourself.

```
planner → implementer → tester → reviewer
              ↑______________________|
         (loop on bugs / REQUEST_CHANGES, max 3 rounds)
```

1. **planner** — get the plan. Pass it verbatim to the next agents.
2. **implementer** — implement the plan (or the current milestone).
3. **tester** — try to break it. If bugs are found → send the bug report back to **implementer**.
4. **reviewer** — final gate. If `REQUEST_CHANGES` → send the blocking items to **implementer**, then re-run **tester** and **reviewer**.
5. Done only when: reviewer = APPROVE and every Verification command below passes.

## Stop and ask the human when
- 3 fix rounds have failed on the same issue;
- a change is irreversible: DB migration on real data, deleting files/branches, force push, deploy, anything touching payments or secrets;
- the plan needs a new paid service or a new major dependency.

## Git
- Work on a feature branch `agent/<short-task-name>`, never on main.
- One commit per milestone, conventional commits (`feat:`, `fix:`, `test:`, `refactor:`).
- Never push or open a PR unless the task explicitly says so.

## Final report to the human
- What was done (3–5 bullets)
- Test results
- Reviewer verdict + any non-blocking notes
- Anything that needs a human decision

# Project: -1-site

**Stack:** Static site in `public/` served by a plain Node `server.js` (no dependencies).

## Commands
- Install: `—`
- Dev: `npm start`

## Verification (must pass before a task is done)
```bash
node --check server.js
node server.js & sleep 2 && curl -sf localhost:${PORT:-3000} >/dev/null; kill %1
```

## Project rules
- Keep zero dependencies unless the plan justifies one.
- `server.js` must not serve files outside `public/` (path traversal).
