# Viagens

Site das viagens da família: linha do tempo por dia, voos, hospedagens, carros, passeios e restaurantes.
Login com Google; cada viagem só abre para os e-mails cadastrados nela.

## Como funciona

- `index.html`, `app.js`, `style.css`: o site (sem build, só arquivos estáticos).
- `config.js`: configuração pública do projeto Firebase.
- `firestore.rules`: quem pode ler e escrever. Cole no console do Firebase em **Firestore → Regras**.
- `.github/workflows/pages.yml`: publica no GitHub Pages a cada push na `main`.

## Dados no Firestore

```
viagens/{viagemId}            nome, inicio, fim, familias, viajantes, membros[], dono
viagens/{viagemId}/itens/{id} tipo, titulo, data, hora, dataFim, horaFim, local, codigo,
                              valor, moeda, status, pago, link, obs, familia
```

## Leitura de PDF

O botão **Enviar PDF** manda o arquivo ao Gemini pelo Firebase AI Logic
(Gemini Developer API, plano gratuito). Nada é salvo antes de a pessoa conferir.

## Configuração no Firebase

1. Authentication → Google ativado; domínio `<org>.github.io` autorizado.
2. Firestore em modo produção, com as regras de `firestore.rules`.
3. Firebase AI Logic → Gemini Developer API.
