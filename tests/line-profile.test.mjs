import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import { getLineUserProfile } from "../src/services/line.service.ts";

const USER_ID = `U${"1".repeat(32)}`;
const OTHER_USER_ID = `U${"2".repeat(32)}`;
const PROFILE_URL = `https://api.line.me/v2/bot/profile/${USER_ID}`;
const TEST_TOKEN = "fixture-token-not-a-real-credential";
const originalFetch = globalThis.fetch;
const originalToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  else process.env.LINE_CHANNEL_ACCESS_TOKEN = originalToken;
});

test("fetches and validates a profile using server authentication and a timeout", async () => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  const profile = {
    userId: USER_ID,
    displayName: "Preview Customer",
    pictureUrl: "https://profile.line-scdn.net/preview",
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, PROFILE_URL);
    assert.equal(options.headers.Authorization, `Bearer ${TEST_TOKEN}`);
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(profile);
  };
  assert.deepEqual(await getLineUserProfile(USER_ID), profile);
});

test("accepts a profile without a photo", async () => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  const profile = { userId: USER_ID, displayName: "No Photo" };
  globalThis.fetch = async () => Response.json(profile);
  assert.deepEqual(await getLineUserProfile(USER_ID), profile);
});

test("rejects malformed, mismatched and unsafe profiles", async () => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  const invalidProfiles = [
    null,
    {},
    { userId: USER_ID, displayName: "" },
    { userId: USER_ID, displayName: "   " },
    { userId: OTHER_USER_ID, displayName: "Wrong User" },
    { userId: USER_ID, displayName: "Preview", pictureUrl: "javascript:alert(1)" },
    { userId: USER_ID, displayName: "Preview", pictureUrl: "http://example.invalid/photo" },
    { userId: USER_ID, displayName: "Preview", pictureUrl: null },
  ];
  for (const profile of invalidProfiles) {
    globalThis.fetch = async () => Response.json(profile);
    await assert.rejects(getLineUserProfile(USER_ID), /Invalid LINE profile response/);
  }
});

test("fails before making requests when user ID or token is missing", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error("Unexpected request");
  };
  process.env.LINE_CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  for (const userId of [null, undefined, "", "../other-user"]) {
    await assert.rejects(getLineUserProfile(userId), /Invalid LINE user ID/);
  }
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  await assert.rejects(getLineUserProfile(USER_ID), /LINE_CHANNEL_ACCESS_TOKEN is missing/);
  assert.equal(requests, 0);
});

test("does not expose API error bodies in errors", async () => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  for (const status of [401, 404, 429, 500]) {
    globalThis.fetch = async () => Response.json({ message: "private response" }, { status });
    await assert.rejects(getLineUserProfile(USER_ID), {
      message: `LINE profile request failed (${status})`,
    });
  }
});

test("propagates network and timeout failures", async () => {
  process.env.LINE_CHANNEL_ACCESS_TOKEN = TEST_TOKEN;
  for (const failure of [new TypeError("Network unavailable"), new DOMException("Timed out", "TimeoutError")]) {
    globalThis.fetch = async () => { throw failure; };
    await assert.rejects(getLineUserProfile(USER_ID), failure);
  }
});
