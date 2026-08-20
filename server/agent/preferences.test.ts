import { describe, expect, it } from "vitest";
import { normalizeAgentPreferences } from "./preferences";

describe("preferências do agente", () => {
  it("mantém a configuração Básica dentro dos modelos e limites autorizados", () => {
    const normalized = normalizeAgentPreferences("basic", false, ["llama3.2"], {
      activeModel: "llama3.2", contextSize: 32768, newsEnabled: true, currencyEnabled: true, githubEnabled: true,
    });
    expect(normalized.contextSize).toBe(8192);
    expect(normalized.newsEnabled).toBe(false);
    expect(normalized.currencyEnabled).toBe(false);
    expect(normalized.githubEnabled).toBe(false);
  });

  it("aceita recursos Pro Max quando autorizados pelo owner", () => {
    const normalized = normalizeAgentPreferences("pro_max", true, ["deepseek-r1"], {
      activeModel: "deepseek-r1", contextSize: 32768, newsEnabled: true, currencyEnabled: true, githubEnabled: true,
    });
    expect(normalized.contextSize).toBe(32768);
    expect(normalized.newsEnabled).toBe(true);
    expect(normalized.currencyEnabled).toBe(true);
    expect(normalized.githubEnabled).toBe(true);
  });

  it("rejeita modelos não liberados pelo owner", () => {
    expect(() => normalizeAgentPreferences("basic", false, ["llama3.2"], {
      activeModel: "deepseek-r1", contextSize: 8192, newsEnabled: false, currencyEnabled: false, githubEnabled: false,
    })).toThrow("não foi liberado");
  });
});
