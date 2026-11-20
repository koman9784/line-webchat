import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, mock, test } from "node:test";

const USER_ID = `U${"1".repeat(32)}`;
const TEST_SECRET = "webhook-fixture-secret";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const originalSecret = process.env.LINE_CHANNEL_SECRET;
let storedConversation;
let profileRequests;
let messagesSaved;
let claimAttempts;
let failProfile;
let loseClaim;
let profilePhoto;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});

function createConversationQuery() {
  let changes;
  let predicate = () => true;
  return {
    upsert() { return this; },
    update(values) { changes = values; return this; },
    eq(column, value) {
      assert.equal(column, "id");
      assert.equal(value, storedConversation.id);
      return this;
    },
    is(column, value) {
      predicate = () => storedConversation[column] === value;
      return this;
    },
    lte(column, value) {
      predicate = () => Date.parse(storedConversation[column]) <= Date.parse(value);
      return this;
    },
    select() { return this; },
    async single() { return { data: { ...storedConversation }, error: null }; },
    async maybeSingle() {
      claimAttempts += 1;
      assert.ok(messagesSaved > 0, "save messages before enriching profiles");
      if (loseClaim || !predicate()) return { data: null, error: null };
      Object.assign(storedConversation, changes);
      return { data: { id: storedConversation.id }, error: null };
    },
    then(resolve) {
      Object.assign(storedConversation, changes);
      return Promise.resolve({ error: null }).then(resolve);
    },
  };
}

mock.module(new URL("../src/lib/supabase-admin.ts", import.meta.url).href, {
  exports: {
    supabaseAdmin: {
      from(table) {
        if (table === "conversations") return createConversationQuery();
        assert.equal(table, "messages");
        return { async upsert() { messagesSaved += 1; return { error: null }; } };
      },
    },
  },
});

mock.module(new URL("../src/services/line.service.ts", import.meta.url).href, {
  exports: {
    async getLineUserProfile(userId) {
      assert.equal(userId, USER_ID);
      profileRequests += 1;
      if (failProfile) throw new Error("Fixture API unavailable");
      return { userId, displayName: "Preview Name", pictureUrl: profilePhoto };
    },
  },
});

const { POST } = await import("../src/app/api/line/webhook/route.ts");

beforeEach(() => {
  process.env.LINE_CHANNEL_SECRET = TEST_SECRET;
  storedConversation = { id: "preview-room", line_user_id: USER_ID, profile_checked_at: null };
  profileRequests = 0;
  messagesSaved = 0;
  claimAttempts = 0;
  failProfile = false;
  loseClaim = false;
  profilePhoto = "https://profile.line-scdn.net/preview";
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
});

afterEach(() => {
  mock.restoreAll();
  if (originalSecret === undefined) delete process.env.LINE_CHANNEL_SECRET;
  else process.env.LINE_CHANNEL_SECRET = originalSecret;
});

function makeRequest(signatureValid = true) {
  const body = JSON.stringify({
    events: [{ type: "message", source: { userId: USER_ID }, message: { type: "text", text: "Preview" } }],
  });
  const signature = createHmac("sha256", TEST_SECRET).update(body).digest("base64");
  return new Request("http://localhost/api/line/webhook", {
    method: "POST",
    headers: { "x-line-signature": signatureValid ? signature : "invalid" },
    body,
  });
}

test("saves a first profile and skips requests for later messages within 24 hours", async () => {
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(storedConversation.display_name, "Preview Name");
  assert.equal(storedConversation.picture_url, "https://profile.line-scdn.net/preview");
  assert.ok(storedConversation.profile_checked_at);
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(messagesSaved, 2);
  assert.equal(profileRequests, 1);
  assert.equal(claimAttempts, 1);
});

test("refreshes at the 24-hour boundary", async (context) => {
  const now = Date.now();
  context.mock.timers.enable({ apis: ["Date"], now });
  storedConversation.profile_checked_at = new Date(now - REFRESH_INTERVAL_MS).toISOString();
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(profileRequests, 1);
});

test("does not refresh one millisecond before the 24-hour boundary", async (context) => {
  const now = Date.now();
  context.mock.timers.enable({ apis: ["Date"], now });
  storedConversation.profile_checked_at = new Date(now - REFRESH_INTERVAL_MS + 1).toISOString();
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(profileRequests, 0);
});

test("retains the old profile and saved messages on profile failure, then throttles retry", async () => {
  storedConversation.display_name = "Stored Name";
  storedConversation.picture_url = "https://profile.line-scdn.net/stored";
  failProfile = true;
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(storedConversation.display_name, "Stored Name");
  assert.equal(storedConversation.picture_url, "https://profile.line-scdn.net/stored");
  assert.equal(console.error.mock.calls.length, 1);
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(messagesSaved, 2);
  assert.equal(profileRequests, 1);
});

test("removes an outdated photo when the refreshed profile has no picture", async () => {
  storedConversation.picture_url = "https://profile.line-scdn.net/stored";
  profilePhoto = undefined;
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(storedConversation.display_name, "Preview Name");
  assert.equal(storedConversation.picture_url, null);
});

test("does not fetch when another delivery owns the refresh claim", async () => {
  loseClaim = true;
  assert.equal((await POST(makeRequest())).status, 200);
  assert.equal(messagesSaved, 1);
  assert.equal(profileRequests, 0);
});

test("does not read or modify profiles for an invalid webhook signature", async () => {
  assert.equal((await POST(makeRequest(false))).status, 401);
  assert.equal(messagesSaved, 0);
  assert.equal(claimAttempts, 0);
  assert.equal(profileRequests, 0);
});
