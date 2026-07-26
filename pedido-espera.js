/* Acompanhamento do pedido + minigames + avaliação */
(function () {
  const STORAGE_KEY = 'menu_pedido_ativo';
  const POLL_MS = 4000; // fallback se Realtime falhar
  const NOTIFY_KEY = 'menu_pedido_last_notify';
  const LOJA_AF_KEY = 'menu_loja_last_af';
  const LOJA_NOTIFY_TS_KEY = 'menu_loja_open_notify_ts';

  const STATUS_META = {
    recebido:   { label: 'Pedido recebido', step: 0, notify: 'Recebemos seu pedido!' },
    preparando: { label: 'Preparando', step: 1, notify: 'Seu pedido está sendo preparado 🔥' },
    em_rota:    { label: 'Saiu para entrega', step: 2, notify: 'Saiu para entrega! Já estamos a caminho 🛵' },
    pronto:     { label: 'Pronto para retirada', step: 2, notify: 'Pedido pronto para retirada 🏪' },
    entregue:   { label: 'Entregue', step: 3, notify: 'Pedido entregue! Bom apetite 😋' },
    cancelado:  { label: 'Cancelado', step: -1, notify: 'Seu pedido foi cancelado' },
  };

  let _pedido = null;
  let _pollTimer = null;
  let _estrelas = 0;
  let _gameCleanup = null;
  let _snakeRAF = null;
  let _lastKnownStatus = null;
  let _tickBusy = false;
  let _supabaseClient = null;
  let _realtimeChannel = null;
  let _lojaChannel = null;
  let _lastLojaAf = null;
  let _lojaWatchStarted = false;

  function api() {
    return window.__MENU_SUPA || {};
  }

  function toast(msg) {
    if (typeof api().toast === 'function') api().toast(msg);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (!p || !p.id) return null;
      return p;
    } catch (e) {
      return null;
    }
  }

  function saveLocal(p) {
    _pedido = p;
    try {
      if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    atualizarChip();
  }

  function clearLocal() {
    saveLocal(null);
    stopMonitoramento();
    try { localStorage.removeItem(NOTIFY_KEY); } catch (e) { /* ignore */ }
  }

  function fmtMoney(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }

  function isPedidoLocal(id) {
    return id == null || String(id).startsWith('local-');
  }

  async function fetchPedido(id) {
    if (isPedidoLocal(id)) return null;
    const { url, headers } = api();
    if (!url || !headers) return null;
    const r = await fetch(
      `${url}/rest/v1/PEDIDOS?id=eq.${encodeURIComponent(id)}&select=id,status,total,tipo_entrega,cliente_nome,created_at&limit=1`,
      { headers }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  }

  async function patchStatus(id, status) {
    if (isPedidoLocal(id)) return { id, status };
    const { url, headers } = api();
    const r = await fetch(`${url}/rest/v1/PEDIDOS?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    return rows[0] || null;
  }

  async function postAvaliacao(payload) {
    if (isPedidoLocal(payload.pedido_id)) {
      // Sem id real no banco — só guarda localmente
      return;
    }
    const { url, headers } = api();
    const body = { ...payload };
    if (body.pedido_id != null) body.pedido_id = Number(body.pedido_id);
    const r = await fetch(`${url}/rest/v1/AVALIACOES`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw new Error(detail.slice(0, 160) || ('HTTP ' + r.status));
    }
  }

  function atualizarChip() {
    const chip = document.getElementById('pedidoAtivoChip');
    if (!chip) return;
    const st = _pedido && _pedido.status;
    // Cancelado ou já avaliado: sem chip / sem opção de avaliar
    if (_pedido && _pedido.id && !_pedido.avaliado && st && st !== 'cancelado') {
      chip.classList.add('visible');
      const meta = STATUS_META[st] || STATUS_META.recebido;
      chip.querySelector('.pedido-chip-txt').textContent =
        st === 'entregue' ? 'Avaliar pedido' : ('Pedido: ' + meta.label);
    } else {
      chip.classList.remove('visible');
    }
  }

  function renderStatusUI(opts) {
    if (!_pedido) return;
    const st = _pedido.status || 'recebido';
    const meta = STATUS_META[st] || STATUS_META.recebido;
    const title = document.getElementById('pedidoStatusTitulo');
    const sub = document.getElementById('pedidoStatusSub');
    const steps = document.getElementById('pedidoSteps');
    const acoes = document.getElementById('pedidoAcoesBox');
    const aval = document.getElementById('pedidoAvaliarBox');
    const live = document.getElementById('pedidoStatusLive');

    if (title) {
      title.textContent = meta.label;
      if (opts && opts.flash) {
        title.classList.remove('status-flash');
        // reflow para reiniciar animação
        void title.offsetWidth;
        title.classList.add('status-flash');
      }
    }
    if (sub) {
      const tipo = _pedido.tipo_entrega === 'retirada' ? 'Retirada' : 'Entrega';
      sub.textContent = `#${_pedido.id} · ${tipo} · ${fmtMoney(_pedido.total)}`;
    }
    if (live) {
      live.hidden = false;
      live.textContent = '● Ao vivo';
    }

    if (steps) {
      const labels = _pedido.tipo_entrega === 'retirada'
        ? ['Recebido', 'Preparando', 'Pronto', 'Entregue']
        : ['Recebido', 'Preparando', 'A caminho', 'Entregue'];
      const step = meta.step;
      steps.innerHTML = labels.map((lab, i) => {
        let cls = 'pedido-step';
        if (st === 'cancelado') cls += ' cancel';
        else if (step >= i) cls += ' done';
        if (step === i && st !== 'entregue' && st !== 'cancelado') cls += ' current';
        return `<div class="${cls}"><span class="pedido-step-dot"></span><span>${lab}</span></div>`;
      }).join('');
    }

    const finalizado = st === 'entregue' || st === 'cancelado';
    if (acoes) {
      acoes.style.display = finalizado ? 'none' : 'block';
    }
    if (aval) {
      aval.style.display = (st === 'entregue' && !_pedido.avaliado) ? 'block' : 'none';
    }
  }

  function stopPoll() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function stopRealtime() {
    try {
      if (_realtimeChannel && _supabaseClient) {
        _supabaseClient.removeChannel(_realtimeChannel);
      }
    } catch (e) { /* ignore */ }
    _realtimeChannel = null;
  }

  function getSupabaseClient() {
    const { url, headers } = api();
    const key = headers && (headers.apikey || (headers.Authorization || '').replace(/^Bearer\s+/i, ''));
    if (!url || !key || !window.supabase || typeof window.supabase.createClient !== 'function') {
      return null;
    }
    if (!_supabaseClient) {
      _supabaseClient = window.supabase.createClient(url, key, {
        realtime: { params: { eventsPerSecond: 5 } },
      });
    }
    return _supabaseClient;
  }

  function startRealtime() {
    stopRealtime();
    if (!_pedido || !_pedido.id || isPedidoLocal(_pedido.id)) return;
    const client = getSupabaseClient();
    if (!client) return;

    const pedidoId = Number(_pedido.id);
    if (!Number.isFinite(pedidoId)) return;

    _realtimeChannel = client
      .channel('pedido-status-' + pedidoId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'PEDIDOS',
          filter: 'id=eq.' + pedidoId,
        },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          aplicarStatusRemoto(row);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const live = document.getElementById('pedidoStatusLive');
          if (live) {
            live.hidden = false;
            live.textContent = '● Ao vivo';
          }
        }
      });
  }

  function aplicarStatusRemoto(row) {
    if (!_pedido || !row) return;
    const antigo = _pedido.status || _lastKnownStatus;
    _pedido = {
      ..._pedido,
      status: row.status || _pedido.status,
      total: row.total != null ? row.total : _pedido.total,
      tipo_entrega: row.tipo_entrega || _pedido.tipo_entrega,
      cliente_nome: row.cliente_nome || _pedido.cliente_nome,
    };
    saveLocal(_pedido);
    renderStatusUI({ flash: antigo !== _pedido.status });
    if (row.status && row.status !== antigo) {
      onStatusChange(row.status, antigo);
    }
  }

  function stopMonitoramento() {
    stopPoll();
    stopRealtime();
    postToSw({ type: 'STOP_WATCH' });
  }

  function startMonitoramento() {
    if (!_pedido || !_pedido.id || isPedidoLocal(_pedido.id)) return;
    startPoll();
    startRealtime();
  }

  async function pedirPermissaoNotificacao() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch (e) {
      return false;
    }
  }

  function getLastNotifiedStatus() {
    try { return localStorage.getItem(NOTIFY_KEY); } catch (e) { return null; }
  }

  function setLastNotifiedStatus(status) {
    try { localStorage.setItem(NOTIFY_KEY, String(status || '')); } catch (e) { /* ignore */ }
  }

  async function postToSw(msg) {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) reg.active.postMessage(msg);
      else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage(msg);
      }
    } catch (e) { /* ignore */ }
  }

  function syncWatchComServiceWorker() {
    const { url, headers } = api();
    if (!_pedido || !_pedido.id || isPedidoLocal(_pedido.id) || !url || !headers) {
      postToSw({ type: 'STOP_WATCH' });
      return;
    }
    const key = headers.apikey || headers.Authorization?.replace(/^Bearer\s+/i, '');
    postToSw({
      type: 'WATCH_PEDIDO',
      id: _pedido.id,
      url,
      key,
      lastStatus: _pedido.status || _lastKnownStatus || null,
    });
  }

  function afLojaAberto(af) {
    return af === 'A' || af === 'R';
  }

  function getStoredLojaAf() {
    try { return localStorage.getItem(LOJA_AF_KEY); } catch (e) { return null; }
  }

  function setStoredLojaAf(af) {
    _lastLojaAf = af || null;
    try {
      if (af == null || af === '') localStorage.removeItem(LOJA_AF_KEY);
      else localStorage.setItem(LOJA_AF_KEY, String(af));
    } catch (e) { /* ignore */ }
  }

  function syncWatchLojaComSw() {
    const { url, headers } = api();
    if (!url || !headers) {
      postToSw({ type: 'STOP_WATCH_LOJA' });
      return;
    }
    const key = headers.apikey || headers.Authorization?.replace(/^Bearer\s+/i, '');
    postToSw({
      type: 'WATCH_LOJA',
      url,
      key,
      lastAf: _lastLojaAf != null ? _lastLojaAf : getStoredLojaAf(),
    });
  }

  async function notificarLojaAberta(modo) {
    // Evita spam: no máximo 1 aviso a cada 90 min
    try {
      const last = parseInt(localStorage.getItem(LOJA_NOTIFY_TS_KEY) || '0', 10);
      if (Number.isFinite(last) && Date.now() - last < 90 * 60 * 1000) return;
      localStorage.setItem(LOJA_NOTIFY_TS_KEY, String(Date.now()));
    } catch (e) { /* ignore */ }

    const body = modo === 'R'
      ? 'Estamos abertos — somente retirada no local!'
      : 'Acabamos de abrir! Já pode pedir 🍔';

    let enviada = false;
    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('Menu Lanches abriu!', {
            body,
            icon: 'Logo.png',
            badge: 'Logo.png',
            tag: 'loja-aberta',
            renotify: true,
            vibrate: [160, 80, 160],
            data: { tipo: 'loja_aberta', modo },
          });
          enviada = true;
        }
      } catch (e) { /* ignore */ }
    }
    if (!enviada && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Menu Lanches abriu!', { body, icon: 'Logo.png', tag: 'loja-aberta' });
      } catch (e) { /* ignore */ }
    }
    toast(body);
  }

  function onHorarioAf(novoAf) {
    if (novoAf == null || novoAf === '') return;
    const antigo = _lastLojaAf != null ? _lastLojaAf : getStoredLojaAf();
    if (antigo === 'F' && afLojaAberto(novoAf)) {
      notificarLojaAberta(novoAf);
    }
    setStoredLojaAf(novoAf);
    syncWatchLojaComSw();
  }

  function stopLojaRealtime() {
    try {
      if (_lojaChannel && _supabaseClient) {
        _supabaseClient.removeChannel(_lojaChannel);
      }
    } catch (e) { /* ignore */ }
    _lojaChannel = null;
  }

  function startLojaRealtime() {
    stopLojaRealtime();
    const client = getSupabaseClient();
    if (!client) return;

    _lojaChannel = client
      .channel('loja-horario')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'HORARIO' },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          const af = row['A/F'] || row.af || null;
          if (af != null) onHorarioAf(af);
          if (typeof window.__onHorarioRealtime === 'function') {
            try { window.__onHorarioRealtime(row); } catch (e) { /* ignore */ }
          }
        }
      )
      .subscribe();
  }

  async function iniciarWatchLoja(afInicial) {
    const af = afInicial != null ? afInicial : getStoredLojaAf();
    if (af != null && af !== '') {
      const antigo = getStoredLojaAf();
      // Reabriu o site e a loja mudou de fechada → aberta enquanto estava fora
      if (antigo === 'F' && afLojaAberto(af)) {
        await notificarLojaAberta(af);
      }
      setStoredLojaAf(af);
    }
    syncWatchLojaComSw();
    if (!_lojaWatchStarted) {
      _lojaWatchStarted = true;
      startLojaRealtime();
    }
  }

  function statusNotificacoes() {
    if (!('Notification' in window)) {
      return { ok: false, label: 'Não suportado neste navegador', permission: 'unsupported' };
    }
    const p = Notification.permission;
    if (p === 'granted') return { ok: true, label: 'Ativas', permission: p };
    if (p === 'denied') return { ok: false, label: 'Bloqueadas no navegador', permission: p };
    return { ok: false, label: 'Ainda não ativadas', permission: p };
  }

  async function ativarNotificacoes() {
    const ok = await pedirPermissaoNotificacao();
    if (ok) {
      syncWatchLojaComSw();
      syncWatchComServiceWorker();
      toast('Notificações ativadas! Avisaremos quando abrirmos.');
    } else if (!('Notification' in window)) {
      toast('Este navegador não suporta notificações.');
    } else if (Notification.permission === 'denied') {
      toast('Notificações bloqueadas. Ative nas configurações do navegador.');
    }
    return ok;
  }

  async function notificarStatusPedido(status, { force } = {}) {
    if (!status) return;
    if (!force && getLastNotifiedStatus() === status) return;
    setLastNotifiedStatus(status);
    const meta = STATUS_META[status] || { notify: 'Status do pedido: ' + status, label: status };
    const body = meta.notify || meta.label;
    let enviada = false;

    if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('Menu Lanches', {
            body,
            icon: 'Logo.png',
            badge: 'Logo.png',
            tag: 'pedido-' + (_pedido?.id || 'ativo') + '-' + status,
            renotify: true,
            vibrate: [120, 60, 120],
            data: { status, pedidoId: _pedido?.id },
          });
          enviada = true;
        }
      } catch (e) { /* fallback */ }
    }

    if (!enviada && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Menu Lanches', {
          body,
          icon: 'Logo.png',
          tag: 'pedido-' + (_pedido?.id || 'ativo') + '-' + status,
        });
        enviada = true;
      } catch (e) { /* ignore */ }
    }

    // Atualiza o SW para não repetir a mesma notificação
    syncWatchComServiceWorker();
    toast(body);
  }

  async function onStatusChange(novoStatus, antigoStatus) {
    if (!novoStatus || novoStatus === antigoStatus) return;
    _lastKnownStatus = novoStatus;
    await notificarStatusPedido(novoStatus);
    renderStatusUI();
    atualizarChip();
    const aval = document.getElementById('pedidoAvaliarBox');
    if (novoStatus === 'entregue' && _pedido && !_pedido.avaliado) {
      if (aval) aval.style.display = 'block';
    } else if (aval) {
      aval.style.display = 'none';
    }
    if (novoStatus === 'cancelado') {
      // Cancelado: sem avaliação e remove acompanhamento
      clearLocal();
      setTimeout(() => fecharPainel(), 1600);
    }
  }

  async function tickPedidoStatus() {
    if (_tickBusy) return;
    if (!_pedido || !_pedido.id || isPedidoLocal(_pedido.id)) return;
    _tickBusy = true;
    try {
      const row = await fetchPedido(_pedido.id);
      if (!row) return;
      const antigo = _pedido.status || _lastKnownStatus;
      _pedido = { ..._pedido, ...row };
      saveLocal(_pedido);
      renderStatusUI({ flash: !!(row.status && row.status !== antigo) });
      if (row.status && row.status !== antigo) {
        await onStatusChange(row.status, antigo);
      }
      if (row.status === 'entregue' || row.status === 'cancelado') {
        syncWatchComServiceWorker();
      }
    } catch (e) { /* ignore */ }
    finally {
      _tickBusy = false;
    }
  }

  function startPoll() {
    stopPoll();
    if (!_pedido || !_pedido.id || isPedidoLocal(_pedido.id)) return;
    _lastKnownStatus = _pedido.status || _lastKnownStatus;
    syncWatchComServiceWorker();
    _pollTimer = setInterval(tickPedidoStatus, POLL_MS);
    tickPedidoStatus();
  }

  let _gameAtual = null;
  let _gameBootId = 0;
  // idle → pick → ready → playing
  let _gameStep = 'idle';

  const GAME_LABELS = {
    snake: 'Snake',
    velha: 'Jogo da velha',
    domino: 'Dominó',
    memoria: 'Memória',
  };
  const GAME_TIPS = {
    snake: 'Coma as comidinhas sem bater nas paredes.',
    velha: 'Jogue contra a IA. Você é o X.',
    domino: 'Dominó clássico contra o adversário.',
    memoria: 'Vire as cartas e ache os pares.',
  };

  function stopGame() {
    _gameBootId += 1;
    const cleanup = _gameCleanup;
    _gameCleanup = null;
    if (_snakeRAF) {
      cancelAnimationFrame(_snakeRAF);
      _snakeRAF = null;
    }
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (e) { /* ignore */ }
    }
  }

  function setTabsVisible(on) {
    const tabs = document.getElementById('miniGameTabs');
    if (!tabs) return;
    tabs.hidden = !on;
    tabs.classList.toggle('visible', !!on);
  }

  function setHint(text) {
    const hint = document.getElementById('pedidoJogosHint');
    if (hint) hint.textContent = text;
  }

  function resetGamesLobby() {
    stopGame();
    _gameStep = 'idle';
    _gameAtual = null;
    setTabsVisible(false);
    document.querySelectorAll('.mini-game-tab').forEach(t => t.classList.remove('active'));
    setHint('Toque em Play para escolher um jogo e passar o tempo.');
    const host = document.getElementById('miniGameHost');
    if (!host) return;
    host.innerHTML = `
      <div class="mini-lobby">
        <div class="mini-lobby-title">Sala de jogos</div>
        <p class="mini-lobby-tip">Os jogos só aparecem depois do Play.</p>
        <button type="button" class="mini-play-btn" id="miniPlayBtn">▶ Play</button>
      </div>`;
    host.querySelector('#miniPlayBtn')?.addEventListener('click', mostrarEscolhaJogos);
  }

  function mostrarEscolhaJogos() {
    stopGame();
    _gameStep = 'pick';
    _gameAtual = null;
    setTabsVisible(true);
    document.querySelectorAll('.mini-game-tab').forEach(t => t.classList.remove('active'));
    setHint('Escolha qual jogo quer jogar.');
    const host = document.getElementById('miniGameHost');
    if (!host) return;
    host.innerHTML = `
      <div class="mini-lobby">
        <div class="mini-lobby-title">Escolha seu jogo</div>
        <p class="mini-lobby-tip">Snake, Jogo da velha, Dominó ou Memória.</p>
      </div>`;
  }

  function selecionarJogo(name) {
    if (!GAME_LABELS[name]) return;
    stopGame();
    _gameStep = 'ready';
    _gameAtual = name;
    document.querySelectorAll('.mini-game-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.game === name);
    });
    setHint('Toque em Iniciar para começar.');
    const host = document.getElementById('miniGameHost');
    if (!host) return;
    host.innerHTML = `
      <div class="mini-lobby">
        <div class="mini-lobby-title">${GAME_LABELS[name]}</div>
        <p class="mini-lobby-tip">${GAME_TIPS[name] || ''}</p>
        <button type="button" class="mini-start-btn" id="miniStartBtn">Iniciar</button>
        <button type="button" class="mini-back-games" id="miniBackGames">Trocar jogo</button>
      </div>`;
    host.querySelector('#miniStartBtn')?.addEventListener('click', () => iniciarJogoSelecionado());
    host.querySelector('#miniBackGames')?.addEventListener('click', mostrarEscolhaJogos);
  }

  function iniciarJogoSelecionado(host) {
    const el = host || document.getElementById('miniGameHost');
    if (!el || !_gameAtual) return;
    stopGame();
    _gameStep = 'playing';
    setHint('Bom jogo! Pode voltar e trocar quando quiser.');
    const bootId = _gameBootId;
    el.innerHTML = '<div class="mini-score">Carregando jogo...</div>';
    requestAnimationFrame(() => {
      if (bootId !== _gameBootId) return;
      try {
        if (_gameAtual === 'snake') startSnake(el);
        else if (_gameAtual === 'velha') startVelha(el);
        else if (_gameAtual === 'domino') startDomino(el);
        else if (_gameAtual === 'memoria') startMemoria(el);
        // atalho para voltar ao menu de jogos
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'mini-back-games';
        back.textContent = '⟵ Menu de jogos';
        back.onclick = resetGamesLobby;
        el.appendChild(back);
        // No celular: sobe o jogo pra área visível (evita corte)
        setTimeout(() => {
          const jogos = document.getElementById('pedidoJogosSection');
          const body = document.querySelector('.pedido-espera-body');
          if (jogos) jogos.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (body && el) {
            const top = el.offsetTop - 12;
            body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
          }
        }, 80);
      } catch (err) {
        console.error('Erro ao iniciar minigame:', err);
        el.innerHTML = '<div class="mini-score">Não foi possível abrir o jogo.<br><button type="button" class="mini-btn" id="miniRetryBtn">Tentar de novo</button></div>';
        el.querySelector('#miniRetryBtn')?.addEventListener('click', () => iniciarJogoSelecionado(el));
      }
    });
  }

  /* ───── SNAKE ───── */
  function startSnake(host) {
    const mobile = window.matchMedia('(max-width: 480px)').matches;
    const size = mobile ? 240 : 280;
    const cols = 14;
    const rows = 14;
    const cell = size / cols;
    host.innerHTML = `
      <div class="snake-wrap">
        <div class="mini-score" data-role="score">Pontos: 0</div>
        <canvas class="snake-canvas" width="${size}" height="${size}" aria-label="Snake"></canvas>
        <div class="snake-pad">
          <button type="button" data-dir="up">▲</button>
          <div class="snake-pad-mid">
            <button type="button" data-dir="left">◀</button>
            <button type="button" data-dir="down">▼</button>
            <button type="button" data-dir="right">▶</button>
          </div>
        </div>
        <button type="button" class="mini-btn" data-role="restart">Reiniciar</button>
      </div>`;
    const canvas = host.querySelector('.snake-canvas');
    const scoreEl = host.querySelector('[data-role="score"]');
    if (!canvas) throw new Error('Canvas do Snake não encontrado');
    const ctx = canvas.getContext('2d');
    let snake = [{ x: 7, y: 7 }];
    let dir = { x: 1, y: 0 };
    let nextDir = { x: 1, y: 0 };
    let food = { x: 3, y: 3 };
    let score = 0;
    let alive = true;
    let acc = 0;
    let last = performance.now();
    let running = true;

    function spawnFood() {
      let p;
      let guard = 0;
      do {
        p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
        guard++;
      } while (guard < 80 && snake.some(s => s.x === p.x && s.y === p.y));
      return p;
    }

    function reset() {
      snake = [{ x: 7, y: 7 }];
      dir = { x: 1, y: 0 };
      nextDir = { x: 1, y: 0 };
      food = spawnFood();
      score = 0;
      alive = true;
      acc = 0;
      last = performance.now();
      if (scoreEl) scoreEl.textContent = 'Pontos: 0';
    }

    function setDir(nx, ny) {
      if (dir.x + nx === 0 && dir.y + ny === 0) return;
      nextDir = { x: nx, y: ny };
    }

    host.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const d = btn.dataset.dir;
        if (d === 'up') setDir(0, -1);
        if (d === 'down') setDir(0, 1);
        if (d === 'left') setDir(-1, 0);
        if (d === 'right') setDir(1, 0);
      });
    });

    function onKey(e) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setDir(0, -1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setDir(0, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setDir(-1, 0); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setDir(1, 0); }
    }
    window.addEventListener('keydown', onKey);
    host.querySelector('[data-role="restart"]').onclick = reset;

    function tick() {
      if (!alive) return;
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some(s => s.x === head.x && s.y === head.y)) {
        alive = false;
        if (scoreEl) scoreEl.textContent = 'Game over · ' + score + ' pts';
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score++;
        food = spawnFood();
        if (scoreEl) scoreEl.textContent = 'Pontos: ' + score;
      } else snake.pop();
    }

    function draw() {
      ctx.fillStyle = '#1a120e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4);
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#2ecc71' : '#27ae60';
        ctx.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2);
      });
    }

    function loop(t) {
      if (!running) return;
      _snakeRAF = requestAnimationFrame(loop);
      const dt = t - last;
      last = t;
      acc += dt;
      while (acc > 140) {
        tick();
        acc -= 140;
      }
      draw();
    }

    reset();
    draw();
    _snakeRAF = requestAnimationFrame(loop);
    _gameCleanup = () => {
      running = false;
      window.removeEventListener('keydown', onKey);
      if (_snakeRAF) cancelAnimationFrame(_snakeRAF);
      _snakeRAF = null;
    };
  }

  /* ───── JOGO DA VELHA ───── */
  function startVelha(host) {
    host.innerHTML = `
      <div class="velha-wrap">
        <div class="mini-score" data-role="msg">Você é X · clique para jogar</div>
        <div class="velha-grid" data-role="grid"></div>
        <button type="button" class="mini-btn" data-role="restart">Nova partida</button>
      </div>`;
    const grid = host.querySelector('[data-role="grid"]');
    const msgEl = host.querySelector('[data-role="msg"]');
    let board = Array(9).fill('');
    let turn = 'X';
    let over = false;

    function reset() {
      board = Array(9).fill('');
      turn = 'X';
      over = false;
      if (msgEl) msgEl.textContent = 'Você é X · clique para jogar';
      render();
    }

    function winner(b) {
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (const [a, c, d] of lines) {
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
      }
      if (b.every(Boolean)) return 'E';
      return null;
    }

    function aiMove() {
      const empty = board.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
      for (const i of empty) {
        const t = board.slice();
        t[i] = 'O';
        if (winner(t) === 'O') return i;
      }
      for (const i of empty) {
        const t = board.slice();
        t[i] = 'X';
        if (winner(t) === 'X') return i;
      }
      if (board[4] === '') return 4;
      return empty[Math.floor(Math.random() * empty.length)];
    }

    function play(i) {
      if (over || board[i] || turn !== 'X') return;
      board[i] = 'X';
      let w = winner(board);
      if (w) return end(w);
      turn = 'O';
      render();
      setTimeout(() => {
        if (over) return;
        const m = aiMove();
        if (m != null) board[m] = 'O';
        w = winner(board);
        if (w) end(w);
        else {
          turn = 'X';
          if (msgEl) msgEl.textContent = 'Sua vez';
          render();
        }
      }, 280);
    }

    function end(w) {
      over = true;
      if (msgEl) {
        if (w === 'X') msgEl.textContent = 'Você venceu!';
        else if (w === 'O') msgEl.textContent = 'A IA venceu';
        else msgEl.textContent = 'Empate!';
      }
      render();
    }

    function render() {
      grid.innerHTML = board.map((v, i) =>
        `<button type="button" class="velha-cell${v ? ' filled' : ''}" data-i="${i}">${v || ''}</button>`
      ).join('');
      grid.querySelectorAll('.velha-cell').forEach(btn => {
        btn.onclick = () => play(+btn.dataset.i);
      });
    }

    host.querySelector('[data-role="restart"]').onclick = reset;
    reset();
  }

  /* ───── DOMINÓ CLÁSSICO (duplo 6 × IA) ───── */
  function startDomino(host) {
    host.innerHTML = `
      <div class="domino-pro">
        <div class="domino-pro-bar">
          <span data-role="msg">Embaralhando...</span>
          <span class="domino-pro-meta" data-role="meta"></span>
        </div>
        <div class="domino-rival">
          <span class="domino-rival-label">Adversário</span>
          <div class="domino-rival-hand" data-role="rival"></div>
        </div>
        <div class="domino-table" data-role="table">
          <div class="domino-ends">
            <span data-role="endL">—</span>
            <span class="domino-ends-sep">mesa</span>
            <span data-role="endR">—</span>
          </div>
          <div class="domino-chain" data-role="chain"></div>
        </div>
        <div class="domino-choice" data-role="choice" hidden></div>
        <div class="domino-actions">
          <button type="button" class="domino-act" data-role="buy">Comprar</button>
          <button type="button" class="domino-act ghost" data-role="pass" disabled>Passar</button>
          <button type="button" class="domino-act ghost" data-role="restart">Nova partida</button>
        </div>
        <div class="domino-you">
          <span class="domino-rival-label">Suas pedras</span>
          <div class="domino-hand" data-role="hand"></div>
        </div>
      </div>`;

    const msgEl = host.querySelector('[data-role="msg"]');
    const metaEl = host.querySelector('[data-role="meta"]');
    const rivalEl = host.querySelector('[data-role="rival"]');
    const chainEl = host.querySelector('[data-role="chain"]');
    const handEl = host.querySelector('[data-role="hand"]');
    const choiceEl = host.querySelector('[data-role="choice"]');
    const endLEl = host.querySelector('[data-role="endL"]');
    const endREl = host.querySelector('[data-role="endR"]');
    const buyBtn = host.querySelector('[data-role="buy"]');
    const passBtn = host.querySelector('[data-role="pass"]');

    let stock = [];
    let player = [];
    let rival = [];
    let chain = []; // {a,b, double}
    let left = null;
    let right = null;
    let turn = 'player'; // player | rival
    let over = false;
    let pending = null; // { idx, sides: ['L','R'] }
    let busy = false;

    function makeDeck() {
      const t = [];
      for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) t.push({ a: i, b: j, id: i + '-' + j });
      }
      return t;
    }

    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function pipSum(t) { return t.a + t.b; }
    function isDouble(t) { return t.a === t.b; }

    function sidesFor(t) {
      if (left == null) return ['L'];
      const sides = [];
      if (t.a === left || t.b === left) sides.push('L');
      if (t.a === right || t.b === right) sides.push('R');
      return sides;
    }

    function hasMove(hand) {
      return hand.some(t => sidesFor(t).length > 0);
    }

    function placeTile(t, side) {
      if (chain.length === 0) {
        chain.push({ a: t.a, b: t.b, double: isDouble(t) });
        left = t.a;
        right = t.b;
        return;
      }
      if (side === 'L') {
        if (t.b === left) {
          chain.unshift({ a: t.a, b: t.b, double: isDouble(t) });
          left = t.a;
        } else if (t.a === left) {
          chain.unshift({ a: t.b, b: t.a, double: isDouble(t) });
          left = t.b;
        }
      } else {
        if (t.a === right) {
          chain.push({ a: t.a, b: t.b, double: isDouble(t) });
          right = t.b;
        } else if (t.b === right) {
          chain.push({ a: t.b, b: t.a, double: isDouble(t) });
          right = t.a;
        }
      }
    }

    function handPoints(hand) {
      return hand.reduce((s, t) => s + pipSum(t), 0);
    }

    function setMsg(t) { if (msgEl) msgEl.textContent = t; }

    function endGame(reason) {
      over = true;
      busy = false;
      pending = null;
      const pp = handPoints(player);
      const rp = handPoints(rival);
      let text;
      if (reason === 'player') text = 'Você bateu! Dominó!';
      else if (reason === 'rival') text = 'O adversário bateu.';
      else if (pp < rp) text = 'Trancou! Você venceu nos pontos (' + pp + ' x ' + rp + ').';
      else if (rp < pp) text = 'Trancou! Adversário venceu nos pontos (' + rp + ' x ' + pp + ').';
      else text = 'Trancou! Empate em pontos (' + pp + ').';
      setMsg(text);
      render();
    }

    function checkWinAfter(who) {
      if (who === 'player' && player.length === 0) { endGame('player'); return true; }
      if (who === 'rival' && rival.length === 0) { endGame('rival'); return true; }
      if (!hasMove(player) && !hasMove(rival) && stock.length === 0) {
        endGame('block');
        return true;
      }
      return false;
    }

    function findStarter() {
      // Quem tem a maior carroça começa (6-6, 5-5...)
      for (let n = 6; n >= 0; n--) {
        const id = n + '-' + n;
        if (player.some(t => t.id === id)) return { who: 'player', id };
        if (rival.some(t => t.id === id)) return { who: 'rival', id };
      }
      // Senão, maior soma
      let best = { who: 'player', idx: 0, sum: -1 };
      player.forEach((t, i) => {
        const s = pipSum(t);
        if (s > best.sum) best = { who: 'player', idx: i, sum: s };
      });
      rival.forEach((t, i) => {
        const s = pipSum(t);
        if (s > best.sum) best = { who: 'rival', idx: i, sum: s };
      });
      return best;
    }

    function reset() {
      stopTimers();
      const deck = shuffle(makeDeck());
      player = deck.slice(0, 7);
      rival = deck.slice(7, 14);
      stock = deck.slice(14);
      chain = [];
      left = null;
      right = null;
      over = false;
      busy = false;
      pending = null;
      choiceEl.hidden = true;

      const start = findStarter();
      turn = start.who;
      if (start.id) {
        if (start.who === 'player') {
          const idx = player.findIndex(t => t.id === start.id);
          const t = player.splice(idx, 1)[0];
          placeTile(t, 'L');
          setMsg('Você abriu com a carroça ' + t.a + '-' + t.b);
          turn = 'rival';
          render();
          scheduleRival();
          return;
        }
        const idx = rival.findIndex(t => t.id === start.id);
        const t = rival.splice(idx, 1)[0];
        placeTile(t, 'L');
        setMsg('Adversário abriu com ' + t.a + '-' + t.b);
        turn = 'player';
        render();
        return;
      }
      // fallback maior pedra
      if (start.who === 'player') {
        const t = player.splice(start.idx, 1)[0];
        placeTile(t, 'L');
        setMsg('Você abriu a mesa');
        turn = 'rival';
        render();
        scheduleRival();
      } else {
        const t = rival.splice(start.idx, 1)[0];
        placeTile(t, 'L');
        setMsg('Adversário abriu a mesa');
        turn = 'player';
        render();
      }
    }

    let rivalTimer = null;
    function stopTimers() {
      if (rivalTimer) { clearTimeout(rivalTimer); rivalTimer = null; }
    }

    function scheduleRival() {
      if (over) return;
      busy = true;
      turn = 'rival';
      render();
      rivalTimer = setTimeout(rivalTurn, 700);
    }

    function rivalTurn() {
      if (over) return;
      // Compra até poder jogar
      while (!hasMove(rival) && stock.length) {
        rival.push(stock.pop());
      }
      if (!hasMove(rival)) {
        setMsg('Adversário passou');
        if (checkWinAfter('rival')) return;
        turn = 'player';
        busy = false;
        render();
        return;
      }
      // IA: joga a pedra de maior soma que encaixa; prefere carroça
      let best = null;
      rival.forEach((t, idx) => {
        const sides = sidesFor(t);
        if (!sides.length) return;
        const score = pipSum(t) + (isDouble(t) ? 3 : 0);
        if (!best || score > best.score) best = { idx, t, side: sides[0], score };
      });
      if (!best) {
        turn = 'player';
        busy = false;
        render();
        return;
      }
      rival.splice(best.idx, 1);
      placeTile(best.t, best.side);
      setMsg('Adversário jogou ' + best.t.a + '-' + best.t.b);
      if (checkWinAfter('rival')) return;
      turn = 'player';
      busy = false;
      render();
    }

    function afterPlayerMove() {
      if (checkWinAfter('player')) return;
      scheduleRival();
    }

    function confirmPlay(idx, side) {
      if (over || busy || turn !== 'player') return;
      const t = player[idx];
      if (!t) return;
      const sides = sidesFor(t);
      if (!sides.includes(side)) return;
      player.splice(idx, 1);
      placeTile(t, side);
      pending = null;
      choiceEl.hidden = true;
      setMsg('Você jogou ' + t.a + '-' + t.b);
      render();
      afterPlayerMove();
    }

    function onHandClick(idx) {
      if (over || busy || turn !== 'player') return;
      const t = player[idx];
      const sides = sidesFor(t);
      if (!sides.length) {
        setMsg('Essa pedra não encaixa nas pontas');
        return;
      }
      if (sides.length === 1) {
        confirmPlay(idx, sides[0]);
        return;
      }
      // Escolhe lado
      pending = { idx, sides };
      choiceEl.hidden = false;
      choiceEl.innerHTML =
        '<span>Onde jogar ' + t.a + '-' + t.b + '?</span>' +
        '<button type="button" class="domino-act" data-side="L">Ponta ' + left + '</button>' +
        '<button type="button" class="domino-act" data-side="R">Ponta ' + right + '</button>';
      choiceEl.querySelectorAll('[data-side]').forEach(btn => {
        btn.onclick = () => confirmPlay(idx, btn.dataset.side);
      });
      render();
    }

    function onBuy() {
      if (over || busy || turn !== 'player') return;
      if (hasMove(player)) {
        setMsg('Você ainda tem pedra pra jogar');
        return;
      }
      if (!stock.length) {
        setMsg('Monte vazio — só resta passar');
        render();
        return;
      }
      const t = stock.pop();
      player.push(t);
      setMsg('Comprou ' + t.a + '-' + t.b);
      render();
    }

    function onPass() {
      if (over || busy || turn !== 'player') return;
      if (hasMove(player)) {
        setMsg('Ainda dá pra jogar — não pode passar');
        return;
      }
      if (stock.length) {
        setMsg('Ainda tem pedra no monte — compre antes');
        return;
      }
      setMsg('Você passou');
      if (checkWinAfter('player')) return;
      scheduleRival();
    }

    function pipHtml(n) {
      return '<span class="domino-half" data-n="' + n + '"><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    }

    function tileHtml(t, opts) {
      opts = opts || {};
      const cls = ['domino-tile'];
      if (opts.double || isDouble(t)) cls.push('double');
      if (opts.playable) cls.push('playable');
      if (opts.selected) cls.push('selected');
      if (opts.back) cls.push('back');
      if (opts.button) {
        return '<button type="button" class="' + cls.join(' ') + '" data-i="' + opts.i + '">' +
          pipHtml(t.a) + '<span class="domino-div"></span>' + pipHtml(t.b) + '</button>';
      }
      if (opts.back) {
        return '<div class="' + cls.join(' ') + '" aria-hidden="true"></div>';
      }
      return '<div class="' + cls.join(' ') + '">' +
        pipHtml(t.a) + '<span class="domino-div"></span>' + pipHtml(t.b) + '</div>';
    }

    function render() {
      if (metaEl) {
        metaEl.textContent = 'Monte: ' + stock.length + ' · Você: ' + player.length + ' · Rival: ' + rival.length;
      }
      if (endLEl) endLEl.textContent = left == null ? '—' : ('← ' + left);
      if (endREl) endREl.textContent = right == null ? '—' : (right + ' →');

      rivalEl.innerHTML = rival.map(() => tileHtml({ a: 0, b: 0 }, { back: true })).join('');

      chainEl.innerHTML = chain.map(t => tileHtml(t, { double: t.double })).join('') ||
        '<div class="domino-empty-table">Aguardando abertura</div>';

      const canAct = !over && !busy && turn === 'player';
      handEl.innerHTML = player.map((t, i) => {
        const playable = canAct && sidesFor(t).length > 0;
        const selected = pending && pending.idx === i;
        return tileHtml(t, { button: true, i, playable, selected });
      }).join('');

      handEl.querySelectorAll('button[data-i]').forEach(btn => {
        btn.onclick = () => onHandClick(+btn.dataset.i);
      });

      buyBtn.disabled = !canAct || hasMove(player) || stock.length === 0;
      passBtn.disabled = !canAct || hasMove(player) || stock.length > 0;

      if (!over && canAct) {
        if (hasMove(player)) setMsg('Sua vez — jogue uma pedra verde');
        else if (stock.length) setMsg('Sem jogo — compre do monte');
        else setMsg('Sem jogo e monte vazio — passe');
      } else if (!over && turn === 'rival') {
        setMsg('Adversário pensando...');
      }
    }

    buyBtn.onclick = onBuy;
    passBtn.onclick = onPass;
    host.querySelector('[data-role="restart"]').onclick = reset;
    _gameCleanup = () => stopTimers();
    reset();
  }

  /* ───── MEMÓRIA ───── */
  function startMemoria(host) {
    const icons = ['🍔', '🍟', '🥤', '🌭', '🧀', '🥓', '🥗', '🍩'];
    host.innerHTML = `
      <div class="memoria-wrap">
        <div class="mini-score" data-role="msg">Encontre os pares</div>
        <div class="memoria-grid" data-role="grid"></div>
        <button type="button" class="mini-btn" data-role="restart">Reiniciar</button>
      </div>`;
    const msgEl = host.querySelector('[data-role="msg"]');
    const grid = host.querySelector('[data-role="grid"]');
    let cards = [];
    let open = [];
    let lock = false;
    let pairs = 0;

    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function reset() {
      cards = shuffle(icons.concat(icons)).map((icon, i) => ({ id: i, icon, flipped: false, done: false }));
      open = [];
      lock = false;
      pairs = 0;
      if (msgEl) msgEl.textContent = 'Encontre os pares';
      render();
    }

    function flip(i) {
      if (lock || cards[i].flipped || cards[i].done) return;
      cards[i].flipped = true;
      open.push(i);
      render();
      if (open.length === 2) {
        lock = true;
        const a = open[0];
        const b = open[1];
        if (cards[a].icon === cards[b].icon) {
          cards[a].done = true;
          cards[b].done = true;
          pairs++;
          open = [];
          lock = false;
          if (msgEl) {
            msgEl.textContent = pairs === icons.length
              ? 'Mandou bem! Todos os pares!'
              : ('Pares: ' + pairs + '/' + icons.length);
          }
          render();
        } else {
          setTimeout(() => {
            cards[a].flipped = false;
            cards[b].flipped = false;
            open = [];
            lock = false;
            render();
          }, 650);
        }
      }
    }

    function render() {
      grid.innerHTML = cards.map((c, i) =>
        '<button type="button" class="memoria-card' +
        (c.flipped || c.done ? ' up' : '') +
        (c.done ? ' done' : '') +
        '" data-i="' + i + '">' +
        '<span class="memoria-front">?</span>' +
        '<span class="memoria-back">' + c.icon + '</span>' +
        '</button>'
      ).join('');
      grid.querySelectorAll('.memoria-card').forEach(btn => {
        btn.onclick = () => flip(+btn.dataset.i);
      });
    }

    host.querySelector('[data-role="restart"]').onclick = reset;
    reset();
  }

  /* ───── UI pública ───── */
  function abrirPainel(opts) {
    const overlay = document.getElementById('pedidoEsperaOverlay');
    if (!overlay || !_pedido) return;
    overlay.classList.add('open');
    document.body.classList.add('pedido-espera-aberta');
    renderStatusUI();
    startMonitoramento();
    const jogos = document.getElementById('pedidoJogosSection');
    if (jogos) jogos.style.display = 'block';
    // Sempre começa no Play — jogos só depois
    setTimeout(() => resetGamesLobby(), 40);
    if (opts && opts.focusAvaliar && _pedido.status === 'entregue' && !_pedido.avaliado) {
      const aval = document.getElementById('pedidoAvaliarBox');
      if (aval) {
        aval.style.display = 'block';
        aval.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      const aval = document.getElementById('pedidoAvaliarBox');
      if (aval && (!(_pedido.status === 'entregue' && !_pedido.avaliado))) {
        aval.style.display = 'none';
      }
    }
  }

  function fecharPainel() {
    const overlay = document.getElementById('pedidoEsperaOverlay');
    if (overlay) overlay.classList.remove('open');
    document.body.classList.remove('pedido-espera-aberta');
    stopGame();
    _gameStep = 'idle';
    _gameAtual = null;
    setTabsVisible(false);
    // Continua monitorando em segundo plano enquanto o pedido estiver ativo
    if (!_pedido || _pedido.avaliado || _pedido.status === 'cancelado') {
      stopMonitoramento();
    } else {
      startMonitoramento();
    }
  }

  async function registrarPedidoAtivo(row, extra) {
    if (!row || !row.id) return;
    _pedido = {
      id: row.id,
      status: row.status || 'recebido',
      total: row.total,
      tipo_entrega: row.tipo_entrega || extra?.tipo_entrega || 'entrega',
      cliente_nome: row.cliente_nome || extra?.cliente_nome || '',
      created_at: row.created_at || new Date().toISOString(),
      avaliado: false,
    };
    saveLocal(_pedido);
    _lastKnownStatus = _pedido.status;
    setLastNotifiedStatus(_pedido.status);
    // Pede permissão para avisos no telefone
    await pedirPermissaoNotificacao();
    startMonitoramento();
    abrirPainel({ games: true });
  }

  function temAvaliacaoPendente() {
    const p = _pedido || loadLocal();
    return !!(p && p.id && p.status === 'entregue' && !p.avaliado);
  }

  async function lembrarAvaliacao(opts) {
    const forcar = !!(opts && opts.forcar);
    const local = _pedido || loadLocal();
    if (!local || local.avaliado) return false;

    // Atualiza status do banco se possível
    if (!isPedidoLocal(local.id)) {
      try {
        const row = await fetchPedido(local.id);
        if (row) {
          _pedido = { ...local, ...row, avaliado: !!local.avaliado };
          saveLocal(_pedido);
        } else {
          _pedido = local;
        }
      } catch (e) {
        _pedido = local;
      }
    } else {
      _pedido = local;
    }

    if (!_pedido || _pedido.avaliado || _pedido.status !== 'entregue') return false;

    atualizarChip();
    await pedirPermissaoNotificacao();

    // Evita spam de notificação: 1 lembrete por sessão (botão da saudação força)
    const key = 'menu_avaliar_lembrado_' + _pedido.id;
    const jaLembrou = !!sessionStorage.getItem(key);
    if (!jaLembrou || forcar) {
      sessionStorage.setItem(key, '1');
      toast('Avalie seu último pedido — leva só alguns segundos ⭐');
      if (Notification.permission === 'granted' && 'serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification('Menu Lanches', {
            body: 'Você ainda não avaliou seu último pedido. Toque para avaliar ⭐',
            icon: 'Logo.png',
            badge: 'Logo.png',
            tag: 'avaliar-pedido-' + _pedido.id,
            renotify: true,
            data: { status: 'entregue', pedidoId: _pedido.id, avaliar: true },
          });
        } catch (e) { /* ignore */ }
      } else if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Menu Lanches', {
            body: 'Você ainda não avaliou seu último pedido. Toque para avaliar ⭐',
            icon: 'Logo.png',
            tag: 'avaliar-pedido-' + _pedido.id,
          });
        } catch (e) { /* ignore */ }
      }
    }

    setTimeout(() => abrirPainel({ focusAvaliar: true }), forcar ? 200 : 450);
    return true;
  }

  async function checarPedidoAoAbrir() {
    const local = loadLocal();
    if (!local) return;
    _pedido = local;
    _lastKnownStatus = local.status || null;
    atualizarChip();
    try {
      const row = await fetchPedido(local.id);
      if (!row) {
        atualizarChip();
        if (local.status === 'entregue' && !local.avaliado) {
          await lembrarAvaliacao({ forcar: false });
          return;
        }
        if (isPedidoLocal(local.id) && !sessionStorage.getItem('menu_pedido_painel_visto')) {
          sessionStorage.setItem('menu_pedido_painel_visto', '1');
          setTimeout(() => abrirPainel({ games: true }), 700);
        }
        return;
      }
      const antigo = local.status;
      _pedido = { ...local, ...row, avaliado: !!local.avaliado };
      saveLocal(_pedido);
      _lastKnownStatus = row.status;

      if (row.status === 'cancelado') {
        if (antigo !== 'cancelado') await notificarStatusPedido('cancelado');
        clearLocal();
        postToSw({ type: 'STOP_WATCH' });
        return;
      }

      // Sempre monitora e notifica enquanto houver pedido ativo
      await pedirPermissaoNotificacao();
      startMonitoramento();

      if (antigo && row.status && antigo !== row.status) {
        await onStatusChange(row.status, antigo);
      }

      if (row.status === 'entregue') {
        if (!_pedido.avaliado) {
          await lembrarAvaliacao({ forcar: false });
        } else {
          clearLocal();
          postToSw({ type: 'STOP_WATCH' });
        }
        return;
      }

      if (!sessionStorage.getItem('menu_pedido_painel_visto')) {
        sessionStorage.setItem('menu_pedido_painel_visto', '1');
        setTimeout(() => abrirPainel({ games: true }), 700);
      }
    } catch (e) {
      atualizarChip();
      if (local.status === 'entregue' && !local.avaliado) {
        await lembrarAvaliacao({ forcar: false });
      }
    }
  }

  function bindUI() {
    const overlay = document.getElementById('pedidoEsperaOverlay');
    if (!overlay) return;

    document.getElementById('pedidoEsperaFechar')?.addEventListener('click', fecharPainel);
    document.getElementById('pedidoAtivoChip')?.addEventListener('click', () => abrirPainel({ games: true }));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) fecharPainel();
    });

    document.querySelectorAll('.mini-game-tab').forEach(tab => {
      tab.addEventListener('click', () => selecionarJogo(tab.dataset.game));
    });

    // Mensagens do Service Worker (status / abrir painel / loja aberta)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'OPEN_PEDIDO_PANEL') {
          if (_pedido) {
            if (temAvaliacaoPendente()) abrirPainel({ focusAvaliar: true });
            else abrirPainel({ games: true });
          }
        }
        if (data.type === 'LOJA_ABERTA') {
          // SW já mostrou a notificação — só sincroniza estado e toast na tela
          if (data.modo) setStoredLojaAf(data.modo);
          try { localStorage.setItem(LOJA_NOTIFY_TS_KEY, String(Date.now())); } catch (e) { /* ignore */ }
          toast(data.modo === 'R'
            ? 'Estamos abertos — somente retirada no local!'
            : 'Acabamos de abrir! Já pode pedir 🍔');
          if (typeof window.__onHorarioRealtime === 'function' && data.modo) {
            try { window.__onHorarioRealtime({ 'A/F': data.modo }); } catch (e) { /* ignore */ }
          }
        }
        if (data.type === 'PEDIDO_STATUS_UPDATE' && data.status) {
          const antigo = _pedido?.status || _lastKnownStatus;
          if (_pedido) {
            _pedido.status = data.status;
            saveLocal(_pedido);
          }
          if (data.status !== antigo) {
            // SW já notificou; só sincroniza UI e marca como notificado
            setLastNotifiedStatus(data.status);
            _lastKnownStatus = data.status;
            renderStatusUI({ flash: true });
            atualizarChip();
            toast((STATUS_META[data.status] || {}).notify || data.status);
          }
        }
      });
    }

    // Se já tem pedido ativo ao carregar o script, começa a monitorar
    const local = loadLocal();
    if (local && !isPedidoLocal(local.id) && local.status !== 'cancelado' && !local.avaliado) {
      _pedido = local;
      _lastKnownStatus = local.status || null;
      atualizarChip();
      pedirPermissaoNotificacao().then(() => startMonitoramento());
    }

    document.getElementById('btnMarcarRecebido')?.addEventListener('click', async () => {
      if (!_pedido) return;
      const btn = document.getElementById('btnMarcarRecebido');
      btn.disabled = true;
      try {
        const row = await patchStatus(_pedido.id, 'entregue');
        _pedido = { ..._pedido, status: 'entregue', ...(row || {}) };
        saveLocal(_pedido);
        renderStatusUI();
        const aval = document.getElementById('pedidoAvaliarBox');
        if (aval) aval.style.display = 'block';
        toast('Pedido marcado como recebido. Conta pra gente como foi!');
      } catch (e) {
        toast('Não foi possível atualizar o pedido.');
        btn.disabled = false;
      }
    });

    document.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _estrelas = +btn.dataset.star;
        document.querySelectorAll('.star-btn').forEach(b => {
          b.classList.toggle('on', +b.dataset.star <= _estrelas);
        });
      });
    });

    document.getElementById('btnEnviarAvaliacao')?.addEventListener('click', async () => {
      if (!_pedido) return;
      if (_estrelas < 1) {
        toast('Escolha de 1 a 5 estrelas');
        return;
      }
      const comentario = (document.getElementById('avaliacaoComentario')?.value || '').trim();
      const btn = document.getElementById('btnEnviarAvaliacao');
      btn.disabled = true;
      try {
        await postAvaliacao({
          pedido_id: _pedido.id,
          cliente_nome: _pedido.cliente_nome || null,
          cliente_cpf: (window._clienteLogado && window._clienteLogado.cpf) || null,
          estrelas: _estrelas,
          comentario: comentario || null,
          origem: 'site',
        });
        _pedido.avaliado = true;
        clearLocal();
        toast('Obrigado pela avaliação!');
        if (typeof window.carregarAvaliacoesMenu === 'function') {
          window.carregarAvaliacoesMenu();
        }
        fecharPainel();
      } catch (e) {
        console.warn(e);
        toast('Rode supabase-avaliacoes.sql no Supabase');
        btn.disabled = false;
      }
    });
  }

  window.MenuPedidoEspera = {
    bindUI,
    registrarPedidoAtivo,
    checarPedidoAoAbrir,
    lembrarAvaliacao,
    temAvaliacaoPendente,
    abrirPainel,
    fecharPainel,
    getPedido: () => _pedido,
    iniciarWatchLoja,
    onHorarioAf,
    statusNotificacoes,
    ativarNotificacoes,
    pedirPermissaoNotificacao,
  };
})();
