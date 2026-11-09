# InfinityBot — frases horárias de anime

Bot Node.js para Discord/Render, **sem Docker e sem banco de dados**. Esta edição registra apenas `/frases`: não inclui painel, consulta ou arquivos de nicks.

## Uso no celular

No canal do Discord, digite `/frases`. O aplicativo mostra os subcomandos e o seletor de canal. Membros com permissão **Administrador** ou **Gerenciar servidor** podem usar os comandos.

- `/frases enviar` — envia **imediatamente no canal atual**, sem precisar estar configurado. Não cria/remove pins, não muda a agenda ou a contagem de posts horários. O envio manual tem marcador próprio, participa da prevenção de repetição de citações e pode ocorrer mesmo se já houve post na mesma hora.
- `/frases configurar canal:#texto` — salva e fixa a configuração naquele canal e faz **uma tentativa de postagem imediatamente**. Depois, segue o ciclo nas horas cheias. Se a tentativa inicial falhar, a resposta informa isso claramente; a configuração permanece salva para as próximas horas.
- `/frases parar` — usado no canal ativo; remove somente o pin de configuração e para o envio. Não apaga mensagens já publicadas.
- `/frases status` — lista os canais ativos do servidor.

A configuração só passa a valer depois que a mensagem é enviada e fixada com sucesso. Se isso falhar, o canal não é mantido em memória e nenhuma frase é publicada. A configuração é o pin criado pelo bot no Discord, portanto sobrevive a restart/deploy sem banco. O bot só lê seus próprios pins e marcadores de rodapé; não lê conteúdo de mensagens pessoais.

## Permissões no canal

Conceda ao bot: `ViewChannel`, `ReadMessageHistory`, `SendMessages`, `EmbedLinks`, `AttachFiles` e `ManageMessages`.

`ManageMessages` permite fixar/remover a configuração. `AttachFiles` é obrigatório tanto na configuração quanto no envio, porque quando não há capa segura do anime o bot anexa a imagem local de fallback. Sem alguma permissão, `/frases configurar` não ativa o canal; se ela for removida depois, o envio é pulado.

## Horário, envio imediato e antirrepetição

- Fuso fixo: `America/Sao_Paulo`.
- O processo verifica a cada minuto e publica no minuto `00`; aceita `01` como pequena janela de segurança após atraso/restart.
- Ao configurar, ele tenta uma frase naquele instante somente no canal escolhido. Exemplo: configurado às `00:15`, tenta às `00:15` e volta a tentar normalmente às `01:00`.
- `/frases enviar` é manual: funciona no canal em que foi chamado, mesmo sem configuração prévia, e sempre tenta enviar. Seu marcador é separado do marcador de hora; assim, um envio manual não bloqueia a publicação agendada da mesma hora e uma publicação agendada não bloqueia o manual.
- Cada postagem recebe uma chave de data+hora de São Paulo. Assim, se a configuração acontecer em `00:00` ou `00:01`, a verificação daquele mesmo horário encontra a postagem inicial e não duplica o envio.
- Há bloqueio por canal para serializar configuração, timer e chamadas simultâneas. Outros canais configurados não são afetados.
- Não recupera horas perdidas. Não rode duas instâncias do mesmo bot: a deduplicação por histórico reduz duplicatas, mas não substitui uma única instância ativa.
- O bot procura seus próprios marcadores nos últimos 7 dias e pula o envio se não conseguir verificar o histórico com segurança.
- A fonte é Animechan (`/v1/quotes/random`). Há até 3 tentativas para uma frase positiva, máximo local de 100 consultas/dia/IP e respeito a HTTP 429/`Retry-After`. Falhas/timeout não são sucesso.

## Tradução automática, DeepL e limites

A ordem de tradução é: **DeepL oficial (opcional) → MyMemory → Apertium → original em inglês**. Cada provedor é tentado uma única vez; o bot não repete chamadas para contornar quota, HTTP 429 ou limites.

1. **DeepL (primeira opção quando configurado):** usa a API oficial por `POST`, com `source_lang: EN`, `target_lang: PT-BR` e a chave somente no cabeçalho `DeepL-Auth-Key`. A seleção automática usa `https://api-free.deepl.com/v2/translate` somente para chaves legadas que terminam em `:fx`; para qualquer outra chave usa `https://api.deepl.com/v2/translate`. Isso segue a documentação de autenticação para chaves Free legadas e Pro. O material atual para desenvolvedores usa `api.deepl.com`, mas a DeepL não deixa claro nessa documentação se uma chave do plano Developer termina em `:fx`; por isso não se deve inferir o sufixo de uma chave Developer. `DEEPL_PLAN=free` ou `DEEPL_PLAN=pro` substitui explicitamente a seleção automática para o host correspondente. Outros valores não aceitam URL nem host externo e voltam à seleção automática, para que a chave nunca seja enviada a terceiros. O Discord identifica o resultado como **“tradução automática DeepL”**.
2. **MyMemory:** fallback com `en|pt-BR`. O texto é dividido em blocos de no máximo **480 bytes UTF-8**; todos precisam ser válidos, ou nenhum trecho parcial é publicado. Opcionalmente, `MYMEMORY_CONTACT_EMAIL` configura o campo documentado `de` somente quando contém e-mail válido.
3. **Apertium:** fallback final de tradução em duas etapas, `eng|spa` e `spa|por_BR`. O rótulo é exatamente **“tradução automática Apertium, via espanhol”**.
4. Se tudo falhar, a frase é publicada integralmente no **original em inglês**, com `original em inglês; tradutores indisponíveis` — nunca como se tivesse sido traduzida.

DeepL sem chave, resposta inválida, timeout/rede, HTTP 429, HTTP 456 (quota) e outros HTTP falhos apenas acionam o próximo fallback. Não há retry adicional em torno de limites e o bot não tenta contornar a quota. Respostas vazias, inválidas ou iguais ao original também não são apresentadas como tradução (exceto um termo único neutro, como `anime`).

### Planos atuais e configuração da chave DeepL no Render

Segundo os [planos da API DeepL](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans), **API Free não aceita novos cadastros**. O plano grátis atual se chama **API Developer**, é [grátis sem cartão](https://www.deepl.com/en/developers) e tem o limite de **1.000.000 de caracteres no total, sem reinício mensal**. Não é correto tratá-lo como Free legado disponível para novos assinantes nem como quota mensal de 500 mil caracteres.

1. Registre você mesmo o plano/API adequado no site oficial da DeepL e gere sua chave. Você não precisa pedir nem enviar a chave em chat.
2. No Render, abra o serviço → **Environment** e crie `DEEPL_API_KEY` com a chave como segredo. **Não a coloque em chat, Git, ZIP, `.env.example` ou logs.**
3. Deixe `DEEPL_PLAN` vazio para seleção automática pelo sufixo legado `:fx`. Use `DEEPL_PLAN=free` somente quando precisar forçar o host legado `api-free.deepl.com`; use `DEEPL_PLAN=pro` para forçar `api.deepl.com`. Consulte a [documentação de autenticação](https://developers.deepl.com/docs/getting-started/auth) para os hosts oficiais e confirme o host adequado à sua conta.
4. Faça **Manual Deploy → Deploy latest commit** (ou reinicie o serviço) para a variável entrar em vigor.

A chave fica só no ambiente do Render e é enviada pela aplicação apenas aos dois hosts oficiais fixos da DeepL. A tradução envia o texto da frase ao provedor usado (DeepL, MyMemory ou Apertium): são serviços de terceiros, sujeitos às respectivas políticas de privacidade, termos, disponibilidade e limites. Não configure a chave se isso não for aceitável para o seu uso.

### E-mail opcional do MyMemory no Render

A documentação do MyMemory informa que o campo `de` com e-mail de contato pode elevar a quota para **50 mil caracteres por dia**. Isso **não garante** eliminar HTTP 429 ou outras limitações. Em **Environment**, crie `MYMEMORY_CONTACT_EMAIL` com um endereço de contato válido que você consentiu em enviar. Esse endereço é enviado ao MyMemory como `de`; não coloque segredo, token ou endereço de e-mail no código, no Git, em `.env.example` ou nos logs.

### Logs seguros no Render

Os logs registram somente provedor, categoria, bloco e duração — nunca texto da frase, URL completa, corpo de requisição/resposta, `DEEPL_API_KEY`, token Discord ou e-mail MyMemory. Exemplos: `Frases tradução provider=deepl status=success duracao_ms=42`, `Frases tradução provider=deepl status=http-456 duracao_ms=18`, `Frases tradução provider=mymemory status=success bloco=1/1 duracao_ms=42` e `Frases publicação canal=... modo=manual status=posted duracao_ms=310`.

Após o deploy, abra **Logs** no Render e filtre por `Frases tradução`, `Frases publicação` ou `comando=enviar`. Para pedir ajuda, compartilhe somente linhas de diagnóstico; **nunca** valores de Environment, URLs completas ou chaves.

## Capas e imagem de fallback

A capa remota é pesquisada no AniList com timeout. Ela só é usada se o título corresponder exatamente (após normalização) ou a um sinônimo seguro mapeado explicitamente; resultados parecidos não são aceitos, para não misturar animes. Com capa válida, o embed usa somente a URL HTTPS remota e **não anexa fallback**.

Sem capa, sem correspondência segura, timeout, falha de API ou resposta inválida, o embed usa `attachment://infinity-fallback.jpg` e anexa exclusivamente `assets/infinity-fallback.jpg`, a imagem local fornecida pelo usuário. Ela é apenas a imagem de fallback: o bot não cria nem afirma criar fundo com texto sobreposto.

Capas continuam sujeitas aos direitos de seus titulares e aos termos do AniList; AniList, Animechan, DeepL, MyMemory e Apertium possuem seus próprios termos, disponibilidade e limites.

## Deploy no Render (Node)

1. Extraia o ZIP na raiz do repositório e envie para seu Git.
2. No Render, use **New → Web Service**, ambiente **Node** (sem Docker).
3. Build command: `npm ci`; Start command: `npm start`; health check: `/healthz`.
4. Em **Environment**, crie `DISCORD_TOKEN` como segredo. Opcional: `DEEPL_API_KEY` (e `DEEPL_PLAN=free` ou `DEEPL_PLAN=pro` somente para substituição explícita; vazio usa seleção automática), `MYMEMORY_CONTACT_EMAIL`, `DISCORD_GUILD_ID` para registrar rápido em um servidor de teste e `RENDER_EXTERNAL_URL` para self-ping.
5. Convide o bot com os escopos `bot` e `applications.commands`, dê as permissões acima e use `/frases configurar`.
6. Após mudar variáveis/código, faça **Manual Deploy → Deploy latest commit** ou reinicie o serviço. Depois do restart o bot restaura canais pelos pins.

Tiers que dormem, rede, APIs externas e deploys podem atrasar ou impedir posts; não há garantia de entrega exatamente uma vez.

## Testes

A suíte é offline, com mocks: não conecta ao Discord e não consulta APIs reais. Ela cobre a seleção automática DeepL para chave legada `:fx` e chave sem `:fx`, substituições explícitas `DEEPL_PLAN=free`/`pro`, hosts controlados, POST/cabeçalho/payload, ausência de chave, resposta inválida, 429, 456, fallback MyMemory/Apertium, proteção contra vazamento de chave ou sufixo nos logs e rótulo Discord, além dos testes anteriores de MyMemory, Apertium, histórico, agenda, arte e envio manual.

```bash
npm ci
node --test
node --check src/index.js
node --check src/hourly-quotes.js
node --check src/frases-interaction.js
node --check src/quote-artwork.js
```
