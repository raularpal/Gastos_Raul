// ===== Configuración =====
const SECTORS = ['Comer fuera', 'Supermercados', 'Tomar algo', 'Fiesta', 'Transporte', 'Compras', 'Otros'];

const SECTOR_COLORS = {
    'Comer fuera': '#f97316',
    'Supermercados': '#10b981',
    'Tomar algo': '#f59e0b',
    'Fiesta': '#ec4899',
    'Transporte': '#3b82f6',
    'Compras': '#8b5cf6',
    'Otros': '#64748b',
    // Nombres antiguos que puedan venir del Sheet
    'Bares y Restaurantes': '#f97316',
    'Bars / Restaurants': '#f97316',
    'Supermercado': '#10b981',
    'Supermercat': '#10b981'
};
const EXTRA_COLORS = ['#14b8a6', '#ef4444', '#6366f1', '#84cc16', '#06b6d4', '#e879f9', '#fb7185', '#eab308'];

const SECTOR_ICONS = {
    'Comer fuera': 'utensils',
    'Supermercados': 'shopping-cart',
    'Tomar algo': 'coffee',
    'Fiesta': 'party-popper',
    'Transporte': 'bus',
    'Compras': 'shopping-bag',
    'Otros': 'circle-dashed',
    'Coche': 'car',
    'Gastos Fijos': 'home',
    'Ahorro': 'piggy-bank',
    'Caprichos': 'gift',
    'Bares y Restaurantes': 'utensils',
    'Supermercado': 'shopping-cart',
    'Varios': 'more-horizontal',
    'Bars / Restaurants': 'utensils',
    'Supermercat': 'shopping-cart',
    'Varis': 'more-horizontal',
    'Cotxe': 'car',
    'Estalvi': 'piggy-bank',
    'Capritxos': 'gift',
    'Ingreso': 'wallet',
    'Salud': 'heart-pulse',
    'Casa': 'home'
};

const UNDO_MS = 4500;
const PENDING_TTL_MS = 120000;

// ===== Utilidades =====
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (() => {
    try {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
    } catch (e) {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
    }
})();

// Importe grande con los céntimos más pequeños: 1.234<small>,56 €</small>
const moneyHTML = (amount) => money.formatToParts(amount).map((p) =>
    ['decimal', 'fraction', 'currency', 'literal'].includes(p.type)
        ? `<span class="small">${esc(p.value)}</span>`
        : esc(p.value)
).join('');

const fmtShort = (iso) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(parseISO(iso));

const parseAmount = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    let s = v.replace(/[€\s]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    return parseFloat(s);
};

// ===== App =====
const App = {
    state: {
        transactions: [],
        settings: {
            sheetUrl: localStorage.getItem('sheetUrl') || 'https://script.google.com/macros/s/AKfycbwDzQtbRw9yl1oe9lsxxLGy4JlT-DGoBAV_8vKKLsnrbARHTNb3Nvg_INjSo2gQrEL2/exec',
            userName: 'Usuario'
        },
        currentPage: null,
        range: null,
        rangeOpen: false,
        filterSector: null,
        syncing: false
    },

    chart: null,
    pendingSaves: new Map(),   // id -> { tx, at }  guardados aún no vistos en el Sheet
    pendingDeletes: new Map(), // id -> { tx, index, timer, sent, at }

    init: () => {
        App.loadData();
        App.state.range = App.monthRange(new Date());

        document.querySelectorAll('.tab').forEach((b) =>
            b.addEventListener('click', () => App.navigate(b.dataset.page)));

        App.navigate('add-transaction');
        App.fetchFromSheet();

        // Al volver a la app, sincronizar; al salir, enviar borrados pendientes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') App.fetchFromSheet();
            else App.flushDeletes();
        });
        window.addEventListener('pagehide', App.flushDeletes);
    },

    icons: () => { if (window.lucide) lucide.createIcons(); },

    // ----- Datos -----
    loadData: () => {
        try {
            const stored = localStorage.getItem('transactions');
            if (stored) App.state.transactions = JSON.parse(stored) || [];
        } catch (e) {
            App.state.transactions = [];
        }
    },

    persist: () => {
        try { localStorage.setItem('transactions', JSON.stringify(App.state.transactions)); } catch (e) { /* sin espacio */ }
    },

    normalize: (t, index) => {
        // Google Sheets devuelve fechas ISO como "2026-02-09T23:00:00.000Z"
        let date = t.date || t.Fecha || '';
        if (typeof date === 'string' && date.includes('T')) {
            const d = new Date(date);
            if (!isNaN(d.getTime())) date = toISO(d);
        }
        const amount = parseAmount(t.amount ?? t.Importe);
        if (!date || !isFinite(amount)) return null;

        return {
            id: t.id || t.ID || `sheet-${date}-${index}`,
            date: String(date).slice(0, 10),
            type: t.type || t.Tipo || 'expense',
            sector: t.sector || t.Sector || 'Otros',
            amount,
            method: t.method || t['Método'] || '',
            concept: t.concept || t.Concepto || ''
        };
    },

    fetchFromSheet: async (manual = false) => {
        const url = App.state.settings.sheetUrl;
        if (!url || App.state.syncing) return;

        App.setSyncing(true);
        try {
            const response = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
            if (!response.ok) throw new Error('Error en la respuesta de red');
            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Formato inesperado');

            const now = Date.now();
            let list = data.map(App.normalize).filter(Boolean);

            // No mostrar lo que se acaba de borrar (aunque el Sheet aún no lo haya procesado)
            App.pendingDeletes.forEach((e, id) => {
                if (e.sent && now - e.at > PENDING_TTL_MS) App.pendingDeletes.delete(id);
            });
            list = list.filter((t) => !App.pendingDeletes.has(String(t.id)));

            // Mantener lo recién guardado hasta que aparezca en el Sheet
            // (el Sheet puede no devolver el id, así que también se compara por contenido)
            const key = (t) => `${t.date}|${t.sector}|${Number(t.amount).toFixed(2)}`;
            const ids = new Set(list.map((t) => String(t.id)));
            const keys = new Set(list.map(key));
            App.pendingSaves.forEach((p, id) => {
                if (ids.has(id) || keys.has(key(p.tx)) || now - p.at > PENDING_TTL_MS) App.pendingSaves.delete(id);
                else list.unshift(p.tx);
            });

            if (JSON.stringify(list) !== JSON.stringify(App.state.transactions)) {
                App.state.transactions = list;
                App.persist();
                App.refresh();
            }
            if (manual) App.toast('Sincronizado con Google Sheets', { icon: 'check-circle-2', type: 'success' });
        } catch (error) {
            console.error('No se pudieron cargar los datos del Sheet:', error);
            if (manual) App.toast('No se pudo sincronizar. Mostrando datos guardados.', { icon: 'wifi-off', type: 'error' });
        } finally {
            App.setSyncing(false);
        }
    },

    setSyncing: (v) => {
        App.state.syncing = v;
        const b = document.getElementById('sync-btn');
        if (b) b.classList.toggle('spin', v);
    },

    post: (body, keepalive = false) => {
        const url = App.state.settings.sheetUrl;
        if (!url) return Promise.resolve();
        // no-cors: Apps Script no devuelve cabeceras CORS en el redirect
        return fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive
        });
    },

    saveTransaction: (data) => {
        App.state.transactions.unshift(data);
        App.persist();
        App.pendingSaves.set(String(data.id), { tx: data, at: Date.now() });
        App.refresh();

        App.toast(`<b>${money.format(data.amount)}</b> en ${esc(data.sector)}`, {
            icon: 'check-circle-2',
            type: 'success',
            action: 'Ver',
            onAction: () => App.navigate('analytics')
        });

        // Enviamos claves en inglés y en español para ser compatibles con las cabeceras del Sheet
        App.post({
            ...data,
            Fecha: data.date,
            Tipo: data.type,
            Sector: data.sector,
            Importe: data.amount,
            'Método': data.method,
            Concepto: data.concept
        }).catch((e) => {
            console.error(e);
            App.toast('Guardado en el móvil, pero no se pudo enviar a Sheets', { icon: 'wifi-off', type: 'error' });
        });
    },

    // Borrado con "Deshacer": se envía al Sheet pasados unos segundos
    deleteTransaction: (id) => {
        id = String(id);
        const index = App.state.transactions.findIndex((t) => String(t.id) === id);
        if (index < 0) return;

        const [tx] = App.state.transactions.splice(index, 1);
        App.persist();
        App.pendingSaves.delete(id);

        const entry = { tx, index, sent: false, at: Date.now() };
        entry.timer = setTimeout(() => App.sendDelete(id), UNDO_MS);
        App.pendingDeletes.set(id, entry);
        App.refresh();

        App.toast('Movimiento eliminado', {
            icon: 'trash-2',
            action: 'Deshacer',
            duration: UNDO_MS,
            onAction: () => {
                const e = App.pendingDeletes.get(id);
                if (!e || e.sent) return;
                clearTimeout(e.timer);
                App.pendingDeletes.delete(id);
                App.state.transactions.splice(Math.min(e.index, App.state.transactions.length), 0, e.tx);
                App.persist();
                App.refresh();
            }
        });
    },

    sendDelete: (id, keepalive = false) => {
        const e = App.pendingDeletes.get(id);
        if (!e || e.sent) return;
        clearTimeout(e.timer);
        e.sent = true;
        e.at = Date.now();
        App.post({ action: 'delete', id }, keepalive)
            .catch((err) => console.error('Error al eliminar en Google Sheets:', err));
    },

    flushDeletes: () => {
        App.pendingDeletes.forEach((e, id) => { if (!e.sent) App.sendDelete(id, true); });
    },

    expensesIn: (start, end) => App.state.transactions
        .filter((t) => t.type === 'expense' && t.date >= start && t.date <= end),

    monthRange: (d) => ({
        start: toISO(new Date(d.getFullYear(), d.getMonth(), 1)),
        end: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
    }),

    // ----- Navegación -----
    navigate: (page) => {
        App.state.currentPage = page;
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === page));

        const main = document.getElementById('main-content');
        main.onclick = null;
        main.onchange = null;
        if (App.chart) { App.chart.destroy(); App.chart = null; }

        main.classList.remove('page-in');
        void main.offsetWidth; // reinicia la animación
        main.classList.add('page-in');

        if (page === 'analytics') {
            App.renderAnalytics();
            App.fetchFromSheet(); // sincronizar al entrar
        } else {
            App.renderAddTransaction();
        }
        window.scrollTo(0, 0);
    },

    // Re-pinta la vista actual sin animación de página
    refresh: () => {
        if (App.state.currentPage === 'analytics') App.renderAnalytics({ animate: false });
        else App.updateMonthTotal();
    },

    // ----- Nuevo gasto -----
    renderAddTransaction: () => {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <header class="page-header">
                <div>
                    <p class="eyebrow">Gastos Raúl</p>
                    <h1>Nuevo gasto</h1>
                </div>
                <button class="month-chip" id="month-chip" aria-label="Ver análisis del mes">
                    <span>Este mes</span>
                    <strong id="month-total"></strong>
                </button>
            </header>

            <div class="sector-grid">
                ${SECTORS.map((s) => `
                    <button class="sector-btn ${s === 'Otros' ? 'wide' : ''}" data-sector="${esc(s)}">
                        <span class="sector-icon" style="--c:${App.colorFor(s)}"><i data-lucide="${App.getSectorIcon(s)}"></i></span>
                        <span>${esc(s)}</span>
                    </button>`).join('')}
            </div>
        `;

        main.onclick = (e) => {
            const sectorBtn = e.target.closest('[data-sector]');
            if (sectorBtn) return App.openAmountSheet(sectorBtn.dataset.sector);
            if (e.target.closest('#month-chip')) App.navigate('analytics');
        };

        App.updateMonthTotal();
        App.icons();
    },

    updateMonthTotal: () => {
        const el = document.getElementById('month-total');
        if (!el) return;
        const { start, end } = App.monthRange(new Date());
        el.textContent = money.format(App.expensesIn(start, end).reduce((s, t) => s + t.amount, 0));
    },

    openAmountSheet: (sector) => {
        const s = { amount: '', date: todayISO(), method: 'tarjeta' };
        const root = document.getElementById('sheet-root');
        const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];

        root.innerHTML = `
            <div class="sheet-backdrop"></div>
            <div class="sheet" role="dialog" aria-modal="true" aria-label="Importe para ${esc(sector)}">
                <div class="sheet-grab">
                    <div class="sheet-handle"></div>
                    <div class="sheet-head">
                        <span class="sector-icon" style="--c:${App.colorFor(sector)}"><i data-lucide="${App.getSectorIcon(sector)}"></i></span>
                        <strong>${esc(sector)}</strong>
                        <button class="icon-btn" data-close aria-label="Cerrar"><i data-lucide="x"></i></button>
                    </div>
                </div>

                <div class="amount-display empty" id="amount-display">
                    <span id="amt">0</span><span class="cur">€</span>
                </div>

                <div class="options">
                    <div class="seg grow" id="date-seg">
                        <button data-date="today" class="on">Hoy</button>
                        <button data-date="yesterday">Ayer</button>
                        <label class="date-pick" id="date-other" aria-label="Otra fecha">
                            <i data-lucide="calendar"></i><span id="date-label"></span>
                            <input type="date" id="date-input" value="${s.date}">
                        </label>
                    </div>
                    <div class="seg" id="method-seg">
                        <button data-method="tarjeta" class="on" aria-label="Tarjeta"><i data-lucide="credit-card"></i></button>
                        <button data-method="efectivo" aria-label="Efectivo"><i data-lucide="banknote"></i></button>
                    </div>
                </div>

                <input class="note-input" id="note" type="text" placeholder="Nota (opcional)" maxlength="60" autocomplete="off" enterkeyhint="done">

                <div class="keypad" id="keypad">
                    ${keys.map((k) => `<button class="key" data-key="${k}" ${k === 'del' ? 'aria-label="Borrar"' : ''}>${k === 'del' ? '<i data-lucide="delete"></i>' : k}</button>`).join('')}
                </div>

                <button class="save-btn" id="save-btn" disabled><i data-lucide="check"></i> Guardar</button>
            </div>
        `;

        const sheet = root.querySelector('.sheet');
        const backdrop = root.querySelector('.sheet-backdrop');
        const display = root.querySelector('#amount-display');
        const amtEl = root.querySelector('#amt');
        const saveBtn = root.querySelector('#save-btn');
        const dateSeg = root.querySelector('#date-seg');
        const dateOther = root.querySelector('#date-other');
        const dateLabel = root.querySelector('#date-label');
        const dateInput = root.querySelector('#date-input');
        const methodSeg = root.querySelector('#method-seg');
        const noteInput = root.querySelector('#note');

        const setOn = (seg, el) => {
            seg.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
            el.classList.add('on');
        };

        const update = () => {
            amtEl.textContent = s.amount || '0';
            display.classList.toggle('empty', !s.amount);
            saveBtn.disabled = !(parseFloat(s.amount.replace(',', '.')) > 0);
        };

        const press = (k) => {
            if (k === 'del') {
                s.amount = s.amount.slice(0, -1);
            } else if (k === ',') {
                if (!s.amount.includes(',')) s.amount = (s.amount || '0') + ',';
            } else {
                const [int, dec] = s.amount.split(',');
                if (dec !== undefined && dec.length >= 2) return;
                if (dec === undefined && int.length >= 6) return;
                s.amount = s.amount === '0' ? k : s.amount + k;
            }
            update();
        };

        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey);
            document.body.classList.remove('sheet-open');
            if (document.activeElement) document.activeElement.blur();
            sheet.classList.add('closing');
            backdrop.classList.add('closing');
            setTimeout(() => { sheet.remove(); backdrop.remove(); }, 230);
        };

        const save = () => {
            const amount = Math.round(parseFloat(s.amount.replace(',', '.')) * 100) / 100;
            if (!(amount > 0)) {
                display.classList.remove('shake');
                void display.offsetWidth;
                display.classList.add('shake');
                return;
            }
            const note = noteInput.value.trim();
            close();
            App.saveTransaction({
                type: 'expense',
                sector,
                concept: note || '-',
                amount,
                method: s.method,
                date: s.date,
                id: Date.now()
            });
        };

        const onKey = (e) => {
            if (e.key === 'Escape') return close();
            if (e.key === 'Enter') {
                if (document.activeElement === noteInput) noteInput.blur();
                if (!saveBtn.disabled) { e.preventDefault(); save(); }
                return;
            }
            if (document.activeElement === noteInput) return;
            if (/^[0-9]$/.test(e.key)) press(e.key);
            else if (e.key === ',' || e.key === '.') press(',');
            else if (e.key === 'Backspace') press('del');
            else return;
            e.preventDefault();
        };

        root.querySelector('#keypad').addEventListener('click', (e) => {
            const k = e.target.closest('[data-key]');
            if (k) press(k.dataset.key);
        });

        dateSeg.addEventListener('click', (e) => {
            const b = e.target.closest('[data-date]');
            if (!b) return;
            s.date = b.dataset.date === 'today' ? todayISO() : addDays(todayISO(), -1);
            dateInput.value = s.date;
            dateLabel.textContent = '';
            setOn(dateSeg, b);
        });

        dateInput.addEventListener('change', () => {
            if (!dateInput.value) return;
            s.date = dateInput.value;
            if (s.date === todayISO()) {
                setOn(dateSeg, dateSeg.querySelector('[data-date="today"]'));
                dateLabel.textContent = '';
            } else if (s.date === addDays(todayISO(), -1)) {
                setOn(dateSeg, dateSeg.querySelector('[data-date="yesterday"]'));
                dateLabel.textContent = '';
            } else {
                setOn(dateSeg, dateOther);
                dateLabel.textContent = fmtShort(s.date);
            }
        });

        methodSeg.addEventListener('click', (e) => {
            const b = e.target.closest('[data-method]');
            if (!b) return;
            s.method = b.dataset.method;
            setOn(methodSeg, b);
        });

        saveBtn.addEventListener('click', save);
        backdrop.addEventListener('click', close);
        root.querySelector('[data-close]').addEventListener('click', close);
        document.addEventListener('keydown', onKey);

        // Arrastrar hacia abajo para cerrar
        const grab = root.querySelector('.sheet-grab');
        let y0 = null;
        let dy = 0;
        grab.addEventListener('touchstart', (e) => {
            if (e.target.closest('button')) return;
            y0 = e.touches[0].clientY;
            dy = 0;
            sheet.style.transition = 'none';
        }, { passive: true });
        grab.addEventListener('touchmove', (e) => {
            if (y0 === null) return;
            dy = Math.max(0, e.touches[0].clientY - y0);
            sheet.style.transform = `translateY(${dy}px)`;
        }, { passive: true });
        grab.addEventListener('touchend', () => {
            if (y0 === null) return;
            y0 = null;
            if (dy > 90) return close();
            sheet.style.transition = 'transform 0.2s';
            sheet.style.transform = '';
        });

        document.body.classList.add('sheet-open');
        App.icons();
    },

    // ----- Análisis -----
    renderAnalytics: ({ animate = true } = {}) => {
        const main = document.getElementById('main-content');
        const { start, end } = App.state.range;

        const tx = App.expensesIn(start, end).sort((a, b) =>
            b.date !== a.date ? b.date.localeCompare(a.date) : (Number(b.id) || 0) - (Number(a.id) || 0));
        const total = tx.reduce((s, t) => s + t.amount, 0);

        const bySector = new Map();
        tx.forEach((t) => {
            const e = bySector.get(t.sector) || { sector: t.sector, total: 0, count: 0 };
            e.total += t.amount;
            e.count++;
            bySector.set(t.sector, e);
        });
        const cats = [...bySector.values()].sort((a, b) => b.total - a.total);

        let sel = App.state.filterSector;
        if (sel && !bySector.has(sel)) sel = App.state.filterSector = null;
        const selCat = sel ? bySector.get(sel) : null;
        const visible = sel ? tx.filter((t) => t.sector === sel) : tx;

        // Media diaria sobre los días transcurridos del periodo
        const today = todayISO();
        const lastDay = end < today ? end : today;
        const days = lastDay >= start ? daysBetween(start, lastDay) + 1 : 0;
        const pct = (v) => (total ? (v * 100) / total : 0);

        // Agrupar movimientos por día
        const groups = [];
        visible.forEach((t) => {
            let g = groups[groups.length - 1];
            if (!g || g.date !== t.date) { g = { date: t.date, items: [], total: 0 }; groups.push(g); }
            g.items.push(t);
            g.total += t.amount;
        });

        main.innerHTML = `
            <header class="page-header">
                <div>
                    <p class="eyebrow">Gastos Raúl</p>
                    <h1>Análisis</h1>
                </div>
                <button class="icon-btn ${App.state.syncing ? 'spin' : ''}" id="sync-btn" aria-label="Sincronizar"><i data-lucide="refresh-cw"></i></button>
            </header>

            <div class="range-bar">
                <button class="icon-btn" data-shift="-1" aria-label="Periodo anterior"><i data-lucide="chevron-left"></i></button>
                <button class="range-label ${App.state.rangeOpen ? 'open' : ''}" id="range-toggle">
                    <span>${esc(App.rangeLabel(start, end))}</span><i data-lucide="chevron-down"></i>
                </button>
                <button class="icon-btn" data-shift="1" aria-label="Periodo siguiente"><i data-lucide="chevron-right"></i></button>
            </div>

            <div class="range-editor" id="range-editor" ${App.state.rangeOpen ? '' : 'hidden'}>
                <label>Desde<input type="date" id="range-start" value="${start}"></label>
                <label>Hasta<input type="date" id="range-end" value="${end}"></label>
                <div class="quick">
                    <button data-quick="month">Este mes</button>
                    <button data-quick="last-month">Mes pasado</button>
                    <button data-quick="30">Últimos 30 días</button>
                    <button data-quick="year">Este año</button>
                </div>
            </div>

            <section class="card total-card">
                <span class="label">Total gastos</span>
                <div class="total-amount">${moneyHTML(total)}</div>
                <div class="total-meta">
                    <span><i data-lucide="receipt"></i>${tx.length} ${tx.length === 1 ? 'movimiento' : 'movimientos'}</span>
                    ${days > 0 && tx.length ? `<span><i data-lucide="calendar-days"></i>${money.format(total / days)} / día</span>` : ''}
                </div>
            </section>

            <section class="card chart-card">
                ${cats.length ? `
                    <div class="donut-wrap">
                        <canvas id="donut" aria-label="Gastos por categoría" role="img"></canvas>
                        <div class="donut-center">
                            <span>${selCat ? esc(selCat.sector) : 'Por categoría'}</span>
                            <strong>${money.format(selCat ? selCat.total : total)}</strong>
                            ${selCat ? `<em>${pct(selCat.total).toFixed(1).replace('.', ',')}%</em>` : ''}
                        </div>
                    </div>
                    <ul class="cat-list ${sel ? 'has-sel' : ''}">
                        ${cats.map((c) => `
                            <li>
                                <button class="cat-row ${c.sector === sel ? 'sel' : ''}" data-cat="${esc(c.sector)}" style="--c:${App.colorFor(c.sector)}">
                                    <span class="sector-icon sm" style="--c:${App.colorFor(c.sector)}"><i data-lucide="${App.getSectorIcon(c.sector)}"></i></span>
                                    <span class="cat-main">
                                        <span class="cat-top">
                                            <span class="cat-name">${esc(c.sector)}</span>
                                            <span class="cat-amt">${money.format(c.total)}</span>
                                        </span>
                                        <span class="cat-bar"><span style="width:${pct(c.total).toFixed(2)}%"></span></span>
                                        <span class="cat-sub">
                                            <span>${c.count} ${c.count === 1 ? 'movimiento' : 'movimientos'}</span>
                                            <span>${pct(c.total).toFixed(1).replace('.', ',')}%</span>
                                        </span>
                                    </span>
                                </button>
                            </li>`).join('')}
                    </ul>
                ` : `
                    <div class="empty-state"><i data-lucide="pie-chart"></i>Sin gastos en este periodo</div>
                `}
            </section>

            <section>
                <div class="section-head">
                    <h2>Movimientos</h2>
                    ${sel ? `<button class="filter-chip" data-clear-filter><span>${esc(sel)}</span><i data-lucide="x"></i></button>` : ''}
                </div>
                ${groups.length ? groups.map((g) => `
                    <div class="day-group">
                        <div class="day-head">
                            <span>${esc(App.dayLabel(g.date))}</span>
                            <span>${money.format(g.total)}</span>
                        </div>
                        <div class="day-list">
                            ${g.items.map(App.renderTransactionItem).join('')}
                        </div>
                    </div>`).join('') : `
                    <div class="empty-state card"><i data-lucide="inbox"></i>No hay gastos en este periodo</div>`}
            </section>
        `;

        main.onclick = (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.dataset.shift) App.shiftRange(Number(b.dataset.shift));
            else if (b.id === 'range-toggle') {
                App.state.rangeOpen = !App.state.rangeOpen;
                b.classList.toggle('open', App.state.rangeOpen);
                document.getElementById('range-editor').hidden = !App.state.rangeOpen;
            } else if (b.dataset.quick) App.quickRange(b.dataset.quick);
            else if (b.id === 'sync-btn') App.fetchFromSheet(true);
            else if (b.dataset.cat !== undefined) App.toggleFilter(b.dataset.cat);
            else if (b.hasAttribute('data-clear-filter')) App.toggleFilter(null);
            else if (b.dataset.del) App.deleteTransaction(b.dataset.del);
        };

        main.onchange = (e) => {
            if (e.target.id !== 'range-start' && e.target.id !== 'range-end') return;
            let s = document.getElementById('range-start').value || start;
            let en = document.getElementById('range-end').value || end;
            if (s > en) [s, en] = [en, s];
            App.setRange(s, en);
        };

        App.icons();
        App.drawChart(cats, sel, animate);
    },

    drawChart: (cats, sel, animate) => {
        if (App.chart) { App.chart.destroy(); App.chart = null; }
        const canvas = document.getElementById('donut');
        if (!canvas || !window.Chart) return;

        const colors = cats.map((c) => App.colorFor(c.sector));
        App.chart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: cats.map((c) => c.sector),
                datasets: [{
                    data: cats.map((c) => c.total),
                    backgroundColor: colors.map((c, i) => (sel && cats[i].sector !== sel ? c + '33' : c)),
                    borderColor: '#151e33',
                    borderWidth: 3,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                layout: { padding: 6 },
                animation: animate ? { animateRotate: true, duration: 650 } : false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                onClick: (evt, els) => {
                    if (els.length) App.toggleFilter(cats[els[0].index].sector);
                }
            }
        });
    },

    toggleFilter: (sector) => {
        App.state.filterSector = sector === null || App.state.filterSector === sector ? null : sector;
        App.renderAnalytics({ animate: false });
    },

    setRange: (start, end) => {
        App.state.range = { start, end };
        App.renderAnalytics();
    },

    shiftRange: (dir) => {
        const { start, end } = App.state.range;
        const s = parseISO(start);
        const e = parseISO(end);

        if (App.isFullYear(start, end)) {
            App.setRange(`${s.getFullYear() + dir}-01-01`, `${s.getFullYear() + dir}-12-31`);
        } else if (s.getDate() === 1) {
            // Meses completos
            const r = App.monthRange(new Date(s.getFullYear(), s.getMonth() + dir, 1));
            App.setRange(r.start, r.end);
        } else {
            // Rango libre: desplazar por su propia duración
            const len = daysBetween(start, end) + 1;
            App.setRange(addDays(start, dir * len), addDays(toISO(e), dir * len));
        }
    },

    quickRange: (kind) => {
        const now = new Date();
        if (kind === 'month') {
            const r = App.monthRange(now); App.setRange(r.start, r.end);
        } else if (kind === 'last-month') {
            const r = App.monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1)); App.setRange(r.start, r.end);
        } else if (kind === '30') {
            App.setRange(addDays(todayISO(), -29), todayISO());
        } else if (kind === 'year') {
            App.setRange(`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`);
        }
    },

    isFullYear: (start, end) => start.slice(5) === '01-01' && end.slice(5) === '12-31' && start.slice(0, 4) === end.slice(0, 4),

    isFullMonth: (start, end) => {
        const s = parseISO(start);
        const r = App.monthRange(s);
        return r.start === start && r.end === end;
    },

    rangeLabel: (start, end) => {
        const s = parseISO(start);
        if (App.isFullMonth(start, end)) {
            return cap(new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(s)) + ' ' + s.getFullYear();
        }
        if (App.isFullYear(start, end)) return 'Año ' + s.getFullYear();

        const sameYear = start.slice(0, 4) === end.slice(0, 4);
        const f = new Intl.DateTimeFormat('es-ES', sameYear
            ? { day: 'numeric', month: 'short' }
            : { day: 'numeric', month: 'short', year: 'numeric' });
        return `${f.format(s)} – ${f.format(parseISO(end))}`;
    },

    dayLabel: (iso) => {
        const today = todayISO();
        if (iso === today) return 'Hoy';
        if (iso === addDays(today, -1)) return 'Ayer';
        const d = parseISO(iso);
        const opts = { weekday: 'long', day: 'numeric', month: 'short' };
        if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
        return cap(new Intl.DateTimeFormat('es-ES', opts).format(d));
    },

    renderTransactionItem: (t) => {
        const hasConcept = t.concept && t.concept !== '-';
        const title = hasConcept ? t.concept : t.sector;
        const sub = [hasConcept ? t.sector : null, App.methodLabel(t.method)].filter(Boolean).join(' · ');
        const isExpense = t.type === 'expense';

        return `
            <div class="tx">
                <span class="sector-icon sm" style="--c:${App.colorFor(t.sector)}"><i data-lucide="${App.getSectorIcon(t.sector)}"></i></span>
                <div class="tx-main">
                    <span class="tx-title">${esc(title)}</span>
                    ${sub ? `<span class="tx-sub">${esc(sub)}</span>` : ''}
                </div>
                <span class="tx-amt" style="color:${isExpense ? 'var(--text)' : 'var(--success)'}">${isExpense ? '−' : '+'}${money.format(t.amount)}</span>
                <button class="tx-del" data-del="${esc(t.id)}" aria-label="Eliminar"><i data-lucide="trash-2"></i></button>
            </div>
        `;
    },

    // ----- Toast -----
    toast: (html, { type = 'info', icon, action, onAction, duration = 2800 } = {}) => {
        const el = document.getElementById('toast');
        clearTimeout(App._toastTimer);
        const hide = () => el.classList.remove('show');

        el.className = 'toast ' + type;
        el.innerHTML = `${icon ? `<i data-lucide="${icon}"></i>` : ''}<span class="t-msg">${html}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
        if (action) {
            el.querySelector('button').onclick = () => { hide(); if (onAction) onAction(); };
        }
        App.icons();
        requestAnimationFrame(() => el.classList.add('show'));
        App._toastTimer = setTimeout(hide, duration);
    },

    // ----- Utilidades -----
    formatCurrency: (amount) => money.format(amount),

    methodLabel: (m) => ({ card: 'Tarjeta', tarjeta: 'Tarjeta', cash: 'Efectivo', efectivo: 'Efectivo' }[String(m || '').toLowerCase()] || cap(m)),

    colorFor: (sector) => {
        if (SECTOR_COLORS[sector]) return SECTOR_COLORS[sector];
        let h = 0;
        for (const ch of String(sector)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return EXTRA_COLORS[h % EXTRA_COLORS.length];
    },

    getSectorIcon: (sector) => SECTOR_ICONS[sector] || 'circle'
};

// Start
document.addEventListener('DOMContentLoaded', App.init);
