const SUPABASE_URL = window.SUPABASE_URL || ''
const SUPABASE_KEY = window.SUPABASE_KEY || ''

const state = { ventes: [] }
let debounceTimer

const formatPrix = n => (n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const now = () => new Date().toISOString().slice(0, 10)
const $ = s => document.querySelector(s)
const sleep = ms => new Promise(r => setTimeout(r, ms))

document.addEventListener('DOMContentLoaded', init)

function init() {
  registerSW()
  bindEvents()
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    $('#main-content').innerHTML = `
      <div class=empty-state style=margin-top:60px>
        <div class=ico>⚙️</div>
        <p style=font-size:16px>Configurez les clés Supabase</p>
        <p style=font-size:13px;color:#94a3b8;margin-top:8px>Vérifiez config.example.js ou créez config.js</p>
      </div>`
    return
  }
  loadData()
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  }
}

function toast(msg) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._t)
  t._t = setTimeout(() => t.classList.remove('show'), 2200)
}

function escHtml(s) {
  if (!s) return ''
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

// === API DIRECTE via fetch ===
async function api(path, opts = {}) {
  const url = SUPABASE_URL + '/rest/v1/' + path
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  }
  if (opts.method === 'GET' || !opts.method) {
    headers.Prefer = 'count=exact'
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    })
    clearTimeout(timer)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`${res.status} ${text.slice(0, 200)}`)
    }
    if (opts.method === 'DELETE' || opts.method === 'PATCH' || res.status === 201) return true
    return await res.json()
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

function apiUrl(path) {
  return SUPABASE_URL + '/rest/v1/' + path
}

async function loadData() {
  $('#main-content').innerHTML = '<div class=loading><div class=spin></div>Chargement...</div>'
  try {
    const data = await api('ventes?order=id.desc')
    state.ventes = data || []
    render()
  } catch (e) {
    $('#main-content').innerHTML = `
      <div class=empty-state style=margin-top:40px>
        <div class=ico>⚠️</div>
        <p style=font-size:15px>Erreur de connexion</p>
        <p style=font-size:13px;color:#94a3b8;margin-top:6px>${escHtml(e.message)}</p>
        <button onclick="loadData()" style="margin-top:16px;padding:10px 24px;border:none;border-radius:10px;background:#6366f1;color:#fff;font-size:14px;font-weight:600;cursor:pointer">🔄 Réessayer</button>
      </div>`
  }
}

// === RENDU ===
function render() {
  const data = state.ventes
  const vendus = data.filter(d => d.statut === 'vendu')
  const stock = data.filter(d => d.statut === 'en_stock')
  const donnes = data.filter(d => d.statut === 'donne')

  const totalVentes = vendus.reduce((a, d) => a + (d.prix_vente || 0), 0)
  const totalAchats = vendus.reduce((a, d) => a + (d.prix_achat || 0), 0)
  const margeGlobale = totalVentes - totalAchats
  const txMarge = totalVentes ? ((margeGlobale / totalVentes) * 100).toFixed(0) : 0

  const d = new Date()
  const moisVendus = vendus.filter(x => {
    if (!x.date_vente) return false
    const [dd, mm, yyyy] = x.date_vente.split('/')
    return parseInt(mm) - 1 === d.getMonth() && parseInt(yyyy) === d.getFullYear()
  })
  const totalMois = moisVendus.reduce((a, x) => a + (x.prix_vente || 0), 0)
  const stockVal = stock.reduce((a, x) => a + (x.prix_achat || 0), 0)

  $('#main-content').innerHTML = `
    <div class=stats-grid>
      <div class="stat-card vert" onclick="showFilter('vendu')">
        <div class=chart>€</div>
        <div class=nb>${formatPrix(totalMois)}</div>
        <div class=lb>Vendu ce mois · ${moisVendus.length} art.</div>
      </div>
      <div class="stat-card bleu" onclick="showFilter('en_stock')">
        <div class=chart>📦</div>
        <div class=nb>${stock.length}</div>
        <div class=lb>En stock · ${formatPrix(stockVal)}</div>
      </div>
      <div class="stat-card violet" onclick="showFilter('vendu')">
        <div class=chart>📊</div>
        <div class=nb>${formatPrix(totalVentes)}</div>
        <div class=lb>Total ventes · ${vendus.length} art.</div>
      </div>
      <div class="stat-card orange">
        <div class=chart>📈</div>
        <div class=nb>${txMarge}%</div>
        <div class=lb>Marge · ${formatPrix(margeGlobale)}</div>
      </div>
    </div>
    ${stock.length ? sectionHtml('📦 En stock', stock) : ''}
    ${vendus.length ? sectionHtml('💰 Vendus', vendus) : ''}
    ${donnes.length ? sectionHtml('🎁 Donnés', donnes) : ''}
  `
}

function sectionHtml(title, items) {
  return `
    <div class=categories>
      <h2>${title}<span class=badge>${items.length}</span></h2>
      <div class=scroll-x>
        ${items.map(cardHtml).join('')}
      </div>
      <div style="text-align:right;padding:2px 0 8px">
        <button onclick="showFilter('${items[0].statut}')" style="font-size:12px;padding:6px 14px;border:none;border-radius:8px;cursor:pointer;background:#e2e8f0;color:#64748b">Voir tout →</button>
      </div>
    </div>
  `
}

function cardHtml(d) {
  const prix = d.statut === 'vendu' ? d.prix_vente : d.prix_achat
  return `
    <div class="card ${d.statut}" onclick="openDetail(${d.id})">
      <span class="badge-stat ${d.statut}">${d.statut.replace('_', ' ')}</span>
      <div class=nom>${escHtml(d.produit || 'Sans nom')}</div>
      <div class=infos>
        ${prix ? `<span class="prix ${d.marge < 0 ? 'rouge' : 'vert'}">${formatPrix(prix)}</span>` : ''}
        ${d.plateforme ? `<span class=plateforme>${escHtml(d.plateforme)}</span>` : ''}
        ${d.date_vente || d.date_achat ? `<span>📅 ${d.date_vente || d.date_achat}</span>` : ''}
      </div>
    </div>
  `
}

function renderListItem(d) {
  const c = d.statut === 'vendu' ? 'var(--vert)' : d.statut === 'en_stock' ? 'var(--bleu)' : 'var(--rouge)'
  return `
    <div class="search-card" style="border-left-color:${c};margin-bottom:6px" onclick="closeMaster();openDetail(${d.id})">
      <div class=info>
        <div class=nom>${escHtml(d.produit || '')}</div>
        <div class=det>${d.statut.replace('_',' ')}${d.plateforme ? ' · ' + escHtml(d.plateforme) : ''}${d.date_vente || d.date_achat ? ' · ' + (d.date_vente || d.date_achat) : ''}</div>
      </div>
      <div class=mnt>${d.statut === 'vendu' ? formatPrix(d.prix_vente) : d.prix_achat ? formatPrix(d.prix_achat) : '—'}</div>
    </div>
  `
}

function highlight(text, q) {
  if (!q || !text) return text || ''
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return text.replace(re, '<mark style="background:#fef08a;padding:0 2px;border-radius:2px">$1</mark>')
  } catch(_) { return text }
}

// === RECHERCHE ===
function openSearch() {
  $('#searchOverlay').classList.add('open')
  $('#searchInput').value = ''
  $('#searchResults').innerHTML = '<div class=empty-state><p>Tapez pour chercher</p></div>'
  setTimeout(() => $('#searchInput').focus(), 200)
}

function closeSearch() {
  $('#searchOverlay').classList.remove('open')
}

window.doSearch = function() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const q = $('#searchInput').value.trim().toLowerCase()
    if (!q) { $('#searchResults').innerHTML = '<div class=empty-state><p>Tapez pour chercher</p></div>'; return }
    const r = state.ventes.filter(d =>
      (d.produit || '').toLowerCase().includes(q) ||
      (d.fournisseur || '').toLowerCase().includes(q) ||
      (d.plateforme || '').toLowerCase().includes(q) ||
      (d.commentaire || '').toLowerCase().includes(q) ||
      (d.source || '').toLowerCase().includes(q)
    )
    if (!r.length) { $('#searchResults').innerHTML = '<div class=empty-state><div class=ico>🔍</div><p>Aucun résultat</p></div>'; return }
    $('#searchResults').innerHTML = r.map(d => {
      const c = d.statut === 'vendu' ? 'var(--vert)' : d.statut === 'en_stock' ? 'var(--bleu)' : 'var(--rouge)'
      return `
        <div class="search-card" style="border-left-color:${c}" onclick="closeSearch();openDetail(${d.id})">
          <div class=info>
            <div class=nom>${highlight(escHtml(d.produit || ''), q)}</div>
            <div class=det>${d.statut.replace('_',' ')}${d.plateforme ? ' · ' + escHtml(d.plateforme) : ''}${d.date_vente || d.date_achat ? ' · ' + (d.date_vente || d.date_achat) : ''}</div>
          </div>
          <div class=mnt style="color:${c}">${d.statut === 'vendu' ? formatPrix(d.prix_vente) : d.prix_achat ? formatPrix(d.prix_achat) : '—'}</div>
        </div>`
    }).join('')
  }, 150)
}

// === FILTRE ===
let _filterStatut
function showFilter(statut) {
  _filterStatut = statut
  const items = state.ventes.filter(d => d.statut === statut)
  openModal(`
    <div class=handle></div>
    <h2>${statut === 'vendu' ? '💰 Vendus' : statut === 'en_stock' ? '📦 En stock' : '🎁 Donnés'}</h2>
    <div style=margin-bottom:12px>
      <input id=filterInput type=text placeholder="Filtrer..." style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;outline:none" oninput="filterView()">
    </div>
    <div id=filterList>${items.map(renderListItem).join('')}</div>
  `)
  if (!items.length) $('#filterList').innerHTML = '<div class=empty-state><p>Aucun article</p></div>'
}

window.filterView = function() {
  const q = $('#filterInput').value.toLowerCase()
  const items = state.ventes.filter(d => d.statut === _filterStatut && (d.produit || '').toLowerCase().includes(q))
  $('#filterList').innerHTML = items.length ? items.map(renderListItem).join('') : '<div class=empty-state><p>Aucun résultat</p></div>'
}

// === MODAL ===
function openModal(html) {
  $('#overlay-master').classList.add('open')
  $('#modal-master').classList.add('open')
  $('#modal-master').innerHTML = html
}

function closeMaster() {
  $('#overlay-master').classList.remove('open')
  $('#modal-master').classList.remove('open')
  state.selectedItem = null
}

// === DÉTAIL ===
function openDetail(id) {
  const d = state.ventes.find(x => x.id === id)
  if (!d) return
  state.selectedItem = d
  const bg = d.statut === 'vendu' ? '#d1fae5' : d.statut === 'en_stock' ? '#dbeafe' : '#fee2e2'
  const fg = d.statut === 'vendu' ? '#065f46' : d.statut === 'en_stock' ? '#1e40af' : '#991b1b'

  let body = ''
  const addLine = (l, v) => { if (v != null && v !== '') body += `<div class=dc-line><span class=lb>${l}</span><span class=val>${v}</span></div>` }
  addLine('Prix achat', formatPrix(d.prix_achat))
  addLine('Prix vente', formatPrix(d.prix_vente))
  if (d.marge != null) addLine('Marge', `<span style="color:${d.marge < 0 ? 'var(--rouge)' : 'var(--vert)'}">${formatPrix(d.marge)}</span>`)
  addLine('Fournisseur', escHtml(d.fournisseur))
  addLine('Source', escHtml(d.source))
  addLine('Date achat', escHtml(d.date_achat))
  addLine('Date vente', escHtml(d.date_vente))
  addLine('Plateforme', escHtml(d.plateforme))
  addLine('Dépense pub', formatPrix(d.depense_pub))
  addLine('Statut pub', escHtml(d.statut_pub))
  addLine('Commentaire', escHtml(d.commentaire))

  openModal(`
    <div class=handle></div>
    <div class="detail-card" style="box-shadow:none;margin:0">
      <div class=dc-hd>
        <div class=dc-nom>${escHtml(d.produit || 'Sans nom')}</div>
        <span class=dc-stat style="background:${bg};color:${fg}">${d.statut.replace('_',' ')}</span>
      </div>
      <div class=dc-body>${body || '<p style="color:var(--text2)">Aucune information</p>'}</div>
      <div class=dc-actions>
        ${d.statut === 'vendu' ? '' : `<button class="btn-modif" onclick="closeMaster();showSellForm(${d.id})">💰 Vendre</button>`}
        <button class="btn-suppr" onclick="deleteItem(${d.id})">🗑 Supprimer</button>
      </div>
    </div>
  `)
}

// === FAB ===
function toggleFab() {
  $('#fab').classList.toggle('open')
  $('#fabMenu').classList.toggle('open')
}
function closeFab() { $('#fab').classList.remove('open'); $('#fabMenu').classList.remove('open') }

// === DISTINCT VALUES ===
function distinctVals(field) {
  const s = new Set()
  state.ventes.forEach(d => { if (d[field]) s.add(d[field]) })
  return [...s].sort()
}

function selectFieldHtml(name, label, placeholder) {
  const vals = distinctVals(name)
  const id = `sel-${name}`
  return `
    <label>${label}</label>
    <select id="${id}" onchange="toggleCustomField('${name}')" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:15px;outline:none;background:#f8fafc;margin-bottom:0">
      <option value="">-- ${placeholder} --</option>
      ${vals.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('')}
      <option value="__new__">➕ Ajouter nouveau...</option>
    </select>
    <input id="custom-${name}" name="${name}" placeholder="${placeholder}" style="display:none;margin-top:8px;width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:15px;outline:none;background:#f8fafc">
  `
}

window.toggleCustomField = function(name) {
  const sel = $(`#sel-${name}`)
  const inp = $(`#custom-${name}`)
  if (sel.value === '__new__') { inp.style.display = 'block'; inp.focus() }
  else inp.style.display = 'none'
}

function fieldValue(name) {
  const sel = $(`#sel-${name}`)
  const inp = $(`#custom-${name}`)
  if (sel.value === '__new__') return inp.value || null
  return sel.value || null
}

// === VENDRE (depuis FAB) ===
function showSellFormFromFab() {
  closeFab()
  const stock = state.ventes.filter(d => d.statut === 'en_stock')
  if (!stock.length) { toast('📦 Aucun article en stock'); return }
  openModal(`
    <div class=handle></div>
    <h2>💰 Vendre un article</h2>
    <p style="color:var(--text2);margin-bottom:12px">Sélectionnez l'article :</p>
    ${stock.map(d => `
      <div class="search-card" style="border-left-color:var(--bleu);margin-bottom:6px;cursor:pointer" onclick="closeMaster();showSellForm(${d.id})">
        <div class=info><div class=nom>${escHtml(d.produit || '')}</div><div class=det>Acheté ${formatPrix(d.prix_achat)}${d.date_achat ? ' le ' + d.date_achat : ''}</div></div>
        <div class=mnt>💰</div>
      </div>
    `).join('')}
    <div class=btn-group style=margin-top:12px><button class=btn-secondary onclick="closeMaster()" style="width:100%;padding:12px;border:none;border-radius:10px;background:#e2e8f0;color:#64748b;font-weight:600;font-size:14px;cursor:pointer">Annuler</button></div>
  `)
}

// === AJOUT ARTICLE ===
function showAddForm() {
  closeFab(); closeMaster()
  openModal(`
    <div class=handle></div>
    <h2>📥 Nouvel article</h2>
    <form onsubmit="addItem(event)">
      <label>Produit *</label>
      <input name=produit required placeholder="Nom du produit">
      <label>Prix d'achat (€)</label>
      <input name=prix_achat type=number step=0.01 placeholder="0.00">
      ${selectFieldHtml('fournisseur', 'Fournisseur', 'Sélectionner ou ajouter')}
      ${selectFieldHtml('source', 'Source', 'Sélectionner ou ajouter')}
      <label>Date d'achat</label>
      <input name=date_achat type=date value="${now()}">
      ${selectFieldHtml('plateforme', 'Plateforme', 'Sélectionner ou ajouter')}
      <label>Commentaire</label>
      <input name=commentaire placeholder="Optionnel">
      <div class=btn-group style=margin-top:20px>
        <button type=button class=btn-secondary onclick="closeMaster()">Annuler</button>
        <button type=submit class=btn-primary>Ajouter</button>
      </div>
    </form>
  `)
}

async function addItem(e) {
  e.preventDefault()
  const fd = new FormData(e.target)
  const data = {
    produit: fd.get('produit'), statut: 'en_stock',
    prix_achat: fd.get('prix_achat') ? parseFloat(fd.get('prix_achat')) : null,
    fournisseur: fieldValue('fournisseur'), source: fieldValue('source'),
    date_achat: fd.get('date_achat') ? fd.get('date_achat').split('-').reverse().join('/') : null,
    plateforme: fieldValue('plateforme'), commentaire: fd.get('commentaire') || null
  }
  try {
    await api('ventes', { method: 'POST', body: data })
    toast('✅ Article ajouté'); closeMaster(); loadData()
  } catch(e) { toast('❌ ' + e.message) }
}

// === FORMULAIRE VENTE ===
window.toggleCustomSellPlateforme = function() {
  const sel = $('#sel-sell-plateforme'); const inp = $('#custom-sell-plateforme')
  inp.style.display = sel.value === '__new__' ? 'block' : 'none'
  if (sel.value === '__new__') inp.focus()
}

function sellPlateformeValue() {
  const sel = $('#sel-sell-plateforme'); const inp = $('#custom-sell-plateforme')
  if (sel.value === '__new__') return inp.value || null
  return sel.value || null
}

function showSellForm(id) {
  const d = state.ventes.find(x => x.id === id)
  if (!d) return
  openModal(`
    <div class=handle></div>
    <h2>💰 Vendre : ${escHtml(d.produit || '')}</h2>
    <form onsubmit="sellItem(event, ${id})">
      <label>Prix de vente (€) *</label>
      <input name=prix_vente type=number step=0.01 required placeholder="0.00">
      <label>Date de vente</label>
      <input name=date_vente type=date value="${now()}">
      <label>Plateforme</label>
      <select id="sel-sell-plateforme" onchange="toggleCustomSellPlateforme()" style="width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:15px;outline:none;background:#f8fafc">
        <option value="">-- Sélectionner --</option>
        ${distinctVals('plateforme').map(v => `<option value="${escHtml(v)}"${v === d.plateforme ? ' selected' : ''}>${escHtml(v)}</option>`).join('')}
        <option value="__new__">➕ Autre...</option>
      </select>
      <input id="custom-sell-plateforme" name=plateforme placeholder="Nouvelle plateforme" style="display:none;margin-top:8px;width:100%;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:15px;outline:none;background:#f8fafc" value="${d.plateforme || ''}">
      <label>Dépense pub (€)</label>
      <input name=depense_pub type=number step=0.01 placeholder="0.00" value="0">
      <label>Statut pub</label>
      <input name=statut_pub placeholder="active, en_attente...">
      <label>Commentaire</label>
      <input name=commentaire placeholder="Optionnel">
      <div class=btn-group>
        <button type=button class=btn-secondary onclick="closeMaster()">Annuler</button>
        <button type=submit class=btn-primary>✅ Vendu</button>
      </div>
    </form>
  `)
}

async function sellItem(e, id) {
  e.preventDefault()
  const fd = new FormData(e.target)
  const d = state.ventes.find(x => x.id === id)
  const pv = parseFloat(fd.get('prix_vente'))
  const dv = fd.get('date_vente') ? fd.get('date_vente').split('-').reverse().join('/') : null
  const dp = fd.get('depense_pub') ? parseFloat(fd.get('depense_pub')) : 0
  const marge = (pv - (d.prix_achat || 0)) - dp

  try {
    await api(`ventes?id=eq.${id}`, {
      method: 'PATCH',
      body: {
        statut: 'vendu', prix_vente: pv, date_vente: dv, marge,
        plateforme: sellPlateformeValue() || d.plateforme || null,
        depense_pub: dp || null, statut_pub: fd.get('statut_pub') || null,
        commentaire: fd.get('commentaire') || d.commentaire || null
      }
    })
    toast('💰 Article vendu !'); closeMaster(); loadData()
  } catch(e) { toast('❌ ' + e.message) }
}

// === DONNÉ ===
function showDonneForm() {
  closeFab()
  const stock = state.ventes.filter(d => d.statut === 'en_stock')
  if (!stock.length) { toast('📦 Aucun article en stock'); return }
  openModal(`
    <div class=handle></div>
    <h2>🎁 Marquer comme donné</h2>
    <p style="color:var(--text2);margin-bottom:12px">Sélectionnez l'article :</p>
    ${stock.map(d => `
      <div class="search-card" style="border-left-color:var(--bleu);margin-bottom:6px;cursor:pointer" onclick="markDonne(${d.id})">
        <div class=info><div class=nom>${escHtml(d.produit || '')}</div><div class=det>Acheté ${formatPrix(d.prix_achat)}</div></div>
        <div class=mnt>🎁</div>
      </div>
    `).join('')}
    <div class=btn-group style=margin-top:12px><button class=btn-secondary onclick="closeMaster()" style="width:100%">Annuler</button></div>
  `)
}

async function markDonne(id) {
  const d = state.ventes.find(x => x.id === id)
  try {
    await api(`ventes?id=eq.${id}`, { method: 'PATCH', body: { statut: 'donne', prix_vente: 0, marge: -(d?.prix_achat || 0), date_vente: null, commentaire: d?.commentaire || 'donné' } })
    toast('🎁 Article donné'); closeMaster(); loadData()
  } catch(e) { toast('❌ ' + e.message) }
}

// === SUPPRIMER ===
async function deleteItem(id) {
  if (!confirm('Supprimer définitivement cet article ?')) return
  try {
    await api(`ventes?id=eq.${id}`, { method: 'DELETE' })
    toast('🗑 Article supprimé'); closeMaster(); loadData()
  } catch(e) { toast('❌ ' + e.message) }
}

// === EVENTS ===
function bindEvents() {
  $('#overlay-master').addEventListener('click', e => { if (e.target === $('#overlay-master')) closeMaster() })
  $('#searchOverlay').addEventListener('click', e => { if (e.target === $('#searchOverlay')) closeSearch() })
}
