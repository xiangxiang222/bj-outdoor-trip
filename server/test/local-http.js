const http = require("node:http");
const { before, after } = require("node:test");
const request = require("supertest");

let handler;
const server = http.createServer((req, res) => handler(req, res));

// Supertest's automatic server listens on ::, but its client connects to
// 127.0.0.1. On macOS an IPv4-only service can own that same port, so the
// request can reach an unrelated application. Bind and await the exact host.
before(async () => {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
});

after(async () => {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
});

function localRequest(app) {
  handler = app;
  return request(server);
}

module.exports = localRequest;
