# Radar Local

Acompanhe preços de cursos, certificações, jogos e outros produtos direto do navegador. Organize os itens em pastas, consulte o histórico e defina um preço-alvo para saber quando algo chegar ao valor desejado.

O Radar Local é uma extensão gratuita, de código aberto e com armazenamento no próprio navegador. Não exige conta nem servidor.

## O que você pode fazer

- Salvar a página aberta como um item monitorado; o Radar avisa quando o mesmo endereço já estiver salvo.
- Organizar itens em pastas personalizadas expansíveis, como **Certificações**, **Cursos** e **Jogos**. Na tela inicial, pastas com mais itens aparecem primeiro; empates e pastas vazias ficam em ordem alfabética. Novas pastas começam em cinza neutro; a cor pode ser escolhida depois na aba **Pastas**. As cores são apenas etiquetas visuais.
- Definir um preço-alvo, corrigir um preço manualmente e atualizar um item ou todos de uma vez.
- Exibir a porcentagem de desconto quando a página informa o preço normal e o preço promocional.
- Consultar o histórico recente de preços.
- Definir uma pasta padrão para novos itens.
- Opcionalmente, atualizar itens desatualizados ao iniciar o navegador, em sequência e no intervalo configurado.
- Exportar e importar um backup JSON com itens, histórico, pastas e preferências para transferir ou guardar seus dados.
- Informar um seletor CSS quando o site não apresentar o preço de uma forma que o Radar consiga reconhecer.

## Instalação

### Google Chrome

1. Baixe o projeto pelo botão **Code → Download ZIP** e extraia o arquivo, ou clone o repositório.
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `radar-local` que contém o arquivo `manifest.json`.
6. Fixe **Radar Local** na barra do navegador para facilitar o acesso.

### Brave

1. Baixe e extraia o projeto, ou clone o repositório.
2. Abra `brave://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione a pasta que contém `manifest.json`.

A extensão usa Manifest V3 e foi feita para navegadores Chromium. O carregamento local é indicado para uso e avaliação; esta versão não está publicada nas lojas de extensões.

## Como usar

1. Abra a página do produto, curso ou certificação.
2. Clique no ícone do Radar Local e em **Monitorar esta página**.
3. Escolha uma pasta e, se quiser, informe o preço atual e o preço-alvo.
4. Abra as pastas na seção **Monitorados**. Elas começam abertas e podem ser recolhidas pela seta; use **Atualizar** em um item ou **Atualizar tudo** para revisar a lista em sequência. Ao atualizar tudo, o navegador pode solicitar acesso aos domínios monitorados.
5. Se necessário, informe um seletor CSS na ficha do item e tente atualizar outra vez.

### Atualização automática

Na aba **Configurações**, você pode escolher uma pasta padrão e, se quiser, ativar a atualização automática. Ela vem desligada por padrão. Ao iniciar o navegador, o Radar coloca na fila os itens sem atualização há pelo menos 12 horas, 24 horas, 48 horas ou 7 dias — conforme sua escolha — e verifica **uma página por vez**, no intervalo selecionado de **1, 3, 5 ou 10 minutos**.

A fila usa somente sites cuja permissão já foi concedida; os demais são ignorados, sem pedido de acesso em segundo plano. Se o navegador for fechado antes do fim, os itens já atualizados ficam registrados e a fila é recalculada no próximo início. Quando a fila termina, ela não recomeça até o próximo início do navegador. Para atualizar todos manualmente, use **Atualizar tudo**.

A primeira verificação manual em cada site pode solicitar uma permissão do navegador para ler aquela página. O Radar abre o endereço em uma aba em segundo plano, tenta identificar o preço e fecha a aba ao terminar. O navegador pode mostrar brevemente essa aba na barra de abas.

## Como a leitura de preços funciona

O Radar prioriza valores monetários visíveis no conteúdo do produto e ignora selos percentuais, como “36% OFF”, e preços riscados. Quando consegue ler o preço normal riscado e o promocional, exibe a porcentagem de desconto no cartão do item. Usa dados estruturados e metadados como alternativas. A leitura não funciona em todos os sites: conteúdo carregado de forma especial, preços exibidos como imagem, login, CAPTCHA ou mudanças no layout podem impedir a identificação ou levar a um resultado incorreto. Confira o valor no site antes de salvar; em um item salvo, use **Corrigir** para registrar o valor manualmente. Registros incorretos do histórico podem ser removidos individualmente.

Se o site tiver um elemento HTML estável com o preço, você pode informar seu seletor CSS no campo do item. Por exemplo, `[itemprop='price']`. O seletor pode deixar de funcionar quando o site muda sua página.

## Privacidade e armazenamento

- Pastas, itens e histórico ficam em `chrome.storage.local`, no perfil local do navegador.
- Não há conta, backend, sincronização em nuvem, telemetria ou integração com serviços de IA.
- Atualizações manuais podem solicitar acesso aos sites monitorados. A atualização automática usa apenas permissões já concedidas e não solicita novas permissões em segundo plano.
- Ao atualizar, o navegador acessa o site monitorado para carregar sua página. O site pode receber a conexão normalmente, como em uma navegação comum.
- Os dados não são compartilhados entre dispositivos automaticamente. Use **Exportar backup** e **Importar backup JSON** para transferi-los.
- O histórico guarda até 300 verificações por item.

Remover a extensão ou limpar os dados do navegador pode apagar os dados locais. Exporte um backup se quiser preservá-los.

## Limitações desta versão

- A atualização automática roda após o navegador iniciar, se habilitada, e percorre os itens desatualizados uma vez por início. Não há monitoramento periódico contínuo nem alerta com o navegador fechado.
- A extração depende da estrutura de cada site e não garante que o preço identificado seja o preço final, incluindo frete, impostos ou descontos condicionais.
- O projeto ainda não está publicado na Chrome Web Store ou na loja do Brave; é instalado localmente pelo modo de desenvolvedor.

## Desenvolvimento

O projeto é uma extensão sem processo de build: os arquivos da interface e do código-fonte ficam na raiz do repositório. Para testar alterações, abra a página de extensões do navegador, use **Recarregar** no cartão do Radar Local e abra o popup novamente.

Relatos de problemas e contribuições são bem-vindos. Ao abrir uma issue, inclua o navegador, a versão e os passos para reproduzir o problema. Não publique URLs privadas, dados pessoais ou conteúdo de páginas que exijam autenticação.

## Licença

Este projeto está sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para ver os termos. Em resumo, a licença permite usar, copiar, modificar e distribuir o projeto, inclusive em projetos comerciais, mantendo o aviso de copyright e a licença.
