# LinkedIn Spam Blocker

[![CI](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml/badge.svg)](https://github.com/cortega26/stop-spam-linkedin/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/cortega26/stop-spam-linkedin?label=release)](https://github.com/cortega26/stop-spam-linkedin/releases)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f)](../manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-compativel-4285F4?logo=googlechrome&logoColor=white)](#manual-unpacked-install)
[![Firefox](https://img.shields.io/badge/Firefox-compativel-FF7139?logo=firefoxbrowser&logoColor=white)](#manual-unpacked-install)
[![Local only](https://img.shields.io/badge/privacidade-somente%20local-0a7f64)](../PRIVACY_POLICY.md)
[![No telemetry](https://img.shields.io/badge/telemetria-nenhuma-0a7f64)](../PRIVACY_POLICY.md)
[![License](https://img.shields.io/badge/licenca-source--available-lightgrey)](../LICENSE)

**Ler em:** [English](../README.md) | [Español](README.es.md) | [Français](README.fr.md) | **Português** | [Deutsch](README.de.md)

Limpe o ruido do feed do LinkedIn sem enviar seu feed para lugar nenhum.

LinkedIn Spam Blocker oculta publicacoes comuns de engagement bait que pedem para comentar uma palavra-chave como "CLAUDE", "SKILL" ou "PROMPTS" para receber um arquivo, modelo, pacote de prompts ou "acesso". Ele roda localmente no navegador, funciona no Chrome e no Firefox, e permite desfazer ou ajustar o bloqueio quando algo sai errado.

## Visao geral

- **Privado por design** — sem analytics, telemetria, listas remotas, APIs de IA ou requisicoes de rede
- **Feito para o feed real do LinkedIn** — analisa novas publicacoes enquanto voce rola a pagina, sem depender de seletores CSS frageis
- **Ajustavel** — adicione frases personalizadas, escolha idiomas de deteccao, permita autores e importe/exporte sua lista
- **Reversivel** — mostre temporariamente uma publicacao oculta ou marque como "Not spam" para que o mesmo texto nao seja bloqueado de novo
- **Leve** — JavaScript vanilla, Manifest V3, sem etapa de build

## Por que existe

O fluxo de denuncia do LinkedIn muitas vezes deixa publicacoes de engagement bait no ar, mesmo quando seguem um padrao obvio: "comente X e eu envio Y". Essas publicacoes sao otimizadas para alcance algoritmico, nao para discussoes uteis, e podem ocupar o espaco de trabalho, vagas e novidades da industria que as pessoas realmente abriram o LinkedIn para ver.

Esta extensao oferece uma forma local e privada de deixar o seu proprio feed menos barulhento sem esperar pela acao da plataforma. Ela nao denuncia publicacoes, nao contacta o LinkedIn e nao muda nada no servidor. Ela apenas oculta publicacoes correspondentes no seu navegador.

## Como funciona

LinkedIn Spam Blocker analisa texto em paginas compatíveis do LinkedIn e compara com padroes integrados de engagement bait mais as frases personalizadas que voce adiciona. Quando uma publicacao corresponde, ela e ocultada e substituida por um pequeno marcador para que voce possa restaura-la imediatamente.

A deteccao e heuristica, nao magia. Ela pode perder novos formatos de spam e, ocasionalmente, ocultar uma publicacao que voce queria ver. A extensao inclui "Show", "Not spam", frases personalizadas, seletores de idioma e lista de autores permitidos para voce ajustar ao seu feed.

## Recursos

- **Deteccao somente local** — zero requisicoes de rede, sem analytics, sem telemetria, sem APIs externas
- **Padroes integrados** — detecta estruturas comuns de comentar-para-revelar em ingles, espanhol, frances, portugues e alemao
- **Frases personalizadas** — adicione seus proprios gatilhos com correspondencia Exact ou Contains, com limites para manter armazenamento e busca leves
- **Analise independente de seletores** — usa analise de texto do DOM em vez de classes CSS frageis do LinkedIn
- **Analise incremental** — verifica novas publicacoes enquanto voce rola
- **Criacao pelo clique direito** — selecione texto e adicione pelo menu de contexto do navegador
- **Atualizacoes em tempo real** — mudancas de frases e idiomas valem sem recarregar a extensao
- **Soneca** — pausa o bloqueio por 30 minutos com retorno automatico
- **Importar / Exportar** — faca backup ou compartilhe sua lista de frases como JSON
- **Desfazer e controlar falsos positivos** — clique em "Show" ou "Not spam" no marcador
- **Lista de autores permitidos** — evita bloquear perfis, empresas, escolas ou paginas showcase especificas
- **Estatisticas** — contagens de hoje, desta semana e de todo o periodo no popup
- **Rotas do LinkedIn compatíveis** — feed, perfis, publicacoes, paginas de empresa, grupos, busca, Minha rede, notificacoes, vagas, newsletters e artigos

## Limites

- O LinkedIn pode mudar a estrutura das paginas, exigindo atualizacoes na deteccao.
- Novas formulacoes de engagement bait podem passar ate que os padroes ou suas frases personalizadas sejam atualizados.
- Falsos positivos sao possiveis, especialmente em publicacoes que citam exemplos de spam ou discutem spam.
- As contagens sao estatisticas locais de conveniencia, nao relatorios analiticos precisos.

## O que nao faz

- Nao denuncia publicacoes ao LinkedIn
- Nao remove publicacoes do LinkedIn para outras pessoas
- Nao bloqueia contas globalmente
- Nao usa IA, APIs externas ou listas remotas
- Nao coleta analytics, telemetria, historico de navegacao ou dados da conta LinkedIn
- Nao modifica dados do LinkedIn no servidor

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

Publicacao pendente. Por enquanto, use os passos de instalacao manual abaixo.

### Firefox Add-ons

Publicacao pendente. Por enquanto, use os passos de complemento temporario abaixo.

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

Para bugs, falsos positivos ou padroes de spam nao detectados, abra uma issue com a frase ou trecho relevante e o tipo de pagina do LinkedIn onde aconteceu. Evite compartilhar detalhes privados de contas ou conteudo completo de publicacoes, a menos que seja necessario para reproduzir o problema.

## Licenca

Source-available proprietaria. Voce pode inspecionar o codigo-fonte e usar a extensao para uso pessoal, mas redistribuicao, uso comercial e produtos derivados concorrentes nao sao permitidos sem autorizacao previa por escrito. Consulte [LICENSE](../LICENSE).

