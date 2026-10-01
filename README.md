# Cifras IEB

Aplicativo web/PWA para biblioteca de cifras, listas pessoais, grupos de louvor e repertórios compartilhados.

## Versão atual da interface

A branch `fix/v7-stabilization` prepara a **V7.0**, com foco em estabilidade antes de novas funcionalidades.

### Principais correções da V7

- importação DOCX/PDF com limpeza de caracteres invisíveis;
- leitura estruturada de tabelas e parágrafos de DOCX;
- reconhecimento de acordes complexos e linhas de introdução;
- inferência de tom quando o arquivo não informa `Tom:`;
- prévia de cada cifra antes da importação em massa;
- correção do botão **Mais** no leitor e no player de listas;
- estado único para tela cheia, painéis rápidos e navegação mobile;
- correção de overflow horizontal e conteúdo cortado no celular;
- ordenação real das listas;
- redesign de biblioteca, busca, grupos, leitor e navegação inferior;
- cache PWA atualizado e runtime cache para dependências externas;
- regras do Firestore endurecidas para compartilhamentos e grupos;
- validação automática via GitHub Actions.

## Arquivos principais

- `index.html` — estrutura das telas e diálogos.
- `styles.css` — interface responsiva.
- `app.js` — autenticação, Firestore, biblioteca, listas, grupos, importação e leitores.
- `chord-engine.js` — transpose e renderização dos acordes.
- `chord-diagrams.js` — diagramas disponíveis.
- `firebase-config.js` — configuração pública do Firebase Web.
- `firestore.rules` — regras de segurança do banco.
- `service-worker.js` — cache e funcionamento PWA.
- `manifest.webmanifest` — metadados de instalação.

## Firebase

O projeto usa:

- Firebase Authentication;
- Cloud Firestore;
- cache persistente do Firestore.

A configuração Web do Firebase pode ficar no cliente. A segurança dos dados depende das regras do Firestore.

### Importante sobre `firestore.rules`

Alterar o arquivo neste repositório **não publica automaticamente as regras no Firebase** quando o site é hospedado apenas pelo GitHub Pages.

Depois de aprovar uma alteração em `firestore.rules`, publique o mesmo conteúdo no Firebase Console em:

`Firestore Database → Regras`

ou use o Firebase CLI em um fluxo de deploy dedicado.

## GitHub Pages

O site continua podendo ser publicado por:

`Settings → Pages → Deploy from a branch → main / root`

Os arquivos usam versionamento na query string (`?v=7.0.0`) para reduzir problemas com cache antigo.

## Testes antes de publicar

A automação em `.github/workflows/validate.yml` verifica:

- sintaxe de `app.js`;
- sintaxe de `chord-engine.js`;
- sintaxe de `chord-diagrams.js`;
- sintaxe de `service-worker.js`;
- IDs duplicados no HTML;
- presença dos controles essenciais do leitor;
- versão dos assets e do cache PWA.

Além disso, teste manualmente no celular:

1. login;
2. biblioteca;
3. importar um único DOCX;
4. revisar a prévia;
5. importar em massa;
6. abrir cifra;
7. alterar tom;
8. iniciar/parar rolagem;
9. abrir **Mais**;
10. entrar e sair de tela cheia;
11. criar lista;
12. tocar uma lista;
13. criar grupo;
14. adicionar membro;
15. criar repertório no grupo;
16. desligar a internet e reabrir uma cifra sincronizada.

## Estrutura de importação recomendada

O importador entende melhor documentos com estruturas como:

```text
Título: Nome da música
Artista: Ministério
Tom: G

Intro: G | D/F# | Em7 | C9

G
Primeira linha da letra

D/F#   Em7
Segunda linha da letra
```

Também são aceitos DOCX em que acordes e letras estejam em parágrafos ou tabelas. A V7 tenta reconstruir essas estruturas antes de salvar.

## Observação

Cifras que já foram importadas anteriormente com conteúdo corrompido permanecem salvas dessa forma no Firestore. Depois da atualização do importador, exclua ou edite essas cifras e importe os arquivos originais novamente.
