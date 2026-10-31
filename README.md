# 🎬 Nossa Tela

### Dois sofás, uma só sessão. ❤️

O **Nossa Tela** é uma aplicação web desenvolvida para permitir que duas pessoas compartilhem uma experiência de cinema à distância.

A plataforma utiliza compartilhamento de tela e comunicação em tempo real para transmitir o conteúdo exibido no computador de uma pessoa diretamente para o navegador da outra.

Sem cadastro ou instalação de programas adicionais: basta iniciar uma sessão, compartilhar o código de acesso e conectar-se.

## ✨ Funcionalidades

- **Criação de sessões:** geração automática de códigos exclusivos de 6 caracteres.
- **Compartilhamento de tela:** captura da tela, janela ou conteúdo selecionado pelo usuário.
- **Transmissão de áudio:** opção de compartilhar o áudio do sistema junto com a imagem.
- **Conexão em tempo real:** comunicação entre os participantes utilizando WebRTC.
- **Convites compartilháveis:** possibilidade de copiar o convite, o código ou o link direto da sessão.
- **Player integrado:** controles de volume, áudio, tela cheia e Picture-in-Picture.
- **Gerenciamento de conexão:** identificação dos estados da sessão, tratamento de erros e tentativas de reconexão.
- **Interface responsiva:** adaptação para diferentes tamanhos de tela.

## 🛠️ Tecnologias utilizadas

| Tecnologia | Aplicação no projeto |
|---|---|
| HTML5 | Estrutura da aplicação |
| CSS3 | Estilização, responsividade e animações |
| JavaScript (ES6+) | Lógica, eventos e gerenciamento das sessões |
| PeerJS | Gerenciamento da conexão entre participantes |
| WebRTC | Transmissão de áudio e vídeo em tempo real |
| Web APIs | Captura de tela, áudio, tela cheia e Picture-in-Picture |

**Bibliotecas e recursos externos:**
- PeerJS 1.5.4, carregado via CDN.
- Google Fonts: Gloock e Hanken Grotesk.

## ⚙️ Como funciona

O funcionamento da plataforma é dividido em duas etapas:

**1. Transmitir minha tela**
- O primeiro participante escolhe a tela que deseja compartilhar.
- O navegador solicita permissão para capturar a tela e, opcionalmente, o áudio.
- A aplicação cria uma sessão e gera um código de acesso de 6 caracteres.
- O participante compartilha o convite com a outra pessoa.

**2. Entrar com um código**
- O segundo participante informa o código recebido.
- O PeerJS estabelece a conexão entre os navegadores.
- Após a conexão, o fluxo de áudio e vídeo é recebido e exibido no player da aplicação.

O PeerJS é responsável pela sinalização inicial da conexão. A transmissão de mídia é realizada por meio do WebRTC, com comunicação entre os participantes.

## 📂 Estrutura do projeto

```text
Nossa-Tela/
│
├── index.html
├── style.css
├── index.js
│
├── logo.svg
├── favicon.svg
├── favicon.ico
└── apple-touch-icon.png
```

Os arquivos de imagem listados são referências utilizadas pelo HTML e devem estar presentes na pasta do projeto.

## 🚀 Como executar localmente

**Pré-requisitos:**
- Navegador atualizado com suporte à captura de tela.
- Conexão com a internet.
- Permissão para compartilhar tela e áudio.

**1. Clone o repositório**

```bash
git clone https://github.com/highestnote9005/Nossa-tela.git
```

**2. Entre na pasta**

```bash
cd Nossa-Tela
```

**3. Inicie um servidor local**

Uma opção é utilizar o Python:

```bash
python -m http.server 8000
```

**4. Acesse pelo navegador**

```text
http://localhost:8000
```

Também é possível utilizar a extensão Live Server do Visual Studio Code.

> O compartilhamento de tela exige um contexto seguro do navegador, como HTTPS ou localhost. A captura de áudio do sistema pode variar conforme o navegador e a opção de compartilhamento selecionada.

## ⚠️ Limitações conhecidas

- A aplicação permite um participante assistindo por sessão. Uma nova conexão substitui a anterior.
- A transmissão depende da disponibilidade de conexão entre os navegadores e dos recursos de rede.
- O compartilhamento de áudio depende do suporte do navegador e das permissões concedidas.
- O computador que transmite precisa manter a sessão e o compartilhamento ativos.
- A aplicação compartilha a tela do computador, não realiza o envio ou hospedagem de arquivos de vídeo.

## 🌐 Projeto online

**[Acessar Nossa Tela](https://nossatela.netlify.app/)**

## 👨‍💻 Desenvolvedor

**Gregory Alencar**

Projeto desenvolvido como aplicação web independente, utilizando tecnologias de desenvolvimento front-end e comunicação em tempo real.

---

*Algumas histórias ficam melhores quando assistidas juntos. ❤️*
