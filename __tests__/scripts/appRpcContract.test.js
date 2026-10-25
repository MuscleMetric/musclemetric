const fs = require("node:fs");
const path = require("node:path");
const { discoverRpcCalls, verifyAuthenticatedRpcCatalogue } =
  require("../../scripts/e2e/verify-app-rpc-contract.cjs");

test("discovers real backend RPC usages in the app", () => {
  const { calls } = discoverRpcCalls();
  const names = calls.map((x) => x.name);
  expect(names).toContain("save_completed_workout_v2");
  expect(names).toContain("get_exercise_deep_analytics");
  expect(names).toContain("create_plan_v1");
  expect(names).toContain("update_full_plan");
  expect(names).toContain("get_workout_history_detail");
  expect(new Set(names).size).toBe(names.length);
});

test("never executes arbitrary functions when checking the schema", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ paths: { "/rpc/create_plan_v1": { post: {} } } }),
  });
  await expect(verifyAuthenticatedRpcCatalogue({
    url: "http://127.0.0.1:54321",
    anonKey: "test-anon", accessToken: "test-user-jwt", fetchImpl,
    inventory: { calls: [{ name: "create_plan_v1", files: ["app/plans.tsx"] }], dynamic: [] },
  })).resolves.toMatchObject({ verified: 1 });
  expect(fetchImpl).toHaveBeenCalledWith(
    "http://127.0.0.1:54321/rest/v1/",
    expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/openapi+json" }),
    }),
  );
});

test("fails when an app RPC has not been deployed", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ paths: { "/rpc/other_rpc": {} } }),
  });
  await expect(verifyAuthenticatedRpcCatalogue({
    url: "http://localhost:54321",
    anonKey: "test-anon", accessToken: "test-user-jwt", fetchImpl,
    inventory: { calls: [{ name: "create_plan_v1", files: ["app/plans.tsx"] }], dynamic: [] },
  })).rejects.toThrow("App RPCs missing");
});

test("rejects production OpenAPI requests before any network call, even with the old override", async () => {
  const fetchImpl = jest.fn();
  await expect(verifyAuthenticatedRpcCatalogue({
    url: "https://cpzgnhchdpkxnebjsyyi.supabase.co",
    anonKey: "test-anon", accessToken: "test-user-jwt",
    productionReadOnly: true, fetchImpl,
    inventory: { calls: [], dynamic: [] },
  })).rejects.toThrow("Refusing to write E2E workouts");
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("live production E2E checks real RPCs rather than the restricted OpenAPI catalogue", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../scripts/e2e/live-tester-workout-flow.cjs"), "utf8",
  );
  expect(source).not.toContain("verifyAuthenticatedRpcCatalogue");
  expect(source).not.toContain("fetch(");
  expect(source).toContain('client.rpc("save_completed_workout_v2"');
  expect(source).toContain('client.rpc("get_workout_history_detail"');
  expect(source).toContain('client.rpc("get_workout_history_feed"');
  expect(source).toContain('client.rpc("get_exercise_deep_analytics"');
  expect(source).toContain("CLEANUP FAILURE:");
});
