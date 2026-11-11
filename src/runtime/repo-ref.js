import { isAbsolute, relative, resolve, sep } from "node:path";

function outsideRepo(ref) {
  return ref === ".." || ref.startsWith(`..${sep}`) || isAbsolute(ref);
}

// Runtime operations use absolute paths, but ledger/run-record references are
// durable evidence and must not capture host-specific checkout locations.
// Keep those references repository-relative and fail closed if a caller tries
// to publish something outside the repository.
export function toRepoRef(repoRoot, targetPath) {
  const root = resolve(repoRoot);
  const target = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath);
  const ref = relative(root, target);
  if (outsideRepo(ref)) {
    throw new Error("runtime reference is outside the repository");
  }
  return ref === "" ? "." : ref.split(sep).join("/");
}

// Compatibility boundary: ledgers written before repo-relative references
// contain absolute paths. They remain readable, while all newly written
// events and compacted records use toRepoRef().
export function resolveRepoRef(repoRoot, ref) {
  if (typeof ref !== "string" || ref === "") {
    throw new Error("runtime reference must be a non-empty string");
  }
  const root = resolve(repoRoot);
  const target = isAbsolute(ref) ? resolve(ref) : resolve(root, ref);
  if (outsideRepo(relative(root, target))) {
    throw new Error("runtime reference is outside the repository");
  }
  return target;
}

export function normalizeRepoRef(repoRoot, ref) {
  return toRepoRef(repoRoot, resolveRepoRef(repoRoot, ref));
}
