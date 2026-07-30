const CACHE_NAME = 'menu-lanches-v7';
const STATUS_LABEL = {
  recebido: 'Pedido recebido',
  preparando: 'Seu pedido está sendo preparado',
  em_rota: 'Saiu para entrega',
  pronto: 'Pronto para retirada',
  entregue: 'Pedido entregue',
  cancelado: 'Pedido cancelado',
};

let _watch = null; // pedido { id, url, key, lastStatus }
let _pollTimer = null;
let _lojaWatch = null; // { url, key, lastAf }
let _lojaPollTimer = null;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          if (data.tipo === 'loja_aberta') {
            client.postMessage({ type: 'LOJA_ABERTA_CLICK' });
          } else {
            client.postMessage({ type: 'OPEN_PEDIDO_PANEL' });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./index.html');
      }
    })
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'WATCH_PEDIDO') {
    _watch = {
      id: data.id,
      url: data.url,
      key: data.key,
      lastStatus: data.lastStatus || null,
    };
    startSwPoll();
  }
  if (data.type === 'STOP_WATCH') {
    stopSwPoll();
    _watch = null;
  }
  if (data.type === 'WATCH_LOJA') {
    _lojaWatch = {
      url: data.url,
      key: data.key,
      lastAf: data.lastAf || null,
    };
    startLojaPoll();
  }
  if (data.type === 'STOP_WATCH_LOJA') {
    stopLojaPoll();
    _lojaWatch = null;
  }
  if (data.type === 'NOTIFY_STATUS') {
    showStatusNotification(data.status, data.pedidoId);
  }
  if (data.type === 'NOTIFY_LOJA_ABERTA') {
    showLojaAbertaNotification(data.modo);
  }
});

function stopSwPoll() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

function startSwPoll() {
  stopSwPoll();
  if (!_watch || !_watch.id || !_watch.url || !_watch.key) return;
  _pollTimer = setInterval(checkPedidoStatus, 15000);
  checkPedidoStatus();
}

async function checkPedidoStatus() {
  if (!_watch || !_watch.id) return;
  if (String(_watch.id).startsWith('local-')) return;
  try {
    const r = await fetch(
      `${_watch.url}/rest/v1/PEDIDOS?id=eq.${encodeURIComponent(_watch.id)}&select=id,status&limit=1`,
      {
        headers: {
          apikey: _watch.key,
          Authorization: 'Bearer ' + _watch.key,
        },
      }
    );
    if (!r.ok) return;
    const rows = await r.json();
    const row = rows[0];
    if (!row || !row.status) return;
    if (_watch.lastStatus && _watch.lastStatus !== row.status) {
      await showStatusNotification(row.status, row.id);
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsArr.forEach((c) => {
        c.postMessage({ type: 'PEDIDO_STATUS_UPDATE', status: row.status, id: row.id });
      });
    }
    _watch.lastStatus = row.status;
    if (row.status === 'entregue' || row.status === 'cancelado') {
      stopSwPoll();
    }
  } catch (e) {
    /* ignore */
  }
}

function stopLojaPoll() {
  if (_lojaPollTimer) {
    clearInterval(_lojaPollTimer);
    _lojaPollTimer = null;
  }
}

function startLojaPoll() {
  stopLojaPoll();
  if (!_lojaWatch || !_lojaWatch.url || !_lojaWatch.key) return;
  _lojaPollTimer = setInterval(checkLojaStatus, 20000);
  checkLojaStatus();
}

function afAberto(af) {
  return af === 'A' || af === 'R';
}

async function checkLojaStatus() {
  if (!_lojaWatch) return;
  try {
    const r = await fetch(
      `${_lojaWatch.url}/rest/v1/HORARIO?select=id,"A/F"&limit=1`,
      {
        headers: {
          apikey: _lojaWatch.key,
          Authorization: 'Bearer ' + _lojaWatch.key,
        },
      }
    );
    if (!r.ok) return;
    const rows = await r.json();
    const row = rows[0];
    if (!row) return;
    const af = row['A/F'] || row.af || null;
    // Só notifica se já tínhamos estado fechado e agora abriu (não no 1º load)
    if (_lojaWatch.lastAf != null && _lojaWatch.lastAf === 'F' && afAberto(af)) {
      await showLojaAbertaNotification(af);
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clientsArr.forEach((c) => {
        c.postMessage({ type: 'LOJA_ABERTA', modo: af });
      });
    }
    _lojaWatch.lastAf = af;
  } catch (e) {
    /* ignore */
  }
}

async function showStatusNotification(status, pedidoId) {
  const title = 'Menu Lanches';
  const body = STATUS_LABEL[status] || ('Status atualizado: ' + status);
  const tag = 'pedido-' + (pedidoId || 'ativo') + '-' + status;
  try {
    await self.registration.showNotification(title, {
      body,
      icon: './Logo.png',
      badge: './Logo.png',
      tag,
      renotify: true,
      data: { status, pedidoId, tipo: 'pedido' },
      vibrate: [120, 60, 120],
    });
  } catch (e) {
    /* ignore */
  }
}

async function showLojaAbertaNotification(modo) {
  const body = modo === 'R'
    ? 'Estamos abertos — somente retirada no local!'
    : 'Acabamos de abrir! Já pode pedir 🍔';
  try {
    await self.registration.showNotification('Menu Lanches abriu!', {
      body,
      icon: './Logo.png',
      badge: './Logo.png',
      tag: 'loja-aberta',
      renotify: true,
      data: { tipo: 'loja_aberta', modo },
      vibrate: [160, 80, 160],
    });
  } catch (e) {
    /* ignore */
  }
}
