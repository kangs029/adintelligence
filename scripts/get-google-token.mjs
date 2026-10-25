/**
 * Google Ads OAuth Token Generator
 * 
 * Run: node --env-file=.env.local scripts/get-google-token.mjs
 * 
 * Opens browser for login, captures refresh token automatically.
 * 
 * Required environment variables:
 *   GOOGLE_ADS_CLIENT_ID     - OAuth 2.0 Client ID
 *   GOOGLE_ADS_CLIENT_SECRET - OAuth 2.0 Client Secret
 */

import { createServer } from "node:http";

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3456/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET must be set.");
  console.error("Run with: node --env-file=.env.local scripts/get-google-token.mjs");
  process.exit(1);
}
const SCOPE = "https://www.googleapis.com/auth/adwords";
const PORT = 3456;

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n=== Google Ads OAuth Token Generator ===\n");
console.log("Step 1: Open this URL in your browser and log in with XPAT's Google account:");
console.log("\n" + authUrl + "\n");
console.log("Waiting for callback on http://localhost:3456/callback ...\n");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname !== "/callback") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h1>Error: ${error}</h1><p>Close this tab and check the terminal.</p>`);
    console.error("OAuth error:", error);
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400);
    res.end("No code received");
    return;
  }

  console.log("Step 2: Authorization code received. Exchanging for tokens...\n");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h1>Token Error: ${tokens.error}</h1><p>${tokens.error_description}</p>`);
      console.error("Token error:", tokens);
      server.close();
      return;
    }

    console.log("=== SUCCESS ===\n");
    console.log("GOOGLE_ADS_REFRESH_TOKEN=" + tokens.refresh_token);
    console.log("\nCopy the line above and paste it into your .env.local file.\n");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h1>Success!</h1>
      <p>Check your terminal for the refresh token.</p>
      <p><strong>GOOGLE_ADS_REFRESH_TOKEN=</strong><code>${tokens.refresh_token}</code></p>
      <p>Copy this into your .env.local file and close this tab.</p>
    `);

    server.close();
  } catch (err) {
    console.error("Fetch error:", err);
    res.writeHead(500);
    res.end("Server error: " + err.message);
    server.close();
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
