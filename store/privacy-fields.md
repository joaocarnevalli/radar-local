# Campos para o Developer Dashboard

Textos de preenchimento para a versão 0.3.0. As URLs abaixo devem estar públicas e acessíveis antes de enviar para análise. Não marque “nenhum dado” apenas porque o processamento é local: a documentação do Google exige divulgar o tratamento local.

## Single purpose

Monitor prices on product pages explicitly selected by the user, organize those offers locally, and provide user-configured price history, comparisons and alerts.

## Justificativas das permissões

| Campo | Texto para copiar |
| --- | --- |
| activeTab | Provides temporary access to the active page when the user invokes the extension to capture a product URL, title and price. It is not used to record general browsing activity. |
| scripting | Runs the bundled price extractor in the isolated world of a user-selected page or an explicitly monitored offer. Scripts are packaged with the extension; no remote scripts are loaded by the extension. |
| storage | Stores products, monitored URLs, folders, price history, user preferences, reading profiles and the persistent refresh queue in the local browser profile. No Radar backend receives these records. |
| unlimitedStorage | Removes the default 10 MB cap of chrome.storage.local so long price histories for many offers are not rejected. Data stays in the local browser profile; nothing is uploaded. |
| tabs | Reads source-tab URL/title information when capturing from the dashboard or floating window and checks the URL, redirect origin and loading status of tabs created for monitored offers. It does not retain a general browsing history. |
| alarms | Schedules sequential refreshes and resumes the persisted queue when the Manifest V3 worker is suspended. It does not monitor prices while the browser is closed. |
| Optional host permissions: http://*/* and https://*/* | Users can monitor product pages on different websites. Host access is requested at runtime for the specific origins selected for capture/refresh, not granted to all sites at installation. It allows the bundled extractor to read those pages and fetch small same-origin favicons. Startup checks only use previously granted origins. |
| notifications (optional) | Displays price-alert notifications only after the user enables them and grants permission. Notifications may include the product name and price. |
| offscreen (optional) | Creates an offscreen audio document to generate short Web Audio notification tones with the user's chosen sound and volume. Requested only when audio alerts are enabled or tested. No audio is recorded or downloaded. |
| contextMenus (optional) | Adds a user-enabled selection menu to review a selected monetary value as a manual current/reference price. The selection is kept locally until saved, cancelled or pruned. |

## Remote code

Select “No, I am not using remote code.”

Explanation if requested: Extension logic is packaged locally. Store pages load normally in browser tabs; the extension reads their DOM with its own bundled scripts. It does not download or evaluate scripts as extension code.

## Data usage

Declare the following categories using the matching labels in the current dashboard:

- **Website content:** product titles, displayed prices, product metadata, favicons and user-selected price text are processed for capture/refresh. Only the relevant records are stored locally.
- **Web history / browsing activity:** monitored page URLs and store domains are stored locally for user-selected products. General browsing history is not recorded. This conservative declaration reflects that saved URLs are browsing-related data.

The extension does not request personally identifying, authentication, payment, health, location or communications data. Retail prices are product content; they are not a user's bank or payment information. Users may place private information in names or URLs, so avoid claiming that arbitrary saved records can never contain personal data.

Certify the statements about not selling/transferring data, not using data for purposes unrelated to the single purpose, and not using it to determine creditworthiness, if their wording matches the current form. These describe the current code. Reassess them if future monetization or integrations change the behavior.

## URLs

- Privacy policy (publish first): https://github.com/joaocarnevalli/radar-local/blob/main/PRIVACY.md
- Homepage: https://github.com/joaocarnevalli/radar-local
- Support: https://github.com/joaocarnevalli/radar-local/issues

The policy uses the public repository issue tracker as the contact channel. The developer account may separately require a verified email; enter an email you control in the dashboard. No email was invented for this package.

## Referências

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
