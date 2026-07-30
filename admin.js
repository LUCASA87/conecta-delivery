/* Painel do proprietário — cardápio, horário, entrega e adicionais (demo localStorage) */
(function () {
  const STORAGE_KEY = 'menu_demo_admin_catalog';
  const PIN_DEFAULT = '1234';
  const PIN_KEY = 'menu_demo_admin_pin';

  let _catalog = null;
  let _tab = 'loja';
  let _catKey = 'xs';
  let _editItemId = null;
  let _authed = false;

  const CAT_META = [
    { key: 'combos', label: 'Combos', tab: 'combos' },
    { key: 'xs', label: "Xis & Lanches", tab: 'xs' },
    { key: 'calota', label: 'Calota', tab: 'calota' },
    { key: 'burgers', label: 'Burgers', tab: 'burgers' },
    { key: 'porcoes', label: 'Porções', tab: 'fritas' },
    { key: 'bebidas', label: 'Bebidas', tab: 'bebidas' },
  ];

  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPin() {
    try { return localStorage.getItem(PIN_KEY) || PIN_DEFAULT; } catch (e) { return PIN_DEFAULT; }
  }

  function setPin(pin) {
    try { localStorage.setItem(PIN_KEY, String(pin || PIN_DEFAULT)); } catch (e) { /* ignore */ }
  }

  function seedFromPageDefaults() {
    const LEGACY_COMBOS = window.LEGACY_COMBOS || [];
    const LEGACY_XS = window.LEGACY_XS || [];
    const LEGACY_CALOTA = window.LEGACY_CALOTA || [];
    const LEGACY_BURGERS = window.LEGACY_BURGERS || [];
    const LEGACY_PORCOES = window.LEGACY_PORCOES || [];

    const mapFood = (item, img) => ({
      id: item.id,
      name: item.name,
      price: Number(item.price) || 0,
      desc: item.desc || '',
      ativo: true,
      img: img || null,
      adicionaisIds: null, // null = todos os adicionais ativos
    });

    return {
      version: 1,
      horario: { af: 'A', inicio: '00:00', fim: '23:59' },
      teleentregaAtiva: true,
      bairros: [
        { BAIRRO: 'Centro', VALOR: 0, ativo: true },
        { BAIRRO: 'Bairro Exemplo', VALOR: 5, ativo: true },
        { BAIRRO: 'Zona Norte', VALOR: 8, ativo: true },
      ],
      categorias: Object.fromEntries(CAT_META.map(c => [c.key, { label: c.label, ativo: true }])),
      itens: {
        combos: LEGACY_COMBOS.map((c, i) => mapFood(c, 'Combo_' + (i + 1) + '.png')),
        xs: LEGACY_XS.map(x => mapFood(x, null)),
        calota: LEGACY_CALOTA.map(c => mapFood(c, 'calota.jpg')),
        burgers: LEGACY_BURGERS.map(b => mapFood(b, 'Hamburger.png')),
        porcoes: LEGACY_PORCOES.map(f => mapFood(f, 'porcoes.jpg')),
        bebidas: [
          { id: 'lata_coca', name: 'Coca-Cola Lata', price: 6, desc: 'Lata', ativo: true, img: 'Coca-Cola.png', tipo: 'lata' },
          { id: 'lata_guarana', name: 'Guaraná Lata', price: 6, desc: 'Lata', ativo: true, img: 'refrigerante-antarctica-guarana-2l_18875.webp', tipo: 'lata' },
          { id: 'lata_pepsi', name: 'Pepsi Lata', price: 6, desc: 'Lata', ativo: true, img: 'Pepsi-2l.jpg', tipo: 'lata' },
          { id: 'garrafa_coca', name: 'Coca-Cola', price: 13, desc: '2L', ativo: true, img: 'Coca-Cola.png', tipo: 'garrafa' },
          { id: 'garrafa_guarana', name: 'Guaraná 2L', price: 13, desc: '2L', ativo: true, img: 'refrigerante-antarctica-guarana-2l_18875.webp', tipo: 'garrafa' },
          { id: 'garrafa_pepsi', name: 'Pepsi 2L', price: 13, desc: '2L', ativo: true, img: 'Pepsi-2l.jpg', tipo: 'garrafa' },
        ],
      },
      adicionais: [
        { slug: 'batata_xis', descricao: 'Adicional de Batata Frita no Hambúrguer', valor: 7, ativo: true },
        { slug: 'cheddar_extra', descricao: 'Cheddar extra', valor: 4, ativo: true },
        { slug: 'bacon_extra', descricao: 'Bacon extra', valor: 5, ativo: true },
      ],
    };
  }

  function loadCatalog() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.itens) {
          _catalog = parsed;
          return _catalog;
        }
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

  function findItem(catKey, id) {
    const list = (_catalog.itens[catKey] || []);
    return list.find(i => String(i.id) === String(id));
  }

  function findItemAnywhere(id) {
    for (const meta of CAT_META) {
      const it = findItem(meta.key, id);
      if (it) return { catKey: meta.key, item: it };
    }
    return null;
  }

  function getAdicionaisIdsForItem(itemId) {
    const found = findItemAnywhere(itemId);
    if (!found) return null;
    return found.item.adicionaisIds;
  }

  /* ───── Aplicar no menu do cliente ───── */
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
      adicionaisIds: it.adicionaisIds,
    };
  }

  function applyToMenu() {
    const cat = getCatalog();
    if (!cat) return;

    const ativos = (key) => (cat.itens[key] || []).filter(i => i.ativo !== false).map(mapMenuItem);

    const combos = ativos('combos');
    const xs = ativos('xs');
    const calota = ativos('calota');
    const burgers = ativos('burgers');
    const porcoes = ativos('porcoes');

    if (typeof window.setBurgersCatalogo === 'function') window.setBurgersCatalogo(burgers);
    if (typeof window.renderCombos === 'function') window.renderCombos(combos);
    if (typeof window.renderXs === 'function') window.renderXs(xs);
    if (typeof window.renderCalota === 'function') window.renderCalota(calota);
    if (typeof window.renderBurgers === 'function') window.renderBurgers(burgers);
    if (typeof window.renderFritas === 'function') window.renderFritas(porcoes);

    const bebidas = (cat.itens.bebidas || []).filter(i => i.ativo !== false);
    const latas = bebidas.filter(b => b.tipo === 'lata').map((b, i) => ({
      SABOR: b.name.replace(/\s*\(Lata\)\s*$/i, ''),
      VALOR: b.price,
      ativo: true,
      imagem_url: b.img,
      ordem: i + 1,
      id: b.id,
    }));
    const garrafas = bebidas.filter(b => b.tipo !== 'lata').map((b, i) => ({
      SABOR: b.name.replace(/\s*\(2L\)\s*$/i, ''),
      VALOR: b.price,
      ativo: true,
      imagem_url: b.img,
      ordem: i + 1,
      id: b.id,
    }));
    if (typeof window.renderBebidas === 'function') window.renderBebidas(latas, garrafas);

    const bairros = (cat.teleentregaAtiva === false)
      ? []
      : (cat.bairros || []).filter(b => b.ativo !== false);
    if (typeof window.renderTeleentrega === 'function') {
      window.renderTeleentrega(bairros, []);
    }

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

    const adics = (cat.adicionais || []).filter(a => a.ativo !== false);
    if (typeof window.renderAdicionais === 'function') {
      window.renderAdicionais(adics);
    }

    // Mostrar/ocultar abas de categoria
    CAT_META.forEach(meta => {
      const on = !(cat.categorias && cat.categorias[meta.key] && cat.categorias[meta.key].ativo === false);
      const tabBtn = document.querySelector(`.tabs-bar .tab[onclick*="'${meta.tab}'"]`);
      const section = document.getElementById('tab-' + meta.tab);
      if (tabBtn) tabBtn.style.display = on ? '' : 'none';
      if (section) section.style.display = on ? '' : 'none';
    });
  }

  /* ───── UI Auth ───── */
  function abrirGate() {
    const gate = document.getElementById('adminGate');
    if (!gate) return;
    gate.classList.add('open');
    document.body.classList.add('admin-aberta');
    const input = document.getElementById('adminPinInput');
    const msg = document.getElementById('adminPinMsg');
    if (msg) msg.textContent = '';
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 50);
    }
  }

  function fecharGate() {
    document.getElementById('adminGate')?.classList.remove('open');
    if (!document.getElementById('adminOverlay')?.classList.contains('open')) {
      document.body.classList.remove('admin-aberta');
    }
  }

  function tentarEntrarAdmin() {
    const input = document.getElementById('adminPinInput');
    const msg = document.getElementById('adminPinMsg');
    const pin = (input?.value || '').trim();
    if (pin !== getPin()) {
      if (msg) msg.textContent = 'Senha incorreta';
      return;
    }
    _authed = true;
    fecharGate();
    abrirPainel();
  }

  function abrirPainel() {
    if (!_authed) {
      abrirGate();
      return;
    }
    loadCatalog();
    const overlay = document.getElementById('adminOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.classList.add('admin-aberta');
    renderAdminUI();
  }

  function fecharPainel() {
    document.getElementById('adminOverlay')?.classList.remove('open');
    document.getElementById('adminGate')?.classList.remove('open');
    document.body.classList.remove('admin-aberta');
  }

  function setTab(tab) {
    _tab = tab;
    _editItemId = null;
    renderAdminUI();
  }

  /* ───── Render admin ───── */
  function renderAdminUI() {
    const body = document.getElementById('adminBody');
    if (!body || !_catalog) return;

    document.querySelectorAll('.admin-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === _tab);
    });

    if (_tab === 'loja') body.innerHTML = htmlLoja();
    else if (_tab === 'entrega') body.innerHTML = htmlEntrega();
    else if (_tab === 'cardapio') body.innerHTML = htmlCardapio();
    else if (_tab === 'adicionais') body.innerHTML = htmlAdicionais();
    else if (_tab === 'senha') body.innerHTML = htmlSenha();
    bindAdminBody(body);
  }

  function htmlLoja() {
    const h = _catalog.horario || {};
    const cats = _catalog.categorias || {};
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
      </section>
      <section class="admin-section">
        <h3>Categorias no menu</h3>
        <p class="admin-hint">Desative para ocultar a aba no cardápio do cliente.</p>
        ${CAT_META.map(c => `
          <label class="admin-check">
            <input type="checkbox" data-cat-toggle="${c.key}" ${!(cats[c.key] && cats[c.key].ativo === false) ? 'checked' : ''}>
            ${esc(c.label)}
          </label>
        `).join('')}
        <button type="button" class="admin-btn-primary" data-action="salvar-categorias">Salvar categorias</button>
      </section>`;
  }

  function htmlEntrega() {
    const rows = _catalog.bairros || [];
    return `
      <section class="admin-section">
        <h3>Bairros e frete</h3>
        <p class="admin-hint">Valor 0 = entrega grátis.</p>
        <div class="admin-list" id="admBairroList">
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

  function htmlCardapio() {
    const list = _catalog.itens[_catKey] || [];
    if (_editItemId != null) {
      const item = _editItemId === '__new__'
        ? { id: '', name: '', price: 0, desc: '', ativo: true, img: '', tipo: 'lata', adicionaisIds: null }
        : findItem(_catKey, _editItemId);
      if (!item) { _editItemId = null; return htmlCardapio(); }
      return htmlItemForm(item);
    }
    return `
      <section class="admin-section">
        <h3>Itens do cardápio</h3>
        <label class="admin-label">Categoria</label>
        <select id="admCatSelect" class="admin-input">
          ${CAT_META.map(c => `<option value="${c.key}" ${_catKey === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
        </select>
        <div class="admin-list">
          ${list.map(it => `
            <button type="button" class="admin-item-row" data-action="edit-item" data-id="${esc(it.id)}">
              <span>
                <strong>${esc(it.name)}</strong>
                <small>R$ ${Number(it.price).toFixed(2).replace('.', ',')} · ${it.ativo === false ? 'Inativo' : 'Ativo'}</small>
              </span>
              <span class="admin-chevron">›</span>
            </button>
          `).join('') || '<p class="admin-hint">Nenhum item nesta categoria.</p>'}
        </div>
        <button type="button" class="admin-btn-secondary" data-action="new-item">+ Novo item</button>
      </section>`;
  }

  function htmlItemForm(item) {
    const isNew = _editItemId === '__new__';
    const adics = _catalog.adicionais || [];
    const ids = item.adicionaisIds;
    const allAdics = ids == null;
    return `
      <section class="admin-section">
        <button type="button" class="admin-btn-link" data-action="back-items">← Voltar</button>
        <h3>${isNew ? 'Novo item' : 'Editar item'}</h3>
        <label class="admin-label">Nome</label>
        <input class="admin-input" id="admItemName" value="${esc(item.name)}">
        <label class="admin-label">Preço (R$)</label>
        <input class="admin-input" id="admItemPrice" type="number" min="0" step="0.5" value="${esc(item.price)}">
        <label class="admin-label">Descrição</label>
        <textarea class="admin-input admin-textarea" id="admItemDesc" rows="3">${esc(item.desc || '')}</textarea>
        <label class="admin-label">Imagem (arquivo na pasta)</label>
        <input class="admin-input" id="admItemImg" value="${esc(item.img || '')}" placeholder="ex: Hamburger.png">
        ${_catKey === 'bebidas' ? `
          <label class="admin-label">Tipo bebida</label>
          <select id="admItemTipo" class="admin-input">
            <option value="lata" ${item.tipo === 'lata' ? 'selected' : ''}>Lata</option>
            <option value="garrafa" ${item.tipo !== 'lata' ? 'selected' : ''}>Garrafa 2L</option>
          </select>
        ` : ''}
        <label class="admin-check"><input type="checkbox" id="admItemAtivo" ${item.ativo !== false ? 'checked' : ''}> Item ativo no menu</label>

        ${_catKey !== 'bebidas' && _catKey !== 'porcoes' ? `
          <h4 class="admin-subh">Adicionais deste item</h4>
          <p class="admin-hint">Marque quais adicionais aparecem no upsell deste lanche.</p>
          <label class="admin-check"><input type="checkbox" id="admAdicAll" ${allAdics ? 'checked' : ''}> Todos os adicionais</label>
          <div id="admAdicChecks" style="${allAdics ? 'opacity:0.45;pointer-events:none' : ''}">
            ${adics.map(a => {
              const on = Array.isArray(ids) && (ids.includes(a.slug) || ids.includes('adic_' + a.slug));
              return `<label class="admin-check"><input type="checkbox" data-adic-slug="${esc(a.slug)}" ${on ? 'checked' : ''}> ${esc(a.descricao)} (R$ ${Number(a.valor).toFixed(2).replace('.', ',')})</label>`;
            }).join('') || '<p class="admin-hint">Cadastre adicionais na aba Adicionais.</p>'}
          </div>
        ` : ''}

        <button type="button" class="admin-btn-primary" data-action="salvar-item">Salvar item</button>
        ${!isNew ? `<button type="button" class="admin-btn-danger" data-action="del-item">Excluir item</button>` : ''}
      </section>`;
  }

  function htmlAdicionais() {
    const rows = _catalog.adicionais || [];
    return `
      <section class="admin-section">
        <h3>Adicionais</h3>
        <p class="admin-hint">Usados no upsell dos lanches. Você pode limitar por item na edição do cardápio.</p>
        <div class="admin-list">
          ${rows.map((a, i) => `
            <div class="admin-card" data-adic-idx="${i}">
              <input class="admin-input" data-f="descricao" value="${esc(a.descricao)}" placeholder="Descrição">
              <div class="admin-row2">
                <input class="admin-input" type="number" min="0" step="0.5" data-f="valor" value="${esc(a.valor)}" placeholder="Valor">
                <label class="admin-check"><input type="checkbox" data-f="ativo" ${a.ativo !== false ? 'checked' : ''}> Ativo</label>
              </div>
              <input class="admin-input" data-f="slug" value="${esc(a.slug)}" placeholder="slug (único)">
              <button type="button" class="admin-btn-danger" data-action="del-adic" data-i="${i}">Remover</button>
            </div>
          `).join('') || '<p class="admin-hint">Nenhum adicional.</p>'}
        </div>
        <button type="button" class="admin-btn-secondary" data-action="add-adic">+ Adicional</button>
        <button type="button" class="admin-btn-primary" data-action="salvar-adics">Salvar adicionais</button>
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
      toast('Loja atualizada');
    });

    body.querySelector('[data-action="salvar-categorias"]')?.addEventListener('click', () => {
      _catalog.categorias = _catalog.categorias || {};
      CAT_META.forEach(c => {
        const el = body.querySelector(`[data-cat-toggle="${c.key}"]`);
        _catalog.categorias[c.key] = {
          label: c.label,
          ativo: !!(el && el.checked),
        };
      });
      saveCatalog();
      applyToMenu();
      toast('Categorias atualizadas');
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
      toast('Entrega atualizada');
    });

    body.querySelectorAll('[data-action="del-bairro"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.i;
        _catalog.bairros.splice(i, 1);
        renderAdminUI();
      });
    });

    body.querySelector('#admCatSelect')?.addEventListener('change', (e) => {
      _catKey = e.target.value;
      _editItemId = null;
      renderAdminUI();
    });

    body.querySelectorAll('[data-action="edit-item"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _editItemId = btn.dataset.id;
        renderAdminUI();
      });
    });

    body.querySelector('[data-action="new-item"]')?.addEventListener('click', () => {
      _editItemId = '__new__';
      renderAdminUI();
    });

    body.querySelector('[data-action="back-items"]')?.addEventListener('click', () => {
      _editItemId = null;
      renderAdminUI();
    });

    body.querySelector('#admAdicAll')?.addEventListener('change', (e) => {
      const box = document.getElementById('admAdicChecks');
      if (box) {
        box.style.opacity = e.target.checked ? '0.45' : '1';
        box.style.pointerEvents = e.target.checked ? 'none' : '';
      }
    });

    body.querySelector('[data-action="salvar-item"]')?.addEventListener('click', () => {
      const name = document.getElementById('admItemName')?.value?.trim();
      const price = parseFloat(document.getElementById('admItemPrice')?.value) || 0;
      if (!name) { toast('Informe o nome'); return; }
      const desc = document.getElementById('admItemDesc')?.value || '';
      const img = document.getElementById('admItemImg')?.value?.trim() || null;
      const ativo = !!document.getElementById('admItemAtivo')?.checked;
      const tipo = document.getElementById('admItemTipo')?.value || 'lata';

      let adicionaisIds = null;
      const all = document.getElementById('admAdicAll');
      if (all && !all.checked) {
        adicionaisIds = [...body.querySelectorAll('[data-adic-slug]:checked')].map(el => el.dataset.adicSlug);
      }

      _catalog.itens[_catKey] = _catalog.itens[_catKey] || [];
      if (_editItemId === '__new__') {
        const id = _catKey.slice(0, 2) + '_' + Date.now();
        const novo = { id, name, price, desc, ativo, img, adicionaisIds };
        if (_catKey === 'bebidas') novo.tipo = tipo;
        _catalog.itens[_catKey].push(novo);
      } else {
        const it = findItem(_catKey, _editItemId);
        if (!it) return;
        it.name = name;
        it.price = price;
        it.desc = desc;
        it.img = img;
        it.ativo = ativo;
        it.adicionaisIds = adicionaisIds;
        if (_catKey === 'bebidas') it.tipo = tipo;
      }
      saveCatalog();
      applyToMenu();
      _editItemId = null;
      toast('Item salvo');
      renderAdminUI();
    });

    body.querySelector('[data-action="del-item"]')?.addEventListener('click', () => {
      if (!confirm('Excluir este item?')) return;
      _catalog.itens[_catKey] = (_catalog.itens[_catKey] || []).filter(i => String(i.id) !== String(_editItemId));
      saveCatalog();
      applyToMenu();
      _editItemId = null;
      toast('Item excluído');
      renderAdminUI();
    });

    body.querySelector('[data-action="add-adic"]')?.addEventListener('click', () => {
      _catalog.adicionais = _catalog.adicionais || [];
      _catalog.adicionais.push({
        slug: 'adic_' + Date.now(),
        descricao: 'Novo adicional',
        valor: 3,
        ativo: true,
      });
      renderAdminUI();
    });

    body.querySelector('[data-action="salvar-adics"]')?.addEventListener('click', () => {
      const cards = [...body.querySelectorAll('[data-adic-idx]')];
      _catalog.adicionais = cards.map(card => ({
        slug: (card.querySelector('[data-f="slug"]')?.value || '').trim() || ('adic_' + Date.now()),
        descricao: card.querySelector('[data-f="descricao"]')?.value?.trim() || 'Adicional',
        valor: parseFloat(card.querySelector('[data-f="valor"]')?.value) || 0,
        ativo: !!card.querySelector('[data-f="ativo"]')?.checked,
      }));
      saveCatalog();
      applyToMenu();
      toast('Adicionais salvos');
    });

    body.querySelectorAll('[data-action="del-adic"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _catalog.adicionais.splice(+btn.dataset.i, 1);
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
      toast('Cardápio padrão restaurado');
      renderAdminUI();
    });
  }

  function bindUI() {
    document.getElementById('btnAdminMenu')?.addEventListener('click', () => {
      if (_authed) abrirPainel();
      else abrirGate();
    });
    document.getElementById('adminEntrarBtn')?.addEventListener('click', tentarEntrarAdmin);
    document.getElementById('adminPinInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tentarEntrarAdmin();
    });
    document.getElementById('adminGateFechar')?.addEventListener('click', fecharGate);
    document.getElementById('adminFechar')?.addEventListener('click', fecharPainel);
    document.getElementById('adminOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'adminOverlay') fecharPainel();
    });
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });
  }

  function boot() {
    loadCatalog();
    bindUI();
  }

  window.MenuAdmin = {
    boot,
    loadCatalog,
    getCatalog,
    applyToMenu,
    getAdicionaisIdsForItem,
    abrir: abrirPainel,
    fechar: fecharPainel,
  };
})();
