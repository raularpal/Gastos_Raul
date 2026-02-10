const App = {
    state: {
        transactions: [],
        settings: {
            sheetUrl: localStorage.getItem('sheetUrl') || 'https://script.google.com/macros/s/AKfycbznDhrqrZRsXnc64Q4fvEx32-MBwCGi10v2t7SF3_TTRTA4-tBivaJXu-O8a32rL6xv/exec',
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
            console.log('Fetching data from sheet...');
            const response = await fetch(url);
            if (!response.ok) throw new Error('Error en la respuesta de red');

            const data = await response.json();

            if (Array.isArray(data)) {
                // Normalizar datos
                App.state.transactions = data.map(t => ({
                    ...t,
                    amount: parseFloat(t.amount),
                    id: t.id || Date.now()
                }));

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

        // Filter Transactions by Date Range
        const filteredTransactions = App.state.transactions.filter(t => {
            return t.date >= startDate && t.date <= endDate;
        });

        // Calculate Totals
        const totalIncome = filteredTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = filteredTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        const balance = totalIncome - totalExpense;

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
            
            <div class="dashboard grid" style="margin-bottom: 3rem;">
                <div class="card stat-card">
                    <span class="stat-label">Balance</span>
                    <span class="stat-value" style="color: ${balance >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${App.formatCurrency(balance)}</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Ingresos</span>
                    <span class="stat-value" style="color: var(--success-color)">${App.formatCurrency(totalIncome)}</span>
                </div>
                <div class="card stat-card">
                    <span class="stat-label">Gastos</span>
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
                    ${filteredTransactions.length > 0
                ? filteredTransactions.map(t => App.renderTransactionItem(t)).join('')
                : '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No hay movimientos en este periodo.</p>'}
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
                            labels: Object.keys(sectors),
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
                                        return App.formatCurrency(value) + '\n' + percentage;
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
                <div style="text-align: right;">
                    <span style="display: block; font-weight: 700; color: ${color};">${isExpense ? '-' : '+'}${App.formatCurrency(t.amount)}</span>
                </div>
            </div>
        `;
    },

    renderAddTransaction: (container) => {
        // Multi-step wizard state
        // Steps: 1. Sector/Type -> 2. Method -> 3. Concept & Date -> 4. Amount & Save
        let step = 1;
        let data = {
            type: 'expense', // Default
            sector: '',
            concept: '',
            amount: '',
            method: 'card',
            date: new Date().toISOString().split('T')[0]
        };

        const renderStep = () => {
            container.innerHTML = '';
            const stepContainer = document.createElement('div');
            stepContainer.className = 'card animate-fade-in';
            stepContainer.style.maxWidth = '600px';
            stepContainer.style.margin = '0 auto';

            // Progress Header removed as requested

            if (step === 1) {
                // Step 1: Sector / Assignment
                const typeToggle = `
                    <div style="display: flex; gap: 1rem; margin-bottom: 2rem; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 12px;">
                        <button onclick="changeType('expense')" id="btn-expense" class="btn-primary" style="flex: 1; background: ${data.type === 'expense' ? 'var(--danger-color)' : 'transparent'}; opacity: ${data.type === 'expense' ? '1' : '0.5'}">Gasto</button>
                        <button onclick="changeType('income')" id="btn-income" class="btn-primary" style="flex: 1; background: ${data.type === 'income' ? 'var(--success-color)' : 'transparent'}; opacity: ${data.type === 'income' ? '1' : '0.5'}">Ingreso</button>
                    </div>
                `;

                stepContainer.innerHTML += typeToggle;

                if (data.type === 'expense') {
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
                    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
                    grid.style.gap = '1rem';

                    let sectorHtml = '';
                    sectors.forEach(s => {
                        const isFullWidth = s === 'Otros';
                        sectorHtml += `
                            <div onclick="selectSector('${s}')" style="
                                background: rgba(255,255,255,0.05); 
                                padding: 1.5rem; 
                                border-radius: 16px; 
                                text-align: center; 
                                cursor: pointer; 
                                border: 1px solid ${data.sector === s ? 'var(--accent-color)' : 'transparent'};
                                transition: all 0.2s;
                                ${isFullWidth ? 'grid-column: span 2;' : ''}">
                                <i data-lucide="${App.getSectorIcon(s)}" style="margin-bottom: 0.5rem;"></i>
                                <div style="font-size: 0.9rem;">${s}</div>
                            </div>
                        `;
                    });
                    stepContainer.innerHTML += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">${sectorHtml}</div>`;
                }

            } else if (step === 2) {
                // Step 2: Method (Card, Cash, Bizum)
                const methods = [
                    { id: 'card', label: 'Tarjeta', icon: 'credit-card' },
                    { id: 'cash', label: 'Efectivo', icon: 'banknote' },
                    { id: 'bizum', label: 'Bizum', icon: 'smartphone' }
                ];

                let methodHtml = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
                methods.forEach(m => {
                    methodHtml += `
                        <button onclick="selectMethod('${m.id}')" class="btn-primary" style="
                            justify-content: flex-start; 
                            background: ${data.method === m.id ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)'}; 
                            border: 1px solid var(--glass-border);">
                            <i data-lucide="${m.icon}"></i> ${m.label}
                        </button>
                    `;
                });
                methodHtml += '</div>';

                stepContainer.innerHTML += methodHtml;
                stepContainer.innerHTML += `
                    <button onclick="prevStep()" style="background: transparent; border: none; color: var(--text-secondary); width: 100%; margin-top: 1rem; cursor: pointer;">Volver</button>
                `;

            } else if (step === 3) {
                // Step 3: Concept (Optional/Required)
                const isRequired = data.type === 'income';
                stepContainer.innerHTML += `
                    <div class="form-group">
                        <label class="form-label">Concepto ${isRequired ? '(Obligatorio)' : '(Opcional)'}</label>
                        <input type="text" id="input-concept" class="form-input" placeholder="${isRequired ? 'Ej: Nómina' : 'Ej: Cena con amigos'}" value="${data.concept}" autofocus>
                    </div>
                     <div class="form-group">
                        <label class="form-label">Fecha</label>
                        <input type="date" id="input-date" class="form-input" value="${data.date}">
                    </div>

                    <button onclick="nextStep()" class="btn-primary" style="margin-top: 2rem;">Siguiente <i data-lucide="arrow-right"></i></button>
                    <button onclick="prevStep()" style="background: transparent; border: none; color: var(--text-secondary); width: 100%; margin-top: 1rem; cursor: pointer;">Volver</button>
                `;

            } else if (step === 4) {
                // Step 4: Amount
                stepContainer.innerHTML += `
                    <div class="form-group">
                        <label class="form-label">Importe (€)</label>
                        <input type="number" id="input-amount" class="form-input" placeholder="0.00" value="${data.amount}" style="font-size: 2.5rem; font-weight: 700; text-align: center; height: 80px;" autofocus>
                    </div>
                    
                    <button onclick="submitTransaction()" class="btn-primary" style="margin-top: 2rem; background: var(--success-color); height: 60px; font-size: 1.2rem;">GUARDAR <i data-lucide="check-circle"></i></button>
                    <button onclick="prevStep()" style="background: transparent; border: none; color: var(--text-secondary); width: 100%; margin-top: 1rem; cursor: pointer;">Volver</button>
                `;
            }

            container.appendChild(stepContainer);
            lucide.createIcons();

            // Bind global input handlers
            window.selectSector = (s) => { data.sector = s; step++; renderStep(); };
            window.selectMethod = (m) => { data.method = m; step++; renderStep(); };
            window.changeType = (t) => {
                data.type = t;
                if (t === 'income') {
                    data.sector = 'Ingreso';
                    data.method = 'cash'; // Default method
                    step = 3;
                }
                renderStep();
            };
            window.nextStep = () => {
                const concept = document.getElementById('input-concept');
                const dateInput = document.getElementById('input-date');

                if (dateInput) data.date = dateInput.value;

                // Validation
                if (data.type === 'income') {
                    if (concept && concept.value.trim() !== '') {
                        data.concept = concept.value;
                        step++;
                        renderStep();
                    } else {
                        concept.style.borderColor = 'var(--danger-color)';
                        concept.placeholder = '¡Concepto obligatorio!';
                    }
                } else {
                    // For expense, optional
                    if (concept) data.concept = concept.value;
                    step++;
                    renderStep();
                }
            };
            window.prevStep = () => {
                if (step === 3 && data.type === 'income') {
                    step = 1;
                    data.type = 'expense'; // Reset to default
                } else {
                    step--;
                }
                renderStep();
            };

            window.submitTransaction = () => {
                const amount = document.getElementById('input-amount').value;
                if (!amount) return;

                data.amount = parseFloat(amount);
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
                const payload = JSON.stringify(data);

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
            'Ingreso': 'wallet',
            'Salud': 'heart-pulse',
            'Casa': 'home'
        };
        return map[sector] || 'circle';
    }
};

// Start
document.addEventListener('DOMContentLoaded', App.init);
