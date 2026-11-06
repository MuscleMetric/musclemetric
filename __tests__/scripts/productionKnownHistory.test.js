/* eslint-disable @typescript-eslint/no-require-imports */
const { stages, finiteNumber, exact, near, SCENARIOS, EXTRA } =
  require("../../scripts/e2e/production-known-history.cjs");

describe("production E2E three-stage fixture safety", () => {
  it("has separate setup, validation and cleanup stages", () => {
    expect(typeof stages.setup).toBe("function");
    expect(typeof stages.test).toBe("function");
    expect(typeof stages.cleanup).toBe("function");
  });

  it("keeps expected arithmetic completely independent from RPC calculations", () => {
    expect(SCENARIOS.map(s => s.name)).toEqual(["strength", "cardio", "mixed"]);
    expect(SCENARIOS.reduce((n, x) => n + x.volume, 0)).toBe(1215);
    expect(SCENARIOS.reduce((n, x) => n + x.distance, 0)).toBeCloseTo(8.2);
    expect(EXTRA.name).toBe("extra-cardio");
    expect(EXTRA.exercises[0].sets[0].distance).toBe(2);
  });

  it("rejects empty, missing and non-finite response metrics", () => {
    for (const value of [null, undefined, "", NaN, Infinity, "not-a-number"]) {
      expect(() => finiteNumber(value, "metric")).toThrow();
    }
    expect(finiteNumber("1215", "volume")).toBe(1215);
  });

  it("fails on a numerically wrong RPC payload instead of accepting HTTP success", () => {
    expect(() => exact(1214, 1215, "Strength volume")).toThrow("Strength volume");
    expect(() => near(7.5, 8.2, "Cardio km", 0.01)).toThrow("Cardio km");
    expect(() => near(8.20001, 8.2, "Cardio km", 0.01)).not.toThrow();
  });
});

it("prepares an empty tester without querying seeded exercise history", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-prepare-"));
  const manifest = path.join(dir, "state.json");
  const config = { MM_E2E_STATE_FILE: manifest, E2E_TESTER_EMAIL: "tester@example.test", E2E_TESTER_PASSWORD: "fixture" };
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  const rpc = jest.fn(async name => {
    if (name !== "get_progress_overview") throw Error("Unexpected preparation RPC: " + name);
    return { data: { meta: { workouts_total: 0 } } };
  });
  const client = {
    auth: {
      signInWithPassword: async () => ({ data: { user: { id: "d36d46e6-b8db-4675-843f-262e7141db00" } } }),
      signOut: jest.fn(),
    },
    rpc,
    from(table) {
      const result = { count: 0, data: [] };
      return {
        ...result, select() { return this; }, eq() { return this; }, order() { return this; },
        single: async () => ({ data: { username: "tester", active_plan_id: null, settings: {} } }),
        limit: async () => ({ data: [{ id: table + "-fixture" }] }),
      };
    },
  };
  try {
    Object.assign(process.env, config);
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@supabase/supabase-js", () => ({ createClient: () => client }));
      await require("../../scripts/e2e/production-known-history.cjs").stages.prepare();
    });
    expect(rpc.mock.calls).toEqual([["get_progress_overview"]]);
    expect(JSON.parse(fs.readFileSync(manifest, "utf8")).workouts).toHaveLength(4);
  } finally {
    jest.dontMock("@supabase/supabase-js");
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
