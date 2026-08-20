type CandidateMemory = { content: string; createdAt: Date };

function terms(value: string) {
  return new Set(value.toLocaleLowerCase("pt-BR").match(/[a-zà-ÿ0-9_-]{3,}/g) ?? []);
}

/**
 * RAG lexical propositalmente simples: ordena memórias do próprio usuário por
 * sobreposição de termos. Mantém os dados locais ao perfil e evita dependência
 * de um serviço de vetores na primeira versão.
 */
export function selectRelevantMemory(query: string, memories: CandidateMemory[], limit = 5) {
  const queryTerms = terms(query);
  if (queryTerms.size === 0) return [];

  return memories
    .map((memory) => {
      const memoryTerms = terms(memory.content);
      let intersections = 0;
      queryTerms.forEach((term) => {
        if (memoryTerms.has(term)) intersections += 1;
      });
      const score = intersections / Math.max(queryTerms.size, 1);
      return { ...memory, score };
    })
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map(({ content }) => content);
}
