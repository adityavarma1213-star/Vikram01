(function (root) {
  const API_BASE = (root.ACCUMULATION_API_BASE || '').replace(/\/$/, '');
  const isStaticPages = !API_BASE && /github\.io$/i.test(root.location.hostname);
  let snapshotPromise;

  function installGlobalNavigation() {
    const nav = document.querySelector('.app-navigation .nav-list');
    if (!nav) return;
    nav.innerHTML = `
      <li><a class="nav-link" href="index.html#home">Home</a></li>
      <li><a class="nav-link" href="index.html#companyOverview">Analysis</a></li>
      <li><a class="nav-link active" href="accumulation.html" aria-current="page">Accumulation Scanner</a></li>
      <li><a class="nav-link" href="index.html#hiddenGems">Hidden Gems</a></li>
      <li><a class="nav-link" href="index.html#opportunityRadar">Opportunity Radar</a></li>
      <li><a class="nav-link" href="nse-data.html">NSE Data</a></li>
      <li><a class="nav-link" href="research.html">1 Year Research</a></li>
      <li><a class="nav-link" href="index.html#portfolio">Portfolio</a></li>
      <li><a class="nav-link" href="about.html">About</a></li>`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installGlobalNavigation, { once: true });
  else installGlobalNavigation();

  // Production integration: bound every backend call so an unreachable/hanging backend surfaces
  // as an honest timeout error within a few seconds, instead of leaving the UI waiting forever.
  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 15000);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    catch (e) { if (e.name === 'AbortError') throw new Error('SERVICE_UNAVAILABLE: backend did not respond in time.'); throw e; }
    finally { clearTimeout(timer); }
  }

  async function request(path, options) {
    const res = await fetchWithTimeout(`${API_BASE}${path}`, { headers: { Accept: 'application/json' }, ...options });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `API request failed (${res.status})`);
    return body;
  }

  async function snapshot() {
    if (!snapshotPromise) {
      snapshotPromise = fetch('data/scanner.json', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(res => {
        if (!res.ok) throw new Error(`Static scanner data unavailable (${res.status})`);
        return res.json();
      });
    }
    return snapshotPromise;
  }

  function periodResults(data, period) {
    return period && data.periods?.[period] ? data.periods[period] : (data.results || []);
  }
  function staticScan(symbols, period = '1D') {
    return snapshot().then(data => ({ ...data, selectedPeriod: period, results: periodResults(data, period).filter(r => symbols.includes(String(r.symbol).toUpperCase())) }));
  }
  function staticAll(period = '1D') {
    return snapshot().then(data => ({ ...data, selectedPeriod: period, results: periodResults(data, period) }));
  }
  function staticStock(symbol, period = '1D') {
    return snapshot().then(data => {
      const result = periodResults(data, period).find(r => String(r.symbol).toUpperCase() === String(symbol).toUpperCase());
      if (!result) throw new Error(`No scanner data for ${symbol} in ${period}`);
      return { result, asOf: data.asOf, generatedAt: data.generatedAt, selectedPeriod: period };
    });
  }

  root.ACCUMULATION_API = {
    health: () => isStaticPages ? snapshot().then(data => ({ status: data.status === 'ok' ? 'ok' : 'pending', lastCmDate: data.asOf, historyDays: data.historyDays })) : request('/api/health'),
    scan: (symbols, period = '1D') => isStaticPages ? staticScan(symbols.map(s => s.toUpperCase()), period) : request(`/api/scanner/scan?symbols=${encodeURIComponent(symbols.join(','))}&period=${encodeURIComponent(period)}`),
    all: (period = '1D') => isStaticPages ? staticAll(period) : request(`/api/scanner/all?period=${encodeURIComponent(period)}`),
    stock: (symbol, period = '1D') => isStaticPages ? staticStock(symbol, period) : request(`/api/stock/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}`),
    watchlist: (period = '1D') => isStaticPages ? staticScan(['ONGC', 'VBL', 'BSE', 'NMDC'], period) : request(`/api/scanner/watchlist?period=${encodeURIComponent(period)}`)
  };

  // The old accumulation page contains a legacy condition/value popup in its inline script.
  // Capture the click before that handler and provide the new simple preset dropdown instead.
  const FILTERS = {
    stock: { title: 'Stock', options: [['all','All stocks'],['az','A to Z'],['za','Z to A']] },
    price: { title: 'Price', options: [['all','All prices'],['asc','Low to High'],['desc','High to Low']] },
    prevClose: { title: 'Prev Close', options: [['all','All prices'],['asc','Low to High'],['desc','High to Low']] },
    priceChange: { title: 'Price %', options: [['all','All changes'],['positive','Positive only'],['negative','Negative only'],['desc','Highest to Lowest'],['asc','Lowest to Highest']] },
    score: { title: 'Score', options: [['all','All scores'],['strong','75+ Strong'],['starting','55–74 Starting'],['below','Below 55'],['desc','Highest to Lowest']] },
    verdict: { title: 'Verdict', options: [['all','All verdicts'],['confirmed','Accumulation Confirmed'],['starting','Accumulation Starting'],['mixed','Unconfirmed / Mixed'],['distribution','Distribution']] },
    volumeRatio: { title: 'Vol Ratio', options: [['all','All volume'],['strong','1.5x or higher'],['elevated','1.2x to 1.49x'],['low','Below 1.2x'],['desc','Highest to Lowest']] },
    delivery: { title: 'Delivery %', options: [['all','All delivery'],['strong','55% or higher'],['positive','45% to 54.9%'],['low','Below 45%'],['desc','Highest to Lowest']] },
    obv: { title: 'OBV', options: [['all','All OBV'],['desc','Highest to Lowest'],['asc','Lowest to Highest']] },
    changeOi: { title: 'Futures OI', options: [['all','All OI'],['positive','Positive OI'],['negative','Negative OI'],['desc','Highest to Lowest'],['asc','Lowest to Highest']] },
    why: { title: 'Why', options: [['all','All explanations'],['az','A to Z'],['za','Z to A']] }
  };
  const state = {};
  let menu = null;

  function addStyle() {
    if (document.getElementById('vikram-simple-filter-style')) return;
    const style = document.createElement('style');
    style.id = 'vikram-simple-filter-style';
    style.textContent = `
      .filter-menu{display:none!important}
      .filter-trigger svg{display:none!important}
      .filter-trigger{font-size:0!important;position:relative}
      .filter-trigger:after{content:'⌄';font-size:16px;line-height:1;color:currentColor}
      .vikram-simple-menu{position:fixed;z-index:99999;width:245px;padding:10px;background:#151d33;border:1px solid #33405f;border-radius:12px;box-shadow:0 18px 45px rgba(0,0,0,.35);color:#fff;font-family:inherit}
      .vikram-simple-menu h3{margin:2px 4px 8px;font-size:13px;letter-spacing:.02em;text-transform:uppercase}
      .vikram-simple-menu button{display:block;width:100%;padding:9px 10px;margin:2px 0;border:0;border-radius:8px;background:transparent;color:#dce4f7;text-align:left;font:inherit;font-size:13px;cursor:pointer}
      .vikram-simple-menu button:hover,.vikram-simple-menu button.selected{background:#263656;color:#fff}
      .vikram-simple-menu button.selected:after{content:' ✓';float:right}
      .vikram-simple-menu .hint{margin:7px 4px 2px;color:#8f9bb5;font-size:11px}
      .metric-table tbody tr[hidden]{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function colIndex(key) {
    return { stock:0, price:1, prevClose:2, priceChange:3, score:4, verdict:5, volumeRatio:6, delivery:7, obv:8, changeOi:9, why:10 }[key];
  }
  function cellText(row,key) { return row.cells[colIndex(key)]?.textContent.trim() || ''; }
  function numberFrom(text) {
    const s = String(text).replace(/,/g,'').replace(/%/g,'').replace(/x$/i,'').replace(/₹/g,'').replace(/\s/g,'');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  function rows() { return Array.from(document.querySelectorAll('#results tr')).filter(r => r.cells.length >= 11); }

  function applyState() {
    const all = rows();
    all.forEach(r => { r.hidden = false; });
    for (const [key, op] of Object.entries(state)) {
      if (op === 'all') continue;
      all.forEach(r => {
        const text = cellText(r,key);
        const n = numberFrom(text);
        let keep = true;
        if (key === 'stock' || key === 'why') keep = op === 'az' ? text.localeCompare('') >= 0 : op === 'za' ? true : true;
        if (key === 'priceChange') keep = op === 'positive' ? n > 0 : op === 'negative' ? n < 0 : true;
        if (key === 'score') keep = op === 'strong' ? n >= 75 : op === 'starting' ? n >= 55 && n < 75 : op === 'below' ? n < 55 : true;
        if (key === 'verdict') { const v=text.toUpperCase(); keep = op==='confirmed' ? v.includes('CONFIRMED') : op==='starting' ? v.includes('STARTING') : op==='mixed' ? v.includes('UNCONFIRMED') || v.includes('MIXED') : op==='distribution' ? v.includes('DISTRIBUTION') : true; }
        if (key === 'volumeRatio') keep = op==='strong' ? n >= 1.5 : op==='elevated' ? n >= 1.2 && n < 1.5 : op==='low' ? n < 1.2 : true;
        if (key === 'delivery') keep = op==='strong' ? n >= 55 : op==='positive' ? n >= 45 && n < 55 : op==='low' ? n < 45 : true;
        if (key === 'changeOi') keep = op==='positive' ? n > 0 : op==='negative' ? n < 0 : true;
        if (!keep) r.hidden = true;
      });
    }
    const active = Object.entries(state).filter(([,v]) => v && v !== 'all');
    const visible = all.filter(r => !r.hidden).length;
    const summary = document.getElementById('filterSummary');
    if (summary) summary.textContent = active.length ? `${visible.toLocaleString('en-IN')} of ${all.length.toLocaleString('en-IN')} stocks shown • ${active.length} filter${active.length===1?'':'s'} active` : `Showing all ${all.length.toLocaleString('en-IN')} stocks • Filters: none`;
    document.querySelectorAll('.filter-trigger').forEach(b => b.classList.toggle('active', !!state[b.dataset.key] && state[b.dataset.key] !== 'all'));
  }

  function sortRows(key,dir) {
    if (!['az','za','asc','desc'].includes(dir)) return;
    const tbody=document.getElementById('results'); if(!tbody) return;
    const list=rows();
    list.sort((a,b)=>{
      const av=cellText(a,key), bv=cellText(b,key), an=numberFrom(av), bn=numberFrom(bv);
      let c=Number.isFinite(an)&&Number.isFinite(bn) ? an-bn : av.localeCompare(bv,undefined,{numeric:true,sensitivity:'base'});
      return (dir==='desc'||dir==='za') ? -c : c;
    });
    list.forEach(r=>tbody.appendChild(r));
  }

  function closeMenu(){ menu?.remove(); menu=null; }
  function openMenu(key,button){
    closeMenu();
    const cfg=FILTERS[key]; if(!cfg) return;
    menu=document.createElement('div'); menu.className='vikram-simple-menu'; menu.setAttribute('role','menu');
    const h=document.createElement('h3'); h.textContent=`FILTER ${cfg.title}`; menu.appendChild(h);
    cfg.options.forEach(([op,label])=>{
      const b=document.createElement('button'); b.type='button'; b.textContent=label; b.className=(state[key]||'all')===op?'selected':'';
      b.addEventListener('click',()=>{ state[key]=op; if(['az','za','asc','desc'].includes(op)) sortRows(key,op); applyState(); closeMenu(); });
      menu.appendChild(b);
    });
    const hint=document.createElement('div'); hint.className='hint'; hint.textContent='Select an option — no Apply button needed.'; menu.appendChild(hint);
    document.body.appendChild(menu);
    const rect=button.getBoundingClientRect();
    const left=Math.min(Math.max(8,rect.right-245),window.innerWidth-253);
    const top=Math.min(rect.bottom+6,window.innerHeight-menu.offsetHeight-8);
    menu.style.left=`${left}px`; menu.style.top=`${Math.max(8,top)}px`;
  }

  function installSimpleFilters(){
    addStyle();
    document.addEventListener('click',e=>{
      const trigger=e.target.closest?.('.filter-trigger');
      if(trigger){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); openMenu(trigger.dataset.key,trigger); return; }
      if(e.target.closest?.('#clearFilters')){ Object.keys(state).forEach(k=>delete state[k]); closeMenu(); setTimeout(applyState,0); return; }
      if(menu && !e.target.closest('.vikram-simple-menu')) closeMenu();
    },true);
    window.addEventListener('scroll',closeMenu,true);
    window.addEventListener('resize',closeMenu);
    const tbody=document.getElementById('results');
    if(tbody){
      const observer=new MutationObserver(()=>setTimeout(applyState,0));
      observer.observe(tbody,{childList:true});
    }
    setTimeout(applyState,300);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installSimpleFilters,{once:true});
  else installSimpleFilters();
})(window);
