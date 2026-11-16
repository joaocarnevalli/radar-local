# Histórico de versões

## 0.2.0 — 2026-11-15

- Fila de verificações manuais e automáticas no service worker; continua ao fechar popup e painel, com retomada e controles de pausa/cancelamento.
- Gravações coordenadas entre janelas e fila, com detecção de conflitos e preservação de históricos concorrentes.
- Validação de backups, URLs, valores, identificadores e quota; recuperação de dados locais inválidos sem apagá-los automaticamente.
- Parser monetário compartilhado: corrige separadores de milhares na captura manual e preserva a moeda.
- Extrator mais conservador para recomendações, parcelas, selos percentuais, seletores ambíguos e fontes sem confirmação visual.
- Revisão obrigatória de candidatos ambíguos e mudanças de moeda; último preço preservado nas falhas.
- Correções da aba de origem no painel, estados de atualização, referência de desconto e comparações entre moedas.
- Capturas de seleção independentes, validação do remetente das mensagens e armazenamento restrito aos contextos da extensão.
- Removida a declaração inválida da permissão `windows`; permissões opcionais documentadas.
- Testes de regressão em Node.js e integração com Chromium em perfil isolado.
