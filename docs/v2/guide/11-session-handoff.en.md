# Session handoffs: close the chat, keep the work

[简体中文](11-session-handoff.md) | **English**

BuildBeat uses project files, Git, and run ledgers to continue work. A fresh session reads those facts to decide whether to proceed, recover an interrupted Run, handle a pending decision, or prepare the next Run for the same Work. The person taking over can be you or another teammate. The handoff does not need the old chat transcript, and it does not automatically save discussion that exists only in that chat.

## Before closing the old session

Tell the current session:

> I am switching sessions. Save context needed to continue that is still only in this chat. Check the current Work, candidate, unverified items, pending decisions, and run state.

The session should check that:

- Goals, scope, acceptance criteria, and decisions have a clear home in project files. Recording facts must not rewrite approvals or turn an unaccepted idea into an accepted plan.
- Candidate commits, uncommitted changes, verification evidence, and the next step are identifiable. Save necessary environment facts in the Work's `env-facts.md`; reference the source of secrets without copying their values into project records.
- `overview`, `inbox`, and `status` reflect the actual state. If a Run is active, explain whether its process is detached from the driving session. State uncertainty when this cannot be confirmed.
- Project records and candidate branches are committed and synchronized under existing authorization when another machine or collaborator needs them. Saved to disk does not mean committed or pushed.

When these facts are already saved, each handoff does not need another long report. Removing a chat should retain the project directory, run ledger, and worktree. Some tools also remove temporary workspaces when deleting a task; check what the operation actually removes.

## Taking over in a new session

Open a fresh session in the **same project directory**. Load the BuildBeat Skill and the project's `AGENTS.md` using the target tool's supported mechanism, then say:

> Continue this project. Read its BuildBeat entry point and active work first. Check Git, progress, verification results, and pending decisions, then proceed within existing authorization.

The session reads current facts first:

```bash
buildbeat-v2 overview --repo .
buildbeat-v2 inbox --repo .
```

It then reads the goal, plan, decisions, and configuration under the relevant `delivery/work/<ID>/`. For active Run details, use `status --repo . --run <RUN-ID>`. Read IDs from actual output rather than guessing from a conversation.

| Observed state | Next action |
|---|---|
| A Run is executing normally | Observe it; avoid starting a duplicate or modifying its worktree |
| A Run awaits a human decision | Show the current subject and evidence; a new session does not create a missing approval or renew a stale one |
| The Runner was interrupted; its ledger and worktree remain | Inspect the state and follow recovery guidance, then `resume --config <configuration-path>`; the interrupted step may run again |
| Dirty worktree, changed configuration, stale approval, or missing state | Explain the specific difference and follow the runtime's handling; do not claim lossless recovery |
| A Run is terminal, but its Work needs another execution | Prepare the next Run from existing artifacts and the candidate; terminal Runs do not reopen |
| The work is already merged or released | Read back Git or release facts; do not repeat work because an earlier Run was canceled |

Recovery approval and the final merge decision are distinct actions. See [approvals](07-approval-guide.md) and [run recovery](10-recovery.md) (Chinese).

## Another teammate takes over

The person handing over saves shared goals, plans, decisions, acceptance records, and the next step in project files, synchronizes them with the shared repository under existing authorization, and makes candidate commits reachable. Record who will carry the Work forward, whether its original Run is still active, and where it is executing. Actual readback remains authoritative for run state.

Once granted project access, the next teammate syncs the relevant files and candidate branches, loads the project entry point, and uses their own AI tool to inspect scope, evidence, pending decisions, and environment. Existing valid decisions remain in effect. Taking over does not automatically grant someone else's merge, release, or credential permissions.

If the original Run is not terminal, check its execution environment first. An empty `overview` or `inbox` on a new machine does not show that the old machine has no active Run. Local locks do not coordinate different machines or Git clones; do not start duplicate work on that basis. Before executing in a new environment, settle how the original Run will be handled, then prepare subsequent execution from synchronized artifacts and candidates.

Teammates can own separate end-to-end work packages or hand over the same package. Product, development, testing, and review are AI perspectives each teammate may use; both the person and the perspective can change. Access control relies on existing repository hosting, execution platforms, and team authorization agreements. BuildBeat does not add a member account or permission system.

## Changing tools, models, and perspectives

Project artifacts are readable files that different tools can consume. The new tool needs the entry point, access to the same project, and suitable permissions. Execution Workers also need a compatible command, authentication, and output contract. The external AI tool selects the model.

Product, development, testing, and review perspectives read the same Work's goal, constraints, and evidence, and follow their own write boundaries. Changing perspective does not change accepted scope or require duplicating progress documents. The current runtime supports one active Run per repository.

This explains protocol continuity, not proof that every tool combination has passed a real handoff. See the [capability matrix](../../CAPABILITY-MATRIX.md) for existing evidence and the [adapter guide](04-adapter-guide.md) for integration requirements (Chinese).

## Moving machines versus recovering a Run

| Retained or synchronized content | What it supports | What it does not establish |
|---|---|---|
| Committed Work artifacts, decisions, standards, and terminal records | Reading durable project facts on another machine | Raw execution logs and active checkpoints were also synchronized |
| Candidate branches and their commits | Reading candidate code, diffs, and merge status | An ordinary clone fetched a branch that exists only on the old machine |
| Local runtime and the matching worktree | Inspecting and recovering an active Run in its original environment | Copying files to another path migrates an executing process |

`.buildbeat/runtime/` contains active ledgers and raw logs; `.buildbeat/worktrees/` contains working trees. Both are normally excluded from Git. After runtime cleanup, Git-managed facts can support further project work, but exact active-Run recovery and raw logs are no longer assured. A terminal record's log digest cannot reconstruct the log text.

To take over elsewhere, synchronize project facts and candidates, prepare tools and environment, and decide where execution should resume. BuildBeat does not currently automate active-Run migration between machines.

## Verifying a real handoff

Choose a small task with an existing verification command. Session A saves a goal and plan, then executes to an identifiable state. Record the Work, candidate, verification result, and pending decision. Close the chat. Give a fresh session B only the project location and a request to continue, without the old conversation history. For a team handoff, have another authorized teammate sync the files and candidate, then perform this step using their own tool.

Check whether B reads the same goal, state, and next step from project files and tools, then continues within existing authorization. Record tool and model versions, files read, actual commands, and the outcome. Verify combinations of tools, teammates, and machines individually. An illustrative conversation is not that evidence.

Existing `tests/v2-resume.test.js`, `tests/v2-approval.test.js`, and `tests/v2-overview-stages.test.js` cover recovery and state mechanisms. They do not constitute model-behavior acceptance for a real fresh-session handoff.
