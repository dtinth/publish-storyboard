import { Elysia } from "elysia";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { s3 } from "bun";

const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks")
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

    const path = query.path;
    if (!path) {
      return status(400, "Missing path query parameter");
    }

    const key = `${repository}/${path}`;
    const url = s3.presign(key, { method: "PUT", expiresIn: 3600 });

    return { url };
  });

export default { fetch: app.fetch };
