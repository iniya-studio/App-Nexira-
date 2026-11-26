# NEXIRA Repository Operating Rules

This file is the mandatory starting point for every human or AI agent working in this repository. Read it before inspecting, planning, editing, testing, committing, or proposing implementation steps.

## 1. Main-only development — mandatory

- `main` is the only permitted development branch.
- Do not create any new Git branch: no feature, fix, hotfix, release, experiment, temporary, backup, or integration branches. This prohibition applies to local and remote branches, worktrees, and automated workflows.
- Do not create pull requests or merge branches as a normal development workflow.
- Make approved, scoped changes directly on `main`, in small commits, and verify each change before proceeding.
- Historical branches and commits may be inspected as read-only recovery references. Do not develop on them.
- An exception is possible only when Milad explicitly authorizes the specific branch creation in advance. Silence, convenience, tool defaults, or an agent's preference are not authorization.
- Never force-push, rewrite shared history, delete an existing branch, or change repository settings without explicit authorization.

## 2. Mandatory preflight before every work session

Before any repository operation:

1. Read this file and the relevant project instructions.
2. Fetch the latest remote `main` and record its current commit SHA.
3. Verify the intended working/ref target is exactly `main`. If the current environment is on another branch, stop and report it; do not create a branch or silently continue there.
4. Check for uncommitted changes and identify their owner/context. Never overwrite, discard, reset, or clean them without explicit authorization.
5. Inspect the relevant files and current implementation on the latest `main`; do not rely on stale chat summaries or old local copies.
6. State the planned scope and safety checks before making material or potentially destructive changes.

If any check cannot be completed, pause and ask Milad rather than guessing.

## 3. Change and verification discipline

- Prefer the smallest change that fully addresses the requirement.
- Preserve unrelated work and existing tests. Never disable or delete a failing test merely to make CI green; diagnose and repair the underlying mismatch.
- Run the relevant tests and inspect the resulting CI jobs/artifacts before declaring success.
- Distinguish clearly between a build passing, a test passing, and a capability being proven. Do not overstate evidence.
- Do not delete historical branches or artifacts as cleanup unless Milad explicitly approves the exact deletion.
- Report the changed files, commit SHA, test evidence, remaining limitations, and any follow-up required.

## 4. Authority and conflict handling

Milad is the project owner and final decision-maker. These rules are mandatory defaults. If a task appears to require a branch, merge, force-push, destructive cleanup, or a deviation from `main`, stop and request explicit approval before taking that action. Do not treat an agent's technical preference as permission.

## 5. Session-start acknowledgement

At the beginning of each NEXIRA work session, explicitly confirm that the preflight was performed and that work will remain on `main`. This acknowledgement is not a substitute for the checks above.
