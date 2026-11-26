# NEXIRA Repository Operating Rules

This file is the mandatory starting point for every human or AI agent working in this repository. Read it before inspecting, planning, editing, testing, committing, or proposing implementation steps.

## 1. Main-first development; branches only with Milad's prior approval

- `main` is the default and normal development branch. Prefer working directly on `main` for routine, low-risk and independently verifiable tasks.
- A separate branch may be proposed for genuinely high-risk or isolated work (for example: authentication/security changes, cryptography/Keystore changes, database migrations with data-loss risk, or broad architectural changes).
- **No branch may be created unless Milad explicitly approves the creation in advance.** The approval must be clear and specific to the proposed branch/work. Silence, convenience, tool defaults, an agent's preference, or a task being described as high-risk are not authorization.
- Before asking for approval, explain briefly why a separate branch is justified, what will be isolated, and the planned verification and merge path. Do not create the branch while waiting for approval.
- Never create local or remote feature, fix, hotfix, release, experiment, temporary, backup, or integration branches without that prior approval. This also applies to worktrees and automated workflows that create branches.
- Do not create branches merely to follow a generic Git workflow, to make routine edits, or because a tool defaults to branch-based work.
- For a branch explicitly approved by Milad: keep its scope focused; complete the work and required tests there; wait until all required checks are green; then merge the verified result into `main` promptly, without unnecessary intermediate branches or prolonged reconciliation. After verifying that `main` contains the intended changes and remains healthy, delete that task-specific branch as the normal cleanup step.
- If required checks are not green, do not merge or delete the working branch. Diagnose and repair the issue, then repeat verification.
- Historical branches and commits may be inspected as read-only recovery references. Do not resume development on them unless Milad explicitly approves that work.
- Never force-push, rewrite shared history, delete unrelated/existing branches, or change repository settings without explicit authorization.

## 2. Mandatory preflight before every work session

Before any repository operation:

1. Read this file and the relevant project instructions.
2. Fetch the latest remote `main` and record its current commit SHA.
3. Verify the intended working/ref target. For routine work it must be `main`; for separately branched high-risk work, verify the exact branch that Milad approved. If the target does not match, stop and report it.
4. Check for uncommitted changes and identify their owner/context. Never overwrite, discard, reset, or clean them without explicit authorization.
5. Inspect the relevant files and current implementation on the latest appropriate ref; do not rely on stale chat summaries or old local copies.
6. State the planned scope and safety checks before making material or potentially destructive changes.
7. If a separate branch seems beneficial, stop and obtain Milad's explicit approval before creating it.

If any check cannot be completed, pause and ask Milad rather than guessing.

## 3. Change and verification discipline

- Prefer the smallest change that fully addresses the requirement.
- Preserve unrelated work and existing tests. Never disable or delete a failing test merely to make CI green; diagnose and repair the underlying mismatch.
- Run the relevant tests and inspect the resulting CI jobs/artifacts before declaring success.
- Distinguish clearly between a build passing, a test passing, and a capability being proven. Do not overstate evidence.
- Do not perform cleanup outside the approved task branch lifecycle described above.
- Report the changed files, commit SHA, test evidence, remaining limitations, and any follow-up required.

## 4. Authority and conflict handling

Milad is the project owner and final decision-maker. These rules are mandatory. A high-risk task does not grant permission to create a branch by itself. If a branch, merge, force-push, destructive cleanup, or deviation from the approved workflow is contemplated, follow the explicit approval requirements above. Never treat an agent's technical preference as permission.

## 5. Session-start acknowledgement

At the beginning of each NEXIRA work session, explicitly confirm that the preflight was performed, state whether the work will remain on `main` or requires a branch proposal, and confirm that no branch will be created without Milad's prior approval. This acknowledgement is not a substitute for the checks above.
