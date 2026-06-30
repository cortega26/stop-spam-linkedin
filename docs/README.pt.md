# LinkedIn Spam Blocker

*Parte do [ecossistema Tooltician](https://tooltician.com) — extensão de navegador que limpa seu feed do LinkedIn, privada por design.*

[![Parte do Tooltician](https://img.shields.io/badge/Parte_do-Tooltician.com-6C47FF?v=2)](https://tooltician.com)
[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](../manifest.json)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-v1.2.4-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-v1.2.4-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/addon/linkedin-spam-blocker/)
[![Local only](https://img.shields.io/badge/privacidade-somente%20local-0a7f64)](../PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetria-nenhuma-0a7f64)](../PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/licenca-source--available-lightgrey)](../LICENSE)

**Ler em:** [English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | **Português** | [Deutsch](README.de.md)

Aquelas publicacoes de "comente ESTRATEGIA abaixo e eu te mando o framework" estao em todo lugar. LinkedIn Spam Blocker as oculta automaticamente — tudo no seu navegador, sem enviar nada para lugar nenhum.

Detecta publicacoes que pedem para comentar uma palavra-chave como "CLAUDE", "SKILL" ou "PROMPTS" para receber um arquivo, modelo, pacote de prompts ou "acesso". Funciona no Chrome e no Firefox, inclui padroes para cinco idiomas de fabrica, e permite desfazer ou ajustar o bloqueio quando algo sai errado.

## Visao geral

- **Privado por design** — sem analytics, telemetria, listas remotas, APIs de IA ou requisicoes de rede de nenhum tipo
- **Multilingue** — padroes integrados para ingles, espanhol, frances, portugues e alemao, todos ativaveis independentemente
- **Ajustavel** — adicione frases personalizadas, permita autores de confianca e importe/exporte sua lista
- **Reversivel** — mostre temporariamente uma publicacao oculta ou marque como "Not spam" para que o mesmo texto nunca seja bloqueado de novo

## Por que existe

O fluxo de denuncia do LinkedIn muitas vezes deixa publicacoes de engagement bait no ar, mesmo quando seguem um padrao obvio: "comente X e eu envio Y". Essas publicacoes sao otimizadas para alcance algoritmico, nao para discussoes uteis, e podem ocupar o espaco de trabalho, vagas e novidades da industria que as pessoas realmente abriram o LinkedIn para ver.

Esta extensao oferece uma forma local e privada de deixar o seu proprio feed menos barulhento sem esperar pela acao da plataforma. Ela nao denuncia publicacoes, nao contacta o LinkedIn e nao muda nada no servidor. Ela apenas oculta publicacoes correspondentes no seu navegador.

## Como funciona

LinkedIn Spam Blocker analisa texto em paginas compatíveis do LinkedIn e compara com padroes integrados de engagement bait mais as frases personalizadas que voce adiciona. Quando uma publicacao corresponde, ela e ocultada e substituida por um pequeno marcador para que voce possa restaura-la imediatamente.

A deteccao e heuristica, nao magia. Ela pode perder novos formatos de spam e, ocasionalmente, ocultar uma publicacao que voce queria ver. A extensao inclui "Show", "Not spam", frases personalizadas, seletores de idioma e lista de autores permitidos para voce ajustar ao seu feed.

## Recursos

**Privacidade**
- Zero requisicoes de rede — sem analytics, telemetria, APIs externas ou listas remotas
- Todos os dados ficam no armazenamento do navegador; nada e transmitido jamais

**Deteccao**
- Padroes integrados para ingles, espanhol, frances, portugues e alemao, ativaveis individualmente
- Analise de texto do DOM em vez de classes CSS frageis do LinkedIn — resiste melhor a mudancas de layout do feed
- Analise incremental: verifica novas publicacoes enquanto voce rola
- Frases personalizadas com correspondencia Exata ou Contem

**Controles**
- Desfazer qualquer publicacao bloqueada pelo popup ou pelo marcador no feed
- Exclusao "Not spam" para que o mesmo texto nunca seja bloqueado de novo
- Lista de autores permitidos para perfis, empresas, escolas e showcases
- Pausa de 30 minutos com retorno automatico
- Clique direito no texto selecionado para adicionar uma frase instantaneamente
- Configuracoes ao vivo — mudancas de frases e idiomas sem recarregar a extensao
- Importar / Exportar a lista de frases como JSON

**Estatisticas e cobertura**
- Contagens de hoje, desta semana e de todo o periodo no popup
- Paginas compativeis: feed, perfis, publicacoes, paginas de empresa, grupos, busca, Minha rede, notificacoes, vagas, newsletters e artigos

## Limites

- O LinkedIn pode mudar a estrutura das paginas, exigindo atualizacoes na deteccao.
- Novas formulacoes de engagement bait podem passar ate que os padroes ou suas frases personalizadas sejam atualizados.
- Falsos positivos sao possiveis, especialmente em publicacoes que citam exemplos de spam ou discutem spam.
- As contagens sao estatisticas locais de conveniencia, nao relatorios analiticos precisos.

## O que nao faz

- Nao denuncia publicacoes ao LinkedIn nem interage com os servidores do LinkedIn de nenhuma forma
- Nao afeta o que outras pessoas veem — as mudancas sao locais ao seu navegador
- Nao le, armazena nem transmite seus dados de conta do LinkedIn, historico de navegacao ou conteudo de publicacoes

## Como usar

1. Instale a extensao.
2. Abra o LinkedIn e role normalmente.
3. Publicacoes correspondentes sao ocultadas automaticamente.
4. Clique no icone da extensao para ver estatisticas, ativar/desativar, pausar ou abrir configuracoes.
5. Clique em "Show" em qualquer publicacao bloqueada para restaura-la temporariamente.
6. Clique em "Not spam" se uma publicacao foi bloqueada por engano.
7. Adicione frases personalizadas nas configuracoes ou selecionando texto e usando o menu de contexto quando seu feed inventar uma nova variante.

## Instalar

### Chrome Web Store

[Instalar da Chrome Web Store](https://chromewebstore.google.com/detail/linkedin-spam-blocker/eolknfnafdodmaaajdiidaanpjbfolfc)

### Firefox Add-ons

[Instalar do Firefox Add-ons](https://addons.mozilla.org/addon/linkedin-spam-blocker/)

### Pacote mais recente

O zip mais recente esta anexado a [ultima release do GitHub](https://github.com/cortega26/stop-spam-linkedin/releases/latest). Para desenvolvimento local ou revisao manual, a instalacao sem empacotar costuma ser mais simples.

<a id="manual-unpacked-install"></a>
### Instalacao manual sem empacotar

1. Clone o repositorio: `git clone https://github.com/cortega26/stop-spam-linkedin.git`
2. Abra o Chrome e va para `chrome://extensions`
3. Ative o "Modo do desenvolvedor"
4. Clique em "Load unpacked" e selecione a pasta `stop-spam-linkedin`
5. No Firefox, abra `about:debugging#/runtime/this-firefox`, clique em "Load Temporary Add-on" e selecione `manifest.json`

## Capturas de tela

### Bloqueio no feed

![Captura do bloqueio no feed](../screenshots/screenshot-1-feed.png)

### Configuracoes

![Captura das configuracoes](../screenshots/screenshot-2-settings.png)

### Popup

![Captura do popup](../screenshots/screenshot-3-popup-1280x800.png)

## Desenvolvimento

Nao ha etapa de build. A extensao usa JavaScript vanilla e Manifest V3.

Comandos uteis:

- `npm run smoke` — valida JSON e verifica a sintaxe JavaScript
- `npm run test:extension` — carrega a extensao sem empacotar no Chromium e verifica que uma publicacao simulada do LinkedIn e ocultada
- `npm run test:package` — empacota a extensao e testa o zip exato da versao atual do manifest
- `npm run package` — cria `dist/linkedin-spam-blocker-{version}.zip` usando a versao de `manifest.json`

## Permissoes

- `storage` — salva preferencias, frases personalizadas, idiomas, estatisticas, pausa, autores permitidos e assinaturas de falsos positivos no armazenamento do navegador
- `contextMenus` — adiciona a acao de clique direito "Add to LinkedIn Spam Blocker" para o texto selecionado
- Correspondencias estaticas de content script em rotas compatíveis de `https://www.linkedin.com/*` — analisa paginas do LinkedIn sem pedir uma permissao de host mais ampla

Nenhum dado e transmitido. Veja [PRIVACY_POLICY.md](../PRIVACY_POLICY.md).

## Suporte

Use os formularios de issue para manter os relatorios organizados:

- **Bug** — algo parou de funcionar ou se comporta de forma inesperada
- **Falso positivo** — uma publicacao foi bloqueada quando nao deveria
- **Padrao nao detectado** — uma publicacao de spam passou sem ser bloqueada
- **Solicitacao de recurso** — algo que voce gostaria de ver adicionado

Inclua a frase ou trecho relevante e o tipo de pagina do LinkedIn. Evite compartilhar detalhes privados de contas ou conteudo completo de publicacoes, a menos que seja necessario para reproduzir o problema.

## Licenca

Source-available proprietaria. Voce pode inspecionar o codigo-fonte e usar a extensao para uso pessoal, mas redistribuicao, uso comercial e produtos derivados concorrentes nao sao permitidos sem autorizacao previa por escrito. Consulte [LICENSE](../LICENSE).

---

*Parte do [ecossistema Tooltician](https://tooltician.com) — extensão de navegador que limpa seu feed do LinkedIn, privada por design.*

