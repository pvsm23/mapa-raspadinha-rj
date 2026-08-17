# Revisão das coordenadas dos pontos turísticos

## Fase 1 — conferir as que já existiam ✅

170 pontos tinham coordenada. **8 estavam erradas.** Seis foram
corrigidas, duas ficaram sem pino (melhor nenhum que errado).

### Teste automático: passou limpo

`node tools/conferir-coordenadas.js` faz ponto-em-polígono contra a
malha do IBGE. **168 de 168 caem dentro do município certo**, nenhuma
fora do estado. Ou seja: o erro que você viu não era do tipo grosseiro
— era coordenada no município certo, no lugar errado. Esse tipo só
aparece cruzando o NOME do ponto com o ENDEREÇO que o geocodificador
devolveu, que é o que o `auditar-pontos.js` faz.

### As 8 erradas

| município | ponto | estava | ficou |
|---|---|---|---|
| Piraí | Lago de Piraí | no **Lago de Rejeitos da Fábrica**, em Santanésia — uma lagoa de rejeito industrial, a 22 km | na represa de Ribeirão das Lajes |
| Angra dos Reis | Ilha Grande (Vila do Abraão) | no **Saco do Céu**, outra vila da ilha | na Praia do Abraão |
| Saquarema | Lagoa de Saquarema | na **Lagoa de Urussanga**, outra lagoa do mesmo sistema, 7 km a oeste | na Lagoa de Fora/Saquarema |
| Paraíba do Sul | Estação Ferroviária | em **Barão de Angra**, distrito distante | na estação real, na Av. Prefeito Bento Gonçalves Pereira |
| Cordeiro | Parque de Exposições Raul Veiga | numa avenida genérica | no parque, na Rua Professor Otalo Milano Lopes |
| Rio Bonito | Igreja Matriz N. S. da Conceição | na "Matriz **Auxiliar**", outro prédio | na Paróquia, a ~110 m |
| Mangaratiba | Praia de Itacuruçá | na **Praia do Sino**, na restinga da Marambaia, ~20 km da vila | **sem pino** — vai para a fase 2 |
| Rio Bonito | Pedra do Simba | era a coordenada da **Serra do Sambê**, empilhada em cima de outro ponto | **sem pino** — vai para a fase 2 |

### Falsos positivos investigados e descartados

Estes a auditoria acusava, mas estão certos — o rótulo de origem é que
enganava. Reescrevi o `_geo` de cada um para não voltarem a aparecer:

- **Granja Comary** (Teresópolis) — o OSM devolvia "Rua do Carmo,
  Carlos Guinle"; é o mesmo nó do CBF, na Rua Comary.
- **Pico da Caledônia** (Nova Friburgo) — o endereço sai como o bairro
  "Caledônia", mas o elemento do OSM é do tipo **peak**. É o cume.
- **Lagoa de Araçatiba** (Maricá) — o OSM chama o sistema inteiro de
  "Lagoa de Maricá"; Araçatiba é o trecho dela junto ao Centro.
- **Lagoa da Coca-Cola** (Rio das Ostras) — o OSM devolvia "Lagoa de
  Iriry", e a Coca-Cola **é** a Iriry.
- **Igreja Matriz de Santo Antônio** (Miracema) — "Igreja Matriz de
  Miracema" é ela mesma.
- **Vila Olímpica + Mural Revitalizart** (Mesquita) — compartilham
  coordenada de propósito: o mural é o muro da linha férrea na ciclovia
  **em frente** à Vila Olímpica. O seletor de pontos encavalados do app
  já cobre esse caso.

### Correção de fato achada no caminho

A **Lagoa da Coca-Cola** estava descrita como "rica em iodo". Não é: a
cor vem de **ácidos húmicos e fúlvicos** dissolvidos, da decomposição
incompleta das folhas que caem na bacia — o mesmo processo dos rios de
água preta da Amazônia. Texto refeito.

O **Mural Revitalizart** também ganhou a localização real: Vila Emil,
muro da linha férrea na Avenida Baronesa de Mesquita.

## Fase 2 — achar as que faltam ✅ (o que dava por busca)

De **168 para 207 pontos com coordenada**. Três passadas no Nominatim,
cada uma com um padrão de consulta novo, e o rendimento veio quase todo
dos dois primeiros:

| passada | padrão novo | achou |
|---|---|---|
| 1ª | os que já existiam no tool | 13 |
| 2ª | **"Paróquia \<padroeiro\>"** no lugar de "Igreja Matriz de X" | **19** |
| 3ª | "Estação \<município\>" e nome próprio sem o tipo na frente | 15, **6 tiveram que ser desfeitas** |

### O padrão "Paróquia" foi o que rendeu

O OpenStreetMap quase nunca guarda "Igreja Matriz de X" — guarda
**"Paróquia X"**, que é como a diocese nomeia e quem cadastra copia de
lá. Trocar o prefixo e manter só o padroeiro achou 19 matrizes de uma
vez (Vassouras, Sumidouro, Maricá, São Gonçalo, Cambuci, Queimados…).

A pista veio de Rio Bonito, na fase 1: buscar "Igreja Matriz Nossa
Senhora da Conceição" devolvia a "Matriz **Auxiliar**", outro prédio;
"Paróquia Nossa Senhora da Conceição" devolveu a igreja certa, a 110 m.

### "Estação" é palavra perigosa — e me pegou

O padrão `Estação <município>` trouxe seis pinos errados, todos
**dentro do município certo**, então o polígono não salvava:

| ponto | onde o pino foi parar |
|---|---|
| Carmo / Estação Ferroviária | Parque da Estação de **Tratamento** |
| Piraí / Estação Ferroviária | Estação de **Distribuição** (subestação de energia) |
| Silva Jardim / Estação de Juturnaíba | Estação de **Tratamento de Água** |
| Vassouras / Antiga Estação | um nó chamado "Estacao" na beira da RJ-115 |
| Areal / Estação Ferroviária | **Cine+ Areal**, um cinema |
| Macuco / Parque de Exposições | **Indústria de Laticínios CCA** |

Conserto na raiz: as consultas de estação agora **exigem que o elemento
do OSM seja ferroviário** (`type` em station/halt/stop). As que
sobraram — Japeri, Paracambi, Queimados, Paraíba do Sul — são da malha
ativa da SuperVia. As estações desativadas simplesmente não estão no
OSM, e ficar sem pino é a resposta certa para elas.

### `_geoFixo`: o campo que faltava

Tirar uma coordenada errada não bastava — a rodada seguinte do
geocodificador buscava de novo, achava o **mesmo** resultado errado e
recolocava. Aconteceu com a Praia de Itacuruçá.

Agora `_geoFixo` marca "isto foi conferido à mão, com este motivo": o
geocodificador não mexe e a auditoria não acusa. **16 pontos** estão
trancados assim.

### Os 249 que sobraram

Não estão no OpenStreetMap sob nenhum nome que dê para construir. São
sobretudo nome genérico ("Centro Histórico", "Fazendas Históricas") ou
coisa que é região e não endereço — esses não têm um lugar único para
achar, e a regra continua valendo: **pino errado é pior que pino
nenhum**.

Alguns são famosos e mesmo assim não estão lá (Museu Casa da Hera, em
Vassouras). Outros o polígono recusou com razão: a Lagoa de Juturnaíba
existe no OSM, mas o centroide dela cai em **Araruama**, não em Silva
Jardim.

A lista está em **`pontos-sem-coordenada.txt`**, com um link do Google
Maps por ponto e a linha pronta para colar:

```bash
node tools/buscar-coordenadas-pontos.js --colar pontos-sem-coordenada.txt
```

Basta trocar `LAT, LON` pela coordenada do Maps nas linhas que você
quiser e rodar o comando.

## Ferramentas

```bash
node tools/conferir-coordenadas.js
```

Ponto-em-polígono contra a malha do IBGE. Diz em qual município a
coordenada realmente caiu quando ela escapa do certo.

```bash
node tools/auditar-pontos.js
```

Cruza o nome do ponto com o endereço em `_geo`. É o que pega o erro
sutil — o do tipo Lagoa de Tanguá.
