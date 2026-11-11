# Talk to your session

[简体中文](00-how-to-talk.md)

| You say | The session does |
|---|---|
| Continue this project | Reads the project entry file and the work records, looks at `status`, and says where each work stands and what is waiting for your decision |
| Prepare this feature | Writes a work.md: goal, why now, facts checked, scope, decisions before starting, acceptance, plan, stop conditions |
| Accept, start | Records your acceptance, then writes the code and commits it itself |
| Send it for review | Hands the commit to the runtime: it runs the project's verification and has a read-only AI that took no part in writing it review it |
| Where are we, what needs my decision? | Lists this commit's verification result, the review findings and the decisions waiting for you |
| This finding needs no change | Records your ruling and the reason; the same finding does not block again |
| Approve / reject | Records your decision on this commit; an approval only means it is ready to merge |
| Switch sessions | Writes facts not yet on disk into the project; the new session carries on from the project records |

Merge, push, deployment and publication each need their own authorization.

For a main repository with several code repositories, look at them together with `buildbeat status --repo . --all-repos`; see [Session handoff](11-session-handoff.en.md).
