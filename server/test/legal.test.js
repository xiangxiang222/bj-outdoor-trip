const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { VERSION, legalBundle } = require("../src/services/legal");

const KEYS = ["LEGAL_PUBLISHED", "LEGAL_REVIEWED_VERSION", "LEGAL_EFFECTIVE_DATE", "LEGAL_OPERATOR_NAME", "LEGAL_OPERATOR_ADDRESS", "LEGAL_PRIVACY_EMAIL", "LEGAL_PRIVACY_PHONE"];
const RealDate = Date;

describe("authoritative legal bundle publication configuration", () => {
  let previous;
  beforeEach(() => {
    previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
    for (const key of KEYS) delete process.env[key];
    // UTC is still November 1; publication must use the November 2 China date.
    global.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ["2026-11-01T16:30:00.000Z"])); }
      static now() { return RealDate.parse("2026-11-01T16:30:00.000Z"); }
    };
  });
  afterEach(() => {
    global.Date = RealDate;
    for (const key of KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  function configure() {
    Object.assign(process.env, { LEGAL_PUBLISHED: "1", LEGAL_REVIEWED_VERSION: VERSION, LEGAL_EFFECTIVE_DATE: "2026-11-01", LEGAL_OPERATOR_NAME: "测试运营主体", LEGAL_OPERATOR_ADDRESS: "测试联系地址", LEGAL_PRIVACY_EMAIL: "privacy@example.invalid" });
  }

  it("defaults to a clearly marked draft containing all seven complete documents", () => {
    const value = legalBundle();
    assert.equal(value.status, "draft");
    assert.equal(value.effectiveAt, null);
    assert.match(value.notice, /审阅版.*不生成协议接受记录/);
    assert.equal(value.version, VERSION);
    assert.deepEqual(value.documents.map((document) => document.id), ["privacy", "terms", "collection", "sharing", "permissions", "sensitive", "cancellation"]);
    for (const document of value.documents) {
      assert.ok(document.title && document.summary && document.sections.length);
      assert.equal(new Set(document.sections.map((section) => section.id)).size, document.sections.length);
      for (const section of document.sections) {
        assert.ok(section.id && section.title);
        assert.ok(Array.isArray(section.paragraphs) && Array.isArray(section.entries) && Array.isArray(section.links));
        assert.ok(section.paragraphs.length || section.entries.length || section.links.length);
      }
    }
  });

  it("requires explicit publication and review of the current version", () => {
    configure();
    assert.equal(legalBundle().status, "published");
    for (const [key, invalid] of [["LEGAL_PUBLISHED", ""], ["LEGAL_PUBLISHED", "true"], ["LEGAL_REVIEWED_VERSION", ""], ["LEGAL_REVIEWED_VERSION", "2026-10-31"]]) {
      const previous = process.env[key];
      process.env[key] = invalid;
      assert.equal(legalBundle().status, "draft", `${key}=${invalid}`);
      process.env[key] = previous;
    }
  });

  it("fails closed without a usable public address and an email or phone", () => {
    configure();
    process.env.LEGAL_OPERATOR_ADDRESS = "  ";
    assert.equal(legalBundle().status, "draft");
    process.env.LEGAL_OPERATOR_ADDRESS = "测试联系地址";
    for (const email of ["", "invalid", "missing-domain@", "space in@example.invalid"]) {
      process.env.LEGAL_PRIVACY_EMAIL = email;
      assert.equal(legalBundle().status, "draft");
    }
    process.env.LEGAL_PRIVACY_PHONE = "010-12345678";
    assert.equal(legalBundle().status, "published");
    for (const phone of ["telephone", "------", "((((((", "123---", "１２３４５６７８"]) {
      process.env.LEGAL_PRIVACY_PHONE = phone;
      assert.equal(legalBundle().status, "draft", phone);
    }
    process.env.LEGAL_PRIVACY_EMAIL = "privacy@example.invalid";
    assert.equal(legalBundle().status, "published");
  });

  it("rejects missing, malformed, impossible, future and pre-version effective dates", () => {
    configure();
    for (const date of ["", "2026-2-01", "2026-02-30", "2026-11-03", "2026-10-31", "2026-11-01T00:00:00Z"]) {
      process.env.LEGAL_EFFECTIVE_DATE = date;
      const value = legalBundle();
      assert.equal(value.status, "draft", date);
      assert.equal(value.effectiveAt, null);
    }
  });

  it("uses the China calendar date at the UTC boundary and exposes reviewed contacts", () => {
    configure();
    process.env.LEGAL_EFFECTIVE_DATE = "2026-11-02";
    const value = legalBundle();
    assert.equal(value.status, "published");
    assert.equal(value.effectiveAt, "2026-11-02");
    assert.equal(value.notice, "");
    assert.equal(value.operator.name, "测试运营主体");
    assert.equal(value.operator.email, "privacy@example.invalid");
    assert.ok(JSON.stringify(value.documents).includes("privacy@example.invalid"));
  });
});
