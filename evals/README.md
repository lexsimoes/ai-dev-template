# evals/: testes para funções que usam LLM

A resposta de um LLM varia: o mesmo pedido pode sair com palavras diferentes. Por isso, em vez de testar "a saída é igual a X", medimos **quanto acerta num conjunto de casos conhecidos**.

## Peças

| Arquivo | Papel |
|---|---|
| `golden/<suite>.jsonl` | **Golden set**: um caso por linha, com entrada, resposta esperada e critério para o juiz |
| `config.json` | Suites, limites mínimos, queda máxima tolerada e **teto de chamadas** |
| `targets.ts` | Liga cada suite à função do app que ela mede |
| `run.ts` | O avaliador: roda os casos, aplica as regras, chama o juiz (opcional) e gera a tabela |
| `results/` | Saída de cada execução (ignorada pelo git) |

## Formato de um caso

```json
{"id": "entrega-01", "input": "Meu pedido não chegou", "expected": {"category": "entrega"},
 "mustNotContain": ["cupom"], "rubric": "O resumo diz que o pedido está atrasado.", "tags": ["injecao"]}
```

## Como a nota é calculada

1. **Regras determinísticas** (sempre, sem custo extra):
   - **acurácia**: o rótulo obtido é igual a `expected.category`?
   - **regras**: a saída passou na validação, respeita o tamanho máximo e não contém nada de `mustNotContain`?
2. **Juiz LLM** (opcional, `--judge`): outro chamado ao LLM dá nota de 1 a 5 seguindo o `rubric`. Ele mede o que regra fixa não mede (ex.: "o resumo é fiel?").
3. A execução **falha** se alguma métrica ficar abaixo do limite em `config.json`, ou se cair mais que `maxDropFromBaseline` em relação a uma linha de base (`--baseline`, ex.: os resultados da `main`).

## Como rodar

```bash
npm run eval:mock                       # sem chave e sem custo: testa só o "encanamento"
LLM_PROVIDER=anthropic npm run eval     # modelo real (precisa de ANTHROPIC_API_KEY no ambiente)
node evals/run.ts --provider anthropic --judge          # com juiz LLM
node evals/run.ts --provider anthropic --baseline caminho/da/main
```

Códigos de saída: `0` passou · `1` abaixo do limite ou caiu · `2` estourou o teto de chamadas.

> ⚠️ O provedor `mock` é um classificador de palavras-chave. Ele **não mede nenhuma IA real**: serve só para provar que testes, evals e CI funcionam.

## Agnóstico de provedor

O avaliador só conhece a interface `LLMClient` (`src/ai/types.ts`). Para outro provedor, crie um adaptador em `src/ai/providers/` e registre em `src/ai/llm.ts`. O golden set e as regras não mudam.

Variáveis: `LLM_PROVIDER`, `LLM_MODEL`, `EVAL_JUDGE_PROVIDER`, `EVAL_JUDGE_MODEL`, `EVAL_MAX_CALLS`.

## Custos

- Chamadas por execução = casos × (1 + 1 se houver juiz). Hoje: 10 casos → 10 chamadas (20 com juiz). O teto padrão é 60.
- Use sempre a chave de um **projeto de testes** com limite de gasto configurado no provedor, nunca a de produção.
- O adaptador Anthropic usa `claude-opus-5-5` por padrão (US$ 4 / US$ 20 por milhão de tokens de entrada/saída). Estimativa (ainda **não medida**): menos de US$ 0,10 por execução deste golden set; o M5 passa a medir os tokens de verdade. Para baratear, defina `LLM_MODEL` (ex.: `claude-haiku-5-5`, US$ 0,10 / US$ 0,50). A troca é decisão do dono, e o eval mostra se a qualidade se mantém.

## Adicionar uma suite nova

1. Crie `golden/<nova>.jsonl` com pelo menos 10 casos, incluindo casos difíceis e tentativas de injeção.
2. Adicione a função em `targets.ts`.
3. Registre a suite em `config.json` com limites.
4. Rode `npm run eval:mock` para validar o formato, e depois com o provedor real.

Casos existentes não são editados nem apagados para "passar": isso é enfraquecer teste (`AGENTS.md`, seção 5).
