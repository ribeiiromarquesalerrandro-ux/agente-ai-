import { describe, expect, it } from "vitest";

describe("credencial GitHub", () => {
  const shouldValidate = process.env.RUN_GITHUB_TOKEN_VALIDATION === "true";

  it.skipIf(!shouldValidate)("autentica no endpoint de perfil do GitHub quando a validação externa é solicitada", async () => {
    const token = process.env.GITHUB_TOKEN;
    expect(token).toBeTruthy();

    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    expect(response.status).toBe(200);
    const profile = await response.json() as { login?: string };
    expect(profile.login).toBeTruthy();
  }, 20_000);
});
