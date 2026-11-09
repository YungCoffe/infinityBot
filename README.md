# InfinityBot — somente consulta de nicks Discord

Bot Discord em **Node.js** para publicar no Render como **Web Service**. Este projeto mantém somente o painel natalino de busca/verificação indicativa de usernames Discord. Não usa Docker, banco de dados, arquivo `.env`, conta pessoal, senha ou token de usuário.

> Depois de atualizar, publique `/painel` novamente: painéis antigos não são alterados automaticamente.

## Segurança e limites importantes

- O bot usa exclusivamente `DISCORD_TOKEN`, o **token do bot**, configurado como variável secreta de ambiente.
- Ele **nunca pede, usa ou salva** senha, token, cookie ou qualquer login de conta pessoal.
- Ele **não altera usernames**, não reserva nomes e não tenta fazer cadastro.
- “Aparentemente disponível” significa somente que uma resposta válida da rota retornou `taken: false`. Isso não é garantia de disponibilidade absoluta/final e pode mudar a qualquer momento.
- A verificação usa uma rota não oficial e não autenticada do Discord; ela pode mudar, falhar, responder de forma inesperada ou limitar consultas.
- Não há tentativa de contornar rate limit, CAPTCHA ou autenticação.

## Painel `/painel`

Somente administradores podem publicar o painel. O botão **Encontrar @** abre um modal privado com:

- **tamanho:** inteiro de 2 a 32;
- **meta:** 1 a 5 nicks aparentemente disponíveis;
- **@ opcional:** nick a testar, com ou sem `@`.

Quando o campo opcional é preenchido e a meta é **1**, somente esse nick é testado; se estiver em uso, o bot não gera outro. Para metas maiores, ele testa o nick informado primeiro e gera candidatos distintos até alcançar a meta, até uma falha, ou até o máximo de **25 tentativas**.

As consultas são **serializadas globalmente** e há um intervalo conservador, fixo, de **10 segundos entre o início de quaisquer duas requisições** — inclusive entre lotes, nicks específicos e depois de falhas. A primeira requisição não espera e não há espera extra depois da última. O máximo é **25 tentativas** por busca; só o intervalo pode levar cerca de **4 minutos** (além do tempo de rede), e usuários concorrentes podem demorar mais na fila. Também existe cooldown de 15 segundos por pessoa e fila máxima de três lotes, para permanecer dentro da janela de interação de aproximadamente 15 minutos.

Durante a busca, a resposta privada mostra o estado real da consulta e a barra de tentativas; entre chamadas, informa o intervalo global e a hora relativa da próxima consulta. Atualizações são agregadas e limitadas a no máximo uma edição a cada 5 segundos. Em HTTP 429, timeout, erro de rede, HTTP ou resposta inválida, o lote para; nenhum item sem resposta válida é tratado como disponível.

### Espera visível em HTTP 429

Quando a rota informar `retry_after`/`Retry-After`, a resposta privada mostra uma barra de tempo **real** e o horário relativo nativo do Discord (por exemplo, “em 2 minutos”). A mensagem é atualizada no máximo a cada 15 segundos, até 60 edições, e **não faz novas consultas**: ela apenas exibe o prazo já retornado. Esperas longas (acima de 14 minutos) ficam apenas com o horário relativo para não depender da validade da interação. Se ocorrer outro 429 em uma nova tentativa, o novo prazo prevalece para aquela nova resposta. O fim do relógio não significa que um nick está disponível nem garante que a próxima tentativa será aceita; o bot não retoma o lote automaticamente e reiniciar o bot encerra temporizadores pendentes.

## Deploy no Render (Web Service Node)

1. Extraia o ZIP e envie os arquivos extraídos na raiz do repositório: `package.json`, `package-lock.json`, `src/`, `assets/`, `README.md` e `render.yaml`.
2. No Render, escolha **New +** → **Web Service** e conecte o repositório.
3. Selecione runtime **Node** — não Docker.
4. Configure:
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/healthz`
5. Em **Environment**, crie o segredo `DISCORD_TOKEN` com o token do seu bot.
6. Faça o deploy. Nunca coloque tokens em Git, ZIP, `.env` ou mensagens.

A aplicação escuta `0.0.0.0` e `process.env.PORT` (fallback local `10000`). `/` e `/healthz` retornam HTTP 200 mesmo sem `DISCORD_TOKEN`; nesse caso o Discord fica offline, permitindo testar o Web Service com segurança.

O `render.yaml` já descreve o serviço Node, com `npm ci`, `npm start` e health check `/healthz`.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `DISCORD_TOKEN` | Para conectar ao Discord | Token do bot; lido somente do ambiente. |
| `DISCORD_GUILD_ID` | Não | ID de servidor de teste para registrar `/painel` mais rápido. Sem ela, o comando é global. |
| `RENDER_EXTERNAL_URL` | Não | URL `https://...onrender.com` para ping periódico opcional. |
| `PORT` | Não | Definida pelo Render; localmente o padrão é `10000`. |

`.env.example` contém apenas placeholders e o projeto não carrega `.env` automaticamente.

## Uso local e verificações

Requer Node.js 22 ou superior.

```bash
npm ci
npm test
node --check src/index.js
node --check src/name-lookup.js
node --check src/username-batch.js
```

Teste do HTTP sem token de Discord:

```bash
PORT=10001 npm start
# em outro terminal
curl http://127.0.0.1:10001/healthz
```

Os testes são offline e usam mocks: não conectam ao Discord, não usam credenciais e não fazem chamadas externas.
