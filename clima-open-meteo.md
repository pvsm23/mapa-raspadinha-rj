# Clima (Open-Meteo)

Temperatura, previsão de 3 dias, altitude e pôr do sol — no modal do
município e em chips flutuantes no mapa.

## Consumo da API: por que existe um servidor no meio

Medido no navegador, uma sessão ativa (ligar o Modo Clima, arrastar 4
vezes, abrir 3 municípios) gasta **5 requisições para 32 cidades** — o
agrupamento de até 40 por chamada já funciona. O problema não era esse.

O problema é que o consumo crescia **linearmente com o número de
usuários**: cada aparelho falava direto com o Open-Meteo. Os limites do
plano gratuito são 10.000/dia, 5.000/hora e **600/minuto** — dá ~1.000
a 2.000 sessões diárias, e o de minuto cai antes se muita gente abrir
junto.

**Solução:** `tools/apps-script-clima.gs` roda a cada 30 min, busca os
92 municípios em 3 chamadas agrupadas e escreve UM documento no
Firestore (`clima/atual`). Todos os clientes leem esse documento.

| | antes | depois |
|---|---|---|
| chamadas ao Open-Meteo | ~5 por sessão, × usuários | **144/dia, fixo** |
| custo por cliente | 5 chamadas externas | 1 leitura do Firestore |
| teto de crescimento | ~1.000 sessões/dia | nenhum na prática |

A busca direta **continua no código** e continua valendo: responde
quando o documento não existe, está velho (>90 min) ou não tem aquele
município. Nunca depender de uma coisa só.

### O "não achei" também é guardado

Enquanto o documento não existe, cada redesenho de chip disparava uma
leitura nova do Firestore — medi **4 numa sessão curta**, e o mapa
redesenha a cada arrasto. Guardando a falha por 5 min, virou **1**.

## Por que Open-Meteo

Gratuito, **sem chave de API** e sem cadastro. Isso importa aqui por um
motivo concreto: o repositório é público, e a regra do projeto é que
segredo nenhum entra em arquivo (ver `CLAUDE.md`). Uma API com chave
exigiria backend só pra escondê-la.

## Onde está o quê

| arquivo | papel |
|---|---|
| `js/clima.js` | busca, cache e tradução dos códigos WMO. **Não toca no DOM** |
| `js/script.js` | desenho: pílula do modal, instrumentos, chips do mapa |
| `css/styles.css` | bloco "CLIMA", no fim do arquivo |

## As três decisões que moldaram o módulo

**1. Uma requisição para várias cidades.** O endpoint aceita `latitude`
e `longitude` separadas por vírgula e devolve um array na mesma ordem.
O Modo Clima mostra dezenas de chips ao mesmo tempo — sem isso seriam
dezenas de chamadas a cada zoom.

**2. Cache com validade de 30 min**, em memória e em `sessionStorage`
(não `localStorage`: não faz sentido servir o tempo de ontem). Clicar
num chip abre o modal com o clima **já pronto**, porque veio do cache.

**3. Falha é silenciosa.** Sem rede, a API devolve `null` e a pílula e
os instrumentos somem. Clima é enfeite — não pode derrubar o mapa nem o
modal. Verificado simulando `fetch` que rejeita.

## Coordenada do município

Duas fontes, e elas **precisam concordar**:

- **No cliente**, a coordenada sai da posição do rótulo no mapa,
  invertendo a projeção de `projetarCoordenada()`.
- **No servidor**, o Apps Script lê `data/municipios-coordenadas.json`,
  gerado por `tools/geojson-to-svg.js` desprojetando **a mesma** posição
  de rótulo.

Ter a mesma origem não é detalhe: com duas referências diferentes, o
clima publicado e o que o cliente buscaria sozinho seriam de pontos
distintos, e a temperatura mudaria conforme o caminho que a resposta
tomou. A lista também **não** é copiada para dentro do `.gs` — duas
listas desencontrariam na primeira vez que o mapa mudasse.

**Precisão medida** contra a média dos pontos turísticos verificados:
erro mediano **~6,6 km**, pior caso **~30 km** (Angra dos Reis, cujo
território se espalha por ilhas — o centro da caixa cai no mar). Para
clima isso não muda nada. Não serve para nada que precise de posição
exata, e é por isso que os pontos turísticos têm coordenada própria.

## Anti-poluição dos chips

Três filtros que se somam, nesta ordem:

1. **Zoom** — reaproveita `ZOOM_DOS_NIVEIS_ROTULO`. Se o nome do
   município não cabe na tela, o chip também não cabe; assim os dois
   aparecem e somem juntos em vez de brigarem.
2. **Campo de visão** — recorta contra o retângulo da **camada**, não o
   do `<svg>`. Com zoom 6 o SVG fica 6× maior que a tela, e medir
   contra ele deixava passar chip invisível, buscado na API à toa.
3. **Colisão de caixas** — quem já está posicionado bloqueia o espaço.

O desempate é a **área do município** (`getBBox`, em cache). A primeira
tentativa usou o `--rotulo-base` do rótulo, mas ele é limitado entre
4.0 e 5.5: dezenas empatam no teto e a ordem volta a ser a do DOM, que
é **alfabética** — Angra dos Reis venceria o Rio de Janeiro por ser "A".
Com a área, os maiores ganham: Campos, Rio de Janeiro, Resende.

Teto de 28 chips por desenho. Redesenho custa ~8 ms e é agrupado
(debounce de 160 ms) para não rodar a cada quadro do arrasto.

**Mapa muito afastado** mostra "Aproxime o mapa para ver o clima das
cidades" em vez de não fazer nada — botão aceso com tela inalterada
parece defeito.

## Detalhe de CSS que custou caro

A previsão colapsada usa `grid-template-rows: 0fr → 1fr`, que é o
truque para animar até uma altura desconhecida (`height: auto` não
anima). Duas armadilhas:

- **`0fr` zera só a PRIMEIRA linha.** Com os três dias como filhos
  diretos, os outros dois caíam em linhas implícitas de altura
  automática e a pílula "fechada" nascia com 84 px em vez de 34 px.
  Por isso existe o wrapper `.clima-previsao-interna`: o grid precisa
  ter **um único filho**.
- **A previsão escondida ainda ditava a LARGURA.** Flex column mede
  pelo filho mais largo, então a pílula fechada tinha 131 px — larga
  como se estivesse aberta, só que vazia. Resolvido dando largura fixa
  (148 px) que vai a zero quando fechada.

O bloco de CSS fica **depois da CAMADA UI MODERNA** de propósito: ela
força `background: var(--surf2) !important` em todo `button`, e tanto a
pílula quanto os chips são `<button>`.

## Vidro escuro nos dois temas

O glassmorphism usa cor escura fixa, não `var(--surf)`. A pílula flutua
sobre a arte do selo — imagem colorida e imprevisível — e vidro claro
sobre arte clara desaparece. Contraste do texto: **18,5:1** nos dois
temas.
