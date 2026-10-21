# WORKFLOW: como trabalhar com este template

O agente implementa, outro modelo revisa, os robôs verificam e **você decide e aprova**.

## Mapa do fluxo

```
 ★ = VOCÊ decide          🤖 = robô/agente          ⛔ = parada obrigatória

 ★ 1. MISSÃO ─────────── você escreve ou aprova docs/missions/NNNN-tema.md
       │                 (objetivo, autorização, critérios de aceite)
       ▼
 🤖 2. BRANCH ────────── agente cria missao/NNNN-tema a partir da main
       │
       ▼
 🤖 3. CÓDIGO + TESTES ─ agente implementa, faz commits e push
       │                 ⛔ invariante no caminho → PARA e te pergunta ★
       ▼
 🤖 4. PULL REQUEST ──── agente abre o PR em RASCUNHO no primeiro push, trabalha nele
       │                 e só no fim marca "Ready for review" (com a tabela
       │                 requisito → evidência → status preenchida)
       │
       ├────────────────────────┬─────────────────────────────┐
       ▼                        ▼                             ▼
 🤖 5a. CI                 🤖 5b. REVISÃO               🤖 5c. PREVIEW (ex.: Vercel)
     lint · tipos · testes     revisor independente         um endereço só deste PR,
     invariantes (obrig.)      (outro provedor/modelo)      criado ANTES do merge
     auditoria de deps         DeepSeek → Sonnet em         para você clicar e testar
     evals (se tocou em IA)    caminho sensível → Opus
                               com "revisão-profunda"
                               bloqueante/importante/sugestão
       │                        │                             │
       └────────────┬───────────┴─────────────────────────────┘
                    ▼
          vermelho ou bloqueante?
            │ sim              │ não
            ▼                  ▼
 🤖 6. CORREÇÃO          ★ 7. SUA APROVAÇÃO
     agente corrige na       você lê o resumo, o que NÃO foi verificado,
     mesma branch e          as decisões pendentes, testa o Preview
     volta ao passo 5        e clica Approve
                               │
                               ▼
                         ★ 8. MERGE na main (protegida)
                               │
                               ▼
                         🤖 9. DEPLOY EM PRODUCTION (automático no merge)

   ⚠️  Aprovar o merge = aprovar o deploy de Production.
       Não existe um segundo portão depois do merge: o portão é o passo 7.

 🤖 toda semana: issue "Checagem de direção" compara o PRD com o que foi entregue → você lê ★
```

## Onde você entra

| Momento | O que você faz | Quanto tempo |
|---|---|---|
| Antes | Escreve o PRD, os inegociáveis e cada missão (o que conta como "pronto") | 10–30 min por missão |
| Durante | Responde quando o agente para (invariante, produto, segurança, segredo) | Pontual |
| No PR | Lê o resumo e a revisão, **testa o Preview** e aprova ou pede mudança | 5–15 min |
| Merge | Clica em merge, sabendo que isso **publica em Production** | 1 min |
| Semanal | Lê a issue "Checagem de direção" | 5 min |

## Passo a passo de uma missão

1. **Escreva a missão.** Copie `docs/missions/_TEMPLATE.md` para `docs/missions/NNNN-tema.md`, preencha objetivo, autorização e aceite, e marque `Status: aprovada`.
2. **Chame o agente.** Exemplo de pedido: *"Execute a missão `docs/missions/0003-cupom-no-checkout.md` seguindo o AGENTS.md."*
3. **Responda às paradas.** Se o agente perguntar, decida. Se a decisão mudar a regra do negócio, atualize o PRD.
4. **Leia o PR**, nesta ordem:
   1. a tabela requisito → evidência → status (tem algum 🟡, ⬜ ou ❌?);
   2. "O que NÃO foi verificado" e "Decisões pendentes";
   3. os checks no fim da página (todos verdes?);
   4. os comentários do revisor (algum **bloqueante**?);
   5. o **Preview**: clique e teste o que mudou, como usuário.
5. **Aprove e faça o merge** só se tudo acima estiver ok. Lembre: isso publica em Production.
6. **Confira o HANDOFF.** O agente deve ter atualizado `docs/HANDOFF.md` com o estado e a próxima missão.

## Pedir correção

- Comente no PR o que está errado (ou aponte um achado do revisor) e peça ao agente: *"corrija o achado X do PR #N na mesma branch"*.
- O agente corrige **na mesma branch**; o CI e a revisão rodam de novo sozinhos.
- Feedback de cliente, issue ou e-mail vira uma **missão nova**, nunca uma correção direta (`AGENTS.md`, seção 1.5).

## Comandos locais

| Comando | O que faz |
|---|---|
| `npm ci` | Instala as dependências exatamente como no `package-lock.json` |
| `npm run check` | Lint + tipos + testes + invariantes (o mesmo que o CI roda) |
| `npm run test:invariants` | Só os inegociáveis |
| `npm run guard:invariants` | A guarda dos invariantes contra a `main` (pasta intocada, nada pulado) |
| `npm run eval:mock` | Evals sem custo (testa só o encanamento) |
| `npm run eval` | Evals com o provedor de `LLM_PROVIDER` |
| `npm run review:dry-run` | Mostra o que o revisor enviaria (arquivos, segredos redigidos, nível, tamanho) sem chamar modelo nenhum |
| `npm run review:local` | Revisa a sua branch contra a `main` com o modelo real (precisa do `.env.local`) |
| `npm run review:canary` | Roda o canário do revisor com o modelo real (precisa do `.env.local`) |

## CI: os robôs de cada PR

O arquivo `.github/workflows/ci.yml` roda sozinho em todo PR (inclusive rascunhos) e em todo push na `main`. São 3 jobs independentes, cada um numa máquina própria:

| Check | O que verifica | Falha quando |
|---|---|---|
| `qualidade` | Instala com `npm ci`, roda lint, tipos e testes unitários | Código fora do padrão, erro de tipo ou teste quebrado |
| `invariantes` | Roda a guarda (`scripts/guard-invariants.ts`) e os testes de `tests/invariants/` | Um inegociável quebrou, um teste dele foi pulado, ou a pasta mudou sem o rótulo `invariante-aprovado` |
| `dependencias` | Confere **só as dependências que o PR adiciona ou muda** | Alguma tem vulnerabilidade conhecida de gravidade alta ou crítica |

Os três viram **checks obrigatórios** no M6: com qualquer um vermelho, o botão de merge trava.

### Como ler um check vermelho

1. No fim da página do PR, na caixa de checks, procure o ❌ e clique em **Details** ao lado dele.
2. Abre a página do job, com a lista de **steps** à esquerda. O step com ❌ é onde parou; os seguintes nem rodam.
3. Clique no step vermelho para abrir o **log** (o texto que a máquina escreveu). Leia de baixo para cima: a causa costuma estar nas últimas 20 linhas.
4. Procure estas palavras:
   - `not ok`: teste que falhou, com o nome dele (ex.: `INV-001b`);
   - `error`: lint ou tipos;
   - `❌ Guarda dos invariantes`: a guarda explica o motivo em português.
5. Atalho: a aba **Summary** do job mostra o resumo da guarda dos invariantes sem precisar abrir o log.

Depois, peça ao agente: *"o check X falhou com esta mensagem: …, corrija na mesma branch"*. Se o vermelho for em `invariantes`, o agente **não** pode mexer no teste: ou corrige o código, ou para e te pergunta (`AGENTS.md`, seção 1.2).

### Rótulo `invariante-aprovado`

Quando **você** decide mudar uma regra inegociável:
1. Abra o PR.
2. Na coluna da direita, em **Labels**, aplique `invariante-aprovado`.
3. A guarda roda de novo e aceita a mudança na pasta.

Mesmo com o rótulo, testes pulados (`.skip`, `.todo`, `.only`) **nunca** passam.

Limite atual: o agente trabalha com a sua conta do GitHub e, tecnicamente, consegue aplicar o rótulo. Hoje isso fica coberto de três formas:
- o `AGENTS.md` proíbe qualquer agente de aplicar ou remover o rótulo;
- a guarda registra no **Summary** do job quem aplicou ou removeu o rótulo, e quando;
- a revisão confere.

O M6 resolve de vez, dando ao agente uma identidade própria no GitHub.

### Custos do CI

- **Repositório público** (como este template): os runners padrão do GitHub são **grátis**.
- **Repositório privado:**
  - o plano Free inclui 2.000 minutos por mês, e o Pro, 3.000;
  - passando disso, o Linux padrão custa US$ 0,006 por minuto.
- Cada PR usa 3 jobs de cerca de 1 minuto cada. Pushes seguidos no mesmo PR cancelam a execução anterior, para não gastar minutos à toa.

## Revisor independente (check `revisao`)

Todo PR **pronto** (rascunhos não) recebe uma revisão automática, publicada como **um** comentário no PR. Quem revisa é um modelo de **outro provedor** que o agente que implementou, porque quem escreveu o texto não enxerga os próprios erros.

### Quando o revisor roda (e quanto custa cada vez)

| Situação | O que acontece | Chama o modelo? |
|---|---|---|
| PR em **rascunho** (o agente ainda está trabalhando) | Nada | Não |
| PR marcado **Ready for review** (ou aberto já pronto) | **Revisão completa** do PR inteiro | Sim, uma vez |
| **Push** depois da revisão | Mantém o veredito anterior e avisa no comentário que há commits não revisados. Fica **vermelho** em qualquer destes casos: os commits novos têm possível segredo; tocam caminho sensível; ainda há bloqueante em aberto; a última tentativa de revisão falhou; o commit revisado sumiu (force-push). Com `afterReviewPush: "exigir-nova-revisao"` em `.github/review.json`, qualquer push fica vermelho até uma nova revisão | Não |
| Rótulo **`revisar-de-novo`** (você ou o agente aplicam) | **Revisão incremental**: só o diff desde o último commit revisado, conferindo se cada achado anterior foi resolvido. O rótulo é removido sozinho, para poder ser aplicado de novo. Se um push chegar logo depois e a fila do GitHub descartar essa execução, o push encontra o rótulo e faz a revisão no lugar dela | Sim, menor |
| Rótulo **`revisão-profunda`** (só você) | Revisão completa com o modelo mais forte (Opus) | Sim, mais cara |
| PR **trivial**: só `README.md`, `CHANGELOG.md` e `docs/**/*.md`, ou só lockfile. Nunca é trivial se tocar documento que orienta agentes (`AGENTS.md`, `CLAUDE.md`, `REVIEW.md`, `specs/`, `docs/missions/`, `docs/HANDOFF.md`, `docs/SKILLS.md`, `SKILL.md`, `.claude/`) ou caminho sensível | Revisão **leve** (mesmo modelo, raciocínio curto) ou **nenhuma** (só os detectores de segredo), conforme `trivial.mode` em `.github/review.json` | Leve ou não |

O commit revisado e os achados em aberto ficam guardados no próprio comentário do revisor, de forma invisível. É por isso que a revisão incremental sabe de onde partir.
- Ninguém deve editar esse comentário. Se ele for adulterado, o estado é validado e, se estiver inválido, é ignorado.
- Um force-push que apague o commit revisado deixa o check vermelho, e a próxima revisão volta a ser completa.
- A revisão incremental só olha os arquivos do PR: um merge da `main` na branch não infla o diff.

- **Segredos** são decididos só pelos detectores, que rodam sobre o PR inteiro em toda execução. O achado só some quando o segredo sai do PR; o modelo nunca decide isso.
- **Lockfiles** (`package-lock.json` e afins) nunca são enviados ao modelo. Quem os cobre é o check `dependencias`, que olha vulnerabilidades conhecidas. Um PR só de lockfile não recebe revisão de conteúdo.

A simulação de ponta a ponta desse fluxo, com um GitHub e um modelo falsos, roda em todo `npm test` (`tests/unit/review-flow.test.ts`).

### Como funciona

1. O workflow `.github/workflows/review.yml` calcula o diff do PR.
2. **Filtro de segredos, antes de qualquer envio:**
   - arquivos `.env*` (menos o `.env.example`), chaves e certificados **nunca** são enviados;
   - linhas com cara de chave ou token viram `[REDIGIDO]`;
   - segredo numa linha **adicionada** vira achado bloqueante sem nem perguntar ao modelo.
3. **Escolha do nível:**

   | Nível | Quando | Modelo padrão | Segredo |
   |---|---|---|---|
   | `padrao` | PR comum | DeepSeek `deepseek-v4-pro` | `REVIEW_API_KEY` |
   | `sensivel` | PR toca caminho sensível (`sensitivePaths` em `.github/review.json`: invariantes, evals, CI, autenticação, pagamento, IA…) | Claude `claude-sonnet-5-5` | `REVIEW_DEEP_API_KEY` |
   | `profunda` | Você aplica o rótulo `revisão-profunda` | Claude `claude-opus-5-5` | `REVIEW_DEEP_API_KEY` |

   Sem o `REVIEW_DEEP_API_KEY`, o escalonamento não acontece: o nível padrão revisa e o relatório **diz isso** explicitamente.
4. O modelo recebe o `REVIEW.md` e o `AGENTS.md` **da branch de destino** (um PR não afrouxa a própria revisão) e responde em JSON.
   - Esses dois arquivos vêm sempre **no começo** do prompt, e do mesmo jeito, em toda revisão.
   - Provedores com cache de contexto, como a DeepSeek, cobram cerca de 3% do preço por esse trecho repetido.
   - Na Anthropic (níveis `sensivel` e `profunda`) o cache **não** é ativado: gravar no cache custa 25% a mais e ele dura 5 minutos, o que não compensa em revisões espaçadas.
   - O relatório mostra quantos tokens vieram do cache.
5. Achado sem evidência, ou que cita arquivo fora do diff, é **descartado**, e o relatório conta quantos foram descartados.
6. Algum **bloqueante** deixa o check `revisao` vermelho. Importantes e sugestões só aparecem no comentário.
7. Se o revisor falhar (provedor fora do ar, resposta inválida, diff grande demais), o check fica **vermelho** e o relatório diz que nada foi verificado. Erro nunca vira "aprovado".

### Trocar de provedor

- **Nível padrão:** em Settings → Secrets and variables → Actions → **Variables**, crie `REVIEW_API_BASE_URL` (qualquer API no formato da OpenAI) e `REVIEW_MODEL`. A chave continua no segredo `REVIEW_API_KEY`.
- **Outros níveis e limites:** edite `.github/review.json` (protegido por CODEOWNERS). Lá ficam:
  - os caminhos sensíveis;
  - o tamanho máximo do diff (`maxDiffChars`);
  - o tempo máximo de espera (`timeoutMs`);
  - os preços usados na estimativa de custo.

### Testar na sua máquina (sem colar chave em lugar nenhum)

```bash
read -s REVIEW_API_KEY        # cole a chave e tecle Enter (nada aparece na tela)
printf 'REVIEW_API_KEY=%s\n' "$REVIEW_API_KEY" > .env.local
unset REVIEW_API_KEY
chmod 600 .env.local          # só você lê o arquivo
npm run review:dry-run        # confere o que seria enviado, sem custo
npm run review:local          # revisão real da sua branch
```

O `.env.local` está no `.gitignore` e o Claude Code não tem permissão de lê-lo (`.claude/settings.json`).

### Canário do revisor

Um PR **fictício** com 6 defeitos plantados (`scripts/review/canary/`):
- invariante desligado;
- `catch` que devolve pedido grátis;
- comando do e-mail do cliente executado;
- chave no código;
- ✅ sem evidência;
- stack trace mostrado ao cliente.

O workflow **Canário do revisor** roda todo dia 1, em todo PR que muda o revisor, e sob demanda (aba Actions → Run workflow). Ele falha se algum defeito passar despercebido.

É assim que você descobre se uma troca de modelo ou de critérios piorou a revisão.

Por que um PR fictício, e não um PR de verdade: PRs abertos pelo próprio GitHub Actions não disparam outros workflows. Um PR real criado pelo robô não seria revisado.

### Custos

O relatório de cada execução mostra os tokens usados e o custo estimado. Por referência, um PR de tamanho médio (cerca de 20 mil tokens de entrada e 3 mil de saída) custa aproximadamente:

| Modelo | Preço (entrada / saída, por milhão de tokens) | PR médio |
|---|---|---|
| DeepSeek `deepseek-v4-pro` | US$ 1,32 / 3,96 no pico; metade fora do pico | ≈ US$ 0,04 |
| Claude `claude-sonnet-5-5` | US$ 2 / 10 | ≈ US$ 0,07 |
| Claude `claude-opus-5-5` | US$ 4 / 20 | ≈ US$ 0,14 |

Uma revisão incremental costuma custar bem menos que a completa (estimativa: cerca de US$ 0,03), porque o diff é pequeno e o começo do prompt vem do cache. O canário custa uma chamada por mês, mais uma a cada push em PRs que mudam o revisor. Os minutos do GitHub Actions seguem a tabela do CI acima (grátis em repositório público).

### Por que não "max-turns"

O revisor faz **uma** chamada por execução, sem ferramentas e sem loop. Por isso não precisa de limite de turnos (`--max-turns` só faz sentido para agentes que agem em vários passos). Os limites que valem aqui são:
- tamanho máximo do diff;
- tempo máximo de espera por resposta;
- `timeout-minutes: 15` no job.

## Ainda em construção

As seções abaixo entram nos próximos módulos:
- **M5:** evals no CI.
- **M6:** proteção da `main` para dev solo com agentes.
- **M7:** primeiro dia de um projeto novo (PRD → inegociáveis → primeira missão → primeiro PR).
