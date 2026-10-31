/* ==========================================================================
   Nossa Tela — lógica do app
   ==========================================================================

   ÍNDICE
   1. Configuração (valores e textos que você pode ajustar)
   2. Estado do app
   3. Utilitários
   4. Interface geral (telas, estado da conexão, avisos, limpeza)
   5. Quem transmite (cria a sessão e envia a tela)
   6. Quem assiste (digita o código e recebe a tela)
   7. Player de vídeo (volume, tela cheia, janela flutuante)
   8. Inicialização

   Como funciona a conexão:
   - Quem transmite cria uma sessão com um código curto (ex.: K7M2QX).
   - Quem assiste digita o código e se conecta.
   - O serviço público do PeerJS só apresenta os dois computadores um ao outro.
     A imagem e o som seguem direto de um computador para o outro.
   ========================================================================== */


/* ==========================================================================
   1. CONFIGURAÇÃO
   ========================================================================== */

/* Para usar um servidor próprio no lugar do serviço público do PeerJS, preencha, por exemplo:
   { host: "seu-servidor.com", port: 443, path: "/", secure: true } */
const PEER_OPTIONS = {};

/* Código da sessão: 6 caracteres, sem letras/números que se confundem (I, L, O, 0, 1) */
const CODE_LENGTH = 6;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_PREFIX = "nossatela-v1-"; /* evita colisão com outros apps no mesmo serviço */
const MAX_CODE_RETRIES = 5; /* tentativas se o código gerado já estiver em uso */

/* Tempos (em milissegundos) */
const ROOM_TIMEOUT_MS = 12000; /* tempo para criar a sessão */
const JOIN_TIMEOUT_MS = 12000; /* tempo para achar a sessão ao entrar */
const TOAST_MS = 2600; /* quanto tempo o aviso rápido fica na tela */
const CONTROLS_HIDE_MS = 2800; /* controles do player somem após este tempo parado */
const POWER_ON_MS = 2000; /* duração do efeito de "ligar a tela" */

/* Qualidade de envio (bits por segundo) */
const VIDEO_MAX_BITRATE = 8000000;
const AUDIO_MAX_BITRATE = 128000;

/* Erros do serviço de conexão que mostram o aviso de "conexão instável" */
const SERVICE_ERRORS = ["network", "server-error", "socket-error", "socket-closed"];

/* Textos mostrados ao usuário */
const MSG = {
  serviceUnavailable:
    "Não consegui carregar o serviço de conexão. Verifique a internet e atualize a página.",
  noScreenShare: "Seu navegador não compartilha tela. Use Chrome, Edge ou Firefox no computador.",
  roomFailed: "Não consegui criar a sessão. Verifique a internet e tente de novo.",
  sessionNotFound: "Sessão não encontrada. Confira o código e se a transmissão já começou.",
  connectFailed: "Não consegui conectar. Verifique a internet e tente de novo.",
  shareEnded: "Transmissão encerrada.",
  watchEnded: "A transmissão terminou.",
  noAudio:
    "O som não foi capturado. Escolha “Tela inteira” e marque “Compartilhar áudio do sistema”.",
  keepTabOpen: "Mantenha esta aba aberta durante o filme.",
  inviteIntro:
    "Vem assistir comigo! Abra o Nossa Tela, toque em “Entrar com um código” e digite ",
};


/* ==========================================================================
   2. ESTADO DO APP
   ========================================================================== */

const state = {
  peer: null /* conexão com o serviço (PeerJS) */,
  stream: null /* tela capturada (só quem transmite) */,
  hostConn: null /* canal de quem entrou na sessão (só quem transmite) */,
  calls: new Set() /* chamadas de vídeo abertas (só quem transmite) */,
  roomCode: "" /* código da sessão atual */,
  joinTimer: null /* limite de tempo ao entrar (só quem assiste) */,
  stageShown: false /* a sala de exibição já foi aberta? (só quem assiste) */,
  wakeLock: null /* impede a tela de apagar durante o filme */,
  wantAwake: false,
};


/* ==========================================================================
   3. UTILITÁRIOS
   ========================================================================== */

const $ = (id) => document.getElementById(id);

function setHidden(id, hidden) {
  $(id).classList.toggle("hidden", hidden);
}

/* Executa uma ação que pode falhar sem importar (ex.: fechar algo que já fechou) */
function ignoreErrors(action) {
  try {
    action();
  } catch {
    /* sem problema */
  }
}

/* Só letras e números, em maiúsculas */
function cleanCode(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomCode() {
  const numbers = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(numbers);
  return Array.from(numbers, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join("");
}

function isHosted() {
  return location.protocol.startsWith("http");
}

function shareLink() {
  return location.href.split("#")[0] + "#" + state.roomCode;
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* alternativa para navegadores que bloqueiam a área de transferência */
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    ignoreErrors(() => document.execCommand("copy"));
    box.remove();
  }
  toast(successMessage);
}

/* Mantém a tela do computador/celular acesa durante o filme */
async function keepAwake(on) {
  state.wantAwake = on;
  try {
    if (on) {
      if (!state.wakeLock) state.wakeLock = await navigator.wakeLock?.request("screen");
    } else {
      await state.wakeLock?.release();
      state.wakeLock = null;
    }
  } catch {
    /* nem todo navegador suporta */
  }
}


/* ==========================================================================
   4. INTERFACE GERAL
   ========================================================================== */

/* ---------- Troca de tela: "home" | "share" | "watch" ---------- */
function show(screenId) {
  ["home", "share", "watch"].forEach((id) => setHidden(id, id !== screenId));
  window.scrollTo(0, 0);
}

/* ---------- Estado da conexão no cabeçalho ----------
   status: "idle" (cinza) | "wait" (amarelo) | "ok" (verde) | "live" (vermelho) */
function setPill(status, text) {
  $("pill").dataset.state = status;
  $("pillText").textContent = text;
}

/* ---------- Aviso rápido ---------- */
let toastTimer;
function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), TOAST_MS);
}

/* ---------- Efeito de "ligar a tela", só na primeira abertura ---------- */
function playPowerOnEffect() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const hero = $("heroScreen");
  hero.classList.add("power-on");
  setTimeout(() => hero.classList.remove("power-on"), POWER_ON_MS);
}

/* ---------- Encerra tudo e volta ao estado inicial ---------- */
function closeAllCalls() {
  state.calls.forEach((call) => ignoreErrors(() => call.close()));
  state.calls.clear();
}

function resetHostScreen() {
  setHidden("shareSetup", false);
  setHidden("shareLive", true);
  $("startShare").disabled = false;
  $("startShare").textContent = "Escolher tela";
}

function resetViewerScreen() {
  $("remote").srcObject = null;
  setHidden("joinCard", false);
  setHidden("stage", true);
  setHidden("waiting", false);
  setHidden("tapPlay", true);
  $("joinBtn").textContent = "Entrar na sessão";
  $("joinErr").textContent = "";
  refreshJoinButton();
}

function cleanup() {
  clearTimeout(state.joinTimer);
  closeAllCalls();

  if (state.hostConn) {
    const conn = state.hostConn;
    state.hostConn = null;
    ignoreErrors(() => conn.close());
  }
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  if (state.peer) {
    const peer = state.peer;
    state.peer = null;
    ignoreErrors(() => peer.destroy());
  }

  keepAwake(false);
  state.stageShown = false;
  state.roomCode = "";

  resetHostScreen();
  resetViewerScreen();
  setPill("idle", "Pronto");
}

function goHome() {
  cleanup();
  show("home");
}


/* ==========================================================================
   5. QUEM TRANSMITE
   ========================================================================== */

/* ---------- Criar a sessão ---------- */

/* Cria uma sessão com um código novo. Se o código já estiver em uso, tenta outro. */
function openRoom(attempt = 0) {
  return new Promise((resolve, reject) => {
    const code = randomCode();
    const peer = new Peer(ROOM_PREFIX + code, PEER_OPTIONS);
    let opened = false;

    const timeout = setTimeout(() => {
      ignoreErrors(() => peer.destroy());
      reject(new Error("timeout"));
    }, ROOM_TIMEOUT_MS);

    peer.on("open", () => {
      opened = true;
      clearTimeout(timeout);
      state.peer = peer;
      state.roomCode = code;
      listenForViewers(peer);
      resolve(code);
    });

    peer.on("error", (error) => {
      if (opened) return; /* erros depois de aberta são tratados em listenForViewers */
      clearTimeout(timeout);
      ignoreErrors(() => peer.destroy());
      if (error.type === "unavailable-id" && attempt < MAX_CODE_RETRIES) {
        resolve(openRoom(attempt + 1));
      } else {
        reject(error);
      }
    });
  });
}

/* ---------- Escutar quem entra na sessão ---------- */

function listenForViewers(peer) {
  peer.on("connection", (conn) => {
    conn.on("open", () => {
      /* só uma pessoa assiste por vez: quem entrou antes é desconectado */
      if (state.hostConn && state.hostConn !== conn) {
        const previous = state.hostConn;
        ignoreErrors(() => previous.close());
      }
      state.hostConn = conn;
      sendScreenTo(conn);
    });

    conn.on("close", () => {
      if (conn !== state.hostConn) return;
      state.hostConn = null;
      closeAllCalls();
      showHostStatus("wait", "Ela saiu da sessão", "Ela pode voltar com o mesmo código.");
      setPill("wait", "Esperando ela entrar");
    });

    conn.on("error", () => {});
  });

  peer.on("disconnected", () => ignoreErrors(() => peer.reconnect()));

  peer.on("error", (error) => {
    if (SERVICE_ERRORS.includes(error.type)) {
      showHostStatus(
        "warn",
        "Conexão com o serviço instável",
        "Tentando reconectar. Se ela já entrou, o filme continua.",
      );
    }
  });
}

/* ---------- Enviar a tela para quem entrou ---------- */

function sendScreenTo(conn) {
  closeAllCalls();

  const call = state.peer.call(conn.peer, state.stream);
  state.calls.add(call);

  /* os parâmetros de qualidade só "pegam" depois que a conexão negocia: tenta de novo depois */
  tuneQuality(call);
  [2000, 6000].forEach((ms) => setTimeout(() => tuneQuality(call), ms));

  showHostStatus("wait", "Ela entrou", "Conectando as telas…");
  setPill("wait", "Conectando");

  const connection = call.peerConnection;
  if (connection) {
    connection.addEventListener("connectionstatechange", () => {
      onHostConnectionState(connection.connectionState);
    });
  }

  call.on("close", () => state.calls.delete(call));
  call.on("error", () => {});
}

function onHostConnectionState(connectionState) {
  if (connectionState === "connected") {
    showHostStatus("ok", "Ela está assistindo", "Conexão direta estabelecida.");
    setPill("live", "Ao vivo");
  } else if (connectionState === "disconnected") {
    showHostStatus("wait", "Conexão instável", "Tentando recuperar.");
  } else if (connectionState === "failed") {
    showHostStatus(
      "warn",
      "Não foi possível conectar",
      "Peça para ela atualizar a página e entrar de novo. Algumas redes bloqueiam a conexão direta.",
    );
    setPill("wait", "Esperando ela entrar");
  }
}

/* Define a qualidade máxima de envio: imagem nítida e áudio em boa taxa */
async function tuneQuality(call) {
  const connection = call.peerConnection;
  if (!connection) return;

  for (const sender of connection.getSenders()) {
    if (!sender.track) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];

      if (sender.track.kind === "video") {
        params.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
        params.degradationPreference = "maintain-resolution";
      } else {
        params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
      }
      await sender.setParameters(params);
    } catch {
      /* ainda não negociou: a próxima tentativa resolve */
    }
  }
}

/* ---------- Faixa de estado ("Esperando ela entrar") ----------
   kind: "wait" (amarelo) | "ok" (verde) | "warn" (vermelho) */
function showHostStatus(kind, title, subtitle) {
  $("viewerDot").className = "dot " + kind;
  $("vsTitle").textContent = title;
  $("vsSub").textContent = subtitle || "";
}

/* ---------- Iniciar a transmissão (botão "Escolher tela") ---------- */

/* Abre a janela do navegador para escolher a tela. Retorna null se a pessoa cancelar. */
async function captureScreen() {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: $("withAudio").checked
        ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : false,
      systemAudio: "include",
    });
  } catch {
    return null;
  }
}

async function startSharing() {
  if (typeof Peer === "undefined") {
    toast(MSG.serviceUnavailable);
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    toast(MSG.noScreenShare);
    return;
  }

  const stream = await captureScreen();
  if (!stream) return;

  state.stream = stream;
  stream.getTracks().forEach((track) => {
    track.contentHint = track.kind === "video" ? "motion" : "music";
  });

  /* se a pessoa parar o compartilhamento pelo botão do navegador */
  stream.getVideoTracks()[0].addEventListener("ended", () => {
    goHome();
    toast(MSG.shareEnded);
  });

  $("startShare").disabled = true;
  $("startShare").textContent = "Gerando código…";

  try {
    await openRoom();
  } catch {
    cleanup();
    toast(MSG.roomFailed);
    return;
  }

  showShareLive();
}

/* Mostra o ingresso com o código e fica esperando ela entrar */
function showShareLive() {
  $("roomCode").textContent = state.roomCode;
  setHidden("copyLink", !isHosted()); /* o link só faz sentido se o app estiver num site */
  setHidden("shareSetup", true);
  setHidden("shareLive", false);

  const audioMissing = $("withAudio").checked && !state.stream.getAudioTracks().length;
  showHostStatus(
    audioMissing ? "warn" : "wait",
    "Esperando ela entrar",
    audioMissing ? MSG.noAudio : MSG.keepTabOpen,
  );
  setPill("wait", "Esperando ela entrar");
  keepAwake(true);
}

/* ---------- Copiar convite, código e link ---------- */

function inviteText() {
  const text = MSG.inviteIntro + state.roomCode + ".";
  return isHosted() ? text + "\nOu abra direto: " + shareLink() : text;
}


/* ==========================================================================
   6. QUEM ASSISTE
   ========================================================================== */

/* ---------- Campo do código (6 caixinhas) ---------- */

const otpInputs = [...document.querySelectorAll("#otp input")];

function otpValue() {
  return otpInputs.map((input) => input.value).join("");
}

/* O botão "Entrar na sessão" só liga quando o código está completo */
function refreshJoinButton() {
  $("joinBtn").disabled = otpValue().length !== CODE_LENGTH;
}

/* Preenche as caixinhas a partir de um texto (ex.: código vindo do link) */
function fillOtp(text) {
  const code = cleanCode(text).slice(0, CODE_LENGTH);
  otpInputs.forEach((input, index) => {
    input.value = code[index] || "";
  });
  refreshJoinButton();
}

function setupOtpInput(input, index) {
  const last = CODE_LENGTH - 1;

  /* Digitar ou colar: espalha os caracteres pelas caixinhas seguintes */
  input.addEventListener("input", () => {
    const typed = cleanCode(input.value);
    if (!typed) {
      input.value = "";
      refreshJoinButton();
      return;
    }

    let count = 0;
    for (; count < typed.length && index + count < CODE_LENGTH; count++) {
      otpInputs[index + count].value = typed[count];
    }
    otpInputs[Math.min(index + count, last)].focus();
    $("joinErr").textContent = "";
    refreshJoinButton();
  });

  /* Teclas especiais: apagar, setas e Enter */
  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !input.value && index > 0) {
      otpInputs[index - 1].value = "";
      otpInputs[index - 1].focus();
      refreshJoinButton();
      event.preventDefault();
    } else if (event.key === "ArrowLeft" && index > 0) {
      otpInputs[index - 1].focus();
    } else if (event.key === "ArrowRight" && index < last) {
      otpInputs[index + 1].focus();
    } else if (event.key === "Enter") {
      tryJoin();
    }
  });

  input.addEventListener("focus", () => input.select());
}

/* ---------- Entrar na sessão ---------- */

function tryJoin() {
  const code = otpValue();
  if (code.length === CODE_LENGTH) joinRoom(code);
}

function joinRoom(code) {
  if (typeof Peer === "undefined") {
    showJoinError(MSG.serviceUnavailable);
    return;
  }

  $("joinErr").textContent = "";
  $("joinBtn").disabled = true;
  $("joinBtn").textContent = "Entrando…";
  setPill("wait", "Procurando a sessão");

  const peer = new Peer(PEER_OPTIONS);
  state.peer = peer;

  state.joinTimer = setTimeout(() => showJoinError(MSG.sessionNotFound), JOIN_TIMEOUT_MS);

  peer.on("open", () => {
    const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });

    conn.on("open", () => {
      clearTimeout(state.joinTimer);
      openStage();
    });
    conn.on("close", () => {
      if (state.peer === peer) leaveAfterEnd(MSG.watchEnded);
    });
    conn.on("error", () => {});
  });

  /* Quem transmite envia a tela: aceita a chamada (sem enviar nada de volta) */
  peer.on("call", (call) => {
    clearTimeout(state.joinTimer);
    openStage();
    call.answer();
    call.on("stream", showRemoteStream);
    call.on("close", () => {
      if (state.peer !== peer) return;
      setHidden("waiting", false);
      setPill("wait", "Conectado");
    });
  });

  peer.on("disconnected", () => ignoreErrors(() => peer.reconnect()));

  peer.on("error", (error) => {
    if (state.peer !== peer) return;
    if (error.type === "peer-unavailable") {
      showJoinError(MSG.sessionNotFound);
    } else if (!state.stageShown) {
      showJoinError(MSG.connectFailed);
    }
  });
}

/* Mostra uma mensagem de erro no campo do código e treme as caixinhas */
function showJoinError(message) {
  clearTimeout(state.joinTimer);
  if (state.peer) {
    const peer = state.peer;
    state.peer = null;
    ignoreErrors(() => peer.destroy());
  }

  $("joinBtn").textContent = "Entrar na sessão";
  refreshJoinButton();
  $("joinErr").textContent = message;
  setPill("idle", "Pronto");

  const otp = $("otp");
  otp.classList.remove("shake");
  void otp.offsetWidth; /* força o navegador a reiniciar a animação */
  otp.classList.add("shake");
}

/* ---------- Sala de exibição ---------- */

function openStage() {
  if (state.stageShown) return;
  state.stageShown = true;
  setHidden("joinCard", true);
  setHidden("stage", false);
  setPill("wait", "Conectado");
  keepAwake(true);
}

/* A transmissão terminou: volta para a tela de digitar o código */
function leaveAfterEnd(message) {
  cleanup();
  show("watch");
  otpInputs[0].focus();
  if (message) toast(message);
}

function showRemoteStream(stream) {
  const video = $("remote");
  if (video.srcObject !== stream) video.srcObject = stream;

  setHidden("waiting", true);
  setPill("ok", "Assistindo");

  /* se o navegador bloquear o início automático, mostra o botão "Assistir agora" */
  video
    .play()
    .then(() => setHidden("tapPlay", true))
    .catch(() => setHidden("tapPlay", false));
}


/* ==========================================================================
   7. PLAYER DE VÍDEO
   ========================================================================== */

const video = $("remote");
const screenBox = $("screen");

/* Mostra o ícone certo: com som ou mudo */
function updateMuteIcon() {
  const silent = video.muted || video.volume === 0;
  setHidden("icVol", silent);
  setHidden("icMute", !silent);
}

function toggleMute() {
  video.muted = !video.muted;
  if (!video.muted && video.volume === 0) {
    video.volume = 0.6;
    $("vol").value = 0.6;
  }
  updateMuteIcon();
}

function changeVolume(event) {
  video.volume = Number(event.target.value);
  video.muted = video.volume === 0;
  updateMuteIcon();
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  const request = screenBox.requestFullscreen || screenBox.webkitRequestFullscreen;
  if (request) {
    request.call(screenBox);
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen(); /* iPhone */
  }
}

function togglePictureInPicture() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else {
    video.requestPictureInPicture().catch(() => {});
  }
}

/* Os controles somem depois de alguns segundos sem mexer e voltam ao mexer */
let controlsTimer;
function showControlsTemporarily() {
  screenBox.classList.remove("idle");
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(() => {
    if (!video.paused) screenBox.classList.add("idle");
  }, CONTROLS_HIDE_MS);
}


/* ==========================================================================
   8. INICIALIZAÇÃO
   ========================================================================== */

function bindNavigation() {
  $("brand").addEventListener("click", goHome);
  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", goHome);
  });

  $("pickShare").addEventListener("click", () => show("share"));
  $("pickWatch").addEventListener("click", () => {
    show("watch");
    otpInputs[0].focus();
  });

  /* ao fechar a aba, avisa o serviço para liberar o código */
  window.addEventListener("pagehide", () => {
    if (state.peer) ignoreErrors(() => state.peer.destroy());
  });

  /* ao voltar para a aba, pede de novo para manter a tela acesa */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.wantAwake) {
      state.wakeLock = null;
      keepAwake(true);
    }
  });
}

function bindHostScreen() {
  $("startShare").addEventListener("click", startSharing);
  $("copyInvite").addEventListener("click", () => copyText(inviteText(), "Convite copiado"));
  $("copyCode").addEventListener("click", () => copyText(state.roomCode, "Código copiado"));
  $("copyLink").addEventListener("click", () => copyText(shareLink(), "Link copiado"));
  $("stopShare").addEventListener("click", () => {
    goHome();
    toast(MSG.shareEnded);
  });
}

function bindViewerScreen() {
  otpInputs.forEach(setupOtpInput);
  $("joinBtn").addEventListener("click", tryJoin);
  $("leaveBtn").addEventListener("click", goHome);
  $("playBtn").addEventListener("click", () => {
    video
      .play()
      .then(() => setHidden("tapPlay", true))
      .catch(() => {});
  });
}

function bindPlayer() {
  $("muteBtn").addEventListener("click", toggleMute);
  $("vol").addEventListener("input", changeVolume);
  $("fsBtn").addEventListener("click", toggleFullscreen);

  /* janela flutuante: só aparece se o navegador suportar */
  if (document.pictureInPictureEnabled) {
    setHidden("pipBtn", false);
    $("pipBtn").addEventListener("click", togglePictureInPicture);
  }

  ["pointermove", "pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    screenBox.addEventListener(eventName, showControlsTemporarily, { passive: true });
  });
  screenBox.addEventListener("focusin", showControlsTemporarily);
}

/* Se o endereço tiver um código (ex.: ...index.html#K7M2QX), abre já na tela de entrar */
function openFromLink() {
  const code = cleanCode(location.hash.slice(1));
  if (code.length !== CODE_LENGTH) return;
  show("watch");
  fillOtp(code);
  $("joinBtn").focus();
}

function init() {
  bindNavigation();
  bindHostScreen();
  bindViewerScreen();
  bindPlayer();
  playPowerOnEffect();
  openFromLink();
}

init();