# Radar Local

Extensão Manifest V3 para monitoramento manual de preços. Os dados são guardados em `chrome.storage.local`; não há backend, login, sincronização ou chamadas para serviços de IA.

## Instalar no Chrome

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta `radar-local`.
5. Fixe **Radar Local** na barra do Chrome.

## Usar

- Abra a página do curso, certificado ou produto e clique no ícone da extensão.
- Use **Monitorar esta página**, selecione uma pasta e salve.
- Em **Pastas**, crie, renomeie ou apague as suas próprias pastas.
- Em **Monitorados**, use **Atualizar**. Na primeira verificação de cada domínio, o Chrome pedirá permissão para ler aquele site.
- Se a página não expuser um preço reconhecível, salve um seletor CSS na ficha e tente novamente.
- Exporte um backup JSON para guardar ou transferir seus dados manualmente.

## Privacidade e limites

O armazenamento é local ao perfil do Chrome. A extensão pede permissão por domínio somente quando você atualiza um item daquele site. A verificação abre a página em uma aba inativa, lê o DOM e fecha a aba. Sites podem impedir a leitura, exigir autenticação ou apresentar preços ambíguos; confira os resultados antes de tomar decisões. O histórico guarda até 300 leituras por item.

Para outro computador, use exportar/importar backup. Não existe monitoramento com o Chrome fechado nesta versão.
