const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

function loadConfig(nodeEnv, secret) {
  const env = { ...process.env, NODE_ENV: nodeEnv };
  if (secret == null) delete env.JWT_SECRET;
  else env.JWT_SECRET = secret;
  return spawnSync(process.execPath, ["-e", 'require("./src/config"); process.stdout.write("loaded")'], {
    cwd: require("node:path").join(__dirname, ".."),
    env,
    encoding: "utf8",
  });
}

describe("production JWT configuration", () => {
  it("rejects a missing, short, default, or repetitive signing secret before startup", () => {
    for (const secret of [undefined, "short-secret", "bj-outdoor-trip-dev-secret-change-me", " ".repeat(32), "abc123".repeat(8)]) {
      const result = loadConfig("production", secret);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /生产环境必须设置至少 32 位的随机 JWT_SECRET/);
      assert.equal(result.stdout, "");
    }
  });

  it("accepts a sufficiently random production secret and keeps development defaults available", () => {
    const production = loadConfig("production", "4b6e129a78965ac7d8f2c6b0835e0f149a23edc17b995d65e663acfbb6581140");
    assert.equal(production.status, 0);
    assert.equal(production.stdout, "loaded");
    const development = loadConfig("development");
    assert.equal(development.status, 0);
    assert.equal(development.stdout, "loaded");
  });
});
