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

  const DEFAULT_CATS = [
    { id: 'combos', label: 'Combos', ativo: true, tipo: 'combo' },
    { id: 'xs', label: "Xis & Lanches", ativo: true, tipo: 'lanche' },
    { id: 'calota', label: 'Calota', ativo: true, tipo: 'lanche' },
    { id: 'burgers', label: 'Burgers', ativo: true, tipo: 'burger' },
    { id: 'porcoes', label: 'Porções', ativo: true, tipo: 'porcao' },
    { id: 'bebidas', label: 'Bebidas', ativo: true, tipo: 'bebida' },
  ];

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

  function defaultLegacy() {
    return {
      combos: [
        { id:'c1', name:'Combo 1', price:55, desc:'Bacon, cheddar, batata frita P, 2 burguer burguer, 1 maionese' },
        { id:'c2', name:'Combo 2', price:50, desc:'Calabresa, cheddar, batata frita P, 2 burguer burguer, 1 maionese da casa' },
        { id:'c3', name:'Combo 3', price:55, desc:'6 salgados fritos, 6 anéis de cebola, batata frita, 2 burguer burguer, 1 maionese da casa' },
        { id:'c4', name:'Combo 4', price:80, desc:'Calabresa, 6 anéis de cebola, batata frita P, 3 burguer burguer, 2 maioneses da casa' },
        { id:'c5', name:'Combo 5', price:105, desc:'12 salgados fritos, 8 anéis de cebola, calabresa, batata frita P, 4 burguer burguer, 2 maioneses da casa' },
        { id:'c6', name:'Combo 6', price:105, desc:'8 anéis de cebola, calabresa, batata frita M, 4 burguer burguer, 2 maioneses da casa' },
        { id:'c7', name:'Combo 7', price:70, desc:'Bacon, cheddar, batata frita P, 2 xis salada, 2 maioneses da casa' },
        { id:'c8', name:'Combo 8', price:85, desc:'Calabresa, cheddar, 6 anéis de cebola, batata frita P, 3 xis salada, 2 maioneses da casa' },
        { id:'c9', name:'Combo 9', price:75, desc:'6 salgados fritos, bacon, cheddar, batata frita P, 3 cachorros quentes abertos, 1 maionese da casa' },
        { id:'c10', name:'Combo 10', price:90, desc:'Xis calota salada, batata frita P, 1 maionese da casa, 1 refrigerante 2 litros' },
        { id:'c11', name:'Combo 11', price:50, desc:'Calabresa acebolada, 15 anéis de cebola, batata frita P, 1 maionese da casa, farofa temperada' },
        { id:'c12', name:'Combo 12', price:105, desc:'Salgados fritos, anéis de cebola, polenta frita, pepino, ovo de codorna, batata frita, cheddar, catupiry, 2 maioneses caseiras, frango, carne, calabresa' },
      ],
      xs: [
        { id:'x1', name:'X Dog', price:20, desc:'Pão big, maionese caseira, salcicha, molho, ketchup, mostarda, batata palha, milho, ervilha, tomate, alface' },
        { id:'x2', name:'Torrada (Gado/Frango/Calabresa)', price:20, desc:'Carne a escolha do cliente, maionese da casa, queijo, ovo' },
        { id:'x3', name:'X Salada', price:23, desc:'Pão big, maionese da casa, bife artesanal, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x4', name:'X Frango', price:23, desc:'Pão big, maionese da casa, frango, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x5', name:'X Calabresa', price:27, desc:'Pão big, maionese da casa, calabresa fatiada, bife bovino, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x6', name:'X Bacon', price:29, desc:'Pão big, maionese da casa, bacon em cubos, bife bovino, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x7', name:'X Coração', price:30, desc:'Pão big, maionese da casa, coração, bife bovino, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x8', name:'X Frango a Moda', price:28, desc:'Pão big, maionese da casa, frango, cebola, mostarda, catupiry, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x9', name:'X Entreveiro', price:31, desc:'Pão big, maionese da casa, bife bovino, calabresa, frango, pimentão, cebola, molho barbecue, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x10', name:'X Moda', price:31, desc:'Pão big, maionese da casa, bife bovino, bacon, calabresa, frango, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x11', name:'X Gladiador', price:31, desc:'Pão big, maionese da casa, bife bovino, bacon, calabresa, batata frita, ovo, queijo, milho, ervilha, tomate, alface' },
        { id:'x12', name:'Cachorro Quente Aberto', price:17, desc:'Pão 24cm, maionese caseira, 2 salsichas, molho, ketchup, mostarda, batata palha, milho, ervilha, tomate, alface' },
      ],
      calota: [
        { id:'cal1', name:'Calota Salada', price:67, desc:'Xis calota no sabor salada' },
        { id:'cal2', name:'Calota Frango', price:67, desc:'Xis calota no sabor frango' },
        { id:'cal3', name:'Calota Calabresa', price:75, desc:'Xis calota no sabor calabresa' },
        { id:'cal4', name:'Calota Frango a Moda', price:75, desc:'Xis calota no sabor frango a moda' },
        { id:'cal5', name:'Calota Entreveiro', price:80, desc:'Xis calota no sabor entreveiro' },
        { id:'cal6', name:'Calota Moda', price:80, desc:'Xis calota no sabor moda' },
        { id:'cal7', name:'Calota Gladiador', price:80, desc:'Xis calota no sabor gladiador' },
      ],
      burgers: [
        { id:'b1', name:'Burguer Burguer', price:18, desc:'Pão brioche, hambúrguer bovino, tomate, alface, queijo, cebola roxa, maionese cheddar, ketchup' },
        { id:'b2', name:'Bacon Burguer', price:22, desc:'Pão brioche, hambúrguer bovino, bacon, anéis de cebola empanado, queijo, maionese cheddar, alface, tomate, ketchup' },
        { id:'b3', name:'Imperial Burguer', price:22, desc:'Pão brioche, hambúrguer bovino, bacon, abacaxi, mel, queijo, maionese da casa, alface, tomate' },
        { id:'b4', name:'Costela Burguer', price:25, desc:'Pão brioche, hambúrguer bovino, costela desfiada, cebola, barbecue, pepino, queijo, maionese da casa, alface, tomate' },
        { id:'b5', name:'Frango Burguer', price:25, desc:'Pão brioche, frango frito, bacon, pepino, queijo, molho tare, maionese da casa, alface, tomate' },
        { id:'b6', name:'Gaúcho Burguer', price:22, desc:'Pão brioche, hambúrguer bovino, ovo, queijo, pimentão e cebola grelhados, barbecue, maionese da casa, alface, tomate' },
        { id:'b7', name:'Catupiry Burguer', price:25, desc:'Pão brioche, hambúrguer bovino, disco de catupiry empanado frito, bacon, queijo, maionese da casa, alface, tomate' },
        { id:'b8', name:'Duplo Burguer', price:28, desc:'Pão brioche, 2 hambúrgueres bovinos, queijo mussarela empanado frito, maionese da casa, alface, tomate, ketchup' },
      ],
      porcoes: [
        { id:'f1', name:'Batata Frita P Simples', price:15, desc:'' },
        { id:'f2', name:'Batata Frita P Especial', price:25, desc:'Batata, cheddar, bacon, maionese da casa' },
        { id:'f3', name:'Batata Frita M Simples', price:25, desc:'' },
        { id:'f4', name:'Batata Frita M Especial', price:35, desc:'Batata, cheddar, bacon, maionese da casa' },
      ],
    };
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
    const base = defaultLegacy();
    const LEGACY_COMBOS = (window.LEGACY_COMBOS && window.LEGACY_COMBOS.length) ? window.LEGACY_COMBOS : base.combos;
    const LEGACY_XS = (window.LEGACY_XS && window.LEGACY_XS.length) ? window.LEGACY_XS : base.xs;
    const LEGACY_CALOTA = (window.LEGACY_CALOTA && window.LEGACY_CALOTA.length) ? window.LEGACY_CALOTA : base.calota;
    const LEGACY_BURGERS = (window.LEGACY_BURGERS && window.LEGACY_BURGERS.length) ? window.LEGACY_BURGERS : base.burgers;
    const LEGACY_PORCOES = (window.LEGACY_PORCOES && window.LEGACY_PORCOES.length) ? window.LEGACY_PORCOES : base.porcoes;

    const globalAdics = [
      { slug: 'batata_xis', descricao: 'Adicional de Batata Frita no Hambúrguer', valor: 7, ativo: true },
      { slug: 'cheddar_extra', descricao: 'Cheddar extra', valor: 4, ativo: true },
      { slug: 'bacon_extra', descricao: 'Bacon extra', valor: 5, ativo: true },
    ];

    const withDefaultAdics = (list, imgFn) => list.map((it, i) => {
      const mapped = mapFood(it, typeof imgFn === 'function' ? imgFn(it, i) : imgFn, null);
      // Lanches/combos/burgers começam com os 3 adicionais padrão
      mapped.adicionais = globalAdics.map(a => ({
        id: a.slug,
        descricao: a.descricao,
        valor: a.valor,
        ativo: true,
      }));
      return mapped;
    });

    return {
      version: 2,
      horario: { af: 'A', inicio: '00:00', fim: '23:59' },
      teleentregaAtiva: true,
      bairros: [
        { BAIRRO: 'Centro', VALOR: 0, ativo: true },
        { BAIRRO: 'Bairro Exemplo', VALOR: 5, ativo: true },
        { BAIRRO: 'Zona Norte', VALOR: 8, ativo: true },
      ],
      categorias: DEFAULT_CATS.map(c => ({ ...c })),
      itens: {
        combos: withDefaultAdics(LEGACY_COMBOS, (_, i) => 'Combo_' + (i + 1) + '.png'),
        xs: withDefaultAdics(LEGACY_XS, null),
        calota: withDefaultAdics(LEGACY_CALOTA, 'calota.jpg'),
        burgers: withDefaultAdics(LEGACY_BURGERS, 'Hamburger.png'),
        porcoes: LEGACY_PORCOES.map(f => mapFood(f, 'porcoes.jpg', null)),
        bebidas: [
          { id: 'lata_coca', name: 'Coca-Cola Lata', price: 6, desc: 'Lata', ativo: true, img: 'Coca-Cola.png', tipo: 'lata', adicionais: [] },
          { id: 'lata_guarana', name: 'Guaraná Lata', price: 6, desc: 'Lata', ativo: true, img: 'refrigerante-antarctica-guarana-2l_18875.webp', tipo: 'lata', adicionais: [] },
          { id: 'lata_pepsi', name: 'Pepsi Lata', price: 6, desc: 'Lata', ativo: true, img: 'Pepsi-2l.jpg', tipo: 'lata', adicionais: [] },
          { id: 'garrafa_coca', name: 'Coca-Cola', price: 13, desc: '2L', ativo: true, img: 'Coca-Cola.png', tipo: 'garrafa', adicionais: [] },
          { id: 'garrafa_guarana', name: 'Guaraná 2L', price: 13, desc: '2L', ativo: true, img: 'refrigerante-antarctica-guarana-2l_18875.webp', tipo: 'garrafa', adicionais: [] },
          { id: 'garrafa_pepsi', name: 'Pepsi 2L', price: 13, desc: '2L', ativo: true, img: 'Pepsi-2l.jpg', tipo: 'garrafa', adicionais: [] },
        ],
      },
    };
  }

  function normalizeCatalog(raw) {
    if (!raw || typeof raw !== 'object') return seedFromPageDefaults();
    const seeded = seedFromPageDefaults();
    const globalAdics = Array.isArray(raw.adicionais) ? raw.adicionais : [];

    let categorias;
    if (Array.isArray(raw.categorias)) {
      categorias = raw.categorias.map(c => ({
        id: c.id || uid('cat'),
        label: c.label || 'Categoria',
        ativo: c.ativo !== false,
        tipo: c.tipo || 'lanche',
      }));
    } else if (raw.categorias && typeof raw.categorias === 'object') {
      categorias = DEFAULT_CATS.map(def => ({
        id: def.id,
        label: (raw.categorias[def.id] && raw.categorias[def.id].label) || def.label,
        ativo: !(raw.categorias[def.id] && raw.categorias[def.id].ativo === false),
        tipo: def.tipo,
      }));
    } else {
      categorias = seeded.categorias;
    }

    const itens = {};
    categorias.forEach(c => {
      const list = (raw.itens && raw.itens[c.id]) || (seeded.itens[c.id]) || [];
      itens[c.id] = list.map(it => mapFood(it, it.img, globalAdics));
    });
    // Mantém itens órfãos de categorias antigas
    if (raw.itens) {
      Object.keys(raw.itens).forEach(key => {
        if (!itens[key]) itens[key] = (raw.itens[key] || []).map(it => mapFood(it, it.img, globalAdics));
      });
    }

    return {
      version: 2,
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
          <label class="admin-label">Tipo no menu</label>
          <select class="admin-input" id="admCatTipo">
            <option value="lanche" ${cat.tipo === 'lanche' ? 'selected' : ''}>Lanche / Xis</option>
            <option value="combo" ${cat.tipo === 'combo' ? 'selected' : ''}>Combo</option>
            <option value="burger" ${cat.tipo === 'burger' ? 'selected' : ''}>Hambúrguer</option>
            <option value="porcao" ${cat.tipo === 'porcao' ? 'selected' : ''}>Porção</option>
            <option value="bebida" ${cat.tipo === 'bebida' ? 'selected' : ''}>Bebida</option>
          </select>
          <label class="admin-check"><input type="checkbox" id="admCatAtivo" ${cat.ativo !== false ? 'checked' : ''}> Categoria ativa no menu</label>
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
      const tipo = document.getElementById('admCatTipo')?.value || 'lanche';
      const ativo = !!document.getElementById('admCatAtivo')?.checked;
      if (!_nav.catId) {
        const id = uid('cat');
        _catalog.categorias.push({ id, label, tipo, ativo });
        _catalog.itens[id] = [];
        _nav.catId = id;
      } else {
        const c = getCategoria(_nav.catId);
        if (c) { c.label = label; c.tipo = tipo; c.ativo = ativo; }
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
