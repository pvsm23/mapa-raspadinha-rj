/* =========================================================
   Lógica do Mapa Raspadinha
   - Clique num município não visitado -> abre popup de raspadinha
     (motor em scratch-card.js); ao raspar o suficiente, marca
     como "visitado".
   - Clique num município já visitado -> mostra de novo o selo já
     revelado (sem precisar raspar), no mesmo popup, com status,
     destinos turísticos (data/destinos.json) e opção de desmarcar
     escondida atrás do menu "⋮".
   - Biblioteca de selos: grade com todos os municípios, cinza os
     não visitados e coloridos os já raspados, com contador e barra
     de progresso; clicar num item abre o mesmo fluxo de sempre.
   - Configurações: popup com o botão de resetar o mapa inteiro.
   - Login com e-mail/senha é obrigatório (js/auth.js): #tela-login
     cobre tudo até logar. No primeiro login, escolhe um apelido
     (salvo no Firestore) antes de liberar o app.
   - Estado salvo no LocalStorage (chave por código IBGE)
   - Estrutura já pensada para, mais adiante, virar:
       * localStorage -> Firestore (por usuário logado)
       * placeholder gerado no canvas -> selo ilustrado real
   ========================================================= */

const STORAGE_KEY = "scratchMapRJ_v1";
const STORAGE_KEY_REGIOES = "scratchMapRJ_regioes_v1";
const STORAGE_KEY_CONQUISTAS = "scratchMapRJ_conquistas_v1";
const STORAGE_KEY_STREAK = "scratchMapRJ_streak_v1";
const STORAGE_KEY_ROTAS = "scratchMapRJ_rotas_v1";

/* Versão do app, mostrada em Configurações → "Sobre".
 *
 * Formato `0.ano.mês.dia.contagem` (ver CLAUDE.md). O `0` da frente
 * marca que a versão oficial ainda não saiu; a contagem é o mesmo
 * número do `versionCode` do Android e sobe de 1 por entrega.
 *
 * Os três lugares mudam JUNTOS: aqui, e `versionCode`/`versionName` em
 * android/app/build.gradle. É o versionName que vira a tag do release
 * no CI (ver .github/workflows/build-apk.yml). */
const VERSAO_APP = "0.26.08.22.117";

// Histórico mostrado ao tocar na versão (Configurações → Sobre → "O que
// mudou"). Só as 10 mais recentes aparecem. IMPORTANTE: descrições
// SEMPRE amigáveis e genéricas -- nada sensível/crítico aqui (correções
// de segurança, regras, limites etc. entram como "melhorias" ou
// "correções", ver renderizarNovidades).
const HISTORICO_VERSOES = [
  { versao: "0.26.08.22.117", itens: ["Segurança: enviar, apagar e publicar fotos agora exige estar logado — antes o endereço do servidor de fotos, que é público, bastava pra qualquer um mexer nos arquivos.", "Segurança: o pagamento passou a confirmar quem está pedindo, em vez de acreditar no que o app manda.", "A política de privacidade passou a usar o e-mail do domínio no lugar do pessoal."] },
  { versao: "0.26.08.20.116", itens: ["Os posts agora mostram a foto de perfil de quem postou — ou o selo, se a pessoa escolheu um selo como avatar.", "Posts publicados antes desta versão continuam com as iniciais.", "As fotos de perfil passaram a ser guardadas numa pasta própria, separada das fotos dos posts."] },
  { versao: "0.26.08.20.115", itens: ["Correção: a janela de denunciar abria ATRÁS do post ou da sugestão, ficando inacessível.", "Correção: tocar no nome de quem postou, com o post aberto em tela cheia, abria o perfil por trás dele."] },
  { versao: "0.26.08.20.114", itens: ["Correção: a foto nunca aparecia no card das Sugestões — o cartão era pra mostrar o lugar de fundo e vinha sempre cinza.", "O ✕ vermelho saiu do rodapé do card: excluir e denunciar viraram ícones discretos no canto de cima, longe de curtir e comentar.", "Filtros de categoria, botão de sugerir e o card ficaram no mesmo acabamento da aba Desbravadores.", "No detalhe, \"Abrir no Maps\" virou botão de verdade e o campo de comentário ganhou o enviar embutido, no lugar do botão branco."] },
  { versao: "0.26.08.20.113", itens: ["Correção: segurar o post fazia a imagem crescer, mas arrastar não curtia nem compartilhava — e ao soltar o post ainda abria por cima do gesto.", "O post aberto virou um cartão sobre fundo borrado, e fecha tocando fora dele.", "Os botões do post perderam o fundo claro que destoava do tema; a localização virou texto com um pin, sem a pílula verde.", "Curtir, comentar e compartilhar ficam cinza e só acendem em verde quando ativos.", "A aba Comunidade passou a se chamar Desbravadores também na barra de baixo."] },
  { versao: "0.26.08.20.112", itens: ["No Modo Satélite, a partir de bastante zoom todos os municípios que aparecem na tela ficam na qualidade alta, e não só o do meio.", "E o que já carregou em alta não volta mais para a baixa quando você arrasta o mapa para o lado.", "A borda verde do Modo Satélite afinou: de longe ela tinha o triplo da espessura e cobria parte da foto.", "O Modo Satélite fica lembrado — se você deixar ligado, ele volta ligado na próxima vez que abrir o app.", "A Comunidade virou mosaico de duas colunas: cabe muito mais post na tela e as fotos não são mais cortadas.", "Tocar num post abre ele em tela cheia, com legenda, curtidas e comentários.", "Segurando o dedo num post, ele salta pro centro da tela — arraste para a direita para curtir ou para a esquerda para compartilhar.", "A Comunidade deixou de ser uma janela flutuante: agora ocupa a tela inteira, com cabeçalho fixo e as abas em formato de pílula."] },
  { versao: "0.26.08.19.111", itens: ["Correção: em vários lugares o app mostrava o código do IBGE no lugar do nome do município — inclusive no seu grupo do Motoclube.", "Correção: o brilho verde dos pontos escolhidos continuava aceso depois de sair do modo de montar roteiro no mapa.", "No Modo Satélite, a divisa verde agora aparece entre municípios verificados vizinhos, em vez de sumir sob as fotos.", "Pedra do Cão Sentado, Pico das Agulhas Negras e Museu do Amanhã ganharam desenho próprio no mapa.", "Pedra do Cão Sentado e Pico das Agulhas Negras agora têm localização: aparecem no mapa e podem entrar num roteiro."] },
  { versao: "0.26.08.19.110", itens: ["Novo Modo Satélite: os municípios que você verificou por GPS passam a mostrar a foto real do lugar, recortada na forma deles.", "A cor do estado vai para a divisa, então verde, dourado e azul continuam se lendo por cima da foto.", "A imagem chega em duas qualidades: uma leve para a visão geral e outra detalhada quando você aproxima.", "Depois de vista uma vez, a foto fica guardada e abre sem internet."] },
  { versao: "0.26.08.19.109", itens: ["O mapa ganhou textura de raspadinha: município ainda não raspado tem o acabamento de foil, e raspar limpa a superfície.", "Fundo do mapa com grade cartográfica e vinheta, dando profundidade sem pesar.", "O pino dos pontos turísticos ficou chapado, e os pontos com desenho próprio ganharam o mesmo recorte escuro em volta.", "Correção: em aproximação máxima, a área de toque dos pontos turísticos ficava até 20 px acima do desenho."] },
  { versao: "0.26.08.19.108", itens: ["A lista do Roteiro virou um trajeto desenhado: cada parada tem seu ponto na linha, e a viagem começa em \"onde você está\".", "Trocar a ordem das paradas agora é arrastar pela alça, no lugar das setinhas de texto.", "Escolher município no Roteiro abre a busca do app, e os lugares viraram cartões que acendem em verde ao serem escolhidos.", "O botão \"Calcular viagem\" fica preso no rodapé: não precisa mais rolar até o fim pra achar ele.", "O atalho \"+ Roteiro\" saiu da ficha dos pontos turísticos — a viagem se monta dentro do Motoclube."] },
  { versao: "0.26.08.19.107", itens: ["Correção: o cartão do seu grupo aparecia dentro dos Pontos de Apoio; agora ele fica só na tela inicial do Motoclube.", "Quando os Pontos de Apoio não carregam, o app diz o motivo (sem internet, sem permissão) e oferece tentar de novo."] },
  { versao: "0.26.08.19.106", itens: ["O cartão do seu grupo agora aparece logo ao abrir o Motoclube, e não mais escondido dentro dos Pontos de Apoio.", "Pontos de Apoio ganhou busca e filtros por marca em botões, no lugar da lista suspensa do sistema.", "Ao indicar um ponto, escolher as marcas atendidas virou tocar nas pílulas — sem caixinhas de seleção."] },
  { versao: "0.26.08.19.105", itens: ["Os formulários de moto foram refeitos: um campo por linha, campos altos e fáceis de tocar, e o de consumo deixou de aparecer com a cara branca do navegador.", "O botão de salvar ficou verde e ocupa a largura toda; o de excluir foi para o fim, separado por uma linha."] },
  { versao: "0.26.08.19.104", itens: ["A Garagem ficou com cara de painel: cada moto tem seu espaço, e o odômetro, as viagens e o consumo aparecem em destaque.", "O botão de editar virou um ícone discreto no canto, e o de excluir saiu da tela principal pra dentro da edição.", "Cadastrar moto agora é um espaço de \"vaga livre\" na própria lista, mostrando quantas ainda cabem."] },
  { versao: "0.26.08.19.103", itens: ["Agora dá pra montar o roteiro direto no mapa: toque nos lugares na ordem que quer visitar, e o resto da tela sai da frente.", "A viagem passa a começar de onde você está, e não do primeiro ponto — o trecho de casa até lá entra na conta.", "A Garagem abre na lista das suas motos, com o + no canto pra cadastrar; tocar numa moto mostra os números dela e os botões de editar e excluir.", "Correção: motos apareciam duplicadas e voltavam depois de excluídas."] },
  { versao: "0.26.08.19.102", itens: ["O Motoclube agora é uma tela inteira, com seus recursos em cartões: Modo Viagem, Mapas Offline, Pontos de Apoio, Garagem e Roteiros.", "Roteiros mudou: agora você monta a viagem escolhendo os pontos que quer visitar, pelo botão \"+ Roteiro\" em cada lugar ou pela própria tela.", "Dá pra reordenar as paradas e ver a quilometragem, o tempo e o combustível da viagem toda.", "As indicações do Motoclube viraram \"Pontos de Apoio\", e a Garagem saiu do Menu — agora ela é um cartão dentro do Motoclube."] },
  { versao: "0.26.08.19.101", itens: ["O Motoclube virou uma tela só: Garagem, Lojas e Roteiros agora são abas do mesmo lugar.", "Roteiros (Motoclube): escolha uma rota e veja a quilometragem, o tempo estimado e quanto vai de combustível — e abra a navegação no Google Maps ou no Waze.", "O consumo é estimado pela cilindrada da sua moto, sem você precisar preencher nada; se souber o consumo real, informe na Garagem que ele passa a valer.", "A Garagem agora mostra todas as suas motos de uma vez, com o modelo em destaque, em vez de uma por vez."] },
  { versao: "0.26.08.18.100", itens: ["O Desbrava agora tem endereço próprio: desbravaapp.com.br — o link antigo continua funcionando e leva pro novo.", "Dá pra apagar o próprio comentário em posts e sugestões: a permissão já existia, faltava o botão.", "Comentário de outra pessoa também pode ser denunciado agora, fechando as quatro áreas onde qualquer um publica."] },
  { versao: "0.26.08.18.99", itens: ["Agora dá pra denunciar post, sugestão e comentário que estiverem fora do lugar — antes não havia como avisar ninguém.", "Quem recebe três denúncias confirmadas tem a conta banida e o conteúdo retirado do ar.", "Quem for banido tem 90 dias para recorrer: o conteúdo fica guardado e volta inteiro se o recurso for aceito.", "Em municípios sem arte própria, quem já confirmou presença por GPS pode indicar uma foto para virar o selo do lugar."] },
  { versao: "0.26.08.18.98", itens: ["Os mapas dos estados que você já baixou agora se atualizam sozinhos quando saem melhorias — antes era preciso apagar e baixar de novo à mão pra ver as novidades.", "Só o mapa que mudou é rebaixado, e sem internet o app continua usando o que já está guardado no aparelho."] },
  { versao: "0.26.08.18.97", itens: ["Correção: os primeiros nomes a aparecer no mapa eram os de nome curto, e não os dos municípios grandes — Ubá vinha antes de Patos de Minas.", "Agora quem aparece primeiro é sempre o município maior, mesmo que o nome dele seja comprido.", "E os nomes não aparecem mais enquanto o mapa está mostrando as regiões, quando as divisas de município nem estão na tela."] },
  { versao: "0.26.08.18.96", itens: ["Nos estados grandes, o nome dos municípios enormes agora aparece bem antes e bem maior — antes ficava minúsculo e só surgia com muito zoom, e você tinha que procurar o nome dentro do próprio município.", "Cada município passou a mostrar o nome no zoom em que ele cabe ali dentro, em vez de todos aparecerem de uma vez.", "Os nomes vão entrando aos poucos conforme você aproxima, deixando o mapa mais limpo de longe."] },
  { versao: "0.26.08.18.95", itens: ["O Brasil inteiro entrou no mapa: os 26 estados e o Distrito Federal agora dá pra explorar município por município, no mesmo nível de detalhe do Rio.", "No Distrito Federal aparecem as 33 Regiões Administrativas, já que ele tem um município só.", "Cada mapa é baixado quando você quiser, um estado de cada vez, e depois abre sem internet — nenhum deles pesa no tamanho do aplicativo.", "A tela do Mapa do Brasil foi refeita: o país inteiro cabe na tela sem arrastar, e agora tem uma lista de estados embaixo, com alvos grandes de tocar.", "Configurações, a leitura sobre os municípios e a Loja deixaram de exigir login — só raspar selo e comprar é que pedem conta.", "Correção: o aviso de estado em desenvolvimento ficava escondido atrás da barra do app."] },
  { versao: "0.26.08.17.94", itens: ["Conquistas, Rotas, Loja e Comunidade agora são de cada estado: você vê o conteúdo do mapa que estiver aberto, e nos estados novos aparece o aviso de que essa parte ainda está sendo montada.", "A Comunidade mostra só os posts do estado ativo.", "A lupa passou a funcionar nos estados novos, procurando as cidades do mapa aberto e levando você até elas.", "O Ranking ganhou a aba Estadual, entre a Global e a de Amigos.", "A bússola avisa quando você está em outro estado, dizendo em qual."] },
  { versao: "0.26.08.17.93", itens: ["Entrar em Minas Gerais ou São Paulo não apaga mais o aplicativo: a barra de topo, o menu de baixo e os botões continuam onde estavam — só o mapa é que troca.", "Nesses estados, a barra de progresso mostra o nome do estado em vez de fingir o total do Rio, e o botão de modos do mapa some enquanto o clima de lá não existe.", "O Modo Viagem continua funcionando em qualquer estado."] },
  { versao: "0.26.08.17.92", itens: ["O mapa de Minas Gerais e de São Paulo ficou bem mais leve de mexer com o mapa afastado: antes o app desenhava todo o detalhe das divisas mesmo quando ele nem dava pra ver."] },
  { versao: "0.26.08.17.91", itens: ["Correção: no aplicativo Android, baixar o mapa de Minas Gerais ou de São Paulo falhava dizendo que era a conexão — o app procurava o arquivo dentro dele mesmo, e não no site.", "Quando um download falha, o app passa a dizer o motivo de verdade em vez de culpar a internet."] },
  { versao: "0.26.08.17.90", itens: ["Correção: Minas Gerais aparecia como \"chega em breve\" e não abria, mesmo já estando pronto — o app estava usando uma cópia antiga do mapa do Brasil guardada no aparelho.", "No mapa dos estados, as divisas agora afinam conforme você aproxima, em vez de virarem tarjas grossas, e os nomes das cidades ficam do mesmo tamanho na tela em qualquer zoom."] },
  { versao: "0.26.08.17.89", itens: ["Minas Gerais entrou no app: dá pra explorar o mapa município por município, com o mesmo nível de detalhe do Rio.", "São Paulo ganhou esse mesmo detalhe — as divisas ficavam grosseiras ao aproximar e agora não ficam mais.", "Os mapas de MG e SP não vêm dentro do app: você baixa o que quiser em Configurações → Mapas dos estados, e depois eles abrem sem internet.", "Se você estiver em Minas ou em São Paulo, o mapa do seu estado vem sozinho — só em Wi-Fi, pra não gastar seu plano de dados."] },
  { versao: "0.26.08.17.88", itens: ["Os selos desenhados na hora agora também são raspáveis: a capa vem em preto e branco e ganha cor conforme você raspa.", "A previsão do tempo passou a mostrar a data de cada dia, não só o dia da semana.", "Correção: os dias da previsão apareciam sem nome desde a última atualização."] },
  { versao: "0.26.08.17.87", itens: ["O mapa ficou mais limpo: o Modo Viagem virou um botão verde grande no centro, e os modos do mapa (como o Clima) moram agora num menu próprio.", "Municípios, rotas e conquistas sem arte pronta ganharam um selo desenhado na hora, com borda dourada e a cor sempre igual para o mesmo lugar.", "Ficou óbvio o que ainda está bloqueado: cadeado discreto e card apagado; o que você já conquistou ganha brilho dourado."] },
  { versao: "0.26.08.17.86", itens: ["O clima agora vem pronto de um servidor nosso, atualizado de meia em meia hora — abre mais rápido e gasta menos internet do seu aparelho."] },
  { versao: "0.26.08.17.85", itens: ["O botão do Modo Viagem saiu do canto direito e virou um botão em destaque no meio da barra de baixo — sobrou espaço e ficou mais fácil de alcançar com o polegar.", "No Modo Clima, as temperaturas agora acompanham o mapa enquanto você arrasta, em vez de só pularem para o lugar quando você solta.", "E os marcadores de pontos turísticos somem enquanto o Modo Clima está ligado, pra não embolar com as temperaturas."] },
  { versao: "0.26.08.17.84", itens: ["O município agora mostra o clima: temperatura de agora no canto do selo e, tocando nela, a previsão dos próximos 3 dias.", "Junto vêm a altitude da cidade e o horário do pôr do sol — útil pra planejar a hora de pegar a estrada.", "Novo botão Modo Clima no mapa: liga e mostra a temperatura das cidades direto sobre elas."] },
  { versao: "0.26.08.17.83", itens: ["Os pontos turísticos agora têm comentários: quem confirmou a presença por GPS no município conta como foi, e qualquer pessoa pode responder para tirar dúvidas.", "Os comentários mais curtidos aparecem primeiro.", "Chegaram as notificações: você é avisado quando alguém curte ou comenta nas suas coisas, ou responde seu comentário.", "Ao postar na Comunidade dá para marcar o ponto turístico além da cidade — e o painel do ponto tem um botão que mostra só os posts dele.", "O app avisa quando sai uma versão nova, com a lista do que mudou.", "Correção: o app podia guardar uma página de erro no lugar da versão boa e abrir quebrado sem internet."] },
  { versao: "0.26.08.17.82", itens: ["Todos os 456 pontos turísticos agora têm a história completa — os 92 municípios do estado, um por um.", "Cada ponto foi conferido na internet: nomes errados foram corrigidos, lugares que não existiam saíram da lista e alguns estavam até na cidade errada.", "Vários marcadores estavam no lugar errado dentro da cidade certa e foram para o ponto exato, e mais 39 pontos ganharam marcador no mapa."] },
  { versao: "0.26.08.12.81", itens: ["Pão de Açúcar e Fortaleza de Santa Cruz da Barra ganharam desenho próprio no mapa."] },
  { versao: "0.26.08.12.80", itens: ["Os pontos turísticos aparecem bem antes no mapa, a partir de um zoom bem menor.", "Quando vários pontos ficam colados no mesmo lugar, tocar neles abre uma lista para você escolher qual quer ver."] },
  { versao: "0.26.08.12.79", itens: ["Os pontos turísticos ganharam marcador no mapa em 75 dos 92 municípios — 173 lugares no total, cada um no ponto exato onde fica."] },
  { versao: "0.26.08.12.78", itens: ["Mais pontos turísticos ganharam marcador no mapa, incluindo os que ficam em lugares grandes como a Lagoa de Araruama."] },
  { versao: "0.26.08.12.77", itens: ["Todos os pontos turísticos da Região Metropolitana ganharam marcador no mapa, no lugar exato onde ficam.", "A numeração das versões mudou de formato: agora ela mostra a data da entrega."] },
  { versao: "0.12.08.26.76", itens: ["Os botões de rota e fotos subiram para antes do texto de história, e o painel do ponto volta sempre ao topo ao abrir."] },
  { versao: "0.11.45", itens: ["O painel do ponto turístico foi redesenhado: imagem de capa ocupando a largura toda, cidade em destaque e botões de ação mais fáceis de achar."] },
  { versao: "0.11.44", itens: ["Os marcadores dos pontos turísticos ficaram maiores e passaram a aparecer com menos zoom, surgindo aos poucos conforme você se aproxima."] },
  { versao: "0.11.43", itens: ["Os pontos turísticos agora aparecem no mapa, cada um no lugar exato onde fica. Toque em um para ver a descrição, abrir a rota, procurar fotos ou ir para a cidade.", "Os pontos com arte própria aparecem desenhados; os demais usam um marcador comum."] },
  { versao: "0.11.42", itens: ["O botão \"Abrir no Maps\" da lista de pontos turísticos passou a funcionar em todos os municípios, e ganhou companhia de um botão de imagens."] },
  { versao: "0.11.41", itens: ["As divisas dos municípios ficaram muito mais detalhadas: litoral, baías e ilhas aparecem de verdade quando você aproxima.", "A verificação por GPS ficou mais precisa perto das divisas."] },
  { versao: "0.11.40", itens: ["Quem entra num grupo do Motoclube agora recebe um número de membro, que é seu para sempre.", "Os brasões dos grupos ganharam asas, o ano de fundação e a bandeira do Brasil.", "Dá para dar bem mais zoom no mapa, e as divisas vão ficando mais finas conforme você se aproxima.", "As fotos da Comunidade agora mostram um aviso de carregamento em vez de aparecerem do nada."] },
  { versao: "0.11.39", itens: ["A aba do Motoclube e a Garagem agora abrem para todo mundo — a assinatura só é pedida na hora de entrar num grupo ou cadastrar uma moto.", "O card do grupo mostra quantos membros ele tem, e dá para abrir o brasão em tamanho grande e compartilhar."] },
  { versao: "0.11.38", itens: ["Nomes compridos no mapa agora quebram em duas linhas, em vez de atravessar os municípios vizinhos.", "Corrigida a liberação do Motoclube, que parecia desligar sozinha ao abrir o app."] },
  { versao: "0.11.37", itens: ["Os nomes no mapa ficaram bem maiores e mais fáceis de ler, sem se sobrepor."] },
  { versao: "0.11.36", itens: ["Os nomes no mapa ficaram menores e agora mantêm o mesmo tamanho na tela conforme você aproxima."] },
  { versao: "0.11.35", itens: ["Chegaram os grupos do Motoclube: um para cada município, com brasão próprio. Você entra em um, e o brasão passa a aparecer no seu perfil e ao lado do seu nome na Comunidade.", "Para trocar de grupo é preciso esperar 30 dias desde a entrada no anterior."] },
  { versao: "0.11.34", itens: ["Os nomes no mapa pararam de se sobrepor: agora o texto mantém o tamanho na tela ao aproximar, e os municípios menores aparecem conforme sobra espaço.", "Dá pra dar bem mais zoom no mapa.", "O app ganhou ícone próprio na barra de notificações."] },
  { versao: "0.11.33", itens: ["As fotos da comunidade que não abriam voltaram a aparecer, inclusive as de posts antigos.", "O nome de cada município agora fica dentro dos próprios limites no mapa.", "Cada município ganhou o brasão do seu grupo do Motoclube."] },
  { versao: "0.11.32", itens: ["Selos novos de Paraty e Itatiaia, e mais 10 municípios ganharam a arte da raspadinha.", "Enquanto o pagamento por Pix não estiver no ar, o Motoclube pode ser liberado de graça para todo mundo."] },
  { versao: "0.11.31", itens: ["Quem já pagou pode recuperar o acesso pelo botão \"Já sou membro\" no paywall, mesmo tendo trocado de aparelho ou reinstalado o app."] },
  { versao: "0.11.30", itens: ["O app agora confere sozinho se o Pix caiu, sem depender de aviso externo, e tem um botão \"Já paguei\" pra checar na hora. Ninguém mais paga e fica esperando."] },
  { versao: "0.11.29", itens: ["Assim que o Pix é confirmado, o app avisa na hora com uma tela de boas-vindas e libera os recursos do Motoclube — não precisa mais fechar e abrir."] },
  { versao: "0.11.28", itens: ["O botão de copiar o código Pix voltou a funcionar, e agora o código também aparece por extenso na tela — dá pra selecionar à mão se a cópia falhar."] },
  { versao: "0.11.27", itens: ["O checkout do Motoclube passou a gerar Pix de verdade: QR Code e copia e cola na hora, direto na tela de assinatura."] },
  { versao: "0.11.26", itens: ["Correção importante: município que já teve a presença confirmada por GPS fica verificado pra sempre. Antes, desmarcar e raspar de novo longe do lugar apagava a confirmação, e era preciso voltar lá fisicamente."] },
  { versao: "0.11.25", itens: ["O voucher mensal da Loja subiu para R$ 9,90 — o mesmo valor da assinatura do Motoclube. Ou seja: todo mês você recebe de volta, em desconto na Loja, o que pagou pela assinatura."] },
  { versao: "0.11.24", itens: ["O Motoclube Desbrava virou assinatura: R$ 9,90 por mês, com pagamento por Pix dentro do próprio app (QR Code e código pra copiar). Assinando, você libera o Modo Viagem, o mapa offline, as dicas e lojas do Motoclube, a Garagem Virtual e o voucher mensal da Loja."] },
  { versao: "0.11.23", itens: ["\"Baixar dados offline\" saiu do \"em breve\" e funciona: assinantes PRO guardam mapa, selos e dados no aparelho, com barra de progresso, e o app abre sem internet. As imagens também passaram a carregar do aparelho antes de ir na rede, deixando a abertura mais rápida. Mais um punhado de acabamentos: botões respondem ao toque, e janelas e gavetas agora fecham com animação em vez de sumir de uma vez."] },
  { versao: "0.11.22", itens: ["Correção: as fotos dos posts não apareciam no feed. O app estava interceptando o carregamento das imagens por engano — agora elas carregam normalmente."] },
  { versao: "0.11.21", itens: ["Sugestões da Comunidade repaginadas: as categorias viraram uma faixa de pílulas deslizantes, o município agora se escolhe numa lista com busca (some a listinha do celular com 92 opções), e os lugares aparecem num mosaico de cartões com a foto de fundo. Publicar uma foto ou sugerir um lugar abre uma janelinha que sobe de baixo, em vez de esticar a tela, e escolher a foto virou um quadro que já mostra a prévia."] },
  { versao: "0.11.20", itens: ["A opção de tema \"Automático\" (que tentava clarear a tela no sol) foi removida: o Android bloqueia o sensor de luz dentro do app, então ela não funcionava em aparelho nenhum. Ficaram Sistema, Claro e Escuro. De quebra, a barra de status do celular agora acompanha o tema, em vez de ficar sempre preta."] },
  { versao: "0.11.19", itens: ["Selos muito mais nítidos na hora de raspar (antes ficavam borrados nas telas de celular), a área de raspagem agora bate exatamente com o selo — sem precisar raspar o vazio em volta — e o brilho dos selos dourados parou de vazar pelos cantos. Raspadinhas de capa cinza, como as das Conquistas, que não davam pra concluir, agora completam normalmente."] },
  { versao: "0.11.18", itens: ["Correção na atualização do app: o arquivo baixado agora tem o número da versão no nome. Antes todo download salvava por cima do mesmo Desbrava.apk, e o celular acabava oferecendo o arquivo antigo pra instalar, dizendo que já era a mesma versão."] },
  { versao: "0.11.17", itens: ["A escolha de tema virou quatro botõezinhos lado a lado (Sistema/Claro/Escuro/Auto), no lugar da listinha cinza do celular que destoava do app. Na primeira vez que você abre o Desbrava, ele pergunta se pode usar o sensor de luz pra clarear o mapa no sol — e agora os avisos aparecem como mensagem flutuante, sem caixa do sistema travando a tela."] },
  { versao: "0.11.16", itens: ["Tema Claro (e Automático, via sensor de luz do aparelho quando suportado) nas Configurações, ícone de configurações trocado de sol pra engrenagem, Modo Viagem virou um botão flutuante verde de destaque, e a dica de arrastar/zoom some sozinha depois de alguns segundos."] },
  { versao: "0.11.15", itens: ["Garagem Virtual com cara de painel automotivo: abas viraram um segmented control contínuo, a lista de motos duplicada deu lugar a um card seletor (moto atual + setas pra trocar), e a aba Estatísticas ganhou um dashboard de verdade com o odômetro em destaque."] },
  { versao: "0.11.14", itens: ["Conquistas em lista horizontal (medalha + descrição lado a lado) em vez dos cards gigantes de antes — cabe muito mais na tela, sem cadeado amarelo enorme, com selo de raridade colorido por nível e barra de progresso mais fina."] },
  { versao: "0.11.13", itens: ["Popup do município reequilibrado: selo menor e status virou um selinho verde, 3 botões de ação num grid discreto (Compartilhar / Fotos daqui / Sugestões, sem remover nenhuma função), e \"Abrir no Maps\" virou um link pequeno em vez de bloco verde gigante."] },
  { versao: "0.11.12", itens: ["Rotas Temáticas com visual novo: lista vertical de cards (em vez do grid circular apertado), com miniatura, barra de progresso fina e sem mais cadeado amarelo — rota não iniciada fica em tons de cinza, o resto aparece colorido."] },
  { versao: "0.11.11", itens: ["Perfil redesenhado: crachá de Membro Desbrava/Desbravador embaixo do apelido, dashboard 2x2 (municípios, selos dourados, rotas concluídas, regiões), minimapa com cantos arredondados, e só os 4 selos mais recentes no lugar da lista inteira repetida — com botão pra ver a Biblioteca completa."] },
  { versao: "0.11.10", itens: ["Biblioteca de selos virou um álbum de colecionador: abas (Municípios/Regiões/Rotas) e filtro (Todos/Conquistados/Faltam). Selos bloqueados agora têm o mesmo visual em todo lugar, sem cadeado amarelo espalhado pelo texto."] },
  { versao: "0.11.9", itens: ["Amigos e Ranking com visual novo: avatares, busca contínua (sem botão), menu '⋮' no lugar do botão vermelho de remover amigo, pódio com medalhas no Ranking, e sua linha sempre visível mesmo fora do topo 50."] },
  { versao: "0.11.8", itens: ["Comunidade com visual novo, estilo Instagram/Threads: tabs minimalistas, feed sem cartões pesados (só uma linha fina separando os posts), foto ocupando a largura toda, e um botão redondo (FAB) pra postar no canto da tela. Menções @assim agora aparecem destacadas em verde."] },
  { versao: "0.11.7", itens: ["Configurações com visual novo: cartões organizados (Perfil, Preferências, Recursos, Conta), toggles no lugar das caixinhas de marcar, e só o botão 'Salvar apelido' fica verde vibrante agora."] },
  { versao: "0.11.6", itens: ["Menu reorganizado: 'Minha Jornada', 'Explorar' e 'Sistema', mais fácil de achar as coisas. Perfil saiu do Menu (já abre pelo avatar no topo) e o Check-in semanal saiu de circulação."] },
  { versao: "0.11.5", itens: ["Chegou a Loja Desbrava! 🛍️ Produtos físicos e digitais, alguns liberados só depois de desbravar certos municípios. Membro do Motoclube ganha um voucher mensal de R$ 4,90 pra usar nas compras."] },
  { versao: "0.11.4", itens: ["Garagem Virtual agora aceita até 3 motos, com abas pra Criar nova, Editar (e definir qual é a ativa) e ver Estatísticas (odômetro e viagens registradas) de cada uma."] },
  { versao: "0.11.3", itens: ["Novidades PRO do Motoclube Desbrava: Garagem Virtual (marca/modelo/apelido da sua moto, 100% privado, com odômetro somado sozinho pelo Modo Viagem), opção de salvar o trajeto de um rolê como rota personalizada, e resumo do rolê (km, tempo, municípios) com imagem pra compartilhar na Comunidade ou fora do app.", "Gratuito por enquanto, junto com o resto do Motoclube."] },
  { versao: "0.11.2", itens: ["Chegou o Modo Viagem! 🏍️ Botão novo acima da bússola: liga o rastreio só enquanto você estiver rodando (com notificação fixa), registra a quilometragem e deixa os municípios por onde você passar prontos pra raspar depois.", "Rastreio em segundo plano antigo (de hora em hora) saiu de circulação — o app não pede mais localização em segundo plano."] },
  { versao: "0.11.1", itens: ["Ícones de buscar, configurações, bússola e todo o Menu ficaram no mesmo estilo da barra de baixo."] },
  { versao: "0.11.0", itens: ["Chegou o Motoclube Desbrava! 🏍️ Dicas e lojas de peças/oficinas com filtro de marca e modelo — gratuito por enquanto.", "O botão de Perfil foi pro Menu; no lugar dele na barra de baixo agora fica o Motoclube."] },
  { versao: "0.10.19", itens: ["Novo menu ao compartilhar uma rota (link ou Comunidade).", "Rastreio em segundo plano agora confere sua localização de hora em hora, em vez de ficar o tempo todo ligado — usa bem menos bateria."] },
  { versao: "0.10.18", itens: ["Corrigido: 'Minhas rotas' agora carrega certinho."] },
  { versao: "0.10.17", itens: ["Rotas personalizadas: monte sua própria rota com os municípios que quiser, com nome e descrição, e compartilhe por link ou na Comunidade.", "Novo link \"Bora buscar esse selo?\" no popup de cada município, pra convidar alguém a raspar junto."] },
  { versao: "0.10.16", itens: ["Novos efeitos sonoros: raspar, revelar selo, selo dourado, curtir e conquista (pode desligar em Configurações).", "Brilho do selo dourado mais suave e contido na imagem."] },
  { versao: "0.10.15", itens: ["Corrigido: agora dá pra ativar as notificações no aplicativo instalado."] },
  { versao: "0.10.14", itens: ["Novo visual dos botões da comunidade (coração que enche ao curtir).", "Selos dourados ganharam um brilho que passa.", "Link 'me adicione como amigo(a)' na tela de Amigos."] },
  { versao: "0.10.13", itens: ["17 municípios ganharam selo ilustrado próprio! Angra dos Reis, Campos, Barra Mansa, Cantagalo e mais."] },
  { versao: "0.10.12", itens: ["Duas rotas novas com selo próprio: Povos Goytacazes e Povos Tupinambás — a história dos povos indígenas que dominavam o Rio antes da colonização."] },
  { versao: "0.10.11", itens: ["Todos os 92 municípios do Rio agora têm curiosidade e história! E agora dá pra ler mesmo sem raspar — é só tocar no município."] },
  { versao: "0.10.10", itens: ["Em São Paulo: as regiões agora aparecem com as divisas desenhadas (afastado), o zoom vai bem mais longe (dá pra achar os municípios minúsculos) e as linhas ficaram mais finas."] },
  { versao: "0.10.9", itens: ["Dá pra dar mais zoom no mapa de São Paulo."] },
  { versao: "0.10.8", itens: ["Nomes das regiões agora aparecem no mapa do Rio (afastado). Em São Paulo, os nomes dos municípios ficaram menores pra não embolar nas áreas concentradas."] },
  { versao: "0.10.7", itens: ["Mapa de São Paulo mais leve e organizado: afastado mostra as 15 regiões; aproximando, os municípios com bordas mais nítidas e nomes só bem no zoom. Corrigido o botão 🇧🇷 de troca de estado."] },
  { versao: "0.10.6", itens: ["São Paulo agora abre em tela cheia, com zoom e nomes dos municípios — igual ao mapa do Rio! Pra voltar pro Rio, toque no 🇧🇷 e escolha o RJ."] },
  { versao: "0.10.5", itens: ["Corrigido: o mapa de São Paulo agora abre de verdade. 🗺️"] },
  { versao: "0.10.4", itens: ["Login com o Google no aplicativo agora funciona de verdade. 🎉"] },
  { versao: "0.10.3", itens: ["Agora tem 'Esqueci minha senha' na tela de login."] },
  { versao: "0.10.2", itens: ["O mapa de São Paulo agora abre mais rápido e sem travar.", "Melhorias no login com o Google."] },
  { versao: "0.10.1", itens: ["Mapa do Brasil maior e mais fácil de usar: toque num estado pra selecionar e confirme no botão."] },
  { versao: "0.10.0", itens: ["São Paulo já apareceu no mapa do Brasil! 🟡 Ainda em desenvolvimento, mas dá pra ver os 645 municípios."] },
  { versao: "0.9.6", itens: ["Agora dá pra entrar com a conta do Google no aplicativo.", "Correções e melhorias."] },
  { versao: "0.9.5", itens: ["Download do app mais confiável.", "Correções e melhorias."] },
  { versao: "0.9.4", itens: ["Quem já tem o app instalado agora tem o botão 'Atualizar app' no menu, com aviso quando sai versão nova.", "Correções e melhorias."] },
  { versao: "0.9.3", itens: ["Agora dá pra ver o que mudou tocando na versão.", "Correções e melhorias de estabilidade."] },
  { versao: "0.9.2", itens: ["Você pode usar uma foto ou um selo dourado como foto de perfil.", "Ajustes visuais e correções."] },
  { versao: "0.9.1", itens: ["As janelas do app agora abrem com animação.", "Pequenas melhorias."] },
  { versao: "0.9.0", itens: ["Novo visual do perfil, ícone novo e vários ajustes."] },
];

// Chave PIX mostrada no botão 💬 → "Colaborar" (ver PENDENCIAS.md).
// É só o PADRÃO: se a conta dona salvar uma chave nova no painel de
// Admin (configuracoes/global.chavePix), ela é carregada por cima em
// carregarChavePixGlobal() e passa a valer pra todo mundo.
let CHAVE_PIX_COLABORACAO = "pvsm23@jim.com";

// Ícones SVG dos botões da comunidade (curtir/comentar/compartilhar).
// Estilo em CSS (.ico-social): contorno verde vazio por padrão; o
// coração vira verde cheio quando .curtido (ver aoCurtirPost) com uma
// animação de "pop". Substituem os emojis ❤️💬↗ antigos.
const ICONE_CORACAO =
  '<svg class="ico-social ico-coracao" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 20.3l-1.4-1.28C5.4 14.36 2 11.28 2 7.5 2 4.9 4.02 3 6.5 3c1.6 0 3.13.86 3.9 2.18h1.2C12.37 3.86 13.9 3 15.5 3 17.98 3 20 4.9 20 7.5c0 3.78-3.4 6.86-8.6 11.53L12 20.3z"/></svg>';
const ICONE_COMENTAR =
  '<svg class="ico-social ico-comentar" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.68L4 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z"/></svg>';
const ICONE_COMPARTILHAR =
  '<svg class="ico-social ico-compartilhar" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/>' +
  '<polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

/**
 * Moldura da foto do post, com o estado de carregando embutido.
 *
 * A foto vem do Drive, que é lento e às vezes precisa de duas ou três
 * tentativas de URL (ver aplicarFotoComFallback). Sem nada no lugar, o
 * feed rolava com buracos e a imagem "aparecia do nada", empurrando o
 * conteúdo pra baixo enquanto a pessoa lia.
 *
 * A moldura reserva o espaço desde o primeiro quadro e mostra a marca
 * do Desbrava com um brilho passando por cima. Quando a foto carrega,
 * a classe `carregando` sai: o placeholder some, a altura passa a ser a
 * da imagem de verdade e ela entra com fade.
 */
const MOLDURA_FOTO_POST =
  '<div class="post-foto-wrap carregando">' +
  '<div class="post-foto-carregando" aria-hidden="true">' +
  '<span class="post-foto-brilho"></span>' +
  // Bússola: o mesmo símbolo de "explorar" que o mapa já usa.
  '<svg class="post-foto-marca" viewBox="0 0 48 48" aria-hidden="true">' +
  '<circle cx="24" cy="24" r="18"/>' +
  '<polygon points="31,17 26.5,26.5 17,31 21.5,21.5"/>' +
  "</svg>" +
  "</div>" +
  '<img class="post-card-foto" alt="Foto do post">' +
  "</div>";

// Dono "atual" das chaves de localStorage acima -- "anon" enquanto
// ninguém logou nesta aba, ou o uid de quem está logado. CRÍTICO:
// sem isso, contas diferentes no MESMO navegador liam/escreviam a
// MESMA chave fixa e se misturavam (o progresso de uma conta
// aparecia/sobrescrevia o da outra) -- ver carregarEstadoDoUsuario /
// voltarParaEstadoAnonimo, chamadas sempre que o login muda.
let uidStorageAtual = "anon";

function chaveComUid(chaveBase) {
  return `${chaveBase}_${uidStorageAtual}`;
}

// Estrutura salva no localStorage:
// {
//   "3303302": {
//     visitado: true,
//     dataVisita: "2026-07-12T14:22:00.000Z",
//     // "brilhante"/"chanceDecidida" -- ver decidirBrilhante(): so
//     // existem em municipios raspados a partir da raspadinha
//     // brilhante entrar no ar. Municipios raspados antes disso nao
//     // tem chanceDecidida (fica undefined/falso), entao ganham UMA
//     // chance de decidir a sorte se a pessoa desmarcar e raspar de
//     // novo (ver desmarcarMunicipioAtual).
//     brilhante: false,
//     chanceDecidida: true,
//     // "verificado" -- so vira true quando a geolocalizacao confirma
//     // que a pessoa esta MESMO dentro do municipio (ver
//     // verificarPresencaNoMunicipio). Raspar sempre e permitido, mas
//     // so conta pro contador/ranking/conquistas/regiao-completa
//     // quando verificado (ver estaVerificado()). Enquanto nao
//     // verificado, o municipio fica VERMELHO no mapa (nao verde) e
//     // marcado com aviso na biblioteca de selos.
//     verificado: false,
//     motivoNaoVerificado: "",
//   },
//   "3304557": { visitado: false }
// }

let estadoMapa = {};
// Estado do mega-selo de cada regiao (independente de estadoMapa):
// { "serrana": { revelado: true, dataRevelado: "..." } }
let estadoRegioes = {};
// Estado das raspadinhas de conquista (10/25/50/75/100% do mapa):
// { "10pct": { revelado: true, dataRevelado: "..." } }
let estadoConquistas = {};
// Estado do mega-selo de cada rota temática (mesma ideia de
// estadoRegioes, só que os municípios da rota vêm de data/rotas.json
// em vez do agrupamento embutido no SVG):
// { "cafe-fluminense": { revelado: true, dataRevelado: "..." } }
let estadoRotas = {};
// Sequencia de dias seguidos abrindo o app (streak), pra conquista
// "7 dias seguidos" -- local, nao depende do check-in (semanal) no
// Firestore pra nao precisar de leitura assincrona so pra isso.
let estadoStreak = { ultimoDia: null, contagem: 0 };
let destinosPorMunicipio = {};
let curiosidadesPorMunicipio = {};
// Limites geograficos reais dos municipios (data/rj-municipios.geojson),
// usados so pra conferir se a pessoa esta mesmo dentro do municipio na
// hora de verificar a visita: { "3300100": [[ [lon,lat], ... ]] }
let geojsonMunicipios = {};
let municipioSelecionadoId = null;
let regiaoSelecionadaId = null;
let rotaSelecionadaId = null;
let mapaFoiArrastado = false;

// ---- Comunidade Desbrava (rede social) ----
// slug (ex: "municipioSaoGoncalo") -> codigo IBGE, construido a partir
// do proprio SVG do mapa (ver construirSlugsDeMunicipios).
let slugParaMunicipioId = {};
let idParaNomeMunicipio = {};
let abaSocialAtual = "global"; // "global" | "amigos"
let filtroMunicipioSocialId = null; // preenchido pelo botao @ no popup do municipio
/* Filtro por PONTO turistico, do botao "Posts" no painel do ponto.
   Quando esta preenchido, ele MANDA sobre o de municipio -- o id do
   ponto ja carrega o municipio no prefixo. */
let filtroPontoSocialId = null;
let cursorFeedSocial = null; // ultimo doc da pagina atual, pra "carregar mais"
let feedSocialAcabou = false;
let blobUrlsFotosPosts = []; // URL.createObjectURL ativos, revogados ao fechar o painel
let pessoasMarcadasForm = []; // { uid, apelido } marcados no formulario de criar post
// Município marcado no Novo Post. Virou variável quando o <select>
// nativo deu lugar ao seletor com busca (#modal-escolher-municipio):
// não há mais um .value pra ler na hora de publicar.
let municipioNovoPost = null;

// ---- Sugestões da Comunidade (por município) ----
// Categorias agrupadas (evita ter uma categoria quase vazia pra cada
// item bem específico, ex: "praias"/"cachoeiras"/"lagoas" cabem todas
// em "Natureza e Paisagens").
const CATEGORIAS_SUGESTAO = [
  { chave: "cultura-historia", label: "🏛️ Atrações Culturais e Históricas" },
  { chave: "trilhas", label: "🥾 Trilhas e Caminhadas" },
  { chave: "natureza", label: "🏞️ Natureza e Paisagens" },
  { chave: "gastronomia", label: "🍽️ Gastronomia" },
  { chave: "parques-diversao", label: "🎡 Parques e Diversão" },
  { chave: "compras", label: "🛍️ Turismo de Compras" },
  { chave: "esporte-aventura", label: "🧗 Esporte e Aventura" },
  { chave: "bem-estar", label: "♨️ Bem-Estar (águas termais, spas)" },
  { chave: "peregrinacao", label: "🙏 Peregrinação e Fé" },
  { chave: "sitios-chacaras", label: "🌾 Sítios e Chácaras" },
  { chave: "outro", label: "📌 Outro" },
];
const LABEL_CATEGORIA_SUGESTAO = Object.fromEntries(CATEGORIAS_SUGESTAO.map((c) => [c.chave, c.label]));
// Categoria escolhida no formulário de nova sugestão -- mesma história
// do municipioNovoPost: os chips substituíram o <select>.
let categoriaNovaSugestao = "outro";
// Sugestão aberta no sheet de detalhe (o card do grid é pequeno demais
// pra descrição + comentários).
let sugestaoDetalheAtual = null;

// Motoclube Desbrava: categorias de estabelecimento e marcas comuns no
// Brasil (a lista de marcas alimenta tanto o filtro quanto os chips do
// formulário de cadastro; "modelos" fica livre em texto por serem
// numerosos demais pra uma lista fixa).
const CATEGORIAS_MOTOCLUBE = [
  { chave: "pecas", label: "🔧 Peças" },
  { chave: "oficina", label: "🛠️ Oficina/Mecânico" },
  { chave: "acessorios", label: "🎒 Acessórios" },
  { chave: "indumentaria", label: "🧥 Indumentária (capacete, jaqueta...)" },
  { chave: "pneus", label: "🛞 Pneus" },
  { chave: "eletrica-som", label: "🔊 Elétrica/Som" },
  { chave: "pintura-funilaria", label: "🎨 Pintura/Funilaria" },
  { chave: "outro", label: "📌 Outro" },
];
const LABEL_CATEGORIA_MOTOCLUBE = Object.fromEntries(CATEGORIAS_MOTOCLUBE.map((c) => [c.chave, c.label]));

const MARCAS_MOTOCLUBE = [
  "Honda", "Yamaha", "Suzuki", "Kawasaki", "BMW", "Harley-Davidson",
  "Triumph", "Ducati", "Royal Enfield", "Dafra", "Shineray", "Haojue",
  "Kymco", "Piaggio/Vespa", "KTM", "Outra",
];

let municipioAtualSugestoes = null;
let filtroCategoriaSugestaoAtual = "";

// Guarda o id do post (?post=id no link compartilhado, ver
// compartilharPost) ate poder abrir o painel social nele -- só dá pra
// abrir de verdade depois do login resolver (ver
// abrirPostDoLinkSeExistir, chamado no primeiro "auth-mudou").
let postIdPendenteDoLink = new URLSearchParams(window.location.search).get("post");

// Link "bora buscar esse selo?" (?municipio=<id-ibge>, ver
// compartilharConviteMunicipio) -- convite pontual pra raspar um
// município específico junto, não precisa ser amigo. Só dá pra abrir
// de verdade depois do login resolver (mesmo padrão do postIdPendenteDoLink).
let municipioIdPendenteDoLink = new URLSearchParams(window.location.search).get("municipio");

// Rota personalizada (?rotaPersonalizada=<id>, ver
// compartilharRotaPersonalizada) -- mesma ideia.
let rotaPersonalizadaIdPendenteDoLink = new URLSearchParams(window.location.search).get("rotaPersonalizada");

// Guarda quem convidou (?convite=uid no link compartilhado) ate a
// conta ser criada de verdade -- soh entao js/auth.js credita a
// raspadinha brilhante garantida pra quem convidou (ver
// creditarConviteSeExistir em js/auth.js).
(function detectarLinkDeConvite() {
  const conviteUid = new URLSearchParams(window.location.search).get("convite");
  if (conviteUid) {
    localStorage.setItem("desbrava_convite_pendente", conviteUid);
  }
})();

// Link "me adicione como amigo(a)" (?amigo=uid): guarda até a pessoa
// logar; aí processarAmigoPendente manda um pedido de amizade pra quem
// gerou o link (ver o listener de "auth-mudou").
(function detectarLinkDeAmigo() {
  const amigoUid = new URLSearchParams(window.location.search).get("amigo");
  if (amigoUid) {
    localStorage.setItem("desbrava_amigo_pendente", amigoUid);
  }
})();

// Registra o service worker (PWA instalável no celular e no PC)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((erro) => {
      console.error("Falha ao registrar o service worker:", erro);
    });
  });
}

// Guarda o evento do navegador (Chrome/Edge/Android) que permite
// instalar o PWA com um clique, em vez de só instruções manuais.
// Precisa ser capturado assim que disparar (pode ser antes do
// DOMContentLoaded), por isso fica fora do bloco de inicialização.
let promptInstalacaoPwa = null;

// Uma vez que a pessoa instala (pelo nosso botão), nunca mais mostra
// o aviso nesse navegador — mesmo que ela volte a abrir pela aba
// comum em vez do app instalado.
const CHAVE_PWA_INSTALADO = "desbrava_pwa_instalado";

// Link de download do APK (sempre a versão mais recente). Publicado
// como "release" no GitHub -- a URL /releases/latest/download/... sempre
// aponta pro APK do último release, então NÃO precisa trocar a cada
// versão (ver CLAUDE.md, "APK no Drive/online"). Trocar aqui se um dia
// mudar o host do arquivo.
const URL_APK = "https://github.com/pvsm23/mapa-raspadinha-rj/releases/latest/download/Desbrava.apk";

function abrirNovidades() {
  renderizarNovidades();
  document.getElementById("modal-novidades").classList.remove("oculto");
}

function fecharNovidades() {
  document.getElementById("modal-novidades").classList.add("oculto");
}

/** Lista as últimas 10 versões (HISTORICO_VERSOES) com descrições
 *  amigáveis -- a mais recente em destaque no topo. */
function renderizarNovidades() {
  const lista = document.getElementById("novidades-lista");
  lista.innerHTML = "";
  HISTORICO_VERSOES.slice(0, 10).forEach((v, i) => {
    const bloco = document.createElement("div");
    bloco.className = "novidade-item" + (i === 0 ? " novidade-atual" : "");
    const cabecalho = document.createElement("div");
    cabecalho.className = "novidade-versao";
    cabecalho.textContent = i === 0 ? `Versão ${v.versao} · atual` : `Versão ${v.versao}`;
    const ul = document.createElement("ul");
    (v.itens || []).forEach((texto) => {
      const li = document.createElement("li");
      li.textContent = texto;
      ul.appendChild(li);
    });
    bloco.append(cabecalho, ul);
    lista.appendChild(bloco);
  });
}

/** Compara "x.y.z": true se `a` for MAIOR que `b`. */
/**
 * Contagem de versões embutida no formato novo (0.ano.mes.dia.N).
 * Devolve null pro formato antigo (0.11.45), de três partes.
 */
function contagemDaVersao(versao) {
  const partes = String(versao).split(".");
  if (partes.length < 5) return null;
  const n = parseInt(partes[4], 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * `a` é mais nova que `b`?
 *
 * No formato novo (0.ano.mes.dia.N) quem manda é a CONTAGEM, o último
 * número -- e não a data.
 *
 * Comparar a data não resolveria: a varredura olha só os TRÊS primeiros
 * campos (0, ano, mês), então o DIA fica de fora e duas entregas do
 * mesmo mês empatariam -- e empate aqui significa "não tem versão
 * nova", justamente no caso mais comum, que é entregar duas vezes na
 * mesma semana. A contagem é estritamente crescente por construção
 * (sobe de um a cada entrega, junto com o versionCode do Android),
 * então é o único campo em que dá pra confiar.
 *
 * O caminho antigo continua aqui pela transição: quem tem 0.11.45
 * instalado precisa reconhecer a versão nova como mais recente, e aí a
 * comparação cai nos três primeiros campos (26 > 11) e acerta.
 */
function ehVersaoMaior(a, b) {
  const ca = contagemDaVersao(a);
  const cb = contagemDaVersao(b);
  if (ca !== null && cb !== null) return ca > cb;

  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

/* ===================== AVISO DE VERSÃO =====================
 * Dois momentos diferentes, mesma janela:
 *
 *  A) ACABOU DE ATUALIZAR -- a VERSAO_APP rodando é diferente da que
 *     ficou guardada da última abertura. Vale pro APK e pra WEB (que
 *     se atualiza sozinha, e por isso nunca cai no caso B).
 *  B) ESTÁ DESATUALIZADO -- só no APK: existe release mais novo no
 *     GitHub. Aí a janela ganha o botão de atualizar.
 *
 * Se os dois valessem na mesma abertura (atualizou pra 82, mas já saiu
 * a 83), o A vence: comemorar o que a pessoa acabou de receber é mais
 * honesto do que cobrar de novo na mesma hora. O B aparece na próxima.
 */
const CHAVE_VERSAO_VISTA = "desbrava_versao_vista";

/* O changelog mora no script.js, que vai EMPACOTADO no APK -- então um
 * app velho não tem como conhecer as novidades das versões novas. Este
 * arquivo é a cópia publicada na web, gerada por
 * tools/gerar-versoes-json.js. Só o caso B precisa dele. */
/* Domínio próprio desde 18/08/2026. O endereço antigo
   (pvsm23.github.io/mapa-raspadinha-rj) continua funcionando: ao
   receber um domínio customizado, o GitHub Pages passa a REDIRECIONAR
   o .github.io pra cá. Isso importa porque o SITE_PUBLICADO vai
   DENTRO do APK -- quem tem uma versão antiga instalada segue
   apontando pro endereço velho, e é o redirecionamento que mantém o
   download de mapa estadual funcionando pra essa gente. */
const SITE_PUBLICADO = "https://desbravaapp.com.br";
const URL_VERSOES_PUBLICADAS = `${SITE_PUBLICADO}/data/versoes.json`;

/** Entradas do histórico mais novas que `versao`, da mais recente pra trás. */
function novidadesDesde(historico, versao) {
  return (historico || []).filter((v) => v?.versao && ehVersaoMaior(v.versao, versao));
}

/**
 * Monta e abre a janela de versão.
 *
 * `aoAtualizar` só é passado no caso B; sem ele o botão de atualizar
 * nem aparece, que é o comportamento na web -- lá não há o que baixar.
 */
function abrirAvisoDeVersao({ titulo, subtitulo, emblema, blocos, aoAtualizar }) {
  const modal = document.getElementById("modal-versao");
  if (!modal || !blocos.length) return false;

  document.getElementById("versao-emblema").textContent = emblema;
  document.getElementById("versao-titulo").textContent = titulo;
  document.getElementById("versao-subtitulo").textContent = subtitulo;

  const lista = document.getElementById("versao-lista");
  lista.innerHTML = "";
  // textContent em vez de innerHTML: o changelog é nosso, mas é texto
  // livre e um dia pode vir de arquivo publicado (caso B).
  blocos.forEach((bloco) => {
    const div = document.createElement("div");
    div.className = "versao-bloco";
    if (blocos.length > 1) {
      const cab = document.createElement("div");
      cab.className = "versao-bloco-titulo";
      cab.textContent = `Versão ${bloco.versao}`;
      div.appendChild(cab);
    }
    const ul = document.createElement("ul");
    (bloco.itens || []).forEach((texto) => {
      const li = document.createElement("li");
      li.textContent = texto;
      ul.appendChild(li);
    });
    div.appendChild(ul);
    lista.appendChild(div);
  });

  const botao = document.getElementById("btn-versao-atualizar");
  botao.classList.toggle("oculto", !aoAtualizar);
  botao.onclick = aoAtualizar || null;
  document.getElementById("btn-versao-depois").textContent = aoAtualizar
    ? "Agora não"
    : "Entendi";

  lista.scrollTop = 0;
  modal.classList.remove("oculto");
  return true;
}

function fecharAvisoDeVersao() {
  fecharComAnimacao(document.getElementById("modal-versao"));
}

/**
 * Caso A: a versão que está rodando mudou desde a última abertura.
 *
 * Devolve true se mostrou algo -- quem chama usa isso pra não empilhar
 * o aviso de "tem versão nova" por cima.
 *
 * Quem instala o app AGORA não vê nada: sem valor guardado, só
 * registramos a versão atual em silêncio. Receber um changelog de
 * coisas que você nunca usou é ruído, não novidade.
 */
function avisarQueAtualizou() {
  let vista = null;
  try {
    vista = localStorage.getItem(CHAVE_VERSAO_VISTA);
  } catch {
    return false; // localStorage bloqueado: não insiste
  }

  const gravar = () => {
    try {
      localStorage.setItem(CHAVE_VERSAO_VISTA, VERSAO_APP);
    } catch {
      /* cota cheia / modo privado: o aviso reaparece, e tudo bem */
    }
  };

  if (!vista) {
    gravar();
    return false;
  }
  if (vista === VERSAO_APP) return false;

  /* Downgrade (reinstalou um APK antigo) cai aqui com lista vazia.
   * Só regrava e sai calado -- anunciar "novidades" de uma versão
   * ANTERIOR seria mentira. */
  const blocos = novidadesDesde(HISTORICO_VERSOES, vista);
  gravar();
  if (!blocos.length) return false;

  const varias = blocos.length > 1;
  return abrirAvisoDeVersao({
    emblema: "✨",
    titulo: varias ? "O app foi atualizado" : "Novidades desta versão",
    subtitulo: varias
      ? `Você pulou ${blocos.length} versões desde a ${vista}. Veja o que mudou:`
      : `Agora você está na versão ${VERSAO_APP}.`,
    blocos,
  });
}

/**
 * Caso B: existe release mais novo que o APK instalado.
 *
 * Busca o changelog PUBLICADO (o de dentro do APK não conhece as
 * versões novas). Se a busca falhar, o aviso ainda abre com um texto
 * genérico -- o que importa é a pessoa saber que tem versão nova e ter
 * o botão à mão.
 */
async function avisarAtualizacaoDisponivel(versaoNova) {
  let blocos = [];
  try {
    const resposta = await fetch(URL_VERSOES_PUBLICADAS, { cache: "no-store" });
    if (resposta.ok) blocos = novidadesDesde(await resposta.json(), VERSAO_APP);
  } catch {
    /* offline ou site fora: segue com a lista vazia */
  }

  if (!blocos.length) {
    blocos = [{ versao: versaoNova, itens: ["Melhorias e correções no app."] }];
  }

  abrirAvisoDeVersao({
    emblema: "⬇️",
    titulo: "Tem versão nova",
    subtitulo: `Você está na ${VERSAO_APP} e a ${versaoNova} já saiu. Veja o que muda:`,
    blocos,
    aoAtualizar: () => {
      fecharAvisoDeVersao();
      baixarApk();
    },
  });
}

/**
 * Só no app instalado: consulta o último release no GitHub e, se a
 * versão publicada for maior que a instalada (VERSAO_APP), destaca o
 * item de menu "Atualizar app" com o aviso da nova versão. Falha
 * silenciosa (offline / GitHub fora do ar) -- nunca trava nada.
 *
 * `jaAvisou` vem true quando a janela de "acabou de atualizar" já
 * apareceu nesta abertura: aí o destaque no menu continua, mas a
 * janela de cobrança não sobe por cima.
 */
async function verificarAtualizacaoApp(item, jaAvisou) {
  try {
    const resposta = await fetch(
      "https://api.github.com/repos/pvsm23/mapa-raspadinha-rj/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!resposta.ok) return;
    const dados = await resposta.json();
    const versaoNova = (dados.tag_name || "").replace(/^v/, "").trim();
    if (versaoNova && ehVersaoMaior(versaoNova, VERSAO_APP)) {
      item.innerHTML = `<span><svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>Atualizar app · ${versaoNova} nova!`;
      item.classList.add("menu-op-destaque");
      if (!jaAvisou) avisarAtualizacaoDisponivel(versaoNova);
    }
  } catch {
    /* sem internet ou GitHub indisponível: mantém "Atualizar app" normal */
  }
}

/**
 * Descobre o link do APK com NOME VERSIONADO (Desbrava-v0.11.18.apk) no
 * último release.
 *
 * Por que não basta o URL_APK "latest/download/Desbrava.apk": esse nome
 * é fixo, então toda versão baixa por cima do mesmo arquivo em
 * Downloads. Se já existia um Desbrava.apk de uma versão anterior, o
 * Android abre/oferece o ARQUIVO ANTIGO e o instalador diz que já é a
 * mesma versão -- foi exatamente o que aconteceu na 0.11.17. Com um
 * nome por versão, cada download vira um arquivo distinto e não tem
 * como instalar o velho sem querer.
 *
 * Devolve null se não achar (release antigo, sem rede): quem chama cai
 * no URL_APK de sempre.
 */
async function descobrirUrlApkVersionado() {
  try {
    const resposta = await fetch(
      "https://api.github.com/repos/pvsm23/mapa-raspadinha-rj/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    const versionado = (dados.assets || []).find((a) => /^Desbrava-v.+\.apk$/i.test(a.name || ""));
    return versionado?.browser_download_url || null;
  } catch {
    return null;
  }
}

/**
 * Dispara o download do APK. IMPORTANTE: nada de nova aba/target=_blank
 * -- em navegador in-app ou "aba personalizada" (Custom Tab) o download
 * do APK trava em 100% sem finalizar. Como o servidor manda o arquivo
 * com "Content-Disposition: attachment", navegar direto pra ele baixa
 * sem sair da página. No app instalado, abre no navegador do sistema
 * (dentro da WebView o download/instalação do APK não conclui).
 */
async function baixarApk() {
  // Prefere o nome versionado; sem rede ou em release antigo, o link
  // "latest" continua valendo (é melhor baixar do que não baixar).
  const url = (await descobrirUrlApkVersionado()) || URL_APK;
  if (ehAppNativo()) {
    window.open(url, "_system");
  } else {
    window.location.href = url;
  }
}

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  promptInstalacaoPwa = evento;
  document.getElementById("btn-instalar-pwa")?.classList.remove("oculto");
  document.getElementById("btn-como-instalar-pwa")?.classList.add("oculto");
});

window.addEventListener("appinstalled", () => {
  promptInstalacaoPwa = null;
  localStorage.setItem(CHAVE_PWA_INSTALADO, "true");
  fecharAvisoInstalarPwa();
});

/* ============================================================
   TEMA: Sistema / Claro / Escuro
   ============================================================
   "Sistema" não fixa nada em <html data-theme>: remove o atributo e
   deixa a media query prefers-color-scheme do CSS decidir. "Claro" e
   "Escuro" fixam o atributo direto.

   Existiu aqui um quarto modo, "Automático", que lia o
   AmbientLightSensor pra clarear a tela no sol. Foi removido: a
   WebView do Android bloqueia essa API, e ela também já tinha sido
   removida do Chrome (fingerprinting) e nunca existiu no iOS -- não
   havia aparelho real em que funcionasse. Se um dia voltar, volta
   como recurso à parte, não como opção de tema.
   ============================================================ */
const CHAVE_TEMA = "desbrava_tema";
const TEMAS_VALIDOS = ["sistema", "claro", "escuro"];

// Fonte única sobre o tema do sistema. O CSS já reage sozinho à media
// query; esta consulta existe pro JS saber QUAL cor está valendo
// quando o modo é "sistema" (ver sincronizarCorDaBarra).
const consultaEscuro = window.matchMedia("(prefers-color-scheme: dark)");

/** Cor que está realmente na tela agora, resolvendo "sistema". */
function temaEfetivo(modo) {
  if (modo === "claro") return "claro";
  if (modo === "escuro") return "escuro";
  return consultaEscuro.matches ? "escuro" : "claro";
}

/* A barra de status do Android se pinta pelo <meta name="theme-color">,
   que era fixo em #000000 -- no tema Claro ficava uma tarja preta em
   cima de um app todo branco. Estes valores acompanham o --bg de cada
   tema (ver o :root em css/styles.css). */
const COR_BARRA = { escuro: "#0F1216", claro: "#F4F6F8" };

function sincronizarCorDaBarra(modo) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COR_BARRA[temaEfetivo(modo)]);
}

function aplicarDataTheme(modo) {
  const raiz = document.documentElement;
  if (modo === "claro") raiz.dataset.theme = "light";
  else if (modo === "escuro") raiz.dataset.theme = "dark";
  else raiz.removeAttribute("data-theme"); // "sistema": prefers-color-scheme decide
  // Força o navegador a recalcular estilo/repintar na hora -- sem
  // isso, algum elemento pontual podia demorar a refletir a troca de
  // variável CSS até o próximo repaint natural da página.
  void raiz.offsetHeight;
  sincronizarCorDaBarra(modo);
}

/** Marca qual botão do segmented control está ativo (visual +
 *  aria-checked pro leitor de tela). */
function sincronizarAparenciaUI(modo) {
  document.querySelectorAll(".aparencia-opcao").forEach((botao) => {
    const ativo = botao.dataset.tema === modo;
    botao.classList.toggle("active", ativo);
    botao.setAttribute("aria-checked", ativo ? "true" : "false");
  });
}

/** Ponto de entrada único pra trocar de tema -- usado pelo segmented
 *  control de Configurações e pela restauração na inicialização. */
function definirTema(modo) {
  if (!TEMAS_VALIDOS.includes(modo)) modo = "sistema";
  aplicarDataTheme(modo);
  localStorage.setItem(CHAVE_TEMA, modo);
  sincronizarAparenciaUI(modo);
}

/** Restaura o tema salvo (padrão "sistema") e liga o segmented
 *  control de Configurações. */
function configurarAparencia() {
  document.querySelectorAll(".aparencia-opcao").forEach((botao) => {
    botao.addEventListener("click", () => definirTema(botao.dataset.tema));
  });

  const salvo = localStorage.getItem(CHAVE_TEMA);
  // Quem tinha "automatico" salvo (versões 0.11.16 a 0.11.19) cai em
  // "sistema" e fica gravado assim -- senão o valor órfão continuaria
  // no localStorage sem nenhum botão correspondente na tela.
  const modo = TEMAS_VALIDOS.includes(salvo) ? salvo : "sistema";

  aplicarDataTheme(modo);
  sincronizarAparenciaUI(modo);
  if (salvo !== modo) localStorage.setItem(CHAVE_TEMA, modo);

  // Só importa no modo "sistema": se a pessoa trocar o tema do celular
  // com o app aberto, o CSS vira sozinho, mas a cor da barra de status
  // não -- ela depende do <meta>, que é JS.
  consultaEscuro.addEventListener("change", () => {
    if ((localStorage.getItem(CHAVE_TEMA) || "sistema") === "sistema") {
      sincronizarCorDaBarra("sistema");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  configurarAparencia();
  const versaoEl = document.getElementById("versao-app-texto");
  if (versaoEl) versaoEl.textContent = `versão ${VERSAO_APP}`;
  document.getElementById("btn-ver-novidades")?.addEventListener("click", abrirNovidades);
  document.getElementById("btn-fechar-novidades")?.addEventListener("click", fecharNovidades);

  // ---- Modos do mapa ----
  configurarModos();
  document.getElementById("clima-pilula")?.addEventListener("click", (evento) => {
    // A pílula fica POR CIMA da raspadinha: sem isto, tocar nela
    // contaria como raspar o selo.
    evento.stopPropagation();
    const pilula = evento.currentTarget;
    const abrindo = !pilula.classList.contains("expandida");
    pilula.classList.toggle("expandida", abrindo);
    pilula.setAttribute("aria-expanded", abrindo ? "true" : "false");
  });

  document.getElementById("btn-topo-notificacoes")?.addEventListener("click", abrirNotificacoes);
  document.getElementById("btn-fechar-notificacoes")?.addEventListener("click", fecharNotificacoes);
  document.getElementById("modal-notificacoes")?.addEventListener("click", (evento) => {
    if (evento.target.id === "modal-notificacoes") fecharNotificacoes();
  });

  // Leva à Comunidade filtrada por este ponto. O rótulo do filtro leva
  // o NOME do ponto: o id (3302106-praca-da-matematica) não diz nada.
  document.getElementById("btn-ponto-posts")?.addEventListener("click", () => {
    if (!pontoAbertoId) return;
    const nome = document.getElementById("ponto-titulo").textContent;
    fecharPontoTuristico();
    abrirPainelSocial(pontoAbertoMunicipio, { pontoId: pontoAbertoId, rotuloPonto: nome });
  });

  document.getElementById("btn-comentar-ponto")?.addEventListener("click", enviarComentarioDoPonto);
  // Enter envia, Shift+Enter quebra linha -- o mesmo do resto do app.
  document.getElementById("input-comentario-ponto")?.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      enviarComentarioDoPonto();
    }
  });

  document.getElementById("btn-fechar-versao")?.addEventListener("click", fecharAvisoDeVersao);
  document.getElementById("btn-versao-depois")?.addEventListener("click", fecharAvisoDeVersao);
  // Tocar no fundo fecha, como nas outras janelas. Só no fundo: um
  // clique dentro da caixa não pode fechar por acidente.
  document.getElementById("modal-versao")?.addEventListener("click", (evento) => {
    if (evento.target.id === "modal-versao") fecharAvisoDeVersao();
  });
  document.getElementById("modal-novidades")?.addEventListener("click", (evento) => {
    if (evento.target.id === "modal-novidades") fecharNovidades();
  });
  estadoMapa = carregarEstado();
  estadoRegioes = carregarEstadoRegioes();
  estadoConquistas = carregarEstadoConquistas();
  estadoRotas = carregarEstadoRotas();
  estadoStreak = carregarEstadoStreak();
  registrarAcessoDeHoje();
  construirMapaDeRegioes();
  construirSlugsDeMunicipios();
  construirContornosDeRegiao();
  aplicarEstadoNoSVG();
  atualizarContador();
  inicializarPanZoomDoMapa();
  carregarDestinos();
  carregarCuriosidades();
  carregarGeoJsonMunicipios().then(() => verificarLocalizacaoAoAbrirApp());
  carregarRegioesInfo();
  carregarResumosRegioes();
  carregarRotasInfo();
  atualizarVisibilidadeAnuncio();
  preCarregarSelos();

  // Confere de novo sempre que o app volta a ficar visível (ex: usuário
  // minimizou/trocou de app e voltou) -- ver verificarLocalizacaoAoAbrirApp
  // pra entender o que isso detecta (e o que NÃO detecta).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") verificarLocalizacaoAoAbrirApp();
  });

  const municipios = document.querySelectorAll("#mapa-rj .municipio");
  municipios.forEach((path) => {
    path.addEventListener("click", () => aoClicarMunicipio(path));
  });

  document
    .getElementById("btn-reset-tudo")
    .addEventListener("click", resetarTudo);

  document
    .getElementById("btn-reset-um")
    .addEventListener("click", desmarcarMunicipioAtual);

  document
    .getElementById("btn-verificar-local")
    .addEventListener("click", tentarVerificarLocalAgora);

  document
    .getElementById("btn-menu-modal")
    .addEventListener("click", (evento) => {
      evento.stopPropagation();
      document.getElementById("modal-menu").classList.toggle("oculto");
    });

  document
    .getElementById("btn-fechar-modal")
    .addEventListener("click", fecharModalRaspadinha);

  document
    .getElementById("btn-posts-municipio")
    .addEventListener("click", (evento) => {
      evento.stopPropagation();
      exigirLogin(() => abrirPainelSocial(municipioSelecionadoId));
    });
  document
    .getElementById("btn-convite-municipio")
    .addEventListener("click", () => exigirLogin(compartilharConviteMunicipio));

  // fecha o modal ao clicar fora do cartão (no fundo escurecido)
  document
    .getElementById("modal-raspadinha")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "modal-raspadinha") fecharModalRaspadinha();
    });

  // os itens de destino sao criados dinamicamente; delegacao de evento
  document
    .getElementById("modal-destinos")
    .addEventListener("click", aoClicarDestino);

  document
    .getElementById("btn-biblioteca")
    .addEventListener("click", () => exigirLogin(abrirBibliotecaSelos));

  document
    .getElementById("btn-fechar-biblioteca")
    .addEventListener("click", fecharBibliotecaSelos);

  document
    .getElementById("biblioteca-selos")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "biblioteca-selos") fecharBibliotecaSelos();
    });

  document.getElementById("btn-voltar-lightbox").addEventListener("click", fecharSeloLightbox);
  document.getElementById("modal-selo-lightbox").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-selo-lightbox") fecharSeloLightbox();
  });

  document
    .getElementById("btn-configuracoes")
    .addEventListener("click", abrirConfiguracoes);

  document
    .getElementById("btn-fechar-configuracoes")
    .addEventListener("click", fecharConfiguracoes);

  document
    .getElementById("modal-configuracoes")
    .addEventListener("click", (evento) => {
      if (evento.target.id === "modal-configuracoes") fecharConfiguracoes();
    });

  document
    .getElementById("btn-compartilhar")
    .addEventListener("click", () => document.getElementById("modal-compartilhar").classList.remove("oculto"));
  document
    .getElementById("btn-fechar-compartilhar")
    .addEventListener("click", () => document.getElementById("modal-compartilhar").classList.add("oculto"));
  document.getElementById("modal-compartilhar").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-compartilhar") {
      document.getElementById("modal-compartilhar").classList.add("oculto");
    }
  });
  document.getElementById("btn-compartilhar-de-fato").addEventListener("click", compartilharApp);
  document.getElementById("btn-logout").addEventListener("click", sairDaConta);
  document.getElementById("btn-entrar-config")?.addEventListener("click", abrirTelaLogin);
  document
    .getElementById("btn-compartilhar-progresso")
    .addEventListener("click", abrirCartaoProgresso);
  document
    .getElementById("btn-fechar-cartao-progresso")
    .addEventListener("click", fecharCartaoProgresso);
  document.getElementById("modal-cartao-progresso").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-cartao-progresso") fecharCartaoProgresso();
  });
  document
    .getElementById("btn-compartilhar-cartao")
    .addEventListener("click", compartilharCartaoProgresso);
  document.getElementById("btn-baixar-cartao").addEventListener("click", baixarCartaoProgresso);
  document.getElementById("form-login").addEventListener("submit", aoEnviarFormLogin);
  document.getElementById("btn-esqueci-senha").addEventListener("click", pedirRedefinicaoSenha);

  document.getElementById("btn-entrar-google").addEventListener("click", entrarComGoogle);
  document.getElementById("btn-entrar-google").classList.remove("oculto");
  document.getElementById("login-ou").classList.remove("oculto");
  document
    .getElementById("btn-alternar-modo")
    .addEventListener("click", alternarModoLogin);
  document
    .getElementById("btn-fechar-tela-login")
    .addEventListener("click", fecharTelaLogin);
  document.getElementById("tela-login").addEventListener("click", (evento) => {
    if (evento.target.id === "tela-login") fecharTelaLogin();
  });
  document.getElementById("toast-login").addEventListener("click", () => {
    const toast = document.getElementById("toast-login");
    if (!toast.classList.contains("toast-erro")) return;
    esconderToastLogin();
    abrirTelaLogin();
  });

  document
    .getElementById("btn-baixar-offline")
    .addEventListener("click", baixarDadosOffline);

  // ---- Paywall do Motoclube ----
  document.getElementById("btn-assinar-pro").addEventListener("click", abrirPaywallMotoclube);
  document.getElementById("btn-fechar-paywall").addEventListener("click", fecharPaywallMotoclube);
  document.getElementById("btn-paywall-assinar").addEventListener("click", aoAssinarPeloPaywall);
  document.getElementById("modal-paywall").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-paywall") fecharPaywallMotoclube();
  });

  // ---- Checkout Pix ----
  document.getElementById("btn-fechar-checkout").addEventListener("click", fecharCheckout);
  document.getElementById("btn-ja-paguei").addEventListener("click", fecharCheckout);
  document.getElementById("modal-checkout").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-checkout") fecharCheckout();
  });
  document.getElementById("btn-gerar-pix").addEventListener("click", aoGerarPix);
  document.getElementById("btn-copiar-codigo-pix").addEventListener("click", copiarCodigoPix);
  document.getElementById("btn-sucesso-fechar").addEventListener("click", fecharCheckout);
  document.getElementById("btn-ja-paguei-verificar").addEventListener("click", aoClicarJaPaguei);
  document.getElementById("btn-paywall-ja-paguei").addEventListener("click", aoRecuperarAssinatura);
  document.getElementById("input-cpf-checkout").addEventListener("input", (evento) => {
    evento.target.value = formatarCpf(evento.target.value);
  });
  // O botão só existe pra quem não é PRO, e isso só se sabe depois do
  // login carregar o perfil.
  document.addEventListener("auth-mudou", atualizarBotaoAssinarPro);

  document
    .getElementById("btn-confirmar-apelido")
    .addEventListener("click", confirmarApelido);
  document
    .getElementById("input-apelido")
    .addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") confirmarApelido();
    });
  document
    .getElementById("btn-fechar-apelido")
    .addEventListener("click", fecharModalApelidoComAleatorio);

  document
    .getElementById("btn-salvar-apelido-config")
    .addEventListener("click", salvarApelidoConfig);

  // ---- Painel de Admin (moderação + anúncios, só pra conta dona) ----
  document.getElementById("btn-abrir-admin").addEventListener("click", abrirAdmin);
  document.getElementById("btn-fechar-admin").addEventListener("click", fecharAdmin);
  document.getElementById("modal-admin").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-admin") fecharAdmin();
  });
  document.getElementById("btn-buscar-moderacao").addEventListener("click", buscarContaParaModerar);
  document.getElementById("input-busca-moderacao").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") buscarContaParaModerar();
  });
  document.getElementById("btn-salvar-chave-pix").addEventListener("click", salvarChavePixAdmin);
  document
    .getElementById("check-anuncios-ativados")
    .addEventListener("change", alternarAnunciosAdmin);
  document
    .getElementById("check-anuncios-para-mim")
    .addEventListener("change", alternarAnuncioParaMim);
  document
    .getElementById("check-motoclube-liberado")
    .addEventListener("change", alternarMotoclubeLiberado);
  document.getElementById("btn-fechar-brasao").addEventListener("click", fecharBrasaoDoGrupo);
  document.getElementById("btn-compartilhar-brasao").addEventListener("click", compartilharBrasaoDoGrupo);
  document.getElementById("modal-brasao").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-brasao") fecharBrasaoDoGrupo();
  });

  // Pontos turísticos no mapa. O clique é ouvido no <svg> inteiro
  // (delegação) porque os medalhões são criados depois, quando o
  // data/destinos.json chega.
  document.getElementById("mapa-rj")?.addEventListener("click", aoClicarPontoTuristico, true);
  document.getElementById("btn-fechar-ponto").addEventListener("click", fecharPontoTuristico);
  document.getElementById("btn-fechar-escolha-ponto").addEventListener("click", fecharEscolhaDePonto);
  document.getElementById("modal-escolha-ponto").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-escolha-ponto") fecharEscolhaDePonto();
  });
  document.getElementById("btn-ponto-cidade").addEventListener("click", verCidadeDoPonto);
  document.getElementById("modal-ponto").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-ponto") return fecharPontoTuristico();
    const botao = evento.target.closest(".chip-acao");
    if (botao?.dataset.link) window.open(botao.dataset.link, "_blank");
  });

  // ---- Excluir conta ----
  document.getElementById("btn-abrir-excluir-conta").addEventListener("click", iniciarFluxoExclusaoConta);
  document
    .getElementById("btn-fechar-confirmar-exclusao")
    .addEventListener("click", () => document.getElementById("modal-confirmar-exclusao").classList.add("oculto"));
  document.getElementById("input-confirmar-exclusao").addEventListener("input", (evento) => {
    document.getElementById("btn-excluir-de-vez").disabled = evento.target.value.trim() !== "EXCLUIR";
  });
  document.getElementById("btn-excluir-de-vez").addEventListener("click", confirmarExclusaoDeVez);

  document
    .getElementById("btn-fechar-regiao")
    .addEventListener("click", fecharPopupRegiao);
  document.getElementById("modal-regiao").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-regiao") fecharPopupRegiao();
  });

  document.addEventListener("auth-mudou", (evento) => atualizarUiDeConta(evento.detail));
  // O sino some no logout e reconta a cada login.
  document.addEventListener("auth-mudou", atualizarBadgeNotificacoes);
  document.addEventListener("auth-mudou", (evento) => abrirPostDoLinkSeExistir(evento.detail?.usuario));
  document.addEventListener("auth-mudou", (evento) => abrirMunicipioDoLinkSeExistir(evento.detail?.usuario));
  document.addEventListener("auth-mudou", (evento) => abrirRotaPersonalizadaDoLinkSeExistir(evento.detail?.usuario));
  document.addEventListener("auth-mudou", (evento) => processarAmigoPendente(evento.detail?.usuario));
  document.addEventListener("precisa-apelido", (evento) => abrirModalApelido(evento.detail));
  document.addEventListener("conta-bloqueada", (evento) => mostrarTelaContaBloqueada(evento.detail));
  document
    .getElementById("btn-fechar-conta-bloqueada")
    .addEventListener("click", () => document.getElementById("tela-conta-bloqueada").classList.add("oculto"));
  document.addEventListener("boosts-brilhantes-mudou", atualizarAvisoBrilhantePendente);

  // ---- Meu perfil ----
  document
    .getElementById("btn-meu-perfil")
    .addEventListener("click", () => exigirLogin(() => abrirPerfil(window.raspadinhaAuth.usuarioAtual.uid)));

  // ---- Ranking ----
  document
    .getElementById("btn-abrir-ranking")
    .addEventListener("click", () => exigirLogin(abrirRanking));
  document.getElementById("btn-fechar-ranking").addEventListener("click", fecharRanking);
  document.getElementById("modal-ranking").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-ranking") fecharRanking();
  });
  document.getElementById("btn-ranking-global").addEventListener("click", () => alternarAbaRanking("global"));
  document.getElementById("btn-ranking-estadual").addEventListener("click", () => alternarAbaRanking("estadual"));
  document.getElementById("btn-ranking-amigos").addEventListener("click", () => alternarAbaRanking("amigos"));

  // ---- Conquistas ----
  document
    .getElementById("btn-abrir-conquistas")
    .addEventListener("click", () => exigirLogin(abrirConquistas));
  document.getElementById("btn-fechar-conquistas").addEventListener("click", fecharConquistas);
  document.getElementById("modal-conquistas").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-conquistas") fecharConquistas();
  });

  // ---- Rotas temáticas ----
  document.getElementById("btn-abrir-rotas").addEventListener("click", () => exigirLogin(abrirRotas));
  document.getElementById("btn-fechar-rotas").addEventListener("click", fecharRotas);
  document.getElementById("modal-rotas").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-rotas") fecharRotas();
  });
  document.getElementById("btn-fechar-rota-detalhe").addEventListener("click", fecharPopupRota);
  document.getElementById("modal-rota-detalhe").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-rota-detalhe") fecharPopupRota();
  });
  document.getElementById("btn-ver-rota-no-mapa").addEventListener("click", () => {
    if (!rotaSelecionadaId) return;
    const idParaVerNoMapa = rotaSelecionadaId;
    fecharPopupRota();
    fecharRotas();
    entrarModoRota(idParaVerNoMapa);
  });
  document.getElementById("btn-sair-rota").addEventListener("click", sairModoRota);

  // ---- Rotas personalizadas (sem selo, criadas pelo usuário) ----
  document.getElementById("btn-criar-rota-personalizada").addEventListener("click", abrirModalCriarRota);
  document.getElementById("btn-fechar-criar-rota").addEventListener("click", fecharModalCriarRota);
  document.getElementById("modal-criar-rota").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-criar-rota") fecharModalCriarRota();
  });
  document.getElementById("input-filtro-municipios-rota").addEventListener("input", (evento) => {
    renderizarListaMunicipiosParaEscolher(evento.target.value);
  });
  document.getElementById("btn-salvar-rota-personalizada").addEventListener("click", salvarRotaPersonalizada);

  document.getElementById("btn-fechar-rota-personalizada-detalhe").addEventListener("click", fecharRotaPersonalizadaDetalhe);
  document.getElementById("modal-rota-personalizada-detalhe").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-rota-personalizada-detalhe") fecharRotaPersonalizadaDetalhe();
  });
  document.getElementById("btn-ver-rota-personalizada-no-mapa").addEventListener("click", () => {
    if (!rotaPersonalizadaSelecionada) return;
    const ids = rotaPersonalizadaSelecionada.municipios;
    fecharRotaPersonalizadaDetalhe();
    fecharRotas();
    entrarModoRotaPersonalizada(ids);
  });
  document.getElementById("btn-compartilhar-rota-personalizada").addEventListener("click", compartilharRotaPersonalizada);
  document.getElementById("btn-excluir-rota-personalizada").addEventListener("click", excluirRotaPersonalizadaAtual);
  document.getElementById("btn-fechar-compartilhar-rota").addEventListener("click", fecharMenuCompartilharRota);
  document.getElementById("modal-compartilhar-rota").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-compartilhar-rota") fecharMenuCompartilharRota();
  });
  document.getElementById("btn-compartilhar-rota-link").addEventListener("click", compartilharRotaPersonalizadaComoLink);
  document.getElementById("btn-compartilhar-rota-comunidade").addEventListener("click", compartilharRotaPersonalizadaNaComunidade);
  document.getElementById("btn-cancelar-compartilhar-rota").addEventListener("click", fecharMenuCompartilharRota);

  // ---- Motoclube Desbrava ----
  document.getElementById("btn-abrir-motoclube").addEventListener("click", () => exigirLogin(abrirMotoclube));
  configurarViewMotoclube();
  document.getElementById("select-motoclube-marca").addEventListener("change", renderizarListaMotoclube);
  document.getElementById("input-motoclube-modelo").addEventListener("input", renderizarListaMotoclube);
  document.getElementById("btn-motoclube-adicionar").addEventListener("click", abrirFormMotoclube);
  document.getElementById("btn-fechar-motoclube-form").addEventListener("click", fecharFormMotoclube);
  document.getElementById("modal-motoclube-form").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-motoclube-form") fecharFormMotoclube();
  });
  document.getElementById("btn-salvar-motoclube").addEventListener("click", salvarItemMotoclube);

  // ---- Amigos ----
  document
    .getElementById("btn-abrir-amigos")
    .addEventListener("click", () => exigirLogin(abrirAmigos));
  document.getElementById("btn-fechar-amigos").addEventListener("click", fecharAmigos);
  document.getElementById("modal-amigos").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-amigos") fecharAmigos();
  });
  // Busca contínua: dispara sozinha ~350ms depois de parar de digitar
  // (debounce, evita 1 consulta por tecla), ou na hora com Enter --
  // sem botão "Buscar" separado.
  document.getElementById("input-busca-amigo").addEventListener("input", () => {
    clearTimeout(temporizadorBuscaAmigo);
    const texto = document.getElementById("input-busca-amigo").value.trim();
    if (!texto) {
      document.getElementById("amigos-resultado-busca").innerHTML = "";
      return;
    }
    temporizadorBuscaAmigo = setTimeout(buscarAmigoPorTexto, 350);
  });
  document.getElementById("input-busca-amigo").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      clearTimeout(temporizadorBuscaAmigo);
      buscarAmigoPorTexto();
    }
  });
  document.getElementById("btn-link-amigo").addEventListener("click", () => exigirLogin(compartilharLinkAmigo));
  // Fecha qualquer menu "⋮" de amigo aberto ao tocar fora dele.
  document.addEventListener("click", (evento) => {
    if (!evento.target.closest(".amigo-item")) fecharTodosMenusAmigo();
  });

  // ---- Feedback e colaboração ----
  document.getElementById("btn-feedback").addEventListener("click", abrirFeedback);
  document.getElementById("btn-fechar-feedback").addEventListener("click", fecharFeedback);
  document.getElementById("modal-feedback").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-feedback") fecharFeedback();
  });
  document.querySelectorAll(".feedback-opcao").forEach((botao) => {
    botao.addEventListener("click", () => mostrarPainelFeedback(botao.dataset.painel));
  });
  document
    .getElementById("btn-enviar-feedback-bug")
    .addEventListener("click", () => enviarFeedback("bug"));
  document
    .getElementById("btn-enviar-feedback-sugestao")
    .addEventListener("click", () => enviarFeedback("sugestao"));
  document
    .getElementById("btn-enviar-feedback-ponto-turistico")
    .addEventListener("click", () => enviarFeedback("ponto-turistico"));
  document.getElementById("btn-copiar-pix").addEventListener("click", copiarChavePix);

  document
    .getElementById("btn-fechar-boas-vindas")
    .addEventListener("click", fecharBoasVindas);

  document
    .getElementById("btn-fechar-aviso-desenvolvimento")
    .addEventListener("click", fecharAvisoDesenvolvimento);

  // ---- Perfil público ----
  document.getElementById("btn-fechar-perfil").addEventListener("click", fecharPerfil);
  document.getElementById("modal-perfil").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-perfil") fecharPerfil();
  });

  // ---- Editor de foto de perfil ----
  document.getElementById("btn-fechar-editar-avatar").addEventListener("click", fecharEditarAvatar);
  document.getElementById("modal-editar-avatar").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-editar-avatar") fecharEditarAvatar();
  });
  document.getElementById("btn-avatar-usar-iniciais").addEventListener("click", () => salvarFotoPerfil(null));
  document.getElementById("btn-avatar-enviar-foto").addEventListener("click", () => {
    document.getElementById("input-foto-avatar").click();
  });
  document.getElementById("input-foto-avatar").addEventListener("change", (evento) => {
    const arquivo = evento.target.files[0];
    evento.target.value = "";
    enviarFotoDePerfil(arquivo);
  });

  // ---- História completa do município ----
  document
    .getElementById("btn-fechar-historia-municipio")
    .addEventListener("click", fecharHistoriaMunicipio);
  document.getElementById("modal-historia-municipio").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-historia-municipio") fecharHistoriaMunicipio();
  });
  document.getElementById("check-perfil-publico").addEventListener("change", (evento) => {
    window.raspadinhaAuth?.definirPerfilPublico(evento.target.checked);
  });

  // ---- Notificações locais ----
  document.getElementById("check-notificacoes").addEventListener("change", (evento) => {
    alternarNotificacoes(evento.target.checked);
  });

  // ---- Efeitos sonoros ----
  const checkSom = document.getElementById("check-som");
  checkSom.checked = somAtivado();
  checkSom.addEventListener("change", (evento) => alternarSom(evento.target.checked));

  // ---- Mapa do Brasil ----
  document.getElementById("btn-mapa-brasil").addEventListener("click", abrirMapaBrasil);
  document.getElementById("btn-fechar-brasil").addEventListener("click", fecharMapaBrasil);
  document.getElementById("modal-brasil").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-brasil") fecharMapaBrasil();
  });
  document.getElementById("btn-brasil-colaborar").addEventListener("click", () => {
    fecharMapaBrasil();
    abrirColaborar();
  });

  // ---- Mapa estadual (SP, MG: em desenvolvimento) ----
  // Não tem mais botão 🇧🇷 próprio: o mapa do estado agora divide a tela
  // com o resto do app, e o #btn-mapa-brasil da lateral serve pros dois
  // (selecionar RJ lá volta pro Rio, ver escolherEstado).
  document.getElementById("btn-estado-popup-fechar").addEventListener("click", esconderPopupDevEstadual);
  // Pan/zoom próprio do mapa estadual: anexa ao #estado-viewport uma vez
  // só (o SVG lá dentro é trocado a cada abertura, mas o viewport é fixo).
  inicializarPanZoomEstadual();

  // ---- Comunidade Desbrava (rede social) ----
  /* Alterna, não só abre: com a tela cheia sem véu pra tocar em volta,
     tocar de novo em "Comunidade" é a segunda saída -- o mesmo par que
     o Motoclube usa (a seta e o próprio item da barra). */
  document.getElementById("btn-social").addEventListener("click", () => {
    const aberto = !document.getElementById("modal-social").classList.contains("oculto");
    if (aberto) fecharPainelSocial();
    else exigirLogin(() => abrirPainelSocial());
  });
  document.getElementById("btn-fechar-social").addEventListener("click", fecharPainelSocial);
  document.getElementById("modal-social").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-social") fecharPainelSocial();
  });
  document.getElementById("btn-social-global").addEventListener("click", () => alternarAbaSocial("global"));
  document.getElementById("btn-social-amigos").addEventListener("click", () => alternarAbaSocial("amigos"));
  document.getElementById("btn-atalho-sugestoes").addEventListener("click", abrirSugestoesPeloAtalho);
  document.getElementById("btn-limpar-filtro-municipio").addEventListener("click", () => abrirPainelSocial());
  document.getElementById("btn-abrir-criar-post").addEventListener("click", abrirModalNovoPost);
  document.getElementById("btn-fechar-novo-post").addEventListener("click", fecharModalNovoPost);
  document.getElementById("modal-novo-post").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-novo-post") fecharModalNovoPost();
  });
  document.getElementById("btn-municipio-post").addEventListener("click", () =>
    abrirEscolherMunicipio({
      selecionado: municipioNovoPost,
      permitirNenhum: true,
      aoEscolher: (id) => {
        municipioNovoPost = id;
        document.getElementById("btn-municipio-post-valor").textContent =
          id ? idParaNomeMunicipio[id] : "Nenhum";
        /* Trocar de município invalida o ponto: um ponto de Paraty não
           pode ficar pendurado num post marcado como Niterói. */
        pontoNovoPost = null;
        atualizarSeletorDePontoDoPost();
      },
    })
  );
  document.getElementById("btn-ponto-post").addEventListener("click", () => {
    if (!municipioNovoPost) return;
    abrirEscolherPonto({
      municipioId: municipioNovoPost,
      selecionado: pontoNovoPost,
      aoEscolher: (id) => {
        pontoNovoPost = id;
        atualizarSeletorDePontoDoPost();
      },
    });
  });
  document.getElementById("input-foto-post").addEventListener("change", aoEscolherFotoPost);
  document.getElementById("btn-marcar-pessoa").addEventListener("click", aoMarcarPessoaPost);
  document.getElementById("input-marcar-pessoa").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      aoMarcarPessoaPost();
    }
  });
  document.getElementById("btn-publicar-post").addEventListener("click", publicarPost);
  document.getElementById("btn-social-carregar-mais").addEventListener("click", () => carregarFeedSocial(false));
  document.getElementById("btn-fechar-post-detalhe")?.addEventListener("click", fecharDetalheDoPost);
  /* Tocar FORA do card fecha. O teste é no alvo do evento: se for a
     própria camada, o dedo caiu no fundo, não no conteúdo. */
  document.getElementById("modal-post-detalhe")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-post-detalhe") fecharDetalheDoPost();
  });
  document.getElementById("social-conteudo")?.addEventListener("scroll", aoRolarFeedSocial, { passive: true });

  // ---- Sugestões da Comunidade ----
  // ---- Denunciar conteúdo ----
  document.getElementById("btn-fechar-denuncia").addEventListener("click", fecharDenuncia);
  document.getElementById("modal-denuncia").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-denuncia") fecharDenuncia();
  });
  document.getElementById("btn-enviar-denuncia").addEventListener("click", enviarDenuncia);

  // ---- Indicar selo ----
  document.getElementById("btn-indicar-selo").addEventListener("click", abrirIndicarSelo);
  configurarSelosIndicadosAdmin();
  configurarDenunciasAdmin();
  document.getElementById("btn-fechar-indicar-selo").addEventListener("click", fecharIndicarSelo);
  document.getElementById("modal-indicar-selo").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-indicar-selo") fecharIndicarSelo();
  });
  document
    .getElementById("btn-escolher-foto-selo")
    .addEventListener("click", () => document.getElementById("input-foto-selo").click());
  document.getElementById("input-foto-selo").addEventListener("change", aoEscolherFotoDoSelo);
  document.getElementById("btn-enviar-selo").addEventListener("click", enviarIndicacaoDeSelo);

  document
    .getElementById("btn-sugestoes-comunidade")
    .addEventListener("click", () => exigirLogin(() => abrirSugestoesComunidade(municipioSelecionadoId)));
  document.getElementById("btn-fechar-sugestoes-comunidade").addEventListener("click", fecharSugestoesComunidade);
  document.getElementById("modal-sugestoes-comunidade").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-sugestoes-comunidade") fecharSugestoesComunidade();
  });
  document.getElementById("btn-municipio-sugestoes").addEventListener("click", () =>
    abrirEscolherMunicipio({
      selecionado: municipioAtualSugestoes,
      aoEscolher: (id) => abrirSugestoesComunidade(id),
    })
  );
  document.getElementById("btn-abrir-nova-sugestao").addEventListener("click", abrirModalNovaSugestao);
  document.getElementById("btn-fechar-nova-sugestao").addEventListener("click", fecharModalNovaSugestao);
  document.getElementById("modal-nova-sugestao").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-nova-sugestao") fecharModalNovaSugestao();
  });

  // ---- Seletor de município compartilhado ----
  document.getElementById("btn-fechar-escolher-municipio").addEventListener("click", fecharEscolherMunicipio);
  document.getElementById("modal-escolher-municipio").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-escolher-municipio") fecharEscolherMunicipio();
  });
  // A folha é a mesma pros dois seletores: quem estiver aberto responde.
  document.getElementById("input-busca-municipio").addEventListener("input", (evento) => {
    if (escolherPontoContexto) renderizarListaEscolherPonto(evento.target.value);
    else renderizarListaEscolherMunicipio(evento.target.value);
  });

  // ---- Detalhe de uma sugestão ----
  document.getElementById("btn-fechar-sugestao-detalhe").addEventListener("click", fecharDetalheSugestao);
  document.getElementById("modal-sugestao-detalhe").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-sugestao-detalhe") fecharDetalheSugestao();
  });
  document
    .getElementById("btn-enviar-comentario-sugestao")
    .addEventListener("click", enviarComentarioDetalheSugestao);
  document.getElementById("input-comentario-sugestao").addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") enviarComentarioDetalheSugestao();
  });
  document.getElementById("input-foto-sugestao").addEventListener("change", aoEscolherFotoSugestao);
  document.getElementById("btn-publicar-sugestao").addEventListener("click", publicarSugestao);

  // ---- Botões flutuantes da lateral esquerda (janela suspensa) ----
  document.getElementById("btn-toggle-lateral").addEventListener("click", alternarBotoesLaterais);

  // ---- Busca de município/ponto turístico ----
  document.getElementById("btn-buscar-local").addEventListener("click", abrirBuscaLocal);
  document.getElementById("btn-fechar-busca-local").addEventListener("click", fecharBuscaLocal);
  document.getElementById("modal-busca-local").addEventListener("click", (evento) => {
    if (evento.target.id === "modal-busca-local") fecharBuscaLocal();
  });
  document.getElementById("input-busca-local").addEventListener("input", filtrarBuscaLocal);

  // ---- "Onde estou": localizar no mapa via GPS ----
  document.getElementById("btn-onde-estou").addEventListener("click", mostrarOndeEstou);

  // O aviso e o item de menu agora BAIXAM o APK (antes era instalar PWA).
  document.getElementById("btn-instalar-pwa").addEventListener("click", baixarApk);
  document
    .getElementById("btn-como-instalar-pwa")
    .addEventListener("click", alternarInstrucoesInstalarPwa);
  document
    .getElementById("btn-fechar-aviso-pwa")
    .addEventListener("click", fecharAvisoInstalarPwa);

  // Item de download no menu -- funciona mesmo se a pessoa já fechou o
  // aviso. Na WEB é "Baixar app"; dentro do APK vira "Atualizar app"
  // (baixa a versão mais recente pra instalar por cima) e, se houver
  // versão nova publicada, mostra o aviso.
  const itemBaixarApk = document.getElementById("menu-baixar-apk");
  itemBaixarApk.innerHTML = ehAppNativo()
    ? '<span><svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>Atualizar app'
    : '<span><svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>Baixar app';
  itemBaixarApk.addEventListener("click", () => {
    document.getElementById("menu-sheet").classList.add("oculto");
    baixarApk();
  });
  /* Caso A vale pros dois (a web se atualiza sozinha e cai só aqui).
   * Roda ANTES do caso B pra decidir quem fica com a tela. */
  const jaAvisou = avisarQueAtualizou();
  if (ehAppNativo()) verificarAtualizacaoApp(itemBaixarApk, jaAvisou);

  // Pequeno atraso pra não competir com o resto da tela carregando.
  setTimeout(mostrarAvisoInstalarPwa, 1200);

  mostrarBoasVindasSeNecessario();
  configurarNavInferior();
  configurarBarraTopo();
  configurarModoViagem();
  configurarGaragem();
  configurarResumoViagem();
  configurarCompartilharViagem();
  configurarLoja();
  configurarLojaAdmin();
  configurarBiblioteca();
  configurarRotas();
  configurarDicaMapa();
  esconderTelaCarregamento();
});

/* ============================================================
   MODO VIAGEM: rastreio de GPS só em PRIMEIRO PLANO (foreground
   service com notificação fixa, @capacitor-community/background-geolocation),
   ligado à mão pelo botão flutuante (#btn-modo-viagem), nunca sozinho
   em segundo plano. Isso evita de vez a permissão
   ACCESS_BACKGROUND_LOCATION (motivo de rejeição na Play Store) --
   o Android libera atualização contínua de localização com o app
   minimizado desde que exista essa notificação visível avisando.

   Enquanto o Modo Viagem está ativo: acumula a quilometragem do
   trajeto (haversine, ver distanciaEmKm) e, a cada posição nova,
   confere em que município ela cai (mesmo poligono/ray-casting da
   busca "onde estou", ver encontrarMunicipioPorCoordenada). Município
   novo -> fica em municipiosPendentesVerificados (localStorage) até a
   pessoa tocar pra raspar de verdade (ver mostrarModalPendentesSeNecessario).
   ============================================================ */
const CHAVE_PENDENTES_RASPAGEM = "desbrava_pendentes_raspagem";

function ehAppNativo() {
  return !!window.Capacitor?.isNativePlatform?.();
}

/**
 * Confirma presença num município SÓ pelo código IBGE (sem exigir uma
 * segunda leitura de GPS pra comparar deslocamento) -- usado tanto
 * pelo Modo Viagem quanto por qualquer fluxo que já tenha a posição em
 * mãos. Se for uma confirmação NOVA (o município ainda não tinha
 * presença confirmada nem tinha sido raspado), registra em
 * municipiosPendentesVerificados pra aparecer na lista de "raspagem
 * pendente" -- e devolve o id do município, ou null se não mudou nada.
 */
function confirmarPresencaPorId(id) {
  const dados = estadoMapa[id];
  if (dados?.visitado) {
    if (!dados.verificado) atualizarVerificacaoMunicipio(id, true, "");
    return null;
  }
  if (dados?.presencaConfirmadaEm) return null;
  estadoMapa[id] = { ...estadoMapa[id], presencaConfirmadaEm: new Date().toISOString() };
  salvarEstado();
  aplicarEstadoNoSVG();
  adicionarPendenteRaspagem(id);
  return id;
}

function lerPendentesRaspagem() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PENDENTES_RASPAGEM) || "[]");
  } catch {
    return [];
  }
}

function salvarPendentesRaspagem(lista) {
  localStorage.setItem(CHAVE_PENDENTES_RASPAGEM, JSON.stringify(lista));
}

function adicionarPendenteRaspagem(id) {
  const lista = lerPendentesRaspagem();
  if (!lista.includes(id)) {
    lista.push(id);
    salvarPendentesRaspagem(lista);
  }
}

/**
 * Tira da lista de pendentes -- chamado sempre que um município
 * termina de ser verificado de verdade (raspado ou não), de qualquer
 * fluxo (ver atualizarVerificacaoMunicipio), pra lista nunca ficar
 * desatualizada.
 */
function removerPendenteRaspagem(id) {
  const lista = lerPendentesRaspagem();
  const nova = lista.filter((mid) => mid !== id);
  if (nova.length !== lista.length) salvarPendentesRaspagem(nova);
}

function pluginBackgroundGeolocation() {
  return (
    window.Capacitor?.Plugins?.BackgroundGeolocation ||
    (window.Capacitor?.registerPlugin && window.Capacitor.registerPlugin("BackgroundGeolocation")) ||
    null
  );
}

const CHAVE_ULTIMA_VIAGEM = "desbrava_ultima_viagem";

let viagemAtiva = false;
let viagemWatcherId = null;
let viagemKmTotal = 0;
let viagemUltimaPosicao = null;
let viagemMunicipiosNovos = 0;
let viagemInicioEm = null;
// Trilha (pontos [lat,lon] do trajeto) e o Set de TODOS os municípios
// por onde a viagem passou (novos ou não) -- só interessam pros
// recursos PRO (salvar como rota, resumo com compartilhamento). Ver
// souMembroMotoclube().
let viagemTrilha = [];
let viagemMunicipiosPercorridos = new Set();

/**
 * Liga o botão flutuante "Modo Viagem" e os dois modais dele
 * (confirmação pra ligar / lista de pendentes). Só aparece no app
 * nativo com o plugin de geolocalização disponível -- no navegador
 * comum (site/PWA) o rastreio em primeiro plano com notificação fixa
 * não existe, então o recurso fica escondido.
 */
function configurarModoViagem() {
  const botao = document.getElementById("btn-modo-viagem");
  if (!botao || !ehAppNativo() || !pluginBackgroundGeolocation()) return;

  botao.classList.remove("oculto");
  /* A gota é o RESSALTO da barra inferior onde o botão mora. Ela só
     aparece junto com ele: sem o Modo Viagem (web, ou app sem o
     plugin), a barra fica reta, sem um bico vazio no meio. */
  document.getElementById("viagem-gota")?.classList.remove("oculto");

  botao.addEventListener("click", () => {
    // Parar uma viagem em andamento NUNCA é barrado: se a assinatura
    // vencesse no meio do rolê, a pessoa ficaria com o rastreio ligado
    // sem conseguir desligar pelo app.
    if (viagemAtiva) {
      pararModoViagem();
      return;
    }
    if (!exigirMotoclube()) return;
    abrirConfirmacaoModoViagem();
  });

  document.getElementById("btn-fechar-confirmar-viagem")?.addEventListener("click", fecharConfirmacaoModoViagem);
  document.getElementById("btn-cancelar-iniciar-viagem")?.addEventListener("click", fecharConfirmacaoModoViagem);
  document.getElementById("btn-confirmar-iniciar-viagem")?.addEventListener("click", () => {
    fecharConfirmacaoModoViagem();
    iniciarModoViagem();
  });
  document.getElementById("modal-confirmar-viagem")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-confirmar-viagem") fecharConfirmacaoModoViagem();
  });

  document.getElementById("btn-fechar-municipios-pendentes")?.addEventListener("click", fecharModalPendentes);
  document.getElementById("modal-municipios-pendentes")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-municipios-pendentes") fecharModalPendentes();
  });

  // Gatilho de abertura: se sobrou pendente de uma viagem anterior
  // (ex: app foi fechado antes de raspar), mostra a lista já na
  // inicialização, sem precisar ligar o Modo Viagem de novo.
  mostrarModalPendentesSeNecessario();
}

function abrirConfirmacaoModoViagem() {
  document.getElementById("modal-confirmar-viagem")?.classList.remove("oculto");
}

function fecharConfirmacaoModoViagem() {
  document.getElementById("modal-confirmar-viagem")?.classList.add("oculto");
}

/**
 * Liga o watcher de localização em PRIMEIRO PLANO (foreground service
 * com notificação fixa -- backgroundTitle/backgroundMessage é o que
 * faz o Android exigir e mostrar essa notificação, sem precisar de
 * ACCESS_BACKGROUND_LOCATION). distanceFilter de 150m: fino o
 * bastante pra pegar município pequeno na estrada, sem gastar GPS
 * a cada poucos metros.
 */
async function iniciarModoViagem() {
  const plugin = pluginBackgroundGeolocation();
  if (!plugin) return;
  const botao = document.getElementById("btn-modo-viagem");

  viagemKmTotal = 0;
  viagemUltimaPosicao = null;
  viagemMunicipiosNovos = 0;
  viagemInicioEm = Date.now();
  viagemTrilha = [];
  viagemMunicipiosPercorridos = new Set();

  try {
    viagemWatcherId = await plugin.addWatcher(
      {
        backgroundTitle: "Desbrava — Modo Viagem ativo",
        backgroundMessage: "Registrando sua rota e checando municípios novos.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 150,
      },
      (posicao, erro) => {
        if (erro) {
          console.error("Modo Viagem:", erro);
          if (erro.code === "NOT_AUTHORIZED") pararModoViagem();
          return;
        }
        if (posicao) processarPosicaoModoViagem(posicao);
      }
    );
    viagemAtiva = true;
    botao?.classList.add("viagem-ativa");
    if (botao) botao.title = "Encerrar Modo Viagem";
  } catch (erro) {
    console.error("Falha ao iniciar Modo Viagem:", erro);
    alert("Não foi possível ligar o Modo Viagem. Confira se a permissão de localização foi concedida.");
  }
}

/**
 * Encerra o watcher e mostra o resultado do rolê. Quem é PRO
 * (souMembroMotoclube) recebe o resumo completo (distância, tempo,
 * municípios, opção de salvar o trajeto como rota e de gerar imagem
 * pra compartilhar) e tem a quilometragem somada sozinha ao odômetro
 * da Garagem, se houver moto cadastrada. Quem não é PRO continua
 * vendo só o toast simples de sempre -- o Modo Viagem em si (detectar
 * município) é gratuito pra todo mundo, só esses 3 extras é que são
 * PRO. Em ambos os casos, a lista de pendentes de raspagem abre no
 * final se houver algo novo.
 */
async function pararModoViagem() {
  const plugin = pluginBackgroundGeolocation();
  const botao = document.getElementById("btn-modo-viagem");
  if (plugin && viagemWatcherId) {
    try {
      await plugin.removeWatcher({ id: viagemWatcherId });
    } catch (erro) {
      console.error("Falha ao parar Modo Viagem:", erro);
    }
  }
  viagemWatcherId = null;
  viagemAtiva = false;
  botao?.classList.remove("viagem-ativa");
  if (botao) botao.title = "Modo Viagem";

  const stats = {
    km: viagemKmTotal,
    duracaoMs: Date.now() - (viagemInicioEm || Date.now()),
    municipiosNovos: viagemMunicipiosNovos,
    municipiosPercorridos: Array.from(viagemMunicipiosPercorridos),
    trilha: viagemTrilha,
  };

  localStorage.setItem(
    CHAVE_ULTIMA_VIAGEM,
    JSON.stringify({ km: stats.km, em: new Date().toISOString() })
  );

  if (souMembroMotoclube() && stats.km > 0) {
    abrirResumoViagem(stats);
    // Primeiro soma no odômetro da moto ativa (se houver), depois usa
    // o id devolvido pra já gravar o vínculo viagem->moto em
    // salvarResumoViagem (ver buscarViagensPorMoto, tela Estatísticas).
    window.raspadinhaAuth
      ?.somarOdometroGaragem(stats.km)
      .catch((erro) => {
        console.error("Falha ao somar odômetro da garagem:", erro);
        return null;
      })
      .then((motoId) =>
        window.raspadinhaAuth?.salvarResumoViagem({
          km: stats.km,
          duracaoMs: stats.duracaoMs,
          municipiosNovos: stats.municipiosNovos,
          motoId,
        })
      )
      .catch((erro) => console.error("Falha ao salvar resumo da viagem:", erro));
  } else {
    const km = stats.km.toFixed(1);
    mostrarToastOndeEstou(
      stats.municipiosNovos > 0
        ? `Rolê encerrado: ${km} km percorridos, ${stats.municipiosNovos} município(s) novo(s) detectado(s).`
        : `Rolê encerrado: ${km} km percorridos.`
    );
  }
  mostrarModalPendentesSeNecessario();
}

/** Callback do watcher: acumula km (haversine), guarda a trilha (só
 * usuário PRO, ver souMembroMotoclube) e confere se a posição caiu
 * num município ainda não raspado/confirmado. */
function processarPosicaoModoViagem(posicao) {
  const lat = posicao.latitude;
  const lon = posicao.longitude;

  if (viagemUltimaPosicao) {
    viagemKmTotal += distanciaEmKm(viagemUltimaPosicao.lat, viagemUltimaPosicao.lon, lat, lon);
  }
  viagemUltimaPosicao = { lat, lon };

  if (souMembroMotoclube()) {
    viagemTrilha.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
  }

  const id = encontrarMunicipioPorCoordenada(lon, lat);
  if (!id) return;
  viagemMunicipiosPercorridos.add(id);

  const novo = confirmarPresencaPorId(id);
  if (!novo) return;

  viagemMunicipiosNovos++;
  const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
  const nome = path?.dataset.nome;
  if (!nome) return;
  mostrarAvisoMunicipioDetectado(nome, () => {
    exigirLogin(() => {
      window.controleMapa?.focarEmMunicipio(id);
      setTimeout(() => abrirSeloPorId(id, nome), 650);
    });
  });
}

/** Mostra a lista de "raspagem pendente" se houver algum município com
 * presença confirmada por GPS ainda não raspado -- chamado na
 * inicialização do app e ao encerrar o Modo Viagem. */
function mostrarModalPendentesSeNecessario() {
  const lista = lerPendentesRaspagem().filter((id) => {
    const dados = estadoMapa[id];
    return dados?.presencaConfirmadaEm && !dados?.visitado;
  });
  if (!lista.length) return;
  renderizarListaPendentes(lista);
  document.getElementById("modal-municipios-pendentes")?.classList.remove("oculto");
}

function renderizarListaPendentes(lista) {
  const container = document.getElementById("municipios-pendentes-lista");
  if (!container) return;
  container.innerHTML = "";
  lista.forEach((id) => {
    const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
    const nome = path?.dataset.nome || `Município ${id}`;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "municipio-pendente-item";
    item.textContent = `📍 ${nome}`;
    item.addEventListener("click", () => {
      fecharModalPendentes();
      exigirLogin(() => {
        window.controleMapa?.focarEmMunicipio(id);
        setTimeout(() => abrirSeloPorId(id, nome), 650);
      });
    });
    container.appendChild(item);
  });
}

function fecharModalPendentes() {
  document.getElementById("modal-municipios-pendentes")?.classList.add("oculto");
}

/* ============================================================
   GARAGEM VIRTUAL (recurso PRO/Motoclube): até 3 motos por usuário
   (marca, modelo, apelido), com odômetro da moto ATIVA somado
   automaticamente pelo Modo Viagem (ver somarOdometroGaragem em
   pararModoViagem). Dado estritamente privado -- ver regra do
   Firestore no README -- nunca é exposto em perfil público, ranking
   ou comunidade. 3 abas: Criar nova / Editar / Estatísticas.
   ============================================================ */

let garagemMotos = [];
let garagemMotoAtivaId = null;
let garagemMotosCarregadas = false;

function configurarGaragem() {
  // A Garagem saiu do Menu: virou card do painel do Motoclube, que é
  // onde mora tudo do motociclista. Ter dois caminhos pra mesma tela só
  // duplicava manutenção.
  document.getElementById("btn-abrir-garagem")?.addEventListener("click", () => exigirLogin(abrirGaragem));

  ["select-garagem-marca"].forEach((idSelect) => {
    const select = document.getElementById(idSelect);
    if (!select) return;
    MARCAS_MOTOCLUBE.forEach((marca) => {
      const opt = document.createElement("option");
      opt.value = marca;
      opt.textContent = marca;
      select.appendChild(opt);
    });
  });

  document.getElementById("btn-garagem-voltar-lista")?.addEventListener("click", () => mostrarTelaGaragem("lista"));
  document.getElementById("btn-garagem-cancelar-form")?.addEventListener("click", () => mostrarTelaGaragem("lista"));
  document.getElementById("btn-editar-moto")?.addEventListener("click", () => abrirFormMoto(garagemMotoEmEdicao));
  /* O <form> dá Enter pra salvar e o botão "concluir" do teclado no
     celular -- mas o submit nativo recarregaria a página, então é
     interceptado aqui. */
  document.getElementById("garagem-form-campos")?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    salvarMotoDoForm();
  });
  document.getElementById("btn-definir-moto-ativa")?.addEventListener("click", definirMotoAtivaAtual);
  document.getElementById("btn-excluir-moto")?.addEventListener("click", excluirMotoAtual);
}

/* A Garagem ABRE pra qualquer um: quem não assina vê a tela e entende o
   que ganha. O paywall entra na hora de cadastrar a primeira moto. */
async function abrirGaragem() {
  if (!motoclubeEstaAberto()) await abrirMotoclube();
  await abrirFerramentaMotoclube("garagem");
}

function fecharGaragem() {
  fecharMotoclube();
}

/** Busca as motos (uma vez por abertura) e redesenha a lista. */
async function carregarMotosGaragem() {
  try {
    const { motos, motoAtivaId } = await window.raspadinhaAuth.buscarMotos();
    garagemMotos = motos;
    garagemMotoAtivaId = motoAtivaId;
    garagemMotosCarregadas = true;
    renderizarListaGaragem();
  } catch (erro) {
    console.error("Falha ao buscar motos da garagem:", erro);
  }
}

/* ---- Garagem: lista → detalhe ----

   Eram 3 abas (Nova / Editar / Estatísticas), o que obrigava a escolher
   a ABA antes de escolher a MOTO -- ao contrário de como se pensa. Agora
   abre na lista; tocar numa moto mostra os números dela e as ações; o
   "+" no canto cadastra outra.

   `garagemTela` diz onde estamos: "lista", "detalhe" ou "form". */
let garagemTela = "lista";
let garagemMotoEmEdicao = null;

function mostrarTelaGaragem(tela) {
  garagemTela = tela;
  const naLista = tela === "lista";
  document.getElementById("garagem-aviso-privacidade")?.classList.toggle("oculto", !naLista);
  document.getElementById("garagem-lista")?.classList.toggle("oculto", !naLista);
  document.getElementById("garagem-vazio")?.classList.toggle("oculto", !naLista || garagemMotos.length > 0);
  document.getElementById("garagem-detalhe")?.classList.toggle("oculto", tela !== "detalhe");
  document.getElementById("garagem-form")?.classList.toggle("oculto", tela !== "form");
}

const LIMITE_MOTOS_GARAGEM_UI = 3;

const ICONE_MOTO_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/>' +
  '<path d="M15 6a1 1 0 0 0 0 2h1.5l2.5 4"/><path d="M9 17.5h6.3L14 10H7l-1.5 4.5"/><path d="M9 6h4l1 3"/></svg>';

/**
 * Lista de motos. Cada uma é um "slot de garagem": quadrado escuro com
 * o contorno na cor da MARCA e o mesmo ícone de moto pra todas.
 *
 * As iniciais em texto ("HO", "RO") saíram: pareciam lista de contatos,
 * e a moto virava sigla. A cor por marca ficou -- é ela que deixa
 * reconhecer de relance, do mesmo jeito que o avatar de pessoa faz.
 */
function renderizarListaGaragem() {
  const lista = document.getElementById("garagem-lista");
  const vazio = document.getElementById("garagem-vazio");
  if (!lista) return;
  lista.innerHTML = "";

  garagemMotos.forEach((moto) => {
    const item = document.createElement("li");
    item.className = "garagem-moto";

    const slot = document.createElement("span");
    slot.className = "garagem-moto-slot";
    // A cor da marca entra como CONTORNO, não como fundo: fundo colorido
    // atrás de um ícone de traço fino come o desenho.
    slot.style.borderColor = corDaMarca(moto.marca);
    slot.style.color = corDaMarca(moto.marca);
    slot.innerHTML = ICONE_MOTO_SVG;

    const texto = document.createElement("span");
    texto.className = "garagem-moto-texto";
    const modelo = document.createElement("strong");
    modelo.className = "garagem-moto-modelo";
    modelo.textContent = moto.modelo || moto.marca;
    const sub = document.createElement("span");
    sub.className = "garagem-moto-sub";
    sub.textContent = moto.apelido ? `${moto.marca} · ${moto.apelido}` : moto.marca;
    texto.append(modelo, sub);

    item.append(slot, texto);

    if (moto.id === garagemMotoAtivaId) {
      const ativa = document.createElement("span");
      ativa.className = "garagem-moto-ativa";
      ativa.title = "Recebe a quilometragem do Modo Viagem";
      ativa.textContent = "⭐";
      item.appendChild(ativa);
    }

    const seta = document.createElement("span");
    seta.className = "garagem-moto-seta";
    seta.setAttribute("aria-hidden", "true");
    seta.textContent = "›";
    item.appendChild(seta);

    item.addEventListener("click", () => abrirDetalheMoto(moto.id));
    lista.appendChild(item);
  });

  /* "Vaga livre" no fim da lista, no lugar do "+" solto no canto: o
     card mostra QUANTAS vagas sobram, então o limite de 3 deixa de ser
     um aviso de erro depois do fato. Cheia, o card some. */
  if (garagemMotos.length < LIMITE_MOTOS_GARAGEM_UI) {
    const vaga = document.createElement("li");
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "garagem-vaga";
    const mais = document.createElement("span");
    mais.className = "garagem-vaga-mais";
    mais.textContent = "+";
    const rotulo = document.createElement("span");
    const restam = LIMITE_MOTOS_GARAGEM_UI - garagemMotos.length;
    rotulo.textContent = garagemMotos.length
      ? `Vaga livre — cabem mais ${restam}`
      : "Cadastrar minha primeira moto";
    botao.append(mais, rotulo);
    botao.addEventListener("click", () => abrirFormMoto(null));
    vaga.appendChild(botao);
    lista.appendChild(vaga);
  }

  lista.classList.remove("oculto");
  if (vazio) {
    vazio.textContent = garagemMotos.length
      ? ""
      : "Sua garagem está vazia. A moto cadastrada aqui é a que o app usa pra estimar o combustível dos Roteiros.";
    vazio.classList.toggle("oculto", garagemMotos.length > 0);
  }

  mostrarTelaGaragem("lista");
}

/** Cor estável por marca -- a mesma marca cai sempre no mesmo tom. */
function corDaMarca(marca) {
  let h = 0;
  for (const c of String(marca || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 52%)`;
}

/** Painel de instrumentos da moto escolhida. */
function abrirDetalheMoto(motoId) {
  const moto = garagemMotos.find((m) => m.id === motoId);
  if (!moto) return;
  garagemMotoEmEdicao = motoId;

  document.getElementById("garagem-detalhe-nome").textContent = moto.modelo || moto.marca;
  document.getElementById("garagem-detalhe-sub").textContent = moto.apelido
    ? `${moto.marca} · ${moto.apelido}`
    : moto.marca;
  document.getElementById("garagem-detalhe-ativa")?.classList.toggle("oculto", motoId !== garagemMotoAtivaId);

  document.getElementById("garagem-odometro-valor").textContent =
    Math.round(moto.odometroKm || 0).toLocaleString("pt-BR");
  document.getElementById("garagem-stats-viagens").textContent = moto.viagens || 0;

  /* O consumo diz de ONDE veio: informado pela pessoa ou deduzido da
     cilindrada. Sem isso, uma faixa larga pareceria imprecisão do app
     em vez do que é -- estimativa honesta na falta do número real. */
  const informado = Number(moto.consumoKmL);
  const faixa = faixaConsumoDaMoto(moto);
  const alvoConsumo = document.getElementById("garagem-stats-consumo");
  const origem = document.getElementById("garagem-consumo-origem");
  if (informado > 0) {
    alvoConsumo.textContent = `${informado}`;
    origem.textContent = "km/l · informado por você";
  } else if (faixa) {
    alvoConsumo.textContent = `${faixa.min}–${faixa.max}`;
    origem.textContent = `km/l · estimado (${faixa.cc} cc)`;
  } else {
    alvoConsumo.textContent = "—";
    origem.textContent = "informe no editar";
  }

  renderizarManutencao(moto);
  document.getElementById("btn-definir-moto-ativa")?.classList.toggle("oculto", motoId === garagemMotoAtivaId);
  mostrarTelaGaragem("detalhe");
}

/**
 * Manutenção da moto.
 *
 * NÃO existem itens de exemplo aqui de propósito. Escrever "Troca de
 * óleo: OK" numa moto que o app nunca viu é dizer à pessoa que a
 * manutenção dela está em dia -- e alguém pode acreditar. Enfeite de
 * tela não vale um risco desses. Enquanto não houver registro de
 * verdade, o bloco diz que não há nada e que o recurso vem depois.
 */
function renderizarManutencao(moto) {
  const lista = document.getElementById("garagem-manutencao-lista");
  const vazio = document.getElementById("garagem-manutencao-vazio");
  if (!lista) return;
  lista.innerHTML = "";

  const registros = Array.isArray(moto.manutencoes) ? moto.manutencoes : [];
  registros.forEach((r) => {
    const item = document.createElement("li");
    item.className = "garagem-manutencao-item";
    const marca = document.createElement("span");
    marca.className = "garagem-manutencao-marca";
    const nome = document.createElement("span");
    nome.textContent = r.tipo;
    const quando = document.createElement("span");
    quando.className = "garagem-manutencao-quando";
    quando.textContent = r.quando;
    item.append(marca, nome, quando);
    lista.appendChild(item);
  });

  vazio?.classList.toggle("oculto", registros.length > 0);
}

/** Formulário: `motoId` nulo cria, preenchido edita. */
function abrirFormMoto(motoId) {
  garagemMotoEmEdicao = motoId || null;
  const moto = motoId ? garagemMotos.find((m) => m.id === motoId) : null;

  document.getElementById("garagem-form-titulo").textContent = moto ? "Editar moto" : "Nova moto";
  document.getElementById("btn-salvar-moto").textContent = moto ? "Salvar alterações" : "Cadastrar moto";
  document.getElementById("select-garagem-marca").value = moto?.marca || MARCAS_MOTOCLUBE[0];
  document.getElementById("input-garagem-modelo").value = moto?.modelo || "";
  document.getElementById("input-garagem-apelido").value = moto?.apelido || "";
  document.getElementById("input-garagem-consumo").value = moto?.consumoKmL || "";
  document.getElementById("garagem-form-erro").classList.add("oculto");
  // Excluir só existe editando: no cadastro não há o que excluir, e o
  // botão ali seria um alvo vermelho sem função.
  document.getElementById("btn-excluir-moto")?.classList.toggle("oculto", !moto);

  mostrarTelaGaragem("form");
}

/** Salva -- cria ou atualiza, conforme de onde o formulário foi aberto. */
async function salvarMotoDoForm() {
  const botao = document.getElementById("btn-salvar-moto");
  const erro = document.getElementById("garagem-form-erro");
  const dados = {
    marca: document.getElementById("select-garagem-marca").value,
    modelo: document.getElementById("input-garagem-modelo").value,
    apelido: document.getElementById("input-garagem-apelido").value,
    consumoKmL: document.getElementById("input-garagem-consumo").value,
  };

  botao.disabled = true;
  erro.classList.add("oculto");
  try {
    if (garagemMotoEmEdicao) await window.raspadinhaAuth.atualizarMoto(garagemMotoEmEdicao, dados);
    else await window.raspadinhaAuth.criarMoto(dados);
    await carregarMotosGaragem();
    mostrarTelaGaragem("lista");
  } catch (e) {
    erro.textContent = e?.message || "Não foi possível salvar agora.";
    erro.classList.remove("oculto");
  } finally {
    botao.disabled = false;
  }
}

async function excluirMotoAtual() {
  if (!garagemMotoEmEdicao) return;
  const moto = garagemMotos.find((m) => m.id === garagemMotoEmEdicao);
  if (!confirm(`Excluir a ${moto?.modelo || "moto"}? Essa ação não pode ser desfeita.`)) return;
  try {
    await window.raspadinhaAuth.excluirMoto(garagemMotoEmEdicao);
    garagemMotoEmEdicao = null;
    await carregarMotosGaragem();
  } catch (e) {
    alert(e?.message || "Não foi possível excluir agora.");
  }
}

async function definirMotoAtivaAtual() {
  if (!garagemMotoEmEdicao) return;
  try {
    await window.raspadinhaAuth.definirMotoAtiva(garagemMotoEmEdicao);
    await carregarMotosGaragem();
    abrirDetalheMoto(garagemMotoEmEdicao);
  } catch (e) {
    alert(e?.message || "Não foi possível definir agora.");
  }
}

function formatarDataCurta(valor) {
  const d = valor?.toDate ? valor.toDate() : new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}


/* ============================================================
   RESUMO DA VIAGEM (recurso PRO/Motoclube): tela de estatísticas ao
   encerrar o Modo Viagem, com opção de salvar o trajeto como rota
   personalizada e de gerar uma imagem pra compartilhar (ver bloco de
   canvas mais abaixo). Guarda o stats da última viagem encerrada em
   `viagemStatsAtual` -- é o que a tela de compartilhar usa pra montar
   o texto do cartão.
   ============================================================ */
let viagemStatsAtual = null;

function configurarResumoViagem() {
  document.getElementById("btn-fechar-resumo-viagem")?.addEventListener("click", fecharResumoViagem);
  document.getElementById("btn-resumo-fechar-viagem")?.addEventListener("click", fecharResumoViagem);
  document.getElementById("modal-resumo-viagem")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-resumo-viagem") fecharResumoViagem();
  });
  document.getElementById("btn-resumo-salvar-rota")?.addEventListener("click", usarTrilhaNaNovaRota);
  document.getElementById("btn-resumo-compartilhar")?.addEventListener("click", () => {
    fecharResumoViagem();
    abrirCompartilharViagem();
  });
}

function formatarDuracaoViagem(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  return restoMin ? `${h}h${String(restoMin).padStart(2, "0")}` : `${h}h`;
}

function abrirResumoViagem(stats) {
  viagemStatsAtual = stats;
  document.getElementById("resumo-viagem-km").textContent = `${stats.km.toFixed(1)} km`;
  document.getElementById("resumo-viagem-tempo").textContent = formatarDuracaoViagem(stats.duracaoMs);
  document.getElementById("resumo-viagem-municipios").textContent = String(stats.municipiosNovos);

  const avisoOdometro = document.getElementById("resumo-viagem-odometro-aviso");
  avisoOdometro.textContent = "🏠 Quilometragem somada ao odômetro da sua Garagem (se você já tem uma moto cadastrada).";
  avisoOdometro.classList.remove("oculto");

  document
    .getElementById("btn-resumo-salvar-rota")
    .classList.toggle("oculto", stats.municipiosPercorridos.length < 2);

  document.getElementById("modal-resumo-viagem").classList.remove("oculto");
}

function fecharResumoViagem() {
  document.getElementById("modal-resumo-viagem")?.classList.add("oculto");
}

/**
 * "Salvar trajeto como rota": pré-preenche o formulário de rota
 * personalizada (já existente) com os municípios da viagem e anexa a
 * trilha (coordenadas reais) num campo à parte -- ver
 * salvarRotaPersonalizada, que lê `viagemTrilhaPendenteParaRota`.
 * Salva como PRIVADA por padrão (o usuário decide publicar depois).
 */
function usarTrilhaNaNovaRota() {
  if (!viagemStatsAtual) return;
  fecharResumoViagem();
  municipiosEscolhidosNaRota = new Set(viagemStatsAtual.municipiosPercorridos);
  viagemTrilhaPendenteParaRota = viagemStatsAtual.trilha;
  document.getElementById("input-nome-rota").value = "";
  document.getElementById("input-descricao-rota").value = "Trajeto registrado pelo Modo Viagem.";
  document.getElementById("input-filtro-municipios-rota").value = "";
  document.getElementById("criar-rota-erro").classList.add("oculto");
  renderizarListaMunicipiosParaEscolher("");
  document.getElementById("modal-criar-rota").classList.remove("oculto");
}

/* ============================================================
   COMPARTILHAR VIAGEM (recurso PRO/Motoclube): gera uma imagem
   (canvas) com as estatísticas do rolê -- opção A (cartão do app) ou
   opção B (por cima de uma foto escolhida no aparelho) -- pra postar
   na Comunidade ou compartilhar fora do app (Web Share API).
   Reaproveita criarPost (mesma função dos posts normais, que já sobe
   a foto pro Drive -- ver subirFotoPostParaDrive em auth.js).
   ============================================================ */
let compartilharViagemOpcao = "a";
let compartilharViagemFotoFile = null;

function configurarCompartilharViagem() {
  document.getElementById("btn-fechar-compartilhar-viagem")?.addEventListener("click", fecharCompartilharViagem);
  document.getElementById("modal-compartilhar-viagem")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-compartilhar-viagem") fecharCompartilharViagem();
  });
  document.getElementById("btn-cv-opcao-a")?.addEventListener("click", () => selecionarOpcaoCompartilharViagem("a"));
  document.getElementById("btn-cv-opcao-b")?.addEventListener("click", () => selecionarOpcaoCompartilharViagem("b"));
  document.getElementById("input-cv-foto")?.addEventListener("change", (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    compartilharViagemFotoFile = arquivo;
    atualizarPreviaCompartilharViagem();
  });
  document.getElementById("btn-cv-postar-comunidade")?.addEventListener("click", postarResumoViagemNaComunidade);
  document
    .getElementById("btn-cv-compartilhar-externo")
    ?.addEventListener("click", compartilharResumoViagemExternamente);
}

function abrirCompartilharViagem() {
  if (!viagemStatsAtual) return;
  compartilharViagemOpcao = "a";
  compartilharViagemFotoFile = null;
  document.getElementById("btn-cv-opcao-a")?.classList.add("cv-opcao-ativa");
  document.getElementById("btn-cv-opcao-b")?.classList.remove("cv-opcao-ativa");
  document.getElementById("compartilhar-viagem-erro")?.classList.add("oculto");
  document.getElementById("modal-compartilhar-viagem")?.classList.remove("oculto");
  atualizarPreviaCompartilharViagem();
}

function fecharCompartilharViagem() {
  document.getElementById("modal-compartilhar-viagem")?.classList.add("oculto");
}

/** Trocar pra "Minha foto" já abre o seletor de arquivo -- a própria
 * escolha (evento "change") atualiza a prévia depois. */
function selecionarOpcaoCompartilharViagem(opcao) {
  compartilharViagemOpcao = opcao;
  document.getElementById("btn-cv-opcao-a")?.classList.toggle("cv-opcao-ativa", opcao === "a");
  document.getElementById("btn-cv-opcao-b")?.classList.toggle("cv-opcao-ativa", opcao === "b");
  if (opcao === "b" && !compartilharViagemFotoFile) {
    document.getElementById("input-cv-foto")?.click();
    return;
  }
  atualizarPreviaCompartilharViagem();
}

async function atualizarPreviaCompartilharViagem() {
  const canvas = document.getElementById("canvas-compartilhar-viagem");
  if (!canvas || !viagemStatsAtual) return;
  try {
    await desenharResumoViagemNoCanvas(
      canvas,
      viagemStatsAtual,
      compartilharViagemOpcao === "b" ? compartilharViagemFotoFile : null
    );
  } catch (erro) {
    console.error("Falha ao gerar imagem do resumo:", erro);
  }
}

/**
 * Opção A: gradiente do app. Opção B: a foto escolhida (cover-fit) com
 * um degradê escuro embaixo pra garantir contraste. Em cima, sempre o
 * mesmo texto branco com sombra (funciona nas duas opções).
 */
async function desenharResumoViagemNoCanvas(canvas, stats, fotoFile) {
  const largura = canvas.width;
  const altura = canvas.height;
  const ctx = canvas.getContext("2d");

  if (fotoFile) {
    const img = await carregarImagemDeArquivo(fotoFile);
    desenharImagemCover(ctx, img, largura, altura);
    const escurecer = ctx.createLinearGradient(0, altura * 0.35, 0, altura);
    escurecer.addColorStop(0, "rgba(15, 18, 22, 0)");
    escurecer.addColorStop(1, "rgba(15, 18, 22, 0.88)");
    ctx.fillStyle = escurecer;
    ctx.fillRect(0, 0, largura, altura);
  } else {
    const gradiente = ctx.createLinearGradient(0, 0, 0, altura);
    gradiente.addColorStop(0, "#1e293b");
    gradiente.addColorStop(1, "#0f172a");
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, largura, altura);
  }

  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 14;

  ctx.fillStyle = "#2BD576";
  ctx.font = `bold ${Math.round(largura * 0.037)}px system-ui, sans-serif`;
  ctx.fillText("🏍️ ROLÊ DESBRAVA", largura / 2, altura * 0.7);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(largura * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(`${stats.km.toFixed(1)} km`, largura / 2, altura * 0.79);

  ctx.font = `600 ${Math.round(largura * 0.03)}px system-ui, sans-serif`;
  ctx.fillText(
    `${formatarDuracaoViagem(stats.duracaoMs)} · ${stats.municipiosNovos} município(s) desbravado(s)`,
    largura / 2,
    altura * 0.85
  );

  ctx.shadowBlur = 0;
  ctx.font = `${Math.round(largura * 0.018)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText("Desbrava · raspe o mapa do Rio de Janeiro", largura / 2, altura * 0.95);
}

/** Lê um File escolhido no <input type=file> como um HTMLImageElement
 * pronto pra desenhar no canvas. */
function carregarImagemDeArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir essa foto."));
    };
    img.src = url;
  });
}

/** Desenha uma imagem preenchendo todo o retângulo mantendo a
 * proporção e cortando o excesso -- mesmo efeito de
 * "background-size: cover" em CSS, só que no canvas. */
function desenharImagemCover(ctx, img, largura, altura) {
  const escala = Math.max(largura / img.width, altura / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  const x = (largura - w) / 2;
  const y = (altura - h) / 2;
  ctx.drawImage(img, x, y, w, h);
}

/** Botão "Postar na Comunidade": gera a imagem final do canvas e
 * reaproveita criarPost (mesmo fluxo dos posts normais, sobe a foto
 * pro Drive). */
async function postarResumoViagemNaComunidade() {
  if (!viagemStatsAtual) return;
  const botao = document.getElementById("btn-cv-postar-comunidade");
  const erroEl = document.getElementById("compartilhar-viagem-erro");
  erroEl.classList.add("oculto");
  botao.disabled = true;
  botao.textContent = "Postando...";
  try {
    const canvas = document.getElementById("canvas-compartilhar-viagem");
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const arquivo = new File([blob], "role-desbrava.png", { type: "image/png" });
    await window.raspadinhaAuth.criarPost({
      arquivoFoto: arquivo,
      texto: `Rolê de ${viagemStatsAtual.km.toFixed(1)} km, ${viagemStatsAtual.municipiosNovos} município(s) desbravado(s)! 🏍️`,
    });
    fecharCompartilharViagem();
    alert("Rolê compartilhado na Comunidade! 🎉");
  } catch (erro) {
    erroEl.textContent = erro.message || "Não foi possível postar agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.textContent = "Postar na Comunidade";
  }
}

/** Botão "Compartilhar": Web Share API com a imagem como arquivo
 * (funciona direto pro WhatsApp/Instagram Stories no celular); sem
 * suporte (ex: desktop), baixa a imagem em vez de travar. */
async function compartilharResumoViagemExternamente() {
  const canvas = document.getElementById("canvas-compartilhar-viagem");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const arquivo = new File([blob], "role-desbrava.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [arquivo] })) {
    navigator.share({ files: [arquivo], title: "Desbrava", text: "Olha meu rolê no Desbrava! 🏍️" }).catch(() => {});
    return;
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "role-desbrava.png";
  link.click();
}

/* ============================================================
   LOJA DESBRAVA: e-commerce gamificado, SEM gateway de pagamento real
   por enquanto -- confirmarPedidoLoja só registra o pedido no
   Firestore (ver criarPedido em js/auth.js), não cobra nada de
   verdade. Produto "ativo" com municípios da regraDesbloqueio ainda
   não raspados (ver estaVerificado) aparece em silhueta na vitrine.
   Membro do Motoclube (souMembroMotoclube) ganha 1 voucher por mês,
   não cumulativo (ver ultimoMesUsoVoucher em usuarios/{uid}), no
   MESMO valor da assinatura (VALOR_VOUCHER_MOTOCLUBE).
   ============================================================ */

let lojaProdutos = [];
let lojaAbaAtual = "fisico";
let lojaProdutoSelecionadoCheckout = null;
let lojaFreteCalculado = null; // { valor, uf } ou null se ainda não calculado

function configurarLoja() {
  document.getElementById("btn-abrir-loja")?.addEventListener("click", abrirLoja);
  document.getElementById("btn-fechar-loja")?.addEventListener("click", fecharLoja);
  document.getElementById("modal-loja")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-loja") fecharLoja();
  });
  document.querySelectorAll("#loja-abas .loja-aba").forEach((botao) => {
    botao.addEventListener("click", () => mudarAbaLoja(botao.dataset.tipo));
  });

  document.getElementById("btn-fechar-checkout-loja")?.addEventListener("click", fecharCheckoutLoja);
  document.getElementById("modal-checkout-loja")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-checkout-loja") fecharCheckoutLoja();
  });
  document.getElementById("btn-calcular-frete")?.addEventListener("click", calcularFreteClick);
  document.getElementById("check-checkout-voucher")?.addEventListener("change", atualizarResumoCheckout);
  document.getElementById("btn-confirmar-pedido-loja")?.addEventListener("click", confirmarPedidoLoja);
}

async function abrirLoja() {
  document.getElementById("modal-loja")?.classList.remove("oculto");
  atualizarBannerVoucherLoja();

  /* A Loja é do estado ativo: os produtos se desbloqueiam por município
     (regraDesbloqueio), e todos os cadastrados hoje apontam pro RJ. Num
     estado sem catálogo, a grade sairia vazia sem explicação. */
  if (emEstadoLimitado()) {
    avisarConteudoEmDesenvolvimento(document.getElementById("loja-grade"), "Loja");
    return;
  }

  document.getElementById("loja-grade").innerHTML = '<div class="spinner"></div>';
  try {
    lojaProdutos = await window.raspadinhaAuth.buscarProdutos();
  } catch (erro) {
    console.error("Falha ao buscar produtos da loja:", erro);
    lojaProdutos = [];
  }
  renderizarLoja();
}

function fecharLoja() {
  document.getElementById("modal-loja")?.classList.add("oculto");
}

/** Verdadeiro só se a pessoa é membro do Motoclube E ainda não usou o
 * voucher deste mês (ver window.raspadinhaAuth.ultimoMesUsoVoucher,
 * populado no login e atualizado por usarVoucherMotoclube). */
function voucherDisponivelAgora() {
  if (!souMembroMotoclube()) return false;
  const mesAtual = new Date().toISOString().slice(0, 7);
  return window.raspadinhaAuth?.ultimoMesUsoVoucher !== mesAtual;
}

/** Escreve o valor do voucher nos dois textos da Loja. Vem do JS pra
 *  não voltar a divergir do desconto aplicado no checkout. */
function atualizarTextosVoucher() {
  const valor = formatarReais(VALOR_VOUCHER_MOTOCLUBE);
  const banner = document.getElementById("loja-voucher-banner");
  if (banner) banner.textContent = `🎁 Seu Voucher Mensal de ${valor} está disponível!`;
  const label = document.getElementById("texto-checkout-voucher");
  if (label) label.textContent = `🎁 Usar meu Voucher Mensal (${valor})`;
}

function atualizarBannerVoucherLoja() {
  atualizarTextosVoucher();
  document.getElementById("loja-voucher-banner")?.classList.toggle("oculto", !voucherDisponivelAgora());
}

function mudarAbaLoja(tipo) {
  lojaAbaAtual = tipo;
  document.querySelectorAll("#loja-abas .loja-aba").forEach((b) => {
    b.classList.toggle("loja-aba-ativa", b.dataset.tipo === tipo);
  });
  renderizarLoja();
}

function formatarReais(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function renderizarLoja() {
  const grade = document.getElementById("loja-grade");
  const produtosDaAba = lojaProdutos.filter((p) => p.tipo === lojaAbaAtual);
  grade.innerHTML = "";
  document.getElementById("loja-vazio")?.classList.toggle("oculto", produtosDaAba.length > 0);
  produtosDaAba.forEach((produto) => grade.appendChild(montarCardProduto(produto)));
}

/** Nomes dos municípios que faltam pra desbloquear um produto (vazio
 * se já está tudo desbloqueado ou o produto não tem regra nenhuma). */
function municipiosFaltantes(produto) {
  return (produto.regraDesbloqueio || [])
    .filter((id) => !estaVerificado(id))
    .map((id) => document.querySelector(`#mapa-rj [data-municipio="${id}"]`)?.dataset.nome || id);
}

function montarCardProduto(produto) {
  const faltam = municipiosFaltantes(produto);
  const bloqueado = produto.status === "ativo" && faltam.length > 0;
  const emBreve = produto.status === "em_breve";

  const card = document.createElement("div");
  card.className = "loja-card";
  if (bloqueado) card.classList.add("loja-card-tem-bloqueio");

  const imgWrap = document.createElement("div");
  imgWrap.className = "loja-card-imagem-wrap";
  const img = document.createElement("img");
  img.className = "loja-card-imagem";
  if (bloqueado) img.classList.add("loja-card-bloqueado");
  img.src = produto.imagemUrl || "assets/icons/desbrava-icone.png";
  img.alt = produto.nome;
  imgWrap.appendChild(img);

  if (bloqueado) {
    const cadeado = document.createElement("div");
    cadeado.className = "loja-card-cadeado";
    cadeado.textContent = "🔒";
    imgWrap.appendChild(cadeado);
  }
  if (emBreve) {
    const selo = document.createElement("span");
    selo.className = "loja-card-selo-em-breve";
    selo.textContent = "EM BREVE";
    imgWrap.appendChild(selo);
  }
  card.appendChild(imgWrap);

  const corpo = document.createElement("div");
  corpo.className = "loja-card-corpo";

  const nome = document.createElement("div");
  nome.className = "loja-card-nome";
  nome.textContent = produto.nome;
  corpo.appendChild(nome);

  if (!emBreve) {
    const preco = document.createElement("div");
    preco.className = "loja-card-preco";
    preco.textContent = formatarReais(produto.valorBase);
    corpo.appendChild(preco);
  }

  if (bloqueado) {
    const texto = document.createElement("p");
    texto.className = "loja-card-desbloqueio-texto";
    texto.textContent = `Desbrave o município de ${faltam.join(", ")} para liberar`;
    corpo.appendChild(texto);
  }

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "loja-card-btn-comprar";
  if (emBreve) {
    botao.textContent = "Em breve";
    botao.disabled = true;
  } else if (bloqueado) {
    botao.textContent = "🔒 Bloqueado";
    botao.disabled = true;
  } else if (produto.estoque <= 0) {
    botao.textContent = "Esgotado";
    botao.disabled = true;
  } else {
    botao.textContent = "Comprar";
    botao.addEventListener("click", () => abrirCheckoutLoja(produto));
  }
  corpo.appendChild(botao);

  card.appendChild(corpo);
  return card;
}

function abrirCheckoutLoja(produto) {
  /* Navegar na Loja é livre; COMPRAR não. O pedido é gravado no
     Firestore em nome de um usuário (ver criarPedido em js/auth.js) --
     sem conta não há em nome de quem, nem pra onde mandar. O gate saiu
     da porta da Loja e ficou aqui, que é onde ele significa algo. */
  if (!window.raspadinhaAuth?.usuarioAtual) {
    abrirTelaLogin();
    return;
  }
  lojaProdutoSelecionadoCheckout = produto;
  lojaFreteCalculado = produto.tipo === "digital" ? { valor: 0, uf: null } : null;

  document.getElementById("checkout-loja-nome-produto").textContent = produto.nome;
  document.getElementById("checkout-loja-cep-bloco")?.classList.toggle("oculto", produto.tipo === "digital");
  document.getElementById("checkout-loja-frete-status")?.classList.add("oculto");
  document.getElementById("input-checkout-cep").value = "";
  document.getElementById("checkout-loja-erro")?.classList.add("oculto");

  const podeUsarVoucher = voucherDisponivelAgora();
  document.getElementById("label-checkout-voucher")?.classList.toggle("oculto", !podeUsarVoucher);
  document.getElementById("check-checkout-voucher").checked = podeUsarVoucher;

  atualizarResumoCheckout();
  document.getElementById("modal-checkout-loja")?.classList.remove("oculto");
}

function fecharCheckoutLoja() {
  document.getElementById("modal-checkout-loja")?.classList.add("oculto");
}

/**
 * Frete mockado (sem transportadora de verdade): digital é sempre
 * grátis; físico consulta o CEP no ViaCEP só pra saber a UF -- RJ sai
 * mais barato (R$15), qualquer outro estado R$35.
 */
async function calcularFrete(cep, tipoProduto) {
  if (tipoProduto === "digital") return { valor: 0, uf: null };

  const cepLimpo = (cep || "").replace(/\D/g, "");
  if (cepLimpo.length !== 8) throw new Error("Digite um CEP válido (8 dígitos).");

  const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
  const dados = await resposta.json();
  if (dados.erro) throw new Error("CEP não encontrado.");

  const valor = dados.uf === "RJ" ? 15 : 35;
  return { valor, uf: dados.uf, cidade: dados.localidade };
}

async function calcularFreteClick() {
  const botao = document.getElementById("btn-calcular-frete");
  const status = document.getElementById("checkout-loja-frete-status");
  const cep = document.getElementById("input-checkout-cep").value;

  botao.disabled = true;
  botao.textContent = "Calculando...";
  status.classList.remove("oculto");
  status.textContent = "Consultando o CEP...";
  try {
    lojaFreteCalculado = await calcularFrete(cep, lojaProdutoSelecionadoCheckout.tipo);
    status.textContent = lojaFreteCalculado.cidade
      ? `Entrega em ${lojaFreteCalculado.cidade}/${lojaFreteCalculado.uf}.`
      : "Frete calculado.";
  } catch (erro) {
    lojaFreteCalculado = null;
    status.textContent = erro.message || "Não foi possível calcular o frete agora.";
  } finally {
    botao.disabled = false;
    botao.textContent = "Calcular frete";
    atualizarResumoCheckout();
  }
}

function atualizarResumoCheckout() {
  const produto = lojaProdutoSelecionadoCheckout;
  if (!produto) return;

  const usarVoucher = voucherDisponivelAgora() && document.getElementById("check-checkout-voucher").checked;
  const valorVoucher = usarVoucher ? Math.min(VALOR_VOUCHER_MOTOCLUBE, produto.valorBase) : 0;
  const frete = lojaFreteCalculado?.valor ?? 0;
  const total = Math.max(0, produto.valorBase - valorVoucher) + frete;

  document.getElementById("checkout-resumo-base").textContent = formatarReais(produto.valorBase);
  document.getElementById("checkout-linha-voucher")?.classList.toggle("oculto", !usarVoucher);
  document.getElementById("checkout-resumo-voucher").textContent = `- ${formatarReais(valorVoucher)}`;
  document.getElementById("checkout-resumo-frete").textContent = formatarReais(frete);
  document.getElementById("checkout-resumo-total").textContent = formatarReais(total);

  // Físico exige frete calculado antes de liberar o botão -- digital
  // já nasce com frete zero (ver abrirCheckoutLoja), nunca trava.
  const btnConfirmar = document.getElementById("btn-confirmar-pedido-loja");
  if (btnConfirmar) btnConfirmar.disabled = !lojaFreteCalculado;
}

async function confirmarPedidoLoja() {
  const produto = lojaProdutoSelecionadoCheckout;
  if (!produto || !lojaFreteCalculado) return;
  const erroEl = document.getElementById("checkout-loja-erro");
  erroEl.classList.add("oculto");
  const botao = document.getElementById("btn-confirmar-pedido-loja");
  botao.disabled = true;
  botao.textContent = "Confirmando...";

  const usarVoucher = voucherDisponivelAgora() && document.getElementById("check-checkout-voucher").checked;
  const valorVoucher = usarVoucher ? Math.min(VALOR_VOUCHER_MOTOCLUBE, produto.valorBase) : 0;
  const total = Math.max(0, produto.valorBase - valorVoucher) + lojaFreteCalculado.valor;

  try {
    await window.raspadinhaAuth.criarPedido({
      produtoId: produto.id,
      produtoNome: produto.nome,
      tipoProduto: produto.tipo,
      valorBase: produto.valorBase,
      valorVoucherAplicado: valorVoucher,
      valorFrete: lojaFreteCalculado.valor,
      valorTotal: total,
      cep: produto.tipo === "digital" ? null : document.getElementById("input-checkout-cep").value,
      uf: lojaFreteCalculado.uf,
    });
    if (usarVoucher) await window.raspadinhaAuth.usarVoucherMotoclube();

    fecharCheckoutLoja();
    atualizarBannerVoucherLoja();
    alert("Pedido registrado! A gente combina envio/pagamento por fora em breve. 🎉");
  } catch (erro) {
    erroEl.textContent = erro.message || "Não foi possível registrar o pedido agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.textContent = "Confirmar pedido";
  }
}

/* ---- Painel de Admin da Loja ---- */

let produtosAdminCache = [];
let produtoEditandoId = null;
let municipiosEscolhidosProduto = new Set();

// Municípios usados pelo botão "Popular com os 3 produtos de exemplo"
// (ver popularProdutosExemploClick) -- mesmos ids de data/rotas.json
// (povos-goytacazes) e do SVG do mapa (Niterói).
const IDS_ROTA_GOYTACAZES_LOJA = [
  "3301009", "3305000", "3304755", "3302403", "3304151", "3300936", "3301405", "3301157", "3304524",
];
const ID_NITEROI_LOJA = "3303302";

function configurarLojaAdmin() {
  document.getElementById("btn-popular-produtos-exemplo")?.addEventListener("click", popularProdutosExemploClick);
  document.getElementById("btn-salvar-produto-admin")?.addEventListener("click", salvarProdutoAdmin);
  document.getElementById("btn-cancelar-edicao-produto-admin")?.addEventListener("click", limparFormularioProdutoAdmin);
  document.getElementById("input-loja-admin-filtro-municipios")?.addEventListener("input", (e) => {
    renderizarListaMunicipiosProduto(e.target.value);
  });
  renderizarListaMunicipiosProduto("");
}

async function carregarProdutosAdmin() {
  const lista = document.getElementById("loja-admin-lista");
  if (!lista) return;
  lista.innerHTML = '<div class="spinner"></div>';
  try {
    produtosAdminCache = await window.raspadinhaAuth.buscarTodosProdutosAdmin();
  } catch (erro) {
    console.error("Falha ao buscar produtos (admin):", erro);
    produtosAdminCache = [];
  }
  renderizarListaProdutosAdmin();
}

const LABEL_STATUS_PRODUTO = { oculto: "Oculto", em_breve: "Em breve", ativo: "Ativo" };

function renderizarListaProdutosAdmin() {
  const lista = document.getElementById("loja-admin-lista");
  if (!lista) return;
  lista.innerHTML = "";
  produtosAdminCache.forEach((produto) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "loja-admin-item";

    const info = document.createElement("div");
    info.className = "loja-admin-item-info";
    const nome = document.createElement("span");
    nome.className = "loja-admin-item-nome";
    nome.textContent = produto.nome;
    info.appendChild(nome);
    item.appendChild(info);

    const status = document.createElement("span");
    status.className = `loja-admin-item-status loja-admin-item-status-${produto.status}`;
    status.textContent = LABEL_STATUS_PRODUTO[produto.status] || produto.status;
    item.appendChild(status);

    item.addEventListener("click", () => abrirEdicaoProdutoAdmin(produto));
    lista.appendChild(item);
  });
}

/** Mesmo padrão de renderizarListaMunicipiosParaEscolher (rotas
 * personalizadas), só que escreve em municipiosEscolhidosProduto. */
function renderizarListaMunicipiosProduto(filtro) {
  const lista = document.getElementById("loja-admin-lista-municipios");
  if (!lista) return;
  lista.innerHTML = "";
  const filtroLower = (filtro || "").trim().toLowerCase();

  const municipios = Array.from(document.querySelectorAll("#mapa-rj .municipio"))
    .map((path) => ({ id: path.dataset.municipio, nome: path.dataset.nome }))
    .filter((m, indice, todos) => todos.findIndex((x) => x.id === m.id) === indice)
    .filter((m) => !filtroLower || m.nome.toLowerCase().includes(filtroLower))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  municipios.forEach((m) => {
    const item = document.createElement("label");
    item.className = "criar-rota-municipio-item";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = municipiosEscolhidosProduto.has(m.id);
    check.addEventListener("change", () => {
      if (check.checked) municipiosEscolhidosProduto.add(m.id);
      else municipiosEscolhidosProduto.delete(m.id);
      atualizarContadorMunicipiosProduto();
    });
    const texto = document.createElement("span");
    texto.textContent = m.nome;
    item.append(check, texto);
    lista.appendChild(item);
  });
  atualizarContadorMunicipiosProduto();
}

function atualizarContadorMunicipiosProduto() {
  const n = municipiosEscolhidosProduto.size;
  document.getElementById("loja-admin-contador-municipios").textContent =
    n === 0 ? "0 municípios selecionados (liberado pra todos)" : `${n} município${n === 1 ? "" : "s"} selecionado${n === 1 ? "" : "s"}`;
}

function abrirEdicaoProdutoAdmin(produto) {
  produtoEditandoId = produto.id;
  document.getElementById("loja-admin-form-titulo").textContent = `Editar: ${produto.nome}`;
  document.getElementById("input-loja-admin-nome").value = produto.nome || "";
  document.getElementById("input-loja-admin-descricao").value = produto.descricao || "";
  document.getElementById("input-loja-admin-imagem").value = produto.imagemUrl || "";
  document.getElementById("select-loja-admin-tipo").value = produto.tipo || "fisico";
  document.getElementById("input-loja-admin-estoque").value = produto.estoque ?? 0;
  document.getElementById("input-loja-admin-valor").value = produto.valorBase ?? 0;
  document.getElementById("select-loja-admin-status").value = produto.status || "oculto";
  municipiosEscolhidosProduto = new Set(produto.regraDesbloqueio || []);
  document.getElementById("input-loja-admin-filtro-municipios").value = "";
  renderizarListaMunicipiosProduto("");
  document.getElementById("loja-admin-erro")?.classList.add("oculto");
  document.getElementById("btn-cancelar-edicao-produto-admin")?.classList.remove("oculto");
}

function limparFormularioProdutoAdmin() {
  produtoEditandoId = null;
  document.getElementById("loja-admin-form-titulo").textContent = "+ Novo produto";
  document.getElementById("input-loja-admin-nome").value = "";
  document.getElementById("input-loja-admin-descricao").value = "";
  document.getElementById("input-loja-admin-imagem").value = "";
  document.getElementById("select-loja-admin-tipo").value = "fisico";
  document.getElementById("input-loja-admin-estoque").value = "";
  document.getElementById("input-loja-admin-valor").value = "";
  document.getElementById("select-loja-admin-status").value = "oculto";
  municipiosEscolhidosProduto = new Set();
  document.getElementById("input-loja-admin-filtro-municipios").value = "";
  renderizarListaMunicipiosProduto("");
  document.getElementById("loja-admin-erro")?.classList.add("oculto");
  document.getElementById("btn-cancelar-edicao-produto-admin")?.classList.add("oculto");
}

async function salvarProdutoAdmin() {
  const erroEl = document.getElementById("loja-admin-erro");
  erroEl.classList.add("oculto");
  const dados = {
    nome: document.getElementById("input-loja-admin-nome").value,
    descricao: document.getElementById("input-loja-admin-descricao").value,
    imagemUrl: document.getElementById("input-loja-admin-imagem").value,
    tipo: document.getElementById("select-loja-admin-tipo").value,
    estoque: document.getElementById("input-loja-admin-estoque").value,
    valorBase: document.getElementById("input-loja-admin-valor").value,
    status: document.getElementById("select-loja-admin-status").value,
    regraDesbloqueio: Array.from(municipiosEscolhidosProduto),
  };
  if (!dados.nome.trim()) {
    erroEl.textContent = "Dê um nome pro produto.";
    erroEl.classList.remove("oculto");
    return;
  }

  const botao = document.getElementById("btn-salvar-produto-admin");
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    if (produtoEditandoId) await window.raspadinhaAuth.atualizarProduto(produtoEditandoId, dados);
    else await window.raspadinhaAuth.criarProduto(dados);
    limparFormularioProdutoAdmin();
    await carregarProdutosAdmin();
  } catch (erro) {
    erroEl.textContent = erro.message || "Não foi possível salvar agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar produto";
  }
}

async function popularProdutosExemploClick() {
  if (!confirm("Criar os 3 produtos de exemplo agora? Se já rodou antes, isso cria outros 3 (duplicados).")) return;
  const botao = document.getElementById("btn-popular-produtos-exemplo");
  botao.disabled = true;
  botao.textContent = "Criando...";
  try {
    await window.raspadinhaAuth.popularProdutosExemplo(IDS_ROTA_GOYTACAZES_LOJA, ID_NITEROI_LOJA);
    await carregarProdutosAdmin();
  } catch (erro) {
    alert("Não foi possível criar os produtos de exemplo agora.");
  } finally {
    botao.disabled = false;
    botao.textContent = "Popular com os 3 produtos de exemplo";
  }
}

/**
 * Liga os botões novos da barra de topo (avatar -> perfil, lupa ->
 * busca) aos botões que já existiam, e mantém as iniciais do avatar
 * em dia com o apelido logado.
 */
function configurarBarraTopo() {
  document
    .getElementById("btn-topo-perfil")
    ?.addEventListener("click", () => document.getElementById("btn-meu-perfil")?.click());
  document
    .getElementById("btn-topo-busca")
    ?.addEventListener("click", () => document.getElementById("btn-buscar-local")?.click());
  atualizarAvatarTopo();
  document.addEventListener("auth-mudou", atualizarAvatarTopo);
}

/** Iniciais do avatar da barra de topo (apelido logado, ou "PV"/"?"). */
function atualizarAvatarTopo() {
  const el = document.getElementById("btn-topo-perfil");
  if (!el) return;
  const apelido = window.raspadinhaAuth?.apelido;
  aplicarAvatar(el, apelido ? window.raspadinhaAuth?.fotoPerfil : null, apelido);
}

/**
 * Liga a barra de navegação inferior (#nav-inferior) e o Menu
 * (#menu-sheet) aos botões que já existiam -- cada item só dá um
 * .click() no botão antigo correspondente (que agora fica escondido
 * via CSS), então nenhum handler precisou ser reescrito. O realce da
 * aba ativa é só visual: acende ao tocar, e volta pra "Mapa" quando
 * todos os modais estão fechados.
 */
// Painéis de tela cheia (overlays) que a barra inferior gerencia. Só
// os de verdade -- NÃO os elementos internos tipo #modal-conteudo,
// #modal-status etc., que ficam sempre presentes dentro do popup do
// selo.
const OVERLAYS_APP = [
  "modal-social", "modal-configuracoes", "modal-admin", "modal-brasil",
  "modal-raspadinha", "biblioteca-selos", "modal-conquistas", "modal-ranking",
  "modal-amigos", "modal-rotas", "modal-rota-detalhe",
  "modal-perfil", "modal-sugestoes-comunidade", "modal-cartao-progresso",
  "modal-selo-lightbox", "modal-busca-local", "modal-confirmar-exclusao",
  "modal-motoclube-form", "modal-criar-rota",
  "modal-rota-personalizada-detalhe", "modal-compartilhar-rota",
  "modal-confirmar-viagem", "modal-municipios-pendentes",
  "modal-resumo-viagem", "modal-compartilhar-viagem",
  "modal-loja", "modal-checkout-loja",
  "modal-denuncia", "modal-indicar-selo",
  "menu-sheet",
];

function algumOverlayAberto() {
  return OVERLAYS_APP.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("oculto");
  });
}

function configurarNavInferior() {
  const nav = document.getElementById("nav-inferior");
  const menu = document.getElementById("menu-sheet");
  if (!nav) return;

  const acender = (botao) => {
    nav.querySelectorAll("button").forEach((b) => b.classList.remove("nav-ativa"));
    if (botao) botao.classList.add("nav-ativa");
  };
  nav.querySelectorAll("button").forEach((botao) => {
    botao.addEventListener("click", () => {
      const tipo = botao.dataset.nav;
      if (tipo === "menu") {
        menu.classList.remove("oculto");
      } else if (tipo === "alvo") {
        acender(botao);
        document.getElementById(botao.dataset.alvo)?.click();
      }
    });
  });

  // Itens do Menu: aciona o botão antigo e fecha a folha.
  menu.querySelectorAll(".menu-op").forEach((op) => {
    op.addEventListener("click", () => {
      menu.classList.add("oculto");
      document.getElementById(op.dataset.alvo)?.click();
    });
  });
  // Toca fora da folha pra fechar.
  menu.addEventListener("click", (e) => {
    if (e.target === menu) menu.classList.add("oculto");
  });

  /* Fechou tudo? Nenhuma aba acesa -- o mapa é o fundo da tela, não um
     destino. Antes existia uma aba "Mapa" que ficava acesa aqui; ela
     saiu porque levava exatamente pra onde a pessoa já estava. */
  document.addEventListener("click", (e) => {
    if (e.target.closest("[id^='btn-fechar']")) {
      setTimeout(() => {
        if (!algumOverlayAberto()) acender(null);
      }, 50);
    }
  });
}

/** Fecha qualquer painel/modal aberto, voltando ao mapa limpo. */
function fecharTodosOsModais() {
  OVERLAYS_APP.forEach((id) => document.getElementById(id)?.classList.add("oculto"));
}

/**
 * A dica "Arraste para mover..." some sozinha depois de alguns
 * segundos -- só serve pra ensinar de primeira, não precisa ficar
 * poluindo a tela pra sempre.
 */
function configurarDicaMapa() {
  const dica = document.getElementById("dica-mapa");
  if (!dica) return;
  setTimeout(() => dica.classList.add("dica-mapa-escondida"), 4000);
}

/**
 * Esconde a tela de carregamento (splash preta com o logo, ver
 * #tela-carregamento em index.html) quando a inicialização acima
 * termina. Fica no ar por no mínimo 1s desde a abertura -- puramente
 * estético (o app costuma carregar rápido demais pra dar tempo de
 * ver a splash), então garantimos que ela apareça por pelo menos 1
 * segundo. Depois faz um fade-out antes de remover de vez.
 */
function esconderTelaCarregamento() {
  const tela = document.getElementById("tela-carregamento");
  if (!tela) return;
  const decorrido = performance.now();
  const restante = Math.max(0, 1000 - decorrido);
  setTimeout(() => {
    tela.classList.add("sumindo");
    setTimeout(() => tela.remove(), 450);
  }, restante);
}

/**
 * Só deixa executar `acao` se o usuário estiver logado; senão, abre
 * o popup de login. Navegar/mexer no mapa (pan/zoom) não passa por
 * aqui — só interações de verdade (abrir município/região,
 * biblioteca, configurações).
 */
function exigirLogin(acao) {
  if (window.raspadinhaAuth?.usuarioAtual) {
    acao();
  } else {
    abrirTelaLogin();
  }
}

function abrirTelaLogin() {
  document.getElementById("tela-login").classList.remove("oculto");
}

function fecharTelaLogin() {
  document.getElementById("tela-login").classList.add("oculto");
}

/**
 * Compartilha o link do app (Web Share API no celular; copia o link
 * como alternativa no desktop/navegadores sem suporte). Se a pessoa
 * estiver logada, o link leva um "?convite=uid" -- se alguém criar
 * conta por esse link, quem convidou ganha uma raspadinha brilhante
 * garantida (ver decidirBrilhante/creditarConviteSeExistir).
 */
function compartilharApp() {
  const url = new URL(window.location.href);
  url.search = "";
  const uid = window.raspadinhaAuth?.usuarioAtual?.uid;
  if (uid) url.searchParams.set("convite", uid);

  const dados = {
    title: "Desbrava",
    text: "Desbrava — raspe o mapa do Rio de Janeiro conforme visita cada município!",
    url: url.toString(),
  };

  if (navigator.share) {
    navigator.share(dados).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard
      .writeText(dados.url)
      .then(() => alert("Link copiado! Cole onde quiser compartilhar."))
      .catch(() => prompt("Copie o link para compartilhar:", dados.url));
  } else {
    prompt("Copie o link para compartilhar:", dados.url);
  }
}

/**
 * Gera e compartilha o link "me adicione como amigo(a)" (?amigo=<meu-uid>).
 * Quem abrir o link, estando logado, manda um pedido de amizade pra mim
 * automaticamente (ver processarAmigoPendente). Já é gated por exigirLogin.
 */
function compartilharLinkAmigo() {
  const uid = window.raspadinhaAuth?.usuarioAtual?.uid;
  if (!uid) return;
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("amigo", uid);
  const apelido = window.raspadinhaAuth?.apelido || "Alguém";
  const dados = {
    title: "Desbrava",
    text: `${apelido} quer te adicionar no Desbrava! Abra o link e vocês viram amigos no app.`,
    url: url.toString(),
  };
  if (navigator.share) {
    navigator.share(dados).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard
      .writeText(dados.url)
      .then(() => alert("Link copiado! Quem abrir e estiver logado vira seu amigo no app."))
      .catch(() => prompt("Copie o link:", dados.url));
  } else {
    prompt("Copie o link:", dados.url);
  }
}

/**
 * Link "🤝 Bora buscar esse selo?" no popup de um município (visitado
 * ou não): convite pontual pra outra pessoa ir raspar aquele mesmo
 * município, sem precisar ser amigo (?municipio=<id>). Ver
 * abrirMunicipioDoLinkSeExistir, que abre o popup pra quem clicar.
 */
function compartilharConviteMunicipio() {
  if (!municipioSelecionadoId) return;
  const nome = document.getElementById("modal-municipio-nome").textContent;
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("municipio", municipioSelecionadoId);
  const dados = {
    title: "Desbrava",
    text: `Bora buscar o selo de ${nome} juntos?`,
    url: url.toString(),
  };
  if (navigator.share) {
    navigator.share(dados).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard
      .writeText(dados.url)
      .then(() => alert("Link copiado!"))
      .catch(() => prompt("Copie o link:", dados.url));
  } else {
    prompt("Copie o link:", dados.url);
  }
}

/**
 * Ao logar, se veio de um link "?municipio=id" (ver
 * compartilharConviteMunicipio), abre o popup daquele município na
 * hora -- mesmo fluxo de abrir pelo mapa (abrirSeloPorId).
 */
function abrirMunicipioDoLinkSeExistir(usuario) {
  if (!municipioIdPendenteDoLink || !usuario) return;
  const id = municipioIdPendenteDoLink;
  municipioIdPendenteDoLink = null;
  const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
  if (!path) return;
  abrirSeloPorId(id, path.dataset.nome);
}

/**
 * Ao logar, se veio de um link "?rotaPersonalizada=id" (ver
 * compartilharRotaPersonalizada), busca a rota e abre o detalhe --
 * funciona pra qualquer autenticado, não só o dono (regra do
 * Firestore permite leitura geral).
 */
async function abrirRotaPersonalizadaDoLinkSeExistir(usuario) {
  if (!rotaPersonalizadaIdPendenteDoLink || !usuario) return;
  const id = rotaPersonalizadaIdPendenteDoLink;
  rotaPersonalizadaIdPendenteDoLink = null;
  try {
    const rota = await window.raspadinhaAuth.buscarRotaPersonalizadaPorId(id);
    if (rota) abrirRotaPersonalizadaDetalhe(rota);
  } catch (erro) {
    console.error("Falha ao abrir rota personalizada do link:", erro);
  }
}

/**
 * Ao logar, se veio de um link "?amigo=uid", manda um pedido de amizade
 * pra quem gerou o link. Roda uma vez só (limpa o pendente na hora) e
 * ignora se for o próprio uid. Ver detectarLinkDeAmigo.
 */
async function processarAmigoPendente(usuario) {
  if (!usuario) return;
  const amigoUid = localStorage.getItem("desbrava_amigo_pendente");
  if (!amigoUid) return;
  localStorage.removeItem("desbrava_amigo_pendente");
  if (amigoUid === usuario.uid) return; // não dá pra ser amigo de si mesmo
  try {
    await window.raspadinhaAuth.enviarPedidoAmizade(amigoUid);
    alert("Pronto! Enviamos seu pedido de amizade. 🤝");
  } catch (erro) {
    console.error("Falha ao enviar pedido de amizade do link:", erro);
  }
}

/**
 * Verdadeiro se o app já está rodando instalado (janela "standalone"
 * no Android/desktop, ou "adicionado à tela de início" no iOS) — daí
 * não faz sentido sugerir instalar de novo.
 */
function pwaJaInstalado() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Mostra o aviso sugerindo instalar o app, com um botão de instalar
 * direto (se o navegador oferecer, ex: Chrome/Edge/Android) ou um
 * botão "Como instalar" com instruções manuais caso contrário.
 *
 * Não mostra se: já está rodando instalado, se essa instalação já
 * foi registrada antes (CHAVE_PWA_INSTALADO) ou se o navegador
 * consegue confirmar que já está instalado mesmo estando numa aba
 * comum (navigator.getInstalledRelatedApps — só Chrome/Edge/Android;
 * no Safari/iOS não existe forma de checar isso pela web).
 */
async function mostrarAvisoInstalarPwa() {
  // Dentro do app nativo não faz sentido oferecer o download do APK.
  if (ehAppNativo()) return;
  if (pwaJaInstalado()) return;
  if (localStorage.getItem(CHAVE_PWA_INSTALADO) === "true") return;

  if (navigator.getInstalledRelatedApps) {
    try {
      const relacionados = await navigator.getInstalledRelatedApps();
      if (relacionados.length > 0) {
        localStorage.setItem(CHAVE_PWA_INSTALADO, "true");
        return;
      }
    } catch {
      // API experimental: se falhar, segue e mostra o aviso normalmente.
    }
  }

  document.getElementById("aviso-instalar-pwa").classList.remove("oculto");
}

function fecharAvisoInstalarPwa() {
  document.getElementById("aviso-instalar-pwa").classList.add("oculto");
}

async function instalarPwa() {
  if (!promptInstalacaoPwa) return;
  promptInstalacaoPwa.prompt();
  const resultado = await promptInstalacaoPwa.userChoice;
  promptInstalacaoPwa = null;
  if (resultado.outcome === "accepted") {
    fecharAvisoInstalarPwa();
  }
}

/**
 * Instruções manuais pra quando o navegador não oferece um botão de
 * instalação direto (ex: iOS Safari, ou Chrome antes do evento
 * "beforeinstallprompt" disparar).
 */
function alternarInstrucoesInstalarPwa() {
  const instrucoes = document.getElementById("aviso-instalar-instrucoes");
  if (!instrucoes.classList.contains("oculto")) {
    instrucoes.classList.add("oculto");
    return;
  }

  instrucoes.textContent = ehIOS()
    ? 'No Safari, toque no ícone de compartilhar (□ com uma seta ↑) e depois em "Adicionar à Tela de Início".'
    : 'No Chrome, clique no ícone de instalar (⊕) na barra de endereço, ou abra o menu "⋮" e escolha "Instalar Desbrava" (ou "Instalar app").';
  instrucoes.classList.remove("oculto");
}

let modoCadastro = false;

/**
 * Alterna entre "Entrar" e "Criar conta" no formulário de login.
 */
function alternarModoLogin() {
  modoCadastro = !modoCadastro;
  document.querySelector("#btn-entrar-email .btn-texto").textContent = modoCadastro
    ? "Criar conta"
    : "Entrar";
  document.getElementById("btn-alternar-modo").textContent = modoCadastro
    ? "Já tem conta? Entrar"
    : "Não tem conta? Criar conta";
  // "Esqueci minha senha" só faz sentido no modo Entrar.
  document.getElementById("btn-esqueci-senha").classList.toggle("oculto", modoCadastro);
  esconderErroLogin();
}

/**
 * Login/cadastro com e-mail e senha (js/auth.js). Em vez de travar a
 * tela esperando o Firebase responder, fecha o popup de login na
 * hora e deixa a requisição rolando em segundo plano — o andamento
 * (carregando/sucesso/erro) aparece num aviso flutuante no canto
 * inferior direito (ver mostrarToastLogin/atualizarToastLogin), pra
 * não obrigar o usuário a ficar parado esperando.
 */
function aoEnviarFormLogin(evento) {
  evento.preventDefault();
  esconderErroLogin();

  if (!window.raspadinhaAuth) {
    mostrarErroLogin("O login ainda não carregou. Espere alguns segundos e tente de novo.");
    return;
  }

  const email = document.getElementById("input-email").value.trim();
  const senha = document.getElementById("input-senha").value;
  if (!email || !senha) {
    mostrarErroLogin("Preencha e-mail e senha.");
    return;
  }

  const eraCadastro = modoCadastro;
  const acao = eraCadastro
    ? window.raspadinhaAuth.criarContaComEmail(email, senha)
    : window.raspadinhaAuth.entrarComEmail(email, senha);

  fecharTelaLogin();
  mostrarToastLogin(eraCadastro ? "Criando sua conta..." : "Login sendo efetuado...");

  acao
    .then(() => {
      atualizarToastLogin("sucesso", eraCadastro ? "Conta criada! ✅" : "Login realizado! ✅");
      setTimeout(esconderToastLogin, 2500);
    })
    .catch((erro) => {
      atualizarToastLogin("erro", traduzirErroAuth(erro));
    });
}

/**
 * Corre uma promise contra um relógio: se ela não resolver/rejeitar em
 * `ms`, rejeita com `mensagem`. Usado pra não deixar o login com Google
 * pendurado eternamente quando o lado nativo trava.
 */
function comTempoLimite(promessa, ms, mensagem) {
  let timer;
  const relogio = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(mensagem)), ms);
  });
  return Promise.race([promessa, relogio]).finally(() => clearTimeout(timer));
}

/**
 * Login com Google — funciona no app nativo (APK, via plugin Capacitor)
 * e na web (via signInWithPopup do Firebase).
 */
async function entrarComGoogle() {
  esconderErroLogin();
  fecharTelaLogin();
  mostrarToastLogin("Entrando com o Google...");

  try {
    if (ehAppNativo()) {
      const plugin = window.Capacitor?.Plugins?.FirebaseAuthentication;
      if (!plugin) throw new Error("Plugin do Google não disponível.");
      // Corta o login se travar (ex: google-services.json sem o cliente
      // OAuth de Android -> o seletor de conta abre mas nunca conclui o
      // handshake). Sem esse teto, o toast fica preso em "Entrando com o
      // Google..." pra sempre. 45s cobre até uma rede bem lenta.
      const resultado = await comTempoLimite(
        plugin.signInWithGoogle(),
        45000,
        "O login com o Google demorou demais. Tente de novo."
      );
      const idToken = resultado?.credential?.idToken;
      if (!idToken) throw new Error("Não recebi o token do Google. Tente de novo.");
      await window.raspadinhaAuth.entrarComCredencialGoogle(idToken);
    } else {
      await window.raspadinhaAuth.entrarComGoogleWeb();
    }
    atualizarToastLogin("sucesso", "Login realizado! ✅");
    setTimeout(esconderToastLogin, 2500);
  } catch (erro) {
    console.error("Falha no login com Google:", erro);
    if (/cancel/i.test(erro?.message || "") || erro?.code === "1" ||
        erro?.code === "auth/popup-closed-by-user") {
      esconderToastLogin();
      return;
    }
    atualizarToastLogin("erro", traduzirErroAuth(erro));
  }
}

/**
 * Aviso flutuante (#toast-login) que acompanha o login/cadastro
 * rodando em segundo plano. No estado de erro fica clicável: um
 * clique reabre o popup de login pra tentar de novo.
 */
function mostrarToastLogin(mensagem) {
  const toast = document.getElementById("toast-login");
  toast.classList.remove("oculto", "toast-sucesso", "toast-erro");
  document.getElementById("toast-login-texto").textContent = mensagem;
}

function atualizarToastLogin(tipo, mensagem) {
  const toast = document.getElementById("toast-login");
  toast.classList.remove("toast-sucesso", "toast-erro");
  toast.classList.add(`toast-${tipo}`);
  document.getElementById("toast-login-texto").textContent = mensagem;
}

function esconderToastLogin() {
  document.getElementById("toast-login").classList.add("oculto");
}

function mostrarErroLogin(mensagem) {
  const el = document.getElementById("erro-login");
  el.textContent = mensagem;
  el.classList.remove("oculto");
}

function esconderErroLogin() {
  document.getElementById("erro-login").classList.add("oculto");
}

/**
 * Traduz os códigos de erro mais comuns do Firebase Auth pra
 * mensagens em português que fazem sentido pro usuário.
 */
/**
 * "Esqueci minha senha": envia o e-mail de redefinição (recurso nativo
 * do Firebase, funciona no plano grátis). Usa o e-mail já digitado no
 * campo, se houver; senão pergunta. Por segurança (evitar que alguém
 * descubra quais e-mails têm conta), a mensagem de sucesso é a mesma
 * exista ou não a conta -- e num e-mail que só tem login pelo Google não
 * chega nada, porque não há senha pra redefinir.
 */
async function pedirRedefinicaoSenha() {
  if (!window.raspadinhaAuth) {
    mostrarErroLogin("O login ainda não carregou. Espere alguns segundos e tente de novo.");
    return;
  }
  esconderErroLogin();
  const campo = document.getElementById("input-email").value.trim();
  const email = campo || (prompt("Digite o e-mail da sua conta para redefinir a senha:") || "").trim();
  if (!email) return;

  try {
    await window.raspadinhaAuth.redefinirSenha(email);
    fecharTelaLogin();
    mostrarToastLogin("");
    atualizarToastLogin(
      "sucesso",
      `Se existir uma conta com ${email}, enviamos um link pra criar uma senha nova. Confira também a caixa de spam. 📧`
    );
    setTimeout(esconderToastLogin, 6000);
  } catch (erro) {
    console.error("Falha ao enviar redefinição de senha:", erro);
    // auth/user-not-found: não revela que o e-mail não existe (mesma
    // mensagem de sucesso). Outros erros (e-mail inválido etc.) aí sim
    // mostram o motivo real.
    if (erro?.code === "auth/user-not-found") {
      fecharTelaLogin();
      atualizarToastLogin(
        "sucesso",
        `Se existir uma conta com ${email}, enviamos um link pra criar uma senha nova. Confira também a caixa de spam. 📧`
      );
      setTimeout(esconderToastLogin, 6000);
      return;
    }
    mostrarErroLogin(traduzirErroAuth(erro));
  }
}

function traduzirErroAuth(erro) {
  const mensagens = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Digite uma senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tente entrar.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Não existe conta com esse e-mail. Crie uma conta.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/operation-not-allowed":
      "Login por e-mail/senha ainda não foi ativado no Firebase (Console > Authentication > Sign-in method).",
  };
  return mensagens[erro?.code] || erro?.message || "Não foi possível continuar. Tente de novo.";
}

function sairDaConta() {
  window.raspadinhaAuth?.sair();
}

/**
 * Mostra a tela de bloqueio quando a conta é suspensa (auto-detecção
 * de GPS falso, ou revisão manual) ou banida (revisão manual) -- ver
 * evento "conta-bloqueada" disparado por js/auth.js. A conta já foi
 * deslogada de verdade antes desse evento chegar; essa tela só
 * explica o motivo.
 */
function mostrarTelaContaBloqueada({ motivo, automatico } = {}) {
  const texto =
    motivo === "banido"
      ? "Sua conta foi banida e não pode mais ser usada no Desbrava.\n\nSe achar que foi um engano, entre em contato com quem administra o Desbrava."
      : automatico
      ? "Detectamos atividade suspeita (deslocamento entre municípios incompatível com uma visita real) e sua conta foi suspensa automaticamente enquanto isso é revisado.\n\nSe foi um engano, entre em contato com quem administra o Desbrava."
      : "Sua conta foi suspensa enquanto uma atividade é revisada.\n\nSe achar que foi um engano, entre em contato com quem administra o Desbrava.";

  document.getElementById("conta-bloqueada-texto").textContent = texto;
  document.getElementById("tela-conta-bloqueada").classList.remove("oculto");
}

/**
 * Atualiza a UI (popup de login, seção "Conta" nas configurações) de
 * acordo com o login atual. `detalhe` é null (deslogado) ou
 * { usuario, apelido }. Navegar no mapa não exige login — por isso,
 * ao deslogar, NÃO reabre o popup de login sozinho; ele só aparece
 * quando alguma ação realmente exigir (ver exigirLogin()).
 */
async function atualizarUiDeConta(detalhe) {
  const status = document.getElementById("conta-status");

  if (detalhe) {
    const { usuario, apelido } = detalhe;
    fecharTelaLogin();
    document.getElementById("modal-apelido").classList.add("oculto");
    document.getElementById("form-login").reset();

    status.textContent = `Conectado como ${apelido} (${usuario.email})`;
    document.getElementById("dados-email").textContent = `E-mail: ${usuario.email}`;
    document.getElementById("input-apelido-config").value = apelido;

    // IMPORTANTE: troca pro estado (município/região) DESSA conta —
    // e restaura do Firestore por cima — ANTES de sincronizar de
    // volta pro Firestore. Sem isso, se o navegador ainda tivesse o
    // estado de outra conta (ver carregarEstadoDoUsuario), essa
    // sincronização gravaria dado misturado por cima do certo.
    await carregarEstadoDoUsuario(usuario.uid);

    sincronizarProgressoOnline();
    gerarSnapshotMapaSeNecessario();
    window.raspadinhaAuth.buscarPerfilPublico(usuario.uid).then((perfil) => {
      document.getElementById("check-perfil-publico").checked = perfil?.perfilPublico !== false;
    });

    // Botão do painel de Admin: só existe pra a conta "dona" do
    // projeto (UID_DONO em js/auth.js) -- a regra do Firestore é quem
    // realmente impede qualquer outra conta de mudar status alheio ou
    // o toggle de anúncios, isso aqui é só a UI não aparecer à toa
    // pra ninguém mais.
    document
      .getElementById("secao-admin")
      .classList.toggle("oculto", usuario.uid !== window.raspadinhaAuth.UID_DONO);
  } else {
    status.textContent = "Você não está conectado.";
    document.getElementById("dados-email").textContent = "";
    document.getElementById("input-apelido-config").value = "";
    document.getElementById("secao-admin").classList.add("oculto");
    voltarParaEstadoAnonimo();
    atualizarAvisoBrilhantePendente();
  }
  // Entrar ou sair muda o que Configurações pode mostrar, e o painel
  // pode estar ABERTO na hora (dá pra entrar por dentro dele agora).
  ajustarConfiguracoesParaVisitante();
}

/**
 * Envia pro Firestore quantos municípios já foram visitados —
 * alimenta o Ranking online (ver abrirRanking). Silencioso: se
 * falhar, não atrapalha nada no mapa (só fica sem contar no ranking
 * até a próxima sincronização).
 */
function sincronizarProgressoOnline() {
  if (!window.raspadinhaAuth?.usuarioAtual) return;
  const visitados = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;
  window.raspadinhaAuth.sincronizarProgresso(visitados);
}

/**
 * Estado "público" de um município (o que aparece no perfil de quem
 * abrir e nas contagens globais de raridade) -- reflete só o que
 * está ATIVO agora: verificado conta só se ainda estiver marcado
 * (some se desmarcar), brilhante só conta enquanto o município
 * estiver visitado (a decisão em si é permanente localmente, mas o
 * selo só "aparece" publicamente enquanto coletado).
 */
function estadoPublicoMunicipio(id) {
  const dados = estadoMapa[id];
  return {
    visitado: !!dados?.visitado,
    verificado: estaVerificado(id),
    brilhante: !!(dados?.visitado && dados?.brilhante),
    // Histórico, não estado atual: "o GPS já confirmou presença aqui
    // alguma vez". Diferente de `verificado`, que some quando o
    // município está desmarcado. É o que faz a verificação sobreviver
    // a desmarcar + reinstalar o app (o registro local se perde, mas
    // este campo volta da nuvem).
    jaVerificado: !!dados?.verificado,
  };
}

function sincronizarMunicipioOnline(id) {
  if (!window.raspadinhaAuth?.usuarioAtual) return;
  window.raspadinhaAuth.sincronizarMunicipio(id, estadoPublicoMunicipio(id));
}

/**
 * Salva o novo apelido digitado em "Dados pessoais" (Configurações).
 * Mesma função de bastidor do apelido do primeiro login
 * (salvarApelido), que já rejeita apelidos repetidos.
 */
function salvarApelidoConfig() {
  const input = document.getElementById("input-apelido-config");
  const apelido = input.value.trim();
  const erro = document.getElementById("erro-apelido-config");
  erro.classList.add("oculto");

  if (!apelido) {
    erro.textContent = "Digite um apelido.";
    erro.classList.remove("oculto");
    return;
  }

  const botao = document.getElementById("btn-salvar-apelido-config");
  botao.disabled = true;
  botao.querySelector(".spinner").classList.remove("oculto");
  botao.querySelector(".btn-texto").classList.add("oculto");

  window.raspadinhaAuth
    ?.salvarApelido(apelido)
    .catch((e) => {
      erro.textContent = e?.message || "Não foi possível salvar agora. Tente de novo.";
      erro.classList.remove("oculto");
    })
    .finally(() => {
      botao.disabled = false;
      botao.querySelector(".spinner").classList.add("oculto");
      botao.querySelector(".btn-texto").classList.remove("oculto");
    });
}

/* ============================================================
   Painel de Admin (moderação + anúncios): tudo aqui só é aberto pela
   conta dona do projeto (ver UID_DONO em js/auth.js e o toggle de
   #secao-admin em atualizarUiDeConta).
   ============================================================ */

function abrirAdmin() {
  document.getElementById("modal-admin").classList.remove("oculto");
  document.getElementById("moderacao-resultado").innerHTML = "";
  document.getElementById("input-busca-moderacao").value = "";
  atualizarCheckboxAnunciosGlobal();
  atualizarCheckboxAnuncioParaMim();
  carregarChavePixNoAdmin();
  carregarProdutosAdmin();
  carregarSelosIndicados();
  carregarDenuncias();
}

/**
 * Preenche o campo de chave PIX do painel de Admin com o valor atual
 * (o salvo em configuracoes/global.chavePix, ou o padrão local).
 */
async function carregarChavePixNoAdmin() {
  const input = document.getElementById("input-chave-pix-admin");
  if (!input) return;
  input.value = CHAVE_PIX_COLABORACAO;
  await carregarChavePixGlobal();
  input.value = CHAVE_PIX_COLABORACAO;
}

async function salvarChavePixAdmin() {
  const input = document.getElementById("input-chave-pix-admin");
  const botao = document.getElementById("btn-salvar-chave-pix");
  const status = document.getElementById("pix-admin-status");
  const chave = input.value.trim();
  if (!chave) {
    status.textContent = "Digite uma chave antes de salvar.";
    status.className = "feedback-status status-erro";
    status.classList.remove("oculto");
    return;
  }
  botao.disabled = true;
  status.classList.add("oculto");
  try {
    await window.raspadinhaAuth.definirChavePixColaboracao(chave);
    CHAVE_PIX_COLABORACAO = chave;
    status.textContent = "Chave PIX atualizada! 💙";
    status.className = "feedback-status status-sucesso";
    status.classList.remove("oculto");
  } catch (erro) {
    console.error("Falha ao salvar chave PIX:", erro);
    status.textContent = erro?.message || "Não foi possível salvar agora.";
    status.className = "feedback-status status-erro";
    status.classList.remove("oculto");
  } finally {
    botao.disabled = false;
  }
}

function fecharAdmin() {
  document.getElementById("modal-admin").classList.add("oculto");
}

async function atualizarCheckboxAnunciosGlobal() {
  const checkbox = document.getElementById("check-anuncios-ativados");
  checkbox.disabled = true;
  try {
    const config = await window.raspadinhaAuth.buscarConfigGlobal();
    checkbox.checked = !!config?.anunciosAtivados;
    // Mesmo documento: aproveita a leitura pra sincronizar o toggle do
    // Motoclube também.
    document.getElementById("check-motoclube-liberado").checked =
      !!config?.motoclubeLiberadoParaTodos;
  } catch (erro) {
    console.error("Falha ao carregar configuração de anúncios:", erro);
  } finally {
    checkbox.disabled = false;
  }
}

/**
 * Liga/desliga o Motoclube pra todo mundo.
 *
 * Reflete na hora no aparelho do admin (atualizarBotaoAssinarPro), e
 * nos outros aparelhos na próxima abertura do app -- é quando
 * carregarChavePixGlobal relê configuracoes/global.
 */
async function alternarMotoclubeLiberado(evento) {
  const checkbox = evento.target;
  const status = document.getElementById("motoclube-admin-status");

  checkbox.disabled = true;
  status.classList.add("oculto");
  try {
    await window.raspadinhaAuth.definirMotoclubeLiberado(checkbox.checked);
    atualizarBotaoAssinarPro();
    status.textContent = checkbox.checked
      ? "Motoclube liberado pra todo mundo, de graça."
      : "Motoclube voltou a ser pago.";
    status.className = "feedback-status status-sucesso";
    status.classList.remove("oculto");
  } catch (erro) {
    console.error("Falha ao alternar liberação do Motoclube:", erro);
    // Desfaz o visual: o estado real não mudou, e deixar o toggle
    // ligado faria você achar que liberou quando não liberou.
    checkbox.checked = !checkbox.checked;
    status.textContent = erro?.message || "Não foi possível salvar agora.";
    status.className = "feedback-status status-erro";
    status.classList.remove("oculto");
  } finally {
    checkbox.disabled = false;
  }
}

/**
 * "Pra mim" é só um atalho de definirAnuncioPorUsuario mirando a
 * própria conta dona (evita ter que se buscar por apelido na
 * Moderação só pra mudar o próprio anúncio).
 */
async function atualizarCheckboxAnuncioParaMim() {
  const checkbox = document.getElementById("check-anuncios-para-mim");
  const uid = window.raspadinhaAuth.usuarioAtual?.uid;
  if (!uid) return;

  checkbox.disabled = true;
  try {
    const conta = await window.raspadinhaAuth.buscarUsuario(window.raspadinhaAuth.apelido || "");
    checkbox.checked = !!conta?.anunciosAtivados;
  } catch (erro) {
    console.error("Falha ao carregar configuração de anúncio pra mim:", erro);
  } finally {
    checkbox.disabled = false;
  }
}

async function alternarAnuncioParaMim(evento) {
  const checkbox = evento.target;
  const uid = window.raspadinhaAuth.usuarioAtual?.uid;
  if (!uid) return;

  checkbox.disabled = true;
  try {
    await window.raspadinhaAuth.definirAnuncioPorUsuario(uid, checkbox.checked);
    atualizarVisibilidadeAnuncio();
  } catch (erro) {
    console.error("Falha ao mudar anúncio pra mim:", erro);
    checkbox.checked = !checkbox.checked;
    alert(erro?.message || "Não foi possível salvar agora.");
  } finally {
    checkbox.disabled = false;
  }
}

async function alternarAnunciosAdmin(evento) {
  const checkbox = evento.target;
  const status = document.getElementById("anuncios-admin-status");
  checkbox.disabled = true;
  status.classList.add("oculto");
  try {
    await window.raspadinhaAuth.definirAnunciosGlobalAtivados(checkbox.checked);
    atualizarVisibilidadeAnuncio();
  } catch (erro) {
    console.error("Falha ao mudar configuração de anúncios:", erro);
    checkbox.checked = !checkbox.checked;
    status.textContent = erro?.message || "Não foi possível salvar agora.";
    status.classList.remove("oculto");
  } finally {
    checkbox.disabled = false;
  }
}

// true assim que o anúncio já foi "empurrado" pro AdSense (push) uma
// vez -- empurrar o mesmo <ins> duas vezes dá erro no console.
let anuncioJaEmpurrado = false;

/**
 * Mostra/esconde o slot de anúncio (Google AdSense) no rodapé de
 * Configurações, pra QUALQUER pessoa (logada ou não). A decisão é da
 * conta logada (ver buscarConfigAnuncio em js/auth.js): se ela tiver
 * um override individual (ligado/desligado especificamente pra ela
 * no painel de Admin), esse valor manda; senão cai no padrão global
 * (configuracoes/global, lido por todo mundo mas só escrito pela
 * conta dona). O script do AdSense em si já fica sempre carregado
 * (tag fixa no `<head>` de index.html, exigida pela própria
 * verificação de site do Google) -- aqui só decide se O ANÚNCIO
 * aparece, e só "empurra" (`adsbygoogle.push`) quando o slot ID
 * também já tiver sido trocado pelo real (sem isso, mostrar o `<ins>`
 * vazio não renderiza nada e ainda pode gerar erro no console).
 */
async function atualizarVisibilidadeAnuncio() {
  const secao = document.getElementById("secao-anuncio");
  try {
    const deveMostrar = await window.raspadinhaAuth.buscarConfigAnuncio();
    const slotId = secao.querySelector("ins")?.dataset.adSlot || "";

    if (!deveMostrar || !slotId || slotId.startsWith("SUBSTITUA_AQUI")) {
      secao.classList.add("oculto");
      return;
    }

    secao.classList.remove("oculto");
    if (!anuncioJaEmpurrado) {
      anuncioJaEmpurrado = true;
      empurrarAnuncioAdsense();
    }
  } catch (erro) {
    console.error("Falha ao checar configuração de anúncios:", erro);
    secao.classList.add("oculto");
  }
}

function empurrarAnuncioAdsense() {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (erro) {
    console.error("Falha ao inicializar o anúncio:", erro);
  }
}

/**
 * Busca por e-mail/apelido (reaproveita buscarUsuario, mesma função
 * usada em Amigos) e mostra o resultado com 3 botões de status. A
 * regra do Firestore é quem realmente garante que só o dono consegue
 * aplicar de verdade -- isso aqui só monta a UI.
 */
async function buscarContaParaModerar() {
  const texto = document.getElementById("input-busca-moderacao").value.trim();
  const resultado = document.getElementById("moderacao-resultado");
  if (!texto) return;

  resultado.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const encontrado = await window.raspadinhaAuth.buscarUsuario(texto);
    if (!encontrado) {
      resultado.innerHTML = "<p>Ninguém encontrado com esse e-mail/apelido.</p>";
      return;
    }

    renderizarItemModeracao(resultado, { ...encontrado, status: encontrado.status || "ativo" });
  } catch (erro) {
    console.error("Falha ao buscar conta pra moderar:", erro);
    resultado.innerHTML = "<p>Não foi possível buscar agora.</p>";
  }
}

function renderizarItemModeracao(container, conta) {
  container.innerHTML = `
    <div class="moderacao-item">
      <div class="moderacao-item-nome">${escaparHtml(conta.apelido)}</div>
      <div class="moderacao-item-email">${escaparHtml(conta.email)}</div>
      <div class="moderacao-item-status">Status atual: ${escaparHtml(conta.status)}${
        conta.denunciasAceitas ? ` · ${conta.denunciasAceitas} denúncia(s) aceita(s)` : ""
      }</div>
      ${
        conta.status === "banido"
          ? '<button type="button" class="moderacao-restaurar">↩️ Aceitar recurso e restaurar conteúdo</button>'
          : ""
      }
      <div class="moderacao-item-acoes">
        <button type="button" data-status="ativo">Ativo</button>
        <button type="button" data-status="suspenso">Suspenso</button>
        <button type="button" data-status="banido">Banido</button>
      </div>
      <label class="moderacao-item-anuncio">
        <input type="checkbox" id="check-anuncio-item-moderacao">
        Mostrar anúncio pra essa conta (override individual)
      </label>
    </div>
  `;
  /* Recurso aceito: devolve o conteúdo arquivado pro lugar de origem e
     reativa a conta, zerando os strikes. Só aparece pra conta banida
     -- em conta ativa não há o que restaurar. */
  container.querySelector(".moderacao-restaurar")?.addEventListener("click", async (evento) => {
    if (!confirm(`Aceitar o recurso de ${conta.apelido}? O conteúdo volta pro app e a conta é reativada.`)) return;
    const botao = evento.target;
    botao.disabled = true;
    botao.textContent = "Restaurando...";
    try {
      const r = await window.raspadinhaAuth.restaurarConteudoDaConta(conta.uid);
      alert(`Conta reativada. ${r.restaurados} item(ns) devolvido(s) ao app.`);
      buscarContaParaModerar();
    } catch (erro) {
      console.error("Falha ao restaurar:", erro);
      alert(erro?.message || "Não deu pra restaurar agora.");
      botao.disabled = false;
      botao.textContent = "↩️ Aceitar recurso e restaurar conteúdo";
    }
  });

  container.querySelector("#check-anuncio-item-moderacao").checked = !!conta.anunciosAtivados;
  container.querySelector("#check-anuncio-item-moderacao").addEventListener("change", async (evento) => {
    const checkbox = evento.target;
    checkbox.disabled = true;
    try {
      await window.raspadinhaAuth.definirAnuncioPorUsuario(conta.uid, checkbox.checked);
    } catch (erro) {
      checkbox.checked = !checkbox.checked;
      alert(erro?.message || "Não foi possível mudar o anúncio dessa conta agora.");
    } finally {
      checkbox.disabled = false;
    }
  });

  container.querySelectorAll(".moderacao-item-acoes button").forEach((botao) => {
    botao.classList.toggle("status-ativa", botao.dataset.status === conta.status);
    botao.addEventListener("click", async () => {
      botao.disabled = true;
      try {
        await window.raspadinhaAuth.definirStatusDeConta(conta.uid, botao.dataset.status);
        renderizarItemModeracao(container, { ...conta, status: botao.dataset.status });
      } catch (erro) {
        alert(erro?.message || "Não foi possível mudar o status agora.");
        botao.disabled = false;
      }
    });
  });
}

/* ============================================================
   Excluir conta: 3 confirmações crescentes antes de apagar tudo de
   vez (progresso, selos, amigos, posts, fotos, a própria conta).
   ============================================================ */

function iniciarFluxoExclusaoConta() {
  if (!confirm("Tem certeza que quer excluir sua conta? Essa ação não pode ser desfeita.")) return;
  if (
    !confirm(
      "Isso vai apagar TUDO: progresso no mapa, selos, amigos, posts e fotos da Comunidade Desbrava. Confirma mesmo?"
    )
  )
    return;

  document.getElementById("input-confirmar-exclusao").value = "";
  document.getElementById("btn-excluir-de-vez").disabled = true;
  document.getElementById("exclusao-erro").classList.add("oculto");
  document.getElementById("modal-confirmar-exclusao").classList.remove("oculto");
  document.getElementById("input-confirmar-exclusao").focus();
}

async function confirmarExclusaoDeVez() {
  const botao = document.getElementById("btn-excluir-de-vez");
  const erroEl = document.getElementById("exclusao-erro");
  erroEl.classList.add("oculto");

  botao.disabled = true;
  botao.querySelector(".spinner").classList.remove("oculto");
  botao.querySelector(".btn-texto").classList.add("oculto");

  try {
    await window.raspadinhaAuth.excluirConta();
    document.getElementById("modal-confirmar-exclusao").classList.add("oculto");
    fecharConfiguracoes();
  } catch (erro) {
    if (erro?.code === "auth/requires-recent-login") {
      // Os dados já foram apagados (ver excluirConta em js/auth.js) --
      // só falta confirmar a senha de novo pra terminar de excluir a
      // conta de autenticação em si.
      const senha = prompt("Por segurança, digite sua senha atual pra confirmar a exclusão:");
      if (senha) {
        try {
          await window.raspadinhaAuth.reautenticarEExcluirConta(senha);
          document.getElementById("modal-confirmar-exclusao").classList.add("oculto");
          fecharConfiguracoes();
          botao.querySelector(".spinner").classList.add("oculto");
          botao.querySelector(".btn-texto").classList.remove("oculto");
          return;
        } catch (erro2) {
          console.error("Falha ao reautenticar e excluir conta:", erro2);
          erroEl.textContent = traduzirErroAuth(erro2);
        }
      } else {
        erroEl.textContent = "Precisa confirmar a senha pra terminar de excluir a conta.";
      }
    } else {
      console.error("Falha ao excluir conta:", erro);
      erroEl.textContent = erro?.message || "Não foi possível excluir agora. Tente de novo.";
    }
    erroEl.classList.remove("oculto");
    botao.disabled = false;
  } finally {
    botao.querySelector(".spinner").classList.add("oculto");
    botao.querySelector(".btn-texto").classList.remove("oculto");
  }
}

/**
 * Abre o popup de escolher apelido (primeiro login). Sugere a parte
 * do e-mail antes do "@" como ponto de partida, mas o usuário pode
 * trocar livremente.
 */
function abrirModalApelido(usuario) {
  const input = document.getElementById("input-apelido");
  input.value = usuario?.email?.split("@")[0] ?? "";
  document.getElementById("modal-apelido").classList.remove("oculto");
  input.focus();
}

function confirmarApelido() {
  const input = document.getElementById("input-apelido");
  const apelido = input.value.trim();
  if (!apelido) {
    alert("Digite um nome de usuário para continuar.");
    return;
  }
  window.raspadinhaAuth?.salvarApelido(apelido).catch((erro) => {
    console.error("Falha ao salvar o apelido:", erro);
    alert(erro?.message || "Não foi possível salvar seu nome agora. Tente de novo em instantes.");
  });
}

/**
 * Fecha o popup de escolher apelido sem a pessoa confirmar nada — em
 * vez de deixar sem apelido (obrigatório pra aparecer no ranking e
 * na busca de amigos), gera um "userNNNNNN" aleatório e salva
 * sozinho. Tenta de novo com outro número no raro caso de colisão
 * com um apelido que já existe.
 */
async function fecharModalApelidoComAleatorio() {
  document.getElementById("modal-apelido").classList.add("oculto");

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const candidato = `user${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await window.raspadinhaAuth.salvarApelido(candidato);
      return;
    } catch (erro) {
      if (erro?.code !== "apelido/em-uso") {
        console.error("Falha ao gerar apelido aleatório:", erro);
        return;
      }
      // colidiu com um apelido existente -- tenta outro número
    }
  }
}

/**
 * Baixa os dados (selos, SVGs e JSONs) pro cache do navegador, pra
 * usar o app sem internet. Restrito a assinantes PRO.
 */
// Mesmo nome usado em sw.js: fica FORA do cache do app (CACHE_NAME),
// que é apagado a cada deploy -- senão os ~12 MB baixados sumiriam a
// cada atualização.
const CACHE_OFFLINE = "desbrava-offline-v1";

/* ============================================================
   CHECKOUT PIX (Asaas)
   ------------------------------------------------------------
   A chave da API do Asaas NÃO existe aqui, de propósito: qualquer
   pessoa lê o JS do app. Quem fala com o Asaas é um Apps Script
   (tools/apps-script-gerar-cobranca.gs), e o app só pede a cobrança.
   O preço também é decidido lá -- se viesse daqui, bastaria trocar
   no DevTools pra assinar por um centavo.

   Depois de implantar aquele script, cole a URL /exec abaixo.
   ============================================================ */
const URL_COBRANCA_PIX =
  "https://script.google.com/macros/s/AKfycbxcd1uXU78pQp8FSwH8ZYTpZI8uthVUluooxfiuXYpvYin-c7VfuuJfpHl8EFVLKoHi/exec";

/* Preço e período do Motoclube, só pra EXIBIÇÃO.
   ATENÇÃO: quem cobra de verdade é PRECO_PRO em
   tools/apps-script-gerar-cobranca.gs, e quem decide quanto tempo
   libera é MESES_POR_PAGAMENTO em tools/apps-script-asaas.gs. Se
   mexer aqui, mexa lá também -- senão a tela promete uma coisa e a
   cobrança faz outra. */
const PRECO_MOTOCLUBE = 9.9;
const PERIODO_MOTOCLUBE = "por mês";

/* Voucher mensal da Loja = o PRÓPRIO valor da assinatura, de
   propósito: a ideia é que o membro sempre sinta que recebe de volta
   o que pagou. Por isso é uma referência a PRECO_MOTOCLUBE e não um
   número solto -- mudou o preço, o voucher acompanha sozinho. */
const VALOR_VOUCHER_MOTOCLUBE = PRECO_MOTOCLUBE;

// Cobrança aberta no momento (id do Asaas + copia e cola).
let cobrancaAtual = null;

/**
 * Pede uma cobrança Pix ao Apps Script e devolve
 * { id, payloadCode, encodedImage, valor }.
 *
 * `Content-Type: text/plain` NÃO é descuido: com application/json o
 * navegador dispara um preflight OPTIONS, que o Apps Script não sabe
 * responder, e a chamada morre em erro de CORS. Como não dá pra
 * escrever cabeçalho de resposta no ContentService, o jeito é não
 * provocar o preflight. Mesmo truque do enviarParaPlanilha em
 * js/auth.js.
 */
/** ID token de quem está logado, ou null. Os Apps Script usam ele pra
    saber QUEM está pedindo, em vez de acreditar num uid do corpo. */
async function idTokenAtual() {
  try {
    return (await window.raspadinhaAuth?.usuarioAtual?.getIdToken?.()) || null;
  } catch (erro) {
    console.error("Falha ao obter o ID token:", erro);
    return null;
  }
}

async function solicitarPix({ tipo = "pro", valor, descricao, cpf, uid, nome }) {
  if (!URL_COBRANCA_PIX || URL_COBRANCA_PIX.startsWith("SUBSTITUA")) {
    throw new Error("O checkout ainda não foi configurado.");
  }

  const resposta = await fetch(URL_COBRANCA_PIX, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    // O uid continua indo por compatibilidade, mas quem manda do outro
    // lado e o token (ver uidDoToken_ no Apps Script).
    body: JSON.stringify({ tipo, valor, descricao, cpf, uid, nome, idToken: await idTokenAtual() }),
  });

  if (!resposta.ok) throw new Error("Não foi possível falar com o servidor de pagamento.");
  const dados = await resposta.json();
  if (!dados.ok) throw new Error(dados.erro || "Não foi possível gerar o Pix.");
  return dados;
}

/** Abre o checkout. `tipo` é "pro" ou "loja". */
function abrirCheckout({ tipo = "pro", valor = null, descricao = "Assinatura Motoclube Desbrava" } = {}) {
  if (!window.raspadinhaAuth?.usuarioAtual) {
    alert("Faça login antes de assinar.");
    return;
  }

  cobrancaAtual = { tipo, valor, descricao };
  document.getElementById("checkout-descricao").textContent = descricao;
  document.getElementById("input-cpf-checkout").value = "";
  document.getElementById("checkout-erro").classList.add("oculto");
  mostrarEtapaCheckout("cpf");
  document.getElementById("modal-checkout").classList.remove("oculto");
}

function fecharCheckout() {
  fecharComAnimacao(document.getElementById("modal-checkout"));
  cobrancaAtual = null;
  // Sem isto o listener sobrevive ao fechamento e vai se acumulando a
  // cada checkout aberto.
  pararDeObservarAssinatura?.();
  pararDeObservarAssinatura = null;
  clearInterval(timerVerificacaoPix);
  timerVerificacaoPix = null;
}

function mostrarEtapaCheckout(etapa) {
  ["cpf", "carregando", "pix", "sucesso"].forEach((nome) => {
    document
      .getElementById(`checkout-etapa-${nome}`)
      .classList.toggle("oculto", nome !== etapa);
  });
}

/* Cancelador do listener da assinatura (ver observarAssinatura em
   js/auth.js). Guardado aqui pra ser desligado ao fechar o checkout. */
let pararDeObservarAssinatura = null;

/* Timer da verificação ativa (ver verificarPagamentoAgora). */
let timerVerificacaoPix = null;

/* De quanto em quanto tempo o app pergunta se a cobrança foi paga, e
   por quanto tempo insiste. 8s cobre o Pix (que confirma em segundos)
   sem torrar a cota de UrlFetch do Apps Script; depois de 10 minutos
   quem ainda não pagou provavelmente desistiu, e sobra o botão "Já
   paguei" pra forçar. */
const INTERVALO_VERIFICACAO_PIX = 8000;
const LIMITE_VERIFICACAO_PIX = 10 * 60 * 1000;

/**
 * Pergunta ao servidor se a cobrança já foi paga.
 *
 * Esta é a rede de segurança do webhook. Se o Asaas não conseguir
 * avisar o Apps Script, quem pagou ficaria sem nada e sem explicação --
 * foi o que aconteceu na estreia. Aqui o app não espera ser avisado:
 * ele pergunta.
 *
 * Quando o servidor libera, ele escreve no Firestore, e é o listener de
 * observarPagamentoDoCheckout que troca a tela. Ou seja: os dois
 * caminhos (webhook e verificação) desembocam no mesmo lugar, e vale o
 * que chegar primeiro.
 */
async function verificarPagamentoAgora() {
  const id = cobrancaAtual?.id || null;
  // O uid vai junto de propósito: sem ele, só a cobrança desta sessão
  // seria consultada, e quem pagou numa sessão anterior (fechou o app,
  // reinstalou, trocou de aparelho) nunca seria encontrado -- a tela
  // sempre gera uma cobrança nova. Com o uid, o servidor procura
  // QUALQUER pagamento da pessoa.
  const uid = window.raspadinhaAuth?.usuarioAtual?.uid || null;
  if ((!id && !uid) || !URL_COBRANCA_PIX || URL_COBRANCA_PIX.startsWith("SUBSTITUA")) return false;

  try {
    const resposta = await fetch(URL_COBRANCA_PIX, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ acao: "verificar", id, uid, idToken: await idTokenAtual() }),
    });
    // Devolve a resposta INTEIRA, não só um booleano. "Pago mas não
    // liberado" (Firestore recusou, projeto não configurado) precisa
    // ser distinguível de "não pago" -- tratar os dois igual foi o que
    // fez uma falha de configuração parecer que nada acontecia.
    return await resposta.json();
  } catch (erro) {
    // Sem rede, sem drama: o próximo ciclo tenta de novo.
    console.warn("Falha ao verificar o pagamento:", erro);
    return null;
  }
}

/**
 * Encerra o checkout como vitória: marca a conta, destranca a UI e
 * mostra a tela de sucesso.
 *
 * Chamado tanto pelo listener do Firestore quanto pela verificação
 * ativa. A verificação não espera o listener de propósito -- se o
 * servidor já confirmou que liberou, depender de mais um caminho pra
 * exibir a notícia só cria mais um jeito de falhar.
 */
function concluirCheckoutComSucesso() {
  pararDeObservarAssinatura?.();
  pararDeObservarAssinatura = null;
  clearInterval(timerVerificacaoPix);
  timerVerificacaoPix = null;

  if (window.raspadinhaAuth) window.raspadinhaAuth.contaEhPro = true;
  mostrarEtapaCheckout("sucesso");
  atualizarBotaoAssinarPro();
}

/**
 * Fica de olho no Firestore enquanto o QR Code está na tela e comemora
 * sozinho quando o pagamento cai.
 *
 * Quem confirma o Pix é o webhook do Asaas, fora do app -- então não há
 * nada pra "esperar" no fetch do checkout. O caminho é o inverso: o
 * webhook escreve `ehPro`, e o listener do Firestore avisa a tela.
 */
function observarPagamentoDoCheckout() {
  pararDeObservarAssinatura?.();

  // Caminho 2: perguntar de tempos em tempos, sem depender do webhook.
  clearInterval(timerVerificacaoPix);
  const comecou = Date.now();
  timerVerificacaoPix = setInterval(() => {
    if (Date.now() - comecou > LIMITE_VERIFICACAO_PIX) {
      clearInterval(timerVerificacaoPix);
      timerVerificacaoPix = null;
      return;
    }
    verificarPagamentoAgora().then((dados) => {
      if (dados?.pago && dados?.liberado) concluirCheckoutComSucesso();
    });
  }, INTERVALO_VERIFICACAO_PIX);

  // Caminho 1: o Firestore avisando. Os dois terminam aqui.
  pararDeObservarAssinatura = window.raspadinhaAuth?.observarAssinatura?.(() => {
    if (!souMembroMotoclube()) return;

    pararDeObservarAssinatura?.();
    pararDeObservarAssinatura = null;
    clearInterval(timerVerificacaoPix);
    timerVerificacaoPix = null;
    mostrarEtapaCheckout("sucesso");
    // Destranca o que estava atrás do paywall sem exigir reabrir o app:
    // esconde o botão de assinar e revela a Garagem no menu. O crachá do
    // Perfil não precisa de refresh -- ele é montado em abrirPerfil().
    atualizarBotaoAssinarPro();
  });
}

/** 12345678909 -> 123.456.789-09, enquanto a pessoa digita. */
function formatarCpf(valor) {
  const d = String(valor).replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

async function aoGerarPix() {
  const erroEl = document.getElementById("checkout-erro");
  const cpf = document.getElementById("input-cpf-checkout").value.replace(/\D/g, "");

  erroEl.classList.add("oculto");
  if (cpf.length !== 11) {
    erroEl.textContent = "Digite os 11 números do CPF.";
    erroEl.classList.remove("oculto");
    return;
  }

  mostrarEtapaCheckout("carregando");

  try {
    const dados = await solicitarPix({
      tipo: cobrancaAtual?.tipo || "pro",
      valor: cobrancaAtual?.valor,
      descricao: cobrancaAtual?.descricao,
      cpf,
      uid: window.raspadinhaAuth.usuarioAtual.uid,
      nome: window.raspadinhaAuth.apelido || "Desbravador",
    });

    cobrancaAtual = { ...cobrancaAtual, ...dados };

    // O Asaas devolve o PNG em base64, sem o prefixo data:.
    document.getElementById("checkout-qr").src = `data:image/png;base64,${dados.encodedImage}`;
    document.getElementById("checkout-valor").textContent = `R$ ${Number(dados.valor)
      .toFixed(2)
      .replace(".", ",")}`;
    document.getElementById("checkout-codigo-pix").textContent = dados.payloadCode || "";
    mostrarEtapaCheckout("pix");
    observarPagamentoDoCheckout();
  } catch (erro) {
    console.error("Falha ao gerar Pix:", erro);
    erroEl.textContent = erro.message || "Não foi possível gerar o Pix.";
    erroEl.classList.remove("oculto");
    mostrarEtapaCheckout("cpf");
  }
}

/**
 * "Já paguei": verifica na hora, em vez de esperar o próximo ciclo.
 *
 * Se o pagamento realmente caiu, quem troca a tela é o listener do
 * Firestore -- aqui só damos o retorno de que a consulta aconteceu,
 * pra ninguém ficar clicando achando que o botão está morto.
 */
async function aoClicarJaPaguei() {
  const botao = document.getElementById("btn-ja-paguei-verificar");
  const original = "Já paguei — verificar agora";

  botao.disabled = true;
  botao.textContent = "Verificando...";

  const dados = await verificarPagamentoAgora();

  if (dados?.pago && dados?.liberado) {
    concluirCheckoutComSucesso();
    return;
  }

  // Pagamento existe, mas o servidor não conseguiu gravar a liberação.
  // Quase sempre é configuração do Apps Script (FIREBASE_PROJECT_ID
  // ausente ou escopo do Firestore não autorizado). Dizer "ainda não
  // caiu" aqui seria mentir e esconder o problema real.
  console.warn("Verificação de pagamento sem sucesso. Resposta do servidor:", dados);
  const mensagem = dados?.pago
    ? "Pagamento encontrado, mas a liberação falhou"
    : dados?.ok === false
      ? "Erro no servidor de pagamento"
      : "Ainda não caiu — tente em instantes";

  botao.textContent = mensagem;
  setTimeout(() => {
    botao.textContent = original;
    botao.disabled = false;
  }, 3200);
}

/**
 * "Já sou membro / já paguei", no paywall.
 *
 * Procura qualquer pagamento da conta no Asaas, sem criar cobrança
 * nova. É a saída pra quem pagou e voltou depois -- reinstalou o app,
 * trocou de aparelho, ou simplesmente fechou a tela do Pix.
 */
async function aoRecuperarAssinatura() {
  const botao = document.getElementById("btn-paywall-ja-paguei");
  const original = "Já sou membro / já paguei";

  botao.disabled = true;
  botao.textContent = "Procurando seu pagamento...";

  const dados = await verificarPagamentoAgora();

  if (dados?.pago && dados?.liberado) {
    fecharPaywallMotoclube();
    if (window.raspadinhaAuth) window.raspadinhaAuth.contaEhPro = true;
    atualizarBotaoAssinarPro();
    // Reaproveita o toast do login (é o único genérico do app) e some
    // sozinho -- ele não tem auto-hide próprio.
    mostrarToastLogin("🏍️ Bem-vindo de volta ao Motoclube!");
    atualizarToastLogin("sucesso", "🏍️ Bem-vindo de volta ao Motoclube!");
    setTimeout(esconderToastLogin, 3200);
    return;
  }

  // Log completo: é o que permite distinguir "não pagou" de "consultei
  // a conta errada" sem abrir o servidor.
  console.error("Recuperação de assinatura falhou. Resposta do servidor:", dados);

  botao.textContent = dados?.pago
    ? "Pagamento encontrado, mas a liberação falhou"
    : dados?.ok === false
      ? "Erro no servidor de pagamento"
      : "Nenhum pagamento encontrado nesta conta";
  setTimeout(() => {
    botao.textContent = original;
    botao.disabled = false;
  }, 3200);
}

async function copiarCodigoPix() {
  const codigo = cobrancaAtual?.payloadCode;
  if (!codigo) return;
  const botao = document.getElementById("btn-copiar-codigo-pix");

  let copiou = false;
  try {
    await navigator.clipboard.writeText(codigo);
    copiou = true;
  } catch (erro) {
    // clipboard exige contexto seguro e, em WebView, nem sempre está
    // disponível -- este fallback é o que salva no APK.
    const campo = document.createElement("textarea");
    campo.value = codigo;
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    try {
      // execCommand devolve false quando o navegador recusa em vez de
      // lançar -- sem checar o retorno, a falha passava batida.
      copiou = document.execCommand("copy");
    } catch (erro2) {
      console.error("Não foi possível copiar o código Pix:", erro2);
    }
    campo.remove();
  }

  // Dizer "copiado" sem ter copiado é pior que admitir a falha: a
  // pessoa cola nada no banco e acha que o app travou.
  botao.textContent = copiou ? "✓ Código copiado!" : "Não consegui copiar — use o QR Code";
  setTimeout(() => (botao.textContent = "Copiar código Pix"), 2600);
}

/* ============================================================
   PAYWALL DO MOTOCLUBE
   ------------------------------------------------------------
   Tela de venda única, aberta por exigirMotoclube() sempre que
   alguém sem assinatura ativa toca num recurso pago. Quem já pagou
   nunca vê isto.
   ============================================================ */
function abrirPaywallMotoclube() {
  if (!window.raspadinhaAuth?.usuarioAtual) {
    exigirLogin(() => abrirPaywallMotoclube());
    return;
  }

  const renovando = assinaturaMotoclubeVencida();

  document.getElementById("paywall-titulo").textContent = renovando
    ? "Sua assinatura venceu"
    : "Junte-se ao Motoclube Desbrava";
  document.getElementById("paywall-subtitulo").textContent = renovando
    ? "Renove para voltar a usar o Modo Viagem, o mapa offline e as dicas do Motoclube."
    : "Desbloqueie a experiência completa para suas viagens.";
  document.getElementById("btn-paywall-assinar").textContent = renovando
    ? "Renovar acesso"
    : "Quero fazer parte";

  document.getElementById("paywall-preco-valor").textContent = `R$ ${PRECO_MOTOCLUBE.toFixed(2).replace(".", ",")}`;
  document.getElementById("paywall-preco-periodo").textContent = PERIODO_MOTOCLUBE;

  document.getElementById("modal-paywall").classList.remove("oculto");
}

function fecharPaywallMotoclube() {
  fecharComAnimacao(document.getElementById("modal-paywall"));
}

/** Do paywall pro checkout: fecha um, abre o outro. */
function aoAssinarPeloPaywall() {
  const renovando = assinaturaMotoclubeVencida();
  fecharPaywallMotoclube();
  abrirCheckout({
    tipo: "pro",
    descricao: renovando ? "Renovação Motoclube Desbrava" : "Assinatura Motoclube Desbrava",
  });
}

/** Esconde o botão de assinar pra quem já tem assinatura ativa, e
 *  reaparece com "Renovar" quando o prazo passa. */
function atualizarBotaoAssinarPro() {
  const botao = document.getElementById("btn-assinar-pro");
  if (!botao) return;
  const logado = !!window.raspadinhaAuth?.usuarioAtual;
  botao.classList.toggle("oculto", !logado || souMembroMotoclube());
  botao.textContent = assinaturaMotoclubeVencida()
    ? "🏍️ Renovar acesso ao Motoclube"
    : "🏍️ Entrar para o Motoclube Desbrava";

  // O cadeado dos cards do Motoclube depende de ser membro, e essa
  // decisão era tomada uma vez só na inicialização -- antes do login
  // terminar. Reavaliada aqui, a cada mudança de conta.
  if (typeof aplicarEstadoDeMembro === "function" && motoclubeEstaAberto()) aplicarEstadoDeMembro();
}

/**
 * Baixa selos, mapas SVG e os JSONs de dados pro CacheStorage, pra
 * usar o app sem internet. Recurso do PRO.
 *
 * A lista vem de data/offline-manifest.json, gerado no build por
 * tools/montar-www.js -- assim arte nova entra sozinha no pacote.
 *
 * Quem serve isso depois é o próprio service worker: o handler de
 * imagem é cache-first e o caches.match() varre TODOS os caches, então
 * o que está aqui é encontrado sem nenhuma gambiarra.
 */
async function baixarDadosOffline() {
  if (!exigirMotoclube()) return;

  const botao = document.getElementById("btn-baixar-offline");
  const painel = document.getElementById("offline-progresso");
  const barra = document.getElementById("offline-barra-preenchida");
  const status = document.getElementById("offline-status");

  botao.disabled = true;
  painel.classList.remove("oculto");
  barra.style.width = "0%";
  status.textContent = "Preparando...";

  try {
    const respostaManifesto = await fetch("data/offline-manifest.json", { cache: "no-store" });
    if (!respostaManifesto.ok) throw new Error("Lista de arquivos offline indisponível.");
    const { arquivos } = await respostaManifesto.json();
    if (!arquivos?.length) throw new Error("Lista de arquivos offline vazia.");

    const cache = await caches.open(CACHE_OFFLINE);
    let prontos = 0;
    let falhas = 0;

    // De 6 em 6: sem limite, 300+ requisições de uma vez fazem a
    // WebView engasgar e a barra de progresso trava sem nada acontecer.
    const LOTE = 6;
    for (let i = 0; i < arquivos.length; i += LOTE) {
      const fatia = arquivos.slice(i, i + LOTE);
      await Promise.all(
        fatia.map(async (caminho) => {
          try {
            // Arquivo já baixado não é rebaixado: reabrir a tela e
            // mandar de novo não custa 12 MB toda vez.
            if (!(await cache.match(caminho))) await cache.add(caminho);
          } catch (erro) {
            falhas++; // arte que ainda não existe, offline no meio etc.
          } finally {
            prontos++;
          }
        })
      );

      const pct = Math.round((prontos / arquivos.length) * 100);
      barra.style.width = `${pct}%`;
      status.textContent = `Baixando mapa e selos: ${pct}%`;
    }

    barra.style.width = "100%";
    status.textContent = falhas
      ? `Pronto! ${arquivos.length - falhas} de ${arquivos.length} arquivos guardados.`
      : "Tudo pronto! O mapa e os selos funcionam sem internet.";
    botao.textContent = "✓ Dados offline atualizados";
  } catch (erro) {
    console.error("Falha ao baixar dados offline:", erro);
    status.textContent = "Não foi possível baixar agora. Tente de novo com uma conexão melhor.";
  } finally {
    botao.disabled = false;
  }
}

/**
 * Apelido histórico de souMembroMotoclube(). O produto pago virou um
 * só ("Motoclube Desbrava"), então não existem mais dois níveis --
 * mantido só pra não reescrever as chamadas antigas.
 */
function ehUsuarioPro() {
  return souMembroMotoclube();
}

/**
 * Carrega data/destinos.json (pontos turísticos por município).
 * Hoje só tem alguns municípios preenchidos; os demais simplesmente
 * não aparecem na lista de destinos do popup.
 */
function carregarDestinos() {
  fetch("data/destinos.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      destinosPorMunicipio = dados;
      // Os medalhões só podem ser desenhados depois que os destinos
      // chegam -- é daqui que saem as coordenadas.
      renderizarPontosTuristicos();
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/destinos.json:", erro);
    });
}

/**
 * Carrega data/curiosidades.json (história/curiosidade de cada
 * município, liberada só depois de raspar o selo — ver
 * mostrarCuriosidade). Vazio até o usuário preencher.
 */
function carregarCuriosidades() {
  fetch("data/curiosidades.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      curiosidadesPorMunicipio = dados;
    })
    .catch(() => {
      // Arquivo ainda nao existe/preenchido -- sem problema, so nao
      // mostra curiosidade nenhuma.
    });
}

/**
 * Carrega os limites geográficos reais dos 92 municípios
 * (data/rj-municipios.geojson, o mesmo arquivo usado pra gerar o
 * SVG) — usado só pra verificar se a pessoa está mesmo dentro do
 * município na hora de confirmar uma visita (ver
 * verificarPresencaNoMunicipio).
 */
function carregarGeoJsonMunicipios() {
  return fetch("data/rj-municipios.geojson")
    .then((resposta) => (resposta.ok ? resposta.json() : null))
    .then((geo) => {
      if (!geo?.features) return;
      geo.features.forEach((feature) => {
        geojsonMunicipios[feature.properties.id] = feature.geometry.coordinates;
      });
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/rj-municipios.geojson:", erro);
    });
}

// { "serrana": { nome: "Região Serrana", municipios: [...codigos IBGE] } }
let regioesInfo = {};

function carregarRegioesInfo() {
  fetch("data/regioes.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      regioesInfo = dados;
      // Os rótulos de região no mapa podem ter sido montados antes disto
      // (com o slug); agora que os nomes chegaram, reconstrói com eles.
      renderizarRotulosRegioes();
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/regioes.json:", erro);
    });
}

// Resumo em texto de cada região (a preencher depois pelo usuário).
// { "serrana": { resumo: "..." } }
let resumosPorRegiao = {};

function carregarResumosRegioes() {
  fetch("data/regioes-resumo.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      resumosPorRegiao = dados;
    })
    .catch(() => {
      // Arquivo ainda nao existe/preenchido -- sem problema, o
      // popup de regiao so nao mostra resumo nenhum.
    });
}

// Rotas temáticas (agrupamento curado de municípios, ex: "Rota do
// Café Fluminense") -- diferente das 8 regiões (que vêm do SVG e
// particionam o estado inteiro), rotas são definidas só em
// data/rotas.json e podem se sobrepor livremente.
// { "cafe-fluminense": { nome, descricao, historia, municipios: [...] } }
let rotasInfo = {};

function carregarRotasInfo() {
  fetch("data/rotas.json")
    .then((resposta) => (resposta.ok ? resposta.json() : {}))
    .then((dados) => {
      rotasInfo = dados;
    })
    .catch((erro) => {
      console.error("Não foi possível carregar data/rotas.json:", erro);
    });
}

/**
 * Controla arrastar (mover) e zoom do mapa principal:
 * - Mouse: arrastar move o mapa; roda do mouse dá zoom.
 * - Toque: 1 dedo move o mapa; 2 dedos (pinça) dão zoom e movem.
 * - Duplo clique/toque reseta o zoom.
 * Marca `mapaFoiArrastado` quando o movimento passa de um limiar
 * pequeno, para não abrir a raspadinha sem querer ao soltar o dedo
 * depois de mover o mapa (ver aoClicarMunicipio).
 */
function inicializarPanZoomDoMapa() {
  const viewport = document.getElementById("mapa-viewport");
  const svg = document.getElementById("mapa-rj");
  // 10 -> 18 -> 40. A letra tem tamanho fixo na tela e, a partir da
  // v0.11.40, a divisa também afina conforme se aproxima (ver
  // .municipio em css/styles.css). Sem essas duas coisas, aproximar
  // mais só engordava traço e texto; com elas, o espaço extra vira
  // lugar pra detalhe dentro do município.
  const ESCALA_MAXIMA = 40;
  const LIMIAR_ARRASTO = 5;
  /* Fracao minima da TELA que precisa continuar coberta por mapa, mesmo
   * arrastando pro canto mais longe possivel -- a pessoa nao pode
   * "se perder" olhando pro vazio sem saber como voltar.
   *
   * DA TELA, e nao do mapa: era do mapa antes, e isso tornava as
   * extremidades inalcancaveis no zoom alto. Exigir "10% do mapa na
   * tela" fica cada vez mais caro conforme o mapa cresce, porque 10% de
   * um mapa ampliado 40x e enorme; a conta so fechava ate escala 5.
   * Dai pra cima o mapa era puxado de volta pro centro e nao dava pra
   * aproximar de Paraty nem de Itaperuna. Medido em fracao de TELA, o
   * limite acompanha o zoom e a borda fica sempre alcancavel. */
  const FRACAO_MINIMA_VISIVEL = 0.1;
  // Bem afastado (perto da escala minima) mostra as 8 regioes; a
  // partir daqui, mostra os 92 municipios individualmente.
  const LIMIAR_MUNICIPIOS = 1.8;
  // So a partir daqui os nomes dos municipios aparecem (senao
  // lotam a tela quando da pra ver muitos de uma vez).
  const LIMIAR_ROTULOS = 3.5;

  let escala = 1;
  let deslocX = 0;
  let deslocY = 0;

  /**
   * Limita deslocX/deslocY pra que pelo menos FRACAO_MINIMA_VISIVEL da
   * TELA continue coberta por mapa, em qualquer zoom.
   *
   * O tamanho usado é o do DESENHO, não o do elemento: o <svg> ocupa a
   * tela inteira, mas o mapa dentro dele é encaixado pelo
   * preserveAspectRatio e sobra faixa vazia em cima e embaixo. Medindo
   * pelo elemento, a faixa vazia contaria como "mapa visível" e daria
   * pra parar numa tela sem nada.
   */
  function limitarDesloc() {
    const rect = viewport.getBoundingClientRect();
    const caixa = svg.viewBox.baseVal;
    // Quanto o viewBox encolhe pra caber no elemento (o "meet" do
    // preserveAspectRatio pega o menor dos dois fatores).
    const ajuste = caixa && caixa.width ? Math.min(rect.width / caixa.width, rect.height / caixa.height) : 1;
    const desenhoLargura = (caixa?.width || rect.width) * ajuste * escala;
    const desenhoAltura = (caixa?.height || rect.height) * ajuste * escala;

    // O mapa vai de (centro + desloc - metade) a (centro + desloc +
    // metade). Pra sobrar FRACAO da tela coberta dos dois lados, o
    // deslocamento cabe nesta folga -- que cresce junto com o zoom, e é
    // isso que mantém a borda alcançável.
    const limiteX = desenhoLargura / 2 + rect.width * (0.5 - FRACAO_MINIMA_VISIVEL);
    const limiteY = desenhoAltura / 2 + rect.height * (0.5 - FRACAO_MINIMA_VISIVEL);
    deslocX = Math.max(-limiteX, Math.min(limiteX, deslocX));
    deslocY = Math.max(-limiteY, Math.min(limiteY, deslocY));
  }

  function aplicarTransform() {
    limitarDesloc();
    svg.style.transform = `translate(${deslocX}px, ${deslocY}px) scale(${escala})`;
    atualizarModoDeVisualizacao(escala, LIMIAR_MUNICIPIOS, LIMIAR_ROTULOS);
    /* Os chips de clima são HTML em pixels de tela, fora do <svg> --
       não acompanham o transform sozinhos. Reposicionar a cada quadro
       do arrasto travaria, então o redesenho é agrupado (ver
       agendarRedesenhoDeClima). Sai barato quando o Modo Clima está
       desligado: a função retorna na primeira linha. */
    agendarRedesenhoDeClima();
  }

  /**
   * Muda a escala mantendo fixo, na tela, o ponto (ancoraX, ancoraY)
   * em coordenadas de viewport (ex: centro da tela na roda do mouse,
   * ponto médio dos dois dedos na pinça). Sem isso, o zoom sempre
   * "puxa" o mapa de volta pro centro dele mesmo quando a visão já
   * estava deslocada pra um dos lados.
   */
  function aplicarZoomAncorado(novaEscala, ancoraX, ancoraY) {
    const rect = viewport.getBoundingClientRect();
    const origemX = rect.width / 2;
    const origemY = rect.height / 2;
    const fator = novaEscala / escala;

    deslocX = ancoraX - origemX - fator * (ancoraX - deslocX - origemX);
    deslocY = ancoraY - origemY - fator * (ancoraY - deslocY - origemY);
    escala = novaEscala;
  }

  function distanciaEMeio(touches) {
    const [a, b] = touches;
    return {
      distancia: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      meioX: (a.clientX + b.clientX) / 2,
      meioY: (a.clientY + b.clientY) / 2,
    };
  }

  // ---- Mouse: arrastar move; roda do mouse dá zoom ----
  let arrastando = false;
  let inicioX = 0;
  let inicioY = 0;
  let deslocXInicial = 0;
  let deslocYInicial = 0;

  viewport.addEventListener("mousedown", (evento) => {
    arrastando = true;
    mapaFoiArrastado = false;
    inicioX = evento.clientX;
    inicioY = evento.clientY;
    deslocXInicial = deslocX;
    deslocYInicial = deslocY;
    viewport.classList.add("arrastando");
  });

  window.addEventListener("mousemove", (evento) => {
    if (!arrastando) return;
    const dx = evento.clientX - inicioX;
    const dy = evento.clientY - inicioY;
    if (Math.abs(dx) > LIMIAR_ARRASTO || Math.abs(dy) > LIMIAR_ARRASTO) {
      mapaFoiArrastado = true;
    }
    deslocX = deslocXInicial + dx;
    deslocY = deslocYInicial + dy;
    aplicarTransform();
  });

  window.addEventListener("mouseup", () => {
    arrastando = false;
    viewport.classList.remove("arrastando");
  });

  viewport.addEventListener(
    "wheel",
    (evento) => {
      evento.preventDefault();
      const fator = evento.deltaY < 0 ? 1.15 : 1 / 1.15;
      const novaEscala = Math.min(ESCALA_MAXIMA, Math.max(1, escala * fator));
      const rect = viewport.getBoundingClientRect();
      // ancora no cursor do mouse (relativo ao viewport), nao no
      // centro fixo, entao o zoom sempre "puxa" pra onde o mouse
      // esta, nao pro meio do mapa
      aplicarZoomAncorado(novaEscala, evento.clientX - rect.left, evento.clientY - rect.top);
      if (escala === 1) {
        deslocX = 0;
        deslocY = 0;
      }
      aplicarTransform();
    },
    { passive: false }
  );

  // ---- Toque: 1 dedo move; pinça de 2 dedos dá zoom e move ----
  let toqueUnico = null;
  let pinca = null;

  viewport.addEventListener(
    "touchstart",
    (evento) => {
      mapaFoiArrastado = false;
      if (evento.touches.length === 1) {
        const t = evento.touches[0];
        toqueUnico = { x: t.clientX, y: t.clientY, deslocXInicial: deslocX, deslocYInicial: deslocY };
        pinca = null;
      } else if (evento.touches.length === 2) {
        pinca = { ...distanciaEMeio(evento.touches), escalaInicial: escala };
        toqueUnico = null;
      }
    },
    { passive: true }
  );

  viewport.addEventListener(
    "touchmove",
    (evento) => {
      if (evento.touches.length === 1 && toqueUnico) {
        evento.preventDefault();
        const t = evento.touches[0];
        const dx = t.clientX - toqueUnico.x;
        const dy = t.clientY - toqueUnico.y;
        if (Math.abs(dx) > LIMIAR_ARRASTO || Math.abs(dy) > LIMIAR_ARRASTO) {
          mapaFoiArrastado = true;
        }
        deslocX = toqueUnico.deslocXInicial + dx;
        deslocY = toqueUnico.deslocYInicial + dy;
        aplicarTransform();
      } else if (evento.touches.length === 2 && pinca) {
        evento.preventDefault();
        mapaFoiArrastado = true;
        const atual = distanciaEMeio(evento.touches);
        const fatorEscala = atual.distancia / pinca.distancia;
        const novaEscala = Math.min(ESCALA_MAXIMA, Math.max(1, pinca.escalaInicial * fatorEscala));
        const rect = viewport.getBoundingClientRect();
        // ancora no ponto medio entre os dois dedos, que tambem e
        // quem "arrasta" o mapa quando os dedos se movem juntos
        aplicarZoomAncorado(novaEscala, atual.meioX - rect.left, atual.meioY - rect.top);
        aplicarTransform();
      }
    },
    { passive: false }
  );

  viewport.addEventListener("touchend", (evento) => {
    if (evento.touches.length === 0) {
      toqueUnico = null;
      pinca = null;
    }
  });

  function resetarZoom() {
    escala = 1;
    deslocX = 0;
    deslocY = 0;
    aplicarTransform();
  }

  viewport.addEventListener("dblclick", resetarZoom);

  aplicarTransform(); // define o modo inicial (regiões, com escala 1)

  /**
   * Interface exposta pra fora do fechamento (usada pela busca de
   * município/ponto turístico): anima o mapa até centralizar um
   * município na tela com o zoom aplicado. Ancora o zoom exatamente
   * no centro atual do município na tela (mesma matemática do zoom
   * por roda do mouse) e só depois desloca (pan) esse ponto fixo até
   * o centro do viewport -- assim não precisa converter unidades do
   * viewBox do SVG pra pixels de tela.
   */
  window.controleMapa = {
    focarEmMunicipio(id, escalaAlvo = 4) {
      const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
      if (!path) return;

      const rectMunicipio = path.getBoundingClientRect();
      const rectViewport = viewport.getBoundingClientRect();
      const ancoraX = rectMunicipio.left + rectMunicipio.width / 2 - rectViewport.left;
      const ancoraY = rectMunicipio.top + rectMunicipio.height / 2 - rectViewport.top;

      svg.style.transition = "transform 0.6s ease";
      aplicarZoomAncorado(escalaAlvo, ancoraX, ancoraY);
      deslocX += rectViewport.width / 2 - ancoraX;
      deslocY += rectViewport.height / 2 - ancoraY;
      aplicarTransform();

      setTimeout(() => {
        svg.style.transition = "";
      }, 650);
    },

    /**
     * Anima o mapa até enquadrar TODOS os municípios de uma lista
     * (usado pela visão de rota temática, ver entrarModoRota) -- em
     * vez de mirar um alvo de escala fixo como focarEmMunicipio,
     * calcula a escala que faz o grupo inteiro caber com folga
     * (`margem`) dentro do viewport, ancorando o zoom no centro do
     * grupo (mesma matemática do zoom por roda do mouse).
     */
    focarEmMunicipios(ids, margem = 0.75) {
      const paths = ids
        .map((id) => document.querySelector(`#mapa-rj [data-municipio="${id}"]`))
        .filter(Boolean);
      if (!paths.length) return;

      const rectViewport = viewport.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      paths.forEach((path) => {
        const r = path.getBoundingClientRect();
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
      });

      // Desfaz a escala atual pra achar o tamanho "natural" (escala 1)
      // do grupo -- só assim dá pra calcular quanto precisa ampliar.
      const larguraGrupo = (maxX - minX) / escala;
      const alturaGrupo = (maxY - minY) / escala;
      const centroX = (minX + maxX) / 2;
      const centroY = (minY + maxY) / 2;

      const novaEscala = Math.min(
        ESCALA_MAXIMA,
        Math.max(1, Math.min((rectViewport.width * margem) / larguraGrupo, (rectViewport.height * margem) / alturaGrupo))
      );

      const ancoraX = centroX - rectViewport.left;
      const ancoraY = centroY - rectViewport.top;

      svg.style.transition = "transform 0.6s ease";
      aplicarZoomAncorado(novaEscala, ancoraX, ancoraY);
      deslocX += rectViewport.width / 2 - ancoraX;
      deslocY += rectViewport.height / 2 - ancoraY;
      aplicarTransform();

      setTimeout(() => {
        svg.style.transition = "";
      }, 650);
    },

    resetarZoom,
  };
}

/**
 * true quando o mapa está afastado o bastante pra mostrar as 8
 * regiões em vez dos 92 municípios individualmente.
 */
let modoRegioes = true;

/**
 * Chamado a cada mudança de zoom: alterna entre visão de municípios
 * e de regiões, e mostra/esconde os nomes no mapa.
 */
/* Zoom a partir do qual cada nível de nome aparece. TEM que bater com
   ZOOM_DOS_NIVEIS em tools/geojson-to-svg.js: é lá que se decide, por
   município, em qual nível o nome dele cabe. Valores diferentes fariam
   nomes aparecerem antes de haver espaço, voltando a se encavalar. */
const ZOOM_DOS_NIVEIS_ROTULO = [3.5, 5, 7, 10];

/* Aproximação a partir da qual as divisas ficam ainda mais finas (ver
   .municipio em css/styles.css). Fica FORA de ZOOM_DOS_NIVEIS_ROTULO
   de propósito: aquele array é um acordo com tools/geojson-to-svg.js
   -- mexer nele sem regerar o mapa faz nome voltar a se encavalar. */
const ZOOM_TRACO_FINO = 16;

function atualizarModoDeVisualizacao(escala, limiarMunicipios, limiarRotulos) {
  const svg = document.getElementById("mapa-rj");
  svg.classList.toggle("mostrar-rotulos", escala >= limiarRotulos);

  // O CSS divide o tamanho da letra por isto, deixando o texto do mesmo
  // tamanho na tela em qualquer aproximação (ver .rotulo-municipio em
  // css/styles.css). É o que faz aproximar realmente afastar os nomes.
  svg.style.setProperty("--zoom", escala.toFixed(2));

  // Cada nível libera os nomes dos municípios menores.
  for (let n = 1; n < ZOOM_DOS_NIVEIS_ROTULO.length; n++) {
    svg.classList.toggle(`zoom-n${n}`, escala >= ZOOM_DOS_NIVEIS_ROTULO[n]);
  }
  // Último degrau da espessura das divisas -- só CSS, não libera nome
  // nenhum.
  svg.classList.toggle("zoom-n4", escala >= ZOOM_TRACO_FINO);
  /* Pontos turísticos: surgem desbotando entre ZOOM_DOS_PONTOS e
     ZOOM_DOS_PONTOS_CHEIO. A conta fica AQUI, e não no CSS, pra os dois
     limites existirem num lugar só -- escritos dos dois lados, bastava
     mudar um pra a aparição descasar do que a classe libera. */
  svg.classList.toggle("mostrar-pontos", escala >= ZOOM_DOS_PONTOS);
  const aparicao =
    (escala - ZOOM_DOS_PONTOS) / (ZOOM_DOS_PONTOS_CHEIO - ZOOM_DOS_PONTOS);
  svg.style.setProperty("--pontos-opacidade", Math.min(1, Math.max(0, aparicao)).toFixed(3));

  const novoModoRegioes = escala < limiarMunicipios;
  // Sempre sincroniza a classe (nao so quando muda) pra garantir que
  // o estado visual inicial (contornos de regiao, bordas de
  // municipio escondidas) fique certo mesmo antes de qualquer zoom.
  svg.classList.toggle("modo-regioes", novoModoRegioes);
  if (novoModoRegioes !== modoRegioes) {
    modoRegioes = novoModoRegioes;
    aplicarEstadoNoSVG();
  }

  /* O município que merece a versão de detalhe é o do centro da tela, e
     ele muda com o arrasto -- por isso o satélite é reavaliado aqui, e
     não só ao ligar o modo. A função agrupa os pedidos sozinha. */
  agendarCamadaSatelite();
}

/**
 * Decide o que fazer ao clicar num município:
 * se já visitado, mostra o selo revelado; se não, abre a raspadinha.
 */
function aoClicarMunicipio(path) {
  if (mapaFoiArrastado) return;

  // pequeno efeito visual de "clique"
  path.classList.add("clicando");
  setTimeout(() => path.classList.remove("clicando"), 150);

  if (modoRegioes) {
    exigirLogin(() => abrirPopupRegiao(path.dataset.regiao));
  } else {
    abrirSeloPorId(path.dataset.municipio, path.dataset.nome);
  }
}

/**
 * Ponto de entrada único para abrir o selo de um município, usado
 * tanto pelo clique no mapa quanto pela biblioteca de selos.
 */
function abrirSeloPorId(id, nome) {
  municipioSelecionadoId = id;
  const jaVisitado = estadoMapa[id]?.visitado;

  if (jaVisitado) {
    visualizarSeloRevelado(id, nome);
  } else {
    abrirModalRaspadinha(id, nome);
  }
}

/**
 * Marca um município como visitado agora, salva e atualiza a UI.
 * `brilhante` já vem decidido por decidirBrilhante() — essa função só
 * persiste o resultado, nunca sorteia nada sozinha.
 */
function marcarComoVisitado(id, nome, brilhante, verificado) {
  // `|| jaVerificado`: raspar de novo não pode apagar uma verificação
  // que já aconteceu. O registro do município sobrevive ao desmarcar
  // (ver desmarcarMunicipioAtual), então esse flag continua lá.
  const jaVerificado = !!estadoMapa[id]?.verificado;
  const ficaVerificado = !!verificado || jaVerificado;

  estadoMapa[id] = {
    ...estadoMapa[id],
    visitado: true,
    dataVisita: new Date().toISOString(),
    brilhante: !!brilhante,
    chanceDecidida: true,
    verificado: ficaVerificado,
    motivoNaoVerificado: ficaVerificado ? "" : "Verificando sua localização...",
  };

  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  sincronizarMunicipioOnline(id);
  atualizarProgressoConquistas();
}

/**
 * Decide se a raspagem que está terminando agora é "brilhante"
 * (5% de chance), mas só na PRIMEIRA vez que a sorte desse município
 * é decidida:
 * - Se já tinha sido decidida antes (chanceDecidida=true), repete o
 *   mesmo resultado de sempre — desmarcar e raspar de novo não dá
 *   uma segunda chance.
 * - Municípios raspados ANTES dessa funcionalidade existir não têm
 *   chanceDecidida (undefined) — ganham a decisão na primeira vez que
 *   forem raspados de novo (por isso é preciso desmarcar pra tentar).
 * - Se houver uma raspadinha brilhante garantida por convite
 *   pendente (ver js/auth.js: consumirBoostBrilhante), ela tem
 *   prioridade sobre o sorteio aleatório.
 */
function decidirBrilhante(id) {
  const anterior = estadoMapa[id];
  if (anterior?.chanceDecidida) return !!anterior.brilhante;
  if (window.raspadinhaAuth?.consumirBoostBrilhante()) return true;
  return Math.random() < 0.05;
}

/**
 * Verdadeiro só quando o município foi raspado E a geolocalização já
 * confirmou que a pessoa estava mesmo lá. É essa checagem (não só
 * "visitado") que conta pro contador, ranking, conquistas e pra uma
 * região ser considerada completa -- raspar sem estar no local marca
 * o município de vermelho, não de verde.
 */
function estaVerificado(id) {
  const dados = estadoMapa[id];
  return !!dados?.visitado && !!dados?.verificado;
}

/**
 * Pega a localização atual do navegador (uma vez, não fica
 * observando). Rejeita com uma mensagem em português pronta pra
 * mostrar ao usuário se a permissão for negada, o navegador não
 * suportar, ou demorar demais.
 */
function obterLocalizacaoAtual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Seu navegador não tem suporte a localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const lat = posicao.coords.latitude;
        const lon = posicao.coords.longitude;
        // De carona: se a pessoa está num estado cujo mapa não veio no
        // app, baixa em segundo plano. Não dá await -- quem chamou
        // queria a coordenada, não esperar 2 MB.
        talvezBaixarMapaDoMeuEstado(lat, lon);
        resolve({ lat, lon });
      },
      (erro) => {
        const mensagens = {
          1: "Permissão de localização negada.",
          2: "Não foi possível obter sua localização agora.",
          3: "A localização demorou demais para responder.",
        };
        reject(new Error(mensagens[erro.code] || "Não foi possível obter sua localização."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

/**
 * Ray casting (par-ímpar) clássico: conta quantas vezes uma linha
 * horizontal partindo do ponto cruza as arestas do anel. Ímpar =
 * dentro, par = fora. Funciona pra qualquer polígono simples.
 */
function pontoDentroDoAnel(x, y, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0];
    const yi = anel[i][1];
    const xj = anel[j][0];
    const yj = anel[j][1];
    const cruza = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/**
 * Testa um ponto (lon, lat) contra a geometria de um município. Os
 * municípios costeiros do RJ têm partes desconectadas (ilhas +
 * continente), gravadas como vários "anéis" dentro do mesmo Polygon
 * em vez de um MultiPolygon de verdade -- então cada anel aqui é um
 * pedaço separado do território (não um buraco): o ponto conta como
 * dentro do município se cair em QUALQUER um dos anéis.
 */
function pontoDentroDoPoligono(lon, lat, aneis) {
  if (!aneis?.length) return false;
  return aneis.some((anel) => pontoDentroDoAnel(lon, lat, anel));
}

const LIMITE_VELOCIDADE_KMH = 130; // cobre estrada + margem de erro do GPS

/**
 * Distância em linha reta (km) entre duas coordenadas -- haversine
 * clássico. Não é a distância real de estrada, mas já é uma cota
 * inferior boa o bastante pra flagrar deslocamento impossível.
 */
function distanciaEmKm(lat1, lon1, lat2, lon2) {
  const raioTerraKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return raioTerraKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Detector simples de GPS falso: nenhum navegador enxerga a flag de
 * "localização simulada" do sistema operacional (isFromMockProvider,
 * só visível pra apps nativos) -- então em vez disso, comparamos a
 * distância entre duas verificações consecutivas com o tempo que
 * passou entre elas. Ninguém se desloca entre dois municípios do RJ
 * a mais de LIMITE_VELOCIDADE_KMH de verdade, então isso pega os
 * casos óbvios (quem usa um app de GPS falso "de boas"), não um
 * adversário determinado a burlar o próprio cliente -- suficiente pro
 * escopo de um app hobby (ver PENDENCIAS/README).
 *
 * NUNCA bloqueia a visita em si -- ela conta normalmente mesmo quando
 * suspeita, só dispara o registro (evita punir falso positivo, tipo
 * alguém de barco entre dois municípios litorâneos vizinhos). Sempre
 * atualiza o "último ponto confirmado" no final, mesmo quando
 * suspeito, pra próxima checagem comparar contra a leitura mais
 * recente.
 */
function avaliarDeslocamento(id, lat, lon) {
  const chave = chaveComUid("scratchMapRJ_ultima_verificacao_geo_v1");
  const agora = Date.now();
  let resultado = { suspeito: false, detalhes: null };

  try {
    const anterior = JSON.parse(localStorage.getItem(chave) || "null");
    if (anterior && anterior.municipioId !== id) {
      const distanciaKm = distanciaEmKm(anterior.lat, anterior.lon, lat, lon);
      const tempoHoras = (agora - anterior.timestampMs) / 3600000;
      const velocidadeKmh = tempoHoras > 0 ? distanciaKm / tempoHoras : Infinity;

      if (velocidadeKmh > LIMITE_VELOCIDADE_KMH) {
        resultado = {
          suspeito: true,
          detalhes: {
            municipioAnteriorId: anterior.municipioId,
            municipioNovoId: id,
            distanciaKm: Math.round(distanciaKm * 10) / 10,
            tempoMin: Math.round((agora - anterior.timestampMs) / 60000),
            velocidadeKmh: Math.round(velocidadeKmh),
          },
        };
      }
    }
  } catch (erro) {
    console.error("Falha ao avaliar deslocamento entre verificações:", erro);
  }

  localStorage.setItem(chave, JSON.stringify({ lat, lon, timestampMs: agora, municipioId: id }));

  if (resultado.suspeito) {
    window.raspadinhaAuth?.registrarAtividadeSuspeita(resultado.detalhes).catch((erro) => {
      console.error("Falha ao registrar atividade suspeita:", erro);
    });
  }

  return resultado;
}

/**
 * Confirma (ou não) que a pessoa está fisicamente dentro do
 * município `id` agora, usando a localização do navegador contra o
 * contorno geográfico real (data/rj-municipios.geojson). Nunca
 * lança erro -- sempre resolve com { verificado, motivo }, pronto
 * pra mostrar na tela quando verificado for false.
 */
async function verificarPresencaNoMunicipio(id) {
  try {
    const { lat, lon } = await obterLocalizacaoAtual();
    const poligono = geojsonMunicipios[id];
    if (!poligono) {
      return {
        verificado: false,
        motivo: "Não foi possível confirmar o limite geográfico deste município.",
      };
    }
    if (!pontoDentroDoPoligono(lon, lat, poligono)) {
      return { verificado: false, motivo: "Parece que você não está dentro deste município agora." };
    }
    avaliarDeslocamento(id, lat, lon);
    return { verificado: true, motivo: "" };
  } catch (erro) {
    return { verificado: false, motivo: erro.message };
  }
}

/**
 * Grava o resultado da verificação de localização e atualiza tudo
 * que depende dela (cor no mapa, contador, ranking, conquistas).
 */
function atualizarVerificacaoMunicipio(id, verificado, motivo) {
  if (!estadoMapa[id]) return;

  // Verificação NUNCA é rebaixada: uma vez que o GPS confirmou que a
  // pessoa esteve fisicamente ali, isso é um fato do passado e não
  // deixa de ser verdade porque ela tentou de novo de casa. Sem esta
  // guarda, desmarcar e raspar de novo longe do município apagava a
  // prova de presença (foi o que aconteceu em Rio Bonito).
  const jaEra = !!estadoMapa[id].verificado;
  estadoMapa[id].verificado = jaEra || !!verificado;
  estadoMapa[id].motivoNaoVerificado = estadoMapa[id].verificado ? "" : motivo || "";
  verificado = estadoMapa[id].verificado;
  // Consome a presença pré-confirmada assim que ela vira uma
  // verificação de verdade (ou quando uma nova verificação ao vivo
  // dá certo) -- não faz sentido mais um pendente depois disso.
  if (verificado) {
    delete estadoMapa[id].presencaConfirmadaEm;
    removerPendenteRaspagem(id);
  }
  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  sincronizarMunicipioOnline(id);
  atualizarProgressoConquistas();
}

/**
 * Descobre em qual município (id IBGE) uma coordenada cai, testando
 * contra o contorno geográfico real de cada um (mesmo dado usado na
 * verificação por GPS). Retorna null se não cair em nenhum -- ex:
 * fora do estado do Rio de Janeiro.
 */
function encontrarMunicipioPorCoordenada(lon, lat) {
  for (const id in geojsonMunicipios) {
    if (pontoDentroDoPoligono(lon, lat, geojsonMunicipios[id])) return id;
  }
  return null;
}

/**
 * Botão "🧭 Onde estou": pega a localização do navegador, descobre o
 * município correspondente, anima o mapa até lá (reaproveitando
 * `window.controleMapa.focarEmMunicipio`, o mesmo usado pela busca) e
 * marca o local com um ícone pulsante (ver `colocarMarcadorLocalAtual`).
 * Não abre o selo nem conta como visita -- é só um "você está aqui".
 */
async function mostrarOndeEstou() {
  const botao = document.getElementById("btn-onde-estou");
  botao.disabled = true;
  botao.classList.add("buscando");
  esconderToastOndeEstou();

  try {
    const { lat, lon } = await obterLocalizacaoAtual();

    /* Fora do estado que está na tela, a bússola vira só um "você está
       aqui" de nível ESTADUAL. Duas razões: a geometria fina que o app
       carrega é a do RJ (data/rj-municipios.geojson), então não dá pra
       dizer o município de quem está em Minas; e confirmar presença num
       estado não publicado marcaria progresso em cima do lugar errado.
       Antes disso, quem estivesse fora ouvia só "você parece estar fora
       do Rio de Janeiro" -- verdade, mas inútil. */
    const siglaOndeEstou = await siglaDoEstadoNoPonto(lat, lon);
    if (siglaOndeEstou && siglaOndeEstou !== estadoAtual) {
      colocarMarcadorLocalAtual(null, null);
      const estados = await carregarEstadosJson();
      const nome =
        Object.values(estados).find(
          (e) => String(e.sigla).toLowerCase() === siglaOndeEstou
        )?.nome || siglaOndeEstou.toUpperCase();
      mostrarToastOndeEstou(`📍 Você está em ${nome}.`);
      return;
    }

    // Dentro de um estado ainda não publicado não há município pra
    // apontar nem presença pra confirmar -- só a informação de onde é.
    if (emEstadoLimitado()) {
      colocarMarcadorLocalAtual(null, null);
      mostrarToastOndeEstou(
        `📍 Você está em ${nomeDoEstadoAberto}. Os municípios daqui ainda estão em desenvolvimento.`
      );
      return;
    }

    const id = encontrarMunicipioPorCoordenada(lon, lat);

    if (!id) {
      colocarMarcadorLocalAtual(null, null);
      mostrarToastOndeEstou("Você parece estar fora do Rio de Janeiro.");
      return;
    }

    const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
    window.controleMapa?.focarEmMunicipio(id);
    setTimeout(() => colocarMarcadorLocalAtual(lon, lat), 650);

    // Além de mostrar onde está, CONFIRMA a presença aqui -- assim dá
    // pra raspar este município mesmo saindo do local depois (a bússola
    // vira um "check-in" confiável, sem depender do check silencioso de
    // abertura, que exige a permissão de GPS já concedida de antes).
    const dados = estadoMapa[id];
    let confirmou = false;
    if (dados?.visitado) {
      if (!dados.verificado) {
        avaliarDeslocamento(id, lat, lon);
        atualizarVerificacaoMunicipio(id, true, "");
        confirmou = true;
      }
    } else {
      avaliarDeslocamento(id, lat, lon);
      estadoMapa[id] = { ...estadoMapa[id], presencaConfirmadaEm: new Date().toISOString() };
      salvarEstado();
      aplicarEstadoNoSVG();
      confirmou = true;
    }

    const nomeMun = path?.dataset.nome || "um município do RJ";
    mostrarToastOndeEstou(
      confirmou
        ? `📍 Você está em ${nomeMun}! Presença confirmada — já pode raspar o selo.`
        : `Você está em ${nomeMun}.`
    );
  } catch (erro) {
    mostrarToastOndeEstou(erro.message);
  } finally {
    botao.disabled = false;
    botao.classList.remove("buscando");
  }
}

/**
 * Desenha o marcador "você está aqui" na COORDENADA de verdade, como um
 * <g> dentro do próprio SVG do mapa -- assim ele acompanha o pan/zoom
 * sem precisar converter coordenada de tela. Remove o anterior.
 *
 * Antes ele era plantado no centro da caixa do município, com raio fixo
 * em unidades do desenho. Dava certo de longe, quando o município
 * inteiro cabia num ponto; de perto o marcador virava um disco enorme
 * cobrindo meia cidade, e ainda por cima no lugar errado -- o centro da
 * caixa não é onde a pessoa está, e em município comprido nem sequer
 * fica dentro dele.
 *
 * Agora usa projetarCoordenada (a mesma dos pontos turísticos) e o
 * tamanho é fixo NA TELA, dividido pelo zoom. Passe `null, null` pra
 * só apagar o marcador.
 */
function colocarMarcadorLocalAtual(lon, lat) {
  document.getElementById("marcador-local-atual")?.remove();
  if (typeof lon !== "number" || typeof lat !== "number") return;

  const pos = projetarCoordenada(lon, lat);
  if (!pos) return;

  const svg = document.getElementById("mapa-rj");
  const ns = "http://www.w3.org/2000/svg";

  const grupo = document.createElementNS(ns, "g");
  grupo.id = "marcador-local-atual";
  grupo.setAttribute("transform", `translate(${pos.x} ${pos.y})`);

  // Raio 1: quem dá o tamanho final é a escala do CSS, que desfaz o
  // zoom (ver #marcador-local-atual em css/styles.css).
  const anel = document.createElementNS(ns, "circle");
  anel.setAttribute("class", "marcador-anel");
  anel.setAttribute("r", 1);

  const ponto = document.createElementNS(ns, "circle");
  ponto.setAttribute("class", "marcador-ponto");
  ponto.setAttribute("r", 1);

  grupo.append(anel, ponto);
  svg.appendChild(grupo);
}

/**
 * Aviso flutuante simples (sucesso/erro) pro botão "Onde estou".
 * Some sozinho depois de alguns segundos.
 */
let temporizadorToastOndeEstou = null;
function mostrarToastOndeEstou(mensagem) {
  const toast = document.getElementById("toast-onde-estou");
  document.getElementById("toast-onde-estou-texto").textContent = mensagem;
  toast.classList.remove("oculto");
  clearTimeout(temporizadorToastOndeEstou);
  temporizadorToastOndeEstou = setTimeout(esconderToastOndeEstou, 4000);
}

function esconderToastOndeEstou() {
  document.getElementById("toast-onde-estou").classList.add("oculto");
}

/* ============================================================
   Notificações locais: disparadas pelo próprio app enquanto ele está
   aberto (mesmo minimizado/em outra aba) -- NÃO é push de verdade, não
   chega com o app 100% fechado (isso exigiria servidor + Firebase Cloud
   Messaging). Ativado/desativado em Configurações → Notificações
   (#check-notificacoes), preferência puramente local (dispositivo).

   Duas implementações, conforme a plataforma (ver ehAppNativo()):
   - APK (nativo): plugin @capacitor/local-notifications. A Web
     Notification API (`window.Notification`) NÃO existe no WebView do
     Android -- é por isso que o toggle sempre mostrava "seu navegador
     não suporta notificações" mesmo dentro do app instalado.
   - Web: Notification API + Service Worker (sw.js), como antes (Chrome
     no Android exige showNotification() por um Service Worker;
     `new Notification()` direto costuma falhar lá).
   ============================================================ */

const CHAVE_NOTIFICACOES_ATIVADAS = "scratchMapRJ_notificacoes_ativadas_v1";

function pluginNotificacoesLocais() {
  return (
    window.Capacitor?.Plugins?.LocalNotifications ||
    (window.Capacitor?.registerPlugin && window.Capacitor.registerPlugin("LocalNotifications")) ||
    null
  );
}

// Cache da permissão nativa: checkPermissions() é assíncrono, mas
// notificacoesPermitidas() precisa responder na hora (é chamada em
// vários pontos síncronos) -- então mantemos o último resultado
// conhecido aqui, atualizado por sincronizarCheckboxNotificacoes() e
// alternarNotificacoes(). Começa "prompt" (ainda não sabemos).
let permissaoNotificacaoNativa = "prompt";

/**
 * true só quando a permissão foi concedida E o usuário não desativou
 * manualmente o toggle em Configurações (nem o navegador nem o Android
 * deixam "revogar" a permissão via JS -- a desativação local é só uma
 * preferência nossa que soma à checagem).
 */
function notificacoesPermitidas() {
  const concedida = ehAppNativo()
    ? permissaoNotificacaoNativa === "granted"
    : typeof Notification !== "undefined" && Notification.permission === "granted";
  return concedida && localStorage.getItem(CHAVE_NOTIFICACOES_ATIVADAS) !== "false";
}

/**
 * Mostra uma notificação do sistema (fora do app), se permitido.
 * Silenciosa se não tiver permissão -- nunca interrompe o uso normal.
 */
async function dispararNotificacaoLocal(titulo, opcoes = {}) {
  if (!notificacoesPermitidas()) return;
  try {
    if (ehAppNativo()) {
      const plugin = pluginNotificacoesLocais();
      if (!plugin) return;
      // Sem "smallIcon": deixa o plugin usar o ícone padrão dele (não
      // temos um recurso drawable customizado no Android pra isso).
      await plugin.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2147483647),
            title: titulo,
            body: opcoes.body || "",
          },
        ],
      });
    } else if (navigator.serviceWorker) {
      const registro = await navigator.serviceWorker.ready;
      await registro.showNotification(titulo, {
        icon: "assets/icons/desbrava-icone.png",
        badge: "assets/icons/desbrava-icone.png",
        ...opcoes,
      });
    } else {
      new Notification(titulo, opcoes);
    }
  } catch (erro) {
    console.error("Falha ao mostrar notificação:", erro);
  }
}

/**
 * Reflete no checkbox de Configurações o estado real da permissão --
 * chamada ao carregar a página e sempre que o modal de Configurações é
 * aberto (a permissão pode ter mudado fora do app a qualquer momento).
 */
async function sincronizarCheckboxNotificacoes() {
  const checkbox = document.getElementById("check-notificacoes");
  const status = document.getElementById("notificacoes-status");

  if (ehAppNativo()) {
    const plugin = pluginNotificacoesLocais();
    if (!plugin) {
      checkbox.checked = false;
      checkbox.disabled = true;
      status.textContent = "Notificações não disponíveis nesta instalação do app.";
      status.classList.remove("oculto");
      return;
    }
    const resultado = await plugin.checkPermissions();
    permissaoNotificacaoNativa = resultado.display;
    if (resultado.display === "denied") {
      checkbox.checked = false;
      checkbox.disabled = true;
      status.textContent = "Notificações bloqueadas nas configurações do Android pro app.";
      status.classList.remove("oculto");
      return;
    }
    checkbox.disabled = false;
    status.classList.add("oculto");
    checkbox.checked = notificacoesPermitidas();
    return;
  }

  if (typeof Notification === "undefined") {
    checkbox.checked = false;
    checkbox.disabled = true;
    status.textContent = "Seu navegador não suporta notificações.";
    status.classList.remove("oculto");
    return;
  }

  if (Notification.permission === "denied") {
    checkbox.checked = false;
    checkbox.disabled = true;
    status.textContent = "Notificações bloqueadas nas configurações do navegador/site.";
    status.classList.remove("oculto");
    return;
  }

  checkbox.disabled = false;
  status.classList.add("oculto");
  checkbox.checked = notificacoesPermitidas();
}

/**
 * Clique no checkbox de Configurações: pede permissão na hora (se
 * ainda não foi decidida) ou só ativa/desativa a preferência local
 * (se a permissão já tinha sido concedida antes).
 */
async function alternarNotificacoes(ativar) {
  if (!ativar) {
    localStorage.setItem(CHAVE_NOTIFICACOES_ATIVADAS, "false");
    return;
  }

  if (ehAppNativo()) {
    const plugin = pluginNotificacoesLocais();
    if (!plugin) return;
    if (permissaoNotificacaoNativa === "prompt" || permissaoNotificacaoNativa === "prompt-with-rationale") {
      const resultado = await plugin.requestPermissions();
      permissaoNotificacaoNativa = resultado.display;
      if (resultado.display !== "granted") {
        sincronizarCheckboxNotificacoes();
        return;
      }
    }
    localStorage.setItem(CHAVE_NOTIFICACOES_ATIVADAS, "true");
    sincronizarCheckboxNotificacoes();
    return;
  }

  if (Notification.permission === "default") {
    const resultado = await Notification.requestPermission();
    if (resultado !== "granted") {
      sincronizarCheckboxNotificacoes();
      return;
    }
  }

  localStorage.setItem(CHAVE_NOTIFICACOES_ATIVADAS, "true");
  sincronizarCheckboxNotificacoes();
}

const CHAVE_ULTIMA_VERIFICACAO_LOCAL = "scratchMapRJ_ultima_verificacao_local_v1";

/**
 * Confere, silenciosamente, se a pessoa está dentro de algum município
 * agora -- chamada ao abrir o app e sempre que ele volta a ficar
 * visível (ex: usuário minimizou/trocou de app no celular e voltou).
 *
 * IMPORTANTE (limitação real da plataforma web, não só deste app): não
 * existe geofencing em segundo plano pra PWA -- nenhum navegador
 * executa JS com o app totalmente fechado. Isso aqui NÃO detecta um
 * município por onde a pessoa passou horas atrás enquanto o app
 * estava fechado; só confere a localização atual no exato momento em
 * que o app é aberto/reaberto. Também só verifica SE a permissão de
 * localização já tinha sido concedida antes (por isso não pede
 * permissão sozinho, sem contexto, toda vez que o app abre).
 */
async function verificarLocalizacaoAoAbrirApp() {
  if (!navigator.permissions?.query) return;

  const agora = Date.now();
  const ultima = Number(localStorage.getItem(CHAVE_ULTIMA_VERIFICACAO_LOCAL) || 0);
  if (agora - ultima < 2 * 60 * 1000) return; // no máximo 1x a cada 2 minutos
  localStorage.setItem(CHAVE_ULTIMA_VERIFICACAO_LOCAL, String(agora));

  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return;

    const { lat, lon } = await obterLocalizacaoAtual();
    const id = encontrarMunicipioPorCoordenada(lon, lat);
    if (!id) return;

    const path = document.querySelector(`#mapa-rj [data-municipio="${id}"]`);
    const nome = path?.dataset.nome;
    if (!nome) return;

    // Já raspado (visitado) -- NUNCA convida a raspar de novo, só
    // ainda que raro, isso não pode reaparecer mostrando "raspagem
    // disponível" pra quem já tem o selo. Só falta confirmar o local
    // (se ainda não verificado), e isso é feito sozinho, sem exigir
    // ação nenhuma.
    const dados = estadoMapa[id];
    if (dados?.visitado) {
      if (!dados.verificado) {
        avaliarDeslocamento(id, lat, lon);
        atualizarVerificacaoMunicipio(id, true, "");
        mostrarAvisoMunicipioDetectado(nome, null);
      }
      return;
    }

    // Só chega aqui se o município NUNCA foi raspado -- aí sim faz
    // sentido convidar a raspar. Salva a presença confirmada AGORA
    // (presencaConfirmadaEm), mesmo que a pessoa ignore o convite e só
    // vá raspar depois, de outro lugar -- sem isso, quem passa por um
    // município mas não para pra raspar na hora perdia a prova de
    // presença, e teria que voltar ali fisicamente só pra conseguir
    // raspar (ver uso desse campo em abrirModalRaspadinha).
    avaliarDeslocamento(id, lat, lon);
    estadoMapa[id] = { ...estadoMapa[id], presencaConfirmadaEm: new Date().toISOString() };
    salvarEstado();
    aplicarEstadoNoSVG();

    mostrarAvisoMunicipioDetectado(nome, () => {
      exigirLogin(() => {
        window.controleMapa?.focarEmMunicipio(id);
        setTimeout(() => abrirSeloPorId(id, nome), 650);
      });
    });
  } catch {
    // sem permissão/sinal/tempo esgotado -- silencioso, não interrompe o uso do app
  }
}

let temporizadorAvisoMunicipioDetectado = null;

/**
 * Aviso flutuante do "detectamos que você está em X" -- se `aoClicar`
 * for passado, mostra um botão de ação (ex: "Raspar selo"); se for
 * null, é só um aviso informativo (ex: visita que já tava pendente de
 * confirmação e acabou de ser confirmada sozinha).
 */
function mostrarAvisoMunicipioDetectado(nome, aoClicar) {
  const aviso = document.getElementById("aviso-municipio-detectado");
  const botao = document.getElementById("btn-aviso-municipio-detectado-acao");

  const mensagem = aoClicar
    ? `📍 Detectamos que você está em ${nome}!`
    : `📍 Confirmamos sua visita a ${nome}!`;
  document.getElementById("aviso-municipio-detectado-texto").textContent = mensagem;

  if (aoClicar) {
    botao.classList.remove("oculto");
    botao.onclick = () => {
      aviso.classList.add("oculto");
      aoClicar();
    };
  } else {
    botao.classList.add("oculto");
    botao.onclick = null;
  }

  aviso.classList.remove("oculto");
  clearTimeout(temporizadorAvisoMunicipioDetectado);
  temporizadorAvisoMunicipioDetectado = setTimeout(() => aviso.classList.add("oculto"), 10000);

  // Também dispara uma notificação do sistema, pra avisar mesmo se a
  // aba/app não estiver em primeiro plano no momento (ver seção de
  // notificações locais acima -- só funciona com o app ainda aberto,
  // não com ele fechado de verdade).
  dispararNotificacaoLocal(mensagem, {
    body: aoClicar ? "Toque pra raspar o selo." : "",
    tag: "municipio-detectado",
  });
}

/**
 * Botão "Verificar agora" na tela de um selo já raspado, mas ainda
 * não confirmado -- tenta de novo sem precisar raspar de novo.
 */
async function tentarVerificarLocalAgora() {
  if (!municipioSelecionadoId) return;
  const id = municipioSelecionadoId;
  const nome = document.getElementById("modal-municipio-nome").textContent;
  const botao = document.getElementById("btn-verificar-local");

  botao.disabled = true;
  botao.textContent = "Verificando...";

  const { verificado, motivo } = await verificarPresencaNoMunicipio(id);
  atualizarVerificacaoMunicipio(id, verificado, motivo);

  botao.disabled = false;
  botao.textContent = "📍 Verificar agora que estou aqui";

  if (municipioSelecionadoId === id) visualizarSeloRevelado(id, nome);
}

/* ==================== CLIMA ====================
 * Dados do Open-Meteo (ver js/clima.js, que não toca no DOM). Aqui
 * mora só o desenho: a pílula no modal do município e os chips do
 * Modo Clima no mapa.
 *
 * Clima é ENFEITE: qualquer falha some com o widget e o app segue
 * igual. Nada aqui pode derrubar o modal nem o mapa.
 */

/**
 * Lat/lon aproximada de um município, tirada da posição do RÓTULO dele.
 *
 * Não existe tabela de coordenada por município no projeto, e o rótulo
 * é a referência que já está pronta: `tools/geojson-to-svg.js` planta
 * cada nome no CENTRO DA CAIXA do município (com um desvio em 10 deles
 * pra não colidir). Aqui a projeção de projetarCoordenada() é
 * invertida pra voltar de x/y do SVG para lat/lon.
 *
 * PRECISÃO: comparado com a média dos pontos turísticos verificados de
 * cada município, o erro mediano é ~6,6 km, e o pior caso ~30 km (Angra
 * dos Reis, cujo território se espalha por muitas ilhas -- o centro da
 * caixa cai no meio do mar). Para CLIMA isso não muda nada: temperatura
 * e condição do tempo não variam nessa escala.
 *
 * Não serve, porém, pra nada que precise de posição exata -- é por isso
 * que os pontos turísticos têm coordenada própria em data/destinos.json
 * em vez de derivarem daqui.
 */
function coordenadaDoMunicipio(id) {
  const svg = document.getElementById("mapa-rj");
  const rotulo = svg?.querySelector(`.rotulo-municipio[data-municipio="${id}"]`);
  const alvo = rotulo || svg?.querySelector(`.municipio[data-municipio="${id}"]`);
  if (!svg || !alvo) return null;

  const minLon = parseFloat(svg.dataset.projLon);
  const minLat = parseFloat(svg.dataset.projLat);
  const cos = parseFloat(svg.dataset.projCos);
  const escala = parseFloat(svg.dataset.projEscala);
  const altura = parseFloat(svg.dataset.projAltura);
  if ([minLon, minLat, cos, escala, altura].some(Number.isNaN)) return null;

  let x;
  let y;
  if (rotulo) {
    x = parseFloat(rotulo.getAttribute("x"));
    y = parseFloat(rotulo.getAttribute("y"));
  } else {
    // Sem rótulo (município cujo nome não coube): centro da caixa.
    const caixa = alvo.getBBox();
    x = caixa.x + caixa.width / 2;
    y = caixa.y + caixa.height / 2;
  }
  if (Number.isNaN(x) || Number.isNaN(y)) return null;

  return { lat: (altura - y) / escala + minLat, lon: x / (cos * escala) + minLon };
}

/* Área da caixa de cada município no SVG, em cache.
 *
 * É o desempate de quem fica quando dois chips disputam o mesmo espaço.
 * A primeira ideia foi usar o `--rotulo-base` (tamanho da fonte que o
 * gerador derivou da largura), mas ele é LIMITADO entre 4.0 e 5.5 --
 * dezenas de municípios empatam no teto e a ordem volta a ser a do
 * DOM, que é alfabética. A área da caixa não satura.
 *
 * getBBox() força cálculo de layout, então o resultado é guardado: a
 * geometria do mapa não muda depois de carregada. */
const areaPorMunicipio = new Map();
function areaDoMunicipioNoMapa(id) {
  if (areaPorMunicipio.has(id)) return areaPorMunicipio.get(id);
  const path = document.querySelector(`#mapa-rj .municipio[data-municipio="${id}"]`);
  let area = 0;
  try {
    const caixa = path?.getBBox();
    if (caixa) area = caixa.width * caixa.height;
  } catch {
    /* elemento ainda não renderizado: fica 0 e cede na disputa */
  }
  areaPorMunicipio.set(id, area);
  return area;
}

/** Municípios que TÊM rótulo, com coordenada e nível de importância. */
function municipiosComRotulo() {
  const svg = document.getElementById("mapa-rj");
  if (!svg) return [];
  return [...svg.querySelectorAll(".rotulo-municipio[data-municipio]")]
    .map((rotulo) => {
      const id = rotulo.dataset.municipio;
      const coordenada = coordenadaDoMunicipio(id);
      if (!coordenada) return null;
      return {
        id,
        nivel: Number(rotulo.dataset.nivel || 0),
        peso: areaDoMunicipioNoMapa(id),
        x: parseFloat(rotulo.getAttribute("x")),
        y: parseFloat(rotulo.getAttribute("y")),
        ...coordenada,
      };
    })
    .filter(Boolean);
}

// ---------------- Pílula do modal do município ----------------

let climaDoModalToken = 0;

/**
 * Busca e desenha o clima do município que acabou de abrir.
 *
 * O `token` resolve a corrida de abrir um município e trocar pra outro
 * antes da resposta chegar: o modal é o MESMO elemento reaproveitado,
 * então sem isso o clima do primeiro apareceria dentro do segundo.
 */
async function montarClimaDoMunicipio(id) {
  const pilula = document.getElementById("clima-pilula");
  const instrumentos = document.getElementById("clima-instrumentos");
  if (!pilula || !instrumentos) return;

  // Estado limpo: some tudo e volta a pílula pro tamanho fechado.
  pilula.classList.add("oculto");
  pilula.classList.remove("expandida");
  pilula.setAttribute("aria-expanded", "false");
  instrumentos.classList.add("oculto");

  if (!id || !window.desbravaClima) return;
  const onde = coordenadaDoMunicipio(id);
  if (!onde) return;

  const meuToken = ++climaDoModalToken;
  /* doMunicipio, e nao doLugar: passa antes pelo clima que o servidor
     publica, e so vai na API se ele nao tiver este municipio. */
  const dados = await window.desbravaClima.doMunicipio(id, onde.lat, onde.lon);
  if (meuToken !== climaDoModalToken || !dados) return;

  desenharPilulaDeClima(dados);
}

function desenharPilulaDeClima(dados) {
  const pilula = document.getElementById("clima-pilula");
  const icone = window.desbravaClima.iconeDoTempo(dados.codigo, dados.ehNoite);

  document.getElementById("clima-pilula-icone").innerHTML = icone.svg;
  document.getElementById("clima-pilula-temp").textContent = `${dados.temperatura}°`;
  pilula.setAttribute(
    "aria-label",
    `${icone.rotulo}, ${dados.temperatura} graus. Toque para ver a previsão.`
  );
  pilula.title = icone.rotulo;

  // Previsão dos PRÓXIMOS 3 dias: o índice 0 é hoje, que já está na
  // temperatura atual ao lado.
  const previsao = document.getElementById("clima-pilula-previsao");
  previsao.innerHTML = "";
  /* Um ÚNICO filho dentro do grid que colapsa (ver o CSS). Com os três
     dias soltos como filhos diretos, `grid-template-rows: 0fr` zerava
     só a PRIMEIRA linha -- os outros dois caíam em linhas implícitas de
     altura automática, e a pílula "fechada" nascia com 84px em vez de
     32px, mostrando a previsão que devia estar escondida. */
  const interna = document.createElement("span");
  interna.className = "clima-previsao-interna";
  previsao.appendChild(interna);

  dados.dias.slice(1, 4).forEach((dia, indice) => {
    const item = document.createElement("span");
    item.className = "clima-dia";
    const nome = document.createElement("span");
    nome.className = "clima-dia-nome";
    // Rotulo derivado da data aqui, nao guardado no dado (ver clima.js).
    nome.textContent = window.desbravaClima.rotuloDoDia(dia.data, indice + 1);
    const desenho = document.createElement("span");
    desenho.className = "clima-dia-icone";
    desenho.innerHTML = window.desbravaClima.iconeDoTempo(dia.codigo, false).svg;
    const graus = document.createElement("span");
    graus.className = "clima-dia-temp";
    graus.innerHTML = `${dia.max}°<i>${dia.min}°</i>`;
    item.append(nome, desenho, graus);
    interna.appendChild(item);
  });

  pilula.classList.remove("oculto");

  // ---- Painel de instrumentos ----
  const instrumentos = document.getElementById("clima-instrumentos");
  const altitude = document.getElementById("instrumento-altitude");
  const porSol = document.getElementById("instrumento-porsol");
  altitude.textContent = dados.altitude === null ? "—" : `${dados.altitude} m alt.`;
  porSol.textContent = dados.porDoSol ? `Pôr do sol: ${dados.porDoSol}` : "—";
  instrumentos.classList.toggle("oculto", dados.altitude === null && !dados.porDoSol);
}

// ---------------- Modo Clima no mapa ----------------

let modoClimaLigado = false;
let redesenhoClimaAgendado = null;

/* Só municípios cujo rótulo já apareceria neste zoom entram como chip.
   Reaproveita ZOOM_DOS_NIVEIS_ROTULO em vez de inventar outra régua:
   se o nome não cabe na tela, o chip também não cabe -- e assim as
   duas coisas aparecem/somem juntas em vez de brigarem. */
function nivelVisivelDeClima(escala) {
  let maior = -1;
  ZOOM_DOS_NIVEIS_ROTULO.forEach((limite, indice) => {
    if (escala >= limite) maior = indice;
  });
  return maior;
}

/* ============ MODOS DO MAPA (camadas) ============
 *
 * Antes cada modo era um botão solto flutuando sobre o mapa. Com dois
 * já ficava apertado no canto (GPS + Clima + Modo Viagem), e cada modo
 * novo pioraria. Agora um botão só abre a folha com todos.
 *
 * PRA ACRESCENTAR UM MODO: copie um <li class="modo-item"> no
 * index.html, dê um id ao <input>, e registre aqui em MODOS. O resto
 * -- contador no botão, estado do switch, fechar a folha -- funciona
 * sozinho.
 */
const MODOS = [
  {
    id: "switch-modo-clima",
    ligado: () => modoClimaLigado,
    alternar: (deveLigar) => {
      if (deveLigar !== modoClimaLigado) alternarModoClima();
    },
  },
  {
    id: "switch-modo-satelite",
    ligado: () => modoSateliteLigado,
    alternar: (deveLigar) => {
      if (deveLigar !== modoSateliteLigado) alternarModoSatelite();
    },
    /* Volta ligado na próxima abertura do app. É por modo, e não pra
       todos: o Clima busca a temperatura de 92 municípios ao ligar, e
       ressuscitar isso sozinho a cada abertura gastaria dados de quem
       só experimentou uma vez. O satélite não tem esse custo -- o que
       já foi visto vem do cache, em 0,4 ms. */
    lembrar: true,
  },
];

/* Modos que voltam como a pessoa deixou. Uma chave por modo, e não uma
   lista, pra um valor estragado não derrubar os outros. */
const CHAVE_MODO = (id) => "desbrava_modo_" + id.replace("switch-modo-", "");

function lembrarModo(id, ligado) {
  try {
    localStorage.setItem(CHAVE_MODO(id), ligado ? "1" : "0");
  } catch {
    /* Sem armazenamento (janela anônima, cota cheia): o modo só deixa
       de ser lembrado, nada quebra. */
  }
}

/**
 * Religa os modos marcados com `lembrar` na abertura do app.
 *
 * Roda cedo, quando o progresso da pessoa ainda não chegou do
 * Firestore -- e tudo bem: sem município verificado o satélite não
 * desenha nada, e aplicarEstadoNoSVG chama agendarCamadaSatelite assim
 * que o estado carrega. A foto aparece sozinha.
 */
function restaurarModosLembrados() {
  MODOS.filter((m) => m.lembrar).forEach((m) => {
    let guardado = null;
    try {
      guardado = localStorage.getItem(CHAVE_MODO(m.id));
    } catch {
      return;
    }
    if (guardado !== "1" || m.ligado()) return;
    m.alternar(true);
    const input = document.getElementById(m.id);
    if (input) input.checked = true;
  });
}

function configurarModos() {
  const abrir = () => {
    // Sincroniza os switches ANTES de abrir: o estado pode ter mudado
    // por outro caminho (ex: o modo desligado ao sair do mapa).
    MODOS.forEach((m) => {
      const input = document.getElementById(m.id);
      if (input) input.checked = m.ligado();
    });
    document.getElementById("modal-modos").classList.remove("oculto");
  };
  const fechar = () => fecharComAnimacao(document.getElementById("modal-modos"));

  document.getElementById("btn-modos")?.addEventListener("click", abrir);
  document.getElementById("btn-fechar-modos")?.addEventListener("click", fechar);
  document.getElementById("modal-modos")?.addEventListener("click", (evento) => {
    if (evento.target.id === "modal-modos") fechar();
  });

  MODOS.forEach((m) => {
    const input = document.getElementById(m.id);
    if (!input) return;
    input.addEventListener("change", () => {
      m.alternar(input.checked);
      atualizarContadorDeModos();
    });
  });

  restaurarModosLembrados();
  atualizarContadorDeModos();
}

/**
 * Bolinha com o número de modos ligados, no canto do botão.
 *
 * Sem ela, um modo ligado ficaria invisível com a folha fechada -- a
 * pessoa veria os chips de clima no mapa sem entender de onde vieram
 * nem como desligar.
 */
function atualizarContadorDeModos() {
  const contador = document.getElementById("modos-contador");
  const botao = document.getElementById("btn-modos");
  if (!contador || !botao) return;
  const quantos = MODOS.filter((m) => m.ligado()).length;
  contador.textContent = String(quantos);
  contador.classList.toggle("oculto", quantos === 0);
  botao.classList.toggle("com-modo-ativo", quantos > 0);
}

function alternarModoClima() {
  modoClimaLigado = !modoClimaLigado;
  const camada = document.getElementById("camada-clima");
  camada.classList.toggle("oculto", !modoClimaLigado);

  /* Some com os pontos turísticos enquanto o clima está no ar: nos
     mesmos zooms em que os chips aparecem, os pinos de PT também estão
     na tela, e as duas camadas de marcador brigam pelo mesmo espaço --
     vira sopa de ícone.
     `display` direto, e não uma regra de opacidade no CSS: a opacidade
     dos pinos vem de `--pontos-opacidade`, que esta mesma função de
     zoom reescreve o tempo todo, e uma regra concorrendo com isso é
     frágil. Aqui o efeito é absoluto e não depende de cascata. */
  const svgMapa = document.getElementById("mapa-rj");
  svgMapa?.classList.toggle("modo-clima", modoClimaLigado);
  esconderPontosNoModoClima(modoClimaLigado);

  if (modoClimaLigado) redesenharChipsDeClima();
  else camada.innerHTML = "";
  // O contador do botão de Modos precisa acompanhar mesmo quando o
  // modo é alternado por outro caminho que não o switch.
  atualizarContadorDeModos();
}

/**
 * Esconde/mostra a camada de pontos turísticos no Modo Clima.
 *
 * Precisa ser REAPLICADO depois de renderizarPontosTuristicos(), que
 * destrói e recria o grupo a cada redesenho -- o estilo inline morre
 * junto, e sem isso os pinos voltariam no primeiro zoom com o Modo
 * Clima ainda ligado.
 */
function esconderPontosNoModoClima(esconder) {
  const grupo = document.getElementById("pontos-turisticos");
  if (grupo) grupo.style.display = esconder ? "none" : "";
}

/**
 * Chamado a cada transform do mapa (zoom e arrasto).
 *
 * DUAS VELOCIDADES, e essa separação é o ponto:
 *
 *  - REPOSICIONAR os chips que já existem é barato (uma multiplicação
 *    de matriz por chip) e roda AGORA, em todo quadro. Sem isso o chip
 *    ficava parado enquanto o mapa andava embaixo dele, e só pulava pro
 *    lugar quando o dedo saía da tela.
 *  - RECALCULAR quais chips cabem envolve colisão e possivelmente ir na
 *    API; isso continua agrupado (debounce), senão travaria o arrasto.
 */
/* ============================================================
   MODO SATÉLITE

   Município VERIFICADO deixa de ser mancha verde e passa a mostrar a
   foto de satélite dele, recortada na própria forma. É recompensa: só
   entra quem confirmou presença por GPS.

   Três decisões que mandam no resto:

   1. NADA de camada de tiles. Cada município é UMA imagem, pedida com
      a caixa dele em graus. O WMS da EOX serve em EPSG:4326, que é
      linear em longitude e latitude -- a mesma natureza da nossa
      projeção equirretangular. Encaixada na caixa, a foto alinha
      EXATO, sem reprojetar nada. Tile em Web Mercator erraria de 1,5 a
      2,3 km nas bordas do estado (medido).

   2. A cor do estado vai pra DIVISA, não some. Tinta verde por cima de
      foto de mata vira papa justamente onde a pessoa quer olhar (metade
      do Rio é Floresta da Tijuca). Com a foto cheia e a divisa colorida,
      verde, dourado e azul continuam legíveis.

   3. Duas resoluções medidas em METROS POR PIXEL, não em pixels.
      Município não tem tamanho fixo: o Rio tem 71 km de largura e há
      município com 10. Fixar "512 e 2048" daria nitidez diferente em
      cada um. Fixando o chão, o arquivo sai do tamanho que o lugar
      pede.

   Nada disso vai pro repositório: a imagem é buscada na hora e guardada
   no CACHE_OFFLINE, que nunca é limpo. Depois da primeira vez, funciona
   sem rede.
   ============================================================ */

const SATELITE_WMS = "https://tiles.maps.eox.at/wms";
const SATELITE_CAMADA = "s2cloudless-2020";

/* Sentinel-2 nasce com 10 m/px. 60 dá a visão geral por poucos KB; 15
   é quase o nativo e só entra quando a pessoa aproxima de verdade. */
const SATELITE_CHAO_GERAL = 60;
const SATELITE_CHAO_DETALHE = 15;

/* A partir daqui UM município ganha o detalhe: o do centro da tela. */
const SATELITE_ZOOM_DETALHE = 8;

/* E a partir daqui, TODOS os que estão à vista.

   Parece caro e não é, porque as duas coisas andam juntas: quanto mais
   perto, menos mapa cabe na tela. Medido no RJ -- no zoom 30 a tela
   cobre 13,4 km e encosta em no máximo 7 municípios (na Baixada, que é
   onde eles são menores e mais colados); no interior, 2.

   E município pequeno tem imagem pequena. Medido em 15 m/px: Nilópolis
   56 KB, São João de Meriti 88 KB, Belford Roxo 166 KB, Niterói 278 KB.
   Sete deles somam menos que UMA foto do Rio. */
const SATELITE_ZOOM_TUDO = 30;

/* Teto de segurança. Só o Rio chega nele: com 71 km de largura, 15 m/px
   pediriam 4.747 px. Todos os outros municípios do estado alcançam os
   15 m/px cheios dentro deste limite.

   Não sobe, e isso foi medido, não achismo: em 4096 px o servidor leva
   19 s pra responder (contra 12 s em 3072) pra ganhar de 23 para 17
   m/px, e acima disso ele recusa e devolve imagem de erro. O limite de
   verdade é a fonte: Sentinel-2 nasce com 10 m/px, o que no Rio seriam
   7.120 px -- que a EOX não serve. Não existe "resolução máxima" além
   disso pra pedir. */
const SATELITE_LADO_MAX = 3072;

/* Quantas imagens buscar ao mesmo tempo.

   Uma de cada vez parece seguro e não é: quem completou o estado tem 92
   municípios, e uma requisição lenta trava TODAS as outras atrás dela --
   medido, o mapa ficou 19 s parado em 14 fotos. Seis é o mesmo lote que
   o download offline já usa. */
const SATELITE_POR_VEZ = 6;

/* Km por grau de latitude na faixa do Brasil. Não precisa de precisão
   geodésica aqui -- serve só pra decidir quantos pixels pedir. */
const KM_POR_GRAU = 110.9;

let modoSateliteLigado = false;
let sateliteAgendado = null;
/* Trava: desenharCamadaSatelite espera rede, e o mapa dispara redesenho
   a cada movimento. Sem isto, duas execuções se cruzariam -- pedindo a
   mesma imagem duas vezes e podendo revogar um objectURL que a outra
   acabou de pendurar na tela. */
let sateliteDesenhando = false;
let satelitePedidoNovo = false;
/* municipioId -> { url, objeto } do que já está desenhado, pra não
   rebuscar nem revogar à toa a cada movimento do mapa. */
const sateliteDesenhado = new Map();
let sateliteAvisouFalha = false;

/** Caixa do município em graus, a partir da caixa dele no SVG. */
function bboxGeoDoMunicipio(id) {
  const svg = document.getElementById("mapa-rj");
  const path = svg?.querySelector(`.municipio[data-municipio="${id}"]`);
  if (!path) return null;

  const minLon = parseFloat(svg.dataset.projLon);
  const minLat = parseFloat(svg.dataset.projLat);
  const cos = parseFloat(svg.dataset.projCos);
  const escala = parseFloat(svg.dataset.projEscala);
  const altura = parseFloat(svg.dataset.projAltura);
  if ([minLon, minLat, cos, escala, altura].some(Number.isNaN)) return null;

  const caixa = path.getBBox();
  return {
    caixa,
    oeste: caixa.x / (cos * escala) + minLon,
    leste: (caixa.x + caixa.width) / (cos * escala) + minLon,
    norte: (altura - caixa.y) / escala + minLat,
    sul: (altura - caixa.y - caixa.height) / escala + minLat,
  };
}

/** Monta o endereço da imagem no tamanho que a resolução de chão pede. */
function urlSatelite(bbox, metrosPorPixel) {
  const latMedia = ((bbox.norte + bbox.sul) / 2) * (Math.PI / 180);
  const larguraM = (bbox.leste - bbox.oeste) * KM_POR_GRAU * Math.cos(latMedia) * 1000;
  const alturaM = (bbox.norte - bbox.sul) * KM_POR_GRAU * 1000;

  const limitar = (n) => Math.max(64, Math.min(SATELITE_LADO_MAX, Math.round(n)));
  const largura = limitar(larguraM / metrosPorPixel);
  const alturaPx = limitar(alturaM / metrosPorPixel);

  const p = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetMap",
    layers: SATELITE_CAMADA,
    styles: "",
    srs: "EPSG:4326",
    bbox: `${bbox.oeste},${bbox.sul},${bbox.leste},${bbox.norte}`,
    width: String(largura),
    height: String(alturaPx),
    format: "image/jpeg",
  });
  return `${SATELITE_WMS}?${p.toString()}`;
}

/**
 * Devolve um endereço local pra imagem, guardando-a no CACHE_OFFLINE.
 *
 * O Service Worker NÃO entra aqui: ele só trata mesma origem, de
 * propósito (resposta de imagem de outro domínio vinha opaca e derrubava
 * o cache.put -- ver v0.11.22). Como a EOX manda cabeçalho de CORS, o
 * fetch daqui devolve resposta legível e o cache aceita.
 */
async function imagemSateliteLocal(url) {
  const cache = await caches.open(CACHE_OFFLINE);
  let resposta = await cache.match(url);
  if (!resposta) {
    resposta = await fetch(url, { mode: "cors" });
    if (!resposta.ok) throw new Error(`satélite HTTP ${resposta.status}`);
    await cache.put(url, resposta.clone());
  }
  return URL.createObjectURL(await resposta.blob());
}

/** Recorte com a forma do município, criado uma vez por município. */
function garantirRecorteSatelite(id) {
  const svg = document.getElementById("mapa-rj");
  const defs = svg?.querySelector("defs");
  if (!defs) return null;
  const idRecorte = `sat-recorte-${id}`;
  if (!document.getElementById(idRecorte)) {
    const NS = "http://www.w3.org/2000/svg";
    const recorte = document.createElementNS(NS, "clipPath");
    recorte.id = idRecorte;
    const uso = document.createElementNS(NS, "use");
    uso.setAttribute("href", `#mun-${id}`);
    recorte.appendChild(uso);
    defs.appendChild(recorte);
  }
  return idRecorte;
}

/**
 * Quem ganha a versão de detalhe agora.
 *
 * Abaixo de SATELITE_ZOOM_DETALHE, ninguém. Entre ele e
 * SATELITE_ZOOM_TUDO, só o do centro da tela -- ali ainda cabe muito
 * mapa e detalhar tudo faria baixar município que a pessoa nem está
 * olhando. Acima, todos os que aparecem: a tela já cobre poucos
 * quilômetros (ver a nota nas constantes).
 */
function municipiosParaDetalhar(ids, zoom) {
  const alvo = new Set();
  if (zoom < SATELITE_ZOOM_DETALHE) return alvo;

  if (zoom < SATELITE_ZOOM_TUDO) {
    const central = municipioNoCentroDaTela();
    if (central) alvo.add(central);
    return alvo;
  }
  idsNaTela(ids).forEach((id) => alvo.add(id));
  return alvo;
}

/**
 * Quais destes municípios aparecem na tela agora.
 *
 * getBoundingClientRect do path já vem com a transformação do mapa
 * aplicada, então a conta é direta em pixels de tela. É a CAIXA, não o
 * contorno: de vez em quando entra um município que só encosta o canto.
 * Erra pro lado de incluir demais, que é o lado certo nos dois usos --
 * ordem de busca e escolha da resolução.
 */
function idsNaTela(ids) {
  const janela = document.getElementById("mapa-viewport")?.getBoundingClientRect();
  if (!janela) return [];
  return ids.filter((id) => {
    const caixa = document
      .querySelector(`#mapa-rj .municipio[data-municipio="${id}"]`)
      ?.getBoundingClientRect();
    return (
      caixa &&
      caixa.right > janela.left &&
      caixa.left < janela.right &&
      caixa.bottom > janela.top &&
      caixa.top < janela.bottom
    );
  });
}

/** Qual município está sob o centro da tela (o que vale detalhar). */
function municipioNoCentroDaTela() {
  const viewport = document.getElementById("mapa-viewport");
  if (!viewport) return null;
  const caixa = viewport.getBoundingClientRect();
  const alvo = document.elementFromPoint(
    caixa.left + caixa.width / 2,
    caixa.top + caixa.height / 2
  );
  return alvo?.classList?.contains("municipio") ? alvo.dataset.municipio : null;
}

function limparCamadaSatelite() {
  const camada = document.getElementById("camada-satelite");
  if (camada) camada.innerHTML = "";
  document
    .querySelectorAll("#mapa-rj .municipio.com-satelite")
    .forEach((p) => p.classList.remove("com-satelite"));
  sateliteDesenhado.forEach(({ objeto }) => URL.revokeObjectURL(objeto));
  sateliteDesenhado.clear();
}

/**
 * Desenha a foto de cada município verificado.
 *
 * Só um município por vez ganha a versão de detalhe: o do centro da
 * tela. Detalhar todos faria alguém com 40 municípios raspados baixar
 * dezenas de megabytes de uma vez.
 */
async function desenharCamadaSatelite() {
  // Já tem uma passada rodando: marca que o cenário mudou e sai. Quem
  // está rodando repete no fim.
  if (sateliteDesenhando) {
    satelitePedidoNovo = true;
    return;
  }
  sateliteDesenhando = true;
  try {
    await desenharCamadaSateliteAgora();
  } finally {
    sateliteDesenhando = false;
    if (satelitePedidoNovo) {
      satelitePedidoNovo = false;
      desenharCamadaSatelite();
    }
  }
}

async function desenharCamadaSateliteAgora() {
  const svg = document.getElementById("mapa-rj");
  const camada = document.getElementById("camada-satelite");
  if (!svg || !camada) return;

  // No mapa afastado o estado é mancha por região: 92 fotinhas ali não
  // seriam legíveis, só peso.
  if (!modoSateliteLigado || modoRegioes) {
    limparCamadaSatelite();
    return;
  }

  const zoom = parseFloat(svg.style.getPropertyValue("--zoom")) || 1;
  const verificados = [...svg.querySelectorAll(".municipio.visitado")].map(
    (p) => p.dataset.municipio
  );
  const detalhados = municipiosParaDetalhar(verificados, zoom);
  const vivos = new Set(verificados);

  // Município que deixou de ser verificado (ou saiu da lista) sai daqui.
  sateliteDesenhado.forEach(({ objeto }, id) => {
    if (vivos.has(id)) return;
    camada.querySelector(`.satelite-mun[data-municipio="${id}"]`)?.remove();
    svg.querySelector(`.municipio[data-municipio="${id}"]`)?.classList.remove("com-satelite");
    URL.revokeObjectURL(objeto);
    sateliteDesenhado.delete(id);
  });

  /* Em LOTES, e os visíveis primeiro. Buscar um de cada vez fazia o
     mapa de quem completou o estado ir aparecendo em conta-gotas, e uma
     requisição lenta segurava a fila inteira. */
  const fila = ordenarPorVisibilidade(verificados);
  for (let i = 0; i < fila.length; i += SATELITE_POR_VEZ) {
    if (!modoSateliteLigado) return;
    await Promise.all(
      fila.slice(i, i + SATELITE_POR_VEZ).map((id) => desenharUmSatelite(id, detalhados, camada, svg))
    );
  }
}

/** Municípios que estão na tela vêm primeiro: é o que a pessoa olha. */
function ordenarPorVisibilidade(ids) {
  const naTela = new Set(idsNaTela(ids));
  return [...ids.filter((id) => naTela.has(id)), ...ids.filter((id) => !naTela.has(id))];
}

/** Busca e desenha a foto de UM município. Falha dele não derruba os outros. */
async function desenharUmSatelite(id, detalhados, camada, svg) {
  const bbox = bboxGeoDoMunicipio(id);
  if (!bbox) return;

  const jaTem = sateliteDesenhado.get(id);
  /* Uma vez em detalhe, fica em detalhe.

     Rebaixar era desperdício puro, e era o que mais incomodava na
     prática: bastava arrastar pro vizinho pra o município anterior
     VOLTAR a ficar borrado, mesmo com a foto boa já guardada -- de onde
     ela sai em 0,4 ms. Trocar por uma pior não economiza nada e desfaz
     o que a pessoa acabou de esperar. */
  const querDetalhe = detalhados.has(id) || !!jaTem?.detalhe;
  const chao = querDetalhe ? SATELITE_CHAO_DETALHE : SATELITE_CHAO_GERAL;
  const url = urlSatelite(bbox, chao);
  // Já está na tela nessa mesma resolução: nada a fazer.
  if (jaTem && jaTem.url === url) return;

  let objeto;
  try {
    objeto = await imagemSateliteLocal(url);
  } catch (erro) {
    console.warn("Satélite indisponível para", id, erro?.message);
    if (!sateliteAvisouFalha) {
      sateliteAvisouFalha = true;
      mostrarToastOndeEstou("Sem conexão para buscar as imagens de satélite.");
    }
    return;
  }

  // O modo pode ter sido desligado enquanto a imagem vinha.
  if (!modoSateliteLigado) {
    URL.revokeObjectURL(objeto);
    return;
  }

  const idRecorte = garantirRecorteSatelite(id);
  const NS = "http://www.w3.org/2000/svg";
  let grupo = camada.querySelector(`.satelite-mun[data-municipio="${id}"]`);
  if (!grupo) {
    grupo = document.createElementNS(NS, "g");
    grupo.setAttribute("class", "satelite-mun");
    grupo.dataset.municipio = id;
    grupo.setAttribute("clip-path", `url(#${idRecorte})`);
    camada.appendChild(grupo);
  }

  const imagem = grupo.querySelector("image") || document.createElementNS(NS, "image");
  imagem.setAttribute("x", bbox.caixa.x);
  imagem.setAttribute("y", bbox.caixa.y);
  imagem.setAttribute("width", bbox.caixa.width);
  imagem.setAttribute("height", bbox.caixa.height);
  /* "none" de propósito: a caixa pedida e a caixa do desenho têm a mesma
     proporção, e forçar o encaixe garante que os cantos caiam exatamente
     onde devem, sem sobra de meio pixel. */
  imagem.setAttribute("preserveAspectRatio", "none");
  imagem.setAttribute("href", objeto);
  if (!imagem.parentNode) grupo.appendChild(imagem);

  if (jaTem) URL.revokeObjectURL(jaTem.objeto);
  sateliteDesenhado.set(id, { url, objeto, detalhe: querDetalhe });
  // Só agora o município pode abrir mão do preenchimento.
  svg.querySelector(`.municipio[data-municipio="${id}"]`)?.classList.add("com-satelite");
}

/* O mapa se move a cada quadro; buscar imagem nesse ritmo seria
   absurdo. Como no clima, o redesenho é agrupado. */
function agendarCamadaSatelite() {
  if (!modoSateliteLigado) return;
  clearTimeout(sateliteAgendado);
  sateliteAgendado = setTimeout(desenharCamadaSatelite, 220);
}

function alternarModoSatelite() {
  modoSateliteLigado = !modoSateliteLigado;
  lembrarModo("switch-modo-satelite", modoSateliteLigado);
  const svg = document.getElementById("mapa-rj");
  svg?.classList.toggle("modo-satelite", modoSateliteLigado);
  sateliteAvisouFalha = false;

  if (modoSateliteLigado) desenharCamadaSatelite();
  else limparCamadaSatelite();

  atualizarContadorDeModos();
}


function agendarRedesenhoDeClima() {
  if (!modoClimaLigado) return;
  reposicionarChipsDeClima();
  clearTimeout(redesenhoClimaAgendado);
  redesenhoClimaAgendado = setTimeout(redesenharChipsDeClima, 160);
}

/**
 * Move os chips existentes pra acompanhar o mapa, sem recalcular nada.
 *
 * Cada chip guarda a coordenada dele em unidades do SVG (data-sx/data-sy);
 * aqui ela só é convertida pra pixel de tela com a matriz do momento.
 * É o que faz o chip parecer PREGADO no município durante o arrasto.
 */
function reposicionarChipsDeClima() {
  const svg = document.getElementById("mapa-rj");
  const camada = document.getElementById("camada-clima");
  if (!svg || !camada) return;
  const matriz = svg.getScreenCTM();
  if (!matriz) return;

  const area = camada.getBoundingClientRect();
  for (const chip of camada.querySelectorAll(".clima-chip")) {
    const sx = parseFloat(chip.dataset.sx);
    const sy = parseFloat(chip.dataset.sy);
    if (Number.isNaN(sx) || Number.isNaN(sy)) continue;
    const ponto = new DOMPoint(sx, sy).matrixTransform(matriz);
    chip.style.left = `${ponto.x - area.left}px`;
    chip.style.top = `${ponto.y - area.top}px`;
  }
}

/**
 * Desenha os chips: escolhe quem cabe, busca o clima de todos numa
 * chamada só e posiciona.
 *
 * ANTI-POLUIÇÃO, em três filtros que se somam:
 *  1. nível do rótulo x zoom (cidade pequena só aparece de perto);
 *  2. está dentro da tela? (não gasta requisição com quem está fora);
 *  3. a caixa do chip encosta em outro já colocado? Então não entra.
 * O 3 percorre em ordem de importância, então quem fica é sempre a
 * cidade mais relevante do aglomerado -- e não a primeira do alfabeto.
 */
async function redesenharChipsDeClima() {
  const camada = document.getElementById("camada-clima");
  const svg = document.getElementById("mapa-rj");
  if (!camada || !svg || !modoClimaLigado || !window.desbravaClima) return;

  const escala = parseFloat(svg.style.getPropertyValue("--zoom")) || 1;
  const nivelMaximo = nivelVisivelDeClima(escala);
  if (nivelMaximo < 0) {
    /* Afastado demais: nem o maior município mostra nome, então chip
       nenhum caberia. Em vez de deixar a tela igual -- com o botão
       aceso e nada acontecendo, que parece defeito -- explica o que
       fazer. Este é o único texto da camada; some no primeiro zoom. */
    camada.innerHTML =
      '<p class="clima-aviso-zoom">Aproxime o mapa para ver o clima das cidades</p>';
    return;
  }

  /* A área visível é a da CAMADA, não a do <svg>.
     Com zoom 6 o retângulo do SVG fica 6x maior que a tela, então
     medir contra ele deixava passar chip que estava fora do campo de
     visão -- posicionado, buscado na API e invisível. A camada tem o
     tamanho da viewport do mapa, que é o que a pessoa enxerga. */
  const area = camada.getBoundingClientRect();
  const matriz = svg.getScreenCTM();
  if (!matriz) return;

  const LARGURA_CHIP = 74;
  const ALTURA_CHIP = 30;
  const FOLGA = 8;

  const candidatos = municipiosComRotulo()
    .filter((m) => m.nivel <= nivelMaximo)
    /* Ordem de prioridade na disputa por espaço: primeiro o nível do
       rótulo, depois o TAMANHO do município (peso). Sem o segundo
       critério a ordem seria a do DOM -- alfabética -- e num
       aglomerado sobreviveria quem tem o nome mais próximo do "A". */
    .sort((a, b) => a.nivel - b.nivel || b.peso - a.peso);

  const colocados = [];
  for (const m of candidatos) {
    // Converte a coordenada do SVG pra pixel de tela levando em conta
    // zoom e deslocamento atuais (a matriz já carrega os dois).
    const ponto = new DOMPoint(m.x, m.y).matrixTransform(matriz);
    const px = ponto.x - area.left;
    const py = ponto.y - area.top;

    /* Fora do campo de visão: nem busca o clima.
       A margem é METADE do chip, não o chip inteiro: com a margem
       cheia, um chip centrado logo antes da borda passava no teste e
       ainda assim ficava totalmente fora da tela -- posicionado e
       buscado na API à toa. Com a metade, só entra quem tem pelo menos
       um pedaço visível. */
    if (px < -LARGURA_CHIP / 2 || px > area.width + LARGURA_CHIP / 2) continue;
    if (py < -ALTURA_CHIP / 2 || py > area.height + ALTURA_CHIP / 2) continue;

    const caixa = {
      esq: px - LARGURA_CHIP / 2 - FOLGA,
      dir: px + LARGURA_CHIP / 2 + FOLGA,
      topo: py - ALTURA_CHIP / 2 - FOLGA,
      base: py + ALTURA_CHIP / 2 + FOLGA,
    };
    const bate = colocados.some(
      (c) =>
        caixa.esq < c.caixa.dir &&
        caixa.dir > c.caixa.esq &&
        caixa.topo < c.caixa.base &&
        caixa.base > c.caixa.topo
    );
    if (bate) continue;

    colocados.push({ ...m, px, py, caixa });
    // Teto de segurança: mais que isso vira poluição por definição, e
    // ainda por cima custa requisição.
    if (colocados.length >= 28) break;
  }

  /* deVariosMunicipios: o que o servidor ja publicou sai de graca; so
     o que faltar vira chamada agrupada a API. */
  const clima = await window.desbravaClima.deVariosMunicipios(colocados);
  if (!modoClimaLigado) return; // desligou enquanto buscava

  camada.innerHTML = "";
  for (const m of colocados) {
    const dados = clima.get(m.id);
    if (!dados) continue; // sem clima, sem chip (melhor que chip vazio)

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "clima-chip";
    chip.style.left = `${m.px}px`;
    chip.style.top = `${m.py}px`;
    /* Coordenada em unidades do SVG: é o que reposicionarChipsDeClima
       usa pra reconverter em pixel a cada quadro do arrasto, sem
       precisar refazer a seleção. */
    chip.dataset.sx = m.x;
    chip.dataset.sy = m.y;
    const icone = window.desbravaClima.iconeDoTempo(dados.codigo, dados.ehNoite);
    chip.innerHTML = `<span class="clima-chip-icone">${icone.svg}</span><span>${dados.temperatura}°</span>`;
    chip.setAttribute(
      "aria-label",
      `${idParaNomeMunicipio[m.id] || ""}: ${dados.temperatura} graus, ${icone.rotulo}`
    );
    chip.title = `${idParaNomeMunicipio[m.id] || ""} · ${icone.rotulo}`;
    /* Vai direto no abrirSeloPorId, e não no aoClicarMunicipio: aquele
       recebe o <path> do mapa (usa dataset e efeito de clique nele), e
       aqui a origem do toque é o chip. O modal já abre com o clima
       montado, porque montarClimaDoMunicipio acha tudo em cache. */
    chip.addEventListener("click", (evento) => {
      evento.stopPropagation();
      abrirSeloPorId(m.id, idParaNomeMunicipio[m.id]);
    });
    camada.appendChild(chip);
  }
}

/**
 * Prepara o popup do zero: esconde o menu "⋮", limpa status/destinos
 * e mostra o nome do município. Chamado antes de abrir tanto a
 * raspadinha quanto a visualização de um selo já revelado.
 */
function prepararModal(nome, id) {
  document.getElementById("modal-municipio-nome").textContent = nome;
  document.getElementById("modal-menu").classList.add("oculto");
  document.getElementById("modal-raspadinha").classList.remove("oculto");
  // Ponto único de entrada dos dois caminhos (raspar e ver selo
  // revelado), então o clima é montado aqui uma vez só.
  montarClimaDoMunicipio(id);
}

/**
 * Define o texto de #modal-status e o estilo do "pill" ao redor dele
 * -- neutro (cinza, durante a raspagem/confirmação), ok (verde, já
 * verificado) ou alerta (raspado mas não verificado ainda).
 */
function definirStatusMunicipio(texto, estado = "neutro") {
  const el = document.getElementById("modal-status");
  el.textContent = texto;
  el.classList.remove("modal-status-ok", "modal-status-alerta");
  if (estado === "ok") el.classList.add("modal-status-ok");
  else if (estado === "alerta") el.classList.add("modal-status-alerta");
}

/**
 * Abre o popup com a raspadinha (canvas) para o município escolhido.
 * Ao raspar o suficiente, marca como visitado automaticamente.
 *
 * Usa o selo real em assets/img/selos/<codigo-ibge>.webp (colorido) e
 * assets/img/selos/<codigo-ibge>fundo.webp (capa preto-e-branco que
 * sera raspada) quando existirem; caso contrário, cai no placeholder
 * gerado na hora. Assim, basta colocar os PNGs na pasta (sem mexer
 * em código) para os selos reais passarem a valer.
 */
function abrirModalRaspadinha(id, nome) {
  prepararModal(nome, id);
  definirStatusMunicipio("");
  /* LER não exige conta; RASPAR exige.
     O gate saiu do clique no mapa (ver aoClicarMunicipio) pra qualquer
     um poder abrir o município e ler a curiosidade, a história completa
     e os pontos turísticos. Mas raspar grava progresso, e progresso sem
     conta se perderia na primeira limpeza do navegador -- e nunca
     chegaria ao ranking. Então a raspadinha vira um convite pra entrar. */
  const logado = !!window.raspadinhaAuth?.usuarioAtual;
  document.getElementById("modal-instrucao").textContent = !logado
    ? "Entre na sua conta para raspar este selo e guardar seu progresso."
    : estadoMapa[id]?.presencaConfirmadaEm
      ? "Raspe com o dedo ou o mouse para revelar! (sua presença aqui já foi confirmada antes por GPS -- não precisa estar no local agora)"
      : "Raspe com o dedo ou o mouse para revelar!";
  document.getElementById("modal-selo-estatistica").textContent = "";
  // A curiosidade/história do município aparece SEMPRE -- mesmo antes de
  // raspar (a pedido do Paulo). mostrarCuriosidade() reescreve todo o
  // conteúdo do #modal-curiosidade com o texto DESTE município, então
  // também resolve o antigo bug de o texto do município anterior ficar
  // "grudado" atrás da raspadinha nova (por isso aqui era limpo antes).
  mostrarCuriosidade(id, nome);
  mostrarDestinos(id);

  // Decide a sorte JÁ na abertura (não na conclusão): assim dá pra
  // carregar a arte dourada certa desde o início da raspagem, em vez
  // de trocar a imagem depois de já ter raspado a normal.
  // Enquanto não raspou, não há selo pra substituir -- e a exigência de
  // presença confirmada nem foi cumprida ainda.
  document.getElementById("btn-indicar-selo").classList.add("oculto");

  const corpo = document.getElementById("scratch-modal-body");

  /* Deslogado: mostra o selo COBERTO e um botão de entrar, em vez da
     raspadinha. Não é só esconder o botão -- sem isto o canvas seria
     criado e a pessoa raspava de verdade, gravando num localStorage sem
     UID que o login depois não teria como reivindicar. */
  if (!logado) {
    corpo.innerHTML = "";
    const convite = document.createElement("div");
    convite.className = "raspadinha-convite";
    convite.innerHTML =
      '<span class="raspadinha-convite-icone" aria-hidden="true">🔒</span>' +
      "<p>O selo deste município fica guardado na sua conta.</p>";
    const entrar = document.createElement("button");
    entrar.type = "button";
    entrar.className = "raspadinha-convite-btn";
    entrar.textContent = "Entrar para raspar";
    entrar.addEventListener("click", abrirTelaLogin);
    convite.appendChild(entrar);
    corpo.appendChild(convite);
    return; // o prepararModal lá em cima já revelou a janela
  }

  const brilhante = decidirBrilhante(id);
  const caminhoCapa = `assets/img/selos/${id}fundo.webp`;
  mostrarSpinnerGrande(corpo, true);

  const iniciar = (imageUrl, imageUrlCapa) => {
    document.getElementById("scratch-modal-body").innerHTML = "";
    initScratchCard({
      containerId: "scratch-modal-body",
      imageUrl,
      imageUrlCapa,
      // Trava a sorte assim que a pessoa raspa a primeira vez, mesmo
      // que abandone sem terminar -- sem isso, dava pra "espiar"
      // (raspar uma pontinha, ver que não veio brilhante, fechar sem
      // completar) e tentar de novo depois (ver travarSorteNaPrimeiraRaspada).
      tamanho: 190,
      onPrimeiroToque: () => travarSorteNaPrimeiraRaspada(id, brilhante),
      onComplete: () => {
        // Precisa ser lido ANTES de marcarComoVisitado, que já
        // preserva o flag: aqui a pergunta é "esse município JÁ tinha
        // sido verificado numa visita anterior?".
        const jaVerificadoAntes = !!estadoMapa[id]?.verificado;

        // Marca como raspado na hora (selo revelado, sorte já
        // decidida), mas ainda "nao verificado" -- so conta de
        // verdade depois que a localizacao confirmar que a pessoa
        // esta no municipio.
        marcarComoVisitado(id, nome, brilhante, false);

        // Se o GPS já confirmou presença aqui antes (passou pelo
        // município e o app detectou sozinho, mesmo sem raspar na
        // hora -- ver verificarLocalizacaoAoAbrirApp), essa prova já
        // é válida: não exige estar no local de novo só pra raspar
        // depois. Sem expiração de propósito -- a presença já foi
        // real uma vez, não tem por que "vencer".
        const presencaJaConfirmada = !!estadoMapa[id]?.presencaConfirmadaEm;
        definirStatusMunicipio(
          brilhante ? "🌟 Raspadinha DOURADA! Confirmando sua localização..." : "📍 Confirmando sua localização..."
        );

        // Quem já foi verificado uma vez não precisa provar de novo:
        // nem pede GPS, nem espera. Isso vale pra sempre, de propósito
        // -- estar lá aconteceu, e desmarcar não desfaz o passado.
        const promessaVerificacao =
          jaVerificadoAntes || presencaJaConfirmada
            ? Promise.resolve({ verificado: true, motivo: "" })
            : verificarPresencaNoMunicipio(id);

        promessaVerificacao.then(({ verificado, motivo }) => {
          atualizarVerificacaoMunicipio(id, verificado, motivo);
          const aindaAberto =
            municipioSelecionadoId === id &&
            !document.getElementById("modal-raspadinha").classList.contains("oculto");
          if (!aindaAberto) return;

          if (verificado) {
            definirStatusMunicipio(
              `${brilhante ? "🌟 Raspadinha DOURADA! " : ""}✓ Desbravado em ${new Date().toLocaleString("pt-BR")}`,
              "ok"
            );
          } else {
            definirStatusMunicipio(`⚠️ Raspado, mas não verificado: ${motivo}`, "alerta");
          }
          setTimeout(fecharModalRaspadinha, verificado ? 1400 : 3200);
        });

        return brilhante;
      },
    });
  };

  resolverImagemColorida(`assets/img/selos/${id}`, brilhante, id, nome).then((caminhoColorido) => {
    if (!caminhoColorido.arteReal) {
      // Sem arte real, a capa tambem e gerada -- mesma funcao, paleta P&B.
      iniciar(caminhoColorido.url, gerarCapaPlaceholder(id, nome));
      return;
    }
    carregarImagem(caminhoCapa).then((existeCapa) => {
      iniciar(caminhoColorido.url, existeCapa ? caminhoCapa : null);
    });
  });
}

/**
 * Trava a sorte (brilhante ou não) assim que a pessoa raspa a
 * primeira vez, mesmo que abandone sem terminar de raspar. Sem isso,
 * dava pra "espiar" o resultado (raspar uma pontinha, ver que não
 * veio brilhante, fechar sem completar) e tentar de novo depois --
 * `chanceDecidida` só era gravado na conclusão (ver
 * marcarComoVisitado/decidirBrilhante), então nada impedia um novo
 * sorteio a cada reabertura enquanto não completasse de verdade.
 * Não mexe em `visitado`/`dataVisita`: só marcarComoVisitado (na
 * conclusão de verdade) conta como visita.
 */
function travarSorteNaPrimeiraRaspada(id, brilhante) {
  if (estadoMapa[id]?.chanceDecidida) return; // já travado, nada a fazer
  estadoMapa[id] = {
    ...estadoMapa[id],
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstado();
}

/**
 * Resolve qual imagem colorida usar pra um selo (município, região ou
 * conquista): a versão "dourada" (`<prefixo>dourado.webp`) quando
 * `brilhante` for true e ela existir, senão a normal
 * (`<prefixo>.webp`), senão o placeholder gerado na hora. `arteReal`
 * diz se achou algum PNG de verdade (pra saber se vale a pena tentar
 * carregar uma capa raspável combinando com a arte).
 */
async function resolverImagemColorida(
  prefixo,
  brilhante,
  idParaPlaceholder,
  nomeParaPlaceholder,
  tamanhoPlaceholder
) {
  if (brilhante) {
    const caminhoDourado = `${prefixo}dourado.webp`;
    if (await carregarImagem(caminhoDourado)) return { url: caminhoDourado, arteReal: true };
  }
  const caminhoNormal = `${prefixo}.webp`;
  if (await carregarImagem(caminhoNormal)) return { url: caminhoNormal, arteReal: true };
  return {
    // `brilhante` chega aqui também: sem arte, o selo dourado é
    // desenhado em ouro em vez de na cor do nome -- senão raspar com
    // sorte num município sem arte não mostrava diferença nenhuma.
    url: gerarSeloPlaceholder(
      idParaPlaceholder,
      nomeParaPlaceholder,
      tamanhoPlaceholder,
      brilhante
    ),
    arteReal: false,
  };
}

/**
 * Mostra de novo, dentro do mesmo popup, o selo de um município já
 * visitado — sem precisar raspar de novo, já revelado por completo,
 * junto com status/data e a opção de desmarcar (atrás do menu "⋮").
 */
function visualizarSeloRevelado(id, nome) {
  prepararModal(nome, id);

  const dados = estadoMapa[id];
  const verificado = estaVerificado(id);
  const botaoVerificar = document.getElementById("btn-verificar-local");

  if (verificado) {
    definirStatusMunicipio(
      dados?.dataVisita
        ? `✓ Desbravado em ${new Date(dados.dataVisita).toLocaleString("pt-BR")}`
        : "✓ Desbravado",
      "ok"
    );
    botaoVerificar.classList.add("oculto");
  } else {
    definirStatusMunicipio(
      `⚠️ Raspado, mas ainda não verificado. ${dados?.motivoNaoVerificado || "Você precisa estar no município para confirmar."}`,
      "alerta"
    );
    botaoVerificar.classList.remove("oculto");
  }

  document.getElementById("modal-instrucao").textContent = "";
  mostrarDestinos(id);
  mostrarCuriosidade(id, nome);
  mostrarEstatisticaSeloMunicipio(id);

  const corpo = document.getElementById("scratch-modal-body");
  mostrarSpinnerGrande(corpo, true);

  const brilhante = !!dados?.brilhante;
  resolverImagemColorida(`assets/img/selos/${id}`, brilhante, id, nome).then((resultado) => {
    // resultado.arteReal diz se existe arquivo de selo pra este
    // município. Sem ele, quem esteve aqui pode indicar uma foto.
    atualizarBotaoIndicarSelo(id, resultado.arteReal);
    corpo.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className =
      "selo-revelado-wrapper" + (verificado ? "" : " selo-nao-verificado-wrapper");
    const img = document.createElement("img");
    img.src = resultado.url;
    img.alt = nome;
    img.className = "selo-revelado selo-revelado-pequeno";
    wrapper.appendChild(img);
    if (brilhante) adicionarBrilho(wrapper);
    corpo.appendChild(wrapper);
  });
}

// Texto padrão pros 91 municípios que ainda não têm curiosidade
// escrita -- vive de verdade em data/curiosidades.json (não só como
// fallback aqui), de propósito: assim TODO município sempre tem um
// `resumo` de verdade, não vazio/undefined, o que evita qualquer
// tela em branco ou comportamento estranho enquanto o JSON ainda tá
// carregando ou nalgum caso raro de falha de rede (ver também o
// conserto no fallback do Service Worker, em sw.js). O fallback aqui
// só cobre o caso do JSON não ter carregado ainda de jeito nenhum.
const CURIOSIDADE_TEXTO_PADRAO = "Em breve, uma curiosidade sobre este município.";

/**
 * Mostra a curiosidade/história do município (data/curiosidades.json)
 * -- só existe pra ver DEPOIS de raspar o selo (por isso só é chamada
 * daqui, na visualização de um município já visitado). Enquanto o
 * usuário não tiver enviado o texto de um município, mostra um
 * espaço reservado. Quando o município tem história mais longa
 * (`historiaCompleta`, uma lista de parágrafos), mostra também um
 * botão "📖 Saiba mais" que abre uma janela separada (ver
 * abrirHistoriaMunicipio) -- o resumo aqui é só o gancho rápido.
 */
function mostrarCuriosidade(id, nome) {
  const container = document.getElementById("modal-curiosidade");
  const dados = curiosidadesPorMunicipio[id];
  const resumo = dados?.resumo || CURIOSIDADE_TEXTO_PADRAO;
  const temResumoReal = resumo !== CURIOSIDADE_TEXTO_PADRAO;
  const temHistoriaCompleta = !!dados?.historiaCompleta?.length;

  container.innerHTML = temResumoReal
    ? `<h3>Curiosidade</h3><p>${escaparHtml(resumo)}</p>`
    : `<h3>Curiosidade</h3><p class="curiosidade-vazia">${escaparHtml(CURIOSIDADE_TEXTO_PADRAO)}</p>`;

  if (temHistoriaCompleta) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "btn-saiba-mais-municipio";
    botao.textContent = "📖 Saiba mais";
    botao.addEventListener("click", () => abrirHistoriaMunicipio(id, nome));
    container.appendChild(botao);
  }
}

/**
 * Janela separada (não a mesma do popup do selo) com a história
 * completa do município -- linha do tempo, curiosidades adicionais,
 * etc. -- em parágrafos, pra comportar texto bem mais longo que o
 * resumo curto de `mostrarCuriosidade`.
 */
function abrirHistoriaMunicipio(id, nome) {
  const paragrafos = curiosidadesPorMunicipio[id]?.historiaCompleta || [];
  document.getElementById("historia-municipio-titulo").textContent = `📖 ${nome}`;
  document.getElementById("historia-municipio-corpo").innerHTML = paragrafos
    .map((paragrafo) => `<p>${escaparHtml(paragrafo)}</p>`)
    .join("");
  document.getElementById("modal-historia-municipio").classList.remove("oculto");
}

function fecharHistoriaMunicipio() {
  document.getElementById("modal-historia-municipio").classList.add("oculto");
}

/**
 * Mostra quantas contas têm o selo de um município (e a % em relação
 * ao total de contas criadas) -- calculado na hora via
 * getCountFromServer, sem travar o resto do popup.
 */
async function mostrarEstatisticaSeloMunicipio(id) {
  const el = document.getElementById("modal-selo-estatistica");
  el.textContent = "Calculando quantas contas têm esse selo...";
  try {
    const [qtd, total] = await Promise.all([
      window.raspadinhaAuth.contarPessoasComMunicipioVerificado(id),
      window.raspadinhaAuth.contarTotalContas(),
    ]);
    if (!total) {
      el.textContent = "";
      return;
    }
    const pct = (qtd / total) * 100;
    el.textContent = `👥 ${qtd} conta${qtd === 1 ? "" : "s"} tem esse selo (${pct.toFixed(1)}% de ${total})`;
  } catch (erro) {
    console.error("Falha ao carregar estatística do selo:", erro);
    el.textContent = "";
  }
}

/**
 * Mesma ideia, pro mega-selo de região.
 */
async function mostrarEstatisticaSeloRegiao(regiaoId) {
  const el = document.getElementById("regiao-selo-estatistica");
  if (!el) return;
  el.textContent = "Calculando quantas contas têm esse selo...";
  try {
    const [qtd, total] = await Promise.all([
      window.raspadinhaAuth.contarPessoasComRegiao(regiaoId),
      window.raspadinhaAuth.contarTotalContas(),
    ]);
    if (!total) {
      el.textContent = "";
      return;
    }
    const pct = (qtd / total) * 100;
    el.textContent = `👥 ${qtd} conta${qtd === 1 ? "" : "s"} tem esse mega-selo (${pct.toFixed(1)}% de ${total})`;
  } catch (erro) {
    console.error("Falha ao carregar estatística do mega-selo:", erro);
    el.textContent = "";
  }
}

/**
 * Renderiza a lista de pontos turísticos do município (se existir em
 * data/destinos.json) dentro do popup. Cada item é clicável: abre um
 * espaço reservado para um texto histórico/curiosidade (a preencher
 * depois) e um botão "Abrir no Maps", que sempre funciona: o link sai
 * de `linkMaps` quando ele existe no JSON, e senão é montado na hora
 * pelo nome do lugar (ver linkDoMaps).
 */
/* ============================================================
   Busca de município/ponto turístico (canto inferior direito): ao
   escolher um resultado, anima o zoom até o local (ver
   window.controleMapa.focarEmMunicipio em inicializarPanZoomDoMapa)
   e abre o selo, como se tivesse clicado nele no mapa.
   ============================================================ */

function construirIndiceBusca() {
  const itens = [];
  /* Busca dentro do mapa que está NA TELA. Era fixo em "#mapa-rj", e
     por isso a lupa em Minas listava municípios do Rio -- que ao serem
     escolhidos mandavam o mapa focar num id inexistente ali. No estado
     em desenvolvimento indexa só os municípios (não há ponto turístico
     cadastrado), e escolher um leva o mapa até ele sem abrir selo. */
  const seletor = emEstadoLimitado()
    ? "#estado-viewport #mun-detalhe .municipio"
    : "#mapa-rj .municipio";
  document.querySelectorAll(seletor).forEach((path) => {
    const id = path.dataset.municipio;
    const nome = path.dataset.nome;
    itens.push({ tipo: "municipio", id, nomeMunicipio: nome, texto: nome });

    destinosPorMunicipio[id]?.destinos?.forEach((d) => {
      itens.push({
        tipo: "destino",
        id,
        nomeMunicipio: nome,
        nomeDestino: d.nome,
        texto: `${d.nome} ${nome}`,
      });
    });
  });
  return itens;
}

function abrirBuscaLocal() {
  document.getElementById("input-busca-local").value = "";
  document.getElementById("busca-local-resultados").innerHTML = "";
  document.getElementById("modal-busca-local").classList.remove("oculto");
  document.getElementById("input-busca-local").focus();
}

function fecharBuscaLocal() {
  document.getElementById("modal-busca-local").classList.add("oculto");
}

function filtrarBuscaLocal() {
  const termo = document.getElementById("input-busca-local").value.trim().toLowerCase();
  const container = document.getElementById("busca-local-resultados");

  if (!termo) {
    container.innerHTML = "";
    return;
  }

  const resultados = construirIndiceBusca()
    .filter((item) => item.texto.toLowerCase().includes(termo))
    .slice(0, 30);

  if (!resultados.length) {
    container.innerHTML = "<p>Nada encontrado.</p>";
    return;
  }

  container.innerHTML = "";
  resultados.forEach((item) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "busca-local-item";
    botao.innerHTML =
      item.tipo === "municipio"
        ? `📍 ${escaparHtml(item.nomeMunicipio)}`
        : `🎯 ${escaparHtml(item.nomeDestino)} <span class="busca-local-sub">${escaparHtml(item.nomeMunicipio)}</span>`;
    botao.addEventListener("click", () => selecionarResultadoBusca(item));
    container.appendChild(botao);
  });
}

/**
 * Fecha a busca, anima o mapa até o município (zoom + centralização)
 * e, quando a animação termina, abre o selo -- igual a clicar nele
 * direto no mapa.
 */
function selecionarResultadoBusca(item) {
  fecharBuscaLocal();
  // Em estado não publicado a busca serve pra ACHAR no mapa, não pra
  // abrir selo (não existe) -- e nem exige login por isso.
  if (emEstadoLimitado()) {
    focarMunicipioEstadual(item.id);
    mostrarToastEstadual(item.nomeMunicipio);
    return;
  }
  // Sem login: ler sobre o município não exige conta (só raspar exige).
  window.controleMapa?.focarEmMunicipio(item.id);
  setTimeout(() => abrirSeloPorId(item.id, item.nomeMunicipio), 650);
}

/**
 * Link do Google Maps pra um ponto turístico.
 *
 * É montado na hora, a partir do nome do lugar + o município + RJ, em
 * vez de guardar 460 URLs em data/destinos.json. Motivos:
 *
 *  - o link é DERIVÁVEL: guardar seria repetir, em ~40 KB, o que já
 *    está ali em cima na mesma linha;
 *  - não custa chave de API nem consulta a serviço nenhum. A rota
 *    /maps/search/?api=1 é o formato público e documentado do Google,
 *    e no celular ela abre o APLICATIVO do Maps, não o navegador;
 *  - lugar novo passa a ter link no mesmo instante em que é escrito no
 *    JSON, sem ninguém lembrar de colar URL.
 *
 * O campo `linkMaps` continua valendo e TEM PRIORIDADE: busca por nome
 * erra em lugar de nome genérico ("Igreja Matriz", "Cachoeira do
 * Escorrega"), e nesses casos dá pra colar no JSON o link exato do
 * lugar, que passa a mandar sobre o automático.
 */
/* ============================================================
   PONTOS TURÍSTICOS NO MAPA
   ------------------------------------------------------------
   Cada ponto com coordenada em data/destinos.json vira um medalhão
   no mapa, no lugar exato onde ele fica. Só aparecem bem de perto
   (ZOOM_DOS_PONTOS): de longe seriam 460 bolinhas em cima de um
   estado inteiro, cobrindo o mapa que elas deveriam enfeitar.
   ============================================================ */

/* Os pontos turísticos COMEÇAM a aparecer aqui e ficam inteiros em
 * ZOOM_DOS_PONTOS_CHEIO -- entram desbotando, em vez de piscar na tela
 * de uma vez. Entre os dois valores o CSS calcula a opacidade (ver
 * .ponto-turistico em css/styles.css). */
const ZOOM_DOS_PONTOS = 7;
const ZOOM_DOS_PONTOS_CHEIO = 13;

/**
 * Converte latitude/longitude na posição dentro do desenho do mapa.
 *
 * Os números da projeção vêm nos atributos data-proj-* do próprio
 * <svg>, escritos por tools/geojson-to-svg.js. Repetir as contas aqui
 * com valores copiados à mão seria criar duas verdades: no dia em que
 * a malha mudasse, o mapa iria pra um lado e os pontos pro outro.
 *
 * É a mesma projeção equiretangular do gerador, com a correção de
 * cos(latitude média) -- sem ela o estado sai esticado na horizontal.
 */
function projetarCoordenada(lon, lat) {
  const svg = document.getElementById("mapa-rj");
  if (!svg) return null;
  const minLon = parseFloat(svg.dataset.projLon);
  const minLat = parseFloat(svg.dataset.projLat);
  const cos = parseFloat(svg.dataset.projCos);
  const escala = parseFloat(svg.dataset.projEscala);
  const altura = parseFloat(svg.dataset.projAltura);
  if ([minLon, minLat, cos, escala, altura].some(Number.isNaN)) return null;

  return {
    x: (lon - minLon) * cos * escala,
    // Y invertido: latitude cresce pro norte, o SVG cresce pra baixo.
    y: altura - (lat - minLat) * escala,
  };
}

/**
 * Desenha no mapa um medalhão por ponto turístico que tenha coordenada.
 *
 * A arte entra SOLTA, sem moldura: o fundo dela é transparente (ver
 * tools/preparar-icones-pontos.js) e o desenho aparece recortado sobre
 * o município, com o contorno preto que ele já tem fazendo a separação.
 *
 * Sem arte, o ponto vira um pino genérico. É de propósito: assim os 460
 * pontos nascem no mapa de uma vez, e a arte própria entra aos poucos,
 * como aconteceu com os selos -- em vez de a função ficar bonita em
 * dois lugares e vazia em outros quatrocentos.
 *
 * Em cima de tudo vai um círculo transparente, que é o que o dedo
 * acerta. Sem ele, a área clicável seria o desenho recortado: em arte
 * fina (o Cristo tem braços de poucos pixels) acertar viraria loteria,
 * e ainda mudaria de tamanho conforme o desenho.
 */
function renderizarPontosTuristicos() {
  const svg = document.getElementById("mapa-rj");
  if (!svg) return;
  document.getElementById("pontos-turisticos")?.remove();

  const ns = "http://www.w3.org/2000/svg";
  const grupo = document.createElementNS(ns, "g");
  grupo.id = "pontos-turisticos";

  let total = 0;

  for (const [municipioId, municipio] of Object.entries(destinosPorMunicipio)) {
    (municipio.destinos || []).forEach((ponto, indice) => {
      if (typeof ponto.lat !== "number" || typeof ponto.lon !== "number") return;
      const pos = projetarCoordenada(ponto.lon, ponto.lat);
      if (!pos) return;

      const item = document.createElementNS(ns, "g");
      item.setAttribute("class", "ponto-turistico");
      item.setAttribute("transform", `translate(${pos.x} ${pos.y})`);
      item.dataset.municipio = municipioId;
      item.dataset.indice = String(indice);
      // O <title> é o que aparece ao segurar o dedo/passar o mouse, e é
      // o que um leitor de tela anuncia.
      const titulo = document.createElementNS(ns, "title");
      titulo.textContent = ponto.nome;
      item.appendChild(titulo);

      if (ponto.icone) {
        /* Quadrado centrado na coordenada. `preserveAspectRatio` no
         * padrão (meet) faz a arte caber inteira dentro dele sem
         * distorcer, seja ela mais alta ou mais larga.
         *
         * Maior que o pino de propósito. Com a mesma caixa, os dois
         * MEDEM igual mas não PARECEM iguais: o pino é uma forma cheia
         * e a arte é desenho de traço fino (o Cristo tem braços de
         * poucos pixels), então some do lado dele. O 2.9 é o que faz os
         * dois pesarem o mesmo na tela. */
        const imagem = document.createElementNS(ns, "image");
        imagem.setAttribute("class", "ponto-arte");
        imagem.setAttribute("href", `assets/img/pontos/${ponto.icone}`);
        imagem.setAttribute("x", "-1.45");
        imagem.setAttribute("y", "-1.45");
        imagem.setAttribute("width", "2.9");
        imagem.setAttribute("height", "2.9");
        item.appendChild(imagem);
      } else {
        const pino = document.createElementNS(ns, "path");
        pino.setAttribute("class", "ponto-pino");
        // Gota clássica de mapa, com a PONTA na origem: assim o que
        // encosta na coordenada é a ponta do pino, não o meio dele.
        pino.setAttribute(
          "d",
          "M0 0 C-0.62 -0.86 -1 -1.24 -1 -1.7 A1 1 0 0 1 1 -1.7 C1 -1.24 0.62 -0.86 0 0 Z"
        );
        item.appendChild(pino);
        const miolo = document.createElementNS(ns, "circle");
        miolo.setAttribute("class", "ponto-pino-miolo");
        miolo.setAttribute("cy", "-1.7");
        miolo.setAttribute("r", "0.36");
        item.appendChild(miolo);
      }

      // Alvo do dedo: círculo invisível por cima, do mesmo tamanho pra
      // todo ponto -- com ou sem arte, fina ou gorda.
      const alvo = document.createElementNS(ns, "circle");
      alvo.setAttribute("class", "ponto-alvo");
      alvo.setAttribute("r", "1.6");
      // No pino, o desenho sobe a partir da ponta: o alvo sobe junto,
      // senão ficaria no chão embaixo dele.
      if (!ponto.icone) alvo.setAttribute("cy", "-1.1");
      item.appendChild(alvo);

      grupo.appendChild(item);
      total++;
    });
  }

  if (total) svg.appendChild(grupo);
  /* O grupo acabou de ser recriado: o `display: none` do Modo Clima
     morreu com o anterior. Reaplica, senão os pinos reaparecem no
     primeiro zoom com o Modo Clima ainda ligado. */
  if (modoClimaLigado) esconderPontosNoModoClima(true);
  return total;
}

/* Fator de escala dos marcadores, o MESMO do CSS (.ponto-turistico > *
   em css/styles.css). Repetido aqui porque o JS precisa saber de quanto
   é um marcador em unidades do desenho pra medir sobreposição -- mudar
   um sem o outro faz o seletor abrir na hora errada. */
const ESCALA_DOS_PONTOS = 7;
// Raio do alvo de toque, igual ao usado ao desenhar.
const RAIO_ALVO_PONTO = 1.6;

/** Posição de um marcador, lida do transform. */
function posicaoDoPonto(item) {
  const m = item.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/**
 * Todos os marcadores que, NO ZOOM ATUAL, estão colados no clicado --
 * ele inclusive.
 *
 * A distância é medida em unidades do desenho, mas o limite acompanha o
 * zoom: dois pontos a 200 metros um do outro se encavalam de longe e
 * ficam bem separados de perto. Por isso o limite é o tamanho do
 * marcador na tela convertido de volta pro desenho -- que é exatamente
 * a conta que o CSS faz pra desenhá-lo.
 */
function pontosColadosEm(item) {
  const svg = document.getElementById("mapa-rj");
  const zoom = Number(svg.style.getPropertyValue("--zoom")) || 3.5;
  const escala = (ESCALA_DOS_PONTOS * 3.5) / zoom;
  // Dois alvos se tocam quando os centros estão a menos de 2 raios.
  const limite = RAIO_ALVO_PONTO * escala * 2;

  const base = posicaoDoPonto(item);
  if (!base) return [item];

  return [...svg.querySelectorAll(".ponto-turistico")].filter((outro) => {
    const p = posicaoDoPonto(outro);
    return p && Math.hypot(p.x - base.x, p.y - base.y) <= limite;
  });
}

/**
 * Clique num marcador. Se houver outros encavalados nele, abre a
 * escolha em vez de adivinhar qual a pessoa quis.
 *
 * O dedo cobre bem mais que um marcador, e no zoom em que os pontos
 * começam a aparecer vários caem quase no mesmo lugar. Abrir sempre o
 * primeiro que o navegador entregasse deixaria pontos inalcançáveis --
 * os que ficam por baixo nunca seriam abertos.
 */
function aoClicarPontoTuristico(evento) {
  const item = evento.target.closest(".ponto-turistico");
  if (!item) return;
  evento.stopPropagation();

  /* Montando roteiro: tocar ADICIONA/TIRA em vez de abrir a leitura.
     Sem o desempate de pontos colados de propósito -- aqui um toque
     errado custa um toque pra desfazer, e um menu no meio da escolha
     atrapalharia mais do que ajudaria. */
  if (modoMapaRoteiro) {
    alternarPontoNoMapa(item.dataset.municipio, Number(item.dataset.indice));
    return;
  }

  const colados = pontosColadosEm(item);
  if (colados.length > 1) {
    abrirEscolhaDePonto(colados);
    return;
  }
  abrirPontoTuristico(item.dataset.municipio, Number(item.dataset.indice));
}

/** Lista os pontos encavalados pra pessoa escolher qual abrir. */
function abrirEscolhaDePonto(itens) {
  const lista = document.getElementById("escolha-ponto-lista");
  lista.innerHTML = "";

  document.getElementById("escolha-ponto-quantos").textContent =
    `${itens.length} pontos turísticos aqui`;

  for (const item of itens) {
    const municipioId = item.dataset.municipio;
    const indice = Number(item.dataset.indice);
    const municipio = destinosPorMunicipio[municipioId];
    const ponto = municipio?.destinos?.[indice];
    if (!ponto) continue;

    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = "escolha-ponto-item";
    // A mesma arte do mapa, ou o mesmo pino -- é assim que a pessoa
    // liga o que está na lista com o que ela viu embaixo do dedo.
    botao.innerHTML = `
      <span class="escolha-ponto-arte">${
        ponto.icone
          ? `<img src="assets/img/pontos/${escaparHtml(ponto.icone)}" alt="">`
          : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>`
      }</span>
      <span class="escolha-ponto-texto">
        <strong>${escaparHtml(ponto.nome)}</strong>
        <small>${escaparHtml(municipio.nome)}</small>
      </span>`;
    botao.addEventListener("click", () => {
      fecharEscolhaDePonto();
      abrirPontoTuristico(municipioId, indice);
    });
    lista.appendChild(botao);
  }

  document.getElementById("modal-escolha-ponto").classList.remove("oculto");
}

function fecharEscolhaDePonto() {
  fecharComAnimacao(document.getElementById("modal-escolha-ponto"));
}

function abrirPontoTuristico(municipioId, indice) {
  const municipio = destinosPorMunicipio[municipioId];
  const ponto = municipio?.destinos?.[indice];
  if (!ponto) return;

  pontoAbertoMunicipio = municipioId;

  document.getElementById("ponto-titulo").textContent = ponto.nome;
  document.getElementById("ponto-cidade").textContent = municipio.nome;
  document.getElementById("ponto-descricao").textContent = ponto.descricao || "";
  document.getElementById("ponto-texto").textContent =
    ponto.textoCompleto || "Em breve: um pouco da história e curiosidades sobre este lugar.";

  // Sem arte, a capa encolhe pra uma faixa fina em vez de deixar um
  // degradê alto e vazio antes do título.
  const arte = document.getElementById("ponto-arte");
  document.getElementById("ponto-capa").classList.toggle("sem-arte", !ponto.icone);
  if (ponto.icone) {
    arte.src = `assets/img/pontos/${ponto.icone}`;
    arte.alt = ponto.nome;
  } else {
    arte.removeAttribute("src");
  }

  document.getElementById("btn-ponto-maps").dataset.link =
    ponto.linkMaps || linkDoMaps(ponto.nome, municipio.nome);
  document.getElementById("btn-ponto-imagens").dataset.link = linkDeImagens(ponto.nome, municipio.nome);

  // Volta pro topo: a folha é a MESMA a cada ponto, e sem isto o
  // próximo abre na altura em que o anterior foi deixado.
  document.getElementById("ponto-corpo").scrollTop = 0;
  document.getElementById("modal-ponto").classList.remove("oculto");

  montarComentariosDoPonto(ponto, municipioId);
}

/* Ponto aberto agora -- o formulário de comentário precisa saber em
   qual ponto está escrevendo. O município já vive em
   pontoAbertoMunicipio, usado pelo botão "Ver cidade". */
let pontoAbertoId = null;

/* ===================== NOTIFICAÇÕES =====================
 * Avisam quando alguém curte ou comenta nas suas coisas da Comunidade,
 * ou responde ao seu comentário num ponto turístico.
 *
 * Quem grava é o cliente de QUEM AGE (o projeto está no Spark, e Cloud
 * Functions exigem Blaze) -- ver o bloco de notificações em js/auth.js.
 * Por isso o aviso é sempre "melhor esforço": se o app de quem agiu
 * cair no meio, ele se perde, mas a curtida/comentário já aconteceu.
 */
const TEXTO_NOTIFICACAO = {
  "curtida-post": (n) => `${n.deApelido} curtiu seu post`,
  "comentario-post": (n) => `${n.deApelido} comentou no seu post`,
  "resposta-comentario": (n) => `${n.deApelido} respondeu seu comentário`,
};

/** Só aparece logado; esconde o sino e zera o badge quando deslogado. */
async function atualizarBadgeNotificacoes() {
  const botao = document.getElementById("btn-topo-notificacoes");
  const badge = document.getElementById("badge-notificacoes");
  if (!botao) return;

  if (!window.raspadinhaAuth?.usuarioAtual?.uid) {
    botao.classList.add("oculto");
    badge.classList.add("oculto");
    return;
  }
  botao.classList.remove("oculto");

  try {
    const quantas = await window.raspadinhaAuth.contarNotificacoesNaoLidas();
    // 9+ em vez do número exato: o badge é pequeno e "37" não cabe nem
    // muda o que a pessoa vai fazer (abrir e ver).
    badge.textContent = quantas > 9 ? "9+" : String(quantas);
    badge.classList.toggle("oculto", quantas === 0);
  } catch (erro) {
    badge.classList.add("oculto");
    console.warn("Não deu pra contar notificações:", erro);
  }
}

async function abrirNotificacoes() {
  const modal = document.getElementById("modal-notificacoes");
  const lista = document.getElementById("lista-notificacoes");
  const vazio = document.getElementById("notificacoes-vazio");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  vazio.classList.add("oculto");
  modal.classList.remove("oculto");

  let avisos = [];
  try {
    avisos = await window.raspadinhaAuth.listarNotificacoes();
  } catch (erro) {
    console.error("Falha ao listar notificações:", erro);
  }

  lista.innerHTML = "";
  vazio.classList.toggle("oculto", avisos.length > 0);

  avisos.forEach((n) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "notificacao-item" + (n.lida ? "" : " notificacao-nova");

    const avatar = document.createElement("span");
    avatar.className = "notificacao-avatar";
    avatar.textContent = iniciaisApelido(n.deApelido);
    avatar.style.background = corAvatar(n.deApelido);

    const corpo = document.createElement("span");
    corpo.className = "notificacao-corpo";
    const titulo = document.createElement("strong");
    titulo.textContent = (TEXTO_NOTIFICACAO[n.tipo] || (() => "Nova atividade"))(n);
    corpo.appendChild(titulo);
    if (n.texto) {
      const trecho = document.createElement("span");
      trecho.textContent = n.texto;
      corpo.appendChild(trecho);
    }

    item.append(avatar, corpo);

    // Leva ao lugar do assunto: post abre a Comunidade nele; resposta
    // de comentário abre o painel daquele ponto turístico.
    item.addEventListener("click", () => {
      fecharNotificacoes();
      if (n.postId) abrirPainelSocialComPost(n.postId);
      else if (n.pontoId) abrirPontoTuristicoPorId(n.pontoId);
    });

    lista.appendChild(item);
  });

  // Marca como lidas as que estavam novas -- depois de desenhar, pra
  // pessoa ainda ver o destaque desta vez.
  const novas = avisos.filter((n) => !n.lida).map((n) => n.id);
  if (novas.length) {
    await window.raspadinhaAuth.marcarNotificacoesLidas(novas);
    atualizarBadgeNotificacoes();
  }
}

function fecharNotificacoes() {
  fecharComAnimacao(document.getElementById("modal-notificacoes"));
}

/**
 * Abre o painel de um ponto a partir do id estável.
 *
 * O runtime abre ponto por ÍNDICE (é o que o marcador do mapa carrega),
 * mas a notificação só guarda o id -- índice mudaria se um ponto fosse
 * excluído. Aqui a gente converte um no outro.
 */
function abrirPontoTuristicoPorId(pontoId) {
  const municipioId = String(pontoId).split("-")[0];
  const indice = (destinosPorMunicipio[municipioId]?.destinos || []).findIndex(
    (p) => p.id === pontoId
  );
  if (indice >= 0) abrirPontoTuristico(municipioId, indice);
}

/** Erro inline da área de comentários (o app não tem toast genérico). */
function mostrarErroComentarioPonto(mensagem) {
  const alvo = document.getElementById("ponto-comentario-erro");
  if (!alvo) return;
  alvo.textContent = mensagem || "";
  alvo.classList.toggle("oculto", !mensagem);
}

/**
 * Monta a seção de comentários do ponto que acabou de abrir.
 *
 * Ler é de todo mundo; escrever é só de quem teve a presença
 * CONFIRMADA POR GPS no município (estaVerificado). Raspar o selo não
 * basta de propósito: raspar dá pra fazer do sofá, e aí o comentário
 * deixaria de valer como relato de quem esteve lá.
 *
 * A trava séria é a Regra do Firestore; o que está aqui é só pra
 * ninguém digitar um texto que o servidor vai recusar.
 */
async function montarComentariosDoPonto(ponto, municipioId) {
  pontoAbertoId = ponto.id || null;

  const secao = document.getElementById("ponto-comentarios");
  if (!secao) return;

  /* Ponto sem id é ponto de uma versão anterior ao id estável. Some
     com a seção inteira (e com o botão "Posts", que filtra por id) em
     vez de mostrar uma caixa que não salva. */
  secao.classList.toggle("oculto", !pontoAbertoId);
  document.getElementById("btn-ponto-posts")?.classList.toggle("oculto", !pontoAbertoId);
  if (!pontoAbertoId) return;

  const lista = document.getElementById("ponto-comentarios-lista");
  const vazio = document.getElementById("ponto-comentarios-vazio");
  const area = document.getElementById("ponto-comentar-area");
  const bloqueado = document.getElementById("ponto-comentar-bloqueado");

  lista.innerHTML = "";
  vazio.classList.add("oculto");
  document.getElementById("input-comentario-ponto").value = "";
  mostrarErroComentarioPonto("");

  // ---- Quem pode escrever ----
  const logado = !!window.raspadinhaAuth?.usuarioAtual?.uid;
  const verificado = estaVerificado(municipioId);
  const podeComentar = logado && verificado;

  area.classList.toggle("oculto", !podeComentar);
  bloqueado.classList.toggle("oculto", podeComentar);
  if (!podeComentar) {
    bloqueado.textContent = !logado
      ? "Entre na sua conta para comentar."
      : `Só quem teve a presença confirmada por GPS em ${
          destinosPorMunicipio[municipioId]?.nome || "este município"
        } pode comentar aqui. Use o Modo Viagem quando estiver lá.`;
  }

  // ---- Lista ----
  let comentarios = [];
  try {
    comentarios = await window.raspadinhaAuth.listarComentariosPonto(pontoAbertoId);
  } catch (erro) {
    console.error("Falha ao carregar comentários do ponto:", erro);
  }

  /* A pessoa pode ter fechado a folha ou aberto OUTRO ponto enquanto a
     busca corria. Sem esta guarda os comentários de um ponto apareciam
     dentro de outro -- a folha é reaproveitada, não recriada. */
  if (pontoAbertoId !== (ponto.id || null)) return;

  renderizarComentariosDoPonto(comentarios);
}

function renderizarComentariosDoPonto(comentarios) {
  const lista = document.getElementById("ponto-comentarios-lista");
  const vazio = document.getElementById("ponto-comentarios-vazio");
  lista.innerHTML = "";
  vazio.classList.toggle("oculto", comentarios.length > 0);

  /* MAIS CURTIDO PRIMEIRO. Ordenar aqui, e não no Firestore, porque a
     consulta com orderBy em numCurtidas exigiria índice e pagina errado
     se alguém curtir no meio da rolagem. Empate desempata pelo mais
     antigo: quem comentou primeiro fica na frente. */
  const ordenados = [...comentarios].sort((a, b) => {
    const diferenca = (b.numCurtidas || 0) - (a.numCurtidas || 0);
    if (diferenca !== 0) return diferenca;
    return (a.criadoEm?.seconds || 0) - (b.criadoEm?.seconds || 0);
  });

  ordenados.forEach((c) => lista.appendChild(criarLinhaComentarioPonto(c, lista, vazio)));
}

/** Uma linha de comentário: autor, texto, curtir, responder e respostas. */
function criarLinhaComentarioPonto(c, lista, vazio) {
  const meuUid = window.raspadinhaAuth?.usuarioAtual?.uid;

  const bloco = document.createElement("div");
  bloco.className = "ponto-comentario-bloco";

  const linha = document.createElement("div");
  linha.className = "ponto-comentario";

  const avatar = document.createElement("span");
  avatar.className = "ponto-comentario-avatar";
  avatar.textContent = iniciaisApelido(c.autorApelido);
  avatar.style.background = corAvatar(c.autorApelido);

  const corpo = document.createElement("div");
  corpo.className = "ponto-comentario-corpo";
  const autor = document.createElement("strong");
  autor.textContent = c.autorApelido || "?";
  const texto = document.createElement("span");
  texto.textContent = c.texto || "";
  corpo.append(autor, texto);

  // ---- Ações: curtir e responder ----
  const acoes = document.createElement("div");
  acoes.className = "ponto-comentario-acoes";

  const curtir = document.createElement("button");
  curtir.type = "button";
  curtir.className = "ponto-comentario-curtir";
  let curtido = Array.isArray(c.curtidoPor) && meuUid ? c.curtidoPor.includes(meuUid) : false;
  let quantas = c.numCurtidas || 0;
  const pintarCurtida = () => {
    curtir.classList.toggle("curtido", curtido);
    curtir.textContent = `♥ ${quantas}`;
    curtir.setAttribute("aria-pressed", curtido ? "true" : "false");
  };
  pintarCurtida();
  curtir.addEventListener("click", async () => {
    if (!meuUid) {
      mostrarErroComentarioPonto("Entre na sua conta para curtir.");
      return;
    }
    // Otimista: pinta na hora e desfaz se o servidor recusar.
    curtido = !curtido;
    quantas += curtido ? 1 : -1;
    pintarCurtida();
    try {
      await window.raspadinhaAuth.curtirComentarioPonto(pontoAbertoId, c.id, curtido);
    } catch (erro) {
      curtido = !curtido;
      quantas += curtido ? 1 : -1;
      pintarCurtida();
      console.error("Falha ao curtir comentário:", erro);
    }
  });

  const responder = document.createElement("button");
  responder.type = "button";
  responder.className = "ponto-comentario-responder";
  responder.textContent = "Responder";

  acoes.append(curtir, responder);
  corpo.appendChild(acoes);

  linha.append(avatar, corpo);

  // Moderação: o dono apaga o próprio; contas abusivas são bloqueadas
  // pelo painel de Configurações, que já corta a escrita em tudo.
  if (meuUid && c.autorUid === meuUid) {
    const apagar = document.createElement("button");
    apagar.type = "button";
    apagar.className = "ponto-comentario-apagar";
    apagar.setAttribute("aria-label", "Apagar meu comentário");
    apagar.textContent = "✕";
    apagar.addEventListener("click", async () => {
      apagar.disabled = true;
      try {
        await window.raspadinhaAuth.excluirComentarioPonto(pontoAbertoId, c.id);
        bloco.remove();
        if (!lista.children.length) vazio.classList.remove("oculto");
      } catch (erro) {
        apagar.disabled = false;
        mostrarErroComentarioPonto("Não deu para apagar agora.");
        console.error(erro);
      }
    });
    linha.appendChild(apagar);
  } else if (meuUid) {
    /* Quem não é autor denuncia. Antes deste bloco o comentário de
       ponto turístico era a única superfície sem NENHUMA saída: não
       dava pra apagar (não é seu) nem pra avisar alguém. */
    const denunciar = document.createElement("button");
    denunciar.type = "button";
    denunciar.className = "ponto-comentario-apagar";
    denunciar.setAttribute("aria-label", "Denunciar comentário");
    denunciar.title = "Denunciar";
    denunciar.textContent = "🚩";
    denunciar.addEventListener("click", () =>
      abrirDenuncia({
        tipo: "comentario-ponto",
        referencia: `pontosTuristicos/${pontoAbertoId}/comentarios/${c.id}`,
        resumo: c.texto,
        autor: c.autorApelido,
        autorUid: c.autorUid,
      })
    );
    linha.appendChild(denunciar);
  }

  bloco.appendChild(linha);

  // ---- Respostas ----
  const respostasEl = document.createElement("div");
  respostasEl.className = "ponto-respostas";
  bloco.appendChild(respostasEl);

  const desenharResposta = (r) => {
    const item = document.createElement("div");
    item.className = "ponto-resposta";
    const quem = document.createElement("strong");
    quem.textContent = r.autorApelido || "?";
    const oQue = document.createElement("span");
    oQue.textContent = r.texto || "";
    item.append(quem, oQue);
    if (meuUid && r.autorUid === meuUid) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "ponto-comentario-apagar";
      x.setAttribute("aria-label", "Apagar minha resposta");
      x.textContent = "✕";
      x.addEventListener("click", async () => {
        x.disabled = true;
        try {
          await window.raspadinhaAuth.excluirRespostaPonto(pontoAbertoId, c.id, r.id);
          item.remove();
        } catch (erro) {
          x.disabled = false;
          console.error(erro);
        }
      });
      item.appendChild(x);
    }
    respostasEl.appendChild(item);
  };

  let respostasCarregadas = false;
  const carregarRespostas = async () => {
    if (respostasCarregadas) return;
    respostasCarregadas = true;
    try {
      (await window.raspadinhaAuth.listarRespostasPonto(pontoAbertoId, c.id)).forEach(
        desenharResposta
      );
    } catch (erro) {
      console.error("Falha ao carregar respostas:", erro);
    }
  };
  carregarRespostas();

  /* RESPONDER É PRA QUALQUER PESSOA LOGADA, mesmo sem ter ido ao lugar:
     é aqui que quem tem dúvida pergunta a quem esteve lá. Comentar de
     primeira é que exige o GPS. */
  responder.addEventListener("click", async () => {
    if (!window.raspadinhaAuth?.usuarioAtual?.uid) {
      mostrarErroComentarioPonto("Entre na sua conta para responder.");
      return;
    }
    if (bloco.querySelector(".ponto-resposta-form")) return; // já aberto

    const form = document.createElement("div");
    form.className = "ponto-resposta-form";
    const campo = document.createElement("input");
    campo.type = "text";
    campo.maxLength = 500;
    campo.placeholder = `Responder a ${c.autorApelido || ""}…`;
    const enviar = document.createElement("button");
    enviar.type = "button";
    enviar.textContent = "Enviar";

    const submeter = async () => {
      const valor = campo.value.trim();
      if (!valor) return;
      enviar.disabled = true;
      try {
        const id = await window.raspadinhaAuth.responderComentarioPonto(
          pontoAbertoId,
          c.id,
          valor,
          c.autorUid
        );
        desenharResposta({
          id,
          autorUid: window.raspadinhaAuth.usuarioAtual.uid,
          autorApelido: window.raspadinhaAuth.apelido || "?",
          texto: valor,
        });
        form.remove();
      } catch (erro) {
        enviar.disabled = false;
        console.error("Falha ao responder:", erro);
        mostrarErroComentarioPonto("Não deu para enviar a resposta agora.");
      }
    };
    enviar.addEventListener("click", submeter);
    campo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") {
        evento.preventDefault();
        submeter();
      }
    });

    form.append(campo, enviar);
    bloco.appendChild(form);
    campo.focus();
  });

  return bloco;
}

/** Envia o comentário digitado no ponto aberto. */
async function enviarComentarioDoPonto() {
  const campo = document.getElementById("input-comentario-ponto");
  const botao = document.getElementById("btn-comentar-ponto");
  const texto = campo.value.trim();
  if (!texto || !pontoAbertoId) return;

  botao.disabled = true;
  try {
    await window.raspadinhaAuth.comentarPonto(pontoAbertoId, pontoAbertoMunicipio, texto);
    campo.value = "";
    renderizarComentariosDoPonto(
      await window.raspadinhaAuth.listarComentariosPonto(pontoAbertoId)
    );
  } catch (erro) {
    console.error("Falha ao comentar no ponto:", erro);
    // A regra do Firestore recusa quem não tem o município verificado.
    mostrarErroComentarioPonto(
      /permission|insufficient/i.test(String(erro?.message || erro))
        ? "Só quem teve a presença confirmada por GPS neste município pode comentar."
        : "Não deu para enviar seu comentário agora."
    );
  } finally {
    botao.disabled = false;
  }
}

function fecharPontoTuristico() {
  fecharComAnimacao(document.getElementById("modal-ponto"));
}

/* Município do ponto aberto -- o botão "Ver cidade" precisa saber pra
   onde levar. */
let pontoAbertoMunicipio = null;

/** "Ver cidade": fecha o ponto e abre o selo do município dele. */
function verCidadeDoPonto() {
  const id = pontoAbertoMunicipio;
  if (!id) return;
  fecharPontoTuristico();
  const nome = destinosPorMunicipio[id]?.nome;
  abrirSeloPorId(id, nome);
}

/**
 * Busca de imagens do lugar no Google, pelo mesmo par nome + município.
 *
 * Existe porque foto EMBUTIDA não dá: a API de fotos do Google Places é
 * cobrada e exigiria uma chave dentro de um app cliente de repositório
 * público, e adivinhar a foto pela Wikipédia erra calado (uma "Igreja
 * Matriz de São Sebastião" volta um quadro renascentista do santo).
 * Abrir a busca troca "eu escolho uma foto e às vezes erro" por "a
 * pessoa vê todas e escolhe com os olhos".
 */
function linkDeImagens(nomeDestino, nomeMunicipio) {
  const busca = `${nomeDestino} ${nomeMunicipio} RJ`;
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(busca)}`;
}

function linkDoMaps(nomeDestino, nomeMunicipio) {
  // Parêntese vira espaço: "Ilha Grande (Vila do Abraão)" busca melhor
  // como "Ilha Grande Vila do Abraão" -- a pontuação atrapalha e o que
  // está dentro dos parênteses costuma ser justamente o mais preciso.
  const lugar = String(nomeDestino).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const busca = `${lugar}, ${nomeMunicipio} - RJ`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(busca)}`;
}

function mostrarDestinos(id) {
  const container = document.getElementById("modal-destinos");
  const destino = destinosPorMunicipio[id];

  if (!destino || !destino.destinos?.length) {
    container.innerHTML = "";
    return;
  }

  const itens = destino.destinos
    .map((d, indice) => {
      // Sempre tem link: ou o exato colado no JSON, ou a busca montada
      // na hora. O botão não fica mais desabilitado esperando alguém
      // colar 460 URLs à mão.
      const link = d.linkMaps || linkDoMaps(d.nome, destino.nome);
      return `
        <li>
          <button type="button" class="destino-item" data-indice="${indice}" aria-expanded="false">
            <strong>${escaparHtml(d.nome)}</strong>${escaparHtml(d.descricao)}
          </button>
          <div class="destino-detalhe oculto" data-indice="${indice}">
            <p class="destino-texto-completo">${escaparHtml(d.textoCompleto || "Em breve: um pouco da história e curiosidades sobre este lugar.")}</p>
            <div class="destino-acoes">
              <button type="button" class="destino-btn-maps" data-link="${escaparHtml(link)}">
                Abrir no Maps ↗
              </button>
              <button type="button" class="destino-btn-maps destino-btn-imagens" data-link="${escaparHtml(linkDeImagens(d.nome, destino.nome))}">
                Imagens ↗
              </button>
            </div>
          </div>
        </li>`;
    })
    .join("");

  container.innerHTML = `<h3>Pontos turísticos</h3><ul>${itens}</ul>`;
}

/**
 * Delegação de evento pros itens de destino (criados dinamicamente):
 * clicar no nome abre/fecha o detalhe; clicar em "Abrir no Maps" (só
 * quando tiver link) abre num navegador/app de mapas.
 */
function aoClicarDestino(evento) {
  const botaoMaps = evento.target.closest(".destino-btn-maps");
  if (botaoMaps) {
    if (botaoMaps.dataset.link) window.open(botaoMaps.dataset.link, "_blank");
    return;
  }

  const item = evento.target.closest(".destino-item");
  if (!item) return;

  const detalhe = document.querySelector(
    `.destino-detalhe[data-indice="${item.dataset.indice}"]`
  );
  const abrindo = detalhe.classList.contains("oculto");
  detalhe.classList.toggle("oculto");
  item.setAttribute("aria-expanded", String(abrindo));
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

/**
 * Fecha uma janela COM animação de saída, em vez de sumir na hora.
 *
 * O app inteiro esconde janela com `.oculto` (display:none), que corta
 * o elemento no mesmo quadro. Aqui a gente põe uma classe de saída
 * (.fechando pras gavetas, .janela-fechando pras centralizadas, ver
 * css/styles.css), espera a animação e SÓ ENTÃO aplica o `.oculto`.
 *
 * De propósito NÃO troquei o `.oculto` por um sistema de `.open` em
 * todo o app: são dezenas de modais abrindo/fechando em muitos pontos,
 * e a animação de ENTRADA já funciona hoje via `:not(.oculto)`. Este
 * helper cobre a lacuna real (a saída) sem tocar em nada disso.
 */
function fecharComAnimacao(elemento, classeSaida = "fechando") {
  if (!elemento || elemento.classList.contains("oculto")) return;

  // Quem pediu menos movimento no sistema fecha na hora, sem espera.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    elemento.classList.add("oculto");
    return;
  }

  const encerrar = () => {
    elemento.classList.remove(classeSaida);
    elemento.classList.add("oculto");
  };

  // Rede de segurança: se o animationend não vier (aba em segundo
  // plano, animação cancelada, navegador antigo), a janela não pode
  // ficar presa na tela pra sempre.
  const salvaVidas = setTimeout(encerrar, 400);
  elemento.addEventListener(
    "animationend",
    (evento) => {
      // Só o fim da animação DESTE elemento conta -- o animationend
      // dos filhos (a folha dentro do overlay) também borbulha aqui.
      if (evento.target !== elemento) return;
      clearTimeout(salvaVidas);
      encerrar();
    },
    { once: true }
  );

  elemento.classList.add(classeSaida);
}

/**
 * Destaca menções "@algo" dentro de um texto JÁ ESCAPADO (ver
 * escaparHtml -- tem que ser chamada depois, nunca antes, senão vira
 * brecha de HTML injection). Usado na legenda dos posts da Comunidade
 * pra dar o mesmo efeito visual de link do Instagram/Threads --  é só
 * texto livre digitado por quem postou, sem uid associado (por isso
 * não é clicável; diferente das pessoas marcadas de verdade, que têm
 * uid e abrem o perfil ao tocar, ver renderizarCardPost).
 */
function destacarMencoes(textoEscapado) {
  return textoEscapado.replace(
    /(^|\s)(@[\p{L}0-9_]+)/gu,
    (match, espaco, mencao) => `${espaco}<span class="post-mencao">${mencao}</span>`
  );
}

const cacheExisteImagem = {};

/**
 * Testa se uma imagem existe/carrega, sem lançar erro se não existir.
 * O resultado fica em cache (mesma URL não é testada de novo).
 */
function carregarImagem(src) {
  if (src in cacheExisteImagem) {
    return Promise.resolve(cacheExisteImagem[src]);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      cacheExisteImagem[src] = true;
      resolve(true);
    };
    img.onerror = () => {
      cacheExisteImagem[src] = false;
      resolve(false);
    };
    img.src = src;
  });
}

/**
 * Pré-carrega em segundo plano (sem travar nada) os selos de todos
 * os municípios, colorido + capa. Assim, quando o usuário abrir um
 * município mais tarde, a imagem já está no cache do navegador — sem
 * essa demora inicial que às vezes fazia parecer que não carregou.
 */
function preCarregarSelos() {
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const id = path.dataset.municipio;
    carregarImagem(`assets/img/selos/${id}.webp`);
    carregarImagem(`assets/img/selos/${id}fundo.webp`);
  });
}

/**
 * Fecha o popup de raspadinha/selo e limpa o canvas.
 */
function fecharModalRaspadinha() {
  document.getElementById("modal-raspadinha").classList.add("oculto");
  document.getElementById("modal-menu").classList.add("oculto");
  document.getElementById("scratch-modal-body").innerHTML = "";
}

/**
 * Abre a biblioteca de selos: uma grade com todos os municípios,
 * em cinza os ainda não visitados e coloridos os já raspados, com
 * contador e barra de progresso no topo.
 * Clicar num item reaproveita a mesma lógica de abrir o selo.
 */
/* ============================================================
   BIBLIOTECA DE SELOS: álbum de colecionador com 3 abas (Municípios/
   Regiões/Rotas -- Conquistas tem modal próprio, ver abrirConquistas,
   não duplica aqui) + filtro de status (Todos/Conquistados/Faltam).
   Cada .selo-item ganha .locked ou .unlocked (ver CSS) além das
   classes que já existiam -- é isso que o filtro liga/desliga.
   ============================================================ */
let bibliotecaAbaAtual = "municipios";
let bibliotecaFiltroAtual = "todos";
// Contagem "atual/total" de cada aba, preenchida na hora de montar
// cada grade -- usada só pra atualizar o texto/barra do topo quando
// a pessoa troca de aba, sem precisar recalcular tudo de novo.
let bibliotecaContagens = {
  municipios: { atual: 0, total: 0 },
  regioes: { atual: 0, total: 0 },
  rotas: { atual: 0, total: 0 },
};

function configurarBiblioteca() {
  document.querySelectorAll("#biblioteca-abas .biblioteca-aba").forEach((botao) => {
    botao.addEventListener("click", () => mudarAbaBiblioteca(botao.dataset.aba));
  });
  document.querySelectorAll("#biblioteca-filtros .biblioteca-filtro").forEach((botao) => {
    botao.addEventListener("click", () => mudarFiltroBiblioteca(botao.dataset.filtro));
  });
}

function mudarAbaBiblioteca(aba) {
  bibliotecaAbaAtual = aba;
  document.querySelectorAll("#biblioteca-abas .biblioteca-aba").forEach((b) => {
    b.classList.toggle("biblioteca-aba-ativa", b.dataset.aba === aba);
  });
  document.getElementById("biblioteca-painel-municipios").classList.toggle("oculto", aba !== "municipios");
  document.getElementById("biblioteca-painel-regioes").classList.toggle("oculto", aba !== "regioes");
  document.getElementById("biblioteca-painel-rotas").classList.toggle("oculto", aba !== "rotas");
  atualizarContadorBiblioteca();
}

function mudarFiltroBiblioteca(filtro) {
  bibliotecaFiltroAtual = filtro;
  document.querySelectorAll("#biblioteca-filtros .biblioteca-filtro").forEach((b) => {
    b.classList.toggle("biblioteca-filtro-ativo", b.dataset.filtro === filtro);
  });
  aplicarFiltroBiblioteca();
}

/** Esconde/mostra cada .selo-item conforme o filtro de status ativo
 * -- roda nos 3 grids de uma vez (só o da aba visível importa de
 * verdade, mas filtrar todos junto é mais simples e barato). */
function aplicarFiltroBiblioteca() {
  document.querySelectorAll("#biblioteca-conteudo .selo-item").forEach((item) => {
    const mostrar =
      bibliotecaFiltroAtual === "todos" ||
      (bibliotecaFiltroAtual === "conquistados" && item.classList.contains("unlocked")) ||
      (bibliotecaFiltroAtual === "faltam" && item.classList.contains("locked"));
    item.classList.toggle("selo-item-oculto-filtro", !mostrar);
  });
}

function atualizarContadorBiblioteca() {
  const { atual, total } = bibliotecaContagens[bibliotecaAbaAtual] || { atual: 0, total: 0 };
  const rotulos = { municipios: "selos coletados", regioes: "regiões conquistadas", rotas: "rotas conquistadas" };
  document.getElementById("biblioteca-contador").textContent =
    `${atual} / ${total} ${rotulos[bibliotecaAbaAtual] || ""}`;
  document.getElementById("biblioteca-barra-preenchida").style.width =
    `${total ? (atual / total) * 100 : 0}%`;
}

/** Envolve a <img> num container .selo-placeholder-box (ver CSS) --
 * assim, enquanto o src ainda não chegou (ou não existe arte
 * nenhuma), aparece o círculo com emoji em vez de espaço vazio/ícone
 * de imagem quebrada. A variante muda a cor/emoji do placeholder;
 * "bloqueado" é escolhida à parte via classe .locked no item pai. */
function envolverComPlaceholder(img, variante) {
  const box = document.createElement("div");
  box.className = "selo-placeholder-box" + (variante ? ` selo-placeholder-${variante}` : "");
  img.classList.add("selo-placeholder-img");
  box.appendChild(img);
  return box;
}

function abrirBibliotecaSelos() {
  const grade = document.getElementById("biblioteca-grade");
  grade.innerHTML = "";

  /* A Biblioteca é o álbum de selos DO ESTADO. Num estado ainda não
     publicado não existe selo nenhum -- e listar os do estado publicado
     aqui daria a entender que são de outro lugar. Revela o modal na
     própria guarda, igual a Conquistas e Rotas. */
  if (emEstadoLimitado()) {
    avisarConteudoEmDesenvolvimento(grade, "Biblioteca de selos");
    document.getElementById("biblioteca-selos").classList.remove("oculto");
    return;
  }

  const municipios = Array.from(document.querySelectorAll("#mapa-rj .municipio"))
    .map((path) => ({ id: path.dataset.municipio, nome: path.dataset.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const totalVisitados = municipios.filter((m) => !!estadoMapa[m.id]?.visitado).length;
  bibliotecaContagens.municipios = { atual: totalVisitados, total: municipios.length };

  municipios.forEach(({ id, nome }) => {
    const visitado = !!estadoMapa[id]?.visitado;
    const verificado = estaVerificado(id);
    const brilhante = visitado && !!estadoMapa[id]?.brilhante;

    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "selo-item" +
      (visitado ? " unlocked" : " locked") +
      (brilhante ? " selo-item-brilhante" : "") +
      (visitado && !verificado ? " selo-item-nao-verificado" : "");
    item.title = !verificado && visitado
      ? `${nome} ⚠️ (raspado, mas não verificado)`
      : brilhante
      ? `${nome} ✨ (raspadinha brilhante!)`
      : nome;

    const img = document.createElement("img");
    img.alt = nome;
    img.className = verificado ? "selo-colorido" : visitado ? "selo-nao-verificado" : "selo-cinza";

    resolverImagemColorida(`assets/img/selos/${id}`, brilhante, id, nome).then((resultado) => {
      img.src = resultado.url;
    });

    item.addEventListener("click", () => abrirSeloLightbox(img.src, nome));

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(envolverComPlaceholder(img, "verde"));
    if (visitado && !verificado) {
      const alerta = document.createElement("span");
      alerta.className = "selo-marca-alerta";
      alerta.textContent = "⚠️";
      item.appendChild(alerta);
    } else if (brilhante) {
      const marca = document.createElement("span");
      marca.className = "selo-marca-brilhante";
      marca.textContent = "✨";
      item.appendChild(marca);
    }
    item.appendChild(legenda);
    grade.appendChild(item);
  });

  renderizarGradeRegioesNaBiblioteca();
  renderizarGradeRotasNaBiblioteca();

  bibliotecaAbaAtual = "municipios";
  bibliotecaFiltroAtual = "todos";
  mudarAbaBiblioteca("municipios");
  mudarFiltroBiblioteca("todos");

  document.getElementById("biblioteca-selos").classList.remove("oculto");
}

/**
 * Lightbox simples: mostra a imagem de um selo (já resolvida --
 * colorida ou placeholder) em tamanho maior, com um botão de voltar
 * que só fecha o lightbox, sem navegar pro popup completo do
 * município/região/rota/conquista.
 */
function abrirSeloLightbox(imageUrl, nome) {
  document.getElementById("selo-lightbox-imagem").src = imageUrl;
  document.getElementById("selo-lightbox-imagem").alt = nome;
  document.getElementById("selo-lightbox-legenda").textContent = nome;
  document.getElementById("modal-selo-lightbox").classList.remove("oculto");
}

function fecharSeloLightbox() {
  document.getElementById("modal-selo-lightbox").classList.add("oculto");
}

/**
 * Mega-selos de região dentro da biblioteca (mesma grade visual dos
 * municípios) — só clicáveis (abrem o popup da região) quando a
 * região já está completa, senão mostram cadeado.
 */
function renderizarGradeRegioesNaBiblioteca() {
  const grade = document.getElementById("biblioteca-grade-regioes");
  grade.innerHTML = "";

  const idsRegioes = Object.keys(municipiosPorRegiao).sort((a, b) =>
    (regioesInfo[a]?.nome || a).localeCompare(regioesInfo[b]?.nome || b, "pt-BR")
  );
  const completas = idsRegioes.filter((id) => regiaoEstaCompleta(id)).length;
  bibliotecaContagens.regioes = { atual: completas, total: idsRegioes.length };

  idsRegioes.forEach((id) => {
    const nome = regioesInfo[id]?.nome || id;
    const completa = regiaoEstaCompleta(id);
    const revelado = completa && !!estadoRegioes[id]?.revelado;
    const brilhante = revelado && !!estadoRegioes[id]?.brilhante;

    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "selo-item" + (completa ? " unlocked" : " locked") + (brilhante ? " selo-item-brilhante" : "");
    item.title = brilhante ? `${nome} 🌟 (mega-selo dourado!)` : nome;

    const img = document.createElement("img");
    img.alt = nome;
    img.className = revelado ? "selo-colorido" : "selo-cinza";

    if (revelado) {
      resolverImagemColorida(`assets/img/regioes/${id}`, brilhante, id, nome).then((resultado) => {
        img.src = resultado.url;
      });
    } else {
      img.src = gerarSeloPlaceholder(id, nome);
    }

    item.addEventListener("click", () => abrirSeloLightbox(img.src, nome));

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(envolverComPlaceholder(img, "dourado"));
    if (brilhante) {
      const marca = document.createElement("span");
      marca.className = "selo-marca-brilhante";
      marca.textContent = "✨";
      item.appendChild(marca);
    }
    item.appendChild(legenda);
    grade.appendChild(item);
  });
}

/**
 * Selos de rota temática dentro da biblioteca -- mesma ideia dos
 * selos de região: cadeado até completar todos os municípios da rota.
 */
function renderizarGradeRotasNaBiblioteca() {
  const grade = document.getElementById("biblioteca-grade-rotas");
  grade.innerHTML = "";

  const idsRotas = Object.keys(rotasInfo).sort((a, b) =>
    (rotasInfo[a]?.nome || a).localeCompare(rotasInfo[b]?.nome || b, "pt-BR")
  );
  const completas = idsRotas.filter((id) => rotaEstaCompleta(id)).length;
  bibliotecaContagens.rotas = { atual: completas, total: idsRotas.length };

  idsRotas.forEach((id) => {
    const nome = rotasInfo[id]?.nome || id;
    const completa = rotaEstaCompleta(id);
    const revelado = completa && !!estadoRotas[id]?.revelado;
    const brilhante = revelado && !!estadoRotas[id]?.brilhante;

    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "selo-item" + (completa ? " unlocked" : " locked") + (brilhante ? " selo-item-brilhante" : "");
    item.title = brilhante ? `${nome} 🌟 (selo de rota dourado!)` : nome;

    const img = document.createElement("img");
    img.alt = nome;
    img.className = revelado ? "selo-colorido" : "selo-cinza";

    if (revelado) {
      resolverImagemColorida(`assets/img/rotas/${id}`, brilhante, id, nome).then((resultado) => {
        img.src = resultado.url;
      });
    } else {
      img.src = gerarSeloPlaceholder(id, nome);
    }

    item.addEventListener("click", () => abrirSeloLightbox(img.src, nome));

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(envolverComPlaceholder(img, "dourado"));
    if (brilhante) {
      const marca = document.createElement("span");
      marca.className = "selo-marca-brilhante";
      marca.textContent = "✨";
      item.appendChild(marca);
    }
    item.appendChild(legenda);
    grade.appendChild(item);
  });
}

function fecharBibliotecaSelos() {
  document.getElementById("biblioteca-selos").classList.add("oculto");
}

/**
 * Esconde de quem não tem conta o que só existe com conta.
 *
 * Configurações deixou de exigir login: tema, som e os mapas dos
 * estados são do APARELHO, não da conta, e mandar alguém criar login
 * pra trocar o tema é barreira sem contrapartida. Mas apelido, perfil
 * público, "sair" e "excluir conta" não fazem sentido nenhum sem uma --
 * "Sair da conta" sem conta é botão que só pode dar errado.
 */
function ajustarConfiguracoesParaVisitante() {
  const logado = !!window.raspadinhaAuth?.usuarioAtual;
  document.getElementById("settings-bloco-apelido")?.classList.toggle("oculto", !logado);
  document.getElementById("settings-card-conta")?.classList.toggle("oculto", !logado);
  document.getElementById("btn-entrar-config")?.classList.toggle("oculto", logado);
}

function abrirConfiguracoes() {
  sincronizarCheckboxNotificacoes();
  ajustarConfiguracoesParaVisitante();
  document.getElementById("modal-configuracoes").classList.remove("oculto");
  // Assíncrono (consulta o CacheStorage): monta depois de abrir, pra
  // não segurar o painel. A lista aparece em um quadro.
  renderizarMapasDeEstado();
}

function fecharConfiguracoes() {
  document.getElementById("modal-configuracoes").classList.add("oculto");
}

/* ============================================================
   Conquistas: raspadinha própria pra cada marco. Vários TIPOS de
   meta (não só "X% dos municípios") -- ver progressoConquista().
   Percentuais são sempre arredondados pra CIMA (Math.ceil).
   ============================================================ */

// `raridade` é fixa/curada por dificuldade (não calculada por % de
// contas) -- da mais fácil (comum) pra mais difícil (farmador de
// aura), na ordem que faz sentido pra cada tipo de meta.
const DEFINICOES_CONQUISTAS = [
  { chave: "primeiros-passos", titulo: "Primeiros Passos", tipo: "municipios", meta: 3, raridade: "comum", descricao: "Visite e confirme 3 municípios." },
  { chave: "25pct", titulo: "Explorador Iniciante", tipo: "municipios-pct", meta: 0.25, raridade: "incomum", descricao: "Confirme 25% dos municípios do RJ." },
  { chave: "50pct", titulo: "Meio Caminho Andado", tipo: "municipios-pct", meta: 0.5, raridade: "raro", descricao: "Confirme 50% dos municípios do RJ." },
  { chave: "75pct", titulo: "Quase Lá", tipo: "municipios-pct", meta: 0.75, raridade: "muito-raro", descricao: "Confirme 75% dos municípios do RJ." },
  { chave: "100pct", titulo: "Desbravador", tipo: "municipios-pct", meta: 1, raridade: "lendario", descricao: "Confirme os 92 municípios do RJ." },

  { chave: "streak-7", titulo: "Semana Cheia", tipo: "streak", meta: 7, raridade: "incomum", descricao: "Abra o app 7 dias seguidos, sem pular nenhum." },

  { chave: "dia-3", titulo: "Dia Corrido", tipo: "municipios-no-dia", meta: 3, raridade: "incomum", descricao: "Confirme 3 municípios diferentes no mesmo dia." },
  { chave: "dia-5", titulo: "Maratona do Dia", tipo: "municipios-no-dia", meta: 5, raridade: "raro", descricao: "Confirme 5 municípios diferentes no mesmo dia." },
  { chave: "dia-8", titulo: "Turbo Turista", tipo: "municipios-no-dia", meta: 8, raridade: "muito-raro", descricao: "Confirme 8 municípios diferentes no mesmo dia." },

  { chave: "regiao-1", titulo: "Primeira Região", tipo: "regioes", meta: 1, raridade: "incomum", descricao: "Complete todos os municípios de 1 região e raspe o mega-selo." },
  { chave: "regiao-25pct", titulo: "Regiões em Dobro", tipo: "regioes-pct", meta: 0.25, raridade: "raro", descricao: "Complete 25% das 8 regiões do RJ." },
  { chave: "regiao-50pct", titulo: "Metade do Estado", tipo: "regioes-pct", meta: 0.5, raridade: "muito-raro", descricao: "Complete 50% das 8 regiões do RJ." },
  { chave: "regiao-100pct", titulo: "Senhor das Regiões", tipo: "regioes-pct", meta: 1, raridade: "lendario", descricao: "Complete as 8 regiões do RJ." },

  { chave: "brilhante-1", titulo: "Primeira Fagulha", tipo: "brilhantes", meta: 1, raridade: "raro", descricao: "Consiga 1 selo de município dourado (5% de chance por raspagem)." },
  { chave: "brilhante-3", titulo: "Coleção Dourada", tipo: "brilhantes", meta: 3, raridade: "muito-raro", descricao: "Consiga 3 selos de município dourados." },
  { chave: "brilhante-5", titulo: "Mão de Ouro", tipo: "brilhantes", meta: 5, raridade: "muito-raro", descricao: "Consiga 5 selos de município dourados." },
  { chave: "brilhante-10", titulo: "Sortudo", tipo: "brilhantes", meta: 10, raridade: "lendario", descricao: "Consiga 10 selos de município dourados." },
  { chave: "brilhante-25", titulo: "Ímã de Sorte", tipo: "brilhantes", meta: 25, raridade: "lendario", descricao: "Consiga 25 selos de município dourados." },
  { chave: "brilhante-50", titulo: "Rei do Brilho", tipo: "brilhantes", meta: 50, raridade: "farmador", descricao: "Consiga 50 selos de município dourados." },
  { chave: "brilhante-100pct", titulo: "Tudo Reluz", tipo: "brilhantes-pct", meta: 1, raridade: "farmador", descricao: "Deixe os 92 selos de município dourados." },

  { chave: "regiao-brilhante-1", titulo: "Região Radiante", tipo: "regioes-brilhantes", meta: 1, raridade: "muito-raro", descricao: "Consiga 1 mega-selo de região dourado (10% de chance)." },
  { chave: "regiao-brilhante-25pct", titulo: "Constelação Regional", tipo: "regioes-brilhantes-pct", meta: 0.25, raridade: "lendario", descricao: "Consiga mega-selos dourados em 25% das regiões." },
  { chave: "regiao-brilhante-50pct", titulo: "Metade em Ouro", tipo: "regioes-brilhantes-pct", meta: 0.5, raridade: "farmador", descricao: "Consiga mega-selos dourados em 50% das regiões." },
  { chave: "regiao-brilhante-100pct", titulo: "Reino Dourado", tipo: "regioes-brilhantes-pct", meta: 1, raridade: "farmador", descricao: "Consiga mega-selos dourados nas 8 regiões." },

  { chave: "rota-1", titulo: "Primeira Rota", tipo: "rotas", meta: 1, raridade: "incomum", descricao: "Complete todos os municípios de 1 rota temática e raspe o selo especial." },
  { chave: "rota-25pct", titulo: "Rotas em Dobro", tipo: "rotas-pct", meta: 0.25, raridade: "raro", descricao: "Complete 25% das rotas temáticas." },
  { chave: "rota-50pct", titulo: "Metade das Rotas", tipo: "rotas-pct", meta: 0.5, raridade: "muito-raro", descricao: "Complete 50% das rotas temáticas." },
  { chave: "rota-100pct", titulo: "Mestre das Rotas", tipo: "rotas-pct", meta: 1, raridade: "lendario", descricao: "Complete todas as rotas temáticas do estado." },

  { chave: "rota-brilhante-1", titulo: "Rota Radiante", tipo: "rotas-brilhantes", meta: 1, raridade: "muito-raro", descricao: "Consiga 1 selo de rota dourado (10% de chance)." },
  { chave: "rota-brilhante-25pct", titulo: "Trilha Dourada", tipo: "rotas-brilhantes-pct", meta: 0.25, raridade: "lendario", descricao: "Consiga selos de rota dourados em 25% das rotas." },
  { chave: "rota-brilhante-50pct", titulo: "Metade Reluzente", tipo: "rotas-brilhantes-pct", meta: 0.5, raridade: "farmador", descricao: "Consiga selos de rota dourados em 50% das rotas." },
  { chave: "rota-brilhante-100pct", titulo: "Todas as Rotas em Ouro", tipo: "rotas-brilhantes-pct", meta: 1, raridade: "farmador", descricao: "Consiga selos de rota dourados em todas as rotas." },

  // Conquistas "históricas": cada uma exige completar UMA rota
  // específica (não uma contagem genérica) -- escolhidas pra cobrir
  // eras/temas bem diferentes da história fluminense. Raridade segue
  // o mesmo critério do resto do arquivo (dificuldade = tamanho da
  // rota, não importância do tema).
  { chave: "rota-tema-ouro", titulo: "Febre do Ouro", tipo: "rota-tema", rotaId: "caminho-do-ouro", raridade: "raro", descricao: "Complete a Rota do Caminho do Ouro." },
  { chave: "rota-tema-cafe", titulo: "Barão do Café", tipo: "rota-tema", rotaId: "cafe-fluminense", raridade: "muito-raro", descricao: "Complete a Rota do Café Fluminense." },
  { chave: "rota-tema-franca-antartica", titulo: "Guardião de Guanabara", tipo: "rota-tema", rotaId: "franca-antartica", raridade: "incomum", descricao: "Complete a Rota da França Antártica." },
  { chave: "rota-tema-chibata", titulo: "Almirante Negro", tipo: "rota-tema", rotaId: "revolta-da-chibata", raridade: "comum", descricao: "Complete a Rota da Revolta da Chibata." },
  { chave: "rota-tema-quilombola", titulo: "Memória Quilombola", tipo: "rota-tema", rotaId: "resistencia-quilombola", raridade: "muito-raro", descricao: "Complete a Rota da Resistência Quilombola." },
  { chave: "rota-tema-darwin", titulo: "Naturalista do Litoral", tipo: "rota-tema", rotaId: "naturalistas-darwin", raridade: "lendario", descricao: "Complete a Rota dos Naturalistas e de Charles Darwin." },
];

/**
 * Maior quantidade de municípios verificados no MESMO dia de
 * calendário (agrupando por `dataVisita`) -- alimenta as conquistas
 * "municipios-no-dia" (visitar 3/5/8 num único dia).
 */
function maiorQuantidadeMunicipiosNoMesmoDia() {
  const contagemPorDia = {};
  Object.keys(estadoMapa).forEach((id) => {
    if (!estaVerificado(id)) return;
    const data = estadoMapa[id].dataVisita;
    if (!data) return;
    const diaChave = new Date(data).toDateString();
    contagemPorDia[diaChave] = (contagemPorDia[diaChave] || 0) + 1;
  });
  const valores = Object.values(contagemPorDia);
  return valores.length ? Math.max(...valores) : 0;
}

/**
 * Junta todos os números que as conquistas precisam, calculados uma
 * vez por abertura/atualização (evita recalcular tudo pra cada
 * conquista da lista).
 */
function calcularContextoConquistas() {
  const totalMunicipios = document.querySelectorAll("#mapa-rj .municipio").length;
  const totalRegioes = Object.keys(municipiosPorRegiao).length;
  const totalRotas = Object.keys(rotasInfo).length;
  return {
    totalMunicipios,
    totalRegioes,
    totalRotas,
    municipiosVerificados: Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length,
    regioesCompletas: Object.keys(municipiosPorRegiao).filter((id) => regiaoEstaCompleta(id)).length,
    rotasCompletas: Object.keys(rotasInfo).filter((id) => rotaEstaCompleta(id)).length,
    municipiosBrilhantes: Object.keys(estadoMapa).filter(
      (id) => estadoMapa[id]?.visitado && estadoMapa[id]?.brilhante
    ).length,
    regioesBrilhantes: Object.keys(estadoRegioes).filter(
      (id) => estadoRegioes[id]?.revelado && estadoRegioes[id]?.brilhante
    ).length,
    rotasBrilhantes: Object.keys(estadoRotas).filter(
      (id) => estadoRotas[id]?.revelado && estadoRotas[id]?.brilhante
    ).length,
    maiorNoDia: maiorQuantidadeMunicipiosNoMesmoDia(),
    streakAtual: estadoStreak.contagem,
  };
}

/**
 * Progresso atual/meta de UMA conquista, de acordo com o `tipo`
 * dela, usando o contexto já calculado (ver calcularContextoConquistas).
 */
function progressoConquista(def, ctx) {
  switch (def.tipo) {
    case "municipios":
      return { atual: Math.min(ctx.municipiosVerificados, def.meta), meta: def.meta };
    case "municipios-pct": {
      const meta = Math.ceil(ctx.totalMunicipios * def.meta);
      return { atual: Math.min(ctx.municipiosVerificados, meta), meta };
    }
    case "streak":
      return { atual: Math.min(ctx.streakAtual, def.meta), meta: def.meta };
    case "municipios-no-dia":
      return { atual: Math.min(ctx.maiorNoDia, def.meta), meta: def.meta };
    case "regioes":
      return { atual: Math.min(ctx.regioesCompletas, def.meta), meta: def.meta };
    case "regioes-pct": {
      const meta = Math.max(1, Math.ceil(ctx.totalRegioes * def.meta));
      return { atual: Math.min(ctx.regioesCompletas, meta), meta };
    }
    case "brilhantes":
      return { atual: Math.min(ctx.municipiosBrilhantes, def.meta), meta: def.meta };
    case "brilhantes-pct":
      return { atual: Math.min(ctx.municipiosBrilhantes, ctx.totalMunicipios), meta: ctx.totalMunicipios };
    case "regioes-brilhantes":
      return { atual: Math.min(ctx.regioesBrilhantes, def.meta), meta: def.meta };
    case "regioes-brilhantes-pct": {
      const meta = Math.max(1, Math.ceil(ctx.totalRegioes * def.meta));
      return { atual: Math.min(ctx.regioesBrilhantes, meta), meta };
    }
    case "rotas":
      return { atual: Math.min(ctx.rotasCompletas, def.meta), meta: def.meta };
    case "rotas-pct": {
      const meta = Math.max(1, Math.ceil(ctx.totalRotas * def.meta));
      return { atual: Math.min(ctx.rotasCompletas, meta), meta };
    }
    case "rotas-brilhantes":
      return { atual: Math.min(ctx.rotasBrilhantes, def.meta), meta: def.meta };
    case "rotas-brilhantes-pct": {
      const meta = Math.max(1, Math.ceil(ctx.totalRotas * def.meta));
      return { atual: Math.min(ctx.rotasBrilhantes, meta), meta };
    }
    // Conquista "histórica": exige completar UMA rota temática
    // específica (def.rotaId), em vez de uma contagem genérica --
    // usa rotaEstaCompleta diretamente, não o contexto pré-calculado.
    case "rota-tema":
      return { atual: rotaEstaCompleta(def.rotaId) ? 1 : 0, meta: 1 };
    default:
      return { atual: 0, meta: def.meta || 1 };
  }
}

// Rótulo exibido pra cada nível de raridade (a raridade em si é fixa
// por conquista, ver campo `raridade` em DEFINICOES_CONQUISTAS --
// classificada por dificuldade, não por quantas contas já têm).
const NOMES_RARIDADE = {
  comum: "Comum",
  incomum: "Incomum",
  raro: "Raro",
  "muito-raro": "Muito raro",
  lendario: "Lendário",
  farmador: "Farmador de Aura",
};

function abrirConquistas() {
  const container = document.getElementById("conquistas-lista");
  container.innerHTML = "";

  /* Conquistas são POR ESTADO. Num estado ainda não publicado não há o
     que mostrar, e exibir as de outro seria creditá-las ao lugar errado.

     ATENÇÃO: o modal é aberto AQUI e não só no fim da função. Quando eu
     pus este `return`, a última linha (que revela o modal) deixou de ser
     alcançada -- Conquistas e Rotas simplesmente não abriam nada em
     MG/SP, e o aviso ficava montado numa janela invisível. */
  if (emEstadoLimitado()) {
    avisarConteudoEmDesenvolvimento(container, "Conquistas");
    document.getElementById("modal-conquistas").classList.remove("oculto");
    return;
  }

  const ctx = calcularContextoConquistas();

  DEFINICOES_CONQUISTAS.forEach((def) => {
    const { atual, meta } = progressoConquista(def, ctx);
    const desbloqueada = atual >= meta;

    const item = document.createElement("div");
    /* O card INTEIRO comunica o estado, nao so a medalha: bloqueado
       fica apagado e com a borda mais discreta. Antes so a medalha
       mudava, e numa lista longa a diferenca passava batido. */
    item.className = "conquista-item" + (desbloqueada ? " conquista-item-livre" : " conquista-item-bloqueada");
    item.innerHTML = `
      <div class="conquista-medalha" id="conquista-selo-${def.chave}"></div>
      <div class="conquista-info">
        <div class="conquista-cabecalho">
          <h3>${escaparHtml(def.titulo)}</h3>
          <span class="conquista-raridade raridade-${def.raridade}">${NOMES_RARIDADE[def.raridade]}</span>
        </div>
        <p class="conquista-descricao">${escaparHtml(def.descricao)}</p>
        <p class="conquista-instrucao" id="conquista-instrucao-${def.chave}"></p>
        <div class="conquista-progresso-linha">
          <div class="conquista-barra"><div class="conquista-barra-preenchida" style="width:${(atual / meta) * 100}%"></div></div>
          <span class="conquista-progresso-texto">${atual}/${meta}</span>
        </div>
      </div>
    `;
    container.appendChild(item);

    renderizarSeloConquista(def.chave, def.titulo, desbloqueada);
  });

  document.getElementById("modal-conquistas").classList.remove("oculto");
}

function renderizarSeloConquista(chave, titulo, desbloqueada) {
  const corpo = document.getElementById(`conquista-selo-${chave}`);
  const instrucao = document.getElementById(`conquista-instrucao-${chave}`);

  if (!desbloqueada) {
    instrucao.textContent = "";
    corpo.innerHTML = `
      <div class="conquista-medalha-lock">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2"/>
          <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
      </div>`;
    return;
  }

  if (estadoConquistas[chave]?.revelado) {
    instrucao.textContent = "";
    const caminhoColorido = `assets/img/conquistas/${chave}.webp`;
    carregarImagem(caminhoColorido).then((existeColorido) => {
      corpo.innerHTML = "";
      const wrapper = document.createElement("div");
      wrapper.className = "selo-revelado-wrapper";
      const img = document.createElement("img");
      img.src = existeColorido ? caminhoColorido : gerarSeloPlaceholder(chave, titulo, 76);
      img.alt = titulo;
      img.className = "selo-revelado selo-revelado-conquista";
      wrapper.appendChild(img);
      corpo.appendChild(wrapper);
    });
    return;
  }

  instrucao.textContent = "Conquista desbloqueada! Raspe o selo.";
  mostrarSpinnerGrande(corpo, true);
  const caminhoColorido = `assets/img/conquistas/${chave}.webp`;
  const caminhoCapa = `assets/img/conquistas/${chave}fundo.webp`;
  carregarImagem(caminhoColorido).then((existeColorido) => {
    const imageUrl = existeColorido ? caminhoColorido : gerarSeloPlaceholder(chave, titulo, 76);
    const usarCapa = existeColorido
      ? carregarImagem(caminhoCapa).then((existeCapa) => (existeCapa ? caminhoCapa : null))
      : Promise.resolve(gerarCapaPlaceholder(chave, titulo, 76));
    usarCapa.then((imageUrlCapa) => {
      corpo.innerHTML = "";
      initScratchCard({
        containerId: `conquista-selo-${chave}`,
        imageUrl,
        imageUrlCapa,
        tamanho: 76,
        raioPincel: 10,
        onComplete: () => {
          marcarConquistaComoRevelada(chave);
          return false; // conquistas nao entram no sorteio de brilhante
        },
      });
    });
  });
}

function marcarConquistaComoRevelada(chave) {
  estadoConquistas[chave] = { revelado: true, dataRevelado: new Date().toISOString() };
  salvarEstadoConquistas();
  window.raspadinhaAuth?.usuarioAtual && window.raspadinhaAuth.sincronizarConquista(chave, true);
}

/**
 * Chamada sempre que o progresso muda (marcarComoVisitado). Se o
 * modal de conquistas estiver aberto, re-renderiza pra barra de
 * progresso e o desbloqueio aparecerem na hora. Independente disso,
 * também confere se alguma conquista acabou de ser desbloqueada (ver
 * verificarNovasConquistasDesbloqueadas), pra poder notificar mesmo
 * com o modal fechado.
 */
function atualizarProgressoConquistas() {
  verificarNovasConquistasDesbloqueadas();
  if (!document.getElementById("modal-conquistas").classList.contains("oculto")) {
    abrirConquistas();
  }
}

const CHAVE_CONQUISTAS_NOTIFICADAS = "scratchMapRJ_conquistas_notificadas_v1";

/**
 * Compara o progresso atual de cada conquista contra a meta e
 * notifica (uma única vez por conquista, controlado por uma lista no
 * localStorage) as que acabaram de ser desbloqueadas -- mesmo que o
 * modal de Conquistas nunca tenha sido aberto pra "ver" a mudança.
 */
function verificarNovasConquistasDesbloqueadas() {
  const ctx = calcularContextoConquistas();
  /* Todo outro JSON.parse de localStorage no arquivo é protegido; este
   * era o único cru. Chave corrompida (aba fechada no meio da escrita,
   * cota estourada) fazia o parse lançar e derrubava a checagem inteira
   * de conquistas -- ninguém mais era avisado de nada. Cair no conjunto
   * vazio, no pior caso, só reavisa uma conquista já vista. */
  let jaNotificadas;
  try {
    jaNotificadas = new Set(
      JSON.parse(localStorage.getItem(chaveComUid(CHAVE_CONQUISTAS_NOTIFICADAS)) || "[]")
    );
  } catch {
    jaNotificadas = new Set();
  }
  let mudou = false;

  DEFINICOES_CONQUISTAS.forEach((def) => {
    const { atual, meta } = progressoConquista(def, ctx);
    if (atual >= meta && !jaNotificadas.has(def.chave)) {
      jaNotificadas.add(def.chave);
      mudou = true;
      if (typeof tocarSomConquista === "function") tocarSomConquista();
      dispararNotificacaoLocal("🏆 Conquista desbloqueada!", {
        body: `${def.titulo} — raspe o selo pra revelar.`,
        tag: `conquista-${def.chave}`,
      });
    }
  });

  if (mudou) {
    localStorage.setItem(chaveComUid(CHAVE_CONQUISTAS_NOTIFICADAS), JSON.stringify([...jaNotificadas]));
  }
}

function fecharConquistas() {
  document.getElementById("modal-conquistas").classList.add("oculto");
}

/* ============================================================
   Ranking online: quem visitou mais municípios, por apelido.
   ============================================================ */

let abaRankingAtual = "global";

function abrirRanking() {
  document.getElementById("modal-ranking").classList.remove("oculto");
  carregarRanking();
}

function alternarAbaRanking(aba) {
  abaRankingAtual = aba;
  document.getElementById("btn-ranking-global").classList.toggle("ranking-aba-ativa", aba === "global");
  document.getElementById("btn-ranking-estadual").classList.toggle("ranking-aba-ativa", aba === "estadual");
  document.getElementById("btn-ranking-amigos").classList.toggle("ranking-aba-ativa", aba === "amigos");
  document.getElementById("btn-ranking-estadual").textContent = siglaDoEstadoAtual();
  carregarRanking();
}

/**
 * Uma linha do ranking. `posicaoReal` é a colocação de verdade (não o
 * índice na lista renderizada) -- pras 3 primeiras vira medalha
 * (🥇🥈🥉) em vez de número. `fixa` marca a linha "presa" no rodapé
 * (ver ranking-me-fixa no CSS) -- usada só quando o usuário nem
 * aparece no top 50 exibido, ver carregarRanking.
 */
function renderizarLinhaRanking(lista, item, posicaoReal, meuUid, fixa = false) {
  const linha = document.createElement("div");
  linha.className =
    "ranking-linha" + (item.uid === meuUid ? " ranking-me" : "") + (fixa ? " ranking-me-fixa" : "");

  const medalha = posicaoReal === 1 ? "🥇" : posicaoReal === 2 ? "🥈" : posicaoReal === 3 ? "🥉" : null;
  const posicaoHtml = medalha
    ? `<span class="ranking-posicao ranking-medalha">${medalha}</span>`
    : `<span class="ranking-posicao">#${posicaoReal}</span>`;

  linha.innerHTML = `
    ${posicaoHtml}
    <div class="ranking-avatar" style="background:${corAvatar(item.apelido)}">${escaparHtml(iniciaisApelido(item.apelido))}</div>
    <span class="ranking-apelido">${escaparHtml(item.apelido)}${item.ehPro ? '<span class="badge-pro" title="Conta PRO">PRO</span>' : ""}</span>
    <span class="ranking-pontos">
      <span class="ranking-count">${item.count}</span>
      <span class="ranking-selos-label">selos</span>
    </span>
  `;
  linha.addEventListener("click", () => {
    fecharRanking();
    abrirPerfil(item.uid);
  });
  lista.appendChild(linha);
}

async function carregarRanking() {
  const lista = document.getElementById("ranking-lista");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';

  try {
    const meuUid = window.raspadinhaAuth.usuarioAtual.uid;
    const meuCount = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;

    /* Aba Estadual: o ranking do estado que está no mapa.
       Hoje ela repete o Global de propósito -- todo selo existente é do
       RJ, então o recorte por estado dá exatamente o mesmo conjunto. Os
       dois se separam sozinhos quando o segundo estado for publicado e o
       `count` passar a ser contado por estado. Num estado ainda sem
       conteúdo não há ranking nenhum pra mostrar. */
    if (abaRankingAtual === "estadual" && emEstadoLimitado()) {
      avisarConteudoEmDesenvolvimento(lista, "Ranking");
      return;
    }

    if (abaRankingAtual === "amigos") {
      const amigos = await window.raspadinhaAuth.listarAmigos();
      const ranking = [
        ...amigos,
        {
          uid: meuUid,
          apelido: window.raspadinhaAuth.apelido,
          count: meuCount,
          ehPro: window.raspadinhaAuth.contaEhPro,
        },
      ].sort((a, b) => b.count - a.count);

      lista.innerHTML = "";
      if (ranking.length <= 1) {
        lista.innerHTML = `<div class="amigos-vazio">${ICONE_VAZIO_AMIGOS}<span>Adicione amigos pra ver o ranking entre vocês.</span></div>`;
      } else {
        ranking.forEach((item, indice) => renderizarLinhaRanking(lista, item, indice + 1, meuUid));
      }
      return;
    }

    const [ranking, minhaPosicao] = await Promise.all([
      window.raspadinhaAuth.buscarRanking(50),
      window.raspadinhaAuth.buscarMinhaPosicao(meuCount),
    ]);

    lista.innerHTML = "";
    if (!ranking.length) {
      lista.innerHTML = "<p>Ninguém no ranking ainda. Seja o primeiro a raspar!</p>";
      return;
    }
    ranking.forEach((item, indice) => renderizarLinhaRanking(lista, item, indice + 1, meuUid));

    // Se eu não apareço no top 50 exibido, fixa minha linha de
    // verdade (posição real, via buscarMinhaPosicao) grudada no
    // rodapé da lista -- sempre visível, mesmo na posição #45. Troca
    // o antigo texto solto "Sua posição: #X".
    const jaApareco = ranking.some((item) => item.uid === meuUid);
    if (!jaApareco) {
      renderizarLinhaRanking(
        lista,
        {
          uid: meuUid,
          apelido: window.raspadinhaAuth.apelido,
          count: meuCount,
          ehPro: window.raspadinhaAuth.contaEhPro,
        },
        minhaPosicao,
        meuUid,
        true
      );
    }
  } catch (erro) {
    console.error("Falha ao carregar ranking:", erro);
    lista.innerHTML = "<p>Não foi possível carregar o ranking agora. Tente de novo mais tarde.</p>";
  }
}

function fecharRanking() {
  document.getElementById("modal-ranking").classList.add("oculto");
}

/* ============================================================
   Amigos: buscar por e-mail/apelido, pedidos e lista de amigos.
   ============================================================ */

function abrirAmigos() {
  document.getElementById("input-busca-amigo").value = "";
  document.getElementById("amigos-resultado-busca").innerHTML = "";
  document.getElementById("modal-amigos").classList.remove("oculto");
  carregarPedidosAmizade();
  carregarListaAmigos();
}

function fecharAmigos() {
  document.getElementById("modal-amigos").classList.add("oculto");
}

let temporizadorBuscaAmigo = null;

async function buscarAmigoPorTexto() {
  const texto = document.getElementById("input-busca-amigo").value.trim();
  const resultado = document.getElementById("amigos-resultado-busca");
  if (!texto) return;

  resultado.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const encontrado = await window.raspadinhaAuth.buscarUsuario(texto);
    if (!encontrado) {
      resultado.innerHTML = "<p>Ninguém encontrado com esse e-mail/apelido.</p>";
      return;
    }
    const souEu = encontrado.uid === window.raspadinhaAuth.usuarioAtual?.uid;
    resultado.innerHTML = `
      <div class="amigo-resultado-item">
        <span>${escaparHtml(encontrado.apelido)}</span>
        <button type="button" class="btn-adicionar-amigo" data-uid="${encontrado.uid}" ${souEu ? "disabled" : ""}>
          ${souEu ? "Esse é você" : "Adicionar amigo"}
        </button>
      </div>`;
    resultado.querySelector(".btn-adicionar-amigo")?.addEventListener("click", async (evento) => {
      const botao = evento.currentTarget;
      botao.disabled = true;
      botao.textContent = "Enviando...";
      try {
        await window.raspadinhaAuth.enviarPedidoAmizade(botao.dataset.uid);
        botao.textContent = "Pedido enviado!";
      } catch (erro) {
        botao.disabled = false;
        botao.textContent = "Adicionar amigo";
        alert(erro?.message || "Não foi possível enviar o pedido.");
      }
    });
  } catch (erro) {
    console.error("Falha ao buscar usuário:", erro);
    resultado.innerHTML = "<p>Não foi possível buscar agora. Tente de novo.</p>";
  }
}

const ICONE_VAZIO_PEDIDOS =
  '<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
const ICONE_VAZIO_AMIGOS =
  '<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

/** Fecha qualquer menu "⋮" de amigo que esteja aberto -- chamado antes
 * de abrir outro (só um por vez) e ao tocar fora de qualquer .amigo-item. */
function fecharTodosMenusAmigo() {
  document.querySelectorAll(".amigo-menu").forEach((menu) => menu.classList.add("oculto"));
}

async function carregarPedidosAmizade() {
  const lista = document.getElementById("amigos-pedidos-lista");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const pedidos = await window.raspadinhaAuth.listarPedidosRecebidos();
    if (!pedidos.length) {
      lista.innerHTML = `<div class="amigos-vazio">${ICONE_VAZIO_PEDIDOS}<span>Nenhum pedido de amizade pendente.</span></div>`;
      return;
    }
    lista.innerHTML = "";
    pedidos.forEach((pedido) => {
      const item = document.createElement("div");
      item.className = "amigo-pedido-item";
      item.innerHTML = `
        <div class="amigo-avatar" style="background:${corAvatar(pedido.apelido)}">${escaparHtml(iniciaisApelido(pedido.apelido))}</div>
        <div class="amigo-info">
          <span class="amigo-apelido">${escaparHtml(pedido.apelido)}</span>
        </div>
        <div class="amigo-pedido-acoes">
          <button type="button" class="btn-aceitar-pedido">Aceitar</button>
          <button type="button" class="btn-recusar-pedido">Recusar</button>
        </div>
      `;
      item.querySelector(".btn-aceitar-pedido").addEventListener("click", async () => {
        await window.raspadinhaAuth.aceitarPedidoAmizade(pedido.uid);
        carregarPedidosAmizade();
        carregarListaAmigos();
      });
      item.querySelector(".btn-recusar-pedido").addEventListener("click", async () => {
        await window.raspadinhaAuth.recusarPedidoAmizade(pedido.uid);
        carregarPedidosAmizade();
      });
      lista.appendChild(item);
    });
  } catch (erro) {
    console.error("Falha ao carregar pedidos de amizade:", erro);
    lista.innerHTML = "<p>Não foi possível carregar os pedidos agora.</p>";
  }
}

async function carregarListaAmigos() {
  const lista = document.getElementById("amigos-lista");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const amigos = await window.raspadinhaAuth.listarAmigos();
    if (!amigos.length) {
      lista.innerHTML = `<div class="amigos-vazio">${ICONE_VAZIO_AMIGOS}<span>Você ainda não tem amigos adicionados.</span></div>`;
      return;
    }
    lista.innerHTML = "";
    amigos
      .sort((a, b) => b.count - a.count)
      .forEach((amigo) => {
        const item = document.createElement("div");
        item.className = "amigo-item";
        item.innerHTML = `
          <div class="amigo-avatar" style="background:${corAvatar(amigo.apelido)}">${escaparHtml(iniciaisApelido(amigo.apelido))}</div>
          <div class="amigo-info">
            <span class="amigo-apelido">${escaparHtml(amigo.apelido)}</span>
            <span class="amigo-count">${amigo.count} município${amigo.count === 1 ? "" : "s"} desbravado${amigo.count === 1 ? "" : "s"}</span>
          </div>
          <button type="button" class="amigo-btn-menu" aria-label="Mais opções">⋮</button>
          <div class="amigo-menu oculto">
            <button type="button" class="amigo-menu-op amigo-menu-parceiro">🏍️ Marcar como Parceiro(a) de Estrada</button>
            <button type="button" class="amigo-menu-op amigo-menu-desfazer">🗑️ Desfazer amizade</button>
          </div>
        `;
        item.querySelector(".amigo-apelido").addEventListener("click", () => {
          fecharAmigos();
          abrirPerfil(amigo.uid);
        });
        item.querySelector(".amigo-btn-menu").addEventListener("click", (evento) => {
          evento.stopPropagation();
          const menu = item.querySelector(".amigo-menu");
          const estavaOculto = menu.classList.contains("oculto");
          fecharTodosMenusAmigo();
          if (estavaOculto) menu.classList.remove("oculto");
        });
        // Placeholder de propósito: vincular contas de "parceiro de
        // estrada" é uma feature futura, ainda sem dado nenhum pra
        // gravar -- só avisa que está vindo, não faz nada de verdade.
        item.querySelector(".amigo-menu-parceiro").addEventListener("click", () => {
          fecharTodosMenusAmigo();
          alert("🏍️ Em breve você vai poder marcar parceiros de estrada!");
        });
        item.querySelector(".amigo-menu-desfazer").addEventListener("click", async () => {
          fecharTodosMenusAmigo();
          if (!confirm(`Desfazer amizade com ${amigo.apelido}?`)) return;
          await window.raspadinhaAuth.removerAmigo(amigo.uid);
          carregarListaAmigos();
        });
        lista.appendChild(item);
      });
  } catch (erro) {
    console.error("Falha ao carregar lista de amigos:", erro);
    lista.innerHTML = "<p>Não foi possível carregar seus amigos agora.</p>";
  }
}

/* ============================================================
   Feedback e colaboração: relatar bug, dar sugestão, ou colaborar
   (opcionalmente, via PIX). Bug/sugestão exigem login (mesma regra
   de qualquer outra interação de verdade no app -- ver exigirLogin);
   ver a chave PIX já mostra sem precisar logar.
   ============================================================ */

function abrirFeedback() {
  document.getElementById("modal-feedback").classList.remove("oculto");
  document.getElementById("pix-chave-texto").textContent = CHAVE_PIX_COLABORACAO;
  // Busca a chave mais recente (pode ter sido trocada no Admin) e
  // atualiza o texto assim que chegar, sem travar a abertura do popup.
  carregarChavePixGlobal().then(() => {
    document.getElementById("pix-chave-texto").textContent = CHAVE_PIX_COLABORACAO;
  });
}

/* Promessa da PRIMEIRA leitura de configuracoes/global. Guardada porque
   quem chama carregarChavePixGlobal() espera poder dar `.then()` -- e
   porque o observador só pode ser registrado UMA vez. */
let promessaConfigGlobal = null;

/**
 * Acompanha `configuracoes/global` (chave PIX + liberação do Motoclube)
 * enquanto o app estiver aberto.
 *
 * É um OBSERVADOR, não uma leitura única, e a diferença importa: com
 * persistentLocalCache, um getDoc pode ser respondido por uma versão
 * antiga do documento guardada no aparelho. Era assim que a liberação
 * do Motoclube se desligava sozinha, com o botão do admin continuando
 * marcado. Ver observarConfigGlobal em js/auth.js.
 *
 * Registra o observador UMA vez e devolve sempre a mesma promessa. Duas
 * razões, as duas viraram bug de verdade:
 *  - a função é chamada de quatro lugares, e cada chamada criava mais
 *    um listener sobre o mesmo documento;
 *  - quando ela virou observador, deixou de devolver Promise, e o
 *    `.then()` do abrirFeedback passou a estourar TypeError, derrubando
 *    o popup "Colaborar".
 */
function carregarChavePixGlobal() {
  if (promessaConfigGlobal) return promessaConfigGlobal;

  promessaConfigGlobal = new Promise((resolver) => {
    let primeira = true;
    try {
      window.raspadinhaAuth?.observarConfigGlobal?.((config) => {
        const chave = (config?.chavePix || "").trim();
        if (chave) CHAVE_PIX_COLABORACAO = chave;
        // Mostrar ou esconder o botão de assinar depende da liberação.
        atualizarBotaoAssinarPro();
        if (primeira) {
          primeira = false;
          resolver();
        }
      });
    } catch (erro) {
      console.warn("Não foi possível observar a configuração global:", erro);
      resolver();
    }
    // Rede lenta não pode travar quem espera essa promessa.
    setTimeout(resolver, 4000);
  });

  return promessaConfigGlobal;
}

/**
 * Atalho pro botão "🤝 Colaborar" (mesma chave PIX, mesmo popup),
 * chamado a partir de qualquer tela com conteúdo "em breve" (ver
 * .btn-colaborar-em-breve em css/styles.css) -- toda vez que algo
 * ainda não pronto for mostrado (mapa do Brasil, e o que vier depois),
 * vale colocar esse mesmo botão pra estimular quem quiser ajudar a
 * acelerar.
 */
function abrirColaborar() {
  abrirFeedback();
  mostrarPainelFeedback("colaborar");
}

function fecharFeedback() {
  document.getElementById("modal-feedback").classList.add("oculto");
  document.querySelectorAll(".feedback-painel").forEach((painel) => painel.classList.add("oculto"));
  document
    .querySelectorAll(".feedback-opcao")
    .forEach((botao) => botao.classList.remove("feedback-opcao-ativa"));
}

function mostrarPainelFeedback(painel) {
  document.querySelectorAll(".feedback-painel").forEach((el) => {
    el.classList.toggle("oculto", el.id !== `feedback-painel-${painel}`);
  });
  document.querySelectorAll(".feedback-opcao").forEach((botao) => {
    botao.classList.toggle("feedback-opcao-ativa", botao.dataset.painel === painel);
  });
}

/**
 * Envia um relato de bug, sugestão ou ponto turístico (coleção
 * "feedback" no Firestore) -- exige login, igual qualquer outra
 * interação de verdade no app. A regra do Firestore só aceita `tipo`
 * "bug"/"sugestao"/"ponto-turistico" e um texto não vazio (ver
 * README.md). Ponto turístico também exige o nome do município.
 */
function enviarFeedback(tipo) {
  exigirLogin(async () => {
    const textarea = document.getElementById(`input-feedback-${tipo}`);
    const botao = document.getElementById(`btn-enviar-feedback-${tipo}`);
    const status = document.getElementById(`feedback-status-${tipo}`);
    const texto = textarea.value.trim();

    const inputMunicipio =
      tipo === "ponto-turistico" ? document.getElementById("input-ponto-turistico-municipio") : null;
    const municipio = inputMunicipio?.value.trim() || "";

    if (!texto) return;
    if (inputMunicipio && !municipio) return;

    botao.disabled = true;
    botao.querySelector(".btn-texto").classList.add("oculto");
    botao.querySelector(".spinner").classList.remove("oculto");
    status.classList.add("oculto");

    try {
      await window.raspadinhaAuth.enviarFeedback(tipo, texto, municipio ? { municipio } : {});
      textarea.value = "";
      if (inputMunicipio) inputMunicipio.value = "";
      status.textContent = "🎉 Recebemos o seu relato! Muito obrigado por ajudar a melhorar o Desbrava.";
      status.className = "feedback-status status-sucesso";
      const rect = botao.getBoundingClientRect();
      dispararConfete(rect.left + rect.width / 2, rect.top);
    } catch (erro) {
      console.error("Falha ao enviar feedback:", erro);
      status.textContent = "Não foi possível enviar agora -- tenta de novo em instantes?";
      status.className = "feedback-status status-erro";
    } finally {
      botao.disabled = false;
      botao.querySelector(".btn-texto").classList.remove("oculto");
      botao.querySelector(".spinner").classList.add("oculto");
    }
  });
}

/**
 * Copia a chave PIX pra área de transferência (com um retorno visual
 * rápido); se a Clipboard API não estiver disponível, mostra a chave
 * pra copiar manualmente.
 */
async function copiarChavePix() {
  const status = document.getElementById("feedback-status-pix");
  try {
    await navigator.clipboard.writeText(CHAVE_PIX_COLABORACAO);
    status.textContent = "Chave copiada! 💙";
    status.className = "feedback-status status-sucesso";
  } catch {
    status.textContent = "Não deu pra copiar sozinho -- selecione a chave acima manualmente.";
    status.className = "feedback-status status-erro";
  }
}

const CHAVE_BOAS_VINDAS_VISTAS = "scratchMapRJ_boasvindas_vistas_v1";

/**
 * Mostra, só na primeira vez (controlado por localStorage), um
 * tutorial curto explicando a ideia do app (incentivar a sair de casa
 * e conhecer municípios de verdade) e os conceitos principais: selos,
 * pontos turísticos, conquistas e selo brilhante. Ao fechar, encadeia
 * o aviso de "em desenvolvimento" (ver fecharBoasVindas) -- assim os
 * dois nunca aparecem sobrepostos ao mesmo tempo.
 */
function mostrarBoasVindasSeNecessario() {
  if (localStorage.getItem(CHAVE_BOAS_VINDAS_VISTAS)) {
    mostrarAvisoDesenvolvimentoSeNecessario();
    return;
  }
  document.getElementById("modal-boas-vindas").classList.remove("oculto");
}

function fecharBoasVindas() {
  localStorage.setItem(CHAVE_BOAS_VINDAS_VISTAS, "true");
  document.getElementById("modal-boas-vindas").classList.add("oculto");
  mostrarAvisoDesenvolvimentoSeNecessario();
}

const CHAVE_AVISO_DESENVOLVIMENTO_VISTO = "scratchMapRJ_aviso_dev_visto_v1";

/**
 * Mostra, só na primeira vez (controlado por localStorage), um aviso
 * de que o app ainda está em desenvolvimento -- não é a versão final,
 * ainda não está na Play Store, é e sempre vai ser gratuito, e dá pra
 * colaborar (nunca obrigatório) pelo botão 💬 no topo. Chamada depois
 * das boas-vindas (ver mostrarBoasVindasSeNecessario/fecharBoasVindas).
 */
function mostrarAvisoDesenvolvimentoSeNecessario() {
  if (localStorage.getItem(CHAVE_AVISO_DESENVOLVIMENTO_VISTO)) return;
  document.getElementById("modal-aviso-desenvolvimento").classList.remove("oculto");
}

function fecharAvisoDesenvolvimento() {
  localStorage.setItem(CHAVE_AVISO_DESENVOLVIMENTO_VISTO, "true");
  document.getElementById("modal-aviso-desenvolvimento").classList.add("oculto");
}

/* ============================================================
   Perfil público: outras pessoas podem abrir (via Ranking/Amigos) e
   ver os selos e um mini-mapa, se a pessoa não tiver marcado
   "privado" em Configurações.

   IMPORTANTE (limitação conhecida): a privacidade aqui é só de
   EXIBIÇÃO no app -- o documento do usuário já é legível por
   qualquer autenticado (regra do Firestore, necessária pro
   ranking/busca de amigos), então sem um Cloud Function não dá pra
   esconder o campo no nível do servidor. Suficiente pra um app
   hobby, mas vale saber.
   ============================================================ */

async function abrirPerfil(uid) {
  const modal = document.getElementById("modal-perfil");
  const corpo = document.getElementById("perfil-corpo");
  document.getElementById("perfil-apelido").textContent = "Carregando...";
  corpo.innerHTML = '<div class="spinner spinner-grande"></div>';
  modal.classList.remove("oculto");

  try {
    const perfil = await window.raspadinhaAuth.buscarPerfilPublico(uid);
    if (!perfil) {
      document.getElementById("perfil-apelido").textContent = "Perfil não encontrado";
      corpo.innerHTML = "";
      return;
    }

    document.getElementById("perfil-apelido").textContent = perfil.apelido;

    const ehOProprioPerfil = uid === window.raspadinhaAuth?.usuarioAtual?.uid;
    if (!perfil.perfilPublico && !ehOProprioPerfil) {
      corpo.innerHTML = "<p>🔒 Esse perfil é privado.</p>";
      return;
    }

    const estadoMun = perfil.estadoMunicipios || {};
    const estadoReg = perfil.estadoRegioes || {};
    const totalMunicipios = document.querySelectorAll("#mapa-rj .municipio").length || 92;
    const verificados =
      Object.values(estadoMun).filter((m) => m?.verificado).length || perfil.municipiosVisitadosCount || 0;
    const brilhantes = Object.values(estadoMun).filter((m) => m?.brilhante).length;
    const totalRegioes = Object.keys(municipiosPorRegiao).length || 8;
    const regioes = Object.values(estadoReg).filter((r) => r?.revelado).length;
    // Rotas concluídas: NÃO usa rotaEstaCompleta() direto -- essa
    // função lê o estadoMapa GLOBAL (só faz sentido pro próprio
    // usuário logado). Aqui precisa funcionar também pro perfil de
    // outra pessoa, então confere a lista de municípios de cada rota
    // contra o estadoMunicipios QUE VEIO do perfil sendo visto.
    const totalRotas = Object.keys(rotasInfo).length;
    const rotasCompletas = Object.keys(rotasInfo).filter((id) =>
      (rotasInfo[id]?.municipios || []).every((mid) => estadoMun[mid]?.verificado)
    ).length;

    corpo.innerHTML = `
      <div class="perfil-cabecalho">
        <div class="perfil-avatar-wrap">
          <div class="perfil-avatar"></div>
          ${ehOProprioPerfil ? '<button type="button" id="btn-editar-avatar" aria-label="Mudar foto de perfil">📷</button>' : ""}
        </div>
        <div class="perfil-nome">${perfil.apelido}</div>
        <span class="perfil-badge ${souMembroMotoclube() ? "perfil-badge-pro" : "perfil-badge-free"}">
          ${souMembroMotoclube() ? "👑 Membro Desbrava" : "Desbravador"}
        </span>
        ${
          perfil.grupoMotoclube
            ? `<div class="perfil-grupo">
                 <img class="perfil-grupo-brasao" src="${escaparHtml(urlDoBrasao(perfil.grupoMotoclube))}" alt="">
                 <span>Grupo ${escaparHtml(nomeDoMunicipio(perfil.grupoMotoclube))}</span>
               </div>`
            : ""
        }
        ${
          motoclubeAtivoNoPerfil(perfil) && perfil.numeroMotoclube
            ? `<div class="perfil-numero-motoclube">Membro ${escaparHtml(formatarNumeroMotoclube(perfil.numeroMotoclube))}</div>`
            : ""
        }
      </div>

      <div class="perfil-stats">
        <div class="perfil-stat">
          <span class="perfil-stat-num">${verificados}<small>/${totalMunicipios}</small></span>
          <span class="perfil-stat-rot">Municípios</span>
        </div>
        <div class="perfil-stat">
          <span class="perfil-stat-num perfil-stat-ouro">${brilhantes}</span>
          <span class="perfil-stat-rot">Selos Dourados</span>
        </div>
        <div class="perfil-stat">
          <span class="perfil-stat-num">${rotasCompletas}<small>/${totalRotas}</small></span>
          <span class="perfil-stat-rot">Rotas Concluídas</span>
        </div>
        <div class="perfil-stat">
          <span class="perfil-stat-num">${regioes}<small>/${totalRegioes}</small></span>
          <span class="perfil-stat-rot">Regiões</span>
        </div>
      </div>

      <div id="perfil-mapa-mini"></div>

      <h3 class="perfil-secao-titulo">Últimos conquistados</h3>
      <div id="perfil-ultimos-conquistados"></div>
      ${ehOProprioPerfil ? '<button type="button" id="btn-perfil-ver-biblioteca">📖 Ver Biblioteca Completa</button>' : ""}
    `;
    // O nome agora vive no cabeçalho com avatar; zera o h2 (usado só
    // pros estados de "Carregando..."/erro/privado).
    document.getElementById("perfil-apelido").textContent = "";
    // Avatar: pro próprio perfil usa o valor em memória (reflete uma
    // troca recente na hora); pros outros, o que veio do Firestore.
    const fotoAvatar = ehOProprioPerfil ? window.raspadinhaAuth?.fotoPerfil : perfil.fotoPerfil;
    aplicarAvatar(corpo.querySelector(".perfil-avatar"), fotoAvatar, perfil.apelido);
    if (ehOProprioPerfil) {
      document.getElementById("btn-editar-avatar").addEventListener("click", abrirEditarAvatar);
      document.getElementById("btn-perfil-ver-biblioteca").addEventListener("click", () => {
        fecharPerfil();
        abrirBibliotecaSelos();
      });
    }
    renderizarMiniMapaPerfil(perfil.mapaSnapshot);
    renderizarUltimosConquistadosPerfil(estadoMun);
  } catch (erro) {
    console.error("Falha ao carregar perfil:", erro);
    corpo.innerHTML = "<p>Não foi possível carregar esse perfil agora.</p>";
  }
}

function fecharPerfil() {
  document.getElementById("modal-perfil").classList.add("oculto");
}

/* ============================================================
   Editor de foto de perfil: enviar uma foto, escolher um selo já
   conquistado (dourado pra quem tiver), ou voltar às iniciais.
   Só é acessível a partir do PRÓPRIO perfil (ver abrirPerfil).
   ============================================================ */

function abrirEditarAvatar() {
  document.getElementById("modal-editar-avatar").classList.remove("oculto");
  const status = document.getElementById("avatar-editor-status");
  status.classList.add("oculto");
  renderizarSelosParaAvatar();
}

function fecharEditarAvatar() {
  document.getElementById("modal-editar-avatar").classList.add("oculto");
}

/** Grade dos selos de município que a pessoa já verificou -- clicar
 *  usa aquele selo como foto (dourado se ela o conquistou dourado). */
function renderizarSelosParaAvatar() {
  const grade = document.getElementById("avatar-selos-grade");
  grade.innerHTML = "";

  const municipios = Array.from(document.querySelectorAll("#mapa-rj .municipio"))
    .map((p) => ({ id: p.dataset.municipio, nome: p.dataset.nome }))
    .filter((m) => estaVerificado(m.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  if (!municipios.length) {
    grade.innerHTML =
      '<p class="avatar-vazio">Você ainda não tem selos verificados. Visite e confirme sua presença em um município pra poder usar o selo dele como foto.</p>';
    return;
  }

  municipios.forEach(({ id, nome }) => {
    const dourado = !!estadoMapa[id]?.brilhante;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "avatar-selo-opcao" + (dourado ? " avatar-selo-dourado" : "");
    item.title = dourado ? `${nome} 🌟 (dourado)` : nome;

    const img = document.createElement("img");
    img.alt = nome;
    resolverImagemColorida(`assets/img/selos/${id}`, dourado, id, nome).then((r) => {
      img.src = r.url;
    });

    item.appendChild(img);
    item.addEventListener("click", () => salvarFotoPerfil({ tipo: "selo", seloId: id, dourado }));
    grade.appendChild(item);
  });
}

/** Comprime e sobe a foto escolhida (Drive) e grava como avatar. */
async function enviarFotoDePerfil(arquivo) {
  if (!arquivo) return;
  const status = document.getElementById("avatar-editor-status");
  status.className = "feedback-status";
  status.textContent = "Preparando a foto...";
  status.classList.remove("oculto");
  try {
    const blob = await comprimirFotoPost(arquivo, { ladoMaximo: 256, qualidade: 0.82 });
    status.textContent = "Enviando...";
    const url = await window.raspadinhaAuth.subirFotoPerfil(blob);
    await salvarFotoPerfil({ tipo: "foto", url });
  } catch (erro) {
    console.error("Falha ao enviar foto de perfil:", erro);
    status.textContent = erro?.message || "Não foi possível enviar a foto agora.";
    status.className = "feedback-status status-erro";
    status.classList.remove("oculto");
  }
}

/** Grava a escolha (objeto ou null p/ iniciais) e atualiza a UI. */
async function salvarFotoPerfil(fotoPerfil) {
  const status = document.getElementById("avatar-editor-status");
  try {
    await window.raspadinhaAuth.definirFotoPerfil(fotoPerfil);
    atualizarAvatarTopo();
    const avatarPerfil = document.querySelector("#modal-perfil .perfil-avatar");
    if (avatarPerfil) aplicarAvatar(avatarPerfil, fotoPerfil, window.raspadinhaAuth?.apelido);
    fecharEditarAvatar();
  } catch (erro) {
    console.error("Falha ao salvar foto de perfil:", erro);
    status.className = "feedback-status status-erro";
    status.textContent = erro?.message || "Não foi possível salvar agora.";
    status.classList.remove("oculto");
  }
}

/**
 * Gera e grava no Firestore um snapshot estático (imagem) do mapa do
 * usuário logado -- é essa imagem que alimenta o mini-mapa do perfil
 * público (ver renderizarMiniMapaPerfil e salvarSnapshotMapa em
 * js/auth.js). Roda toda vez que a conta loga (ver atualizarUiDeConta),
 * pra sempre refletir o progresso mais recente -- antes só regravava
 * 1x por dia (controlado por localStorage), o que deixava o mini-mapa
 * "parado" no perfil por até 24h depois de raspar um selo novo.
 */
function gerarSnapshotMapaSeNecessario() {
  const hoje = new Date().toDateString();
  gerarSnapshotMapaComoDataUrl()
    .then((dataUrl) => {
      if (!dataUrl) return;
      window.raspadinhaAuth?.salvarSnapshotMapa(dataUrl, hoje);
    })
    .catch((erro) => console.error("Falha ao gerar snapshot do mapa:", erro));
}

/**
 * Monta uma cópia standalone do SVG do mapa com as cores do estado
 * ATUAL do usuário logado gravadas como atributos `fill`/`stroke` (não
 * como classes CSS -- uma vez serializado fora do documento, o SVG
 * perde acesso à folha de estilo da página) e converte pra PNG via
 * <canvas>, devolvendo uma Promise com o data URL resultante.
 */
function gerarSnapshotMapaComoDataUrl() {
  return new Promise((resolve) => {
    const original = document.getElementById("mapa-rj");
    const clone = original.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("style");
    clone.querySelectorAll(".rotulo-municipio").forEach((el) => el.remove());
    clone.querySelector("#contornos-regioes")?.remove();
    clone.querySelector("#marcador-local-atual")?.remove();

    clone.querySelectorAll(".municipio").forEach((path) => {
      const id = path.dataset.municipio;
      const dados = estadoMapa[id];
      // Mesma prioridade de cor do mapa principal (ver aplicarEstadoNoSVG
      // em js/script.js): dourado > verde > azul (raspado, mas ainda não
      // verificado -- antes era vermelho) > cinza.
      const cor =
        dados?.visitado && dados?.brilhante
          ? "#facc15"
          : estaVerificado(id)
          ? "#22c55e"
          : dados?.visitado
          ? "#3b82f6"
          : "#9ca3af";
      path.setAttribute("fill", cor);
      path.setAttribute("stroke", "#0f172a");
      path.setAttribute("stroke-width", "2");
      path.removeAttribute("class");
      path.onclick = null;
    });

    const largura = 400;
    const altura = 286; // mantém a proporção do viewBox (800 x 571.70)
    clone.setAttribute("width", largura);
    clone.setAttribute("height", altura);

    const svgTexto = new XMLSerializer().serializeToString(clone);
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgTexto)))}`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      // Mesma cor do card do app (--surf), não mais um azul marinho
      // forte -- assim o fundo do PNG combina com o container do
      // Perfil (#perfil-mapa-mini) em vez de aparecer como um
      // retângulo destacado. Só vale pra snapshot NOVO -- quem já
      // tinha um salvo só atualiza no próximo login (gerarSnapshotMapaSeNecessario).
      ctx.fillStyle = "#171B21";
      ctx.fillRect(0, 0, largura, altura);
      ctx.drawImage(img, 0, 0, largura, altura);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = svgDataUrl;
  });
}

/* ============================================================
   Cartão de progresso compartilhável: uma imagem tipo "resumo",
   com o mini-mapa colorido (reaproveita gerarSnapshotMapaComoDataUrl)
   + estatísticas, pronta pra compartilhar fora do app.
   ============================================================ */

let cartaoProgressoDataUrlAtual = null;

async function gerarCartaoProgresso() {
  const largura = 600;
  const altura = 900;

  const miniMapaUrl = await gerarSnapshotMapaComoDataUrl();

  const total = document.querySelectorAll("#mapa-rj .municipio").length;
  const visitados = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;
  const regioesCompletas = Object.keys(municipiosPorRegiao).filter((id) => regiaoEstaCompleta(id)).length;
  const rotasCompletas = Object.keys(rotasInfo).filter((id) => rotaEstaCompleta(id)).length;
  const brilhantes = Object.values(estadoMapa).filter((d) => d.visitado && d.brilhante).length;
  const apelido = window.raspadinhaAuth?.apelido || "Desbravador";

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");

  const gradiente = ctx.createLinearGradient(0, 0, 0, altura);
  gradiente.addColorStop(0, "#1e293b");
  gradiente.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, largura, altura);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.fillText("DESBRAVA", largura / 2, 90);

  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`Progresso de ${apelido}`, largura / 2, 128);

  const larguraMapa = 500;
  const alturaMapa = larguraMapa * (286 / 400);
  const topoMapa = 165;
  if (miniMapaUrl) {
    const imagemMapa = await new Promise((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = miniMapaUrl;
    });
    if (imagemMapa) {
      ctx.drawImage(imagemMapa, (largura - larguraMapa) / 2, topoMapa, larguraMapa, alturaMapa);
    }
  }

  const linhas = [
    `${visitados} / ${total} municípios visitados`,
    `${regioesCompletas} região${regioesCompletas === 1 ? "" : "ões"} completa${regioesCompletas === 1 ? "" : "s"}`,
    `${rotasCompletas} rota${rotasCompletas === 1 ? "" : "s"} completa${rotasCompletas === 1 ? "" : "s"}`,
    `${brilhantes} selo${brilhantes === 1 ? "" : "s"} brilhante${brilhantes === 1 ? "" : "s"} ✨`,
  ];
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillStyle = "#f1f5f9";
  const topoEstatisticas = topoMapa + alturaMapa + 64;
  linhas.forEach((linha, indice) => {
    ctx.fillText(linha, largura / 2, topoEstatisticas + indice * 48);
  });

  ctx.font = "18px system-ui, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`${window.location.origin} · raspe o mapa do Rio de Janeiro`, largura / 2, altura - 30);

  return canvas.toDataURL("image/png");
}

async function abrirCartaoProgresso() {
  const modal = document.getElementById("modal-cartao-progresso");
  const preview = document.getElementById("cartao-progresso-preview");
  preview.innerHTML = '<div class="spinner spinner-grande"></div>';
  modal.classList.remove("oculto");

  try {
    cartaoProgressoDataUrlAtual = await gerarCartaoProgresso();
    preview.innerHTML = "";
    const img = document.createElement("img");
    img.src = cartaoProgressoDataUrlAtual;
    img.alt = "Cartão de progresso";
    preview.appendChild(img);
  } catch (erro) {
    console.error("Falha ao gerar o cartão de progresso:", erro);
    preview.innerHTML = "<p>Não foi possível gerar o cartão agora.</p>";
  }
}

function fecharCartaoProgresso() {
  document.getElementById("modal-cartao-progresso").classList.add("oculto");
}

async function compartilharCartaoProgresso() {
  if (!cartaoProgressoDataUrlAtual) return;

  try {
    const resposta = await fetch(cartaoProgressoDataUrlAtual);
    const blob = await resposta.blob();
    const arquivo = new File([blob], "desbrava-progresso.png", { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({
        files: [arquivo],
        title: "Meu progresso no Desbrava",
        text: "Olha meu progresso raspando o mapa do Rio de Janeiro no Desbrava!",
      });
      return;
    }
  } catch (erro) {
    // Cancelou o compartilhamento ou o navegador não suporta arquivo
    // no Web Share -- cai no download como alternativa.
  }

  baixarCartaoProgresso();
}

function baixarCartaoProgresso() {
  if (!cartaoProgressoDataUrlAtual) return;
  const link = document.createElement("a");
  link.href = cartaoProgressoDataUrlAtual;
  link.download = "desbrava-progresso.png";
  link.click();
}

/**
 * Mini-mapa do perfil: mostra o snapshot estático (gerado 1x por dia,
 * ver gerarSnapshotMapaSeNecessario) em vez de clonar o SVG ao vivo --
 * evita ficar deslocado/com zoom errado dependendo de como o mapa
 * grande estava no momento e não recalcula nada ao abrir o perfil.
 */
function renderizarMiniMapaPerfil(snapshotUrl) {
  const container = document.getElementById("perfil-mapa-mini");
  if (!container) return;
  container.innerHTML = "";

  if (!snapshotUrl) {
    const aviso = document.createElement("p");
    aviso.className = "mini-mapa-vazio";
    aviso.textContent = "Mapa ainda não disponível.";
    container.appendChild(aviso);
    return;
  }

  const img = document.createElement("img");
  img.className = "mini-mapa-imagem";
  img.alt = "Mini-mapa de progresso";
  img.src = snapshotUrl;
  container.appendChild(img);
}

/**
 * "Últimos conquistados": só os 4 selos de município mais recentes
 * (por dataVisita, ver marcarComoVisitado) de quem está sendo visto
 * -- em vez do álbum inteiro de 92, que estava duplicando a
 * Biblioteca e esticando a tela pra sempre. Ver "Ver Biblioteca
 * Completa" logo abaixo (só no próprio perfil) pra quem quiser a
 * lista cheia de verdade.
 */
function renderizarUltimosConquistadosPerfil(estadoMunicipios) {
  const container = document.getElementById("perfil-ultimos-conquistados");
  if (!container) return;
  container.innerHTML = "";

  const nomesPorId = new Map(
    Array.from(document.querySelectorAll("#mapa-rj .municipio")).map((path) => [
      path.dataset.municipio,
      path.dataset.nome,
    ])
  );

  const ultimos = Object.entries(estadoMunicipios)
    .filter(([, estado]) => estado?.verificado)
    .sort((a, b) => new Date(b[1].dataVisita || 0) - new Date(a[1].dataVisita || 0))
    .slice(0, 4);

  if (!ultimos.length) {
    container.innerHTML = '<p class="perfil-ultimos-vazio">Nenhum selo conquistado ainda.</p>';
    return;
  }

  ultimos.forEach(([id, estado]) => {
    const nome = nomesPorId.get(id) || id;
    const item = document.createElement("div");
    item.className = "selo-item" + (estado.brilhante ? " selo-item-brilhante" : "");
    item.title = nome;

    const img = document.createElement("img");
    img.alt = nome;
    img.className = "selo-colorido";
    resolverImagemColorida(`assets/img/selos/${id}`, !!estado.brilhante, id, nome).then((resultado) => {
      img.src = resultado.url;
    });

    const legenda = document.createElement("span");
    legenda.textContent = nome;

    item.appendChild(envolverComPlaceholder(img, "verde"));
    item.appendChild(legenda);
    container.appendChild(item);
  });
}

/* ============================================================
   Aviso flutuante: raspadinha brilhante garantida (por convite de
   amigo) esperando pra ser usada na próxima raspagem.
   ============================================================ */

function atualizarAvisoBrilhantePendente() {
  const aviso = document.getElementById("aviso-brilhante-pendente");
  const pendentes = window.raspadinhaAuth?.boostsBrilhantesPendentes || 0;

  if (pendentes > 0) {
    document.getElementById("aviso-brilhante-texto").textContent =
      pendentes === 1
        ? "🌟 Você tem uma raspadinha dourada garantida te esperando!"
        : `🌟 Você tem ${pendentes} raspadinhas douradas garantidas te esperando!`;
    aviso.classList.remove("oculto");
  } else {
    aviso.classList.add("oculto");
  }
}

/**
 * Abre o popup de uma região: mostra quantos dos seus municípios já
 * foram visitados e, só quando TODOS estiverem completos, libera o
 * mega-selo (raspadinha bem maior) daquela região. Sem os selos de
 * região reais ainda (assets/img/regioes/<id>.webp / <id>fundo.webp),
 * cai no mesmo placeholder gerado na hora que os municípios usam.
 */
function abrirPopupRegiao(regiaoId) {
  regiaoSelecionadaId = regiaoId;

  const idsDaRegiao = municipiosPorRegiao[regiaoId] || [];
  const nomeRegiao = regioesInfo[regiaoId]?.nome || regiaoId;
  // So conta municipio VERIFICADO (confirmado por localizacao) --
  // raspar sem estar no local nao libera o mega-selo da regiao (ver
  // estaVerificado/regiaoEstaCompleta).
  const visitados = idsDaRegiao.filter((id) => estaVerificado(id)).length;
  const completa = visitados === idsDaRegiao.length && idsDaRegiao.length > 0;

  document.getElementById("regiao-nome").textContent = nomeRegiao;
  document.getElementById("regiao-status").textContent =
    `${visitados} / ${idsDaRegiao.length} municípios verificados`;
  document.getElementById("regiao-barra-preenchida").style.width =
    `${(visitados / idsDaRegiao.length) * 100}%`;
  mostrarResumoRegiao(regiaoId);

  const corpo = document.getElementById("regiao-selo-body");
  corpo.innerHTML = "";
  const instrucao = document.getElementById("regiao-instrucao");

  if (!completa) {
    const faltam = idsDaRegiao.length - visitados;
    instrucao.textContent = `Complete os ${faltam} município${faltam === 1 ? "" : "s"} que falta${faltam === 1 ? "" : "m"} nessa região para desbloquear o selo especial.`;
    mostrarSpinnerGrande(corpo, false);
    corpo.innerHTML = `<div class="selo-bloqueado">🔒</div>`;
    document.getElementById("regiao-selo-estatistica").textContent = "";
    document.getElementById("modal-regiao").classList.remove("oculto");
    return;
  }

  if (estadoRegioes[regiaoId]?.revelado) {
    instrucao.textContent = "";
    exibirMegaSeloRevelado(regiaoId, corpo);
  } else {
    instrucao.textContent = "Região completa! Raspe o selo especial.";
    document.getElementById("regiao-selo-estatistica").textContent = "";
    mostrarSpinnerGrande(corpo, true);
    const nomeRegiaoSelo = regioesInfo[regiaoId]?.nome || regiaoId;
    // Selo de região brilhante: 10% de chance (o dobro do de
    // município), decidida na abertura -- mesma ideia de
    // decidirBrilhante, mas com sorteio próprio (ver
    // decidirBrilhanteRegiao).
    const brilhante = decidirBrilhanteRegiao(regiaoId);
    const caminhoCapa = `assets/img/regioes/${regiaoId}fundo.webp`;
    resolverImagemColorida(`assets/img/regioes/${regiaoId}`, brilhante, regiaoId, nomeRegiaoSelo, 400).then(
      (resultado) => {
        const usarCapa = resultado.arteReal
          ? carregarImagem(caminhoCapa).then((existeCapa) => (existeCapa ? caminhoCapa : null))
          : Promise.resolve(gerarCapaPlaceholder(regiaoId, nomeRegiaoSelo, 400));
        usarCapa.then((imageUrlCapa) => {
          corpo.innerHTML = "";
          initScratchCard({
            containerId: "regiao-selo-body",
            imageUrl: resultado.url,
            imageUrlCapa,
            tamanho: 400,
            onPrimeiroToque: () => travarSorteRegiaoNaPrimeiraRaspada(regiaoId, brilhante),
            onComplete: () => {
              marcarRegiaoComoRevelada(regiaoId, brilhante);
              return brilhante;
            },
          });
        });
      }
    );
  }

  document.getElementById("modal-regiao").classList.remove("oculto");
}

function exibirMegaSeloRevelado(regiaoId, corpo) {
  const nomeRegiao = regioesInfo[regiaoId]?.nome || regiaoId;
  const brilhante = !!estadoRegioes[regiaoId]?.brilhante;
  resolverImagemColorida(`assets/img/regioes/${regiaoId}`, brilhante, regiaoId, nomeRegiao, 400).then(
    (resultado) => {
      const wrapper = document.createElement("div");
      wrapper.className = "selo-revelado-wrapper";
      const img = document.createElement("img");
      img.src = resultado.url;
      img.alt = nomeRegiao;
      img.className = "selo-revelado selo-revelado-grande";
      wrapper.appendChild(img);
      if (brilhante) adicionarBrilho(wrapper);
      corpo.appendChild(wrapper);
    }
  );
  mostrarEstatisticaSeloRegiao(regiaoId);
}

/**
 * Decide se o mega-selo de uma região é "brilhante" -- mesma lógica
 * de decidirBrilhante, mas com 10% de chance (o dobro do de
 * município) e sem consumir o boost de convite (esse só vale pra
 * selos de município).
 */
function decidirBrilhanteRegiao(regiaoId) {
  const anterior = estadoRegioes[regiaoId];
  if (anterior?.chanceDecidida) return !!anterior.brilhante;
  return Math.random() < 0.1;
}

/**
 * Mesma trava de travarSorteNaPrimeiraRaspada, mas pro mega-selo de
 * região: assim que a pessoa raspa a primeira vez, a sorte fica
 * fixada, mesmo que abandone sem terminar de raspar.
 */
function travarSorteRegiaoNaPrimeiraRaspada(regiaoId, brilhante) {
  if (estadoRegioes[regiaoId]?.chanceDecidida) return;
  estadoRegioes[regiaoId] = {
    ...estadoRegioes[regiaoId],
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstadoRegioes();
}

function mostrarSpinnerGrande(corpo, mostrar) {
  corpo.innerHTML = mostrar ? '<div class="spinner spinner-grande"></div>' : "";
}

/**
 * Espaço reservado para o resumo em texto de cada região (o usuário
 * vai preencher depois em data/regioes-resumo.json). Sem esse
 * arquivo ainda, simplesmente não mostra nada.
 */
function mostrarResumoRegiao(regiaoId) {
  const container = document.getElementById("regiao-resumo");
  const resumo = resumosPorRegiao[regiaoId]?.resumo;
  container.textContent = resumo || "";
}

function marcarRegiaoComoRevelada(regiaoId, brilhante) {
  estadoRegioes[regiaoId] = {
    revelado: true,
    dataRevelado: new Date().toISOString(),
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstadoRegioes();
  if (window.raspadinhaAuth?.usuarioAtual) {
    window.raspadinhaAuth.sincronizarRegiao(regiaoId, { revelado: true, brilhante: !!brilhante });
  }
}

function fecharPopupRegiao() {
  document.getElementById("modal-regiao").classList.add("oculto");
  document.getElementById("regiao-selo-body").innerHTML = "";
  regiaoSelecionadaId = null;
}

/* ============================================================
   Rotas temáticas: agrupamento curado de municípios (ver
   data/rotas.json), com selo/raspadinha própria -- mesma mecânica do
   mega-selo de região (só "completo" quando todos os municípios da
   rota estiverem verificados), mas os municípios vêm do JSON em vez
   do agrupamento embutido no SVG (podem se sobrepor livremente entre
   rotas, diferente das 8 regiões que particionam o estado inteiro).
   ============================================================ */

function rotaEstaCompleta(rotaId) {
  const idsDaRota = rotasInfo[rotaId]?.municipios || [];
  return idsDaRota.length > 0 && idsDaRota.every((id) => estaVerificado(id));
}

let rotasAbaAtual = "oficiais";

function configurarRotas() {
  document.querySelectorAll("#rotas-abas .rotas-aba").forEach((botao) => {
    botao.addEventListener("click", () => mudarAbaRotas(botao.dataset.aba));
  });
}

function mudarAbaRotas(aba) {
  rotasAbaAtual = aba;
  document.querySelectorAll("#rotas-abas .rotas-aba").forEach((b) => {
    b.classList.toggle("rotas-aba-ativa", b.dataset.aba === aba);
  });
  document.getElementById("rotas-painel-oficiais").classList.toggle("oculto", aba !== "oficiais");
  document.getElementById("rotas-painel-personalizadas").classList.toggle("oculto", aba !== "personalizadas");
}

function abrirRotas() {
  const lista = document.getElementById("rotas-lista");
  lista.innerHTML = "";

  // Cada estado terá as suas rotas. O modal é revelado aqui pelo mesmo
  // motivo do de Conquistas: a linha que o abre fica lá no fim.
  if (emEstadoLimitado()) {
    avisarConteudoEmDesenvolvimento(lista, "Rotas");
    document.getElementById("modal-rotas").classList.remove("oculto");
    return;
  }

  const idsRotas = Object.keys(rotasInfo).sort((a, b) =>
    (rotasInfo[a]?.nome || a).localeCompare(rotasInfo[b]?.nome || b, "pt-BR")
  );

  idsRotas.forEach((id) => {
    const info = rotasInfo[id];
    const idsDaRota = info.municipios || [];
    const visitados = idsDaRota.filter((mid) => estaVerificado(mid)).length;
    const iniciada = visitados > 0;
    const pct = idsDaRota.length ? (visitados / idsDaRota.length) * 100 : 0;
    const completa = rotaEstaCompleta(id);
    const revelado = completa && !!estadoRotas[id]?.revelado;
    const brilhante = revelado && !!estadoRotas[id]?.brilhante;

    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "rota-card" + (iniciada ? "" : " rota-card-bloqueada") + (brilhante ? " rota-card-brilhante" : "");
    item.title = info.nome;

    const img = document.createElement("img");
    img.alt = info.nome;
    if (revelado) {
      resolverImagemColorida(`assets/img/rotas/${id}`, brilhante, id, info.nome).then((resultado) => {
        img.src = resultado.url;
      });
    } else {
      img.src = gerarSeloPlaceholder(id, info.nome);
    }
    const thumb = envolverComPlaceholder(img, "dourado");
    thumb.classList.add("rota-card-thumb");

    /* Cadeado na rota não iniciada.
       Cuidado com a história: na v0.11.12 os cadeados foram REMOVIDOS
       das rotas -- mas o que saiu foi o emoji 🔒 amarelo e berrante. O
       que entra aqui é o MESMO SVG minimalista que as conquistas já
       usam, sobre a miniatura já dessaturada. É a mesma transição que
       as conquistas fizeram (emoji -> traço fino), não uma volta atrás. */
    if (!iniciada) {
      const cadeado = document.createElement("span");
      cadeado.className = "cadeado-sobreposto";
      cadeado.setAttribute("aria-hidden", "true");
      cadeado.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
      thumb.appendChild(cadeado);
    }

    item.appendChild(thumb);

    const infoCol = document.createElement("div");
    infoCol.className = "rota-card-info";
    infoCol.innerHTML = `
      <span class="rota-card-titulo">${escaparHtml(info.nome)}${brilhante ? " ✨" : ""}</span>
      <div class="rota-card-progresso-linha">
        <div class="rota-card-barra"><div class="rota-card-barra-preenchida" style="width:${pct}%"></div></div>
        <span class="rota-card-contador">${visitados}/${idsDaRota.length}</span>
      </div>
    `;
    item.appendChild(infoCol);

    const chevron = document.createElement("span");
    chevron.className = "rota-card-chevron";
    chevron.textContent = "›";
    item.appendChild(chevron);

    item.addEventListener("click", () => {
      fecharRotas();
      abrirPopupRota(id);
    });
    lista.appendChild(item);
  });

  mudarAbaRotas("oficiais");
  document.getElementById("modal-rotas").classList.remove("oculto");
  renderizarMinhasRotas();
}

function fecharRotas() {
  document.getElementById("modal-rotas").classList.add("oculto");
}

function abrirPopupRota(rotaId) {
  rotaSelecionadaId = rotaId;
  const info = rotasInfo[rotaId];
  if (!info) return;

  const idsDaRota = info.municipios || [];
  const visitados = idsDaRota.filter((id) => estaVerificado(id)).length;
  const completa = visitados === idsDaRota.length && idsDaRota.length > 0;

  document.getElementById("rota-detalhe-nome").textContent = info.nome;
  document.getElementById("rota-detalhe-descricao").textContent = info.descricao || "";
  document.getElementById("rota-detalhe-status").textContent =
    `${visitados} / ${idsDaRota.length} municípios verificados`;
  document.getElementById("rota-detalhe-barra-preenchida").style.width =
    `${(visitados / idsDaRota.length) * 100}%`;
  // A história pode ter vários parágrafos (separados por linha em branco
  // no data/rotas.json) -- cada um vira um <p>. Rotas com texto de uma
  // linha só continuam funcionando (um <p> só).
  document.getElementById("rota-detalhe-historia").innerHTML = (info.historia || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escaparHtml(p)}</p>`)
    .join("");

  const corpo = document.getElementById("rota-detalhe-selo-body");
  corpo.innerHTML = "";
  const instrucao = document.getElementById("rota-detalhe-instrucao");

  if (!completa) {
    const faltam = idsDaRota.length - visitados;
    instrucao.textContent = `Complete os ${faltam} município${faltam === 1 ? "" : "s"} que falta${faltam === 1 ? "" : "m"} nessa rota para desbloquear o selo especial.`;
    mostrarSpinnerGrande(corpo, false);
    corpo.innerHTML = `<div class="selo-bloqueado">🔒</div>`;
    document.getElementById("rota-detalhe-selo-estatistica").textContent = "";
  } else if (estadoRotas[rotaId]?.revelado) {
    instrucao.textContent = "";
    exibirMegaSeloRotaRevelado(rotaId, corpo);
  } else {
    instrucao.textContent = "Rota completa! Raspe o selo especial.";
    document.getElementById("rota-detalhe-selo-estatistica").textContent = "";
    mostrarSpinnerGrande(corpo, true);
    // Selo de rota brilhante: mesma chance do mega-selo de região
    // (10%), decidida na abertura (ver decidirBrilhanteRota).
    const brilhante = decidirBrilhanteRota(rotaId);
    const caminhoCapa = `assets/img/rotas/${rotaId}fundo.webp`;
    resolverImagemColorida(`assets/img/rotas/${rotaId}`, brilhante, rotaId, info.nome, 400).then(
      (resultado) => {
        const usarCapa = resultado.arteReal
          ? carregarImagem(caminhoCapa).then((existeCapa) => (existeCapa ? caminhoCapa : null))
          : Promise.resolve(null);
        usarCapa.then((imageUrlCapa) => {
          corpo.innerHTML = "";
          initScratchCard({
            containerId: "rota-detalhe-selo-body",
            imageUrl: resultado.url,
            imageUrlCapa,
            tamanho: 400,
            onPrimeiroToque: () => travarSorteRotaNaPrimeiraRaspada(rotaId, brilhante),
            onComplete: () => {
              marcarRotaComoRevelada(rotaId, brilhante);
              return brilhante;
            },
          });
        });
      }
    );
  }

  document.getElementById("modal-rota-detalhe").classList.remove("oculto");
}

function exibirMegaSeloRotaRevelado(rotaId, corpo) {
  const info = rotasInfo[rotaId];
  const brilhante = !!estadoRotas[rotaId]?.brilhante;
  resolverImagemColorida(`assets/img/rotas/${rotaId}`, brilhante, rotaId, info.nome, 400).then(
    (resultado) => {
      const wrapper = document.createElement("div");
      wrapper.className = "selo-revelado-wrapper";
      const img = document.createElement("img");
      img.src = resultado.url;
      img.alt = info.nome;
      img.className = "selo-revelado selo-revelado-grande";
      wrapper.appendChild(img);
      if (brilhante) adicionarBrilho(wrapper);
      corpo.appendChild(wrapper);
    }
  );
}

function decidirBrilhanteRota(rotaId) {
  const anterior = estadoRotas[rotaId];
  if (anterior?.chanceDecidida) return !!anterior.brilhante;
  return Math.random() < 0.1;
}

function travarSorteRotaNaPrimeiraRaspada(rotaId, brilhante) {
  if (estadoRotas[rotaId]?.chanceDecidida) return;
  estadoRotas[rotaId] = { ...estadoRotas[rotaId], brilhante: !!brilhante, chanceDecidida: true };
  salvarEstadoRotas();
}

function marcarRotaComoRevelada(rotaId, brilhante) {
  estadoRotas[rotaId] = {
    revelado: true,
    dataRevelado: new Date().toISOString(),
    brilhante: !!brilhante,
    chanceDecidida: true,
  };
  salvarEstadoRotas();
  if (window.raspadinhaAuth?.usuarioAtual) {
    window.raspadinhaAuth.sincronizarRota(rotaId, { revelado: true, brilhante: !!brilhante });
  }
}

function fecharPopupRota() {
  document.getElementById("modal-rota-detalhe").classList.add("oculto");
  document.getElementById("rota-detalhe-selo-body").innerHTML = "";
  rotaSelecionadaId = null;
}

/**
 * Visão dedicada de uma rota no mapa: zoom+destaque só nos
 * municípios dela (o resto fica esmaecido) e some com toda a UI
 * flutuante (barra de topo, botões da lateral, busca etc.) via
 * `body.modo-rota-ativo` -- só o botão "Sair da rota" continua
 * visível. `sairModoRota` desfaz tudo.
 */
function entrarModoRota(rotaId) {
  const info = rotasInfo[rotaId];
  if (!info) return;
  const idsDaRota = info.municipios || [];

  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const naRota = idsDaRota.includes(path.dataset.municipio);
    path.classList.toggle("municipio-da-rota", naRota);
    path.classList.toggle("municipio-fora-da-rota", !naRota);
  });

  document.body.classList.add("modo-rota-ativo");
  document.getElementById("btn-sair-rota").classList.remove("oculto");
  window.controleMapa?.focarEmMunicipios(idsDaRota);
}

function sairModoRota() {
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    path.classList.remove("municipio-da-rota", "municipio-fora-da-rota");
  });
  document.body.classList.remove("modo-rota-ativo");
  document.getElementById("btn-sair-rota").classList.add("oculto");
  window.controleMapa?.resetarZoom();
}

/* ============================================================
   Rotas PERSONALIZADAS: criadas por qualquer usuário, sem selo (ao
   contrário das rotas oficiais de data/rotas.json, que nunca entram
   aqui -- ficam em coleções/objetos totalmente separados, então não
   contam pras conquistas de rota nem aparecem misturadas com as
   oficiais). Guardadas em rotasPersonalizadas no Firestore (ver
   criarRotaPersonalizada/etc em js/auth.js).
   ============================================================ */

// Municípios escolhidos na tela de criação (Set de códigos IBGE) --
// sobrevive à digitação no filtro de busca.
let municipiosEscolhidosNaRota = new Set();
// Rota personalizada atualmente aberta no modal de detalhe.
let rotaPersonalizadaSelecionada = null;
// Trilha (coordenadas) de uma viagem do Modo Viagem, esperando ser
// anexada na PRÓXIMA rota salva -- ver usarTrilhaNaNovaRota/
// salvarRotaPersonalizada. null fora desse fluxo (criação manual normal).
let viagemTrilhaPendenteParaRota = null;

function abrirModalCriarRota() {
  municipiosEscolhidosNaRota = new Set();
  viagemTrilhaPendenteParaRota = null;
  document.getElementById("input-nome-rota").value = "";
  document.getElementById("input-descricao-rota").value = "";
  document.getElementById("input-filtro-municipios-rota").value = "";
  document.getElementById("criar-rota-erro").classList.add("oculto");
  renderizarListaMunicipiosParaEscolher("");
  fecharRotas();
  document.getElementById("modal-criar-rota").classList.remove("oculto");
}

function fecharModalCriarRota() {
  document.getElementById("modal-criar-rota").classList.add("oculto");
}

/**
 * Lista com filtro de texto dos 92 municípios pra escolher quais
 * entram na rota -- lê direto do #mapa-rj (mesma fonte que tudo mais),
 * ordenada por nome. A seleção (municipiosEscolhidosNaRota) persiste
 * entre re-renderizações causadas por digitar no filtro.
 */
function renderizarListaMunicipiosParaEscolher(filtro) {
  const lista = document.getElementById("criar-rota-lista-municipios");
  lista.innerHTML = "";
  const filtroLower = (filtro || "").trim().toLowerCase();

  const municipios = Array.from(document.querySelectorAll("#mapa-rj .municipio"))
    .map((path) => ({ id: path.dataset.municipio, nome: path.dataset.nome }))
    .filter((m, indice, todos) => todos.findIndex((x) => x.id === m.id) === indice)
    .filter((m) => !filtroLower || m.nome.toLowerCase().includes(filtroLower))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  municipios.forEach((m) => {
    const item = document.createElement("label");
    item.className = "criar-rota-municipio-item";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = municipiosEscolhidosNaRota.has(m.id);
    check.addEventListener("change", () => {
      if (check.checked) municipiosEscolhidosNaRota.add(m.id);
      else municipiosEscolhidosNaRota.delete(m.id);
      atualizarContadorCriarRota();
    });
    const texto = document.createElement("span");
    texto.textContent = m.nome;
    item.append(check, texto);
    lista.appendChild(item);
  });

  atualizarContadorCriarRota();
}

function atualizarContadorCriarRota() {
  const n = municipiosEscolhidosNaRota.size;
  document.getElementById("criar-rota-contador").textContent =
    `${n} município${n === 1 ? "" : "s"} selecionado${n === 1 ? "" : "s"}`;
}

async function salvarRotaPersonalizada() {
  const erroEl = document.getElementById("criar-rota-erro");
  erroEl.classList.add("oculto");
  const nome = document.getElementById("input-nome-rota").value;
  const descricao = document.getElementById("input-descricao-rota").value;
  const municipios = Array.from(municipiosEscolhidosNaRota);

  const botao = document.getElementById("btn-salvar-rota-personalizada");
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    await window.raspadinhaAuth.criarRotaPersonalizada({
      nome,
      descricao,
      municipios,
      trilha: viagemTrilhaPendenteParaRota,
      publica: false,
    });
    viagemTrilhaPendenteParaRota = null;
    fecharModalCriarRota();
    abrirRotas();
  } catch (erro) {
    erroEl.textContent = erro.message || "Não foi possível salvar a rota agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar rota";
  }
}

/**
 * Renderiza a seção "Minhas rotas" dentro do modal de Rotas Temáticas
 * (ver abrirRotas). Busca sempre que o modal abre -- lista curta, sem
 * necessidade de cache.
 */
async function renderizarMinhasRotas() {
  const lista = document.getElementById("minhas-rotas-lista");
  lista.innerHTML = '<div class="spinner"></div>';
  try {
    const rotas = await window.raspadinhaAuth.buscarMinhasRotasPersonalizadas();
    lista.innerHTML = "";
    if (!rotas.length) {
      const vazio = document.createElement("p");
      vazio.id = "minhas-rotas-vazio";
      vazio.textContent = "Você ainda não criou nenhuma rota.";
      lista.appendChild(vazio);
      return;
    }
    rotas.forEach((rota) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "rota-personalizada-item";
      const visitados = rota.municipios.filter((id) => estaVerificado(id)).length;
      item.innerHTML = `${escaparHtml(rota.nome)}<span>${visitados}/${rota.municipios.length} municípios</span>`;
      item.addEventListener("click", () => abrirRotaPersonalizadaDetalhe(rota));
      lista.appendChild(item);
    });
  } catch (erro) {
    console.error("Falha ao buscar minhas rotas:", erro);
    lista.innerHTML = "<p>Não foi possível carregar suas rotas agora.</p>";
  }
}

function abrirRotaPersonalizadaDetalhe(rota) {
  rotaPersonalizadaSelecionada = rota;
  const meuUid = window.raspadinhaAuth?.usuarioAtual?.uid;
  const souDono = rota.donoUid === meuUid;
  const visitados = rota.municipios.filter((id) => estaVerificado(id)).length;

  document.getElementById("rota-personalizada-nome").textContent = rota.nome;
  document.getElementById("rota-personalizada-autor").textContent = souDono
    ? "Criada por você"
    : `Criada por ${rota.donoApelido || "alguém"}`;
  document.getElementById("rota-personalizada-descricao").textContent = rota.descricao || "";
  document.getElementById("rota-personalizada-status").textContent =
    `${visitados} / ${rota.municipios.length} municípios verificados`;
  document.getElementById("rota-personalizada-barra-preenchida").style.width =
    `${(visitados / rota.municipios.length) * 100}%`;
  document.getElementById("btn-excluir-rota-personalizada").classList.toggle("oculto", !souDono);

  fecharRotas();
  document.getElementById("modal-rota-personalizada-detalhe").classList.remove("oculto");
}

function fecharRotaPersonalizadaDetalhe() {
  document.getElementById("modal-rota-personalizada-detalhe").classList.add("oculto");
}

/** Mesma ideia de entrarModoRota, mas recebe a lista de ids direto
 * (rota personalizada não vive em rotasInfo). Usa o mesmo
 * sairModoRota pra desfazer -- ele já é genérico. */
function entrarModoRotaPersonalizada(ids) {
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const naRota = ids.includes(path.dataset.municipio);
    path.classList.toggle("municipio-da-rota", naRota);
    path.classList.toggle("municipio-fora-da-rota", !naRota);
  });
  document.body.classList.add("modo-rota-ativo");
  document.getElementById("btn-sair-rota").classList.remove("oculto");
  window.controleMapa?.focarEmMunicipios(ids);
}

async function excluirRotaPersonalizadaAtual() {
  if (!rotaPersonalizadaSelecionada) return;
  if (!confirm(`Excluir a rota "${rotaPersonalizadaSelecionada.nome}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await window.raspadinhaAuth.excluirRotaPersonalizada(rotaPersonalizadaSelecionada.id);
    fecharRotaPersonalizadaDetalhe();
    abrirRotas();
  } catch (erro) {
    alert("Não foi possível excluir a rota agora.");
  }
}

/**
 * Compartilhar rota personalizada: abre um menu de opções (link externo
 * OU post na Comunidade) -- substitui o antigo confirm()/cancel() do
 * navegador. Ver btn-compartilhar-rota-link/comunidade/cancelar.
 */
function compartilharRotaPersonalizada() {
  if (!rotaPersonalizadaSelecionada) return;
  document.getElementById("modal-compartilhar-rota").classList.remove("oculto");
}

function fecharMenuCompartilharRota() {
  document.getElementById("modal-compartilhar-rota").classList.add("oculto");
}

/** Compartilha o link externo (?rotaPersonalizada=id) via Web Share/copiar. */
function compartilharRotaPersonalizadaComoLink() {
  const rota = rotaPersonalizadaSelecionada;
  fecharMenuCompartilharRota();
  if (!rota) return;

  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("rotaPersonalizada", rota.id);
  const dados = {
    title: "Desbrava",
    text: `Olha a rota "${rota.nome}" que criei no Desbrava!`,
    url: url.toString(),
  };
  if (navigator.share) {
    navigator.share(dados).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard
      .writeText(dados.url)
      .then(() => alert("Link copiado!"))
      .catch(() => prompt("Copie o link:", dados.url));
  } else {
    prompt("Copie o link:", dados.url);
  }
}

/**
 * Compartilha como post na Comunidade Desbrava. Como criarPost exige
 * uma foto, gera um "cartão" da rota via canvas (mesmo espírito do
 * cartão de progresso) e usa ele como a foto do post.
 */
async function compartilharRotaPersonalizadaNaComunidade() {
  const rota = rotaPersonalizadaSelecionada;
  fecharMenuCompartilharRota();
  if (!rota) return;

  try {
    const dataUrl = await gerarCartaoRotaPersonalizada(rota);
    const resposta = await fetch(dataUrl);
    const blob = await resposta.blob();
    const arquivo = new File([blob], "rota-desbrava.png", { type: "image/png" });
    await window.raspadinhaAuth.criarPost({
      arquivoFoto: arquivo,
      texto: `Criei a rota "${rota.nome}"! ${rota.descricao || ""} 🗺️`.trim(),
    });
    alert("Rota compartilhada na Comunidade! 🎉");
  } catch (erro) {
    console.error("Falha ao compartilhar rota na comunidade:", erro);
    alert("Não foi possível compartilhar agora. Tente de novo.");
  }
}

/* ============================================================
   Motoclube Desbrava: dicas/lojas de peças, oficinas e afins pra
   motociclistas, com filtro de marca/modelo.

   PAGO desde a v0.11.24 (R$ 9,90/mês). É o ÚNICO produto pago do app
   -- o que antes se chamava "Desbrava PRO" virou isto. Quem manda é
   souMembroMotoclube(), logo abaixo, que exige `ehPro` ligado E
   `proAte` no futuro.

   O voucher mensal da Loja vale o MESMO que a assinatura
   (VALOR_VOUCHER_MOTOCLUBE = PRECO_MOTOCLUBE), de propósito: o membro
   sente que recebe de volta o que pagou.
   ============================================================ */

/**
 * Fonte ÚNICA de verdade sobre "essa pessoa pagou?". Todo o resto do
 * app pergunta por aqui (perfil, garagem, voucher, extras do Modo
 * Viagem, download offline).
 *
 * Dois requisitos, não um: `ehPro` ligado E a assinatura dentro do
 * prazo. Só o booleano dava acesso vitalício no primeiro pagamento.
 */
function souMembroMotoclube() {
  // Liberação geral, ligada pelo admin (ver "Motoclube" em
  // Configurações de admin). Enquanto o pagamento não estiver de pé,
  // cobrar por um recurso que não destranca é pior que não cobrar.
  // Vem de configuracoes/global no Firestore, então vale pra todo mundo
  // e muda sem precisar de APK novo.
  if (window.raspadinhaAuth?.motoclubeLiberadoParaTodos === true) return true;

  if (window.raspadinhaAuth?.contaEhPro !== true) return false;

  const ate = parsearDataAssinatura(window.raspadinhaAuth?.proAte);
  // Sem data: conta ativada à mão (codigoAtivacaoPro), de antes de
  // existir cobrança. Essas não expiram -- tirar acesso de quem já
  // tinha seria pior do que deixar passar.
  if (!ate) return true;

  return ate.getTime() > Date.now();
}

/** Era PRO, mas o prazo passou. Serve pra trocar "Entrar" por
 *  "Renovar" no paywall e no checkout. */
function assinaturaMotoclubeVencida() {
  if (window.raspadinhaAuth?.contaEhPro !== true) return false;
  const ate = parsearDataAssinatura(window.raspadinhaAuth?.proAte);
  return !!ate && ate.getTime() <= Date.now();
}

/**
 * Normaliza o `proAte` venha ele como for. O mesmo campo pode chegar
 * como Timestamp do Firestore (com .toDate() ou {seconds}), string
 * ISO (é o que o Apps Script grava) ou Date. Data inválida devolve
 * null, e null aqui significa "não expira" -- errar pro lado de
 * liberar é melhor do que trancar quem pagou por causa de um formato
 * inesperado.
 */
function parsearDataAssinatura(valor) {
  if (!valor) return null;
  try {
    if (typeof valor.toDate === "function") return valor.toDate();
    if (typeof valor.seconds === "number") return new Date(valor.seconds * 1000);
    if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
    const data = new Date(valor);
    return isNaN(data.getTime()) ? null : data;
  } catch (erro) {
    console.error("proAte em formato inesperado:", valor, erro);
    return null;
  }
}

/**
 * Porta de entrada dos recursos pagos. Devolve `true` se pode seguir;
 * se não, abre o paywall e devolve `false`.
 *
 * Uso: `if (!exigirMotoclube()) return;`
 */
function exigirMotoclube() {
  if (souMembroMotoclube()) return true;
  abrirPaywallMotoclube();
  return false;
}

let itensMotoclubeCache = [];
let motoclubeJaPopulado = false;

function popularFormulariosMotoclubeSeNecessario() {
  if (motoclubeJaPopulado) return;
  motoclubeJaPopulado = true;

  const selectMarcaFiltro = document.getElementById("select-motoclube-marca");
  MARCAS_MOTOCLUBE.forEach((marca) => {
    const opt = document.createElement("option");
    opt.value = marca;
    opt.textContent = marca;
    selectMarcaFiltro.appendChild(opt);
  });

  const selectCategoria = document.getElementById("select-motoclube-categoria");
  CATEGORIAS_MOTOCLUBE.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.chave;
    opt.textContent = cat.label;
    selectCategoria.appendChild(opt);
  });

  /* Pílulas de filtro no lugar do <select>. Escrevem no input escondido
     que renderizarListaMotoclube já lê, então a lógica de filtro não
     mudou -- só a forma de escolher. */
  const filtros = document.getElementById("apoio-filtros");
  const campoMarca = document.getElementById("select-motoclube-marca");
  if (filtros && !filtros.children.length) {
    ["", ...MARCAS_MOTOCLUBE].forEach((marca) => {
      const pilula = document.createElement("button");
      pilula.type = "button";
      pilula.className = "apoio-pilula" + (marca === "" ? " apoio-pilula-ativa" : "");
      pilula.textContent = marca || "Todas";
      pilula.dataset.marca = marca;
      pilula.addEventListener("click", () => {
        filtros.querySelectorAll(".apoio-pilula").forEach((p) => p.classList.remove("apoio-pilula-ativa"));
        pilula.classList.add("apoio-pilula-ativa");
        campoMarca.value = marca;
        renderizarListaMotoclube();
      });
      filtros.appendChild(pilula);
    });
  }

  const marcasForm = document.getElementById("motoclube-form-marcas");
  MARCAS_MOTOCLUBE.forEach((marca) => {
    const chip = document.createElement("label");
    chip.className = "motoclube-marca-chip";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.value = marca;
    /* A classe acompanha o :checked pra funcionar também em navegador
       sem :has() -- o CSS traz as duas formas. */
    check.addEventListener("change", () => chip.classList.toggle("chip-marcado", check.checked));
    chip.append(check, document.createTextNode(marca));
    marcasForm.appendChild(chip);
  });
}

/* ============================================================
   GRUPOS DO MOTOCLUBE
   ------------------------------------------------------------
   Um grupo por município (92), com brasão próprio em
   assets/img/motoclube-grupos/. A pessoa participa de UM só.

   Sair é livre. Entrar em outro exige 30 dias desde a ÚLTIMA
   ENTRADA -- e não desde a saída, senão bastaria sair e entrar pra
   trocar na hora.

   Como todo gate do app, isto é client-side: quem abrir o DevTools
   passa por cima. Vale o mesmo raciocínio do resto -- o objetivo é
   dar sentido à escolha, não impedir fraude.
   ============================================================ */
const DIAS_CARENCIA_GRUPO = 30;

function meuGrupoMotoclube() {
  return window.raspadinhaAuth?.grupoMotoclube || null;
}

/** Quanto falta pra poder entrar em outro grupo. 0 = já pode. */
function diasParaTrocarDeGrupo() {
  const entrouEm = window.raspadinhaAuth?.grupoEntrouEm;
  if (!entrouEm) return 0;

  const entrada = new Date(entrouEm);
  // Data inválida libera, em vez de trancar: o pior erro aqui seria
  // deixar alguém preso num grupo por causa de um campo estragado.
  if (isNaN(entrada.getTime())) return 0;

  const passados = (Date.now() - entrada.getTime()) / 86400000;
  return Math.max(0, Math.ceil(DIAS_CARENCIA_GRUPO - passados));
}

/* Casas do número de membro. 11 dígitos, como o Paulo pediu:
   #00000000001. É folga de sobra e dá cara de credencial. */
const CASAS_NUMERO_MOTOCLUBE = 11;

function formatarNumeroMotoclube(numero) {
  return "#" + String(numero).padStart(CASAS_NUMERO_MOTOCLUBE, "0");
}

/**
 * O Motoclube está ativo PARA O DONO DAQUELE PERFIL?
 *
 * Diferente de souMembroMotoclube(), que responde sobre quem está
 * usando o app. Visitando o perfil de outra pessoa, é a assinatura
 * DELA que decide se o número aparece.
 */
function motoclubeAtivoNoPerfil(perfil) {
  if (window.raspadinhaAuth?.motoclubeLiberadoParaTodos === true) return true;
  if (perfil?.ehPro !== true) return false;
  const ate = parsearDataAssinatura(perfil?.proAte);
  if (!ate) return true; // ativação manual antiga, sem validade: não expira
  return ate.getTime() > Date.now();
}

/**
 * Garante que quem está num grupo tenha número, inclusive quem entrou
 * antes de a numeração existir.
 *
 * Roda ao abrir o Motoclube e ao entrar num grupo. Não faz nada pra
 * quem já tem -- o número é vitalício e nunca é reatribuído.
 */
async function garantirNumeroDoMembro() {
  if (!meuGrupoMotoclube()) return null;
  if (window.raspadinhaAuth?.numeroMotoclube) return null;
  try {
    return await window.raspadinhaAuth.garantirNumeroMotoclube();
  } catch (erro) {
    // Falhar aqui não pode impedir a pessoa de usar o Motoclube.
    console.warn("Não foi possível atribuir o número de membro:", erro);
    return null;
  }
}

function nomeDoMunicipio(id) {
  /* '.municipio' no seletor não é enfeite: outros elementos do SVG
     carregam data-municipio (o recorte do grão, a camada de satélite), e
     sem a classe o querySelector podia devolver um deles -- que não tem
     dataset.nome -- e o nome virava o código do IBGE na tela. */
  const path = document.querySelector(`#mapa-rj .municipio[data-municipio="${id}"]`);
  return path?.dataset.nome || idParaNomeMunicipio[id] || id;
}

function urlDoBrasao(id) {
  return `assets/img/motoclube-grupos/${id}.svg`;
}

/** Bloco "Meu grupo" no topo da aba Motoclube. */
function renderizarMeuGrupo() {
  const caixa = document.getElementById("motoclube-meu-grupo");
  if (!caixa) return;

  const grupo = meuGrupoMotoclube();
  const faltam = diasParaTrocarDeGrupo();

  if (!grupo) {
    caixa.innerHTML = `
      <p class="grupo-vazio-titulo">Você ainda não faz parte de um grupo</p>
      <p class="grupo-vazio-texto">Escolha o município que representa sua estrada.</p>
      <button type="button" id="btn-escolher-grupo" class="sheet-btn-primario">Escolher meu grupo</button>
      ${faltam > 0 ? `<p class="grupo-aviso">Você poderá entrar em um grupo daqui a ${faltam} dia(s).</p>` : ""}
    `;
  } else {
    caixa.innerHTML = `
      <div class="grupo-atual">
        <button type="button" id="btn-ver-brasao" class="grupo-brasao-botao" aria-label="Ver brasão em tamanho grande">
          <img class="grupo-brasao" src="${escaparHtml(urlDoBrasao(grupo))}" alt="Brasão do grupo">
        </button>
        <div>
          <p class="grupo-atual-nome">${escaparHtml(nomeDoMunicipio(grupo))}</p>
          <p class="grupo-atual-sub">Seu grupo no Motoclube</p>
          <p class="grupo-membros" id="grupo-membros">carregando membros...</p>
          ${
            // O número existe pra sempre, mas só APARECE com a
            // assinatura ativa -- foi assim que o Paulo pediu.
            window.raspadinhaAuth?.numeroMotoclube && souMembroMotoclube()
              ? `<p class="grupo-numero">Membro ${escaparHtml(formatarNumeroMotoclube(window.raspadinhaAuth.numeroMotoclube))}</p>`
              : ""
          }
        </div>
      </div>
      <div class="grupo-acoes">
        <button type="button" id="btn-trocar-grupo"${faltam > 0 ? " disabled" : ""}>Trocar de grupo</button>
        <button type="button" id="btn-sair-grupo">Sair do grupo</button>
      </div>
      ${faltam > 0 ? `<p class="grupo-aviso">Você poderá trocar daqui a ${faltam} dia(s).</p>` : ""}
    `;
    caixa.querySelector("#btn-ver-brasao")?.addEventListener("click", () => abrirBrasaoDoGrupo(grupo));
    mostrarNumeroDeMembros(grupo);
  }

  caixa.querySelector("#btn-escolher-grupo")?.addEventListener("click", abrirEscolhaDeGrupo);
  caixa.querySelector("#btn-trocar-grupo")?.addEventListener("click", abrirEscolhaDeGrupo);
  caixa.querySelector("#btn-sair-grupo")?.addEventListener("click", aoSairDoGrupo);
}

/**
 * Escreve "N membros" no card do grupo.
 *
 * Falha em silêncio: o número é enfeite, e sumir com ele incomoda menos
 * que um erro vermelho por causa de uma contagem.
 */
async function mostrarNumeroDeMembros(municipioId) {
  const el = document.getElementById("grupo-membros");
  if (!el) return;
  try {
    const total = await window.raspadinhaAuth.contarMembrosDoGrupo(municipioId);
    el.textContent = total === 1 ? "1 membro" : `${total} membros`;
  } catch (erro) {
    console.warn("Não foi possível contar os membros do grupo:", erro);
    el.classList.add("oculto");
  }
}

/** Brasão em tamanho grande, com opção de compartilhar. */
function abrirBrasaoDoGrupo(municipioId) {
  brasaoAberto = municipioId;
  document.getElementById("brasao-grande").src = urlDoBrasao(municipioId);
  document.getElementById("brasao-titulo").textContent = `Grupo ${nomeDoMunicipio(municipioId)}`;
  document.getElementById("modal-brasao").classList.remove("oculto");
}

function fecharBrasaoDoGrupo() {
  fecharComAnimacao(document.getElementById("modal-brasao"));
  brasaoAberto = null;
}

/* Município cujo brasão está aberto -- guardado porque o compartilhar
   precisa saber qual arquivo converter. */
let brasaoAberto = null;

/**
 * Compartilha o brasão como PNG.
 *
 * O arquivo é SVG, e a maioria dos apps (WhatsApp, Instagram) não
 * aceita SVG -- por isso o desenho é redesenhado num <canvas> e sai
 * como PNG de 1024px. Sem Web Share com arquivo (desktop, navegador
 * antigo), cai pro download, que resolve o mesmo problema.
 */
async function compartilharBrasaoDoGrupo() {
  if (!brasaoAberto) return;
  const nome = nomeDoMunicipio(brasaoAberto);
  const botao = document.getElementById("btn-compartilhar-brasao");
  const rotuloOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Preparando...";

  try {
    const svg = await fetch(urlDoBrasao(brasaoAberto)).then((r) => r.text());
    const blob = await svgParaPngBlob(svg, 1024);
    const arquivo = new File([blob], `motoclube-${nome}.png`, { type: "image/png" });
    const texto = `Faço parte do Motoclube Desbrava — grupo ${nome}! 🏍️`;

    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], text: texto });
      return;
    }

    // Sem compartilhar COM ARQUIVO. Antes isto caía direto no truque do
    // link com `download`, que na WebView do Android não faz nada
    // visível -- o botão parecia simplesmente não funcionar. Agora tem
    // dois degraus antes de desistir, e o último abre a imagem numa
    // aba, onde dá pra segurar o dedo e salvar.
    if (navigator.share) {
      await navigator.share({ text: texto, url: location.origin });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo.name;
    a.rel = "noopener";
    a.click();
    // Só revoga depois: revogar no mesmo instante cancelava o download
    // antes de ele começar em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (erro) {
    // AbortError = a pessoa fechou a folha de compartilhamento. Não é
    // falha, não merece aviso.
    if (erro?.name === "AbortError") return;
    console.error("Falha ao compartilhar o brasão:", erro);
    // Falhar em SILÊNCIO era metade do problema: quem apertava não
    // sabia se tinha travado, se ia abrir, ou se o botão estava morto.
    botao.textContent = "Não consegui compartilhar";
    setTimeout(() => (botao.textContent = rotuloOriginal), 2500);
    return;
  } finally {
    botao.disabled = false;
    if (botao.textContent === "Preparando...") botao.textContent = rotuloOriginal;
  }
}

/**
 * Rasteriza um SVG em PNG, via <img> + <canvas>.
 *
 * `largura` manda, e a altura sai da PROPORÇÃO do próprio SVG. O
 * brasão deixou de ser quadrado quando ganhou asas (1170x560): forçar
 * um quadrado, como era antes, espremia o desenho na imagem
 * compartilhada.
 */
function svgParaPngBlob(svg, largura) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // data: URL em vez de blob: -- o canvas não fica "sujo" (tainted)
    // assim, e o toBlob continua permitido.
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    img.onload = () => {
      const proporcao = img.naturalHeight / img.naturalWidth || 1;
      const altura = Math.round(largura * proporcao);
      const canvas = document.createElement("canvas");
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, largura, altura);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas vazio"))), "image/png");
    };
    img.onerror = () => reject(new Error("não consegui carregar o brasão"));
  });
}

function abrirEscolhaDeGrupo() {
  // Aqui é onde o Motoclube passou a cobrar: ver os grupos é livre,
  // participar de um é que exige assinatura.
  if (!exigirMotoclube()) return;
  if (diasParaTrocarDeGrupo() > 0) return;
  // Reaproveita o seletor de município das Sugestões: mesma lista, mesma
  // busca. Duplicar a tela só pra trocar o callback seria desperdício.
  abrirEscolherMunicipio({
    selecionado: meuGrupoMotoclube(),
    permitirNenhum: false,
    aoEscolher: (id) => {
      fecharEscolherMunicipio();
      aoEntrarNoGrupo(id);
    },
  });
}

async function aoEntrarNoGrupo(municipioId) {
  const faltam = diasParaTrocarDeGrupo();
  if (faltam > 0) {
    mostrarToastLogin(`Você só poderá trocar de grupo daqui a ${faltam} dia(s).`);
    atualizarToastLogin("erro", `Você só poderá trocar de grupo daqui a ${faltam} dia(s).`);
    setTimeout(esconderToastLogin, 3200);
    return;
  }

  try {
    await window.raspadinhaAuth.entrarNoGrupoMotoclube(municipioId);
    // O número nasce na PRIMEIRA entrada em um grupo, e fica pra sempre.
    await garantirNumeroDoMembro();
    renderizarMeuGrupo();
    mostrarToastLogin(`🏍️ Você entrou no grupo de ${nomeDoMunicipio(municipioId)}!`);
    atualizarToastLogin("sucesso", `🏍️ Você entrou no grupo de ${nomeDoMunicipio(municipioId)}!`);
    setTimeout(esconderToastLogin, 3200);
  } catch (erro) {
    console.error("Falha ao entrar no grupo:", erro);
    mostrarToastLogin("Não foi possível entrar no grupo agora.");
    atualizarToastLogin("erro", "Não foi possível entrar no grupo agora.");
    setTimeout(esconderToastLogin, 3200);
  }
}

async function aoSairDoGrupo() {
  const faltam = diasParaTrocarDeGrupo();
  const aviso =
    faltam > 0
      ? `Sair agora não adianta a fila: você só poderá entrar em outro grupo daqui a ${faltam} dia(s). Sair mesmo assim?`
      : "Tem certeza que quer sair do seu grupo?";
  if (!confirm(aviso)) return;

  try {
    await window.raspadinhaAuth.sairDoGrupoMotoclube();
    renderizarMeuGrupo();
  } catch (erro) {
    console.error("Falha ao sair do grupo:", erro);
  }
}

/* A aba do Motoclube é ABERTA a todo mundo desde a v0.11.39.
 *
 * Cobrar pra só OLHAR dicas e lojas afastava justamente quem ainda não
 * conhece o produto. Agora a pessoa entra, vê o conteúdo e os grupos, e
 * o paywall aparece na hora em que ela quer PARTICIPAR: entrar num
 * grupo ou cadastrar uma moto na Garagem. */
/**
 * Abre o Motoclube numa aba (`garagem` por padrao). As tres telas do
 * motociclista viraram abas daqui: a Garagem nao tem mais modal
 * proprio, e a moto cadastrada nela alimenta o combustivel dos Roteiros.
 *
 * As lojas so sao buscadas quando a aba delas aparece -- abrir na
 * Garagem nao deve custar uma leitura do Firestore que ninguem pediu.
 */
async function abrirMotoclube() {
  // Tocar em "Motoclube" com a tela já aberta FECHA -- é a segunda
  // saída, já que a barra inferior não tem mais botão "Mapa".
  if (motoclubeEstaAberto()) {
    fecharMotoclube();
    return;
  }
  popularFormulariosMotoclubeSeNecessario();
  renderizarMeuGrupo();
  // Quem já estava num grupo antes de a numeração existir ganha o
  // número aqui, na primeira vez que abre a aba. Sem await: o card do
  // grupo se redesenha sozinho quando o número chega.
  garantirNumeroDoMembro().then((novo) => {
    if (novo) renderizarMeuGrupo();
  });
  mostrarViewMotoclube(true);
  sincronizarToggleViagem();
  aplicarEstadoDeMembro();
  voltarAoPainelMotoclube();
}

/* Cadeado nos cards e saudação: quem não assina VÊ o painel inteiro --
   esconder faria a pessoa não descobrir o que está comprando. O que
   muda é o cadeado, o texto e o convite no topo. */
function aplicarEstadoDeMembro() {
  const membro = souMembroMotoclube();
  document.getElementById("motoclube-saudacao").textContent = membro
    ? `Bem-vindo, ${window.raspadinhaAuth.apelido || "Membro"}`
    : "Conheça o que os membros têm";
  document.getElementById("motoclube-hero-selo").textContent = membro ? "ÁREA DE MEMBRO" : "ÁREA DE MEMBRO — BLOQUEADA";
  document.querySelectorAll("#motoclube-cards .mc-card").forEach((card) => {
    card.classList.toggle("mc-card-bloqueado", !membro);
    card.querySelector(".mc-card-cadeado")?.classList.toggle("oculto", membro);
  });
  const check = document.getElementById("check-modo-viagem");
  if (check) check.disabled = !membro;
}

/** Busca e desenha as lojas/dicas -- so quando a aba delas e aberta. */
async function carregarLojasMotoclube() {
  const lista = document.getElementById("motoclube-lista");
  if (!lista) return;
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    itensMotoclubeCache = await window.raspadinhaAuth.buscarItensMotoclube();
    renderizarListaMotoclube();
  } catch (erro) {
    /* A mensagem antiga era "Não foi possível carregar o Motoclube
       agora" pra qualquer falha -- e escondia a diferença entre estar
       sem internet e o banco ter recusado a leitura, que pedem coisas
       opostas de quem está lendo. O código do Firestore diz qual é. */
    console.error("Falha ao buscar itens do Motoclube:", erro);
    lista.innerHTML = "";
    const aviso = document.createElement("p");
    aviso.id = "motoclube-lista-vazio";
    aviso.textContent = !navigator.onLine
      ? "Você está sem conexão. Os Pontos de Apoio precisam de internet pra carregar."
      : erro?.code === "permission-denied"
        ? "Sua conta não tem permissão pra ver os Pontos de Apoio. Se acabou de assinar, saia e entre de novo."
        : "Não deu pra carregar os Pontos de Apoio agora. Puxe pra baixo e tente de novo.";
    lista.appendChild(aviso);

    const tentar = document.createElement("button");
    tentar.type = "button";
    tentar.className = "apoio-pilula";
    tentar.textContent = "Tentar de novo";
    tentar.addEventListener("click", carregarLojasMotoclube);
    lista.appendChild(tentar);
  }
}

/* ============================================================
   Roteiros (Motoclube, PAGO)

   Mostra COMO ir, não só onde: pega os pontos turísticos de uma rota,
   calcula distância, tempo e custo de combustível a partir da moto
   cadastrada na Garagem, e abre a navegação no Google Maps ou no Waze.

   Chama-se "Roteiro" e não "Rota" de propósito: "Rotas" já são as 24
   coleções temáticas com selo (data/rotas.json, guia/rota-*.html). Em
   português, roteiro é o itinerário planejado de uma viagem -- é a
   palavra certa, e evita duas coisas diferentes com o mesmo nome.
   ============================================================ */

/* O OSRM público é servidor de DEMONSTRAÇÃO: sem contrato, sem SLA,
   pode sair do ar ou limitar uso. É por isso que todo número daqui sai
   rotulado como estimativa e existe o caminho de fallback offline. */
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving/";

/* Acima disto, o OSRM teve que arrastar o ponto até uma estrada longe
   demais -- sinal de lugar sem acesso rodoviário (ilha, trilha). Manter
   um ponto desses infla o trajeto com um desvio que não existe: no
   teste, Vila do Abraão (Ilha Grande) foi deslocada 9,8 km. */
const LIMITE_DESVIO_KM = 2;

/* Sinuosidade média de estrada brasileira sobre a linha reta. Só entra
   quando o OSRM não responde, e o número sai marcado como grosseiro. */
const FATOR_ESTRADA = 1.3;

const GOOGLE_MAPS_MAX_PARADAS = 9;

/**
 * Distância e tempo de estrada pelo OSRM. Devolve também o quanto cada
 * ponto foi arrastado até a estrada mais próxima (`desvios`), que é
 * como a gente descobre lugar sem acesso rodoviário.
 */
async function medirTrajetoOsrm(pontos) {
  const coords = pontos.map((p) => `${p.lon},${p.lat}`).join(";");
  const resposta = await fetch(`${OSRM_BASE}${coords}?overview=false`);
  if (!resposta.ok) throw new Error(`OSRM HTTP ${resposta.status}`);
  const dados = await resposta.json();
  if (dados.code !== "Ok" || !dados.routes?.length) throw new Error(`OSRM: ${dados.code}`);
  return {
    km: dados.routes[0].distance / 1000,
    minutos: dados.routes[0].duration / 60,
    desvios: (dados.waypoints || []).map((w) => (w.distance || 0) / 1000),
    real: true,
  };
}

/**
 * Plano B quando o OSRM não responde: soma das linhas retas entre os
 * pontos, esticada pelo fator de sinuosidade. É grosseiro e a tela diz
 * isso -- número aproximado apresentado como exato é pior que número
 * nenhum.
 */
function medirTrajetoEmLinhaReta(pontos) {
  let km = 0;
  for (let i = 1; i < pontos.length; i++) {
    km += distanciaEmKm(pontos[i - 1].lat, pontos[i - 1].lon, pontos[i].lat, pontos[i].lon);
  }
  km *= FATOR_ESTRADA;
  return { km, minutos: (km / 55) * 60, desvios: [], real: false };
}

/** Link do Google Maps com paradas (o limite público é 9). */
function urlGoogleMaps(pontos) {
  const coord = (p) => `${p.lat},${p.lon}`;
  const origem = pontos[0];
  const destino = pontos[pontos.length - 1];
  const paradas = pontos.slice(1, -1).map(coord).join("|");
  const base = `https://www.google.com/maps/dir/?api=1&origin=${coord(origem)}&destination=${coord(destino)}&travelmode=driving`;
  return paradas ? `${base}&waypoints=${encodeURIComponent(paradas)}` : base;
}

/** Waze só aceita UM destino -- por isso é "ir até este ponto", não a rota. */
function urlWaze(ponto) {
  return `https://waze.com/ul?ll=${ponto.lat},${ponto.lon}&navigate=yes`;
}

/** Quebra em trechos de no máximo 9 paradas, pra rota longa caber no Maps. */
function trechosDoRoteiro(pontos) {
  const porTrecho = GOOGLE_MAPS_MAX_PARADAS + 1;
  if (pontos.length <= porTrecho) return [pontos];
  const trechos = [];
  for (let i = 0; i < pontos.length - 1; i += porTrecho - 1) {
    trechos.push(pontos.slice(i, i + porTrecho));
  }
  return trechos;
}

/* ---- Consumo estimado pela cilindrada ----

   O consumo sai do NOME DO MODELO que a pessoa já digita: quase toda
   moto vendida no Brasil traz a cilindrada ali (CG 160, Factor 150,
   XRE 300, Hunter 350). Isso evita um campo novo e uma tabela de
   centenas de modelos que seria impossível manter -- e impossível de
   preencher sem inventar número.

   Faixa, nunca número único: a MESMA moto varia mais de 30% entre
   cidade, estrada e serra, com carga e pilotagem. "8,6 L" seria uma
   precisão que o dado não tem. O consumo digitado à mão sempre vence
   isto -- quem sabe o próprio gasto não precisa de estimativa. */

/* Faixas de km/l por classe de cilindrada, uso misto. São largas de
   propósito: estreitar sem medição real seria fingir exatidão. */
const FAIXAS_CONSUMO = [
  { ate: 124, min: 40, max: 55 },
  { ate: 149, min: 38, max: 48 },
  { ate: 199, min: 32, max: 45 },
  { ate: 299, min: 28, max: 38 },
  { ate: 449, min: 24, max: 32 },
  { ate: 699, min: 18, max: 26 },
  { ate: 999, min: 15, max: 22 },
  { ate: Infinity, min: 12, max: 18 },
];

/* Nenhuma moto de rua tem menos de 50cc nem mais de 1800cc por aqui.
   O teto também serve pra descartar ANO no nome ("CG 160 2023"): 2023
   cai fora da faixa e é ignorado. */
const CC_MIN = 50;
const CC_MAX = 1800;

/**
 * Cilindrada a partir do nome do modelo, ou null quando não dá pra
 * saber com segurança.
 *
 * O caso perigoso é o número abreviado: "R15" é 150cc, não 15cc, e
 * "R25" é 250. Por isso um número entre 10 e 49 é lido como dezena de
 * cilindrada (×10) -- mas só quando não houver nenhum número já
 * plausível no nome.
 *
 * Nome com número de UM dígito só (MT-03, R3, MT-07, XJ6) fica em
 * BRANCO de propósito: "03" pode ser 300 e "01" pode ser 1000, e
 * chutar errado aqui vira litro errado na conta de quem vai viajar.
 */
function cilindradaDoModelo(modelo) {
  const numeros = String(modelo || "").match(/\d+/g);
  if (!numeros) return null;

  for (const bruto of numeros) {
    const n = Number(bruto);
    if (n >= CC_MIN && n <= CC_MAX) return n;
  }
  // Nenhum número plausível: tenta o abreviado (R15 -> 150).
  for (const bruto of numeros) {
    const n = Number(bruto);
    if (n >= 10 && n <= 49) return n * 10;
  }
  return null;
}

/** Faixa de km/l da classe da moto, ou null se a cilindrada é desconhecida. */
function faixaConsumoDaMoto(moto) {
  const cc = cilindradaDoModelo(moto?.modelo);
  if (!cc) return null;
  const faixa = FAIXAS_CONSUMO.find((f) => cc <= f.ate);
  return faixa ? { cc, min: faixa.min, max: faixa.max } : null;
}

/**
 * Litros estimados. Devolve `{ min, max }` -- quando a pessoa informou
 * o consumo real, os dois são iguais e a tela mostra um valor só.
 *
 * O custo em reais saiu de propósito: preço de combustível varia por
 * estado, bandeira e semana, e não existe fonte grátis e confiável no
 * Brasil pra manter isso honesto. Litro cada um converte com o preço
 * do posto onde abastece.
 */
function litrosEstimados(km, moto) {
  const informado = Number(moto?.consumoKmL);
  if (informado > 0) return { min: km / informado, max: km / informado, exato: true };

  const faixa = faixaConsumoDaMoto(moto);
  if (!faixa) return null;
  // Mais km/l = menos litros: o consumo máximo dá o piso de litros.
  return { min: km / faixa.max, max: km / faixa.min, exato: false, cc: faixa.cc };
}

/** "≈ 7 a 9 L" ou "≈ 8.6 L" quando o consumo foi informado. */
function textoLitros(litros) {
  if (!litros) return "—";
  if (litros.exato) return `≈ ${litros.min.toFixed(1)} L`;
  return `≈ ${Math.round(litros.min)} a ${Math.round(litros.max)} L`;
}

function formatarDuracao(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Aviso de fase de testes: fica ACIMA dos números, sempre visível. */
function avisoRoteiroEmTestes(estimativaGrosseira) {
  const cx = document.createElement("p");
  cx.className = "roteiro-aviso";
  cx.textContent = estimativaGrosseira
    ? "⚠️ Sem conexão com o serviço de rotas: os números abaixo são conta em LINHA RETA, não distância de estrada. Use só como ordem de grandeza."
    : "⚠️ Roteiros em fase de testes. Distâncias, tempos e consumo são estimativas e podem conter erros. Confira o trajeto no seu app de GPS antes de sair — não dependa só daqui na estrada.";
  return cx;
}

/* ============================================================
   ROTEIRO — a viagem que a PESSOA monta

   Reescrito: antes o roteiro era gerado a partir de uma rota temática,
   e isso estava errado de conceito. As Rotas (com selo) são coleções
   pra completar ao longo do tempo, não um trajeto pra rodar num dia --
   e não têm ligação com o roteiro.

   Aqui a pessoa escolhe os pontos que QUER visitar, de qualquer
   município, na ordem que quiser. Duas portas de entrada, as duas
   DENTRO do Motoclube -- é lá que o roteiro vive:
     - "Escolher no mapa", tocando nos lugares na ordem da viagem;
     - o seletor da própria tela, por município.

   O chip "+ Roteiro" na folha do ponto SAIU: montar viagem no meio da
   exploração do mapa misturava duas coisas diferentes, e deixava um
   controle de recurso pago solto numa tela que todo mundo abre.

   O rascunho vive no localStorage e não no Firestore: é decisão de
   viagem, muda o tempo todo, e ninguém precisa que isso sincronize
   entre aparelhos pra funcionar.
   ============================================================ */

const CHAVE_ROTEIRO = "desbrava_roteiro";

/** ids no formato "<municipioId>:<indice>", na ordem escolhida. */
function roteiroSalvo() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_ROTEIRO) || "[]");
    return Array.isArray(bruto) ? bruto : [];
  } catch {
    return [];
  }
}

function gravarRoteiro(lista) {
  localStorage.setItem(CHAVE_ROTEIRO, JSON.stringify(lista));
}

function chaveDoPonto(municipioId, indice) {
  return `${municipioId}:${indice}`;
}

/** Resolve as chaves guardadas nos objetos de ponto, descartando o que sumiu. */
function pontosDoRoteiro() {
  return roteiroSalvo()
    .map((chave) => {
      const [municipioId, i] = chave.split(":");
      const municipio = destinosPorMunicipio[municipioId];
      const ponto = municipio?.destinos?.[Number(i)];
      if (!ponto) return null;
      return { ...ponto, chave, municipioId, municipio: municipio.nome };
    })
    .filter(Boolean);
}

function estaNoRoteiro(municipioId, indice) {
  return roteiroSalvo().includes(chaveDoPonto(municipioId, indice));
}

/** Põe ou tira um ponto. Devolve true se ficou dentro. */
function alternarPontoNoRoteiro(municipioId, indice) {
  const chave = chaveDoPonto(municipioId, indice);
  const lista = roteiroSalvo();
  const i = lista.indexOf(chave);
  if (i >= 0) lista.splice(i, 1);
  else lista.push(chave);
  gravarRoteiro(lista);
  return i < 0;
}

/* ---- Montar o roteiro NO MAPA ----

   A pessoa toca nos pontos na ordem em que quer visitar, direto no
   mapa. A UI toda some -- só ficam a seta de voltar e o contador --
   porque escolher a dedo exige o mapa inteiro livre; barra, topo e
   flutuantes só roubariam área e alvo de toque.

   Os pontos aparecem em QUALQUER zoom aqui. Fora deste modo eles só
   surgem a partir de ZOOM_DOS_PONTOS, pra não poluir o mapa afastado --
   mas quem está escolhendo precisa ver o que existe antes de aproximar.

   Enquanto está ligado, tocar num ponto ADICIONA/TIRA do roteiro em vez
   de abrir a folha de leitura dele. */
let modoMapaRoteiro = false;

function entrarNoModoMapaRoteiro() {
  if (!souMembroMotoclube()) {
    abrirPaywallMotoclube();
    return;
  }
  modoMapaRoteiro = true;
  fecharMotoclube();

  document.body.classList.add("escolhendo-roteiro");
  /* A classe .escolhendo é que força os pontos visíveis (ver CSS). Não
     mexo em .mostrar-pontos de propósito: ela é do zoom, e devolver o
     controle depois dependeria de a pessoa dar um zoom -- sem isso os
     pontos ficariam acesos pra sempre ao sair daqui. */
  document.getElementById("mapa-rj")?.classList.add("escolhendo");

  desenharNumerosDoRoteiro();
  atualizarBarraDoModoMapa();
}

function sairDoModoMapaRoteiro() {
  modoMapaRoteiro = false;
  document.body.classList.remove("escolhendo-roteiro");
  // Tirar a classe já devolve a visibilidade ao controle do zoom.
  document.getElementById("mapa-rj")?.classList.remove("escolhendo");
  document.querySelectorAll(".ponto-numero-roteiro").forEach((e) => e.remove());
  document
    .querySelectorAll("#mapa-rj .ponto-no-roteiro")
    .forEach((e) => e.classList.remove("ponto-no-roteiro"));
}

/** Distintivo numerado sobre cada ponto que está no roteiro. */
function desenharNumerosDoRoteiro() {
  document.querySelectorAll(".ponto-numero-roteiro").forEach((e) => e.remove());
  const ns = "http://www.w3.org/2000/svg";
  const ordem = roteiroSalvo();

  document.querySelectorAll("#mapa-rj .ponto-turistico").forEach((item) => {
    const chave = chaveDoPonto(item.dataset.municipio, Number(item.dataset.indice));
    const posicao = ordem.indexOf(chave);
    item.classList.toggle("ponto-no-roteiro", posicao >= 0);
    if (posicao < 0) return;

    const grupo = document.createElementNS(ns, "g");
    grupo.setAttribute("class", "ponto-numero-roteiro");
    const fundo = document.createElementNS(ns, "circle");
    fundo.setAttribute("r", 1);
    fundo.setAttribute("class", "ponto-numero-fundo");
    const texto = document.createElementNS(ns, "text");
    texto.setAttribute("class", "ponto-numero-texto");
    texto.setAttribute("text-anchor", "middle");
    texto.setAttribute("dominant-baseline", "central");
    texto.textContent = String(posicao + 1);
    grupo.append(fundo, texto);
    item.appendChild(grupo);
  });
}

/** Barra de baixo do modo: contador e o botão de confirmar. */
function atualizarBarraDoModoMapa() {
  const barra = document.getElementById("barra-modo-roteiro");
  if (!barra) return;
  const total = roteiroSalvo().length;
  document.getElementById("modo-roteiro-contador").textContent =
    total === 0
      ? "Toque nos lugares que quer visitar"
      : `${total} ${total === 1 ? "parada escolhida" : "paradas escolhidas"}`;
  document.getElementById("btn-modo-roteiro-confirmar").disabled = total < 1;
}

/** Chamado pelo clique no ponto quando o modo está ligado. */
function alternarPontoNoMapa(municipioId, indice) {
  alternarPontoNoRoteiro(municipioId, indice);
  desenharNumerosDoRoteiro();
  atualizarBarraDoModoMapa();
}

/** Confirmar leva à lista, onde dá pra reordenar antes de calcular. */
async function confirmarModoMapaRoteiro() {
  sairDoModoMapaRoteiro();
  await abrirMotoclube();
  await abrirFerramentaMotoclube("roteiros");
}

function configurarModoMapaRoteiro() {
  document.getElementById("btn-modo-roteiro-voltar")?.addEventListener("click", () => {
    sairDoModoMapaRoteiro();
  });
  document.getElementById("btn-modo-roteiro-confirmar")?.addEventListener("click", confirmarModoMapaRoteiro);
}

/* ---- A tela de Roteiros ----

   Redesenho: a lista de paradas virou TRAJETO (nó com trilho ligando
   uma à seguinte), os controles de texto ("↑ ↓ ✕") viraram alça de
   arrasto e lixeira em SVG, o <select> nativo de município virou a
   mesma folha de busca que o resto do app já usa, e o checkbox virou
   cartão acionável.

   Os ícones são SVG embutido: o app não carrega biblioteca de ícones, e
   seta/xis em caractere de texto herdam a fonte do sistema -- mudam de
   forma, de peso e de alinhamento vertical de um aparelho pro outro.
   ============================================================ */

const ICONE_ALCA =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>' +
  '<circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>' +
  '<circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

const ICONE_LIXEIRA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>' +
  '<path d="M10 11v6M14 11v6"/></svg>';

const ICONE_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20 6L9 17l-5-5"/></svg>';

const ICONE_PIN_MAPA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

const ICONE_SETA_LISTA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

/* Município aberto no seletor. Vive FORA do DOM porque a tela inteira é
   redesenhada a cada ponto marcado -- guardar o estado no elemento faria
   a pessoa voltar à escolha do município depois de cada toque. */
let municipioDoSeletor = "";

function renderizarRoteiros() {
  const alvo = document.getElementById("roteiro-conteudo");
  if (!alvo) return;
  alvo.innerHTML = "";

  const pontos = pontosDoRoteiro();

  const intro = document.createElement("p");
  intro.className = "roteiro-intro";
  intro.textContent = pontos.length
    ? "Sua viagem, na ordem em que você escolheu. Arraste pela alça pra trocar a ordem."
    : "Monte a viagem escolhendo os lugares direto no mapa ou pela lista aqui embaixo.";
  alvo.appendChild(intro);

  const noMapa = document.createElement("button");
  noMapa.type = "button";
  noMapa.className = "rt-btn-mapa" + (pontos.length ? "" : " rt-btn-mapa-convite");
  noMapa.innerHTML =
    ICONE_PIN_MAPA +
    "<span><strong>Escolher no mapa</strong>" +
    "<small>Toque nos lugares na ordem em que quer visitar</small></span>";
  noMapa.addEventListener("click", entrarNoModoMapaRoteiro);
  alvo.appendChild(noMapa);

  if (pontos.length) alvo.appendChild(linhaDoRoteiro(pontos));
  alvo.appendChild(seletorDePontos());

  // Por último no DOM de propósito: é assim que a barra continua presa
  // no rodapé enquanto a pessoa rola o seletor inteiro.
  alvo.appendChild(barraCalcular(pontos));
}

/** Redesenha compensando a rolagem.

    Marcar um ponto faz a viagem crescer ACIMA dos cartões: sem
    compensar, a lista anda pra baixo do dedo e o toque seguinte cai no
    lugar errado. */
function redesenharRoteiroSemPular() {
  const view = document.getElementById("motoclube-view");
  const antes = document.querySelector(".rt-bloco")?.offsetHeight || 0;
  renderizarRoteiros();
  const depois = document.querySelector(".rt-bloco")?.offsetHeight || 0;
  if (view) view.scrollTop += depois - antes;
}

/** A viagem desenhada como trajeto: nó, trilho e a próxima parada.

    O primeiro nó é VOCÊ, não a primeira parada. É de onde o cálculo
    parte de verdade (ver calcularRoteiro), e uma lista que começa no
    destino escondia justamente o trecho de casa até lá -- foi ele que,
    no teste, fez 223 km virarem 449. */
function linhaDoRoteiro(pontos) {
  const bloco = document.createElement("section");
  bloco.className = "rt-bloco";

  const cabecalho = document.createElement("div");
  cabecalho.className = "rt-cabecalho";
  const titulo = document.createElement("h4");
  titulo.textContent = `Sua viagem · ${pontos.length} ${pontos.length === 1 ? "parada" : "paradas"}`;
  const limpar = document.createElement("button");
  limpar.type = "button";
  limpar.className = "rt-limpar";
  limpar.textContent = "Limpar";
  limpar.addEventListener("click", () => {
    if (!confirm("Tirar todos os pontos do roteiro?")) return;
    gravarRoteiro([]);
    renderizarRoteiros();
  });
  cabecalho.append(titulo, limpar);
  bloco.appendChild(cabecalho);

  const lista = document.createElement("ol");
  lista.className = "rt-linha";
  lista.appendChild(
    paradaDaOrigem("Onde você está", "a viagem começa daqui, se o GPS estiver ligado")
  );

  pontos.forEach((p, i) => {
    const item = document.createElement("li");
    item.className = "rt-parada rt-parada-movel";
    item.dataset.chave = p.chave;

    const no = document.createElement("span");
    no.className = "rt-no";
    no.textContent = String(i + 1);

    const texto = document.createElement("div");
    texto.className = "rt-texto";
    const nome = document.createElement("strong");
    nome.textContent = p.nome;
    const cidade = document.createElement("span");
    cidade.textContent = p.municipio;
    texto.append(nome, cidade);

    const tirar = document.createElement("button");
    tirar.type = "button";
    tirar.className = "rt-acao rt-tirar";
    tirar.innerHTML = ICONE_LIXEIRA;
    tirar.setAttribute("aria-label", `Tirar ${p.nome} do roteiro`);
    tirar.addEventListener("click", () => {
      gravarRoteiro(roteiroSalvo().filter((c) => c !== p.chave));
      redesenharRoteiroSemPular();
    });

    /* A alça é o ÚNICO lugar por onde o arrasto começa: assim o dedo
       continua rolando a tela em qualquer outro ponto do item, e não
       precisa de toque longo pra desambiguar o gesto.

       As setas do teclado funcionam nela também -- quem não consegue
       arrastar não fica sem reordenar, e isso não custa nenhum pixel
       de tela. */
    const alca = document.createElement("button");
    alca.type = "button";
    alca.className = "rt-acao rt-alca";
    alca.innerHTML = ICONE_ALCA;
    alca.dataset.indice = String(i);
    alca.setAttribute(
      "aria-label",
      `Reordenar ${p.nome}: arraste, ou use as setas para cima e para baixo`
    );
    alca.addEventListener("keydown", (evento) => {
      if (evento.key !== "ArrowUp" && evento.key !== "ArrowDown") return;
      evento.preventDefault();
      moverNoRoteiro(i, evento.key === "ArrowUp" ? -1 : 1);
    });

    item.append(no, texto, tirar, alca);
    lista.appendChild(item);
  });

  marcarChegada(lista);
  ligarArrastoDoRoteiro(lista);
  bloco.appendChild(lista);
  return bloco;
}

/** O nó de partida: vazado, sem número e sem ações -- não é parada, é
    de onde se sai. */
function paradaDaOrigem(titulo, detalhe) {
  const item = document.createElement("li");
  item.className = "rt-parada rt-parada-origem";
  const no = document.createElement("span");
  no.className = "rt-no rt-no-origem";
  const texto = document.createElement("div");
  texto.className = "rt-texto";
  const nome = document.createElement("strong");
  nome.textContent = titulo;
  const sub = document.createElement("span");
  sub.textContent = detalhe;
  texto.append(nome, sub);
  item.append(no, texto);
  return item;
}

/** Anel no último nó: dá pra ver onde a viagem termina sem ler a lista. */
function marcarChegada(lista) {
  const itens = [...lista.querySelectorAll(".rt-parada:not(.rt-parada-origem)")];
  itens.forEach((li, i) => li.classList.toggle("rt-parada-fim", i === itens.length - 1));
}

/* Arrasto por Pointer Events: cobre dedo, mouse e caneta com o mesmo
   código, e o setPointerCapture mantém o item seguindo o dedo mesmo
   quando ele escapa de cima do elemento. O drag-and-drop nativo do HTML5
   não serve aqui -- em toque ele simplesmente não dispara. */
function ligarArrastoDoRoteiro(lista) {
  lista.querySelectorAll(".rt-alca").forEach((alca) => {
    alca.addEventListener("pointerdown", (evento) => {
      const item = alca.closest(".rt-parada-movel");
      if (!item || evento.button > 0) return;
      evento.preventDefault();

      let referenciaY = evento.clientY;
      alca.setPointerCapture?.(evento.pointerId);
      item.classList.add("rt-arrastando");
      lista.classList.add("rt-linha-arrastando");

      const mover = (ev) => {
        item.style.transform = `translateY(${ev.clientY - referenciaY}px)`;

        const vizinho = vizinhoSobODedo(lista, item, ev.clientY);
        if (!vizinho) return;
        lista.insertBefore(item, vizinho.antes ? vizinho.alvo : vizinho.alvo.nextSibling);
        /* Depois da troca o item já está fisicamente sob o dedo: zerar a
           referência aqui evita que ele ande o dobro da distância. */
        referenciaY = ev.clientY;
        item.style.transform = "";
        renumerarLinha(lista);
      };

      const soltar = () => {
        alca.removeEventListener("pointermove", mover);
        alca.removeEventListener("pointerup", soltar);
        alca.removeEventListener("pointercancel", soltar);
        item.style.transform = "";
        item.classList.remove("rt-arrastando");
        lista.classList.remove("rt-linha-arrastando");
        gravarRoteiro([...lista.querySelectorAll(".rt-parada-movel")].map((li) => li.dataset.chave));
        renderizarRoteiros();
      };

      alca.addEventListener("pointermove", mover);
      alca.addEventListener("pointerup", soltar);
      alca.addEventListener("pointercancel", soltar);
    });
  });
}

/** Item cuja metade o dedo cruzou, e de que lado entrar. */
function vizinhoSobODedo(lista, item, y) {
  for (const alvo of lista.querySelectorAll(".rt-parada-movel")) {
    if (alvo === item) continue;
    const caixa = alvo.getBoundingClientRect();
    if (y < caixa.top || y > caixa.bottom) continue;
    return { alvo, antes: y < caixa.top + caixa.height / 2 };
  }
  return null;
}

/** Os números SÃO a ordem da viagem: se não acompanharem o arrasto, a
    tela mostra uma ordem e o cálculo usa outra. */
function renumerarLinha(lista) {
  const itens = [...lista.querySelectorAll(".rt-parada-movel")];
  itens.forEach((li, i) => {
    const no = li.querySelector(".rt-no");
    if (no) no.textContent = String(i + 1);
  });
  marcarChegada(lista);
}

function moverNoRoteiro(indice, delta) {
  const lista = roteiroSalvo();
  const destino = indice + delta;
  if (destino < 0 || destino >= lista.length) return;
  [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
  gravarRoteiro(lista);
  renderizarRoteiros();
  /* Redesenhar joga o foco fora da alça, e sem devolvê-lo a segunda
     seta do teclado não teria onde cair -- reordenar por teclado
     pararia no primeiro passo. */
  document.querySelector(`.rt-alca[data-indice="${destino}"]`)?.focus();
}

/** Barra fixa no rodapé: com 20 paradas, rolar até o fim só pra achar o
    botão é trabalho que a tela pode poupar. */
function barraCalcular(pontos) {
  const barra = document.createElement("div");
  barra.className = "rt-barra";

  if (pontos.length < 2) {
    const dica = document.createElement("p");
    dica.className = "rt-barra-dica";
    dica.textContent = pontos.length
      ? "Falta mais um ponto pra calcular distância, tempo e combustível."
      : "Escolha pelo menos dois pontos pra calcular a viagem.";
    barra.appendChild(dica);
    return barra;
  }

  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "rt-calcular";
  botao.innerHTML = `<strong>Calcular viagem</strong><small>${pontos.length} paradas</small>`;
  botao.addEventListener("click", () => calcularRoteiro(pontos));
  barra.appendChild(botao);
  return barra;
}

/** Seletor pra montar do zero: escolhe o município, marca os lugares. */
function seletorDePontos() {
  const caixa = document.createElement("section");
  caixa.className = "rt-seletor";

  const titulo = document.createElement("h4");
  titulo.textContent = "Adicionar pontos";
  caixa.appendChild(titulo);

  const escolhido = destinosPorMunicipio[municipioDoSeletor];

  /* Gatilho no lugar do <select>: 85 municípios num seletor nativo
     viram a roda do sistema operacional -- fora do tema, e longa demais
     pra achar um nome. O toque abre a MESMA folha de busca que o resto
     do app já usa; um segundo componente de busca só pra esta tela
     seria markup, CSS e bug em dobro. */
  const gatilho = document.createElement("button");
  gatilho.type = "button";
  gatilho.className = "rt-gatilho";
  gatilho.innerHTML =
    ICONE_PIN_MAPA +
    `<span>${escaparHtml(escolhido ? escolhido.nome : "Escolher município")}</span>` +
    ICONE_SETA_LISTA;
  gatilho.addEventListener("click", () => {
    abrirEscolherMunicipio({
      selecionado: municipioDoSeletor || null,
      // Só municípios que TÊM ponto navegável: oferecer os outros
      // levaria a uma lista vazia depois do clique.
      filtro: (id) => pontosNavegaveisDoMunicipio(id).length > 0,
      aoEscolher: (id) => {
        municipioDoSeletor = id || "";
        renderizarRoteiros();
      },
    });
  });
  caixa.appendChild(gatilho);

  if (escolhido) caixa.appendChild(cartoesDePontos(municipioDoSeletor));
  else
    caixa.appendChild(
      dicaRoteiro("Escolha um município pra ver os lugares que dá pra incluir na viagem.")
    );

  return caixa;
}

/** Cartão acionável no lugar do checkbox.

    O quadradinho nativo tem ~13 px de alvo e vem com a cara do sistema.
    O input continua no DOM, só invisível: é ele que dá o estado ao
    leitor de tela e o foco pelo teclado -- sumir com ele trocaria
    acessibilidade por aparência. */
function cartoesDePontos(municipioId) {
  const grade = document.createElement("div");
  grade.className = "rt-cartoes";

  pontosNavegaveisDoMunicipio(municipioId).forEach(({ ponto, indice }) => {
    const cartao = document.createElement("label");
    cartao.className = "rt-cartao";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "rt-cartao-check";
    check.checked = estaNoRoteiro(municipioId, indice);
    cartao.classList.toggle("rt-cartao-ativo", check.checked);

    const nome = document.createElement("span");
    nome.className = "rt-cartao-nome";
    nome.textContent = ponto.nome;

    const marca = document.createElement("span");
    marca.className = "rt-cartao-marca";
    marca.innerHTML = ICONE_CHECK;

    check.addEventListener("change", () => {
      alternarPontoNoRoteiro(municipioId, indice);
      // Pinta na hora: o redesenho vem logo em seguida, mas o retorno
      // do toque não pode esperar por ele.
      cartao.classList.toggle("rt-cartao-ativo", check.checked);
      redesenharRoteiroSemPular();
    });

    cartao.append(check, nome, marca);
    grade.appendChild(cartao);
  });

  return grade;
}

/** Pontos de um município que dá pra navegar (têm lat/lon). */
function pontosNavegaveisDoMunicipio(municipioId) {
  const municipio = destinosPorMunicipio[municipioId];
  if (!municipio?.destinos) return [];
  return municipio.destinos
    .map((ponto, indice) => ({ ponto, indice }))
    .filter(({ ponto }) => typeof ponto.lat === "number" && typeof ponto.lon === "number");
}

/** Mede e desenha a viagem montada. Só muda a ENTRADA em relação ao que
    havia antes: os pontos vêm da escolha da pessoa, não de uma rota. */
async function calcularRoteiro(pontos) {
  const alvo = document.getElementById("roteiro-conteudo");
  if (!alvo || pontos.length < 2) return;

  alvo.innerHTML = '<div class="spinner spinner-grande"></div>';

  /* A viagem começa ONDE A PESSOA ESTÁ, não no primeiro ponto: ninguém
     nasce no destino, e sem isso o km ignorava justamente o trecho de
     casa até lá. Se o GPS negar ou falhar, segue do primeiro ponto e a
     tela diz isso -- pedir permissão de novo no meio do cálculo seria
     pior que entregar o número menor com aviso. */
  let origem = null;
  try {
    const { lat, lon } = await obterLocalizacaoAtual();
    origem = { lat, lon, nome: "Sua posição atual", municipio: "início da viagem", origem: true };
  } catch (erro) {
    console.warn("Sem localização; roteiro começa no primeiro ponto:", erro?.message);
  }
  const trajeto = origem ? [origem, ...pontos] : pontos;

  let medida;
  try {
    medida = await medirTrajetoOsrm(trajeto);
  } catch (erro) {
    console.error("OSRM indisponível, caindo na linha reta:", erro);
    medida = medirTrajetoEmLinhaReta(trajeto);
  }

  // Ponto que o OSRM arrastou pra longe não tem acesso por estrada.
  const semEstrada = new Set();
  medida.desvios.forEach((km, i) => {
    if (km > LIMITE_DESVIO_KM) semEstrada.add(i);
  });
  const navegaveis = trajeto.filter((_, i) => !semEstrada.has(i));

  /* Sai da MEDIÇÃO, não só da navegação: o desvio inventado até a
     estrada mais próxima já tinha entrado no total e viraria
     combustível que ninguém vai gastar. */
  if (semEstrada.size && navegaveis.length >= 2) {
    try {
      medida = await medirTrajetoOsrm(navegaveis);
    } catch (erro) {
      console.error("Falha ao remedir sem os pontos isolados:", erro);
    }
  } else if (semEstrada.size && navegaveis.length < 2) {
    /* Tirando os isolados não sobra trajeto. Mostrar o número de antes
       seria mostrar o desvio FANTASMA como se fosse viagem: no teste, um
       roteiro de dois pontos onde um era a Ilha Grande exibia 357 km, e
       357 km de estrada até uma ilha não existem. */
    alvo.innerHTML = "";
    const voltar = document.createElement("button");
    voltar.type = "button";
    voltar.className = "roteiro-voltar";
    voltar.textContent = "← Mudar os pontos";
    voltar.addEventListener("click", renderizarRoteiros);
    alvo.appendChild(voltar);
    alvo.appendChild(
      dicaRoteiro(
        "Os lugares escolhidos não têm acesso por estrada (ilha ou trilha), então não dá pra traçar " +
          "um trajeto de moto entre eles. Escolha pelo menos dois pontos que a estrada alcance."
      )
    );
    return;
  }

  alvo.innerHTML = "";

  const voltar = document.createElement("button");
  voltar.type = "button";
  voltar.className = "roteiro-voltar";
  voltar.textContent = "← Mudar os pontos";
  voltar.addEventListener("click", renderizarRoteiros);
  alvo.appendChild(voltar);

  alvo.appendChild(avisoRoteiroEmTestes(!medida.real));
  alvo.appendChild(
    dicaRoteiro(
      origem
        ? "A conta parte de onde você está agora até a última parada."
        : "Sem acesso à sua localização, a conta parte do primeiro ponto da lista — o trecho de casa até lá não entra."
    )
  );

  const moto = garagemMotos.find((m) => m.id === garagemMotoAtivaId) || garagemMotos[0];
  const litros = litrosEstimados(medida.km, moto);

  const grade = document.createElement("div");
  grade.className = "roteiro-numeros";
  const cartao = (valor, rotulo) => {
    const c = document.createElement("div");
    c.className = "roteiro-numero";
    const v = document.createElement("strong");
    v.textContent = valor;
    const r = document.createElement("small");
    r.textContent = rotulo;
    c.append(v, r);
    return c;
  };
  grade.appendChild(cartao(`~${Math.round(medida.km)} km`, "distância estimada"));
  grade.appendChild(cartao(`≈ ${formatarDuracao(medida.minutos)}`, "tempo estimado"));
  grade.appendChild(cartao(textoLitros(litros), "combustível estimado"));
  alvo.appendChild(grade);

  if (!moto) {
    alvo.appendChild(dicaRoteiro("Cadastre uma moto na Garagem pra estimar o combustível."));
  } else if (Number(moto.consumoKmL) > 0) {
    alvo.appendChild(dicaRoteiro(`Calculado com o consumo que você informou: ${moto.consumoKmL} km/l.`));
  } else if (litros) {
    alvo.appendChild(
      dicaRoteiro(
        `Faixa estimada pela cilindrada (${litros.cc} cc). Consumo real muda bastante com pilotagem, ` +
          `carga e serra — informe o seu na Garagem pra fechar a conta.`
      )
    );
  } else {
    alvo.appendChild(
      dicaRoteiro(
        `Não deu pra deduzir a cilindrada de "${moto.modelo || "sua moto"}", então o combustível fica em ` +
          `branco. Informe o consumo (km/l) na Garagem.`
      )
    );
  }

  if (semEstrada.size) {
    alvo.appendChild(
      dicaRoteiro(
        `${semEstrada.size} ${semEstrada.size === 1 ? "ponto ficou" : "pontos ficaram"} fora da conta por não ` +
          `ter acesso por estrada (ilha, trilha). ${semEstrada.size === 1 ? "Ele continua" : "Eles continuam"} na lista abaixo.`
      )
    );
  }

  const trechos = trechosDoRoteiro(navegaveis);
  const acoes = document.createElement("div");
  acoes.className = "roteiro-acoes";
  trechos.forEach((trecho, i) => {
    const link = document.createElement("a");
    link.className = "roteiro-btn-maps";
    link.href = urlGoogleMaps(trecho);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = trechos.length > 1 ? `Abrir trecho ${i + 1} no Google Maps` : "Abrir no Google Maps";
    acoes.appendChild(link);
  });
  if (trechos.length > 1) {
    acoes.appendChild(
      dicaRoteiro("O Google Maps aceita no máximo 9 paradas por link, então a viagem foi dividida em trechos.")
    );
  }
  alvo.appendChild(acoes);

  /* O mesmo trajeto desenhado do planejador, agora só de leitura. O nó
     vazado é de onde a viagem parte: você, quando o GPS respondeu. */
  const lista = document.createElement("ol");
  lista.className = "rt-linha";
  if (origem) lista.appendChild(paradaDaOrigem("Sua posição atual", "de onde a conta parte"));

  let ordem = 0;
  trajeto.forEach((p, i) => {
    if (p.origem) return;
    ordem += 1;
    const item = document.createElement("li");
    item.className = "rt-parada";
    const no = document.createElement("span");
    no.className = "rt-no";
    no.textContent = String(ordem);
    const texto = document.createElement("div");
    texto.className = "rt-texto";
    const nome = document.createElement("strong");
    nome.textContent = p.nome;
    const cidade = document.createElement("span");
    cidade.textContent = p.municipio;
    texto.append(nome, cidade);
    item.append(no, texto);

    if (semEstrada.has(i)) {
      const aviso = document.createElement("span");
      aviso.className = "roteiro-ponto-sem-estrada";
      aviso.textContent = "sem acesso por estrada";
      item.appendChild(aviso);
    } else {
      const waze = document.createElement("a");
      waze.className = "roteiro-btn-waze";
      waze.href = urlWaze(p);
      waze.target = "_blank";
      waze.rel = "noopener noreferrer";
      waze.textContent = "Waze";
      item.appendChild(waze);
    }
    lista.appendChild(item);
  });
  marcarChegada(lista);
  alvo.appendChild(lista);
}

function dicaRoteiro(texto) {
  const p = document.createElement("p");
  p.className = "roteiro-dica";
  p.textContent = texto;
  return p;
}


/* ---- Motoclube como TELA, não modal ----

   Era um painel sobreposto ao mapa. Virou uma view irmã do
   #mapa-viewport, e as duas se revezam: entrar no Motoclube esconde o
   mapa de verdade, em vez de empilhar por cima dele.

   Duas saídas de propósito (a barra inferior não tem mais botão
   "Mapa" -- ele saiu porque o mapa é o fundo da tela): a seta do header
   e tocar de novo em "Motoclube". Quem procura a seta acha; quem tenta
   o botão também. */

let ferramentaMotoclubeAberta = null;

function motoclubeEstaAberto() {
  return !document.getElementById("motoclube-view")?.classList.contains("oculto");
}

function mostrarViewMotoclube(mostrar) {
  const view = document.getElementById("motoclube-view");
  const mapa = document.getElementById("mapa-viewport");
  if (!view || !mapa) return;
  view.classList.toggle("oculto", !mostrar);
  mapa.classList.toggle("oculto", mostrar);
  // Os flutuantes do mapa (bússola, Modo Viagem, dica) não fazem
  // sentido sobre o painel -- e a barra inferior continua, porque é
  // por ela que se troca de tela.
  document.body.classList.toggle("em-motoclube", mostrar);
  if (mostrar) view.scrollTop = 0;
}

/** Mostra o grid de cards e esconde os painéis (nível de cima da tela). */
function voltarAoPainelMotoclube() {
  ferramentaMotoclubeAberta = null;
  document.getElementById("motoclube-cards")?.classList.remove("oculto");
  // A carteirinha e da tela inicial: com uma ferramenta aberta ela
  // reaparecia por cima do conteudo dela (era esse o "cartao dentro da
  // area de apoio").
  document.getElementById("motoclube-meu-grupo")?.classList.remove("oculto");
  document.getElementById("motoclube-pitch")?.classList.toggle("oculto", souMembroMotoclube());
  ["garagem", "apoio", "roteiros"].forEach((nome) => {
    document.getElementById(`mc-painel-${nome}`)?.classList.add("oculto");
  });
}

/** Abre a ferramenta de um card, no lugar do grid. */
async function abrirFerramentaMotoclube(nome) {
  if (!souMembroMotoclube()) {
    abrirPaywallMotoclube();
    return;
  }
  ferramentaMotoclubeAberta = nome;
  document.getElementById("motoclube-cards")?.classList.add("oculto");
  document.getElementById("motoclube-meu-grupo")?.classList.add("oculto");
  document.getElementById("motoclube-pitch")?.classList.add("oculto");
  ["garagem", "apoio", "roteiros"].forEach((n) => {
    document.getElementById(`mc-painel-${n}`)?.classList.toggle("oculto", n !== nome);
  });

  if (nome === "garagem") {
    garagemMotosCarregadas = false;
    await carregarMotosGaragem();
  } else if (nome === "apoio") {
    await carregarLojasMotoclube();
  } else if (nome === "roteiros") {
    renderizarRoteiros();
  }
}

/** A seta do header: volta ao grid se houver painel aberto, senão ao mapa. */
function voltarDoMotoclube() {
  if (ferramentaMotoclubeAberta) voltarAoPainelMotoclube();
  else fecharMotoclube();
}

/** Reflete o estado do Modo Viagem no interruptor do card. */
function sincronizarToggleViagem() {
  const check = document.getElementById("check-modo-viagem");
  const rotulo = document.getElementById("rotulo-modo-viagem");
  if (check) check.checked = viagemAtiva;
  if (rotulo) rotulo.textContent = viagemAtiva ? "Ligado" : "Desligado";
}

function configurarViewMotoclube() {
  document.getElementById("btn-voltar-motoclube")?.addEventListener("click", voltarDoMotoclube);
  configurarModoMapaRoteiro();

  document.querySelectorAll("#motoclube-cards .mc-card").forEach((card) => {
    const ferramenta = card.dataset.ferramenta;
    if (ferramenta === "viagem") return; // tem interruptor próprio
    card.addEventListener("click", () => {
      if (ferramenta === "offline") {
        if (!souMembroMotoclube()) return abrirPaywallMotoclube();
        // O download offline já mora em Configurações; o card é atalho.
        document.getElementById("btn-baixar-offline")?.click();
        return;
      }
      abrirFerramentaMotoclube(ferramenta);
    });
  });

  document.getElementById("check-modo-viagem")?.addEventListener("change", async (e) => {
    if (!souMembroMotoclube()) {
      e.target.checked = false;
      abrirPaywallMotoclube();
      return;
    }
    if (e.target.checked) await iniciarModoViagem();
    else await pararModoViagem();
    sincronizarToggleViagem();
  });

  document.getElementById("btn-motoclube-assinar")?.addEventListener("click", abrirPaywallMotoclube);
}

function fecharMotoclube() {
  mostrarViewMotoclube(false);
  ferramentaMotoclubeAberta = null;
}

/** Filtra itensMotoclubeCache por marca (select) e modelo (texto livre,
 * "contains" case-insensitive) e renderiza a lista -- tudo no cliente,
 * sem rebuscar o Firestore a cada troca de filtro. */
function renderizarListaMotoclube() {
  const marcaFiltro = document.getElementById("select-motoclube-marca").value;
  const modeloFiltro = document.getElementById("input-motoclube-modelo").value.trim().toLowerCase();

  const filtrados = itensMotoclubeCache.filter((item) => {
    if (marcaFiltro && !(item.marcas || []).includes(marcaFiltro)) return false;
    if (modeloFiltro && !(item.modelos || "").toLowerCase().includes(modeloFiltro)) return false;
    return true;
  });

  const lista = document.getElementById("motoclube-lista");
  lista.innerHTML = "";
  if (!filtrados.length) {
    const vazio = document.createElement("p");
    vazio.id = "motoclube-lista-vazio";
    vazio.textContent = itensMotoclubeCache.length
      ? "Nenhum resultado com esse filtro."
      : "Ninguém cadastrou nada ainda. Que tal ser o primeiro?";
    lista.appendChild(vazio);
    return;
  }
  filtrados.forEach((item) => lista.appendChild(montarCardMotoclube(item)));
}

function montarCardMotoclube(item) {
  const meuUid = window.raspadinhaAuth?.usuarioAtual?.uid;
  const souAutor = item.autorUid === meuUid;
  const curtido = (item.curtidoPor || []).includes(meuUid);

  const card = document.createElement("div");
  card.className = "motoclube-card";
  card.innerHTML = `
    <div class="motoclube-card-topo">
      <div>
        <p class="motoclube-card-nome">${escaparHtml(item.nome)}</p>
        <span class="motoclube-card-categoria">${escaparHtml(LABEL_CATEGORIA_MOTOCLUBE[item.categoria] || item.categoria)}</span>
      </div>
    </div>
    ${item.marcas?.length ? `<p class="motoclube-card-marcas">🏍️ ${item.marcas.map(escaparHtml).join(", ")}</p>` : ""}
    ${item.modelos ? `<p class="motoclube-card-modelos">${escaparHtml(item.modelos)}</p>` : ""}
    ${item.descricao ? `<p class="motoclube-card-descricao">${escaparHtml(item.descricao)}</p>` : ""}
    ${item.fotoUrl ? `<img class="motoclube-card-foto" alt="${escaparHtml(item.nome)}">` : ""}
    ${item.linkMaps ? `<a class="motoclube-card-maps" href="${escaparHtml(item.linkMaps)}" target="_blank" rel="noopener">📍 Abrir no Maps</a>` : ""}
    <div class="motoclube-card-acoes">
      <button type="button" class="motoclube-card-curtir${curtido ? " curtido" : ""}">${ICONE_CORACAO} <span>${(item.curtidoPor || []).length}</span></button>
      ${souAutor ? '<button type="button" class="motoclube-card-excluir">🗑️ Excluir</button>' : ""}
    </div>
  `;

  // O src sai depois do innerHTML pra passar pela cadeia de fallback do
  // Drive (ver aplicarFotoComFallback).
  if (item.fotoUrl) aplicarFotoComFallback(card.querySelector(".motoclube-card-foto"), item.fotoUrl);

  card.querySelector(".motoclube-card-curtir").addEventListener("click", () => aoCurtirItemMotoclube(item, card));
  card.querySelector(".motoclube-card-excluir")?.addEventListener("click", () => excluirItemMotoclubeAtual(item, card));

  return card;
}

async function aoCurtirItemMotoclube(item, card) {
  const meuUid = window.raspadinhaAuth?.usuarioAtual?.uid;
  const botao = card.querySelector(".motoclube-card-curtir");
  const contador = botao.querySelector("span");
  const jaCurtido = botao.classList.contains("curtido");
  const novoEstado = !jaCurtido;

  botao.classList.toggle("curtido", novoEstado);
  contador.textContent = Number(contador.textContent) + (novoEstado ? 1 : -1);
  if (novoEstado) dispararPopCoracao(botao);

  try {
    await window.raspadinhaAuth.curtirItemMotoclube(item.id, novoEstado);
    item.curtidoPor = novoEstado
      ? [...(item.curtidoPor || []), meuUid]
      : (item.curtidoPor || []).filter((uid) => uid !== meuUid);
  } catch (erro) {
    console.error("Falha ao curtir item do Motoclube:", erro);
    botao.classList.toggle("curtido", jaCurtido);
    contador.textContent = Number(contador.textContent) + (novoEstado ? -1 : 1);
  }
}

async function excluirItemMotoclubeAtual(item, card) {
  if (!confirm(`Excluir "${item.nome}" do Motoclube?`)) return;
  try {
    await window.raspadinhaAuth.excluirItemMotoclube(item.id);
    itensMotoclubeCache = itensMotoclubeCache.filter((i) => i.id !== item.id);
    card.remove();
  } catch (erro) {
    alert("Não foi possível excluir agora.");
  }
}

function abrirFormMotoclube() {
  popularFormulariosMotoclubeSeNecessario();
  document.getElementById("input-motoclube-nome").value = "";
  document.getElementById("select-motoclube-categoria").selectedIndex = 0;
  document.querySelectorAll("#motoclube-form-marcas input").forEach((c) => {
    c.checked = false;
    c.closest(".motoclube-marca-chip")?.classList.remove("chip-marcado");
  });
  document.getElementById("input-motoclube-modelos").value = "";
  document.getElementById("input-motoclube-descricao").value = "";
  document.getElementById("input-motoclube-linkmaps").value = "";
  document.getElementById("input-motoclube-foto").value = "";
  document.getElementById("motoclube-form-erro").classList.add("oculto");
  fecharMotoclube();
  document.getElementById("modal-motoclube-form").classList.remove("oculto");
}

function fecharFormMotoclube() {
  document.getElementById("modal-motoclube-form").classList.add("oculto");
}

async function salvarItemMotoclube() {
  const erroEl = document.getElementById("motoclube-form-erro");
  erroEl.classList.add("oculto");

  const nome = document.getElementById("input-motoclube-nome").value;
  const categoria = document.getElementById("select-motoclube-categoria").value;
  const marcas = Array.from(document.querySelectorAll("#motoclube-form-marcas input:checked")).map((c) => c.value);
  const modelos = document.getElementById("input-motoclube-modelos").value;
  const descricao = document.getElementById("input-motoclube-descricao").value;
  const linkMaps = document.getElementById("input-motoclube-linkmaps").value;
  const arquivoFoto = document.getElementById("input-motoclube-foto").files[0] || null;

  const botao = document.getElementById("btn-salvar-motoclube");
  botao.disabled = true;
  botao.textContent = "Salvando...";
  try {
    await window.raspadinhaAuth.criarItemMotoclube({
      arquivoFoto, nome, categoria, marcas, modelos, descricao, linkMaps,
    });
    fecharFormMotoclube();
    abrirMotoclube();
  } catch (erro) {
    erroEl.textContent = erro.message || "Não foi possível salvar agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar";
  }
}

/** Cartão simples (canvas) representando a rota, usado como "foto" ao
 * compartilhar a rota como post na comunidade (ver compartilharRotaPersonalizada). */
async function gerarCartaoRotaPersonalizada(rota) {
  const largura = 600;
  const altura = 400;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");

  const gradiente = ctx.createLinearGradient(0, 0, 0, altura);
  gradiente.addColorStop(0, "#1e293b");
  gradiente.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, largura, altura);

  ctx.textAlign = "center";
  ctx.fillStyle = "#2BD576";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText("🗺️ ROTA PERSONALIZADA", largura / 2, 70);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 36px system-ui, sans-serif";
  quebrarTextoEmLinhas(ctx, rota.nome, 130, largura * 0.8, 44).forEach((linha) => {
    ctx.fillText(linha.texto, largura / 2, linha.y);
  });

  ctx.font = "600 22px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`${rota.municipios.length} municípios`, largura / 2, 250);

  ctx.font = "18px system-ui, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText("Desbrava · raspe o mapa do Rio de Janeiro", largura / 2, altura - 30);

  return canvas.toDataURL("image/png");
}

/**
 * Gera um "selo" temporário (data URL de um canvas) com o nome do
 * município (ou região), enquanto os selos ilustrados de verdade
 * não existem. A cor é derivada do id para variar entre eles.
 * `tamanho` é maior para o mega-selo de região (ver abrirPopupRegiao).
 */
/* ============ COR DETERMINÍSTICA DO SELO ============
 *
 * O MESMO nome dá SEMPRE a mesma cor: "Cordeiro" é sempre o mesmo azul,
 * em qualquer tela e em qualquer aparelho. Isso importa porque o selo
 * dinâmico é o rosto de 49 dos 92 municípios (só 43 têm arte pronta) --
 * se a cor mudasse a cada render, o usuário nunca reconheceria o
 * "selo do Cordeiro", e a coleção pareceria aleatória.
 *
 * Hasheia o NOME, não o id: nome é o que a pessoa vê e lembra.
 */
function hashDoNome(nome) {
  let h = 2166136261; // FNV-1a: espalha melhor que o (h*31) pra textos curtos
  const texto = String(nome || "");
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Cor de fundo do selo + a cor de texto que se lê melhor sobre ela.
 *
 * A escolha do texto NÃO é chutada: calcula a luminância relativa da
 * cor (fórmula do WCAG, com a correção de gama) e compara o contraste
 * contra branco e contra preto, ficando com o maior. É por isso que um
 * selo amarelo vem com letra preta e um azul-marinho com letra branca,
 * sem ninguém ter que catalogar exceção.
 */
function corDoSelo(nome) {
  const hash = hashDoNome(nome);

  /* Matiz livre (0-359), mas saturação e luminosidade em faixa ESTREITA
     de propósito. Soltas, saíam selos quase pretos e outros lavados, e
     a coleção perdia a unidade -- o dourado da borda é o que amarra
     tudo, e ele só funciona sobre um fundo de peso parecido. */
  const matiz = hash % 360;
  const saturacao = 42 + ((hash >>> 9) % 26); // 42-67%
  const luz = 30 + ((hash >>> 17) % 26); // 30-55%

  const { r, g, b } = hslParaRgb(matiz, saturacao, luz);
  const hex =
    "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

  // Luminância relativa (WCAG 2.x): canal linearizado e depois pesado
  // pela sensibilidade do olho a cada cor (o verde pesa 71%).
  const canal = (v) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

  const contrasteComBranco = 1.05 / (luminancia + 0.05);
  const contrasteComPreto = (luminancia + 0.05) / 0.05;
  const texto = contrasteComBranco >= contrasteComPreto ? "#FFFFFF" : "#101418";

  return { fundo: hex, texto, matiz, saturacao, luz };
}

/** HSL (0-360, 0-100, 0-100) -> RGB 0-255. */
function hslParaRgb(h, s, l) {
  const sat = s / 100;
  const luz = l / 100;
  const c = (1 - Math.abs(2 * luz - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = luz - c / 2;
  const faixa = Math.floor(h / 60) % 6;
  const [r1, g1, b1] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][faixa];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/* Dourado da borda -- o MESMO em todos os selos, com ou sem arte.
   É ele que faz o selo gerado parecer da mesma coleção que os
   ilustrados, em vez de um cartão qualquer com o nome escrito. */
const OURO_CLARO = "#F7E7A6";
const OURO = "#D4AF37";
const OURO_ESCURO = "#8A6B15";

/**
 * Selo dinâmico para quem ainda não tem arte: círculo com borda
 * dourada, fundo na cor determinística do nome e o nome centralizado
 * em até 3 linhas.
 *
 * Devolve um data URL de canvas -- o mesmo formato que a arte real,
 * então quem chama (resolverImagemColorida) não distingue os dois e
 * nenhum outro lugar do app precisou mudar.
 *
 * `brilhante` troca o fundo pelo degradê dourado: é o selo raspado com
 * sorte, e ele precisa se parecer com o dourado real dos ilustrados.
 */
/**
 * CAPA raspável do selo dinâmico -- o equivalente ao `{id}fundo.webp`
 * da arte real.
 *
 * Sem isto, município sem arte caía na capa cinza genérica da
 * raspadinha: raspar não revelava nada reconhecível, só um cinza
 * virando cor. Agora a capa é o MESMO selo em preto e branco, então o
 * desenho aparece "ganhando cor" conforme o dedo passa.
 *
 * É desenhada pela mesma função do colorido, só trocando a paleta --
 * e é isso que garante alinhamento pixel a pixel. Redesenhar por outro
 * caminho traria o mesmo risco que o comentário do
 * tools/gerar-fundo-selos.js descreve: capa e selo revelado não
 * baterem.
 */
function gerarCapaPlaceholder(id, nome, tamanho = 260) {
  return gerarSeloPlaceholder(id, nome, tamanho, false, true);
}

function gerarSeloPlaceholder(id, nome, tamanho = 260, brilhante = false, capa = false) {
  /* Renderiza em resolução de DISPOSITIVO e reduz por CSS. Sem isso o
     selo sai borrado em tela retina -- foi a mesma lição da raspadinha
     (ver js/scratch-card.js). Teto de 3 pra não gerar canvas gigante
     em aparelho topo de linha. */
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(tamanho * dpr);
  canvas.height = Math.round(tamanho * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const centro = tamanho / 2;
  const raio = tamanho * 0.47;
  const { fundo, texto } = corDoSelo(nome);

  // ---- Miolo ----
  if (capa) {
    /* Preto e branco com a MESMA estrutura de luz do colorido: o cinza
       sai da luminancia da cor real, entao selo escuro tem capa escura
       e selo claro tem capa clara. Escala fixa deixaria todos iguais e
       a raspagem perderia a graca. */
    const cinza = cinzaDaCor(fundo);
    const g2 = ctx.createLinearGradient(0, 0, 0, tamanho);
    g2.addColorStop(0, clarear(cinza, 10));
    g2.addColorStop(1, clarear(cinza, -12));
    ctx.fillStyle = g2;
  } else if (brilhante) {
    const brilho = ctx.createLinearGradient(0, 0, tamanho, tamanho);
    brilho.addColorStop(0, "#F9EFC0");
    brilho.addColorStop(0.45, OURO);
    brilho.addColorStop(0.75, "#B8891C");
    brilho.addColorStop(1, "#F2DE95");
    ctx.fillStyle = brilho;
  } else {
    // Degradê sutil na cor do nome: dá volume sem virar outra cor.
    const g = ctx.createLinearGradient(0, 0, 0, tamanho);
    g.addColorStop(0, clarear(fundo, 12));
    g.addColorStop(1, clarear(fundo, -14));
    ctx.fillStyle = g;
  }
  ctx.beginPath();
  ctx.arc(centro, centro, raio, 0, Math.PI * 2);
  ctx.fill();

  // ---- Borda dourada (3 anéis: claro/ouro/escuro dá relevo) ----
  const anel = (raioAnel, cor, espessura) => {
    ctx.beginPath();
    ctx.arc(centro, centro, raioAnel, 0, Math.PI * 2);
    ctx.strokeStyle = cor;
    ctx.lineWidth = espessura;
    ctx.stroke();
  };
  /* Moldura em PRATA na capa: o ouro so aparece quando a pessoa raspa.
     E a recompensa visual da raspagem -- se a capa ja fosse dourada,
     revelar nao mudaria a moldura. */
  anel(raio, capa ? "#3E444C" : OURO_ESCURO, tamanho * 0.035);
  anel(raio - tamanho * 0.012, capa ? "#8C949E" : OURO, tamanho * 0.022);
  anel(raio - tamanho * 0.026, capa ? "#C9CFD6" : OURO_CLARO, tamanho * 0.008);
  // Fio fino por dentro, separando a moldura do miolo.
  anel(raio - tamanho * 0.052, "rgba(255,255,255,0.22)", tamanho * 0.004);

  // ---- Nome ----
  const corTexto = capa ? textoSobreCinza(fundo) : brilhante ? "#3A2C05" : texto;
  ctx.fillStyle = corTexto;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  /* Fonte que ENCOLHE conforme o nome cresce: "Rio" pede letra grande,
     "São Francisco de Itabapoana" pede pequena. Sem isso, ou o nome
     curto fica minúsculo ou o comprido estoura o círculo. */
  const linhasMaximas = 3;
  const larguraUtil = raio * 1.42; // corda segura dentro do círculo
  let fonte = Math.round(tamanho * 0.13);
  let linhas = [];
  while (fonte > tamanho * 0.055) {
    ctx.font = `700 ${fonte}px system-ui, -apple-system, sans-serif`;
    linhas = quebrarEmLinhas(ctx, nome, larguraUtil, linhasMaximas);
    if (linhas.cabe) break;
    fonte -= 2;
  }
  ctx.font = `700 ${fonte}px system-ui, -apple-system, sans-serif`;

  const alturaLinha = fonte * 1.15;
  const alturaBloco = alturaLinha * linhas.length;
  const yInicial = centro - alturaBloco / 2 + alturaLinha / 2;

  // Sombra leve: garante leitura mesmo se a cor cair perto do limite.
  ctx.shadowColor = corTexto === "#FFFFFF" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.35)";
  ctx.shadowBlur = Math.max(2, tamanho * 0.012);
  linhas.forEach((linha, i) => {
    ctx.fillText(linha, centro, yInicial + i * alturaLinha);
  });
  ctx.shadowBlur = 0;

  return canvas.toDataURL();
}

/**
 * Cinza equivalente a uma cor, pela luminância percebida.
 *
 * Não é a média dos canais: o olho enxerga verde muito mais que azul,
 * então `(r+g+b)/3` deixaria um azul-marinho e um verde-oliva com o
 * mesmo cinza, apesar de um parecer bem mais escuro que o outro. Os
 * pesos são os mesmos do cálculo de contraste.
 *
 * A capa fica um pouco mais ESCURA que o equivalente exato (fator
 * 0.82): capa clara demais faz a raspagem parecer que já está pronta
 * antes de começar.
 */
function cinzaDaCor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const nivel = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 0.82);
  const v = Math.max(0, Math.min(255, nivel)).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
}

/** Branco ou preto sobre o cinza da capa, pelo mesmo critério da cor. */
function textoSobreCinza(hex) {
  const cinza = cinzaDaCor(hex);
  const v = parseInt(cinza.slice(1, 3), 16) / 255;
  const linear = v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 1.05 / (linear + 0.05) >= (linear + 0.05) / 0.05 ? "#FFFFFF" : "#101418";
}

/** Clareia (positivo) ou escurece (negativo) um hex, em pontos de L. */
function clarear(hex, delta) {
  const n = parseInt(hex.slice(1), 16);
  const ajusta = (v) => Math.max(0, Math.min(255, Math.round(v + (delta / 100) * 255)));
  return (
    "#" +
    [ajusta((n >> 16) & 255), ajusta((n >> 8) & 255), ajusta(n & 255)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Quebra o nome em no máximo `maximo` linhas.
 *
 * Devolve o array com uma propriedade `cabe`: false quando o texto não
 * coube no limite de linhas, o que faz quem chama diminuir a fonte e
 * tentar de novo. Palavra sozinha maior que a largura também não
 * "cabe" -- é o caso de "Itabapoana" num selo pequeno.
 */
function quebrarEmLinhas(ctx, texto, larguraMaxima, maximo) {
  const palavras = String(texto || "").trim().split(/\s+/);
  const linhas = [];
  let atual = "";

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= larguraMaxima) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra;
    if (linhas.length >= maximo) break;
  }
  if (atual && linhas.length < maximo) linhas.push(atual);

  const coube =
    linhas.length <= maximo &&
    linhas.every((l) => ctx.measureText(l).width <= larguraMaxima) &&
    linhas.join(" ").length >= String(texto || "").trim().length;

  linhas.cabe = coube;
  return linhas;
}

/**
 * Quebra um texto em várias linhas para caber numa largura máxima,
 * retornando cada linha já com sua posição Y central calculada.
 */
function quebrarTextoEmLinhas(ctx, texto, yInicial, larguraMaxima, alturaLinha) {
  const palavras = texto.split(" ");
  const linhas = [];
  let linhaAtual = "";

  palavras.forEach((palavra) => {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width > larguraMaxima && linhaAtual) {
      linhas.push(linhaAtual);
      linhaAtual = palavra;
    } else {
      linhaAtual = tentativa;
    }
  });
  if (linhaAtual) linhas.push(linhaAtual);

  const yBase = yInicial - ((linhas.length - 1) * alturaLinha) / 2;
  return linhas.map((linhaTexto, i) => ({ texto: linhaTexto, y: yBase + i * alturaLinha }));
}

/**
 * Pinta o SVG de acordo com o estado atual. Com o mapa afastado
 * (modoRegioes), a cor de cada município reflete se a REGIÃO INTEIRA
 * já foi visitada, não o município individualmente.
 */
function aplicarEstadoNoSVG() {
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const id = path.dataset.municipio;
    if (modoRegioes) {
      // Na visao de regioes, cor por regiao completa (todos os
      // municipios dela verificados) -- nao tem estado "vermelho"
      // aqui, so cinza ou verde.
      path.classList.toggle("visitado", regiaoEstaCompleta(path.dataset.regiao));
      path.classList.remove("nao-verificado");
    } else {
      const dados = estadoMapa[id];
      path.classList.toggle("visitado", estaVerificado(id));
      path.classList.toggle("nao-verificado", !!dados?.visitado && !dados?.verificado);
      // Selo brilhante também vale no mapa (dourado), não só no popup
      path.classList.toggle("brilhante", !!dados?.visitado && !!dados?.brilhante);
      // Ainda não raspado, mas o GPS já confirmou presença aqui antes
      // -- dá pra raspar sem precisar voltar (ver abrirModalRaspadinha).
      path.classList.toggle("presenca-pendente", !dados?.visitado && !!dados?.presencaConfirmadaEm);
    }
  });
  atualizarRecorteDoGrao();
  agendarCamadaSatelite();
}

/**
 * O grão de raspadinha cobre só o que AINDA NÃO foi raspado.
 *
 * Sem isto o foil continuava por cima do município já conquistado, e a
 * metáfora se desfazia: raspar é justamente TIRAR a camada. Agora o
 * verde, o azul e o dourado saem limpos, e o contraste entre raspado e
 * não raspado deixa de ser só a cor.
 *
 * Mexe no <clipPath> em vez de pintar por município: continua sendo UMA
 * capa, e isto roda só quando o estado muda -- nunca durante o arrasto.
 * Filho de clipPath com display:none sai do recorte.
 */
function atualizarRecorteDoGrao() {
  const recorte = document.getElementById("recorte-terra");
  if (!recorte) return;
  recorte.querySelectorAll("use[data-mun]").forEach((uso) => {
    const path = document.getElementById("mun-" + uso.dataset.mun);
    const raspado = !!path && (path.classList.contains("visitado") || path.classList.contains("nao-verificado"));
    uso.style.display = raspado ? "none" : "";
  });
}

/**
 * Agrupa os códigos IBGE de município por id de região, lendo direto
 * do atributo data-regiao de cada <path> (já vem do SVG gerado por
 * tools/geojson-to-svg.js a partir de data/regioes.json).
 */
let municipiosPorRegiao = {};

function construirMapaDeRegioes() {
  municipiosPorRegiao = {};
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const regiaoId = path.dataset.regiao;
    (municipiosPorRegiao[regiaoId] ??= []).push(path.dataset.municipio);
  });
}

/**
 * Extrai os vértices de cada anel (subpath) de um `d` de path gerado
 * por tools/geojson-to-svg.js -- formato sempre "M x y L x y L x y
 * ... Z" (só retas, sem curvas), então basta ler os números na
 * ordem. Um município pode ter mais de um anel (ex: ilhas), daí o
 * split em "M".
 */
function extrairAneisDoPath(d) {
  const subpaths = d.trim().split(/(?=M)/).filter(Boolean);
  return subpaths.map((sub) => {
    const numeros = (sub.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const pontos = [];
    for (let i = 0; i + 1 < numeros.length; i += 2) {
      pontos.push([numeros[i], numeros[i + 1]]);
    }
    return pontos;
  });
}

// Distância máxima (em unidades do viewBox, que tem 800 de largura)
// pra considerar dois vértices "o mesmo ponto" -- os municípios
// vizinhos nem sempre têm vértices EXATAMENTE coincidentes na
// fronteira comum (a base tbrugz/geodata-br não é perfeitamente
// topológica), então usa uma tolerância pequena em vez de igualdade
// exata.
const TOLERANCIA_VERTICE = 0.35;
const TAMANHO_CELULA_GRADE = TOLERANCIA_VERTICE * 2;

function chaveCelulaGrade(x, y) {
  return `${Math.round(x / TAMANHO_CELULA_GRADE)},${Math.round(y / TAMANHO_CELULA_GRADE)}`;
}

/**
 * Desenha, por cima dos municípios, o contorno real de cada uma das
 * 8 regiões -- só fica visível no modo "regiões" (zoom afastado, ver
 * CSS `svg.modo-regioes`), quando as bordas individuais de cada
 * município ficam escondidas.
 *
 * Em vez de um fecho convexo (que "estourava" pra fora da forma real
 * da região em formatos côncavos/alongados, cruzando o mapa todo),
 * detecta as arestas de fronteira de verdade: uma aresta (par de
 * vértices consecutivos de um município) fica ESCONDIDA só se outro
 * município da MESMA região tiver vértices bem próximos dos dois
 * extremos dela (ou seja, ele também "passa" por ali -- fronteira
 * interna compartilhada). Usa um índice espacial (grade) pra achar
 * vértices próximos rapidamente, em vez de comparar todos com todos.
 */
function construirContornosDeRegiao() {
  const svg = document.getElementById("mapa-rj");
  document.getElementById("contornos-regioes")?.remove();

  const paths = Array.from(document.querySelectorAll("#mapa-rj .municipio"));
  const municipios = paths.map((path) => ({
    regiao: path.dataset.regiao,
    aneis: extrairAneisDoPath(path.getAttribute("d")),
  }));

  // Centro do bounding box de cada região (pros rótulos de nome no
  // mapa, ver renderizarRotulosRegioes). Calculado aqui porque a
  // geometria de todos os municípios já está à mão.
  const bboxRegiao = {};
  municipios.forEach((m) => {
    if (!m.regiao) return;
    const bb = (bboxRegiao[m.regiao] = bboxRegiao[m.regiao] || {
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
    });
    m.aneis.forEach((anel) => anel.forEach(([x, y]) => {
      if (x < bb.minX) bb.minX = x;
      if (x > bb.maxX) bb.maxX = x;
      if (y < bb.minY) bb.minY = y;
      if (y > bb.maxY) bb.maxY = y;
    }));
  });
  centroidesRegioesRJ = {};
  for (const [slug, bb] of Object.entries(bboxRegiao)) {
    centroidesRegioesRJ[slug] = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
  }

  // Indice espacial de vertices: celula -> [{x, y, indiceMunicipio}]
  const grade = new Map();
  municipios.forEach((municipio, indiceMunicipio) => {
    municipio.aneis.forEach((anel) => {
      anel.forEach(([x, y]) => {
        const chave = chaveCelulaGrade(x, y);
        if (!grade.has(chave)) grade.set(chave, []);
        grade.get(chave).push({ x, y, indiceMunicipio });
      });
    });
  });

  function municipiosPertoDoPonto(x, y, ignorarIndice) {
    const cx = Math.round(x / TAMANHO_CELULA_GRADE);
    const cy = Math.round(y / TAMANHO_CELULA_GRADE);
    const encontrados = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const lista = grade.get(`${cx + dx},${cy + dy}`);
        if (!lista) continue;
        for (const v of lista) {
          if (v.indiceMunicipio === ignorarIndice) continue;
          if (Math.hypot(v.x - x, v.y - y) <= TOLERANCIA_VERTICE) encontrados.add(v.indiceMunicipio);
        }
      }
    }
    return encontrados;
  }

  const grupo = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grupo.id = "contornos-regioes";

  /* Os segmentos externos viram UM <path> por região, e não um <line>
     por segmento.

     Antes era um elemento por aresta. Com a malha simplificada davam
     ~4,5 mil <line>; com a malha detalhada do IBGE passariam de 17 mil,
     e o custo não é só criá-los: `--zoom` é propriedade herdada e muda a
     cada movimento do mapa, então o navegador recalculava estilo dos 18
     mil nós a cada quadro do pinça-zoom (medido: 43ms por mudança num
     desktop -- num celular isso engasga).

     Um path por região desenha exatamente a mesma coisa: cada segmento
     é um `M` seguido de `L`, sem ligar um no outro. */
  const desenhoPorRegiao = new Map();

  municipios.forEach((municipio, indiceMunicipio) => {
    municipio.aneis.forEach((anel) => {
      for (let i = 0; i < anel.length; i++) {
        const p1 = anel[i];
        const p2 = anel[(i + 1) % anel.length];

        const vizinhosP1 = municipiosPertoDoPonto(p1[0], p1[1], indiceMunicipio);
        const vizinhosP2 = municipiosPertoDoPonto(p2[0], p2[1], indiceMunicipio);

        // "Interna" se algum OUTRO municipio da MESMA regiao tem
        // vertices perto dos DOIS extremos dessa aresta -- ele
        // tambem faz essa fronteira, entao e uma divisa interna.
        let interna = false;
        for (const j of vizinhosP1) {
          if (vizinhosP2.has(j) && municipios[j].regiao === municipio.regiao) {
            interna = true;
            break;
          }
        }
        if (interna) continue;

        const chave = municipio.regiao || "sem-regiao";
        if (!desenhoPorRegiao.has(chave)) desenhoPorRegiao.set(chave, []);
        desenhoPorRegiao.get(chave).push(`M${p1[0]} ${p1[1]}L${p2[0]} ${p2[1]}`);
      }
    });
  });

  for (const [regiao, partes] of desenhoPorRegiao) {
    const caminho = document.createElementNS("http://www.w3.org/2000/svg", "path");
    caminho.setAttribute("d", partes.join(""));
    caminho.setAttribute("class", "contorno-regiao-segmento");
    caminho.dataset.regiao = regiao;
    grupo.appendChild(caminho);
  }

  svg.appendChild(grupo);
  renderizarRotulosRegioes();
}

// Centro de cada região do RJ (preenchido por construirContornosDeRegiao).
let centroidesRegioesRJ = {};

/**
 * Injeta no #mapa-rj um rótulo com o NOME de cada região, no centro
 * dela -- aparece só quando o mapa está afastado (modo-regioes, ver
 * CSS), igual aos nomes de mesorregião dos mapas estaduais. É reconstruído quando os
 * nomes chegam (data/regioes.json é assíncrono, ver carregarRegioesInfo);
 * até lá cai no slug. Tira o prefixo "Região ..." pra encurtar.
 */
function renderizarRotulosRegioes() {
  const svg = document.getElementById("mapa-rj");
  if (!svg) return;
  document.getElementById("rotulos-regioes-rj")?.remove();
  const slugs = Object.keys(centroidesRegioesRJ);
  if (!slugs.length) return;

  const grupo = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grupo.id = "rotulos-regioes-rj";
  slugs.forEach((slug) => {
    const c = centroidesRegioesRJ[slug];
    const nomeBruto = regioesInfo[slug]?.nome || slug;
    const nome = nomeBruto.replace(/^Regi[ãa]o\s+(d[aeo]s?\s+)?/i, "");
    const texto = document.createElementNS("http://www.w3.org/2000/svg", "text");
    texto.setAttribute("class", "rotulo-regiao");
    texto.setAttribute("x", c.x.toFixed(2));
    texto.setAttribute("y", c.y.toFixed(2));
    texto.textContent = nome;
    grupo.appendChild(texto);
  });
  svg.appendChild(grupo);
}

function regiaoEstaCompleta(regiaoId) {
  const idsDaRegiao = municipiosPorRegiao[regiaoId] || [];
  return idsDaRegiao.length > 0 && idsDaRegiao.every((id) => estaVerificado(id));
}

/**
 * Atualiza o contador "Visitados: X / Y" -- só conta município
 * verificado por localização (ver estaVerificado).
 */
function atualizarContador() {
  /* Fora do RJ quem manda na barra é aplicarLimitesDoEstado: sem esta
     guarda, qualquer coisa que mexesse no progresso (raspar, sincronizar
     com o Firestore) reescrevia "X de 92" por cima do mapa de Minas. */
  if (emEstadoLimitado()) return;
  const total = document.querySelectorAll("#mapa-rj .municipio").length;
  const visitados = Object.keys(estadoMapa).filter((id) => estaVerificado(id)).length;

  document.getElementById("contador").textContent = visitados;
  document.getElementById("total").textContent = total;

  // barra fina de progresso na barra de topo
  const preench = document.getElementById("topo-prog-preench");
  if (preench && total) preench.style.width = `${Math.round((visitados / total) * 100)}%`;
}

/**
 * Desmarca o município atualmente aberto no popup, depois de
 * confirmar com o usuário, e fecha o popup em seguida.
 */
function desmarcarMunicipioAtual() {
  if (!municipioSelecionadoId) return;

  const confirmar = confirm("Tem certeza que deseja desmarcar este município?");
  if (!confirmar) return;

  // Mantem brilhante/chanceDecidida (nao apaga o registro inteiro):
  // uma vez decidida, a sorte da raspadinha brilhante desse
  // municipio nunca muda, mesmo desmarcando e raspando de novo.
  const anterior = estadoMapa[municipioSelecionadoId];
  estadoMapa[municipioSelecionadoId] = anterior
    ? { ...anterior, visitado: false }
    : undefined;
  if (!estadoMapa[municipioSelecionadoId]) delete estadoMapa[municipioSelecionadoId];

  salvarEstado();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  sincronizarMunicipioOnline(municipioSelecionadoId);
  municipioSelecionadoId = null;
  fecharModalRaspadinha();
}

/**
 * Zera todo o progresso (com confirmação).
 */
function resetarTudo() {
  const confirmar = confirm(
    "Tem certeza que deseja resetar todo o mapa? Essa ação não pode ser desfeita."
  );
  if (!confirmar) return;

  estadoMapa = {};
  estadoRegioes = {};
  estadoConquistas = {};
  estadoRotas = {};
  salvarEstado();
  salvarEstadoRegioes();
  salvarEstadoConquistas();
  salvarEstadoRotas();
  aplicarEstadoNoSVG();
  atualizarContador();
  sincronizarProgressoOnline();
  window.raspadinhaAuth?.resetarEstadoPublico?.();
  fecharConfiguracoes();
}

/* ---------- LocalStorage ---------- */

function salvarEstado() {
  localStorage.setItem(chaveComUid(STORAGE_KEY), JSON.stringify(estadoMapa));
}

function carregarEstado() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado do LocalStorage:", erro);
    return {};
  }
}

function salvarEstadoRegioes() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_REGIOES), JSON.stringify(estadoRegioes));
}

function carregarEstadoRegioes() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_REGIOES));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado das regiões do LocalStorage:", erro);
    return {};
  }
}

function salvarEstadoRotas() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_ROTAS), JSON.stringify(estadoRotas));
}

function carregarEstadoRotas() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_ROTAS));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado das rotas do LocalStorage:", erro);
    return {};
  }
}

function salvarEstadoConquistas() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_CONQUISTAS), JSON.stringify(estadoConquistas));
}

function carregarEstadoConquistas() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_CONQUISTAS));
    return dados ? JSON.parse(dados) : {};
  } catch (erro) {
    console.error("Erro ao carregar estado das conquistas do LocalStorage:", erro);
    return {};
  }
}

function carregarEstadoStreak() {
  try {
    const dados = localStorage.getItem(chaveComUid(STORAGE_KEY_STREAK));
    return dados ? JSON.parse(dados) : { ultimoDia: null, contagem: 0 };
  } catch (erro) {
    console.error("Erro ao carregar streak do LocalStorage:", erro);
    return { ultimoDia: null, contagem: 0 };
  }
}

function salvarEstadoStreak() {
  localStorage.setItem(chaveComUid(STORAGE_KEY_STREAK), JSON.stringify(estadoStreak));
}

/**
 * Migração 1x: contas que já usavam o app antes desta correção têm o
 * progresso guardado na chave FIXA antiga (sem uid nenhum -- a causa
 * da mistura de dados entre contas no mesmo navegador). Se a conta
 * que está logando ainda não tem uma chave própria, herda o que
 * estiver na chave antiga (não apaga a antiga, só copia).
 */
function migrarEstadoAntigoSeNecessario(uid) {
  [STORAGE_KEY, STORAGE_KEY_REGIOES, STORAGE_KEY_CONQUISTAS, STORAGE_KEY_STREAK].forEach(
    (chaveBase) => {
      const chaveNova = `${chaveBase}_${uid}`;
      if (localStorage.getItem(chaveNova) !== null) return; // já migrado antes
      const dadosAntigos = localStorage.getItem(chaveBase);
      if (dadosAntigos !== null) localStorage.setItem(chaveNova, dadosAntigos);
    }
  );
}

/**
 * Chamada sempre que alguém loga (ver atualizarUiDeConta): troca o
 * "dono" das chaves de localStorage pro uid de quem acabou de logar,
 * migra dados antigos (contas de antes desta correção) se for a
 * primeira vez, recarrega os 4 estados da chave certa, e por cima
 * disso ainda restaura município/região a partir do Firestore (fonte
 * de verdade por conta, já que fica isolado por uid nas regras de
 * segurança) -- isso corrige sozinho qualquer mistura que ainda
 * exista no navegador local. Só depois disso é seguro sincronizar de
 * volta pro Firestore (sincronizarProgressoOnline etc.), pra não
 * gravar dado misturado por cima do dado certo da conta.
 */
async function carregarEstadoDoUsuario(uid) {
  migrarEstadoAntigoSeNecessario(uid);
  uidStorageAtual = uid;

  estadoMapa = carregarEstado();
  estadoRegioes = carregarEstadoRegioes();
  estadoConquistas = carregarEstadoConquistas();
  estadoRotas = carregarEstadoRotas();
  estadoStreak = carregarEstadoStreak();
  // registrarAcessoDeHoje() já rodou no DOMContentLoaded, mas contra o
  // bucket "anon" (uid ainda não era conhecido nesse momento) -- chama
  // de novo aqui, agora contra o streak de VERDADE dessa conta, senão
  // a conquista "Semana Cheia" nunca contaria acesso nenhum pra quem
  // está logado (só pra sessões anônimas, que nem chegam a ver
  // conquistas).
  registrarAcessoDeHoje();

  try {
    const estadoNuvem = await window.raspadinhaAuth?.buscarMeuEstadoCompleto();
    if (estadoNuvem) {
      Object.entries(estadoNuvem.estadoMunicipios || {}).forEach(([id, dados]) => {
        estadoMapa[id] = {
          ...estadoMapa[id],
          visitado: !!dados.visitado,
          // OR com o valor local: a sincronização pro Firestore
          // (sincronizarMunicipioOnline) é "dispara e esquece", sem
          // esperar terminar -- se a aba fechar/perder rede antes de
          // completar, a nuvem fica com `verificado: false` desatualizado.
          // Sem esse OR, o próximo login restaurava esse dado velho por
          // cima do local (já true), desfazendo a verificação -- e como
          // verificarLocalizacaoAoAbrirApp roda de novo a cada abertura
          // do app, a pessoa via o aviso "confirmando sua localização"
          // voltar sem parar pra um município que já tinha sido
          // confirmado antes. `verificado` só vai de false pra true,
          // nunca o contrário (fora o desmarcar, que apaga o registro
          // inteiro), então esse OR é sempre seguro.
          // `jaVerificado` entra no OR porque `verificado` vai pra
          // nuvem como false quando o município está desmarcado --
          // sem ele, desmarcar + reinstalar apagaria a prova de
          // presença de vez.
          verificado: !!dados.verificado || !!dados.jaVerificado || !!estadoMapa[id]?.verificado,
          // O Firestore só reflete o "brilhante" de verdade enquanto o
          // município está visitado (ver estadoPublicoMunicipio em
          // sincronizarMunicipioOnline) -- desmarcado, ele sempre manda
          // false por design, mesmo que a decisão real (guardada só
          // localmente) tenha sido brilhante. Sem esse cuidado, restaurar
          // do Firestore apagaria esse resultado quando o município
          // estivesse desmarcado no momento do login.
          brilhante: dados.visitado ? !!dados.brilhante : !!estadoMapa[id]?.brilhante,
          chanceDecidida: estadoMapa[id]?.chanceDecidida || !!dados.visitado,
        };
      });
      Object.entries(estadoNuvem.estadoRegioes || {}).forEach(([id, dados]) => {
        estadoRegioes[id] = {
          ...estadoRegioes[id],
          revelado: !!dados.revelado,
          brilhante: !!dados.brilhante,
          chanceDecidida: estadoRegioes[id]?.chanceDecidida || !!dados.revelado,
        };
      });
      Object.entries(estadoNuvem.estadoRotas || {}).forEach(([id, dados]) => {
        estadoRotas[id] = {
          ...estadoRotas[id],
          revelado: !!dados.revelado,
          brilhante: !!dados.brilhante,
          chanceDecidida: estadoRotas[id]?.chanceDecidida || !!dados.revelado,
        };
      });
      salvarEstado();
      salvarEstadoRegioes();
      salvarEstadoRotas();
    }
  } catch (erro) {
    console.error("Falha ao restaurar estado do Firestore no login:", erro);
    // sem nuvem acessível, segue só com o que tinha local mesmo
  }

  aplicarEstadoNoSVG();
  atualizarContador();
}

/**
 * Chamada ao deslogar: volta as chaves de localStorage pro dono
 * "anon" (navegação sem login) -- sem isso, o estado da conta que
 * acabou de sair continuaria em memória/repintado no mapa até um
 * reload manual.
 */
function voltarParaEstadoAnonimo() {
  uidStorageAtual = "anon";
  estadoMapa = carregarEstado();
  estadoRegioes = carregarEstadoRegioes();
  estadoConquistas = carregarEstadoConquistas();
  estadoRotas = carregarEstadoRotas();
  estadoStreak = carregarEstadoStreak();
  aplicarEstadoNoSVG();
  atualizarContador();
}

/**
 * Conta 1 dia de streak por dia de calendário em que o app é aberto
 * (uma vez por dia, não importa quantas vezes abre no mesmo dia). Se
 * pular um dia, a sequência reseta pra 1.
 */
function registrarAcessoDeHoje() {
  const hojeChave = new Date().toDateString();
  if (estadoStreak.ultimoDia === hojeChave) return;

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemChave = ontem.toDateString();

  estadoStreak.contagem = estadoStreak.ultimoDia === ontemChave ? estadoStreak.contagem + 1 : 1;
  estadoStreak.ultimoDia = hojeChave;
  salvarEstadoStreak();
}

/* ============================================================
   Mapa do Brasil: contorno de cada estado, todos "em breve" (cinza +
   borrado) exceto o RJ, que já é o app principal -- clicar nele fecha
   essa visão e volta pro mapa detalhado. Botão 🇧🇷 vive dentro da
   janela suspensa da lateral esquerda (ver alternarBotoesLaterais),
   sempre disponível. Ver tools/br-estados-to-svg.js pra como o SVG é
   gerado a partir de data/br-estados.geojson (malha oficial do IBGE)
   + data/estados.json.
   ============================================================ */

// Cache do SVG buscado (só faz o fetch uma vez por sessão, já que o
// arquivo não muda em runtime).
let svgMapaBrasilCache = null;

/**
 * Abre a visão do Brasil, buscando e injetando o SVG na primeira vez
 * (fica em cache depois). Clicar num estado "em breve" só mostra um
 * aviso; clicar no RJ (o único liberado) fecha essa tela, já que o
 * app principal É o mapa detalhado do RJ.
 */
async function abrirMapaBrasil() {
  document.getElementById("modal-brasil").classList.remove("oculto");
  document.getElementById("brasil-status").textContent = "";
  const container = document.getElementById("brasil-mapa-container");

  if (!svgMapaBrasilCache) {
    container.innerHTML = '<div class="spinner spinner-grande"></div>';
    try {
      const resposta = await fetch("assets/svg/br-estados.svg");
      svgMapaBrasilCache = await resposta.text();
    } catch (erro) {
      console.error("Falha ao carregar o mapa do Brasil:", erro);
      container.innerHTML = "<p>Não foi possível carregar o mapa agora.</p>";
      return;
    }
  }

  container.innerHTML = svgMapaBrasilCache;
  document.getElementById("brasil-status").textContent = "";
  // Tocar no mapa vale, mas não é a via principal -- ver renderizarGridEstados.
  container.querySelectorAll(".estado").forEach((path) => {
    path.addEventListener("click", () =>
      escolherEstado(path.dataset.sigla, path.dataset.nome, situacaoDoPath(path))
    );
  });
  renderizarGridEstados();
}

/** "liberado" | "dev" | "breve", lido da classe que o gerador escreveu. */
function situacaoDoPath(path) {
  if (path.classList.contains("estado-liberado")) return "liberado";
  if (path.classList.contains("estado-em-desenvolvimento")) return "dev";
  return "breve";
}

/* Ordem e textos de cada grupo da lista. "breve" vem por último porque
   são 24 estados -- o que interessa fica em cima, sem rolar. */
const GRUPOS_DE_ESTADO = [
  { chave: "liberado", titulo: "Disponíveis", classe: "brasil-card-liberado", sub: "Pronto pra desbravar" },
  { chave: "dev", titulo: "Em desenvolvimento", classe: "brasil-card-dev", sub: "Dá pra explorar o mapa" },
  { chave: "breve", titulo: "Em breve", classe: "brasil-card-breve", sub: "Ainda não disponível" },
];

/**
 * Monta a lista de estados embaixo do mapa.
 *
 * É a navegação DE VERDADE desta tela: o mapa cabe inteiro agora, e num
 * Brasil inteiro numa tela de celular o RJ tem uns 6 px -- alvo que
 * ninguém acerta. A lista dá alvos de 52px, acima do mínimo de toque.
 *
 * Sai do próprio SVG (data-sigla, data-nome e a classe de situação), e
 * não de uma lista à parte: estado que mudar de fase em
 * data/estados.json aparece aqui sozinho, sem tocar em código.
 */
function renderizarGridEstados() {
  const grid = document.getElementById("brasil-grid");
  const paths = [...document.querySelectorAll("#brasil-mapa-container .estado")];
  if (!grid || !paths.length) return;

  const porSituacao = { liberado: [], dev: [], breve: [] };
  paths.forEach((p) => porSituacao[situacaoDoPath(p)].push(p));

  grid.innerHTML = "";
  for (const grupo of GRUPOS_DE_ESTADO) {
    const desteGrupo = porSituacao[grupo.chave].sort((a, b) =>
      a.dataset.nome.localeCompare(b.dataset.nome, "pt-BR")
    );
    if (!desteGrupo.length) continue;

    const secao = document.createElement("section");
    secao.className = "brasil-grupo";
    const titulo = document.createElement("h3");
    titulo.className = "brasil-grupo-titulo";
    titulo.textContent = grupo.titulo;
    // Contagem só onde ajuda: "Disponíveis 1" é ruído, "Em breve 24" não.
    if (desteGrupo.length > 2) {
      const conta = document.createElement("span");
      conta.className = "brasil-grupo-conta";
      conta.textContent = desteGrupo.length;
      titulo.appendChild(conta);
    }
    secao.appendChild(titulo);

    const cards = document.createElement("div");
    cards.className = "brasil-cards";
    for (const path of desteGrupo) {
      const nome = path.dataset.nome;
      const sigla = path.dataset.sigla;
      const card = document.createElement("button");
      card.type = "button";
      card.className = `brasil-card ${grupo.classe}`;
      card.innerHTML =
        '<span class="brasil-card-ponto" aria-hidden="true"></span>' +
        '<span class="brasil-card-texto">' +
        `<span class="brasil-card-nome">${escaparHtml(nome)}</span>` +
        `<span class="brasil-card-sub">${escaparHtml(grupo.sub)}</span>` +
        "</span>";
      card.addEventListener("click", () => escolherEstado(sigla, nome, grupo.chave));
      cards.appendChild(card);
    }
    secao.appendChild(cards);
    grid.appendChild(secao);
  }
}

/**
 * O que acontece ao escolher um estado -- pela lista ou pelo mapa.
 *
 * Um caminho só pros dois: antes o mapa exigia tocar e depois confirmar
 * num botão, muleta que existia porque acertar o estado no mapa era
 * difícil. Com a lista resolvendo a mira, o passo extra virou atrito.
 */
function escolherEstado(sigla, nome, situacao) {
  if (situacao === "liberado") {
    // Estado pronto (RJ) -- fecha esta tela E o mapa estadual, se havia
    // um aberto, revelando o mapa detalhado do RJ, que É o app principal.
    fecharMapaBrasil();
    fecharMapaEstadual();
    return;
  }
  if (situacao === "dev") {
    // Malha pronta, sem conteúdo pra raspar (SP, MG) -- abre a prévia.
    fecharMapaBrasil();
    abrirMapaEstadoEmDesenvolvimento(sigla, nome);
    return;
  }
  /* "Em breve" responde em vez de ficar mudo: um card que não faz nada
     ao ser tocado passa a impressão de app travado. */
  document.getElementById("brasil-status").textContent = `${nome} chega em breve!`;
}

function fecharMapaBrasil() {
  document.getElementById("modal-brasil").classList.add("oculto");
}

/* ============================================================
   Visualizador de estado "em desenvolvimento": mostra a malha dos
   municípios só como prévia (não dá pra raspar ainda). Hoje SP e MG
   usam isso. Pra entrar outro estado nesse estágio basta marcar
   emDesenvolvimento: true em data/estados.json e criar o par
   assets/svg/<sigla>-municipios.svg + os arquivos data/<sigla>-*.json
   vazios (ver tools/geojson-municipios-to-svg.js) -- nada de código.
   ============================================================ */

const svgMapaEstadoCache = {};
// Nome por extenso do estado aberto agora, pros avisos ("Minas Gerais
// está em desenvolvimento"). O <svg> não precisa de variável: o pan/zoom
// pega o primeiro do #estado-viewport, seja #mapa-sp ou #mapa-mg.
let nomeDoEstadoAberto = "";
// Reseta o zoom/posição na próxima abertura -- definido por
// inicializarPanZoomEstadual(), chamado uma vez na inicialização.
let resetarZoomEstadual = () => {};
// Centraliza e aproxima um município do mapa estadual (usado pela lupa).
// Definido dentro de inicializarPanZoomEstadual, que é quem enxerga a
// escala e os deslocamentos.
let focarMunicipioEstadual = () => {};

/**
 * Caminho do mapa de um estado, usado como CHAVE no CacheStorage.
 *
 * Sempre RELATIVO, mesmo no APK: o CacheStorage resolve contra a origem
 * atual, então a chave fica dentro da própria origem do app. Guardar sob
 * a URL do site daria um cache cross-origin, que o navegador trata como
 * resposta opaca -- o mesmo tipo de armadilha que já quebrou as fotos da
 * Comunidade uma vez (ver o histórico da v0.11.22).
 */
function urlDoMapaEstadual(sigla) {
  return `assets/svg/${sigla}-municipios.svg`;
}

/**
 * De onde BUSCAR o arquivo, que não é o mesmo lugar da chave.
 *
 * Dentro do APK, caminho relativo resolve pro localhost interno do
 * Capacitor -- e esses SVGs foram tirados do APK de propósito (~11 MB).
 * Resultado: 404 local, e o download "falhava por conexão" mesmo com
 * internet perfeita. Era este o motivo de MG não baixar no celular.
 *
 * É a mesma armadilha do changelog, que o URL_VERSOES_PUBLICADAS já
 * resolvia: conteúdo que mora no site precisa ser pedido AO SITE.
 */
function origemDoMapaEstadual(sigla, versao) {
  const relativo = urlDoMapaEstadual(sigla);
  const base = ehAppNativo() ? `${SITE_PUBLICADO}/${relativo}` : relativo;
  /* O ?v= existe pra FURAR O SERVICE WORKER, e não pro servidor.
     O sw.js trata .svg como imagem e responde com caches.match, que
     varre TODOS os caches -- inclusive o CACHE_OFFLINE, onde está
     justamente a cópia velha que a gente quer trocar. Sem o parâmetro,
     rebaixar um mapa desatualizado devolvia a mesma cópia velha, e o
     app "atualizava" pra ele mesmo. Com a URL diferente o match falha e
     a requisição vai pra rede de verdade; a gravação continua sendo
     feita na chave limpa, sem o parâmetro. */
  return versao ? `${base}?v=${encodeURIComponent(versao)}` : base;
}


/** Versão publicada de um mapa, ou "" se não der pra saber (sem rede). */
async function versaoPublicadaDoMapa(sigla) {
  try {
    return (await versoesPublicadas())[sigla] || "";
  } catch {
    return "";
  }
}
/** Já está guardado no aparelho? (CacheStorage do pacote offline) */
async function mapaEstadualJaBaixado(sigla) {
  if (svgMapaEstadoCache[sigla]) return true;
  try {
    const cache = await caches.open(CACHE_OFFLINE);
    return !!(await cache.match(urlDoMapaEstadual(sigla)));
  } catch {
    return false; // sem CacheStorage: tenta a rede na hora
  }
}

/* Peso aproximado de cada mapa, pra avisar ANTES de baixar -- ninguém
   deve descobrir que gastou 5 MB depois do fato, ainda mais um público
   que usa o app na estrada. São os números do arquivo comprimido, que
   é o que realmente trafega. */
const PESO_DO_MAPA = { df: "0,2 MB", al: "0,1 MB", rn: "0,2 MB", se: "0,2 MB", pi: "0,3 MB", pb: "0,3 MB", pe: "0,3 MB", es: "0,3 MB", ac: "0,2 MB", ap: "0,2 MB", rr: "0,2 MB", ce: "0,5 MB", ma: "0,7 MB", ro: "0,3 MB", pa: "0,7 MB", ms: "0,7 MB", to: "0,8 MB", sc: "0,8 MB", am: "0,6 MB", mt: "1,1 MB", pr: "1,2 MB", go: "1,2 MB", rs: "1,2 MB", ba: "1,1 MB", sp: "1,4 MB", mg: "2,2 MB" };

/* Um download por estado de cada vez. Sem isso, tocar em "Baixar" no
   mapa e depois em "Baixar todos" em Configurações puxaria os mesmos
   megabytes duas vezes -- e as duas barras brigariam pela mesma linha.
   Guarda a Promise: quem chegar depois espera a mesma. */
const mapasBaixando = {};

/**
 * Baixa o mapa do estado e guarda no aparelho.
 *
 * Guarda no CACHE_OFFLINE, e não no cache do app: aquele é limpo a cada
 * deploy (o sw.js apaga tudo que começa com "mapa-raspadinha-"), e a
 * pessoa perderia o download a cada atualização.
 *
 * `aoProgredir(fracao)` recebe 0..1, ou `null` quando o servidor não
 * manda Content-Length (o gzip costuma omitir) -- aí quem chama mostra
 * uma barra indeterminada em vez de inventar uma porcentagem.
 */
function baixarMapaDoEstado(sigla, aoProgredir) {
  if (mapasBaixando[sigla]) return mapasBaixando[sigla];

  const tarefa = (async () => {
    // A versão publicada entra como ?v= pra a busca não ser respondida
    // pelo cache com a cópia velha (ver origemDoMapaEstadual).
    const versao = await versaoPublicadaDoMapa(sigla);
    const origem = origemDoMapaEstadual(sigla, versao);
    const resposta = await fetch(origem);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${origem}`);

    const total = Number(resposta.headers.get("Content-Length")) || 0;
    const leitor = resposta.body && resposta.body.getReader ? resposta.body.getReader() : null;
    let svg;
    if (leitor) {
      const pedacos = [];
      let lidos = 0;
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        pedacos.push(value);
        lidos += value.length;
        if (aoProgredir) aoProgredir(total ? lidos / total : null);
      }
      /* Blob, e não um Uint8Array montado à mão: o Blob pode ficar em
         disco em vez de tudo na RAM. Com os 6,9 MB de MG, a versão
         anterior segurava os pedaços, mais a cópia junta, mais a string
         decodificada -- três vezes o arquivo, ao mesmo tempo, numa
         WebView de celular. É o candidato mais forte pro download de MG
         falhar onde o de SP (4,2 MB) passava. */
      svg = await new Blob(pedacos, { type: "image/svg+xml" }).text();
    } else {
      svg = await resposta.text();
    }

    svgMapaEstadoCache[sigla] = svg;
    try {
      const cache = await caches.open(CACHE_OFFLINE);
      await cache.put(
        urlDoMapaEstadual(sigla),
        new Response(svg, { headers: { "Content-Type": "image/svg+xml" } })
      );
    } catch (erro) {
      /* Sem espaço ou sem CacheStorage: o mapa vale só por esta sessão.
         Não é motivo pra falhar -- a pessoa pediu pra VER o mapa. */
      console.warn(`Mapa de ${sigla} não pôde ser guardado no aparelho:`, erro);
    }
    /* Anota a versão AQUI, e não em cada chamador: baixam mapa o
       painel do estado, a tela de Configurações e o download automático
       do estado onde a pessoa está. Fora daqui, um deles ficaria sem
       anotar e o mapa dele nunca perceberia que ficou velho. */
    await registrarVersaoBaixada(sigla);
    if (aoProgredir) aoProgredir(1);
    return svg;
  })();

  mapasBaixando[sigla] = tarefa;
  tarefa.finally(() => delete mapasBaixando[sigla]);
  return tarefa;
}


/* ============================================================
   Mapa guardado que ficou velho

   O CACHE_OFFLINE nunca é limpo -- é isso que impede a pessoa de perder
   o download a cada deploy. O preço é que um mapa baixado fica CONGELADO
   ali: quando o SVG muda (aconteceu com os rótulos na 0.26.08.18.97),
   quem já tinha baixado continuava vendo o velho, e o único jeito era
   apagar e baixar de novo em Configurações. O Paulo descobriu isso na
   mão -- e ninguém deveria precisar saber desse truque.

   Agora cada mapa carrega uma impressão digital (data/mapas-estaduais.json,
   gerada em tools/montar-www.js). O app guarda a do que baixou e, ao
   abrir o estado, confere em segundo plano. Mudou? rebaixa AQUELE mapa
   sozinho -- só o que mudou, não os 17 MB todos.
   ============================================================ */

const CHAVE_VERSAO_MAPA = "desbrava_mapa_versao_";

/** Impressão digital do mapa que está guardado neste aparelho. */
function versaoGuardadaDoMapa(sigla) {
  try {
    return localStorage.getItem(CHAVE_VERSAO_MAPA + sigla) || "";
  } catch {
    return "";
  }
}

function guardarVersaoDoMapa(sigla, versao) {
  try {
    if (versao) localStorage.setItem(CHAVE_VERSAO_MAPA + sigla, versao);
  } catch {
    /* modo privado: sem memória de versão, só não detecta atualização */
  }
}

/* Uma busca por sessão: o arquivo é minúsculo, mas não precisa de uma
   ida à rede a cada estado aberto. */
let versoesPublicadasDosMapas = null;
async function versoesPublicadas() {
  if (versoesPublicadasDosMapas) return versoesPublicadasDosMapas;
  /* Do SITE, não da cópia local: dentro do APK a cópia empacotada é a
     da hora do build, e comparar com ela faria o app rebaixar o mesmo
     mapa pra sempre toda vez que o site estivesse mais novo. */
  const url = ehAppNativo()
    ? `${SITE_PUBLICADO}/data/mapas-estaduais.json`
    : "data/mapas-estaduais.json";
  const resposta = await fetch(url, { cache: "no-store" });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  versoesPublicadasDosMapas = (await resposta.json()).versoes || {};
  return versoesPublicadasDosMapas;
}

/**
 * Confere se o mapa guardado é o mais novo e, se não for, rebaixa.
 *
 * Roda em SEGUNDO PLANO, depois de o mapa velho já estar na tela: é
 * melhor mostrar o desatualizado na hora e trocar depois do que segurar
 * a pessoa esperando. Sem rede, não faz nada -- o mapa guardado
 * continua valendo, que é o ponto de ele existir.
 */
async function verificarAtualizacaoDoMapa(sigla) {
  try {
    const publicada = (await versoesPublicadas())[sigla];
    if (!publicada || publicada === versaoGuardadaDoMapa(sigla)) return;

    console.log(`Mapa de ${sigla.toUpperCase()} desatualizado, rebaixando...`);
    delete svgMapaEstadoCache[sigla];
    await baixarMapaDoEstado(sigla); // ele já anota a versão nova

    // Só redesenha se a pessoa AINDA estiver nesse estado -- ela pode
    // ter trocado de mapa no meio do download.
    if (estadoAtual === sigla) await desenharMapaEstadual(sigla);
    mostrarAvisoEstadual(`Mapa de ${nomeDoEstadoAberto} atualizado.`);
  } catch (erro) {
    // Sem rede ou site fora: segue com o que está guardado.
    console.warn(`Não deu para conferir a versão do mapa de ${sigla}:`, erro);
  }
}


/** Anota qual versão do mapa acabou de ser guardada neste aparelho. */
async function registrarVersaoBaixada(sigla) {
  try {
    guardarVersaoDoMapa(sigla, (await versoesPublicadas())[sigla]);
  } catch {
    /* Sem o manifesto o app fica sem saber a versão do que baixou. A
       próxima abertura com rede resolve: como não há versão guardada,
       ela vai diferir da publicada e o mapa é rebaixado uma vez. */
  }
}
/** Apaga o mapa guardado (Configurações → Mapas dos estados). */
async function apagarMapaDoEstado(sigla) {
  delete svgMapaEstadoCache[sigla];
  try {
    localStorage.removeItem(CHAVE_VERSAO_MAPA + sigla);
  } catch {
    /* sem localStorage: nada a esquecer */
  }
  try {
    const cache = await caches.open(CACHE_OFFLINE);
    await cache.delete(urlDoMapaEstadual(sigla));
  } catch (erro) {
    console.error(`Falha ao apagar o mapa de ${sigla}:`, erro);
  }
}

/** Baixa a partir do painel que aparece dentro do mapa em tela cheia. */
async function baixarMapaPeloPainel(sigla, nome) {
  const painel = document.getElementById("estado-baixar");
  const botao = document.getElementById("btn-estado-baixar");
  const barra = document.getElementById("estado-baixar-barra");
  const preench = document.getElementById("estado-baixar-preench");
  const texto = document.getElementById("estado-baixar-texto");

  botao.disabled = true;
  barra.classList.remove("oculto");
  preench.style.width = "0%";
  texto.textContent = `Baixando o mapa de ${nome}...`;

  try {
    await baixarMapaDoEstado(sigla, (fracao) => {
      if (fracao === null) barra.classList.add("indeterminada");
      else preench.style.width = `${Math.round(fracao * 100)}%`;
    });
    barra.classList.remove("indeterminada");
    painel.classList.add("oculto");
    await desenharMapaEstadual(sigla);
  } catch (erro) {
    console.error(`Falha ao baixar o mapa de ${sigla}:`, erro);
    /* Mostra o motivo REAL. Antes dizia sempre "confira sua conexão", o
       que mandou o Paulo procurar problema no wi-fi enquanto a causa era
       um 404 -- o arquivo não existe dentro do APK, de propósito. Erro
       que mente sobre a causa custa mais caro que erro feio. */
    texto.textContent = `Não deu para baixar agora (${erro.message}). Tente de novo.`;
    botao.disabled = false;
    barra.classList.add("oculto");
  }
}

/** Injeta o SVG já em mãos (memória ou CacheStorage). */
async function desenharMapaEstadual(sigla) {
  const viewport = document.getElementById("estado-viewport");

  if (!svgMapaEstadoCache[sigla]) {
    viewport.innerHTML = '<div class="spinner spinner-grande"></div>';
    /* "Respiro" pro spinner PINTAR antes da injeção pesada. setTimeout
       puro (não requestAnimationFrame, que não dispara com a página em
       segundo plano e penduraria tudo). */
    await new Promise((r) => setTimeout(r, 30));
    try {
      const cache = await caches.open(CACHE_OFFLINE);
      const guardado = await cache.match(urlDoMapaEstadual(sigla));
      svgMapaEstadoCache[sigla] = guardado
        ? await guardado.text()
        : await (await fetch(origemDoMapaEstadual(sigla, await versaoPublicadaDoMapa(sigla)))).text();
    } catch (erro) {
      console.error(`Falha ao carregar o mapa de ${sigla}:`, erro);
      viewport.innerHTML =
        '<p style="padding:16px;color:#F2F5F7">Não foi possível carregar o mapa agora. ' +
        "Toque no 🇧🇷 e tente de novo.</p>";
      return;
    }
    await new Promise((r) => setTimeout(r, 30));
  }

  viewport.innerHTML = svgMapaEstadoCache[sigla];
  /* optimizeSpeed: com os 356 mil pontos de MG, resolver a geometria
     caiu de 67 ms pra 45 ms na medição. Troca precisão sub-pixel do
     antialiasing por fluidez -- num mapa de divisas ninguém vê a
     diferença, e o arrasto agradece. */
  const svg = viewport.querySelector("svg");
  if (svg) svg.style.shapeRendering = "optimizeSpeed";

  resetarZoomEstadual();
  mostrarPopupDevEstadual();
}

/**
 * Abre o mapa de um estado "em desenvolvimento" (malha pronta, sem
 * conteúdo pra raspar).
 *
 * Era fixo em SP, com um `if (sigla !== "sp") alert(...)` e o
 * comentário "manter simples até virar um problema real". MG tornou
 * real. Agora qualquer estado com `emDesenvolvimento: true` em
 * data/estados.json mais o par assets/svg/<sigla>-municipios.svg
 * funciona sem tocar em código.
 */
async function abrirMapaEstadoEmDesenvolvimento(sigla, nomeDoEstado) {
  const s = String(sigla || "").toLowerCase();
  if (!/^[a-z]{2}$/.test(s)) return;

  const nome = nomeDoEstado || s.toUpperCase();
  nomeDoEstadoAberto = nome;
  mostrarEstadoNoViewport(s, "dev");
  const painel = document.getElementById("estado-baixar");

  if (await mapaEstadualJaBaixado(s)) {
    painel.classList.add("oculto");
    await desenharMapaEstadual(s);
    // Em segundo plano: o mapa guardado pode ter ficado velho.
    verificarAtualizacaoDoMapa(s);
    return;
  }

  /* Ainda não baixado: pergunta antes, com o tamanho à vista. */
  document.getElementById("estado-viewport").innerHTML = "";
  document.getElementById("estado-baixar-titulo").textContent = `Mapa de ${nome}`;
  document.getElementById("estado-baixar-texto").textContent =
    `São ${PESO_DO_MAPA[s] || "alguns MB"} de download, uma vez só. ` +
    "Depois ele fica guardado no aparelho e abre sem internet.";
  document.getElementById("estado-baixar-barra").classList.add("oculto");
  const botao = document.getElementById("btn-estado-baixar");
  botao.disabled = false;
  botao.onclick = () => baixarMapaPeloPainel(s, nome);
  painel.classList.remove("oculto");
}

/* ============================================================
   Troca de estado SEM trocar de tela

   O mapa estadual era um modal em tela cheia por cima de tudo, então
   entrar em SP/MG apagava o app inteiro: sem barra de topo, sem menu,
   sem botões. Agora os dois mapas moram no mesmo #mapa-viewport e se
   revezam -- a UI, que já flutua por cima do mapa, nunca sai do lugar.

   O RJ NÃO é "o estado padrão" -- ele é só o ÚNICO PUBLICADO hoje, e o
   único cujo mapa vem embutido no app. Quando os outros forem
   publicados, todos terão o mesmo peso. Por isso nada aqui pergunta "é
   o RJ?": pergunta "este estado está publicado?" (`situacaoEstadoAtual`,
   que vem de data/estados.json via as classes do mapa do Brasil), e
   "qual estado tem o mapa embutido?" (lido do DOM, não escrito à mão).

   `estadoAtual` vive só em memória de propósito: reabrir o app num
   estado sem conteúdo, e cujo mapa pode nem estar baixado, seria uma
   boas-vindas ruim.
   ============================================================ */

/* Qual estado tem o mapa embutido no app. Lido do próprio DOM em vez de
   escrito "rj" no código: é uma propriedade TEMPORÁRIA de qual estado
   está publicado, não um privilégio do Rio. */
const SIGLA_MAPA_EMBUTIDO = (
  document.querySelector('#mapa-viewport svg[id^="mapa-"]')?.id.slice(5) || "rj"
).toLowerCase();

let estadoAtual = SIGLA_MAPA_EMBUTIDO;
// "liberado" (publicado) | "dev" (malha pronta, sem conteúdo).
let situacaoEstadoAtual = "liberado";
// Último estado publicado em que a pessoa esteve -- é pra onde o
// "voltar" leva. Com mais de um publicado, volta pro que ela veio.
let ultimoEstadoPublicado = { sigla: SIGLA_MAPA_EMBUTIDO, nome: "Rio de Janeiro" };

/** Troca qual mapa está na tela. */
function mostrarEstadoNoViewport(sigla, situacao = "liberado") {
  estadoAtual = sigla;
  situacaoEstadoAtual = situacao;
  const ehOEmbutido = sigla === SIGLA_MAPA_EMBUTIDO;
  document.getElementById("mapa-rj").classList.toggle("oculto", !ehOEmbutido);
  document.getElementById("estado-viewport").classList.toggle("oculto", ehOEmbutido);
  if (situacao === "liberado") {
    ultimoEstadoPublicado = { sigla, nome: nomeDoEstadoAberto || ultimoEstadoPublicado.nome };
  }
  aplicarLimitesDoEstado();
}

/** Volta pro último estado publicado em que a pessoa esteve. */
function fecharMapaEstadual() {
  nomeDoEstadoAberto = "";
  esconderPopupDevEstadual();
  document.getElementById("estado-toast").classList.add("oculto");
  document.getElementById("estado-baixar").classList.add("oculto");
  mostrarEstadoNoViewport(ultimoEstadoPublicado.sigla, "liberado");
}

/** Estamos num estado que ainda não foi publicado? */
function emEstadoLimitado() {
  return situacaoEstadoAtual !== "liberado";
}

/** Sigla em maiúsculas do estado na tela -- "RJ", "MG", "SP". */
function siglaDoEstadoAtual() {
  return String(estadoAtual || "").toUpperCase();
}

/* ---- A que estado uma coisa pertence ----
   Os 2 primeiros dígitos do código IBGE de um município são o código do
   estado (33 = RJ, 31 = MG, 35 = SP). Como post, produto, selo e rota já
   guardam o código do município, dá pra saber o estado de cada um SEM
   inventar campo novo e sem migrar nada do que já está no Firestore. */
let prefixoIbgePorSigla = null;
async function prefixoIbgeDoEstado(sigla) {
  if (!prefixoIbgePorSigla) {
    const estados = await carregarEstadosJson();
    prefixoIbgePorSigla = {};
    for (const [codigo, dados] of Object.entries(estados)) {
      prefixoIbgePorSigla[String(dados.sigla).toLowerCase()] = codigo;
    }
  }
  return prefixoIbgePorSigla[sigla] || "";
}

/** É deste estado? Item sem município não pertence a estado nenhum. */
function ehDoEstado(codigoMunicipio, prefixo) {
  if (!codigoMunicipio) return false;
  return String(codigoMunicipio).startsWith(prefixo);
}

/**
 * Enche uma tela com o aviso de "ainda não tem isso aqui".
 *
 * Conquistas, Rotas, Loja e Comunidade são conteúdo POR ESTADO (decisão
 * do Paulo). Enquanto o estado não é publicado, mostrar a tela do Rio
 * seria mentir sobre o que a pessoa está vendo, e mostrar vazio sem
 * explicação pareceria defeito. Então explica e oferece a saída.
 */
function avisarConteudoEmDesenvolvimento(container, oQue) {
  if (!container) return;
  const nome = nomeDoEstadoAberto || "Este estado";
  container.innerHTML = `
    <div class="conteudo-em-dev">
      <span class="conteudo-em-dev-icone" aria-hidden="true">🚧</span>
      <h3>${escaparHtml(oQue)} de ${escaparHtml(nome)}</h3>
      <p>Ainda estamos montando esta parte. Enquanto isso, dá pra explorar
         o mapa de ${escaparHtml(nome)} à vontade.</p>
      <button type="button" class="conteudo-em-dev-btn">← Voltar para ${escaparHtml(
        ultimoEstadoPublicado.sigla.toUpperCase()
      )}</button>
    </div>`;
  container.querySelector(".conteudo-em-dev-btn").addEventListener("click", () => {
    /* Fecha o painel que estiver por cima antes de trocar o mapa, senão
       a pessoa volta e não vê que voltou. Usa a lista OVERLAYS_APP e não
       um seletor "[id^=modal-]": a Biblioteca se chama
       "biblioteca-selos", não casava, e ficava aberta por cima. */
    fecharTodosOsModais();
    fecharMapaEstadual();
  });
}

/**
 * Liga/desliga o que ainda não existe fora do RJ.
 *
 * O corte é por CONTEÚDO, não por capricho: progresso, conquistas,
 * rotas e clima são todos do RJ hoje, e mostrar os números do Rio
 * enquanto a pessoa olha Minas seria mentira. O Modo Viagem continua
 * valendo -- ele é GPS e odômetro, não depende de município publicado.
 *
 * Quando um estado for publicado, cada um vai ter os seus (ver a
 * decisão registrada em 17/08/2026): então isto aqui é um estado
 * TRANSITÓRIO, não um "fora do RJ não tem".
 */
function aplicarLimitesDoEstado() {
  const limitado = emEstadoLimitado();
  document.body.classList.toggle("estado-limitado", limitado);

  // Progresso da barra de topo: mostra o do estado que está na tela.
  const txt = document.querySelector("#topo-prog-txt span");
  const preench = document.getElementById("topo-prog-preench");
  if (limitado) {
    if (txt) txt.textContent = nomeDoEstadoAberto || "Em breve";
    document.getElementById("contador").textContent = "0";
    document.getElementById("total").textContent = "—";
    if (preench) preench.style.width = "0%";
  } else {
    if (txt) txt.textContent = "Municípios";
    atualizarContador();
  }

  // Modo Clima só existe pros 92 municípios do RJ (ver
  // tools/apps-script-clima.gs). Desliga antes de esconder, senão os
  // chips ficariam pendurados no mapa do outro estado.
  if (limitado && modoClimaLigado) alternarModoClima();
  atualizarContadorDeModos();

  /* A aba do ranking leva a SIGLA do estado da vez. Vale pro publicado
     também: ele nunca foi "o Estadual", é o RJ -- chamar de "Estadual"
     só fazia sentido enquanto havia um estado só. E sigla, não nome
     inteiro: "Rio Grande do Sul" não cabe numa aba ao lado de duas. */
  const abaEstadual = document.getElementById("btn-ranking-estadual");
  if (abaEstadual) abaEstadual.textContent = siglaDoEstadoAtual();

  /* Recarrega o que estiver ABERTO na hora da troca. Sem isto, trocar de
     estado com a Comunidade aberta deixava na tela o feed do estado
     anterior, sem nenhum sinal de que estava velho. */
  if (!document.getElementById("modal-social")?.classList.contains("oculto")) {
    carregarFeedSocial(true);
  }
  if (!document.getElementById("modal-conquistas")?.classList.contains("oculto")) {
    abrirConquistas();
  }
  if (!document.getElementById("modal-rotas")?.classList.contains("oculto")) {
    abrirRotas();
  }
  if (!document.getElementById("biblioteca-selos")?.classList.contains("oculto")) {
    abrirBibliotecaSelos();
  }
}

/* ============================================================
   Configurações → "Mapas dos estados"
   Baixar / apagar cada mapa, ou todos de uma vez. GRATUITO -- não
   confundir com "Baixar dados offline", que é do Motoclube.
   ============================================================ */

// data/estados.json não era lido em runtime (o mapa do Brasil traz tudo
// embutido no SVG); aqui precisa da lista, então carrega uma vez só.
let estadosJsonCache = null;
async function carregarEstadosJson() {
  if (!estadosJsonCache) {
    const resposta = await fetch("data/estados.json");
    estadosJsonCache = await resposta.json();
  }
  return estadosJsonCache;
}

/** Só os estados que TÊM mapa pra baixar (fora do APK): SP, MG... */
async function estadosComMapaBaixavel() {
  const estados = await carregarEstadosJson();
  return Object.entries(estados)
    .filter(([, dados]) => dados.emDesenvolvimento)
    .map(([codigo, dados]) => ({ codigo, sigla: String(dados.sigla).toLowerCase(), nome: dados.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function renderizarMapasDeEstado() {
  const lista = document.getElementById("mapas-estado-lista");
  if (!lista) return;

  const estados = await estadosComMapaBaixavel();
  lista.innerHTML = "";

  for (const estado of estados) {
    const baixado = await mapaEstadualJaBaixado(estado.sigla);
    const linha = document.createElement("div");
    linha.className = "mapa-estado-linha";
    linha.dataset.sigla = estado.sigla;
    linha.innerHTML = `
      <span class="mapa-estado-nome"></span>
      <span class="mapa-estado-sub"></span>
      <button type="button" class="mapa-estado-acao"></button>
      <div class="mapa-estado-barra oculto"><i></i></div>`;
    // textContent (não interpolação): nome vem de JSON, mas é o mesmo
    // cuidado do resto do app com conteúdo montado em innerHTML.
    linha.querySelector(".mapa-estado-nome").textContent = estado.nome;
    lista.appendChild(linha);
    pintarLinhaDeMapa(linha, estado, baixado);
  }

  await atualizarBotaoBaixarTodosMapas();
}

/** Estado visual de UMA linha (sem refazer a lista inteira). */
function pintarLinhaDeMapa(linha, estado, baixado) {
  const sub = linha.querySelector(".mapa-estado-sub");
  const botao = linha.querySelector(".mapa-estado-acao");
  const barra = linha.querySelector(".mapa-estado-barra");

  barra.classList.add("oculto");
  botao.disabled = false;
  sub.classList.toggle("baixado", baixado);
  sub.textContent = baixado
    ? "Baixado — abre sem internet"
    : `${PESO_DO_MAPA[estado.sigla] || "alguns MB"} de download`;
  botao.textContent = baixado ? "Apagar" : "Baixar";
  botao.classList.toggle("remover", baixado);

  botao.onclick = async () => {
    if (baixado) {
      await apagarMapaDoEstado(estado.sigla);
      pintarLinhaDeMapa(linha, estado, false);
      await atualizarBotaoBaixarTodosMapas();
      return;
    }
    await baixarUmMapaNaLinha(linha, estado);
  };
}

async function baixarUmMapaNaLinha(linha, estado) {
  const sub = linha.querySelector(".mapa-estado-sub");
  const botao = linha.querySelector(".mapa-estado-acao");
  const barra = linha.querySelector(".mapa-estado-barra");
  const preench = barra.querySelector("i");

  botao.disabled = true;
  botao.textContent = "Baixando";
  barra.classList.remove("oculto");
  preench.style.width = "0%";

  try {
    await baixarMapaDoEstado(estado.sigla, (fracao) => {
      // Sem Content-Length não dá pra saber a fração: deixa a barra
      // parada em 40% em vez de fingir progresso que não existe.
      preench.style.width = fracao === null ? "40%" : `${Math.round(fracao * 100)}%`;
    });
    pintarLinhaDeMapa(linha, estado, true);
  } catch (erro) {
    console.error(`Falha ao baixar o mapa de ${estado.sigla}:`, erro);
    pintarLinhaDeMapa(linha, estado, false);
    sub.textContent = "Não deu para baixar. Confira sua conexão.";
  }
  await atualizarBotaoBaixarTodosMapas();
}

async function atualizarBotaoBaixarTodosMapas() {
  const botao = document.getElementById("btn-baixar-todos-mapas");
  if (!botao) return;
  const estados = await estadosComMapaBaixavel();
  const faltando = [];
  for (const estado of estados) {
    if (!(await mapaEstadualJaBaixado(estado.sigla))) faltando.push(estado);
  }
  // Com tudo baixado o botão não teria o que fazer -- some em vez de
  // ficar lá desabilitado sem explicação.
  botao.classList.toggle("oculto", faltando.length === 0);
  botao.textContent = `⬇️ Baixar todos (${faltando.length})`;
  botao.onclick = async () => {
    botao.disabled = true;
    const lista = document.getElementById("mapas-estado-lista");
    // Em série, não em paralelo: dois downloads grandes ao mesmo tempo
    // numa conexão de estrada só fazem os dois demorarem mais.
    for (const estado of faltando) {
      const linha = lista.querySelector(`.mapa-estado-linha[data-sigla="${estado.sigla}"]`);
      if (linha) await baixarUmMapaNaLinha(linha, estado);
    }
    botao.disabled = false;
  };
}

/* ---- Mapa do estado onde a pessoa está ----
   A ideia do Paulo: o estado em que você ESTÁ vem sozinho; os outros
   você escolhe. Fica pendurado no obterLocalizacaoAtual (única porta de
   GPS do app) pra não pedir permissão de localização por conta própria
   -- aproveita a que a pessoa já concedeu por outro motivo. */
let jaTenteiBaixarMapaLocal = false;
let geoEstadosCache = null;

/* Quão longe da borda de um estado o ponto ainda conta como "dentro".
   Ver o porquê em siglaDoEstadoNoPonto. Em graus (~0,25° ≈ 28 km): o
   erro do contorno simplificado é de poucos quilômetros, e 28 km não
   alcança o estado vizinho a partir de uma cidade litorânea. */
const TOLERANCIA_BORDA_ESTADO = 0.25;

/**
 * Sigla do estado que contém o ponto, ou "" se não achar.
 *
 * ATENÇÃO ao contorno: o data/br-estados.geojson é a malha SIMPLIFICADA
 * (serve pro mapa do Brasil, que é uma miniatura). O anel do RJ tem 272
 * pontos pro estado inteiro -- a costa vira quase uma reta, e o Rio
 * capital, que fica numa reentrância, CAI FORA do polígono. Testado
 * aqui: Vassouras (interior) acerta, Rio de Janeiro não.
 *
 * Por isso, quando nenhum estado contém o ponto, aceita o estado cuja
 * borda estiver a menos de TOLERANCIA_BORDA_ESTADO -- resolve as
 * cidades litorâneas (Rio, Santos, Vitória...) sem deixar um ponto em
 * alto-mar virar palpite.
 */
async function siglaDoEstadoNoPonto(lat, lon) {
  if (!geoEstadosCache) {
    const resposta = await fetch("data/br-estados.geojson");
    geoEstadosCache = await resposta.json();
  }
  const estados = await carregarEstadosJson();
  const sigla = (feature) =>
    String(estados[feature.properties.codarea]?.sigla || "").toLowerCase();

  let maisPerto = "";
  let menorDistancia = Infinity;

  for (const feature of geoEstadosCache.features) {
    const geo = feature.geometry;
    // Um Polygon aqui é [anel externo, buracos...]; um MultiPolygon é
    // uma lista desses. Só o anel externo interessa: nenhum estado tem
    // buraco de verdade, e ilhas vêm como polígonos separados.
    const partes = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
    if (partes.some((p) => pontoDentroDoAnel(lon, lat, p[0]))) return sigla(feature);

    for (const parte of partes) {
      for (const [x, y] of parte[0]) {
        const d = Math.hypot(x - lon, y - lat);
        if (d < menorDistancia) {
          menorDistancia = d;
          maisPerto = sigla(feature);
        }
      }
    }
  }

  return menorDistancia <= TOLERANCIA_BORDA_ESTADO ? maisPerto : "";
}

/**
 * Se a pessoa está num estado cujo mapa não veio no app, baixa em
 * silêncio -- uma vez por sessão.
 *
 * Só em conexão que não seja tarifada: `saveData` (Economia de dados
 * ligada) e 2g/3g barram. São ~2 MB, e o público do app usa isso na
 * estrada -- gastar o plano de dados de alguém sem pedir seria abuso.
 * Quem quiser assim mesmo tem o botão em Configurações.
 */
async function talvezBaixarMapaDoMeuEstado(lat, lon) {
  if (jaTenteiBaixarMapaLocal) return;
  jaTenteiBaixarMapaLocal = true;
  try {
    const rede = navigator.connection;
    if (rede?.saveData) return;
    if (rede?.effectiveType && /^(slow-)?2g$|^3g$/.test(rede.effectiveType)) return;

    const sigla = await siglaDoEstadoNoPonto(lat, lon);
    if (!sigla) return;
    const temMapa = (await estadosComMapaBaixavel()).some((e) => e.sigla === sigla);
    if (!temMapa || (await mapaEstadualJaBaixado(sigla))) return;

    await baixarMapaDoEstado(sigla);
    console.log(`Mapa de ${sigla.toUpperCase()} baixado (estado atual).`);
    await renderizarMapasDeEstado();
  } catch (erro) {
    // Falhou? Sem barulho: ninguém pediu esse download. O botão em
    // Configurações continua lá.
    console.warn("Não deu para baixar o mapa do estado atual:", erro);
  }
}

/* Aviso pequeno de "em desenvolvimento": aparece ao abrir um mapa estadual
   e some sozinho depois de alguns segundos (ou no ✕). */
let timerPopupDevEstadual = null;
function mostrarPopupDevEstadual() {
  const popup = document.getElementById("estado-popup-dev");
  document.getElementById("estado-popup-nome").textContent = nomeDoEstadoAberto || "Este estado";
  popup.classList.remove("oculto");
  clearTimeout(timerPopupDevEstadual);
  timerPopupDevEstadual = setTimeout(esconderPopupDevEstadual, 6000);
}
function esconderPopupDevEstadual() {
  clearTimeout(timerPopupDevEstadual);
  document.getElementById("estado-popup-dev").classList.add("oculto");
}

/* Aviso flutuante ao tocar num município do mapa estadual (some sozinho). */
let timerToastEstadual = null;
/** Aviso flutuante do mapa estadual, com o texto que vier. */
function mostrarAvisoEstadual(texto) {
  const toast = document.getElementById("estado-toast");
  toast.textContent = texto;
  toast.classList.remove("oculto");
  clearTimeout(timerToastEstadual);
  timerToastEstadual = setTimeout(() => toast.classList.add("oculto"), 2600);
}

/** O aviso de tocar num município (some sozinho). */
function mostrarToastEstadual(nome) {
  const toast = document.getElementById("estado-toast");
  toast.textContent = `${nome} — em desenvolvimento. Em breve dá pra raspar!`;
  toast.classList.remove("oculto");
  clearTimeout(timerToastEstadual);
  timerToastEstadual = setTimeout(() => toast.classList.add("oculto"), 2600);
}

/**
 * Pan/zoom PRÓPRIO do mapa estadual -- independente do motor do RJ
 * (inicializarPanZoomDoMapa), que é acoplado ao #mapa-rj e a toda a
 * lógica de raspar/colorir/regiões. Aqui é só um mapa navegável de
 * visualização: arrastar move, roda/pinça dá zoom, os nomes aparecem
 * ao aproximar (classe .mostrar-rotulos, igual ao RJ) e tocar num
 * município mostra um aviso -- nunca abre raspadinha.
 *
 * Os listeners são anexados ao #estado-viewport UMA vez (o SVG lá dentro
 * é trocado a cada abertura, e a sigla junto, então a gente consulta o
 * <svg> vivo em vez de guardar referência).
 */
function inicializarPanZoomEstadual() {
  const viewport = document.getElementById("estado-viewport");
  const ESCALA_MAXIMA = 80;
  const LIMIAR_ARRASTO = 5;
  // Fração mínima da TELA coberta por mapa -- mesma regra do RJ, e pelo
  // mesmo motivo (ver limitarDesloc em inicializarPanZoomDoMapa).
  const FRACAO_MINIMA_VISIVEL = 0.1;
  // Abaixo disto (mapa afastado) mostra as 15 mesorregiões coloridas
  // com o nome; acima, os municípios cinza individualmente.
  const LIMIAR_REGIOES = 2.4;
  /* Zoom em que cada NÍVEL de rótulo é revelado. Tem que bater com o
     FAIXAS_ROTULO de tools/geojson-municipios-to-svg.js, que é quem
     carimba o data-nivel de cada município.

     Era um limiar único (7) pra todo mundo, e 86,8% dos municípios já
     caberiam antes disso -- Altamira ficava escondido por 15x mais zoom
     do que precisava. Agora o município ganha nome quando fica largo o
     bastante na tela, e a fonte é a maior que couber nele.

     A primeira faixa começa depois do LIMIAR_REGIOES (2.4): abaixo
     disso o mapa está em modo regiões, sem divisa de município, e nome
     ali é nome sobre um mapa que não está mostrando municípios. */
  const ZOOM_ROTULO_ESTADUAL = [2.6, 4.5, 8, 14, 24];
  /* Zoom em que cada degrau de afinamento da divisa entra (classes
     .zoom-n1 a .zoom-n4). Vai até bem mais fundo que o do RJ porque
     aqui o mapa vai até 80x, contra 40x lá. */
  const ZOOM_TRACO_ESTADUAL = [3, 8, 18, 35];
  /* Zoom em que vale a pena trocar a malha simplificada pela cheia.
     A conta: o viewBox tem 800 de largura numa tela de ~375, então uma
     unidade do desenho vale 0,47 x zoom pixels. A simplificação de
     longe é de 0.3 unidade, ou seja 0,14 x zoom pixels -- ela só começa
     a aparecer a partir do zoom ~7. Troco em 6, um pouco antes. */
  const ZOOM_DETALHE_ESTADUAL = 6;

  let escala = 1;
  let deslocX = 0;
  let deslocY = 0;
  let arrastouEstadual = false;

  // Sem id fixo: o SVG injetado é #mapa-sp, #mapa-mg... conforme o
  // estado aberto. Pegar o primeiro <svg> do viewport serve pra todos.
  const svgAtual = () => viewport.querySelector("svg");

  function limitarDesloc() {
    const rect = viewport.getBoundingClientRect();
    const caixa = svgAtual()?.viewBox?.baseVal;
    const ajuste = caixa && caixa.width ? Math.min(rect.width / caixa.width, rect.height / caixa.height) : 1;
    const desenhoLargura = (caixa?.width || rect.width) * ajuste * escala;
    const desenhoAltura = (caixa?.height || rect.height) * ajuste * escala;
    const limiteX = desenhoLargura / 2 + rect.width * (0.5 - FRACAO_MINIMA_VISIVEL);
    const limiteY = desenhoAltura / 2 + rect.height * (0.5 - FRACAO_MINIMA_VISIVEL);
    deslocX = Math.max(-limiteX, Math.min(limiteX, deslocX));
    deslocY = Math.max(-limiteY, Math.min(limiteY, deslocY));
  }

  function aplicarTransform() {
    limitarDesloc();
    const svg = svgAtual();
    if (!svg) return;
    svg.style.transform = `translate(${deslocX}px, ${deslocY}px) scale(${escala})`;
    // Afastado -> mesorregiões coloridas; aproximado -> municípios.
    /* Modo regiões só faz sentido se o estado TIVER regiões. Ele apaga
       as bordas dos municípios e mostra o contorno das mesorregiões no
       lugar; num estado sem elas -- o DF, cujas divisões são as Regiões
       Administrativas e não têm agrupamento acima -- o mapa afastado
       virava uma mancha cinza sem divisa nenhuma. */
    svg.classList.toggle(
      "modo-regioes",
      escala < LIMIAR_REGIOES && !!svg.querySelector(".contornos-regioes")
    );
    // Nomes dos municípios só bem no zoom.
    // Cada nível de rótulo entra na sua faixa (ver ZOOM_ROTULO_ESTADUAL).
    for (let n = 0; n < ZOOM_ROTULO_ESTADUAL.length; n++) {
      svg.classList.toggle(`rot-n${n}`, escala >= ZOOM_ROTULO_ESTADUAL[n]);
    }

    /* O CSS divide a espessura das divisas e o tamanho das letras por
       isto, deixando os dois constantes NA TELA em qualquer zoom -- é o
       mesmo mecanismo do mapa do RJ (ver atualizarModoDeVisualizacao). */
    svg.style.setProperty("--zoom", escala.toFixed(2));
    for (let n = 0; n < ZOOM_TRACO_ESTADUAL.length; n++) {
      svg.classList.toggle(`zoom-n${n + 1}`, escala >= ZOOM_TRACO_ESTADUAL[n]);
    }
    // Malha cheia só de perto; de longe fica a simplificada, 7x mais
    // leve e visualmente idêntica (ver #mun-simples em css/styles.css).
    svg.classList.toggle("detalhe-perto", escala >= ZOOM_DETALHE_ESTADUAL);
  }

  function aplicarZoomAncorado(novaEscala, ancoraX, ancoraY) {
    const rect = viewport.getBoundingClientRect();
    const origemX = rect.width / 2;
    const origemY = rect.height / 2;
    const fator = novaEscala / escala;
    deslocX = ancoraX - origemX - fator * (ancoraX - deslocX - origemX);
    deslocY = ancoraY - origemY - fator * (ancoraY - deslocY - origemY);
    escala = novaEscala;
  }

  function distanciaEMeio(touches) {
    const [a, b] = touches;
    return {
      distancia: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      meioX: (a.clientX + b.clientX) / 2,
      meioY: (a.clientY + b.clientY) / 2,
    };
  }

  // Chamado a cada abertura pra começar sempre "de longe", centralizado.
  resetarZoomEstadual = () => {
    escala = 1;
    deslocX = 0;
    deslocY = 0;
    aplicarTransform();
  };

  /* Centraliza um município e aproxima -- é o que a lupa usa no mapa
     estadual. Fica aqui dentro porque só daqui se enxerga `escala` e os
     deslocamentos; o mundo lá fora chama pela variável exposta. */
  focarMunicipioEstadual = (id) => {
    const svg = svgAtual();
    if (!svg) return;
    /* Mede na camada que está RENDERIZADA. getBBox() num elemento com
       display:none devolve tudo zero, e a camada de detalhe está
       justamente escondida no zoom em que a pessoa usa a lupa -- o mapa
       voaria pro canto superior esquerdo. */
    const camada = svg.classList.contains("detalhe-perto") ? "#mun-detalhe" : "#mun-simples";
    const alvo = svg.querySelector(`${camada} [data-municipio="${id}"]`);
    if (!alvo) return;
    const caixa = alvo.getBBox();
    if (!caixa.width && !caixa.height) return;
    const vb = svg.viewBox.baseVal;
    const rect = viewport.getBoundingClientRect();
    const ajuste = Math.min(rect.width / vb.width, rect.height / vb.height);

    // Zoom que faz o município ocupar ~60% da menor dimensão da tela,
    // preso entre "dá pra ver o vizinho" e o teto do mapa.
    const alvoNaTela = 0.6 * Math.min(rect.width, rect.height);
    escala = Math.max(
      ZOOM_DETALHE_ESTADUAL,
      Math.min(40, alvoNaTela / (Math.max(caixa.width, caixa.height) * ajuste))
    );

    // Do centro do desenho até o centro do município, em pixels de tela.
    const cx = (caixa.x + caixa.width / 2 - vb.width / 2) * ajuste;
    const cy = (caixa.y + caixa.height / 2 - vb.height / 2) * ajuste;
    deslocX = -cx * escala;
    deslocY = -cy * escala;
    aplicarTransform();
  };

  // ---- Mouse ----
  let arrastando = false;
  let inicioX = 0, inicioY = 0, deslocXIni = 0, deslocYIni = 0;

  viewport.addEventListener("mousedown", (evento) => {
    arrastando = true;
    arrastouEstadual = false;
    inicioX = evento.clientX;
    inicioY = evento.clientY;
    deslocXIni = deslocX;
    deslocYIni = deslocY;
    viewport.classList.add("arrastando");
  });
  window.addEventListener("mousemove", (evento) => {
    if (!arrastando) return;
    const dx = evento.clientX - inicioX;
    const dy = evento.clientY - inicioY;
    if (Math.abs(dx) > LIMIAR_ARRASTO || Math.abs(dy) > LIMIAR_ARRASTO) arrastouEstadual = true;
    deslocX = deslocXIni + dx;
    deslocY = deslocYIni + dy;
    aplicarTransform();
  });
  window.addEventListener("mouseup", () => {
    arrastando = false;
    viewport.classList.remove("arrastando");
  });

  viewport.addEventListener(
    "wheel",
    (evento) => {
      evento.preventDefault();
      const fator = evento.deltaY < 0 ? 1.15 : 1 / 1.15;
      const novaEscala = Math.min(ESCALA_MAXIMA, Math.max(1, escala * fator));
      const rect = viewport.getBoundingClientRect();
      aplicarZoomAncorado(novaEscala, evento.clientX - rect.left, evento.clientY - rect.top);
      aplicarTransform();
    },
    { passive: false }
  );

  // ---- Toque ----
  let toqueDist = 0;
  viewport.addEventListener("touchstart", (evento) => {
    if (evento.touches.length === 1) {
      arrastando = true;
      arrastouEstadual = false;
      inicioX = evento.touches[0].clientX;
      inicioY = evento.touches[0].clientY;
      deslocXIni = deslocX;
      deslocYIni = deslocY;
    } else if (evento.touches.length === 2) {
      arrastando = false;
      toqueDist = distanciaEMeio([...evento.touches]).distancia;
    }
  }, { passive: true });

  viewport.addEventListener("touchmove", (evento) => {
    if (evento.touches.length === 1 && arrastando) {
      const dx = evento.touches[0].clientX - inicioX;
      const dy = evento.touches[0].clientY - inicioY;
      if (Math.abs(dx) > LIMIAR_ARRASTO || Math.abs(dy) > LIMIAR_ARRASTO) arrastouEstadual = true;
      deslocX = deslocXIni + dx;
      deslocY = deslocYIni + dy;
      aplicarTransform();
    } else if (evento.touches.length === 2) {
      evento.preventDefault();
      const { distancia, meioX, meioY } = distanciaEMeio([...evento.touches]);
      if (toqueDist > 0) {
        const novaEscala = Math.min(ESCALA_MAXIMA, Math.max(1, escala * (distancia / toqueDist)));
        const rect = viewport.getBoundingClientRect();
        aplicarZoomAncorado(novaEscala, meioX - rect.left, meioY - rect.top);
        aplicarTransform();
      }
      toqueDist = distancia;
      arrastouEstadual = true;
    }
  }, { passive: false });

  viewport.addEventListener("touchend", (evento) => {
    if (evento.touches.length === 0) arrastando = false;
    toqueDist = 0;
  });

  // Duplo clique/toque reseta o zoom.
  viewport.addEventListener("dblclick", () => resetarZoomEstadual());

  // Clique num município (delegação): mostra o aviso, nunca raspa. Se o
  // gesto foi um arrasto, ignora (não é um toque de seleção).
  viewport.addEventListener("click", (evento) => {
    if (arrastouEstadual) return;
    const alvo = evento.target.closest(".municipio");
    if (!alvo) return;
    mostrarToastEstadual(alvo.dataset.nome);
  });
}

/**
 * Abre/fecha a "janela suspensa" com os botões da lateral esquerda
 * (perfil, ranking, amigos, conquistas, check-in, mapa do Brasil) --
 * antes ficavam todos soltos e sempre visíveis; agora só a setinha
 * fica sempre à mostra, e apertar ela expande/recolhe o resto, pra
 * não lotar a tela com muitos botões flutuantes de uma vez.
 */
function alternarBotoesLaterais() {
  const lista = document.getElementById("botoes-lateral-lista");
  const botao = document.getElementById("btn-toggle-lateral");
  const abrindo = lista.classList.contains("recolhido");

  lista.classList.toggle("recolhido", !abrindo);
  botao.textContent = abrindo ? "◂" : "▸";
  botao.setAttribute("aria-expanded", abrindo ? "true" : "false");
}

/* ============================================================
   Comunidade Desbrava: rede social com posts (foto + legenda),
   @menção de município/pessoa, curtir, comentar, compartilhar e
   feed Global/Amigos. Fotos ficam PROVISORIAMENTE no Google Drive
   (link "qualquer pessoa com o link pode ver", ver
   subirFotoPostParaDrive em js/auth.js) enquanto o projeto não migrar
   pro plano Blaze do Firebase -- não checa login pra ver a foto, ao
   contrário do plano original (Firebase Storage, getBytes+blob, nunca
   getDownloadURL). Ver README.md.
   ============================================================ */

/**
 * Slug determinístico "municipioNomeSemAcento" a partir do nome real
 * (ex: "São Gonçalo" -> "municipioSaoGoncalo", "Rio de Janeiro" ->
 * "municipioRiodeJaneiro"), usado como @menção de município na
 * legenda. Mesmo prefixo que comecaComPrefixoReservado (js/auth.js)
 * proíbe em apelido de pessoa, pra não dar conflito de @.
 */
function slugMunicipio(nome) {
  return (
    "municipio" +
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z]/g, "")
  );
}

/**
 * Monta slugParaMunicipioId/idParaNomeMunicipio a partir do próprio
 * SVG do mapa (mesmos data-municipio/data-nome já usados em
 * construirIndiceBusca), sem precisar de nenhum arquivo novo, e
 * preenche o <select> de marcar município do formulário de criar post.
 */
function construirSlugsDeMunicipios() {
  document.querySelectorAll("#mapa-rj .municipio").forEach((path) => {
    const id = path.dataset.municipio;
    const nome = path.dataset.nome;
    if (!id || !nome) return;
    slugParaMunicipioId[slugMunicipio(nome)] = id;
    idParaNomeMunicipio[id] = nome;
  });
  // Antes daqui saía um preencherSelectMunicipiosPost(): o <select> de
  // município do Novo Post virou o seletor com busca, que lê
  // idParaNomeMunicipio direto na hora de abrir.
}

/**
 * Abre o painel lateral, opcionalmente já filtrado por município (id
 * do IBGE) -- usado tanto pelo botão da barra de topo (sem filtro)
 * quanto pelo botão "@" no popup do município (com filtro).
 */
function abrirPainelSocial(municipioId = null, { pontoId = null, rotuloPonto = "" } = {}) {
  /* Sair do post aberto ao trocar de contexto. Sem isto, tocar no
     município dentro do post reabria a Comunidade filtrada COM o post
     ainda por cima -- e tocar no autor abria o perfil (z-index 100)
     ATRÁS do post (120). Fechar aqui e no fechar resolve os dois de uma
     vez, em vez de espalhar a limpeza por cada botão do card. */
  fecharDetalheDoPost();
  filtroMunicipioSocialId = municipioId || null;
  filtroPontoSocialId = pontoId || null;
  const filtroEl = document.getElementById("social-filtro-municipio");
  if (filtroPontoSocialId) {
    document.getElementById("social-filtro-municipio-nome").textContent = `📍 ${rotuloPonto}`;
    filtroEl.classList.remove("oculto");
  } else if (filtroMunicipioSocialId) {
    document.getElementById("social-filtro-municipio-nome").textContent =
      `📍 ${idParaNomeMunicipio[filtroMunicipioSocialId] || ""}`;
    filtroEl.classList.remove("oculto");
  } else {
    filtroEl.classList.add("oculto");
  }

  document.getElementById("modal-social").classList.remove("oculto");
  fecharModalNovoPost();
  carregarFeedSocial(true);
}

function fecharPainelSocial() {
  fecharDetalheDoPost();
  document.getElementById("modal-social").classList.add("oculto");
  revogarBlobsDeFotosPosts();
}

function revogarBlobsDeFotosPosts() {
  blobUrlsFotosPosts.forEach((url) => URL.revokeObjectURL(url));
  blobUrlsFotosPosts = [];
}

function alternarAbaSocial(aba) {
  abaSocialAtual = aba;
  document.getElementById("btn-social-global").classList.toggle("social-aba-ativa", aba === "global");
  document.getElementById("btn-social-amigos").classList.toggle("social-aba-ativa", aba === "amigos");
  carregarFeedSocial(true);
}

/**
 * Carrega o feed (Global paginado, ou Amigos filtrado no cliente --
 * mesmo padrão já usado na aba Amigos do Ranking, ver carregarRanking:
 * busca listarAmigos() e cruza com os posts recentes, em vez de um
 * "where in" no Firestore, que tem limite de 10 itens).
 */
async function carregarFeedSocial(resetar) {
  const feedEl = document.getElementById("social-feed");
  const btnMais = document.getElementById("btn-social-carregar-mais");

  if (resetar) {
    revogarBlobsDeFotosPosts();
    cursorFeedSocial = null;
    feedSocialAcabou = false;
    feedEl.innerHTML = '<div class="spinner spinner-grande"></div>';
  }

  try {
    let posts;
    if (abaSocialAtual === "amigos") {
      const [amigos, resultado] = await Promise.all([
        window.raspadinhaAuth.listarAmigos(),
        window.raspadinhaAuth.buscarFeedGlobal({
          municipioId: filtroMunicipioSocialId,
          pontoId: filtroPontoSocialId,
          limiteN: 50,
        }),
      ]);
      const uidsAmigos = new Set(amigos.map((a) => a.uid));
      const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
      posts = resultado.posts.filter((p) => uidsAmigos.has(p.autorUid) || p.autorUid === meuUid);
      feedSocialAcabou = true; // aba Amigos não pagina, ver comentário acima
    } else {
      const resultado = await window.raspadinhaAuth.buscarFeedGlobal({
        municipioId: filtroMunicipioSocialId,
        pontoId: filtroPontoSocialId,
        cursor: resetar ? null : cursorFeedSocial,
      });
      posts = resultado.posts;
      cursorFeedSocial = resultado.proximoCursor;
      feedSocialAcabou = !resultado.proximoCursor;
    }

    /* A Comunidade é a do mapa ATIVO. O estado sai dos 2 primeiros
       dígitos do código IBGE do município do post -- nada de campo novo
       nem migração do que já está no Firestore.

       Post sem município fica de fora do recorte: ele não pertence a
       estado nenhum, e deixá-lo aparecer em todos faria o feed de Minas
       nascer com conversa do Rio. O filtro é no cliente porque a
       consulta já vem paginada de lá; com estado publicado e volume de
       verdade, isso vira índice no Firestore. */
    const prefixo = await prefixoIbgeDoEstado(estadoAtual);
    if (prefixo) posts = posts.filter((p) => ehDoEstado(p.municipioId, prefixo));

    if (resetar) {
      feedEl.innerHTML = posts.length
        ? ""
        : emEstadoLimitado()
          ? `<p>Ainda não há posts de ${escaparHtml(nomeDoEstadoAberto)}. Seja o primeiro!</p>`
          : "<p>Nenhum post por aqui ainda. Seja o primeiro a postar!</p>";
    }
    if (posts.length) distribuirNoMosaico(feedEl, posts, resetar);
    btnMais.classList.toggle("oculto", feedSocialAcabou);
  } catch (erro) {
    console.error("Falha ao carregar feed social:", erro);
    if (resetar) feedEl.innerHTML = "<p>Não foi possível carregar os posts agora.</p>";
  }
}

/**
 * Monta o card de um post: foto (post.fotoUrl, provisoriamente no
 * Drive -- ver subirFotoPostParaDrive em js/auth.js), chip de
 * município clicável, curtir/comentar/compartilhar e excluir (só pro
 * autor).
 */
/** Iniciais pro avatar (1a letra do primeiro e do último nome). */
function iniciaisApelido(nome) {
  const partes = String(nome || "?").trim().split(/\s+/).filter(Boolean);
  const a = partes[0]?.[0] || "?";
  const b = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (a + b).toUpperCase();
}

/** Gradiente determinístico pro avatar, derivado do texto (mesma
 *  pessoa = mesma cor sempre). */
function corAvatar(texto) {
  let h = 0;
  for (const c of String(texto || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 58% 46%), hsl(${(h + 40) % 360} 62% 40%))`;
}

/**
 * Preenche um elemento de avatar (topo, perfil, etc.) com a foto de
 * perfil escolhida: uma foto enviada (tipo "foto"), um selo já
 * conquistado (tipo "selo", com a arte dourada se dourado:true), ou,
 * na ausência de escolha, as iniciais sobre o gradiente de sempre.
 */
function aplicarAvatar(el, fotoPerfil, apelido) {
  if (!el) return;
  const nome = apelido || "";

  if (fotoPerfil && fotoPerfil.tipo === "foto" && fotoPerfil.url) {
    el.style.background = "";
    el.style.fontSize = "";
    el.innerHTML = '<img class="avatar-img" alt="Foto de perfil">';
    aplicarFotoComFallback(el.querySelector(".avatar-img"), fotoPerfil.url);
    return;
  }

  if (fotoPerfil && fotoPerfil.tipo === "selo" && fotoPerfil.seloId) {
    el.style.background = fotoPerfil.dourado ? "#12351F" : "#0F1216";
    el.style.fontSize = "";
    el.innerHTML = `<img class="avatar-img avatar-img-selo" alt="Selo de perfil">`;
    const img = el.querySelector("img");
    const nomeSelo =
      document.querySelector(`#mapa-rj .municipio[data-municipio="${fotoPerfil.seloId}"]`)?.dataset.nome || "";
    resolverImagemColorida(`assets/img/selos/${fotoPerfil.seloId}`, !!fotoPerfil.dourado, fotoPerfil.seloId, nomeSelo).then(
      (r) => {
        if (img) img.src = r.url;
      }
    );
    return;
  }

  // Padrão: iniciais sobre gradiente determinístico.
  el.innerHTML = "";
  el.textContent = nome ? iniciaisApelido(nome) : "👤";
  el.style.background = nome ? corAvatar(nome) : "";
  el.style.fontSize = nome ? "" : "1rem";
}

/** "agora", "5 min", "2 h", "3 d" ou a data -- pro horário do post. */
function tempoRelativo(ts) {
  const d = ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : ts instanceof Date ? ts : null);
  if (!d) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 604800) return `${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/* ============================================================
   COMUNIDADE EM GRADE (mosaico de 2 colunas)

   O feed era uma coluna só, com a foto ocupando quase a tela inteira:
   três posts e a pessoa já tinha rolado a tela toda. Vira mosaico, e o
   card passa a ser A FOTO -- nome, curtidas e o resto vão pra um
   sobreposto discreto, e o conteúdo completo abre em tela cheia.

   DUAS COLUNAS DE VERDADE, e não `column-count: 2`. A propriedade do
   CSS preenche a primeira coluna inteira antes de começar a segunda:
   num feed em ordem de tempo, isso jogaria TODOS os posts mais novos na
   coluna da esquerda e os mais velhos na direita. Com dois contêineres
   e cada post indo pro que estiver mais curto, a leitura continua indo
   da esquerda pra direita, como a pessoa espera.
   ============================================================ */

/* Rolou pra baixo: o chip das Sugestões se recolhe e a foto ganha a
   tela. Subiu: ele volta. A folga de 6px evita que tremidas do dedo
   fiquem ligando e desligando o chip. */
let ultimaRolagemSocial = 0;

function aoRolarFeedSocial() {
  const caixa = document.getElementById("social-conteudo");
  const chip = document.getElementById("btn-atalho-sugestoes");
  if (!caixa || !chip) return;
  const agora = caixa.scrollTop;

  /* Perto do topo ele SEMPRE volta, e essa checagem vem antes da folga
     de propósito: com ela depois, um salto direto pro topo (trocar de
     aba recarrega o feed e zera a rolagem de uma vez) caía na folga,
     saía da função e deixava o chip escondido pra sempre. */
  if (agora <= 48) {
    chip.classList.remove("chip-escondido");
    ultimaRolagemSocial = agora;
    return;
  }

  // Folga contra tremida de dedo: sem ela o chip pisca ligando e
  // desligando a cada pixel.
  if (Math.abs(agora - ultimaRolagemSocial) < 6) return;
  chip.classList.toggle("chip-escondido", agora > ultimaRolagemSocial);
  ultimaRolagemSocial = agora;
}

/** Cria (ou reaproveita) as duas colunas dentro do feed. */
function colunasDoFeed(feedEl, recriar) {
  let colunas = [...feedEl.querySelectorAll(".feed-coluna")];
  if (recriar || colunas.length !== 2) {
    feedEl.innerHTML = "";
    colunas = [0, 1].map(() => {
      const c = document.createElement("div");
      c.className = "feed-coluna";
      feedEl.appendChild(c);
      return c;
    });
  }
  return colunas;
}

/**
 * Espalha os posts nas duas colunas, cada um na mais curta do momento.
 *
 * Limite conhecido: a altura só é definitiva depois que a foto carrega,
 * e o post não guarda as dimensões da imagem. Enquanto ela não vem, o
 * card usa uma proporção provisória (ver .feed-item-carregando no CSS),
 * então o equilíbrio das colunas é aproximado. Guardar largura e altura
 * no post na hora de publicar resolveria isso de vez -- e de quebra
 * acabaria com o pulo do layout quando a imagem chega.
 */
function distribuirNoMosaico(feedEl, posts, resetar) {
  const colunas = colunasDoFeed(feedEl, resetar);
  posts.forEach((post) => {
    const menor = colunas[0].offsetHeight <= colunas[1].offsetHeight ? colunas[0] : colunas[1];
    menor.appendChild(cardDeGrade(post));
  });
}

/** O card do mosaico: a foto, e por cima dela o mínimo pra identificar. */
function cardDeGrade(post) {
  const item = document.createElement("article");
  item.className = "feed-item";
  item.dataset.postId = post.id;
  item.tabIndex = 0;
  item.setAttribute("role", "button");

  const curtidas = (post.curtidoPor || []).length;
  const temFoto = Boolean(post.fotoUrl || post.fotoStoragePath);
  item.setAttribute(
    "aria-label",
    `Post de ${post.autorApelido}${post.texto ? ": " + post.texto.slice(0, 60) : ""}. ${curtidas} curtida(s). Toque para abrir.`
  );

  const sobreposto = `
    <div class="feed-item-info">
      <span class="feed-item-avatar"></span>
      <span class="feed-item-nome">${escaparHtml(post.autorApelido)}</span>
      ${
        post.autorGrupo
          ? `<img class="feed-item-brasao" src="${escaparHtml(urlDoBrasao(post.autorGrupo))}" alt="">`
          : ""
      }
      <span class="feed-item-curtidas">${ICONE_CORACAO}${curtidas}</span>
    </div>`;

  if (temFoto) {
    item.classList.add("feed-item-carregando");
    item.innerHTML = `<img class="feed-item-foto" alt="">${sobreposto}`;
    const img = item.querySelector(".feed-item-foto");
    /* A proporção provisória sai assim que a imagem chega -- é isso que
       deixa o mosaico ter fotos em pé e deitadas sem cortar nenhuma. */
    img.addEventListener("load", () => item.classList.remove("feed-item-carregando"), { once: true });
    if (post.fotoUrl) aplicarFotoComFallback(img, post.fotoUrl);
    else if (post.fotoStoragePath) {
      // Mesmo caminho do card antigo: o blob entra na lista que
      // revogarBlobsDeFotosPosts limpa ao recarregar o feed.
      window.raspadinhaAuth.buscarFotoPost(post.fotoStoragePath).then((url) => {
        if (!url) return;
        aplicarFotoComFallback(img, url);
        blobUrlsFotosPosts.push(url);
      });
    }
  } else {
    /* Post sem foto não vira buraco na grade: vira cartão de texto.
       Hoje todos os caminhos de publicação exigem foto, mas o app já
       tratava esse caso -- e post antigo, ou upload que falhou, não
       pode sumir do feed. */
    item.classList.add("feed-item-so-texto");
    item.innerHTML = `<p class="feed-item-texto">${escaparHtml(post.texto || "")}</p>${sobreposto}`;
  }

  /* Foto de perfil de verdade, ou o SELO que a pessoa escolheu -- é o
     mesmo aplicarAvatar do resto do app, então os três casos (foto,
     selo, iniciais) saem daqui sem código próprio. Post antigo não tem
     o campo e cai nas iniciais sozinho. */
  aplicarAvatar(item.querySelector(".feed-item-avatar"), post.autorFotoPerfil, post.autorApelido);

  item.addEventListener("click", (e) => {
    // pointerType vazio/mouse = veio de mouse ou teclado. Toque já foi
    // resolvido no touchend.
    if (e.detail === 0 || !("ontouchstart" in window)) abrirDetalheDoPost(post);
  });
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      abrirDetalheDoPost(post);
    }
  });
  ligarGestoDeEspiar(item, post);
  return item;
}

/* ---- Tela cheia do post ----

   Reaproveita renderizarCardPost, a MESMA função do feed antigo e da
   tela de post por link. Não é preguiça: ali dentro estão comentários,
   menções, denúncia, excluir, filtro por município e compartilhar --
   reescrever isso numa segunda tela seria duplicar comportamento que já
   funciona e criar dois lugares pra corrigir cada bug. */
function abrirDetalheDoPost(post) {
  const modal = document.getElementById("modal-post-detalhe");
  const corpo = document.getElementById("post-detalhe-corpo");
  if (!modal || !corpo) return;
  corpo.innerHTML = "";
  corpo.appendChild(renderizarCardPost(post));
  modal.classList.remove("oculto");
  document.body.classList.add("com-post-aberto");
}

function fecharDetalheDoPost() {
  const modal = document.getElementById("modal-post-detalhe");
  if (!modal) return;
  fecharComAnimacao(modal);
  document.body.classList.remove("com-post-aberto");
  // A foto do detalhe pode ser blob: soltar evita segurar memória.
  document.getElementById("post-detalhe-corpo").innerHTML = "";
}

/* ============================================================
   ESPIAR E AGIR (toque longo + arrasto)

   Segurar levanta a foto pro centro; arrastar pra direita curte, pra
   esquerda compartilha; soltar dispara. Toque rápido abre o post.

   TOUCH EVENTS, e não Pointer Events -- a primeira versão usava
   pointer e o arrasto não chegava. O motivo: durante a espiada o dedo
   fica sobre a camada da espiada, e o pointermove passa a ser entregue
   a quem estiver embaixo do dedo, não ao card onde o gesto começou. O
   setPointerCapture deveria resolver, mas ele falha calado quando o
   navegador já considerou o gesto dele.

   touchmove NÃO tem esse problema: uma vez que o touchstart aconteceu
   num elemento, TODOS os eventos daquele toque vão pra ele até o dedo
   sair, esteja o dedo onde estiver. É captura implícita, de graça.
   ============================================================ */

/* 250 ms separa tap de "segurar". Curto o bastante pra não parecer
   travado, e a rolagem fica protegida pela tolerância de movimento
   abaixo, não pelo relógio. */
const ESPIAR_MS = 250;
/* Andou mais que isso ANTES da espiada: é rolagem, cancela. */
const ESPIAR_TOLERANCIA_PX = 10;
/* Arrasto, JÁ espiando, que arma a ação. */
const ESPIAR_GATILHO_PX = 60;
/* Onde o ícone chega ao tamanho cheio. */
const ESPIAR_CURSO_PX = 130;

let espiada = null;

function ligarGestoDeEspiar(item, post) {
  let relogio = null;
  let inicio = null;
  let espiandoAqui = false;

  const cancelarRelogio = () => {
    clearTimeout(relogio);
    relogio = null;
  };

  const encerrarTudo = () => {
    cancelarRelogio();
    inicio = null;
    espiandoAqui = false;
  };

  item.addEventListener(
    "touchstart",
    (e) => {
      // Dois dedos é pinça do navegador, não gesto nosso.
      if (e.touches.length !== 1) {
        encerrarTudo();
        return;
      }
      const t = e.touches[0];
      inicio = { x: t.clientX, y: t.clientY };
      espiandoAqui = false;
      cancelarRelogio();
      relogio = setTimeout(() => {
        espiandoAqui = true;
        abrirEspiada(item, post);
      }, ESPIAR_MS);
    },
    { passive: true }
  );

  /* passive: false porque, JÁ espiando, este handler precisa cancelar a
     rolagem. O navegador só respeita preventDefault se o ouvinte for
     não-passivo desde o registro -- declarar depois não adianta. */
  item.addEventListener(
    "touchmove",
    (e) => {
      if (!inicio || !e.touches.length) return;
      const t = e.touches[0];
      const dx = t.clientX - inicio.x;
      const dy = t.clientY - inicio.y;

      if (!espiandoAqui) {
        // Ainda esperando os 250 ms: qualquer arrasto é ROLAGEM.
        if (Math.hypot(dx, dy) > ESPIAR_TOLERANCIA_PX) encerrarTudo();
        return;
      }

      // Espiando: o dedo é nosso, a tela não rola.
      e.preventDefault();
      moverEspiada(dx);
    },
    { passive: false }
  );

  item.addEventListener(
    "touchend",
    (e) => {
      if (!inicio) return;
      cancelarRelogio();

      /* preventDefault aqui é o que impede o CLIQUE SINTÉTICO que o
         navegador dispara depois do toque. Sem ele, o toque longo
         terminava abrindo o post por cima do gesto -- era o conflito
         entre tap e hold. */
      e.preventDefault();

      if (espiandoAqui) {
        const acao = espiada?.acao;
        fecharEspiada();
        if (acao === "curtir") curtirPeloGesto(post, item);
        else if (acao === "compartilhar") compartilharPost(post.id);
      } else {
        // Soltou antes dos 250 ms: é tap.
        abrirDetalheDoPost(post);
      }
      encerrarTudo();
    },
    { passive: false }
  );

  item.addEventListener(
    "touchcancel",
    () => {
      if (espiandoAqui) fecharEspiada();
      encerrarTudo();
    },
    { passive: true }
  );
}

function abrirEspiada(item, post) {
  const camada = document.getElementById("espiada");
  const palco = document.getElementById("espiada-palco");
  if (!camada || !palco) return;

  const original = item.querySelector(".feed-item-foto");
  palco.innerHTML = original
    ? `<img src="${escaparHtml(original.currentSrc || original.src)}" alt="">`
    : `<p class="espiada-texto">${escaparHtml(post.texto || "")}</p>`;

  camada.classList.remove("oculto");
  // Um quadro depois, pra a transição do CSS ter de onde partir.
  requestAnimationFrame(() => camada.classList.add("espiada-aberta"));
  navigator.vibrate?.(12);
  espiada = { acao: null };
}

/* MATEMÁTICA DO ARRASTO

   Só o eixo X interessa: dx é onde o dedo está agora menos onde ele
   pousou. O SINAL diz a ação (direita curte, esquerda compartilha) e o
   MÓDULO diz a intensidade.

   A intensidade vira fração de 0 a 1 dividindo pelo CURSO e limitando o
   teto. É ela que move a foto e cresce o ícone junto, fazendo o gesto
   parecer analógico em vez de um interruptor que liga ao cruzar a linha.

   A foto anda dx/3, e não dx: acompanhando o dedo inteiro ela sairia da
   tela antes de o gesto se completar. */
function moverEspiada(dx) {
  const camada = document.getElementById("espiada");
  const palco = document.getElementById("espiada-palco");
  if (!camada || !palco || !espiada) return;

  const intensidade = Math.min(1, Math.abs(dx) / ESPIAR_CURSO_PX);
  const armado = Math.abs(dx) >= ESPIAR_GATILHO_PX;
  espiada.acao = armado ? (dx > 0 ? "curtir" : "compartilhar") : null;

  palco.style.transform = `translateX(${dx / 3}px) scale(${1 - intensidade * 0.06})`;
  camada.dataset.acao = espiada.acao || "";
  camada.style.setProperty("--forca", intensidade.toFixed(3));
}

function fecharEspiada() {
  const camada = document.getElementById("espiada");
  const palco = document.getElementById("espiada-palco");
  espiada = null;
  if (!camada) return;
  camada.classList.remove("espiada-aberta");
  camada.dataset.acao = "";
  camada.style.removeProperty("--forca");
  if (palco) palco.style.transform = "";
  setTimeout(() => {
    camada.classList.add("oculto");
    if (palco) palco.innerHTML = "";
  }, 180);
}

/** Curtir pelo gesto: mesma função do botão, e o número no card segue. */
async function curtirPeloGesto(post, item) {
  const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
  if (!meuUid) {
    exigirLogin(() => {});
    return;
  }
  const jaCurtiu = (post.curtidoPor || []).includes(meuUid);
  if (jaCurtiu) {
    mostrarToastOndeEstou("Você já curtiu esse post.");
    return;
  }
  try {
    await window.raspadinhaAuth.curtirPost(post.id, true, post.autorUid);
    post.curtidoPor = [...(post.curtidoPor || []), meuUid];
    const contador = item.querySelector(".feed-item-curtidas");
    if (contador) contador.innerHTML = `${ICONE_CORACAO}${post.curtidoPor.length}`;
    navigator.vibrate?.(18);
  } catch (erro) {
    console.error("Falha ao curtir pelo gesto:", erro);
    mostrarToastOndeEstou("Não deu pra curtir agora.");
  }
}

function renderizarCardPost(post) {
  const card = document.createElement("div");
  card.className = "post-card";
  card.dataset.postId = post.id;

  const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
  const curtidoPor = post.curtidoPor || [];
  const curtido = curtidoPor.includes(meuUid);
  const souAutor = post.autorUid === meuUid;
  const nomeMunicipio = post.municipioId ? idParaNomeMunicipio[post.municipioId] : null;
  const marcados = post.pessoasMarcadas || [];
  const tempo = tempoRelativo(post.criadoEm);
  const nComentarios = post.numComentarios || 0;
  // Sem foto, a moldura NÃO entra: senão o post de texto puro ficaria
  // com um retângulo carregando pra sempre.
  const temFoto = Boolean(post.fotoUrl || post.fotoStoragePath);

  card.innerHTML = `
    <div class="post-topo">
      <div class="post-avatar"></div>
      <div class="post-ident">
        <span class="post-card-autor">${escaparHtml(post.autorApelido)}</span>
        ${
          post.autorGrupo
            ? `<img class="post-grupo-brasao" src="${escaparHtml(urlDoBrasao(post.autorGrupo))}" ` +
              `alt="Grupo ${escaparHtml(nomeDoMunicipio(post.autorGrupo))}" ` +
              `title="Grupo ${escaparHtml(nomeDoMunicipio(post.autorGrupo))}">`
            : ""
        }
        ${nomeMunicipio ? `<button type="button" class="post-card-municipio">📍 ${escaparHtml(nomeMunicipio)}</button>` : ""}
      </div>
      ${tempo ? `<span class="post-tempo">${tempo}</span>` : ""}
      ${meuUid ? '<button type="button" class="post-card-opcoes" aria-label="Opções">⋯</button>' : ""}
    </div>
    ${temFoto ? MOLDURA_FOTO_POST : ""}
    <div class="post-card-acoes">
      <button type="button" class="post-card-curtir${curtido ? " curtido" : ""}">${ICONE_CORACAO} <span class="post-card-curtidas">${curtidoPor.length}</span></button>
      <button type="button" class="post-card-comentar">${ICONE_COMENTAR} <span class="post-card-num-comentarios">${nComentarios}</span></button>
      <button type="button" class="post-card-compartilhar" aria-label="Compartilhar">${ICONE_COMPARTILHAR}</button>
    </div>
    <p class="post-card-legenda">${post.texto ? `<b>${escaparHtml(post.autorApelido)}</b> ${destacarMencoes(escaparHtml(post.texto))}` : ""}</p>
    ${marcados.length ? `<p class="post-card-marcados">Com ${marcados.map((p) => `<span class="post-mencao post-mencao-clicavel" data-uid="${escaparHtml(p.uid)}">@${escaparHtml(p.apelido)}</span>`).join(", ")}</p>` : ""}
    <button type="button" class="post-ver-comentarios${nComentarios > 0 ? "" : " oculto"}">${nComentarios === 1 ? "Ver 1 comentário" : `Ver todos os ${nComentarios} comentários`}</button>
    <div class="post-card-comentarios oculto">
      <div class="post-card-lista-comentarios"></div>
      <div class="post-card-novo-comentario">
        <input type="text" placeholder="Escreva um comentário..." maxlength="500">
        <button type="button">Enviar</button>
      </div>
    </div>
  `;

  aplicarAvatar(card.querySelector(".post-avatar"), post.autorFotoPerfil, post.autorApelido);

  // Provisório: posts novos trazem "fotoUrl" pronta (Drive, ver
  // subirFotoPostParaDrive em js/auth.js) -- só posts antigos (se
  // houver algum, de antes dessa mudança) ainda dependem de buscar a
  // foto do Storage de forma assíncrona.
  const imgEl = card.querySelector(".post-card-foto");
  if (post.fotoUrl) {
    aplicarFotoComFallback(imgEl, post.fotoUrl);
  } else if (post.fotoStoragePath) {
    window.raspadinhaAuth.buscarFotoPost(post.fotoStoragePath).then((url) => {
      if (!url) return;
      aplicarFotoComFallback(imgEl, url);
      blobUrlsFotosPosts.push(url);
    });
  }

  card.querySelector(".post-card-municipio")?.addEventListener("click", () => abrirPainelSocial(post.municipioId));
  card.querySelector(".post-card-autor").addEventListener("click", () => {
    fecharPainelSocial();
    abrirPerfil(post.autorUid);
  });
  card.querySelector(".post-card-curtir").addEventListener("click", () => aoCurtirPost(post, card));
  card.querySelector(".post-card-comentar").addEventListener("click", () => aoAbrirComentarios(post, card));
  card.querySelector(".post-ver-comentarios")?.addEventListener("click", () => aoAbrirComentarios(post, card));
  card.querySelector(".post-card-compartilhar").addEventListener("click", () => compartilharPost(post.id));
  /* O ⋯ agora existe pra todo mundo: autor apaga, os demais
     denunciam. Antes ele só aparecia pro autor, e quem visse conteúdo
     impróprio não tinha o que fazer -- nem havia pra quem avisar. */
  card
    .querySelector(".post-card-opcoes")
    ?.addEventListener("click", () => abrirOpcoesDoPost(post, card, souAutor));
  card.querySelectorAll(".post-mencao-clicavel").forEach((mencao) => {
    mencao.addEventListener("click", () => {
      fecharPainelSocial();
      abrirPerfil(mencao.dataset.uid);
    });
  });

  const inputComentario = card.querySelector(".post-card-novo-comentario input");
  card.querySelector(".post-card-novo-comentario button").addEventListener("click", () =>
    enviarComentario(post, card, inputComentario)
  );
  inputComentario.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") enviarComentario(post, card, inputComentario);
  });

  return card;
}

/* ============================================================
   FOTOS HOSPEDADAS NO GOOGLE DRIVE
   ------------------------------------------------------------
   As fotos de post, sugestão, Motoclube e perfil vivem no Drive (ver
   subirFotoPostParaDrive em js/auth.js), e o Apps Script devolve a URL
   no formato `drive.google.com/thumbnail?id=...`.

   Esse endpoint é o de MINIATURA, e falha de forma intermitente: o
   Google limita a taxa por IP e responde erro enquanto ainda não gerou
   a miniatura daquele arquivo. O sintoma no app era exatamente esse --
   fotos do mesmo usuário, umas abrindo e outras não, mostrando o texto
   "Foto do post" no lugar da imagem.

   O Drive serve o MESMO arquivo por outros dois caminhos, com limites
   independentes. Tentar os três em sequência recupera inclusive os
   posts que já estavam quebrados, sem precisar reenviar nada.
   ============================================================ */

/** Extrai o id do arquivo de qualquer um dos formatos de URL do Drive. */
function idDoArquivoDrive(url) {
  const s = String(url || "");
  const m =
    s.match(/[?&]id=([\w-]+)/) ||
    s.match(/googleusercontent\.com\/d\/([\w-]+)/) ||
    s.match(/\/file\/d\/([\w-]+)/);
  return m ? m[1] : null;
}

function urlsAlternativasDaFoto(url) {
  const tentativas = [url];
  const id = idDoArquivoDrive(url);
  if (id) {
    // CDN do Google: costuma responder quando a miniatura falha.
    tentativas.push(`https://lh3.googleusercontent.com/d/${id}=w1600`);
    // Download direto: mais lento e sem redimensionar, mas é o que
    // sobrevive quando os outros dois estão limitados.
    tentativas.push(`https://drive.google.com/uc?export=view&id=${id}`);
  }
  return [...new Set(tentativas)];
}

/**
 * Põe a foto no <img>, tentando as URLs alternativas em ordem.
 *
 * Esgotadas as tentativas, ESCONDE o elemento em vez de deixar o
 * navegador desenhar o ícone de imagem quebrada com o texto alternativo
 * ao lado -- um espaço vazio é menos feio e menos confuso que "Foto do
 * post" escrito na tela.
 */
function aplicarFotoComFallback(imgEl, url) {
  if (!imgEl || !url) return;
  const tentativas = urlsAlternativasDaFoto(url);
  // A moldura de carregando é opcional: só o feed a usa hoje. Sem ela,
  // tudo funciona como antes.
  const moldura = imgEl.closest(".post-foto-wrap");
  let indice = 0;

  imgEl.addEventListener("error", () => {
    indice++;
    if (indice < tentativas.length) {
      imgEl.src = tentativas[indice];
      return;
    }
    console.warn("Foto indisponível em todos os formatos do Drive:", url);
    imgEl.classList.add("foto-indisponivel");
    // Some com a moldura inteira: deixar o placeholder girando pra
    // sempre seria pior que não mostrar foto nenhuma.
    moldura?.classList.add("foto-indisponivel");
  });

  imgEl.addEventListener("load", () => {
    imgEl.classList.remove("foto-indisponivel");
    moldura?.classList.remove("carregando");
  });
  imgEl.src = tentativas[0];
}

/**
 * Dispara a animação de "pop" no coração do botão de curtir. Usa
 * remove+reflow+add pra REINICIAR a animação a cada curtida (senão só
 * tocaria uma vez). Chamado só quando a pessoa curte, não ao descurtir
 * nem ao renderizar um post que já estava curtido.
 */
function dispararPopCoracao(botao) {
  const ico = botao.querySelector(".ico-coracao");
  if (!ico) return;
  ico.classList.remove("pop");
  void ico.offsetWidth; // força reflow pra reiniciar a animação
  ico.classList.add("pop");
  if (typeof tocarSomCurtir === "function") tocarSomCurtir();
}

/**
 * Curtir/descurtir com atualização otimista da UI (não espera o
 * Firestore responder pra já mostrar o resultado), desfazendo se a
 * chamada falhar.
 */
async function aoCurtirPost(post, card) {
  const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
  const botao = card.querySelector(".post-card-curtir");
  const contador = card.querySelector(".post-card-curtidas");
  const jaCurtido = botao.classList.contains("curtido");
  const novoEstado = !jaCurtido;

  botao.classList.toggle("curtido", novoEstado);
  contador.textContent = Number(contador.textContent) + (novoEstado ? 1 : -1);
  if (novoEstado) dispararPopCoracao(botao);

  try {
    await window.raspadinhaAuth.curtirPost(post.id, novoEstado, post.autorUid);
  } catch (erro) {
    console.error("Falha ao curtir post:", erro);
    botao.classList.toggle("curtido", jaCurtido);
    contador.textContent = Number(contador.textContent) + (novoEstado ? -1 : 1);
  }
}

/* ---- Ações de um comentário (post e sugestão) ----
   As duas telas montam a mesma `.comentario-linha`, então o botão vive
   aqui em vez de duplicado nos dois lugares. Regra: autor apaga o
   próprio, quem não é autor denuncia, e quem não está logado não vê
   nada -- ler não exige conta desde a 0.26.08.18.99.

   `c.id` pode faltar no comentário recém-enviado se o backend não
   devolver o id; nesse caso o botão de apagar não entra (apagar sem id
   apagaria o documento errado, ou nenhum). */
function adicionarAcaoDoComentario(linha, c, { apagar, aoApagar, denuncia }) {
  const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
  if (!meuUid || !c.autorUid) return;

  const botao = document.createElement("button");
  botao.type = "button";

  if (c.autorUid === meuUid) {
    if (!c.id) return;
    botao.className = "comentario-acao comentario-apagar";
    botao.setAttribute("aria-label", "Apagar meu comentário");
    botao.title = "Apagar";
    botao.textContent = "✕";
    botao.addEventListener("click", async () => {
      if (!confirm("Apagar esse comentário?")) return;
      botao.disabled = true;
      try {
        await apagar();
        linha.remove();
        aoApagar?.();
      } catch (erro) {
        botao.disabled = false;
        console.error("Falha ao apagar comentário:", erro);
        alert(erro?.message || "Não deu para apagar agora.");
      }
    });
  } else {
    botao.className = "comentario-acao comentario-denunciar";
    botao.setAttribute("aria-label", "Denunciar comentário");
    botao.title = "Denunciar";
    botao.textContent = "🚩";
    botao.addEventListener("click", () => abrirDenuncia(denuncia));
  }

  /* insertBefore, não appendChild: o botão é `float: right`, e um float
     encontrado DEPOIS do texto desce pra última linha -- num comentário
     de duas linhas ele ia parar lá embaixo, desalinhado dos vizinhos de
     uma linha só. No começo do fluxo ele fica sempre no topo à direita,
     com o texto contornando. */
  linha.insertBefore(botao, linha.firstChild);
}

/**
 * Mantém o contador em sincronia ao apagar um comentário.
 *
 * Precisa mexer nos DOIS lados: o objeto `post` (de onde enviarComentario
 * tira o número pra somar) e o span. Só o span faria o próximo envio
 * reescrever o valor velho, ressuscitando o comentário apagado na conta.
 */
function atualizarContadorComentarios(post, card, delta) {
  if (post) post.numComentarios = Math.max(0, (post.numComentarios || 0) + delta);
  const alvo = card?.querySelector(".post-card-num-comentarios");
  if (alvo) alvo.textContent = post ? post.numComentarios : Math.max(0, (Number(alvo.textContent) || 0) + delta);
}

/**
 * Mesma coisa pro detalhe da sugestão, onde o card fica NUMA OUTRA
 * TELA (o grid atrás do modal) -- por isso ele é procurado pelo id em
 * vez de recebido: quem apaga está no detalhe, não no card.
 */
function atualizarContadorSugestao(sugestaoId, delta) {
  if (sugestaoDetalheAtual?.id === sugestaoId) {
    sugestaoDetalheAtual.numComentarios = Math.max(0, (sugestaoDetalheAtual.numComentarios || 0) + delta);
  }
  const card = document.querySelector(`.sugestao-card[data-item-id="${sugestaoId}"]`);
  const contador = card?.querySelector(".sugestao-card-num-comentarios");
  if (contador) {
    contador.textContent = Math.max(0, (Number(contador.textContent) || 0) + delta);
  }
}

async function aoAbrirComentarios(post, card) {
  const painel = card.querySelector(".post-card-comentarios");
  const abrindo = painel.classList.contains("oculto");
  painel.classList.toggle("oculto", !abrindo);
  if (!abrindo) return;

  const lista = card.querySelector(".post-card-lista-comentarios");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const comentarios = await window.raspadinhaAuth.listarComentarios(post.id);
    lista.innerHTML = comentarios.length ? "" : "<p>Nenhum comentário ainda.</p>";
    comentarios.forEach((c) => {
      const linha = document.createElement("p");
      linha.className = "comentario-linha";
      linha.innerHTML = `<b>${escaparHtml(c.autorApelido)}:</b> ${escaparHtml(c.texto)}`;
      /* Autor apaga o próprio; os demais denunciam. Mesma dupla do
         comentário de ponto turístico -- aqui não existia nenhuma das
         duas: a regra do Firestore já deixava o autor apagar, mas não
         havia botão, e quem visse conteúdo impróprio não tinha saída. */
      adicionarAcaoDoComentario(linha, c, {
        apagar: () => window.raspadinhaAuth.excluirComentario(post.id, c.id),
        aoApagar: () => atualizarContadorComentarios(post, card, -1),
        denuncia: {
          tipo: "comentario-post",
          referencia: `posts/${post.id}/comentarios/${c.id}`,
          resumo: c.texto,
          autor: c.autorApelido,
          autorUid: c.autorUid,
        },
      });
      lista.appendChild(linha);
    });
  } catch (erro) {
    console.error("Falha ao carregar comentários:", erro);
    lista.innerHTML = "<p>Não foi possível carregar os comentários.</p>";
  }
}

async function enviarComentario(post, card, input) {
  const texto = input.value.trim();
  if (!texto) return;

  input.disabled = true;
  try {
    const novoId = await window.raspadinhaAuth.comentarPost(post.id, texto, post.autorUid);
    input.value = "";

    atualizarContadorComentarios(post, card, 1);

    const lista = card.querySelector(".post-card-lista-comentarios");
    if (lista.children.length === 1 && lista.children[0].tagName === "P" && !lista.children[0].className) {
      lista.innerHTML = "";
    }
    const linha = document.createElement("p");
    linha.className = "comentario-linha";
    linha.innerHTML = `<b>${escaparHtml(window.raspadinhaAuth.apelido)}:</b> ${escaparHtml(texto)}`;
    // O comentário que acabou de sair também ganha o ✕, senão só
    // apareceria ao reabrir o painel -- e some da tela sem botão nenhum
    // parece que apagar não existe.
    adicionarAcaoDoComentario(
      linha,
      { id: novoId, autorUid: window.raspadinhaAuth.usuarioAtual?.uid },
      {
        apagar: () => window.raspadinhaAuth.excluirComentario(post.id, novoId),
        aoApagar: () => atualizarContadorComentarios(post, card, -1),
      }
    );
    lista.appendChild(linha);
  } catch (erro) {
    alert(erro?.message || "Não foi possível enviar o comentário.");
  } finally {
    input.disabled = false;
  }
}


/* ============================================================
   Denúncia de conteúdo

   Até a 0.26.08.18.98 não existia NENHUM caminho pra avisar sobre
   conteúdo impróprio, em nenhuma das quatro superfícies onde qualquer
   pessoa publica (post, comentário de post, comentário de ponto
   turístico e sugestão). Quem visse algo não tinha o que fazer, e o
   dono só descobriria por acaso -- e nem conseguiria apagar, porque a
   regra do Firestore só aceitava o autor.
   ============================================================ */

const ROTULO_MOTIVO_DENUNCIA = {
  "conteudo-sexual": "Conteúdo sexual ou nudez",
  violencia: "Violência ou conteúdo chocante",
  "discurso-de-odio": "Discurso de ódio ou ofensa",
  "spam-propaganda": "Spam ou propaganda",
  "informacao-falsa": "Informação falsa",
  outro: "Outro motivo",
};

let denunciaEmCurso = null;

/** O ⋯ do post: apagar (autor) ou denunciar (os demais). */
function abrirOpcoesDoPost(post, card, souAutor) {
  if (souAutor) {
    aoExcluirPost(post, card);
    return;
  }
  abrirDenuncia({
    tipo: "post",
    referencia: `posts/${post.id}`,
    resumo: post.texto || "Post sem legenda",
    autor: post.autorApelido,
    autorUid: post.autorUid,
  });
}

function abrirDenuncia({ tipo, referencia, resumo, autor, autorUid }) {
  if (!window.raspadinhaAuth?.usuarioAtual) {
    abrirTelaLogin();
    return;
  }
  denunciaEmCurso = { tipo, referencia, autorUid };
  document.getElementById("denuncia-alvo").textContent =
    `${autor ? autor + ": " : ""}${String(resumo || "").slice(0, 120)}`;
  document.getElementById("denuncia-detalhe").value = "";
  document.getElementById("denuncia-status").className = "oculto";
  document.getElementById("btn-enviar-denuncia").disabled = true;

  const lista = document.getElementById("denuncia-motivos");
  lista.innerHTML = "";
  for (const [chave, rotulo] of Object.entries(ROTULO_MOTIVO_DENUNCIA)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "denuncia-motivo";
    b.dataset.motivo = chave;
    b.textContent = rotulo;
    b.addEventListener("click", () => {
      lista.querySelectorAll(".denuncia-motivo").forEach((x) => x.classList.remove("ativo"));
      b.classList.add("ativo");
      denunciaEmCurso.motivo = chave;
      document.getElementById("btn-enviar-denuncia").disabled = false;
    });
    lista.appendChild(b);
  }
  document.getElementById("modal-denuncia").classList.remove("oculto");
}

function fecharDenuncia() {
  document.getElementById("modal-denuncia").classList.add("oculto");
  denunciaEmCurso = null;
}

async function enviarDenuncia() {
  if (!denunciaEmCurso?.motivo) return;
  const botao = document.getElementById("btn-enviar-denuncia");
  const status = document.getElementById("denuncia-status");
  botao.disabled = true;
  status.className = "denuncia-status-neutro";
  status.textContent = "Enviando...";

  try {
    await window.raspadinhaAuth.denunciar({
      ...denunciaEmCurso,
      detalhe: document.getElementById("denuncia-detalhe").value,
    });
    status.className = "denuncia-status-ok";
    status.textContent = "Denúncia enviada. Obrigado — vamos analisar.";
    setTimeout(fecharDenuncia, 2000);
  } catch (erro) {
    console.error("Falha ao denunciar:", erro);
    status.className = "denuncia-status-erro";
    status.textContent = erro.message || "Não deu pra enviar agora.";
    botao.disabled = false;
  }
}

async function aoExcluirPost(post, card) {
  if (!confirm("Excluir esse post? Essa ação não pode ser desfeita.")) return;
  try {
    await window.raspadinhaAuth.excluirPost(post.id, post.fotoDriveId);
    card.remove();
  } catch (erro) {
    alert(erro?.message || "Não foi possível excluir o post.");
  }
}

/* ============================================================
   Sugestões da Comunidade: lugares/restaurantes/etc sugeridos por
   quem usa o app, um feed PRÓPRIO POR MUNICÍPIO (ver
   window.raspadinhaAuth.buscarSugestoes em js/auth.js -- subcoleção
   sugestoesComunidade/{municipioId}/itens, sempre ordenada por mais
   curtido primeiro). Dá pra trocar de município direto no select
   dentro do modal, sem precisar abrir outro município no mapa.
   ============================================================ */

let sugestoesCarregadas = [];

/**
 * Abre (ou troca de município dentro d)o modal de Sugestões da
 * Comunidade. Chamado tanto pelo botão no popup do município quanto
 * pelo próprio select de trocar município lá dentro.
 */
/**
 * Atalho pras Sugestões a partir da Comunidade: como as sugestões são
 * por município, abre no município do filtro atual (se houver) ou no
 * primeiro da lista -- dentro do modal dá pra trocar pelo seletor.
 */
function abrirSugestoesPeloAtalho() {
  const municipioId =
    filtroMunicipioSocialId ||
    Object.entries(idParaNomeMunicipio).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))[0]?.[0];
  if (!municipioId) return;
  fecharPainelSocial();
  abrirSugestoesComunidade(municipioId);
}


/* ============================================================
   Indicar selo

   Município sem arte própria mostra um selo desenhado na hora
   (gerarSeloPlaceholder). Quem esteve lá pode mandar uma foto candidata
   a virar o selo de verdade.

   A foto NÃO vira selo sozinha, e isso é de propósito: a arte é um
   arquivo do repositório (assets/img/selos/<id>.webp) que vai dentro do
   APK. O app coleta candidatas; publicar continua passando pelo Paulo,
   pelo tools/processar-selos.js e por um commit.
   ============================================================ */

let municipioIndicandoSelo = null;
let fotoEscolhidaParaSelo = null;


/* ---- Fila de denúncias (Admin) ----
   Três saídas por denúncia: apagar o conteúdo, descartar (não era nada)
   ou ir moderar a conta do autor. Apagar e descartar são coisas
   diferentes de propósito -- descartar sem apagar registra que você
   olhou e decidiu manter, o que evita reanalisar a mesma coisa. */
let statusDenunciasAdmin = "aberta";

function configurarDenunciasAdmin() {
  const filtros = document.getElementById("denuncias-filtros");
  if (!filtros) return;
  filtros.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filtros.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-ativo"));
      chip.classList.add("chip-ativo");
      statusDenunciasAdmin = chip.dataset.status;
      carregarDenuncias();
    });
  });
}

async function carregarDenuncias() {
  const lista = document.getElementById("denuncias-lista");
  if (!lista) return;
  lista.innerHTML = '<div class="spinner"></div>';

  let itens;
  try {
    itens = await window.raspadinhaAuth.listarDenuncias(statusDenunciasAdmin);
  } catch (erro) {
    console.error("Falha ao listar denúncias:", erro);
    lista.innerHTML = "<p>Não foi possível carregar agora.</p>";
    return;
  }

  if (!itens.length) {
    lista.innerHTML = '<p class="admin-dica">Nenhuma denúncia aqui.</p>';
    return;
  }

  lista.innerHTML = "";
  for (const item of itens) {
    const cartao = document.createElement("div");
    cartao.className = "denuncia-card";

    const topo = document.createElement("div");
    topo.className = "denuncia-card-topo";
    const motivo = document.createElement("b");
    motivo.textContent = ROTULO_MOTIVO_DENUNCIA[item.motivo] || item.motivo;
    const onde = document.createElement("span");
    onde.textContent = descreverReferencia(item.referencia);
    topo.append(motivo, onde);
    cartao.appendChild(topo);

    if (item.detalhe) {
      const det = document.createElement("p");
      det.className = "denuncia-card-detalhe";
      det.textContent = item.detalhe;
      cartao.appendChild(det);
    }

    const acoes = document.createElement("div");
    acoes.className = "denuncia-card-acoes";

    const botao = (rotulo, classe, aoClicar) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = classe;
      b.textContent = rotulo;
      b.addEventListener("click", async () => {
        acoes.querySelectorAll("button").forEach((x) => (x.disabled = true));
        try {
          await aoClicar();
          cartao.remove();
        } catch (erro) {
          console.error("Falha ao tratar denúncia:", erro);
          alert(erro?.message || "Não deu pra concluir.");
          acoes.querySelectorAll("button").forEach((x) => (x.disabled = false));
        }
      });
      return b;
    };

    if (statusDenunciasAdmin === "aberta") {
      acoes.appendChild(
        botao("Aceitar e apagar", "settings-btn-perigo", async () => {
          if (!confirm("Apagar o conteúdo denunciado? Não dá pra desfazer.")) throw new Error("");
          /* Aceitar não é só apagar: soma um strike pro autor e, no
             terceiro, bane a conta e varre tudo que ela publicou. */
          const r = await window.raspadinhaAuth.aceitarDenuncia(item);
          if (r.banido) {
            const q = r.apagados || {};
            alert(
              `Conta banida (${r.strikes} denúncias aceitas).

` +
                `Apagados: ${q.posts || 0} posts, ${q.comentarios || 0} comentários, ` +
                `${q.respostas || 0} respostas e ${q.sugestoes || 0} sugestões.`
            );
          } else if (r.strikes) {
            alert(`Conteúdo apagado. Esta conta tem ${r.strikes} de ${window.raspadinhaAuth.DENUNCIAS_PARA_BANIR} denúncias aceitas.`);
          }
        })
      );
      acoes.appendChild(
        botao("Descartar", "status-ativa", () =>
          window.raspadinhaAuth.resolverDenuncia(item.id, "descartada")
        )
      );
    } else {
      acoes.appendChild(
        botao("Reabrir", "status-ativa", () =>
          window.raspadinhaAuth.resolverDenuncia(item.id, "aberta")
        )
      );
    }

    cartao.appendChild(acoes);
    lista.appendChild(cartao);
  }
}

/** "posts/abc" -> "Post"; "sugestoesComunidade/33.../itens/x" -> "Sugestão". */
function descreverReferencia(referencia) {
  const caminho = String(referencia || "");
  if (caminho.startsWith("posts/") && caminho.includes("/comentarios/")) return "Comentário em post";
  if (caminho.startsWith("posts/")) return "Post";
  if (caminho.startsWith("sugestoesComunidade/") && caminho.includes("/comentarios/"))
    return "Comentário em sugestão";
  if (caminho.startsWith("sugestoesComunidade/")) return "Sugestão";
  if (caminho.startsWith("pontosTuristicos/")) return "Comentário em ponto turístico";
  return caminho;
}
/* ---- Revisão das indicações de selo (Admin) ----
   Aprovar aqui NÃO publica o selo: a arte é arquivo do repositório
   (assets/img/selos/<id>.webp), que vai dentro do APK. O fluxo é
   aprovar, baixar a foto, passar no tools/processar-selos.js e
   commitar. A tela existe pra decidir e pra achar a foto, não pra
   publicar. */
let statusSelosAdmin = "pendente";

function configurarSelosIndicadosAdmin() {
  const filtros = document.getElementById("selos-indicados-filtros");
  if (!filtros) return;
  filtros.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      filtros.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-ativo"));
      chip.classList.add("chip-ativo");
      statusSelosAdmin = chip.dataset.status;
      carregarSelosIndicados();
    });
  });
}

async function carregarSelosIndicados() {
  const lista = document.getElementById("selos-indicados-lista");
  if (!lista) return;
  lista.innerHTML = '<div class="spinner"></div>';

  let itens;
  try {
    itens = await window.raspadinhaAuth.listarSelosIndicados(statusSelosAdmin);
  } catch (erro) {
    console.error("Falha ao listar selos indicados:", erro);
    lista.innerHTML = "<p>Não foi possível carregar agora.</p>";
    return;
  }

  if (!itens.length) {
    lista.innerHTML = `<p class="admin-dica">Nenhuma indicação ${
      statusSelosAdmin === "pendente" ? "pendente" : statusSelosAdmin + "a"
    }.</p>`;
    return;
  }

  lista.innerHTML = "";
  for (const item of itens) {
    const cartao = document.createElement("div");
    cartao.className = "selo-indicado-card";

    /* Só http(s) entra, tanto na miniatura quanto no link abaixo: o
       fotoUrl vem de um documento que a PRÓPRIA pessoa grava, então é
       entrada externa. Um "javascript:..." gravado ali abriria no
       painel do dono, que é o pior lugar possível.
       Usa o parser de URL do navegador em vez de expressão regular --
       ele conhece as regras de esquema melhor que qualquer regex que eu
       escrevesse, e não tem escape pra errar. */
    const linkValido = (() => {
      try {
        return ["http:", "https:"].includes(new URL(item.fotoUrl).protocol);
      } catch {
        return false;
      }
    })();

    const foto = document.createElement("img");
    foto.className = "selo-indicado-foto";
    if (linkValido) foto.src = item.fotoUrl;
    else foto.classList.add("oculto");
    foto.alt = "";
    foto.loading = "lazy";
    // Foto que não abre não pode virar um buraco no cartão: some e o
    // link "Abrir foto" continua valendo pra conferir na mão.
    foto.addEventListener("error", () => foto.classList.add("oculto"));

    const info = document.createElement("div");
    info.className = "selo-indicado-info";
    const nome = idParaNomeMunicipio[item.municipioId] || item.municipioId;

    const titulo = document.createElement("b");
    titulo.textContent = nome;
    const quem = document.createElement("span");
    quem.textContent = item.apelido || "sem apelido";
    info.append(titulo, quem);

    /* Montado por DOM, e não por innerHTML: `fotoUrl` vem de um
       documento que a PRÓPRIA pessoa grava, então é entrada externa.
       O escaparHtml daqui não escapa aspas (usa textContent), o que o
       torna impróprio pra atributo. E o esquema é checado porque um
       "javascript:..." gravado ali executaria neste painel, que é
       justamente o painel do dono. */
    if (/^https?:\/\//i.test(item.fotoUrl || "")) {
      const link = document.createElement("a");
      link.href = item.fotoUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Abrir foto";
      info.appendChild(link);
    } else {
      const aviso = document.createElement("span");
      aviso.textContent = "link de foto inválido";
      info.appendChild(aviso);
    }
    const acoes = document.createElement("div");
    acoes.className = "selo-indicado-acoes";
    const decidir = (status, rotulo, classe) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = classe;
      b.textContent = rotulo;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await window.raspadinhaAuth.decidirSeloIndicado(item.municipioId, item.id, status);
          cartao.remove();
        } catch (erro) {
          console.error("Falha ao decidir:", erro);
          b.disabled = false;
        }
      });
      return b;
    };
    if (statusSelosAdmin !== "aprovado") acoes.appendChild(decidir("aprovado", "Aprovar", "status-ativa"));
    if (statusSelosAdmin !== "recusado") acoes.appendChild(decidir("recusado", "Recusar", "settings-btn-perigo"));

    cartao.append(foto, info, acoes);
    lista.appendChild(cartao);
  }
}

/**
 * Mostra o botão só onde ele faz sentido: município SEM arte própria e
 * com presença confirmada por GPS.
 *
 * A exigência de presença é do Paulo, e é boa: quem indica a foto de um
 * lugar deveria ter estado nele. `arteReal` vem do resolverImagemColorida
 * -- o mesmo caminho que decide se desenha o selo na hora.
 */
function atualizarBotaoIndicarSelo(id, temArteReal) {
  const botao = document.getElementById("btn-indicar-selo");
  if (!botao) return;
  const podeIndicar =
    !temArteReal && estaVerificado(id) && !!window.raspadinhaAuth?.usuarioAtual;
  botao.classList.toggle("oculto", !podeIndicar);
}

async function abrirIndicarSelo() {
  const id = municipioSelecionadoId;
  if (!id) return;
  municipioIndicandoSelo = id;
  fotoEscolhidaParaSelo = null;

  document.getElementById("indicar-selo-municipio").textContent =
    idParaNomeMunicipio[id] || "";
  document.getElementById("indicar-selo-previa").classList.add("oculto");
  document.getElementById("btn-enviar-selo").disabled = true;
  document.getElementById("input-foto-selo").value = "";
  definirStatusIndicacao("", "");
  document.getElementById("modal-indicar-selo").classList.remove("oculto");

  // Já mandou uma antes? Avisa que enviar de novo substitui.
  try {
    const anterior = await window.raspadinhaAuth.buscarMinhaIndicacao(id);
    if (anterior) {
      definirStatusIndicacao(
        anterior.status === "aprovado"
          ? "Sua indicação para este município foi aprovada. Obrigado!"
          : "Você já indicou uma foto aqui. Enviar outra substitui a anterior.",
        "neutro"
      );
    }
  } catch (erro) {
    console.warn("Não deu pra checar indicação anterior:", erro);
  }
}

function fecharIndicarSelo() {
  document.getElementById("modal-indicar-selo").classList.add("oculto");
  fotoEscolhidaParaSelo = null;
}

function definirStatusIndicacao(texto, tipo) {
  const alvo = document.getElementById("indicar-selo-status");
  alvo.textContent = texto;
  alvo.className = texto ? `indicar-selo-status-${tipo || "neutro"}` : "oculto";
}

/** Mostra a prévia do que a pessoa escolheu, antes de enviar. */
function aoEscolherFotoDoSelo(evento) {
  const arquivo = evento.target.files?.[0];
  if (!arquivo) return;

  /* Teto de 8 MB: a foto viaja em base64 pro Apps Script (ver
     subirFotoPostParaDrive), o que já infla ~33%, e acima disso o
     upload costuma estourar o tempo em rede de celular. */
  const LIMITE_MB = 8;
  if (arquivo.size > LIMITE_MB * 1024 * 1024) {
    definirStatusIndicacao(
      `Essa foto tem ${(arquivo.size / 1048576).toFixed(1)} MB. O limite é ${LIMITE_MB} MB.`,
      "erro"
    );
    document.getElementById("btn-enviar-selo").disabled = true;
    return;
  }

  fotoEscolhidaParaSelo = arquivo;
  const previa = document.getElementById("indicar-selo-previa");
  const img = document.getElementById("indicar-selo-previa-img");
  // revoga o anterior pra não vazar object URL a cada troca de foto
  if (img.dataset.blob) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(arquivo);
  img.dataset.blob = "1";
  document.getElementById("indicar-selo-nome-arquivo").textContent = arquivo.name;
  previa.classList.remove("oculto");
  document.getElementById("btn-enviar-selo").disabled = false;
  definirStatusIndicacao("", "");
}

async function enviarIndicacaoDeSelo() {
  if (!fotoEscolhidaParaSelo || !municipioIndicandoSelo) return;
  const botao = document.getElementById("btn-enviar-selo");
  botao.disabled = true;
  definirStatusIndicacao("Enviando sua foto...", "neutro");

  try {
    await window.raspadinhaAuth.indicarSelo({
      municipioId: municipioIndicandoSelo,
      arquivoFoto: fotoEscolhidaParaSelo,
    });
    definirStatusIndicacao(
      "Indicação enviada! Vamos avaliar e, se entrar, ela vira o selo deste município.",
      "ok"
    );
    setTimeout(fecharIndicarSelo, 2200);
  } catch (erro) {
    console.error("Falha ao indicar selo:", erro);
    definirStatusIndicacao(erro.message || "Não deu pra enviar agora.", "erro");
    botao.disabled = false;
  }
}

function abrirSugestoesComunidade(municipioId) {
  if (!municipioId) return;
  municipioAtualSugestoes = municipioId;
  filtroCategoriaSugestaoAtual = "";

  document.getElementById("btn-municipio-sugestoes-valor").textContent =
    idParaNomeMunicipio[municipioId] || "—";
  renderizarChipsCategoriaSugestao();

  document.getElementById("modal-sugestoes-comunidade").classList.remove("oculto");
  carregarSugestoes();
}

function fecharSugestoesComunidade() {
  document.getElementById("modal-sugestoes-comunidade").classList.add("oculto");
}

/**
 * Monta as duas barras de chips de categoria a partir de
 * CATEGORIAS_SUGESTAO: a do filtro (com "Todas" na frente, valor "")
 * e a do formulário de nova sugestão (sem "Todas" -- lá a escolha é
 * obrigatória e cai em "outro" por padrão).
 *
 * Só o rótulo curto entra no chip: os labels completos ("🏛️ Atrações
 * Culturais e Históricas") ocupariam meia tela cada um numa barra
 * horizontal. O emoji + primeira palavra já identifica, e o label
 * inteiro continua no `title` e no card.
 */
function renderizarChipsCategoriaSugestao() {
  const barraFiltro = document.getElementById("sugestoes-chips");
  const barraForm = document.getElementById("nova-sugestao-chips");

  const criarChip = (chave, label, ativo, aoClicar) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (ativo ? " chip-ativo" : "");
    chip.dataset.chave = chave;
    chip.textContent = rotuloCurtoCategoria(label);
    chip.title = label;
    chip.setAttribute("role", "radio");
    chip.setAttribute("aria-checked", ativo ? "true" : "false");
    chip.addEventListener("click", () => aoClicar(chave));
    return chip;
  };

  barraFiltro.innerHTML = "";
  barraFiltro.appendChild(
    criarChip("", "✨ Todas", filtroCategoriaSugestaoAtual === "", (chave) => {
      filtroCategoriaSugestaoAtual = chave;
      renderizarChipsCategoriaSugestao();
      renderizarListaSugestoes();
    })
  );
  CATEGORIAS_SUGESTAO.forEach((cat) => {
    barraFiltro.appendChild(
      criarChip(cat.chave, cat.label, filtroCategoriaSugestaoAtual === cat.chave, (chave) => {
        filtroCategoriaSugestaoAtual = chave;
        renderizarChipsCategoriaSugestao();
        renderizarListaSugestoes();
      })
    );
  });

  barraForm.innerHTML = "";
  CATEGORIAS_SUGESTAO.forEach((cat) => {
    barraForm.appendChild(
      criarChip(cat.chave, cat.label, categoriaNovaSugestao === cat.chave, (chave) => {
        categoriaNovaSugestao = chave;
        renderizarChipsCategoriaSugestao();
      })
    );
  });
}

/** "🥾 Trilhas e Caminhadas" -> "🥾 Trilhas". Emoji + primeira palavra
 *  significativa, que é o que cabe num chip. */
function rotuloCurtoCategoria(label) {
  const partes = label.trim().split(/\s+/);
  return partes.slice(0, 2).join(" ").replace(/[,:]$/, "");
}

/* ============================================================
   Seletor de município com busca (#modal-escolher-municipio)
   ------------------------------------------------------------
   Compartilhado pelas Sugestões (troca o município do feed) e pelo
   Novo Post (marca um município opcional). Substituiu dois <select>
   nativos de 92 opções, que no Android viravam uma roleta do sistema
   sem busca nenhuma.
   ============================================================ */
let escolherMunicipioContexto = null; // { selecionado, permitirNenhum, aoEscolher }

/** Minúsculas e sem acento, pros dois lados da busca: digitar
 *  "sao goncalo" tem que achar "São Gonçalo". */
function normalizarBusca(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * @param filtro  opcional: (id) => boolean. Quem chama decide o que faz
 *                sentido oferecer -- o Roteiro, por exemplo, só pode
 *                mostrar município com ponto que dê pra navegar, senão
 *                o clique leva a uma lista vazia.
 */
function abrirEscolherMunicipio({ selecionado = null, permitirNenhum = false, filtro = null, aoEscolher }) {
  escolherMunicipioContexto = { selecionado, permitirNenhum, filtro, aoEscolher };
  escolherPontoContexto = null;
  const busca = document.getElementById("input-busca-municipio");
  busca.value = "";
  document.getElementById("escolher-municipio-titulo").textContent = "Escolher município";
  busca.placeholder = "Buscar município...";
  renderizarListaEscolherMunicipio("");
  document.getElementById("modal-escolher-municipio").classList.remove("oculto");
}

/* Ponto turístico escolhido no formulário de post. Quando é null, o
   post fica só com o município, como sempre foi -- marcar o ponto é
   OPCIONAL de propósito: a maioria das fotos é da cidade, não de um
   ponto específico. */
let pontoNovoPost = null;
let escolherPontoContexto = null;

/**
 * Mostra/esconde o seletor de ponto conforme haja município escolhido,
 * e atualiza o texto do botão.
 *
 * Município sem nenhum ponto cadastrado também esconde: abrir uma lista
 * vazia é pior que não oferecer.
 */
function atualizarSeletorDePontoDoPost() {
  const botao = document.getElementById("btn-ponto-post");
  if (!botao) return;

  const pontos = municipioNovoPost
    ? (destinosPorMunicipio[municipioNovoPost]?.destinos || []).filter((p) => p.id)
    : [];
  botao.classList.toggle("oculto", pontos.length === 0);

  const escolhido = pontos.find((p) => p.id === pontoNovoPost);
  if (!escolhido) pontoNovoPost = null;
  document.getElementById("btn-ponto-post-valor").textContent =
    escolhido ? escolhido.nome : "Nenhum";
}

/**
 * Mesma folha do seletor de município, com outra lista dentro.
 *
 * Reaproveitar em vez de duplicar: são o mesmo componente (cabeçalho +
 * busca + lista de opções), e um segundo modal significaria repetir
 * markup, CSS e a animação de abrir/fechar só pra trocar a fonte dos
 * dados. O contexto ativo (`escolherPontoContexto` x
 * `escolherMunicipioContexto`) é o que decide quem responde à busca.
 */
function abrirEscolherPonto({ municipioId, selecionado = null, aoEscolher }) {
  const municipio = destinosPorMunicipio[municipioId];
  if (!municipio) return;

  escolherMunicipioContexto = null;
  escolherPontoContexto = { municipioId, selecionado, aoEscolher };

  const busca = document.getElementById("input-busca-municipio");
  busca.value = "";
  busca.placeholder = "Buscar ponto...";
  document.getElementById("escolher-municipio-titulo").textContent =
    `Ponto em ${municipio.nome}`;
  renderizarListaEscolherPonto("");
  document.getElementById("modal-escolher-municipio").classList.remove("oculto");
}

function renderizarListaEscolherPonto(termo) {
  const lista = document.getElementById("lista-escolher-municipio");
  const ctx = escolherPontoContexto;
  if (!ctx) return;

  const alvo = normalizarBusca(termo || "");
  const pontos = (destinosPorMunicipio[ctx.municipioId]?.destinos || []).filter(
    (p) => p.id && (!alvo || normalizarBusca(p.nome).includes(alvo))
  );

  lista.innerHTML = "";

  // "Nenhum" só sem busca ativa, igual ao seletor de município: com
  // termo digitado ele viraria uma opção sem relação com o que se
  // procura, sempre no topo.
  if (!alvo) {
    lista.appendChild(criarOpcaoMunicipio("", "Nenhum", !ctx.selecionado));
  }

  if (!pontos.length) {
    const vazio = document.createElement("p");
    vazio.className = "municipio-opcao-vazio";
    vazio.textContent = alvo
      ? "Nenhum ponto com esse nome."
      : "Este município ainda não tem pontos cadastrados.";
    lista.appendChild(vazio);
    return;
  }

  pontos.forEach((p) => {
    lista.appendChild(criarOpcaoMunicipio(p.id, p.nome, ctx.selecionado === p.id));
  });
}

function fecharEscolherMunicipio() {
  fecharComAnimacao(document.getElementById("modal-escolher-municipio"));
  escolherMunicipioContexto = null;
  escolherPontoContexto = null;
}

function renderizarListaEscolherMunicipio(termo) {
  const lista = document.getElementById("lista-escolher-municipio");
  const ctx = escolherMunicipioContexto;
  if (!ctx) return;

  const alvo = normalizarBusca(termo || "");
  const opcoes = Object.entries(idParaNomeMunicipio)
    .filter(([id]) => !ctx.filtro || ctx.filtro(id))
    .filter(([, nome]) => !alvo || normalizarBusca(nome).includes(alvo))
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));

  lista.innerHTML = "";

  if (ctx.permitirNenhum && !alvo) {
    lista.appendChild(criarOpcaoMunicipio("", "Nenhum", ctx.selecionado === null || ctx.selecionado === ""));
  }

  if (!opcoes.length) {
    const vazio = document.createElement("p");
    vazio.className = "municipio-opcao-vazio";
    vazio.textContent = "Nenhum município com esse nome.";
    lista.appendChild(vazio);
    return;
  }

  opcoes.forEach(([id, nome]) => {
    lista.appendChild(criarOpcaoMunicipio(id, nome, ctx.selecionado === id));
  });
}

function criarOpcaoMunicipio(id, nome, ativo) {
  const opcao = document.createElement("button");
  opcao.type = "button";
  opcao.className = "municipio-opcao" + (ativo ? " municipio-opcao-ativa" : "");
  opcao.setAttribute("role", "option");
  opcao.setAttribute("aria-selected", ativo ? "true" : "false");
  opcao.innerHTML = `<span>${escaparHtml(nome)}</span>${ativo ? "<span>✓</span>" : ""}`;
  opcao.addEventListener("click", () => {
    // A mesma folha serve município e ponto: quem responde é o contexto
    // que estiver ativo (só um deles é não-nulo por vez).
    const aoEscolher =
      escolherPontoContexto?.aoEscolher || escolherMunicipioContexto?.aoEscolher;
    fecharEscolherMunicipio();
    if (typeof aoEscolher === "function") aoEscolher(id || null);
  });
  return opcao;
}

/**
 * Busca as sugestões do município atual (até 200 de uma vez, já
 * ordenadas por mais curtido -- ver buscarSugestoes em js/auth.js).
 * O filtro por categoria é aplicado só na hora de renderizar
 * (renderizarListaSugestoes), sem precisar de uma nova consulta ao
 * Firestore pra cada categoria escolhida.
 */
async function carregarSugestoes() {
  const listaEl = document.getElementById("sugestoes-lista");
  listaEl.innerHTML = '<div class="spinner spinner-grande"></div>';

  try {
    const resultado = await window.raspadinhaAuth.buscarSugestoes(municipioAtualSugestoes, { limiteN: 200 });
    sugestoesCarregadas = resultado.sugestoes;
    renderizarListaSugestoes();
  } catch (erro) {
    console.error("Falha ao carregar sugestões:", erro);
    listaEl.innerHTML = "<p>Não foi possível carregar as sugestões agora.</p>";
  }
}

function renderizarListaSugestoes() {
  const listaEl = document.getElementById("sugestoes-lista");
  const sugestoesFiltradas = filtroCategoriaSugestaoAtual
    ? sugestoesCarregadas.filter((s) => s.categoria === filtroCategoriaSugestaoAtual)
    : sugestoesCarregadas;

  listaEl.innerHTML = sugestoesFiltradas.length
    ? ""
    : "<p>Nenhuma sugestão por aqui ainda. Seja o primeiro a sugerir um lugar!</p>";
  sugestoesFiltradas.forEach((sugestao) => listaEl.appendChild(renderizarCardSugestao(sugestao)));
}

function abrirModalNovaSugestao() {
  resetarFormularioNovaSugestao();
  renderizarChipsCategoriaSugestao();
  document.getElementById("modal-nova-sugestao").classList.remove("oculto");
}

function fecharModalNovaSugestao() {
  fecharComAnimacao(document.getElementById("modal-nova-sugestao"));
}

function resetarFormularioNovaSugestao() {
  document.getElementById("input-titulo-sugestao").value = "";
  categoriaNovaSugestao = "outro";
  document.getElementById("input-descricao-sugestao").value = "";
  document.getElementById("input-link-maps-sugestao").value = "";
  document.getElementById("input-foto-sugestao").value = "";
  limparDropzone("dropzone-sugestao", "Toque para escolher uma foto (opcional)");
  document.getElementById("check-anonimo-sugestao").checked = false;
  document.getElementById("sugestao-form-erro").classList.add("oculto");
}

/* ---- Dropzone: o <input type=file> nativo fica escondido
   (.input-arquivo-oculto) e quem aparece é o retângulo tracejado,
   ligado a ele por label[for]. A prévia da foto escolhida vira o
   background-image DESSE retângulo -- é aqui que se mexe pra mudar
   como o preview aparece. ---- */
function mostrarFotoNoDropzone(idDropzone, arquivo, textoComFoto) {
  const zona = document.getElementById(idDropzone);
  if (!zona) return;
  const url = URL.createObjectURL(arquivo);
  blobUrlsFotosPosts.push(url); // revogado ao fechar o painel social
  zona.style.backgroundImage = `url("${url}")`;
  zona.classList.add("dropzone-com-foto");
  zona.querySelector(".dropzone-texto").textContent = textoComFoto;
}

function limparDropzone(idDropzone, textoPadrao) {
  const zona = document.getElementById(idDropzone);
  if (!zona) return;
  zona.style.backgroundImage = "";
  zona.classList.remove("dropzone-com-foto");
  zona.querySelector(".dropzone-texto").textContent = textoPadrao;
}

function aoEscolherFotoSugestao(evento) {
  const arquivo = evento.target.files[0];
  if (!arquivo) {
    limparDropzone("dropzone-sugestao", "Toque para escolher uma foto (opcional)");
    return;
  }
  mostrarFotoNoDropzone("dropzone-sugestao", arquivo, "Trocar foto");
}

async function publicarSugestao() {
  const titulo = document.getElementById("input-titulo-sugestao").value.trim();
  const categoria = categoriaNovaSugestao;
  const descricao = document.getElementById("input-descricao-sugestao").value.trim();
  const linkMaps = document.getElementById("input-link-maps-sugestao").value.trim();
  const arquivo = document.getElementById("input-foto-sugestao").files[0] || null;
  const anonimo = document.getElementById("check-anonimo-sugestao").checked;
  const erroEl = document.getElementById("sugestao-form-erro");
  const statusEl = document.getElementById("sugestao-form-status");
  const botao = document.getElementById("btn-publicar-sugestao");

  erroEl.classList.add("oculto");
  if (!titulo) {
    erroEl.textContent = "Dê um nome pro lugar.";
    erroEl.classList.remove("oculto");
    return;
  }

  botao.disabled = true;
  botao.querySelector(".spinner").classList.remove("oculto");
  statusEl.textContent = arquivo ? "Preparando a foto..." : "Publicando...";
  statusEl.classList.remove("oculto");

  try {
    const fotoComprimida = arquivo ? await comprimirFotoPost(arquivo) : null;
    statusEl.textContent = "Publicando...";
    await window.raspadinhaAuth.criarSugestao({
      municipioId: municipioAtualSugestoes,
      titulo,
      categoria,
      descricao,
      linkMaps,
      arquivoFoto: fotoComprimida,
      anonimo,
    });
    resetarFormularioNovaSugestao();
    fecharModalNovaSugestao();
    carregarSugestoes();
  } catch (erro) {
    console.error("Falha ao publicar sugestão:", erro);
    erroEl.textContent = erro?.message || "Não foi possível publicar agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.querySelector(".spinner").classList.add("oculto");
    statusEl.classList.add("oculto");
  }
}

/**
 * Monta o card de uma sugestão: título, categoria, foto (se tiver),
 * link do Maps (se tiver), autor (ou "Anônimo", ver campo `anonimo`
 * -- só afeta a exibição, não quem pode editar/excluir de verdade) e
 * curtir/comentar/excluir (só pro autor).
 */
function renderizarCardSugestao(sugestao) {
  const card = document.createElement("div");
  card.className = "sugestao-card";
  card.dataset.itemId = sugestao.id;

  const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
  const curtidoPor = sugestao.curtidoPor || [];
  const curtido = curtidoPor.includes(meuUid);
  const souAutor = sugestao.autorUid === meuUid;
  const nomeAutor = sugestao.anonimo ? "🕵️ Anônimo" : sugestao.autorApelido;
  const labelCategoria = LABEL_CATEGORIA_SUGESTAO[sugestao.categoria] || LABEL_CATEGORIA_SUGESTAO.outro;

  // A foto vira o FUNDO do card (estilo guia de viagem), com o véu
  // escuro do ::before garantindo contraste do título branco. Sem
  // foto, o CSS aplica um gradiente próprio.
  if (sugestao.fotoUrl) {
    card.style.backgroundImage = `url("${encodeURI(sugestao.fotoUrl)}")`;
  } else {
    card.classList.add("sugestao-card-sem-foto");
  }

  const iconeLixeira =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const iconeBandeira =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 21V4"/><path d="M5 5h11l-1.6 3.4L16 12H5"/></svg>';

  card.innerHTML = `
    <div class="sugestao-card-topo">
      ${souAutor
        ? `<button type="button" class="sugestao-card-excluir" aria-label="Excluir sugestão" title="Excluir">${iconeLixeira}</button>`
        : meuUid
          ? `<button type="button" class="sugestao-card-denunciar" aria-label="Denunciar sugestão" title="Denunciar">${iconeBandeira}</button>`
          : ""}
    </div>
    <span class="sugestao-card-categoria">${escaparHtml(rotuloCurtoCategoria(labelCategoria))}</span>
    <h3 class="sugestao-card-titulo">${escaparHtml(sugestao.titulo)}</h3>
    <span class="sugestao-card-autor">${escaparHtml(nomeAutor)}</span>
    <div class="sugestao-card-rodape">
      <button type="button" class="sugestao-card-curtir${curtido ? " curtido" : ""}">${ICONE_CORACAO} <span class="sugestao-card-curtidas">${curtidoPor.length}</span></button>
      <button type="button" class="sugestao-card-comentar">${ICONE_COMENTAR} <span class="sugestao-card-num-comentarios">${sugestao.numComentarios || 0}</span></button>
    </div>
  `;

  const curtirBtn = card.querySelector(".sugestao-card-curtir");
  const comentarBtn = card.querySelector(".sugestao-card-comentar");
  card.querySelector(".sugestao-card-denunciar")?.addEventListener("click", (evento) => {
    evento.stopPropagation();
    abrirDenuncia({
      tipo: "sugestao",
      referencia: `sugestoesComunidade/${municipioAtualSugestoes}/itens/${sugestao.id}`,
      resumo: sugestao.titulo,
      autor: sugestao.anonimo ? "Anônimo" : sugestao.autorApelido,
      // O autorUid vai mesmo em sugestão anônima: anônimo é só como o
      // app EXIBE, a responsabilidade continua sendo de quem postou.
      autorUid: sugestao.autorUid,
    });
  });

  const excluirBtn = card.querySelector(".sugestao-card-excluir");

  // stopPropagation nos botões do rodapé: sem isso, curtir também
  // abriria o detalhe, porque o card inteiro é clicável.
  curtirBtn.addEventListener("click", (evento) => {
    evento.stopPropagation();
    aoCurtirSugestao(sugestao, card);
  });
  comentarBtn.addEventListener("click", (evento) => {
    evento.stopPropagation();
    abrirDetalheSugestao(sugestao);
  });
  excluirBtn?.addEventListener("click", (evento) => {
    evento.stopPropagation();
    aoExcluirSugestao(sugestao, card);
  });

  card.addEventListener("click", () => abrirDetalheSugestao(sugestao));

  return card;
}

/* ============================================================
   Detalhe da sugestão (#modal-sugestao-detalhe)
   ------------------------------------------------------------
   O card do grid só cabe capa + título + contadores. Descrição,
   link do Maps e a thread de comentários moram aqui.
   ============================================================ */
function abrirDetalheSugestao(sugestao) {
  sugestaoDetalheAtual = sugestao;

  document.getElementById("sugestao-detalhe-titulo").textContent = sugestao.titulo;

  const foto = document.getElementById("sugestao-detalhe-foto");
  foto.classList.toggle("oculto", !sugestao.fotoUrl);
  if (sugestao.fotoUrl) {
    foto.alt = `Foto de ${sugestao.titulo}`;
    aplicarFotoComFallback(foto, sugestao.fotoUrl);
  }

  const descricao = document.getElementById("sugestao-detalhe-descricao");
  const labelCategoria = LABEL_CATEGORIA_SUGESTAO[sugestao.categoria] || LABEL_CATEGORIA_SUGESTAO.outro;
  const autor = sugestao.anonimo ? "🕵️ Anônimo" : sugestao.autorApelido;
  descricao.textContent = sugestao.descricao || "";
  descricao.insertAdjacentHTML(
    "afterbegin",
    `<span class="sugestao-card-categoria" style="position:static;display:inline-block;margin-bottom:10px">${escaparHtml(
      labelCategoria
    )}</span><br><small style="color:var(--fraco)">por ${escaparHtml(autor)}</small><br><br>`
  );

  const maps = document.getElementById("sugestao-detalhe-maps");
  maps.classList.toggle("oculto", !sugestao.linkMaps);
  if (sugestao.linkMaps) maps.href = sugestao.linkMaps;

  document.getElementById("input-comentario-sugestao").value = "";
  document.getElementById("modal-sugestao-detalhe").classList.remove("oculto");
  carregarComentariosDetalheSugestao();
}

function fecharDetalheSugestao() {
  fecharComAnimacao(document.getElementById("modal-sugestao-detalhe"));
  sugestaoDetalheAtual = null;
}

async function carregarComentariosDetalheSugestao() {
  const lista = document.getElementById("sugestao-detalhe-comentarios");
  lista.innerHTML = '<div class="spinner spinner-grande"></div>';
  try {
    const comentarios = await window.raspadinhaAuth.listarComentariosSugestao(
      municipioAtualSugestoes,
      sugestaoDetalheAtual.id
    );
    lista.innerHTML = comentarios.length ? "" : "<p class='municipio-opcao-vazio'>Nenhum comentário ainda.</p>";
    const municipio = municipioAtualSugestoes;
    const sugestaoId = sugestaoDetalheAtual.id;
    comentarios.forEach((c) => {
      const linha = document.createElement("p");
      linha.className = "comentario-linha";
      linha.innerHTML = `<b>${escaparHtml(c.autorApelido)}:</b> ${escaparHtml(c.texto)}`;
      // Mesma dupla do comentário de post (ver adicionarAcaoDoComentario).
      adicionarAcaoDoComentario(linha, c, {
        apagar: () => window.raspadinhaAuth.excluirComentarioSugestao(municipio, sugestaoId, c.id),
        aoApagar: () => atualizarContadorSugestao(sugestaoId, -1),
        denuncia: {
          tipo: "comentario-sugestao",
          referencia: `sugestoesComunidade/${municipio}/itens/${sugestaoId}/comentarios/${c.id}`,
          resumo: c.texto,
          autor: c.autorApelido,
          autorUid: c.autorUid,
        },
      });
      lista.appendChild(linha);
    });
  } catch (erro) {
    console.error("Falha ao carregar comentários:", erro);
    lista.innerHTML = "<p class='municipio-opcao-vazio'>Não foi possível carregar os comentários.</p>";
  }
}

async function enviarComentarioDetalheSugestao() {
  const input = document.getElementById("input-comentario-sugestao");
  const texto = input.value.trim();
  if (!texto || !sugestaoDetalheAtual) return;

  input.disabled = true;
  try {
    const municipio = municipioAtualSugestoes;
    const sugestaoId = sugestaoDetalheAtual.id;
    const novoId = await window.raspadinhaAuth.comentarSugestao(municipio, sugestaoId, texto);
    input.value = "";
    atualizarContadorSugestao(sugestaoId, 1);

    const lista = document.getElementById("sugestao-detalhe-comentarios");
    if (lista.querySelector(".municipio-opcao-vazio")) lista.innerHTML = "";
    const linha = document.createElement("p");
    linha.className = "comentario-linha";
    linha.innerHTML = `<b>${escaparHtml(window.raspadinhaAuth.apelido)}:</b> ${escaparHtml(texto)}`;
    // Ganha o ✕ na hora, pelo mesmo motivo do comentário de post.
    adicionarAcaoDoComentario(
      linha,
      { id: novoId, autorUid: window.raspadinhaAuth.usuarioAtual?.uid },
      {
        apagar: () => window.raspadinhaAuth.excluirComentarioSugestao(municipio, sugestaoId, novoId),
        aoApagar: () => atualizarContadorSugestao(sugestaoId, -1),
      }
    );
    lista.appendChild(linha);
  } catch (erro) {
    alert(erro?.message || "Não foi possível enviar o comentário.");
  } finally {
    input.disabled = false;
  }
}

async function aoCurtirSugestao(sugestao, card) {
  const meuUid = window.raspadinhaAuth.usuarioAtual?.uid;
  const botao = card.querySelector(".sugestao-card-curtir");
  const contador = card.querySelector(".sugestao-card-curtidas");
  const jaCurtido = botao.classList.contains("curtido");
  const novoEstado = !jaCurtido;

  botao.classList.toggle("curtido", novoEstado);
  contador.textContent = Number(contador.textContent) + (novoEstado ? 1 : -1);
  if (novoEstado) dispararPopCoracao(botao);

  try {
    await window.raspadinhaAuth.curtirSugestao(municipioAtualSugestoes, sugestao.id, novoEstado);
    sugestao.numCurtidas = (sugestao.numCurtidas || 0) + (novoEstado ? 1 : -1);
    if (novoEstado) sugestao.curtidoPor = [...(sugestao.curtidoPor || []), meuUid];
    else sugestao.curtidoPor = (sugestao.curtidoPor || []).filter((uid) => uid !== meuUid);
  } catch (erro) {
    console.error("Falha ao curtir sugestão:", erro);
    botao.classList.toggle("curtido", jaCurtido);
    contador.textContent = Number(contador.textContent) + (novoEstado ? -1 : 1);
  }
}

async function aoExcluirSugestao(sugestao, card) {
  if (!confirm("Excluir essa sugestão? Essa ação não pode ser desfeita.")) return;
  try {
    await window.raspadinhaAuth.excluirSugestao(municipioAtualSugestoes, sugestao.id, sugestao.fotoDriveId);
    card.remove();
    sugestoesCarregadas = sugestoesCarregadas.filter((s) => s.id !== sugestao.id);
  } catch (erro) {
    alert(erro?.message || "Não foi possível excluir a sugestão.");
  }
}

/**
 * Compartilha o link direto de um post (mesmo padrão de
 * compartilharApp, só que com "?post=" em vez de "?convite="). Abrir
 * esse link detecta o parâmetro e abre o painel social direto nesse
 * post (ver abrirPostDoLinkSeExistir).
 */
function compartilharPost(postId) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("post", postId);

  const dados = {
    title: "Desbrava",
    text: "Olha esse post no Desbrava!",
    url: url.toString(),
  };

  if (navigator.share) {
    navigator.share(dados).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard
      .writeText(dados.url)
      .then(() => alert("Link copiado! Cole onde quiser compartilhar."))
      .catch(() => prompt("Copie o link para compartilhar:", dados.url));
  } else {
    prompt("Copie o link para compartilhar:", dados.url);
  }
}

/**
 * Se o app foi aberto com "?post=id" (link de compartilhar) e a
 * pessoa já está logada, abre o painel social mostrando só esse post
 * -- consome o pendente na hora pra não reabrir de novo em trocas de
 * conta subsequentes na mesma sessão.
 */
function abrirPostDoLinkSeExistir(usuario) {
  if (!postIdPendenteDoLink || !usuario) return;
  const postId = postIdPendenteDoLink;
  postIdPendenteDoLink = null;
  abrirPainelSocialComPost(postId);
}

async function abrirPainelSocialComPost(postId) {
  filtroMunicipioSocialId = null;
  filtroPontoSocialId = null;
  document.getElementById("social-filtro-municipio").classList.add("oculto");
  fecharModalNovoPost();
  document.getElementById("btn-social-carregar-mais").classList.add("oculto");
  document.getElementById("modal-social").classList.remove("oculto");

  const feedEl = document.getElementById("social-feed");
  feedEl.innerHTML = '<div class="spinner spinner-grande"></div>';

  try {
    const post = await window.raspadinhaAuth.buscarPost(postId);
    feedEl.innerHTML = "";
    if (!post) {
      feedEl.innerHTML = "<p>Esse post não existe mais.</p>";
      return;
    }
    feedEl.appendChild(renderizarCardPost(post));
  } catch (erro) {
    console.error("Falha ao abrir post compartilhado:", erro);
    feedEl.innerHTML = "<p>Não foi possível carregar esse post.</p>";
  }
}

/* ---- Criar post ---- */

function abrirModalNovoPost() {
  resetarFormularioCriarPost();
  document.getElementById("modal-novo-post").classList.remove("oculto");
}

function fecharModalNovoPost() {
  fecharComAnimacao(document.getElementById("modal-novo-post"));
}

function aoEscolherFotoPost(evento) {
  const arquivo = evento.target.files[0];
  if (!arquivo) {
    limparDropzone("dropzone-post", "Toque para escolher uma foto");
    return;
  }
  mostrarFotoNoDropzone("dropzone-post", arquivo, "Trocar foto");
}

async function aoMarcarPessoaPost() {
  const input = document.getElementById("input-marcar-pessoa");
  const apelido = input.value.trim();
  if (!apelido) return;

  if (pessoasMarcadasForm.some((p) => p.apelido.toLowerCase() === apelido.toLowerCase())) {
    input.value = "";
    return;
  }

  try {
    const encontrado = await window.raspadinhaAuth.buscarUsuario(apelido);
    if (!encontrado) {
      alert("Ninguém encontrado com esse apelido.");
      return;
    }
    pessoasMarcadasForm.push({ uid: encontrado.uid, apelido: encontrado.apelido });
    input.value = "";
    renderizarPessoasMarcadasForm();
  } catch (erro) {
    alert(erro?.message || "Não foi possível marcar essa pessoa.");
  }
}

function renderizarPessoasMarcadasForm() {
  const container = document.getElementById("lista-pessoas-marcadas");
  container.innerHTML = "";
  pessoasMarcadasForm.forEach((pessoa) => {
    const chip = document.createElement("span");
    chip.className = "chip-pessoa-marcada";
    chip.innerHTML = `@${escaparHtml(pessoa.apelido)} <button type="button" aria-label="Remover">✕</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      pessoasMarcadasForm = pessoasMarcadasForm.filter((p) => p.uid !== pessoa.uid);
      renderizarPessoasMarcadasForm();
    });
    container.appendChild(chip);
  });
}

/**
 * Reduz o peso da foto antes de subir pro Storage: redesenha num
 * <canvas> menor (lado maior no máximo 1600px) e reexporta como JPEG
 * com qualidade 0.72 -- perde um pouco de nitidez, mas cai bastante
 * de tamanho (importante porque o plano gratuito do Storage tem cota
 * de download diária). Funciona assim por enquanto (solução simples);
 * se o arquivo não puder ser lido/comprimido por algum motivo, sobe o
 * original sem quebrar o post.
 */
function comprimirFotoPost(arquivo, { ladoMaximo = 1600, qualidade = 0.72 } = {}) {
  return new Promise((resolve) => {
    const imagem = new Image();
    const urlTemp = URL.createObjectURL(arquivo);

    imagem.onload = () => {
      URL.revokeObjectURL(urlTemp);

      try {
        let { width, height } = imagem;
        if (width > ladoMaximo || height > ladoMaximo) {
          const escala = ladoMaximo / Math.max(width, height);
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(imagem, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) return resolve(blob);
          // Alguns navegadores de celular (em especial webviews de
          // apps tipo Instagram/WhatsApp) retornam null no toBlob. Em
          // vez de cair pro arquivo ORIGINAL (que pode ter vários MB e
          // estourar a memória na hora de ler pra base64 -- era o
          // "Não foi possível ler a foto" que aparecia), converte o
          // canvas já reduzido via toDataURL (síncrono, bem mais
          // suportado) de volta pra um blob pequeno.
          try {
            const dataUrl = canvas.toDataURL("image/jpeg", qualidade);
            fetch(dataUrl)
              .then((r) => r.blob())
              .then((b) => resolve(b || arquivo))
              .catch(() => resolve(arquivo));
          } catch (e) {
            resolve(arquivo);
          }
        }, "image/jpeg", qualidade);
      } catch (e) {
        // Qualquer falha no canvas (memória, drawImage etc): não trava
        // o fluxo -- sobe o arquivo original como último recurso.
        resolve(arquivo);
      }
    };
    imagem.onerror = () => {
      URL.revokeObjectURL(urlTemp);
      resolve(arquivo);
    };
    imagem.src = urlTemp;
  });
}

async function publicarPost() {
  const arquivo = document.getElementById("input-foto-post").files[0];
  const texto = document.getElementById("input-legenda-post").value.trim();
  const municipioId = municipioNovoPost || null;
  const erroEl = document.getElementById("social-form-erro");
  const statusEl = document.getElementById("social-form-status");
  const botao = document.getElementById("btn-publicar-post");

  erroEl.classList.add("oculto");
  if (!arquivo) {
    erroEl.textContent = "Escolha uma foto pra postar.";
    erroEl.classList.remove("oculto");
    return;
  }

  botao.disabled = true;
  botao.querySelector(".spinner").classList.remove("oculto");
  statusEl.textContent = "Preparando a foto...";
  statusEl.classList.remove("oculto");

  try {
    const fotoComprimida = await comprimirFotoPost(arquivo);
    statusEl.textContent = "Publicando...";
    await window.raspadinhaAuth.criarPost({
      arquivoFoto: fotoComprimida,
      texto,
      municipioId,
      pontoId: pontoNovoPost || null,
      pessoasMarcadas: pessoasMarcadasForm,
    });
    resetarFormularioCriarPost();
    fecharModalNovoPost();
    carregarFeedSocial(true);
  } catch (erro) {
    console.error("Falha ao publicar post:", erro);
    erroEl.textContent = erro?.message || "Não foi possível publicar agora.";
    erroEl.classList.remove("oculto");
  } finally {
    botao.disabled = false;
    botao.querySelector(".spinner").classList.add("oculto");
    statusEl.classList.add("oculto");
  }
}

function resetarFormularioCriarPost() {
  document.getElementById("input-foto-post").value = "";
  document.getElementById("input-legenda-post").value = "";
  municipioNovoPost = null;
  document.getElementById("btn-municipio-post-valor").textContent = "Nenhum";
  pontoNovoPost = null;
  atualizarSeletorDePontoDoPost();
  limparDropzone("dropzone-post", "Toque para escolher uma foto");
  document.getElementById("input-marcar-pessoa").value = "";
  document.getElementById("social-form-erro").classList.add("oculto");
  pessoasMarcadasForm = [];
  renderizarPessoasMarcadasForm();
}
