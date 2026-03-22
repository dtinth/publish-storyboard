#!/usr/bin/env node

const { ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN } =
  process.env;

if (!ACTIONS_ID_TOKEN_REQUEST_URL || !ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
  throw new Error(
    "ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN must be set"
  );
}

const url = new URL(ACTIONS_ID_TOKEN_REQUEST_URL);
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
});
if (!response.ok) {
  throw new Error(`Failed to get OIDC token: ${response.statusText}`);
}
const { value: oidcToken } = await response.json();
const payload = JSON.parse(
  Buffer.from(oidcToken.split(".")[1], "base64url").toString()
);
console.log("OIDC token payload:", JSON.stringify(payload, null, 2));
