import { describe, expect, it } from "vitest";
import { isOwner, permittedContextSize, toolIsAvailable } from "./access";

describe("regras de acesso e planos", () => {
  it("permite a administração de acessos somente ao owner", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("admin")).toBe(false);
    expect(isOwner("user")).toBe(false);
  });

  it("limita o contexto do plano Básico e amplia o Pro Max", () => {
    expect(permittedContextSize("basic", 32768)).toBe(8192);
    expect(permittedContextSize("pro_max", 32768)).toBe(32768);
  });

  it("mantém clima no Básico e libera notícias e câmbio somente no Pro Max", () => {
    expect(toolIsAvailable("basic", "clima")).toBe(true);
    expect(toolIsAvailable("basic", "notícias")).toBe(false);
    expect(toolIsAvailable("basic", "câmbio")).toBe(false);
    expect(toolIsAvailable("pro_max", "notícias")).toBe(true);
    expect(toolIsAvailable("pro_max", "câmbio")).toBe(true);
  });
});
