# Canário do revisor

Um PR **fictício** com 6 defeitos plantados, usado para medir se o revisor automático continua enxergando o que importa. É como o canário que os mineiros levavam para a mina: se ele para de cantar, há problema no ar.

- `canary.diff`: o diff fictício. Nunca é aplicado ao código.
- `pr.json`: título e descrição do PR fictício. A descrição marca ✅ sem evidência, de propósito.
- `expected.json`: os defeitos que o revisor **precisa** encontrar, com o arquivo, as linhas e a gravidade mínima.

O segredo falso é gerado na hora da execução, no lugar de `{{SEGREDO_FALSO}}`, para que nenhum valor parecido com chave fique no repositório.

Rodar:
- Pelo GitHub: aba Actions → **Canário do revisor** → Run workflow. Também roda todo dia 1 e em PRs que mudam o revisor.
- Localmente: `npm run review:canary` (precisa do `.env.local`, veja `docs/WORKFLOW.md`).

O canário falha se qualquer defeito plantado não for encontrado. Ao adicionar um defeito novo, atualize os três arquivos.
