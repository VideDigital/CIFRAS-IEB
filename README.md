# Cifras IEB

PWA para biblioteca de cifras, repertórios pessoais, grupos de louvor e ferramentas de prática.

## V9

A V9 transforma o projeto em um aplicativo musical mais completo, com foco em uso real em ensaios, cultos e estudo.

### Leitor de cifras

- transposição de acordes com sustenidos e bemóis;
- transposição de cifras antigas com acordes em linhas sem colchetes;
- modo **Somente letra** que remove acordes do conteúdo e da faixa de diagramas;
- velocidades de rolagem configuráveis;
- tela cheia com saída explícita;
- abas de leitura: **Cifra, Letra, Acordes, Ouvir e Mais**;
- tamanho de fonte;
- faixa de acordes da música;
- diagramas clicáveis;
- player de YouTube opcional por cifra;
- metrônomo disponível durante a leitura.

### Biblioteca e importação

- busca e filtros;
- seleção múltipla;
- exclusão de cifras em massa;
- importação em massa;
- prévia antes de salvar;
- edição de título, artista e tom antes da importação;
- remoção de arquivos da fila de importação;
- leitura direta do XML de DOCX para preservar UTF-8, acentos, tabs e espaçamento;
- reconstrução de linhas de acordes;
- PDF com tentativa de preservar posição horizontal do texto;
- arquivos com caracteres ilegíveis não são mais salvos silenciosamente.

### Repertórios

Repertórios pessoais permitem:

- criar;
- editar;
- excluir;
- pesquisar cifras;
- selecionar músicas;
- reordenar a sequência;
- tocar em modo lista.

Repertórios de grupo permitem:

- criar;
- editar;
- excluir, respeitando as permissões do grupo;
- pesquisar cifras;
- reordenar a sequência;
- copiar cifras do grupo para a biblioteca pessoal;
- tocar o repertório completo.

### Grupos

- código público de usuário;
- inclusão e remoção de membros;
- repertórios por data;
- biblioteca compartilhada por repertório;
- painel com membros e métricas;
- permissões de proprietário e membro.

### Acordes

A aba **Acordes** usa fórmulas harmônicas e geração de posições para oferecer uma biblioteca ampla.

Instrumentos:

- violão/guitarra;
- ukulele;
- teclado/piano.

Famílias incluídas incluem maiores, menores, power chords, diminutos, aumentados, suspensos, sextas, sétimas, nonas, décimas primeiras, décimas terceiras, alterados e slash chords.

Também são reconhecidas várias notações usadas em cifras brasileiras, como:

- `7M`;
- `m7M`;
- `m7(b5)`;
- `m7/9`;
- `m7/9/11`;
- `7/9`;
- `7/11`;
- `7/13`.

As posições de cordas são geradas algoritmicamente e, quando existe uma posição aberta comum cadastrada, ela é priorizada.

## Ferramentas

### Metrônomo

- 30–240 BPM;
- 2/4, 3/4, 4/4 e 6/8;
- acento no primeiro tempo;
- Tap Tempo;
- controles ±5 BPM;
- painel flutuante durante a cifra.

### YouTube

Cada cifra pode guardar um link de referência do YouTube. O vídeo pode permanecer aberto durante a leitura da cifra.

YouTube exige conexão com a internet; a cifra continua disponível offline.

### Personalização

Em **Configurações**:

- presets de cor;
- cor principal;
- cor dos acordes;
- fundo;
- cor da letra;
- tamanho padrão do leitor;
- velocidade padrão da rolagem.

## PWA e uso offline

O projeto usa:

- Service Worker;
- cache do shell do aplicativo;
- cache de runtime;
- persistência local do Cloud Firestore;
- cópia local auxiliar dos dados principais.

A V9 também pré-carrega, quando possível:

- módulos Firebase;
- PDF.js;
- Mammoth;
- JSZip.

No aplicativo, abra **Ferramentas → Preparar dados offline** enquanto estiver conectado.

Depois disso, cifras e repertórios sincronizados podem continuar disponíveis sem internet. Recursos externos como YouTube continuam dependendo de conexão.

## Firebase

O aplicativo utiliza:

- Firebase Authentication;
- Cloud Firestore.

O arquivo `firestore.rules` faz parte do repositório, mas GitHub Pages **não publica as regras do Firebase**.

Sempre que esse arquivo mudar, publique as regras manualmente em:

**Firebase Console → Firestore Database → Regras**

ou por um fluxo próprio com Firebase CLI.

## GitHub Pages

Publicação esperada:

- branch: `main`;
- pasta: `/ (root)`.

URL:

`https://videdigital.github.io/CIFRAS-IEB/`

## Validação automática

O workflow `.github/workflows/validate.yml` verifica:

- sintaxe de `app.js`;
- sintaxe do motor de acordes;
- sintaxe dos diagramas;
- sintaxe do Service Worker;
- IDs obrigatórios do HTML;
- versão V9 dos assets;
- versão do cache PWA;
- transposição de linhas de acordes antigas;
- proteção contra transposição dupla;
- slash chords;
- notação brasileira de extensões;
- geração de posições para guitarra e ukulele;
- diagrama de teclado.

## Teste manual recomendado

Antes de considerar uma versão pronta:

1. entrar na conta;
2. abrir uma cifra antiga;
3. alterar o tom para cima e para baixo;
4. testar uma cifra com acordes em linhas sem colchetes;
5. ativar **Letra** e confirmar que nenhum acorde aparece;
6. iniciar rolagem em todas as velocidades;
7. abrir um acorde e alternar violão, ukulele e teclado;
8. abrir o metrônomo;
9. cadastrar e abrir um link do YouTube;
10. criar e reordenar repertório pessoal;
11. criar, editar e excluir repertório de grupo;
12. selecionar e excluir várias cifras;
13. importar um DOCX problemático e revisar a prévia;
14. usar **Preparar dados offline**;
15. desconectar a internet e abrir uma cifra já sincronizada.

## Observação sobre dados antigos

Se uma importação antiga já gravou no Firestore texto realmente mutilado, por exemplo removendo caracteres da palavra original, não é possível reconstruir todos os casos com certeza.

A solução recomendada nesses casos é usar a exclusão em massa e reimportar os arquivos originais com a V9.
