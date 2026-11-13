(() => {
    const state = {
        mode: 'one',
        plot: { one: 'histogram', two: 'scatterplot', categorical: 'mosaic' },
        rows: { one: [['']], two: [['', '']] },
        stems: 'single',
        categories: {
            orientation: 'response-rows',
            view: 'one',
            variableName: 'Category',
            one: {
                categories: ['Category A', 'Category B', 'Category C'],
                counts: ['', '', '']
            },
            rows: ['Yes', 'No'],
            columns: ['Group A', 'Group B'],
            counts: [['', ''], ['', '']],
            barMode: 'counts'
        },
        dock: null
    };
    const plots = {
        one: [['histogram', 'Histogram'], ['dotplot', 'Dotplot'], ['boxplot', 'Boxplot'], ['stemplot', 'Stemplot']],
        two: [['scatterplot', 'Scatterplot'], ['residual', 'Residual Plot'], ['residual-dotplot', 'Residual Dotplot']],
        categorical: [
            ['bar', 'Bar Chart'],
            ['segmented', 'Segmented Bar'],
            ['mosaic', 'Mosaic Plot'],
            ['pie', 'Pie Chart']
        ]
    };
    const ns = 'http://www.w3.org/2000/svg';
    const colors = { green: '#1E4D3B', brown: '#936037', cream: '#FAF8F3' };
    const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    const element = id => document.getElementById(id);
    const format = value => value === null || !Number.isFinite(value) ? '—' : Number(value.toPrecision(5)).toString();
    const varName = (mode, variable) => element(`stats-var-${variable}-${mode === 'one' ? '1var' : '2var'}`).value.trim() || variable.toUpperCase();
    const storageKey = 'qederam_stats_state';
    const nameIds = ['stats-var-x-1var', 'stats-var-x-2var', 'stats-var-y-2var'];
    let savedNotation = 'ab';
    let maximizedFrom = null;

    function storageError(message, error) {
        console.error(message, error);
        const notice = element('stats-storage-error');
        notice.hidden = false;
        notice.textContent = message;
    }

    function saveStatsState() {
        const notation = window.getActiveLsrlNotation?.() || savedNotation;
        const payload = {
            rows: state.rows, categories: state.categories, mode: state.mode,
            plot: state.plot, stems: state.stems, notation,
            names: Object.fromEntries(nameIds.map(id => [id, element(id).value]))
        };
        try {
            localStorage.setItem(storageKey, JSON.stringify(payload));
            element('stats-storage-error').hidden = true;
            return true;
        } catch (error) {
            storageError('Unable to save Stats & Graphing data in this browser.', error);
            return false;
        }
    }

    function hydrateStatsState() {
        let payload;
        try {
            const stored = localStorage.getItem(storageKey);
            if (!stored) {
                savedNotation = localStorage.getItem('lsrl_notation') === 'b0b1' ? 'b0b1' : 'ab';
                return;
            }
            payload = JSON.parse(stored);
        } catch (error) {
            storageError('Unable to read saved Stats & Graphing data.', error);
            return;
        }
        const validRows = (rows, length) => Array.isArray(rows) && rows.length > 0
            && rows.every(row => Array.isArray(row) && row.length === length && row.every(value => typeof value === 'string'));
        const categories = payload?.categories;
        const validCategories = categories && Array.isArray(categories.rows) && categories.rows.length > 0
            && categories.rows.every(value => typeof value === 'string')
            && Array.isArray(categories.columns) && categories.columns.length > 0
            && categories.columns.every(value => typeof value === 'string')
            && Array.isArray(categories.counts) && categories.counts.length === categories.rows.length
            && validRows(categories.counts, categories.columns.length)
            && (!categories.one || (
                Array.isArray(categories.one.categories) && categories.one.categories.length > 0
                && categories.one.categories.every(value => typeof value === 'string')
                && Array.isArray(categories.one.counts)
                && categories.one.counts.length === categories.one.categories.length
                && categories.one.counts.every(value => typeof value === 'string')
            ));
        if (!payload || !validRows(payload.rows?.one, 1) || !validRows(payload.rows?.two, 2)
            || !validCategories || !payload.names || !nameIds.every(id => typeof payload.names[id] === 'string')) {
            storageError('Saved Stats & Graphing data has an invalid format and was not loaded.', new Error('Invalid saved state'));
            return;
        }
        state.rows = payload.rows;
        state.categories = {
            ...categories,
            orientation: 'response-rows',
            view: categories.view === 'one' ? 'one' : 'two',
            variableName: typeof categories.variableName === 'string'
                ? categories.variableName : 'Category',
            one: categories.one || {
                categories: ['Category A', 'Category B', 'Category C'],
                counts: ['', '', '']
            },
            barMode: categories.barMode === 'percent' ? 'percent' : 'counts'
        };
        if (categories.orientation !== 'response-rows') {
            state.categories.rows = categories.columns;
            state.categories.columns = categories.rows;
            state.categories.counts = categories.columns.map((_, column) =>
                categories.rows.map((__, row) => categories.counts[row][column])
            );
        }
        if (Object.hasOwn(plots, payload.mode) || payload.mode === 'inference') state.mode = payload.mode;
        for (const mode of ['one', 'two', 'categorical']) {
            if (plots[mode].some(([id]) => id === payload.plot?.[mode])) state.plot[mode] = payload.plot[mode];
        }
        if (payload.stems === 'split') state.stems = 'split';
        savedNotation = payload.notation === 'b0b1' ? 'b0b1' : 'ab';
        nameIds.forEach(id => { element(id).value = payload.names[id]; });
    }

    function svg(tag, attributes = {}, text = '') {
        const node = document.createElementNS(ns, tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        if (text) node.textContent = text;
        element('stats-plot').appendChild(node);
        return node;
    }

    function median(values) {
        const middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }

    function summary(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const ss = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
        const middle = Math.floor(n / 2);
        const q1 = n > 1 ? median(sorted.slice(0, middle)) : null;
        const q3 = n > 1 ? median(sorted.slice(Math.ceil(n / 2))) : null;
        return { n, mean, ss, sd: n > 1 ? Math.sqrt(ss / (n - 1)) : null,
            min: sorted[0], max: sorted[n - 1], median: median(sorted),
            q1, q3, iqr: q1 === null ? null : q3 - q1, sorted };
    }

    function renderRows() {
        const tbody = element('stats-data-rows');
        tbody.replaceChildren();
        element('stats-y-heading').hidden = state.mode === 'one';
        state.rows[state.mode].forEach((values, rowIndex) => {
            const row = document.createElement('tr');
            values.forEach((value, column) => {
                const cell = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'decimal';
                input.value = value;
                input.setAttribute('aria-label', `${column ? 'Y' : 'X'} row ${rowIndex + 1}`);
                input.addEventListener('input', () => {
                    state.rows[state.mode][rowIndex][column] = input.value;
                    if (input.value.trim() && rowIndex === state.rows[state.mode].length - 1) {
                        state.rows[state.mode].push(state.mode === 'one' ? [''] : ['', '']);
                        const start = input.selectionStart, end = input.selectionEnd;
                        renderRows();
                        const replacement = tbody.rows[rowIndex].querySelectorAll('input')[column];
                        replacement.focus();
                        replacement.setSelectionRange(start, end);
                    }
                    update();
                });
                input.addEventListener('keydown', event => {
                    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
                    event.preventDefault();
                    const target = rowIndex + (event.key === 'ArrowUp' ? -1 : 1);
                    if (target < 0) return;
                    if (target === state.rows[state.mode].length) {
                        state.rows[state.mode].push(state.mode === 'one' ? [''] : ['', '']);
                        renderRows();
                    }
                    tbody.rows[target].querySelectorAll('input')[column].focus();
                });
                cell.appendChild(input);
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });
    }

    function setMode(mode) {
        state.mode = mode;
        const categorical = mode === 'categorical';
        const inference = mode === 'inference';
        element('stats-panel-inference').hidden = !inference;
        if (inference) element('inf-results-container').replaceChildren();
        element('stats-categorical').hidden = !categorical;
        document.querySelector('.stats-top-split').hidden = categorical || inference;
        element('stats-var-x-1var').hidden = mode !== 'one';
        element('stats-var-x-2var').hidden = mode !== 'two';
        element('stats-mode-tabs').querySelectorAll('button').forEach(button => {
            button.classList.toggle('active', button.dataset.mode === mode);
        });
        const tabs = element('stats-plot-tabs');
        tabs.replaceChildren();
        (plots[mode] || []).forEach(([id, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.classList.toggle('active', id === state.plot[mode]);
            button.addEventListener('click', () => {
                state.plot[mode] = id;
                setMode(mode);
                saveStatsState();
            });
            tabs.appendChild(button);
        });
        if (categorical) renderCategories();
        else if (!inference) renderRows();
        update();
    }

    const inference = {
        source: 'stats',
        groups: ['Group 1', 'Group 2'],
        gof: [['', ''], ['', ''], ['', '']],
        categories: ['Category 1', 'Category 2', 'Category 3'],
        table: [['', ''], ['', '']],
        rows: ['Row 1', 'Row 2'],
        columns: ['Column 1', 'Column 2'],
        corners: { chisq_ind: 'Variable', chisq_hom: 'Group / Response' }
    };

    function logGamma(z) {
        const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531,
            -176.6150291621406, 12.507343278686905, -0.13857109526572012,
            9.984369578019572e-6, 1.5056327351493116e-7];
        if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
        z -= 1;
        let x = 0.9999999999998099;
        c.forEach((value, i) => { x += value / (z + i + 1); });
        const t = z + c.length - 0.5;
        return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
    }

    function betaFraction(a, b, x) {
        const tiny = 1e-300;
        let c = 1, d = 1 - (a + b) * x / (a + 1);
        if (Math.abs(d) < tiny) d = tiny;
        d = 1 / d;
        let h = d;
        for (let m = 1; m <= 10000; m++) {
            const m2 = 2 * m;
            let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));
            d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
            c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
            d = 1 / d; h *= d * c;
            aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
            d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
            c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
            d = 1 / d;
            const delta = d * c;
            h *= delta;
            if (Math.abs(delta - 1) < 1e-14) return h;
        }
        throw new Error('The beta function did not converge.');
    }

    function betaCDF(x, a, b) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)
            + a * Math.log(x) + b * Math.log1p(-x));
        return x < (a + 1) / (a + b + 2)
            ? factor * betaFraction(a, b, x) / a
            : 1 - factor * betaFraction(b, a, 1 - x) / b;
    }

    function gammaUpper(a, x) {
        if (x <= 0) return 1;
        if (x === Infinity) return 0;
        const factor = Math.exp(-x + a * Math.log(x) - logGamma(a));
        if (x < a + 1) {
            let term = 1 / a, sum = term;
            for (let i = 1; i <= 10000; i++) {
                term *= x / (a + i);
                sum += term;
                if (Math.abs(term) < Math.abs(sum) * 1e-14) return Math.max(0, 1 - sum * factor);
            }
        } else {
            const tiny = 1e-300;
            let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
            for (let i = 1; i <= 10000; i++) {
                const an = -i * (i - a);
                b += 2;
                d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
                c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
                d = 1 / d;
                const delta = d * c;
                h *= delta;
                if (Math.abs(delta - 1) < 1e-14) return Math.min(1, factor * h);
            }
        }
        throw new Error('The gamma function did not converge.');
    }

    function normalCDF(x) {
        if (x === 0) return 0.5;
        const tail = gammaUpper(0.5, x * x / 2) / 2;
        return x < 0 ? tail : 1 - tail;
    }

    function tCDF(x, df) {
        if (x === 0) return 0.5;
        const tail = betaCDF(df / (df + x * x), df / 2, 0.5) / 2;
        return x < 0 ? tail : 1 - tail;
    }

    function inverseCDF(p, cdf) {
        if (p === 0) return -Infinity;
        if (p === 1) return Infinity;
        if (p > 0.5) return -inverseCDF(1 - p, cdf);
        let low = -1, high = 1;
        while (cdf(low) > p && low > -1e15) low *= 2;
        while (cdf(high) < p && high < 1e15) high *= 2;
        if (cdf(low) > p || cdf(high) < p) throw new Error('Quantile is outside the supported numeric range.');
        for (let i = 0; i < 160; i++) {
            const mid = (low + high) / 2;
            if (cdf(mid) < p) low = mid; else high = mid;
        }
        return (low + high) / 2;
    }

    function infNumber(value) {
        if (value === Infinity) return '∞';
        if (value === -Infinity) return '−∞';
        return Number.isFinite(value) ? Number(value.toPrecision(9)).toString() : 'undefined';
    }

    function infField(id, label, value = '') {
        return `<label for="inf-${id}">${label}<input id="inf-${id}" type="number" step="any" value="${value}"></label>`;
    }

    function infEscape(value) {
        return String(value).replace(/[&<>"']/g, char =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function infSelect(id, label, options) {
        return `<label for="inf-${id}">${label}<select id="inf-${id}">${options.map(([value, name]) =>
            `<option value="${value}">${name}</option>`).join('')}</select></label>`;
    }

    function renderInference() {
        const procedure = element('inf-procedure').value;
        const container = element('inf-inputs-container');
        const mean = procedure.includes('samp_t');
        const regression = procedure.startsWith('linreg');
        const two = procedure.startsWith('2');
        const interval = procedure.endsWith('_int');
        const test = procedure.endsWith('_test');
        const groupFields = two
            ? `<div class="inf-fields inf-group-labels">${inference.groups.map((name, i) =>
                `<label>Group ${i + 1} Label<input id="inf-group${i + 1}" type="text" value="${infEscape(name)}"></label>`).join('')}</div>`
            : '';
        const groupHeader = index => `<strong class="inf-group-header" data-group="${index}">${infEscape(inference.groups[index])}</strong>`;
        let fields = '';
        if (mean || regression) {
            fields += infSelect('source', 'Input source', [['stats', 'Stats'], ['data', 'Data']]);
            if (inference.source === 'stats') {
                if (regression) fields += infField('b', 'Slope b') + infField('se', 'SE of slope') + infField('n', 'n');
                else {
                    fields += (two ? groupHeader(0) : '') + infField('mean1', two ? 'x̄₁' : 'x̄') + infField('sd1', two ? 's₁' : 's') + infField('n1', two ? 'n₁' : 'n');
                    if (two) fields += groupHeader(1) + infField('mean2', 'x̄₂') + infField('sd2', 's₂') + infField('n2', 'n₂');
                }
            }
            if (mean && two) fields += infSelect('pooled', 'Pooled', [['no', 'No (Welch)'], ['yes', 'Yes']]);
        } else if (procedure.includes('prop')) {
            fields += (two ? groupHeader(0) : '') + infField('x1', two ? 'x₁' : 'x') + infField('n1', two ? 'n₁' : 'n');
            if (two) fields += groupHeader(1) + infField('x2', 'x₂') + infField('n2', 'n₂');
            if (test && !two) fields += infField('null', 'p₀', '0.5');
        }
        if (interval) fields += infField('level', 'C-Level', '0.95');
        if (test) {
            if (mean && !two) fields += infField('null', 'μ₀', '0');
            fields += infSelect('alternative', 'Hₐ', [['ne', '≠'], ['lt', '<'], ['gt', '>']]);
        }
        if (procedure.startsWith('dist_')) {
            const continuous = procedure === 'dist_normal' || procedure === 'dist_t';
            fields += infSelect('operation', 'Operation', continuous
                ? [['cdf', 'CDF (between bounds)'], ['inverse', 'Inverse (left area)']]
                : [['pmf', 'PMF (exactly x)'], ['cdf', 'CDF (at most x)']]);
            if (procedure === 'dist_normal') fields += infField('mean', 'Mean μ', '0') + infField('sd', 'Standard deviation σ', '1');
            if (procedure === 'dist_t') fields += infField('df', 'df', '10');
            if (procedure === 'dist_binom') fields += infField('n', 'Trials n', '10');
            if (!continuous) fields += infField('p', 'Success probability p', '0.5') + infField('x', 'x', '0');
            else fields += '<div id="inf-dist-bounds"></div>';
        }
        if (procedure === 'chisq_gof') {
            fields += infSelect('expected-mode', 'Expected values', [['counts', 'Expected counts'], ['proportions', 'Expected proportions']]);
        }
        container.innerHTML = `${groupFields}<div class="inf-fields">${fields}</div><div id="inf-data-summary"></div><div id="inf-table"></div>`;
        if (two) {
            inference.groups.forEach((_, i) => {
                element(`inf-group${i + 1}`).addEventListener('input', event => {
                    inference.groups[i] = event.target.value;
                    container.querySelectorAll(`.inf-group-header[data-group="${i}"]`).forEach(node => { node.textContent = event.target.value; });
                    element('inf-results-container').querySelectorAll(`[data-result-group="${i}"]`).forEach(node => {
                        node.textContent = `${node.dataset.symbol} (${event.target.value})`;
                    });
                    refreshInferenceData();
                });
            });
        }
        if (test && (two || regression)) {
            const note = document.createElement('div');
            note.textContent = regression ? 'H₀: slope = 0' : procedure.includes('prop') ? 'H₀: p₁ − p₂ = 0' : 'H₀: μ₁ − μ₂ = 0';
            container.appendChild(note);
        }
        if (mean || regression) {
            element('inf-source').value = inference.source;
            element('inf-source').addEventListener('change', event => {
                inference.source = event.target.value;
                renderInference();
            });
        }
        if (procedure.startsWith('dist_') && (procedure === 'dist_normal' || procedure === 'dist_t')) {
            const renderBounds = () => {
                element('inf-dist-bounds').innerHTML = element('inf-operation').value === 'cdf'
                    ? infField('lower', 'Lower bound (blank = −∞)') + infField('upper', 'Upper bound (blank = ∞)')
                    : infField('area', 'Left-tail area', '0.95');
            };
            element('inf-operation').addEventListener('change', renderBounds);
            renderBounds();
        }
        if (procedure.startsWith('chisq_')) renderInferenceTable();
        refreshInferenceData();
        element('inf-error').textContent = '';
        element('inf-results-container').replaceChildren();
    }

    function renderInferenceTable() {
        const procedure = element('inf-procedure').value;
        const gof = procedure === 'chisq_gof';
        const data = gof ? inference.gof : inference.table;
        const container = element('inf-table');
        const heading = gof ? '<th>Category</th><th>Observed</th><th>Expected / proportion</th>'
            : `<th><input type="text" class="inf-corner" aria-label="Row Var / Col Var"></th>${data[0].map((_, i) =>
                `<th><input type="text" class="inf-column-name" aria-label="Column ${i + 1} label"></th>`).join('')}`;
        container.innerHTML = `<div class="inf-table-wrap"><table class="inf-table"><thead><tr>${heading}</tr></thead><tbody>${
            data.map((row, r) => `<tr><th><input type="text" class="inf-row-name" aria-label="${gof ? 'Category' : 'Row'} ${r + 1} label"></th>${row.map((value, c) =>
                `<td><input type="number" step="any" aria-label="${gof ? (c ? 'Expected' : 'Observed') : `Row ${r + 1} column ${c + 1}`}"></td>`).join('')}</tr>`).join('')
        }</tbody></table></div><div class="inf-actions"></div><div id="inf-expected-preview"></div>`;
        const updateLabels = () => {
            previewExpected();
            const results = element('inf-results-container');
            results.querySelectorAll('[data-matrix-row]').forEach(node => {
                const index = Number(node.dataset.matrixRow);
                node.textContent = gof ? inference.categories[index] : inference.rows[index];
            });
            results.querySelectorAll('[data-matrix-col]').forEach(node => {
                node.textContent = inference.columns[Number(node.dataset.matrixCol)];
            });
            results.querySelectorAll('[data-matrix-corner]').forEach(node => { node.textContent = inference.corners[procedure]; });
        };
        if (!gof) {
            const corner = container.querySelector('.inf-corner');
            corner.value = inference.corners[procedure];
            corner.addEventListener('input', () => { inference.corners[procedure] = corner.value; updateLabels(); });
            container.querySelectorAll('.inf-column-name').forEach((input, i) => {
                input.value = inference.columns[i];
                input.addEventListener('input', () => { inference.columns[i] = input.value; updateLabels(); });
            });
        }
        container.querySelectorAll('tbody tr').forEach((row, r) => {
            const name = row.querySelector('.inf-row-name');
            name.value = gof ? inference.categories[r] : inference.rows[r];
            name.addEventListener('input', () => {
                (gof ? inference.categories : inference.rows)[r] = name.value;
                updateLabels();
            });
            row.querySelectorAll('td input').forEach((input, c) => {
                input.value = data[r][c];
                input.addEventListener('input', () => {
                    data[r][c] = input.value;
                    element('inf-results-container').replaceChildren();
                    element('inf-error').textContent = '';
                    previewExpected();
                });
            });
        });
        const actions = container.querySelector('.inf-actions');
        const addButton = (text, action) => {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'btn-secondary'; button.textContent = text;
            button.addEventListener('click', () => { action(); renderInferenceTable(); element('inf-results-container').replaceChildren(); });
            actions.appendChild(button);
        };
        if (gof) {
            addButton('+ Category', () => { data.push(['', '']); inference.categories.push(`Category ${data.length}`); });
            addButton('- Category', () => { if (data.length > 2) { data.pop(); inference.categories.pop(); } });
        } else {
            addButton('+ Row', () => { data.push(data[0].map(() => '')); inference.rows.push(`Row ${data.length}`); });
            addButton('- Row', () => { if (data.length > 2) { data.pop(); inference.rows.pop(); } });
            addButton('+ Col', () => { data.forEach(row => row.push('')); inference.columns.push(`Column ${data[0].length}`); });
            addButton('- Col', () => { if (data[0].length > 2) { data.forEach(row => row.pop()); inference.columns.pop(); } });
        }
        previewExpected();
    }

    function contingencyExpected(data) {
        const rows = data.map(row => row.reduce((a, b) => a + b, 0));
        const columns = data[0].map((_, c) => data.reduce((sum, row) => sum + row[c], 0));
        const total = rows.reduce((a, b) => a + b, 0);
        if (total <= 0 || rows.some(x => x <= 0) || columns.some(x => x <= 0)) throw new Error('Every row and column must have a positive total.');
        return rows.map(row => columns.map(col => row * col / total));
    }

    function previewExpected() {
        const target = element('inf-expected-preview');
        if (!target || !['chisq_ind', 'chisq_hom'].includes(element('inf-procedure').value)) return;
        const data = inference.table;
        if (data.some(row => row.some(v => !numberPattern.test(v.trim()) || !Number.isFinite(Number(v)) || Number(v) < 0))) {
            target.textContent = 'Enter nonnegative observed counts to see expected counts.';
            return;
        }
        const numbers = data.map(row => row.map(Number));
        const rows = numbers.map(row => row.reduce((a, b) => a + b, 0));
        const columns = numbers[0].map((_, c) => numbers.reduce((sum, row) => sum + row[c], 0));
        const total = rows.reduce((a, b) => a + b, 0);
        if (!total || rows.some(x => !x) || columns.some(x => !x)) {
            target.textContent = 'Every row and column needs a positive total for expected counts.';
            return;
        }
        target.innerHTML = `<strong>Expected counts</strong>${infMatrix(contingencyExpected(numbers), false)}`;
    }

    function infMatrix(matrix, gof) {
        const rows = gof ? matrix[0].map(value => [value]) : matrix;
        const rowNames = gof ? inference.categories : inference.rows;
        const headings = gof ? '<th>Count</th>' : inference.columns.map((name, i) =>
            `<th data-matrix-col="${i}">${infEscape(name)}</th>`).join('');
        const corner = gof ? 'Category' : infEscape(inference.corners[element('inf-procedure').value]);
        const cornerAttr = gof ? '' : ' data-matrix-corner';
        return `<div class="inf-table-wrap"><table class="inf-table"><thead><tr><th${cornerAttr}>${corner}</th>${headings}</tr></thead><tbody>${rows.map((row, i) =>
            `<tr><th data-matrix-row="${i}">${infEscape(rowNames[i])}</th>${row.map(value => `<td>${infNumber(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }

    function inferenceData(mode, paired) {
        const values = state.rows[mode];
        if (paired) {
            const pairs = [];
            for (const row of values) {
                const cells = row.map(v => v.trim());
                if (cells.every(v => !v)) continue;
                if (cells.some(v => !numberPattern.test(v) || !Number.isFinite(Number(v)))) throw new Error('Enter a finite X and Y in every populated regression row.');
                pairs.push(cells.map(Number));
            }
            return pairs;
        }
        return Array.from({ length: mode === 'one' ? 1 : 2 }, (_, column) => {
            const result = [];
            for (const row of values) {
                const value = row[column].trim();
                if (!value) continue;
                if (!numberPattern.test(value) || !Number.isFinite(Number(value))) throw new Error('Data columns must contain finite numbers.');
                result.push(Number(value));
            }
            return result;
        });
    }

    function refreshInferenceData() {
        const target = element('inf-data-summary');
        if (!target || inference.source !== 'data') return;
        const procedure = element('inf-procedure').value;
        if (!procedure.includes('samp_t') && !procedure.startsWith('linreg')) return;
        try {
            const regression = procedure.startsWith('linreg');
            const mode = procedure.startsWith('1samp') ? 'one' : 'two';
            const data = inferenceData(mode, regression);
            const columns = regression ? [data.map(row => row[0]), data.map(row => row[1])] : data;
            const text = columns.map((values, i) => {
                const label = !regression && mode === 'two' ? `${inference.groups[i]} (${i ? 'Y' : 'X'})` : (i ? 'Y' : 'X');
                if (!values.length) return `${label}: no data`;
                const s = summary(values);
                return `${label}: n = ${s.n}, x̄ = ${infNumber(s.mean)}, s = ${s.sd === null ? '—' : infNumber(s.sd)}`;
            });
            target.textContent = `${regression ? 'Paired 2-variable data' : mode === 'two' ? 'Independent samples from 2-variable X and Y' : '1-variable X'} — ${text.join('; ')}`;
        } catch (error) {
            target.textContent = error.message;
        }
    }

    function infValue(id, label, options = {}) {
        const input = element(`inf-${id}`);
        const raw = input.value.trim();
        if (!raw && options.blank !== undefined) return options.blank;
        if (!raw || !numberPattern.test(raw) || !Number.isFinite(Number(raw))) throw new Error(`Enter a finite number for ${label}.`);
        const value = Number(raw);
        if (options.integer && !Number.isSafeInteger(value)) throw new Error(`${label} must be a whole number.`);
        if (options.min !== undefined && value < options.min) throw new Error(`${label} must be at least ${options.min}.`);
        if (options.max !== undefined && value > options.max) throw new Error(`${label} must be at most ${options.max}.`);
        if (options.positive && value <= 0) throw new Error(`${label} must be positive.`);
        if (options.unit && (value <= 0 || value >= 1)) throw new Error(`${label} must be between 0 and 1, exclusive.`);
        return value;
    }

    function infSample(index) {
        const mean = infValue(`mean${index}`, `x̄${index}`);
        const sd = infValue(`sd${index}`, `s${index}`, { min: 0 });
        const n = infValue(`n${index}`, `n${index}`, { integer: true, min: 2 });
        return { mean, sd, n };
    }

    function infSamples(two) {
        if (inference.source === 'stats') return two ? [infSample(1), infSample(2)] : [infSample(1)];
        return inferenceData(two ? 'two' : 'one', false).map(values => {
            if (values.length < 2) throw new Error('Each sample needs at least two data values.');
            return summary(values);
        });
    }

    function infRegression() {
        if (inference.source === 'stats') return {
            b: infValue('b', 'slope b'), se: infValue('se', 'SE of slope', { min: 0 }),
            n: infValue('n', 'n', { integer: true, min: 3 })
        };
        const pairs = inferenceData('two', true);
        if (pairs.length < 3) throw new Error('Regression needs at least three paired observations.');
        const x = summary(pairs.map(row => row[0])), y = summary(pairs.map(row => row[1]));
        if (!(x.ss > 0) || !Number.isFinite(x.ss) || !Number.isFinite(y.ss)) throw new Error('Regression requires varying X and finite statistics.');
        const b = pairs.reduce((sum, [a, v]) => sum + (a - x.mean) * (v - y.mean), 0) / x.ss;
        const residual = pairs.reduce((sum, [a, v]) => sum + (v - y.mean - b * (a - x.mean)) ** 2, 0);
        const se = Math.sqrt(residual / (pairs.length - 2) / x.ss);
        if (!Number.isFinite(b) || !Number.isFinite(se)) throw new Error('Regression statistics overflowed.');
        return { b, se, n: pairs.length };
    }

    function infTail(stat, cdf, alternative) {
        if (alternative === 'lt') return cdf(stat);
        if (alternative === 'gt') return cdf(-stat);
        return Math.min(1, 2 * cdf(-Math.abs(stat)));
    }

    function calculateInference() {
        const procedure = element('inf-procedure').value;
        const interval = procedure.endsWith('_int');
        const entries = [];
        let details = '';
        let heading = '';
        const add = (name, value, group = null) => entries.push([name, value, group]);
        if (procedure.includes('prop') || procedure.includes('samp_t') || procedure.startsWith('linreg')) {
            const two = procedure.startsWith('2');
            let estimate, se, df, nullValue = 0, cdf = normalCDF;
            if (procedure.includes('prop')) {
                const sample = i => {
                    const n = infValue(`n${i}`, `n${i}`, { integer: true, min: 1 });
                    const x = infValue(`x${i}`, `x${i}`, { integer: true, min: 0, max: n });
                    return { x, n, p: x / n };
                };
                const a = sample(1), b = two ? sample(2) : null;
                estimate = a.p - (b ? b.p : 0);
                add('p̂', a.p, two ? 0 : null);
                if (b) add('p̂', b.p, 1);
                if (interval) se = Math.sqrt(a.p * (1 - a.p) / a.n + (b ? b.p * (1 - b.p) / b.n : 0));
                else if (b) {
                    const pooled = (a.x + b.x) / (a.n + b.n);
                    add('Pooled p̂c', pooled);
                    se = Math.sqrt(pooled * (1 - pooled) * (1 / a.n + 1 / b.n));
                } else {
                    nullValue = infValue('null', 'p₀', { unit: true });
                    se = Math.sqrt(nullValue * (1 - nullValue) / a.n);
                }
            } else if (procedure.startsWith('linreg')) {
                const reg = infRegression();
                estimate = reg.b; se = reg.se; df = reg.n - 2;
                add('Slope b', estimate);
            } else {
                const samples = infSamples(two), a = samples[0], b = samples[1];
                estimate = a.mean - (b ? b.mean : 0);
                add('x̄', a.mean, two ? 0 : null);
                if (b) add('x̄', b.mean, 1);
                if (!two) {
                    se = a.sd / Math.sqrt(a.n); df = a.n - 1;
                    if (!interval) nullValue = infValue('null', 'μ₀');
                } else if (element('inf-pooled').value === 'yes') {
                    df = a.n + b.n - 2;
                    const variance = ((a.n - 1) * a.sd ** 2 + (b.n - 1) * b.sd ** 2) / df;
                    se = Math.sqrt(variance * (1 / a.n + 1 / b.n));
                } else {
                    const v1 = a.sd ** 2 / a.n, v2 = b.sd ** 2 / b.n;
                    se = Math.sqrt(v1 + v2);
                    df = (v1 + v2) ** 2 / (v1 ** 2 / (a.n - 1) + v2 ** 2 / (b.n - 1));
                }
            }
            if (!Number.isFinite(estimate) || !Number.isFinite(se) || (df !== undefined && (!Number.isFinite(df) || df <= 0))) throw new Error('These inputs do not produce finite inference statistics.');
            if (df !== undefined) cdf = value => tCDF(value, df);
            if (interval) {
                const level = infValue('level', 'C-Level', { unit: true });
                const margin = -inverseCDF((1 - level) / 2, cdf) * se;
                add('Interval', `(${infNumber(estimate - margin)}, ${infNumber(estimate + margin)})`);
                add('Point estimate', estimate); add('Margin of error (E)', margin);
            } else {
                if (!(se > 0)) throw new Error('The standard error must be positive for a hypothesis test.');
                const statistic = (estimate - nullValue) / se;
                add(df === undefined ? 'z' : 't', statistic);
                add('P-value', infTail(statistic, cdf, element('inf-alternative').value));
            }
            add(!interval && procedure.includes('prop') ? 'Standard error (SE₀)' : 'Standard error (SE)', se);
            if (df !== undefined) add('df', df);
        } else if (procedure.startsWith('chisq_')) {
            const gof = procedure === 'chisq_gof';
            const raw = gof ? inference.gof : inference.table;
            const data = raw.map(row => row.map(value => {
                if (!numberPattern.test(value.trim()) || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error('Enter nonnegative finite counts or proportions in every table cell.');
                return Number(value);
            }));
            let observed, expected, df;
            if (gof) {
                observed = [data.map(row => row[0])];
                const given = data.map(row => row[1]);
                const total = observed[0].reduce((a, b) => a + b, 0);
                if (element('inf-expected-mode').value === 'proportions') {
                    if (Math.abs(given.reduce((a, b) => a + b, 0) - 1) > 1e-8) throw new Error('Expected proportions must sum to 1.');
                    expected = [given.map(value => value * total)];
                } else {
                    expected = [given];
                    const expectedTotal = given.reduce((a, b) => a + b, 0);
                    if (Math.abs(expectedTotal - total) > 1e-8 * Math.max(1, total)) throw new Error('Expected and observed counts must have the same total.');
                }
                df = data.length - 1;
            } else {
                observed = data; expected = contingencyExpected(data);
                df = (data.length - 1) * (data[0].length - 1);
            }
            if (expected.some(row => row.some(value => !(value > 0) || !Number.isFinite(value)))) throw new Error('All expected counts must be positive and finite.');
            const contributions = observed.map((row, r) => row.map((value, c) => (value - expected[r][c]) ** 2 / expected[r][c]));
            const chi = contributions.flat().reduce((a, b) => a + b, 0);
            if (!Number.isFinite(chi)) throw new Error('Chi-square statistic overflowed.');
            add('χ²', chi); add('P-value', gammaUpper(df / 2, chi / 2)); add('df', df);
            if (!gof) heading = procedure === 'chisq_ind'
                ? 'Test for Independence: H₀: Variables are independent'
                : 'Test for Homogeneity: H₀: Distributions are identical across groups';
            details = `<details><summary>Expected counts and contributions</summary><strong>Expected counts</strong>${infMatrix(expected, gof)}<strong>(O − E)² / E</strong>${infMatrix(contributions, gof)}</details>`;
        } else {
            const operation = element('inf-operation').value;
            let result;
            if (procedure === 'dist_normal' || procedure === 'dist_t') {
                const normal = procedure === 'dist_normal';
                const mean = normal ? infValue('mean', 'mean') : 0;
                const sd = normal ? infValue('sd', 'standard deviation', { positive: true }) : 1;
                const df = normal ? null : infValue('df', 'df', { positive: true });
                const cdf = normal ? normalCDF : value => tCDF(value, df);
                if (operation === 'inverse') {
                    const area = infValue('area', 'left-tail area', { min: 0, max: 1 });
                    result = mean + sd * inverseCDF(area, cdf);
                } else {
                    const lower = infValue('lower', 'lower bound', { blank: -Infinity });
                    const upper = infValue('upper', 'upper bound', { blank: Infinity });
                    if (lower > upper) throw new Error('Lower bound must not exceed upper bound.');
                    const lo = (lower - mean) / sd, hi = (upper - mean) / sd;
                    result = lo > 0 ? cdf(-lo) - cdf(-hi) : cdf(hi) - cdf(lo);
                }
            } else {
                const p = infValue('p', 'p', { min: 0, max: 1 });
                const x = infValue('x', 'x', { integer: true });
                if (procedure === 'dist_binom') {
                    const n = infValue('n', 'n', { integer: true, min: 0 });
                    if (operation === 'cdf') result = x < 0 ? 0 : x >= n ? 1 : p === 0 ? 1 : p === 1 ? 0 : betaCDF(1 - p, n - x, x + 1);
                    else if (x < 0 || x > n) result = 0;
                    else if (p === 0) result = x === 0 ? 1 : 0;
                    else if (p === 1) result = x === n ? 1 : 0;
                    else result = Math.exp(logGamma(n + 1) - logGamma(x + 1) - logGamma(n - x + 1) + x * Math.log(p) + (n - x) * Math.log1p(-p));
                } else {
                    if (p === 0) throw new Error('Geometric p must be greater than 0.');
                    if (x < 1) result = 0;
                    else if (p === 1) result = operation === 'cdf' || x === 1 ? 1 : 0;
                    else result = operation === 'cdf' ? -Math.expm1(x * Math.log1p(-p)) : Math.exp((x - 1) * Math.log1p(-p)) * p;
                }
            }
            if (Number.isNaN(result) || (operation !== 'inverse' && !Number.isFinite(result))) throw new Error('The result is outside the supported numeric range.');
            add(operation === 'inverse' ? 'Quantile' : 'Probability', result);
        }
        const output = element('inf-results-container');
        output.innerHTML = `${heading ? `<h3>${heading}</h3>` : ''}<div class="inf-results">${entries.map(([label, value, group]) => {
            const groupAttr = group === null ? '' : ` data-result-group="${group}" data-symbol="${infEscape(label)}"`;
            const caption = group === null ? label : `${label} (${inference.groups[group]})`;
            return `<div class="stats-card"><span class="stats-card-label"${groupAttr}>${infEscape(caption)}</span><strong>${infEscape(typeof value === 'number' ? infNumber(value) : value)}</strong></div>`;
        }).join('')}</div>${details}`;
    }

    function initInference() {
        element('inf-procedure').addEventListener('change', renderInference);
        element('inf-inputs-container').addEventListener('input', event => {
            if (event.target.matches('#inf-group1, #inf-group2, .inf-row-name, .inf-column-name, .inf-corner')) return;
            element('inf-error').textContent = '';
            element('inf-results-container').replaceChildren();
        });
        element('inf-calculate').addEventListener('click', () => {
            element('inf-error').textContent = '';
            element('inf-results-container').replaceChildren();
            try {
                calculateInference();
            } catch (error) {
                element('inf-error').textContent = error.message;
            }
        });
        renderInference();
    }

    function computeNiceScale(rawMin, rawMax, targetTicks = 6) {
        if (rawMin === rawMax) {
            const padding = Math.max(1, Math.abs(rawMin) * 0.05);
            rawMin -= padding;
            rawMax += padding;
        }
        const rough = (rawMax - rawMin) / (targetTicks - 1);
        if (!Number.isFinite(rough) || rough === 0) {
            return { min: rawMin, max: rawMax, ticks: [rawMin, rawMax] };
        }
        const magnitude = 10 ** Math.floor(Math.log10(rough));
        if (!magnitude) return { min: rawMin, max: rawMax, ticks: [rawMin, rawMax] };
        const normalized = rough / magnitude;
        const step = ([1, 2, 2.5, 5, 10].find(value => value >= normalized) || 10) * magnitude;
        const first = Math.floor(rawMin / step);
        const last = Math.ceil(rawMax / step);
        if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 20) {
            return { min: rawMin, max: rawMax, ticks: [rawMin, rawMax] };
        }
        const ticks = Array.from({ length: last - first + 1 }, (_, index) =>
            {
                const value = (first + index) * step;
                const rounded = Number(value.toPrecision(12));
                return Math.abs(value - rounded) <= step * 1e-8 ? rounded : value;
            });
        return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
    }

    function scale(min, max, start, end) {
        const nice = computeNiceScale(min, max);
        return { ...nice, at: value => start + (value - nice.min) / (nice.max - nice.min) * (end - start) };
    }

    function axes(x, y, xLabel, yLabel, yTicks = null) {
        svg('line', { x1: 65, y1: 305, x2: 610, y2: 305, stroke: colors.green });
        svg('line', { x1: 65, y1: 305, x2: 65, y2: 25, stroke: colors.green });
        x.ticks.forEach(xv => {
            svg('text', { x: x.at(xv), y: 323, 'text-anchor': 'middle' }, String(xv));
        });
        const ticks = yTicks || y.ticks;
        ticks.forEach(value => {
            svg('line', { x1: 60, x2: 65, y1: y.at(value), y2: y.at(value), stroke: colors.green });
            svg('text', { x: 58, y: y.at(value) + 4, 'text-anchor': 'end' }, String(value));
        });
        svg('text', { x: 330, y: 347, 'text-anchor': 'middle' }, xLabel);
        svg('text', { x: 14, y: 165, transform: 'rotate(-90 14 165)', 'text-anchor': 'middle' }, yLabel);
    }

    function dotplot(values, label) {
        const x = scale(Math.min(...values), Math.max(...values), 65, 610);
        const stacks = new Map();
        const counts = values.map(value => {
            const count = (stacks.get(value) || 0) + 1;
            stacks.set(value, count);
            return count;
        });
        const maxCount = Math.max(1, ...counts);
        const axisY = 305;
        const radius = Math.max(0.5, Math.min(5, (axisY - 25 - 2 - 3 * (maxCount - 1)) / (2 * maxCount - 1)));
        const spacing = Math.min(radius * 2 + 3, (axisY - 25 - radius - 2) / Math.max(1, maxCount - 1));
        svg('line', { x1: 65, y1: axisY, x2: 610, y2: axisY, stroke: colors.green });
        x.ticks.forEach(value => {
            svg('line', { x1: x.at(value), x2: x.at(value), y1: axisY, y2: axisY + 5, stroke: colors.green });
            svg('text', { x: x.at(value), y: 323, 'text-anchor': 'middle' }, String(value));
        });
        svg('text', { x: 330, y: 347, 'text-anchor': 'middle' }, label);
        values.forEach((value, index) => svg('circle', {
            cx: x.at(value), cy: axisY - radius - 2 - (counts[index] - 1) * spacing, r: radius, fill: colors.brown
        }));
    }

    function drawStemplot(values, name) {
        const raw = state.rows.one.map(row => row[0].trim()).filter(Boolean);
        const decimals = Math.max(0, ...raw.map(value => {
            const [mantissa, exponent = '0'] = value.toLowerCase().split('e');
            return Math.max(0, (mantissa.split('.')[1] || '').length - Number(exponent));
        }));
        let unit = decimals ? 10 ** -decimals : 1;
        if (!decimals && Math.max(...values.map(Math.abs)) >= 100 && values.every(value => value % 10 === 0)) unit = 10;
        const scaled = values.map(value => Math.round(Math.abs(value) / unit));
        if (!Number.isFinite(unit) || unit === 0 || scaled.some(value => !Number.isSafeInteger(value))) {
            element('stats-error').textContent = 'Values have too much precision or are too large for a stem-and-leaf plot.';
            return;
        }
        const groups = new Map();
        values.forEach((value, index) => {
            const magnitude = scaled[index];
            const stem = Math.floor(magnitude / 10);
            const negative = value < 0;
            const key = `${negative ? '-' : ''}${stem}`;
            if (!groups.has(key)) groups.set(key, { negative, leaves: [[], []] });
            const leaf = magnitude % 10;
            groups.get(key).leaves[leaf >= 5 ? 1 : 0].push(leaf);
        });
        const container = element('stats-stemplot');
        const title = document.createElement('strong');
        title.textContent = `Stem-and-leaf plot: ${name}`;
        container.appendChild(title);
        const diagram = document.createElement('div');
        diagram.className = 'stem-diagram';
        for (const [stem, group] of groups) {
            const halves = state.stems === 'split' ? (group.negative ? [1, 0] : [0, 1]) : [null];
            for (const half of halves) {
                const row = document.createElement('div');
                row.className = 'stem-row';
                const stemCell = document.createElement('span');
                stemCell.className = 'stem-value';
                stemCell.textContent = stem;
                const leaves = document.createElement('span');
                leaves.className = 'stem-leaves';
                leaves.textContent = (half === null ? group.leaves.flat().sort((a, b) => group.negative ? b - a : a - b) : group.leaves[half]).join(' ');
                row.append(stemCell, leaves);
                diagram.appendChild(row);
            }
        }
        container.appendChild(diagram);
        const example = values[0];
        const first = scaled[0];
        const key = document.createElement('div');
        key.className = 'stem-key';
        key.textContent = `Key: ${example < 0 ? '-' : ''}${Math.floor(first / 10)} | ${first % 10} = ${example} (leaf unit: ${unit})`;
        container.appendChild(key);
    }

    function renderCategories() {
        const data = state.categories;
        const oneVariable = data.view === 'one';
        element('stats-remove-row').disabled = data.rows.length <= 2;
        element('stats-remove-col').disabled = data.columns.length <= 2;
        element('stats-cat-one-panel').hidden = !oneVariable;
        element('stats-cat-two-panel').hidden = oneVariable;
        element('stats-cat-mode-tabs').querySelectorAll('button').forEach(button => {
            button.classList.toggle('active', button.dataset.catView === data.view);
        });

        const makeInput = (value, label, onInput, numeric = false) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            if (numeric) input.inputMode = 'numeric';
            input.setAttribute('aria-label', label);
            input.addEventListener('input', () => { onInput(input.value); update(); });
            return input;
        };

        if (oneVariable) {
            element('stats-cat-variable-name').value = data.variableName;
            const body = element('stats-cat-one-table').tBodies[0];
            body.replaceChildren();
            data.one.categories.forEach((name, index) => {
                const row = body.insertRow();
                const categoryCell = row.insertCell();
                categoryCell.appendChild(makeInput(
                    name,
                    `Category ${index + 1} name`,
                    value => { data.one.categories[index] = value; }
                ));
                const countCell = row.insertCell();
                countCell.appendChild(makeInput(
                    data.one.counts[index],
                    `Count for category ${index + 1}`,
                    value => { data.one.counts[index] = value; },
                    true
                ));
                const actionCell = row.insertCell();
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'stats-cat-remove-row';
                remove.textContent = '×';
                remove.title = `Remove ${name || `category ${index + 1}`}`;
                remove.setAttribute('aria-label', `Remove category ${index + 1}`);
                remove.dataset.removeCategory = String(index);
                remove.disabled = data.one.categories.length <= 2;
                actionCell.appendChild(remove);
            });
            return;
        }

        const table = element('stats-cat-two-table');
        table.replaceChildren();
        const head = table.createTHead();
        const header = head.insertRow();
        const responseHeading = document.createElement('th');
        responseHeading.scope = 'col';
        responseHeading.textContent = 'Response';
        header.appendChild(responseHeading);
        data.columns.forEach((name, col) => {
            const cell = document.createElement('th');
            cell.scope = 'col';
            const input = makeInput(name, `Group ${col + 1} name`, value => { data.columns[col] = value; });
            input.className = 'stats-var-name';
            cell.appendChild(input);
            header.appendChild(cell);
        });
        const body = table.createTBody();
        data.rows.forEach((name, rowIndex) => {
            const row = body.insertRow();
            const heading = document.createElement('th');
            heading.scope = 'row';
            const input = makeInput(name, `Response ${rowIndex + 1} name`, value => { data.rows[rowIndex] = value; });
            input.className = 'stats-var-name';
            heading.appendChild(input);
            row.appendChild(heading);
            data.columns.forEach((_, colIndex) => {
                const cell = document.createElement('td');
                const count = makeInput(
                    data.counts[rowIndex][colIndex],
                    `Count for response ${rowIndex + 1}, group ${colIndex + 1}`,
                    value => { data.counts[rowIndex][colIndex] = value; },
                    true
                );
                cell.appendChild(count);
                row.appendChild(cell);
            });
        });
    }

    function categoricalCounts() {
        const data = state.categories;
        const oneVariable = data.view === 'one';
        const source = oneVariable ? data.one.counts : data.counts;
        const counts = source.map(value => {
            const values = Array.isArray(value) ? value : [value];
            return values.map(raw => {
                const text = raw.trim();
                if (!text) return 0;
                if (!/^\d+$/.test(text)) return null;
                const count = Number(text);
                return Number.isSafeInteger(count) ? count : null;
            });
        });
        if (counts.some(row => row.some(count => count === null))) {
            element('stats-error').textContent = 'Counts must be non-negative whole numbers.';
            return null;
        }
        const values = oneVariable ? counts.map(row => row[0]) : counts;
        const total = oneVariable
            ? values.reduce((sum, count) => sum + count, 0)
            : data.columns.reduce((sum, _, col) =>
                sum + counts.reduce((columnSum, row) => columnSum + row[col], 0), 0);
        if (!Number.isSafeInteger(total)) {
            element('stats-error').textContent = 'The total count is too large.';
            return null;
        }
        const groupTotals = oneVariable ? [] : data.columns.map((_, col) =>
            counts.reduce((sum, row) => sum + row[col], 0)
        );
        if (groupTotals.some(groupTotal => !Number.isSafeInteger(groupTotal))) {
            element('stats-error').textContent = 'The total count is too large.';
            return null;
        }
        return {
            oneVariable,
            labels: oneVariable ? data.one.categories : data.rows,
            counts: oneVariable ? values : counts,
            groupNames: oneVariable ? [] : data.columns,
            groupTotals,
            total
        };
    }

    const categoryColors = ['#1E4D3B', '#936037', '#E5B842', '#4A7C59', '#447C8A', '#8A5E78', '#B66B3D'];
    const categoryColor = index => categoryColors[index % categoryColors.length];
    const shortCategory = (name, limit = 12) => {
        const value = name.trim() || 'Unnamed';
        return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
    };

    function addSvgTitle(node, text) {
        const title = document.createElementNS(ns, 'title');
        title.textContent = text;
        node.appendChild(title);
    }

    function drawCategoricalLegend(labels, y = 350) {
        let x = 65;
        let rowY = y;
        labels.forEach((label, index) => {
            const width = 24 + Math.min(label.length, 22) * 6.5;
            if (x + width > 620) {
                x = 65;
                rowY += 18;
            }
            svg('rect', { x, y: rowY - 10, width: 12, height: 12, fill: categoryColor(index) });
            const text = svg('text', { x: x + 17, y: rowY }, shortCategory(label, 22));
            addSvgTitle(text, label);
            x += width;
        });
        if (labels.length) {
            element('stats-plot').setAttribute('viewBox', `0 0 640 ${Math.max(360, rowY + 12)}`);
        }
    }

    function drawCategoricalYAxis(maxValue, label) {
        const scaleInfo = computeNiceScale(0, Math.max(1, maxValue));
        const top = 45;
        const bottom = 300;
        const yAt = value => bottom - value / scaleInfo.max * (bottom - top);
        svg('line', { x1: 65, y1: bottom, x2: 620, y2: bottom, stroke: colors.green });
        svg('line', { x1: 65, y1: bottom, x2: 65, y2: top, stroke: colors.green });
        scaleInfo.ticks.forEach(value => {
            const y = yAt(value);
            svg('line', { x1: 60, x2: 620, y1: y, y2: y, stroke: '#d8e1da' });
            svg('text', { x: 55, y: y + 4, 'text-anchor': 'end' }, format(value));
        });
        svg('text', { x: 14, y: 170, transform: 'rotate(-90 14 170)', 'text-anchor': 'middle' }, label);
        return { yAt, bottom };
    }

    function renderCategoricalSummary(data) {
        const output = element('stats-cat-one-summary');
        output.replaceChildren();
        if (!data.oneVariable) return;
        const makeSummary = (label, value) => {
            const item = document.createElement('div');
            item.className = 'stats-card';
            const caption = document.createElement('span');
            caption.className = 'stats-card-label';
            caption.textContent = label;
            const result = document.createElement('strong');
            result.textContent = value;
            item.append(caption, result);
            output.appendChild(item);
        };
        const maxCount = Math.max(...data.counts);
        const mode = data.total && maxCount
            ? data.labels.filter((_, index) => data.counts[index] === maxCount)
                .map(name => name.trim() || 'Unnamed category').join(', ')
            : '—';
        makeSummary('Total n', String(data.total));
        makeSummary('Mode', mode);
        const breakdown = document.createElement('div');
        breakdown.className = 'stats-cat-frequency-list';
        data.labels.forEach((name, index) => {
            const item = document.createElement('div');
            const frequency = data.counts[index];
            const relative = data.total ? `${format(100 * frequency / data.total)}%` : '—';
            item.textContent = `${name.trim() || `Category ${index + 1}`}: ${frequency} (${relative})`;
            breakdown.appendChild(item);
        });
        output.appendChild(breakdown);
    }

    function drawCategoricalBars(data) {
        const percentMode = state.categories.barMode === 'percent';
        const oneVariable = data.oneVariable;
        const countValues = oneVariable
            ? data.counts
            : data.counts.flatMap(row => row);
        const maxValue = percentMode ? 100 : Math.max(1, ...countValues);
        const { yAt, bottom } = drawCategoricalYAxis(maxValue, percentMode ? 'Percent (%)' : 'Count');
        const slot = 545 / data.labels.length;
        if (oneVariable) {
            data.labels.forEach((name, index) => {
                const value = percentMode
                    ? (data.total ? 100 * data.counts[index] / data.total : 0)
                    : data.counts[index];
                const width = Math.min(60, slot * 0.66);
                const x = 65 + slot * (index + 0.5) - width / 2;
                const rect = svg('rect', {
                    x, y: yAt(value), width, height: bottom - yAt(value),
                    fill: categoryColor(index), stroke: colors.cream
                });
                addSvgTitle(rect, `${name}: ${data.counts[index]} (${data.total ? format(100 * data.counts[index] / data.total) : 0}%)`);
                const text = svg('text', { x: 65 + slot * (index + 0.5), y: 324, 'text-anchor': 'middle' }, shortCategory(name));
                addSvgTitle(text, name);
            });
            return;
        }

        const groupCount = data.groupNames.length;
        data.labels.forEach((response, row) => {
            const clusterWidth = Math.min(slot * 0.84, 100);
            const barWidth = clusterWidth / Math.max(1, groupCount);
            const startX = 65 + slot * (row + 0.5) - clusterWidth / 2;
            data.groupNames.forEach((group, col) => {
                const count = data.counts[row][col];
                const value = percentMode
                    ? (data.groupTotals[col] ? 100 * count / data.groupTotals[col] : 0)
                    : count;
                const rect = svg('rect', {
                    x: startX + col * barWidth, y: yAt(value),
                    width: Math.max(1, barWidth - 2), height: bottom - yAt(value),
                    fill: categoryColor(col), stroke: colors.cream
                });
                addSvgTitle(rect, `${group} — ${response}: ${count} (${data.groupTotals[col] ? format(100 * count / data.groupTotals[col]) : 0}%)`);
            });
            const text = svg('text', { x: 65 + slot * (row + 0.5), y: 324, 'text-anchor': 'middle' }, shortCategory(response));
            addSvgTitle(text, response);
        });
        drawCategoricalLegend(data.groupNames);
    }

    function drawSegmentedBars(data) {
        const bottom = 300;
        const top = 65;
        const height = bottom - top;
        const barCount = data.oneVariable ? 1 : data.groupNames.length;
        const barWidth = data.oneVariable ? 420 : Math.min(100, 430 / Math.max(1, barCount));
        const startX = data.oneVariable ? 110 : 65;

        Array.from({ length: barCount }, (_, barIndex) => {
            const x = data.oneVariable
                ? startX
                : 65 + 545 / barCount * (barIndex + 0.5) - barWidth / 2;
            let y = bottom;
            if (data.oneVariable) {
                data.labels.forEach((name, index) => {
                    const count = data.counts[index];
                    const segmentHeight = data.total ? height * count / data.total : 0;
                    y -= segmentHeight;
                    if (!segmentHeight) return;
                    const rect = svg('rect', { x, y, width: barWidth, height: segmentHeight,
                        fill: categoryColor(index), stroke: colors.cream });
                    const percentage = 100 * count / data.total;
                    addSvgTitle(rect, `${name}: ${count} (${format(percentage)}%)`);
                    if (segmentHeight >= 24) {
                        svg('text', { x: x + barWidth / 2, y: y + segmentHeight / 2 + 4,
                            'text-anchor': 'middle', class: index % 3 === 2 ? 'mosaic-dark-label' : 'mosaic-light-label' },
                        `${format(percentage)}%`);
                    }
                });
            } else {
                data.labels.forEach((response, row) => {
                    const count = data.counts[row][barIndex];
                    const groupTotal = data.groupTotals[barIndex];
                    const segmentHeight = groupTotal ? height * count / groupTotal : 0;
                    y -= segmentHeight;
                    if (!segmentHeight) return;
                    const rect = svg('rect', { x, y, width: barWidth, height: segmentHeight,
                        fill: categoryColor(row), stroke: colors.cream });
                    const percentage = 100 * count / groupTotal;
                    addSvgTitle(rect, `${data.groupNames[barIndex]} — ${response}: ${count} (${format(percentage)}%)`);
                    if (segmentHeight >= 24) {
                        svg('text', { x: x + barWidth / 2, y: y + segmentHeight / 2 + 4,
                            'text-anchor': 'middle', class: row % 3 === 2 ? 'mosaic-dark-label' : 'mosaic-light-label' },
                        `${format(percentage)}%`);
                    }
                });
                const label = svg('text', { x: x + barWidth / 2, y: bottom + 20, 'text-anchor': 'middle' },
                    shortCategory(data.groupNames[barIndex]));
                addSvgTitle(label, data.groupNames[barIndex]);
            }
        });
        drawCategoricalLegend(data.labels);
    }

    function drawCategoricalMosaic(data) {
        const top = 55;
        const bottom = 300;
        const height = bottom - top;
        if (data.oneVariable) {
            let x = 60;
            const width = 550;
            data.labels.forEach((name, index) => {
                const count = data.counts[index];
                const segmentWidth = width * count / data.total;
                if (!segmentWidth) return;
                const rect = svg('rect', { x, y: top, width: segmentWidth, height,
                    fill: categoryColor(index), stroke: colors.cream });
                const percentage = 100 * count / data.total;
                addSvgTitle(rect, `${name}: ${count} (${format(percentage)}%)`);
                if (segmentWidth >= 48) {
                    svg('text', { x: x + segmentWidth / 2, y: top + height / 2,
                        'text-anchor': 'middle', class: index % 3 === 2 ? 'mosaic-dark-label' : 'mosaic-light-label' },
                    `${shortCategory(name, 10)} ${format(percentage)}%`);
                }
                x += segmentWidth;
            });
            return;
        }

        const nonzeroGroups = data.groupTotals.filter(total => total > 0).length;
        const gap = Math.min(4, 540 / Math.max(1, nonzeroGroups - 1));
        const availableWidth = 540 - gap * Math.max(0, nonzeroGroups - 1);
        let x = 60;
        data.groupTotals.forEach((groupTotal, col) => {
            if (!groupTotal) return;
            const columnWidth = availableWidth * groupTotal / data.total;
            let y = bottom;
            data.labels.forEach((response, row) => {
                const count = data.counts[row][col];
                const segmentHeight = height * count / groupTotal;
                y -= segmentHeight;
                if (!segmentHeight) return;
                const rect = svg('rect', { x, y, width: columnWidth, height: segmentHeight,
                    fill: categoryColor(row), stroke: colors.cream });
                const percentage = 100 * count / groupTotal;
                addSvgTitle(rect, `${data.groupNames[col]} — ${response}: ${count} (${format(percentage)}%)`);
                const text = `${format(percentage)}%`;
                if (segmentHeight >= 22 && columnWidth >= text.length * 7 + 4) {
                    svg('text', { x: x + columnWidth / 2, y: y + segmentHeight / 2 + 4,
                        'text-anchor': 'middle', class: row % 3 === 2 ? 'mosaic-dark-label' : 'mosaic-light-label' }, text);
                }
            });
            const label = svg('text', { x: x + columnWidth / 2, y: bottom + 20, 'text-anchor': 'middle' },
                shortCategory(data.groupNames[col], Math.max(1, Math.floor(columnWidth / 7))));
            addSvgTitle(label, data.groupNames[col]);
            x += columnWidth + gap;
        });
        drawCategoricalLegend(data.labels);
    }

    function drawCategoricalPie(data) {
        const counts = data.oneVariable
            ? data.counts
            : data.labels.map((_, row) =>
                data.counts[row].reduce((sum, count) => sum + count, 0)
            );
        const labels = data.labels;
        const cx = 180, cy = 175, radius = 125;
        let angle = -Math.PI / 2;
        const positive = counts.map((count, index) => ({ count, index })).filter(item => item.count > 0);
        if (positive.length === 1) {
            svg('circle', { cx, cy, r: radius, fill: categoryColor(positive[0].index), stroke: colors.cream });
            addSvgTitle(element('stats-plot').lastChild, `${labels[positive[0].index]}: 100%`);
        } else {
            positive.forEach(({ count, index }) => {
                const nextAngle = angle + 2 * Math.PI * count / data.total;
                const startX = cx + radius * Math.cos(angle);
                const startY = cy + radius * Math.sin(angle);
                const endX = cx + radius * Math.cos(nextAngle);
                const endY = cy + radius * Math.sin(nextAngle);
                const largeArc = nextAngle - angle > Math.PI ? 1 : 0;
                const path = svg('path', {
                    d: `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`,
                    fill: categoryColor(index),
                    stroke: colors.cream
                });
                addSvgTitle(path, `${labels[index]}: ${count} (${format(100 * count / data.total)}%)`);
                const middle = (angle + nextAngle) / 2;
                if (nextAngle - angle >= 0.28) {
                    svg('text', { x: cx + radius * 0.65 * Math.cos(middle),
                        y: cy + radius * 0.65 * Math.sin(middle) + 4,
                        'text-anchor': 'middle', class: index % 3 === 2 ? 'mosaic-dark-label' : 'mosaic-light-label' },
                    `${format(100 * count / data.total)}%`);
                }
                angle = nextAngle;
            });
        }
        labels.forEach((name, index) => {
            const y = 60 + index * 24;
            svg('rect', { x: 360, y: y - 10, width: 14, height: 14, fill: categoryColor(index) });
            const count = counts[index];
            const text = svg('text', { x: 382, y }, `${shortCategory(name, 24)}: ${count} (${format(100 * count / data.total)}%)`);
            addSvgTitle(text, `${name}: ${count} (${format(100 * count / data.total)}%)`);
        });
        element('stats-plot').setAttribute('viewBox', `0 0 640 ${Math.max(360, 75 + labels.length * 24)}`);
    }

    function updateCategorical() {
        const zeroGroups = element('stats-zero-groups');
        zeroGroups.textContent = '';
        const data = categoricalCounts();
        if (!data) {
            element('stats-cat-one-summary').replaceChildren();
            return;
        }
        renderCategoricalSummary(data);
        if (!data.total) {
            element('stats-error').textContent = 'Enter at least one positive count to display a chart.';
            return;
        }
        if (!data.oneVariable) {
            const emptyGroups = data.groupNames.filter((_, index) => data.groupTotals[index] === 0);
            if (emptyGroups.length) zeroGroups.textContent = `Zero-total groups (no plot width): ${emptyGroups.join(', ')}`;
        }
        if (state.plot.categorical === 'bar') drawCategoricalBars(data);
        else if (state.plot.categorical === 'segmented') drawSegmentedBars(data);
        else if (state.plot.categorical === 'pie') drawCategoricalPie(data);
        else drawCategoricalMosaic(data);
    }

    function drawOne(info) {
        const values = info.sorted;
        const plot = state.plot.one;
        const name = varName('one', 'x');
        if (plot === 'stemplot') return drawStemplot(values, name);
        if (plot === 'dotplot') return dotplot(values, name);
        const x = scale(info.min, info.max, 65, 610);
        if (plot === 'histogram') {
            const count = Math.max(1, Math.ceil(Math.sqrt(info.n)));
            const min = info.min, span = info.max - min || 1;
            const bins = Array(count).fill(0);
            values.forEach(value => { bins[Math.min(count - 1, Math.floor((value - min) / span * count))] += 1; });
            const y = scale(0, Math.max(...bins), 305, 25);
            axes(x, y, name, 'Frequency');
            bins.forEach((frequency, index) => {
                const left = min + span * index / count;
                const right = min + span * (index + 1) / count;
                svg('rect', { x: x.at(left), y: y.at(frequency), width: Math.max(1, x.at(right) - x.at(left)),
                    height: y.at(0) - y.at(frequency), fill: colors.green, stroke: colors.cream });
            });
            return;
        }
        if (info.iqr === null) return dotplot(values, name);
        const lowFence = info.q1 - 1.5 * info.iqr, highFence = info.q3 + 1.5 * info.iqr;
        const inside = values.filter(value => value >= lowFence && value <= highFence);
        svg('line', { x1: 65, y1: 280, x2: 610, y2: 280, stroke: colors.green });
        x.ticks.forEach(value => {
            svg('text', { x: x.at(value), y: 305, 'text-anchor': 'middle' }, String(value));
        });
        svg('text', { x: 330, y: 347, 'text-anchor': 'middle' }, name);
        svg('line', { x1: x.at(inside[0]), y1: 150, x2: x.at(inside[inside.length - 1]), y2: 150, stroke: colors.green, 'stroke-width': 2 });
        [inside[0], inside[inside.length - 1]].forEach(value => svg('line', {
            x1: x.at(value), x2: x.at(value), y1: 130, y2: 170, stroke: colors.green, 'stroke-width': 2
        }));
        svg('rect', { x: x.at(info.q1), y: 110, width: Math.max(1, x.at(info.q3) - x.at(info.q1)), height: 80, fill: '#d8e7d8', stroke: colors.green });
        svg('line', { x1: x.at(info.median), x2: x.at(info.median), y1: 110, y2: 190, stroke: colors.brown, 'stroke-width': 3 });
        values.filter(value => value < lowFence || value > highFence).forEach(value =>
            svg('circle', { cx: x.at(value), cy: 150, r: 5, fill: colors.brown }));
    }

    function drawTwo(pairs, regression) {
        if (!regression && state.plot.two !== 'scatterplot') return;
        const residuals = regression
            ? pairs.map(([x, y]) => y - (regression.intercept + regression.slope * x))
            : [];
        if (state.plot.two === 'residual-dotplot') return dotplot(residuals, 'Residual');
        const residual = state.plot.two === 'residual';
        const x = scale(Math.min(...pairs.map(pair => pair[0])), Math.max(...pairs.map(pair => pair[0])), 65, 610);
        const ys = residual ? [...residuals, 0] : pairs.map(pair => pair[1]);
        const extent = Math.max(...ys.map(Math.abs));
        const y = residual ? scale(-extent, extent, 305, 25) : scale(Math.min(...ys), Math.max(...ys), 305, 25);
        axes(x, y, varName('two', 'x'), residual ? 'Residual' : varName('two', 'y'));
        if (residual) {
            svg('line', { x1: 65, x2: 610, y1: y.at(0), y2: y.at(0), stroke: colors.brown, 'stroke-dasharray': '6 4' });
        } else if (regression) {
            const minX = Math.min(...pairs.map(pair => pair[0])), maxX = Math.max(...pairs.map(pair => pair[0]));
            svg('line', { x1: x.at(minX), y1: y.at(regression.intercept + regression.slope * minX),
                x2: x.at(maxX), y2: y.at(regression.intercept + regression.slope * maxX),
                stroke: colors.brown, 'stroke-width': 2 });
        }
        pairs.forEach((pair, index) => svg('circle', {
            cx: x.at(pair[0]), cy: y.at(residual ? residuals[index] : pair[1]), r: 4, fill: colors.green
        }));
    }

    function update() {
        const plot = element('stats-plot');
        plot.replaceChildren();
        plot.setAttribute('viewBox', '0 0 640 360');
        const stemActive = state.mode === 'one' && state.plot.one === 'stemplot';
        element('stats-stem-controls').hidden = !stemActive;
        element('stats-stemplot').hidden = !stemActive;
        plot.toggleAttribute('hidden', stemActive || state.mode === 'inference');
        element('stats-stemplot').replaceChildren();
        const output = element('stats-summary');
        output.replaceChildren();
        const error = element('stats-error');
        error.textContent = '';
        const categoryControls = element('stats-cat-chart-controls');
        categoryControls.hidden = state.mode !== 'categorical' || state.plot.categorical !== 'bar';
        categoryControls.querySelectorAll('button').forEach(button => {
            button.classList.toggle('active', button.dataset.catBarMode === state.categories.barMode);
        });
        if (state.mode === 'inference') {
            refreshInferenceData();
            return;
        }
        if (state.mode === 'categorical') {
            updateCategorical();
            return;
        }
        const data = [];
        for (const row of state.rows[state.mode]) {
            const values = row.map(value => value.trim());
            if (values.every(value => !value)) continue;
            if (values.some(value => !numberPattern.test(value) || !Number.isFinite(Number(value)))) {
                error.textContent = 'Enter a finite number in every cell of each populated row.';
                return;
            }
            data.push(values.map(Number));
        }
        if (!data.length) return;
        const x = summary(data.map(row => row[0]));
        if (!Number.isFinite(x.mean) || !Number.isFinite(x.ss)) {
            error.textContent = 'Statistics overflowed. Use smaller values.';
            return;
        }
        let entries;
        let equation = null;
        if (state.mode === 'one') {
            entries = [['n', x.n], ['x̄', x.mean], ['sx', x.sd], ['Min', x.min], ['Q1', x.q1],
                ['Med', x.median], ['Q3', x.q3], ['Max', x.max], ['IQR', x.iqr]];
            drawOne(x);
        } else {
            const y = summary(data.map(row => row[1]));
            if (!Number.isFinite(y.mean) || !Number.isFinite(y.ss)) {
                error.textContent = 'Statistics overflowed. Use smaller values.';
                return;
            }
            const xy = data.reduce((sum, [a, b]) => sum + (a - x.mean) * (b - y.mean), 0);
            if (!Number.isFinite(xy)) {
                error.textContent = 'Statistics overflowed. Use smaller values.';
                return;
            }
            const slope = x.ss ? xy / x.ss : null;
            const intercept = slope === null ? null : y.mean - slope * x.mean;
            const r = x.ss && y.ss ? Math.max(-1, Math.min(1, xy / Math.sqrt(x.ss) / Math.sqrt(y.ss))) : null;
            const notation = window.getActiveLsrlNotation?.() || savedNotation;
            entries = [['n', x.n], ['x̄', x.mean], ['sx', x.sd], ['ȳ', y.mean], ['sy', y.sd],
                ['r', r], ['r²', r === null ? null : r * r],
                [notation === 'b0b1' ? 'b₀' : 'a', intercept], [notation === 'b0b1' ? 'b₁' : 'b', slope]];
            if (slope !== null && Number.isFinite(slope) && Number.isFinite(intercept)) {
                equation = `Predicted ${varName('two', 'y')} = ${format(intercept)} ${slope < 0 ? '−' : '+'} ${format(Math.abs(slope))} × ${varName('two', 'x')}`;
                drawTwo(data, { slope, intercept });
            } else {
                error.textContent = 'At least two distinct X values are needed for regression.';
                drawTwo(data, null);
            }
        }
        const columns = [document.createElement('div'), document.createElement('div')];
        columns.forEach(column => { column.className = 'stats-column'; output.appendChild(column); });
        entries.forEach(([label, value], index) => {
            const item = document.createElement('div');
            item.className = 'stats-card';
            const caption = document.createElement('span');
            caption.className = 'stats-card-label';
            caption.textContent = label;
            const number = document.createElement('strong');
            number.textContent = format(value);
            item.append(caption, number);
            columns[index < 5 ? 0 : 1].appendChild(item);
        });
        if (equation) {
            const banner = document.createElement('div');
            banner.className = 'stats-equation';
            banner.textContent = equation;
            output.appendChild(banner);
        }
    }

    function applyDock(mode) {
        const win = element('floating-stats-window');
        maximizedFrom = null;
        win.classList.remove('is-maximized');
        element('btn-stats-maximize').textContent = '🗖';
        win.classList.remove('stats-snap-left', 'stats-snap-right', 'stats-snap-bottom');
        document.body.classList.remove('stats-docked-left', 'stats-docked-right', 'stats-docked-bottom');
        state.dock = mode === 'float' ? null : mode;
        win.style.left = '';
        win.style.right = '';
        win.style.top = '';
        win.style.bottom = '';
        win.style.width = '';
        win.style.height = '';
        if (state.dock) {
            win.classList.add(`stats-snap-${mode}`);
            document.body.classList.add(`stats-docked-${mode}`);
        }
    }
    window.dockManager.register('stats', applyDock);
    window.floatStatsWindow = () => window.dockManager.set('stats', 'float');
    window.snapStatsWindow = side => window.dockManager.set('stats', side);
    window.toggleMaximizeStatsWindow = () => {
        const win = element('floating-stats-window');
        if (maximizedFrom) {
            const previous = maximizedFrom;
            window.dockManager.set('stats', previous.mode);
            if (previous.mode === 'float') {
                for (const [property, value] of Object.entries(previous.styles)) win.style[property] = value;
            }
        } else {
            const styles = {};
            for (const property of ['top', 'left', 'right', 'bottom', 'width', 'height']) styles[property] = win.style[property];
            const previous = { mode: state.dock || 'float', styles };
            window.dockManager.release('stats');
            applyDock('float');
            maximizedFrom = previous;
            win.style.bottom = '';
            win.classList.add('is-maximized');
            element('btn-stats-maximize').textContent = '🗗';
        }
        update();
    };
    window.popOutStatsWindow = () => {
        if (!saveStatsState()) return;
        const popup = window.open('/stats-tool', '_blank');
        if (!popup) {
            storageError('The Stats & Graphing pop-out was blocked. Allow pop-ups and try again.', new Error('Pop-up blocked'));
            return;
        }
        popup.opener = null;
        window.closeStatsGrapherWindow();
    };
    window.closeStatsGrapherWindow = () => {
        element('floating-stats-window').style.display = 'none';
        window.dockManager.release('stats');
        applyDock('float');
    };
    window.toggleStatsGrapherWindow = () => {
        const win = element('floating-stats-window');
        if (win.style.display === 'flex') return window.closeStatsGrapherWindow();
        win.style.display = 'flex';
        update();
    };

    document.addEventListener('DOMContentLoaded', () => {
        for (const mode of ['one', 'two']) {
            state.rows[mode] = Array.from({ length: 6 }, () => mode === 'one' ? [''] : ['', '']);
        }
        hydrateStatsState();
        element('stats-mode-tabs').addEventListener('click', event => {
            const mode = event.target.dataset.mode;
            if (plots[mode] || mode === 'inference') setMode(mode);
        });
        initInference();
        element('stats-clear').addEventListener('click', () => {
            state.rows[state.mode] = Array.from({ length: 6 }, () => state.mode === 'one' ? [''] : ['', '']);
            setMode(state.mode);
        });
        ['stats-var-x-1var', 'stats-var-x-2var', 'stats-var-y-2var'].forEach(id => {
            element(id).addEventListener('input', update);
        });
        element('stats-stem-controls').addEventListener('click', event => {
            const mode = event.target.dataset.stems;
            if (mode !== 'single' && mode !== 'split') return;
            state.stems = mode;
            element('stats-stem-controls').querySelectorAll('button').forEach(button => {
                button.classList.toggle('active', button.dataset.stems === mode);
            });
            update();
        });
        element('stats-stem-controls').querySelector(`[data-stems="${state.stems}"]`).classList.add('active');
        element('stats-add-row').addEventListener('click', () => {
            const data = state.categories;
            data.rows.push(`Response ${data.rows.length + 1}`);
            data.counts.push(data.columns.map(() => ''));
            renderCategories();
            update();
        });
        element('stats-remove-row').addEventListener('click', () => {
            const data = state.categories;
            if (data.rows.length <= 2) return;
            data.rows.pop();
            data.counts.pop();
            renderCategories();
            update();
            saveStatsState();
        });
        element('stats-add-col').addEventListener('click', () => {
            const data = state.categories;
            data.columns.push(`Group ${data.columns.length + 1}`);
            data.counts.forEach(row => row.push(''));
            renderCategories();
            update();
        });
        element('stats-remove-col').addEventListener('click', () => {
            const data = state.categories;
            if (data.columns.length <= 2) return;
            data.columns.pop();
            data.counts.forEach(row => row.pop());
            renderCategories();
            update();
            saveStatsState();
        });
        element('stats-clear-categorical').addEventListener('click', () => {
            state.categories.counts = state.categories.rows.map(() => state.categories.columns.map(() => ''));
            renderCategories();
            update();
        });
        element('stats-cat-mode-tabs').addEventListener('click', event => {
            const view = event.target.dataset.catView;
            if (view !== 'one' && view !== 'two') return;
            state.categories.view = view;
            renderCategories();
            update();
            saveStatsState();
        });
        element('stats-cat-add').addEventListener('click', () => {
            const data = state.categories.one;
            data.categories.push(`Category ${data.categories.length + 1}`);
            data.counts.push('');
            renderCategories();
            update();
        });
        element('stats-cat-one-table').addEventListener('click', event => {
            const button = event.target.closest('button[data-remove-category]');
            if (!button) return;
            const data = state.categories.one;
            const index = Number(button.dataset.removeCategory);
            if (data.categories.length <= 2 || !Number.isInteger(index)
                || index < 0 || index >= data.categories.length) return;
            data.categories.splice(index, 1);
            data.counts.splice(index, 1);
            renderCategories();
            update();
            saveStatsState();
        });
        element('stats-cat-clear-one').addEventListener('click', () => {
            state.categories.one.counts = state.categories.one.categories.map(() => '');
            renderCategories();
            update();
        });
        element('stats-cat-variable-name').addEventListener('input', event => {
            state.categories.variableName = event.target.value;
            update();
        });
        element('stats-cat-chart-controls').addEventListener('click', event => {
            const mode = event.target.dataset.catBarMode;
            if (mode !== 'counts' && mode !== 'percent') return;
            state.categories.barMode = mode;
            element('stats-cat-chart-controls').querySelectorAll('button').forEach(button => {
                button.classList.toggle('active', button.dataset.catBarMode === mode);
            });
            update();
            saveStatsState();
        });
        const workspace = element('floating-stats-window');
        workspace.addEventListener('input', saveStatsState);
        workspace.addEventListener('click', event => {
            if (event.target.closest('#stats-mode-tabs, #stats-stem-controls, #stats-clear, #stats-add-row, #stats-remove-row, #stats-add-col, #stats-remove-col, #stats-clear-categorical, #stats-cat-mode-tabs, #stats-cat-chart-controls, #stats-cat-add, #stats-cat-one-table, #stats-cat-clear-one')) {
                saveStatsState();
            }
        });
        const titlebar = element('stats-titlebar');
        titlebar.addEventListener('pointerdown', event => {
            if (event.target.closest('button') || document.body.classList.contains('stats-standalone')) return;
            const win = element('floating-stats-window');
            const rect = win.getBoundingClientRect();
            const wasMaximized = Boolean(maximizedFrom);
            const needsDetach = Boolean(state.dock || wasMaximized);
            let offsetX = event.clientX - rect.left;
            let offsetY = event.clientY - rect.top;
            if (needsDetach) {
                offsetX = wasMaximized ? 120 : Math.min(240, Math.max(0, offsetX));
                offsetY = wasMaximized ? 16 : Math.min(24, Math.max(0, offsetY));
            }
            let dragging = false;
            titlebar.setPointerCapture(event.pointerId);
            const move = moveEvent => {
                if (!dragging) {
                    if (Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) < 3) return;
                    dragging = true;
                    document.body.style.userSelect = 'none';
                    if (needsDetach) {
                        window.dockManager.release('stats');
                        applyDock('float');
                    }
                    win.style.right = 'auto';
                }
                win.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, moveEvent.clientX - offsetX))}px`;
                win.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, moveEvent.clientY - offsetY))}px`;
            };
            const stop = () => {
                titlebar.removeEventListener('pointermove', move);
                document.body.style.userSelect = '';
            };
            titlebar.addEventListener('pointermove', move);
            titlebar.addEventListener('pointerup', stop, { once: true });
            titlebar.addEventListener('pointercancel', stop, { once: true });
        });
        const resizer = element('stats-dock-resizer');
        resizer.addEventListener('pointerdown', event => {
            if (!state.dock) return;
            event.preventDefault();
            const side = state.dock;
            const rect = element('floating-stats-window').getBoundingClientRect();
            const start = side === 'bottom' ? event.clientY : event.clientX;
            const dimension = side === 'bottom' ? rect.height : rect.width;
            resizer.setPointerCapture(event.pointerId);
            const move = e => {
                if (side === 'bottom') {
                    window.dockManager.resize('stats', dimension + start - e.clientY);
                } else {
                    window.dockManager.resize(
                        'stats',
                        dimension + (side === 'left' ? e.clientX - start : start - e.clientX)
                    );
                }
            };
            const stop = () => resizer.removeEventListener('pointermove', move);
            resizer.addEventListener('pointermove', move);
            resizer.addEventListener('pointerup', stop, { once: true });
            resizer.addEventListener('pointercancel', stop, { once: true });
        });
        const grip = element('stats-resize-grip');
        grip.addEventListener('pointerdown', event => {
            if (state.dock || maximizedFrom) return;
            event.preventDefault();
            const win = element('floating-stats-window');
            const rect = win.getBoundingClientRect();
            const startX = event.clientX, startY = event.clientY;
            win.style.left = `${rect.left}px`;
            win.style.right = 'auto';
            grip.setPointerCapture(event.pointerId);
            const move = e => {
                win.style.width = `${Math.max(240, Math.min(window.innerWidth - rect.left, rect.width + e.clientX - startX))}px`;
                win.style.height = `${Math.max(200, Math.min(window.innerHeight - rect.top, rect.height + e.clientY - startY))}px`;
            };
            const stop = () => grip.removeEventListener('pointermove', move);
            grip.addEventListener('pointermove', move);
            grip.addEventListener('pointerup', stop, { once: true });
            grip.addEventListener('pointercancel', stop, { once: true });
        });
        new ResizeObserver(update).observe(element('floating-stats-window'));
        window.addEventListener('lsrl-notation-change', update);
        window.addEventListener('dock-layout-change', update);
        setMode(state.mode);
        if (document.body.classList.contains('stats-standalone')) workspace.style.display = 'flex';
    });
})();
