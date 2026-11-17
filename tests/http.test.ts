// Every failure of a request gets its own message, and none of them leaks the URL.

import assert from "node:assert/strict";
import { test } from "node:test";
import { getJson, ServiceError, userMessage } from "../web/src/lib/http.ts";
import { openMeteo, validateLocation } from "../web/src/lib/providers.ts";
import { fakeFetch, json, status } from "./helpers.ts";

const URL = "https://api.example.test/forecast?lat=1&secret=abc";

async function messageFor(answer: Parameters<typeof fakeFetch>[0]) {
  try {
    await getJson(URL, {
      fetch: fakeFetch(answer),
      notFoundMessage: "Not found here.",
    });
  } catch (error) {
    assert.ok(error instanceof ServiceError);
    return error.message;
  }
  return null;
}

test("a 200 answer returns its JSON", async () => {
  assert.deepEqual(await getJson(URL, { fetch: fakeFetch(json({ ok: 1 })) }), {
    ok: 1,
  });
});

test("each failure has its own message", async () => {
  assert.match((await messageFor(status(400)))!, /did not accept/);
  assert.match(
    (await messageFor(status(403)))!,
    /refused the request \(status 403\)/,
  );
  assert.equal(await messageFor(status(404)), "Not found here.");
  assert.match((await messageFor(status(429)))!, /Too many requests/);
  assert.match(
    (await messageFor(status(503)))!,
    /problem on its side \(status 503\)/,
  );
  assert.match((await messageFor(status(302)))!, /returned status 302/);
  assert.match(
    (await messageFor(new DOMException("timed out", "TimeoutError")))!,
    /too long/,
  );
  assert.match(
    (await messageFor(new DOMException("aborted", "AbortError")))!,
    /too long/,
  );
  assert.match(
    (await messageFor(new Response("<html>not json</html>", { status: 200 })))!,
    /could not be read/,
  );
});

test("a lost connection never shows the URL", async () => {
  const message = await messageFor(new TypeError(`Failed to fetch ${URL}`));
  assert.match(message!, /internet connection/);
  assert.doesNotMatch(message!, /secret|example/);
});

test("an unknown error becomes a fixed message", async () => {
  const message = await messageFor(new Error(`boom at ${URL}`));
  assert.equal(
    message,
    "The request to the weather service failed. Please try again.",
  );
  assert.equal(userMessage(new Error(URL)), message);
});

test("a bad location is stopped before any call", async () => {
  assert.throws(
    () => validateLocation({ name: " ", latitude: 45, longitude: 9 }),
    /has no name/,
  );
  assert.throws(
    () => validateLocation({ name: "Nowhere", latitude: 95, longitude: 0 }),
    /outside the valid range/,
  );
  assert.throws(
    () =>
      validateLocation({ name: "Nowhere", latitude: Number.NaN, longitude: 0 }),
    /outside the valid range/,
  );
  const fetch = fakeFetch(json({}));
  await assert.rejects(
    openMeteo(fetch).forecast(
      { name: "Nowhere", latitude: 95, longitude: 0 },
      0,
    ),
    /outside the valid range/,
  );
  await assert.rejects(
    openMeteo(fetch).forecast({ name: "", latitude: 45, longitude: 9 }, 0),
    /no name/,
  );
  assert.equal(fetch.calls.length, 0);
});
