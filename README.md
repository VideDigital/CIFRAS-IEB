# CIFRAS-IEB
CIFRA HUB — INSTALAÇÃO PELO CELULAR

IMPORTANTE
Os arquivos vieram com “.txt” para facilitar o envio. No GitHub, crie os arquivos com os nomes reais abaixo, sem “.txt”:
- index.html
- styles.css
- firebase-config.js
- chord-engine.js
- chord-diagrams.js
- app.js
- firestore.rules

1. CRIAR O REPOSITÓRIO
Crie um repositório público no GitHub e adicione os arquivos acima na raiz.

2. CONFIGURAR O FIREBASE
Acesse console.firebase.google.com e:
- Crie um projeto.
- Adicione um aplicativo Web.
- Copie o objeto firebaseConfig.
- Cole os valores no arquivo firebase-config.js.
- Em Authentication > Sign-in method, habilite E-mail/Senha.
- Em Firestore Database, crie o banco em modo de produção.
- Em Firestore > Regras, cole o conteúdo de firestore.rules e publique.

3. CRIAR ÍNDICES DO FIRESTORE
Ao abrir o site, o Firebase poderá mostrar no console do navegador links para criar índices.
Crie estes índices compostos:
- songs: ownerId crescente + updatedAt decrescente
- lists: ownerId crescente + updatedAt decrescente

4. PUBLICAR NO GITHUB PAGES
No repositório:
Settings > Pages > Deploy from a branch > main / root > Save.

5. FUNCIONALIDADES DESTE MVP
- Cadastro e login individual.
- Biblioteca privada por usuário.
- Criar, editar, importar e excluir cifras.
- Acordes em [colchetes].
- Transposição automática de acordes, inclusive sustenidos, bemóis e baixos invertidos.
- Clique no acorde para abrir diagrama.
- Aumento e redução de fonte.
- Rolagem automática com cinco velocidades.
- Listas privadas.
- Navegação anterior/próxima.
- Deslizar lateralmente no celular para trocar de música.
- Compartilhamento por link somente leitura.
- Layout responsivo para celular.

6. OBSERVAÇÃO
O dicionário de diagramas contém os acordes de violão mais usados. A transposição reconhece qualquer acorde formado por nota raiz, complemento e baixo, como F#m7, Bb9, Gsus4 e D/F#. Diagramas adicionais podem ser cadastrados depois no arquivo chord-diagrams.js.