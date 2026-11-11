// What a person can do next about a run that waits for them: the exact
// commands to copy, shared by `review`, `status` and its pending list so
// "what do I say now" has one answer.

import { currentScreenshots } from "../policy/policy.js";

// Screenshot evidence recorded for a commit: what a person deciding on a UI
// change should look at. References and digests only, never the images.
export function candidateScreenshots(state, candidate) {
  if (!candidate) {
    return [];
  }
  return currentScreenshots(state.evidence ?? [], candidate).map((item) => ({
    ref: item.ref,
    digest: item.digest,
  }));
}

export function nextReply({ repoLabel, state }) {
  const pending = state.pendingHuman;
  if (!pending || !state.run) {
    return [];
  }
  // A run this version did not start (5.x and earlier): it cannot be
  // continued or decided here.
  if (!state.run.pass) {
    return [
      `${state.run.id} was started by an earlier BuildBeat: finish or stop it with that version, then review the commit with buildbeat review --repo ${repoLabel} --work ${state.run.work}`,
    ];
  }
  const work = state.run.work;
  const approve = `buildbeat decide --repo ${repoLabel} --work ${work} --action approve --candidate ${pending.subject.candidate} --by <you>`;
  const reject = `buildbeat decide --repo ${repoLabel} --work ${work} --action reject --reason <why> --by <you>`;
  const lastReview = [...(state.evidence ?? [])].reverse().find((item) => item.kind === "review");
  // While blocking findings stand the approval is refused, so what to do
  // about them comes first.
  if (lastReview?.status === "failed") {
    return [
      `buildbeat review --repo ${repoLabel} --work ${work}   # after committing a fix: reviews the new commit and supersedes this one`,
      `buildbeat decide --repo ${repoLabel} --work ${work} --fingerprint <fp> --action accept|dismiss --by <you>`,
      `${approve}   # refused while a blocking finding stands`,
      reject,
    ];
  }
  return [approve, reject];
}

export function formatMs(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return "?";
  }
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}m`;
}
