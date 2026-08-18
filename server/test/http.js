const request = require("supertest");
const { createApp } = require("../src/app");
const { getDb } = require("../src/db");
const { seedMinimal } = require("./helpers");

function harness() {
  const seed = seedMinimal();
  const app = createApp();
  return { app, seed, agent: request(app) };
}

async function issueCaptcha(agent) {
  const res = await agent.get("/api/auth/captcha").expect(200);
  const token = res.body.data.token;
  const row = getDb().prepare("SELECT code FROM captchas WHERE token=?").get(token);
  return { token, code: row.code, image: res.body.data.image };
}

async function loginUser(agent, phone = "13800138000", password = "123456") {
  const cap = await issueCaptcha(agent);
  const res = await agent
    .post("/api/auth/login")
    .send({ phone, password, captchaToken: cap.token, captcha: cap.code })
    .expect(200);
  return res.body.data.token;
}

async function loginCompany(agent) {
  return loginUser(agent, "13900139000", "123456");
}

async function loginAdmin(agent) {
  const res = await agent.post("/api/admin/login").send({ username: "admin", password: "admin123" }).expect(200);
  return res.body.data.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

const ID = {
  maleBj: "110101199205121219",
  femaleBj: "110101199001011229",
  maleHb: "130102198805201218",
  femaleSd: "370102199512181224",
};

module.exports = { harness, issueCaptcha, loginUser, loginCompany, loginAdmin, auth, ID };
