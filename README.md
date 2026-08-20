# Agente AI Local

O **Agente AI Local** é uma aplicação web responsiva para conversar com modelos executados localmente no Ollama. Ela preserva histórico, possui memória contextual simples, permite recursos multimodais, organiza ferramentas autorizadas e oferece administração de usuários, modelos e APIs pelo perfil **owner**.

> A aplicação foi desenhada para ampliar a capacidade operacional do proprietário sem remover controles de autorização. Modelos, APIs e ações externas dependem do plano do usuário e das permissões definidas pelo owner.

## Recursos implementados

| Área | Entrega |
|---|---|
| Chat local | Streaming com Ollama, Markdown, histórico persistente e exportação JSON, CSV e texto. |
| Memória | Recuperação lexical de trechos relevantes por usuário e conversa. |
| Multimodalidade | Transcrição de voz e geração de imagens no chat. |
| Ferramentas | **clima**, **notícias** e **câmbio**, com consulta a fontes selecionadas. |
| Acesso | Papéis `owner`, `admin` e `user`; o owner pode atribuir administradores e planos. |
| Planos | Básico gratuito e Pro Max, com regras de ferramentas, contexto e modelos configuráveis. |
| Catálogo | Registro de APIs, aprovação do owner, ativação individual e referência de credencial por item. |
| Instalação | Interface web responsiva e base PWA instalável em Windows, macOS e Linux. |

## Planos e permissões

| Recurso | Básico | Pro Max |
|---|---:|---:|
| Chat com modelos liberados pelo owner | Sim | Sim |
| Contexto máximo | 8.192 tokens | 131.072 tokens |
| Clima | Sim, se ativado | Sim, se ativado |
| Notícias e câmbio | Não | Sim, se ativados |
| Modelos adicionais | Conforme liberação | Conforme liberação ampliada |
| Gestão de usuários e catálogo | Apenas owner | Apenas owner |

O owner configura os modelos habilitados para cada plano na área **Acessos**. O aplicativo valida a lista permitida tanto ao salvar preferências quanto ao iniciar o chat.

## Pré-requisitos

Instale Node.js 22+ e o [Ollama](https://ollama.com/). Depois de instalar o Ollama, baixe pelo menos um modelo permitido pelo owner, por exemplo:

```bash
ollama run llama3.2
```

Instale as dependências e inicie o projeto:

```bash
pnpm install
pnpm dev
```

No painel **Agente**, confirme a URL local do Ollama, normalmente `http://localhost:11434`, clique em **VERIFICAR** e selecione um modelo autorizado. Em uma instalação web remota, o servidor Ollama deve estar acessível ao dispositivo do usuário e configurado para aceitar a origem da aplicação; a alternativa recomendada para uso local é instalar a PWA no mesmo computador que executa o Ollama.

## Uso em Windows, macOS e Linux

A aplicação inclui um manifesto PWA e pode ser instalada pelo navegador compatível usando a opção **Instalar aplicativo**. O fluxo é o mesmo nos três sistemas operacionais: instale o Ollama, obtenha os modelos escolhidos, abra a aplicação e use a URL local do Ollama.

| Sistema | Instalação do Ollama | Uso da aplicação |
|---|---|---|
| Windows | `winget install Ollama.Ollama` | Chrome ou Edge → **Instalar aplicativo**. |
| macOS | `brew install --cask ollama` | Safari ou Chrome → adicionar/instalar como aplicativo. |
| Linux | `curl -fsSL https://ollama.com/install.sh \| sh` | Navegador compatível → **Instalar aplicativo**. |

## Fontes do catálogo inicial

O catálogo é extensível; ele não incorpora chaves nem ativa automaticamente serviços não revisados. As entradas iniciais usam as documentações e repositórios abaixo.

| Item | Finalidade | Situação inicial |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/en/docs) | Ferramenta **clima** | Aprovada; plano Básico e Pro Max. |
| [GDELT](https://www.gdeltproject.org/) | Ferramenta **notícias** | Aprovada; Pro Max. |
| [Frankfurter](https://frankfurter.dev/docs/) | Ferramenta **câmbio** | Aprovada; Pro Max. |
| [GitHub REST API](https://docs.github.com/rest) | Repositórios e criação de sites | Pendente de credencial e autorização do owner. |
| [public-apis](https://github.com/public-apis/public-apis) | Referência para expansão do catálogo | Catálogo de referência; não é ativado automaticamente. |

O [Ollama](https://github.com/ollama/ollama) é utilizado como camada de execução local de modelos. Os repositórios [free-for-dev](https://github.com/ripienaar/free-for-dev) e [Scrapling](https://github.com/D4Vinci/Scrapling) foram avaliados como referências para descoberta de serviços e automação permitida, respectivamente; eles não são copiados nem executados automaticamente neste projeto. Ao adicionar uma nova API, o owner deve revisar a licença, os termos de uso, a necessidade de credenciais e o nível de acesso aplicável.

## GitHub

O painel GitHub permanece em **modo seguro** até que o owner decida conectar uma credencial válida. Sem isso, o sistema não executa leitura, escrita, criação ou publicação em repositórios. Quando habilitada no futuro, toda operação deve continuar condicionada à aprovação explícita do owner.

## Qualidade

```bash
pnpm test
pnpm check
pnpm build
```

A suíte cobre papéis e planos, preferências do agente, memória contextual, criação/listagem de conversas, persistência de mensagens e exportação.

## Referências

[1] [Ollama — repositório oficial](https://github.com/ollama/ollama)  
[2] [Open-Meteo — documentação](https://open-meteo.com/en/docs)  
[3] [GDELT — projeto oficial](https://www.gdeltproject.org/)  
[4] [Frankfurter — documentação](https://frankfurter.dev/docs/)  
[5] [GitHub REST API — documentação](https://docs.github.com/rest)
