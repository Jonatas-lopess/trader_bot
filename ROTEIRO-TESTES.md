# Roteiro de testes — ver todas as telas do site

Passo a passo para percorrer o site inteiro e anotar o que achar estranho.

Use uma janela do navegador normal, em computador e depois no celular (ou reduza a janela). Várias telas mudam de layout no celular.

**O que está provisório (não precisa reportar):**
- Nomes dos robôs ("Robô Exemplo A/B/C"), preços, descrições e perguntas do FAQ são texto de exemplo.
- O pagamento usa o modo de teste do Stripe. **Nenhuma cobrança é real.**
- Botões "Contato" e "Falar com o suporte" aparecem desativados de propósito.
- Termos de Uso e Política de Privacidade ainda não têm o texto jurídico final.

---

## Parte 1 — Páginas públicas

1. **Página inicial** — abra `https://trader-bot.jonataslopes-011.workers.dev/`. Role até o fim e confira cada bloco, na ordem:
   - [ ] Topo com título e botões
   - [ ] Vídeo
   - [ ] "Como funciona" (4 passos)
   - [ ] Prévia do catálogo
   - [ ] Perguntas frequentes (FAQ): clique em cada pergunta para abrir e fechar
   - [ ] Rodapé
2. **Menu do topo** — clique em cada item e veja se leva ao lugar certo:
   - [ ] "Como funciona" (rola a página inicial até a seção)
   - [ ] "Catálogo"
   - [ ] "FAQ" (rola até as perguntas)
   - [ ] "Login"
   - [ ] "Comprar agora"
3. **Catálogo** — abra `https://trader-bot.jonataslopes-011.workers.dev/catalog`.
   - [ ] Navegue pelo carrossel de robôs (setas, ou arraste no celular)
   - [ ] **Robô Exemplo A**: tem três ofertas (compra única, anual, mensal)
   - [ ] **Robô Exemplo B**: tem só compra única
   - [ ] **Robô Exemplo C**: aparece como "Em breve", sem botão de compra
   - [ ] Aviso regulatório no fim da página
4. **Termos de Uso** e **Política de Privacidade** — abra os dois pelo rodapé.
   - [ ] Confira se abrem e se o texto está legível
5. **Rodapé** — clique em cada link.
   - [ ] "Contato" aparece desativado (esperado)
   - [ ] Confira o aviso sobre o direito de arrependimento de 7 dias

## Parte 2 — Fazer uma compra de teste

Esta parte cria o cliente e libera a área do cliente.

1. No catálogo, escolha **Robô Exemplo A** e clique para comprar a oferta **Mensal**.
2. Você vai para a tela de pagamento do Stripe (modo de teste). Preencha:
   - E-mail: **o e-mail que você vai usar para entrar na parte 4**
   - Cartão: `4242 4242 4242 4242`
   - Validade: qualquer data futura (ex.: `12/34`)
   - CVC: qualquer (ex.: `123`)
   - Nome e demais campos: qualquer valor
3. Conclua o pagamento. Você volta ao site na **tela de confirmação**:
   - [ ] Primeiro aparece "Aguardando confirmação do pagamento…"
   - [ ] Em poucos segundos muda sozinha para "Pagamento confirmado!", com o botão "Entrar na área do cliente"
   - [ ] **Não clique nesse botão ainda**: ele está desativado nesta fase. Siga para a parte 3.
4. **Variações opcionais** (cada uma gera uma tela diferente):
   - [ ] Comece uma compra e, na tela do Stripe, clique na seta de voltar sem pagar. Você deve voltar à página inicial.
   - [ ] Abra `https://trader-bot.jonataslopes-011.workers.dev/checkout/confirmacao` sem nada depois. Deve aparecer "Não encontramos esse checkout…"
   - [ ] Faça uma segunda compra de **outro robô** (ex.: Exemplo B, compra única) com o mesmo e-mail. Ela vira um segundo cartão na área do cliente.
   - [ ] Tente comprar o **mesmo robô** de novo (Exemplo A) enquanto a primeira compra está ativa. Deve aparecer uma mensagem simples em inglês ("You already have an active license for this robot."). É uma tela provisória, apenas anote.

> **E-mails automáticos:** o envio de e-mails está limitado nesta fase. Provavelmente **você não vai receber** o e-mail de link de acesso nem o de download. Isso é esperado e é o motivo do passo 4.

## Parte 3 — Tela de login

1. Abra `https://trader-bot.jonataslopes-011.workers.dev/login`.
   - [ ] Confira título, campo de e-mail e botão
2. Digite o e-mail da compra e envie.
   - [ ] Deve aparecer a mensagem "Se esse e-mail existir em nossa base, você receberá um link…". O texto é o mesmo para qualquer e-mail, de propósito.
3. Abra `https://trader-bot.jonataslopes-011.workers.dev/login?error=1`.
   - [ ] Deve aparecer a mensagem de link inválido ou expirado

## Parte 4 — Entrar na área do cliente (sem e-mail)

Como o e-mail com o link não chega, use o atalho de teste. Cole no navegador, trocando as partes entre `< >`:

```
https://trader-bot.jonataslopes-011.workers.dev/login/dev?email=<SEU-EMAIL-DA-COMPRA>&key=SfDZbiJm933C
```

- [ ] Você deve cair direto em **Meus produtos** (`/conta`).
- Se aparecer "404" ou voltar ao login com erro: confira se o e-mail é exatamente o da compra e se a chave está correta. Se persistir, avise o Jonatas.

## Parte 5 — Área do cliente (Meus produtos)

1. **Visão geral**
   - [ ] Título "Meus produtos" e selo de Licenças ativas (só aparece se houver alguma ativa)
   - [ ] Um cartão por compra, mostrando o nome do robô e a oferta (ex.: "Oferta Mensal")
   - [ ] Painel lateral com o cartão de suporte (botão desativado, esperado) e a nota sobre o servidor
2. **Cartão "Conta pendente"** (estado logo após a compra)
   - [ ] Formulário pedindo o número da conta na corretora
   - [ ] Digite `abc` ou `0123` e envie: o navegador deve bloquear e pedir o formato correto (só números, sem zero à esquerda)
   - [ ] Digite um número válido, só dígitos e sem zero à esquerda (ex.: `1234567`) e envie: deve abrir uma **janela de confirmação**
   - [ ] Confirme: a página recarrega com o aviso verde "Recebemos o número da conta…"
   - [ ] O cartão passa a **"Em preparo"**
3. **Cancelar assinatura** (só existe na oferta **Mensal**)
   - [ ] Clique em "Cancelar assinatura": deve abrir uma janela de confirmação
   - [ ] Confirme e veja como o cartão fica depois
4. **Sair** — use o botão "Sair" no topo da área do cliente.
   - [ ] Você volta ao login
   - [ ] Abra `https://trader-bot.jonataslopes-011.workers.dev/conta` de novo: deve mandar para o login, porque a sessão acabou
5. Entre de novo pelo link da parte 4 para continuar.

## Parte 6 — Estados que você não consegue gerar sozinha

Estas telas dependem de ações internas. Peça ao Jonatas para colocar a sua compra em cada estado e confira como o cartão aparece:

| Estado do cartão | O que mostra |
|---|---|
| Licença ativa | Selo verde e validade. O link de download vai por e-mail (que você não recebe nesta fase), então peça o link ao Jonatas e teste abrindo-o |
| Licença expirada | Selo neutro "Licença expirada" |
| Licença revogada | Selo vermelho (acontece em reembolso ou contestação) |
| Pagamento pendente | Compra ainda sem confirmação |
| Pagamento recebido, em análise | Aviso de verificação manual |

## Checklist final de telas vistas

- [ ] Página inicial
- [ ] Catálogo (A, B e C)
- [ ] Termos de Uso
- [ ] Política de Privacidade
- [ ] Pagamento (Stripe, modo de teste)
- [ ] Confirmação do pagamento
- [ ] Login (normal, enviado e erro)
- [ ] Meus produtos (conta pendente e em preparo)
- [ ] Janelas de confirmação (conta da corretora e cancelamento)

## Para devolver ao Jonatas

Diga o que achou confuso, mesmo que funcione, e se algum texto soou estranho ou desconfortável.
