/* ============================================================
       EXPENSE TRACKER — Clean Rewrite
       Fixes: UTC dates, account index mapping, split duplication,
       print double-count, budget over-allocation, picker formatting,
       recurring efficiency, transfer persistence, report averages,
       lifecycle status override, modal leaks, history source toggle,
       storage quota guard, and dead code removal.
       ============================================================ */

    window.onerror = function(msg, url, line, col, err) {
      console.error('[GLOBAL ERROR]', msg, 'at line', line, 'col', col, err);
      // Surface fatal errors to user even before app is initialized
      const container = document.getElementById('toastContainer');
      if (container) {
        const toast = document.createElement('div');
        toast.className = 'toast err';
        toast.textContent = 'An error occurred. Please refresh or backup your data. (' + (msg || 'unknown') + ')';
        container.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(10px)'; setTimeout(() => toast.remove(), 200); }, 4000);
      }
      return false;
    };
    window.app = null;

    const STORAGE_KEY = 'expenseTracker_v2';
    const THEME_KEY = 'expenseTracker_theme';
    const APP_VERSION = 3;

    // Color coding for expense type badges. bg/fg are light-mode fills; the dark
    // variants are applied via a data-attribute + CSS. Grouped by what money does:
    // income=green, holding=teal/purple/blue, spending=gray/amber/coral.
    const TYPE_STYLES = {
      'Earning':       { bg: '#D8F2C2', fg: '#1F5104', dbg: '#1F5A12', dfg: '#A8E88A' },
      'Saving':        { bg: '#C6F0E4', fg: '#024F3E', dbg: '#0A5A47', dfg: '#74E5C8' },
      'Investment':    { bg: '#DCD9FB', fg: '#322A9C', dbg: '#332B86', dfg: '#BDB6F7' },
      'Transfer':      { bg: '#CFE6FC', fg: '#08407D', dbg: '#0B4178', dfg: '#92C2F2' },
      'Essential':     { bg: '#E4E2D6', fg: '#3A3A36', dbg: '#3D3D38', dfg: '#C7C5B8' },
      'Non-essential': { bg: '#FBDFB0', fg: '#7A4504', dbg: '#7A4604', dfg: '#F5BE6B' },
      'Vacation':      { bg: '#FBD9C9', fg: '#8A2F11', dbg: '#8A300F', dfg: '#F4B49A' }
    };
    // Fallback palette for custom user-added types (assigned by stable hash).
    const TYPE_FALLBACK = [
      { bg: '#FBD2E4', fg: '#8A2453', dbg: '#8A2453', dfg: '#F5A6C7' },
      { bg: '#FCD2D2', fg: '#8A1F1F', dbg: '#8A1F1F', dfg: '#F5A3A3' }
    ];

    function typeAbbrev(type) {
      if (!type) return 'O';
      const clean = type.trim();
      // Two letters: first + next consonant-ish char for readability.
      if (clean.length <= 2) return clean.charAt(0).toUpperCase() + (clean.charAt(1) || '').toLowerCase();
      return clean.charAt(0).toUpperCase() + clean.charAt(1).toLowerCase();
    }

    function typeStyle(type) {
      if (TYPE_STYLES[type]) return TYPE_STYLES[type];
      let h = 0;
      for (let i = 0; i < (type || '').length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
      return TYPE_FALLBACK[h % TYPE_FALLBACK.length];
    }

    const DEFAULT_DATA = {
      version: APP_VERSION,
      transactions: [],
      budgets: {},
      events: [],
      recurring: [],
      recurringBudgets: [],
      goals: [],
      accounts: [
        { id: 'personal', name: 'Personal Account', startingBalance: 0, asOfDate: '' },
        { id: 'joint', name: 'Joint Account', startingBalance: 0, asOfDate: '' }
      ],
      currentMonth: '',
      currentTab: 'home',
      planView: 'categories',
      budgetMode: 'direct',
      planYear: 2026,
      undoStack: [],
      autoResetMonth: true,
      expenseTypes: ['Earning', 'Saving', 'Investment', 'Transfer', 'Essential', 'Non-essential', 'Vacation'],
      typeCategories: {
        'Earning': ['Salary', 'Refund', 'Equity Sale', 'Dividend', 'Transfer In'],
        'Saving': ['Fixed Deposit', 'Recurring Deposit', 'Cash'],
        'Investment': ['Equity', 'Mutual Fund', 'ETF', 'NPS-T1', 'NPS-T2', 'EPF', 'PPF'],
        'Essential': ['Clothing', 'Connectivity', 'Debt', 'Diet', 'Education', 'Electronic', 'Gift', 'Grocery', 'Housing', 'Insurance', 'Jewellery', 'Medicine', 'Professional', 'Personal Care', 'Travel'],
        'Non-essential': ['Clothing', 'Dine-in', 'Dine-out', 'Electronic', 'Gift', 'Grocery', 'Housing', 'Jewellery', 'Media & Entertainment', 'Personal Care', 'Professional', 'Travel'],
        'Vacation': ['Travel - International', 'Travel - Internal', 'Connectivity', 'Dine-in', 'Dine-out', 'Stay', 'Entertainment', 'Shopping - Clothing', 'Shopping - Souvenirs', 'Shopping - Chocolates', 'Shopping - Gifts', 'Shopping - Travel Gear', 'Shopping - Beauty & Make-up', 'Shopping - Electronics', 'Shopping - Stationaries', 'Shopping - Others', 'Personal Care'],
        'Transfer': ['Personal to Joint', 'Joint to Personal', 'Other Transfer']
      }
    };

    const EXPENSE_TYPES = ['Earning', 'Saving', 'Investment', 'Transfer', 'Essential', 'Non-essential', 'Vacation'];

    const PAYMENT_MODES = {
      'Cash': [],
      'Credit Card': ['Zen', 'PVR', "Diner's Club", 'ICICI Amazon', 'One', 'Citi'],
      'Debit Card': ['S3665', 'H5242', 'K351', 'K168'],
      'Wallet': []
    };

    const TYPE_CATEGORIES = {
      'Earning': ['Salary', 'Refund', 'Equity Sale', 'Dividend', 'Transfer In'],
      'Saving': ['Fixed Deposit', 'Recurring Deposit', 'Cash'],
      'Investment': ['Equity', 'Mutual Fund', 'ETF', 'NPS-T1', 'NPS-T2', 'EPF', 'PPF'],
      'Essential': ['Clothing', 'Connectivity', 'Debt', 'Diet', 'Education', 'Electronic', 'Gift', 'Grocery', 'Housing', 'Insurance', 'Jewellery', 'Medicine', 'Professional', 'Personal Care', 'Travel'],
      'Non-essential': ['Clothing', 'Dine-in', 'Dine-out', 'Electronic', 'Gift', 'Grocery', 'Housing', 'Jewellery', 'Media & Entertainment', 'Personal Care', 'Professional', 'Travel'],
      'Vacation': ['Travel - International', 'Travel - Internal', 'Connectivity', 'Dine-in', 'Dine-out', 'Stay', 'Entertainment', 'Shopping - Clothing', 'Shopping - Souvenirs', 'Shopping - Chocolates', 'Shopping - Gifts', 'Shopping - Travel Gear', 'Shopping - Beauty & Make-up', 'Shopping - Electronics', 'Shopping - Stationaries', 'Shopping - Others', 'Personal Care'],
      'Transfer': ['Personal to Joint', 'Joint to Personal', 'Other Transfer']
    };

    /** Return YYYY-MM-DD in local timezone (fixes UTC midnight bug) */
    function getLocalDateStr(date = new Date()) {
      let d;
      if (date instanceof Date) {
        d = date;
      } else if (typeof date === 'string' && !date.includes('T')) {
        d = new Date(date + 'T00:00:00');
      } else {
        d = new Date(date);
      }
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function compareMonths(a, b) {
      if (!a || !b || !/^\d{4}-\d{2}$/.test(a) || !/^\d{4}-\d{2}$/.test(b)) return 0;
      const [ay, am] = a.split('-').map(Number);
      const [by, bm] = b.split('-').map(Number);
      if (ay !== by) return ay - by;
      return am - bm;
    }

    class ExpenseTrackerApp {
      constructor() {
        try {
          this.allData = this.loadAllData();
          this.data = this.allData.profiles[this.allData.activeProfile];
        } catch(e) {
          console.error('[CTOR] loadData failed', e);
          this.allData = {
            version: APP_VERSION,
            activeProfile: 'self',
            profiles: { self: this.createDefaultProfile(), wife: this.createDefaultProfile() }
          };
          this.data = this.allData.profiles.self;
        }
        this._listenersAttached = false;
        this._lifecycleInterval = null;
        this.editingTxId = null;
        this.confirmCallback = null;
        this.copySelected = new Set();
        this.copyBudgetSelected = new Set();
        this.copyTargetMonths = new Set();
        this.copyTargetMode = 'single';
        this.copyBudgetFilter = 'all';
        this.alertedCategories = new Set();
        this.historyFilterType = 'all';
        this.historyEventId = null;
        this.historySourceFilter = null;
        this.historySearchQuery = '';
        this.reportType = 'summary';
        this.trackFilter = 'all';
        this.bmItems = [];
        this.bmCollapsed = {};
        this.planExpandedTypes = new Set();
        this.historyLimit = 50;
        this.historyOffset = 0;
        this._nwCache = null;
        this._lastFocused = null;
        this.clearBudgetMonths = new Set();
        this.historyQuickFilter = null;
        this.gridMode = 'calendar';
        this._clearBudgetMonthOptions = [];
        this.backupClearExpenseMonths = new Set();
        this.backupClearBudgetMonths = new Set();
        this._backupClearExpenseOptions = [];
        this._backupClearBudgetOptions = [];
        this.selectiveDateMode = 'all';
        this.selectiveImportMode = 'merge';
        this.init();
      }

      createDefaultProfile() {
        const d = JSON.parse(JSON.stringify(DEFAULT_DATA));
        d.currentMonth = getLocalDateStr().slice(0, 7);
        return d;
      }

      isSelfProfile() { return this.allData.activeProfile === 'self'; }
      getProfileSource() { return this.isSelfProfile() ? 'Personal' : 'Joint Account'; }

      migrateOldData(old) {
        const d = JSON.parse(JSON.stringify(old));
        if (!d.currentMonth) d.currentMonth = getLocalDateStr().slice(0, 7);
        if (!d.planYear) d.planYear = 2026;
        if (!d.events) d.events = [];
        if (!d.accounts) d.accounts = JSON.parse(JSON.stringify(DEFAULT_DATA.accounts));
        if (!d.recurringBudgets) d.recurringBudgets = [];
        if (!d.version) d.version = 2;
        if (!d.undoStack) d.undoStack = [];
        if (d.autoResetMonth === undefined) d.autoResetMonth = true;
        if (!d.expenseTypes) d.expenseTypes = JSON.parse(JSON.stringify(DEFAULT_DATA.expenseTypes));
        if (!d.typeCategories) d.typeCategories = JSON.parse(JSON.stringify(DEFAULT_DATA.typeCategories));
        // Ensure recurring items have lastGenerated so we don't loop from 2020 forever
        (d.recurring || []).forEach(r => {
          if (!r.lastGenerated) r.lastGenerated = r.startDate ? r.startDate.slice(0, 7) : d.currentMonth;
        });
        (d.recurringBudgets || []).forEach(r => {
          if (!r.lastGenerated) r.lastGenerated = r.sourceMonth || d.currentMonth;
        });
        return d;
      }

      migrateV2toV3(d) {
        if (!d.version || d.version < 3) {
          (d.transactions || []).forEach(t => {
            if (t.lifecycleEnabled === undefined) t.lifecycleEnabled = false;
            if (t.source === undefined) t.source = 'Personal';
            if (t.frequency === undefined) t.frequency = 'Variable';
            if (t.transferTo === undefined) t.transferTo = '';
            if (t.statusLocked === undefined) t.statusLocked = false;
          });
          (d.recurring || []).forEach(r => {
            if (!r.lastGenerated) r.lastGenerated = r.startDate ? r.startDate.slice(0, 7) : d.currentMonth;
          });
          d.version = 3;
        }
        return d;
      }

      repairData(d) {
        if (!d) return this.createDefaultProfile();
        if (!Array.isArray(d.transactions)) d.transactions = [];
        if (!d.budgets || typeof d.budgets !== 'object') d.budgets = {};
        if (!Array.isArray(d.events)) d.events = [];
        if (!Array.isArray(d.recurring)) d.recurring = [];
        if (!Array.isArray(d.recurringBudgets)) d.recurringBudgets = [];
        if (!Array.isArray(d.goals)) d.goals = [];
        if (!Array.isArray(d.accounts)) d.accounts = JSON.parse(JSON.stringify(DEFAULT_DATA.accounts));
        if (!Array.isArray(d.undoStack)) d.undoStack = [];
        if (!d.expenseTypes || !Array.isArray(d.expenseTypes)) d.expenseTypes = JSON.parse(JSON.stringify(DEFAULT_DATA.expenseTypes));
        if (!d.typeCategories || typeof d.typeCategories !== 'object') d.typeCategories = JSON.parse(JSON.stringify(DEFAULT_DATA.typeCategories));
        if (d.autoResetMonth === undefined) d.autoResetMonth = true;
        d.transactions = d.transactions.filter(t => t && t.id && t.date);
        // Seed each recurring item's generatedMonths ledger so the generator never
        // recreates a month that was already produced — even if the user later moved
        // or deleted that month's instance. Built from existing instances plus every
        // month up to and including lastGenerated.
        (d.recurring || []).forEach(r => {
          if (!r || !r.id) return;
          if (!Array.isArray(r.generatedMonths)) r.generatedMonths = [];
          const set = new Set(r.generatedMonths);
          d.transactions.forEach(t => {
            if (t.recurringId === r.id && /^\d{4}-\d{2}/.test(t.date)) set.add(t.date.slice(0, 7));
          });
          if (r.startDate && r.lastGenerated && /^\d{4}-\d{2}/.test(r.startDate) && /^\d{4}-\d{2}/.test(r.lastGenerated)) {
            let [y, m] = r.startDate.slice(0, 7).split('-').map(Number);
            const [ey, em] = r.lastGenerated.split('-').map(Number);
            let guard = 0;
            while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
              set.add(`${y}-${String(m).padStart(2, '0')}`);
              m++; if (m > 12) { m = 1; y++; }
            }
          }
          r.generatedMonths = Array.from(set).sort();
        });
        if (!['categories','grid','events'].includes(d.planView)) d.planView = 'categories';
        // Repair missing fields on existing transactions
        d.transactions.forEach(t => {
          if (t.source === undefined) t.source = 'Personal';
          if (t.transferTo === undefined) t.transferTo = '';
          if (t.statusLocked === undefined) t.statusLocked = false;
        });
        return d;
      }

      loadAllData() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const d = JSON.parse(raw);
            if (d.profiles) {
              if (!d.profiles.self) d.profiles.self = this.createDefaultProfile();
              if (!d.profiles.wife) d.profiles.wife = this.createDefaultProfile();
              if (!d.activeProfile || !d.profiles[d.activeProfile]) d.activeProfile = 'self';
              d.profiles.self = this.repairData(this.migrateV2toV3(this.migrateOldData(d.profiles.self)));
              d.profiles.wife = this.repairData(this.migrateV2toV3(this.migrateOldData(d.profiles.wife)));
              return d;
            }
            if (d.transactions !== undefined) {
              return {
                version: APP_VERSION,
                activeProfile: 'self',
                profiles: {
                  self: this.repairData(this.migrateV2toV3(this.migrateOldData(d))),
                  wife: this.createDefaultProfile()
                }
              };
            }
          }
        } catch(e) {}
        return {
          version: APP_VERSION,
          activeProfile: 'self',
          profiles: { self: this.createDefaultProfile(), wife: this.createDefaultProfile() }
        };
      }

      save() {
        try {
          this.allData.profiles[this.allData.activeProfile] = this.data;
          const payload = JSON.stringify(this.allData);
          localStorage.setItem(STORAGE_KEY, payload);
          this._nwCache = null;
        } catch(e) {
          if (e.name === 'QuotaExceededError') {
            this.toast('Storage full. Delete old backups or clear data.', 'err');
          } else {
            this.toast('Failed to save. ' + e.message, 'err');
          }
        }
      }

      init() {
        try {
          // Auto month reset: detect calendar rollover and switch dashboard
          const realMonth = getLocalDateStr().slice(0, 7);
          if (this.data.autoResetMonth && this.data.currentMonth !== realMonth) {
            this.data.currentMonth = realMonth;
            this.alertedCategories.clear();
            this.save();
            this.toast('New month detected. Dashboard reset.', 'ok');
          }
          this.loadTheme();
          this.setDateDisplay(new Date());
          this.updateMonthLabel();
          this.updateYearDisplay();
          this.updateProfileLabel();
          this.renderAddTypeChips();
          this.renderCategoryChips();
          this.renderEventTypeChips();
          this.generateRecurring();
          this.generateRecurringBudgets();
          this.setTab(this.data.currentTab, false);
          const dock = document.getElementById('dockNav');
          if (dock) dock.style.display = 'flex';
          if (!this._listenersAttached) {
            this.setupKeyboardShortcuts();
            this.setupClickOutside();
            this.setupDelegatedEvents();
            this._listenersAttached = true;
          }
          this.updateUndoButton();
          // M7: C1+C2+H3: Auto-refresh lifecycle status every 60s only when Track tab is active
          // Only start interval if currently on track tab; setTab manages start/stop on tab switches
          if (this.data.currentTab === 'track' && !this._lifecycleInterval) {
            this._lifecycleInterval = setInterval(() => {
              if (this.data.currentTab === 'track') this.renderTrack();
            }, 60000);
          }
          // Guard against closing tab with unsaved changes
          window.addEventListener('beforeunload', (e) => {
            if (this.editingTxId || this.editingBudget) {
              e.preventDefault();
              e.returnValue = '';
            }
          });
        } catch (err) {
          console.error('[INIT ERROR]', err.message, err.stack);
          const dock = document.getElementById('dockNav');
          if (dock) dock.style.display = 'flex';
          this.toast('Init error: ' + err.message, 'err');
        }
      }

      setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            this.undo();
            return;
          }
          if (e.key === 'Escape') {
            if (document.getElementById('pickerModal').classList.contains('open')) {
              this.closePicker();
            } else {
              const openModal = document.querySelector('.modal.open');
              if (openModal) this.closeModal(openModal.id);
            }
          }
        });
      }

      setupClickOutside() {
        document.addEventListener('click', (e) => {
          if (!e.target.closest('.input-wrapper')) {
            document.querySelectorAll('.autocomplete-list').forEach(el => el.classList.remove('active'));
          }
        });
      }

      setupDelegatedEvents() {
        const pickerBody = document.getElementById('pickerBody');
        if (pickerBody) {
          pickerBody.addEventListener('click', (e) => {
            const item = e.target.closest('.picker-item');
            const cb = pickerBody._pickerCallback;
            if (item && cb) {
              cb(item.dataset.value);
              this.closePicker();
            }
          });
        }
        document.addEventListener('click', (e) => {
          const item = e.target.closest('.autocomplete-item');
          if (!item) return;
          const action = item.dataset.action;
          const value = item.dataset.value;
          if (action === 'fill-item') this.fillFromPreviousItem(value);
          else if (action === 'fill-auto') this.fillAutocomplete(item.dataset.field, value);
        });
        // C3: Event delegation for grid cells, copy rows, clear-budget rows, copy-month rows
        document.addEventListener('click', (e) => {
          const quickTile = e.target.closest('.quick-add-tile[data-action="quick-fill"]');
          if (quickTile) {
            this.quickFill(quickTile.dataset.item);
            return;
          }
          const gridCell = e.target.closest('.annual-cell[data-grid-type]');
          if (gridCell) {
            const type = gridCell.dataset.gridType;
            const month = gridCell.dataset.gridMonth;
            if (type && month) this.openBudgetModal(type, month);
            return;
          }
          const copyRow = e.target.closest('.copy-tx-row[data-copy-id]');
          if (copyRow) {
            this.toggleCopySelect(copyRow.dataset.copyId);
            return;
          }
          const copyTypeRow = e.target.closest('.copy-tx-row[data-copy-type]');
          if (copyTypeRow) {
            this.toggleCopyTypeSelect(copyTypeRow.dataset.copyType);
            return;
          }
          const copyMonthRow = e.target.closest('.copy-tx-row[data-copy-month]');
          if (copyMonthRow) {
            this.toggleCopyMonthSelect(copyMonthRow.dataset.copyMonth);
            return;
          }
          const clearMonthRow = e.target.closest('.copy-tx-row[data-clear-month]');
          if (clearMonthRow) {
            this.toggleClearBudgetMonth(clearMonthRow.dataset.clearMonth);
            return;
          }
          const backupClearExpenseRow = e.target.closest('.copy-tx-row[data-backup-clear-expense-month]');
          if (backupClearExpenseRow) {
            this.toggleBackupClearExpenseMonth(backupClearExpenseRow.dataset.backupClearExpenseMonth);
            return;
          }
          const backupClearBudgetRow = e.target.closest('.copy-tx-row[data-backup-clear-budget-month]');
          if (backupClearBudgetRow) {
            this.toggleBackupClearBudgetMonth(backupClearBudgetRow.dataset.backupClearBudgetMonth);
            return;
          }
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            const el = e.target.closest('[role="button"], .collapse-toggle');
            if (el && el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.tagName !== 'INPUT') {
              e.preventDefault();
              el.click();
            }
          }
        });
      }

      loadTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved) {
          document.documentElement.setAttribute('data-theme', saved);
        } else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        }
      }

      toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
      }

      icon(name) {
        const i = {
          check:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
          x:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
          trash:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
          plus:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
          edit:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>'
        };
        return i[name] || '';
      }

      setTab(tab, scroll = true) {
        // C1+C2+H3: Clear lifecycle interval when leaving Track tab; start when entering
        if (this.data.currentTab === 'track' && tab !== 'track' && this._lifecycleInterval) {
          clearInterval(this._lifecycleInterval);
          this._lifecycleInterval = null;
        }
        if (this.data.currentTab !== 'track' && tab === 'track' && !this._lifecycleInterval) {
          this._lifecycleInterval = setInterval(() => {
            if (this.data.currentTab === 'track') this.renderTrack();
          }, 60000);
        }
        this.data.currentTab = tab;
        // Dock now has 5 screen buttons (Add is the center FAB, not a dock-btn).
        const dockOrder = ['home', 'plan', 'history', 'reports'];
        const btns = document.querySelectorAll('.dock-btn');
        btns.forEach(b => b.classList.remove('on'));
        // Map: btn[0]=home, btn[1]=plan, btn[2]=history, btn[3]=reports.
        const dockIdx = dockOrder.indexOf(tab);
        if (dockIdx >= 0 && dockIdx < btns.length) btns[dockIdx].classList.add('on');
        // The Add FAB is redundant while already on the Add screen; hide it there
        // so it never overlaps the Save/Clear bar.
        const fab = document.querySelector('.dock-fab');
        if (fab) fab.style.display = (tab === 'add') ? 'none' : 'flex';
        const sections = ['homeSection','addSection','planSection','trackSection','historySection','reportsSection'];
        const tabs = ['home','add','plan','track','history','reports'];
        sections.forEach((id, i) => {
          const el = document.getElementById(id);
          if (el) el.style.display = tab === tabs[i] ? 'block' : 'none';
        });

        if (scroll) {
          const mainScroll = document.getElementById('mainScroll');
          if (mainScroll) mainScroll.scrollTop = 0;
        }
        this.renderAll();
      }

      onAddTabClick() { this.resetForm(); this.setTab('add'); this.renderQuickAdd(); }

      renderAll() {
        try {
          this.updateMonthLabel();
          this.updateProfileLabel();
          if (this.data.currentTab === 'home') this.renderDashboard();
          if (this.data.currentTab === 'plan') {
            const planCategories = document.getElementById('planCategories');
            const planGrid = document.getElementById('planGrid');
            const planEvents = document.getElementById('planEvents');
            const planYearBar = document.getElementById('planYearBar');
            const view = this.data.planView || 'categories';
            if (planCategories) planCategories.style.display = view === 'categories' ? 'block' : 'none';
            if (planGrid) planGrid.style.display = view === 'grid' ? 'block' : 'none';
            if (planEvents) planEvents.style.display = view === 'events' ? 'block' : 'none';
            if (planYearBar) planYearBar.style.display = view === 'grid' ? 'flex' : 'none';
            const segContainer = document.querySelector('#planSection .segmented');
            if (segContainer) {
              segContainer.querySelectorAll('.segmented-btn').forEach(b => {
                const onclick = b.getAttribute('onclick') || '';
                if (onclick.includes(`'${view}'`)) b.classList.add('on');
                else b.classList.remove('on');
              });
            }
            this.renderPlan();
          }
          if (this.data.currentTab === 'track') {
            this.renderTrack();
          }
          if (this.data.currentTab === 'history') this.renderHistory();
          if (this.data.currentTab === 'reports') this.renderReports();
        } catch (e) {
          console.error('[RENDER ALL]', e);
        }
      }

      updateMonthLabel() {
        const el = document.getElementById('currentMonthLabel');
        if (!el) return;
        const [y, m] = (this.data.currentMonth || '').split('-');
        if (!y || !m) return;
        const date = new Date(Number(y), Number(m) - 1);
        el.textContent = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      updateProfileLabel() {
        const el = document.getElementById('currentProfileLabel');
        if (el) el.textContent = this.allData.activeProfile === 'self' ? 'Self' : 'Joint W/ Spouse';
      }

      updateYearDisplay() {
        const el = document.getElementById('planYearDisplay');
        if (el) el.textContent = this.data.planYear || '';
      }

      setDateDisplay(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const txDate = document.getElementById('txDate');
        const txDateDisplay = document.getElementById('txDateDisplay');
        const dateStr = `${y}-${m}-${d}`;
        if (txDate) txDate.value = dateStr;
        if (txDateDisplay) txDateDisplay.textContent = this.fmtDateShort(dateStr);
      }

      /** Format YYYY-MM-DD into readable local date for pickers */
      fmtDateShort(dateStr) {
        if (!dateStr) return 'Select Date';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return 'Select Date';
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      }

      openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        this._lastFocused = document.activeElement;
        el.classList.add('open');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          const focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable) focusable.focus();
        });
        // Abort any previous focus-trap controller to prevent duplicate listeners
        if (el._focusTrapAc) {
          el._focusTrapAc.abort();
          el._focusTrapAc = null;
        }
        el._focusTrapAc = new AbortController();
        const trap = (e) => {
          if (e.key !== 'Tab') return;
          const focusables = Array.from(el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        };
        el.addEventListener('keydown', trap, { signal: el._focusTrapAc.signal });
      }

      closeModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('open');
        // Abort focus-trap controller to remove listener regardless of open state
        if (el._focusTrapAc) {
          el._focusTrapAc.abort();
          el._focusTrapAc = null;
        }

        if (!document.querySelector('.modal.open')) {
          document.body.style.overflow = '';
          if (this._lastFocused && this._lastFocused.focus) {
            requestAnimationFrame(() => this._lastFocused.focus());
          }
        }
      }

      openPicker(title, items, callback, currentValue) {
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (!pickerTitle || !pickerBody) return;
        // Store callback on the element itself for closure-scoped isolation
        pickerBody._pickerCallback = callback;
        pickerTitle.textContent = title;
        pickerBody.innerHTML = '<div class="picker-list">' + items.map(item => {
          const isOn = item.value === currentValue ? 'on' : '';
          return `<div class="picker-item ${isOn}" data-value="${this.esc(String(item.value))}">${this.esc(item.label)}</div>`;
        }).join('') + '</div>';
        this.openModal('pickerModal');
        setTimeout(() => {
          const sel = pickerBody.querySelector('.picker-item.on');
          if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
        }, 50);
      }

      closePicker() {
        const pickerBody = document.getElementById('pickerBody');
        if (pickerBody) pickerBody._pickerCallback = null;
        this.closeModal('pickerModal');
      }

      openDatePicker() {
        const current = document.getElementById('txDate').value || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          const on = val === cd ? 'on' : '';
          daysHtml += `<div class="picker-item ${on}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          const on = val === cm ? 'on' : '';
          monthsHtml += `<div class="picker-item ${on}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const currentYear = new Date().getFullYear(); for (let y = currentYear - 10; y <= currentYear + 10; y++) {
          const val = String(y);
          const on = val === cy ? 'on' : '';
          yearsHtml += `<div class="picker-item ${on}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = 'Select Date';
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmDatePick()">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      pickDatePart(el) {
        const col = el.dataset.col;
        document.querySelectorAll(`[data-col="${col}"]`).forEach(e => e.classList.remove('on'));
        el.classList.add('on');
      }

      confirmDatePick() {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || '2026';
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) {
          dateObj = new Date(year, month, 0);
        }
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const txDate = document.getElementById('txDate');
        const txDateDisplay = document.getElementById('txDateDisplay');
        if (txDate) txDate.value = dateStr;
        if (txDateDisplay) txDateDisplay.textContent = this.fmtDateShort(dateStr);
        this.closePicker();
      }

      openMonthPicker() {
        const items = [];
        for (let y = 2020; y <= 2040; y++) {
          for (let m = 1; m <= 12; m++) {
            const val = `${y}-${String(m).padStart(2, '0')}`;
            const label = new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            items.push({ value: val, label });
          }
        }
        this.openPicker('Select Month', items, (val) => {
          this.data.currentMonth = val;
          this.save();
          this.updateMonthLabel();
          this.alertedCategories.clear();
          this.generateRecurring();
          this.generateRecurringBudgets();
          this.renderAll();
          this.toast('Month updated', 'ok');
          setTimeout(() => this.checkSpendingAlerts(), 100);
        }, this.data.currentMonth);
      }

      openYearPicker() {
        const items = [];
        for (let y = 2026; y <= 2066; y++) {
          items.push({ value: String(y), label: String(y) });
        }
        this.openPicker('Select Year', items, (val) => {
          this.setPlanYear(parseInt(val));
        }, String(this.data.planYear));
      }

      openProfilePicker() {
        const items = Object.keys(this.allData.profiles).map(pid => ({
          value: pid,
          label: pid === 'self' ? 'Self' : pid === 'wife' ? 'Joint W/ Spouse' : this.esc(pid)
        }));
        this.openPicker('Select Profile', items, (val) => {
          if (val !== this.allData.activeProfile) {
            this.switchProfile(val);
          }
        }, this.allData.activeProfile);
      }

      switchProfile(profileId) {
        // Close any open modals/pickers to prevent stale-profile data writes
        document.querySelectorAll('.modal.open').forEach(m => this.closeModal(m.id));
        this.closePicker();
        if (!this.allData.profiles[profileId]) return;
        this.allData.activeProfile = profileId;
        this.data = this.allData.profiles[profileId];
        this.save();
        this.editingTxId = null;
        this.confirmCallback = null;
        this.copySelected = new Set();
        this.copyBudgetSelected = new Set();
        this.copyTargetMonths = new Set();
        this.alertedCategories.clear();
        this.historyFilterType = 'all';
        this.historyQuickFilter = null;
        this.historyEventId = null;
        this.historySourceFilter = null;
        this.historySearchQuery = '';
        this.historyOffset = 0;
        // M8: Clear date filters and search on profile switch
        const hFrom = document.getElementById('historyDateFrom');
        const hTo = document.getElementById('historyDateTo');
        const hFromDisp = document.getElementById('historyDateFromDisplay');
        const hToDisp = document.getElementById('historyDateToDisplay');
        const hSearch = document.getElementById('historySearch');
        if (hFrom) hFrom.value = '';
        if (hTo) hTo.value = '';
        if (hFromDisp) hFromDisp.textContent = 'From Date';
        if (hToDisp) hToDisp.textContent = 'To Date';
        if (hSearch) hSearch.value = '';
        this.reportType = 'summary';
        this.trackFilter = 'all';
        this.bmItems = [];
        this.bmCollapsed = {};
        this.planExpandedTypes = new Set();
        this._nwCache = null;
        this.clearBudgetMonths = new Set();
        this.historyQuickFilter = null;
        this.gridMode = 'calendar';
        this.resetForm();
        this.init();
        this.toast(`Switched to ${profileId === 'self' ? 'Self' : 'Joint W/ Spouse'}`, 'ok');
      }

      // ===== UNDO SYSTEM =====
      pushUndo(label) {
        this._nwCache = null;
        if (!this.data.undoStack) this.data.undoStack = [];
        const snapshot = JSON.parse(JSON.stringify({ ...this.data, undoStack: undefined }));
        this.data.undoStack.push({ label, snapshot, timestamp: Date.now() });
        if (this.data.undoStack.length > 30) this.data.undoStack.shift();
        this.updateUndoButton();
      }

      undo() {
        if (!this.data.undoStack || this.data.undoStack.length === 0) {
          this.toast('Nothing to undo', 'err');
          return;
        }
        const action = this.data.undoStack.pop();
        const currentStack = this.data.undoStack;
        // H2: Full object replacement to prevent stale keys
        const restored = JSON.parse(JSON.stringify(action.snapshot));
        // Preserve only the undo stack
        restored.undoStack = currentStack;
        this.data = restored;
        // M2: Clear net worth cache on undo
        this._nwCache = null;
        this.save();
        this.renderAll();
        this.updateUndoButton();
        this.toast(`Undone: ${action.label}`, 'ok');
      }

      updateUndoButton() {
        const btn = document.getElementById('undoBtn');
        if (!btn) return;
        const can = this.data.undoStack && this.data.undoStack.length > 0;
        btn.style.opacity = can ? '1' : '0.35';
        btn.style.pointerEvents = can ? 'auto' : 'none';
      }
      // ===== END UNDO SYSTEM =====

      selectTypeChip(btn) {
        const val = btn.dataset.val;
        const txType = document.getElementById('txType');
        if (txType) txType.value = val;
        document.querySelectorAll('#txTypeChips .add-chip').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        this.handleTypeChange();
      }

      renderCategoryChips() {
        const txType = document.getElementById('txType');
        const container = document.getElementById('txCategoryChips');
        const txCategory = document.getElementById('txCategory');
        if (!txType || !container) return;
        const type = txType.value;
        const cats = (this.data.typeCategories || TYPE_CATEGORIES)[type] || [];
        const current = txCategory ? txCategory.value : '';
        if (cats.length === 0) {
          container.innerHTML = '<span style="font-size:12px;color:var(--text-tertiary);padding:6px 0;">Select an expense type first</span>';
          return;
        }
        container.innerHTML = cats.map(c => {
          const isOn = c === current ? 'on' : '';
          return `<button type="button" class="add-chip ${isOn}" data-cat="${this.esc(c)}" onclick="app.selectCategoryChip(this)">${this.esc(c)}</button>`;
        }).join('');
      }

      renderAddTypeChips() {
        const container = document.getElementById('txTypeChips');
        const txType = document.getElementById('txType');
        if (!container) return;
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        const current = txType ? txType.value : 'Earning';
        container.innerHTML = types.map(type => {
          const isOn = type === current ? 'on' : '';
          return `<button type="button" class="add-chip ${isOn}" data-val="${this.esc(type)}" onclick="app.selectTypeChip(this)">${this.esc(type)}</button>`;
        }).join('');
      }

      renderEventTypeChips() {
        const container = document.getElementById('eventTypeChips');
        const eventTypes = document.getElementById('eventTypes');
        if (!container) return;
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        const selected = (eventTypes ? eventTypes.value : '').split(',').filter(Boolean);
        const activeSet = selected.length > 0 ? new Set(selected) : new Set(types);
        container.innerHTML = types.map(type => {
          const isOn = activeSet.has(type) ? 'on' : '';
          return `<button type="button" class="chip ${isOn}" data-type="${this.esc(type)}" onclick="app.toggleEventTypeChip(this)">${this.esc(type)}</button>`;
        }).join('');
        if (eventTypes && !eventTypes.value) {
          eventTypes.value = types.join(',');
        }
      }

      selectCategoryChip(btn) {
        const val = btn.dataset.cat;
        const txCategory = document.getElementById('txCategory');
        if (txCategory) txCategory.value = val;
        document.querySelectorAll('#txCategoryChips .add-chip').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
      }

      toggleCollapse(toggleEl, targetId) {
        const target = document.getElementById(targetId);
        if (!target || !toggleEl) return;
        const isOpen = target.classList.contains('open');
        target.classList.toggle('open', !isOpen);
        toggleEl.classList.toggle('open', !isOpen);
        toggleEl.setAttribute('aria-expanded', String(!isOpen));
      }

      handleTypeChange() {
        const type = document.getElementById('txType').value;
        const txCategory = document.getElementById('txCategory');
        if (txCategory) txCategory.value = '';
        this.renderCategoryChips();
        this.renderBudgetQuickItems();
        const txEventId = document.getElementById('txEventId');
        const txEventDisplay = document.getElementById('txEventDisplay');
        if (txEventId) txEventId.value = '';
        if (txEventDisplay) txEventDisplay.textContent = 'Select Event';
        const transferField = document.getElementById('txTransferToField');
        if (transferField) transferField.style.display = type === 'Transfer' ? 'block' : 'none';
        if (type === 'Transfer') {
          const autoCat = this.isSelfProfile() ? 'Personal to Joint' : 'Joint to Personal';
          const cats = TYPE_CATEGORIES['Transfer'] || [];
          if (cats.includes(autoCat)) {
            if (txCategory) txCategory.value = autoCat;
            this.renderCategoryChips();
          }
          const txTransferTo = document.getElementById('txTransferTo');
          const txTransferToDisplay = document.getElementById('txTransferToDisplay');
          const autoTarget = this.isSelfProfile() ? 'joint' : 'personal';
          const autoTargetName = this.isSelfProfile() ? 'Joint Account' : 'Personal Account';
          if (txTransferTo) txTransferTo.value = autoTarget;
          if (txTransferToDisplay) txTransferToDisplay.textContent = autoTargetName;
        }
      }

      renderBudgetQuickItems() {
        const type = document.getElementById('txType').value;
        const month = this.data.currentMonth;
        const typeBudget = this.data.budgets[type] || {};
        const monthData = typeBudget[month] || { items: [] };
        const container = document.getElementById('txBudgetChips');
        if (!container) return;
        const items = (monthData.items || []).filter(i => i.name || i.amount);
        if (items.length === 0) {
          container.innerHTML = '<span style="font-size:12px;color:var(--text-tertiary);padding:6px 0;">No budget items for this type this month</span>';
          return;
        }
        container.innerHTML = items.map((it, idx) => {
          return `<button type="button" class="add-chip" onclick="app.fillFromBudgetItem('${this.esc(type)}', ${idx})">${this.esc(it.name || 'Unnamed')} · ${this.fmt(it.amount || 0)}</button>`;
        }).join('');
      }

      fillFromBudgetItem(type, idx) {
        const month = this.data.currentMonth;
        const typeBudget = this.data.budgets[type] || {};
        const monthData = typeBudget[month] || { items: [] };
        const item = monthData.items[idx];
        if (!item) return;
        if (item.name) document.getElementById('txItem').value = item.name;
        if (item.amount) document.getElementById('txAmount').value = item.amount;
        if (item.category) {
          const txCategory = document.getElementById('txCategory');
          if (txCategory) txCategory.value = item.category;
          this.renderCategoryChips();
        }
        this.toast('Auto-filled from budget', 'ok');
      }

      handleItemAutocomplete(input) {
        const val = input.value.toLowerCase();
        const list = document.getElementById('ac-item');
        if (!val) { if (list) list.classList.remove('active'); return; }
        const items = [...new Set(this.data.transactions.filter(t => t.item && t.item.toLowerCase().includes(val)).map(t => t.item))].slice(0, 5);
        if (items.length === 0) { if (list) list.classList.remove('active'); return; }
        if (list) {
          list.innerHTML = items.map(item => {
            return `<div class="autocomplete-item" data-action="fill-item" data-value="${this.esc(item)}">${this.esc(item)}</div>`;
          }).join('');
          list.classList.add('active');
        }
      }

      fillFromPreviousItem(itemName) {
        const matches = this.data.transactions.filter(t => t.item === itemName).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (matches.length === 0) return;
        const t = matches[0];
        const txItem = document.getElementById('txItem');
        if (txItem) txItem.value = t.item || '';
        if (t.amount) {
          const txAmount = document.getElementById('txAmount');
          if (txAmount) txAmount.value = t.amount;
        }
        if (t.type) {
          const txType = document.getElementById('txType');
          if (txType) txType.value = t.type;
          document.querySelectorAll('#txTypeChips .add-chip').forEach(b => {
            b.classList.toggle('on', b.dataset.val === t.type);
          });
          this.handleTypeChange();
        }
        if (t.category) {
          const txCategory = document.getElementById('txCategory');
          if (txCategory) txCategory.value = t.category;
          this.renderCategoryChips();
        }
        if (t.mode) {
          const txMode = document.getElementById('txMode');
          const txModeDisplay = document.getElementById('txModeDisplay');
          if (txMode) txMode.value = t.mode;
          if (txModeDisplay) txModeDisplay.textContent = t.mode;
          const subModes = PAYMENT_MODES[t.mode] || [];
          const txSubMode = document.getElementById('txSubMode');
          const txSubModeDisplay = document.getElementById('txSubModeDisplay');
          if (subModes.length === 0) {
            if (txSubMode) txSubMode.value = 'None';
            if (txSubModeDisplay) txSubModeDisplay.textContent = 'None';
          } else if (t.subMode) {
            if (txSubMode) txSubMode.value = t.subMode;
            if (txSubModeDisplay) txSubModeDisplay.textContent = t.subMode;
          } else {
            if (txSubMode) txSubMode.value = '';
            if (txSubModeDisplay) txSubModeDisplay.textContent = 'Select Sub-mode';
          }
        }
        if (t.vendor) {
          const txVendor = document.getElementById('txVendor');
          if (txVendor) txVendor.value = t.vendor;
        }
        if (t.brand) {
          const txBrand = document.getElementById('txBrand');
          if (txBrand) txBrand.value = t.brand;
        }
        if (t.transferTo) {
          const txTransferTo = document.getElementById('txTransferTo');
          const txTransferToDisplay = document.getElementById('txTransferToDisplay');
          if (txTransferTo) txTransferTo.value = t.transferTo;
          const acc = this.data.accounts.find(a => a.id === t.transferTo);
          if (txTransferToDisplay) txTransferToDisplay.textContent = acc ? acc.name : 'Select Account';
        }
        if (t.eventId) {
          const txEventId = document.getElementById('txEventId');
          const txEventDisplay = document.getElementById('txEventDisplay');
          if (txEventId) txEventId.value = t.eventId;
          const evt = this.data.events.find(e => e.id === t.eventId);
          if (txEventDisplay) txEventDisplay.textContent = evt ? evt.name : 'Select Event';
        }
        const acItem = document.getElementById('ac-item');
        if (acItem) acItem.classList.remove('active');
        this.toast('Auto-filled from previous expense', 'ok');
      }

      // Quick Add: surface the most recent distinct items as one-tap tiles that
      // prefill the whole form (type/category/item/mode/vendor/brand), leaving
      // only the amount to enter. Reuses fillFromPreviousItem for the actual fill.
      renderQuickAdd() {
        const wrap = document.getElementById('quickAddWrap');
        const row = document.getElementById('quickAddRow');
        if (!row || !wrap) return;
        const seen = new Set();
        const recent = [];
        // newest first, skip transfers/split parents, dedupe by item name
        [...this.data.transactions]
          .filter(t => t && t.item && t.type !== 'Transfer' && !t.isSplitParent && !t.mirrorOf)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .forEach(t => {
            const key = t.item.trim().toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            if (recent.length < 8) recent.push(t);
          });
        if (recent.length === 0) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        row.innerHTML = recent.map(t => {
          const label = this.esc(t.item.length > 16 ? t.item.slice(0, 15) + '…' : t.item);
          const sub = this.esc(t.category || t.type || '');
          return `<button type="button" class="add-chip quick-add-tile" data-action="quick-fill" data-item="${this.esc(t.item)}">
            <span style="font-weight:700;">${label}</span>${sub ? `<span style="opacity:0.6;font-size:9px;margin-left:5px;">${sub}</span>` : ''}
          </button>`;
        }).join('');
      }

      quickFill(itemName) {
        this.fillFromPreviousItem(itemName);
        // Clear the amount so the user enters a fresh value, and focus it.
        const txAmount = document.getElementById('txAmount');
        if (txAmount) { txAmount.value = ''; txAmount.focus(); }
        this.toast('Prefilled — enter amount', 'ok');
      }

      txSum(txs) {
        if (!Array.isArray(txs)) return 0;
        return txs.reduce((s, t) => s + (t && t.isSplitParent ? 0 : (t.amount || 0)), 0);
      }
      txDisplayAmount(t) {
        if (!t) return 0;
        return t.isSplitParent ? (t.splitTotal || 0) : (t.amount || 0);
      }

      renderDashboard() {
        const month = this.data.currentMonth;
        const txs = this.data.transactions.filter(t => t && t.date && t.date.startsWith(month));
        const spent = this.txSum(txs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)));

        let budget = 0;
        Object.entries(this.data.budgets).forEach(([typeKey, type]) => { if (typeKey !== 'Earning' && type && type[month]) budget += type[month].amount || 0; });

        const dashSpent = document.getElementById('dashSpent');
        const dashBudget = document.getElementById('dashBudget');
        if (dashSpent) dashSpent.textContent = this.fmt(spent);
        if (dashBudget) dashBudget.textContent = this.fmt(budget);

        const remaining = budget - spent;
        const sub = document.getElementById('dashBudgetSub');
        if (sub) {
          sub.textContent = remaining >= 0 ? `Remaining ${this.fmt(remaining)}` : `Over by ${this.fmt(Math.abs(remaining))}`;
        }
        const dashBudgetCard = document.getElementById('dashBudgetCard');
        if (dashBudgetCard) dashBudgetCard.className = 'summary-card ' + (remaining < 0 ? 'danger' : remaining < budget * 0.2 ? 'warning' : '');

        const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
        const fill = document.getElementById('dashProgressFill');
        if (fill) {
          fill.style.width = pct + '%';
          fill.className = 'progress-fill ' + (remaining < 0 ? 'danger' : remaining < budget * 0.2 ? 'warning' : '');
        }
        const dashProgressValue = document.getElementById('dashProgressValue');
        if (dashProgressValue) dashProgressValue.textContent = (budget > 0 ? Math.round((spent / budget) * 100) : 0) + '%';
        const dashProgressSub = document.getElementById('dashProgressSub');
        if (dashProgressSub) dashProgressSub.textContent = `${this.fmt(spent)} spent · ${this.fmt(budget)} budget`;

        const typeTotals = {};
        txs.forEach(t => {
          if (!t || t.isSplitParent) return;
          const type = t.type || 'Other';
          typeTotals[type] = (typeTotals[type] || 0) + (t.amount || 0);
        });
        const typeBudgets = {};
        Object.entries(this.data.budgets).forEach(([type, months]) => { if (months && months[month]) typeBudgets[type] = months[month].amount || 0; });

        const types = Object.keys(typeTotals).length;
        const dashCategoryCount = document.getElementById('dashCategoryCount');
        if (dashCategoryCount) dashCategoryCount.textContent = `${types} / ${(this.data.expenseTypes || EXPENSE_TYPES).length}`;

        const container = document.getElementById('dashCategories');
        if (container) {
          if (types === 0) {
            container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No expenses this month</div>';
          } else {
            container.innerHTML = Object.entries(typeTotals).map(([type, amount]) => {
              const b = typeBudgets[type] || 0;
              const p = b > 0 ? Math.min((amount / b) * 100, 100) : 0;
              const cls = p > 90 ? 'danger' : p > 75 ? 'warning' : '';
              const comp = this.getMonthlyComparison(type);
              const compBadge = comp.prevSpent > 0
                ? `<span style="font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px;${comp.diff >= 0 ? 'background:var(--danger-soft);color:var(--danger);' : 'background:var(--success-soft);color:var(--success);'}">${comp.diff >= 0 ? '+' : ''}${comp.pct}%</span>`
                : '';
              const typeBudgetData = (this.data.budgets[type] || {})[month] || { amount: 0, items: [] };
              const fixedB = (typeBudgetData.items || []).reduce((s, i) => s + ((i.frequency && i.frequency !== 'One-time') ? (i.amount || 0) : 0), 0);
              const fixedPct = b > 0 ? Math.round((fixedB / b) * 100) : 0;
              return `
                <div style="margin-bottom:12px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:12px;font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${this.esc(type)}${compBadge}${fixedPct > 0 ? `<span style="font-size:9px;color:var(--text-tertiary);font-weight:700;background:var(--bg);padding:1px 5px;border-radius:8px;border:1px solid var(--glass-border-dark);">${fixedPct}% fixed</span>` : ''}</span>
                    <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(amount)} ${b ? '/ ' + this.fmt(b) : ''}</span>
                  </div>
                  <div class="progress-track"><div class="progress-fill ${cls}" style="width:${p}%"></div></div>
                </div>`;
            }).join('');
          }
        }

        // Tracked Expenses by Type and Category
        const expenseTxs = this.data.transactions.filter(t => t && t.date && t.date.startsWith(month) && !t.isSplitParent && ['Essential','Non-essential','Vacation'].includes(t.type));
        const trackedContainer = document.getElementById('dashTracked');
        const trackedCount = document.getElementById('dashTrackedCount');
        if (trackedCount) trackedCount.textContent = expenseTxs.length;
        if (trackedContainer) {
          if (expenseTxs.length === 0) {
            trackedContainer.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No tracked expenses this month</div>';
          } else {
            const byType = {};
            expenseTxs.forEach(t => {
              if (!byType[t.type]) byType[t.type] = {};
              if (!byType[t.type][t.category || 'Uncategorized']) byType[t.type][t.category || 'Uncategorized'] = 0;
              byType[t.type][t.category || 'Uncategorized'] += t.amount || 0;
            });
            trackedContainer.innerHTML = Object.entries(byType).map(([type, cats]) => {
              const typeTotal = Object.values(cats).reduce((a,b) => a+b, 0);
              const typeBudget = (this.data.budgets[type] || {})[month]?.amount || 0;
              const typePct = typeBudget > 0 ? Math.min((typeTotal / typeBudget) * 100, 100) : 0;
              const typeCls = typePct > 90 ? 'danger' : typePct > 75 ? 'warning' : '';
              return `
                <div style="margin-bottom:14px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:12px;font-weight:600;">${this.esc(type)}</span>
                    <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(typeTotal)} ${typeBudget ? '/ ' + this.fmt(typeBudget) : ''}</span>
                  </div>
                  <div class="progress-track" style="margin-bottom:8px;"><div class="progress-fill ${typeCls}" style="width:${typePct}%"></div></div>
                  <div style="display:flex;flex-direction:column;gap:4px;padding-left:8px;border-left:2px solid var(--glass-border-dark);">
                    ${Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => {
                      const catBudget = ((this.data.budgets[type] || {})[month]?.items || []).filter(i => i.category === cat).reduce((s,i) => s + (i.amount || 0), 0);
                      const catPct = catBudget > 0 ? Math.min((amt / catBudget) * 100, 100) : 0;
                      const catCls = catPct > 90 ? 'danger' : catPct > 75 ? 'warning' : '';
                      return `
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                          <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.esc(cat)}</span>
                          <span style="font-size:11px;font-weight:600;">${this.fmt(amt)} ${catBudget ? '/ ' + this.fmt(catBudget) : ''}</span>
                        </div>
                        ${catBudget > 0 ? `<div class="progress-track" style="height:2px;margin-bottom:4px;"><div class="progress-fill ${catCls}" style="width:${catPct}%"></div></div>` : ''}
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }).join('');
          }
        }

        this.renderActiveEvents();
        this.renderNetWorth();
        this.renderGoals();
        this.renderAccountsSummary();
        setTimeout(() => this.checkSpendingAlerts(), 200);
      }

      /** Color-coded type badge (two-letter abbrev). sizeStyle for inline size overrides. */
      typeIcon(type, sizeStyle = '') {
        const s = typeStyle(type);
        const ab = typeAbbrev(type || 'Other');
        // CSS custom props let the stylesheet swap to dark variants in dark mode.
        const vars = `--tbg:${s.bg};--tfg:${s.fg};--tbg-d:${s.dbg};--tfg-d:${s.dfg};`;
        return `<div class="tx-icon type-badge" style="${vars}${sizeStyle}">${ab}</div>`;
      }

      txRow(t) {
        if (!t) return '';
        const type = t.type || 'Other';
        const evt = t.eventId ? this.data.events.find(e => e.id === t.eventId) : null;
        const srcBadge = (t.source === 'Joint Account' && this.isSelfProfile()) ? '<span style="font-size:8px;background:var(--bg);color:var(--text-secondary);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">J</span>' : '';
        const xferBadge = (t.type === 'Transfer' && t.category) ? `<span style="font-size:8px;background:var(--bg);color:var(--text-secondary);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">${this.esc(t.category)}</span>` : '';
        const earnBadge = (t.type === 'Earning' && t.mirrorOf) ? '<span style="font-size:8px;background:var(--success-soft);color:var(--success);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">Transfer In</span>' : '';
        const recBadge = t.recurringId ? '<span style="font-size:8px;background:var(--bg);color:var(--success);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">R</span>' : '';
        const splitBadge = t.isSplitParent ? '<span style="font-size:8px;background:var(--bg);color:var(--text-secondary);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">S</span>' : '';
        const isIncome = (t.type === 'Earning');
        const isExpense = !isIncome && t.type !== 'Transfer';
        const amtClass = isIncome ? 'tx-amount income' : (isExpense ? 'tx-amount expense' : 'tx-amount');
        const sign = isIncome ? '+' : (isExpense ? '\u2212' : '');
        return `
          <div class="tx-item" onclick="app.editTransaction('${t.id}')">
            ${this.typeIcon(type)}
            <div class="tx-content">
              <div class="tx-title">${this.esc(t.item || 'Untitled')}${srcBadge}${recBadge}${splitBadge}${xferBadge}${earnBadge}</div>
              <div class="tx-meta">${this.esc(type)} · ${this.esc(t.category || '')}${t.mode ? ' · ' + this.esc(t.mode) : ''}${t.subMode ? ' · ' + this.esc(t.subMode) : ''} · ${t.date.slice(8)}${t.vendor ? ' · ' + this.esc(t.vendor) : ''}${evt ? ' · ' + this.esc(evt.name) : ''}</div>
            </div>
            <div class="${amtClass}">${sign}${this.fmt(this.txDisplayAmount(t))}</div>
          </div>`;
      }

      selectFreq(val, btn) {
        const txFrequency = document.getElementById('txFrequency');
        if (txFrequency) txFrequency.value = val;
        document.querySelectorAll('#txFreqToggle .type-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
      }

      handleAutocomplete(field, input) {
        const val = input.value.toLowerCase();
        const list = document.getElementById(`ac-${field}`);
        if (!val) { if (list) list.classList.remove('active'); return; }
        const items = [...new Set(this.data.transactions.filter(t => t && t[field] && t[field].toLowerCase().includes(val)).map(t => t[field]))].slice(0, 5);
        if (items.length === 0) { if (list) list.classList.remove('active'); return; }
        if (list) {
          list.innerHTML = items.map(item => {
            return `<div class="autocomplete-item" data-action="fill-auto" data-field="${this.esc(field)}" data-value="${this.esc(item)}">${this.esc(item)}</div>`;
          }).join('');
          list.classList.add('active');
        }
      }

      fillAutocomplete(field, val) {
        const el = document.getElementById(`tx${field.charAt(0).toUpperCase() + field.slice(1)}`);
        if (el) el.value = val;
        const list = document.getElementById(`ac-${field}`);
        if (list) list.classList.remove('active');
      }

      validateTransaction(t) {
        if (!t) return false;
        if (!t.type || !(this.data.expenseTypes || EXPENSE_TYPES).includes(t.type)) return false;
        if (!t.category) return false;
        // Validate category belongs to the selected type
        const validCats = (this.data.typeCategories || TYPE_CATEGORIES)[t.type] || [];
        // M1: Grandfather existing categories from historical transactions
        const allTxCats = new Set();
        const profile = this.allData.activeProfile;
        const txs = this.data.transactions || [];
        (Array.isArray(txs) ? txs : []).forEach(tx => {
          if (tx && tx.type === t.type && tx.category) allTxCats.add(tx.category);
        });
        const isValidCat = validCats.includes(t.category) || allTxCats.has(t.category);
        if (!isValidCat) return false;
        if (!t.date || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return false;
        const amt = parseFloat(t.amount);
        if (isNaN(amt) || amt < 0) return false;
        return true;
      }

      sanitizeAmount(val) {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        let str = String(val).replace(/[^0-9.]/g, '');
        const firstDot = str.indexOf('.');
        if (firstDot !== -1) {
          str = str.slice(0, firstDot + 1) + str.slice(firstDot + 1).replace(/\./g, '');
        }
        const num = parseFloat(str);
        return isNaN(num) || num < 0 ? 0 : num;
      }

      buildSplitTransactions(mainTx, originalAmount) {
        const rows = document.querySelectorAll('#txSplitList .item-row');
        const splits = [];
        let total = 0;
        rows.forEach(row => {
          const cat = (row.querySelector('.split-cat')?.value || '').trim();
          const amt = this.sanitizeAmount(row.querySelector('.split-amt')?.value);
          if (cat && amt > 0) {
            splits.push({ cat, amt });
            total += amt;
          }
        });
        const mainAmt = originalAmount || this.sanitizeAmount(document.getElementById('txAmount').value);
        if (splits.length === 0) {
          this.toast('Add at least one split', 'err');
          return null;
        }
        if (mainAmt > 0 && Math.abs(total - mainAmt) > 0.01) {
          this.toast('Split total must equal transaction amount', 'err');
          return null;
        }
        const groupId = mainTx.id;
        return splits.map((s, i) => ({
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5) + '_' + i,
          date: mainTx.date,
          amount: s.amt,
          item: mainTx.item + ' (' + s.cat + ')',
          vendor: mainTx.vendor,
          brand: mainTx.brand,
          mode: mainTx.mode,
          subMode: mainTx.subMode,
          type: mainTx.type,
          category: s.cat,
          frequency: mainTx.frequency,
          source: mainTx.source,
          eventId: mainTx.eventId,
          splitGroup: groupId
        }));
      }

      saveTransaction(e) {
        this._nwCache = null;
        e.preventDefault();
        const id = document.getElementById('txId').value || 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const rawAmount = this.sanitizeAmount(document.getElementById('txAmount').value);
        const originalAmount = rawAmount;
        const isSplit = document.getElementById('txSplit').value === 'true';

        // Find old transaction WITHOUT removing (prevents data loss on validation failure)
        const existingIdx = this.data.transactions.findIndex(x => x && x.id === id);
        const oldTx = existingIdx >= 0 ? this.data.transactions[existingIdx] : null;

        const t = {
          id,
          date: document.getElementById('txDate').value,
          amount: isSplit ? 0 : originalAmount,
          splitTotal: isSplit ? originalAmount : null,
          isSplitParent: isSplit || false,
          item: (document.getElementById('txItem').value || '').trim(),
          vendor: (document.getElementById('txVendor').value || '').trim(),
          brand: (document.getElementById('txBrand').value || '').trim(),
          mode: document.getElementById('txMode').value,
          subMode: document.getElementById('txSubMode').value,
          type: document.getElementById('txType').value,
          category: document.getElementById('txCategory').value,
          frequency: document.getElementById('txFrequency').value,
          recurrenceCount: document.getElementById('txRecurrenceCount').value ? parseInt(document.getElementById('txRecurrenceCount').value, 10) : null,
          eventId: document.getElementById('txEventId').value || undefined,
          source: this.getProfileSource(),
          lifecycleEnabled: document.getElementById('txLifecycleEnabled').value === 'true',
          startDate: document.getElementById('txStartDate').value || undefined,
          numDays: parseInt(document.getElementById('txNumDays').value) || undefined,
          endDate: document.getElementById('txEndDate').value || undefined,
          status: document.getElementById('txStatus').value || 'Planned',
          statusLocked: document.getElementById('txStatus').dataset.userSet === 'true',
          recurringId: oldTx ? oldTx.recurringId : undefined,
          transferTo: document.getElementById('txTransferTo').value || undefined
        };

        // Validate BEFORE any mutation
        if (!this.validateTransaction({ ...t, amount: originalAmount })) {
          this.toast('Please fill all required fields correctly', 'err');
          return;
        }

        // Safe to mutate now
        this.pushUndo(this.editingTxId ? 'Edit transaction' : 'Add transaction');

        let splitTxs = null;
        if (isSplit) {
          splitTxs = this.buildSplitTransactions(t, originalAmount);
          if (!splitTxs) return;
        }

        // Only remove old transaction AFTER validation and split build succeed
        if (existingIdx >= 0) {
          if (oldTx && oldTx.isSplitParent) {
            this.data.transactions = this.data.transactions.filter(x => x && x.splitGroup !== oldTx.id && x.id !== oldTx.id);
          } else {
            this.data.transactions.splice(existingIdx, 1);
          }
        }

        this.data.transactions.push(t);
        if (splitTxs) {
          splitTxs.forEach(st => this.data.transactions.push(st));
        }

        // Unconditionally scrub any previous mirrors of this transaction from all profiles
        // before applying the new state. This prevents orphans on direction changes or
        // when switching from cross-transfer to Other Transfer.
        if (oldTx && !oldTx.mirrorOf) {
          Object.values(this.allData.profiles).forEach(p => {
            if (p && Array.isArray(p.transactions)) {
              p.transactions = p.transactions.filter(x => x.mirrorOf !== oldTx.id);
            }
          });
        }

        const isNowCrossTransfer = t.type === 'Transfer' && ['Personal to Joint', 'Joint to Personal'].includes(t.category);
        if (isNowCrossTransfer && !t.mirrorOf) {
          this.syncTransferMirror(t);
        }

        const isFixed = t.frequency && t.frequency !== 'Variable';
        let recurringJustSet = false;
        if (oldTx && oldTx.recurringId) {
          if (!isFixed) {
            this.data.recurring = this.data.recurring.filter(r => r.id !== oldTx.recurringId);
            delete t.recurringId;
          } else {
            t.recurringId = this.manageRecurringTemplate(t, originalAmount, oldTx.recurringId);
            recurringJustSet = true;
          }
        } else if (isFixed) {
          t.recurringId = this.manageRecurringTemplate(t, originalAmount);
          recurringJustSet = true;
        }

        this.save();
        // Back-fill any past/intervening months immediately so the user doesn't
        // have to restart the app to see a retrospective recurring series appear.
        let backfilled = 0;
        if (recurringJustSet) {
          const realMonth = getLocalDateStr().slice(0, 7);
          backfilled = this.generateRecurring(true, realMonth);
        }

        // If this was an edit of an existing series member, offer to apply the
        // changed fields to subsequent occurrences or the whole series.
        const wasSeriesEdit = oldTx && oldTx.recurringId && t.recurringId && isFixed && !isSplit;
        const changedFields = wasSeriesEdit ? this._diffSeriesFields(oldTx, t) : [];
        if (wasSeriesEdit && changedFields.length > 0 && this.getSeriesInstances(t.recurringId).length > 1) {
          this.resetForm();
          this.setTab('home');
          this.toast('Transaction saved', 'ok');
          // Ask scope; 'one' = nothing more to do (already saved this one).
          this.askSeriesScope('edit', (scope) => {
            if (scope === 'one') return;
            this._applyEditToSeries(t, changedFields, scope);
          });
          return;
        }

        this.resetForm();
        this.setTab('home');
        if (backfilled > 0) {
          this.toast(`Transaction saved · ${backfilled} more recurring ${backfilled === 1 ? 'entry' : 'entries'} added`, 'ok');
        } else {
          this.toast('Transaction saved', 'ok');
        }
      }

      /** Which propagatable fields changed between the old and new instance. */
      _diffSeriesFields(oldTx, t) {
        const fields = ['amount', 'item', 'category', 'type', 'vendor', 'brand', 'mode', 'subMode'];
        return fields.filter(f => (oldTx[f] || '') !== (t[f] || ''));
      }

      /** Apply changed fields to sibling instances (and the template) per scope. */
      _applyEditToSeries(t, fields, scope) {
        this._nwCache = null;
        this.pushUndo('Edit recurring (' + scope + ')');
        const recId = t.recurringId;
        const anchorDate = t.date;
        const siblings = this.getSeriesInstances(recId).filter(x => {
          if (x.id === t.id) return false; // already updated
          if (scope === 'all') return true;
          return (x.date || '') > anchorDate; // subsequent only
        });
        let updated = 0;
        siblings.forEach(x => {
          fields.forEach(f => { x[f] = t[f]; });
          updated++;
        });
        // Update the template so future generated occurrences use the new values.
        const rec = this.data.recurring.find(r => r.id === recId);
        if (rec) fields.forEach(f => { rec[f] = t[f]; });
        this.save();
        this.renderHistory();
        if (this.data.currentTab === 'home') this.renderDashboard();
        this.toast(`Updated ${updated + 1} transaction${updated === 0 ? '' : 's'} in series`, 'ok');
      }

      manageRecurringTemplate(t, originalAmount, existingId) {
        this._nwCache = null;
        const amount = originalAmount || t.amount;
        const template = {
          id: existingId || 'rec_' + Date.now(),
          item: t.item,
          amount: amount,
          type: t.type,
          category: t.category,
          vendor: t.vendor || '',
          brand: t.brand || '',
          mode: t.mode || '',
          subMode: t.subMode || '',
          frequency: t.frequency || 'Monthly',
          recurrenceCount: t.recurrenceCount || null,
          source: t.source || 'Personal',
          eventId: t.eventId || '',
          startDate: t.date,
          lastGenerated: t.date.slice(0, 7)
        };
        if (existingId) {
          const idx = this.data.recurring.findIndex(r => r.id === existingId);
          if (idx >= 0) this.data.recurring[idx] = template;
          else this.data.recurring.push(template);
        } else {
          this.data.recurring.push(template);
        }
        this.save();
        return template.id;
      }

      editTransaction(id) {
        const t = this.data.transactions.find(x => x && x.id === id);
        if (!t) return;
        if (t.mirrorOf) {
          this.toast('This is a synced mirror transaction. Edit the original transfer instead.', 'err');
          return;
        }

        this.setTab('add');

        const txId = document.getElementById('txId');
        if (txId) txId.value = t.id;
        // Use the stored YYYY-MM-DD string directly — never round-trip through
        // new Date(str), which parses as UTC and can shift the day/month.
        const txDateEl = document.getElementById('txDate');
        const txDateDisplayEl = document.getElementById('txDateDisplay');
        const txDateStr = (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) ? t.date : getLocalDateStr();
        if (txDateEl) txDateEl.value = txDateStr;
        if (txDateDisplayEl) txDateDisplayEl.textContent = this.fmtDateShort(txDateStr);

        const displayAmount = t.isSplitParent ? (t.splitTotal || 0) : (t.amount || 0);
        const txAmount = document.getElementById('txAmount');
        if (txAmount) txAmount.value = displayAmount;
        const txItem = document.getElementById('txItem');
        if (txItem) txItem.value = t.item || '';
        const txVendor = document.getElementById('txVendor');
        if (txVendor) txVendor.value = t.vendor || '';
        const txBrand = document.getElementById('txBrand');
        if (txBrand) txBrand.value = t.brand || '';

        const txType = document.getElementById('txType');
        if (txType) txType.value = t.type || 'Earning';
        document.querySelectorAll('#txTypeChips .add-chip').forEach(b => {
          b.classList.toggle('on', b.dataset.val === (t.type || 'Earning'));
        });
        this.handleTypeChange();
        const txCategory = document.getElementById('txCategory');
        if (txCategory) txCategory.value = t.category || '';
        this.renderCategoryChips();

        const isFixed = t.frequency && t.frequency !== 'Variable';
        const txFreqType = document.getElementById('txFreqType');
        const txFreqTypeLabel = document.getElementById('txFreqTypeLabel');
        const txFreqTypeToggle = document.getElementById('txFreqTypeToggle');
        const txFreqPills = document.getElementById('txFreqPills');
        if (txFreqType) txFreqType.value = isFixed ? 'Fixed' : 'Variable';
        if (txFreqTypeLabel) txFreqTypeLabel.textContent = isFixed ? 'Fixed' : 'Variable';
        if (txFreqTypeToggle) txFreqTypeToggle.classList.toggle('on', isFixed);
        if (txFreqPills) txFreqPills.style.display = isFixed ? 'block' : 'none';
        const txFrequency = document.getElementById('txFrequency');
        if (txFrequency) txFrequency.value = t.frequency || 'Monthly';
        document.querySelectorAll('#txFreqToggle .type-btn').forEach(b => {
          b.classList.toggle('on', b.textContent.trim() === (t.frequency || 'Monthly'));
        });
        const txRecurrenceCount = document.getElementById('txRecurrenceCount');
        const txRecurrenceCountDisplay = document.getElementById('txRecurrenceCountDisplay');
        if (txRecurrenceCount) txRecurrenceCount.value = t.recurrenceCount || '';
        if (txRecurrenceCountDisplay) txRecurrenceCountDisplay.textContent = t.recurrenceCount ? String(t.recurrenceCount) : 'Unlimited';

        const evt = t.eventId ? this.data.events.find(e => e.id === t.eventId) : null;
        const txEventId = document.getElementById('txEventId');
        const txEventDisplay = document.getElementById('txEventDisplay');
        if (txEventId) txEventId.value = t.eventId || '';
        if (txEventDisplay) txEventDisplay.textContent = evt ? evt.name : 'Select Event';


        const txTransferTo = document.getElementById('txTransferTo');
        const txTransferToDisplay = document.getElementById('txTransferToDisplay');
        if (txTransferTo) txTransferTo.value = t.transferTo || '';
        const acc = this.data.accounts.find(a => a.id === t.transferTo);
        if (txTransferToDisplay) txTransferToDisplay.textContent = acc ? acc.name : (t.transferTo ? 'Select Account' : 'Select Account');

        const txMode = document.getElementById('txMode');
        const txModeDisplay = document.getElementById('txModeDisplay');
        if (txMode) txMode.value = t.mode || '';
        if (txModeDisplay) txModeDisplay.textContent = t.mode || 'Select';
        const modeSubModes = PAYMENT_MODES[t.mode] || [];
        const txSubMode = document.getElementById('txSubMode');
        const txSubModeDisplay = document.getElementById('txSubModeDisplay');
        if (modeSubModes.length === 0) {
          if (txSubMode) txSubMode.value = 'None';
          if (txSubModeDisplay) txSubModeDisplay.textContent = 'None';
        } else {
          if (txSubMode) txSubMode.value = t.subMode || '';
          if (txSubModeDisplay) txSubModeDisplay.textContent = t.subMode || 'Select Sub-mode';
        }

        const transferField = document.getElementById('txTransferToField');
        if (transferField) transferField.style.display = t.type === 'Transfer' ? 'block' : 'none';

        const lifeOn = t.lifecycleEnabled === true;
        const txLifecycleEnabled = document.getElementById('txLifecycleEnabled');
        const txLifecycleToggle = document.getElementById('txLifecycleToggle');
        const txLifecycleFields = document.getElementById('txLifecycleFields');
        if (txLifecycleEnabled) txLifecycleEnabled.value = lifeOn ? 'true' : 'false';
        if (txLifecycleToggle) txLifecycleToggle.classList.toggle('on', lifeOn);
        if (txLifecycleFields) txLifecycleFields.style.display = lifeOn ? 'block' : 'none';
        const txStartDate = document.getElementById('txStartDate');
        const txStartDateDisplay = document.getElementById('txStartDateDisplay');
        if (txStartDate) txStartDate.value = t.startDate || '';
        if (txStartDateDisplay) txStartDateDisplay.textContent = t.startDate ? this.fmtDateShort(t.startDate) : 'Select Date';
        const txNumDays = document.getElementById('txNumDays');
        if (txNumDays) txNumDays.value = t.numDays || '';
        const txEndDate = document.getElementById('txEndDate');
        const txEndDateDisplay = document.getElementById('txEndDateDisplay');
        if (txEndDate) txEndDate.value = t.endDate || '';
        if (txEndDateDisplay) txEndDateDisplay.textContent = t.endDate ? this.fmtDateShort(t.endDate) : '—';
        const status = t.status || 'Planned';
        const txStatus = document.getElementById('txStatus');
        if (txStatus) {
          txStatus.value = status;
          txStatus.dataset.userSet = t.statusLocked ? 'true' : '';
        }
        document.querySelectorAll('#txStatusToggle .type-btn').forEach(b => {
          b.classList.toggle('on', b.textContent.trim() === status);
        });

        if (t.isSplitParent) {
          const txSplit = document.getElementById('txSplit');
          const txSplitToggle = document.getElementById('txSplitToggle');
          const txSplitContainer = document.getElementById('txSplitContainer');
          if (txSplit) txSplit.value = 'true';
          if (txSplitToggle) txSplitToggle.classList.add('on');
          if (txSplitContainer) txSplitContainer.style.display = 'block';
          const list = document.getElementById('txSplitList');
          if (list) {
            list.innerHTML = '';
            const groupTxs = this.data.transactions.filter(x => x && x.splitGroup === t.id);
            groupTxs.forEach(gt => this.addSplitRow(gt.category, gt.amount));
            this.updateSplitTotal();
          }
        } else {
          const txSplit = document.getElementById('txSplit');
          const txSplitToggle = document.getElementById('txSplitToggle');
          const txSplitContainer = document.getElementById('txSplitContainer');
          if (txSplit) txSplit.value = 'false';
          if (txSplitToggle) txSplitToggle.classList.remove('on');
          if (txSplitContainer) txSplitContainer.style.display = 'none';
          const txSplitList = document.getElementById('txSplitList');
          if (txSplitList) txSplitList.innerHTML = '';
          const txSplitError = document.getElementById('txSplitError');
          if (txSplitError) txSplitError.style.display = 'none';
        }

        const advItem = document.getElementById('addItemAdvanced');
        const advTx = document.getElementById('addTxAdvanced');
        const hasItemAdv = t.vendor || t.brand || t.lifecycleEnabled;
        const hasTxAdv = isFixed || t.isSplitParent || t.eventId || (t.source === 'Joint Account') || t.transferTo;
        if (advItem && hasItemAdv && !advItem.classList.contains('open')) {
          const toggle = document.querySelectorAll('.collapse-toggle')[0];
          if (toggle) toggle.click();
        }
        if (advTx && hasTxAdv && !advTx.classList.contains('open')) {
          const toggle = document.querySelectorAll('.collapse-toggle')[1];
          if (toggle) toggle.click();
        }

        this.editingTxId = t.id;
      }

      resetForm() {
        const form = document.getElementById('txForm');
        if (form) form.reset();
        const fields = [
          ['txId', ''], ['txAmount', ''], ['txType', 'Earning'], ['txFrequency', 'Monthly'],
          ['txRecurrenceCount', ''], ['txEventId', ''], ['txMode', ''], ['txSubMode', ''],
          ['txVendor', ''], ['txBrand', ''], ['txSource', this.getProfileSource()],
          ['txSplit', 'false'], ['txLifecycleEnabled', 'false'],
          ['txStartDate', ''], ['txNumDays', ''], ['txEndDate', ''], ['txStatus', 'Planned'],
          ['txTransferTo', '']
        ];
        fields.forEach(([id, val]) => {
          const el = document.getElementById(id);
          if (el) el.value = val;
        });
        const txStatus = document.getElementById('txStatus');
        if (txStatus) txStatus.dataset.userSet = '';
        document.querySelectorAll('#txTypeChips .add-chip').forEach((b, i) => b.classList.toggle('on', i === 0));
        this.handleTypeChange();
        document.querySelectorAll('#txFreqToggle .type-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
        const txFreqTypeLabel = document.getElementById('txFreqTypeLabel');
        const txFreqTypeToggle = document.getElementById('txFreqTypeToggle');
        const txFreqPills = document.getElementById('txFreqPills');
        if (txFreqTypeLabel) txFreqTypeLabel.textContent = 'Variable';
        if (txFreqTypeToggle) txFreqTypeToggle.classList.remove('on');
        if (txFreqPills) txFreqPills.style.display = 'none';
        const txRecurrenceCountDisplay = document.getElementById('txRecurrenceCountDisplay');
        if (txRecurrenceCountDisplay) txRecurrenceCountDisplay.textContent = 'Unlimited';
        const txEventDisplay = document.getElementById('txEventDisplay');
        if (txEventDisplay) txEventDisplay.textContent = 'Select Event';
        const txModeDisplay = document.getElementById('txModeDisplay');
        if (txModeDisplay) txModeDisplay.textContent = 'Select';
        const txSubModeDisplay = document.getElementById('txSubModeDisplay');
        if (txSubModeDisplay) txSubModeDisplay.textContent = 'Select Sub-mode';
        this.setDateDisplay(new Date());
        const txSplitToggle = document.getElementById('txSplitToggle');
        const txSplitContainer = document.getElementById('txSplitContainer');
        if (txSplitToggle) txSplitToggle.classList.remove('on');
        if (txSplitContainer) txSplitContainer.style.display = 'none';
        const txSplitList = document.getElementById('txSplitList');
        if (txSplitList) txSplitList.innerHTML = '';
        const txSplitError = document.getElementById('txSplitError');
        if (txSplitError) txSplitError.style.display = 'none';
        const txLifecycleToggle = document.getElementById('txLifecycleToggle');
        const txLifecycleFields = document.getElementById('txLifecycleFields');
        if (txLifecycleToggle) txLifecycleToggle.classList.remove('on');
        if (txLifecycleFields) txLifecycleFields.style.display = 'none';
        const txStartDateDisplay = document.getElementById('txStartDateDisplay');
        if (txStartDateDisplay) txStartDateDisplay.textContent = 'Select Date';
        const txEndDateDisplay = document.getElementById('txEndDateDisplay');
        if (txEndDateDisplay) txEndDateDisplay.textContent = '—';
        const txTransferToDisplay = document.getElementById('txTransferToDisplay');
        if (txTransferToDisplay) txTransferToDisplay.textContent = 'Select Account';
        this.editingTxId = null;
        const advItem = document.getElementById('addItemAdvanced');
        const advTx = document.getElementById('addTxAdvanced');
        if (advItem) advItem.classList.remove('open');
        if (advTx) advTx.classList.remove('open');
        document.querySelectorAll('.collapse-toggle').forEach(t => t.classList.remove('open'));
      }

      toggleSplit() {
        const el = document.getElementById('txSplitToggle');
        const inp = document.getElementById('txSplit');
        const container = document.getElementById('txSplitContainer');
        if (!el || !inp || !container) return;
        const isOn = inp.value === 'true';
        inp.value = isOn ? 'false' : 'true';
        el.classList.toggle('on', !isOn);
        container.style.display = !isOn ? 'block' : 'none';
        if (!isOn) {
          const list = document.getElementById('txSplitList');
          if (list) {
            list.innerHTML = '';
            this.addSplitRow();
            this.updateSplitTotal();
          }
        }
      }

      addSplitRow(category = '', amount = '') {
        const container = document.getElementById('txSplitList');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
          <div class="input-wrapper" style="flex:1;">
            <div class="inp picker-trigger" style="min-height:40px;padding:8px 10px;font-size:13px;" onclick="app.openSplitCategoryPicker(this)" role="button" tabindex="0" aria-label="Select split category">${category || 'Select Category'}</div>
            <input type="hidden" class="split-cat" value="${this.esc(category)}">
          </div>
          <div class="input-wrapper" style="width:90px;flex-shrink:0;">
            <span class="input-prefix">₹</span>
            <input type="text" class="inp split-amt" style="padding-left:26px;box-shadow:none;" placeholder="0" value="${amount}" oninput="app.updateSplitTotal()" inputmode="decimal" aria-label="Split amount">
          </div>
          <button type="button" class="del-btn" style="width:26px;height:26px;padding:0;" onclick="this.parentElement.remove();app.updateSplitTotal()" aria-label="Remove split row">${this.icon('x')}</button>
        `;
        container.appendChild(div);
      }

      openSplitCategoryPicker(triggerEl) {
        const type = document.getElementById('txType').value;
        const cats = (this.data.typeCategories || TYPE_CATEGORIES)[type] || [];
        if (cats.length === 0) { this.toast('Select an Expense Type first', 'err'); return; }
        const items = cats.map(c => ({ value: c, label: c }));
        const current = triggerEl.nextElementSibling.value;
        this.openPicker('Select Category', items, (val) => {
          triggerEl.textContent = val;
          triggerEl.nextElementSibling.value = val;
        }, current);
      }

      updateSplitTotal() {
        const rows = document.querySelectorAll('#txSplitList .item-row');
        let total = 0;
        rows.forEach(row => {
          const amt = this.sanitizeAmount(row.querySelector('.split-amt').value);
          total += amt;
        });
        const txSplitTotal = document.getElementById('txSplitTotal');
        if (txSplitTotal) txSplitTotal.textContent = '₹' + total.toLocaleString('en-IN');
        const mainAmt = this.sanitizeAmount(document.getElementById('txAmount').value);
        const err = document.getElementById('txSplitError');
        if (err) {
          if (mainAmt > 0 && Math.abs(total - mainAmt) > 0.01) {
            err.style.display = 'block';
          } else {
            err.style.display = 'none';
          }
        }
      }



      toggleFreqType() {
        const el = document.getElementById('txFreqTypeToggle');
        const inp = document.getElementById('txFreqType');
        const label = document.getElementById('txFreqTypeLabel');
        const pills = document.getElementById('txFreqPills');
        if (!el || !inp || !label || !pills) return;
        const isFixed = inp.value === 'Fixed';
        inp.value = isFixed ? 'Variable' : 'Fixed';
        label.textContent = inp.value;
        el.classList.toggle('on', !isFixed);
        pills.style.display = isFixed ? 'none' : 'block';
        if (isFixed) {
          const txFrequency = document.getElementById('txFrequency');
          if (txFrequency) txFrequency.value = 'Variable';
        } else {
          const txFrequency = document.getElementById('txFrequency');
          if (txFrequency) txFrequency.value = 'Monthly';
          document.querySelectorAll('#txFreqToggle .type-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
        }
      }

      openRecurrenceCountPicker() {
        const items = [{ value: '', label: 'Unlimited' }];
        for (let i = 1; i <= 12; i++) {
          items.push({ value: String(i), label: String(i) });
        }
        const current = document.getElementById('txRecurrenceCount').value;
        this.openPicker('Number of Recurrences', items, (val) => {
          const txRecurrenceCount = document.getElementById('txRecurrenceCount');
          const txRecurrenceCountDisplay = document.getElementById('txRecurrenceCountDisplay');
          if (txRecurrenceCount) txRecurrenceCount.value = val;
          if (txRecurrenceCountDisplay) txRecurrenceCountDisplay.textContent = val === '' ? 'Unlimited' : val;
        }, current);
      }

      openModePicker() {
        const modes = Object.keys(PAYMENT_MODES);
        const current = document.getElementById('txMode').value;
        this.openPicker('Select Mode', modes.map(m => ({ value: m, label: m })), (val) => {
          const txMode = document.getElementById('txMode');
          const txModeDisplay = document.getElementById('txModeDisplay');
          if (txMode) txMode.value = val;
          if (txModeDisplay) txModeDisplay.textContent = val;
          const subModes = PAYMENT_MODES[val] || [];
          const txSubMode = document.getElementById('txSubMode');
          const txSubModeDisplay = document.getElementById('txSubModeDisplay');
          if (subModes.length === 0) {
            if (txSubMode) txSubMode.value = 'None';
            if (txSubModeDisplay) txSubModeDisplay.textContent = 'None';
          } else {
            if (txSubMode) txSubMode.value = '';
            if (txSubModeDisplay) txSubModeDisplay.textContent = 'Select Sub-mode';
          }
        }, current);
      }

      openSubModePicker() {
        const mode = document.getElementById('txMode').value;
        if (!mode) { this.toast('Select a mode first', 'err'); return; }
        const subs = PAYMENT_MODES[mode] || [];
        if (subs.length === 0) { this.toast('No sub-modes for ' + mode, 'err'); return; }
        const current = document.getElementById('txSubMode').value;
        this.openPicker('Select Sub-mode', subs.map(s => ({ value: s, label: s })), (val) => {
          const txSubMode = document.getElementById('txSubMode');
          const txSubModeDisplay = document.getElementById('txSubModeDisplay');
          if (txSubMode) txSubMode.value = val;
          if (txSubModeDisplay) txSubModeDisplay.textContent = val;
        }, current);
      }

      openTransferToPicker() {
        const accounts = (this.data.accounts || []).map(a => ({ value: a.id, label: a.name }));
        const current = document.getElementById('txTransferTo').value;
        this.openPicker('Transfer To', accounts, (val) => {
          const txTransferTo = document.getElementById('txTransferTo');
          const txTransferToDisplay = document.getElementById('txTransferToDisplay');
          if (txTransferTo) txTransferTo.value = val;
          const acc = this.data.accounts.find(a => a.id === val);
          if (txTransferToDisplay) txTransferToDisplay.textContent = acc ? acc.name : 'Select Account';
          const txCategory = document.getElementById('txCategory');
          if (val === 'joint' && this.isSelfProfile() && txCategory) {
            txCategory.value = 'Personal to Joint';
            this.renderCategoryChips();
          } else if (val === 'personal' && !this.isSelfProfile() && txCategory) {
            txCategory.value = 'Joint to Personal';
            this.renderCategoryChips();
          } else if (val === 'personal' && this.isSelfProfile() && txCategory) {
            txCategory.value = 'Other Transfer';
            this.renderCategoryChips();
          } else if (val === 'joint' && !this.isSelfProfile() && txCategory) {
            txCategory.value = 'Other Transfer';
            this.renderCategoryChips();
          }
        }, current);
      }

      syncTransferMirror(t) {
        this._nwCache = null;
        if (!t || t.mirrorOf) return;
        const isSelf = this.allData.activeProfile === 'self';
        const targetProfile = isSelf ? 'wife' : 'self';
        const targetData = this.allData.profiles[targetProfile];
        if (!targetData) return;
        const mirrorSource = isSelf ? 'Joint Account' : 'Personal';
        const existingIdx = targetData.transactions.findIndex(x => x.mirrorOf === t.id);
        const mirror = {
          id: existingIdx >= 0 ? targetData.transactions[existingIdx].id : 'tx_' + Date.now() + '_m_' + Math.random().toString(36).slice(2, 5),
          date: t.date,
          amount: t.amount,
          item: t.item || (isSelf ? 'Transfer from Personal' : 'Transfer from Joint'),
          vendor: t.vendor || '',
          brand: t.brand || '',
          mode: t.mode || '',
          subMode: t.subMode || '',
          type: 'Earning',
          category: 'Transfer In',
          frequency: 'Variable',
          source: mirrorSource,
          eventId: t.eventId,
          mirrorOf: t.id
        };
        if (existingIdx >= 0) {
          targetData.transactions[existingIdx] = mirror;
        } else {
          targetData.transactions.push(mirror);
        }
        this.save();
      }

      /** Optimized recurring generation: start from lastGenerated instead of startDate */
      generateRecurring(silent = false, uptoMonth = null) {
        this._nwCache = null;
        if (!this.data.recurring) this.data.recurring = [];
        const currentMonth = uptoMonth || this.data.currentMonth;
        let generatedCount = 0;

        this.data.recurring.forEach(rec => {
          if (!rec.startDate || !rec.lastGenerated) return;
          let [ly, lm] = rec.lastGenerated.split('-').map(Number);
          lm++;
          if (lm > 12) { lm = 1; ly++; }
          const [cy, cm] = currentMonth.split('-').map(Number);

          while (ly < cy || (ly === cy && lm <= cm)) {
            const monthKey = `${ly}-${String(lm).padStart(2, '0')}`;
            if (rec.seriesEndMonth && monthKey > rec.seriesEndMonth) break;
            const monthsDiff = (ly - parseInt(rec.startDate.slice(0,4))) * 12 + (lm - parseInt(rec.startDate.slice(5,7)));

            let shouldGen = false;
            if (rec.frequency === 'Monthly') shouldGen = monthsDiff >= 0;
            else if (rec.frequency === 'Quarterly') shouldGen = monthsDiff >= 0 && monthsDiff % 3 === 0;
            else if (rec.frequency === 'Half-Yearly') shouldGen = monthsDiff >= 0 && monthsDiff % 6 === 0;
            else if (rec.frequency === 'Annually') shouldGen = monthsDiff >= 0 && monthsDiff % 12 === 0;

            if (shouldGen) {
              const existingInstances = this.data.transactions.filter(t => t.recurringId === rec.id);
              if (rec.recurrenceCount && existingInstances.length >= rec.recurrenceCount) {
                lm++;
                if (lm > 12) { lm = 1; ly++; }
                continue;
              }
              // A month counts as "already handled" if we have ever generated it
              // (recorded in generatedMonths) OR a matching transaction still exists.
              // Relying on generatedMonths means editing an instance's date — e.g.
              // moving it from June back to May — never makes the generator think
              // June is missing and recreate a duplicate.
              if (!Array.isArray(rec.generatedMonths)) rec.generatedMonths = [];
              const alreadyGenerated = rec.generatedMonths.includes(monthKey);
              const exists = alreadyGenerated || this.data.transactions.some(t =>
                t.recurringId === rec.id && t.date.startsWith(monthKey)
              );
              if (!exists) {
                const day = parseInt(rec.startDate.slice(8), 10);
                const [ty, tm] = monthKey.split('-').map(Number);
                const lastDay = new Date(ty, tm, 0).getDate();
                const actualDay = Math.min(day, lastDay);
                const date = `${monthKey}-${String(actualDay).padStart(2, '0')}`;
                this.data.transactions.push({
                  id: 'tx_' + Date.now() + '_' + String(generatedCount).padStart(3, '0'),
                  date,
                  amount: rec.amount,
                  item: rec.item,
                  vendor: rec.vendor,
                  brand: rec.brand,
                  mode: rec.mode,
                  subMode: rec.subMode,
                  type: rec.type,
                  category: rec.category,
                  frequency: rec.frequency,
                  source: rec.source,
                  eventId: rec.eventId || undefined,
                  recurringId: rec.id
                });
                generatedCount++;
              }
              // Record the month as handled regardless of whether we created it now,
              // so future loads won't regenerate it after the instance is moved/deleted.
              if (!rec.generatedMonths.includes(monthKey)) rec.generatedMonths.push(monthKey);
            }

            lm++;
            if (lm > 12) { lm = 1; ly++; }
          }
          if (compareMonths(currentMonth, rec.lastGenerated) > 0) { rec.lastGenerated = currentMonth; }
        });

        if (generatedCount > 0) {
          this.save();
          if (!silent) this.toast(generatedCount + ' recurring transaction(s) generated', 'ok');
        }
        return generatedCount;
      }

      checkSpendingAlerts() {
        const month = this.data.currentMonth;
        const typeBudgets = {};
        Object.entries(this.data.budgets).forEach(([type, months]) => {
          if (months && months[month]) typeBudgets[type] = months[month].amount || 0;
        });

        const typeSpent = {};
        this.data.transactions.filter(t => t && t.date && t.date.startsWith(month)).forEach(t => {
          if (t.isSplitParent) return;
          typeSpent[t.type] = (typeSpent[t.type] || 0) + (t.amount || 0);
        });

        Object.entries(typeBudgets).forEach(([type, budget]) => {
          if (budget <= 0) return;
          const spent = typeSpent[type] || 0;
          const pct = spent / budget;
          const key = month + ':' + type;

          if (pct >= 1 && !this.alertedCategories.has(key + ':over')) {
            this.toast(`${type} over budget! ${this.fmt(spent)} / ${this.fmt(budget)}`, 'err');
            this.alertedCategories.add(key + ':over');
          } else if (pct >= 0.8 && !this.alertedCategories.has(key + ':warn')) {
            this.toast(`${type} at ${Math.round(pct * 100)}% of budget`, 'ok');
            this.alertedCategories.add(key + ':warn');
          }
        });
      }

      setPlanView(view, btn) {
        this.data.planView = view;
        const planCategories = document.getElementById('planCategories');
        const planGrid = document.getElementById('planGrid');
        const planEvents = document.getElementById('planEvents');
        const planYearBar = document.getElementById('planYearBar');
        if (planCategories) planCategories.style.display = view === 'categories' ? 'block' : 'none';
        if (planGrid) planGrid.style.display = view === 'grid' ? 'block' : 'none';
        if (planEvents) planEvents.style.display = view === 'events' ? 'block' : 'none';
        if (planYearBar) planYearBar.style.display = view === 'grid' ? 'flex' : 'none';
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        } else {
          const segContainer = document.querySelector('#planSection .segmented');
          if (segContainer) {
            segContainer.querySelectorAll('.segmented-btn').forEach(b => {
              const onclick = b.getAttribute('onclick') || '';
              if (onclick.includes(`'${view}'`)) b.classList.add('on');
              else b.classList.remove('on');
            });
          }
        }
        this.renderPlan();
      }

      setGridMode(mode, btn) {
        this.gridMode = mode;
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        this.renderGrid();
      }

      renderPlan() {
        try {
          if (this.data.planView === 'categories') {
            this.renderBudgetList();
          } else if (this.data.planView === 'grid') {
            this.renderGrid();
          } else if (this.data.planView === 'events') {
            this.renderEvents();
          }
          this.renderClearBudgetMonths();
        } catch (e) {
          console.error('[RENDER PLAN]', e);
        }
      }

      setPlanYear(year) {
        const y = parseInt(year);
        if (y >= 2026 && y <= 2066) {
          this.data.planYear = y;
          this.save();
          this.updateYearDisplay();
          this.renderPlan();
        }
      }

      changePlanYear(delta) {
        const newYear = this.data.planYear + delta;
        if (newYear >= 2026 && newYear <= 2066) {
          this.setPlanYear(newYear);
        }
      }

      renderBudgetList() {
        const month = this.data.currentMonth;
        const container = document.getElementById('planCategories');
        if (!container) return;
        container.innerHTML = '';

        const incomeBudget = (this.data.budgets['Earning'] || {})[month]?.amount || 0;
        let totalBudgeted = 0;
        (this.data.expenseTypes || EXPENSE_TYPES).forEach(type => {
          if (type !== 'Earning') {
            totalBudgeted += (this.data.budgets[type] || {})[month]?.amount || 0;
          }
        });
        const remaining = incomeBudget - totalBudgeted;
        const planIncomeTotal = document.getElementById('planIncomeTotal');
        const planBudgetedTotal = document.getElementById('planBudgetedTotal');
        const planRemainingTotal = document.getElementById('planRemainingTotal');
        if (planIncomeTotal) planIncomeTotal.textContent = this.fmt(incomeBudget);
        if (planBudgetedTotal) planBudgetedTotal.textContent = this.fmt(totalBudgeted);
        if (planRemainingTotal) {
          planRemainingTotal.textContent = this.fmt(remaining);
          planRemainingTotal.style.color = remaining < 0 ? 'var(--danger)' : '';
        }

        const allocPct = incomeBudget > 0 ? (totalBudgeted / incomeBudget) * 100 : 0;
        const planAllocationBar = document.getElementById('planAllocationBar');
        if (planAllocationBar) {
          planAllocationBar.style.width = Math.min(allocPct, 100) + '%';
          planAllocationBar.className = 'progress-fill ' + (allocPct > 100 ? 'danger' : allocPct > 90 ? 'warning' : '');
        }
        const planAllocationText = document.getElementById('planAllocationText');
        if (planAllocationText) {
          if (incomeBudget > 0) {
            const rounded = Math.round(allocPct);
            planAllocationText.textContent = allocPct > 100 ? `${rounded}% allocated — Over by ${this.fmt(totalBudgeted - incomeBudget)}` : `${rounded}% allocated`;
          } else {
            planAllocationText.textContent = 'Set income budget to see allocation';
          }
        }

        const fragment = document.createDocumentFragment();

        (this.data.expenseTypes || EXPENSE_TYPES).forEach((type, idx) => {
          const typeBudget = this.data.budgets[type] || {};
          const monthData = typeBudget[month] || { amount: 0, items: [] };
          const spent = this.txSum(this.data.transactions.filter(t => t && t.date && t.date.startsWith(month) && t.type === type));
          const budget = monthData.amount || 0;
          const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
          const cls = pct > 90 ? 'danger' : pct > 75 ? 'warning' : '';
          const itemCount = (monthData.items || []).length;
          const uniqueCats = [...new Set((monthData.items || []).map(i => i.category).filter(Boolean))];
          const catPills = uniqueCats.slice(0, 4).map(c => `<span class="report-pill"><span class="dot"></span>${this.esc(c)}</span>`).join('') + (uniqueCats.length > 4 ? `<span class="report-pill">+${uniqueCats.length - 4} more</span>` : '');

          const fixedBudget = (monthData.items || []).reduce((s, i) => s + ((i.frequency && i.frequency !== 'One-time') ? (i.amount || 0) : 0), 0);
          const varBudget = budget - fixedBudget;
          const fixedPct = budget > 0 ? Math.round((fixedBudget / budget) * 100) : 0;

          const itemGroups = {};
          (monthData.items || []).forEach(it => {
            const c = it.category || 'Uncategorized';
            if (!itemGroups[c]) itemGroups[c] = [];
            itemGroups[c].push(it);
          });
          const safeTypeId = type.replace(/[^a-zA-Z0-9]/g, '_');
          const hasItems = Object.keys(itemGroups).length > 0;
          const isExpanded = this.planExpandedTypes.has(type);
          const rem = budget - spent;
          const remColor = rem < 0 ? 'var(--danger)' : rem < budget * 0.2 ? 'var(--text-secondary)' : 'var(--text-tertiary)';

          const card = document.createElement('div');
          card.className = 'card';
          
          card.style.marginBottom = '8px';
          card.innerHTML = `
            <div onclick="app.togglePlanItems('${this.esc(type)}')" style="cursor:pointer;">
              <div class="cat-header">
                <div class="cat-title">${this.esc(type)}<span class="cat-badge">${itemCount > 0 ? itemCount + ' items' : 'Tap to set'}</span></div>
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="text-align:right;">
                    <div style="font-size:14px;font-weight:600;">${this.fmt(budget)}</div>
                    <div style="font-size:10px;color:var(--text-secondary);font-weight:500;">Spent ${this.fmt(spent)}</div>
                    <div style="font-size:10px;color:${remColor};font-weight:600;">${rem >= 0 ? 'Left ' + this.fmt(rem) : 'Over ' + this.fmt(Math.abs(rem))}</div>
                  </div>
                  <button class="chip" onclick="event.stopPropagation();app.openBudgetModal('${this.esc(type)}')" style="font-size:10px;padding:4px 10px;height:28px;">Edit</button>
                </div>
              </div>
              <div class="progress-track" style="margin-bottom:6px;"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(spent)} of ${this.fmt(budget)}</span>
                <span style="font-size:9px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${month.slice(5)}/${month.slice(2,4)}</span>
              </div>
              ${budget > 0 ? `
              <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center;">
                <span style="font-size:10px;color:var(--text-secondary);font-weight:500;">Fixed: ${this.fmt(fixedBudget)}</span>
                <span style="font-size:10px;color:var(--text-secondary);font-weight:500;">Variable: ${this.fmt(varBudget)}</span>
                ${fixedPct > 0 ? `<span style="font-size:9px;color:var(--text-tertiary);font-weight:700;background:var(--bg);padding:1px 5px;border-radius:8px;border:1px solid var(--glass-border-dark);">${fixedPct}% fixed</span>` : ''}
              </div>
              ` : ''}
              ${catPills ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${catPills}</div>` : ''}
            </div>
            <div style="border-top:1px solid var(--glass-border-dark);margin-top:10px;padding-top:8px;">
              <div class="collapse-toggle ${isExpanded ? 'open' : ''}" data-plan-toggle="${safeTypeId}" onclick="event.stopPropagation();app.togglePlanItems('${this.esc(type)}')" style="padding:8px 12px;background:var(--bg);border-radius:var(--radius-md);border:1px solid var(--glass-border-dark);margin-bottom:4px;">
                <span style="display:flex;align-items:center;gap:6px;">
                  <span style="font-size:11px;font-weight:600;color:var(--text-secondary);">Budget Items</span>
                  <span style="font-size:10px;color:var(--text-tertiary);font-weight:700;background:var(--surface);padding:1px 6px;border-radius:8px;border:1px solid var(--glass-border-dark);">${itemCount}</span>
                </span>
              </div>
              <div class="collapsible ${isExpanded ? 'open' : ''}" id="plan-items-${safeTypeId}">
                <div style="padding:8px 0 4px;" onclick="event.stopPropagation();">
                  ${hasItems ? Object.entries(itemGroups).map(([cat, items]) => {
                    const catTotal = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
                    return `
                      <div style="margin-bottom:6px;">
                        <div style="font-size:10px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">${this.esc(cat)} · ${this.fmt(catTotal)}</div>
                        ${items.map(it => `
                          <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--glass-border-dark);">
                            <span style="font-size:11px;color:var(--text);font-weight:500;letter-spacing:-0.01em;">${this.esc(it.name || 'Unnamed')}</span>
                            <div style="display:flex;align-items:center;gap:6px;">
                              ${it.frequency && it.frequency !== 'One-time' ? `<span style="font-size:9px;color:var(--text-tertiary);background:var(--bg);padding:1px 5px;border-radius:8px;border:1px solid var(--glass-border-dark);font-weight:600;">${this.esc(it.frequency)}</span>` : ''}
                              ${it.recurringBudgetId ? `<span style="font-size:8px;color:var(--success);background:var(--success-soft);padding:1px 4px;border-radius:4px;font-weight:700;">AUTO</span>` : ''}
                              <span style="font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-0.01em;">${this.fmt(parseFloat(it.amount) || 0)}</span>
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    `;
                  }).join('') : `<div style="color:var(--text-tertiary);font-size:12px;padding:12px 0;text-align:center;font-weight:500;">No budget items yet. Tap Edit to add items.</div>`}
                </div>
              </div>
            </div>
          `;
          fragment.appendChild(card);
        });
        container.appendChild(fragment);
      }

      togglePlanItems(type) {
        const safeTypeId = type.replace(/[^a-zA-Z0-9]/g, '_');
        const isExpanded = this.planExpandedTypes.has(type);
        const collapsible = document.getElementById('plan-items-' + safeTypeId);
        const toggleEl = document.querySelector(`[data-plan-toggle="${safeTypeId}"]`);

        if (isExpanded) {
          this.planExpandedTypes.delete(type);
          if (collapsible) collapsible.classList.remove('open');
          if (toggleEl) toggleEl.classList.remove('open');
        } else {
          this.planExpandedTypes.add(type);
          if (collapsible) collapsible.classList.add('open');
          if (toggleEl) toggleEl.classList.add('open');
        }
      }

      renderGrid() {
        const tbody = document.getElementById('gridBody');
        const thead = document.getElementById('gridHead');
        const gridTitle = document.getElementById('gridTitle');
        if (!tbody || !thead || !gridTitle) return;

        const isFY = this.gridMode === 'fy';
        const year = this.data.planYear || 2026;

        if (isFY) {
          const fyStart = year;
          const fyEnd = year + 1;
          gridTitle.textContent = `FY ${fyStart}–${String(fyEnd).slice(2)}`;
          const fyMonths = [
            `${fyStart}-04`, `${fyStart}-05`, `${fyStart}-06`, `${fyStart}-07`,
            `${fyStart}-08`, `${fyStart}-09`, `${fyStart}-10`, `${fyStart}-11`,
            `${fyStart}-12`, `${fyEnd}-01`, `${fyEnd}-02`, `${fyEnd}-03`
          ];
          const monthLabels = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
          thead.innerHTML = `<tr><th>Expense Type</th>${monthLabels.map(l => `<th>${l}</th>`).join('')}</tr>`;
          tbody.innerHTML = this.renderGridRows(fyMonths);
        } else {
          gridTitle.textContent = `Calendar Year ${year}`;
          const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
          const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          thead.innerHTML = `<tr><th>Expense Type</th>${monthLabels.map(l => `<th>${l}</th>`).join('')}</tr>`;
          tbody.innerHTML = this.renderGridRows(months.map(m => `${year}-${m}`));
        }
      }

      renderGridRows(monthKeys) {
        return (this.data.expenseTypes || EXPENSE_TYPES).map(type => {
          const typeBudget = this.data.budgets[type] || {};
          return `<tr>
            <td>${this.esc(type)}</td>
            ${monthKeys.map(key => {
              const data = typeBudget[key] || {};
              const amt = data.amount || 0;
              const isFixedOnly = data.items && data.items.length > 0 && data.items.every(i => i.frequency && i.frequency !== 'One-time');
              return `<td class="annual-cell ${amt ? 'has-budget' : ''} ${isFixedOnly ? 'recurring' : ''}" data-grid-type="${this.esc(type)}" data-grid-month="${key}">${amt ? this.fmtShort(amt) : '-'}</td>`;
            }).join('')}
          </tr>`;
        }).join('');
      }

      fmtShort(n) {
        if (!n) return '-';
        if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
        if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
        return '₹' + Math.round(n);
      }

      openBudgetModal(type, month) {
        const m = month || this.data.currentMonth;
        this.editingBudget = { type: type, month: m };
        const budgetModalTitle = document.getElementById('budgetModalTitle');
        const bmCategory = document.getElementById('bmCategory');
        const bmMonth = document.getElementById('bmMonth');
        if (budgetModalTitle) budgetModalTitle.textContent = type + ' Budget';
        if (bmCategory) bmCategory.value = type;
        if (bmMonth) bmMonth.value = m;

        const data = (this.data.budgets[type] || {})[m] || { amount: 0, items: [] };
        const bmAmount = document.getElementById('bmAmount');
        if (bmAmount) bmAmount.value = data.amount || '';

        this.bmItems = JSON.parse(JSON.stringify(data.items || []));
        this.bmItems.forEach(it => { if (!it.frequency) it.frequency = 'One-time'; });
        const groups = {};
        this.bmItems.forEach(it => {
          const cat = it.category || 'Uncategorized';
          if (!groups[cat]) groups[cat] = true;
        });
        Object.keys(groups).forEach(cat => {
          const safe = cat.replace(/[^a-zA-Z0-9]/g, '_');
          if (this.bmCollapsed[safe] === undefined) this.bmCollapsed[safe] = false;
        });
        this.renderBudgetItems();

        const directBtn = document.querySelector('#budgetModal .segmented .segmented-btn');
        const itemsBtn = document.querySelectorAll('#budgetModal .segmented .segmented-btn')[1];
        if (this.bmItems.length > 0 && this.bmItems.some(i => (parseFloat(i.amount) || 0) > 0)) {
          this.setBudgetMode('items', itemsBtn);
        } else {
          this.setBudgetMode('direct', directBtn);
        }
        this.updateBudgetAllocation();
        // Reset save button state unconditionally (prevents stuck disabled state from previous non-Earning modal)
        const saveBtn = document.querySelector('#budgetModal .btn-primary');
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.style.opacity = '1';
          saveBtn.style.cursor = 'pointer';
        }
        this.openModal('budgetModal');
      }

      toggleBudgetOverflow(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('budgetOverflowMenu');
        const btn = document.getElementById('budgetOverflowBtn');
        if (!menu) return;
        const isOpen = menu.classList.contains('active');
        if (isOpen) {
          this.closeBudgetOverflow();
        } else {
          menu.classList.add('active');
          if (btn) btn.setAttribute('aria-expanded', 'true');
          const closeOnClickOutside = (ev) => {
            if (!ev.target.closest('.modal-header')) {
              this.closeBudgetOverflow();
              document.removeEventListener('click', closeOnClickOutside);
            }
          };
          setTimeout(() => document.addEventListener('click', closeOnClickOutside), 100);
        }
      }

      closeBudgetOverflow() {
        const menu = document.getElementById('budgetOverflowMenu');
        const btn = document.getElementById('budgetOverflowBtn');
        if (menu) menu.classList.remove('active');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }

      openClearBudgetInline() {
        const section = document.getElementById('budgetClearSection');
        if (section) {
          section.style.display = 'block';
          this.renderClearBudgetMonths();
          section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      closeBudgetModal() {
        this.editingBudget = null;
        this.closeModal('budgetModal');
      }

      setBudgetMode(mode, btn) {
        this.data.budgetMode = mode;
        const bmDirect = document.getElementById('bmDirect');
        const bmItems = document.getElementById('bmItems');
        if (bmDirect) bmDirect.style.display = mode === 'direct' ? 'block' : 'none';
        if (bmItems) bmItems.style.display = mode === 'items' ? 'block' : 'none';
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
      }

      addBudgetItem() {
        this.bmItems.push({ name: '', amount: '', category: '', frequency: 'One-time' });
        this.renderBudgetItems();
      }

      renderBudgetItems() {
        const container = document.getElementById('bmItemList');
        if (!container) return;

        const groups = {};
        this.bmItems.forEach((item, idx) => {
          const cat = item.category || 'Uncategorized';
          if (!groups[cat]) groups[cat] = [];
          groups[cat].push({ ...item, idx });
        });

        const catNames = Object.keys(groups).sort((a, b) => {
          if (a === 'Uncategorized') return 1;
          if (b === 'Uncategorized') return -1;
          return a.localeCompare(b);
        });

        if (catNames.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0;">No items yet. Tap + Add Item.</div>';
          this.updateBmTotals();
          return;
        }

        container.innerHTML = catNames.map(cat => {
          const items = groups[cat];
          const subtotal = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
          const count = items.length;
          const freqs = [...new Set(items.map(it => it.frequency || 'One-time'))];
          const freqBadge = freqs.length === 1 ? freqs[0] : 'Mixed';
          const safeCatId = cat.replace(/[^a-zA-Z0-9]/g, '_');
          const isOpen = !this.bmCollapsed[safeCatId];

          return `
            <div class="bm-category-group" style="margin-bottom:8px;border:1px solid var(--glass-border-dark);border-radius:var(--radius-md);overflow:hidden;">
              <div class="bm-category-header ${isOpen ? 'open' : ''}" data-cat-header="${safeCatId}" onclick="app.toggleBudgetCategory('${safeCatId}')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg);cursor:pointer;user-select:none;">
                <span class="arrow" style="display:inline-block;width:14px;text-align:center;font-size:11px;color:var(--text-tertiary);transition:transform 200ms ease;">${isOpen ? '▼' : '▶'}</span>
                <span class="bm-cat-name" style="font-size:12px;font-weight:600;flex:1;">${this.esc(cat)}</span>
                <span class="bm-cat-badge" style="font-size:9px;color:var(--text-tertiary);background:var(--surface);padding:1px 5px;border-radius:8px;border:1px solid var(--glass-border-dark);">${count} item${count !== 1 ? 's' : ''}</span>
                <span class="bm-cat-subtotal" style="font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;margin-left:6px;">${this.fmt(subtotal)}</span>
                ${freqBadge !== 'One-time' ? `<span class="bm-cat-freq" style="font-size:9px;color:var(--text-secondary);background:var(--surface);padding:1px 5px;border-radius:8px;border:1px solid var(--glass-border-dark);margin-left:4px;">${this.esc(freqBadge)}</span>` : ''}
              </div>
              <div class="bm-category-rows" id="bm-rows-${safeCatId}" style="${isOpen ? 'display:flex;' : 'display:none;'}padding:6px;flex-direction:column;gap:6px;">
                ${items.map(it => `
                  <div class="bm-item-row" style="display:flex;align-items:center;gap:6px;padding:6px;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--glass-border-dark);">
                    <button type="button" class="btn" style="padding:4px 8px;font-size:11px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;" onclick="app.openBmItemCategoryPicker(this, ${it.idx})" title="${this.esc(it.category || 'Select')}">${this.esc(it.category || 'Category')}</button>
                    <input type="text" class="inp bm-item-name" placeholder="Item name" value="${this.esc(it.name)}" oninput="app.updateBmItemName(${it.idx}, this.value)" style="box-shadow:none;flex:1;font-size:13px;padding:6px 8px;" aria-label="Budget item name">
                    <div class="input-wrapper" style="width:90px;flex-shrink:0;">
                      <span class="input-prefix">₹</span>
                      <input type="text" class="inp bm-item-amt" style="padding-left:26px;box-shadow:none;font-size:13px;" placeholder="0" value="${it.amount || ''}" oninput="app.updateBmItemAmount(${it.idx}, this.value)" inputmode="decimal" aria-label="Budget item amount">
                    </div>
                    <button type="button" class="bm-item-freq" style="padding:4px 8px;border-radius:var(--radius-pill);border:1px solid var(--glass-border-dark);background:var(--bg);color:var(--text-secondary);font-size:10px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;transition:var(--transition);flex-shrink:0;" onclick="app.openBmItemFreqPicker(${it.idx})">${this.esc(it.frequency || 'One-time')} ▾</button>
                    ${it.recurringBudgetId ? '<span style="font-size:8px;color:var(--success);background:var(--success-soft);padding:1px 4px;border-radius:4px;font-weight:700;flex-shrink:0;">AUTO</span>' : ''}
                    <button type="button" class="del-btn" style="width:26px;height:26px;" onclick="app.removeBmItem(${it.idx})" aria-label="Remove budget item">${this.icon('x')}</button>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('');

        this.updateBmTotals();
      }

      toggleBudgetCategory(safeCatId) {
        const rows = document.getElementById('bm-rows-' + safeCatId);
        const header = document.querySelector(`[data-cat-header="${safeCatId}"]`);
        if (!rows || !header) return;
        const isOpen = rows.style.display !== 'none';
        if (isOpen) {
          rows.style.display = 'none';
          header.querySelector('.arrow').textContent = '▶';
          header.classList.remove('open');
          this.bmCollapsed[safeCatId] = true;
        } else {
          rows.style.display = 'flex';
          header.querySelector('.arrow').textContent = '▼';
          header.classList.add('open');
          this.bmCollapsed[safeCatId] = false;
        }
      }

      updateBmItemName(idx, val) {
        if (this.bmItems[idx]) this.bmItems[idx].name = val;
      }

      updateBmItemAmount(idx, val) {
        if (!this.bmItems[idx]) return;
        this.bmItems[idx].amount = val;
        this.updateBmTotals();
        const cat = this.bmItems[idx].category || 'Uncategorized';
        const catTotal = this.bmItems.filter(it => (it.category || 'Uncategorized') === cat).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
        const safeCatId = cat.replace(/[^a-zA-Z0-9]/g, '_');
        const header = document.querySelector(`[data-cat-header="${safeCatId}"]`);
        if (header) {
          const sub = header.querySelector('.bm-cat-subtotal');
          if (sub) sub.textContent = this.fmt(catTotal);
        }
      }

      removeBmItem(idx) {
        this._nwCache = null;
        const item = this.bmItems[idx];
        if (item && item.recurringBudgetId && this.editingBudget) {
          const rec = this.data.recurringBudgets.find(rb => rb.id === item.recurringBudgetId);
          if (rec) {
            if (!rec.excludedMonths) rec.excludedMonths = [];
            if (!rec.excludedMonths.includes(this.editingBudget.month)) {
              rec.excludedMonths.push(this.editingBudget.month);
              this.save();
            }
          }
        }
        this.bmItems.splice(idx, 1);
        this.renderBudgetItems();
      }

      openBmItemCategoryPicker(btn, idx) {
        const type = document.getElementById('bmCategory').value;
        const cats = (this.data.typeCategories || TYPE_CATEGORIES)[type] || [];
        if (cats.length === 0) { this.toast('No categories for this type', 'err'); return; }
        const items = cats.map(c => ({ value: c, label: c }));
        const current = this.bmItems[idx]?.category || '';
        this.openPicker('Select Category', items, (val) => {
          if (this.bmItems[idx]) {
            this.bmItems[idx].category = val;
            btn.textContent = val;
            btn.title = val;
            this.renderBudgetItems();
          }
        }, current);
      }

      openBmItemFreqPicker(idx) {
        const freqs = ['One-time', 'Monthly', 'Quarterly', 'Half-Yearly', 'Annually'];
        const items = freqs.map(f => ({ value: f, label: f }));
        const current = this.bmItems[idx]?.frequency || 'One-time';
        this.openPicker('Frequency', items, (val) => {
          if (this.bmItems[idx]) {
            this.bmItems[idx].frequency = val;
            this.renderBudgetItems();
          }
        }, current);
      }

      updateBmTotals() {
        let total = 0;
        this.bmItems.forEach(it => {
          total += parseFloat(it.amount) || 0;
        });
        const bmItemTotal = document.getElementById('bmItemTotal');
        if (bmItemTotal) bmItemTotal.textContent = '₹' + total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        this.updateBudgetAllocation();
      }

      updateBudgetAllocation() {
        if (!this.editingBudget) return;
        const month = this.editingBudget.month;
        const income = (this.data.budgets['Earning'] || {})[month]?.amount || 0;
        let already = 0;
        (this.data.expenseTypes || EXPENSE_TYPES).forEach(type => {
          if (type !== 'Earning' && type !== this.editingBudget.type) {
            already += (this.data.budgets[type] || {})[month]?.amount || 0;
          }
        });
        const directVal = this.sanitizeAmount(document.getElementById('bmAmount').value);
        const itemsTotal = this.sanitizeAmount(document.getElementById('bmItemTotal').textContent.replace('₹', '').replace(/,/g, ''));
        const newBudget = this.data.budgetMode === 'direct' ? directVal : itemsTotal;
        const remaining = income - (already + newBudget);
        const bmIncome = document.getElementById('bmIncome');
        const bmAlreadyBudgeted = document.getElementById('bmAlreadyBudgeted');
        const bmRemaining = document.getElementById('bmRemaining');
        if (bmIncome) bmIncome.textContent = this.fmt(income);
        if (bmAlreadyBudgeted) bmAlreadyBudgeted.textContent = this.fmt(already + (this.editingBudget.type !== 'Earning' ? ((this.data.budgets[this.editingBudget.type] || {})[month]?.amount || 0) : 0));
        if (bmRemaining) bmRemaining.textContent = this.fmt(remaining);
        // M5: Disable save when over-allocated (only for non-Earning types)
        const saveBtn = document.querySelector('#budgetModal .btn-primary');
        const warnEl = document.getElementById('bmOverAllocatedWarning');
        const warnAmt = document.getElementById('bmOverAllocatedAmount');
        if (saveBtn && this.editingBudget.type !== 'Earning') {
          const overAllocated = remaining < 0;
          saveBtn.disabled = overAllocated;
          saveBtn.style.opacity = overAllocated ? '0.4' : '1';
          saveBtn.style.cursor = overAllocated ? 'not-allowed' : 'pointer';
          if (warnEl) warnEl.style.display = overAllocated ? 'block' : 'none';
          if (warnAmt) warnAmt.textContent = overAllocated ? this.fmt(Math.abs(remaining)) : '';
        } else {
          if (warnEl) warnEl.style.display = 'none';
        }
      }

      saveBudget() {
        this._nwCache = null;
        this.pushUndo('Edit budget');
        if (!this.editingBudget) return;
        const { type, month } = this.editingBudget;
        if (!this.data.budgets[type]) this.data.budgets[type] = {};

        const mode = this.data.budgetMode;
        let amount = 0;
        let items = [];

        if (mode === 'direct') {
          amount = this.sanitizeAmount(document.getElementById('bmAmount').value);
        } else {
          this.bmItems.forEach(it => {
            const name = (it.name || '').trim();
            const amt = this.sanitizeAmount(it.amount);
            const cat = it.category || '';
            const freq = it.frequency || 'One-time';
            if (name || amt > 0) {
              items.push({ name, amount: amt, category: cat, frequency: freq, recurringBudgetId: it.recurringBudgetId });
              amount += amt;
            }
          });
        }

        this.data.budgets[type][month] = { amount, items };

        if (!this.data.recurringBudgets) this.data.recurringBudgets = [];

        const currentRbIds = new Set(
          items
            .filter(it => (it.frequency || 'One-time') !== 'One-time')
            .map(it => it.recurringBudgetId)
            .filter(Boolean)
        );
        this.data.recurringBudgets = this.data.recurringBudgets.filter(rb => {
          if (rb.type === type && rb.sourceMonth === month) {
            return currentRbIds.has(rb.id);
          }
          return true;
        });

        if (mode === 'items') {
          items.forEach(it => {
            const freq = it.frequency || 'One-time';
            if (freq !== 'One-time') {
              const existingIdx = this.data.recurringBudgets.findIndex(rb => rb.id === it.recurringBudgetId);
              if (existingIdx >= 0) {
                this.data.recurringBudgets[existingIdx] = {
                  ...this.data.recurringBudgets[existingIdx],
                  category: it.category || '',
                  name: it.name || '',
                  amount: it.amount || 0,
                  frequency: freq
                };
              } else {
                this.data.recurringBudgets.push({
                  id: 'rb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                  type,
                  category: it.category || '',
                  name: it.name || '',
                  amount: it.amount || 0,
                  frequency: freq,
                  sourceMonth: month,
                  lastGenerated: month,
                  excludedMonths: []
                });
              }
            }
          });
        }

        this.save();
        this.closeBudgetModal();
        this.renderPlan();
        if (this.data.currentTab === 'home') this.renderDashboard();
        this.toast('Budget saved', 'ok');
      }

      /** Optimized recurring budget generation: start from lastGenerated */
      generateRecurringBudgets() {
        this._nwCache = null;
        if (!this.data.recurringBudgets) this.data.recurringBudgets = [];
        const currentMonth = this.data.currentMonth;
        let generatedCount = 0;

        this.data.recurringBudgets.forEach(rec => {
          if (!rec.sourceMonth || !rec.lastGenerated) return;
          let [ly, lm] = rec.lastGenerated.split('-').map(Number);
          lm++;
          if (lm > 12) { lm = 1; ly++; }
          const [cy, cm] = currentMonth.split('-').map(Number);

          while (ly < cy || (ly === cy && lm <= cm)) {
            const monthKey = `${ly}-${String(lm).padStart(2, '0')}`;
            const monthsDiff = (ly - parseInt(rec.sourceMonth.slice(0,4))) * 12 + (lm - parseInt(rec.sourceMonth.slice(5,7)));

            let shouldGen = false;
            if (rec.frequency === 'Monthly') shouldGen = monthsDiff >= 0;
            else if (rec.frequency === 'Quarterly') shouldGen = monthsDiff >= 0 && monthsDiff % 3 === 0;
            else if (rec.frequency === 'Half-Yearly') shouldGen = monthsDiff >= 0 && monthsDiff % 6 === 0;
            else if (rec.frequency === 'Annually') shouldGen = monthsDiff >= 0 && monthsDiff % 12 === 0;

            if (shouldGen) {
              if (!this.data.budgets[rec.type]) this.data.budgets[rec.type] = {};
              if (!this.data.budgets[rec.type][monthKey]) {
                this.data.budgets[rec.type][monthKey] = { amount: 0, items: [] };
              }

              const monthData = this.data.budgets[rec.type][monthKey];
              const exists = monthData.items.some(i => i.recurringBudgetId === rec.id);
              const excluded = rec.excludedMonths && rec.excludedMonths.includes(monthKey);

              if (!exists && !excluded) {
                monthData.items.push({
                  name: rec.name,
                  amount: rec.amount,
                  category: rec.category,
                  frequency: rec.frequency,
                  recurringBudgetId: rec.id
                });
                monthData.amount = (monthData.amount || 0) + rec.amount;
                generatedCount++;
              }
            }

            lm++;
            if (lm > 12) { lm = 1; ly++; }
          }
          if (compareMonths(currentMonth, rec.lastGenerated) > 0) { rec.lastGenerated = currentMonth; }
        });

        if (generatedCount > 0) {
          this.save();
          this.toast(generatedCount + ' recurring budget item(s) auto-filled', 'ok');
        }
      }

      debounce(fn, wait) {
        let timeout;
        return (...args) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => fn.apply(this, args), wait);
        };
      }

      debouncedSearchHistory() {
        if (!this._debouncedSearch) this._debouncedSearch = this.debounce(() => this.searchHistory(), 250);
        this._debouncedSearch();
      }

      debouncedRenderCopyTransactions() {
        if (!this._debouncedCopyRender) this._debouncedCopyRender = this.debounce(() => this.renderCopyTransactions(), 250);
        this._debouncedCopyRender();
      }

      filterHistoryQuick(period, btn) {
        const isActive = btn && btn.classList.contains('on');
        if (btn) {
          const allChips = document.getElementById('historyQuickFilters').querySelectorAll('.chip');
          allChips.forEach(b => b.classList.remove('on'));
        }
        if (isActive) {
          this.historyFilterType = 'all';
          this.historyEventId = null;
          this.historySourceFilter = null;
          const historyDateFrom = document.getElementById('historyDateFrom');
          const historyDateTo = document.getElementById('historyDateTo');
          if (historyDateFrom) historyDateFrom.value = '';
          if (historyDateTo) historyDateTo.value = '';
          this.historyOffset = 0;
          this.renderHistory();
          return;
        }
        if (btn) btn.classList.add('on');
        this.historyFilterType = 'all';
        this.historyEventId = null;
        this.historySourceFilter = null;
        const today = new Date();
        today.setHours(0,0,0,0);
        let dateFrom = '', dateTo = '';
        if (period === 'today') {
          dateFrom = dateTo = getLocalDateStr(today);
        } else if (period === 'week') {
          const start = new Date(today);
          start.setDate(start.getDate() - start.getDay());
          dateFrom = getLocalDateStr(start);
          dateTo = getLocalDateStr(today);
        } else if (period === 'month') {
          dateFrom = getLocalDateStr(new Date(today.getFullYear(), today.getMonth(), 1));
          dateTo = getLocalDateStr(today);
        } else if (period === 'expense') {
          this.historyFilterType = '__EXPENSE__';
        } else if (period === 'income') {
          this.historyFilterType = '__INCOME__';
        } else if (period === 'transfer') {
          this.historyFilterType = 'Transfer';
        } else if (period === 'fixed') {
          this.historySourceFilter = 'fixed';
        } else if (period === 'variable') {
          this.historySourceFilter = 'variable';
        } else if (['cash', 'credit', 'debit', 'wallet'].includes(period)) {
          const modeMap = { 'cash': 'Cash', 'credit': 'Credit Card', 'debit': 'Debit Card', 'wallet': 'Wallet' };
          this.historySourceFilter = modeMap[period];
        } else if (period.startsWith('type-')) {
          const typeMap = {
            'type-essential': 'Essential',
            'type-non-essential': 'Non-essential',
            'type-vacation': 'Vacation',
            'type-earning': 'Earning',
            'type-saving': 'Saving',
            'type-investment': 'Investment',
            'type-transfer': 'Transfer'
          };
          this.historyFilterType = typeMap[period] || 'all';
          this.renderHistoryCategoryPills(typeMap[period]);
        } else if (period.startsWith('cat-')) {
          this.historyFilterType = period.replace('cat-', '');
        }
        const historyDateFrom = document.getElementById('historyDateFrom');
        const historyDateTo = document.getElementById('historyDateTo');
        if (historyDateFrom) historyDateFrom.value = dateFrom;
        if (historyDateTo) historyDateTo.value = dateTo;
        this.historyOffset = 0;
        this.renderHistory();
      }

      renderHistoryCategoryPills(typeName) {
        const container = document.getElementById('historyCategoryFilters');
        const pills = document.getElementById('historyCategoryPills');
        if (!typeName || !(this.data.typeCategories || TYPE_CATEGORIES)[typeName]) {
          if (container) container.style.display = 'none';
          if (pills) pills.innerHTML = '';
          return;
        }
        const categories = (this.data.typeCategories || TYPE_CATEGORIES)[typeName];
        if (pills) {
          pills.innerHTML = categories.map(cat => 
            `<button class="chip" data-filter="cat-${this.esc(cat)}" onclick="app.filterHistoryQuick('cat-${this.esc(cat)}', this)">${this.esc(cat)}</button>`
          ).join('');
        }
        if (container) container.style.display = 'flex';
      }

      searchHistory() {
        const el = document.getElementById('historySearch');
        this.historySearchQuery = el ? el.value.toLowerCase().trim() : '';
        this.historyOffset = 0;
        this.renderHistory();
      }

      syncHistoryChips() {
        const allCategories = Object.values(this.data.typeCategories || TYPE_CATEGORIES).flat();
        const chips = document.querySelectorAll('#historySection .chip');
        chips.forEach(chip => {
          chip.classList.remove('on');
          const filterVal = chip.dataset.filter || '';
          const text = chip.textContent.trim();

          if (this.historyFilterType === '__EXPENSE__' && filterVal === 'expense') chip.classList.add('on');
          if (this.historyFilterType === '__INCOME__' && filterVal === 'income') chip.classList.add('on');

          if (this.historyFilterType !== 'all' && this.historyFilterType !== '__EXPENSE__' && this.historyFilterType !== '__INCOME__') {
            const isCat = allCategories.includes(this.historyFilterType);
            if (isCat && filterVal === `cat-${this.historyFilterType}`) chip.classList.add('on');
            if (!isCat && text === this.historyFilterType) chip.classList.add('on');
          }

          if (this.historySourceFilter) {
            const modeMap = { 'Cash': 'cash', 'Credit Card': 'credit', 'Debit Card': 'debit', 'Wallet': 'wallet' };
            const revMode = Object.entries(modeMap).find(([k,v]) => v === this.historySourceFilter);
            if (text === this.historySourceFilter || (revMode && filterVal === revMode[1])) chip.classList.add('on');
            if (this.historySourceFilter === 'fixed' && filterVal === 'fixed') chip.classList.add('on');
            if (this.historySourceFilter === 'variable' && filterVal === 'variable') chip.classList.add('on');
          }

          if (this.historyEventId) {
            const evt = this.data.events.find(e => e.id === this.historyEventId);
            if (evt && text === evt.name) chip.classList.add('on');
          }
        });
      }

      renderHistory() {
        const filterType = this.historyFilterType || 'all';
        const eventId = this.historyEventId;
        const sourceFilter = this.historySourceFilter;
        const searchQuery = this.historySearchQuery;
        const dateFrom = document.getElementById('historyDateFrom').value;
        const dateTo = document.getElementById('historyDateTo').value;

        this.syncHistoryChips();

        const list = document.getElementById('historyList');
        if (!list) return;
        let txs = [...this.data.transactions].filter(t => t && t.date).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (sourceFilter) {
          if (sourceFilter === 'fixed') {
            txs = txs.filter(t => t.frequency && t.frequency !== 'Variable');
          } else if (sourceFilter === 'variable') {
            txs = txs.filter(t => !t.frequency || t.frequency === 'Variable');
          } else if (['Cash', 'Credit Card', 'Debit Card', 'Wallet'].includes(sourceFilter)) {
            txs = txs.filter(t => t.mode === sourceFilter);
          } else if (sourceFilter === 'Personal' || sourceFilter === 'Joint Account') {
            txs = txs.filter(t => t.source === sourceFilter);
          } else {
            txs = txs.filter(t => t.source === sourceFilter);
          }
        } else if (eventId) {
          txs = txs.filter(t => t.eventId === eventId);
        } else if (filterType !== 'all') {
          if (filterType === '__EXPENSE__') {
            txs = txs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type));
          } else if (filterType === '__INCOME__') {
            txs = txs.filter(t => ['Earning','Saving','Investment'].includes(t.type));
          } else {
            const allCategories = Object.values(this.data.typeCategories || TYPE_CATEGORIES).flat();
            const isCategory = allCategories.includes(filterType);
            if (isCategory) {
              txs = txs.filter(t => t.category === filterType);
            } else {
              txs = txs.filter(t => t.type === filterType);
            }
          }
        }

        if (dateFrom) txs = txs.filter(t => t.date >= dateFrom);
        if (dateTo) txs = txs.filter(t => t.date <= dateTo);

        if (searchQuery) {
          txs = txs.filter(t => {
            const fields = [
              t.item, t.vendor, t.brand, t.category, t.type,
              t.mode, t.subMode, String(t.amount), t.date, t.source
            ].map(f => (f || '').toLowerCase());
            return fields.some(f => f.includes(searchQuery));
          });
        }

        const totalCount = txs.length;
        const paginated = txs.slice(this.historyOffset, this.historyOffset + this.historyLimit);

        if (paginated.length === 0) {
          list.innerHTML = '<div class="empty" style="padding:32px 16px;"><div class="empty-icon">📭</div><p>No transactions found</p></div>';
        } else {
          let lastDate = '';
          list.innerHTML = paginated.map((t) => {
            const showDateHeader = t.date !== lastDate;
            lastDate = t.date;
            const dateHeader = showDateHeader ? `<div class="tx-date-header"><div></div><span>${this.fmtDate(t.date)}</span><div></div></div>` : '';
            const splitBadge = t.isSplitParent ? '<span style="font-size:8px;background:var(--bg);color:var(--text-secondary);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">S</span>' : '';
            const mirrorBadge = t.mirrorOf ? '<span style="font-size:8px;background:var(--success-soft);color:var(--success);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);" title="Synced from other profile">M</span>' : '';
            const earnBadge = (t.type === 'Earning' && t.mirrorOf) ? '<span style="font-size:8px;background:var(--success-soft);color:var(--success);padding:1px 3px;border-radius:3px;margin-left:3px;font-weight:700;border:1px solid var(--glass-border-dark);">Transfer In</span>' : '';
            const editBtn = `<button class="del-btn" style="width:20px;height:20px;padding:0;" onclick="event.stopPropagation();app.editTransaction('${t.id}')" title="Edit" aria-label="Edit transaction">${this.icon('edit')}</button>`;
            const dupBtn = `<button class="del-btn" style="width:20px;height:20px;padding:0;" onclick="event.stopPropagation();app.duplicateTransaction('${t.id}')" title="Duplicate" aria-label="Duplicate transaction">${this.icon('plus')}</button>`;
            return dateHeader + `
            <div class="tx-item" style="padding:8px 0;${t.splitGroup ? 'padding-left:28px;opacity:0.85;border-left:2px solid var(--glass-border-dark);margin-left:4px;' : ''}">
              ${t.splitGroup ? `<div class="tx-icon" style="width:22px;height:22px;font-size:9px;background:var(--bg);">${typeAbbrev(t.type||'O')}</div>` : this.typeIcon(t.type||'Other', 'width:28px;height:28px;font-size:10px;')}
              <div class="tx-content" style="min-width:0;">
                <div class="tx-title" style="font-size:13px;${t.splitGroup ? 'font-size:12px;' : ''}">${this.esc(t.item || 'Untitled')}${splitBadge}${mirrorBadge}${earnBadge}</div>
                <div class="tx-meta" style="font-size:10px;">${this.esc(t.category || '')}${t.mode ? ' · ' + this.esc(t.mode) : ''} · ${t.date}${t.splitGroup ? ' · split' : ''}</div>
              </div>
              <div class="tx-amount" style="font-size:13px;${t.splitGroup ? 'font-size:12px;' : ''}">${this.fmt(this.txDisplayAmount(t))}</div>
              <div class="tx-actions">
                ${editBtn}
                ${dupBtn}
                <button class="del-btn" style="width:20px;height:20px;padding:0;" onclick="event.stopPropagation();app.confirmDelete('${t.id}')" aria-label="Delete transaction">${this.icon('trash')}</button>
              </div>
            </div>`;
          }).join('');
        }

        const loadMore = document.getElementById('historyLoadMore');
        if (loadMore) {
          loadMore.style.display = (this.historyOffset + this.historyLimit < totalCount) ? 'block' : 'none';
        }
      }

      loadMoreHistory() {
        this.historyOffset += this.historyLimit;
        this.renderHistory();
      }

      duplicateTransaction(id) {
        const t = this.data.transactions.find(x => x && x.id === id);
        if (!t) return;
        // Confirm first — the duplicate button sits in a tight cluster next to Edit/Delete
        // and was being tapped accidentally, silently creating copies.
        this.confirmCallback = () => {
          this._doDuplicateTransaction(id);
          this.closeModal('confirmModal');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Duplicate Transaction?';
        if (confirmBody) confirmBody.textContent = `Create a copy of "${t.item || 'Untitled'}" (${this.fmt(this.txDisplayAmount(t))}) dated ${t.date}?`;
        if (confirmBtn) {
          confirmBtn.textContent = 'Duplicate';
          confirmBtn.className = 'btn btn-primary';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      _doDuplicateTransaction(id) {
        this._nwCache = null;
        this.pushUndo('Duplicate transaction');
        const t = this.data.transactions.find(x => x && x.id === id);
        if (!t) return;
        const { id: oldId, splitGroup, isSplitParent, recurringId, mirrorOf, ...rest } = t;
        const newId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const newTx = {
          ...rest,
          id: newId,
          // Preserve the original transaction's date instead of forcing it into
          // the currently-viewed month (which silently moved May items to June).
          date: (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) ? t.date : getLocalDateStr()
        };

        this.data.transactions.push(newTx);

        if (t.isSplitParent) {
          newTx.isSplitParent = true;
          newTx.splitTotal = t.splitTotal;
          const children = this.data.transactions.filter(x => x && x.splitGroup === t.id);
          children.forEach(child => {
            const { id: cOldId, splitGroup: cOldGroup, recurringId: cRec, mirrorOf: cMir, ...cRest } = child;
            this.data.transactions.push({
              ...cRest,
              id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
              splitGroup: newId,
              date: newTx.date
            });
          });
        }

        // Sync transfer mirror for duplicated cross-profile transfers
        if (newTx.type === 'Transfer' && !newTx.mirrorOf) {
          this.syncTransferMirror(newTx);
        }

        this.save();
        this.renderHistory();
        this.toast('Transaction duplicated', 'ok');
      }

      // ===== RECURRING SERIES SCOPE =====
      /** All instances sharing a recurringId, sorted by date. */
      getSeriesInstances(recurringId) {
        if (!recurringId) return [];
        return this.data.transactions
          .filter(t => t && t.recurringId === recurringId)
          .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      }

      /** True if this transaction belongs to a recurring series. */
      isSeriesMember(t) {
        return !!(t && t.recurringId && this.data.recurring.some(r => r.id === t.recurringId));
      }

      /**
       * Show a 3-way scope chooser (This / This & subsequent / All in series).
       * onPick receives 'one' | 'subsequent' | 'all'. Used for both edit and delete.
       */
      askSeriesScope(verb, onPick) {
        const titleEl = document.getElementById('seriesScopeTitle');
        const bodyEl = document.getElementById('seriesScopeBody');
        if (titleEl) titleEl.textContent = (verb === 'delete' ? 'Delete' : 'Edit') + ' recurring transaction';
        if (bodyEl) bodyEl.textContent = 'This transaction is part of a recurring series. Apply to:';
        const map = { one: 'seriesScopeOne', subsequent: 'seriesScopeSubsequent', all: 'seriesScopeAll' };
        Object.entries(map).forEach(([scope, btnId]) => {
          const btn = document.getElementById(btnId);
          if (btn) btn.onclick = () => { this.closeModal('seriesScopeModal'); onPick(scope); };
        });
        this.openModal('seriesScopeModal');
      }

      confirmDelete(id) {
        const t = this.data.transactions.find(x => x && x.id === id);
        // Recurring series → ask scope first, then delete accordingly.
        if (t && this.isSeriesMember(t)) {
          this.askSeriesScope('delete', (scope) => this.deleteSeries(id, scope));
          return;
        }
        this._confirmDeleteSingle(id);
      }

      /** Delete with a chosen series scope. */
      deleteSeries(id, scope) {
        const t = this.data.transactions.find(x => x && x.id === id);
        if (!t) return;
        const recId = t.recurringId;
        const anchorDate = t.date;
        this.confirmCallback = () => {
          this._nwCache = null;
          this.pushUndo('Delete recurring (' + scope + ')');
          let removed = 0;
          if (scope === 'one') {
            this.data.transactions = this.data.transactions.filter(x => x.id !== id);
            removed = 1;
            const rec = this.data.recurring.find(r => r.id === recId);
            if (rec) {
              const mk = anchorDate.slice(0, 7);
              if (!Array.isArray(rec.generatedMonths)) rec.generatedMonths = [];
              if (!rec.generatedMonths.includes(mk)) rec.generatedMonths.push(mk);
            }
          } else if (scope === 'subsequent') {
            const before = this.data.transactions.length;
            this.data.transactions = this.data.transactions.filter(x =>
              !(x.recurringId === recId && (x.date || '') >= anchorDate));
            removed = before - this.data.transactions.length;
            const rec = this.data.recurring.find(r => r.id === recId);
            if (rec) {
              const [ay, am] = anchorDate.slice(0, 7).split('-').map(Number);
              let py = ay, pm = am - 1; if (pm < 1) { pm = 12; py--; }
              rec.lastGenerated = `${py}-${String(pm).padStart(2, '0')}`;
              rec.seriesEndMonth = rec.lastGenerated; // hard stop: never generate after this
              rec.endedManually = true;
              if (Array.isArray(rec.generatedMonths)) {
                rec.generatedMonths = rec.generatedMonths.filter(mk => mk < anchorDate.slice(0, 7));
              }
            }
          } else { // all
            const before = this.data.transactions.length;
            this.data.transactions = this.data.transactions.filter(x => x.recurringId !== recId);
            removed = before - this.data.transactions.length;
            this.data.recurring = this.data.recurring.filter(r => r.id !== recId);
          }
          this.save();
          this.renderHistory();
          if (this.data.currentTab === 'home') this.renderDashboard();
          if (this.data.currentTab === 'track') this.renderTrack();
          this.closeModal('confirmModal');
          this.toast(`Deleted ${removed} transaction${removed === 1 ? '' : 's'}`, 'ok');
        };
        const titles = { one: 'Delete this transaction?', subsequent: 'Delete this and all later?', all: 'Delete entire series?' };
        const bodies = {
          one: 'Only this one occurrence will be removed.',
          subsequent: 'This occurrence and every later one will be removed, and the series will stop generating new ones.',
          all: 'Every occurrence in this series, past and future, will be removed.'
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = titles[scope];
        if (confirmBody) confirmBody.textContent = bodies[scope] + ' This can be undone once via Undo.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      _confirmDeleteSingle(id) {
        this.pushUndo('Delete transaction');
        this.confirmCallback = () => {
          this._nwCache = null;
          const t = this.data.transactions.find(x => x && x.id === id);
          let mirrorDeleted = false;
          if (t) {
            if (!t.mirrorOf && t.type === 'Transfer' && ['Personal to Joint', 'Joint to Personal'].includes(t.category)) {
              const otherProfile = this.allData.activeProfile === 'self' ? 'wife' : 'self';
              const otherData = this.allData.profiles[otherProfile];
              if (otherData) {
                const before = otherData.transactions.length;
                otherData.transactions = otherData.transactions.filter(x => x.mirrorOf !== id);
                if (otherData.transactions.length < before) mirrorDeleted = true;
              }
            }
            if (t.isSplitParent) {
              const groupId = t.id;
              this.data.transactions = this.data.transactions.filter(x => x && x.splitGroup !== groupId && x.id !== groupId);
            } else {
              this.data.transactions = this.data.transactions.filter(x => x.id !== id);
            }
          } else {
            this.data.transactions = this.data.transactions.filter(x => x.id !== id);
          }
          this.save();
          this.renderHistory();
          if (this.data.currentTab === 'home') this.renderDashboard();
          if (this.data.currentTab === 'track') {
            this.renderTrack();
          }
          this.closeModal('confirmModal');
          this.toast('Transaction deleted' + (mirrorDeleted ? ' (mirror removed too)' : ''), 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Delete Transaction?';
        if (confirmBody) confirmBody.textContent = 'This action cannot be undone.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      openHistoryDatePicker(which) {
        const currentEl = document.getElementById(which === 'from' ? 'historyDateFrom' : 'historyDateTo');
        const current = (currentEl ? currentEl.value : '') || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          const on = val === cd ? 'on' : '';
          daysHtml += `<div class="picker-item ${on}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          const on = val === cm ? 'on' : '';
          monthsHtml += `<div class="picker-item ${on}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const currentYear = new Date().getFullYear(); for (let y = currentYear - 10; y <= currentYear + 10; y++) {
          const val = String(y);
          const on = val === cy ? 'on' : '';
          yearsHtml += `<div class="picker-item ${on}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = which === 'from' ? 'From Date' : 'To Date';
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmHistoryDatePick('${which}')">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      confirmHistoryDatePick(which) {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || '2026';
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) {
          dateObj = new Date(year, month, 0);
        }
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const fromEl = document.getElementById('historyDateFrom');
        const toEl = document.getElementById('historyDateTo');
        const fromDisplay = document.getElementById('historyDateFromDisplay');
        const toDisplay = document.getElementById('historyDateToDisplay');
        if (which === 'from') {
          if (fromEl) fromEl.value = dateStr;
          if (fromDisplay) fromDisplay.textContent = this.fmtDateShort(dateStr);
        } else {
          if (toEl) toEl.value = dateStr;
          if (toDisplay) toDisplay.textContent = this.fmtDateShort(dateStr);
        }
        this.closePicker();
        this.historyOffset = 0;
        this.renderHistory();
      }

      clearHistoryDateFilter() {
        const historyDateFrom = document.getElementById('historyDateFrom');
        const historyDateTo = document.getElementById('historyDateTo');
        const historyDateFromDisplay = document.getElementById('historyDateFromDisplay');
        const historyDateToDisplay = document.getElementById('historyDateToDisplay');
        if (historyDateFrom) historyDateFrom.value = '';
        if (historyDateTo) historyDateTo.value = '';
        if (historyDateFromDisplay) historyDateFromDisplay.textContent = 'From Date';
        if (historyDateToDisplay) historyDateToDisplay.textContent = 'To Date';
        this.historyFilterType = 'all';
        this.historyEventId = null;
        this.historySourceFilter = null;
        const historyCategoryFilters = document.getElementById('historyCategoryFilters');
        const historyCategoryPills = document.getElementById('historyCategoryPills');
        if (historyCategoryFilters) historyCategoryFilters.style.display = 'none';
        if (historyCategoryPills) historyCategoryPills.innerHTML = '';
        this.historyOffset = 0;
        this.renderHistory();
      }

      toggleLifecycle() {
        const el = document.getElementById('txLifecycleToggle');
        const inp = document.getElementById('txLifecycleEnabled');
        const container = document.getElementById('txLifecycleFields');
        if (!el || !inp || !container) return;
        const isOn = inp.value === 'true';
        inp.value = isOn ? 'false' : 'true';
        el.classList.toggle('on', !isOn);
        container.style.display = !isOn ? 'block' : 'none';
      }

      calcTxEndDate() {
        const start = document.getElementById('txStartDate').value;
        const days = parseInt(document.getElementById('txNumDays').value) || 0;
        const txEndDate = document.getElementById('txEndDate');
        const txEndDateDisplay = document.getElementById('txEndDateDisplay');
        if (start && days > 0) {
          const d = new Date(start + 'T00:00:00');
          d.setDate(d.getDate() + days);
          const endStr = getLocalDateStr(d);
          if (txEndDate) txEndDate.value = endStr;
          if (txEndDateDisplay) txEndDateDisplay.textContent = this.fmtDateShort(endStr);
        } else {
          if (txEndDate) txEndDate.value = '';
          if (txEndDateDisplay) txEndDateDisplay.textContent = '—';
        }
      }

      openTxStartDatePicker() {
        const current = document.getElementById('txStartDate').value || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          const on = val === cd ? 'on' : '';
          daysHtml += `<div class="picker-item ${on}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          const on = val === cm ? 'on' : '';
          monthsHtml += `<div class="picker-item ${on}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const currentYear = new Date().getFullYear(); for (let y = currentYear - 10; y <= currentYear + 10; y++) {
          const val = String(y);
          const on = val === cy ? 'on' : '';
          yearsHtml += `<div class="picker-item ${on}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = 'Select Start Date';
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmTxStartDatePick()">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      confirmTxStartDatePick() {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || '2026';
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) {
          dateObj = new Date(year, month, 0);
        }
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const txStartDate = document.getElementById('txStartDate');
        const txStartDateDisplay = document.getElementById('txStartDateDisplay');
        if (txStartDate) txStartDate.value = dateStr;
        if (txStartDateDisplay) txStartDateDisplay.textContent = this.fmtDateShort(dateStr);
        this.closePicker();
        this.calcTxEndDate();
      }

      selectTxStatus(val, btn) {
        const txStatus = document.getElementById('txStatus');
        if (txStatus) {
          txStatus.value = val;
          txStatus.dataset.userSet = 'true';
        }
        document.querySelectorAll('#txStatusToggle .type-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
      }

      setTrackFilter(filter, btn) {
        this.trackFilter = filter;
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        this.renderTrack();
      }

      /** Respect user-locked status; only auto-compute if not explicitly set by user */
      getTxStatus(t) {
        const today = getLocalDateStr();
        const manualStatus = t.status || 'Planned';
        if (t.statusLocked) return manualStatus;
        if (manualStatus === 'Completed') return 'Completed';
        if (!t.startDate || !t.endDate) return manualStatus;
        if (t.endDate < today) return 'Overdue';
        if (t.startDate > today) return 'Planned';
        return 'In-Progress';
      }

      getDaysRemaining(t) {
        if (!t.endDate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(t.endDate + 'T00:00:00');
        end.setHours(0, 0, 0, 0);
        const diff = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
        return diff;
      }

      renderTrack() {
        const filter = this.trackFilter || 'all';
        const container = document.getElementById('trackList');
        const summary = document.getElementById('trackSummary');
        if (!container || !summary) return;

        let txs = this.data.transactions.filter(t => t && t.lifecycleEnabled === true && !t.mirrorOf);

        const enriched = txs.map(t => ({ ...t, computedStatus: this.getTxStatus(t), daysLeft: this.getDaysRemaining(t) }));

        if (filter !== 'all') {
          txs = enriched.filter(t => t.computedStatus === filter);
        } else {
          txs = enriched;
        }

        const counts = { 'Planned': 0, 'In-Progress': 0, 'Completed': 0, 'Overdue': 0 };
        enriched.forEach(t => { counts[t.computedStatus] = (counts[t.computedStatus] || 0) + 1; });
        const totalTracked = enriched.length;
        summary.innerHTML = `
          <div class="card" style="padding:12px;">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center;">
              <div><div style="font-size:9px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Planned</div><div style="font-size:16px;font-weight:600;">${counts['Planned']}</div></div>
              <div><div style="font-size:9px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">In-Progress</div><div style="font-size:16px;font-weight:600;">${counts['In-Progress']}</div></div>
              <div><div style="font-size:9px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Completed</div><div style="font-size:16px;font-weight:600;color:var(--success);">${counts['Completed']}</div></div>
              <div><div style="font-size:9px;color:var(--text-secondary);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Overdue</div><div style="font-size:16px;font-weight:600;color:var(--danger);">${counts['Overdue']}</div></div>
            </div>
          </div>
        `;

        if (txs.length === 0) {
          container.innerHTML = '<div class="empty" style="padding:32px 16px;"><div class="empty-icon">📦</div><p>No tracked products. Enable "Product Lifecycle" when adding an expense.</p></div>';
          return;
        }

        container.innerHTML = txs.map(t => {
          const status = t.computedStatus;
          const daysLeft = t.daysLeft;
          const isOverdue = status === 'Overdue';
          const isCompleted = status === 'Completed';
          const isInProgress = status === 'In-Progress';
          const isPlanned = status === 'Planned';

          const statusColor = isCompleted ? 'var(--success)' : isOverdue ? 'var(--danger)' : isInProgress ? 'var(--accent)' : 'var(--text-tertiary)';
          const statusBg = isCompleted ? 'var(--success-soft)' : isOverdue ? 'var(--danger-soft)' : isInProgress ? 'rgba(26,26,26,0.06)' : 'var(--bg)';
          const barColor = isCompleted ? 'var(--success)' : isOverdue ? 'var(--danger)' : isInProgress ? 'var(--accent)' : 'var(--text-tertiary)';

          const totalDays = (t.startDate && t.endDate) ? Math.ceil((new Date(t.endDate) - new Date(t.startDate)) / (1000 * 60 * 60 * 24)) : 0;
          const elapsed = (t.startDate && t.endDate) ? Math.ceil((new Date() - new Date(t.startDate)) / (1000 * 60 * 60 * 24)) : 0;
          const progress = isCompleted ? 100 : (totalDays > 0 ? Math.min(Math.max((elapsed / totalDays) * 100, 0), 100) : 0);

          const daysText = isCompleted ? 'Finished' : daysLeft === null ? 'No end date' : daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`;

          return `
            <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="app.editTransaction('${t.id}')">
              <div class="cat-header">
                <div class="cat-title">${this.esc(t.item || 'Untitled')}</div>
                <span class="cat-badge" style="background:${statusBg};color:${statusColor};border-color:${statusColor};">${status}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${t.startDate || '—'} → ${t.endDate || '—'}</span>
                <span style="font-size:11px;font-weight:600;color:${daysLeft !== null && daysLeft < 0 ? 'var(--danger)' : 'var(--text)'};">${daysText}</span>
              </div>
              ${totalDays > 0 ? `<div class="progress-track" style="margin-bottom:4px;"><div class="progress-fill" style="width:${progress}%;background:${barColor};"></div></div>` : ''}
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:10px;color:var(--text-tertiary);font-weight:500;">${this.esc(t.category || '')}${t.type ? ' · ' + this.esc(t.type) : ''}</span>
                <span style="font-size:10px;color:var(--text-tertiary);font-weight:700;">${totalDays > 0 ? Math.round(progress) + '% elapsed' : ''}</span>
              </div>
            </div>
          `;
        }).join('');
      }

      setReportType(type, btn) {
        this.reportType = type;
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        this.renderReports();
      }

      setReportRange(range) {
        const today = new Date();
        const todayStr = getLocalDateStr(today);
        let from = '', to = '';
        if (range === 'thisMonth') {
          from = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
          to = todayStr;
        } else if (range === 'lastMonth') {
          const d = new Date(today.getFullYear(), today.getMonth()-1, 1);
          from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
          to = `${today.getFullYear()}-${String(today.getMonth()).padStart(2,'0')}-${String(new Date(today.getFullYear(), today.getMonth(), 0).getDate()).padStart(2,'0')}`;
        } else if (range === 'thisYear') {
          from = `${today.getFullYear()}-01-01`;
          to = todayStr;
        } else if (range === 'lastYear') {
          from = `${today.getFullYear()-1}-01-01`;
          to = `${today.getFullYear()-1}-12-31`;
        } else if (range === 'all') {
          from = '2000-01-01';
          to = todayStr;
        }
        const reportDateFrom = document.getElementById('reportDateFrom');
        const reportDateTo = document.getElementById('reportDateTo');
        const reportDateFromDisplay = document.getElementById('reportDateFromDisplay');
        const reportDateToDisplay = document.getElementById('reportDateToDisplay');
        if (reportDateFrom) reportDateFrom.value = from;
        if (reportDateTo) reportDateTo.value = to;
        if (reportDateFromDisplay) reportDateFromDisplay.textContent = this.fmtDateShort(from);
        if (reportDateToDisplay) reportDateToDisplay.textContent = this.fmtDateShort(to);
        this.renderReports();
      }

      openReportDatePicker(which) {
        const currentEl = document.getElementById(which === 'from' ? 'reportDateFrom' : 'reportDateTo');
        const current = (currentEl ? currentEl.value : '') || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          const on = val === cd ? 'on' : '';
          daysHtml += `<div class="picker-item ${on}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          const on = val === cm ? 'on' : '';
          monthsHtml += `<div class="picker-item ${on}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const currentYear = new Date().getFullYear(); for (let y = currentYear - 10; y <= currentYear + 10; y++) {
          const val = String(y);
          const on = val === cy ? 'on' : '';
          yearsHtml += `<div class="picker-item ${on}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = which === 'from' ? 'From Date' : 'To Date';
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmReportDatePick('${which}')">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      confirmReportDatePick(which) {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || '2026';
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) {
          dateObj = new Date(year, month, 0);
        }
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const fromEl = document.getElementById('reportDateFrom');
        const toEl = document.getElementById('reportDateTo');
        const fromDisplay = document.getElementById('reportDateFromDisplay');
        const toDisplay = document.getElementById('reportDateToDisplay');
        if (which === 'from') {
          if (fromEl) fromEl.value = dateStr;
          if (fromDisplay) fromDisplay.textContent = this.fmtDateShort(dateStr);
        } else {
          if (toEl) toEl.value = dateStr;
          if (toDisplay) toDisplay.textContent = this.fmtDateShort(dateStr);
        }
        this.closePicker();
        this.renderReports();
      }

      getReportTransactions() {
        const from = document.getElementById('reportDateFrom').value || '2000-01-01';
        const to = document.getElementById('reportDateTo').value || '2099-12-31';
        return this.data.transactions.filter(t => t && t.date && t.date >= from && t.date <= to).sort((a,b) => new Date(a.date) - new Date(b.date));
      }

      renderReports() {
        try {
          const txs = this.getReportTransactions();
          const type = this.reportType || 'summary';
          if (type === 'summary') this.renderReportSummary(txs);
          else if (type === 'category') this.renderReportCategory(txs);
          else if (type === 'monthly') this.renderReportMonthly(txs);
          else if (type === 'event') this.renderReportEvent(txs);
          else if (type === 'source') this.renderReportSource(txs);
        } catch (e) {
          console.error('[RENDER REPORTS]', e);
        }
      }

      renderReportSummary(txs) {
        const container = document.getElementById('reportContent');
        const summary = document.getElementById('reportSummary');
        if (!container || !summary) return;
        if (txs.length === 0) {
          summary.innerHTML = '';
          container.innerHTML = '<div class="card" style="text-align:center;padding:32px 16px;"><div class="empty-icon">📊</div><p style="color:var(--text-tertiary);font-size:14px;font-weight:500;">No transactions in selected range</p></div>';
          return;
        }
        const visibleTxs = txs.filter(t => !t.isSplitParent);
        const income = this.txSum(visibleTxs.filter(t => ['Earning','Saving','Investment'].includes(t.type)));
        const expense = this.txSum(visibleTxs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)));
        const transfer = this.txSum(visibleTxs.filter(t => t.type === 'Transfer'));
        const net = income - expense;
        const expenseDates = new Set(visibleTxs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)).map(t => t.date));
        const avgDaily = expense / Math.max(1, expenseDates.size);
        const topCat = this.getTopCategory(visibleTxs);

        summary.innerHTML = `
          <div class="report-grid">
            <div class="report-card"><div class="report-label">Income</div><div class="report-value" style="color:var(--success);">${this.fmt(income)}</div></div>
            <div class="report-card"><div class="report-label">Expense</div><div class="report-value" style="color:var(--danger);">${this.fmt(expense)}</div></div>
            <div class="report-card"><div class="report-label">Net</div><div class="report-value" style="color:${net>=0?'var(--success)':'var(--danger)'}">${this.fmt(net)}</div></div>
            <div class="report-card"><div class="report-label">Transfers</div><div class="report-value">${this.fmt(transfer)}</div></div>
            <div class="report-card"><div class="report-label">Transactions</div><div class="report-value">${visibleTxs.length}</div><div class="report-sub">${Math.max(1, new Set(visibleTxs.map(t => t.date)).size)} days</div></div>
            <div class="report-card"><div class="report-label">Avg / Active Day</div><div class="report-value">${this.fmt(avgDaily)}</div><div class="report-sub">Top: ${this.esc(topCat)}</div></div>
          </div>
        `;

        const typeMap = {};
        visibleTxs.forEach(t => {
          typeMap[t.type] = (typeMap[t.type]||0)+(t.amount||0);
        });
        const typeRows = Object.entries(typeMap).sort((a,b) => b[1]-a[1]);

        container.innerHTML = `
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">By Type</div></div>
            ${typeRows.map(([type, amt]) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
                <span style="font-size:12px;font-weight:500;">${this.esc(type)}</span>
                <span style="font-size:12px;font-weight:600;">${this.fmt(amt)}</span>
              </div>
            `).join('')}
          </div>
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">Recent Transactions</div></div>
            <div style="max-height:300px;overflow-y:auto;">
              ${visibleTxs.slice().reverse().slice(0,20).map(t => `
                <div class="tx-item" style="padding:6px 0;">
                  ${this.typeIcon(t.type||'Other', 'width:26px;height:26px;font-size:10px;')}
                  <div class="tx-content">
                    <div class="tx-title">${this.esc(t.item||'Untitled')}</div>
                    <div class="tx-meta">${this.esc(t.type)} · ${this.esc(t.category||'')} · ${t.date}</div>
                  </div>
                  <div class="tx-amount">${this.fmt(this.txDisplayAmount(t))}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      renderReportCategory(txs) {
        const container = document.getElementById('reportContent');
        const summary = document.getElementById('reportSummary');
        if (!container || !summary) return;
        if (txs.length === 0) {
          summary.innerHTML = '';
          container.innerHTML = '<div class="card" style="text-align:center;padding:32px 16px;"><div class="empty-icon">📂</div><p style="color:var(--text-tertiary);font-size:14px;font-weight:500;">No transactions in selected range</p></div>';
          return;
        }
        const catMap = {};
        txs.forEach(t => {
          if (t.isSplitParent) return;
          const k = `${t.type} › ${t.category||'Uncategorized'}`;
          catMap[k] = (catMap[k]||0)+(t.amount||0);
        });
        const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
        const total = this.txSum(txs);

        summary.innerHTML = `
          <div class="report-grid">
            <div class="report-card"><div class="report-label">Categories</div><div class="report-value">${cats.length}</div></div>
            <div class="report-card"><div class="report-label">Total Volume</div><div class="report-value">${this.fmt(total)}</div></div>
          </div>
        `;

        const maxCat = Math.max(...cats.map(c => c[1]), 1);
        container.innerHTML = `
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">Category Breakdown</div></div>
            ${cats.map(([cat, amt]) => {
              const pct = total > 0 ? (amt/total)*100 : 0;
              const barW = maxCat > 0 ? (amt/maxCat)*100 : 0;
              return `
                <div style="margin-bottom:10px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:11px;font-weight:600;">${this.esc(cat)}</span>
                    <span style="font-size:11px;font-weight:600;">${this.fmt(amt)} · ${pct.toFixed(1)}%</span>
                  </div>
                  <div class="progress-track"><div class="progress-fill" style="width:${barW}%"></div></div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">Category Table</div></div>
            <div style="overflow-x:auto;">
              <table class="report-table">
                <thead><tr><th>Category</th><th class="num">Amount</th><th class="num">%</th><th class="num">Count</th></tr></thead>
                <tbody>
                  ${cats.map(([cat, amt]) => {
                    const count = txs.filter(t => !t.isSplitParent && `${t.type} › ${t.category||'Uncategorized'}` === cat).length;
                    return `<tr><td>${this.esc(cat)}</td><td class="num">${this.fmt(amt)}</td><td class="num">${total > 0 ? ((amt/total)*100).toFixed(1) : '0.0'}%</td><td class="num">${count}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      renderReportMonthly(txs) {
        const container = document.getElementById('reportContent');
        const summary = document.getElementById('reportSummary');
        if (!container || !summary) return;
        if (txs.length === 0) {
          summary.innerHTML = '';
          container.innerHTML = '<div class="card" style="text-align:center;padding:32px 16px;"><div class="empty-icon">📅</div><p style="color:var(--text-tertiary);font-size:14px;font-weight:500;">No transactions in selected range</p></div>';
          return;
        }
        const monthMap = {};
        txs.forEach(t => {
          if (t.isSplitParent) return;
          const m = t.date.slice(0,7);
          monthMap[m] = (monthMap[m]||0)+(t.amount||0);
        });
        const months = Object.entries(monthMap).sort((a,b) => a[0].localeCompare(b[0]));
        const maxM = Math.max(...months.map(m => m[1]), 1);

        summary.innerHTML = `
          <div class="report-grid">
            <div class="report-card"><div class="report-label">Months</div><div class="report-value">${months.length}</div></div>
            <div class="report-card"><div class="report-label">Avg / Month</div><div class="report-value">${this.fmt(months.length > 0 ? months.reduce((s,m) => s+m[1],0)/months.length : 0)}</div></div>
          </div>
        `;

        container.innerHTML = `
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">Monthly Trend</div></div>
            <div class="bar-chart">
              ${months.map(([m, amt]) => {
                const h = maxM > 0 ? (amt/maxM)*100 : 0;
                const label = new Date(m+'-01').toLocaleDateString('en-US',{month:'short',year:'2-digit'});
                return `
                  <div class="bar-item">
                    <div class="bar-value">${this.fmtShort(amt)}</div>
                    <div class="bar-fill" style="height:${h}%"></div>
                    <div class="bar-label">${label}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">Monthly Table</div></div>
            <div style="overflow-x:auto;">
              <table class="report-table">
                <thead><tr><th>Month</th><th class="num">Amount</th><th class="num">Transactions</th><th class="num">Avg/Day</th></tr></thead>
                <tbody>
                  ${months.map(([m, amt]) => {
                    const count = txs.filter(t => t.date.startsWith(m)).length;
                    const days = new Set(txs.filter(t => t.date.startsWith(m)).map(t => t.date)).size;
                    return `<tr><td>${new Date(m+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}</td><td class="num">${this.fmt(amt)}</td><td class="num">${count}</td><td class="num">${this.fmt(amt/Math.max(1,days))}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      renderReportEvent(txs) {
        const container = document.getElementById('reportContent');
        const summary = document.getElementById('reportSummary');
        const events = this.data.events || [];
        if (!container || !summary) return;
        if (txs.length === 0 || events.length === 0) {
          summary.innerHTML = '';
          container.innerHTML = '<div class="card" style="text-align:center;padding:32px 16px;"><div class="empty-icon">🎉</div><p style="color:var(--text-tertiary);font-size:14px;font-weight:500;">No event data in selected range</p></div>';
          return;
        }
        const evtMap = {};
        txs.forEach(t => {
          if (t.isSplitParent) return;
          if(t.eventId) evtMap[t.eventId] = (evtMap[t.eventId]||0)+(t.amount||0);
        });
        const evtRows = Object.entries(evtMap).map(([id, amt]) => {
          const evt = events.find(e => e.id === id);
          return { name: evt ? evt.name : 'Unknown', budget: evt ? evt.budget : 0, amount: amt, id };
        }).sort((a,b) => b.amount - a.amount);

        summary.innerHTML = `
          <div class="report-grid">
            <div class="report-card"><div class="report-label">Events</div><div class="report-value">${evtRows.length}</div></div>
            <div class="report-card"><div class="report-label">Event Spend</div><div class="report-value">${this.fmt(evtRows.reduce((s,e) => s+e.amount,0))}</div></div>
          </div>
        `;

        container.innerHTML = `
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">Event Breakdown</div></div>
            ${evtRows.map(e => {
              const pct = e.budget > 0 ? Math.min((e.amount/e.budget)*100,100) : 0;
              const cls = pct > 90 ? 'danger' : pct > 75 ? 'warning' : '';
              const remaining = e.budget - e.amount;
              const remLabel = e.budget > 0
                ? (remaining >= 0
                    ? `<span style="font-size:11px;color:var(--success);font-weight:600;">Remaining ${this.fmt(remaining)}</span>`
                    : `<span style="font-size:11px;color:var(--danger);font-weight:600;">Over by ${this.fmt(Math.abs(remaining))}</span>`)
                : '';
              return `
                <div style="margin-bottom:12px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="font-size:12px;font-weight:600;">${this.esc(e.name)}</span>
                    <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(e.amount)} ${e.budget ? '/ '+this.fmt(e.budget) : ''}</span>
                  </div>
                  <div class="progress-track"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;">
                    ${remLabel}
                    <span style="font-size:10px;color:var(--text-tertiary);font-weight:500;">${e.budget > 0 ? Math.round(pct) + '% used' : ''}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      renderReportSource(txs) {
        const container = document.getElementById('reportContent');
        const summary = document.getElementById('reportSummary');
        if (!container || !summary) return;
        if (txs.length === 0) {
          summary.innerHTML = '';
          container.innerHTML = '<div class="card" style="text-align:center;padding:32px 16px;"><div class="empty-icon">💳</div><p style="color:var(--text-tertiary);font-size:14px;font-weight:500;">No transactions in selected range</p></div>';
          return;
        }
        const sourceMap = {};
        const modeMap = {};
        txs.forEach(t => {
          if (t.isSplitParent) return;
          sourceMap[t.source||'Personal'] = (sourceMap[t.source||'Personal']||0)+(t.amount||0);
          if(t.mode) modeMap[t.mode] = (modeMap[t.mode]||0)+(t.amount||0);
        });
        const sources = Object.entries(sourceMap).sort((a,b) => b[1]-a[1]);
        const modes = Object.entries(modeMap).sort((a,b) => b[1]-a[1]);

        summary.innerHTML = `
          <div class="report-grid">
            <div class="report-card"><div class="report-label">Sources</div><div class="report-value">${sources.length}</div></div>
            <div class="report-card"><div class="report-label">Modes</div><div class="report-value">${modes.length}</div></div>
          </div>
        `;

        container.innerHTML = `
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">By Source</div></div>
            ${sources.map(([src, amt]) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
                <span style="font-size:12px;font-weight:500;">${this.esc(src)}</span>
                <span style="font-size:12px;font-weight:600;">${this.fmt(amt)}</span>
              </div>
            `).join('')}
          </div>
          <div class="card" style="margin-bottom:10px;">
            <div class="cat-header"><div class="cat-title">By Payment Mode</div></div>
            ${modes.map(([mode, amt]) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
                <span style="font-size:12px;font-weight:500;">${this.esc(mode)}</span>
                <span style="font-size:12px;font-weight:600;">${this.fmt(amt)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      getTopCategory(txs) {
        const map = {};
        txs.forEach(t => {
          if (t.isSplitParent || t.splitGroup) return;
          map[t.category||'Uncategorized'] = (map[t.category||'Uncategorized']||0)+(t.amount||0);
        });
        const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]);
        return sorted.length ? sorted[0][0] : '—';
      }

      exportReportCSV() {
        const txs = this.getReportTransactions();
        if (txs.length === 0) { this.toast('No data to export', 'err'); return; }
        const headers = ['Date','Item','Type','Category','Amount','Mode','SubMode','Vendor','Brand','Source','Event'];
        const rows = txs.map(t => {
          const evt = t.eventId ? (this.data.events.find(e => e.id === t.eventId)||{}).name : '';
          return [
            t.date, this.csvEsc(t.item), t.type, this.csvEsc(t.category||''), t.amount,
            t.mode||'', t.subMode||'', this.csvEsc(t.vendor||''), this.csvEsc(t.brand||''),
            t.source||'Personal', this.csvEsc(evt)
          ].join(',');
        });
        const csv = [headers.join(','), ...rows].join('\n');
        this.downloadFile(csv, `expense_report_${getLocalDateStr()}.csv`, 'text/csv');
        this.toast('CSV exported', 'ok');
      }

      exportReportJSON() {
        const txs = this.getReportTransactions();
        if (txs.length === 0) { this.toast('No data to export', 'err'); return; }
        const payload = {
          generated: new Date().toISOString(),
          dateRange: {
            from: document.getElementById('reportDateFrom').value,
            to: document.getElementById('reportDateTo').value
          },
          summary: {
            totalTransactions: txs.length,
            income: this.txSum(txs.filter(t => ['Earning','Saving','Investment'].includes(t.type))),
            expense: this.txSum(txs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type))),
            transfer: this.txSum(txs.filter(t => t.type==='Transfer'))
          },
          transactions: txs
        };
        this.downloadFile(JSON.stringify(payload, null, 2), `expense_report_${getLocalDateStr()}.json`, 'application/json');
        this.toast('JSON exported', 'ok');
      }

      printReport() {
        const txs = this.getReportTransactions();
        if (txs.length === 0) { this.toast('No data to print', 'err'); return; }
        const from = document.getElementById('reportDateFrom').value || 'All time';
        const to = document.getElementById('reportDateTo').value || 'All time';
        const visibleTxs = txs.filter(t => !t.isSplitParent);
        const income = this.txSum(visibleTxs.filter(t => ['Earning','Saving','Investment'].includes(t.type)));
        const expense = this.txSum(visibleTxs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)));
        const net = income - expense;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <html><head><title>Expense Report</title>
          <style>
            body{font-family:Inter,sans-serif;padding:40px;color:#1a1a1a;max-width:800px;margin:0 auto}
            h1{font-size:24px;margin-bottom:8px} .meta{color:#6b6b6b;font-size:12px;margin-bottom:24px}
            .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
            .card{border:1px solid #dadada;border-radius:12px;padding:16px}
            .label{font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6b6b6b;font-weight:700;margin-bottom:6px}
            .value{font-size:20px;font-weight:600}
            table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
            th{text-align:left;padding:8px;border-bottom:2px solid #1a1a1a;font-size:10px;text-transform:uppercase;letter-spacing:0.05em}
            td{padding:8px;border-bottom:1px solid #eee}
            .num{text-align:right;font-family:monospace}
            .green{color:#5A9E6B}.red{color:#C45B5B}
            @media print{body{padding:0}}
          </style></head><body>
          <h1>Expense Report</h1>
          <div class="meta">Period: ${from} — ${to} · Generated ${new Date().toLocaleString()}</div>
          <div class="grid">
            <div class="card"><div class="label">Income</div><div class="value green">${this.fmt(income)}</div></div>
            <div class="card"><div class="label">Expense</div><div class="value red">${this.fmt(expense)}</div></div>
            <div class="card"><div class="label">Net</div><div class="value ${net>=0?'green':'red'}">${this.fmt(net)}</div></div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Category</th><th class="num">Amount</th><th>Mode</th><th>Source</th></tr></thead>
            <tbody>
              ${visibleTxs.map(t => `<tr><td>${t.date}</td><td>${this.esc(t.item||'')}</td><td>${t.type}</td><td>${this.esc(t.category||'')}</td><td class="num">${this.fmt(this.txDisplayAmount(t))}</td><td>${this.esc(t.mode||'')}</td><td>${this.esc(t.source||'Personal')}</td></tr>`).join('')}
            </tbody>
          </table>
          <scr` + `ipt>window.onload=function(){setTimeout(function(){window.print()},200)}</scr` + `ipt>
          
          `);
        printWindow.document.close();
        this.toast('Print preview opened', 'ok');
      }

      csvEsc(str) {
        if (!str) return '';
        const s = String(str).replace(/"/g, '""');
        if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"' + s + '"';
        return s;
      }

      downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      renderEvents() {
        const container = document.getElementById('eventsList');
        const events = this.data.events || [];
        if (events.length === 0) {
          if (container) container.innerHTML = '<div class="empty" style="padding:32px 16px;"><div class="empty-icon">📅</div><p>No events yet. Tap above to create one.</p></div>';
          return;
        }
        const today = getLocalDateStr();
        if (container) {
          container.innerHTML = events.map((evt, idx) => {
            const spent = this.getEventSpent(evt.id);
            const budget = evt.budget || 0;
            const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
            const cls = pct > 90 ? 'danger' : pct > 75 ? 'warning' : '';
            const isActive = (!evt.startDate || !evt.endDate) || (evt.startDate <= today && evt.endDate >= today);
            const dateRange = evt.startDate && evt.endDate
              ? `${evt.startDate.slice(8)}/${evt.startDate.slice(5,7)} — ${evt.endDate.slice(8)}/${evt.endDate.slice(5,7)}`
              : 'No dates';
            const types = (evt.expenseTypes || []).join(', ');
            const remaining = budget - spent;
            const remLabel = budget > 0
              ? (remaining >= 0
                  ? `<span style="font-size:11px;color:var(--success);font-weight:600;">Remaining ${this.fmt(remaining)}</span>`
                  : `<span style="font-size:11px;color:var(--danger);font-weight:600;">Over by ${this.fmt(Math.abs(remaining))}</span>`)
              : '<span style="font-size:11px;color:var(--text-tertiary);font-weight:500;">No budget set</span>';
            return `
              <div class="card" style="margin-bottom:8px;cursor:pointer;" onclick="app.openEventModal('${evt.id}')">
                <div class="cat-header">
                  <div class="cat-title">${this.esc(evt.name)}${isActive ? '<span class="cat-badge" style="background:var(--success-soft);color:var(--success);">Active</span>' : ''}</div>
                  <div style="font-size:14px;font-weight:600;">${this.fmt(budget)}</div>
                </div>
                <div class="progress-track" style="margin-bottom:6px;"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(spent)} of ${this.fmt(budget)}</span>
                  <span style="font-size:9px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${dateRange}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                  ${remLabel}
                  <span style="font-size:10px;color:var(--text-tertiary);font-weight:500;">${this.esc(types)}</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      getEventSpent(eventId) {
        return this.txSum(this.data.transactions.filter(t => t && t.eventId === eventId && ['Essential','Non-essential','Vacation'].includes(t.type)));
      }

      getActiveEvents() {
        const today = getLocalDateStr();
        return (this.data.events || []).filter(e => {
          if (!e.startDate || !e.endDate) return true;
          return e.startDate <= today && e.endDate >= today;
        });
      }

      renderActiveEvents() {
        const container = document.getElementById('dashEvents');
        const events = this.getActiveEvents();
        const dashEventCount = document.getElementById('dashEventCount');
        if (dashEventCount) dashEventCount.textContent = events.length;
        if (!container) return;
        if (events.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No active events</div>';
          return;
        }
        container.innerHTML = events.map(evt => {
          const spent = this.getEventSpent(evt.id);
          const budget = evt.budget || 0;
          const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
          const cls = pct > 90 ? 'danger' : pct > 75 ? 'warning' : '';
          const remaining = budget - spent;
          const remText = budget > 0
            ? (remaining >= 0
                ? `<span style="font-size:10px;color:var(--success);font-weight:600;">Remaining ${this.fmt(remaining)}</span>`
                : `<span style="font-size:10px;color:var(--danger);font-weight:600;">Over by ${this.fmt(Math.abs(remaining))}</span>`)
            : '';
          return `
            <div style="margin-bottom:12px;cursor:pointer;" onclick="app.setTab('plan');app.setPlanView('events')">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:12px;font-weight:600;">${this.esc(evt.name)}</span>
                <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(spent)} ${budget ? '/ ' + this.fmt(budget) : ''}</span>
              </div>
              <div class="progress-track"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px;">
                ${remText}
                <span style="font-size:10px;color:var(--text-tertiary);font-weight:500;">${budget > 0 ? Math.round(pct) + '% used' : ''}</span>
              </div>
            </div>
          `;
        }).join('');
      }

      openEventModal(eventId) {
        if (eventId) {
          const evt = this.data.events.find(e => e.id === eventId);
          if (!evt) return;
          const eventModalTitle = document.getElementById('eventModalTitle');
          const eventIdEl = document.getElementById('eventId');
          const eventName = document.getElementById('eventName');
          const eventBudget = document.getElementById('eventBudget');
          const eventNotes = document.getElementById('eventNotes');
          const eventStartDate = document.getElementById('eventStartDate');
          const eventStartDisplay = document.getElementById('eventStartDisplay');
          const eventEndDate = document.getElementById('eventEndDate');
          const eventEndDisplay = document.getElementById('eventEndDisplay');
          const eventTypes = document.getElementById('eventTypes');
          const eventDeleteBtn = document.getElementById('eventDeleteBtn');
          if (eventModalTitle) eventModalTitle.textContent = 'Edit Event';
          if (eventIdEl) eventIdEl.value = evt.id;
          if (eventName) eventName.value = evt.name || '';
          if (eventBudget) eventBudget.value = evt.budget || '';
          if (eventNotes) eventNotes.value = evt.notes || '';
          if (eventStartDate) eventStartDate.value = evt.startDate || '';
          if (eventStartDisplay) eventStartDisplay.textContent = evt.startDate ? this.fmtDateShort(evt.startDate) : 'Select Date';
          if (eventEndDate) eventEndDate.value = evt.endDate || '';
          if (eventEndDisplay) eventEndDisplay.textContent = evt.endDate ? this.fmtDateShort(evt.endDate) : 'Select Date';
          const types = evt.expenseTypes || (this.data.expenseTypes || EXPENSE_TYPES);
          if (eventTypes) eventTypes.value = types.join(',');
          document.querySelectorAll('#eventTypeChips .chip').forEach(chip => {
            chip.classList.toggle('on', types.includes(chip.textContent.trim()));
          });
          if (eventDeleteBtn) eventDeleteBtn.style.display = 'block';
        } else {
          const eventModalTitle = document.getElementById('eventModalTitle');
          const eventIdEl = document.getElementById('eventId');
          const eventName = document.getElementById('eventName');
          const eventBudget = document.getElementById('eventBudget');
          const eventNotes = document.getElementById('eventNotes');
          const eventStartDate = document.getElementById('eventStartDate');
          const eventStartDisplay = document.getElementById('eventStartDisplay');
          const eventEndDate = document.getElementById('eventEndDate');
          const eventEndDisplay = document.getElementById('eventEndDisplay');
          const eventTypes = document.getElementById('eventTypes');
          const eventDeleteBtn = document.getElementById('eventDeleteBtn');
          if (eventModalTitle) eventModalTitle.textContent = 'New Event';
          if (eventIdEl) eventIdEl.value = '';
          if (eventName) eventName.value = '';
          if (eventBudget) eventBudget.value = '';
          if (eventNotes) eventNotes.value = '';
          if (eventStartDate) eventStartDate.value = '';
          if (eventStartDisplay) eventStartDisplay.textContent = 'Select Date';
          if (eventEndDate) eventEndDate.value = '';
          if (eventEndDisplay) eventEndDisplay.textContent = 'Select Date';
          if (eventTypes) eventTypes.value = (this.data.expenseTypes || EXPENSE_TYPES).join(',');
          document.querySelectorAll('#eventTypeChips .chip').forEach(chip => {
            chip.classList.toggle('on', true);
          });
          if (eventDeleteBtn) eventDeleteBtn.style.display = 'none';
        }
        this.openModal('eventModal');
      }

      openEventDatePicker(field) {
        const currentEl = document.getElementById(`event${field.charAt(0).toUpperCase() + field.slice(1)}Date`);
        const current = (currentEl ? currentEl.value : '') || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          const on = val === cd ? 'on' : '';
          daysHtml += `<div class="picker-item ${on}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          const on = val === cm ? 'on' : '';
          monthsHtml += `<div class="picker-item ${on}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const currentYear = new Date().getFullYear(); for (let y = currentYear - 10; y <= currentYear + 10; y++) {
          const val = String(y);
          const on = val === cy ? 'on' : '';
          yearsHtml += `<div class="picker-item ${on}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = `Select ${field.charAt(0).toUpperCase() + field.slice(1)} Date`;
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmEventDatePick('${field}')">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      confirmEventDatePick(field) {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || '2026';
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) {
          dateObj = new Date(year, month, 0);
        }
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const el = document.getElementById(`event${field.charAt(0).toUpperCase() + field.slice(1)}Date`);
        const display = document.getElementById(`event${field.charAt(0).toUpperCase() + field.slice(1)}Display`);
        if (el) el.value = dateStr;
        if (display) display.textContent = this.fmtDateShort(dateStr);
        this.closePicker();
      }

      toggleEventTypeChip(btn) {
        btn.classList.toggle('on');
        const chips = document.querySelectorAll('#eventTypeChips .chip.on');
        const types = Array.from(chips).map(c => c.dataset.type);
        const eventTypes = document.getElementById('eventTypes');
        if (eventTypes) eventTypes.value = types.join(',');
      }

      saveEvent() {
        this._nwCache = null;
        this.pushUndo(document.getElementById('eventId').value ? 'Edit event' : 'Add event');
        const eventId = document.getElementById('eventId');
        const id = (eventId ? eventId.value : '') || 'evt_' + Date.now();
        const eventName = document.getElementById('eventName');
        const name = (eventName ? eventName.value : '').trim();
        if (!name) { this.toast('Event name is required', 'err'); return; }
        const eventBudget = document.getElementById('eventBudget');
        const budget = this.sanitizeAmount(eventBudget ? eventBudget.value : '');
        const eventStartDate = document.getElementById('eventStartDate');
        const eventEndDate = document.getElementById('eventEndDate');
        const eventNotes = document.getElementById('eventNotes');
        const eventTypes = document.getElementById('eventTypes');
        const startDate = eventStartDate ? eventStartDate.value : '';
        const endDate = eventEndDate ? eventEndDate.value : '';
        const notes = eventNotes ? eventNotes.value : '';
        const typesVal = eventTypes ? eventTypes.value : '';
        let expenseTypes = typesVal ? typesVal.split(',').filter(Boolean) : (this.data.expenseTypes || EXPENSE_TYPES);
        if (!Array.isArray(expenseTypes) || expenseTypes.length === 0) {
          expenseTypes = (this.data.expenseTypes || EXPENSE_TYPES);
        }
        const evt = { id, name, budget, startDate, endDate, expenseTypes, notes };
        const idx = this.data.events.findIndex(e => e.id === id);
        if (idx >= 0) this.data.events[idx] = evt;
        else this.data.events.push(evt);
        this.save();
        this.closeModal('eventModal');
        this.renderEvents();
        if (this.data.currentTab === 'home') this.renderDashboard();
        this.toast('Event saved', 'ok');
      }

      deleteEvent() {
        this.pushUndo('Delete event');
        const eventId = document.getElementById('eventId');
        const id = eventId ? eventId.value : '';
        if (!id) return;
        this.confirmCallback = () => {
          this._nwCache = null;
          this.data.events = this.data.events.filter(e => e.id !== id);
          this.data.transactions.forEach(t => { if (t && t.eventId === id) delete t.eventId; });
          this.save();
          this.closeModal('eventModal');
          this.renderEvents();
          if (this.data.currentTab === 'home') this.renderDashboard();
          this.closeModal('confirmModal');
          this.toast('Event deleted', 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Delete Event?';
        if (confirmBody) confirmBody.textContent = 'All linked transactions will be unlinked. This cannot be undone.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      openEventPicker() {
        const type = document.getElementById('txType').value;
        const allEvents = this.data.events || [];

        // First try: filter by compatible types
        let events = allEvents.filter(e => {
          const types = e.expenseTypes;
          return !Array.isArray(types) || types.length === 0 || types.includes(type);
        });

        // Fallback: if no compatible events, show all events (with indicator)
        const usingFallback = events.length === 0 && allEvents.length > 0;
        if (usingFallback) {
          events = allEvents;
        }

        if (events.length === 0) {
          this.toast('No events yet. Create one in Plan → Events.', 'err');
          return;
        }
        const items = events.map(e => {
          const types = e.expenseTypes;
          const isCompatible = !Array.isArray(types) || types.length === 0 || types.includes(type);
          const spent = this.getEventSpent(e.id);
          const budget = e.budget || 0;
          const remaining = budget - spent;
          let badge = '';
          if (budget > 0) {
            badge = remaining >= 0
              ? ` · ${this.fmt(remaining)} left`
              : ` · ${this.fmt(Math.abs(remaining))} over`;
          }
          const label = isCompatible ? e.name + badge : e.name + badge + ' (⚠ type)';
          return { value: e.id, label: label };
        });
        items.unshift({ value: '', label: 'None' });
        const current = document.getElementById('txEventId').value;
        this.openPicker('Select Event' + (usingFallback ? ' — All Events' : ''), items, (val) => {
          const txEventId = document.getElementById('txEventId');
          const txEventDisplay = document.getElementById('txEventDisplay');
          if (txEventId) txEventId.value = val;
          const evt = this.data.events.find(e => e.id === val);
          if (txEventDisplay) txEventDisplay.textContent = evt ? evt.name : 'Select Event';
        }, current);
      }

      renderGoals() {
        const container = document.getElementById('dashGoals');
        const goals = this.data.goals || [];
        if (!container) return;
        if (goals.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No goals yet. Tap Manage to create one.</div>';
          return;
        }
        container.innerHTML = goals.map(g => {
          const pct = g.target > 0 ? Math.min((g.current || 0) / g.target * 100, 100) : 0;
          const cls = pct >= 100 ? 'success' : pct >= 75 ? 'warning' : '';
          const deadlineStr = g.deadline ? new Date(g.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No deadline';
          const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
          const deadlineColor = daysLeft !== null && daysLeft < 30 ? 'var(--danger)' : 'var(--text-tertiary)';
          return `
            <div style="margin-bottom:12px;cursor:pointer;" onclick="app.openGoalModal('${g.id}')">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:12px;font-weight:600;letter-spacing:-0.01em;">${this.esc(g.name)}</span>
                <span style="font-size:11px;color:var(--text-secondary);font-weight:500;">${this.fmt(g.current || 0)} / ${this.fmt(g.target)}</span>
              </div>
              <div class="progress-track" style="margin-bottom:4px;"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:10px;color:${deadlineColor};font-weight:500;">${deadlineStr}${daysLeft !== null ? ' · ' + daysLeft + ' days left' : ''}</span>
                <span style="font-size:10px;color:var(--text-tertiary);font-weight:700;">${Math.round(pct)}%</span>
              </div>
            </div>
          `;
        }).join('');
      }

      openGoalModal(goalId) {
        if (goalId) {
          const g = this.data.goals.find(x => x && x.id === goalId);
          if (!g) return;
          const goalModalTitle = document.getElementById('goalModalTitle');
          const goalIdEl = document.getElementById('goalId');
          const goalName = document.getElementById('goalName');
          const goalTarget = document.getElementById('goalTarget');
          const goalCurrent = document.getElementById('goalCurrent');
          const goalDeadline = document.getElementById('goalDeadline');
          const goalDeadlineDisplay = document.getElementById('goalDeadlineDisplay');
          const goalType = document.getElementById('goalType');
          const goalTypeDisplay = document.getElementById('goalTypeDisplay');
          const goalNotes = document.getElementById('goalNotes');
          const goalDeleteBtn = document.getElementById('goalDeleteBtn');
          if (goalModalTitle) goalModalTitle.textContent = 'Edit Goal';
          if (goalIdEl) goalIdEl.value = g.id;
          if (goalName) goalName.value = g.name || '';
          if (goalTarget) goalTarget.value = g.target || '';
          if (goalCurrent) goalCurrent.value = g.current || '';
          if (goalDeadline) goalDeadline.value = g.deadline || '';
          if (goalDeadlineDisplay) goalDeadlineDisplay.textContent = g.deadline ? this.fmtDateShort(g.deadline) : 'Select Date';
          if (goalType) goalType.value = g.linkedType || '';
          if (goalTypeDisplay) goalTypeDisplay.textContent = g.linkedType || 'None';
          if (goalNotes) goalNotes.value = g.notes || '';
          if (goalDeleteBtn) goalDeleteBtn.style.display = 'block';
        } else {
          const goalModalTitle = document.getElementById('goalModalTitle');
          const goalIdEl = document.getElementById('goalId');
          const goalName = document.getElementById('goalName');
          const goalTarget = document.getElementById('goalTarget');
          const goalCurrent = document.getElementById('goalCurrent');
          const goalDeadline = document.getElementById('goalDeadline');
          const goalDeadlineDisplay = document.getElementById('goalDeadlineDisplay');
          const goalType = document.getElementById('goalType');
          const goalTypeDisplay = document.getElementById('goalTypeDisplay');
          const goalNotes = document.getElementById('goalNotes');
          const goalDeleteBtn = document.getElementById('goalDeleteBtn');
          if (goalModalTitle) goalModalTitle.textContent = 'New Goal';
          if (goalIdEl) goalIdEl.value = '';
          if (goalName) goalName.value = '';
          if (goalTarget) goalTarget.value = '';
          if (goalCurrent) goalCurrent.value = '';
          if (goalDeadline) goalDeadline.value = '';
          if (goalDeadlineDisplay) goalDeadlineDisplay.textContent = 'Select Date';
          if (goalType) goalType.value = '';
          if (goalTypeDisplay) goalTypeDisplay.textContent = 'None';
          if (goalNotes) goalNotes.value = '';
          if (goalDeleteBtn) goalDeleteBtn.style.display = 'none';
        }
        this.openModal('goalModal');
      }

      saveGoal() {
        this._nwCache = null;
        this.pushUndo(document.getElementById('goalId').value ? 'Edit goal' : 'Add goal');
        const goalId = document.getElementById('goalId');
        const id = (goalId ? goalId.value : '') || 'goal_' + Date.now();
        const goalName = document.getElementById('goalName');
        const name = (goalName ? goalName.value : '').trim();
        if (!name) { this.toast('Goal name is required', 'err'); return; }
        const goalTarget = document.getElementById('goalTarget');
        const target = this.sanitizeAmount(goalTarget ? goalTarget.value : '');
        if (target <= 0) { this.toast('Target amount is required', 'err'); return; }
        const goalCurrent = document.getElementById('goalCurrent');
        const current = this.sanitizeAmount(goalCurrent ? goalCurrent.value : '');
        const goalDeadline = document.getElementById('goalDeadline');
        const goalType = document.getElementById('goalType');
        const goalNotes = document.getElementById('goalNotes');
        const g = {
          id, name, target, current,
          deadline: goalDeadline ? goalDeadline.value : '',
          linkedType: goalType ? goalType.value : undefined,
          notes: goalNotes ? goalNotes.value : ''
        };
        const idx = this.data.goals.findIndex(x => x && x.id === id);
        if (idx >= 0) this.data.goals[idx] = g;
        else this.data.goals.push(g);
        this.save();
        this.closeModal('goalModal');
        this.renderGoals();
        this.toast('Goal saved', 'ok');
      }

      deleteGoal() {
        this.pushUndo('Delete goal');
        const goalId = document.getElementById('goalId');
        const id = goalId ? goalId.value : '';
        if (!id) return;
        this.confirmCallback = () => {
          this._nwCache = null;
          this.data.goals = this.data.goals.filter(g => g.id !== id);
          this.save();
          this.closeModal('goalModal');
          this.renderGoals();
          this.closeModal('confirmModal');
          this.toast('Goal deleted', 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Delete Goal?';
        if (confirmBody) confirmBody.textContent = 'This action cannot be undone.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      openGoalDatePicker() {
        const current = document.getElementById('goalDeadline').value || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          const on = val === cd ? 'on' : '';
          daysHtml += `<div class="picker-item ${on}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          const on = val === cm ? 'on' : '';
          monthsHtml += `<div class="picker-item ${on}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const goalYear = new Date().getFullYear(); for (let y = goalYear - 10; y <= goalYear + 10; y++) {
          const val = String(y);
          const on = val === cy ? 'on' : '';
          yearsHtml += `<div class="picker-item ${on}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = 'Select Deadline';
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmGoalDatePick()">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      confirmGoalDatePick() {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || '2026';
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) {
          dateObj = new Date(year, month, 0);
        }
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const goalDeadline = document.getElementById('goalDeadline');
        const goalDeadlineDisplay = document.getElementById('goalDeadlineDisplay');
        if (goalDeadline) goalDeadline.value = dateStr;
        if (goalDeadlineDisplay) goalDeadlineDisplay.textContent = this.fmtDateShort(dateStr);
        this.closePicker();
      }

      openGoalTypePicker() {
        const items = [{ value: '', label: 'None' }, ...(this.data.expenseTypes || EXPENSE_TYPES).map(t => ({ value: t, label: t }))];
        const current = document.getElementById('goalType').value;
        this.openPicker('Linked Expense Type', items, (val) => {
          const goalType = document.getElementById('goalType');
          const goalTypeDisplay = document.getElementById('goalTypeDisplay');
          if (goalType) goalType.value = val;
          if (goalTypeDisplay) goalTypeDisplay.textContent = val || 'None';
        }, current);
      }

      renderAccountsSummary() {
        const container = document.getElementById('dashAccounts');
        const accounts = (this.data.accounts || []).filter(acc => {
          if (this.isSelfProfile()) return acc.id === 'personal';
          return acc.id === 'joint';
        });
        if (!container) return;
        if (accounts.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No accounts configured</div>';
          return;
        }
        container.innerHTML = accounts.map(acc => {
          const sourceMatch = acc.id === 'joint' ? 'Joint Account' : 'Personal';
          const txs = this.data.transactions.filter(t => t && t.source === sourceMatch && (!acc.asOfDate || t.date >= acc.asOfDate));
          // Exclude mirror transactions from breakdown to avoid inflating income with cross-profile syncs
          const ownTxs = txs.filter(t => !t.mirrorOf);
          const income = this.txSum(ownTxs.filter(t => ['Earning','Saving','Investment'].includes(t.type)));
          const expense = this.txSum(ownTxs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)));
          const transferOut = this.txSum(ownTxs.filter(t => t.type === 'Transfer' && (
            (sourceMatch === 'Personal' && (t.category === 'Personal to Joint' || t.category === 'Other Transfer')) ||
            (sourceMatch === 'Joint Account' && (t.category === 'Joint to Personal' || t.category === 'Other Transfer'))
          )));
          const transferIn = this.txSum(ownTxs.filter(t => t.type === 'Transfer' && (
            (sourceMatch === 'Personal' && t.category === 'Joint to Personal') ||
            (sourceMatch === 'Joint Account' && t.category === 'Personal to Joint')
          )));
          const bal = (acc.startingBalance || 0) + income + transferIn - expense - transferOut;
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
              <span style="font-size:12px;font-weight:600;">${this.esc(acc.name)}</span>
              <span style="font-size:13px;font-weight:600;">${this.fmt(bal)}</span>
            </div>
          `;
        }).join('');
      }

      /** Account modal now uses real array indices so Joint profile doesn't corrupt Personal account */
      openAccountModal() {
        const container = document.getElementById('accountList');
        const accounts = (this.data.accounts || []).map((acc, idx) => ({...acc, _realIdx: idx})).filter(acc => {
          if (this.isSelfProfile()) return acc.id === 'personal';
          return acc.id === 'joint';
        });
        if (!container) return;
        container.innerHTML = accounts.map((acc) => `
          <div class="field" style="margin-bottom:12px;">
            <label>Account</label>
            <input type="text" class="inp acc-name" data-real-index="${acc._realIdx}" value="${this.esc(acc.name)}" placeholder="Account name" style="box-shadow:none;" aria-label="Account name">
            <div style="display:flex;gap:6px;margin-top:6px;">
              <div class="input-wrapper" style="flex:1;">
                <span class="input-prefix">₹</span>
                <input type="text" class="inp acc-balance" data-real-index="${acc._realIdx}" value="${acc.startingBalance || ''}" placeholder="Starting balance" style="box-shadow:none;" inputmode="decimal" aria-label="Starting balance">
              </div>
              <input type="date" class="inp acc-date" data-real-index="${acc._realIdx}" value="${acc.asOfDate || ''}" style="flex:1;box-shadow:none;" aria-label="Balance as of date">
            </div>
          </div>
        `).join('');
        this.openModal('accountModal');
      }

      saveAccounts() {
        this._nwCache = null;
        this.pushUndo('Edit accounts');
        document.querySelectorAll('.acc-name').forEach(el => {
          const idx = parseInt(el.dataset.realIndex, 10);
          if (this.data.accounts[idx]) this.data.accounts[idx].name = el.value;
        });
        document.querySelectorAll('.acc-balance').forEach(el => {
          const idx = parseInt(el.dataset.realIndex, 10);
          if (this.data.accounts[idx]) this.data.accounts[idx].startingBalance = this.sanitizeAmount(el.value);
        });
        document.querySelectorAll('.acc-date').forEach(el => {
          const idx = parseInt(el.dataset.realIndex, 10);
          if (this.data.accounts[idx]) this.data.accounts[idx].asOfDate = el.value;
        });
        this.save();
        this.closeModal('accountModal');
        this.renderAccountsSummary();
        this.toast('Accounts saved', 'ok');
      }

      renderNetWorth() {
        const container = document.getElementById('dashNetWorth');
        if (!container) return;
        const data = this.getNetWorthData();
        if (data.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">Add transactions to see cash flow trend</div>';
          return;
        }
        const latest = data[data.length - 1];
        const fmtNeg = (n) => {
          if (n < 0) return '-₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
          return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        };

        const W = 320, H = 160;
        const pad = { t: 10, r: 10, b: 28, l: 10 };
        const cw = W - pad.l - pad.r;
        const ch = H - pad.t - pad.b;

        const maxVal = Math.max(...data.map(d => d.netWorth));
        const minVal = Math.min(...data.map(d => d.netWorth));
        const range = maxVal - minVal || 1;

        const sx = (i) => pad.l + (i / (data.length - 1 || 1)) * cw;
        const sy = (v) => pad.t + ch - ((v - minVal) / range) * ch;

        const pts = data.map((d, i) => ({ x: sx(i), y: sy(d.netWorth), val: d.netWorth, label: d.label, change: d.change }));
        let pathD = '';
        if (pts.length === 1) {
          pathD = `M ${pts[0].x} ${pts[0].y}`;
        } else {
          pathD = `M ${pts[0].x} ${pts[0].y}`;
          for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(i - 1, 0)];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[Math.min(i + 2, pts.length - 1)];
            const cp1x = p1.x + (p2.x - p0.x) * 0.15;
            const cp1y = p1.y + (p2.y - p0.y) * 0.15;
            const cp2x = p2.x - (p3.x - p1.x) * 0.15;
            const cp2y = p2.y - (p3.y - p1.y) * 0.15;
            pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
          }
        }

        const areaD = pathD + ` L ${pts[pts.length - 1].x} ${pad.t + ch} L ${pts[0].x} ${pad.t + ch} Z`;

        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = pad.t + ch * pct;
          return `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--glass-border-dark)" stroke-width="0.5" stroke-dasharray="2,3" opacity="0.5"/>`;
        }).join('');

        const labels = pts.map((p, i) => {
          return `<text x="${p.x}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--text-tertiary)" font-weight="500">${p.label}</text>`;
        }).join('');

        const points = pts.map((p, i) => {
          const isLast = i === pts.length - 1;
          const color = p.val >= 0 ? 'var(--success)' : 'var(--danger)';
          return `
            <g class="nw-point" data-idx="${i}" style="cursor:pointer;">
              <circle cx="${p.x}" cy="${p.y}" r="${isLast ? 5 : 3.5}" fill="var(--surface-solid)" stroke="${color}" stroke-width="${isLast ? 2.5 : 2}" opacity="0" style="animation: pointIn 300ms ${200 + i * 80}ms ease-out forwards;"/>
              <circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent" stroke="none"/>
            </g>
          `;
        }).join('');

        const tooltipId = 'nwTooltip';

        container.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <div style="font-size:22px;font-weight:600;letter-spacing:-0.03em;">${fmtNeg(latest.netWorth)}</div>
              <div style="font-size:10px;color:var(--text-tertiary);font-weight:500;">Current Net Cash Flow</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:14px;font-weight:600;color:${latest.change >= 0 ? 'var(--success)' : 'var(--danger)'}">${latest.change >= 0 ? '+' : ''}${fmtNeg(latest.change)}</div>
              <div style="font-size:10px;color:var(--text-tertiary);font-weight:500;">vs last month</div>
            </div>
          </div>
          <div style="position:relative;width:100%;" id="nwChartWrap">
            <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="overflow:visible;display:block;">
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.18"/>
                  <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
                </linearGradient>
              </defs>
              ${gridLines}
              <path d="${areaD}" fill="url(#nwGrad)" stroke="none" opacity="0" style="animation: areaIn 500ms ease-out forwards;"/>
              <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0" style="animation: lineIn 600ms ease-out forwards;"/>
              ${points}
              ${labels}
            </svg>
            <div id="${tooltipId}" style="position:absolute;pointer-events:none;opacity:0;transition:opacity 150ms;z-index:10;background:var(--surface-solid);border:1px solid var(--glass-border-dark);border-radius:8px;padding:6px 10px;box-shadow:var(--shadow-glass);font-size:11px;font-weight:600;white-space:nowrap;transform:translate(-50%, -110%);"></div>
          </div>

          <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:3px;"><div style="width:6px;height:6px;border-radius:50%;background:var(--success);"></div><span style="font-size:10px;color:var(--text-secondary);font-weight:500;">Assets</span></div>
            <div style="display:flex;align-items:center;gap:3px;"><div style="width:6px;height:6px;border-radius:50%;background:var(--danger);"></div><span style="font-size:10px;color:var(--text-secondary);font-weight:500;">Liabilities</span></div>
          </div>
        `;

        const tooltip = document.getElementById(tooltipId);
        const wrap = document.getElementById('nwChartWrap');
        const svgEl = wrap ? wrap.querySelector('svg') : null;
        if (wrap && tooltip && svgEl) {
          wrap.querySelectorAll('.nw-point').forEach(g => {
            const positionTooltip = (idx) => {
              const d = data[idx];
              const color = d.netWorth >= 0 ? 'var(--success)' : 'var(--danger)';
              tooltip.innerHTML = `<span style="color:${color};">${fmtNeg(d.netWorth)}</span> <span style="color:var(--text-tertiary);font-weight:500;">· ${d.label}</span>`;
              tooltip.style.opacity = '1';
              // M1: Use getBoundingClientRect for accurate positioning relative to SVG
              const pt = pts[idx];
              const svgRect = svgEl.getBoundingClientRect();
              const wrapRect = wrap.getBoundingClientRect();
              const x = svgRect.left - wrapRect.left + (pt.x / W) * svgRect.width;
              const y = svgRect.top - wrapRect.top + (pt.y / H) * svgRect.height;
              tooltip.style.left = x + 'px';
              tooltip.style.top = y + 'px';
              tooltip.style.transform = 'translate(-50%, -110%)';
            };
            g.addEventListener('mouseenter', (e) => {
              const idx = parseInt(g.dataset.idx);
              positionTooltip(idx);
              g.querySelector('circle').setAttribute('r', '6');
              g.querySelector('circle').setAttribute('stroke-width', '3');
            });
            g.addEventListener('mouseleave', () => {
              tooltip.style.opacity = '0';
              const idx = parseInt(g.dataset.idx);
              const isLast = idx === data.length - 1;
              g.querySelector('circle').setAttribute('r', isLast ? '5' : '3.5');
              g.querySelector('circle').setAttribute('stroke-width', isLast ? '2.5' : '2');
            });
            g.addEventListener('touchstart', (e) => {
              e.preventDefault();
              const idx = parseInt(g.dataset.idx);
              positionTooltip(idx);
              g.querySelector('circle').setAttribute('r', '6');
              g.querySelector('circle').setAttribute('stroke-width', '3');
            }, { passive: false });
            g.addEventListener('touchend', () => {
              tooltip.style.opacity = '0';
              const idx = parseInt(g.dataset.idx);
              const isLast = idx === data.length - 1;
              g.querySelector('circle').setAttribute('r', isLast ? '5' : '3.5');
              g.querySelector('circle').setAttribute('stroke-width', isLast ? '2.5' : '2');
            });
          });
        }
      }

      getNetWorthData() {
        if (this._nwCache) return this._nwCache;
        const months = [];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const label = d.toLocaleDateString('en-US', { month: 'short' });
          months.push({ ym, label });
        }
        const result = months.map((m, i) => {
          const txs = this.data.transactions.filter(t => t && t.date && t.date.startsWith(m.ym));
          const assets = this.txSum(txs.filter(t => ['Earning','Saving','Investment'].includes(t.type)));
          const liabilities = this.txSum(txs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)));
          const netWorth = assets - liabilities;
          let change = 0;
          if (i > 0) {
            const prev = months[i - 1];
            const prevTxs = this.data.transactions.filter(t => t && t.date && t.date.startsWith(prev.ym));
            const prevAssets = this.txSum(prevTxs.filter(t => ['Earning','Saving','Investment'].includes(t.type)));
            const prevLiab = this.txSum(prevTxs.filter(t => ['Essential','Non-essential','Vacation'].includes(t.type)));
            change = netWorth - (prevAssets - prevLiab);
          }
          return { ...m, netWorth, change, assets, liabilities };
        });
        this._nwCache = result;
        return result;
      }

      getMonthlyComparison(type) {
        const [cy, cm] = this.data.currentMonth.split('-').map(Number);
        const prevMonth = cm === 1 ? `${cy - 1}-12` : `${cy}-${String(cm - 1).padStart(2, '0')}`;
        const currentSpent = this.txSum(this.data.transactions.filter(t => t && t.date && t.date.startsWith(this.data.currentMonth) && t.type === type));
        const prevSpent = this.txSum(this.data.transactions.filter(t => t && t.date && t.date.startsWith(prevMonth) && t.type === type));
        const diff = currentSpent - prevSpent;
        const pct = prevSpent > 0 ? Math.round((diff / prevSpent) * 100) : 0;
        return { diff, pct, currentSpent, prevSpent };
      }

      openCopyMonthPicker() {
        this.copySelected = new Set();
        const copyFilterItem = document.getElementById('copyFilterItem');
        const copyFilterYear = document.getElementById('copyFilterYear');
        const copyFilterMonth = document.getElementById('copyFilterMonth');
        const copyMonthValue = document.getElementById('copyMonthValue');
        const copyMonthDisplay = document.getElementById('copyMonthDisplay');
        const copyTxList = document.getElementById('copyTxList');
        if (copyFilterItem) copyFilterItem.value = '';
        if (copyFilterYear) copyFilterYear.value = '';
        if (copyFilterMonth) copyFilterMonth.value = '';
        if (copyMonthValue) copyMonthValue.value = '';
        if (copyMonthDisplay) copyMonthDisplay.textContent = 'Select Month';
        if (copyTxList) copyTxList.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:12px 0;text-align:center;">Select a source month to see expenses</div>';
        this.openModal('copyModal');
      }

      openCopyMonthPickerList() {
        const months = [...new Set(this.data.transactions.filter(t => t && t.date).map(t => t.date.slice(0, 7)))].sort().reverse();
        if (months.length === 0) {
          this.toast('No transactions available to copy', 'err');
          return;
        }
        const items = months.map(m => {
          const [y, mo] = m.split('-');
          const label = new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return { value: m, label };
        });
        this.openPicker('Select Source Month', items, (val) => {
          const copyMonthValue = document.getElementById('copyMonthValue');
          const copyMonthDisplay = document.getElementById('copyMonthDisplay');
          if (copyMonthValue) copyMonthValue.value = val;
          const [y, mo] = val.split('-');
          if (copyMonthDisplay) copyMonthDisplay.textContent = new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          this.renderCopyTransactions();
        }, document.getElementById('copyMonthValue').value);
      }

      renderCopyTransactions() {
        const sourceMonth = document.getElementById('copyMonthValue').value;
        const container = document.getElementById('copyTxList');
        if (!container) return;
        if (!sourceMonth) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:12px 0;text-align:center;">Select a source month to see expenses</div>';
          return;
        }

        const itemFilter = (document.getElementById('copyFilterItem').value || '').toLowerCase().trim();
        const yearFilter = (document.getElementById('copyFilterYear').value || '').trim();
        const monthFilter = (document.getElementById('copyFilterMonth').value || '').toLowerCase().trim();

        let txs = this.data.transactions.filter(t => t && t.date && t.date.startsWith(sourceMonth));
        if (itemFilter) txs = txs.filter(t => (t.item || '').toLowerCase().includes(itemFilter));
        if (yearFilter) txs = txs.filter(t => t.date.startsWith(yearFilter));
        if (monthFilter) {
          const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
          const monthIdx = monthNames.findIndex(m => m === monthFilter);
          if (monthIdx >= 0) {
            const mm = String(monthIdx + 1).padStart(2, '0');
            txs = txs.filter(t => t.date.slice(5, 7) === mm);
          }
        }

        if (txs.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:12px 0;text-align:center;">No matching transactions</div>';
          return;
        }

        container.innerHTML = txs.map(t => {
          const isSelected = this.copySelected.has(t.id);
          return `
            <div class="copy-tx-row" data-copy-id="${this.esc(t.id)}">
              <div class="cb ${isSelected ? 'on' : ''}">${isSelected ? this.icon('check') : ''}</div>
              <div class="copy-tx-info">
                <div class="copy-tx-title">${this.esc(t.item || 'Untitled')}</div>
                <div class="copy-tx-meta">${this.esc(t.type || '')} · ${this.esc(t.category || '')} · ${t.date}</div>
              </div>
              <div class="copy-tx-amt">${this.fmt(this.txDisplayAmount(t))}</div>
            </div>
          `;
        }).join('');
      }

      toggleCopySelect(id) {
        if (this.copySelected.has(id)) this.copySelected.delete(id);
        else this.copySelected.add(id);
        this.renderCopyTransactions();
      }

      copySelectedExpenses() {
        this._nwCache = null;
        this.pushUndo('Copy expenses');
        const sourceMonth = document.getElementById('copyMonthValue').value;
        if (!sourceMonth) { this.toast('Select a source month', 'err'); return; }
        if (this.copySelected.size === 0) { this.toast('Select at least one transaction', 'err'); return; }

        const targetMonth = this.data.currentMonth;
        let count = 0;
        this.copySelected.forEach(id => {
          const t = this.data.transactions.find(x => x && x.id === id);
          if (t) {
            const [ty, tm] = targetMonth.split('-').map(Number);
            const srcDay = parseInt(t.date.slice(8), 10);
            const lastDay = new Date(ty, tm, 0).getDate();
            const safeDay = String(Math.min(srcDay, lastDay)).padStart(2, '0');
            const { recurringId, ...tWithoutRecurring } = t;
            const newTx = { ...tWithoutRecurring, id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + String(count).padStart(3, '0'), date: targetMonth + '-' + safeDay };
            this.data.transactions.push(newTx);
            count++;
          }
        });
        this.save();
        this.closeModal('copyModal');
        this.renderAll();
        this.toast(count + ' expense' + (count > 1 ? 's' : '') + ' copied to ' + this.monthName(targetMonth), 'ok');
      }

      monthName(ym) {
        const [y, m] = ym.split('-');
        return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }

      openCopyBudgetModal() {
        this.copyBudgetSelected = new Set();
        this.copyTargetMonths = new Set();
        this.copyTargetMode = 'single';
        this.copyBudgetFilter = 'all';
        const copyBudgetSourceValue = document.getElementById('copyBudgetSourceValue');
        const copyBudgetSourceDisplay = document.getElementById('copyBudgetSourceDisplay');
        const copyBudgetTargetValue = document.getElementById('copyBudgetTargetValue');
        const copyBudgetTargetDisplay = document.getElementById('copyBudgetTargetDisplay');
        const copyTargetSingle = document.getElementById('copyTargetSingle');
        const copyTargetMulti = document.getElementById('copyTargetMulti');
        const copyMultiMonthList = document.getElementById('copyMultiMonthList');
        if (copyBudgetSourceValue) copyBudgetSourceValue.value = '';
        if (copyBudgetSourceDisplay) copyBudgetSourceDisplay.textContent = 'Select Month';
        if (copyBudgetTargetValue) copyBudgetTargetValue.value = '';
        if (copyBudgetTargetDisplay) copyBudgetTargetDisplay.textContent = 'Select Month';
        if (copyTargetSingle) copyTargetSingle.style.display = 'block';
        if (copyTargetMulti) copyTargetMulti.style.display = 'none';
        if (copyMultiMonthList) copyMultiMonthList.innerHTML = '';
        const seg = document.querySelectorAll('#copyBudgetModal .segmented .segmented-btn');
        if (seg.length >= 2) {
          seg[0].classList.add('on');
          seg[1].classList.remove('on');
        }
        const filterSeg = document.querySelectorAll('#copyBudgetModal .segmented')[1];
        if (filterSeg) {
          filterSeg.querySelectorAll('.segmented-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
        }
        this.renderCopyBudgetTypes();
        this.openModal('copyBudgetModal');
      }

      setCopyTargetMode(mode, btn) {
        this.copyTargetMode = mode;
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        const copyTargetSingle = document.getElementById('copyTargetSingle');
        const copyTargetMulti = document.getElementById('copyTargetMulti');
        if (copyTargetSingle) copyTargetSingle.style.display = mode === 'single' ? 'block' : 'none';
        if (copyTargetMulti) copyTargetMulti.style.display = mode === 'multi' ? 'block' : 'none';
        if (mode === 'multi') this.renderCopyMultiMonths();
      }

      openCopyBudgetSourcePicker() {
        const months = this.getBudgetMonths();
        if (months.length === 0) {
          this.toast('No budgets found to copy', 'err');
          return;
        }
        const items = months.map(m => {
          const [y, mo] = m.split('-');
          const label = new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return { value: m, label };
        });
        this.openPicker('Select Source Month', items, (val) => {
          const copyBudgetSourceValue = document.getElementById('copyBudgetSourceValue');
          const copyBudgetSourceDisplay = document.getElementById('copyBudgetSourceDisplay');
          if (copyBudgetSourceValue) copyBudgetSourceValue.value = val;
          if (copyBudgetSourceDisplay) copyBudgetSourceDisplay.textContent = this.monthName(val);
          this.renderCopyBudgetTypes();
          if (this.copyTargetMode === 'multi') this.renderCopyMultiMonths();
        }, document.getElementById('copyBudgetSourceValue').value);
      }

      openCopyBudgetTargetPicker() {
        const items = [];
        for (let y = 2020; y <= 2040; y++) {
          for (let m = 1; m <= 12; m++) {
            const val = `${y}-${String(m).padStart(2, '0')}`;
            const label = new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            items.push({ value: val, label });
          }
        }
        this.openPicker('Select Target Month', items, (val) => {
          const copyBudgetTargetValue = document.getElementById('copyBudgetTargetValue');
          const copyBudgetTargetDisplay = document.getElementById('copyBudgetTargetDisplay');
          if (copyBudgetTargetValue) copyBudgetTargetValue.value = val;
          if (copyBudgetTargetDisplay) copyBudgetTargetDisplay.textContent = this.monthName(val);
        }, document.getElementById('copyBudgetTargetValue').value);
      }

      getBudgetMonths() {
        const months = new Set();
        Object.values(this.data.budgets).forEach(typeBudget => {
          if (typeBudget && typeof typeBudget === 'object') {
            Object.keys(typeBudget).forEach(m => months.add(m));
          }
        });
        return [...months].sort().reverse();
      }

      setCopyBudgetFilter(filter, btn) {
        this.copyBudgetFilter = filter;
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        this.renderCopyBudgetTypes();
      }

      renderCopyBudgetTypes() {
        const sourceMonth = document.getElementById('copyBudgetSourceValue').value;
        const container = document.getElementById('copyBudgetTypeList');
        if (!container) return;
        if (!sourceMonth) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:12px 0;text-align:center;">Select a source month to see expense types</div>';
          return;
        }
        let hasAny = false;
        const html = (this.data.expenseTypes || EXPENSE_TYPES).map(type => {
          const typeBudget = this.data.budgets[type] || {};
          const data = typeBudget[sourceMonth];
          if (!data || !data.amount) return '';

          let itemsToShow = data.items ? JSON.parse(JSON.stringify(data.items)) : [];
          let copyableAmount = data.amount;
          if (this.copyBudgetFilter === 'fixed') {
            itemsToShow = itemsToShow.filter(it => (it.frequency || 'One-time') !== 'One-time');
            copyableAmount = itemsToShow.reduce((s, it) => s + (it.amount || 0), 0);
          } else if (this.copyBudgetFilter === 'onetime') {
            itemsToShow = itemsToShow.filter(it => (it.frequency || 'One-time') === 'One-time');
            copyableAmount = itemsToShow.reduce((s, it) => s + (it.amount || 0), 0);
          }

          if (copyableAmount === 0 && (data.items || []).length > 0) return '';
          if (!data.amount) return '';

          hasAny = true;
          const isSelected = this.copyBudgetSelected.has(type);
          const catCount = itemsToShow.filter(i => i.category).length;
          const catHint = catCount > 0 ? ` · ${catCount} categorized` : '';
          const filterHint = this.copyBudgetFilter !== 'all' ? ` · ${this.esc(this.copyBudgetFilter)}` : '';
          return `
            <div class="copy-tx-row" data-copy-type="${this.esc(type)}" style="padding:10px 0;">
              <div class="cb ${isSelected ? 'on' : ''}">${isSelected ? this.icon('check') : ''}</div>
              <div class="copy-tx-info">
                <div class="copy-tx-title">${this.esc(type)}</div>
                <div class="copy-tx-meta">${this.fmt(copyableAmount)}${itemsToShow.length ? ' · ' + itemsToShow.length + ' items' : ''}${catHint}${filterHint}</div>
              </div>
            </div>
          `;
        }).join('');

        if (!hasAny) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:12px 0;text-align:center;">No budgets set for this month</div>';
          return;
        }
        container.innerHTML = html;
      }

      toggleCopyTypeSelect(type) {
        if (this.copyBudgetSelected.has(type)) this.copyBudgetSelected.delete(type);
        else this.copyBudgetSelected.add(type);
        this.renderCopyBudgetTypes();
      }

      renderCopyMultiMonths() {
        const container = document.getElementById('copyMultiMonthList');
        if (!container) return;
        const months = [];
        const today = new Date();
        for (let i = -6; i < 18; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
          const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          months.push({ val, label });
        }
        container.innerHTML = months.map(m => {
          const isSelected = this.copyTargetMonths.has(m.val);
          return `
            <div class="copy-tx-row" data-copy-month="${this.esc(m.val)}" style="padding:6px 0;">
              <div class="cb ${isSelected ? 'on' : ''}">${isSelected ? this.icon('check') : ''}</div>
              <div class="copy-tx-info"><div class="copy-tx-title">${m.label}</div></div>
            </div>
          `;
        }).join('');
      }

      toggleCopyMonthSelect(month) {
        if (this.copyTargetMonths.has(month)) this.copyTargetMonths.delete(month);
        else this.copyTargetMonths.add(month);
        this.renderCopyMultiMonths();
      }

      copySelectedBudgets() {
        this._nwCache = null;
        this.pushUndo('Copy budgets');
        const sourceMonth = document.getElementById('copyBudgetSourceValue').value;
        if (!sourceMonth) { this.toast('Select a source month', 'err'); return; }
        if (this.copyBudgetSelected.size === 0) { this.toast('Select at least one expense type', 'err'); return; }

        let targets = [];
        if (this.copyTargetMode === 'single') {
          const targetMonth = document.getElementById('copyBudgetTargetValue').value;
          if (!targetMonth) { this.toast('Select a target month', 'err'); return; }
          targets.push(targetMonth);
        } else {
          if (this.copyTargetMonths.size === 0) { this.toast('Select at least one target month', 'err'); return; }
          targets = Array.from(this.copyTargetMonths).sort();
        }

        let count = 0;
        targets.forEach(targetMonth => {
          this.copyBudgetSelected.forEach(type => {
            const typeBudget = this.data.budgets[type] || {};
            const sourceData = typeBudget[sourceMonth];
            if (sourceData && sourceData.amount) {
              if (!this.data.budgets[type]) this.data.budgets[type] = {};
              let itemsToCopy = sourceData.items ? JSON.parse(JSON.stringify(sourceData.items)) : [];
              let amountToCopy = sourceData.amount;

              if (this.copyBudgetFilter !== 'all' && itemsToCopy.length > 0) {
                itemsToCopy = itemsToCopy.filter(it => {
                  const freq = it.frequency || 'One-time';
                  if (this.copyBudgetFilter === 'fixed') return freq !== 'One-time';
                  if (this.copyBudgetFilter === 'onetime') return freq === 'One-time';
                  return true;
                });
                amountToCopy = itemsToCopy.reduce((s, it) => s + (it.amount || 0), 0);
              } else if (this.copyBudgetFilter !== 'all' && itemsToCopy.length === 0) {
                return;
              }

              if (amountToCopy === 0 && itemsToCopy.length === 0) return;

              itemsToCopy = itemsToCopy.map(it => {
                const { recurringBudgetId, ...rest } = it;
                return rest;
              });

              this.data.budgets[type][targetMonth] = {
                amount: amountToCopy,
                items: itemsToCopy
              };
              count++;
            }
          });
        });

        this.save();
        this.closeModal('copyBudgetModal');
        this.renderPlan();
        if (this.data.currentTab === 'home') this.renderDashboard();
        this.toast(`Copied ${count} budget(s) to ${targets.length} month(s)`, 'ok');
      }

      renderClearBudgetMonths() {
        const container = document.getElementById('clearBudgetMonthList');
        if (!container) return;
        const months = [];
        const today = new Date();
        for (let i = -12; i < 12; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
          const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          months.push({ val, label });
        }
        this._clearBudgetMonthOptions = months.map(m => m.val);
        if (months.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0;text-align:center;">No months available</div>';
          return;
        }
        container.innerHTML = months.map(m => {
          const isSelected = this.clearBudgetMonths.has(m.val);
          const budgetTotal = this.getMonthBudgetTotal(m.val);
          const hasBudget = budgetTotal > 0;
          return `
            <div class="copy-tx-row" data-clear-month="${this.esc(m.val)}" style="padding:6px 8px;opacity:${hasBudget ? 1 : 0.5};">
              <div class="cb ${isSelected ? 'on' : ''}" style="width:16px;height:16px;min-width:16px;">${isSelected ? this.icon('check') : ''}</div>
              <div class="copy-tx-info" style="flex:1;min-width:0;">
                <div class="copy-tx-title" style="font-size:12px;">${m.label}</div>
              </div>
              <div class="copy-tx-amt" style="font-size:11px;color:${hasBudget ? 'var(--text-secondary)' : 'var(--text-tertiary)'};font-weight:600;">${hasBudget ? this.fmt(budgetTotal) : 'No budget'}</div>
            </div>
          `;
        }).join('');
        this.updateClearBudgetLabels();
      }

      getMonthBudgetTotal(month) {
        let total = 0;
        Object.keys(this.data.budgets).forEach(type => {
          const typeBudget = this.data.budgets[type];
          if (typeBudget && typeBudget[month]) {
            total += typeBudget[month].amount || 0;
          }
        });
        return total;
      }

      toggleClearBudgetMonth(month) {
        if (this.clearBudgetMonths.has(month)) {
          this.clearBudgetMonths.delete(month);
        } else {
          this.clearBudgetMonths.add(month);
        }
        this.renderClearBudgetMonths();
      }

      toggleAllClearBudgetMonths() {
        const allSelected = this._clearBudgetMonthOptions.every(m => this.clearBudgetMonths.has(m));
        if (allSelected) {
          this._clearBudgetMonthOptions.forEach(m => this.clearBudgetMonths.delete(m));
        } else {
          this._clearBudgetMonthOptions.forEach(m => this.clearBudgetMonths.add(m));
        }
        this.renderClearBudgetMonths();
      }

      updateClearBudgetLabels() {
        const count = this.clearBudgetMonths.size;
        let total = 0;
        this.clearBudgetMonths.forEach(m => {
          total += this.getMonthBudgetTotal(m);
        });
        const countLabel = document.getElementById('clearBudgetCountLabel');
        const totalLabel = document.getElementById('clearBudgetTotalLabel');
        const toggleBtn = document.getElementById('clearBudgetToggleAllBtn');
        const allSelected = this._clearBudgetMonthOptions.length > 0 && this._clearBudgetMonthOptions.every(m => this.clearBudgetMonths.has(m));
        if (countLabel) countLabel.textContent = count + ' month' + (count !== 1 ? 's' : '') + ' selected';
        if (totalLabel) totalLabel.textContent = this.fmt(total) + ' total budget';
        if (toggleBtn) toggleBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
      }

      confirmClearPlanBudget() {
        if (this.clearBudgetMonths.size === 0) {
          this.toast('Select at least one month', 'err');
          return;
        }
        let budgetCount = 0;
        let totalAmount = 0;
        this.clearBudgetMonths.forEach(month => {
          Object.keys(this.data.budgets).forEach(type => {
            const typeBudget = this.data.budgets[type];
            if (typeBudget && typeBudget[month]) {
              budgetCount++;
              totalAmount += typeBudget[month].amount || 0;
            }
          });
        });
        if (budgetCount === 0) {
          this.toast('No budgets set in selected months', 'ok');
          return;
        }
        this.pushUndo('Clear budgets');
        this.confirmCallback = () => {
          this._nwCache = null;
          this.clearBudgetMonths.forEach(month => {
            Object.keys(this.data.budgets).forEach(type => {
              if (this.data.budgets[type] && this.data.budgets[type][month]) {
                delete this.data.budgets[type][month];
              }
            });
          });
          this.save();
          this.renderPlan();
          if (this.data.currentTab === 'home') this.renderDashboard();
          this.closeModal('confirmModal');
          this.toast(`${budgetCount} budget(s) cleared across ${this.clearBudgetMonths.size} month(s)`, 'ok');
          this.clearBudgetMonths.clear();
          this.renderClearBudgetMonths();
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Clear Month Budgets?';
        if (confirmBody) confirmBody.textContent = `Delete ${budgetCount} budget type(s) totaling ${this.fmt(totalAmount)} across ${this.clearBudgetMonths.size} month(s). Transactions are preserved. This cannot be undone.`;
        if (confirmBtn) {
          confirmBtn.textContent = 'Clear Budget';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      getBackupKey() {
        return `expenseTracker_backups_${this.allData.activeProfile}`;
      }

      toggleAutoResetMonth() {
        const el = document.getElementById('autoResetMonthToggle');
        const inp = document.getElementById('autoResetMonth');
        if (!el || !inp) return;
        const isOn = inp.value === 'true';
        inp.value = isOn ? 'false' : 'true';
        el.classList.toggle('on', !isOn);
        this.data.autoResetMonth = !isOn;
        this.save();
        this.toast(isOn ? 'Auto month reset disabled' : 'Auto month reset enabled', 'ok');
      }

            toggleHeaderMenu(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('headerMenu');
        const btn = document.getElementById('headerMenuBtn');
        if (!menu || !btn) return;
        const isOpen = menu.classList.contains('active');
        if (isOpen) {
          this.closeHeaderMenu();
        } else {
          const header = document.querySelector('.app-header');
          const headerRect = header ? header.getBoundingClientRect() : { top: 0, right: window.innerWidth };
          const btnRect = btn.getBoundingClientRect();
          // Position menu so its right edge aligns with button's right edge,
          // relative to the sticky header (constrained by app width)
          menu.style.top = (btnRect.bottom - headerRect.top + 6) + 'px';
          menu.style.right = (headerRect.right - btnRect.right) + 'px';
          menu.style.left = 'auto';
          menu.style.width = 'auto';
          menu.classList.add('active');
          btn.setAttribute('aria-expanded', 'true');
          // Post-render: ensure menu doesn't overflow left edge of header
          requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.left < headerRect.left + 10) {
              menu.style.right = 'auto';
              menu.style.left = '10px';
            }
          });
          const closeOnClickOutside = (ev) => {
            if (!ev.target.closest('#headerMenu') && !ev.target.closest('#headerMenuBtn')) {
              this.closeHeaderMenu();
              document.removeEventListener('click', closeOnClickOutside);
            }
          };
          setTimeout(() => document.addEventListener('click', closeOnClickOutside), 100);
        }
      }

      closeHeaderMenu() {
        const menu = document.getElementById('headerMenu');
        const btn = document.getElementById('headerMenuBtn');
        if (menu) {
          menu.classList.remove('active');
          menu.style.top = '';
          menu.style.left = '';
          menu.style.right = '';
          menu.style.width = '';
        }
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }

      openBackupModal() {
        this.renderBackupList();
        this.renderArchiveList();
        const autoResetMonthToggle = document.getElementById('autoResetMonthToggle');
        const autoResetMonth = document.getElementById('autoResetMonth');
        if (autoResetMonthToggle) autoResetMonthToggle.classList.toggle('on', this.data.autoResetMonth !== false);
        if (autoResetMonth) autoResetMonth.value = this.data.autoResetMonth !== false ? 'true' : 'false';
        this.openModal('backupModal');
      }

      setBackupTab(tab, btn) {
        const backupLocalTab = document.getElementById('backupLocalTab');
        const backupFileTab = document.getElementById('backupFileTab');
        const backupSelectiveTab = document.getElementById('backupSelectiveTab');
        const backupProfilesTab = document.getElementById('backupProfilesTab');
        const backupArchiveTab = document.getElementById('backupArchiveTab');
        const backupClearTab = document.getElementById('backupClearTab');
        const backupSettingsTab = document.getElementById('backupSettingsTab');
        if (backupLocalTab) backupLocalTab.style.display = tab === 'local' ? 'block' : 'none';
        if (backupFileTab) backupFileTab.style.display = tab === 'file' ? 'block' : 'none';
        if (backupSelectiveTab) backupSelectiveTab.style.display = tab === 'selective' ? 'block' : 'none';
        if (backupProfilesTab) backupProfilesTab.style.display = tab === 'profiles' ? 'block' : 'none';
        if (backupArchiveTab) backupArchiveTab.style.display = tab === 'archive' ? 'block' : 'none';
        if (backupClearTab) backupClearTab.style.display = tab === 'clear' ? 'block' : 'none';
        if (backupSettingsTab) backupSettingsTab.style.display = tab === 'settings' ? 'block' : 'none';
        if (btn && btn.parentElement) {
          btn.parentElement.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        if (tab === 'archive') this.renderArchiveList();
        if (tab === 'clear') { this.renderBackupClearExpenseMonths(); this.renderBackupClearBudgetMonths(); }
        if (tab === 'selective') this.updateSelectiveStats();
      }

      createBackup() {
        const backups = this.getBackups();
        const name = `Backup_${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}`;
        backups.unshift({ name, data: JSON.parse(JSON.stringify(this.data)), created: Date.now() });
        if (backups.length > 10) backups.pop();
        localStorage.setItem(this.getBackupKey(), JSON.stringify(backups));
        this.renderBackupList();
        this.toast('Backup created', 'ok');
      }

      downloadCurrentData() {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expense_backup_${getLocalDateStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('Download started', 'ok');
      }

      getBackups() {
        try {
          const raw = localStorage.getItem(this.getBackupKey());
          return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
      }

      renderBackupList() {
        const backups = this.getBackups();
        const container = document.getElementById('backupList');
        if (!container) return;
        if (backups.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:10px 0;">No local backups yet</div>';
          return;
        }
        container.innerHTML = backups.map((b, i) => `
          <div class="backup-row">
            <div class="backup-info">
              <div class="backup-name">${this.esc(b.name)}</div>
              <div class="backup-meta">${new Date(b.created).toLocaleString()}</div>
            </div>
            <div class="backup-actions">
              <button class="restore-btn" onclick="app.restoreBackup(${i})">Restore</button>
              <button class="del-btn2" onclick="app.deleteBackup(${i})">Delete</button>
            </div>
          </div>
        `).join('');
      }

      restoreBackup(index) {
        const backups = this.getBackups();
        if (!backups[index]) return;
        this.pushUndo('Restore backup');
        this.confirmCallback = () => {
          this._nwCache = null;
          this.data = JSON.parse(JSON.stringify(backups[index].data));
          this.allData.profiles[this.allData.activeProfile] = this.data;
          this.save();
          this.init();
          this.closeModal('backupModal');
          this.toast('Backup restored', 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Restore Backup?';
        if (confirmBody) confirmBody.textContent = 'Current data will be replaced with this backup.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Restore';
          confirmBtn.className = 'btn btn-primary';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      deleteBackup(index) {
        const backups = this.getBackups();
        backups.splice(index, 1);
        localStorage.setItem(this.getBackupKey(), JSON.stringify(backups));
        this.renderBackupList();
        this.toast('Backup deleted', 'ok');
      }

      restoreFromFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            if (data.transactions && Array.isArray(data.transactions)) {
              this.pushUndo('Import data');
              this._nwCache = null;
              this.data = this.repairData(this.migrateV2toV3(this.migrateOldData(data)));
              this.allData.profiles[this.allData.activeProfile] = this.data;
              this.save();
              this.init();
              this.closeModal('backupModal');
              this.toast('Data restored from file', 'ok');
            } else {
              this.toast('Invalid backup file', 'err');
            }
          } catch(err) {
            this.toast('Failed to parse file', 'err');
          }
        };
        reader.readAsText(file);
        input.value = '';
      }

      // ===== SELECTIVE BACKUP / IMPORT =====
      setSelectiveDateMode(mode, btn) {
        this.selectiveDateMode = mode;
        const seg = btn && btn.parentElement;
        if (seg) {
          seg.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        const dayRow = document.getElementById('selDayRow');
        const rangeRow = document.getElementById('selRangeRow');
        if (dayRow) dayRow.style.display = mode === 'day' ? 'block' : 'none';
        if (rangeRow) rangeRow.style.display = mode === 'range' ? 'block' : 'none';
        this.updateSelectiveStats();
      }

      setSelectiveImportMode(mode, btn) {
        this.selectiveImportMode = mode;
        const seg = btn && btn.parentElement;
        if (seg) {
          seg.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
        }
        const hint = document.getElementById('selImportModeHint');
        if (hint) {
          hint.textContent = mode === 'replace'
            ? 'Replace overwrites each included section entirely with the imported data. Sections not present in the file are left untouched.'
            : 'Merge adds the imported records on top of your existing data. Duplicate transaction IDs are skipped.';
        }
      }

      openSelectiveDatePicker(which) {
        const idMap = { day: 'selDayValue', from: 'selFromValue', to: 'selToValue' };
        const currentEl = document.getElementById(idMap[which]);
        const current = (currentEl ? currentEl.value : '') || getLocalDateStr();
        const [cy, cm, cd] = current.split('-');
        let daysHtml = '';
        for (let d = 1; d <= 31; d++) {
          const val = String(d).padStart(2, '0');
          daysHtml += `<div class="picker-item ${val === cd ? 'on' : ''}" data-col="day" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthsHtml = '';
        months.forEach((m, i) => {
          const val = String(i+1).padStart(2, '0');
          monthsHtml += `<div class="picker-item ${val === cm ? 'on' : ''}" data-col="month" data-val="${val}" onclick="app.pickDatePart(this)">${m}</div>`;
        });
        let yearsHtml = '';
        const currentYear = new Date().getFullYear();
        for (let y = currentYear - 10; y <= currentYear + 10; y++) {
          const val = String(y);
          yearsHtml += `<div class="picker-item ${val === cy ? 'on' : ''}" data-col="year" data-val="${val}" onclick="app.pickDatePart(this)">${val}</div>`;
        }
        const pickerTitle = document.getElementById('pickerTitle');
        const pickerBody = document.getElementById('pickerBody');
        if (pickerTitle) pickerTitle.textContent = which === 'from' ? 'From Date' : which === 'to' ? 'To Date' : 'Select Day';
        if (pickerBody) {
          pickerBody.innerHTML = `
            <div class="date-cols">
              <div class="date-col" id="pickDayCol"><div class="date-col-label">Day</div>${daysHtml}</div>
              <div class="date-col" id="pickMonthCol"><div class="date-col-label">Month</div>${monthsHtml}</div>
              <div class="date-col" id="pickYearCol"><div class="date-col-label">Year</div>${yearsHtml}</div>
            </div>
            <button type="button" class="btn btn-primary picker-done" onclick="app.confirmSelectiveDatePick('${which}')">Done</button>
          `;
        }
        this.openModal('pickerModal');
        setTimeout(() => {
          ['pickDayCol','pickMonthCol','pickYearCol'].forEach(id => {
            const col = document.getElementById(id);
            const sel = col && col.querySelector('.picker-item.on');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
          });
        }, 50);
      }

      confirmSelectiveDatePick(which) {
        const day = document.querySelector('#pickDayCol .picker-item.on')?.dataset.val || '01';
        const month = document.querySelector('#pickMonthCol .picker-item.on')?.dataset.val || '01';
        const year = document.querySelector('#pickYearCol .picker-item.on')?.dataset.val || String(new Date().getFullYear());
        let dateObj = new Date(year, month - 1, day);
        if (String(dateObj.getDate()).padStart(2,'0') !== day) dateObj = new Date(year, month, 0);
        const dateStr = `${year}-${month}-${String(dateObj.getDate()).padStart(2,'0')}`;
        const map = {
          day: ['selDayValue', 'selDayDisplay'],
          from: ['selFromValue', 'selFromDisplay'],
          to: ['selToValue', 'selToDisplay']
        };
        const [valId, dispId] = map[which];
        const valEl = document.getElementById(valId);
        const dispEl = document.getElementById(dispId);
        if (valEl) valEl.value = dateStr;
        if (dispEl) dispEl.textContent = this.fmtDateShort(dateStr);
        this.closePicker();
        this.updateSelectiveStats();
      }

      getSelectiveSections() {
        return Array.from(document.querySelectorAll('.sel-section-cb'))
          .filter(cb => cb.checked)
          .map(cb => cb.value);
      }

      toggleAllSelectiveSections() {
        const cbs = Array.from(document.querySelectorAll('.sel-section-cb'));
        const allOn = cbs.every(cb => cb.checked);
        cbs.forEach(cb => { cb.checked = !allOn; });
        const btn = document.getElementById('selSectionsToggleAllBtn');
        if (btn) btn.textContent = allOn ? 'Select All' : 'Deselect All';
        this.updateSelectiveStats();
      }

      /** Returns {from, to} (inclusive) based on selected date mode, or null for "all". */
      getSelectiveDateBounds() {
        if (this.selectiveDateMode === 'day') {
          const v = (document.getElementById('selDayValue') || {}).value || '';
          if (!v) return undefined; // signals "not yet chosen"
          return { from: v, to: v };
        }
        if (this.selectiveDateMode === 'range') {
          let from = (document.getElementById('selFromValue') || {}).value || '';
          let to = (document.getElementById('selToValue') || {}).value || '';
          if (!from && !to) return undefined;
          if (!from) from = '0000-01-01';
          if (!to) to = '9999-12-31';
          if (from > to) { const t = from; from = to; to = t; }
          return { from, to };
        }
        return null; // all dates
      }

      /** Filter transactions by date bounds (null = all). */
      filterTxByBounds(txs, bounds) {
        if (!bounds) return txs.slice();
        return txs.filter(t => t && t.date && t.date >= bounds.from && t.date <= bounds.to);
      }

      updateSelectiveStats() {
        const statsEl = document.getElementById('selStats');
        if (!statsEl) return;
        const sections = this.getSelectiveSections();
        if (sections.length === 0) { statsEl.textContent = 'No sections selected.'; return; }
        const bounds = this.getSelectiveDateBounds();
        if (bounds === undefined) { statsEl.textContent = 'Choose a date to apply the filter.'; return; }
        const parts = [];
        const allTx = (this.data.transactions || []).filter(t => t && t.date);
        if (sections.includes('transactions')) {
          parts.push(`${this.filterTxByBounds(allTx, bounds).length} transactions`);
        }
        if (sections.includes('lifecycle')) {
          const lc = this.filterTxByBounds(allTx.filter(t => t.lifecycleEnabled === true), bounds);
          parts.push(`${lc.length} lifecycle items`);
        }
        if (sections.includes('plan')) {
          let n = 0;
          Object.keys(this.data.budgets || {}).forEach(type => { n += Object.keys(this.data.budgets[type] || {}).length; });
          parts.push(`${n} budget entries`);
        }
        if (sections.includes('recurringBudgets')) parts.push(`${(this.data.recurringBudgets || []).length} recurring budgets`);
        if (sections.includes('recurring')) parts.push(`${(this.data.recurring || []).length} recurring templates`);
        if (sections.includes('goals')) parts.push(`${(this.data.goals || []).length} goals`);
        if (sections.includes('events')) parts.push(`${(this.data.events || []).length} events`);
        if (sections.includes('accounts')) parts.push(`${(this.data.accounts || []).length} accounts`);
        if (sections.includes('settings')) parts.push('settings');
        const scope = bounds ? ` · ${bounds.from === bounds.to ? bounds.from : bounds.from + ' → ' + bounds.to}` : '';
        statsEl.textContent = 'Will export: ' + parts.join(', ') + scope + '.';
      }

      exportSelective() {
        const sections = this.getSelectiveSections();
        if (sections.length === 0) { this.toast('Select at least one section', 'err'); return; }
        const bounds = this.getSelectiveDateBounds();
        if (bounds === undefined) { this.toast('Choose a date for the selected filter', 'err'); return; }

        const payload = {
          version: APP_VERSION,
          selective: true,
          exportedAt: new Date().toISOString(),
          profile: this.allData.activeProfile,
          dateMode: this.selectiveDateMode,
          dateBounds: bounds || null,
          sections: sections,
          data: {}
        };
        const out = payload.data;
        const allTx = (this.data.transactions || []).filter(t => t && t.date);

        // Transactions and/or lifecycle both write into a single transactions array (deduped).
        if (sections.includes('transactions') || sections.includes('lifecycle')) {
          const map = new Map();
          if (sections.includes('transactions')) {
            this.filterTxByBounds(allTx, bounds).forEach(t => map.set(t.id, t));
          }
          if (sections.includes('lifecycle')) {
            this.filterTxByBounds(allTx.filter(t => t.lifecycleEnabled === true), bounds).forEach(t => map.set(t.id, t));
          }
          out.transactions = Array.from(map.values()).map(t => JSON.parse(JSON.stringify(t)));
        }
        if (sections.includes('plan')) out.budgets = JSON.parse(JSON.stringify(this.data.budgets || {}));
        if (sections.includes('recurringBudgets')) out.recurringBudgets = JSON.parse(JSON.stringify(this.data.recurringBudgets || []));
        if (sections.includes('recurring')) out.recurring = JSON.parse(JSON.stringify(this.data.recurring || []));
        if (sections.includes('goals')) out.goals = JSON.parse(JSON.stringify(this.data.goals || []));
        if (sections.includes('events')) out.events = JSON.parse(JSON.stringify(this.data.events || []));
        if (sections.includes('accounts')) out.accounts = JSON.parse(JSON.stringify(this.data.accounts || []));
        if (sections.includes('settings')) {
          out.expenseTypes = JSON.parse(JSON.stringify(this.data.expenseTypes || []));
          out.typeCategories = JSON.parse(JSON.stringify(this.data.typeCategories || {}));
        }

        const tag = bounds ? (bounds.from === bounds.to ? bounds.from : `${bounds.from}_${bounds.to}`) : 'all';
        this.downloadFile(JSON.stringify(payload, null, 2), `expense_selective_${this.allData.activeProfile}_${tag}_${getLocalDateStr()}.json`, 'application/json');
        this.toast('Selective backup downloaded', 'ok');
      }

      importSelectiveFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          let parsed;
          try { parsed = JSON.parse(e.target.result); }
          catch (err) { this.toast('Failed to parse file', 'err'); input.value = ''; return; }

          // Accept both selective payloads ({data:{...}}) and full backups ({transactions:[...]}).
          const src = (parsed && parsed.selective && parsed.data) ? parsed.data : parsed;
          if (!src || typeof src !== 'object') { this.toast('Invalid backup file', 'err'); input.value = ''; return; }

          const hasAny = ['transactions','budgets','recurringBudgets','recurring','goals','events','accounts','expenseTypes','typeCategories']
            .some(k => src[k] !== undefined);
          if (!hasAny) { this.toast('No importable sections found in file', 'err'); input.value = ''; return; }

          const mode = this.selectiveImportMode;
          const summary = this.applySelectiveImport(src, mode);
          this.confirmCallback = () => {
            this._nwCache = null;
            this.pushUndo('Import selective backup');
            summary.commit();
            this.data = this.repairData(this.data);
            this.allData.profiles[this.allData.activeProfile] = this.data;
            this.save();
            this.init();
            this.closeModal('confirmModal');
            this.closeModal('backupModal');
            this.toast('Import complete', 'ok');
          };
          const confirmTitle = document.getElementById('confirmTitle');
          const confirmBody = document.getElementById('confirmBody');
          const confirmBtn = document.getElementById('confirmBtn');
          if (confirmTitle) confirmTitle.textContent = mode === 'replace' ? 'Replace Data?' : 'Merge Data?';
          if (confirmBody) confirmBody.innerHTML = summary.message;
          if (confirmBtn) {
            confirmBtn.textContent = mode === 'replace' ? 'Replace' : 'Merge';
            confirmBtn.className = mode === 'replace' ? 'btn btn-danger' : 'btn btn-primary';
            confirmBtn.onclick = this.confirmCallback;
          }
          this.openModal('confirmModal');
          input.value = '';
        };
        reader.readAsText(file);
      }

      /** Builds a commit() closure and a human summary for the import without mutating yet. */
      applySelectiveImport(src, mode) {
        const lines = [];
        const tasks = [];

        if (Array.isArray(src.transactions)) {
          const incoming = src.transactions.filter(t => t && t.id && t.date);
          if (mode === 'replace') {
            // Replace only the transactions whose dates fall inside the imported file's bounds,
            // so a single-day import doesn't wipe the entire ledger. If no bounds known, derive
            // from the incoming records' min/max dates.
            const dates = incoming.map(t => t.date).sort();
            const from = dates[0], to = dates[dates.length - 1];
            tasks.push(() => {
              const existing = (this.data.transactions || []);
              const kept = (from && to)
                ? existing.filter(t => !(t && t.date && t.date >= from && t.date <= to))
                : [];
              this.data.transactions = kept.concat(incoming.map(t => JSON.parse(JSON.stringify(t))));
            });
            lines.push(`<li>Transactions: replace ${from === to ? from : (from + ' → ' + to)} with <b>${incoming.length}</b> imported record(s)</li>`);
          } else {
            const existingIds = new Set((this.data.transactions || []).map(t => t && t.id));
            const toAdd = incoming.filter(t => !existingIds.has(t.id));
            tasks.push(() => {
              this.data.transactions = (this.data.transactions || []).concat(toAdd.map(t => JSON.parse(JSON.stringify(t))));
            });
            lines.push(`<li>Transactions: add <b>${toAdd.length}</b> new (${incoming.length - toAdd.length} duplicate(s) skipped)</li>`);
          }
        }

        if (src.budgets && typeof src.budgets === 'object') {
          tasks.push(() => {
            if (mode === 'replace') {
              this.data.budgets = JSON.parse(JSON.stringify(src.budgets));
            } else {
              this.data.budgets = this.data.budgets || {};
              Object.keys(src.budgets).forEach(type => {
                this.data.budgets[type] = this.data.budgets[type] || {};
                Object.keys(src.budgets[type] || {}).forEach(month => {
                  this.data.budgets[type][month] = JSON.parse(JSON.stringify(src.budgets[type][month]));
                });
              });
            }
          });
          lines.push(`<li>Budgets: ${mode === 'replace' ? 'replace all' : 'merge by type/month'}</li>`);
        }

        const mergeArrayById = (key, label) => {
          if (!Array.isArray(src[key])) return;
          tasks.push(() => {
            if (mode === 'replace') {
              this.data[key] = JSON.parse(JSON.stringify(src[key]));
            } else {
              const existing = this.data[key] || [];
              const ids = new Set(existing.map(x => x && x.id));
              const add = src[key].filter(x => x && (x.id === undefined || !ids.has(x.id)));
              this.data[key] = existing.concat(add.map(x => JSON.parse(JSON.stringify(x))));
            }
          });
          lines.push(`<li>${label}: ${mode === 'replace' ? 'replace all' : 'add new'} (${src[key].length} in file)</li>`);
        };
        mergeArrayById('recurringBudgets', 'Recurring budgets');
        mergeArrayById('recurring', 'Recurring templates');
        mergeArrayById('goals', 'Goals');
        mergeArrayById('events', 'Events');
        mergeArrayById('accounts', 'Accounts');

        if (Array.isArray(src.expenseTypes) || (src.typeCategories && typeof src.typeCategories === 'object')) {
          tasks.push(() => {
            if (mode === 'replace') {
              if (Array.isArray(src.expenseTypes)) this.data.expenseTypes = JSON.parse(JSON.stringify(src.expenseTypes));
              if (src.typeCategories) this.data.typeCategories = JSON.parse(JSON.stringify(src.typeCategories));
            } else {
              if (Array.isArray(src.expenseTypes)) {
                const set = new Set(this.data.expenseTypes || []);
                src.expenseTypes.forEach(t => set.add(t));
                this.data.expenseTypes = Array.from(set);
              }
              if (src.typeCategories) {
                this.data.typeCategories = this.data.typeCategories || {};
                Object.keys(src.typeCategories).forEach(type => {
                  const cur = new Set(this.data.typeCategories[type] || []);
                  (src.typeCategories[type] || []).forEach(c => cur.add(c));
                  this.data.typeCategories[type] = Array.from(cur);
                });
              }
            }
          });
          lines.push(`<li>Settings: ${mode === 'replace' ? 'replace types & categories' : 'merge types & categories'}</li>`);
        }

        const message = `<p>You're about to <b>${mode === 'replace' ? 'replace' : 'merge'}</b> the following into the <b>${this.allData.activeProfile}</b> profile:</p>`
          + `<ul style="margin:8px 0 0 0;padding-left:18px;font-size:12px;line-height:1.7;">${lines.join('')}</ul>`
          + (mode === 'replace' ? `<p style="margin-top:8px;color:var(--danger);font-weight:600;">Replace overwrites the included sections. This can be undone once via Undo.</p>` : `<p style="margin-top:8px;color:var(--text-tertiary);font-size:11px;">This can be undone via Undo.</p>`);

        return { message, commit: () => tasks.forEach(fn => fn()) };
      }

      exportProfile(profileId) {
        const profileData = this.allData.profiles[profileId];
        if (!profileData) { this.toast('Profile not found', 'err'); return; }
        const blob = new Blob([JSON.stringify(profileData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expense_profile_${profileId}_${getLocalDateStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast(`${profileId === 'self' ? 'Self' : 'Joint W/ Spouse'} profile exported`, 'ok');
      }

      exportAllProfiles() {
        const blob = new Blob([JSON.stringify(this.allData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expense_profiles_all_${getLocalDateStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('All profiles exported', 'ok');
      }


      // ===== ARCHIVE METHODS (M7) =====
      openArchiveYearPicker() {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear - 5; y < currentYear; y++) {
          years.push({ label: String(y), value: String(y) });
        }
        this.openPicker('Select Year to Archive', years, (val) => {
          const display = document.getElementById('archiveYearDisplay');
          const input = document.getElementById('archiveYearValue');
          if (display) display.textContent = val;
          if (input) input.value = val;
          this.updateArchiveStats(val);
        });
      }

      updateArchiveStats(year) {
        const statsEl = document.getElementById('archiveStats');
        if (!statsEl || !year) { statsEl.textContent = ''; return; }
        const profile = this.allData.activeProfile;
        const txs = this.data.transactions || [];
        const yearTxs = txs.filter(t => t && t.date && t.date.startsWith(year));
        const yearBudgets = [];
        Object.keys(this.data.budgets || {}).forEach(type => {
          Object.keys(this.data.budgets[type] || {}).forEach(month => {
            if (month.startsWith(year)) {
              yearBudgets.push({ type, month, amount: this.data.budgets[type][month].amount });
            }
          });
        });
        const totalAmount = yearTxs.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        statsEl.textContent = `${yearTxs.length} transactions (${this.fmt(totalAmount)}) and ${yearBudgets.length} budget entries will be archived.`;
      }

      archiveAndPurgeYear() {
        const yearInput = document.getElementById('archiveYearValue');
        const year = yearInput ? yearInput.value : '';
        if (!year || !/^\d{4}$/.test(year)) {
          this.toast('Select a valid year', 'err');
          return;
        }
        const profile = this.allData.activeProfile;
        const txs = this.data.transactions || [];
        const yearTxs = txs.filter(t => t && t.date && t.date.startsWith(year));
        if (yearTxs.length === 0) {
          this.toast('No transactions found for selected year', 'err');
          return;
        }
        const archiveData = {
          version: APP_VERSION,
          archivedAt: new Date().toISOString(),
          year,
          profile,
          transactions: yearTxs,
          budgets: {},
          expenseTypes: this.data.expenseTypes,
          typeCategories: this.data.typeCategories
        };
        Object.keys(this.data.budgets || {}).forEach(type => {
          archiveData.budgets[type] = {};
          Object.keys(this.data.budgets[type] || {}).forEach(month => {
            if (month.startsWith(year)) {
              archiveData.budgets[type][month] = this.data.budgets[type][month];
            }
          });
        });
        const blob = new Blob([JSON.stringify(archiveData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `expense_archive_${year}_${profile}_${getLocalDateStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        // M3: Two-step confirmation — first verify download saved, then purge
        this.pushUndo('Archive & purge year');
        this.confirmCallback = () => {
          this._nwCache = null;
          this.data.transactions = txs.filter(t => !(t && t.date && t.date.startsWith(year)));
          Object.keys(this.data.budgets || {}).forEach(type => {
            Object.keys(this.data.budgets[type] || {}).forEach(month => {
              if (month.startsWith(year)) delete this.data.budgets[type][month];
            });
          });
          this.save();
          this.renderAll();
          this.toast(`Year ${year} archived and purged`, 'ok');
          this.recordArchive(year, profile, yearTxs.length);
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Confirm Purge';
        if (confirmBody) {
          confirmBody.innerHTML = `<p>Archive for <b>${year}</b> (${yearTxs.length} transactions) has been downloaded.</p><p style="margin-top:8px;color:var(--danger);font-weight:600;">⚠️ Have you verified the file is saved? This will permanently delete the data from local storage.</p>`;
        }
        if (confirmBtn) {
          confirmBtn.textContent = 'Yes, Purge Data';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      recordArchive(year, profile, count) {
        const archives = JSON.parse(localStorage.getItem('expense_archives') || '[]');
        archives.unshift({ year, profile, count, date: getLocalDateStr() });
        if (archives.length > 20) archives.pop();
        localStorage.setItem('expense_archives', JSON.stringify(archives));
        this.renderArchiveList();
      }

      renderArchiveList() {
        const listEl = document.getElementById('archiveList');
        if (!listEl) return;
        const archives = JSON.parse(localStorage.getItem('expense_archives') || '[]');
        if (archives.length === 0) {
          listEl.textContent = 'No archives yet.';
          return;
        }
        listEl.innerHTML = archives.map(a => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
            <span>${a.year} — ${a.profile === 'self' ? 'Self' : 'Joint W/ Spouse'} (${a.count} txs)</span>
            <span style="color:var(--text-secondary);">${a.date}</span>
          </div>
        `).join('');
      }

      importProfileFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target.result);
            if (imported.profiles && imported.version >= 2) {
              this.pushUndo('Import data');
              this.confirmCallback = () => {
                this._nwCache = null;
                // H1: Sanitize imported full-backup profiles through repairData pipeline
                if (!imported.profiles) imported.profiles = {};
                Object.keys(imported.profiles).forEach(key => {
                  imported.profiles[key] = this.repairData(imported.profiles[key]);
                });
                this.allData = imported;
                if (!this.allData.profiles.self) this.allData.profiles.self = this.createDefaultProfile();
                if (!this.allData.profiles.wife) this.allData.profiles.wife = this.createDefaultProfile();
                if (!this.allData.activeProfile || !this.allData.profiles[this.allData.activeProfile]) this.allData.activeProfile = 'self';
                this.data = this.allData.profiles[this.allData.activeProfile];
                this.save();
                this.init();
                this.closeModal('backupModal');
                this.toast('All profiles imported', 'ok');
              };
              const confirmTitle = document.getElementById('confirmTitle');
              const confirmBody = document.getElementById('confirmBody');
              const confirmBtn = document.getElementById('confirmBtn');
              if (confirmTitle) confirmTitle.textContent = 'Import All Profiles?';
              if (confirmBody) confirmBody.textContent = 'This will replace both Self and Wife profiles with the imported data.';
              if (confirmBtn) {
                confirmBtn.textContent = 'Import';
                confirmBtn.className = 'btn btn-primary';
                confirmBtn.onclick = this.confirmCallback;
              }
              this.openModal('confirmModal');
            } else if (imported.transactions !== undefined) {
              this.pushUndo('Import data');
              this.confirmCallback = () => {
                const target = this.allData.activeProfile;
                this.allData.profiles[target] = this.repairData(this.migrateV2toV3(this.migrateOldData(imported)));
                this.data = this.allData.profiles[target];
                this.save();
                this.init();
                this.closeModal('backupModal');
                this.toast(`${target === 'self' ? 'Self' : 'Joint W/ Spouse'} profile imported`, 'ok');
              };
              const confirmTitle = document.getElementById('confirmTitle');
              const confirmBody = document.getElementById('confirmBody');
              const confirmBtn = document.getElementById('confirmBtn');
              if (confirmTitle) confirmTitle.textContent = `Import into ${this.allData.activeProfile === 'self' ? 'Self' : 'Joint W/ Spouse'}?`;
              if (confirmBody) confirmBody.textContent = 'This will replace the current profile with the imported data.';
              if (confirmBtn) {
                confirmBtn.textContent = 'Import';
                confirmBtn.className = 'btn btn-primary';
                confirmBtn.onclick = this.confirmCallback;
              }
              this.openModal('confirmModal');
            } else {
              this.toast('Invalid profile file', 'err');
            }
          } catch(err) {
            this.toast('Failed to parse file', 'err');
          }
        };
        reader.readAsText(file);
        input.value = '';
      }

      // ===== BACKUP CLEAR: EXPENSES =====
      renderBackupClearExpenseMonths() {
        const container = document.getElementById('backupClearExpenseMonthList');
        if (!container) return;
        const months = [];
        for (let y = 2026; y <= 2040; y++) {
          for (let m = 1; m <= 12; m++) {
            const val = `${y}-${String(m).padStart(2,'0')}`;
            const label = new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            months.push({ val, label });
          }
        }
        this._backupClearExpenseOptions = months.map(m => m.val);
        if (months.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0;text-align:center;">No months available</div>';
          return;
        }
        container.innerHTML = months.map(m => {
          const isSelected = this.backupClearExpenseMonths.has(m.val);
          const txCount = this.data.transactions.filter(t => t && t.date && t.date.startsWith(m.val)).length;
          return `
            <div class="copy-tx-row" data-backup-clear-expense-month="${this.esc(m.val)}" style="padding:6px 8px;opacity:${txCount > 0 ? 1 : 0.5};">
              <div class="cb ${isSelected ? 'on' : ''}" style="width:16px;height:16px;min-width:16px;">${isSelected ? this.icon('check') : ''}</div>
              <div class="copy-tx-info" style="flex:1;min-width:0;">
                <div class="copy-tx-title" style="font-size:12px;">${m.label}</div>
              </div>
              <div class="copy-tx-amt" style="font-size:11px;color:${txCount > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)'};font-weight:600;">${txCount > 0 ? txCount + ' txs' : 'No data'}</div>
            </div>
          `;
        }).join('');
        this.updateBackupClearExpenseLabels();
      }

      toggleBackupClearExpenseMonth(month) {
        if (this.backupClearExpenseMonths.has(month)) this.backupClearExpenseMonths.delete(month);
        else this.backupClearExpenseMonths.add(month);
        this.renderBackupClearExpenseMonths();
      }

      toggleAllBackupClearExpenseMonths() {
        const allSelected = this._backupClearExpenseOptions.length > 0 && this._backupClearExpenseOptions.every(m => this.backupClearExpenseMonths.has(m));
        if (allSelected) {
          this._backupClearExpenseOptions.forEach(m => this.backupClearExpenseMonths.delete(m));
        } else {
          this._backupClearExpenseOptions.forEach(m => this.backupClearExpenseMonths.add(m));
        }
        this.renderBackupClearExpenseMonths();
      }

      updateBackupClearExpenseLabels() {
        const count = this.backupClearExpenseMonths.size;
        let txCount = 0;
        this.backupClearExpenseMonths.forEach(m => {
          txCount += this.data.transactions.filter(t => t && t.date && t.date.startsWith(m)).length;
        });
        const countLabel = document.getElementById('backupClearExpenseCountLabel');
        const txLabel = document.getElementById('backupClearExpenseTxLabel');
        const toggleBtn = document.getElementById('backupClearExpenseToggleAllBtn');
        const allSelected = this._backupClearExpenseOptions.length > 0 && this._backupClearExpenseOptions.every(m => this.backupClearExpenseMonths.has(m));
        if (countLabel) countLabel.textContent = count + ' month' + (count !== 1 ? 's' : '') + ' selected';
        if (txLabel) txLabel.textContent = txCount + ' transaction' + (txCount !== 1 ? 's' : '');
        if (toggleBtn) toggleBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
      }

      confirmBackupClearExpenses() {
        if (this.backupClearExpenseMonths.size === 0) {
          this.toast('Select at least one month', 'err');
          return;
        }
        let txCount = 0;
        this.backupClearExpenseMonths.forEach(m => {
          txCount += this.data.transactions.filter(t => t && t.date && t.date.startsWith(m)).length;
        });
        if (txCount === 0) {
          this.toast('No transactions in selected months', 'ok');
          return;
        }
        this.pushUndo('Clear expenses');
        this.confirmCallback = () => {
          this._nwCache = null;
          this.data.transactions = this.data.transactions.filter(t => {
            if (!t || !t.date) return true;
            return !this.backupClearExpenseMonths.has(t.date.slice(0, 7));
          });
          this.save();
          this.renderAll();
          this.closeModal('confirmModal');
          this.toast(txCount + ' transaction(s) cleared across ' + this.backupClearExpenseMonths.size + ' month(s)', 'ok');
          this.backupClearExpenseMonths.clear();
          this.renderBackupClearExpenseMonths();
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Clear Expenses?';
        if (confirmBody) confirmBody.textContent = 'Delete ' + txCount + ' transaction(s) across ' + this.backupClearExpenseMonths.size + ' month(s). Budgets are preserved. This cannot be undone.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Clear';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      // ===== BACKUP CLEAR: BUDGET =====
      renderBackupClearBudgetMonths() {
        const container = document.getElementById('backupClearBudgetMonthList');
        if (!container) return;
        const months = [];
        for (let y = 2026; y <= 2040; y++) {
          for (let m = 1; m <= 12; m++) {
            const val = `${y}-${String(m).padStart(2,'0')}`;
            const label = new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            months.push({ val, label });
          }
        }
        this._backupClearBudgetOptions = months.map(m => m.val);
        if (months.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0;text-align:center;">No months available</div>';
          return;
        }
        container.innerHTML = months.map(m => {
          const isSelected = this.backupClearBudgetMonths.has(m.val);
          const budgetTotal = this.getMonthBudgetTotal(m.val);
          const hasBudget = budgetTotal > 0;
          return `
            <div class="copy-tx-row" data-backup-clear-budget-month="${this.esc(m.val)}" style="padding:6px 8px;opacity:${hasBudget ? 1 : 0.5};">
              <div class="cb ${isSelected ? 'on' : ''}" style="width:16px;height:16px;min-width:16px;">${isSelected ? this.icon('check') : ''}</div>
              <div class="copy-tx-info" style="flex:1;min-width:0;">
                <div class="copy-tx-title" style="font-size:12px;">${m.label}</div>
              </div>
              <div class="copy-tx-amt" style="font-size:11px;color:${hasBudget ? 'var(--text-secondary)' : 'var(--text-tertiary)'};font-weight:600;">${hasBudget ? this.fmt(budgetTotal) : 'No budget'}</div>
            </div>
          `;
        }).join('');
        this.updateBackupClearBudgetLabels();
      }

      toggleBackupClearBudgetMonth(month) {
        if (this.backupClearBudgetMonths.has(month)) this.backupClearBudgetMonths.delete(month);
        else this.backupClearBudgetMonths.add(month);
        this.renderBackupClearBudgetMonths();
      }

      toggleAllBackupClearBudgetMonths() {
        const allSelected = this._backupClearBudgetOptions.length > 0 && this._backupClearBudgetOptions.every(m => this.backupClearBudgetMonths.has(m));
        if (allSelected) {
          this._backupClearBudgetOptions.forEach(m => this.backupClearBudgetMonths.delete(m));
        } else {
          this._backupClearBudgetOptions.forEach(m => this.backupClearBudgetMonths.add(m));
        }
        this.renderBackupClearBudgetMonths();
      }

      updateBackupClearBudgetLabels() {
        const count = this.backupClearBudgetMonths.size;
        let total = 0;
        this.backupClearBudgetMonths.forEach(m => {
          total += this.getMonthBudgetTotal(m);
        });
        const countLabel = document.getElementById('backupClearBudgetCountLabel');
        const totalLabel = document.getElementById('backupClearBudgetTotalLabel');
        const toggleBtn = document.getElementById('backupClearBudgetToggleAllBtn');
        const allSelected = this._backupClearBudgetOptions.length > 0 && this._backupClearBudgetOptions.every(m => this.backupClearBudgetMonths.has(m));
        if (countLabel) countLabel.textContent = count + ' month' + (count !== 1 ? 's' : '') + ' selected';
        if (totalLabel) totalLabel.textContent = this.fmt(total) + ' total budget';
        if (toggleBtn) toggleBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
      }

      confirmBackupClearBudget() {
        if (this.backupClearBudgetMonths.size === 0) {
          this.toast('Select at least one month', 'err');
          return;
        }
        let budgetCount = 0;
        let totalAmount = 0;
        this.backupClearBudgetMonths.forEach(month => {
          Object.keys(this.data.budgets).forEach(type => {
            const typeBudget = this.data.budgets[type];
            if (typeBudget && typeBudget[month]) {
              budgetCount++;
              totalAmount += typeBudget[month].amount || 0;
            }
          });
        });
        if (budgetCount === 0) {
          this.toast('No budgets in selected months', 'ok');
          return;
        }
        this.pushUndo('Clear budgets');
        this.confirmCallback = () => {
          this._nwCache = null;
          this.backupClearBudgetMonths.forEach(month => {
            Object.keys(this.data.budgets).forEach(type => {
              if (this.data.budgets[type] && this.data.budgets[type][month]) {
                delete this.data.budgets[type][month];
              }
            });
          });
          this.save();
          this.renderAll();
          this.closeModal('confirmModal');
          this.toast(budgetCount + ' budget(s) cleared across ' + this.backupClearBudgetMonths.size + ' month(s)', 'ok');
          this.backupClearBudgetMonths.clear();
          this.renderBackupClearBudgetMonths();
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Clear Budgets?';
        if (confirmBody) confirmBody.textContent = 'Delete ' + budgetCount + ' budget type(s) totaling ' + this.fmt(totalAmount) + ' across ' + this.backupClearBudgetMonths.size + ' month(s). Transactions are preserved. This cannot be undone.';
        if (confirmBtn) {
          confirmBtn.textContent = 'Clear';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      
      fmt(n) {
        return '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      }

      fmtDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0,0,0,0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (d.getTime() === today.getTime()) return 'Today';
        if (d.getTime() === yesterday.getTime()) return 'Yesterday';
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }

      esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      }

      toast(msg, type = 'ok') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(10px)';
          setTimeout(() => toast.remove(), 200);
        }, 2500);
      }

      // ===== TYPE & CATEGORY MANAGEMENT =====
      openTypeModal() {
        this.renderTypeList();
        const typeManagerType = document.getElementById('typeManagerType');
        const typeManagerTypeDisplay = document.getElementById('typeManagerTypeDisplay');
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        if (types.length > 0) {
          if (typeManagerType) typeManagerType.value = types[0];
          if (typeManagerTypeDisplay) typeManagerTypeDisplay.textContent = types[0];
          this.renderCategoryList(types[0]);
        }
        this.openModal('typeModal');
      }

      renderTypeList() {
        const container = document.getElementById('typeList');
        if (!container) return;
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        if (types.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No expense types</div>';
          return;
        }
        container.innerHTML = types.map((type, idx) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
            <span style="font-size:13px;font-weight:500;">${this.esc(type)}</span>
            <div style="display:flex;gap:4px;">
              <button class="del-btn" style="width:22px;height:22px;" onclick="app.deleteExpenseType(${idx})" aria-label="Delete type">${this.icon('x')}</button>
            </div>
          </div>
        `).join('');
      }

      addExpenseType() {
        this._nwCache = null;
        const input = document.getElementById('newTypeName');
        const name = (input ? input.value : '').trim();
        if (!name) { this.toast('Type name is required', 'err'); return; }
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        if (types.includes(name)) { this.toast('Type already exists', 'err'); return; }
        this.pushUndo('Add expense type');
        if (!this.data.expenseTypes) this.data.expenseTypes = [...EXPENSE_TYPES];
        this.data.expenseTypes.push(name);
        if (!this.data.typeCategories) this.data.typeCategories = JSON.parse(JSON.stringify(TYPE_CATEGORIES));
        this.data.typeCategories[name] = [];
        this.save();
        if (input) input.value = '';
        this.renderTypeList();
        this.renderAddTypeChips();
        this.renderEventTypeChips();
        this.toast('Expense type added', 'ok');
      }

      deleteExpenseType(idx) {
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        const type = types[idx];
        if (!type) return;
        this.pushUndo('Delete expense type');
        this.confirmCallback = () => {
          if (!this.data.expenseTypes) this.data.expenseTypes = [...EXPENSE_TYPES];
          this.data.expenseTypes.splice(idx, 1);
          if (this.data.typeCategories && this.data.typeCategories[type]) {
            delete this.data.typeCategories[type];
          }
          // Remove transactions of this type
          this.data.transactions = this.data.transactions.filter(t => t.type !== type);
          // Remove budgets of this type
          if (this.data.budgets[type]) delete this.data.budgets[type];
          this.save();
          this.renderTypeList();
          this.renderAddTypeChips();
          this.renderEventTypeChips();
          const currentType = document.getElementById('typeManagerType');
          const currentDisplay = document.getElementById('typeManagerTypeDisplay');
          const remaining = this.data.expenseTypes;
          if (remaining.length > 0) {
            if (currentType) currentType.value = remaining[0];
            if (currentDisplay) currentDisplay.textContent = remaining[0];
            this.renderCategoryList(remaining[0]);
          } else {
            if (currentType) currentType.value = '';
            if (currentDisplay) currentDisplay.textContent = 'Select Type';
            const catList = document.getElementById('categoryList');
            if (catList) catList.innerHTML = '';
          }
          this.renderAll();
          this.closeModal('confirmModal');
          this.toast('Expense type deleted', 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Delete Expense Type?';
        if (confirmBody) confirmBody.textContent = `Delete "${type}" and all its transactions/budgets. This cannot be undone.`;
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      openTypeManagerTypePicker() {
        const types = this.data.expenseTypes || EXPENSE_TYPES;
        const items = types.map(t => ({ value: t, label: t }));
        const current = document.getElementById('typeManagerType').value;
        this.openPicker('Select Type', items, (val) => {
          const typeManagerType = document.getElementById('typeManagerType');
          const typeManagerTypeDisplay = document.getElementById('typeManagerTypeDisplay');
          if (typeManagerType) typeManagerType.value = val;
          if (typeManagerTypeDisplay) typeManagerTypeDisplay.textContent = val;
          this.renderCategoryList(val);
        }, current);
      }

      renderCategoryList(type) {
        const container = document.getElementById('categoryList');
        if (!container) return;
        const cats = (this.data.typeCategories || TYPE_CATEGORIES)[type] || [];
        if (cats.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No categories for this type</div>';
          return;
        }
        container.innerHTML = cats.map((cat, idx) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
            <span style="font-size:13px;font-weight:500;">${this.esc(cat)}</span>
            <button class="del-btn" style="width:22px;height:22px;" onclick="app.deleteCategory('${this.esc(type)}', ${idx})" aria-label="Delete category">${this.icon('x')}</button>
          </div>
        `).join('');
      }

      addCategory() {
        this._nwCache = null;
        const typeInput = document.getElementById('typeManagerType');
        const catInput = document.getElementById('newCategoryName');
        const type = typeInput ? typeInput.value : '';
        const name = (catInput ? catInput.value : '').trim();
        if (!type) { this.toast('Select a type first', 'err'); return; }
        if (!name) { this.toast('Category name is required', 'err'); return; }
        const cats = (this.data.typeCategories || TYPE_CATEGORIES)[type] || [];
        if (cats.includes(name)) { this.toast('Category already exists', 'err'); return; }
        this.pushUndo('Add category');
        if (!this.data.typeCategories) this.data.typeCategories = JSON.parse(JSON.stringify(TYPE_CATEGORIES));
        if (!this.data.typeCategories[type]) this.data.typeCategories[type] = [];
        this.data.typeCategories[type].push(name);
        this.save();
        if (catInput) catInput.value = '';
        this.renderCategoryList(type);
        this.toast('Category added', 'ok');
      }

      deleteCategory(type, idx) {
        const cats = (this.data.typeCategories || TYPE_CATEGORIES)[type] || [];
        const cat = cats[idx];
        if (!cat) return;
        this.pushUndo('Delete category');
        this.confirmCallback = () => {
          if (!this.data.typeCategories) this.data.typeCategories = JSON.parse(JSON.stringify(TYPE_CATEGORIES));
          this.data.typeCategories[type].splice(idx, 1);
          // Remove transactions of this category
          this.data.transactions = this.data.transactions.filter(t => !(t.type === type && t.category === cat));
          this.save();
          this.renderCategoryList(type);
          this.renderAll();
          this.closeModal('confirmModal');
          this.toast('Category deleted', 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Delete Category?';
        if (confirmBody) confirmBody.textContent = `Delete "${cat}" and all its transactions. This cannot be undone.`;
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }

      // ===== PROFILE MANAGEMENT =====
      openProfileModal() {
        this.renderProfileList();
        this.openModal('profileModal');
      }

      renderProfileList() {
        const container = document.getElementById('profileList');
        if (!container) return;
        const profiles = Object.keys(this.allData.profiles);
        if (profiles.length === 0) {
          container.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px;padding:6px 0;">No profiles</div>';
          return;
        }
        container.innerHTML = profiles.map(pid => {
          const isActive = pid === this.allData.activeProfile;
          return `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--glass-border-dark);">
              <span style="font-size:13px;font-weight:500;">${this.esc(pid)} ${isActive ? '<span style="font-size:9px;background:var(--success-soft);color:var(--success);padding:1px 4px;border-radius:4px;margin-left:4px;">Active</span>' : ''}</span>
              ${profiles.length > 1 ? `<button class="del-btn" style="width:22px;height:22px;" onclick="app.deleteProfile('${this.esc(pid)}')" aria-label="Delete profile">${this.icon('x')}</button>` : ''}
            </div>
          `;
        }).join('');
      }

      addProfile() {
        const input = document.getElementById('newProfileName');
        const id = (input ? input.value : '').trim().toLowerCase().replace(/\s+/g, '_');
        if (!id) { this.toast('Profile ID is required', 'err'); return; }
        if (!/^[a-z0-9_-]+$/.test(id)) { this.toast('Profile ID must be lowercase letters, numbers, hyphens, or underscores only', 'err'); return; }
        if (this.allData.profiles[id]) { this.toast('Profile already exists', 'err'); return; }
        this.pushUndo('Add profile');
        this.allData.profiles[id] = this.createDefaultProfile();
        this.save();
        if (input) input.value = '';
        this.renderProfileList();
        this.toast('Profile added', 'ok');
      }

      deleteProfile(id) {
        if (id === this.allData.activeProfile) { this.toast('Cannot delete active profile. Switch first.', 'err'); return; }
        const profiles = Object.keys(this.allData.profiles);
        if (profiles.length <= 1) { this.toast('Cannot delete the only profile', 'err'); return; }
        this.pushUndo('Delete profile');
        this.confirmCallback = () => {
          delete this.allData.profiles[id];
          this.save();
          this.renderProfileList();
          this.closeModal('confirmModal');
          this.toast('Profile deleted', 'ok');
        };
        const confirmTitle = document.getElementById('confirmTitle');
        const confirmBody = document.getElementById('confirmBody');
        const confirmBtn = document.getElementById('confirmBtn');
        if (confirmTitle) confirmTitle.textContent = 'Delete Profile?';
        if (confirmBody) confirmBody.textContent = `Delete profile "${id}" and all its data. This cannot be undone.`;
        if (confirmBtn) {
          confirmBtn.textContent = 'Delete';
          confirmBtn.className = 'btn btn-danger';
          confirmBtn.onclick = this.confirmCallback;
        }
        this.openModal('confirmModal');
      }
    }

    try {
      var app = new ExpenseTrackerApp();
      window.app = app;
      console.log('[APP] Instantiated successfully');
    } catch(e) {
      console.error('[APP] Instantiation failed', e);
      window.app = window.app || {};
    }
/* ====== Service worker registration (PWA / offline) ====== */
if ('serviceWorker' in navigator) {
  let refreshing = false;
  let updateToastShown = false;

  // When the controller changes (new SW takes over), reload once.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_UPDATED') {
      console.log('[SW] Updated to', event.data.version);
    }
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      // Check for updates when tab becomes visible
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
      // Also poll for updates every 30 minutes
      setInterval(() => reg.update(), 30 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller && !updateToastShown) {
            updateToastShown = true;
            showUpdateToast(newWorker);
          }
        });
      });
    }).catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}

function showUpdateToast(newWorker) {
  requestAnimationFrame(() => {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
  t.className = 'toast ok';
  t.style.cursor = 'pointer';
  t.style.fontWeight = '600';
  t.innerHTML = 'New version available · <span style="text-decoration:underline">Tap to reload</span>';
  t.onclick = () => {
    if (newWorker) newWorker.postMessage({ type: 'SKIP_WAITING' });
    // Fallback reload in case SW doesn't activate
    setTimeout(() => window.location.reload(), 800);
  };
    container.appendChild(t);
    // This toast doesn't auto-dismiss — it's important the user sees it
  });
}
