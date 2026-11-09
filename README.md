# InfinityBot — frases horárias de anime

Bot Node.js para Discord/Render, **sem Docker e sem banco de dados**. Esta edição registra apenas `/frases`: não inclui painel, consulta ou arquivos de nicks.

## Uso no celular

No canal do Discord, digite `/frases`. O aplicativo mostra os subcomandos e o seletor de canal. Somente membros com permissão **Administrador** podem configurar.

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
- Cada postagem recebe uma chave de data+hora de São Paulo. Assim, se a configuração acontecer em `00:00` ou `00:01`, a verificação daquele mesmo horário encontra a postagem inicial e não duplica o envio.
- Há bloqueio por canal para serializar configuração, timer e chamadas simultâneas. Outros canais configurados não são afetados.
- Não recupera horas perdidas. Não rode duas instâncias do mesmo bot: a deduplicação por histórico reduz duplicatas, mas não substitui uma única instância ativa.
- O bot procura seus próprios marcadores nos últimos 7 dias e pula o envio se não conseguir verificar o histórico com segurança.
- A fonte é Animechan (`/v1/quotes/random`). Há até 3 tentativas para uma frase positiva, máximo local de 100 consultas/dia/IP e respeito a HTTP 429/`Retry-After`. Falhas/timeout não são sucesso.

## Tradução automática, limites e diagnóstico

Não é necessária chave, credencial, banco ou serviço próprio para traduzir.

1. **MyMemory é sempre a primeira opção**, com `en|pt-BR`. O texto é dividido sequencialmente em frases ou no último espaço disponível, em blocos de no máximo **480 bytes UTF-8**. Isso evita o limite público de tamanho sem quebrar caracteres multibyte. Os blocos são recompostos somente se **todos** forem válidos; se um único bloco falhar, nenhum trecho parcial é publicado.
2. Como fallback, o bot usa a API pública oficial do **Apertium** em duas etapas: `eng|spa` e `spa|por_BR`. O rodapé e o campo Fonte dizem exatamente **“tradução automática Apertium, via espanhol”**. É uma alternativa de disponibilidade, não promessa de qualidade: a passagem pelo espanhol pode produzir redação inferior.
3. Se as duas alternativas falharem, a frase é publicada integralmente no **original em inglês**, com o rótulo `original em inglês; tradutores indisponíveis`. Ela nunca é apresentada como traduzida e nunca mistura blocos/traduções de provedores diferentes.

MyMemory só é aceito com `responseStatus` 200, `quotaFinished` diferente de `true`, conteúdo não vazio e sem sinais de aviso, quota, crédito, limite ou erro. Apertium também rejeita erros e os marcadores `*`, `#` e `@`, que indicam palavra não reconhecida/resposta inadequada. Entidades HTML são decodificadas quando necessário e `@` de textos aceitos é neutralizado para não gerar menções no Discord; os payloads do Discord também usam `allowedMentions: { parse: [] }`.

HTTP 403/429, quota, timeout e falhas de rede são tratados como indisponibilidade, **não como sucesso**. O bot não raspa Google, não tenta contornar 429 e registra somente o provedor/código/motivo técnico (sem texto da frase ou dados sensíveis). Se houver falha, consulte os logs do Render por mensagens `Tradução MyMemory` ou `Tradução Apertium`; o embed/rodapé confirma qual resultado foi usado. APIs públicas podem mudar, limitar uso ou ficar indisponíveis.

## Capas e imagem de fallback

A capa remota é pesquisada no AniList com timeout. Ela só é usada se o título corresponder exatamente (após normalização) ou a um sinônimo seguro mapeado explicitamente; resultados parecidos não são aceitos, para não misturar animes. Com capa válida, o embed usa somente a URL HTTPS remota e **não anexa fallback**.

Sem capa, sem correspondência segura, timeout, falha de API ou resposta inválida, o embed usa `attachment://infinity-fallback.jpg` e anexa exclusivamente `assets/infinity-fallback.jpg`, a imagem local fornecida pelo usuário. Ela é apenas a imagem de fallback: o bot não cria nem afirma criar fundo com texto sobreposto.

Capas continuam sujeitas aos direitos de seus titulares e aos termos do AniList; AniList, Animechan, MyMemory e Apertium possuem seus próprios termos, disponibilidade e limites.

## Deploy no Render (Node)

1. Extraia o ZIP na raiz do repositório e envie para seu Git.
2. No Render, use **New → Web Service**, ambiente **Node** (sem Docker).
3. Build command: `npm ci`; Start command: `npm start`; health check: `/healthz`.
4. Em **Environment**, crie `DISCORD_TOKEN` como segredo. Opcional: `DISCORD_GUILD_ID` para registrar rápido em um servidor de teste e `RENDER_EXTERNAL_URL` para self-ping.
5. Convide o bot com os escopos `bot` e `applications.commands`, dê as permissões acima e use `/frases configurar`.
6. Após mudar variáveis/código, faça **Manual Deploy → Deploy latest commit** ou reinicie o serviço. Depois do restart o bot restaura canais pelos pins.

Tiers que dormem, rede, APIs externas e deploys podem atrasar ou impedir posts; não há garantia de entrega exatamente uma vez.

## Testes

A suíte é offline, com mocks: não conecta ao Discord e não consulta APIs reais. Ela cobre MyMemory preferido, resposta curta como `Lute! → Seja forte.`, HTML/menções, blocos longos multibyte, 403/429/quota, fallback Apertium via espanhol, erro/marcadores Apertium, ausência de mistura parcial e fallback original, além de envio imediato, agendamento, permissões, deduplicação e capas.

```bash
npm ci
node --test
node --check src/index.js
node --check src/hourly-quotes.js
node --check src/quote-artwork.js
```
