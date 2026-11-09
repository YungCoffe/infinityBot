# InfinityBot — somente consulta de nicks Discord

Bot Discord em **Node.js** para publicar no Render como **Web Service**. Mantém somente o painel natalino de consulta indicativa de usernames Discord. Não usa Docker, banco de dados, `.env`, conta pessoal, senha ou token de usuário.

> Depois de atualizar, publique `/painel` novamente: painéis antigos não são alterados automaticamente.

## Segurança e limites importantes

- O bot usa exclusivamente `DISCORD_TOKEN`, o **token do bot**, como variável secreta de ambiente.
- Ele nunca pede, usa ou salva senha, token, cookie ou login de conta pessoal; não altera, reserva ou cadastra usernames.
- “Aparentemente disponível” significa somente resposta válida `taken: false`; não é garantia final e pode mudar.
- A rota de usernames é não oficial e não autenticada. Pode mudar, falhar ou retornar HTTP 429; **não existe correção garantida** para esse limite.
- Não há contorno de rate limit, CAPTCHA ou autenticação, nem retentativa automática de um lote interrompido.

## Painel `/painel`

Somente administradores publicam o painel. O botão **Encontrar @** abre um modal privado com tamanho (2–32), meta (1–5) e `@` opcional. Quando o `@` é preenchido com meta 1, somente ele é testado. Para meta maior, ele é testado primeiro e candidatos distintos são gerados até a meta, erro, prazo ou máximo de **25 tentativas**.

### Fila, progresso e 429

- Toda consulta é serializada numa **fila global**: há exatamente **30 segundos entre os inícios** de quaisquer duas requisições, inclusive entre lotes concorrentes e depois de falha, timeout ou 429. A primeira não espera; não há espera extra após a última.
- A resposta privada exibe a barra real de tentativas (até 25), a consulta atual e a próxima consulta durante o intervalo. Se houver lote anterior, avisa a posição na fila antes de esperar.
- Há cooldown em memória de **30 segundos por usuário**, para bloquear reenvios repetidos antes de entrarem na fila. A fila aceita no máximo três lotes; além disso, responde sem consultar.
- Em HTTP 429, o lote é interrompido imediatamente. O `Retry-After`/`retry_after` recebido é cumprido estritamente: nenhuma nova requisição começa durante o cooldown global. A mensagem mostra o prazo e uma barra de tempo; o fim do relógio não inicia lote automaticamente nem confirma disponibilidade.
- Um `Retry-After: 1631` equivale a cerca de 27 minutos e 11 segundos. Aguarde até o fim do prazo recebido mesmo após redeploy: reiniciar o serviço perde o cooldown que estava **somente em memória**, e o Render sem armazenamento persistente não o preserva permanentemente. O redeploy nunca garante resolver um 429.
- A rota pode continuar recusando mesmo com 30 segundos. Reduzir quantidade de pedidos, não reenviar o mesmo formulário e respeitar a fila/cooldown são as medidas reais adotadas para reduzir 429; não há como garantir eliminá-lo sem suporte oficial da rota.

### Prazo de interação e resultados parciais

Com 25 tentativas, `30s × 25 = 12m30s` somente de espaçamento, além da rede e da fila; isso pode superar a vida aproximada de 15 minutos de uma resposta de interação Discord. Por isso cada busca tem prazo conservador de **12 minutos contados da criação da interação, antes da fila**. Ao alcançar o prazo — inclusive enquanto espera na fila ou o intervalo — ela não inicia mais consultas e retorna os resultados parciais enquanto ainda pode editar a resposta. Isso pode reduzir a quantidade de resultados, mas nunca inventa disponibilidade.

## Deploy no Render (Web Service Node)

1. Extraia o ZIP e envie os arquivos extraídos na raiz do repositório.
2. No Render: **New + → Web Service**, runtime **Node** (não Docker).
3. Configure **Build Command** `npm ci`, **Start Command** `npm start` e health check `/healthz`.
4. Em **Environment**, crie o segredo `DISCORD_TOKEN` com o token do bot. Nunca o coloque no Git, ZIP, `.env` ou mensagens.
5. Faça o deploy.

A aplicação escuta `0.0.0.0` e `process.env.PORT` (fallback local `10000`). `/` e `/healthz` retornam 200 sem token, mas o Discord fica offline. `render.yaml` já descreve o serviço Node.

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `DISCORD_TOKEN` | Para conectar | Token do bot, lido só do ambiente. |
| `DISCORD_GUILD_ID` | Não | Servidor de testes para registrar `/painel` mais rápido. |
| `RENDER_EXTERNAL_URL` | Não | URL para ping opcional. |
| `PORT` | Não | Definida pelo Render; padrão local `10000`. |

## Uso local e verificações

Requer Node.js 22 ou superior:

```bash
npm ci
npm test
node --check src/index.js
node --check src/name-lookup.js
node --check src/username-batch.js
```

Os testes são offline e simulam relógio, fila, espaçamento, expiração do prazo, 429 e falhas. Não conectam ao Discord, não usam credenciais e não fazem chamadas externas.
