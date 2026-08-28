// Mock adapter for deterministic engine tests: scripted behaviors per step,
// consumed one per attempt. Covers the failure shapes the kernel must survive
// (fail, timeout, crash, invalid output) without any real process. An entry
// may be a plain behavior string or { behavior, envelope } to also return a
// worker output envelope (e.g. reviewer findings).

export class MockScriptError extends Error {
  constructor(message) {
    super(message);
    this.name = "MockScriptError";
  }
}

const BEHAVIORS = new Set(["succeed", "fail", "timeout", "crash", "invalid-output"]);

export function createMockAdapter(script) {
  const remaining = {};
  for (const [step, entries] of Object.entries(script ?? {})) {
    for (const entry of entries) {
      const behavior = typeof entry === "string" ? entry : entry.behavior;
      if (!BEHAVIORS.has(behavior)) {
        throw new MockScriptError(`unknown mock behavior: ${behavior}`);
      }
    }
    remaining[step] = [...entries];
  }
  return {
    name: "mock",
    execute({ step }) {
      const queue = remaining[step];
      if (!queue || queue.length === 0) {
        throw new MockScriptError(`mock adapter has no scripted behavior left for step: ${step}`);
      }
      const entry = queue.shift();
      const behavior = typeof entry === "string" ? entry : entry.behavior;
      const envelope = typeof entry === "string" ? undefined : entry.envelope;
      const startedAt = new Date().toISOString();
      const finishedAt = startedAt;
      const base = {
        adapter: "mock",
        command: `mock:${step}:${behavior}`,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnError: null,
        startedAt,
        finishedAt,
        envelope,
      };
      switch (behavior) {
        case "succeed":
          return { ...base, exitCode: 0 };
        case "fail":
          return { ...base, exitCode: 1, stderr: "mock failure" };
        case "timeout":
          return { ...base, exitCode: null, timedOut: true };
        case "crash":
          return { ...base, exitCode: null, signal: "SIGKILL" };
        case "invalid-output":
          return { ...base, exitCode: 0, stdout: "not-a-valid-worker-envelope" };
        default:
          throw new MockScriptError(`unreachable behavior: ${behavior}`);
      }
    },
  };
}
