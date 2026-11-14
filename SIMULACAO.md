# Simulação local de jogos

O comando `/simulacao iniciar` escolhe a quantidade (primeiros 1 a 500 do catálogo), duração total em minutos e intervalo em minutos (padrão 2). Use `/simulacao status` e `/simulacao parar`. A contagem de sinais a cada 15 segundos é calculada apenas em memória; nenhuma telemetria ou presença é enviada ao Discord. As respostas são privadas. Reiniciar ou suspender o processo apaga a simulação.

O catálogo contém 500 nomes. IDs foram associados por nome ou alias normalizado no endpoint público não documentado `https://discord.com/api/v10/applications/detectable`; 438 associações únicas, 53 sem correspondência e 9 ambíguas. Os 62 IDs não confirmados são null, nunca inventados. Correspondência por nome pode referir-se a outra edição, e o catálogo pode mudar.

Usa o token de bot já existente; não solicita token de conta pessoal. `/frases` permanece registrado.
