# Kit de publicação — Radar Local 0.3.0

Preparado em 16/11/2026. O pacote foi criado localmente; nada foi enviado ao GitHub ou ao Google nesta etapa.

## Arquivos

| Arquivo | Onde usar |
| --- | --- |
| `../dist/radar-local-0.3.0-chrome-web-store.zip` | Upload em “Adicionar novo item” no Developer Dashboard. |
| `../dist/radar-local-0.3.0-chrome-web-store.zip.sha256` | Conferência de integridade do ZIP. Não é necessário enviar ao Google. |
| `listing-pt-BR.txt` | Nome, resumo, descrição, categoria e idioma da ficha da loja. |
| `privacy-fields.md` | Finalidade única, justificativas de permissões e declarações de uso de dados. |
| `reviewer-instructions.txt` | Instruções de teste para o revisor do Google, em inglês. |
| `../PRIVACY.md` | Política pública de privacidade, a publicar no repositório. |
| `assets/icon-128.png` | Ícone da ficha. |
| `assets/01-produtos-1280x800.png` | Primeira captura: organização por produtos e pastas. |
| `assets/02-ofertas-historico-1280x800.png` | Segunda captura: lojas, controles e histórico local. |
| `assets/03-pastas-1280x800.png` | Terceira captura: pastas, cores e exportação. |
| `assets/04-configuracoes-1280x800.png` | Quarta captura: preferências e revisão de leituras. |

As capturas são da interface real, em 1280×800, com produtos, lojas, valores e endereços `.example` fictícios. Não são preços ou promoções verificados. Os dados de demonstração e os scripts de teste não entram no ZIP. As imagens promocionais opcionais (440×280 e 1400×560) não são exigidas para a submissão e não fazem parte deste kit.

O ZIP usa uma lista explícita de 35 arquivos de execução, ícones, licença e política. Não inclui `.git`, testes, ferramentas de geração, este kit, perfis temporários ou backups do usuário. O `manifest.json` fica na raiz. A pasta `dist/` é ignorada pelo Git e pode ser recriada a qualquer momento.

## 1. Publicar os arquivos de suporte no GitHub

Use um terminal PowerShell. Execute na ordem abaixo, começando por mudar de pasta:

```powershell
Set-Location 'C:\Users\joaos\Documents\Codex\2026-11-09\cah\radar-local'
git status
git add README.md manifest.json .gitignore CHANGELOG.md SECURITY.md PRIVACY.md src assets tests tools store .github
git diff --cached --stat
git commit -m "Prepare Radar Local 0.3.0 and Chrome Web Store publication kit"
git push origin main
```

Os arquivos da revisão anterior também estão nessa lista porque o pacote 0.3.0 usa essas correções. Se houver conflito no push, resolva-o antes de continuar; não use force push para contornar.

Depois do envio, abra em uma janela sem login e confira:

- Política: https://github.com/joaocarnevalli/radar-local/blob/main/PRIVACY.md
- Suporte: https://github.com/joaocarnevalli/radar-local/issues

A URL de política acima é o endereço esperado após o push, não uma confirmação de que o arquivo já está publicado. O repositório deve ser público e Issues deve estar habilitado. A política identifica o mantenedor e usa o canal público de issues para dúvidas sem dados privados. O e-mail verificado da conta de desenvolvedor precisa ser preenchido por você no Google.

## 2. Criar o item da loja

1. Entre em https://chrome.google.com/webstore/devconsole com a conta que será proprietária da extensão. Conclua o cadastro, a taxa e as verificações que o Google solicitar. Ative a verificação em duas etapas da conta.
2. Em “Adicionar novo item”, envie o ZIP de `dist/`. Envie o arquivo ZIP da extensão; os textos e screenshots são anexados nos campos da ficha.
3. Na ficha da loja, use `listing-pt-BR.txt`. Selecione Português (Brasil), a categoria de compras disponível e adicione o ícone e as quatro capturas na ordem numérica.
4. Em privacidade, use `privacy-fields.md`. Divulgue URLs e conteúdo de páginas tratados localmente. Informe a política pública já acessível, justifique cada permissão e declare que não há código remoto.
5. No campo de instruções de teste, copie `reviewer-instructions.txt`. Não há conta de teste ou credenciais do Radar.
6. Na distribuição, selecione visibilidade pública e os países desejados. A extensão é gratuita; a taxa de cadastro do desenvolvedor não é uma cobrança aos usuários.
7. Salve e confira o preview da ficha. Envie para análise com publicação manual após aprovação, se quiser revisar a ficha antes de liberar.

A publicação depende da análise do Google. Os campos e nomes podem mudar; siga a exigência exibida no painel quando diferir deste roteiro.

## 3. Migrar sua instalação atual

Exporte um backup JSON na instalação manual **antes** de removê-la. A instalação da loja pode ter um identificador diferente e um armazenamento separado. Instale pela loja, importe o backup e confira produtos, URLs e histórico antes de remover a instalação antiga. Permissões dos sites e recursos opcionais precisam ser concedidas na nova instalação.

Para futuras atualizações da loja, aumente a versão no manifest, gere outro ZIP e envie para o mesmo item do Dashboard. As instalações da loja usam o mecanismo de atualização do navegador. A instalação manual atual não é convertida automaticamente em uma instalação da loja.

## Recriar o kit

```powershell
Set-Location 'C:\Users\joaos\Documents\Codex\2026-11-09\cah\radar-local'
node tools/check-files.cjs
node --test tests/data.test.cjs
node tests/browser.cjs
node tools/store-assets.cjs
.\tools\package.ps1
```

O gerador de imagens abre um Brave, Chrome ou Edge isolado com dados fictícios e salva um perfil em `.test-artifacts/`, sem tocar no perfil pessoal. Assim como o teste de integração, usa o sandbox interno desativado apenas para as páginas controladas. Nunca use esse perfil para navegação pessoal. Nenhuma opção de teste é incorporada ao pacote distribuído.

## Fontes oficiais consultadas

- Publicação: https://developer.chrome.com/docs/webstore/publish
- Imagens e dimensões: https://developer.chrome.com/docs/webstore/images
- Campos de privacidade: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Divulgação de dados locais: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
