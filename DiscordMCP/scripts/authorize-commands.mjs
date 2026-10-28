import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const scope = "applications.commands.permissions.update";
export class AuthorizationError extends Error {}
const ensure = (condition, message) => {
  if (!condition) throw new AuthorizationError(message);
};
const validToken = (value) =>
  typeof value === "string" && /^[A-Za-z0-9._~+/-]+=*$/.test(value);

export async function exchangeCommandToken(
  { applicationId, clientSecret, code, redirectUri, refreshToken },
  request = fetch,
) {
  ensure(
    /^\d{17,20}$/.test(applicationId) &&
      typeof clientSecret === "string" &&
      clientSecret.trim(),
    "Provide the application's ID and client secret in its local client environment file.",
  );
  const form = new URLSearchParams({
    client_id: applicationId,
    client_secret: clientSecret,
    grant_type: refreshToken ? "refresh_token" : "authorization_code",
  });
  if (refreshToken) form.set("refresh_token", refreshToken);
  else {
    ensure(
      typeof code === "string" && code && typeof redirectUri === "string",
      "Complete the Discord authorization code flow first.",
    );
    form.set("code", code);
    form.set("redirect_uri", redirectUri);
  }
  try {
    const response = await request("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    ensure(
      response.ok,
      "Discord rejected the OAuth exchange. Check the application's registered callback, client credentials, and authorization code or refresh token.",
    );
    const tokens = await response.json();
    const nextRefreshToken = tokens.refresh_token ?? refreshToken;
    ensure(
      tokens.token_type?.toLowerCase() === "bearer" &&
        validToken(tokens.access_token) &&
        validToken(nextRefreshToken) &&
        Number.isFinite(tokens.expires_in) &&
        tokens.expires_in > 0,
      "Discord returned an unsupported OAuth token response.",
    );
    const authResponse = await request(
      "https://discord.com/api/v10/oauth2/@me",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    ensure(
      authResponse.ok,
      "Discord could not verify the new OAuth authorization.",
    );
    const auth = await authResponse.json();
    ensure(
      auth.application?.id === applicationId &&
        /^\d{17,20}$/.test(auth.user?.id ?? "") &&
        auth.scopes?.includes(scope) &&
        auth.scopes.includes("identify") &&
        Date.parse(auth.expires) > Date.now(),
      "The authorization must belong to this application and a user, with identify and the command permissions scope.",
    );
    return {
      accessToken: tokens.access_token,
      refreshToken: nextRefreshToken,
      applicationId,
      expiresAt: new Date(
        Math.min(
          Date.parse(auth.expires),
          Date.now() + tokens.expires_in * 1000,
        ),
      ).toISOString(),
    };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new AuthorizationError(
      "Discord OAuth request failed. Check connectivity and local OAuth settings. Credential values were not logged.",
    );
  }
}

export async function startAuthorizationCallback({
  port = 8765,
  state,
  timeoutMs = 600000,
}) {
  ensure(
    Number.isInteger(port) &&
      port >= 0 &&
      port <= 65535 &&
      typeof state === "string" &&
      state.length >= 24,
    "Invalid local callback settings.",
  );
  let resolveCode, rejectCode, timer;
  const code = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Prevent an unhandled rejection if a listener error occurs before the caller awaits code.
  code.catch(() => {});
  const server = createServer((req, res) => {
    const reply = (status, text) => {
      res.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'",
      });
      res.end(text);
    };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET" || url.pathname !== "/callback") {
      reply(404, "Not found.");
      return;
    }
    const actual = Buffer.from(url.searchParams.get("state") ?? "");
    const expected = Buffer.from(state);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      reply(
        400,
        "Authorization state did not match. Return to the original authorization link.",
      );
      return;
    }
    if (url.searchParams.has("error")) {
      reply(400, "Discord authorization was declined. Return to the terminal.");
      finish(new AuthorizationError("Discord authorization was declined."));
      return;
    }
    const value = url.searchParams.get("code");
    if (!value || value.length > 2048 || /\s/.test(value)) {
      reply(400, "No valid authorization code was provided.");
      return;
    }
    reply(
      200,
      "Discord authorization received. Return to the terminal. You can close this tab.",
    );
    finish(null, value);
  });
  function finish(error, value) {
    clearTimeout(timer);
    server.close();
    if (error) rejectCode(error);
    else resolveCode(value);
  }
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(
        new AuthorizationError(
          "Cannot listen on the local callback port. Choose an available registered callback port.",
        ),
      ),
    );
    server.listen(port, "127.0.0.1", resolve);
  });
  timer = setTimeout(
    () =>
      finish(
        new AuthorizationError(
          "Discord authorization timed out. Run the helper again.",
        ),
      ),
    timeoutMs,
  );
  const address = server.address();
  return {
    code,
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    close: () =>
      finish(new AuthorizationError("Discord authorization cancelled.")),
  };
}

export function saveCommandToken(output, tokens) {
  const privateRoot = fileURLToPath(new URL("../.local/", import.meta.url));
  const target = resolve(output);
  ensure(
    target.startsWith(privateRoot) && target !== privateRoot,
    "Store command OAuth credentials inside this package's ignored .local directory.",
  );
  ensure(
    validToken(tokens.accessToken) &&
      validToken(tokens.refreshToken) &&
      /^\d{17,20}$/.test(tokens.applicationId) &&
      Number.isFinite(Date.parse(tokens.expiresAt)),
    "Invalid OAuth token data; no credentials were saved.",
  );
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(
      temporary,
      `DISCORD_OAUTH_APPLICATION_ID=${tokens.applicationId}\nDISCORD_OAUTH_ACCESS_TOKEN=${tokens.accessToken}\nDISCORD_OAUTH_REFRESH_TOKEN=${tokens.refreshToken}\nDISCORD_OAUTH_EXPIRES_AT=${tokens.expiresAt}\n`,
      { mode: 0o600, flag: "wx" },
    );
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    ensure(
      [
        "--application",
        "--client-env",
        "--output",
        "--port",
        "--refresh",
      ].includes(key) && !(key in args),
      "Usage: authorize-commands --client-env .local/client.env --output .local/oauth.env [--application ID] [--port 8765] [--refresh]",
    );
    if (key === "--refresh") args[key] = true;
    else {
      const value = process.argv[++i];
      ensure(
        value && !value.startsWith("--"),
        "Every option needs a value, except --refresh.",
      );
      args[key] = value;
    }
  }
  ensure(
    args["--client-env"] && args["--output"],
    "Provide --client-env and --output; never pass credential values on the command line.",
  );
  const credentials = parse(readFileSync(resolve(args["--client-env"])));
  const applicationId = args["--application"] ?? credentials.CLIENT_ID;
  ensure(
    /^\d{17,20}$/.test(applicationId) && credentials.CLIENT_SECRET?.trim(),
    "The client environment file needs CLIENT_ID and CLIENT_SECRET.",
  );
  if (credentials.CLIENT_ID)
    ensure(
      credentials.CLIENT_ID === applicationId,
      "The client environment file belongs to another application.",
    );
  let grant;
  if (args["--refresh"]) {
    const saved = parse(readFileSync(resolve(args["--output"])));
    ensure(
      saved.DISCORD_OAUTH_APPLICATION_ID === applicationId &&
        validToken(saved.DISCORD_OAUTH_REFRESH_TOKEN),
      "The saved OAuth file does not contain a refresh token for this application.",
    );
    grant = { refreshToken: saved.DISCORD_OAUTH_REFRESH_TOKEN };
  } else {
    const port = Number(args["--port"] ?? 8765);
    ensure(
      Number.isInteger(port) && port >= 1024 && port <= 65535,
      "Choose a callback port from 1024 to 65535.",
    );
    const state = randomBytes(32).toString("hex");
    const callback = await startAuthorizationCallback({ port, state });
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: applicationId,
      response_type: "code",
      redirect_uri: callback.redirectUri,
      scope: `${scope} identify`,
      state,
    }).toString();
    console.log(
      `Registered redirect URI required: ${callback.redirectUri}\nOpen this Discord authorization link on this machine (or through an SSH port forward):\n${url.href}`,
    );
    grant = { code: await callback.code, redirectUri: callback.redirectUri };
  }
  const tokens = await exchangeCommandToken({
    applicationId,
    clientSecret: credentials.CLIENT_SECRET,
    ...grant,
  });
  saveCommandToken(args["--output"], tokens);
  console.log(
    "Command permissions authorization saved privately with mode 600. Reconnect the MCP client to load it. Tokens were not printed.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof AuthorizationError
        ? error.message
        : "Authorization failed. Check the local credential files and callback settings; no credential values were logged.",
    );
    process.exitCode = 1;
  });
}
