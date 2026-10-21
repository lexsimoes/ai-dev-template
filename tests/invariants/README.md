# tests/invariants/: os inegociáveis

⛔ **Nenhum agente pode editar, apagar, pular ou enfraquecer os arquivos desta pasta.** Se precisar, ele **para e pergunta** ao dono.

## O que é um invariante

Uma regra de negócio que **nunca** pode quebrar, não importa a missão. Exemplo: "o total de um pedido nunca é negativo".
Cada invariante tem um ID (`INV-001`, `INV-002`…) listado em **Inegociáveis** no `specs/PRD.md` e um arquivo de teste aqui.

## Por que ele é intocável

O agente que implementa uma mudança é o mesmo que roda os testes. Se ele pudesse mexer no teste, teria um atalho: em vez de consertar o código, "consertaria" o teste. Por isso estes testes funcionam como um **contrato** que só o dono assina.

- Um teste unitário comum (`tests/unit/`) pode mudar quando o comportamento muda de propósito.
- Um invariante só muda quando **a regra de negócio** muda, e quem decide isso é o dono.

## Camadas de proteção

| Camada | O que faz | Onde |
|---|---|---|
| Regra escrita | Proíbe e manda parar e perguntar | `AGENTS.md`, seção 3 |
| Trava local | Claude Code recusa editar esta pasta | `.claude/settings.json` |
| Dono obrigatório | PR que toca aqui exige a aprovação do dono | `.github/CODEOWNERS` + proteção da `main` (M6) |
| Robô | Job separado e obrigatório no CI; falha se a pasta mudar sem autorização ou se houver `.skip` | `.github/workflows/` (M3) |
| Revisor | Mudança aqui = achado **bloqueante** | `REVIEW.md` (M4) |

## Como criar ou mudar um invariante (só o dono)

1. Escreva a regra no `specs/PRD.md` (Inegociáveis) com um ID novo.
2. Crie `tests/invariants/<tema>.invariant.test.ts` com o cabeçalho de arquivo protegido (copie de um existente) e testes com o ID no nome (`INV-003a: …`).
3. Prefira testes com **muitos casos** (incluindo valores extremos) a um único exemplo.
4. Confira que o teste **falha** quando o código quebra a regra: estrague o código de propósito, rode `npm run test:invariants`, veja vermelho e desfaça.
5. Abra um PR só para isso. Você mesmo aprova e faz o merge.

## Exemplos nesta pasta

- `pricing.invariant.test.ts` (INV-001): mais de 10 mil combinações de subtotal e cupom; o total fica sempre entre 0 e o subtotal, e cupons fora de 0–100% são recusados.
- `llm-output.invariant.test.ts` (INV-002): o texto do cliente fica preso entre delimitadores no prompt, e nenhuma saída do modelo fora da lista fechada é aceita, nem mesmo de um modelo "comprometido".
