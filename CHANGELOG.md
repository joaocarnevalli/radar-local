# Histórico de versões

## 0.3.0 — 2026-11-16

- Trava do elemento do preço: ao confirmar uma leitura, o Radar memoriza em segundo plano o elemento que mostrou o preço e o usa primeiro nas próximas verificações. Se o elemento sumir, volta à detecção normal e reaprende; correções manuais e descartes desse elemento o esquecem.
- Regra embutida para a Amazon: ignora cópias escondidas do bloco de preço, preço "De", preço por unidade, parcelas e carrosséis; lê preços divididos em partes.
- Seletor visual "Travar preço nesta página": clique no preço na loja e o elemento passa a valer para o site todo.
- Configurações → Leitura de preços por site: lista de sites travados (com inclusão manual), elementos memorizados por oferta e regras embutidas.
- Seletores CSS ignoram elementos escondidos e aceitam duplicatas com o mesmo valor.
- Leitura conferida em páginas reais: preços do componente NumberFlow (KaBuM), prioridade ao preço perto do título, exclusão de vitrines e carrosséis (swiper, slick, `data-testid` de cartões) e seletores memorizados sem ids temporários do React.
- Barra de progresso com **×** para fechar e **Retomar**; uma fila pausada por erro não bloqueia mais **Atualizar tudo**, e falhas de som ou notificação não marcam a fila como travada.
- Verificação periódica opcional (1 a 24 horas) com o navegador aberto.
- Clicar numa notificação abre o painel com a oferta destacada.
- Estoque automático a partir dos dados da página, sem sobrescrever marcações manuais; página esgotada sem preço mantém o último preço.
- Endereço canônico na Amazon (`/dp/ASIN`) e detecção de duplicados no Mercado Livre pelo código MLB.
- Diálogos próprios no lugar de `prompt()`/`confirm()` do navegador; caixa de confirmação da captura compacta.
- Aviso quando o elemento memorizado deixa de ser encontrado em leituras seguidas.
- Permissão `unlimitedStorage` para históricos longos sem o teto de 10 MB.
- Código do popup dividido por assunto (`src/popup/*.js`), sem mudança de comportamento; `popup.js` mantém estado, inicialização e gravação.
- Extrator injetado uma vez por leitura; infraestrutura de testes compartilhada, detecção automática do navegador, verificador de referências (`tools/check-files.cjs`) e GitHub Actions.

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
