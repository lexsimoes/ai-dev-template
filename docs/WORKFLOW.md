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
| `npm run check` | Lint + tipos + testes + invariantes (o mesmo que o CI vai rodar) |
| `npm run test:invariants` | Só os inegociáveis |
| `npm run eval:mock` | Evals sem custo (testa só o encanamento) |
| `npm run eval` | Evals com o provedor de `LLM_PROVIDER` |

## Ainda em construção

As seções abaixo entram nos próximos módulos:
- **M3:** CI de qualidade e como ler um check vermelho.
- **M4:** revisão com Claude (`REVIEW.md`, `@claude`).
- **M5:** evals no CI.
- **M6:** proteção da `main` para dev solo com agentes.
- **M7:** primeiro dia de um projeto novo (PRD → inegociáveis → primeira missão → primeiro PR).
