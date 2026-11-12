(() => {
    const state = {
        mode: 'one',
        plot: { one: 'histogram', two: 'scatterplot' },
        rows: { one: [['']], two: [['', '']] },
        dock: null
    };
    const plots = {
        one: [['histogram', 'Histogram'], ['dotplot', 'Dotplot'], ['boxplot', 'Boxplot']],
        two: [['scatterplot', 'Scatterplot'], ['residual', 'Residual Plot'], ['residual-dotplot', 'Residual Dotplot']]
    };
    const ns = 'http://www.w3.org/2000/svg';
    const colors = { green: '#1E4D3B', brown: '#936037', cream: '#FAF8F3' };
    const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    const element = id => document.getElementById(id);
    const format = value => value === null || !Number.isFinite(value) ? '—' : Number(value.toPrecision(5)).toString();

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
            });
            tabs.appendChild(button);
        });
        renderRows();
        update();
    }

    function scale(min, max, start, end) {
        if (min === max) { min -= 1; max += 1; }
        const padding = (max - min) * 0.06;
        min -= padding;
        max += padding;
        return { min, max, at: value => start + (value - min) / (max - min) * (end - start) };
    }

    function axes(x, y, xLabel, yLabel) {
        svg('line', { x1: 65, y1: 305, x2: 610, y2: 305, stroke: colors.green });
        svg('line', { x1: 65, y1: 305, x2: 65, y2: 25, stroke: colors.green });
        for (let i = 0; i <= 4; i += 1) {
            const xv = x.min + (x.max - x.min) * i / 4;
            const yv = y.min + (y.max - y.min) * i / 4;
            svg('text', { x: x.at(xv), y: 323, 'text-anchor': 'middle' }, format(xv));
            svg('text', { x: 58, y: y.at(yv) + 4, 'text-anchor': 'end' }, format(yv));
        }
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
        const maxStack = Math.max(...counts);
        const y = scale(0, maxStack + 1, 305, 25);
        axes(x, y, label, 'Count');
        values.forEach((value, index) => svg('circle', {
            cx: x.at(value), cy: y.at(counts[index]), r: 5, fill: colors.brown
        }));
    }

    function drawOne(info) {
        const values = info.sorted;
        const plot = state.plot.one;
        if (plot === 'dotplot') return dotplot(values, 'X');
        const x = scale(info.min, info.max, 65, 610);
        if (plot === 'histogram') {
            const count = Math.max(1, Math.ceil(Math.sqrt(info.n)));
            const min = info.min, span = info.max - min || 1;
            const bins = Array(count).fill(0);
            values.forEach(value => { bins[Math.min(count - 1, Math.floor((value - min) / span * count))] += 1; });
            const y = scale(0, Math.max(...bins), 305, 25);
            axes(x, y, 'X', 'Frequency');
            bins.forEach((frequency, index) => {
                const left = min + span * index / count;
                const right = min + span * (index + 1) / count;
                svg('rect', { x: x.at(left), y: y.at(frequency), width: Math.max(1, x.at(right) - x.at(left)),
                    height: y.at(0) - y.at(frequency), fill: colors.green, stroke: colors.cream });
            });
            return;
        }
        if (info.iqr === null) return dotplot(values, 'X');
        const lowFence = info.q1 - 1.5 * info.iqr, highFence = info.q3 + 1.5 * info.iqr;
        const inside = values.filter(value => value >= lowFence && value <= highFence);
        svg('line', { x1: 65, y1: 280, x2: 610, y2: 280, stroke: colors.green });
        for (let i = 0; i <= 4; i += 1) {
            const value = x.min + (x.max - x.min) * i / 4;
            svg('text', { x: x.at(value), y: 305, 'text-anchor': 'middle' }, format(value));
        }
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
        const y = scale(Math.min(...ys), Math.max(...ys), 305, 25);
        axes(x, y, 'X', residual ? 'Residual' : 'Y');
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
        const output = element('stats-summary');
        output.replaceChildren();
        const error = element('stats-error');
        error.textContent = '';
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
            entries = [['n', x.n], ['x̄', x.mean], ['sx', x.sd], ['ȳ', y.mean], ['sy', y.sd],
                ['r', r], ['r²', r === null ? null : r * r]];
            if (slope !== null && Number.isFinite(slope) && Number.isFinite(intercept)) {
                const notation = window.getActiveLsrlNotation?.() || 'ab';
                const equation = notation === 'b0b1' ? 'ŷ = b₀ + b₁x' : 'ŷ = a + bx';
                const item = document.createElement('span');
                item.textContent = `${equation} = ${format(intercept)} ${slope < 0 ? '−' : '+'} ${format(Math.abs(slope))}x`;
                output.appendChild(item);
                drawTwo(data, { slope, intercept });
            } else {
                error.textContent = 'At least two distinct X values are needed for regression.';
                drawTwo(data, null);
            }
        }
        entries.forEach(([label, value]) => {
            const item = document.createElement('span');
            item.textContent = `${label}: ${format(value)}`;
            output.appendChild(item);
        });
    }

    function clearDock() {
        const win = element('floating-stats-window');
        win.classList.remove('stats-snap-left', 'stats-snap-right');
        document.body.classList.remove('stats-docked-left', 'stats-docked-right');
        state.dock = null;
    }
    window.floatStatsWindow = () => {
        const win = element('floating-stats-window');
        clearDock();
        win.style.left = '';
        win.style.top = '';
    };
    window.displaceStatsDock = side => {
        if (state.dock === side && element('floating-stats-window').style.display === 'flex') {
            const opposite = side === 'left' ? 'right' : 'left';
            const occupied = document.body.classList.contains(`calc-docked-${opposite}`)
                || document.body.classList.contains(`snap-mode-${opposite}`);
            if (!occupied && window.innerWidth >= 940) {
                window.snapStatsWindow(opposite);
            } else {
                window.closeStatsGrapherWindow();
            }
        }
    };
    window.snapStatsWindow = side => {
        const win = element('floating-stats-window');
        if (document.body.classList.contains(`calc-docked-${side}`) && typeof window.setCalcDockMode === 'function') {
            window.setCalcDockMode('bottom');
        }
        if (document.body.classList.contains(`snap-mode-${side}`) && typeof window.closeFloatingWindow === 'function') {
            window.closeFloatingWindow();
        }
        clearDock();
        win.style.left = '';
        win.style.top = '';
        win.classList.add(`stats-snap-${side}`);
        document.body.classList.add(`stats-docked-${side}`);
        state.dock = side;
    };
    window.closeStatsGrapherWindow = () => {
        element('floating-stats-window').style.display = 'none';
        clearDock();
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
        element('stats-mode-tabs').addEventListener('click', event => {
            const mode = event.target.dataset.mode;
            if (plots[mode]) setMode(mode);
        });
        element('stats-clear').addEventListener('click', () => {
            state.rows[state.mode] = Array.from({ length: 6 }, () => state.mode === 'one' ? [''] : ['', '']);
            setMode(state.mode);
        });
        const titlebar = element('stats-titlebar');
        titlebar.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;
            const win = element('floating-stats-window');
            const rect = win.getBoundingClientRect();
            clearDock();
            win.style.left = `${rect.left}px`;
            win.style.top = `${rect.top}px`;
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
        window.addEventListener('lsrl-notation-change', update);
        setMode('one');
    });
})();
