const { sourceConstant, verifyWorkoutRpc, assertWorkoutSaveContract, assertWorkoutSaveReleaseContract } = require("../../scripts/verify-production-workout-rpc.cjs");

const config = { url: "https://example.supabase.co", anonKey: "public-anon-test-key" };
function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("extracts the public app config from its source", () => {
  expect(sourceConstant('const SUPABASE_URL = "https://example.supabase.co";', "SUPABASE_URL"))
    .toBe("https://example.supabase.co");
});

test("accepts an existing workout RPC which rejects anonymous execute", async () => {
  const fetchImpl = jest.fn(async () => response(401, {
    code: "42501", message: "permission denied for function save_completed_workout_v2",
  }));
  await expect(verifyWorkoutRpc({ ...config, fetchImpl })).resolves.toBe(true);
  expect(fetchImpl).toHaveBeenCalledWith(
    "https://example.supabase.co/rest/v1/rpc/save_completed_workout_v2",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ p_workout: {}, p_expected_user_id: null }),
    }),
  );
});

test("blocks release if production has not applied the new function migration", async () => {
  const fetchImpl = async () => response(404, {
    code: "PGRST202", message: "Could not find the function in the schema cache",
  });
  await expect(verifyWorkoutRpc({ ...config, fetchImpl })).rejects.toThrow(/missing save_completed_workout_v2/);
});

test("blocks release if anonymous users can execute workout saves", async () => {
  const fetchImpl = async () => response(200, "saved-workout-id");
  await expect(verifyWorkoutRpc({ ...config, fetchImpl })).rejects.toThrow(/Release blocked/);
});

test("blocks release for bad credentials or unexpected backend errors", async () => {
  const fetchImpl = async () => response(401, { code: "PGRST301", message: "Invalid JWT" });
  await expect(verifyWorkoutRpc({ ...config, fetchImpl })).rejects.toThrow(/Release blocked/);
});

test("the shipped app callsite and repository migrations match the live preflight contract", () => {
  expect(assertWorkoutSaveReleaseContract()).toBeUndefined();
});

test("a future workout-save v3 call must fail release preflight until explicitly checked", () => {
  const modified = 'await supabase.rpc("save_completed_workout_v3", { p_workout: payload, p_expected_user_id: owner });';
  expect(() => assertWorkoutSaveContract(modified)).toThrow(/Update and validate the preflight before release/);
});

test("a renamed RPC argument blocks release even if the endpoint name is unchanged", () => {
  const modified = 'await supabase.rpc("save_completed_workout_v2", { p_workout: payload, p_owner: owner });';
  expect(() => assertWorkoutSaveContract(modified)).toThrow(/Update and validate the preflight before release/);
});

test("a dynamically resolved save RPC is not silently exempted from production checks", () => {
  expect(() => assertWorkoutSaveContract('await supabase.rpc(dynamicName, { p_workout: payload });'))
    .toThrow(/exactly one static Supabase RPC call/);
});
