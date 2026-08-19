/* Tagzi — label printing app
   Data is stored locally in the browser (localStorage), scoped per business name entered at login.
*/

const PALETTE = [
  'pal-0', 'pal-1', 'pal-2', 'pal-3', 'pal-4', 'pal-5'
];
let paletteCursor = 0;

const DEFAULT_CATEGORIES = [
  '0/1LB', '1/2LB', '2/3LB', '3/4LB', '5/7LB', '8/10LB', 'KILLSTAR', 'H SMALL', 'H MEDIUM', 'H LARGE'
].map((name, i) => ({ id: uid(), name, count: 0, color: PALETTE[i % PALETTE.length] }));

let state = {
  org: null,           // normalized email — the account's storage key
  businessName: null,  // friendly display name shown in the sidebar
  categories: [],
  history: [],     // today's prints: {id, catId, catName, num, time}
  pastDays: [],     // {id, label, dateISO, categories:[{name,count}], history:[...]}
  presets: []       // saved category lists: {id, name, createdISO, categories:[{name,color}]}
};

/* ---------------- utils ---------------- */
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

function colorFor(index) {
  return PALETTE[index % PALETTE.length];
}

function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function storageKeyFor(id) {
  return 'tagzi_data_' + (id || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function storageKey() {
  return storageKeyFor(state.org);
}

/* Resilient storage: real browsers use localStorage so data survives reloads.
   Some embedded/sandboxed preview frames block storage access entirely (it throws),
   so we fall back to an in-memory store for that session instead of crashing. */
const memoryFallback = {};
let storageBlocked = false;
const store = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      storageBlocked = true;
      return Object.prototype.hasOwnProperty.call(memoryFallback, key) ? memoryFallback[key] : null;
    }
  },
  setItem(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {
      storageBlocked = true;
      memoryFallback[key] = val;
    }
  }
};

function save() {
  store.setItem(storageKey(), JSON.stringify({
    businessName: state.businessName,
    categories: state.categories,
    history: state.history,
    pastDays: state.pastDays,
    presets: state.presets,
    dayKey: todayKey()
  }));
  store.setItem('tagzi_last_org', state.org || '');
}

function accountExists(email) {
  return !!store.getItem(storageKeyFor(email));
}

function load(email) {
  state.org = email;
  const raw = store.getItem(storageKey());
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state.businessName = parsed.businessName || null;
      // Use whatever category list was saved, even if it's empty (e.g. after "Delete All") —
      // only fall back to the starter defaults when there's no saved data at all (handled below).
      state.categories = Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_CATEGORIES.map(c => ({ ...c }));
      state.history = parsed.history || [];
      state.pastDays = parsed.pastDays || [];
      state.presets = parsed.presets || [];
      // if stored day differs from today, keep history as-is (user can Reset Day manually,
      // mirroring the original app's manual "Reset Day" control rather than auto-resetting).
    } catch (e) {
      state.businessName = null;
      state.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
      state.history = [];
      state.pastDays = [];
      state.presets = [];
    }
  } else {
    state.businessName = null;
    state.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
    state.history = [];
    state.pastDays = [];
    state.presets = [];
  }
  save();
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------------- custom confirm / prompt modals ----------------
   Native window.confirm()/prompt() are blocked or unreliable inside some
   embedded preview frames, so all confirmations and text entry use these
   in-app modals instead. */
const confirmModal = document.getElementById('confirmModal');
const confirmTitleEl = document.getElementById('confirmTitle');
const confirmMessageEl = document.getElementById('confirmMessage');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmCloseX = document.getElementById('confirmCloseX');

function showConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    confirmTitleEl.textContent = opts.title || 'Are you sure?';
    confirmMessageEl.textContent = message;
    confirmOkBtn.textContent = opts.okLabel || 'Confirm';
    confirmOkBtn.classList.toggle('danger-btn', !!opts.danger);
    confirmModal.hidden = false;

    function cleanup(result) {
      confirmModal.hidden = true;
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      confirmCloseX.removeEventListener('click', onCancel);
      confirmModal.removeEventListener('click', onOverlay);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlay(e) { if (e.target === confirmModal) onCancel(); }

    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
    confirmCloseX.addEventListener('click', onCancel);
    confirmModal.addEventListener('click', onOverlay);
  });
}

const promptModal = document.getElementById('promptModal');
const promptTitleEl = document.getElementById('promptTitle');
const promptLabelEl = document.getElementById('promptLabel');
const promptInputEl = document.getElementById('promptInput');
const promptOkBtn = document.getElementById('promptOkBtn');
const promptCancelBtn = document.getElementById('promptCancelBtn');
const promptCloseX = document.getElementById('promptCloseX');

function showPrompt(label, opts = {}) {
  return new Promise((resolve) => {
    promptTitleEl.textContent = opts.title || 'Name it';
    promptLabelEl.textContent = label;
    promptInputEl.value = opts.defaultValue || '';
    promptInputEl.placeholder = opts.placeholder || '';
    promptModal.hidden = false;
    setTimeout(() => { promptInputEl.focus(); promptInputEl.select(); }, 30);

    function cleanup(result) {
      promptModal.hidden = true;
      promptOkBtn.removeEventListener('click', onOk);
      promptCancelBtn.removeEventListener('click', onCancel);
      promptCloseX.removeEventListener('click', onCancel);
      promptModal.removeEventListener('click', onOverlay);
      promptInputEl.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onOk() { cleanup(promptInputEl.value.trim() || null); }
    function onCancel() { cleanup(null); }
    function onOverlay(e) { if (e.target === promptModal) onCancel(); }
    function onKeydown(e) {
      if (e.key === 'Enter') onOk();
      if (e.key === 'Escape') onCancel();
    }

    promptOkBtn.addEventListener('click', onOk);
    promptCancelBtn.addEventListener('click', onCancel);
    promptCloseX.addEventListener('click', onCancel);
    promptModal.addEventListener('click', onOverlay);
    promptInputEl.addEventListener('keydown', onKeydown);
  });
}

/* ---------------- login: email + one-time code ----------------
   No email service is connected yet, so the code is generated in the
   browser and shown on-screen ("test mode") instead of actually emailed.
   Wiring this to a real email provider (e.g. Resend/SendGrid) needs a small
   backend to keep the provider's API key secret — see README. */
const loginOverlay = document.getElementById('loginOverlay');

const loginStepEmail = document.getElementById('loginStepEmail');
const loginStepCode = document.getElementById('loginStepCode');

const loginEmailInput = document.getElementById('loginEmailInput');
const sendCodeBtn = document.getElementById('sendCodeBtn');
const emailError = document.getElementById('emailError');

const loginCodeInput = document.getElementById('loginCodeInput');
const verifyCodeBtn = document.getElementById('verifyCodeBtn');
const codeError = document.getElementById('codeError');
const codeSentTo = document.getElementById('codeSentTo');
const resendCodeBtn = document.getElementById('resendCodeBtn');
const changeEmailBtn = document.getElementById('changeEmailBtn');
const testModeBanner = document.getElementById('testModeBanner');

let pendingEmail = null;
let pendingCode = null;       // set only in local "test mode" fallback (no backend reachable)
let pendingToken = null;      // set only when the real /api/send-code backend responded
let pendingExpiresAt = null;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function showLoginStep(step) {
  [loginStepEmail, loginStepCode].forEach(s => s.hidden = (s !== step));
}

function enterTestModeCode(email) {
  pendingToken = null;
  pendingExpiresAt = null;
  pendingCode = generateCode();
  codeSentTo.textContent = email;
  testModeBanner.hidden = false;
  testModeBanner.innerHTML = `No email service is connected yet, so here's your code instead of a real email (test mode):<strong>${pendingCode}</strong>`;
  loginCodeInput.value = '';
  codeError.hidden = true;
  showLoginStep(loginStepCode);
  loginCodeInput.focus();
}

async function sendCode() {
  const email = loginEmailInput.value.trim();
  emailError.hidden = true;
  if (!isValidEmail(email)) {
    emailError.textContent = 'Enter a valid email address.';
    emailError.hidden = false;
    return;
  }

  pendingEmail = email.toLowerCase();
  sendCodeBtn.disabled = true;
  const originalLabel = sendCodeBtn.textContent;
  sendCodeBtn.textContent = 'Sending…';

  try {
    const resp = await fetch('/api/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pendingEmail })
    });

    if (resp.ok) {
      const data = await resp.json();
      pendingToken = data.token;
      pendingExpiresAt = data.expiresAt;
      pendingCode = null;
      codeSentTo.textContent = email;
      testModeBanner.hidden = true;
      loginCodeInput.value = '';
      codeError.hidden = true;
      showLoginStep(loginStepCode);
      loginCodeInput.focus();
      toast('Code sent to your email');
    } else {
      const errData = await resp.json().catch(() => ({}));
      if (resp.status === 400 && errData.error) {
        // The backend itself rejected the email address — surface that instead of
        // silently falling back, since retrying in test mode wouldn't help either.
        emailError.textContent = errData.error;
        emailError.hidden = false;
      } else {
        // Backend exists but isn't fully configured yet (or send failed) — fall
        // back to test mode so the flow keeps working while it's being set up.
        enterTestModeCode(email);
      }
    }
  } catch (err) {
    // No backend reachable at all (e.g. this static preview) — fall back to test mode.
    enterTestModeCode(email);
  }

  sendCodeBtn.disabled = false;
  sendCodeBtn.textContent = originalLabel;
}

sendCodeBtn.addEventListener('click', sendCode);
loginEmailInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendCode(); });

resendCodeBtn.addEventListener('click', async () => {
  if (!pendingEmail) return;
  await sendCode();
});

changeEmailBtn.addEventListener('click', () => {
  showLoginStep(loginStepEmail);
  loginEmailInput.focus();
});

async function verifyCode() {
  const entered = loginCodeInput.value.trim();
  if (!entered) {
    codeError.textContent = 'Enter the code we sent you.';
    codeError.hidden = false;
    return;
  }
  codeError.hidden = true;
  verifyCodeBtn.disabled = true;

  if (pendingToken) {
    // Real backend mode: ask the server to check the signed token.
    try {
      const resp = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code: entered, token: pendingToken, expiresAt: pendingExpiresAt })
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        codeError.textContent = data.error || 'Incorrect code. Please try again.';
        codeError.hidden = false;
        verifyCodeBtn.disabled = false;
        return;
      }
    } catch (err) {
      codeError.textContent = 'Could not reach the server. Please try again.';
      codeError.hidden = false;
      verifyCodeBtn.disabled = false;
      return;
    }
  } else {
    // Local test-mode fallback.
    if (entered !== pendingCode) {
      codeError.textContent = 'Incorrect code. Please try again.';
      codeError.hidden = false;
      verifyCodeBtn.disabled = false;
      return;
    }
  }

  verifyCodeBtn.disabled = false;
  completeLogin(pendingEmail);
}

verifyCodeBtn.addEventListener('click', verifyCode);
loginCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') verifyCode(); });

function completeLogin(email, businessName) {
  load(email);
  if (businessName) {
    state.businessName = businessName;
    save();
  }
  document.getElementById('orgName').textContent = state.businessName || state.org;
  loginOverlay.hidden = true;
  pendingEmail = null;
  pendingCode = null;
  pendingToken = null;
  pendingExpiresAt = null;
  renderAll();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  loginOverlay.hidden = false;
  pendingEmail = null;
  pendingCode = null;
  pendingToken = null;
  pendingExpiresAt = null;
  loginEmailInput.value = '';
  showLoginStep(loginStepEmail);
  loginEmailInput.focus();
});

/* ---------------- sidebar collapse ---------------- */
const sidebarEl = document.getElementById('sidebar');
const openSidebarBtn = document.getElementById('openSidebarBtn');

document.getElementById('collapseBtn').addEventListener('click', () => {
  sidebarEl.classList.add('collapsed');
  document.querySelector('.app').classList.add('sidebar-collapsed');
  openSidebarBtn.hidden = false;
});
openSidebarBtn.addEventListener('click', () => {
  sidebarEl.classList.remove('collapsed');
  document.querySelector('.app').classList.remove('sidebar-collapsed');
  openSidebarBtn.hidden = true;
});

/* ---------------- category grid ---------------- */
const grid = document.getElementById('categoryGrid');

function renderGrid() {
  grid.innerHTML = '';
  if (!state.categories.length) {
    grid.innerHTML = `<div class="grid-empty">No categories yet. Add one below, or load a saved list from the top right.</div>`;
    return;
  }
  state.categories.forEach(cat => {
    // A plain div (not <button>) avoids invalid nested-button markup, since this
    // card contains its own reset/delete/drag-handle buttons inside it.
    const card = document.createElement('div');
    card.className = 'cat-card ' + cat.color;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="cat-actions">
        <button class="reset-cat" title="Reset counter" data-id="${cat.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>
        </button>
        <button class="del-cat" title="Delete category" data-id="${cat.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="cat-title-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5M6 18h12M6 14h12M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z"/></svg>
        <span>${escapeHtml(cat.name)}</span>
      </div>
      <div class="cat-next">Next #${cat.count + 1}</div>
      <span class="drag-handle" title="Drag to reorder" data-id="${cat.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
      </span>
    `;
    card.dataset.id = cat.id;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.reset-cat') || e.target.closest('.del-cat') || e.target.closest('.drag-handle')) return;
      if (card.dataset.suppressClick === '1') { card.dataset.suppressClick = ''; return; }
      printLabel(cat);
    });
    card.addEventListener('keydown', (e) => {
      if (e.target !== card) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); printLabel(cat); }
    });
    card.querySelector('.reset-cat').addEventListener('click', (e) => {
      e.stopPropagation();
      cat.count = 0;
      save(); renderGrid();
      toast(`${cat.name} counter reset`);
    });
    card.querySelector('.del-cat').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirm(`Delete category "${cat.name}"? This cannot be undone.`, { title: 'Delete category', okLabel: 'Delete', danger: true });
      if (ok) {
        state.categories = state.categories.filter(c => c.id !== cat.id);
        save(); renderGrid();
      }
    });
    initDragHandle(card.querySelector('.drag-handle'), card);
    grid.appendChild(card);
  });
}

/* ---------------- drag to reorder ---------------- */
let dragCtx = null;

function initDragHandle(handle, card) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCtx = { fromId: card.dataset.id, moved: false };
    card.classList.add('dragging');
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragUp, { once: true });
  });
}

function onDragMove(e) {
  if (!dragCtx) return;
  dragCtx.moved = true;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const overCard = el && el.closest('.cat-card');
  grid.querySelectorAll('.cat-card').forEach(c => c.classList.remove('drag-over'));
  if (!overCard || overCard.dataset.id === dragCtx.fromId) return;
  overCard.classList.add('drag-over');

  const fromIndex = state.categories.findIndex(c => c.id === dragCtx.fromId);
  const toIndex = state.categories.findIndex(c => c.id === overCard.dataset.id);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

  const [moved] = state.categories.splice(fromIndex, 1);
  state.categories.splice(toIndex, 0, moved);
  renderGrid();
  // re-apply dragging visual state to the moved card after re-render
  const newCard = grid.querySelector(`.cat-card[data-id="${dragCtx.fromId}"]`);
  if (newCard) newCard.classList.add('dragging');
}

function onDragUp() {
  document.removeEventListener('pointermove', onDragMove);
  grid.querySelectorAll('.cat-card').forEach(c => c.classList.remove('dragging', 'drag-over'));
  if (dragCtx && dragCtx.moved) {
    save();
    // prevent the click that follows this pointerup from triggering a print
    const card = grid.querySelector(`.cat-card[data-id="${dragCtx.fromId}"]`);
    if (card) card.dataset.suppressClick = '1';
  }
  dragCtx = null;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* ---------------- add category ---------------- */
const newCategoryInput = document.getElementById('newCategoryInput');
document.getElementById('addCategoryBtn').addEventListener('click', addCategoryFromInput);
newCategoryInput.addEventListener('keydown', e => { if (e.key === 'Enter') addCategoryFromInput(); });

function addCategoryFromInput() {
  const name = newCategoryInput.value.trim();
  if (!name) return;
  if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    toast('That category already exists');
    return;
  }
  state.categories.push({ id: uid(), name, count: 0, color: colorFor(state.categories.length) });
  newCategoryInput.value = '';
  save(); renderGrid();
}

/* ---------------- saved lists (label presets) ---------------- */
const saveListBtn = document.getElementById('saveListBtn');
const savedListsBtn = document.getElementById('savedListsBtn');
const savedListsMenu = document.getElementById('savedListsMenu');
const savedListsItems = document.getElementById('savedListsItems');
const savedListsEmpty = document.getElementById('savedListsEmpty');

saveListBtn.addEventListener('click', async () => {
  if (!state.categories.length) {
    toast('Add some categories first');
    return;
  }
  const name = await showPrompt('Name the list', { title: 'Save List', placeholder: 'e.g. Weight Labels, Clothing Sizes' });
  if (!name) return;

  const existing = state.presets.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    const overwrite = await showConfirm(`A saved list named "${name}" already exists. Overwrite it?`, { title: 'Overwrite list', okLabel: 'Overwrite', danger: true });
    if (!overwrite) return;
  }

  const snapshot = {
    id: existing ? existing.id : uid(),
    name,
    createdISO: new Date().toISOString(),
    categories: state.categories.map(c => ({ name: c.name, color: c.color }))
  };
  state.presets = state.presets.filter(p => p.id !== snapshot.id);
  state.presets.unshift(snapshot);
  save();
  renderSavedLists();
  toast(`Saved "${name}"`);
});

savedListsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  savedListsMenu.hidden = !savedListsMenu.hidden;
});

document.addEventListener('click', (e) => {
  if (!savedListsMenu.hidden && !e.target.closest('.saved-lists-wrap')) {
    savedListsMenu.hidden = true;
  }
});

function renderSavedLists() {
  if (!state.presets.length) {
    savedListsEmpty.hidden = false;
    savedListsItems.innerHTML = '';
    return;
  }
  savedListsEmpty.hidden = true;
  savedListsItems.innerHTML = state.presets.map(p => `
    <div class="saved-list-item" data-id="${p.id}">
      <div>
        <div class="sl-name">${escapeHtml(p.name)}</div>
        <div class="sl-count">${p.categories.length} label${p.categories.length === 1 ? '' : 's'}</div>
      </div>
      <button class="sl-del" data-id="${p.id}" title="Delete this saved list">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
      </button>
    </div>
  `).join('');

  savedListsItems.querySelectorAll('.saved-list-item').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.sl-del')) return;
      loadPreset(row.dataset.id);
    });
  });
  savedListsItems.querySelectorAll('.sl-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const preset = state.presets.find(p => p.id === btn.dataset.id);
      if (!preset) return;
      const ok = await showConfirm(`Delete the saved list "${preset.name}"? This cannot be undone.`, { title: 'Delete saved list', okLabel: 'Delete', danger: true });
      if (ok) {
        state.presets = state.presets.filter(p => p.id !== preset.id);
        save();
        renderSavedLists();
      }
    });
  });
}

async function loadPreset(id) {
  const preset = state.presets.find(p => p.id === id);
  if (!preset) return;
  const ok = await showConfirm(`Load "${preset.name}"? This replaces your current category cards (today's history and counts stay saved).`, { title: 'Load saved list', okLabel: 'Load' });
  if (!ok) return;
  state.categories = preset.categories.map(c => ({ id: uid(), name: c.name, count: 0, color: c.color }));
  save();
  renderGrid();
  savedListsMenu.hidden = true;
  toast(`Loaded "${preset.name}"`);
}

/* ---------------- printing ---------------- */
const printArea = document.getElementById('printArea');

/* Figures out how big the category name / number text can be so the whole
   thing always fits on one line within the physical label, no matter how
   long the category name is. Measured with a hidden canvas (fast, and works
   even before the print area is visible) using the same 96px-per-inch ratio
   the browser uses when laying out an @page in print. */
function fitLabelFontSizes(catName, numText) {
  const PAGE_WIDTH_PX = 144;   // 1.5in label width at 96px/in
  const PAD_PX = 9.6;          // matches the 0.1in left/right padding in CSS
  const GAP_PX = 6.7;          // matches the 0.07in gap between name and number
  const MAX_CAT = 19, MIN_CAT = 7.5;
  const MAX_NUM = 23, MIN_NUM = 10;
  const SIZE_RATIO = MAX_CAT / MAX_NUM;

  const availablePx = PAGE_WIDTH_PX - PAD_PX * 2 - GAP_PX;
  const canvas = fitLabelFontSizes._canvas || (fitLabelFontSizes._canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  const upperName = catName.toUpperCase();

  function widthAt(catPx, numPx) {
    ctx.font = `800 ${catPx}px Arial`;
    // canvas measureText doesn't know about CSS letter-spacing, so add a small
    // estimate for it (matches the .02em letter-spacing set on .pl-cat)
    const catW = ctx.measureText(upperName).width + upperName.length * (catPx * 0.02);
    ctx.font = `800 ${numPx}px Arial`;
    const numW = ctx.measureText(numText).width;
    return catW + numW;
  }

  let catPx = MAX_CAT;
  let numPx = MAX_NUM;
  while (widthAt(catPx, numPx) > availablePx && catPx > MIN_CAT) {
    catPx -= 0.5;
    numPx = Math.max(MIN_NUM, catPx / SIZE_RATIO);
  }
  return { catPx, numPx };
}

function printLabel(cat, existingNum) {
  const num = existingNum != null ? existingNum : cat.count + 1;
  const numText = `#${num}`;
  const { catPx, numPx } = fitLabelFontSizes(cat.name, numText);
  printArea.innerHTML = `
    <div class="print-label">
      <div class="pl-cat" style="font-size:${catPx}px">${escapeHtml(cat.name)}</div>
      <div class="pl-num" style="font-size:${numPx}px">${escapeHtml(numText)}</div>
    </div>
  `;
  window.print();

  if (existingNum == null) {
    cat.count += 1;
    state.history.unshift({ id: uid(), catId: cat.id, catName: cat.name, num, time: new Date().toISOString() });
    save();
    renderGrid();
    renderHistory();
  }
}

/* ---------------- today's history ---------------- */
const historyPanel = document.getElementById('historyPanel');
const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');

toggleHistoryBtn.addEventListener('click', () => {
  historyPanel.hidden = !historyPanel.hidden;
  toggleHistoryBtn.textContent = historyPanel.hidden ? "Show today's history ▾" : "Hide today's history ▴";
});

function renderHistory() {
  if (!state.history.length) {
    historyPanel.innerHTML = `<div class="history-empty">No labels printed yet today.</div>`;
    return;
  }
  historyPanel.innerHTML = state.history.map(h => {
    const cat = state.categories.find(c => c.id === h.catId);
    const time = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="history-row">
        <div class="history-left">
          <span class="history-swatch" style="background:var(--indigo)"></span>
          <span><strong>${escapeHtml(h.catName)} #${h.num}</strong> · ${time}</span>
        </div>
        <button data-histid="${h.id}" class="reprint-btn">Reprint</button>
      </div>
    `;
  }).join('');
  historyPanel.querySelectorAll('.reprint-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = state.history.find(x => x.id === btn.dataset.histid);
      const cat = state.categories.find(c => c.id === h.catId) || { name: h.catName };
      printLabel(cat, h.num);
      toast('Reprinted label');
    });
  });
}

/* ---------------- reset day ---------------- */
document.getElementById('resetDayBtn').addEventListener('click', async () => {
  if (!state.history.length && state.categories.every(c => c.count === 0)) {
    toast('Nothing to reset yet');
    return;
  }
  const ok = await showConfirm('Reset the day? Today\'s counts will be archived to Past Days and all counters will go back to 0.', { title: 'Reset Day', okLabel: 'Reset Day' });
  if (!ok) return;

  state.pastDays.unshift({
    id: uid(),
    label: todayLabel(),
    dateISO: new Date().toISOString(),
    categories: state.categories.map(c => ({ name: c.name, count: c.count })),
    history: state.history
  });

  state.categories.forEach(c => c.count = 0);
  state.history = [];
  save();
  renderGrid();
  renderHistory();
  renderPastDays();
  toast('Day reset and archived');
});

/* ---------------- delete all categories ---------------- */
document.getElementById('deleteAllBtn').addEventListener('click', async () => {
  if (!state.categories.length) {
    toast('No categories to delete');
    return;
  }
  const ok = await showConfirm('Delete all categories? This cannot be undone.', { title: 'Delete All', okLabel: 'Delete All', danger: true });
  if (!ok) return;
  state.categories = [];
  save();
  renderGrid();
  toast('All categories deleted');
});

/* ---------------- past days ---------------- */
const pastDaysList = document.getElementById('pastDaysList');

function renderPastDays() {
  if (!state.pastDays.length) {
    pastDaysList.innerHTML = `<div class="empty-note">No past days yet.</div>`;
    return;
  }
  pastDaysList.innerHTML = state.pastDays.map(d => `
    <div class="past-day-item" data-id="${d.id}">
      <span>${escapeHtml(d.label)}</span>
      <button class="del-day" data-id="${d.id}" title="Delete this day">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>
      </button>
    </div>
  `).join('');

  pastDaysList.querySelectorAll('.past-day-item').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.del-day')) return;
      openPastDay(row.dataset.id);
    });
  });
  pastDaysList.querySelectorAll('.del-day').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const day = state.pastDays.find(d => d.id === btn.dataset.id);
      const ok = await showConfirm(`Permanently delete "${day.label}"? This cannot be undone.`, { title: 'Delete day', okLabel: 'Delete', danger: true });
      if (ok) {
        state.pastDays = state.pastDays.filter(d => d.id !== btn.dataset.id);
        save(); renderPastDays();
      }
    });
  });
}

const pastDayModal = document.getElementById('pastDayModal');
let currentPastDay = null;

function openPastDay(id) {
  currentPastDay = state.pastDays.find(d => d.id === id);
  if (!currentPastDay) return;
  document.getElementById('pastDayTitle').textContent = currentPastDay.label;
  document.getElementById('pdSummary').innerHTML = currentPastDay.categories
    .filter(c => c.count > 0)
    .map(c => `<div class="pd-chip">${escapeHtml(c.name)}: ${c.count}</div>`)
    .join('') || `<div class="pd-chip">No labels printed this day</div>`;

  document.getElementById('pdHistoryList').innerHTML = currentPastDay.history.length
    ? currentPastDay.history.map(h => {
        const time = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<div class="history-row">
          <div class="history-left"><strong>${escapeHtml(h.catName)} #${h.num}</strong> · ${time}</div>
          <button data-num="${h.num}" data-name="${escapeHtml(h.catName)}" class="pd-reprint-btn">Reprint</button>
        </div>`;
      }).join('')
    : `<div class="history-empty">No labels in this day.</div>`;

  document.getElementById('pdHistoryList').querySelectorAll('.pd-reprint-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      printLabel({ name: btn.dataset.name }, Number(btn.dataset.num));
      toast('Reprinted label');
    });
  });

  pastDayModal.hidden = false;
}

document.getElementById('closePastDay').addEventListener('click', () => pastDayModal.hidden = true);
document.getElementById('pdCloseBtn').addEventListener('click', () => pastDayModal.hidden = true);

document.getElementById('pdDeleteDay').addEventListener('click', async () => {
  if (!currentPastDay) return;
  const ok = await showConfirm(`Permanently delete "${currentPastDay.label}"? This cannot be undone.`, { title: 'Delete day', okLabel: 'Delete', danger: true });
  if (ok) {
    state.pastDays = state.pastDays.filter(d => d.id !== currentPastDay.id);
    save(); renderPastDays();
    pastDayModal.hidden = true;
  }
});

document.getElementById('pdExportHistory').addEventListener('click', () => {
  if (!currentPastDay) return;
  const rows = [['Category', 'Number', 'Time']].concat(
    currentPastDay.history.map(h => [h.catName, h.num, new Date(h.time).toLocaleString()])
  );
  downloadCsv(rows, `tagzi-${currentPastDay.label.replace(/[^a-z0-9]+/gi, '-')}-history.csv`);
});

document.getElementById('pdExportTotals').addEventListener('click', () => {
  if (!currentPastDay) return;
  const rows = [['Category', 'Total Printed']].concat(
    currentPastDay.categories.map(c => [c.name, c.count])
  );
  downloadCsv(rows, `tagzi-${currentPastDay.label.replace(/[^a-z0-9]+/gi, '-')}-totals.csv`);
});

function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- how to use modal ---------------- */
const howToModal = document.getElementById('howToModal');
document.getElementById('howToUseBtn').addEventListener('click', () => howToModal.hidden = false);
document.getElementById('closeHowTo').addEventListener('click', () => howToModal.hidden = true);
document.getElementById('gotItBtn').addEventListener('click', () => howToModal.hidden = true);

[howToModal, pastDayModal].forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
});

/* ---------------- init ---------------- */
document.getElementById('todayDate').textContent = todayLabel();

function renderAll() {
  renderGrid();
  renderHistory();
  renderPastDays();
  renderSavedLists();
}

// Stay logged in on this browser/device across reloads, skipping the code
// step, the same way the previous business-name login worked.
const lastOrg = store.getItem('tagzi_last_org');
if (lastOrg && accountExists(lastOrg)) {
  completeLogin(lastOrg);
} else {
  loginEmailInput.focus();
}
