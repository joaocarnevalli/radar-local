# Radar Local

Acompanhe preços de cursos, certificações, jogos e outros produtos direto do navegador. Organize os itens em pastas, consulte o histórico e defina um preço-alvo para saber quando algo chegar ao valor desejado.

O Radar Local é uma extensão gratuita, de código aberto e com armazenamento no próprio navegador. Não exige conta nem servidor.

## O que você pode fazer

- Salvar a página aberta como um item monitorado; o Radar avisa quando o mesmo endereço já estiver salvo.
- Usar todas as funções diretamente no popup ou abrir a mesma interface numa aba maior. A aba amplia o espaço de trabalho; pastas, lojas, histórico e configurações também continuam disponíveis na extensão.
- Organizar itens em pastas personalizadas expansíveis, como **Certificações**, **Cursos** e **Jogos**. Na tela inicial, pastas com mais itens aparecem primeiro; empates e pastas vazias ficam em ordem alfabética. Novas pastas começam em cinza neutro; a cor pode ser escolhida depois na aba **Pastas**. As cores são apenas etiquetas visuais.
- Definir um preço-alvo, corrigir um preço manualmente e atualizar um item ou todos de uma vez.
- Buscar produtos e lojas, filtrar por falha/desatualização, preço-alvo e disponibilidade, e ordenar por nome, preço, atualização ou preço-alvo.
- Exibir a porcentagem de desconto quando a página informa o preço normal e o preço promocional.
- Consultar o histórico recente de preços e, ao expandi-lo, ver um gráfico local com até 60 pontos recentes e o menor valor observado entre eles.
- Revisar mudanças grandes: por padrão, uma variação acima de 50% vira um preço candidato, preservando o preço aceito e o histórico até você aceitar ou descartar.
- Ver a origem e o nível de confiança da leitura; essa indicação pode ser desligada em **Configurações**.
- Definir uma pasta padrão para novos itens.
- Opcionalmente, atualizar itens desatualizados ao iniciar o navegador, em sequência e no intervalo configurado.
- Receber notificações opcionais quando um preço cair ou atingir o preço-alvo, com beep curto e indicador no ícone configuráveis.
- Acompanhar o progresso por loja e da atualização em lote, com estado explícito para falha, preço que precisa de revisão e leitura concluída.
- Exportar e importar um backup JSON com itens, histórico, pastas e preferências para transferir ou guardar seus dados.
- Informar um seletor CSS quando o site não apresentar o preço de uma forma que o Radar consiga reconhecer.
- Opcionalmente, selecionar um texto de preço na página e usar o menu de contexto do Radar para revisar e salvar o valor manualmente.
- Mesclar um backup JSON sem apagar os dados atuais ou substituir os dados com confirmação; exportar a lista para CSV.

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

A extensão usa Manifest V3 e exige Chromium 120 ou superior. O carregamento local é indicado para uso e avaliação; esta versão não está publicada nas lojas de extensões.

## Como usar

1. Para cadastrar diretamente da página, abra o produto, curso ou certificação e clique em **Monitorar esta página**. Isso cria um produto com aquela URL.
2. Para cadastrar o produto antes de escolher as lojas, clique em **＋ Produto**, informe nome, pasta e preço-alvo e, dentro do cartão criado, use **＋ Adicionar URL**. Cada loja mantém preço, seletor e histórico próprios.
3. Os cartões de produtos começam recolhidos. Abra um produto para ver as lojas; abra uma loja para consultar seu histórico, corrigir o preço ou ajustar o seletor CSS. A loja com o menor preço conhecido aparece no resumo e seu nome abre o link da oferta.
4. Use **Atualizar** na oferta ou **Atualizar tudo** para revisar a lista em sequência. Ao atualizar, o navegador pode solicitar acesso aos domínios monitorados.

### Atualização automática

Na aba **Configurações**, você pode escolher uma pasta padrão e, se quiser, ativar a atualização automática. Ela vem desligada por padrão. Ao iniciar o navegador, o Radar coloca na fila as URLs que não são verificadas há mais que o período definido por você — de **1 minuto a 365 dias** — e verifica **uma página por vez**, no intervalo selecionado de **30 segundos a 60 minutos**.

A fila usa somente sites cuja permissão já foi concedida; os demais são ignorados, sem pedido de acesso em segundo plano. Se o navegador for fechado antes do fim, os itens já atualizados ficam registrados e a fila pendente é retomada no próximo início, exceto se estiver pausada. Quando a fila termina, ela não recomeça até o próximo início do navegador. Para atualizar todos manualmente, use **Atualizar tudo**.

As verificações manuais e automáticas compartilham uma fila persistente no processo de segundo plano da extensão. Fechar o popup ou o painel não interrompe a fila. Ela abre uma página por vez; uma aba que você trouxer para o primeiro plano durante a leitura não é fechada automaticamente. Pausar ou cancelar interrompe as próximas leituras; a leitura em andamento pode terminar.

Na mesma aba, você pode ativar alertas quando um preço cair ou cruzar o preço-alvo. O Radar pode mostrar uma notificação do sistema e um símbolo temporário no ícone; o som é independente, oferece oito estilos de beep, controle de volume e intervalo mínimo personalizado por item. O botão **Testar som** permite ouvir o estilo escolhido. As permissões de notificação e áudio só são solicitadas quando você ativa ou testa esses recursos. Um erro de conexão ou uma leitura sem preço válido mantém o último preço e o histórico; o item mostra que a verificação falhou.

Em **Alertas de preço**, você pode exigir uma queda percentual mínima e ativar alertas de novo menor preço observado. O preço-alvo continua sendo independente dessas regras. O menor valor é calculado apenas com o histórico guardado pelo Radar para aquele item.

O Radar recomenda pelo menos 1 minuto entre páginas e mostra um aviso para valores menores. A fila automática pode ser pausada, retomada ou cancelada em **Configurações**. Os itens com preço-alvo são priorizados. O intervalo regula a fila automática; ele não altera **Atualizar tudo**. Em **Aparência**, você pode escolher uma cor de destaque para detalhes da interface, como o wordmark “Local”, e restaurar o padrão quando quiser. O contorno externo do popup e as bordas dos produtos permanecem neutros; as cores das pastas continuam servindo apenas como identificação.

O menu de contexto vem desligado. Ao ativá-lo, o navegador pede a permissão opcional **contextMenus**; ao desligar, o Radar remove o item de menu e solicita a retirada dessa permissão.

Em **Pastas**, a importação pode mesclar o backup com os dados atuais (padrão) ou substituí-los após confirmação. A mesclagem combina itens com a mesma URL normalizada, preserva os registros de histórico e não importa as configurações do arquivo. **Exportar CSV** cria uma linha por registro de preço do histórico de cada oferta, com dados do produto, loja, URL, preço, moeda, data, origem, confiança, disponibilidade e pasta. Ofertas sem histórico também aparecem, mesmo que ainda não tenham preço. O menor valor pode ser identificado pelos registros exportados; o CSV não cria uma coluna separada de mínimo. A área de configurações mostra o espaço ocupado pelos dados locais.

A primeira verificação manual em cada site pode solicitar uma permissão do navegador para ler aquela página. O Radar abre o endereço em uma aba em segundo plano, tenta identificar o preço e fecha a aba ao terminar. O navegador pode mostrar brevemente essa aba na barra de abas.

## Como a leitura de preços funciona

O Radar prioriza valores monetários visíveis no conteúdo do produto e exclui selos percentuais, como “36% OFF”, preços riscados e áreas identificadas como recomendações. Quando identifica um preço normal e o promocional na mesma leitura, exibe a porcentagem de desconto. Se uma leitura posterior não expuser o preço normal, mantém a referência com sua data e troca o selo por **vs. referência**. O menor valor observado é uma referência do histórico local, não prova de promoção nem substituto do preço normal.

Valores encontrados apenas em texto, metadados ou JSON-LD, preços conflitantes e mudanças de moeda precisam de revisão. Na captura inicial, confirme a oferta, a variante e a condição de pagamento; numa atualização, a leitura fica como candidata e o último preço aceito é mantido. Essas verificações continuam ativas mesmo se você desligar a proteção de variação percentual. A proteção percentual vem ligada por padrão e também pede revisão para mudanças superiores a 50%.

Uma verificação aguarda o carregamento da página e procura o preço por até 20 segundos adicionais; leituras automáticas confiáveis precisam se repetir antes de serem aceitas. Isso reduz erros, mas não garante acerto em qualquer site. Conteúdo especial, preços em imagens, login, CAPTCHA e mudanças de layout podem impedir a identificação ou produzir um valor incorreto. Confira o preço no site antes de comprar; use a caneta de correção para registrar manualmente. Registros incorretos do histórico podem ser removidos individualmente. Ofertas em moedas diferentes não são classificadas como um único menor preço do produto; não há conversão cambial.

Se o site tiver um elemento HTML estável com o preço, você pode informar seu seletor CSS no campo do item. Por exemplo, `[itemprop='price']`. O seletor precisa encontrar exatamente um elemento com um valor monetário válido; se falhar, o Radar não troca silenciosamente para outro preço da página. Também pode salvá-lo como perfil do domínio em **Configurações → Perfis de leitura por site**; esse perfil vale para outras URLs daquele domínio, enquanto o seletor individual tem prioridade. O seletor pode deixar de funcionar quando o site muda sua página.

## Privacidade e armazenamento

- Pastas, produtos, URLs das lojas, perfis de leitura, ícones de loja cacheados e históricos ficam em `chrome.storage.local`, no perfil local do navegador.
- Não há conta, backend, sincronização em nuvem, telemetria ou integração com serviços de IA.
- Atualizações manuais podem solicitar acesso aos sites monitorados. A atualização automática usa apenas permissões já concedidas e não solicita novas permissões em segundo plano.
- Notificações podem mostrar o nome e o preço do item no sistema operacional. Os beeps são gerados localmente pela extensão, têm estilo, volume e frequência configuráveis e podem ser silenciados pelo sistema.
- Ao atualizar, o navegador acessa o site monitorado para carregar sua página. O site pode receber a conexão normalmente, como em uma navegação comum.
- Ao expandir um produto, o Radar pode buscar uma vez o favicon no mesmo domínio da loja, desde que já tenha permissão para esse site; guarda uma cópia pequena localmente e limita o cache total de ícones. Não consulta um serviço externo de favicons.
- Os dados não são compartilhados entre dispositivos automaticamente. Use **Exportar backup** e **Importar backup JSON** para transferi-los.
- O histórico guarda até 300 verificações por item.
- Produtos podem ser arquivados e restaurados sem apagar ofertas ou histórico. Itens arquivados não entram em atualizações em lote nem na fila automática.
- Ao arquivar ou restaurar um produto, você pode desfazer a ação pelo aviso temporário. Exclusões e remoção de registros do histórico continuam pedindo confirmação.
- Cada oferta pode ser marcada manualmente como disponível, esgotada ou sem informação. Ofertas marcadas como esgotadas não são tratadas como menor preço atual.
- Alertas podem ser silenciados por produto ou por oferta, e há uma janela de silêncio configurável. Verificações e gravação do histórico continuam durante o silêncio.
- O botão de janela flutuante abre o Radar numa janela do navegador separada, redimensionável e conectada ao mesmo armazenamento local. Essa ação não exige uma permissão adicional de janelas.
- Uma oferta pode receber um nome de loja personalizado; o rótulo não altera a URL monitorada.
- Gráficos são desenhados localmente apenas quando o histórico é expandido; não há biblioteca de gráficos nem serviço remoto.
- A fila automática e a atualização manual carregam uma página por vez. O menu de contexto só é criado quando ativado; o texto selecionado é processado na página local da extensão.

Remover a extensão ou limpar os dados do navegador pode apagar os dados locais. Exporte um backup se quiser preservá-los.

As gravações de popup, painel e fila são coordenadas para preservar alterações simultâneas. Se duas janelas editarem o mesmo campo, a alteração conflitante é recusada e a versão mais recente é mantida. Backups JSON são validados antes da importação, têm limite de 9 MB e não aceitam URLs de execução, arquivos locais ou credenciais embutidas. Uma falha de validação ou falta de espaço mantém os dados anteriores. Se os dados locais estiverem inválidos, uma tela de recuperação permite exportar o original e restaurar um backup válido.

### Permissões

| Permissão | Uso |
| --- | --- |
| `activeTab`, `scripting` | Ler a página acionada pelo usuário, executando o extrator incluído na extensão. |
| `storage` | Guardar produtos, histórico, preferências e fila no perfil local. |
| `tabs` | Identificar a aba de origem, acompanhar carregamentos e redirecionamentos das leituras. |
| `alarms` | Retomar a fila mesmo quando o processo de segundo plano é suspenso pelo navegador. |
| Acesso opcional a sites HTTP/HTTPS | Pedir acesso aos domínios escolhidos para futuras verificações; não concede acesso a todos os sites na instalação. |
| `notifications`, `offscreen`, `contextMenus` (opcionais) | Alertas do sistema, áudio local e captura pelo botão direito, respectivamente. |

As páginas das lojas não recebem acesso direto ao armazenamento da extensão. Não há scripts remotos nem envio dos dados salvos para um servidor do Radar. As lojas continuam recebendo as visitas feitas durante uma verificação; o navegador pode usar seus cookies e carregar recursos externos da própria loja.

## Limitações desta versão

- A atualização automática roda após o navegador iniciar, se habilitada, e percorre os itens desatualizados uma vez por início. Não há monitoramento periódico contínuo nem alerta com o navegador fechado.
- Instalações locais carregadas sem compactação não são atualizadas automaticamente. Para receber atualizações sem baixar e recarregar manualmente, a extensão precisaria ser publicada em uma loja compatível; extensões publicadas na Chrome Web Store recebem atualizações pelo mecanismo do Chrome.
- A extração depende da estrutura de cada site e não garante que o preço identificado seja o preço final, incluindo frete, impostos ou descontos condicionais.
- O projeto ainda não está publicado na Chrome Web Store ou na loja do Brave; é instalado localmente pelo modo de desenvolvedor.

## Desenvolvimento

O [kit de publicação na Chrome Web Store](store/README.md) reúne o roteiro de envio, descrição da loja, justificativas de permissões, instruções de teste e capturas com dados fictícios. A política está em [PRIVACY.md](PRIVACY.md). Para gerar o ZIP de distribuição, execute `.\scripts\package.ps1` na raiz do projeto; o pacote é criado em `dist/` por uma lista explícita de arquivos.

O projeto é uma extensão sem processo de build: os arquivos da interface e do código-fonte ficam na raiz do repositório. Para testar alterações, abra a página de extensões do navegador, use **Recarregar** no cartão do Radar Local e abra o popup novamente.

Para atualizar uma instalação existente, exporte um backup e substitua os arquivos **na mesma pasta**. Recarregue a extensão; não a desinstale. A versão 0.2.0 normaliza os dados existentes preservando produtos e até 300 registros de histórico por oferta.

### Testes

Com Node.js 22 ou superior:

```powershell
node --test tests/data.test.cjs
node tests/browser.cjs
```

O primeiro comando testa parsing monetário, validação, concorrência, quota e recuperação de dados. O segundo abre um Brave ou Edge separado, com uma cópia da extensão e um perfil descartável em `.test-artifacts/`. As páginas de lojas são fixtures interceptadas localmente via DevTools, sem acesso a marketplaces ou ao perfil pessoal. O teste verifica captura, fila com popup fechado, carregamento tardio, falhas, revisão de preços e renderização. `RADAR_BROWSER` pode apontar para outro executável Chromium compatível. O modo de teste desativa o sandbox interno do navegador; use apenas com as fixtures incluídas e nunca com páginas ou dados pessoais.

Os testes não certificam compatibilidade com todas as lojas. Veja [SECURITY.md](SECURITY.md) para o escopo e os limites da proteção e [CHANGELOG.md](CHANGELOG.md) para as correções da versão.

Relatos de problemas e contribuições são bem-vindos. Ao abrir uma issue, inclua o navegador, a versão e os passos para reproduzir o problema. Não publique URLs privadas, dados pessoais ou conteúdo de páginas que exijam autenticação.

## Licença

Este projeto está sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para ver os termos. Em resumo, a licença permite usar, copiar, modificar e distribuir o projeto, inclusive em projetos comerciais, mantendo o aviso de copyright e a licença.
