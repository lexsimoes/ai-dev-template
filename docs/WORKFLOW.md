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
 🤖 4. PULL REQUEST ──── agente abre o PR com a tabela requisito → evidência → status
       │
       ├────────────────────────┬─────────────────────────────┐
       ▼                        ▼                             ▼
 🤖 5a. CI                 🤖 5b. REVISÃO               🤖 5c. PREVIEW (ex.: Vercel)
     lint · tipos · testes     Claude (outro modelo)        um endereço só deste PR,
     invariantes (obrig.)      lê o diff com o REVIEW.md    criado ANTES do merge
     auditoria de deps         bloqueante/importante/       para você clicar e testar
     evals (se tocou em IA)    sugestão
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

- Comente no PR o que está errado. Com o revisor configurado (M4), você pode escrever `@claude corrija X` no comentário.
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

## Ainda em construção

As seções abaixo entram nos próximos módulos:
- **M4:** revisão independente (`REVIEW.md`).
- **M5:** evals no CI.
- **M6:** proteção da `main` para dev solo com agentes.
- **M7:** primeiro dia de um projeto novo (PRD → inegociáveis → primeira missão → primeiro PR).
