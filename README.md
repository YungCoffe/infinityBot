# InfinityBot — InfinityTools

Bot Discord em Node.js para deploy no **Render como Web Service**. O bot não pede, persiste ou registra no projeto os dados retornados pelos geradores; as respostas do painel são efêmeras no Discord.

O painel tem tema de Natal, com cores vermelha e verde e ícones festivos. Após atualizar o bot, execute `/painel` novamente para publicar a versão decorada; mensagens antigas não são alteradas automaticamente.

## Recursos e limites

- `/painel` é restrito a administradores e publica botões persistentes. O registro usa `POST` somente para esse comando, sem apagar outros slash commands da aplicação.
- Há limite de **15 segundos por usuário** entre usos do painel e máximo de **5** links Spotify por resposta. O limite é só em memória e reinicia com o processo.
- Todas as respostas acionadas pelos botões são **efêmeras**.
- **CPF:** faz `POST` diretamente a `https://www.4devs.com.br/ferramentas_online.php` com `acao=gerar_cpf`, `pontuacao=S` e `cpf_estado=`.
- **Pessoas:** faz uma única chamada direta com `acao=gerar_pessoa`, `sexo=I`, `pontuacao=S`, `idade=`, `cep_estado=`, `cep_cidade=` e `txt_qtde=1`. O campo `senha` retornado pelo site não é exibido.
- **Cartões:** faz uma única chamada direta ao gerador público com `acao=gerar_cc`, `pontuacao=S` e `bandeira=master`; extrai número, validade e código de segurança da resposta HTML. **Cartões fictícios, sem valor.**
- **Spotify:** não há integração/API neste bot. Os links são montados **localmente** segundo o padrão client-side do site e apontam para [Spotify Premium](https://www.spotify.com/br-pt/premium/). Não vêm do Spotify e não representam promoção, preço ou elegibilidade.
- Cada chamada externa tem timeout de 8 segundos. HTTP 429 recebe uma mensagem específica; falhas de rede, timeout e respostas fora do formato são tratadas sem exibir corpo da resposta ou segredos.

> A integração 4Devs é **não oficial**. Ela usa endpoints internos observados no site público, pode mudar ou ser limitada sem aviso e não há confirmação de permissão do 4Devs para este uso automatizado. O projeto não tenta burlar bloqueios, limites, CAPTCHAs ou controles de acesso. Avalie permissões, termos e adequação antes de colocar em produção.

## Privacidade

O processo não grava CPFs, pessoas ou cartões em arquivo, banco, cache ou logs do aplicativo. O dado é transmitido ao Discord apenas na resposta efêmera da interação e ao 4Devs apenas nos parâmetros fixos acima. Operadores do Discord, 4Devs, Render e a infraestrutura de rede podem aplicar suas próprias políticas de retenção.

## Requisitos

- Node.js 22 ou superior
- Aplicação/bot no [Discord Developer Portal](https://discord.com/developers/applications)
- Permissões do bot: `applications.commands`, `bot`, envio de mensagens e embeds

## Instalação local

```bash
npm install
cp .env.example .env
```

O projeto não carrega `.env` automaticamente. Defina a variável no shell ou no gerenciador de segredos:

```bash
export DISCORD_TOKEN='seu_token_do_bot'
npm start
```

Opcionalmente, para registrar `/painel` só em um servidor de testes:

```bash
export DISCORD_GUILD_ID='id_do_servidor_de_testes'
```

Nunca envie token ao Git ou ao Discord. O bot registra `/painel` após conectar. **A conexão real ao Discord não foi testada neste ambiente**, portanto confirme permissões, token e logs no seu servidor.

## Deploy no Render (Web Service)

1. Envie o projeto a um repositório Git, sem `.env`, tokens ou `node_modules`.
2. No Render, escolha **New +** → **Web Service** e conecte o repositório.
3. Configure:
   - **Language:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variable (Secret):** `DISCORD_TOKEN`
   - Opcional: `DISCORD_GUILD_ID` para o servidor de testes.
   - Opcional: **Health Check Path** `/healthz`.
4. Faça o deploy e confira os logs para `Servidor HTTP ativo` e `InfinityBot conectado como ...`.

O servidor escuta em `0.0.0.0` na porta fornecida em `PORT` pelo Render (padrão local: `10000`). As rotas `/` e `/healthz` mostram se o processo HTTP responde e se o bot está conectado ao Discord. HTTP 200 significa que o processo está respondendo, não garante que o bot esteja conectado.

**Ping automático:** o serviço faz uma requisição ao próprio `/healthz` a cada 8 minutos enquanto está rodando, usando `RENDER_EXTERNAL_URL`, que o Render fornece automaticamente. Fora do Render, se essa variável não existir, o ping fica desativado. Ele apenas tenta manter o serviço ativo e não garante disponibilidade.

**Plano Free:** o Render pode hibernar o serviço após 15 minutos sem tráfego de entrada. Se o serviço já tiver parado, ele não consegue enviar o próprio ping para acordar; é necessária uma requisição externa. Mensagens do Discord não acordam o Web Service. Nos deploys pode haver sobreposição temporária de processos. Consulte os limites atuais do Render.

## Testes offline

```bash
npm test
node --check src/index.js
node --check src/fourdevs.js
```

Os testes usam `node:test` com mocks: conferem parâmetros exatos das três chamadas 4Devs, parsing de cartão, uma chamada de pessoa, HTTP 429, limites e Spotify local. Não conectam ao Discord, não usam credenciais nem colocam dados gerados nos arquivos.

## Estrutura

```text
src/index.js       Discord, /painel, limites e respostas efêmeras
src/http-server.js servidor HTTP para o Render
src/self-ping.js   ping automático a cada 8 minutos
src/fourdevs.js    cliente não oficial 4Devs, timeout e parsing
src/utils.js       Spotify local e apresentação segura
test/utils.test.js testes offline com mocks
.env.example       nomes de variáveis, sem segredos
```

## Lacunas conhecidas

- Os endpoints internos podem mudar, negar automação ou retornar formato diferente; nesse caso o botão informa falha e não há fallback que tente contornar controles.
- O cooldown é local ao processo. Em múltiplas instâncias seria necessário um rate-limit compartilhado, sem armazenar conteúdo gerado.
- Não foi feita conexão real ao Discord neste ambiente.
