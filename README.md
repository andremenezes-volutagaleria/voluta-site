# Site da Voluta

Site estático da Voluta Galeria, hospedado no Netlify. Sem mensalidade de plataforma.

## Como está organizado

- `content/pecas/` — uma ficha (arquivo .json) por peça do acervo
- `content/site.json` — contatos, textos das páginas Sobre, Restauro e Política de devolução, lista de designers, IDs do Google Analytics e do Pixel da Meta
- `static/` — estilo (css), scripts (js), painel (`admin/`) e fotos enviadas pelo painel (`uploads/`)
- `build.mjs` — gera o site em `dist/` (rode `node build.mjs`)
- `netlify.toml` — diz ao Netlify como publicar

## Dia a dia: cadastrar ou vender uma peça

1. Acesse `volutagaleria.com.br/admin` e entre com o GitHub.
2. **Nova peça:** Peças do acervo → Nova Peça. Preencha, arraste as fotos (a primeira vira capa) e clique em Publicar.
3. **Vendeu:** abra a peça e mude Situação para "Vendido". Ela continua no site com o selo, o que ajuda a mostrar histórico.
4. **Tirar do ar:** Situação "Oculto".

O site se atualiza sozinho em cerca de 1 minuto depois de publicar.

## Colocar no ar (uma vez só)

1. Crie uma conta gratuita no GitHub e um repositório chamado `voluta-site`; envie esta pasta para ele.
2. No Netlify: Add new project → Import from GitHub → escolha `voluta-site`. As configurações de build já vêm do `netlify.toml`.
3. O painel já aponta para o repositório `andremenezes-volutagaleria/voluta-site` (em `static/admin/config.yml`).
4. Painel de login: no GitHub, Settings → Developer settings → OAuth Apps → New, com callback `https://api.netlify.com/auth/done`. No Netlify, Project configuration → Access & security → OAuth → Install provider → GitHub, colando o Client ID e o Secret.
5. Domínio: no Netlify, Domain management → Add domain `volutagaleria.com.br`. No Registro.br, aponte os DNS para o Netlify (o próprio Netlify mostra os valores).
6. Em `content/site.json`, preencha `ga4_id` e `meta_pixel_id` para manter o rastreamento dos anúncios.

## Antes de cancelar o Artlogic

- As fotos atuais ainda são carregadas dos servidores do Artlogic. **Baixe os originais** e suba pelo painel (ou coloque em `static/uploads/` e troque os endereços nas fichas), senão as fotos somem quando o contrato acabar.
- Os textos das peças foram reescritos a partir do site atual. Confira e, se preferir, cole os textos originais da planilha.
- Os endereços antigos do Artlogic já redirecionam para as páginas novas (arquivo `_redirects` gerado no build), então links de anúncios e do Google continuam funcionando.

## Painel de teste (só para experimentar)

`node build.mjs && node teste-painel.mjs` gera também `dist/admin-teste/`: o mesmo painel, já com todas as peças, mas sem salvar nada (ao recarregar, volta ao original). Serve para treinar. O site real publicado pelo Netlify não inclui essa página.
