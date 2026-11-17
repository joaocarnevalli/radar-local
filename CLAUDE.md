# Radar Local — instruções para o Claude

Extensão Chrome/Brave (Manifest V3) para monitorar preços localmente. Repositório: https://github.com/joaocarnevalli/radar-local

## Regras do projeto

- 100% local: dados, histórico, configurações e backups ficam em `chrome.storage.local`. Sem backend, conta, API externa ou telemetria.
- Precisa funcionar no Brave e no Chrome (Chromium 120+).
- Prioridade máxima: precisão da extração de preços. Em falha, preservar o último preço válido.
- Um produto pode ter várias URLs/ofertas de lojas diferentes.
- Interface em português do Brasil.
- Visual escuro, limpo e premium: preto, branco e cinza; sem borda externa colorida; nada de visual genérico de IA, excesso de cards, bordas ou cores. Ver `DESIGN.md`.
- O popup tem todas as funções; o painel é a mesma experiência com mais espaço.
- Não remover recursos existentes sem explicar antes.
- **Nunca fazer commit nem push sem o João pedir.** Ao terminar, passar os comandos git.

## Estrutura

- `manifest.json` na raiz; código em `src/`:
  - `background/service-worker.js` — fila persistente de leituras, alarmes (início e periódico), seletor visual, alertas.
  - `shared/` — `money.js` (parsing monetário), `data-store.js` (validação, concorrência, URLs canônicas), `price-extractor.js` (regras de loja, elemento memorizado, heurísticas, disponibilidade).
  - `popup/` — `popup.js` (estado global, init, gravação) + um arquivo por assunto (`products`, `offers`, `settings`, `site-locks`, `folders`, `capture`, `refresh`, `backup`, `item-state`, `format`, `dialogs`). São scripts clássicos no mesmo escopo global, carregados em ordem pelo `popup.html`; `popup.js` por último.
  - `dashboard/`, `capture/`, `offscreen/`.
- `assets/icons/`, `tests/` (`data.test.cjs`, `browser.cjs`, `harness.cjs`), `tools/` (`check-files.cjs`, `package.ps1`, `store-assets.cjs`), `store/` (kit da Chrome Web Store), `.github/workflows/tests.yml` (CI).
- Ao criar arquivo usado pela extensão, incluí-lo em `tools/package.ps1` (o `check-files.cjs` acusa se faltar).

## Validação (rodar antes de entregar)

```powershell
node tools/check-files.cjs
node --test tests/data.test.cjs
node tests/browser.cjs
powershell -ExecutionPolicy Bypass -File .\tools\package.ps1
```

`browser.cjs` usa Brave/Edge/Chromium/Chrome for Testing (o Google Chrome oficial 137+ ignora `--load-extension`) com perfil descartável em `.test-artifacts/` e páginas falsas interceptadas — nunca acessa lojas reais.

## Estado (versão 0.3.0, 16/11/2026)

- Leitura conferida em páginas reais: Amazon (regra embutida), KaBuM (componente NumberFlow), Magalu (vitrines excluídas, proximidade do título). Mercado Livre tem tratamento próprio no extrator, ainda não revalidado em página real.
- Elemento do preço memorizado por oferta (`autoSelector`), sites travados (`siteProfiles`), seletor visual "Travar preço nesta página".
- Estoque automático/manual, verificação periódica, notificação abre a oferta, diálogos próprios, `unlimitedStorage`.
- Ideias pendentes: painel "Por que esse preço?" (candidatos encontrados + "Este é o certo"); regras para mais lojas (Mercado Livre na lista de regras, Americanas, Casas Bahia, Steam, Udemy) sempre com fixture baseada em página real.
