import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "../../src/index.js";

// Hand-written. VERSION is generated into src/meta.ts from package_version in
// packages/sdk-codegen/wuapi.sdk.toml; npm publishes package.json's version.
// Bump both together and run `bun run codegen` (see RELEASING.md).
describe("VERSION", () => {
  it("equals the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
