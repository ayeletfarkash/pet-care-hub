// Preloaded into the E2E server only: stands in for Google's token endpoint, so production code needs no test hook.
// The test passes the ID token claims as the authorization code.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  String(url) === "https://oauth2.googleapis.com/token"
    ? Promise.resolve(Response.json({ id_token: `h.${new URLSearchParams(init.body).get("code")}.s` }))
    : realFetch(url, init);
