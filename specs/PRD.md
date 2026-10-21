# PRD: [nome do projeto]

> PRD = documento de requisitos do produto. Curto de propósito: se passar de 2 páginas, corte.
> Os trechos marcados **(exemplo)** se referem ao app de demonstração do template (loja com cupom e classificador de mensagens). Troque pelos do seu projeto.

**Dono:** @[seu-usuario] · **Última revisão:** [AAAA-MM-DD]

## 1. Objetivo

[Uma ou duas frases: que problema o produto resolve e para quem.]

(exemplo) Loja online pequena que aplica cupons de desconto corretamente e organiza as mensagens dos clientes por assunto, para responder mais rápido.

## 2. Usuários

| Quem | O que precisa |
|---|---|
| [tipo de usuário] | [necessidade principal] |
| (exemplo) Cliente da loja | Pagar o preço certo com cupom |
| (exemplo) Atendente | Ver as mensagens já separadas por assunto |

## 3. Critérios de aceite

Cada critério precisa ser **verificável**: alguém (ou um teste) consegue dizer sim ou não.

| ID | Critério | Como verificar |
|---|---|---|
| CA-01 | [critério] | [teste / comando / passo manual] |
| CA-02 | (exemplo) Cupom de X% reduz o total em X%, arredondado ao centavo | `tests/unit/pricing.test.ts` |
| CA-03 | (exemplo) Mensagens são classificadas em troca, entrega, pagamento ou outro com ≥ 90% de acerto | `npm run eval` (suite `classify-message`) |

## 4. Inegociáveis

Regras que **nunca** podem quebrar. Cada uma tem um teste em `tests/invariants/` que nenhum agente pode editar, pular ou enfraquecer. O CI exige que esses testes passem.

| ID | Regra | Teste |
|---|---|---|
| INV-001 | (exemplo) O total do pedido nunca é negativo nem maior que o subtotal; cupom fora de 0–100% é recusado | `tests/invariants/pricing.invariant.test.ts` |
| INV-002 | (exemplo) Texto de cliente é dado, nunca instrução: fica isolado no prompt e a saída do modelo só é aceita se estiver na lista fechada | `tests/invariants/llm-output.invariant.test.ts` |

## 5. Fora do escopo

- [o que este projeto **não** vai fazer, para evitar que a missão cresça sozinha]

## 6. Checagem de direção

Atualizada a cada missão, pelo agente, no PR da missão. Toda segunda-feira, o workflow `Checagem de direção` abre uma issue que confere esta tabela (os arquivos citados como evidência existem?) e pede a sua revisão. Mostra se o que existe hoje atende ao que foi pedido.

| Requisito | Evidência | Status |
|---|---|---|
| CA-01 | | ⬜ |
| CA-02 | `tests/unit/pricing.test.ts` passando | ✅ |
| CA-03 | Evals no CI com `deepseek-v4-pro`: 100% de acerto em 10 casos (PR #6, 2026-10-21); `.github/workflows/evals.yml` | ✅ |
| INV-001 | `npm run test:invariants` | ✅ |
| INV-002 | `npm run test:invariants` | ✅ |

Legenda: ✅ feito e verificado · 🟡 parcial · ⬜ não iniciado · ❌ quebrado
