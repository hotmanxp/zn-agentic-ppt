import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getCacheDir,
  getDataRoot,
  getLogsDir,
  getProjectsDir,
  getSettingsPath,
} from "../../../../src/main/fs/paths.js";

describe("paths", () => {
  it("getDataRoot returns ~/.zn-agentic-ppt", () => {
    expect(getDataRoot()).toBe(join(homedir(), ".zn-agentic-ppt"));
  });
  it("getProjectsDir is dataRoot/projects", () => {
    expect(getProjectsDir()).toBe(join(getDataRoot(), "projects"));
  });
  it("getSettingsPath is dataRoot/settings.json", () => {
    expect(getSettingsPath()).toBe(join(getDataRoot(), "settings.json"));
  });
  it("getLogsDir is dataRoot/logs", () => {
    expect(getLogsDir()).toBe(join(getDataRoot(), "logs"));
  });
  it("getCacheDir is dataRoot/cache", () => {
    expect(getCacheDir()).toBe(join(getDataRoot(), "cache"));
  });
});
