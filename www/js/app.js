/* ==========================================================================
   Note Walt - iOS Universal Mobile Application Logic
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. Mobile API & Storage Adapter
// ---------------------------------------------------------------------------
async function api(endpoint, method = 'GET', body = null) {
  // Mobile client-side offline database
  if (window.mobileDB && window.mobileDB.db) {
    return handleMobileApi(endpoint, method, body);
  }

  // Fallback to desktop local HTTP server if present
  const API_BASE = 'http://localhost:5274/api';
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  } catch (e) {
    return handleMobileApi(endpoint, method, body);
  }
}

async function handleMobileApi(endpoint, method, body) {
  const db = window.mobileDB;

  // Notes
  if (endpoint.startsWith('/notes')) {
    if (method === 'GET') {
      const all = endpoint.includes('all=true');
      return await db.getNotes(all);
    }
    if (method === 'POST') return await db.createNote(body);
    const id = parseInt(endpoint.split('/')[2], 10);
    if (method === 'PUT') return await db.updateNote(id, body);
    if (method === 'DELETE') return await db.deleteNote(id);
  }

  // Cards
  if (endpoint.startsWith('/cards')) {
    if (method === 'GET') return await db.getCards();
    if (method === 'POST') return await db.createCard(body);
    const parts = endpoint.split('/');
    const id = parseInt(parts[2], 10);
    if (parts[3] === 'pin') return await db.togglePinCard(id);
    if (method === 'PUT') return await db.updateCard(id, body);
    if (method === 'DELETE') return await db.deleteCard(id);
  }

  // Vehicle Expenses
  if (endpoint.startsWith('/finance')) {
    if (method === 'GET') return await db.getExpenses();
    if (method === 'POST') return await db.createExpense(body);
    const id = parseInt(endpoint.split('/')[2], 10);
    if (method === 'DELETE') return await db.deleteExpense(id);
  }

  // EMI Loans
  if (endpoint.startsWith('/emis')) {
    if (method === 'GET') return await db.getEmis();
    if (method === 'POST') return await db.createEmi(body);
    const parts = endpoint.split('/');
    const id = parseInt(parts[2], 10);
    if (parts[3] === 'pay') return await db.payEmi(id);
    if (method === 'DELETE') return await db.deleteEmi(id);
  }

  // Passwords
  if (endpoint.startsWith('/passwords')) {
    if (method === 'GET') return await db.getPasswords();
    if (method === 'POST') return await db.createPassword(body);
    const id = parseInt(endpoint.split('/')[2], 10);
    if (method === 'DELETE') return await db.deletePassword(id);
  }

  // Vehicle Settings
  if (endpoint.startsWith('/vehicle/settings')) {
    if (method === 'POST' || method === 'PUT') return await db.updateVehicleSettings(body);
    return await db.getVehicleSettings();
  }

  // Safe
  if (endpoint === '/safe/status') {
    const pin = await db.getSetting('safe_pin');
    return { is_setup: Boolean(pin), is_unlocked: db.safeUnlocked };
  }
  if (endpoint === '/safe/unlock') {
    const ok = await db.verifySafePin(body.pin);
    if (!ok) throw new Error('Incorrect Safe PIN');
    return { message: 'Unlocked' };
  }
  if (endpoint === '/safe/setup') {
    await db.setupSafePin(body.pin);
    return { message: 'PIN saved' };
  }
  if (endpoint === '/safe/lock') {
    db.safeUnlocked = false;
    return { message: 'Locked' };
  }

  // Labels
  if (endpoint === '/labels') {
    return [{ id: 1, name: 'Personal' }, { id: 2, name: 'Work' }, { id: 3, name: 'Finance' }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// 2. Global State
// ---------------------------------------------------------------------------
const state = {
  currentView: 'notes',
  currentSection: 'notes',
  currentCardMode: 'stacked',
  currentCardCategory: 'All',
  currentInfoTab: 'vehicle',
  sortMode: 'updated-desc',

  notes: [],
  cards: [],
  expenses: [],
  emis: [],
  passwords: [],
  labels: [{ id: 1, name: 'Personal' }, { id: 2, name: 'Work' }, { id: 3, name: 'Finance' }],
  vehicleSettings: {
    vehicleType: 'Car',
    fuelType: 'Petrol',
    petrolPrice: 101.50,
    dieselPrice: 89.60,
    cngPrice: 76.50
  },

  editingNote: null,
  selectedColor: '#FFFFFF',
  selectedTextColor: '#292D32',
  selectedLabels: [],
  isChecklistMode: false,
  checklistItems: [],
  attachments: [],
  copiedStyle: null,

  editingCard: null,
  selectedCardTheme: 0,
  selectedCardTextColor: 0,
  selectedCardFont: 0,

  editingExpense: null,
  editingEmi: null,
  editingPassword: null,

  darkMode: false,
  accentColor: 'ocean',
  safeUnlocked: false,
  searchQuery: '',
  filterLabelId: null,

  clipboardTimer: null,
  clipboardInterval: null,
  clipboardRemaining: 30
};

// ---------------------------------------------------------------------------
// 3. 100 Color Palettes & 21 Themes Metadata
// ---------------------------------------------------------------------------
const PALETTES = {
  backgrounds: {
    'ultra-light': [
      { name: 'Pure White', hex: '#FFFFFF' }, { name: 'Snow', hex: '#FAFAFA' },
      { name: 'Ivory', hex: '#F7F5F0' }, { name: 'Warm White', hex: '#F8F6F2' },
      { name: 'Cloud', hex: '#F1F3F5' }, { name: 'Pearl', hex: '#F2F0EB' },
      { name: 'Soft Silver', hex: '#EDEFF2' }, { name: 'Mist', hex: '#E9EEF2' },
      { name: 'Pale Blue', hex: '#E5EFF7' }, { name: 'Pale Lavender', hex: '#ECE7F5' },
      { name: 'Pale Pink', hex: '#F7E8E5' }, { name: 'Pale Green', hex: '#E5F1E8' },
      { name: 'Pale Yellow', hex: '#F7EFD6' }, { name: 'Pale Teal', hex: '#DDF1EF' }
    ],
    'muted': [
      { name: 'Light Gray', hex: '#DDE1E5' }, { name: 'Silver Gray', hex: '#C9CDD2' },
      { name: 'Cool Gray', hex: '#CBD2D9' }, { name: 'Dusty Blue', hex: '#C5D6E5' },
      { name: 'Soft Sky', hex: '#B8D5E8' }, { name: 'Muted Teal', hex: '#B5D8D3' },
      { name: 'Sage', hex: '#B9CEBC' }, { name: 'Mint', hex: '#C0DFD1' },
      { name: 'Lavender', hex: '#CFC4E3' }, { name: 'Dusty Rose', hex: '#E3BFC6' },
      { name: 'Peach', hex: '#F0CCB9' }, { name: 'Butter Yellow', hex: '#EEDDAA' },
      { name: 'Sand', hex: '#E5D6BD' }, { name: 'Taupe', hex: '#C8B9A8' }
    ],
    'medium': [
      { name: 'Steel Blue', hex: '#7896B2' }, { name: 'Denim', hex: '#597C9D' },
      { name: 'Slate Blue', hex: '#657A96' }, { name: 'Muted Indigo', hex: '#626E9B' },
      { name: 'Dusty Purple', hex: '#82739D' }, { name: 'Mauve', hex: '#A17D99' },
      { name: 'Dusty Pink', hex: '#B77F91' }, { name: 'Terracotta', hex: '#B97865' },
      { name: 'Copper', hex: '#A66F50' }, { name: 'Olive', hex: '#858653' },
      { name: 'Forest Sage', hex: '#647C69' }, { name: 'Teal', hex: '#43877F' },
      { name: 'Deep Mint', hex: '#5C9A84' }, { name: 'Graphite Gray', hex: '#73777D' }
    ],
    'dark': [
      { name: 'Dark Slate', hex: '#303740' }, { name: 'Charcoal', hex: '#292D32' },
      { name: 'Graphite', hex: '#252A30' }, { name: 'Gunmetal', hex: '#292F36' },
      { name: 'Deep Blue', hex: '#1D3553' }, { name: 'Navy', hex: '#172B45' },
      { name: 'Midnight Blue', hex: '#142238' }, { name: 'Dark Indigo', hex: '#292B50' },
      { name: 'Deep Purple', hex: '#352B48' }, { name: 'Aubergine', hex: '#382735' },
      { name: 'Burgundy', hex: '#482A34' }, { name: 'Dark Rose', hex: '#4A3039' },
      { name: 'Forest Green', hex: '#243B30' }, { name: 'Dark Olive', hex: '#3A3B27' },
      { name: 'Deep Teal', hex: '#193C3A' }, { name: 'Dark Brown', hex: '#3D3028' }
    ],
    'amoled': [
      { name: 'Near Black', hex: '#111315' }, { name: 'Deep Charcoal', hex: '#17191C' },
      { name: 'Obsidian', hex: '#121417' }, { name: 'Midnight', hex: '#10151D' },
      { name: 'Black Blue', hex: '#0D1623' }, { name: 'Deep Navy', hex: '#0B1422' },
      { name: 'Dark Ocean', hex: '#091B26' }, { name: 'Deep Emerald', hex: '#0D211B' },
      { name: 'Dark Forest', hex: '#102019' }, { name: 'Deep Purple Black', hex: '#191323' },
      { name: 'Dark Wine', hex: '#21131A' }, { name: 'Espresso', hex: '#201915' },
      { name: 'True Black', hex: '#000000' }
    ]
  },
  text: {
    'dark-text': [
      { name: 'Soft Black', hex: '#17191C' }, { name: 'Charcoal', hex: '#292D32' },
      { name: 'Dark Gray', hex: '#383D43' }, { name: 'Graphite', hex: '#343A40' },
      { name: 'Slate', hex: '#3F4A56' }, { name: 'Navy', hex: '#243B53' },
      { name: 'Deep Blue', hex: '#1D3553' }, { name: 'Dark Teal', hex: '#214B49' }
    ],
    'light-text': [
      { name: 'Pure White', hex: '#FFFFFF' }, { name: 'Soft White', hex: '#F7F7F5' },
      { name: 'Warm White', hex: '#E6E1D9' }, { name: 'Ivory', hex: '#F0EBDD' },
      { name: 'Light Gray', hex: '#D9DDE2' }, { name: 'Silver', hex: '#C5CAD1' }
    ],
    'accent-text': [
      { name: 'Blue', hex: '#456B91' }, { name: 'Teal', hex: '#397D78' },
      { name: 'Sage', hex: '#5D8066' }, { name: 'Purple', hex: '#78649A' },
      { name: 'Pink', hex: '#B66F87' }, { name: 'Amber', hex: '#9A6A24' }
    ]
  }
};

const CARD_THEMES = [
  { id: 0, name: 'Midnight Obsidian', gradient: 'linear-gradient(135deg, #0F172A, #1E293B, #334155)' },
  { id: 1, name: 'Royal Amethyst', gradient: 'linear-gradient(135deg, #2E1065, #581C87, #7E22CE)' },
  { id: 2, name: 'Emerald Luxury', gradient: 'linear-gradient(135deg, #064E3B, #047857, #10B981)' },
  { id: 3, name: 'Golden Glamour', gradient: 'linear-gradient(135deg, #78350F, #D97706, #F59E0B)' },
  { id: 4, name: 'Cyberpunk Neon', gradient: 'linear-gradient(135deg, #831843, #C026D3, #4F46E5)' },
  { id: 5, name: 'Platinum Silver', gradient: 'linear-gradient(135deg, #334155, #64748B, #94A3B8)' },
  { id: 6, name: 'Sunset Horizon', gradient: 'linear-gradient(135deg, #7C2D12, #C2410C, #EA580C)' },
  { id: 7, name: 'Ocean Deep', gradient: 'linear-gradient(135deg, #0C4A6E, #0284C7, #38BDF8)' },
  { id: 8, name: 'Rose Gold', gradient: 'linear-gradient(135deg, #881337, #E11D48, #FB7185)' },
  { id: 9, name: 'Titanium Dark', gradient: 'linear-gradient(135deg, #18181B, #27272A, #52525B)' },
  { id: 10, name: 'Solar Flare', gradient: 'linear-gradient(135deg, #9A3412, #EA580C, #F97316)' },
  { id: 11, name: 'Mystic Twilight', gradient: 'linear-gradient(135deg, #1E1B4B, #3730A3, #6366F1)' },
  { id: 12, name: 'Carbon Fiber', gradient: 'linear-gradient(135deg, #09090B, #18181B, #27272A)' },
  { id: 13, name: 'Crimson Velvet', gradient: 'linear-gradient(135deg, #450A0A, #991B1B, #DC2626)' },
  { id: 14, name: 'Electric Blue', gradient: 'linear-gradient(135deg, #172554, #1D4ED8, #3B82F6)' },
  { id: 15, name: 'Arctic Ice', gradient: 'linear-gradient(135deg, #164E63, #0891B2, #06B6D4)' },
  { id: 16, name: 'Sahara Amber', gradient: 'linear-gradient(135deg, #713F12, #CA8A04, #EAB308)' },
  { id: 17, name: 'Metallic Bronze', gradient: 'linear-gradient(135deg, #451A03, #B45309, #D97706)' },
  { id: 18, name: 'Neon Mint', gradient: 'linear-gradient(135deg, #022C22, #0D9488, #14B8A6)' },
  { id: 19, name: 'Opal Sparkle', gradient: 'linear-gradient(135deg, #311B92, #6200EA, #B388FF)' },
  { id: 20, name: 'Deep Space', gradient: 'linear-gradient(135deg, #030712, #111827, #1F2937)' }
];

// ---------------------------------------------------------------------------
// 4. Initialization
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

document.addEventListener('DOMContentLoaded', async () => {
  if (window.mobileDB) {
    await window.mobileDB.init();
  }
  initApp();
});

async function initApp() {
  loadPreferences();
  setupEventListeners();
  renderColorSwatches();
  renderCardThemePickers();

  await Promise.allSettled([
    loadNotes(),
    loadCards(),
    loadVehicleSettings(),
    loadExpenses(),
    loadEmis(),
    loadPasswords(),
    checkSafeStatus()
  ]);
}

function loadPreferences() {
  const dark = localStorage.getItem('notewalt_darkmode');
  if (dark === 'true') {
    state.darkMode = true;
    document.body.classList.add('dark-mode');
    if ($('#dark-mode-toggle')) $('#dark-mode-toggle').checked = true;
  }
  const accent = localStorage.getItem('notewalt_accent') || 'ocean';
  setAccentColor(accent);

  const cardMode = localStorage.getItem('notewalt_card_mode') || 'stacked';
  setCardViewMode(cardMode);
}

function setAccentColor(accent) {
  state.accentColor = accent;
  document.body.setAttribute('data-accent', accent);
  localStorage.setItem('notewalt_accent', accent);
  $$('.accent-swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.accent === accent);
  });
}

function setCardViewMode(mode) {
  state.currentCardMode = mode;
  localStorage.setItem('notewalt_card_mode', mode);
  $$('.view-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cardMode === mode);
  });
  const container = $('#cards-container');
  if (container) {
    container.className = `cards-display-container view-${mode}`;
  }
  renderCards();
}

function triggerHaptic() {
  if (window.Capacitor?.Plugins?.Haptics) {
    window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
  } else if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

// ---------------------------------------------------------------------------
// 5. Events Setup
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Mobile Drawer Toggle
  $('#menu-toggle')?.addEventListener('click', () => {
    triggerHaptic();
    document.body.classList.add('sidebar-open');
  });

  $('#sidebar-close-btn')?.addEventListener('click', () => {
    document.body.classList.remove('sidebar-open');
  });

  $('#sidebar-overlay')?.addEventListener('click', () => {
    document.body.classList.remove('sidebar-open');
  });

  // Sidebar Menu Items
  $$('.sidebar-menu li[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      triggerHaptic();
      const view = item.dataset.view;
      if (view === 'labels') {
        item.closest('.label-section').classList.toggle('open');
        return;
      }
      document.body.classList.remove('sidebar-open');
      switchView(view);
    });
  });

  // Bottom Nav Items
  $$('.bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      triggerHaptic();
      switchSection(item.dataset.section);
    });
  });

  // Global FAB
  $('#fab')?.addEventListener('click', () => {
    triggerHaptic();
    if (state.currentSection === 'notes') openNoteEditor();
    else if (state.currentSection === 'cards') openCardEditor();
    else if (state.currentSection === 'info') {
      if (state.currentInfoTab === 'vehicle') openExpenseModal();
      else if (state.currentInfoTab === 'emi') openEmiModal();
      else if (state.currentInfoTab === 'passwords') openPasswordModal();
    }
  });

  $('#empty-add-note-btn')?.addEventListener('click', () => openNoteEditor());
  $('#cards-empty-add-btn')?.addEventListener('click', () => openCardEditor());
  $('#add-card-btn')?.addEventListener('click', () => openCardEditor());

  // Search
  $('#search-input')?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    $('#search-clear').style.display = state.searchQuery ? 'inline-flex' : 'none';
    if (state.currentSection === 'notes') renderNotes();
    else if (state.currentSection === 'cards') renderCards();
    else if (state.currentSection === 'info' && state.currentInfoTab === 'passwords') renderPasswords();
  });

  $('#search-clear')?.addEventListener('click', () => {
    $('#search-input').value = '';
    state.searchQuery = '';
    $('#search-clear').style.display = 'none';
    renderNotes();
    renderCards();
    renderPasswords();
  });

  // Sort Menu
  $('#sort-toggle-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#sort-dropdown')?.classList.toggle('show');
  });

  $$('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      $$('.sort-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      state.sortMode = opt.dataset.sort;
      $('#sort-dropdown')?.classList.remove('show');
      renderNotes();
    });
  });

  document.addEventListener('click', () => {
    $('#sort-dropdown')?.classList.remove('show');
  });

  $('#view-toggle')?.addEventListener('click', () => {
    triggerHaptic();
    document.body.classList.toggle('list-mode');
    const isList = document.body.classList.contains('list-mode');
    $('#view-toggle i').textContent = isList ? 'view_agenda' : 'view_module';
  });

  // Card View Mode Switcher
  $$('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerHaptic();
      setCardViewMode(btn.dataset.cardMode);
    });
  });

  // Card Category Filter Chips
  $$('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      triggerHaptic();
      $$('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.currentCardCategory = chip.dataset.category;
      renderCards();
    });
  });

  // Info Sub-Tabs
  $$('.info-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      triggerHaptic();
      $$('.info-tab').forEach(t => t.classList.remove('active'));
      $$('.info-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      state.currentInfoTab = tabName;
      $(`#${tabName}-tab`)?.classList.add('active');
    });
  });

  // Vehicle
  $('#vehicle-setup-btn')?.addEventListener('click', openVehicleSetupModal);
  $('#vehicle-setup-close')?.addEventListener('click', () => closeModal('#vehicle-setup-modal'));
  $('#vehicle-setup-cancel-btn')?.addEventListener('click', () => closeModal('#vehicle-setup-modal'));
  $('#vehicle-setup-save-btn')?.addEventListener('click', saveVehicleSetup);

  $('#add-expense-btn')?.addEventListener('click', () => openExpenseModal());
  $('#finance-cancel-btn')?.addEventListener('click', () => closeModal('#finance-modal'));
  $('#finance-save-btn')?.addEventListener('click', saveExpense);

  $('#finance-type')?.addEventListener('change', (e) => {
    $('#fuel-calculation-group').style.display = e.target.value === 'Fuel' ? 'grid' : 'none';
  });

  $('#finance-amount')?.addEventListener('input', calculateFuelVolume);
  $('#finance-fuel-type')?.addEventListener('change', calculateFuelVolume);

  $$('.expense-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      triggerHaptic();
      $$('.expense-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderExpenses(chip.dataset.cat);
    });
  });

  // EMI
  $('#add-emi-btn')?.addEventListener('click', () => openEmiModal());
  $('#emi-modal-close')?.addEventListener('click', () => closeModal('#emi-modal'));
  $('#emi-cancel-btn')?.addEventListener('click', () => closeModal('#emi-modal'));
  $('#emi-save-btn')?.addEventListener('click', saveEmi);

  // Password Manager & 18-Char Generator
  $('#add-password-btn')?.addEventListener('click', () => openPasswordModal());
  $('#password-cancel-btn')?.addEventListener('click', () => closeModal('#password-modal'));
  $('#password-save-btn')?.addEventListener('click', savePassword);
  $('#pw-generate-btn')?.addEventListener('click', generateSecurePassword);
  $('#pw-toggle-vis')?.addEventListener('click', () => {
    const inp = $('#pw-password');
    const isPw = inp.type === 'password';
    inp.type = isPw ? 'text' : 'password';
    $('#pw-toggle-vis i').textContent = isPw ? 'visibility_off' : 'visibility';
  });

  // Card Editor
  $('#card-modal-close')?.addEventListener('click', () => closeModal('#card-editor-modal'));
  $('#card-cancel-btn')?.addEventListener('click', () => closeModal('#card-editor-modal'));
  $('#card-save-btn')?.addEventListener('click', saveWalletCard);

  ['card-issuer-input', 'card-holder-input', 'card-number-input', 'card-expiry-input'].forEach(id => {
    $(`#${id}`)?.addEventListener('input', updateLiveCardPreview);
  });

  $('#card-font-select')?.addEventListener('change', (e) => {
    state.selectedCardFont = parseInt(e.target.value, 10);
    updateLiveCardPreview();
  });

  $$('.text-choice').forEach(tc => {
    tc.addEventListener('click', () => {
      triggerHaptic();
      $$('.text-choice').forEach(t => t.classList.remove('active'));
      tc.classList.add('active');
      state.selectedCardTextColor = parseInt(tc.dataset.index, 10);
      updateLiveCardPreview();
    });
  });

  $('#card-detail-close')?.addEventListener('click', () => closeModal('#card-detail-modal'));
  $('#card-detail-done')?.addEventListener('click', () => closeModal('#card-detail-modal'));

  // Note Editor
  $('#note-close-btn')?.addEventListener('click', () => closeModal('#note-modal'));
  $('#note-save-btn')?.addEventListener('click', saveNote);
  $('#pin-btn')?.addEventListener('click', () => $('#pin-btn').classList.toggle('active'));
  $('#toggle-checklist-mode')?.addEventListener('click', toggleChecklistMode);
  $('#insert-table-btn')?.addEventListener('click', insertTableTemplate);
  $('#copy-style-btn')?.addEventListener('click', copyNoteStyle);
  $('#paste-style-btn')?.addEventListener('click', pasteNoteStyle);
  $('#add-checklist-item-btn')?.addEventListener('click', addChecklistItem);
  $('#new-checklist-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
  });
  $('#contrast-autofix-btn')?.addEventListener('click', autoFixContrast);

  // Settings
  $('#dark-mode-toggle')?.addEventListener('change', (e) => {
    state.darkMode = e.target.checked;
    document.body.classList.toggle('dark-mode', state.darkMode);
    localStorage.setItem('notewalt_darkmode', state.darkMode);
  });

  $$('.accent-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      triggerHaptic();
      setAccentColor(sw.dataset.accent);
    });
  });

  // Safe
  $('#safe-unlock-btn')?.addEventListener('click', unlockSafe);
  $('#safe-lock-btn')?.addEventListener('click', lockSafe);
  $('#change-pin-btn')?.addEventListener('click', () => openModal('#pin-dialog'));
  $('#pin-cancel-btn')?.addEventListener('click', () => closeModal('#pin-dialog'));
  $('#pin-save-btn')?.addEventListener('click', saveNewPin);

  $('#clipboard-clear-now-btn')?.addEventListener('click', clearSensitiveClipboard);

  $('#color-picker-btn')?.addEventListener('click', () => {
    const pop = $('#color-picker-popup');
    pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
    $('#text-color-popup').style.display = 'none';
  });

  $('#text-color-btn')?.addEventListener('click', () => {
    const pop = $('#text-color-popup');
    pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
    $('#color-picker-popup').style.display = 'none';
  });

  // Tap Backdrop to Dismiss Modals (Native iOS behavior)
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', () => {
      triggerHaptic();
      bd.closest('.modal')?.classList.remove('active');
    });
  });

  // Global Keyboard Navigation (Esc to close, Enter to submit PIN)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal.active').forEach(m => m.classList.remove('active'));
      const cpop = $('#color-picker-popup');
      if (cpop) cpop.style.display = 'none';
      const tpop = $('#text-color-popup');
      if (tpop) tpop.style.display = 'none';
      $('#sort-dropdown')?.classList.remove('show');
    }
  });

  $('#safe-pin')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockSafe();
  });
}

// ---------------------------------------------------------------------------
// 6. Navigation
// ---------------------------------------------------------------------------
function switchSection(sec) {
  state.currentSection = sec;
  $$('.bottom-nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === sec));
  $$('.view').forEach(v => v.classList.remove('active'));

  if (sec === 'notes') {
    $('#notes-view')?.classList.add('active');
    renderNotes();
  } else if (sec === 'cards') {
    $('#cards-view')?.classList.add('active');
    renderCards();
  } else if (sec === 'info') {
    $('#info-view')?.classList.add('active');
    if (state.currentInfoTab === 'vehicle') renderExpenses();
    else if (state.currentInfoTab === 'emi') renderEmis();
    else if (state.currentInfoTab === 'passwords') renderPasswords();
  }
}

function switchView(viewName) {
  state.currentView = viewName;
  $$('.sidebar-menu li[data-view]').forEach(li => li.classList.toggle('active', li.dataset.view === viewName));
  $$('.view').forEach(v => v.classList.remove('active'));

  $(`#${viewName}-view`)?.classList.add('active');

  if (viewName === 'archive') renderArchiveNotes();
  else if (viewName === 'bin') renderBinNotes();
  else if (viewName === 'reminders') renderReminderNotes();
  else if (viewName === 'safe') {
    if (state.safeUnlocked) renderSafeNotes();
    else {
      $('#safe-locked').style.display = 'flex';
      $('#safe-unlocked').style.display = 'none';
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Cards Vault Engine
// ---------------------------------------------------------------------------
async function loadCards() {
  try {
    const cards = await api('/cards');
    state.cards = cards || [];
    renderCards();
  } catch (err) {
    console.error('Failed to load cards:', err);
  }
}

function renderCards() {
  const container = $('#cards-container');
  const emptyState = $('#cards-empty-state');
  if (!container) return;

  let filtered = state.cards;
  if (state.currentCardCategory !== 'All') {
    filtered = filtered.filter(c => c.category === state.currentCardCategory);
  }
  if (state.searchQuery) {
    const q = state.searchQuery;
    filtered = filtered.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.issuer && c.issuer.toLowerCase().includes(q)) ||
      (c.cardholderName && c.cardholderName.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  if (state.currentCardMode === 'stacked' || state.currentCardMode === 'grid') {
    container.innerHTML = filtered.map((card, idx) => `
      <div class="interactive-wallet-card card-theme-${card.themeIndex ?? 0} card-text-${card.textColorIndex ?? 0} card-font-${card.fontIndex ?? 0} ${idx === 0 && state.currentCardMode === 'stacked' ? 'card-active' : ''}"
           data-id="${card.id}" 
           style="z-index: ${state.currentCardMode === 'stacked' ? (filtered.length - idx) : 1};"
           onclick="onCardClick(${card.id})">
        <div class="card-top-row">
          <div class="card-top-row-left">
            <div class="card-chip-graphic">
              <svg width="36" height="26" viewBox="0 0 40 30" fill="none">
                <rect x="1" y="1" width="38" height="28" rx="4" fill="#D4AF37" stroke="#A67C1E" stroke-width="1"/>
                <path d="M1 10 H14 M1 20 H14 M26 10 H39 M26 20 H39 M14 1 V29 M26 1 V29" stroke="#8A6615" stroke-width="0.8"/>
                <rect x="14" y="9" width="12" height="12" rx="2" fill="#DFBC47" stroke="#8A6615" stroke-width="0.8"/>
              </svg>
            </div>
            <div class="card-contactless-wave"><i class="material-icons-outlined">wifi</i></div>
          </div>
          <div class="card-issuer-name">${escapeHtml(card.issuer || card.name || 'CARD')}</div>
        </div>
        <div class="card-number-row">${escapeHtml(card.maskedNumber || '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022')}</div>
        <div class="card-bottom-row">
          <div class="card-holder-col">
            <span class="card-sub-label">CARDHOLDER</span>
            <span class="card-holder-name">${escapeHtml(card.cardholderName || 'VALUED MEMBER')}</span>
          </div>
          <div class="card-expiry-col">
            <span class="card-sub-label">EXPIRES</span>
            <span class="card-expiry-val">${escapeHtml(card.expiryDate || '••/••')}</span>
          </div>
        </div>
        <div class="card-category-badge">${escapeHtml(card.category || 'Card')}</div>
      </div>
    `).join('');
  } else {
    container.innerHTML = filtered.map(card => {
      const theme = CARD_THEMES[card.themeIndex ?? 0] || CARD_THEMES[0];
      return `
        <div class="card-list-row" onclick="onCardClick(${card.id})">
          <div class="card-mini-swatch" style="background: ${theme.gradient};"></div>
          <div class="card-list-info">
            <div class="card-list-title">${escapeHtml(card.name || card.issuer || 'Card')}</div>
            <div class="card-list-sub">${escapeHtml(card.maskedNumber || '•••• •••• •••• ••••')}</div>
          </div>
          <button class="icon-btn"><i class="material-icons-outlined">chevron_right</i></button>
        </div>
      `;
    }).join('');
  }
}

window.onCardClick = function(id) {
  triggerHaptic();
  openCardDetails(id);
};

function renderCardThemePickers() {
  const container = $('#gradient-theme-picker');
  if (!container) return;
  container.innerHTML = CARD_THEMES.map(t => `
    <div class="theme-swatch ${t.id === 0 ? 'active' : ''}" data-id="${t.id}" style="background: ${t.gradient};" title="${t.name}"></div>
  `).join('');

  $$('.theme-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      triggerHaptic();
      $$('.theme-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      state.selectedCardTheme = parseInt(sw.dataset.id, 10);
      updateLiveCardPreview();
    });
  });
}

function updateLiveCardPreview() {
  const card = $('#live-card-preview');
  if (!card) return;

  card.className = `interactive-wallet-card card-theme-${state.selectedCardTheme} card-text-${state.selectedCardTextColor} card-font-${state.selectedCardFont}`;

  const issuer = $('#card-issuer-input')?.value || 'ISSUER BANK';
  const holder = $('#card-holder-input')?.value || 'NAME SURNAME';
  const number = $('#card-number-input')?.value || '•••• •••• •••• ••••';
  const expiry = $('#card-expiry-input')?.value || 'MM/YY';

  $('#preview-issuer').textContent = issuer.toUpperCase();
  $('#preview-holder').textContent = holder.toUpperCase();
  $('#preview-expiry').textContent = expiry;

  const clean = number.replace(/\s+/g, '');
  if (clean.length >= 4) {
    $('#preview-number').textContent = `•••• •••• •••• ${clean.slice(-4)}`;
  } else {
    $('#preview-number').textContent = number;
  }
}

function openCardEditor(card = null) {
  state.editingCard = card;
  openModal('#card-editor-modal');

  if (card) {
    $('#card-modal-title').textContent = 'Edit Wallet Card';
    $('#card-id').value = card.id;
    $('#card-category').value = card.category || 'Credit / Debit Cards';
    $('#card-name-input').value = card.name || '';
    $('#card-issuer-input').value = card.issuer || '';
    $('#card-holder-input').value = card.cardholderName || '';
    $('#card-number-input').value = card.cardNumber || '';
    $('#card-expiry-input').value = card.expiryDate || '';
    $('#card-cvv-input').value = card.cvv || '';
    $('#card-pin-input').value = card.pin || '';
    $('#card-notes-input').value = card.notes || '';
    state.selectedCardTheme = card.themeIndex ?? 0;
    state.selectedCardTextColor = card.textColorIndex ?? 0;
    state.selectedCardFont = card.fontIndex ?? 0;
  } else {
    $('#card-modal-title').textContent = 'Add Wallet Card / ID';
    $('#card-id').value = '';
    $('#card-name-input').value = '';
    $('#card-issuer-input').value = '';
    $('#card-holder-input').value = '';
    $('#card-number-input').value = '';
    $('#card-expiry-input').value = '';
    $('#card-cvv-input').value = '';
    $('#card-pin-input').value = '';
    $('#card-notes-input').value = '';
    state.selectedCardTheme = 0;
    state.selectedCardTextColor = 0;
    state.selectedCardFont = 0;
  }

  $$('.theme-swatch').forEach(sw => sw.classList.toggle('active', parseInt(sw.dataset.id, 10) === state.selectedCardTheme));
  $$('.text-choice').forEach(tc => tc.classList.toggle('active', parseInt(tc.dataset.index, 10) === state.selectedCardTextColor));
  if ($('#card-font-select')) $('#card-font-select').value = state.selectedCardFont.toString();

  updateLiveCardPreview();
}

async function saveWalletCard() {
  const name = $('#card-name-input').value.trim() || $('#card-issuer-input').value.trim() || 'My Card';
  const category = $('#card-category').value;
  const issuer = $('#card-issuer-input').value.trim();
  const cardholderName = $('#card-holder-input').value.trim();
  const cardNumber = $('#card-number-input').value.trim();
  const expiryDate = $('#card-expiry-input').value.trim();
  const cvv = $('#card-cvv-input').value.trim();
  const pin = $('#card-pin-input').value.trim();
  const notes = $('#card-notes-input').value.trim();

  const payload = {
    name, category, issuer, cardholderName, cardNumber, expiryDate, cvv, pin,
    themeIndex: state.selectedCardTheme,
    textColorIndex: state.selectedCardTextColor,
    fontIndex: state.selectedCardFont,
    notes
  };

  try {
    if (state.editingCard) {
      await api(`/cards/${state.editingCard.id}`, 'PUT', payload);
      showToast('Card updated', 'success');
    } else {
      await api('/cards', 'POST', payload);
      showToast('Card saved to vault', 'success');
    }
    closeModal('#card-editor-modal');
    await loadCards();
  } catch (err) {
    showToast('Failed to save card: ' + err.message, 'error');
  }
}

function openCardDetails(id) {
  const card = state.cards.find(c => c.id === id);
  if (!card) return;

  $('#card-detail-title').textContent = card.name || card.issuer || 'Card Details';

  $('#detail-card-graphic-container').innerHTML = `
    <div class="card-flipper" id="card-detail-flipper" onclick="toggleCardDetailFlip()">
      <!-- Front of Card -->
      <div class="card-front interactive-wallet-card card-theme-${card.themeIndex ?? 0} card-text-${card.textColorIndex ?? 0} card-font-${card.fontIndex ?? 0}">
        <div class="card-top-row">
          <div class="card-top-row-left">
            <div class="card-chip-graphic">
              <svg width="36" height="26" viewBox="0 0 40 30" fill="none">
                <rect x="1" y="1" width="38" height="28" rx="4" fill="#D4AF37" stroke="#A67C1E" stroke-width="1"/>
                <path d="M1 10 H14 M1 20 H14 M26 10 H39 M26 20 H39 M14 1 V29 M26 1 V29" stroke="#8A6615" stroke-width="0.8"/>
                <rect x="14" y="9" width="12" height="12" rx="2" fill="#DFBC47" stroke="#8A6615" stroke-width="0.8"/>
              </svg>
            </div>
            <div class="card-contactless-wave"><i class="material-icons-outlined">wifi</i></div>
          </div>
          <div class="card-issuer-name">${escapeHtml(card.issuer || card.name || '')}</div>
        </div>
        <div class="card-number-row">${escapeHtml(card.maskedNumber || '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022')}</div>
        <div class="card-bottom-row">
          <div class="card-holder-col">
            <span class="card-sub-label">CARDHOLDER</span>
            <span class="card-holder-name">${escapeHtml(card.cardholderName || '')}</span>
          </div>
          <div class="card-expiry-col">
            <span class="card-sub-label">EXPIRES</span>
            <span class="card-expiry-val">${escapeHtml(card.expiryDate || '••/••')}</span>
          </div>
        </div>
      </div>
      <!-- Back of Card (3D Flipped) -->
      <div class="card-back interactive-wallet-card card-theme-${card.themeIndex ?? 0} card-text-${card.textColorIndex ?? 0}">
        <div class="card-back-magstripe"></div>
        <div class="card-back-cvv-row">
          <div class="card-back-signature">Authorized Signature</div>
          <div class="card-back-cvv-box">${escapeHtml(card.cvv || '•••')}</div>
        </div>
        <div class="card-back-disclaimer">
          This card is personal property of the holder. For customer service or lost/stolen cards, report immediately.
        </div>
      </div>
    </div>
    <div class="card-flip-hint"><i class="material-icons-outlined" style="font-size:14px">sync</i> Tap card to flip 3D</div>
  `;

  window.toggleCardDetailFlip = function() {
    triggerHaptic();
    $('#card-detail-flipper')?.classList.toggle('flipped');
  };

  $('#detail-number-val').textContent = card.cardNumber || card.maskedNumber || '—';
  $('#detail-expiry-val').textContent = card.expiryDate || '—';
  $('#detail-cvv-val').textContent = '••••';
  $('#detail-pin-val').textContent = '••••';

  let cvvRevealed = false;
  $('#reveal-cvv-btn').onclick = () => {
    cvvRevealed = !cvvRevealed;
    $('#detail-cvv-val').textContent = cvvRevealed ? (card.cvv || '—') : '••••';
  };

  let pinRevealed = false;
  $('#reveal-pin-btn').onclick = () => {
    pinRevealed = !pinRevealed;
    $('#detail-pin-val').textContent = pinRevealed ? (card.pin || '—') : '••••';
  };

  $('#copy-card-num-btn').onclick = () => copySensitive(card.cardNumber || '', 'Card Number');
  $('#copy-card-exp-btn').onclick = () => copySensitive(card.expiryDate || '', 'Expiry Date');
  $('#copy-card-cvv-btn').onclick = () => copySensitive(card.cvv || '', 'CVV');
  $('#copy-card-pin-btn').onclick = () => copySensitive(card.pin || '', 'PIN');

  $('#detail-pin-btn').onclick = async () => {
    await api(`/cards/${card.id}/pin`, 'POST');
    await loadCards();
    closeModal('#card-detail-modal');
  };

  $('#detail-edit-btn').onclick = () => {
    closeModal('#card-detail-modal');
    openCardEditor(card);
  };

  $('#detail-delete-btn').onclick = () => {
    confirmAction('Delete this card?', async () => {
      await api(`/cards/${card.id}`, 'DELETE');
      closeModal('#card-detail-modal');
      await loadCards();
    });
  };

  openModal('#card-detail-modal');
}

// ---------------------------------------------------------------------------
// 8. Vehicle Expense Tracker
// ---------------------------------------------------------------------------
async function loadVehicleSettings() {
  try {
    const s = await api('/vehicle/settings');
    if (s) {
      state.vehicleSettings = {
        vehicleType: s.vehicleType || 'Car',
        fuelType: s.fuelType || 'Petrol',
        petrolPrice: parseFloat(s.petrolPrice) || 101.50,
        dieselPrice: parseFloat(s.dieselPrice) || 89.60,
        cngPrice: parseFloat(s.cngPrice) || 76.50
      };
      updateVehicleConfigUI();
    }
  } catch (err) {}
}

function updateVehicleConfigUI() {
  const s = state.vehicleSettings;
  const icon = s.vehicleType === 'Bike' ? 'two_wheeler' : (s.vehicleType === 'Scooter' ? 'moped' : 'directions_car');
  if ($('#vehicle-type-icon')) $('#vehicle-type-icon').textContent = icon;
  if ($('#vehicle-type-label')) $('#vehicle-type-label').textContent = s.vehicleType;
  if ($('#vehicle-fuel-pill')) $('#vehicle-fuel-pill').textContent = s.fuelType;

  let unitPrice = s.petrolPrice;
  let unit = 'Ltr';
  if (s.fuelType === 'Diesel') unitPrice = s.dieselPrice;
  else if (s.fuelType.includes('CNG')) { unitPrice = s.cngPrice; unit = 'Kg'; }

  if ($('#vehicle-rate-pill')) $('#vehicle-rate-pill').textContent = `₹ ${unitPrice.toFixed(2)} / ${unit}`;
}

function openVehicleSetupModal() {
  const s = state.vehicleSettings;
  $('#vcfg-type').value = s.vehicleType;
  $('#vcfg-fuel').value = s.fuelType;
  $('#vcfg-petrol-price').value = s.petrolPrice;
  $('#vcfg-diesel-price').value = s.dieselPrice;
  $('#vcfg-cng-price').value = s.cngPrice;
  openModal('#vehicle-setup-modal');
}

async function saveVehicleSetup() {
  const payload = {
    vehicleType: $('#vcfg-type').value,
    fuelType: $('#vcfg-fuel').value,
    petrolPrice: parseFloat($('#vcfg-petrol-price').value) || 101.50,
    dieselPrice: parseFloat($('#vcfg-diesel-price').value) || 89.60,
    cngPrice: parseFloat($('#vcfg-cng-price').value) || 76.50
  };
  await api('/vehicle/settings', 'POST', payload);
  state.vehicleSettings = payload;
  updateVehicleConfigUI();
  closeModal('#vehicle-setup-modal');
}

async function loadExpenses() {
  try {
    const list = await api('/finance');
    state.expenses = list || [];
    renderExpenses();
    renderVehicleBarChart();
  } catch (err) {}
}

function calculateFuelVolume() {
  const amt = parseFloat($('#finance-amount').value);
  const fuelType = $('#finance-fuel-type').value;
  let price = state.vehicleSettings.petrolPrice;
  if (fuelType === 'Diesel') price = state.vehicleSettings.dieselPrice;
  else if (fuelType === 'CNG') price = state.vehicleSettings.cngPrice;

  if (amt && price > 0) {
    $('#finance-fuel-vol').value = (amt / price).toFixed(2);
  }
}

function renderExpenses(filterCategory = 'All') {
  let list = state.expenses;
  if (filterCategory && filterCategory !== 'All') {
    list = list.filter(e => (e.category || e.expense_type) === filterCategory);
  }

  const total = state.expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const thisMonthExpenses = state.expenses.filter(e => {
    if (!e.date) return false;
    const d = new Date(e.date);
    return (d.getMonth() + 1) === currentMonth && d.getFullYear() === currentYear;
  });
  const monthTotal = thisMonthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const fuelExpenses = state.expenses.filter(e => (e.category || e.expense_type) === 'Fuel');
  const fuelTotal = fuelExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  const fuelVolTotal = fuelExpenses.reduce((sum, e) => sum + (parseFloat(e.fuel_volume || e.fuelVolume) || 0), 0);
  const serviceExpenses = state.expenses.filter(e => ['Service', 'Repair', 'Wash'].includes(e.category || e.expense_type));
  const serviceTotal = serviceExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  if ($('#metric-total-spend')) $('#metric-total-spend').textContent = `₹ ${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if ($('#metric-month-spend')) $('#metric-month-spend').textContent = `₹ ${monthTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if ($('#metric-month-name')) $('#metric-month-name').textContent = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  if ($('#metric-fuel-spend')) $('#metric-fuel-spend').textContent = `₹ ${fuelTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if ($('#metric-fuel-volume')) $('#metric-fuel-volume').textContent = `${fuelVolTotal.toFixed(1)} L/Kg`;
  if ($('#metric-service-spend')) $('#metric-service-spend').textContent = `₹ ${serviceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const tbody = $('#finance-tbody');
  const empty = $('#finance-empty');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(e => `
    <tr>
      <td>${escapeHtml(e.date || '')}</td>
      <td><strong>${escapeHtml(e.vehicle_name || state.vehicleSettings.vehicleType)}</strong></td>
      <td><span class="note-chip">${escapeHtml(e.category || e.expense_type || 'Fuel')}</span></td>
      <td>${escapeHtml(e.expense_name || '')}</td>
      <td>${e.fuel_volume ? (e.fuel_volume + ' L') : '—'}</td>
      <td><strong>₹ ${parseFloat(e.amount || 0).toFixed(2)}</strong></td>
      <td>
        <button class="icon-btn" onclick="deleteExpense(${e.id})"><i class="material-icons-outlined">delete</i></button>
      </td>
    </tr>
  `).join('');
}

window.deleteExpense = function(id) {
  confirmAction('Delete this expense?', async () => {
    await api(`/finance/${id}`, 'DELETE');
    await loadExpenses();
  });
};

function renderVehicleBarChart() {
  const chart = $('#vehicle-bar-chart');
  if (!chart) return;

  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      total: 0
    });
  }

  state.expenses.forEach(e => {
    if (!e.date) return;
    const d = new Date(e.date);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const entry = months.find(item => item.month === m && item.year === y);
    if (entry) entry.total += (parseFloat(e.amount) || 0);
  });

  const maxVal = Math.max(...months.map(m => m.total), 100);

  chart.innerHTML = months.map(m => {
    const heightPercent = Math.max(8, Math.round((m.total / maxVal) * 120));
    const isPeak = m.total > 0 && m.total === maxVal;
    return `
      <div class="chart-bar-col ${isPeak ? 'peak' : ''}">
        <span class="chart-bar-val">₹${Math.round(m.total)}</span>
        <div class="chart-bar-pill" style="height: ${heightPercent}px;"></div>
        <span class="chart-bar-label">${m.label}</span>
      </div>
    `;
  }).join('');
}

function openExpenseModal() {
  $('#finance-id').value = '';
  $('#finance-vehicle').value = state.vehicleSettings.vehicleType;
  $('#finance-type').value = 'Fuel';
  $('#finance-fuel-type').value = state.vehicleSettings.fuelType.includes('Diesel') ? 'Diesel' : 'Petrol';
  $('#fuel-calculation-group').style.display = 'grid';
  $('#finance-amount').value = '';
  $('#finance-fuel-vol').value = '';
  $('#finance-name').value = '';
  $('#finance-date').value = new Date().toISOString().split('T')[0];
  $('#finance-notes').value = '';
  openModal('#finance-modal');
}

async function saveExpense() {
  const vehicle = $('#finance-vehicle').value.trim() || state.vehicleSettings.vehicleType;
  const category = $('#finance-type').value;
  const amount = parseFloat($('#finance-amount').value);
  const name = $('#finance-name').value.trim() || `${category} charge`;
  const date = $('#finance-date').value;
  const notes = $('#finance-notes').value.trim();
  const fuelType = $('#finance-fuel-type').value;
  const fuelVolume = parseFloat($('#finance-fuel-vol').value) || 0.0;

  if (!amount || !date) return;

  const payload = {
    vehicle, category, type: category, expense_type: category,
    amount, name, description: name, date, notes, fuelType, fuelVolume
  };

  await api('/finance', 'POST', payload);
  closeModal('#finance-modal');
  await loadExpenses();
}

// ---------------------------------------------------------------------------
// 9. EMI Loan Payoff Tracker
// ---------------------------------------------------------------------------
async function loadEmis() {
  try {
    const list = await api('/emis');
    state.emis = list || [];
    renderEmis();
    renderEmiCharts();
  } catch (err) {}
}

function renderEmis() {
  const totalMonthly = state.emis.reduce((sum, e) => sum + (parseFloat(e.monthlyEmi) || 0), 0);
  const totalDebt = state.emis.reduce((sum, e) => sum + ((parseFloat(e.monthlyEmi) || 0) * (parseInt(e.remainingEmis, 10) || 0)), 0);
  const activeCount = state.emis.filter(e => (e.remainingEmis || 0) > 0).length;

  if ($('#emi-total-monthly')) $('#emi-total-monthly').textContent = `₹ ${totalMonthly.toLocaleString('en-IN')}`;
  if ($('#emi-total-debt')) $('#emi-total-debt').textContent = `₹ ${Math.round(totalDebt).toLocaleString('en-IN')}`;
  if ($('#emi-active-count')) $('#emi-active-count').textContent = activeCount.toString();

  const container = $('#emi-cards-grid');
  const empty = $('#emi-empty');
  if (!container) return;

  if (state.emis.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = state.emis.map(emi => {
    const total = emi.totalEmis || 1;
    const remaining = emi.remainingEmis ?? total;
    const completed = Math.max(0, total - remaining);
    const progressPercent = Math.min(100, Math.round((completed / total) * 100));
    const debt = Math.round((emi.monthlyEmi || 0) * remaining);

    return `
      <div class="emi-loan-card">
        <div class="emi-card-top">
          <div>
            <h4 class="emi-lender-title">${escapeHtml(emi.lenderName || 'Loan')}</h4>
            <span class="metric-sub">Debt: ₹ ${debt.toLocaleString('en-IN')}</span>
          </div>
          <span class="emi-monthly-tag">₹ ${Math.round(emi.monthlyEmi || 0).toLocaleString('en-IN')}/mo</span>
        </div>

        <div class="emi-progress-wrap">
          <div class="emi-progress-track">
            <div class="emi-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
          <span class="metric-sub" style="margin-top:4px;display:block;">${remaining} of ${total} EMIs left (${progressPercent}%)</span>
        </div>

        <div class="emi-card-actions">
          <button class="paid-emi-btn" onclick="payEmiOne(${emi.id})" ${remaining === 0 ? 'disabled' : ''}>
            <i class="material-icons-outlined">check_circle</i>
            <span>${remaining === 0 ? 'Paid' : 'Paid 1 EMI'}</span>
          </button>
          <button class="icon-btn" onclick="deleteEmi(${emi.id})"><i class="material-icons-outlined">delete</i></button>
        </div>
      </div>
    `;
  }).join('');
}

window.payEmiOne = async function(id) {
  triggerHaptic();
  await api(`/emis/${id}/pay`, 'POST');
  await loadEmis();
  showToast('Paid 1 EMI!', 'success');
};

window.deleteEmi = function(id) {
  confirmAction('Delete this loan?', async () => {
    await api(`/emis/${id}`, 'DELETE');
    await loadEmis();
  });
};

function renderEmiCharts() {
  const lenderChart = $('#emi-lender-chart');
  if (lenderChart && state.emis.length > 0) {
    const maxEmi = Math.max(...state.emis.map(e => e.monthlyEmi || 0), 1000);
    lenderChart.innerHTML = state.emis.slice(0, 4).map(e => {
      const heightPercent = Math.max(12, Math.round(((e.monthlyEmi || 0) / maxEmi) * 120));
      return `
        <div class="chart-bar-col">
          <span class="chart-bar-val">₹${Math.round(e.monthlyEmi || 0)}</span>
          <div class="chart-bar-pill" style="height: ${heightPercent}px;"></div>
          <span class="chart-bar-label">${escapeHtml((e.lenderName || 'Loan').split(' ')[0])}</span>
        </div>
      `;
    }).join('');
  }
}

function openEmiModal() {
  $('#emi-id').value = '';
  $('#emi-lender').value = '';
  $('#emi-monthly').value = '';
  $('#emi-total').value = '36';
  $('#emi-remaining').value = '36';
  $('#emi-start-date').value = new Date().toISOString().split('T')[0];
  $('#emi-notes').value = '';
  openModal('#emi-modal');
}

async function saveEmi() {
  const lenderName = $('#emi-lender').value.trim();
  const monthlyEmi = parseFloat($('#emi-monthly').value);
  const totalEmis = parseInt($('#emi-total').value, 10);
  const remainingEmis = parseInt($('#emi-remaining').value, 10);
  const startDate = $('#emi-start-date').value;
  const notes = $('#emi-notes').value.trim();

  if (!lenderName || !monthlyEmi) return;

  await api('/emis', 'POST', { lenderName, monthlyEmi, totalEmis, remainingEmis, startDate, notes });
  closeModal('#emi-modal');
  await loadEmis();
}

// ---------------------------------------------------------------------------
// 10. Passwords & 18-Char Generator
// ---------------------------------------------------------------------------
async function loadPasswords() {
  try {
    const list = await api('/passwords');
    state.passwords = list || [];
    renderPasswords();
  } catch (err) {}
}

function renderPasswords() {
  const container = $('#passwords-list');
  const empty = $('#passwords-empty');
  if (!container) return;

  let list = state.passwords;
  if (state.searchQuery) {
    const q = state.searchQuery;
    list = list.filter(p => (p.site_name && p.site_name.toLowerCase().includes(q)) || (p.username && p.username.toLowerCase().includes(q)));
  }

  if (list.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  container.innerHTML = list.map(pw => `
    <div class="password-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h4 class="pw-site-title">${escapeHtml(pw.site_name || 'Account')}</h4>
        <button class="icon-btn" onclick="deletePassword(${pw.id})"><i class="material-icons-outlined">delete</i></button>
      </div>

      <div class="password-cred-row">
        <span><strong>${escapeHtml(pw.username || '—')}</strong></span>
        <button class="icon-btn" onclick="copySensitive('${escapeJs(pw.username || '')}', 'Username')"><i class="material-icons-outlined">content_copy</i></button>
      </div>

      <div class="password-cred-row">
        <span id="pw-mask-${pw.id}">••••••••••••</span>
        <div style="display: flex; gap: 4px;">
          <button class="icon-btn" onclick="togglePasswordVisibility(${pw.id}, '${escapeJs(pw.password || '')}')"><i class="material-icons-outlined" id="pw-eye-${pw.id}">visibility</i></button>
          <button class="icon-btn" onclick="copySensitive('${escapeJs(pw.password || '')}', 'Password')"><i class="material-icons-outlined">content_copy</i></button>
        </div>
      </div>
    </div>
  `).join('');
}

window.togglePasswordVisibility = function(id, actualPassword) {
  triggerHaptic();
  const mask = $(`#pw-mask-${id}`);
  const eye = $(`#pw-eye-${id}`);
  if (!mask || !eye) return;
  const isMasked = mask.textContent.startsWith('•');
  mask.textContent = isMasked ? actualPassword : '••••••••••••';
  eye.textContent = isMasked ? 'visibility_off' : 'visibility';
};

window.deletePassword = function(id) {
  confirmAction('Delete this password?', async () => {
    await api(`/passwords/${id}`, 'DELETE');
    await loadPasswords();
  });
};

function generateSecurePassword() {
  triggerHaptic();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const array = new Uint32Array(18);
  window.crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < 18; i++) result += chars[array[i] % chars.length];
  $('#pw-password').value = result;
  $('#pw-password').type = 'text';
  $('#pw-toggle-vis i').textContent = 'visibility_off';
  showToast('18-Character password generated', 'success');
}

function openPasswordModal() {
  $('#password-id').value = '';
  $('#pw-site').value = '';
  $('#pw-url').value = '';
  $('#pw-username').value = '';
  $('#pw-password').value = '';
  $('#pw-notes').value = '';
  $('#pw-password').type = 'password';
  openModal('#password-modal');
}

async function savePassword() {
  const site_name = $('#pw-site').value.trim();
  const url = $('#pw-url').value.trim();
  const username = $('#pw-username').value.trim();
  const password = $('#pw-password').value;
  const notes = $('#pw-notes').value.trim();

  if (!site_name || !password) return;

  await api('/passwords', 'POST', { site_name, url, username, password, notes });
  closeModal('#password-modal');
  await loadPasswords();
}

// ---------------------------------------------------------------------------
// 11. Notes Engine
// ---------------------------------------------------------------------------
async function loadNotes() {
  try {
    const list = await api('/notes?all=true');
    state.notes = list || [];
    renderNotes();
  } catch (err) {}
}

function renderNotes() {
  const pinnedContainer = $('#pinned-notes');
  const otherContainer = $('#other-notes');
  const pinnedSection = $('#pinned-section');
  const othersTitle = $('#others-title');
  const emptyState = $('#empty-state');

  let active = state.notes.filter(n => !n.isArchived && !n.isDeleted && !n.isHidden);

  if (state.searchQuery) {
    const q = state.searchQuery;
    active = active.filter(n => (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q)));
  }

  active.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const pinned = active.filter(n => n.isPinned);
  const others = active.filter(n => !n.isPinned);

  if (active.length === 0) {
    pinnedSection.style.display = 'none';
    othersTitle.style.display = 'none';
    otherContainer.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  if (pinned.length > 0) {
    pinnedSection.style.display = 'block';
    pinnedContainer.innerHTML = pinned.map(buildNoteCardHtml).join('');
    othersTitle.style.display = 'block';
  } else {
    pinnedSection.style.display = 'none';
    othersTitle.style.display = 'none';
  }

  otherContainer.innerHTML = others.map(buildNoteCardHtml).join('');
}

function buildNoteCardHtml(n) {
  const isChecklist = n.isChecklist || n.is_checklist;
  let bodyContent = '';

  if (isChecklist) {
    const lines = (n.content || '').split('\n').filter(Boolean);
    bodyContent = lines.slice(0, 3).map(line => {
      const parts = line.split('|');
      const checked = parts[0] === '1';
      const text = parts.slice(1).join('|');
      return `
        <div class="checklist-item ${checked ? 'checked' : ''}">
          <input type="checkbox" class="checklist-checkbox" ${checked ? 'checked' : ''} disabled>
          <span>${escapeHtml(text)}</span>
        </div>
      `;
    }).join('');
  } else if (n.content && n.content.includes('|') && n.content.includes('---')) {
    bodyContent = renderMarkdownTable(n.content);
  } else {
    bodyContent = escapeHtml(n.content || '');
  }

  return `
    <div class="note-card ${n.isPinned ? 'pinned' : ''}" style="background-color: ${n.color || '#FFFFFF'}; color: ${n.textColor || '#292D32'};"
         onclick="openNoteEditor(${n.id})">
      ${n.title ? `<h4 class="note-card-title">${escapeHtml(n.title)}</h4>` : ''}
      <div class="note-card-body">${bodyContent}</div>
      <div class="note-card-footer">
        <span>${formatDate(n.updatedAt || n.createdAt)}</span>
      </div>
    </div>
  `;
}

function renderMarkdownTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tableLines = lines.filter(l => l.startsWith('|') && l.endsWith('|'));
  if (tableLines.length < 2) return escapeHtml(text);

  const headerCols = tableLines[0].split('|').slice(1, -1).map(c => c.trim());
  const bodyRows = tableLines.slice(2).map(r => r.split('|').slice(1, -1).map(c => c.trim()));

  return `
    <table class="note-table">
      <thead><tr>${headerCols.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
}

function openNoteEditor(noteId = null) {
  triggerHaptic();
  const note = noteId ? state.notes.find(n => n.id === noteId) : null;
  state.editingNote = note;
  openModal('#note-modal');

  if (note) {
    $('#note-title').value = note.title || '';
    $('#note-content').value = note.content || '';
    state.selectedColor = note.color || '#FFFFFF';
    state.selectedTextColor = note.textColor || '#292D32';
    state.isChecklistMode = Boolean(note.isChecklist || note.is_checklist);
    if (state.isChecklistMode) parseChecklistContent(note.content || '');
  } else {
    $('#note-title').value = '';
    $('#note-content').value = '';
    state.selectedColor = '#FFFFFF';
    state.selectedTextColor = '#292D32';
    state.isChecklistMode = false;
    state.checklistItems = [];
  }

  applyNoteEditorColors();
  syncChecklistModeUI();
  updateContrastAssistant();
}

function applyNoteEditorColors() {
  const editor = $('.note-editor');
  if (!editor) return;
  editor.style.backgroundColor = state.selectedColor;
  editor.style.color = state.selectedTextColor;
  $('#note-title').style.color = state.selectedTextColor;
  $('#note-content').style.color = state.selectedTextColor;
}

function toggleChecklistMode() {
  triggerHaptic();
  state.isChecklistMode = !state.isChecklistMode;
  if (state.isChecklistMode) {
    parseChecklistContent($('#note-content').value);
  } else {
    $('#note-content').value = state.checklistItems.map(i => i.text).join('\n');
  }
  syncChecklistModeUI();
}

function syncChecklistModeUI() {
  $('#toggle-checklist-mode')?.classList.toggle('active', state.isChecklistMode);
  $('#checklist-editor').style.display = state.isChecklistMode ? 'block' : 'none';
  $('#note-content').style.display = state.isChecklistMode ? 'none' : 'block';
  if (state.isChecklistMode) renderChecklistEditorItems();
}

function parseChecklistContent(str) {
  const lines = str.split('\n').filter(Boolean);
  state.checklistItems = lines.map(l => {
    if (l.startsWith('0|') || l.startsWith('1|')) {
      const parts = l.split('|');
      return { checked: parts[0] === '1', text: parts.slice(1).join('|') };
    }
    return { checked: false, text: l };
  });
}

function renderChecklistEditorItems() {
  const container = $('#checklist-items');
  if (!container) return;
  container.innerHTML = state.checklistItems.map((item, idx) => `
    <div class="checklist-item ${item.checked ? 'checked' : ''}">
      <input type="checkbox" class="checklist-checkbox" ${item.checked ? 'checked' : ''} onchange="toggleItemChecked(${idx})">
      <input type="text" value="${escapeHtml(item.text)}" class="form-input" style="flex:1" onchange="updateItemText(${idx}, this.value)">
      <button class="icon-btn" onclick="removeChecklistItem(${idx})"><i class="material-icons-outlined">close</i></button>
    </div>
  `).join('');
}

window.toggleItemChecked = function(idx) {
  triggerHaptic();
  if (state.checklistItems[idx]) {
    state.checklistItems[idx].checked = !state.checklistItems[idx].checked;
    renderChecklistEditorItems();
  }
};

window.updateItemText = function(idx, val) {
  if (state.checklistItems[idx]) state.checklistItems[idx].text = val;
};

window.removeChecklistItem = function(idx) {
  triggerHaptic();
  state.checklistItems.splice(idx, 1);
  renderChecklistEditorItems();
};

function addChecklistItem() {
  triggerHaptic();
  const inp = $('#new-checklist-input');
  const val = inp.value.trim();
  if (!val) return;
  state.checklistItems.push({ checked: false, text: val });
  inp.value = '';
  renderChecklistEditorItems();
}

function insertTableTemplate() {
  triggerHaptic();
  const tpl = "\n| Header 1 | Header 2 |\n|---|---|\n| Item 1 | Detail 1 |\n";
  $('#note-content').value += tpl;
}

function copyNoteStyle() {
  triggerHaptic();
  state.copiedStyle = { bg: state.selectedColor, text: state.selectedTextColor };
  showToast('Style copied', 'success');
}

function pasteNoteStyle() {
  triggerHaptic();
  if (!state.copiedStyle) return;
  state.selectedColor = state.copiedStyle.bg;
  state.selectedTextColor = state.copiedStyle.text;
  applyNoteEditorColors();
  updateContrastAssistant();
}

async function saveNote() {
  triggerHaptic();
  const title = $('#note-title').value.trim();
  let content = $('#note-content').value;
  if (state.isChecklistMode) {
    content = state.checklistItems.map(i => `${i.checked ? '1' : '0'}|${i.text}`).join('\n');
  }
  const isPinned = $('#pin-btn').classList.contains('active');

  const payload = {
    title, content,
    color: state.selectedColor,
    textColor: state.selectedTextColor,
    isPinned,
    isChecklist: state.isChecklistMode
  };

  if (state.editingNote) {
    await api(`/notes/${state.editingNote.id}`, 'PUT', payload);
  } else {
    await api('/notes', 'POST', payload);
  }
  closeModal('#note-modal');
  await loadNotes();
}

// ---------------------------------------------------------------------------
// 12. 100 Color Palettes
// ---------------------------------------------------------------------------
function renderColorSwatches() {
  renderBgSwatchesCategory('ultra-light');
  $$('#color-picker-popup .palette-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      triggerHaptic();
      $$('#color-picker-popup .palette-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderBgSwatchesCategory(tab.dataset.cat);
    });
  });

  renderTextSwatchesCategory('dark-text');
  $$('#text-color-popup .palette-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      triggerHaptic();
      $$('#text-color-popup .palette-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTextSwatchesCategory(tab.dataset.cat);
    });
  });
}

function renderBgSwatchesCategory(cat) {
  const grid = $('#bg-swatches-grid');
  if (!grid) return;
  grid.innerHTML = (PALETTES.backgrounds[cat] || []).map(s => `
    <div class="color-swatch ${s.hex.toLowerCase() === state.selectedColor.toLowerCase() ? 'selected' : ''}"
         style="background: ${s.hex};" onclick="selectBgColor('${s.hex}')"></div>
  `).join('');
}

function renderTextSwatchesCategory(cat) {
  const grid = $('#text-swatches-grid');
  if (!grid) return;
  grid.innerHTML = (PALETTES.text[cat] || []).map(s => `
    <div class="color-swatch ${s.hex.toLowerCase() === state.selectedTextColor.toLowerCase() ? 'selected' : ''}"
         style="background: ${s.hex};" onclick="selectTextColor('${s.hex}')"></div>
  `).join('');
}

window.selectBgColor = function(hex) {
  triggerHaptic();
  state.selectedColor = hex;
  applyNoteEditorColors();
  updateContrastAssistant();
};

window.selectTextColor = function(hex) {
  triggerHaptic();
  state.selectedTextColor = hex;
  applyNoteEditorColors();
  updateContrastAssistant();
};

function getLuminance(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  const [r, g, b] = [(num >> 16) & 255, (num >> 8) & 255, num & 255].map(v => {
    const val = v / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function updateContrastAssistant() {
  const l1 = getLuminance(state.selectedColor);
  const l2 = getLuminance(state.selectedTextColor);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  const badge = $('#contrast-badge');
  const ratioSpan = $('#contrast-ratio');
  if (!badge || !ratioSpan) return;

  const passed = ratio >= 4.5;
  badge.textContent = passed ? 'WCAG AA Pass' : 'Low Contrast';
  badge.className = `contrast-badge ${passed ? '' : 'fail'}`;
  ratioSpan.textContent = `Ratio: ${ratio.toFixed(1)}:1`;
}

function autoFixContrast() {
  triggerHaptic();
  const bgLum = getLuminance(state.selectedColor);
  state.selectedTextColor = bgLum > 0.4 ? '#17191C' : '#FFFFFF';
  applyNoteEditorColors();
  updateContrastAssistant();
}

// ---------------------------------------------------------------------------
// 13. 30-Second Sensitive Clipboard Auto-Clear
// ---------------------------------------------------------------------------
window.copySensitive = function(text, label = 'Credential') {
  triggerHaptic();
  if (!text) return;
  if (window.Capacitor?.Plugins?.Clipboard) {
    window.Capacitor.Plugins.Clipboard.write({ string: text });
  } else {
    navigator.clipboard.writeText(text);
  }
  startClipboardCountdown(label);
};

function startClipboardCountdown(label) {
  if (state.clipboardInterval) clearInterval(state.clipboardInterval);
  state.clipboardRemaining = 30;
  const toast = $('#clipboard-toast');
  $('#clipboard-title').textContent = `${label} copied!`;
  $('#clipboard-countdown').textContent = '30';
  $('#clipboard-progress-fill').style.width = '100%';
  toast.classList.add('show');

  state.clipboardInterval = setInterval(() => {
    state.clipboardRemaining--;
    $('#clipboard-countdown').textContent = state.clipboardRemaining.toString();
    $('#clipboard-progress-fill').style.width = `${(state.clipboardRemaining / 30) * 100}%`;
    if (state.clipboardRemaining <= 0) clearSensitiveClipboard();
  }, 1000);
}

function clearSensitiveClipboard() {
  if (state.clipboardInterval) clearInterval(state.clipboardInterval);
  if (window.Capacitor?.Plugins?.Clipboard) {
    window.Capacitor.Plugins.Clipboard.write({ string: '' });
  } else {
    navigator.clipboard.writeText('');
  }
  $('#clipboard-toast')?.classList.remove('show');
  showToast('Clipboard wiped', 'info');
}

// ---------------------------------------------------------------------------
// 14. Safe & Utilities
// ---------------------------------------------------------------------------
async function checkSafeStatus() {
  const s = await api('/safe/status');
  if (s) state.safeUnlocked = s.is_unlocked;
}

async function unlockSafe() {
  triggerHaptic();
  const pin = $('#safe-pin').value;
  if (!pin) return;
  try {
    await api('/safe/unlock', 'POST', { pin });
    state.safeUnlocked = true;
    $('#safe-locked').style.display = 'none';
    $('#safe-unlocked').style.display = 'block';
    renderSafeNotes();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function lockSafe() {
  triggerHaptic();
  await api('/safe/lock', 'POST');
  state.safeUnlocked = false;
  $('#safe-locked').style.display = 'flex';
  $('#safe-unlocked').style.display = 'none';
}

async function saveNewPin() {
  triggerHaptic();
  const p1 = $('#new-pin-input').value;
  const p2 = $('#confirm-pin-input').value;
  if (p1 !== p2 || p1.length < 4) {
    showToast('Invalid PIN', 'error');
    return;
  }
  await api('/safe/setup', 'POST', { pin: p1 });
  closeModal('#pin-dialog');
  showToast('PIN updated', 'success');
}

function renderArchiveNotes() {
  const container = $('#archive-notes');
  if (!container) return;
  container.innerHTML = state.notes.filter(n => n.isArchived && !n.isDeleted).map(buildNoteCardHtml).join('');
}

function renderBinNotes() {
  const container = $('#bin-notes');
  if (!container) return;
  container.innerHTML = state.notes.filter(n => n.isDeleted).map(buildNoteCardHtml).join('');
}

function renderReminderNotes() {
  const container = $('#reminder-notes');
  if (!container) return;
  container.innerHTML = state.notes.filter(n => n.reminder && !n.isDeleted).map(buildNoteCardHtml).join('');
}

function renderSafeNotes() {
  const container = $('#safe-notes');
  if (!container) return;
  container.innerHTML = state.notes.filter(n => n.isHidden && !n.isDeleted).map(buildNoteCardHtml).join('');
}

function openModal(sel) {
  $(sel)?.classList.add('active');
}

function closeModal(sel) {
  $(sel)?.classList.remove('active');
}

function confirmAction(msg, onConfirm) {
  $('#confirm-message').textContent = msg;
  openModal('#confirm-dialog');
  $('#confirm-yes').onclick = () => { closeModal('#confirm-dialog'); onConfirm(); };
  $('#confirm-no').onclick = () => closeModal('#confirm-dialog');
}

function showToast(msg, type = 'info') {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}
