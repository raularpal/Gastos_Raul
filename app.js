const App = {
    state: {
        transactions: [],
        settings: {
            sheetUrl: localStorage.getItem('sheetUrl') || 'https://script.google.com/macros/s/AKfycbwDzQtbRw9yl1oe9lsxxLGy4JlT-DGoBAV_8vKKLsnrbARHTNb3Nvg_INjSo2gQrEL2/exec',
            userName: 'Usuario'
        }
    },

    init: () => {
        App.loadData();
        App.navigate('add-transaction');

        // Intentar cargar datos de Google Sheets
        App.fetchFromSheet();

        // Initial setup
        document.querySelectorAll('.nav-links li').forEach(link => {
            link.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
    },

    loadData: () => {
        const stored = localStorage.getItem('transactions');
        if (stored) {
            App.state.transactions = JSON.parse(stored);
        }
    },

    fetchFromSheet: async () => {
        const url = App.state.settings.sheetUrl;
        if (!url) return;

        try {
            console.log('Fetching data from sheet:', url);
            const response = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
            if (!response.ok) throw new Error('Error en la respuesta de red');

            const data = await response.json();
            console.log('Data received:', data);

            if (Array.isArray(data)) {
                // Normalizar datos
                App.state.transactions = data.map((t, index) => {
                    // Normalizar fechas y mapear claves (Español/Inglés)
                    // Google Sheets devuelve strings ISO como "2026-02-09T23:00:00.000Z"
                    let dateStr = t.date || t.Fecha;
                    if (dateStr && (typeof dateStr === 'string' && dateStr.includes('T'))) {
                        const d = new Date(dateStr);
                        if (!isNaN(d.getTime())) {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            dateStr = `${year}-${month}-${day}`;
                        }
                    }

                    return {
                        id: t.id || `sheet-${Date.now()}-${index}`,
                        date: dateStr,
                        type: t.type || t.Tipo,
                        sector: t.sector || t.Sector,
                        amount: parseFloat(t.amount || t.Importe),
                        method: t.method || t.Método,
                        concept: t.concept || t.Concepto
                    };
                });

                // Guardar en local
                localStorage.setItem('transactions', JSON.stringify(App.state.transactions));

                // Refrescar vista actual si es necesario
                if (App.state.currentPage === 'analytics') {
                    App.renderAnalytics(document.getElementById('main-content'));
                }
                console.log('Datos sincronizados con Google Sheets');
            }
        } catch (error) {
            console.error('No se pudieron cargar los datos del Sheet:', error);
        }
    },

    navigate: (page) => {
        App.state.currentPage = page;
        const main = document.getElementById('main-content');
        main.innerHTML = ''; // Clear current content
        main.className = 'animate-fade-in';

        switch (page) {
            case 'add-transaction':
                App.renderAddTransaction(main);
                break;
            case 'analytics':
                App.renderAnalytics(main);
                App.fetchFromSheet(); // Sincronizar al entrar
                break;
        }
        lucide.createIcons();
    },

    // Combined Analytics & Dashboard
    renderAnalytics: (container, startDate, endDate) => {
        const now = new Date();

        // Defaults: First and Last day of current month
        if (!startDate) {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            // Adjust for timezone offset to avoid being off by one day when formatting
            const offsetFirst = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000));
            startDate = offsetFirst.toISOString().split('T')[0];
        }
        if (!endDate) {
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const offsetLast = new Date(lastDay.getTime() - (lastDay.getTimezoneOffset() * 60000));
            endDate = offsetLast.toISOString().split('T')[0];
        }

        // Filter and Sort Transactions by Date Range (Newest First)
        const filteredTransactions = App.state.transactions
            .filter(t => t.date >= startDate && t.date <= endDate)
            .sort((a, b) => {
                // Primary sort: Date
                if (b.date !== a.date) return b.date.localeCompare(a.date);
                // Secondary sort: ID (newer timestamp first)
                return b.id - a.id;
            });

        // Calculate Totals
        const totalExpense = filteredTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        // Label for range
        const formatDate = (dStr) => {
            const d = new Date(dStr);
            return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(d);
        };
        const rangeLabel = `${formatDate(startDate)} - ${formatDate(endDate)}`;

        container.innerHTML = `
            <div class="header" style="display: flex; justify-content: center; align-items: center; margin-bottom: 2rem; position: relative;">
                <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.1); padding: 0.5rem 1rem; border-radius: 99px;">
                    <button onclick="changeRangeOffset(-1)" style="background: none; border: none; color: white; cursor: pointer; padding: 0.5rem;"><i data-lucide="chevron-left"></i></button>
                    
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <input type="date" value="${startDate}" onchange="updateStart(this.value)" 
                               style="background: transparent; border: none; color: white; font-family: inherit; cursor: pointer; color-scheme: dark; width: 110px;">
                        <span style="color: var(--text-secondary);">-</span>
                        <input type="date" value="${endDate}" onchange="updateEnd(this.value)" 
                               style="background: transparent; border: none; color: white; font-family: inherit; cursor: pointer; color-scheme: dark; width: 110px;">
                    </div>

                    <button onclick="changeRangeOffset(1)" style="background: none; border: none; color: white; cursor: pointer; padding: 0.5rem;"><i data-lucide="chevron-right"></i></button>
                </div>
            </div>
            
            <div class="dashboard grid" style="margin-bottom: 3rem; grid-template-columns: 1fr;">
                <div class="card stat-card">
                    <span class="stat-label">Total Gastos</span>
                    <span class="stat-value" style="color: var(--danger-color)">${App.formatCurrency(totalExpense)}</span>
                </div>
            </div>

            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
                <div class="card chart-container">
                    <canvas id="expensesBySector"></canvas>
                </div>
                <!-- Future Trend Chart -->
            </div>

            <div style="margin-top: 3rem;">
                <h2 style="margin-bottom: 1.5rem;">Movimientos (${rangeLabel})</h2>
                <div class="transactions-list">
                    ${filteredTransactions.filter(t => t.type === 'expense').length > 0
                ? filteredTransactions.filter(t => t.type === 'expense').map(t => App.renderTransactionItem(t)).join('')
                : '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No hay gastos en este periodo.</p>'}
                </div>
            </div>
        `;

        lucide.createIcons();

        // Render Charts
        setTimeout(() => {
            const ctx1 = document.getElementById('expensesBySector');
            if (ctx1) {
                const sectors = {};
                filteredTransactions
                    .filter(t => t.type === 'expense')
                    .forEach(t => {
                        sectors[t.sector] = (sectors[t.sector] || 0) + t.amount;
                    });

                if (Object.keys(sectors).length > 0) {
                    new Chart(ctx1.getContext('2d'), {
                        type: 'doughnut',
                        plugins: [ChartDataLabels],
                        data: {
                            labels: Object.keys(sectors).map(sector => `${sector} - ${App.formatCurrency(sectors[sector])}`),
                            datasets: [{
                                data: Object.values(sectors),
                                backgroundColor: ['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'],
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'right', labels: { color: '#94a3b8' } },
                                title: { display: true, text: 'Gastos por Sector', color: '#f8fafc' },
                                datalabels: {
                                    color: '#fff',
                                    font: { weight: 'bold' },
                                    formatter: (value, ctx) => {
                                        let sum = 0;
                                        let dataArr = ctx.chart.data.datasets[0].data;
                                        dataArr.map(data => {
                                            sum += data;
                                        });
                                        let percentage = (value * 100 / sum).toFixed(1) + "%";
                                        return percentage;
                                    },
                                    anchor: 'end',
                                    align: 'start',
                                    offset: 10
                                }
                            }
                        }
                    });
                } else {
                    ctx1.parentElement.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">Sin gastos registrados.</p>';
                }
            }
        }, 100);

        // Navigation Handlers
        window.changeRangeOffset = (months) => {
            const [sy, sm, sd] = startDate.split('-').map(Number);

            // Heuristic: If start day is 1, assume we want to view full months
            const isStartOfMonth = sd === 1;

            // Calculate new Start
            const newStart = new Date(sy, sm - 1 + months, sd);

            let newEnd;
            if (isStartOfMonth) {
                // End is last day of the new month
                newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0);
            } else {
                // Just shift end date by months
                const [ey, em, ed] = endDate.split('-').map(Number);
                newEnd = new Date(ey, em - 1 + months, ed);
            }

            // Format YYYY-MM-DD
            const fmt = (d) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            App.renderAnalytics(container, fmt(newStart), fmt(newEnd));
        };

        window.updateStart = (val) => {
            if (val) App.renderAnalytics(container, val, endDate);
        };
        window.updateEnd = (val) => {
            if (val) App.renderAnalytics(container, startDate, val);
        };
    },

    renderTransactionItem: (t) => {
        const isExpense = t.type === 'expense';
        const color = isExpense ? 'var(--danger-color)' : 'var(--success-color)';

        return `
            <div class="card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding: 1rem;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="background: rgba(255,255,255,0.1); padding: 0.5rem; border-radius: 50%;">
                        <i data-lucide="${App.getSectorIcon(t.sector)}"></i>
                    </div>
                    <div>
                        <h4 style="font-weight: 600;">${t.concept || t.sector}</h4>
                        <span style="font-size: 0.8rem; color: var(--text-secondary);">${t.date} • ${t.method}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="text-align: right;">
                        <span style="display: block; font-weight: 700; color: ${color};">${isExpense ? '-' : '+'}${App.formatCurrency(t.amount)}</span>
                    </div>
                    <button onclick="App.deleteTransaction('${t.id}')" style="background: rgba(239, 68, 68, 0.1); color: var(--danger-color); border: none; padding: 0.5rem; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                </div>
            </div>
        `;
    },

    renderAddTransaction: (container) => {
        // Simple flow: 1. Sector -> 2. Amount & Save
        let step = 1;
        let data = {
            type: 'expense',
            sector: '',
            concept: '-',
            amount: '',
            method: 'tarjeta',
            date: new Date().toISOString().split('T')[0]
        };

        const renderStep = () => {
            container.innerHTML = '';
            const stepContainer = document.createElement('div');
            stepContainer.className = 'card animate-fade-in';
            stepContainer.style.maxWidth = '600px';
            stepContainer.style.margin = '0 auto';

            if (step === 1) {
                // Step 1: Sector Selection

                const sectors = [
                    'Comer fuera',
                    'Supermercados',
                    'Tomar algo',
                    'Fiesta',
                    'Transporte',
                    'Compras',
                    'Otros'
                ];

                const grid = document.createElement('div');
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                grid.style.gap = '1rem';

                sectors.forEach(s => {
                    const isFullWidth = s === 'Otros';
                    const sectorCard = `
                        <div onclick="selectSector('${s}')" style="
                            background: rgba(255,255,255,0.05); 
                            padding: 2rem 1rem; 
                            border-radius: 20px; 
                            text-align: center; 
                            cursor: pointer; 
                            border: 1px solid ${data.sector === s ? 'var(--accent-color)' : 'transparent'};
                            transition: all 0.2s;
                            ${isFullWidth ? 'grid-column: span 2;' : ''}">
                            <i data-lucide="${App.getSectorIcon(s)}" style="width: 32px; height: 32px; margin-bottom: 1rem; color: white; opacity: 0.9;"></i>
                            <div style="font-size: 1rem; font-weight: 500;">${s}</div>
                        </div>
                    `;
                    grid.innerHTML += sectorCard;
                });
                stepContainer.appendChild(grid);

            } else if (step === 2) {
                // Step 2: Amount
                stepContainer.innerHTML += `
                    <div class="form-group">
                        <label class="form-label" style="text-align: center;">Importe para <strong>${data.sector}</strong> (€)</label>
                        <input type="text" inputmode="decimal" id="input-amount" class="form-input" placeholder="0,00" value="${data.amount}" style="font-size: 2.5rem; font-weight: 700; text-align: center; height: 80px;" autofocus>
                    </div>
                    
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button onclick="prevStep()" class="btn-primary" style="background: rgba(255,255,255,0.1); flex: 1;">VOLVER</button>
                        <button onclick="submitTransaction()" class="btn-primary" style="background: var(--success-color); flex: 2; height: 60px; font-size: 1.2rem;">GUARDAR <i data-lucide="check-circle"></i></button>
                    </div>
                `;
            }

            container.appendChild(stepContainer);
            lucide.createIcons();

            // Bind global input handlers
            window.selectSector = (s) => { data.sector = s; step = 2; renderStep(); };
            window.prevStep = () => { step = 1; renderStep(); };
            window.submitTransaction = () => {
                const amountStr = document.getElementById('input-amount').value;
                if (!amountStr) return;
                data.amount = parseFloat(amountStr.replace(',', '.'));
                data.id = Date.now();
                App.saveTransaction(data);
            };
        };

        renderStep();
    },

    saveTransaction: async (data) => {
        // Save Local
        App.state.transactions.unshift(data);
        localStorage.setItem('transactions', JSON.stringify(App.state.transactions));

        // Save to Google Sheets (Async)
        if (App.state.settings.sheetUrl) {
            try {
                // We use 'no-cors' mode because Google Apps Script doesn't support CORS headers easily on redirect
                // But passing data requires either a proper proxy or accept that we can't read the response.
                // Standard hack: submit a hidden form or use fetch no-cors.
                // However, for JSON payloads, we usually need 'Content-Type': 'application/json', which triggers preflight.
                // The robust way for simple apps: Use URL parameters purely? No, too long.
                // We will try standard fetch. If it fails, we notify.

                // Construct payload
                // Construct payload
                // Enviamos claves tanto en inglés como en español para asegurar compatibilidad
                // con las cabeceras que tenga la hoja de cálculo.
                const payload = JSON.stringify({
                    ...data,
                    Fecha: data.date,
                    Tipo: data.type,
                    Sector: data.sector,
                    Importe: data.amount,
                    Método: data.method,
                    Concepto: data.concept
                });

                await fetch(App.state.settings.sheetUrl, {
                    method: 'POST',
                    mode: 'no-cors', // Important for simple Apps Script Web App
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: payload
                });

                alert('Guardado y enviado a Google Sheets!');
            } catch (e) {
                console.error(e);
                alert('Guardado localmente, pero error al enviar a Sheets.');
            }
        } else {
            alert('Guardado localmente. Configura Google Sheets en Ajustes para sincronizar.');
        }

        App.navigate('analytics');
    },
    
    deleteTransaction: async (id) => {
        if (!confirm('¿Estás seguro de que quieres eliminar este movimiento?')) return;
        
        App.state.transactions = App.state.transactions.filter(t => String(t.id) !== String(id));
        localStorage.setItem('transactions', JSON.stringify(App.state.transactions));
        
        // Sincronizar eliminación con Google Sheets
        if (App.state.settings.sheetUrl) {
            try {
                await fetch(App.state.settings.sheetUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete', id: id })
                });
            } catch (e) {
                console.error('Error al eliminar en Google Sheets:', e);
            }
        }

        // Refresh Current View
        if (App.state.currentPage === 'analytics') {
            App.navigate('analytics');
        } else {
            App.navigate(App.state.currentPage);
        }
    },

    // Utilities
    calculateTotal: (type) => {
        return App.state.transactions
            .filter(t => t.type === type)
            .reduce((sum, t) => sum + t.amount, 0);
    },

    formatCurrency: (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    },

    getSectorIcon: (sector) => {
        const map = {
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
        return map[sector] || 'circle';
    }
};

// Start
document.addEventListener('DOMContentLoaded', App.init);
