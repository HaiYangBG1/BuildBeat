// Mock adapter for deterministic engine tests: scripted behaviors per step,
// consumed one per attempt. Covers the failure shapes the kernel must survive
// (fail, timeout, crash, invalid output) without any real process.

export class MockScriptError extends Error {
  constructor(message) {
    super(message);
    this.name = "MockScriptError";
  }
}

const BEHAVIORS = new Set(["succeed", "fail", "timeout", "crash", "invalid-output"]);

export function createMockAdapter(script) {
  const remaining = {};
  for (const [step, behaviors] of Object.entries(script ?? {})) {
    for (const behavior of behaviors) {
      if (!BEHAVIORS.has(behavior)) {
        throw new MockScriptError(`unknown mock behavior: ${behavior}`);
      }
    }
    remaining[step] = [...behaviors];
  }
  return {
    name: "mock",
    execute({ step }) {
      const queue = remaining[step];
      if (!queue || queue.length === 0) {
        throw new MockScriptError(`mock adapter has no scripted behavior left for step: ${step}`);
      }
      const behavior = queue.shift();
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
