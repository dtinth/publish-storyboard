#!/usr/bin/env node

import { parseArgs } from "node:util";
import { readFile, readdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";

const { values } = parseArgs({
  options: { input: { type: "string" } },
});

if (!values.input) throw new Error("--input is required");

const {
  ACTIONS_ID_TOKEN_REQUEST_URL,
  ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  GITHUB_REF_NAME,
  GITHUB_STEP_SUMMARY,
} = process.env;

if (!ACTIONS_ID_TOKEN_REQUEST_URL || !ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
  throw new Error(
    "ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN must be set"
  );
}

const tokenResponse = await fetch(new URL(ACTIONS_ID_TOKEN_REQUEST_URL), {
  headers: { Authorization: `Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
});
if (!tokenResponse.ok) {
  throw new Error(`Failed to get OIDC token: ${tokenResponse.statusText}`);
}
const { value: oidcToken } = await tokenResponse.json();
const tokenPayload = JSON.parse(
  Buffer.from(oidcToken.split(".")[1], "base64url").toString()
);
const repository = tokenPayload.repository; // "owner/repo"
const [owner, repo] = repository.split("/");

const BACKEND = "https://publish-storyboard.vercel.app/upload-url";

async function getUploadUrl(path) {
  const res = await fetch(`${BACKEND}?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${oidcToken}` },
  });
  if (!res.ok)
    throw new Error(`Failed to get upload URL for ${path}: ${res.statusText}`);
  const { url } = await res.json();
  return url;
}

async function upload(s3Path, body, contentType) {
  const url = await getUploadUrl(s3Path);
  const res = await fetch(url, {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error(`Failed to upload ${s3Path}: ${res.statusText}`);
  console.log(`  Uploaded: ${s3Path}`);
}

// Scan <input>/*/storyboard.ndjson
const entries = await readdir(values.input, { withFileTypes: true });
const storyboardDirs = entries
  .filter((e) => e.isDirectory())
  .map((e) => join(values.input, e.name));

const uploadedHashes = new Set();
const summaryLines = [];

for (const dir of storyboardDirs) {
  const ndjsonPath = join(dir, "storyboard.ndjson");
  let raw;
  try {
    raw = await readFile(ndjsonPath, "utf8");
  } catch {
    continue; // no storyboard.ndjson in this dir
  }

  const storyboardName = basename(dir);
  console.log(`Processing: ${storyboardName}`);

  const lines = raw.trimEnd().split("\n");
  const rewrittenLines = [];

  for (const line of lines) {
    const entry = JSON.parse(line);

    if (entry.type === "frame" && entry.screenshot?.url) {
      const imgPath = join(dir, entry.screenshot.url);
      const imgData = await readFile(imgPath);
      const hash = createHash("sha256").update(imgData).digest("hex");
      const s3Key = `images/${hash}.png`;

      if (!uploadedHashes.has(hash)) {
        await upload(s3Key, imgData, "image/png");
        uploadedHashes.add(hash);
      } else {
        console.log(`  Skipped duplicate image: ${hash}`);
      }

      rewrittenLines.push(
        JSON.stringify({
          ...entry,
          screenshot: { ...entry.screenshot, url: `../../images/${hash}.png` },
        })
      );
    } else {
      rewrittenLines.push(line);
    }
  }

  if (!GITHUB_REF_NAME) {
    console.log(`  Upload skipped (GITHUB_REF_NAME not set)`);
    continue;
  }

  const ndjsonKey = `storyboards/${GITHUB_REF_NAME}/${storyboardName}.ndjson`;
  const rewritten = rewrittenLines.join("\n") + "\n";
  await upload(ndjsonKey, rewritten, "application/x-ndjson");

  const viewerUrl = `https://visual-storyboard.vercel.app/?url=https://storyboard.t3.storage.dev/${owner}/${repo}/${ndjsonKey}`;
  console.log(`  Viewer: ${viewerUrl}`);
  summaryLines.push(`- [${storyboardName}](${viewerUrl})`);
}

if (GITHUB_STEP_SUMMARY && summaryLines.length > 0) {
  await appendFile(
    GITHUB_STEP_SUMMARY,
    `## Storyboards\n\n${summaryLines.join("\n")}\n`
  );
}
