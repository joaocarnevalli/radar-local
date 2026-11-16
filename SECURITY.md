# Segurança

O Radar Local lê páginas fornecidas pelo usuário. Conteúdo dessas páginas e backups importados são tratados como dados, não como código da extensão.

## Proteções

- Scripts da extensão são locais e sujeitos à Content Security Policy do Manifest V3.
- Mensagens de comando são aceitas somente das páginas internas previstas. Acesso direto ao armazenamento fica restrito aos contextos confiáveis da extensão.
- URLs salvas devem ser HTTP/HTTPS, sem usuário ou senha embutidos. Redirecionamentos para outro domínio interrompem a leitura.
- Nomes e conteúdo das lojas são inseridos na interface como texto. As poucas atribuições de `innerHTML` contêm ícones estáticos do próprio projeto.
- Favicons são obtidos do mesmo domínio, sem credenciais, com limite de tamanho e tempo; não são usados serviços externos de ícones.
- Importações têm validação de estrutura, preços, datas, identificadores e tamanho. Alterações concorrentes e limite de armazenamento são verificados antes de gravar.
- CSV protege células textuais que possam ser interpretadas como fórmulas por planilhas.
- Leituras ambíguas não substituem automaticamente preços aceitos. Falhas de rede mantêm o preço e o histórico anteriores.

## Limites

Armazenamento local não significa criptografia. Quem tem acesso ao perfil do navegador ou aos backups pode ler os dados. A extensão não protege contra comprometimento do computador ou do próprio navegador.

A leitura carrega páginas das lojas no navegador. Elas podem usar a sessão autenticada, cookies e recursos da página normalmente. Não há backend ou telemetria do Radar, mas o site monitorado recebe essas visitas.

A identificação de preços usa heurísticas, regras por site e seletores escolhidos pelo usuário. Um site pode publicar informações incorretas ou alterar seu layout. Níveis de confiança e testes automatizados não garantem que o preço final, a variante ou a condição comercial estejam corretos.

Os testes de navegador usam páginas controladas, não um levantamento de acerto em marketplaces reais. Esta revisão não é uma auditoria independente nem uma garantia de ausência de vulnerabilidades.

## Relatar problemas

Para falhas funcionais, abra uma issue com versão, navegador e passos de reprodução. Remova URLs privadas, tokens, dados pessoais e conteúdo autenticado dos exemplos. Se houver uma vulnerabilidade explorável, procure um canal privado com o mantenedor antes de divulgar detalhes; não publique backups pessoais.
