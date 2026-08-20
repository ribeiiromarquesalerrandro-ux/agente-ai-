import { describe, expect, it } from "vitest";
import { selectRelevantMemory } from "./memory";

describe("recuperação lexical de memória", () => {
  it("prioriza trechos que compartilham termos relevantes com a nova mensagem", () => {
    const found = selectRelevantMemory("Qual é a previsão de chuva em São Paulo?", [
      { content: "O usuário prefere respostas objetivas sobre previsão de chuva em São Paulo.", createdAt: new Date("2026-08-20T10:00:00Z") },
      { content: "O usuário quer dicas de filmes clássicos.", createdAt: new Date("2026-08-20T11:00:00Z") },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("previsão de chuva");
  });

  it("não recupera memórias sem interseção de termos", () => {
    const found = selectRelevantMemory("Como organizar um orçamento mensal?", [
      { content: "Receita de massa ao molho de tomate.", createdAt: new Date() },
    ]);
    expect(found).toEqual([]);
  });
});
