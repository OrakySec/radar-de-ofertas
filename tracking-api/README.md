# tracking-api

Serviço de apoio do Radar de Ofertas. Faz duas coisas:

1. **Meta Conversions API** — recebe os eventos que o `script.js` do site dispara
   (`POST /api/tracking/meta-event`) e repassa pra Meta, com o mesmo `eventId` do
   Pixel pra ela deduplicar.
2. **Bot do Telegram** — conta quem entra e sai dos grupos e liga cada entrada ao
   clique/anúncio que a originou. Opcional: sem `TELEGRAM_BOT_TOKEN` fica desligado.

## Como o bot atribui cada entrada

```
visitante abre o modal (WhatsApp / Telegram) no site
        │  POST /api/tracking/telegram-link  (fbc, fbp, utm_*, gclid, IP, user-agent)
        ▼
tracking-api cria um link de convite ÚNICO (1 uso, expira em 24h) e guarda o clique
        │
        ▼  a pessoa toca em "Entrar pelo Telegram" -> usa esse link
bot (admin do grupo) recebe o aviso "fulano entrou pelo link X"
        │
        ▼
marca o clique como convertido e manda pra Meta o evento server-side
`JoinGroupConfirmed` (com o fbc/fbp/IP/UA guardados)
```

Se o link único não chegar a tempo (ou o servidor estiver fora), o site usa o link
fixo `LINK_IMPRESSAO3D_TELEGRAM`: a entrada ainda é **contada**, só fica "sem origem".

## Configuração (passo a passo)

1. **Criar o bot**: no Telegram, fale com [@BotFather](https://t.me/BotFather) →
   `/newbot` → guarde o **token**.
2. **Adicionar o bot como administrador** do grupo, com a permissão
   **"Convidar usuários via link"**. (Sem ser admin ele não recebe os avisos de entrada.)
3. No Portainer, na stack, preencha `TELEGRAM_BOT_TOKEN` e faça o redeploy.
4. **Descobrir os ids** (o bot responde sozinho):
   - mande `/id` pra ele no privado → é o seu `TELEGRAM_ADMIN_IDS`;
   - mande `/chatid` **dentro do grupo** → é o id do grupo (começa com `-100`).
5. Preencha as duas variáveis e faça o redeploy de novo:
   - `TELEGRAM_ADMIN_IDS` = seu id (vários separados por vírgula);
   - `TELEGRAM_CHATS` = `impressao3d:-100XXXXXXXXXX` (categoria:id; vários separados por vírgula).
6. **Testar**: abra o modal no site, escolha o Telegram, entre no grupo com uma conta
   de teste e mande `/stats` pro bot no privado.

### Validar o envio pra Meta antes de ligar de verdade

No Events Manager → **Eventos de teste**, copie o código (`TEST12345`), coloque em
`META_TEST_EVENT_CODE` e faça o redeploy. Os eventos aparecem ali sem contar nas
campanhas. **Depois de validar, esvazie a variável** — com ela preenchida, nada conta de verdade.

## Variáveis de ambiente

| Variável | Pra quê | Padrão |
|---|---|---|
| `META_PIXEL_ID` / `META_CAPI_TOKEN` | Conversions API | — |
| `META_TEST_EVENT_CODE` | manda os eventos como teste | vazio (desligado) |
| `TELEGRAM_BOT_TOKEN` | liga o bot | vazio (bot desligado) |
| `TELEGRAM_CHATS` | `categoria:idDoGrupo,...` (categorias: `casa`, `informatica`, `games`, `impressao3d`) | — |
| `TELEGRAM_ADMIN_IDS` | quem pode usar `/stats` | vazio |
| `TELEGRAM_LINK_TTL_HOURS` | validade do link único | `24` |
| `DATA_RETENTION_DAYS` | depois disso, apaga IP/UA/fbc/fbp/gclid do clique | `90` |
| `LINK_RATE_PER_IP` / `LINK_RATE_GLOBAL` | anti-abuso: links por IP a cada 10 min / total por hora | `5` / `300` |
| `DB_PATH` | arquivo do banco | `/data/radar.db` |

## Comandos do bot

- `/id` — mostra o seu user id (privado)
- `/chatid` — mostra o id do chat (use dentro do grupo)
- `/stats [dias]` — entradas, saídas, quantas vieram do site (com origem), taxa de
  conversão dos links gerados, entradas por `utm_source` e por dia (só admins)

## Dados e privacidade

- Do clique guarda: IP, user-agent, `fbc`/`fbp`, `gclid`, UTMs e a URL da página — os mesmos
  dados que já vão pra Meta pelo CAPI. Esses campos pessoais são **apagados após
  `DATA_RETENTION_DAYS`** (os contadores ficam).
- Do Telegram guarda **só um hash** (HMAC) do id de quem entrou — nada de nome, @usuário
  ou id puro. Serve pra não contar a mesma pessoa duas vezes.
- O banco é um arquivo SQLite no volume `radarofertas_tracking_data`. Faça backup dele se o
  histórico importar.

## Desenvolvimento

```bash
cd tracking-api
npm ci
npm test          # servidores falsos do Telegram e da Meta; sem token, sem rede
```

Requer Node >= 22.13 (usa o `node:sqlite` embutido, sem dependência nativa).
