import { s3 } from "bun";
import { Elysia } from "elysia";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

const app = new Elysia()
  .get("/", () => ({
    message: "Hello from Elysia on Vercel!",
  }))
  .get("/upload-url", async ({ headers, query, status }) => {
    const auth = headers["authorization"];
    if (!auth?.startsWith("Bearer ")) {
      return status(401, "Missing bearer token");
    }
    const token = auth.slice(7);

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(token, GITHUB_JWKS, {
        issuer: "https://token.actions.githubusercontent.com",
        ...(process.env.OIDC_AUDIENCE && {
          audience: process.env.OIDC_AUDIENCE,
        }),
      });
      payload = result.payload as Record<string, unknown>;
    } catch {
      return status(401, "Invalid token");
    }

    const repository = payload["repository"] as string | undefined;
    if (!repository) {
      return status(403, "Token missing repository claim");
    }
    if (!repository.startsWith("dtinth/")) {
      return status(403, "Repository not allowed");
    }

    const path = query.path;
    if (!path) {
      return status(400, "Missing path query parameter");
    }

    const key = `${repository}/${path}`;
    const url = s3.presign(key, { method: "PUT", expiresIn: 3600 });

    return { url };
  })
  .get(
    "/images/:owner/:repo/:storyboard/:slug",
    async ({ params, query, status, redirect }) => {
      const { owner, repo, storyboard, slug } = params;
      const branch = (query.branch as string | undefined) ?? "main";

      const ndjsonKey = `${owner}/${repo}/storyboards/${branch}/${storyboard}.ndjson`;
      let ndjsonText: string;
      try {
        ndjsonText = await s3.file(ndjsonKey).text();
      } catch {
        return status(404, "Storyboard not found");
      }

      for (const line of ndjsonText.trimEnd().split("\n")) {
        const entry = JSON.parse(line);
        if (entry.type === "frame" && entry.slug === slug) {
          const screenshotUrl = entry.screenshot?.url as string | undefined;
          if (!screenshotUrl) return status(404, "Frame has no screenshot");

          const match = screenshotUrl.match(/images\/([a-f0-9]+)\.png$/);
          if (!match) return status(404, "Invalid screenshot URL format");

          const hash = match[1];
          const base =
            process.env.S3_PUBLIC_BASE_URL ?? "https://storyboard.t3.storage.dev";
          return redirect(`${base}/${owner}/${repo}/images/${hash}.png`);
        }
      }

      return status(404, "Frame not found");
    },
  );
export default { fetch: app.fetch };
