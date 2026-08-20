# Revisão de acessibilidade — Neon Command Studio

O redesenho preserva elementos semânticos nativos para ações, campos e seletores. Botões e controles usam componentes focáveis, enquanto a navegação é composta por elementos `button` com texto visível.

| Critério | Verificação |
|---|---|
| Foco por teclado | Regras globais de `:focus-visible` aplicam contorno ciano com afastamento de 3 px a botões, links, campos e áreas de texto. |
| Estados interativos | Botões principais têm estados de hover, ativo e desabilitado; controles secundários preservam borda e contraste na interação. |
| Contraste | Textos operacionais são claros sobre superfícies quase pretas; ciano e magenta são usados como sinalização, sem serem a única indicação de estado. |
| Responsividade | Campos, cards e ações foram revisados em desktop e na largura de 375 px; a tabela de acesso mantém rolagem horizontal para evitar colunas ilegíveis. |
| Movimento | Animações decorativas são condicionadas a `prefers-reduced-motion`, reduzindo o movimento para pessoas que o desativam. |

O próximo refinamento recomendado, caso o produto receba maior audiência, é executar uma auditoria automatizada no navegador com leitores de tela e contraste em todos os estados autenticados.
