# publish-storyboard

Publishes [visual-storyboard](https://github.com/dtinth/visual-storyboard) output from GitHub Actions to S3-compatible storage and posts a viewer link in the job summary. This script use GitHub Actions OIDC for authentication, allowing me to set up screenshot publishing on my projects without needing to manage secrets or keys.

> [!NOTE]
> This tool is built for my own use, so several things (backend URL, usernames, etc) are hardcoded. If you want to use it you will likely need to fork and modify the code.

## Components

- `script.mjs` — Node.js script, intended to be invoked via `npx` from a GitHub Actions workflow. It does the following:
  - Requests a short-lived OIDC JWT from GitHub Actions
  - Scans storyboard directories
  - Uploads images (deduplicated by SHA-256)
  - Rewrites image URLs in the NDJSON to relative paths
  - Uploads the NDJSON file
  - Appends a viewer link to the job summary.
- `backend/` — Elysia app deployed to Vercel
  - Validates GitHub Actions OIDC tokens against GitHub's JWKS
  - Generates a presigned S3 PUT URL scoped to the caller's `{owner}/{repo}/`.

## Usage

```yaml
jobs:
  test:
    # Add permission to request OIDC token
    permissions:
      id-token: write
    steps:
      # After storyboard is generated, run the publish-storyboard script
      - run: npx 'github:dtinth/publish-storyboard#main' --input=test-storyboards
```

No secrets or keys needed — authentication is handled via GitHub Actions OIDC.

## Backend environment variables

Configure in Vercel dashboard:

| Variable               | Description                     |
| ---------------------- | ------------------------------- |
| `S3_ACCESS_KEY_ID`     | S3 access key                   |
| `S3_SECRET_ACCESS_KEY` | S3 secret key                   |
| `S3_REGION`            | S3 region                       |
| `S3_ENDPOINT`          | S3 endpoint URL                 |
| `S3_BUCKET`            | Bucket name                     |
| `OIDC_AUDIENCE`        | Expected `aud` claim (optional) |
