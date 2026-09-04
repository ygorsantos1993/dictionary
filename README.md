# Dictionary

Dicionário pessoal web para consultar e salvar palavras, atualmente com foco
no idioma turco.

## Estrutura

```text
dictionary/
├── index.html
├── pages/
│   ├── dictionary.html
│   ├── english.html
│   ├── wiktionary-search.html
│   └── wiktionary-debug.html
├── assets/
│   ├── css/
│   ├── js/
│   │   ├── core/
│   │   └── pages/
│   └── images/
└── README.md
```

## Executar localmente

Como o projeto usa módulos JavaScript, abra-o por um servidor HTTP local:

```bash
python3 -m http.server
```

Depois, acesse `http://localhost:8000`.

O login e o salvamento das palavras usam o Supabase, e as consultas são feitas
na API do Wiktionary.

## Schemas do Supabase

Os objetos específicos do dicionário turco ficam no schema `turkish`:
`turkish.turkish_words`, `turkish.turkish_meanings` e as funções de escrita.
Depois de aplicar as migrations, adicione `turkish` em
**Supabase → Project Settings → API → Exposed schemas**.
