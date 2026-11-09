# InfinityBot — InfinityTools

Bot Node.js para deploy no **Render como Web Service**. O `/painel` usa **Componentes V2**, o banner natalino fornecido em `assets/banner-natalino.jpg` e cinco botões. As respostas são efêmeras no Discord.

Após atualizar, publique `/painel` de novo: mensagens antigas não mudam automaticamente. O bot precisa de permissão para enviar mensagens e anexar arquivos.

## Painel e privacidade

Os quatro botões originais e seus IDs foram preservados:

- `panel:people` — perfis fictícios;
- `panel:cpf` — CPF fictício;
- `panel:spotify` — links locais para o site;
- `panel:cards` — cartões fictícios, sem valor.

O quinto botão, `names:open` (**Consultar @**), abre um modal privado. Informe o tamanho e o username sem `@`.

- Aceita apenas tamanho inteiro de **2 a 32** e username de **2 a 32** caracteres: letras minúsculas ASCII, números, `_` e `.`; `..` não é aceito.
- O tamanho precisa corresponder exatamente ao username. Usernames de um caractere não são permitidos pelo Discord.
- A consulta envia somente o username informado a `https://discord.com/api/v9/unique-username/username-attempt-unauthed`, por `POST` JSON, **sem token de usuário** e sem cabeçalho `Authorization`.
- O timeout é 8 segundos. Respostas 429, falhas HTTP/rede, timeout e payload inesperado não são tratados como disponibilidade.
- O resultado é **indicativo**, privado e não confirma posse, reserva, cadastro ou disponibilidade final. O bot não grava o username em arquivo, banco ou log.

> Essa rota é uma integração **não oficial**, observada no cliente do Discord. Ela pode mudar, ficar indisponível ou limitar automação. O projeto não tenta contornar limites, CAPTCHA, autenticação ou controles de acesso. Avalie os termos e permissões aplicáveis antes de produção.

O cooldown em memória é de 15 segundos por usuário para ações do painel, inclusive cada envio da consulta. Ele reinicia quando o serviço reinicia.

## Outras integrações

- **4Devs:** chamadas não oficiais com timeout de 8 segundos. Dados fictícios são enviados apenas na resposta efêmera e não são persistidos.
- **Spotify:** não usa API; links são montados localmente e não representam promoção, preço ou elegibilidade.

Operadores do Discord, 4Devs, Render, Discord e a infraestrutura de rede podem aplicar as próprias políticas de retenção aos dados que recebem.

## Requisitos e uso local

- Node.js **22 ou superior**
- Aplicação Discord com os escopos `applications.commands` e `bot`
- Permissões no canal: enviar mensagens e anexar arquivos

```bash
npm install
cp .env.example .env
export DISCORD_TOKEN='seu_token_do_bot'
npm start
```

O projeto não carrega `.env` automaticamente. Configure variáveis no shell ou no gerenciador de segredos. Para registrar `/painel` imediatamente em um servidor de testes, defina `DISCORD_GUILD_ID`. O registro usa `POST` somente para `/painel`, sem apagar outros slash commands.

Nunca envie o token ao Git, Discord ou arquivos ZIP. A conexão real ao Discord não foi feita durante a preparação deste pacote.

## Deploy no Render

1. Envie esta pasta a um repositório Git, sem `.env`, tokens ou `node_modules`.
2. No Render: **New +** → **Web Service** → conecte o repositório.
3. Configure:
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Secret:** `DISCORD_TOKEN`
   - Opcional: `DISCORD_GUILD_ID` para o servidor de testes
   - Opcional: Health Check Path: `/healthz`
4. Faça deploy e confira `Servidor HTTP ativo` e `InfinityBot conectado como ...` nos logs.

O servidor escuta em `0.0.0.0` na porta `PORT` do Render (padrão local `10000`). `/` e `/healthz` retornam o estado HTTP e da conexão Discord; HTTP 200 apenas indica que o processo HTTP respondeu.

Se `RENDER_EXTERNAL_URL` existir (o Render costuma fornecer), o processo faz ping ao próprio `/healthz` a cada 8 minutos. Isto não garante disponibilidade nem acorda um serviço já hibernado. No plano Free, o serviço pode hibernar após inatividade; mensagens do Discord não acordam um Web Service parado. Consulte a política atual do Render.

## Testes offline

```bash
npm test
node --check src/index.js
node --check src/name-lookup.js
node --check src/username-check.js
node --check src/fourdevs.js
```

Os testes não conectam ao Discord, não usam credenciais e usam mocks para todas as consultas externas. Eles cobrem Componentes V2, banner, cinco botões, handlers do modal, privacidade da resposta, validação, timeout/429 e o comportamento existente do painel.

## Estrutura

```text
src/index.js           Discord, /painel, cooldown e servidor
src/panel-view.js      painel natalino V2 com cinco botões
src/name-lookup.js     modal e resposta privada da consulta
src/username-check.js  validação e cliente não oficial com timeout
assets/banner-natalino.jpg  banner fornecido para /painel
src/http-server.js     health server para Render
.env.example           variáveis sem segredos
```
