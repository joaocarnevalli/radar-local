# Radar Local

Acompanhe preços de cursos, certificações, jogos e outros produtos direto do navegador. Organize os itens em pastas, consulte o histórico e defina um preço-alvo para saber quando algo chegar ao valor desejado.

O Radar Local é uma extensão gratuita, de código aberto e com armazenamento no próprio navegador. Não exige conta nem servidor.

## O que você pode fazer

- Salvar a página aberta como um item monitorado.
- Organizar itens em pastas personalizadas, como **Certificações**, **Cursos** e **Jogos**.
- Definir um preço-alvo e atualizar o preço manualmente quando quiser.
- Consultar o histórico recente de preços.
- Exportar e importar um backup JSON para transferir ou guardar seus dados.
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
4. Para verificar novamente, abra o Radar Local e clique em **Atualizar** no item.
5. Se necessário, informe um seletor CSS na ficha do item e tente atualizar outra vez.

A primeira verificação em cada site pode solicitar uma permissão do navegador para ler aquela página. A verificação é iniciada por você: o Radar abre o endereço em uma aba em segundo plano, tenta identificar o preço e fecha a aba ao terminar.

## Como a leitura de preços funciona

O Radar procura preços em dados estruturados e metadados da página, além de elementos comuns no HTML. A leitura não funciona em todos os sites: páginas com conteúdo carregado de forma especial, preços exibidos como imagem, login, CAPTCHA ou mudanças no layout podem impedir a identificação ou levar a um resultado incorreto. Confira o valor exibido no site antes de tomar uma decisão.

Se o site tiver um elemento HTML estável com o preço, você pode informar seu seletor CSS no campo do item. Por exemplo, `[itemprop='price']`. O seletor pode deixar de funcionar quando o site muda sua página.

## Privacidade e armazenamento

- Pastas, itens e histórico ficam em `chrome.storage.local`, no perfil local do navegador.
- Não há conta, backend, sincronização em nuvem, telemetria ou integração com serviços de IA.
- A extensão solicita acesso ao site apenas quando você pede uma atualização e o navegador pode pedir sua autorização.
- Ao atualizar, o navegador acessa o site monitorado para carregar sua página. O site pode receber a conexão normalmente, como em uma navegação comum.
- Os dados não são compartilhados entre dispositivos automaticamente. Use **Exportar backup** e **Importar backup JSON** para transferi-los.
- O histórico guarda até 300 verificações por item.

Remover a extensão ou limpar os dados do navegador pode apagar os dados locais. Exporte um backup se quiser preservá-los.

## Limitações desta versão

- As verificações são manuais; não há atualização agendada nem alerta com o navegador fechado.
- A extração depende da estrutura de cada site e não garante que o preço identificado seja o preço final, incluindo frete, impostos ou descontos condicionais.
- O projeto ainda não está publicado na Chrome Web Store ou na loja do Brave; é instalado localmente pelo modo de desenvolvedor.

## Desenvolvimento

O projeto é uma extensão sem processo de build: os arquivos da interface e do código-fonte ficam na raiz do repositório. Para testar alterações, abra a página de extensões do navegador, use **Recarregar** no cartão do Radar Local e abra o popup novamente.

Relatos de problemas e contribuições são bem-vindos. Ao abrir uma issue, inclua o navegador, a versão e os passos para reproduzir o problema. Não publique URLs privadas, dados pessoais ou conteúdo de páginas que exijam autenticação.

## Licença

Este projeto está sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para ver os termos. Em resumo, a licença permite usar, copiar, modificar e distribuir o projeto, inclusive em projetos comerciais, mantendo o aviso de copyright e a licença.