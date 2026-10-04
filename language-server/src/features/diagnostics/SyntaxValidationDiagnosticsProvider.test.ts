import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../../test/TestClient.ts";

describe("Syntax Validation", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("invalid JSON syntax returns a diagnostic", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("valid JSON Syntax should not return a diagnostic", async () => {
    await client.writeDocument("test.json", `{ "Name": "Foo" }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  test("after fixing invalid JSON Syntax, it should not return a diagnostic", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const initialValidation = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation = client.getDiagnostics("test.json");
    await client.changeDocument("test.json", `{ "Name": "Foo" }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });

  test("diagnostic has a human readable message", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toMatchObject([{ message: "Expected a value" }]);
  });

  test("diagnostic message includes the invalid text", async () => {
    await client.writeDocument("test.json", `{ "name": 01 }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toMatchObject([{ message: "'01' is not a valid number" }]);
  });
});

describe("Syntax Validation locale", () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("uses the locale given by the client", async () => {
    await client.start({ locale: "en-US" });

    await client.writeDocument("test.json", `{ "name": }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toMatchObject([{ message: "Expected a value" }]);
  });

  test("falls back to en-US when the locale is not supported", async () => {
    await client.start({ locale: "xx-XX" });

    await client.writeDocument("test.json", `{ "name": }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toMatchObject([{ message: "Expected a value" }]);
  });
});
