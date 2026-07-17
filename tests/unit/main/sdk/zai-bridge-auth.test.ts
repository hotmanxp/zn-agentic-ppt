import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic SDK so the bridge can be exercised without a real
// network round-trip. The mock records every constructor invocation and
// returns a per-instance stream object with a `controller.abort` handle.
interface CapturedClient {
  apiKey: string;
  baseURL: string;
  opts: unknown;
}

const clients: CapturedClient[] = [];
const streamAbortControllers: AbortController[] = [];
// Captured stream call args so we can assert req.model is passed through unchanged.
const capturedStreamArgs: unknown[][] = [];

vi.mock("@anthropic-ai/sdk", () => {
  // Each `messages.stream` call returns an async iterable whose first
  // `for await` iteration yields a synthetic event and then returns.
  class FakeStream {
    controller = new AbortController();
    async *[Symbol.asyncIterator]() {
      yield {
        type: "message_start",
        message: { id: "msg_test", model: "test-model" },
      };
    }
  }
  class FakeAnthropic {
    public apiKey: string;
    public baseURL: string;
    public opts: unknown;
    constructor(opts: { apiKey: string; baseURL: string }) {
      this.apiKey = opts.apiKey;
      this.baseURL = opts.baseURL;
      this.opts = opts;
      clients.push({ apiKey: opts.apiKey, baseURL: opts.baseURL, opts });
    }
    messages = {
      stream: (args: unknown[]) => {
        capturedStreamArgs.push(args);
        const s = new FakeStream();
        streamAbortControllers.push(s.controller);
        return s;
      },
    };
  }
  return { default: FakeAnthropic };
});

import {
  createModelCaller,
  initializeOpenPlatformAuth,
  resolveLlmCredentials,
  setOpenPlatformEnabled,
  withOpenPlatformMode,
} from "../../../../src/main/sdk/zai-bridge.js";
import { OPEN_PLATFORM_BASE_URL } from "../../../../src/shared/types.js";

const manual = { baseUrl: "https://manual.example.com", apiKey: "manual-key" };
const EMPTY_REQ = {
  model: "test-model",
  systemPrompt: "you are a test",
  messages: [{ role: "user" as const, content: "ping" }],
  tools: [],
  signal: new AbortController().signal,
};

async function drain(caller: ReturnType<typeof createModelCaller>): Promise<void> {
  // The mocked stream yields exactly one event before terminating.
  for await (const _ of caller(EMPTY_REQ)) {
    // drain
  }
}

describe("open platform authentication", () => {
  let dir: string;
  let credentialPath: string;

  beforeEach(async () => {
    clients.length = 0;
    streamAbortControllers.length = 0;
    capturedStreamArgs.length = 0;
    dir = await mkdtemp(join(tmpdir(), "znap-open-auth-"));
    credentialPath = join(dir, "openAuth2.json");
    await initializeOpenPlatformAuth(false, join(dir, "missing.json"));
  });

  afterEach(async () => {
    setOpenPlatformEnabled(false);
    await rm(dir, { recursive: true, force: true });
  });

  it("uses manual credentials when the switch is disabled", () => {
    expect(resolveLlmCredentials(manual)).toEqual(manual);
  });

  it("uses the fixed URL and trimmed startup token when enabled", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "  token-a  " }));
    await initializeOpenPlatformAuth(true, credentialPath);

    expect(resolveLlmCredentials(manual)).toEqual({
      baseUrl: OPEN_PLATFORM_BASE_URL,
      apiKey: "token-a",
    });
    // Spec deviation (4): assert the fixed URL against its literal value.
    expect(OPEN_PLATFORM_BASE_URL).toBe("https://zn-nova.paic.com.cn/novai");
  });

  it("keeps the cached token until startup initialization runs again", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "token-a" }));
    await initializeOpenPlatformAuth(true, credentialPath);
    await writeFile(credentialPath, JSON.stringify({ access_token: "token-b" }));

    expect(resolveLlmCredentials(manual).apiKey).toBe("token-a");

    await initializeOpenPlatformAuth(true, credentialPath);
    expect(resolveLlmCredentials(manual).apiKey).toBe("token-b");
  });

  it.each([
    ["missing file", null, "凭据文件不存在"],
    ["invalid json", "{secret-token", "凭据文件不是有效 JSON"],
    ["null root", "null", "凭据字段缺失或无效"],
    ["missing field", "{}", "凭据字段缺失或无效"],
    ["non-string field", '{"access_token":123}', "凭据字段缺失或无效"],
    ["blank field", '{"access_token":"   "}', "凭据字段缺失或无效"],
  ])("reports a safe error for %s", async (_name, content, reason) => {
    if (content !== null) await writeFile(credentialPath, content);
    await initializeOpenPlatformAuth(true, credentialPath);

    let message = "";
    try {
      resolveLlmCredentials(manual);
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain(reason);
    expect(message).toContain("~/.nova/openAuth2.json");
    expect(message).toContain("完全重启应用");
    // Spec deviation (5): the test path/token-like strings/manual key must
    // never leak into the user-facing error message.
    expect(message).not.toContain("secret-token");
    expect(message).not.toContain("manual-key");
    expect(message).not.toContain(dir);
    expect(message).not.toContain(credentialPath);
  });

  it("normalizes non-ENOENT read failures without exposing system details", async () => {
    // `credentialPath` is created as a directory so `readFile` throws EISDIR.
    // The catch branch must collapse it to the safe Chinese reason without
    // leaking the path, the errno, the syscall, or the manual API key.
    await mkdir(credentialPath);
    await initializeOpenPlatformAuth(true, credentialPath);

    let message = "";
    try {
      resolveLlmCredentials(manual);
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain("无法读取凭据文件");
    expect(message).toContain("~/.nova/openAuth2.json");
    expect(message).toContain("完全重启应用");
    expect(message).not.toContain("EISDIR");
    expect(message).not.toContain("readFile");
    expect(message).not.toContain(dir);
    expect(message).not.toContain(credentialPath);
    expect(message).not.toContain("manual-key");
  });

  it("uses an async-local override without changing the persisted runtime mode", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "open-token" }));
    await initializeOpenPlatformAuth(false, credentialPath);

    const tested = await withOpenPlatformMode(true, async () =>
      resolveLlmCredentials(manual),
    );

    expect(tested).toEqual({
      baseUrl: OPEN_PLATFORM_BASE_URL,
      apiKey: "open-token",
    });
    expect(resolveLlmCredentials(manual)).toEqual(manual);
  });

  it("allows a manual request override while the persisted mode is enabled", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "open-token" }));
    await initializeOpenPlatformAuth(true, credentialPath);

    const tested = await withOpenPlatformMode(false, async () =>
      resolveLlmCredentials(manual),
    );

    expect(tested).toEqual(manual);
    expect(resolveLlmCredentials(manual).apiKey).toBe("open-token");
  });
});

// ---------------------------------------------------------------------------
// Spec deviation (3): exercise the actual modelCaller generator — lazy
// construction, single-caller reuse under both modes, concurrent opposite
// modes without cross-contamination, runtime credential errors, and the
// guarantee that `req.model` is unchanged.
// ---------------------------------------------------------------------------

describe("createModelCaller generator", () => {
  let dir: string;
  let credentialPath: string;

  beforeEach(async () => {
    clients.length = 0;
    streamAbortControllers.length = 0;
    capturedStreamArgs.length = 0;
    dir = await mkdtemp(join(tmpdir(), "znap-model-caller-"));
    credentialPath = join(dir, "openAuth2.json");
    await initializeOpenPlatformAuth(false, join(dir, "missing.json"));
  });

  afterEach(async () => {
    setOpenPlatformEnabled(false);
    await rm(dir, { recursive: true, force: true });
  });

  it("defers Anthropic client construction until the generator runs", async () => {
    const caller = createModelCaller(manual);
    // Lazy: the factory must not build a client eagerly.
    expect(clients).toHaveLength(0);
    // Constructing the generator does not run the body; drain to trigger it.
    await drain(caller);
    expect(clients).toHaveLength(1);
  });

  it("selects the correct credentials for one reused caller under both modes", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "open-token" }));
    await initializeOpenPlatformAuth(true, credentialPath);

    const caller = createModelCaller(manual);

    // First call: persisted mode is true → open-platform credentials.
    await drain(caller);
    expect(clients[0].baseURL).toBe(OPEN_PLATFORM_BASE_URL);
    expect(clients[0].apiKey).toBe("open-token");

    // Second call: persisted mode is unchanged; override scopes this call.
    await withOpenPlatformMode(false, () => drain(caller));
    expect(clients[1].baseURL).toBe(manual.baseUrl);
    expect(clients[1].apiKey).toBe(manual.apiKey);

    // Third call: persisted mode is still true after the override ended.
    await drain(caller);
    expect(clients[2].baseURL).toBe(OPEN_PLATFORM_BASE_URL);
    expect(clients[2].apiKey).toBe("open-token");
  });

  it("does not cross-contaminate concurrent callers under opposite modes", async () => {
    await writeFile(credentialPath, JSON.stringify({ access_token: "open-token" }));
    await initializeOpenPlatformAuth(true, credentialPath);

    const caller = createModelCaller(manual);

    const openRun = withOpenPlatformMode(true, () => drain(caller));
    const manualRun = withOpenPlatformMode(false, () => drain(caller));

    const [openClient, manualClient] = await Promise.all([
      openRun.then(() => clients[0]),
      manualRun.then(() => clients[1]),
    ]);

    expect(openClient.baseURL).toBe(OPEN_PLATFORM_BASE_URL);
    expect(openClient.apiKey).toBe("open-token");
    expect(manualClient.baseURL).toBe(manual.baseUrl);
    expect(manualClient.apiKey).toBe(manual.apiKey);
  });

  it("surfaces missing-file auth error at runtime invocation", async () => {
    // Persisted mode is enabled but no credential file exists (ENOENT).
    await initializeOpenPlatformAuth(true, join(dir, "missing.json"));

    const caller = createModelCaller(manual);

    await expect(drain(caller)).rejects.toThrow(/凭据文件不存在/);
    // No client should have been constructed because resolution threw first.
    expect(clients).toHaveLength(0);
  });

  it("surfaces unreadable-file auth error at runtime invocation", async () => {
    // Credential file exists but is a directory (EISDIR / non-ENOENT read failure).
    await mkdir(credentialPath);
    await initializeOpenPlatformAuth(true, credentialPath);

    const caller = createModelCaller(manual);

    await expect(drain(caller)).rejects.toThrow(/无法读取凭据文件/);
    // No client should have been constructed because resolution threw first.
    expect(clients).toHaveLength(0);
  });

  it("does not mutate req.model when forwarding to the Anthropic stream", async () => {
    // Open-platform mode is disabled (persisted false), so the manual caller
    // should reach the mocked stream and the model must be passed through.
    await initializeOpenPlatformAuth(false, join(dir, "missing.json"));

    const caller = createModelCaller(manual);
    const customReq = { ...EMPTY_REQ, model: "claude-special-2026" };

    capturedStreamArgs.length = 0;
    // Drain the generator with customReq to capture the actual stream call.
    for await (const _ of caller(customReq)) {
      // drain
    }
    expect(clients[0].apiKey).toBe(manual.apiKey);
    // Assert the captured stream args contain the model unchanged.
    expect(capturedStreamArgs.length).toBe(1);
    expect((capturedStreamArgs[0] as { model?: string }).model).toBe("claude-special-2026");
  });
});