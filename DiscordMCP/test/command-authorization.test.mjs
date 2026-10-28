import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  exchangeCommandToken,
  saveCommandToken,
  startAuthorizationCallback,
} from "../scripts/authorize-commands.mjs";

const applicationId = "100000000000000030";
const options = {
  applicationId,
  clientSecret: "fictional-client-secret",
  code: "fictional-code",
  redirectUri: "http://127.0.0.1:8765/callback",
};
function requests(auth = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () =>
          url.endsWith("/token")
            ? {
                token_type: "Bearer",
                access_token: "fictional-access-token",
                refresh_token: "fictional-refresh-token",
                expires_in: 3600,
              }
            : {
                application: { id: applicationId },
                user: { id: "100000000000000002" },
                scopes: [
                  "applications.commands.permissions.update",
                  "identify",
                ],
                expires: new Date(Date.now() + 3600000).toISOString(),
                ...auth,
              },
      };
    },
  };
}

test("OAuth code and refresh exchanges use fixed Discord endpoints, POST body secrets, and verify application/user/scope", async () => {
  const mock = requests();
  const result = await exchangeCommandToken(options, mock.fetch);
  assert.equal(result.accessToken, "fictional-access-token");
  assert.equal(mock.calls[0].url, "https://discord.com/api/v10/oauth2/token");
  assert.equal(
    mock.calls[0].init.body.get("client_secret"),
    options.clientSecret,
  );
  assert.equal(mock.calls[0].init.body.get("code"), options.code);
  assert.equal(mock.calls[0].init.redirect, "error");
  assert.equal(
    mock.calls[1].init.headers.Authorization,
    "Bearer fictional-access-token",
  );
  const refresh = requests();
  await exchangeCommandToken(
    {
      applicationId,
      clientSecret: options.clientSecret,
      refreshToken: "fictional-old-refresh",
    },
    refresh.fetch,
  );
  assert.equal(refresh.calls[0].init.body.get("grant_type"), "refresh_token");
});

test("OAuth exchange rejects wrong applications, missing users/scopes, and upstream secrets without exposing them", async () => {
  for (const auth of [
    { application: { id: "100000000000000099" } },
    { user: undefined },
    { scopes: ["identify"] },
    { expires: "2000-01-01T00:00:00.000Z" },
  ]) {
    await assert.rejects(
      exchangeCommandToken(options, requests(auth).fetch),
      /authorization must belong/,
    );
  }
  await assert.rejects(
    exchangeCommandToken(options, async () => {
      throw new Error("fictional-client-secret");
    }),
    (error) => !error.message.includes("fictional-client-secret"),
  );
});

test("OAuth callback binds to loopback and ignores invalid states before accepting a valid code", async () => {
  const state = "fictional-random-state-at-least-24-bytes";
  const callback = await startAuthorizationCallback({
    port: 0,
    state,
    timeoutMs: 3000,
  });
  try {
    assert.ok(callback.redirectUri.startsWith("http://127.0.0.1:"));
    assert.equal(
      (await fetch(`${callback.redirectUri}?state=wrong&code=ignored`)).status,
      400,
    );
    const response = await fetch(
      `${callback.redirectUri}?state=${state}&code=fictional-code`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.text()).includes("fictional-code"), false);
    assert.equal(await callback.code, "fictional-code");
  } finally {
    callback.close();
  }
});

test("OAuth callback denial/timeout close the listener with sanitized errors", async () => {
  const state = "fictional-random-state-at-least-24-bytes";
  const denied = await startAuthorizationCallback({
    port: 0,
    state,
    timeoutMs: 3000,
  });
  const rejection = assert.rejects(denied.code, /declined/);
  await fetch(`${denied.redirectUri}?state=${state}&error=access_denied`);
  await rejection;
  const timeout = await startAuthorizationCallback({
    port: 0,
    state,
    timeoutMs: 20,
  });
  await assert.rejects(timeout.code, /timed out/);
});

test("OAuth files are written atomically with mode 600 only inside the ignored local directory", () => {
  const directory = fileURLToPath(
    new URL("../.local/oauth-helper-test/", import.meta.url),
  );
  const output = `${directory}oauth.env`;
  const tokens = {
    applicationId,
    accessToken: "fictional-access-token",
    refreshToken: "fictional-refresh-token",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    assert.throws(
      () => saveCommandToken("/tmp/must-not-store-oauth-here.env", tokens),
      /ignored .local/,
    );
    saveCommandToken(output, tokens);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.ok(
      readFileSync(output, "utf8").includes(
        "DISCORD_OAUTH_REFRESH_TOKEN=fictional-refresh-token",
      ),
    );
    saveCommandToken(output, {
      ...tokens,
      accessToken: "fictional-refreshed-token",
    });
    assert.ok(
      readFileSync(output, "utf8").includes(
        "DISCORD_OAUTH_ACCESS_TOKEN=fictional-refreshed-token",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
