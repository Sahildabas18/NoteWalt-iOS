/**
 * mobile-db.js - High-Performance Client-Side Offline Database & AES-256-GCM Crypto
 * Designed for Note Walt on iOS (IndexedDB + WebCrypto API).
 * Replaces the local Python backend with zero dependencies on iPhone.
 */

class MobileDB {
  constructor() {
    this.dbName = 'NoteWalt_iOS_DB';
    this.dbVersion = 1;
    this.db = null;
    this.cryptoKey = null;
    this.safeUnlocked = false;
  }

  async init() {
    await this._initCrypto();
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('notes')) {
          const notesStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
          notesStore.createIndex('is_pinned', 'is_pinned', { unique: false });
          notesStore.createIndex('updated_at', 'updated_at', { unique: false });
        }

        if (!db.objectStoreNames.contains('labels')) {
          db.createObjectStore('labels', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('wallet_cards')) {
          const cardsStore = db.createObjectStore('wallet_cards', { keyPath: 'id', autoIncrement: true });
          cardsStore.createIndex('category', 'category', { unique: false });
          cardsStore.createIndex('is_pinned', 'is_pinned', { unique: false });
        }

        if (!db.objectStoreNames.contains('finance_records')) {
          const finStore = db.createObjectStore('finance_records', { keyPath: 'id', autoIncrement: true });
          finStore.createIndex('date', 'date', { unique: false });
        }

        if (!db.objectStoreNames.contains('emi_entries')) {
          db.createObjectStore('emi_entries', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('passwords')) {
          db.createObjectStore('passwords', { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };

      request.onerror = (e) => {
        reject(e.target.error);
      };
    });
  }

  // ─── AES-256-GCM Web Crypto ──────────────────────────────────────────────

  async _initCrypto() {
    let rawKey = localStorage.getItem('notewalt_ios_key');
    if (!rawKey) {
      const randomBuf = new Uint8Array(32);
      window.crypto.getRandomValues(randomBuf);
      rawKey = Array.from(randomBuf).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('notewalt_ios_key', rawKey);
    }
    const keyData = new Uint8Array(rawKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    this.cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(plaintext) {
    if (!plaintext) return '';
    try {
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(plaintext);
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        encoded
      );
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(ciphertext), iv.length);
      return btoa(String.fromCharCode.apply(null, combined));
    } catch (e) {
      console.error('Encryption error:', e);
      return plaintext;
    }
  }

  async decrypt(encryptedBase64) {
    if (!encryptedBase64) return '';
    try {
      const binary = atob(encryptedBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      // Return raw if not valid encrypted ciphertext
      return encryptedBase64;
    }
  }

  async hashPin(pin) {
    const encoded = new TextEncoder().encode(pin);
    const hashBuf = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ─── Generic DB Transaction Helpers ─────────────────────────────────────

  _tx(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // ─── Notes Engine ───────────────────────────────────────────────────────

  async getNotes(includeAll = true) {
    return new Promise((resolve) => {
      const store = this._tx('notes', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        let notes = req.result || [];
        if (!includeAll) {
          notes = notes.filter(n => !n.is_deleted && !n.is_archived && !n.is_hidden);
        }
        notes.sort((a, b) => {
          if (b.is_pinned !== a.is_pinned) return (b.is_pinned || 0) - (a.is_pinned || 0);
          return (b.updated_at || '').localeCompare(a.updated_at || '');
        });
        notes = notes.map(n => this._formatNote(n));
        resolve(notes);
      };
    });
  }

  async createNote(data) {
    const now = new Date().toISOString();
    const item = {
      title: data.title || '',
      content: data.content || '',
      color: data.color || '#FFFFFF',
      text_color: data.textColor || data.text_color || '#292D32',
      is_pinned: data.isPinned || data.is_pinned ? 1 : 0,
      is_checklist: data.isChecklist || data.is_checklist ? 1 : 0,
      reminder: data.reminder || null,
      labels: data.labels || [],
      attachments: data.attachments || [],
      is_archived: 0,
      is_deleted: 0,
      is_hidden: 0,
      created_at: now,
      updated_at: now
    };
    return new Promise((resolve) => {
      const store = this._tx('notes', 'readwrite');
      const req = store.add(item);
      req.onsuccess = () => {
        item.id = req.result;
        resolve(this._formatNote(item));
      };
    });
  }

  async updateNote(id, data) {
    return new Promise((resolve) => {
      const store = this._tx('notes', 'readwrite');
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return resolve(null);
        const item = req.result;
        if (data.title !== undefined) item.title = data.title;
        if (data.content !== undefined) item.content = data.content;
        if (data.color !== undefined) item.color = data.color;
        if (data.textColor !== undefined) item.text_color = data.textColor;
        if (data.isPinned !== undefined) item.is_pinned = data.isPinned ? 1 : 0;
        if (data.isChecklist !== undefined) item.is_checklist = data.isChecklist ? 1 : 0;
        if (data.isArchived !== undefined) item.is_archived = data.isArchived ? 1 : 0;
        if (data.isDeleted !== undefined) item.is_deleted = data.isDeleted ? 1 : 0;
        if (data.isHidden !== undefined) item.is_hidden = data.isHidden ? 1 : 0;
        if (data.labels !== undefined) item.labels = data.labels;
        item.updated_at = new Date().toISOString();
        store.put(item);
        resolve(this._formatNote(item));
      };
    });
  }

  async deleteNote(id) {
    return this.updateNote(id, { isDeleted: 1 });
  }

  _formatNote(n) {
    if (!n) return n;
    return {
      ...n,
      isPinned: Boolean(n.is_pinned),
      isChecklist: Boolean(n.is_checklist),
      isArchived: Boolean(n.is_archived),
      isDeleted: Boolean(n.is_deleted),
      isHidden: Boolean(n.is_hidden),
      textColor: n.text_color || '#292D32',
      createdAt: n.created_at,
      updatedAt: n.updated_at
    };
  }

  // ─── Wallet Cards Engine (With AES-256-GCM) ─────────────────────────────

  async getCards(category = null) {
    return new Promise((resolve) => {
      const store = this._tx('wallet_cards', 'readonly');
      const req = store.getAll();
      req.onsuccess = async () => {
        let cards = req.result || [];
        if (category && category !== 'All') {
          cards = cards.filter(c => c.category === category);
        }
        cards.sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0));

        // Decrypt sensitive card credentials
        const formatted = await Promise.all(cards.map(async (c) => {
          const decryptedNumber = await this.decrypt(c.card_number_encrypted || '');
          const decryptedCvv = await this.decrypt(c.cvv_encrypted || '');
          const decryptedPin = await this.decrypt(c.pin_encrypted || '');

          const cleanNum = decryptedNumber.replace(/\s+/g, '');
          const masked = cleanNum.length >= 4
            ? `•••• •••• •••• ${cleanNum.slice(-4)}`
            : (decryptedNumber || '•••• •••• •••• ••••');

          return {
            id: c.id,
            name: c.name,
            issuer: c.issuer,
            cardholderName: c.cardholder_name,
            cardNumber: decryptedNumber,
            maskedNumber: masked,
            expiryDate: c.expiry_date,
            cvv: decryptedCvv,
            pin: decryptedPin,
            category: c.category || 'Credit / Debit Cards',
            themeIndex: c.theme_index ?? 0,
            textColorIndex: c.text_color_index ?? 0,
            fontIndex: c.font_index ?? 0,
            isPinned: Boolean(c.is_pinned),
            extraField1Label: c.extra_field1_label,
            extraField1Value: c.extra_field1_value,
            extraField2Label: c.extra_field2_label,
            extraField2Value: c.extra_field2_value,
            frontImage: c.front_image,
            backImage: c.back_image,
            notes: c.notes,
            createdAt: c.created_at,
            updatedAt: c.updated_at
          };
        }));
        resolve(formatted);
      };
    });
  }

  async createCard(data) {
    const encNumber = await this.encrypt(data.cardNumber || '');
    const encCvv = await this.encrypt(data.cvv || '');
    const encPin = await this.encrypt(data.pin || '');
    const now = new Date().toISOString();

    const item = {
      name: data.name || data.issuer || 'Card',
      issuer: data.issuer || '',
      cardholder_name: data.cardholderName || '',
      card_number_encrypted: encNumber,
      expiry_date: data.expiryDate || '',
      cvv_encrypted: encCvv,
      pin_encrypted: encPin,
      category: data.category || 'Credit / Debit Cards',
      theme_index: data.themeIndex ?? 0,
      text_color_index: data.textColorIndex ?? 0,
      font_index: data.fontIndex ?? 0,
      is_pinned: data.isPinned ? 1 : 0,
      extra_field1_label: data.extraField1Label || '',
      extra_field1_value: data.extraField1Value || '',
      extra_field2_label: data.extraField2Label || '',
      extra_field2_value: data.extraField2Value || '',
      front_image: data.frontImage || '',
      back_image: data.backImage || '',
      notes: data.notes || '',
      created_at: now,
      updated_at: now
    };

    return new Promise((resolve) => {
      const store = this._tx('wallet_cards', 'readwrite');
      const req = store.add(item);
      req.onsuccess = () => {
        item.id = req.result;
        resolve(item);
      };
    });
  }

  async updateCard(id, data) {
    return new Promise(async (resolve) => {
      const store = this._tx('wallet_cards', 'readwrite');
      const req = store.get(id);
      req.onsuccess = async () => {
        if (!req.result) return resolve(null);
        const item = req.result;
        if (data.name !== undefined) item.name = data.name;
        if (data.issuer !== undefined) item.issuer = data.issuer;
        if (data.cardholderName !== undefined) item.cardholder_name = data.cardholderName;
        if (data.cardNumber !== undefined) item.card_number_encrypted = await this.encrypt(data.cardNumber);
        if (data.expiryDate !== undefined) item.expiry_date = data.expiryDate;
        if (data.cvv !== undefined) item.cvv_encrypted = await this.encrypt(data.cvv);
        if (data.pin !== undefined) item.pin_encrypted = await this.encrypt(data.pin);
        if (data.category !== undefined) item.category = data.category;
        if (data.themeIndex !== undefined) item.theme_index = data.themeIndex;
        if (data.textColorIndex !== undefined) item.text_color_index = data.textColorIndex;
        if (data.fontIndex !== undefined) item.font_index = data.fontIndex;
        if (data.isPinned !== undefined) item.is_pinned = data.isPinned ? 1 : 0;
        if (data.frontImage !== undefined) item.front_image = data.frontImage;
        if (data.backImage !== undefined) item.back_image = data.backImage;
        if (data.notes !== undefined) item.notes = data.notes;
        item.updated_at = new Date().toISOString();
        store.put(item);
        resolve(item);
      };
    });
  }

  async deleteCard(id) {
    return new Promise((resolve) => {
      const store = this._tx('wallet_cards', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
    });
  }

  async togglePinCard(id) {
    return new Promise((resolve) => {
      const store = this._tx('wallet_cards', 'readwrite');
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return resolve(null);
        const item = req.result;
        item.is_pinned = item.is_pinned ? 0 : 1;
        item.updated_at = new Date().toISOString();
        store.put(item);
        resolve(item);
      };
    });
  }

  // ─── Vehicle Expenses Engine ───────────────────────────────────────────

  async getExpenses() {
    return new Promise((resolve) => {
      const store = this._tx('finance_records', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        let list = req.result || [];
        list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        resolve(list);
      };
    });
  }

  async createExpense(data) {
    const now = new Date().toISOString();
    const item = {
      vehicle_name: data.vehicle || data.vehicle_name || 'Car',
      category: data.category || data.expense_type || 'Fuel',
      expense_type: data.category || data.expense_type || 'Fuel',
      expense_name: data.name || data.expense_name || 'Expense',
      amount: parseFloat(data.amount) || 0.0,
      fuel_type: data.fuelType || data.fuel_type || 'Petrol',
      fuel_volume: parseFloat(data.fuelVolume || data.fuel_volume) || 0.0,
      date: data.date || now.split('T')[0],
      notes: data.notes || '',
      created_at: now
    };
    return new Promise((resolve) => {
      const store = this._tx('finance_records', 'readwrite');
      const req = store.add(item);
      req.onsuccess = () => {
        item.id = req.result;
        resolve(item);
      };
    });
  }

  async deleteExpense(id) {
    return new Promise((resolve) => {
      const store = this._tx('finance_records', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
    });
  }

  // ─── EMI Loans Engine ──────────────────────────────────────────────────

  async getEmis() {
    return new Promise((resolve) => {
      const store = this._tx('emi_entries', 'readonly');
      const req = store.getAll();
      req.onsuccess = () => {
        let list = req.result || [];
        resolve(list.map(e => ({
          id: e.id,
          lenderName: e.lender_name,
          monthlyEmi: parseFloat(e.monthly_emi) || 0,
          remainingEmis: parseInt(e.remaining_emis, 10) || 0,
          totalEmis: parseInt(e.total_emis, 10) || 0,
          startDate: e.start_date,
          notes: e.notes
        })));
      };
    });
  }

  async createEmi(data) {
    const now = new Date().toISOString();
    const item = {
      lender_name: data.lenderName || 'Loan',
      monthly_emi: parseFloat(data.monthlyEmi) || 0.0,
      remaining_emis: parseInt(data.remainingEmis, 10) || 0,
      total_emis: parseInt(data.totalEmis, 10) || 0,
      start_date: data.startDate || now.split('T')[0],
      notes: data.notes || '',
      created_at: now,
      updated_at: now
    };
    return new Promise((resolve) => {
      const store = this._tx('emi_entries', 'readwrite');
      const req = store.add(item);
      req.onsuccess = () => {
        item.id = req.result;
        resolve(item);
      };
    });
  }

  async payEmi(id) {
    return new Promise((resolve) => {
      const store = this._tx('emi_entries', 'readwrite');
      const req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) return resolve(null);
        const item = req.result;
        item.remaining_emis = Math.max(0, (item.remaining_emis || 0) - 1);
        item.updated_at = new Date().toISOString();
        store.put(item);
        resolve(item);
      };
    });
  }

  async deleteEmi(id) {
    return new Promise((resolve) => {
      const store = this._tx('emi_entries', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
    });
  }

  // ─── Passwords Engine (AES-256-GCM) ────────────────────────────────────

  async getPasswords() {
    return new Promise((resolve) => {
      const store = this._tx('passwords', 'readonly');
      const req = store.getAll();
      req.onsuccess = async () => {
        const list = req.result || [];
        const decrypted = await Promise.all(list.map(async (p) => {
          const pass = await this.decrypt(p.password_encrypted || '');
          return {
            id: p.id,
            site_name: p.site_name,
            url: p.url,
            username: p.username,
            password: pass,
            notes: p.notes
          };
        }));
        resolve(decrypted);
      };
    });
  }

  async createPassword(data) {
    const encPass = await this.encrypt(data.password || '');
    const now = new Date().toISOString();
    const item = {
      site_name: data.site_name || '',
      url: data.url || '',
      username: data.username || '',
      password_encrypted: encPass,
      notes: data.notes || '',
      created_at: now,
      updated_at: now
    };
    return new Promise((resolve) => {
      const store = this._tx('passwords', 'readwrite');
      const req = store.add(item);
      req.onsuccess = () => {
        item.id = req.result;
        resolve(item);
      };
    });
  }

  async deletePassword(id) {
    return new Promise((resolve) => {
      const store = this._tx('passwords', 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
    });
  }

  // ─── Settings & Vehicle Config ──────────────────────────────────────────

  async getSetting(key, fallback = null) {
    return new Promise((resolve) => {
      const store = this._tx('settings', 'readonly');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    });
  }

  async setSetting(key, value) {
    return new Promise((resolve) => {
      const store = this._tx('settings', 'readwrite');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
    });
  }

  async getVehicleSettings() {
    return {
      vehicleType: await this.getSetting('vehicle_type', 'Car'),
      fuelType: await this.getSetting('fuel_type', 'Petrol'),
      petrolPrice: parseFloat(await this.getSetting('petrol_price', '101.50')),
      dieselPrice: parseFloat(await this.getSetting('diesel_price', '89.60')),
      cngPrice: parseFloat(await this.getSetting('cng_price', '76.50'))
    };
  }

  async updateVehicleSettings(data) {
    if (data.vehicleType) await this.setSetting('vehicle_type', data.vehicleType);
    if (data.fuelType) await this.setSetting('fuel_type', data.fuelType);
    if (data.petrolPrice) await this.setSetting('petrol_price', data.petrolPrice.toString());
    if (data.dieselPrice) await this.setSetting('diesel_price', data.dieselPrice.toString());
    if (data.cngPrice) await this.setSetting('cng_price', data.cngPrice.toString());
    return this.getVehicleSettings();
  }

  // ─── Safe PIN ───────────────────────────────────────────────────────────

  async setupSafePin(pin) {
    const hash = await this.hashPin(pin);
    await this.setSetting('safe_pin', hash);
    return true;
  }

  async verifySafePin(pin) {
    const stored = await this.getSetting('safe_pin');
    if (!stored) return false;
    const hash = await this.hashPin(pin);
    const valid = hash === stored;
    if (valid) this.safeUnlocked = true;
    return valid;
  }
}

// Global Singleton Instance
window.mobileDB = new MobileDB();
