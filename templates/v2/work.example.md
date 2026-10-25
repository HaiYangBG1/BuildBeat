# The result in one line

## Goal
What people will see when this is done, and why it matters now.

## Why now
Who asked, when, and what they said, in their own words; what triggered it (a report, a leftover from another work). Search the closed works' result.md first and name the ones this builds on. Delete this section if there is nothing to say.
Link related works and external ids one per line; status strings linked works into one thread and finds them again by ref:
- follows: <work id this one continues, corrects or replaces>
- split from: <work id this one was split off from>
- related: <work id>
- ref: <task, decision or merge request id>


## Facts checked (<date>, on <commit>)
- Confirmed: what the code, configuration, records or a command showed, each with where it came from (file, commit, command output).
- To confirm: what nobody has seen yet, and who confirms it when (during the run, after the release, a person).

## Scope
In: the changes this work makes.
Out: what it deliberately leaves alone.

## Decisions before starting
Accepting this work.md takes every recommendation; change a row before accepting to choose otherwise.

| # | Question | Recommended | Alternative and its cost |
|---|---|---|---|
| 1 | | | |

Names people will see (commands, options, files, messages, interface text), written exactly as they will appear.

## Acceptance
Checked by machine: observable results and the real commands that check them.
Confirmed by a person: what only a person or production can confirm.

## Implementation plan
The smallest sequence of steps that reaches the acceptance.

## Stop conditions
When to stop and ask instead of guessing: a fact turns out different, the scope has to grow, something irreversible comes up. The review-round budget lives in run-config.yaml.
