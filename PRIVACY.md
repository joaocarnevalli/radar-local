# Política de privacidade — Radar Local

Última atualização: 15 de novembro de 2026. Aplicável à versão 0.2.0.

Radar Local é uma extensão mantida por João Carnevalli para acompanhar preços de páginas escolhidas pelo usuário. Esta política descreve o tratamento realizado pela extensão. O código está em https://github.com/joaocarnevalli/radar-local.

## Informações tratadas e finalidade

A extensão lê a URL, o título, os valores monetários, os metadados de produto e o endereço do ícone da página acionada pelo usuário ou incluída numa verificação autorizada. A extração consulta o conteúdo da página para identificar preço e preço de referência; o documento completo não é guardado. Se você ativar o menu de contexto, o texto selecionado é usado para preencher uma captura manual, sujeita à sua revisão.

São guardados localmente os produtos, URLs, nomes de lojas, pastas e cores, preços e moedas, datas e históricos, preços-alvo, seletores CSS e perfis de leitura, ícones de lojas, disponibilidade informada manualmente, erros e candidatos à revisão. Preferências, fila de verificações, identificadores temporários de abas e capturas pendentes também podem ser guardados para executar esses recursos. Esses dados servem para organizar seus itens, comparar ofertas da mesma moeda, atualizar leituras e emitir os alertas que você habilitar.

A extensão consulta informações de abas para encontrar a página de origem e acompanhar suas próprias leituras. Não registra um histórico geral de navegação. Não solicita nome, endereço de e-mail, senha, dados de pagamento ou informações de saúde. Evite monitorar páginas privadas ou salvar URLs que contenham informações sensíveis.

## Armazenamento, retenção e controle

Os dados ficam em `chrome.storage.local`, no perfil do navegador. Não há conta do Radar, sincronização em nuvem, servidor próprio, publicidade, rastreamento analítico ou serviço de inteligência artificial.

Cada oferta guarda até 300 registros de preço. Os dados permanecem até que você os exclua, substitua por um backup ou remova a extensão/limpe seus dados no navegador. Capturas de seleção são removidas ao salvar ou cancelar; capturas abandonadas são limpas em capturas futuras, com limite de 20 entradas e expiração considerada de 24 horas. A fila mantém o necessário para retomar verificações interrompidas.

Você pode editar ou remover produtos, ofertas, pastas e registros; arquivar apenas oculta o produto da lista ativa e conserva seus dados. As configurações permitem desativar atualizações automáticas, som, notificações e menu de contexto. Permissões podem ser revogadas nas configurações do navegador. Para apagar todos os dados da extensão, remova-a ou limpe seu armazenamento pelo navegador.

Backups JSON e exportações CSV são gerados no dispositivo por sua solicitação. Os arquivos ficam sob seu controle, podem conter URLs e informações privadas e não são enviados ao mantenedor. Para migrar da instalação manual à da loja, exporte um backup antes de remover qualquer instalação: versões com identificadores diferentes têm armazenamentos separados.

## Conexões e terceiros

Ao verificar uma oferta, a extensão abre sua URL numa aba temporária. A loja e os recursos que ela carregar recebem a conexão como numa navegação comum, que pode usar cookies e uma sessão já autenticada. A extensão não usa uma API de cookies nem guarda senhas. O Radar pode buscar um favicon no mesmo domínio autorizado da loja, sem enviar credenciais nessa busca, e guardar uma cópia pequena local.

Não vendemos nem transferimos seus registros a anunciantes, corretores de dados ou ao mantenedor. Os dados são usados apenas para os recursos de monitoramento apresentados. Não são usados para publicidade personalizada, avaliação de crédito ou empréstimos. Acesso às páginas é solicitado conforme os sites escolhidos; notificações, áudio e captura pelo menu são opcionais.

Notificações do sistema podem exibir nome e preço de produtos. Você pode desativá-las e definir um horário de silêncio. Ao abrir links de suporte ou do repositório, aplicam-se também as políticas do serviço acessado. Dados que você decidir publicar em uma issue serão tratados pelo GitHub; não inclua backups pessoais ou informações sensíveis.

## Segurança e alterações

O armazenamento da extensão não oferece criptografia adicional ou proteção por senha. Quem tiver acesso ao seu perfil do navegador ou aos arquivos exportados poderá acessar esses registros. A extensão valida dados importados e restringe mensagens e scripts aos contextos previstos, mas a identificação de preços depende das páginas e pode falhar.

Mudanças nesta política serão registradas neste documento com uma nova data. Alterações relevantes no tratamento de dados deverão ser refletidas na página da loja e, quando necessário, apresentadas na extensão antes de habilitar o novo tratamento.

## Contato

Mantenedor: João Carnevalli. Para perguntas sobre privacidade, use https://github.com/joaocarnevalli/radar-local/issues. Descreva a dúvida sem publicar dados pessoais, URLs privadas ou backups. Como o Radar não mantém uma cópia dos registros no servidor, o acesso, a exportação e a exclusão dos dados locais são feitos pelo próprio usuário no navegador.
