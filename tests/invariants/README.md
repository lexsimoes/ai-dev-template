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

| Camada | Vale para | O que faz | Onde |
|---|---|---|---|
| Regra escrita | Qualquer agente | Proíbe e manda parar e perguntar | `AGENTS.md`, seção 1.2 |
| Trava local | **Só o Claude Code** | Recusa gravar nesta pasta | `.claude/settings.json` |
| Robô | Qualquer agente ou pessoa | Job `invariantes` do CI: falha se a pasta mudar sem o rótulo `invariante-aprovado`, se um teste for pulado (`.skip`, `.todo`, `.only`) ou se o número de testes cair | `.github/workflows/ci.yml` + `scripts/guard-invariants.ts` |
| Dono obrigatório | Qualquer agente ou pessoa | PR que toca aqui exige a aprovação do dono | `.github/CODEOWNERS` + proteção da `main` (M6) |
| Revisor | Qualquer PR | Mudança aqui = achado **bloqueante** | `REVIEW.md` (M4) |

**Codex, Cursor e outros agentes não leem `.claude/settings.json`.** Para eles, a proteção é o `AGENTS.md` (regra) mais o job obrigatório do CI (M3), que barra o PR mesmo que o agente desobedeça.

### Detalhes da trava local (Claude Code)

- A regra `Edit(...)` cobre **todas** as ferramentas de edição do Claude Code: Edit, Write, NotebookEdit e gravação por redirecionamento no Bash (`> arquivo`). Regras `Write(...)` ou `MultiEdit(...)` com caminho são aceitas, mas **nunca consultadas**, e geram aviso ao iniciar ([documentação](https://code.claude.com/docs/en/permissions)). Por isso o arquivo só usa `Edit`.
- Testado em 2026-10-21 numa sessão nova do Claude Code 2.1.306 (cópia descartável do repositório):
  - Write em `tests/invariants/` → bloqueado;
  - Edit em `.claude/settings.json` → bloqueado;
  - Write em `.github/CODEOWNERS` → bloqueado;
  - `echo x > tests/invariants/…` → bloqueado (o mesmo comando fora da pasta passou);
  - leitura de `.env.local` → bloqueada; leitura de `.env.example` → permitida.
- Limites:
  - a trava só vale em sessões **iniciadas dentro do repositório**, porque as configurações são carregadas no início da sessão;
  - ela não pega um script (Node, Python) que grave arquivos por conta própria.

  Por isso a garantia final é o CI.

## Como criar ou mudar um invariante (só o dono)

1. Escreva a regra no `specs/PRD.md` (Inegociáveis) com um ID novo.
2. Crie `tests/invariants/<tema>.invariant.test.ts` com o cabeçalho de arquivo protegido (copie de um existente) e testes com o ID no nome (`INV-003a: …`).
3. Prefira testes com **muitos casos** (incluindo valores extremos) a um único exemplo.
4. Confira que o teste **falha** quando o código quebra a regra: estrague o código de propósito, rode `npm run test:invariants`, veja vermelho e desfaça.
5. Abra um PR só para isso, aplique o rótulo `invariante-aprovado` e faça o merge depois de revisar.

## Exemplos nesta pasta

- `pricing.invariant.test.ts` (INV-001): mais de 10 mil combinações de subtotal e cupom; o total fica sempre entre 0 e o subtotal, e cupons fora de 0–100% são recusados.
- `llm-output.invariant.test.ts` (INV-002): o texto do cliente fica preso entre delimitadores no prompt, e nenhuma saída do modelo fora da lista fechada é aceita, nem mesmo de um modelo "comprometido".
