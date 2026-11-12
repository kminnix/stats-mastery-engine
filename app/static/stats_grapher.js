(() => {
    const state = {
        mode: 'one',
        plot: { one: 'histogram', two: 'scatterplot', categorical: 'mosaic' },
        rows: { one: [['']], two: [['', '']] },
        stems: 'single',
        categories: { rows: ['Group A', 'Group B'], columns: ['Yes', 'No'], counts: [['', ''], ['', '']] },
        dock: null
    };
    const plots = {
        one: [['histogram', 'Histogram'], ['dotplot', 'Dotplot'], ['boxplot', 'Boxplot'], ['stemplot', 'Stemplot']],
        two: [['scatterplot', 'Scatterplot'], ['residual', 'Residual Plot'], ['residual-dotplot', 'Residual Dotplot']],
        categorical: []
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
            && validRows(categories.counts, categories.columns.length);
        if (!payload || !validRows(payload.rows?.one, 1) || !validRows(payload.rows?.two, 2)
            || !validCategories || !payload.names || !nameIds.every(id => typeof payload.names[id] === 'string')) {
            storageError('Saved Stats & Graphing data has an invalid format and was not loaded.', new Error('Invalid saved state'));
            return;
        }
        state.rows = payload.rows;
        state.categories = categories;
        if (Object.hasOwn(plots, payload.mode)) state.mode = payload.mode;
        for (const mode of ['one', 'two']) {
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
        element('stats-categorical').hidden = !categorical;
        document.querySelector('.stats-top-split').hidden = categorical;
        element('stats-var-x-1var').hidden = mode !== 'one';
        element('stats-var-x-2var').hidden = mode !== 'two';
        element('stats-mode-tabs').querySelectorAll('button').forEach(button => {
            button.classList.toggle('active', button.dataset.mode === mode);
        });
        const tabs = element('stats-plot-tabs');
        tabs.replaceChildren();
        plots[mode].forEach(([id, label]) => {
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
        else renderRows();
        update();
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
        const table = element('stats-categorical-table');
        table.replaceChildren();
        const head = document.createElement('thead');
        const header = document.createElement('tr');
        header.appendChild(document.createElement('th'));
        const makeInput = (value, label, onInput) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.setAttribute('aria-label', label);
            input.addEventListener('input', () => { onInput(input.value); update(); });
            return input;
        };
        data.columns.forEach((name, col) => {
            const cell = document.createElement('th');
            cell.scope = 'col';
            const input = makeInput(name, `Column ${col + 1} category`, value => { data.columns[col] = value; });
            input.className = 'stats-var-name';
            cell.appendChild(input);
            header.appendChild(cell);
        });
        head.appendChild(header);
        table.appendChild(head);
        const body = document.createElement('tbody');
        data.rows.forEach((name, row) => {
            const tr = document.createElement('tr');
            const heading = document.createElement('th');
            heading.scope = 'row';
            const input = makeInput(name, `Row ${row + 1} category`, value => { data.rows[row] = value; });
            input.className = 'stats-var-name';
            heading.appendChild(input);
            tr.appendChild(heading);
            data.columns.forEach((_, col) => {
                const cell = document.createElement('td');
                const count = makeInput(data.counts[row][col], `Count row ${row + 1} column ${col + 1}`, value => { data.counts[row][col] = value; });
                count.inputMode = 'numeric';
                cell.appendChild(count);
                tr.appendChild(cell);
            });
            body.appendChild(tr);
        });
        table.appendChild(body);
    }

    function drawMosaic() {
        const data = state.categories;
        const zeroColumns = element('stats-zero-columns');
        zeroColumns.textContent = '';
        const counts = data.counts.map(row => row.map(value => value.trim() === '' ? 0 : Number(value)));
        if (data.counts.some((row, i) => row.some((value, j) =>
            value.trim() !== '' && (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(counts[i][j]))))) {
            element('stats-error').textContent = 'Counts must be non-negative whole numbers.';
            return;
        }
        const totals = data.columns.map((_, col) => counts.reduce((sum, row) => sum + row[col], 0));
        const emptyNames = data.columns.filter((_, col) => totals[col] === 0)
            .map(name => name.trim() || 'Unnamed column');
        if (emptyNames.length) zeroColumns.textContent = `Zero-total columns (no plot width): ${emptyNames.join(', ')}`;
        const grandTotal = totals.reduce((sum, value) => sum + value, 0);
        if (!Number.isSafeInteger(grandTotal)) {
            element('stats-error').textContent = 'The total count is too large.';
            return;
        }
        if (!grandTotal) {
            element('stats-error').textContent = 'Enter at least one positive count to display the mosaic plot.';
            return;
        }
        const palette = ['#1E4D3B', '#936037', '#E5B842', '#4A7C59'];
        const fills = data.rows.map((_, row) => {
            const base = palette[row % palette.length];
            if (row < palette.length) return base;
            const pattern = svg('pattern', { id: `mosaic-pattern-${row}`, patternUnits: 'userSpaceOnUse', width: 8, height: 8 });
            const background = document.createElementNS(ns, 'rect');
            background.setAttribute('width', '8');
            background.setAttribute('height', '8');
            background.setAttribute('fill', base);
            const stripe = document.createElementNS(ns, 'path');
            stripe.setAttribute('d', row % 8 < 4 ? 'M0 0 L8 8 M-4 4 L4 12 M4 -4 L12 4' : 'M8 0 L0 8 M4 -4 L-4 4 M12 4 L4 12');
            stripe.setAttribute('stroke', row % 4 === 2 ? '#1E4D3B' : '#FAF8F3');
            stripe.setAttribute('stroke-width', String(1 + Math.floor(row / 8)));
            pattern.append(background, stripe);
            return `url(#mosaic-pattern-${row})`;
        });
        const legendRows = Math.ceil(data.rows.length / 3);
        const top = 25 + legendRows * 22;
        const bottom = top + 230;
        element('stats-plot').setAttribute('viewBox', `0 0 640 ${bottom + 55}`);
        const short = (text, limit) => text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
        data.rows.forEach((name, row) => {
            const x = 20 + (row % 3) * 205, y = 16 + Math.floor(row / 3) * 22;
            svg('rect', { x, y: y - 10, width: 12, height: 12, fill: fills[row] });
            const label = svg('text', { x: x + 17, y }, short(name.trim() || `Group ${row + 1}`, 22));
            const title = document.createElementNS(ns, 'title');
            title.textContent = name;
            label.appendChild(title);
        });
        const nonzeroColumns = totals.filter(total => total > 0).length;
        const gap = Math.min(3, 540 / Math.max(1, nonzeroColumns - 1));
        const width = Math.max(0, 540 - gap * Math.max(0, nonzeroColumns - 1));
        let left = 60;
        totals.forEach((total, col) => {
            if (!total) return;
            const columnWidth = width * total / grandTotal;
            let y = bottom;
            counts.forEach((row, index) => {
                const height = 230 * row[col] / total;
                y -= height;
                if (!height) return;
                const rect = svg('rect', { x: left, y, width: columnWidth, height, fill: fills[index], stroke: colors.cream });
                const title = document.createElementNS(ns, 'title');
                title.textContent = `${data.rows[index] || `Group ${index + 1}`}: ${row[col]} (${format(100 * row[col] / total)}%)`;
                rect.appendChild(title);
                const text = `${row[col]} (${format(100 * row[col] / total)}%)`;
                if (height >= 20 && columnWidth >= text.length * 7 + 4) {
                    svg('text', { x: left + columnWidth / 2, y: y + height / 2 + 4, 'text-anchor': 'middle', class: index % 4 === 2 ? 'mosaic-dark-label' : 'mosaic-light-label' }, text);
                }
            });
            const label = svg('text', { x: left + columnWidth / 2, y: bottom + 20, 'text-anchor': 'middle' }, short(data.columns[col].trim() || `Column ${col + 1}`, Math.max(1, Math.floor(columnWidth / 7))));
            const title = document.createElementNS(ns, 'title');
            title.textContent = data.columns[col];
            label.appendChild(title);
            left += columnWidth + gap;
        });
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
        plot.hidden = stemActive;
        element('stats-stemplot').replaceChildren();
        const output = element('stats-summary');
        output.replaceChildren();
        const error = element('stats-error');
        error.textContent = '';
        if (state.mode === 'categorical') {
            drawMosaic();
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
        win.classList.remove('stats-snap-left', 'stats-snap-right');
        document.body.classList.remove('stats-docked-left', 'stats-docked-right');
        state.dock = mode === 'float' ? null : mode;
        win.style.left = '';
        win.style.right = '';
        win.style.top = '';
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
            if (plots[mode]) setMode(mode);
        });
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
            data.rows.push(`Group ${data.rows.length + 1}`);
            data.counts.push(data.columns.map(() => ''));
            renderCategories();
            update();
        });
        element('stats-add-col').addEventListener('click', () => {
            const data = state.categories;
            data.columns.push(`Column ${data.columns.length + 1}`);
            data.counts.forEach(row => row.push(''));
            renderCategories();
            update();
        });
        element('stats-clear-categorical').addEventListener('click', () => {
            state.categories.counts = state.categories.rows.map(() => state.categories.columns.map(() => ''));
            renderCategories();
            update();
        });
        const workspace = element('floating-stats-window');
        workspace.addEventListener('input', saveStatsState);
        workspace.addEventListener('click', event => {
            if (event.target.closest('#stats-mode-tabs, #stats-stem-controls, #stats-clear, #stats-add-row, #stats-add-col, #stats-clear-categorical')) {
                saveStatsState();
            }
        });
        const titlebar = element('stats-titlebar');
        titlebar.addEventListener('pointerdown', event => {
            if (event.target.closest('button') || maximizedFrom || document.body.classList.contains('stats-standalone')) return;
            const win = element('floating-stats-window');
            const rect = win.getBoundingClientRect();
            window.dockManager.release('stats');
            applyDock('float');
            win.style.left = `${rect.left}px`;
            win.style.top = `${rect.top}px`;
            win.style.right = 'auto';
            const offsetX = event.clientX - rect.left, offsetY = event.clientY - rect.top;
            titlebar.setPointerCapture(event.pointerId);
            const move = moveEvent => {
                win.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, moveEvent.clientX - offsetX))}px`;
                win.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, moveEvent.clientY - offsetY))}px`;
            };
            const stop = () => { titlebar.removeEventListener('pointermove', move); };
            titlebar.addEventListener('pointermove', move);
            titlebar.addEventListener('pointerup', stop, { once: true });
            titlebar.addEventListener('pointercancel', stop, { once: true });
        });
        const resizer = element('stats-dock-resizer');
        resizer.addEventListener('pointerdown', event => {
            if (!state.dock) return;
            event.preventDefault();
            const side = state.dock;
            const start = event.clientX;
            const width = element('floating-stats-window').getBoundingClientRect().width;
            resizer.setPointerCapture(event.pointerId);
            const move = e => window.dockManager.resize('stats', width + (side === 'left' ? e.clientX - start : start - e.clientX));
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
