/* Painel do proprietário — categorias → itens → adicionais (localStorage) */
(function () {
  const STORAGE_KEY = 'menu_demo_admin_catalog';
  const PIN_DEFAULT = '1234';
  const PIN_KEY = 'menu_demo_admin_pin';
  const AUTH_SESSION_KEY = 'menu_demo_admin_ok';

  let _catalog = null;
  let _tab = 'loja';
  let _authed = false;
  const IS_ADMIN_PAGE = document.body?.dataset?.adminPage === '1';

  // Navegação do cardápio: cats → items → item → adics
  let _nav = { level: 'cats', catId: null, itemId: null, editingCat: false, editingItem: false, editingAdic: null };

  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
  }

  function afterSaveToast(msg) {
    toast(IS_ADMIN_PAGE ? (msg + ' · abra o menu para ver') : msg);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function getPin() {
    try { return localStorage.getItem(PIN_KEY) || PIN_DEFAULT; } catch (e) { return PIN_DEFAULT; }
  }

  function setPin(pin) {
    try { localStorage.setItem(PIN_KEY, String(pin || PIN_DEFAULT)); } catch (e) { /* ignore */ }
  }

  function mapFood(item, img, globalAdics) {
    let adicionais = Array.isArray(item.adicionais) ? item.adicionais.map(a => ({
      id: a.id || a.slug || uid('adic'),
      descricao: a.descricao || a.name || 'Adicional',
      valor: Number(a.valor != null ? a.valor : a.price) || 0,
      ativo: a.ativo !== false,
    })) : [];

    // Migração: adicionaisIds apontando para lista global
    if (!adicionais.length && Array.isArray(item.adicionaisIds) && globalAdics) {
      adicionais = globalAdics
        .filter(a => item.adicionaisIds.includes(a.slug) || item.adicionaisIds.includes(a.id))
        .map(a => ({
          id: a.slug || a.id,
          descricao: a.descricao,
          valor: Number(a.valor) || 0,
          ativo: a.ativo !== false,
        }));
    }

    return {
      id: item.id,
      name: item.name,
      price: Number(item.price) || 0,
      desc: item.desc || '',
      ativo: item.ativo !== false,
      img: item.img || img || null,
      tipo: item.tipo || null,
      adicionais,
    };
  }

  function seedFromPageDefaults() {
    return {
      version: 3,
      horario: { af: 'A', inicio: '00:00', fim: '23:59' },
      teleentregaAtiva: true,
      bairros: [
        { BAIRRO: 'Centro', VALOR: 0, ativo: true },
        { BAIRRO: 'Bairro Exemplo', VALOR: 5, ativo: true },
        { BAIRRO: 'Zona Norte', VALOR: 8, ativo: true },
      ],
      categorias: [],
      itens: {},
    };
  }

  function normalizeCatalog(raw) {
    if (!raw || typeof raw !== 'object') return seedFromPageDefaults();
    const seeded = seedFromPageDefaults();

    // v3+: cardápio começa vazio — remove categorias padrão antigas
    if (!raw.version || raw.version < 3) {
      return {
        ...seeded,
        horario: raw.horario || seeded.horario,
        teleentregaAtiva: raw.teleentregaAtiva !== false,
        bairros: Array.isArray(raw.bairros) ? raw.bairros : seeded.bairros,
        categorias: [],
        itens: {},
      };
    }

    const globalAdics = Array.isArray(raw.adicionais) ? raw.adicionais : [];
    const categorias = Array.isArray(raw.categorias)
      ? raw.categorias.map(c => ({
          id: c.id || uid('cat'),
          label: c.label || 'Categoria',
          ativo: c.ativo !== false,
          tipo: c.tipo || 'lanche',
        }))
      : [];

    const itens = {};
    categorias.forEach(c => {
      const list = (raw.itens && raw.itens[c.id]) || [];
      itens[c.id] = list.map(it => mapFood(it, it.img, globalAdics));
    });

    return {
      version: 3,
      horario: raw.horario || seeded.horario,
      teleentregaAtiva: raw.teleentregaAtiva !== false,
      bairros: Array.isArray(raw.bairros) ? raw.bairros : seeded.bairros,
      categorias,
      itens,
    };
  }

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _catalog = normalizeCatalog(JSON.parse(raw));
        saveCatalog();
        return _catalog;
      }
    } catch (e) { /* ignore */ }
    _catalog = seedFromPageDefaults();
    saveCatalog();
    return _catalog;
  }

  function saveCatalog() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_catalog));
    } catch (e) {
      toast('Não foi possível salvar o cardápio');
    }
  }

  function getCatalog() {
    return _catalog || loadCatalog();
  }

  function getCategorias() {
    return getCatalog().categorias || [];
  }

  function getCategoria(id) {
    return getCategorias().find(c => String(c.id) === String(id));
  }

  function getItens(catId) {
    return (_catalog.itens[catId] || []);
  }

  function getItem(catId, itemId) {
    return getItens(catId).find(i => String(i.id) === String(itemId));
  }

  function getAdicionaisForItem(itemId) {
    const cats = getCategorias();
    for (const c of cats) {
      const it = getItem(c.id, itemId);
      if (it) {
        return (it.adicionais || [])
          .filter(a => a.ativo !== false)
          .map(a => ({
            id: 'adic_' + (a.id || a.slug),
            slug: a.id || a.slug,
            descricao: a.descricao,
            name: 'Adicional: ' + a.descricao,
            price: Number(a.valor) || 0,
            precoBase: Number(a.valor) || 0,
            precoPromo: null,
            valor: Number(a.valor) || 0,
            ativo: true,
          }));
      }
    }
    // fallback: varre todos os itens
    for (const key of Object.keys(_catalog.itens || {})) {
      const it = getItem(key, itemId);
      if (it) {
        return (it.adicionais || []).filter(a => a.ativo !== false).map(a => ({
          id: 'adic_' + (a.id || a.slug),
          slug: a.id || a.slug,
          descricao: a.descricao,
          name: 'Adicional: ' + a.descricao,
          price: Number(a.valor) || 0,
          precoBase: Number(a.valor) || 0,
          precoPromo: null,
          valor: Number(a.valor) || 0,
          ativo: true,
        }));
      }
    }
    return [];
  }

  /* compat antiga */
  function getAdicionaisIdsForItem(itemId) {
    const list = getAdicionaisForItem(itemId);
    return list.map(a => a.slug);
  }

  function mapMenuItem(it) {
    const imgFn = typeof window.imagemFallbackLanche === 'function'
      ? window.imagemFallbackLanche
      : () => null;
    return {
      id: it.id,
      name: it.name,
      price: Number(it.price) || 0,
      precoBase: Number(it.price) || 0,
      precoPromo: null,
      desc: it.desc || '',
      img: it.img || imgFn(it),
      adicionais: it.adicionais || [],
    };
  }

  function tipoClick(tipo, item) {
    if (tipo === 'combo') {
      if (typeof window.comboPrecisaEscolhaBurger === 'function' && window.comboPrecisaEscolhaBurger(item)) {
        return 'combo';
      }
      return 'lanche';
    }
    if (tipo === 'porcao') return 'porcao';
    if (tipo === 'bebida') return 'bebida';
    return 'lanche';
  }

  function applyToMenu() {
    const cat = getCatalog();
    if (!cat) return;

    const categorias = (cat.categorias || []).filter(c => c.ativo !== false);
    const tabsBar = document.querySelector('.tabs-bar');
    const content = document.querySelector('.content');
    if (!tabsBar || !content) {
      // Página admin — só persiste
      return;
    }

    // Esconde seções antigas fixas
    content.querySelectorAll('.tab-section').forEach(sec => {
      if (!sec.dataset.dynamicCat) sec.style.display = 'none';
    });

    // Remove seções dinâmicas antigas
    content.querySelectorAll('.tab-section[data-dynamic-cat="1"]').forEach(el => el.remove());

    tabsBar.innerHTML = '';
    categorias.forEach((c, idx) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (idx === 0 ? ' active' : '');
      tab.setAttribute('role', 'tab');
      tab.textContent = c.label;
      tab.onclick = function () { if (typeof window.showTab === 'function') window.showTab(c.id, this); };
      tabsBar.appendChild(tab);

      const section = document.createElement('div');
      section.id = 'tab-' + c.id;
      section.className = 'tab-section';
      section.dataset.dynamicCat = '1';
      section.innerHTML = `
        <div class="section-title">${esc(c.label)}</div>
        <div class="burgers-list" id="list_${esc(c.id)}"></div>`;
      content.appendChild(section);

      const items = (cat.itens[c.id] || []).filter(i => i.ativo !== false).map(mapMenuItem);
      const host = section.querySelector('#list_' + c.id);
      if (!host) return;

      if (c.tipo === 'bebida' && typeof window.renderBebidas === 'function' && c.id === 'bebidas') {
        const latas = items.filter(b => (getItem(c.id, b.id) || {}).tipo === 'lata' || /lata/i.test(b.name)).map((b, i) => ({
          SABOR: b.name.replace(/\s*\(Lata\)\s*$/i, ''),
          VALOR: b.price, ativo: true, imagem_url: b.img, ordem: i + 1, id: b.id,
        }));
        const garrafas = items.filter(b => !latas.some(l => l.id === b.id)).map((b, i) => ({
          SABOR: b.name.replace(/\s*\(2L\)\s*$/i, ''),
          VALOR: b.price, ativo: true, imagem_url: b.img, ordem: i + 1, id: b.id,
        }));
        // renderBebidas escreve em bebidasGrid — usa host próprio
        if (typeof window.ifoodItemHtml === 'function') {
          host.innerHTML = items.length
            ? `<div class="ifood-list">${items.map(b => window.ifoodItemHtml(b, 'bebida')).join('')}</div>`
            : `<div style="text-align:center;padding:28px 12px;color:#8a7a6c;font-size:0.78rem;">Sem itens</div>`;
          if (typeof window.renderBebidas === 'function') window.renderBebidas(latas, garrafas);
        }
      } else if (typeof window.ifoodItemHtml === 'function') {
        host.innerHTML = items.length
          ? `<div class="ifood-list">${items.map(it => window.ifoodItemHtml(it, tipoClick(c.tipo, it))).join('')}</div>`
          : `<div style="text-align:center;padding:28px 12px;color:#8a7a6c;font-size:0.78rem;"><strong>${esc(c.label)}</strong><br>sem itens no momento</div>`;
      }

      if (c.tipo === 'burger' || c.id === 'burgers') {
        if (typeof window.setBurgersCatalogo === 'function') window.setBurgersCatalogo(items);
      }
    });

    // Horário / frete
    const bairros = (cat.teleentregaAtiva === false)
      ? []
      : (cat.bairros || []).filter(b => b.ativo !== false);
    if (typeof window.renderTeleentrega === 'function') window.renderTeleentrega(bairros, []);

    const h = cat.horario || { af: 'A', inicio: '00:00', fim: '23:59' };
    if (typeof window.renderHorario === 'function') {
      window.renderHorario([{
        'A/F': h.af || 'A',
        inicio: h.inicio || '00:00',
        fim: h.fim || '23:59',
        INICIO: h.inicio || '00:00',
        FIM: h.fim || '23:59',
      }]);
    }

    // Adicionais globais = união dos adicionais dos itens (para fallback)
    const allAdics = [];
    const seen = new Set();
    Object.values(cat.itens || {}).forEach(list => {
      (list || []).forEach(it => {
        (it.adicionais || []).forEach(a => {
          const key = a.id || a.descricao;
          if (seen.has(key)) return;
          seen.add(key);
          allAdics.push({
            slug: a.id || uid('adic'),
            descricao: a.descricao,
            valor: Number(a.valor) || 0,
            ativo: a.ativo !== false,
          });
        });
      });
    });
    if (typeof window.renderAdicionais === 'function') window.renderAdicionais(allAdics);
  }

  /* ───── Auth ───── */
  function isSessionAuthed() {
    try { return sessionStorage.getItem(AUTH_SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function setSessionAuthed(on) {
    try {
      if (on) sessionStorage.setItem(AUTH_SESSION_KEY, '1');
      else sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch (e) { /* ignore */ }
    _authed = !!on;
  }

  function showLogin() {
    document.getElementById('adminGate')?.classList.remove('hidden');
    document.getElementById('adminApp')?.classList.remove('open');
    document.body.classList.add('admin-locked');
    const input = document.getElementById('adminPinInput');
    const msg = document.getElementById('adminPinMsg');
    if (msg) msg.textContent = '';
    if (input) setTimeout(() => input.focus(), 40);
  }

  function showApp() {
    document.getElementById('adminGate')?.classList.add('hidden');
    document.getElementById('adminApp')?.classList.add('open');
    document.body.classList.remove('admin-locked');
    loadCatalog();
    renderAdminUI();
  }

  function tentarEntrarAdmin() {
    const input = document.getElementById('adminPinInput');
    const msg = document.getElementById('adminPinMsg');
    const pin = (input?.value || '').trim();
    if (pin !== getPin()) {
      if (msg) msg.textContent = 'Senha incorreta';
      return;
    }
    setSessionAuthed(true);
    showApp();
  }

  function sairAdmin() {
    setSessionAuthed(false);
    showLogin();
  }

  function setTab(tab) {
    _tab = tab;
    if (tab === 'cardapio') {
      _nav = { level: 'cats', catId: null, itemId: null, editingCat: false, editingItem: false, editingAdic: null };
    }
    renderAdminUI();
  }

  /* ───── Render ───── */
  function renderAdminUI() {
    const body = document.getElementById('adminBody');
    if (!body || !_catalog) return;

    document.querySelectorAll('.admin-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === _tab);
    });

    if (_tab === 'loja') body.innerHTML = htmlLoja();
    else if (_tab === 'entrega') body.innerHTML = htmlEntrega();
    else if (_tab === 'cardapio') body.innerHTML = htmlCardapioNav();
    else if (_tab === 'senha') body.innerHTML = htmlSenha();
    bindAdminBody(body);
  }

  function htmlLoja() {
    const h = _catalog.horario || {};
    return `
      <section class="admin-section">
        <h3>Status da loja</h3>
        <label class="admin-label">Modo</label>
        <select id="admAf" class="admin-input">
          <option value="A" ${h.af === 'A' ? 'selected' : ''}>Aberto (com entrega)</option>
          <option value="R" ${h.af === 'R' ? 'selected' : ''}>Somente retirada</option>
          <option value="F" ${h.af === 'F' ? 'selected' : ''}>Fechado</option>
        </select>
        <div class="admin-row2">
          <div>
            <label class="admin-label">Abre às</label>
            <input type="time" id="admInicio" class="admin-input" value="${esc(h.inicio || '00:00')}">
          </div>
          <div>
            <label class="admin-label">Fecha às</label>
            <input type="time" id="admFim" class="admin-input" value="${esc(h.fim || '23:59')}">
          </div>
        </div>
        <label class="admin-check">
          <input type="checkbox" id="admTele" ${_catalog.teleentregaAtiva !== false ? 'checked' : ''}>
          Teleentrega ativa
        </label>
        <button type="button" class="admin-btn-primary" data-action="salvar-loja">Salvar loja</button>
      </section>`;
  }

  function htmlEntrega() {
    const rows = _catalog.bairros || [];
    return `
      <section class="admin-section">
        <h3>Bairros e frete</h3>
        <p class="admin-hint">Valor 0 = entrega grátis.</p>
        <div class="admin-list">
          ${rows.map((b, i) => `
            <div class="admin-card" data-bairro-idx="${i}">
              <input class="admin-input" data-f="BAIRRO" value="${esc(b.BAIRRO)}" placeholder="Bairro">
              <div class="admin-row2">
                <input class="admin-input" type="number" min="0" step="0.5" data-f="VALOR" value="${esc(b.VALOR)}" placeholder="Frete">
                <label class="admin-check"><input type="checkbox" data-f="ativo" ${b.ativo !== false ? 'checked' : ''}> Ativo</label>
              </div>
              <button type="button" class="admin-btn-danger" data-action="del-bairro" data-i="${i}">Remover</button>
            </div>
          `).join('') || '<p class="admin-hint">Nenhum bairro cadastrado.</p>'}
        </div>
        <button type="button" class="admin-btn-secondary" data-action="add-bairro">+ Bairro</button>
        <button type="button" class="admin-btn-primary" data-action="salvar-bairros">Salvar entrega</button>
      </section>`;
  }

  function htmlSenha() {
    return `
      <section class="admin-section">
        <h3>Senha do painel</h3>
        <p class="admin-hint">Senha atual padrão da demo: <strong>1234</strong></p>
        <label class="admin-label">Nova senha</label>
        <input class="admin-input" id="admNewPin" type="password" inputmode="numeric" placeholder="Nova senha">
        <label class="admin-label">Confirmar</label>
        <input class="admin-input" id="admNewPin2" type="password" inputmode="numeric" placeholder="Repita a senha">
        <button type="button" class="admin-btn-primary" data-action="salvar-pin">Alterar senha</button>
        <hr class="admin-hr">
        <button type="button" class="admin-btn-danger" data-action="reset-catalog">Restaurar cardápio padrão</button>
      </section>`;
  }

  /* ───── Cardápio hierárquico ───── */
  function htmlCardapioNav() {
    if (_nav.level === 'cats') return htmlCats();
    if (_nav.level === 'items') return htmlItems();
    if (_nav.level === 'item') return htmlItemEdit();
    if (_nav.level === 'adics') return htmlItemAdics();
    return htmlCats();
  }

  function htmlCats() {
    if (_nav.editingCat) {
      const cat = _nav.catId ? getCategoria(_nav.catId) : { id: '', label: '', ativo: true, tipo: 'lanche' };
      const isNew = !_nav.catId;
      return `
        <section class="admin-section">
          <button type="button" class="admin-btn-link" data-action="nav-cats">← Voltar</button>
          <h3>${isNew ? 'Nova categoria' : 'Editar categoria'}</h3>
          <label class="admin-label">Nome da categoria</label>
          <input class="admin-input" id="admCatLabel" value="${esc(cat.label)}" placeholder="Ex: Xis, Combos, Sobremesas">
          <button type="button" class="admin-btn-primary" data-action="salvar-cat">Salvar categoria</button>
          ${!isNew ? `<button type="button" class="admin-btn-danger" data-action="del-cat">Excluir categoria</button>` : ''}
        </section>`;
    }

    const cats = getCategorias();
    return `
      <section class="admin-section">
        <h3>Categorias</h3>
        <p class="admin-hint">Crie categorias. Depois entre nelas para criar itens e adicionais.</p>
        <div class="admin-list">
          ${cats.map(c => `
            <button type="button" class="admin-item-row" data-action="open-cat" data-id="${esc(c.id)}">
              <span>
                <strong>${esc(c.label)}</strong>
                <small>${(getItens(c.id).length)} itens · ${c.ativo === false ? 'Inativa' : 'Ativa'}</small>
              </span>
              <span class="admin-chevron">›</span>
            </button>
          `).join('') || '<p class="admin-hint">Nenhuma categoria ainda.</p>'}
        </div>
        <button type="button" class="admin-btn-secondary" data-action="new-cat">+ Criar categoria</button>
      </section>`;
  }

  function htmlItems() {
    const cat = getCategoria(_nav.catId);
    if (!cat) {
      _nav.level = 'cats';
      return htmlCats();
    }
    const list = getItens(cat.id);
    return `
      <section class="admin-section">
        <button type="button" class="admin-btn-link" data-action="nav-cats">← Categorias</button>
        <h3>${esc(cat.label)}</h3>
        <p class="admin-hint">Itens desta categoria. Toque para editar ou gerenciar adicionais.</p>
        <div class="admin-list">
          ${list.map(it => `
            <button type="button" class="admin-item-row" data-action="open-item" data-id="${esc(it.id)}">
              <span>
                <strong>${esc(it.name)}</strong>
                <small>R$ ${Number(it.price).toFixed(2).replace('.', ',')} · ${(it.adicionais || []).length} adicionais · ${it.ativo === false ? 'Inativo' : 'Ativo'}</small>
              </span>
              <span class="admin-chevron">›</span>
            </button>
          `).join('') || '<p class="admin-hint">Nenhum item nesta categoria.</p>'}
        </div>
        <button type="button" class="admin-btn-secondary" data-action="new-item">+ Criar item</button>
        <button type="button" class="admin-btn-link" data-action="edit-cat-meta" style="margin-top:0.4rem">Editar categoria</button>
      </section>`;
  }

  function htmlItemEdit() {
    const cat = getCategoria(_nav.catId);
    const isNew = _nav.itemId === '__new__';
    const item = isNew
      ? { id: '', name: '', price: 0, desc: '', ativo: true, img: '', tipo: cat?.tipo === 'bebida' ? 'lata' : null, adicionais: [] }
      : getItem(_nav.catId, _nav.itemId);
    if (!cat || !item) {
      _nav.level = 'items';
      return htmlItems();
    }
    return `
      <section class="admin-section">
        <button type="button" class="admin-btn-link" data-action="nav-items">← Itens</button>
        <h3>${isNew ? 'Novo item' : 'Editar item'}</h3>
        <label class="admin-label">Nome</label>
        <input class="admin-input" id="admItemName" value="${esc(item.name)}">
        <label class="admin-label">Preço (R$)</label>
        <input class="admin-input" id="admItemPrice" type="number" min="0" step="0.5" value="${esc(item.price)}">
        <label class="admin-label">Descrição</label>
        <textarea class="admin-input admin-textarea" id="admItemDesc" rows="3">${esc(item.desc || '')}</textarea>
        <label class="admin-label">Imagem (arquivo na pasta)</label>
        <input class="admin-input" id="admItemImg" value="${esc(item.img || '')}" placeholder="ex: Hamburger.png">
        ${cat.tipo === 'bebida' ? `
          <label class="admin-label">Tipo bebida</label>
          <select id="admItemTipo" class="admin-input">
            <option value="lata" ${item.tipo === 'lata' ? 'selected' : ''}>Lata</option>
            <option value="garrafa" ${item.tipo !== 'lata' ? 'selected' : ''}>Garrafa 2L</option>
          </select>
        ` : ''}
        <label class="admin-check"><input type="checkbox" id="admItemAtivo" ${item.ativo !== false ? 'checked' : ''}> Item ativo no menu</label>
        <button type="button" class="admin-btn-primary" data-action="salvar-item">Salvar item</button>
        ${!isNew ? `
          <button type="button" class="admin-btn-secondary" data-action="open-adics">Adicionais deste item ›</button>
          <button type="button" class="admin-btn-danger" data-action="del-item">Excluir item</button>
        ` : ''}
      </section>`;
  }

  function htmlItemAdics() {
    const cat = getCategoria(_nav.catId);
    const item = getItem(_nav.catId, _nav.itemId);
    if (!cat || !item) {
      _nav.level = 'items';
      return htmlItems();
    }

    if (_nav.editingAdic != null) {
      const isNew = _nav.editingAdic === '__new__';
      const adic = isNew
        ? { id: '', descricao: '', valor: 0, ativo: true }
        : (item.adicionais || []).find(a => String(a.id) === String(_nav.editingAdic));
      if (!adic && !isNew) {
        _nav.editingAdic = null;
        return htmlItemAdics();
      }
      return `
        <section class="admin-section">
          <button type="button" class="admin-btn-link" data-action="nav-adics-list">← Adicionais</button>
          <h3>${isNew ? 'Novo adicional' : 'Editar adicional'}</h3>
          <p class="admin-hint">Item: <strong>${esc(item.name)}</strong></p>
          <label class="admin-label">Nome do adicional</label>
          <input class="admin-input" id="admAdicNome" value="${esc(adic.descricao)}" placeholder="Ex: Bacon extra">
          <label class="admin-label">Preço (R$)</label>
          <input class="admin-input" id="admAdicValor" type="number" min="0" step="0.5" value="${esc(adic.valor)}">
          <label class="admin-check"><input type="checkbox" id="admAdicAtivo" ${adic.ativo !== false ? 'checked' : ''}> Ativo</label>
          <button type="button" class="admin-btn-primary" data-action="salvar-adic">Salvar adicional</button>
          ${!isNew ? `<button type="button" class="admin-btn-danger" data-action="del-adic">Excluir adicional</button>` : ''}
        </section>`;
    }

    const adics = item.adicionais || [];
    return `
      <section class="admin-section">
        <button type="button" class="admin-btn-link" data-action="nav-item">← ${esc(item.name)}</button>
        <h3>Adicionais</h3>
        <p class="admin-hint">Aparecem no upsell quando o cliente pede este item.</p>
        <div class="admin-list">
          ${adics.map(a => `
            <button type="button" class="admin-item-row" data-action="open-adic" data-id="${esc(a.id)}">
              <span>
                <strong>${esc(a.descricao)}</strong>
                <small>R$ ${Number(a.valor).toFixed(2).replace('.', ',')} · ${a.ativo === false ? 'Inativo' : 'Ativo'}</small>
              </span>
              <span class="admin-chevron">›</span>
            </button>
          `).join('') || '<p class="admin-hint">Nenhum adicional neste item.</p>'}
        </div>
        <button type="button" class="admin-btn-secondary" data-action="new-adic">+ Criar adicional</button>
      </section>`;
  }

  function bindAdminBody(body) {
    body.querySelector('[data-action="salvar-loja"]')?.addEventListener('click', () => {
      _catalog.horario = {
        af: document.getElementById('admAf')?.value || 'A',
        inicio: document.getElementById('admInicio')?.value || '00:00',
        fim: document.getElementById('admFim')?.value || '23:59',
      };
      _catalog.teleentregaAtiva = !!document.getElementById('admTele')?.checked;
      saveCatalog();
      applyToMenu();
      afterSaveToast('Loja atualizada');
    });

    body.querySelector('[data-action="add-bairro"]')?.addEventListener('click', () => {
      _catalog.bairros = _catalog.bairros || [];
      _catalog.bairros.push({ BAIRRO: 'Novo bairro', VALOR: 5, ativo: true });
      renderAdminUI();
    });

    body.querySelector('[data-action="salvar-bairros"]')?.addEventListener('click', () => {
      const cards = [...body.querySelectorAll('[data-bairro-idx]')];
      _catalog.bairros = cards.map(card => ({
        BAIRRO: card.querySelector('[data-f="BAIRRO"]')?.value?.trim() || 'Bairro',
        VALOR: parseFloat(card.querySelector('[data-f="VALOR"]')?.value) || 0,
        ativo: !!card.querySelector('[data-f="ativo"]')?.checked,
      }));
      saveCatalog();
      applyToMenu();
      afterSaveToast('Entrega atualizada');
    });

    body.querySelectorAll('[data-action="del-bairro"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _catalog.bairros.splice(+btn.dataset.i, 1);
        renderAdminUI();
      });
    });

    body.querySelector('[data-action="salvar-pin"]')?.addEventListener('click', () => {
      const a = document.getElementById('admNewPin')?.value || '';
      const b = document.getElementById('admNewPin2')?.value || '';
      if (!a || a.length < 4) { toast('Senha com pelo menos 4 dígitos'); return; }
      if (a !== b) { toast('Senhas não conferem'); return; }
      setPin(a);
      toast('Senha alterada');
    });

    body.querySelector('[data-action="reset-catalog"]')?.addEventListener('click', () => {
      if (!confirm('Restaurar o cardápio padrão da demo? Suas edições serão apagadas.')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      _catalog = seedFromPageDefaults();
      saveCatalog();
      applyToMenu();
      _nav = { level: 'cats', catId: null, itemId: null, editingCat: false, editingItem: false, editingAdic: null };
      afterSaveToast('Cardápio padrão restaurado');
      renderAdminUI();
    });

    /* Cardápio nav */
    body.querySelector('[data-action="nav-cats"]')?.addEventListener('click', () => {
      _nav = { level: 'cats', catId: null, itemId: null, editingCat: false, editingItem: false, editingAdic: null };
      renderAdminUI();
    });
    body.querySelector('[data-action="new-cat"]')?.addEventListener('click', () => {
      _nav = { level: 'cats', catId: null, itemId: null, editingCat: true, editingItem: false, editingAdic: null };
      renderAdminUI();
    });
    body.querySelector('[data-action="edit-cat-meta"]')?.addEventListener('click', () => {
      _nav.editingCat = true;
      _nav.level = 'cats';
      renderAdminUI();
    });
    body.querySelectorAll('[data-action="open-cat"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _nav = { level: 'items', catId: btn.dataset.id, itemId: null, editingCat: false, editingItem: false, editingAdic: null };
        renderAdminUI();
      });
    });
    body.querySelector('[data-action="salvar-cat"]')?.addEventListener('click', () => {
      const label = document.getElementById('admCatLabel')?.value?.trim();
      if (!label) { toast('Informe o nome da categoria'); return; }
      if (!_nav.catId) {
        const id = uid('cat');
        _catalog.categorias.push({ id, label, tipo: 'lanche', ativo: true });
        _catalog.itens[id] = [];
        _nav.catId = id;
      } else {
        const c = getCategoria(_nav.catId);
        if (c) { c.label = label; }
      }
      saveCatalog();
      applyToMenu();
      _nav = { level: 'items', catId: _nav.catId, itemId: null, editingCat: false, editingItem: false, editingAdic: null };
      afterSaveToast('Categoria salva');
      renderAdminUI();
    });
    body.querySelector('[data-action="del-cat"]')?.addEventListener('click', () => {
      if (!confirm('Excluir esta categoria e todos os itens dela?')) return;
      const id = _nav.catId;
      _catalog.categorias = _catalog.categorias.filter(c => String(c.id) !== String(id));
      delete _catalog.itens[id];
      saveCatalog();
      applyToMenu();
      _nav = { level: 'cats', catId: null, itemId: null, editingCat: false, editingItem: false, editingAdic: null };
      afterSaveToast('Categoria excluída');
      renderAdminUI();
    });

    body.querySelector('[data-action="nav-items"]')?.addEventListener('click', () => {
      _nav.level = 'items';
      _nav.itemId = null;
      _nav.editingItem = false;
      _nav.editingAdic = null;
      renderAdminUI();
    });
    body.querySelector('[data-action="new-item"]')?.addEventListener('click', () => {
      _nav.level = 'item';
      _nav.itemId = '__new__';
      renderAdminUI();
    });
    body.querySelectorAll('[data-action="open-item"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _nav.level = 'item';
        _nav.itemId = btn.dataset.id;
        renderAdminUI();
      });
    });
    body.querySelector('[data-action="salvar-item"]')?.addEventListener('click', () => {
      const name = document.getElementById('admItemName')?.value?.trim();
      const price = parseFloat(document.getElementById('admItemPrice')?.value) || 0;
      if (!name) { toast('Informe o nome'); return; }
      const desc = document.getElementById('admItemDesc')?.value || '';
      const img = document.getElementById('admItemImg')?.value?.trim() || null;
      const ativo = !!document.getElementById('admItemAtivo')?.checked;
      const tipo = document.getElementById('admItemTipo')?.value || null;
      _catalog.itens[_nav.catId] = _catalog.itens[_nav.catId] || [];
      if (_nav.itemId === '__new__') {
        const id = uid('item');
        const novo = { id, name, price, desc, ativo, img, adicionais: [] };
        if (tipo) novo.tipo = tipo;
        _catalog.itens[_nav.catId].push(novo);
        _nav.itemId = id;
      } else {
        const it = getItem(_nav.catId, _nav.itemId);
        if (!it) return;
        it.name = name;
        it.price = price;
        it.desc = desc;
        it.img = img;
        it.ativo = ativo;
        if (tipo) it.tipo = tipo;
        if (!Array.isArray(it.adicionais)) it.adicionais = [];
      }
      saveCatalog();
      applyToMenu();
      afterSaveToast('Item salvo');
      renderAdminUI();
    });
    body.querySelector('[data-action="del-item"]')?.addEventListener('click', () => {
      if (!confirm('Excluir este item?')) return;
      _catalog.itens[_nav.catId] = getItens(_nav.catId).filter(i => String(i.id) !== String(_nav.itemId));
      saveCatalog();
      applyToMenu();
      _nav.level = 'items';
      _nav.itemId = null;
      afterSaveToast('Item excluído');
      renderAdminUI();
    });

    body.querySelector('[data-action="open-adics"]')?.addEventListener('click', () => {
      _nav.level = 'adics';
      _nav.editingAdic = null;
      renderAdminUI();
    });
    body.querySelector('[data-action="nav-item"]')?.addEventListener('click', () => {
      _nav.level = 'item';
      _nav.editingAdic = null;
      renderAdminUI();
    });
    body.querySelector('[data-action="nav-adics-list"]')?.addEventListener('click', () => {
      _nav.editingAdic = null;
      renderAdminUI();
    });
    body.querySelector('[data-action="new-adic"]')?.addEventListener('click', () => {
      _nav.editingAdic = '__new__';
      renderAdminUI();
    });
    body.querySelectorAll('[data-action="open-adic"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _nav.editingAdic = btn.dataset.id;
        renderAdminUI();
      });
    });
    body.querySelector('[data-action="salvar-adic"]')?.addEventListener('click', () => {
      const item = getItem(_nav.catId, _nav.itemId);
      if (!item) return;
      const descricao = document.getElementById('admAdicNome')?.value?.trim();
      const valor = parseFloat(document.getElementById('admAdicValor')?.value) || 0;
      const ativo = !!document.getElementById('admAdicAtivo')?.checked;
      if (!descricao) { toast('Informe o nome do adicional'); return; }
      if (!Array.isArray(item.adicionais)) item.adicionais = [];
      if (_nav.editingAdic === '__new__') {
        item.adicionais.push({ id: uid('adic'), descricao, valor, ativo });
      } else {
        const a = item.adicionais.find(x => String(x.id) === String(_nav.editingAdic));
        if (a) { a.descricao = descricao; a.valor = valor; a.ativo = ativo; }
      }
      saveCatalog();
      applyToMenu();
      _nav.editingAdic = null;
      afterSaveToast('Adicional salvo');
      renderAdminUI();
    });
    body.querySelector('[data-action="del-adic"]')?.addEventListener('click', () => {
      const item = getItem(_nav.catId, _nav.itemId);
      if (!item) return;
      if (!confirm('Excluir este adicional?')) return;
      item.adicionais = (item.adicionais || []).filter(a => String(a.id) !== String(_nav.editingAdic));
      saveCatalog();
      applyToMenu();
      _nav.editingAdic = null;
      afterSaveToast('Adicional excluído');
      renderAdminUI();
    });
  }

  function bindPageUI() {
    document.getElementById('adminEntrarBtn')?.addEventListener('click', tentarEntrarAdmin);
    document.getElementById('adminPinInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tentarEntrarAdmin();
    });
    document.getElementById('adminSairBtn')?.addEventListener('click', sairAdmin);
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });
  }

  function boot() {
    loadCatalog();
    applyToMenu();
  }

  function bootPage() {
    loadCatalog();
    bindPageUI();
    if (isSessionAuthed()) {
      _authed = true;
      showApp();
    } else {
      showLogin();
    }
  }

  window.MenuAdmin = {
    boot,
    bootPage,
    loadCatalog,
    getCatalog,
    applyToMenu,
    getAdicionaisForItem,
    getAdicionaisIdsForItem,
  };
})();
