let isSnapped = false;
let isMaximized = false;
let currentTablesDock = '';
let savedFloatingRect = { left: 'auto', top: '75px', right: '25px', width: '600px', height: '520px' };
const crosshairListeners = new WeakSet();
const crosshairSelections = new WeakMap();

function clearTableCrosshairs(table) {
    table.querySelectorAll('th, td').forEach(cell => {
        cell.classList.remove('hl-line', 'hl-header', 'hl-cell');
    });
    crosshairSelections.set(table, { selectedRowIdx: null, selectedColIdx: null });
}

function applyTableHighlights(table, selectedRowIdx, selectedColIdx) {
    table.querySelectorAll('th, td').forEach(cell => {
        cell.classList.remove('hl-line', 'hl-header', 'hl-cell');
    });

    const body = table.tBodies[0];
    if (selectedRowIdx !== null) {
        const row = body?.rows[selectedRowIdx];
        if (row) {
            Array.from(row.cells).forEach(cell => cell.classList.add('hl-line'));
            row.cells[0]?.classList.add('hl-header');
        }
    }

    if (selectedColIdx !== null) {
        const headerRows = table.tHead?.rows;
        headerRows?.[0]?.cells[selectedColIdx]?.classList.add('hl-header');
        if (headerRows?.[1] && selectedColIdx > 0) {
            headerRows[1].cells[selectedColIdx - 1]?.classList.add('hl-header');
        }
        Array.from(body?.rows || []).forEach(row => {
            row.cells[selectedColIdx]?.classList.add('hl-line');
        });
    }

    if (selectedRowIdx !== null && selectedColIdx !== null) {
        const intersection = body?.rows[selectedRowIdx]?.cells[selectedColIdx];
        intersection?.classList.remove('hl-line');
        intersection?.classList.add('hl-cell');
    }
}

function attachTableCrosshairs() {
    document.querySelectorAll('#tab-table-a .ap-table, #tab-table-b .ap-table, #tab-table-c .ap-table')
        .forEach(table => {
            if (crosshairListeners.has(table)) return;
            crosshairListeners.add(table);
            crosshairSelections.set(table, { selectedRowIdx: null, selectedColIdx: null });
            table.addEventListener('click', event => {
                const cell = event.target.closest('td, th');
                if (!cell || cell.closest('table') !== table) return;

                const row = cell.parentElement;
                const selection = crosshairSelections.get(table)
                    || { selectedRowIdx: null, selectedColIdx: null };
                let { selectedRowIdx, selectedColIdx } = selection;

                if (cell.tagName === 'TD' && row.parentElement.tagName === 'TBODY') {
                    const rowIdx = Array.prototype.indexOf.call(table.tBodies[0].rows, row);
                    const colIdx = cell.cellIndex;
                    if (colIdx === 0) {
                        selectedRowIdx = selectedRowIdx === rowIdx ? null : rowIdx;
                    } else if (selectedRowIdx === rowIdx && selectedColIdx === colIdx) {
                        selectedRowIdx = null;
                        selectedColIdx = null;
                    } else {
                        selectedRowIdx = rowIdx;
                        selectedColIdx = colIdx;
                    }
                } else if (cell.tagName === 'TH' && row.parentElement.tagName === 'THEAD') {
                    const colIdx = row.sectionRowIndex === 0 ? cell.cellIndex : cell.cellIndex + 1;
                    if (colIdx <= 0) return;
                    selectedColIdx = selectedColIdx === colIdx ? null : colIdx;
                } else if (cell.tagName === 'TH' && row.parentElement.tagName === 'TBODY'
                    && cell.cellIndex === 0) {
                    const rowIdx = Array.prototype.indexOf.call(table.tBodies[0].rows, row);
                    selectedRowIdx = selectedRowIdx === rowIdx ? null : rowIdx;
                } else {
                    return;
                }

                crosshairSelections.set(table, { selectedRowIdx, selectedColIdx });
                applyTableHighlights(table, selectedRowIdx, selectedColIdx);
            });
        });
}

function getFloatingWindow() {
    return document.getElementById('floating-tables-window');
}

function clearWindowInlineStyles(win) {
    win.style.left = '';
    win.style.top = '';
    win.style.right = '';
    win.style.bottom = '';
    win.style.width = '';
    win.style.height = '';
}

function toggleFloatingWindow() {
    const win = getFloatingWindow();
    if (!win) return;
    if (win.style.display === 'flex') {
        closeFloatingWindow();
    } else {
        win.style.display = 'flex';
        renderTableA();
        const activePane = document.querySelector('.tab-pane.active');
        if (activePane && window.renderMathInElement) {
            renderMathInElement(activePane, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }
    }
}
window.toggleFloatingWindow = toggleFloatingWindow;

function closeFloatingWindow() {
    const win = getFloatingWindow();
    if (!win) return;
    win.style.display = 'none';
    window.dockManager.release('tables');
    document.body.classList.remove('snap-mode-right', 'snap-mode-left', 'snap-mode-bottom');
    win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-snapped-bottom', 'is-maximized');
    isSnapped = false;
    isMaximized = false;
    currentTablesDock = '';
    const maxBtn = document.getElementById('btn-maximize-restore');
    if (maxBtn) {
        maxBtn.innerText = '🗖';
        maxBtn.title = 'Full Screen / Maximize';
    }
}
window.closeFloatingWindow = closeFloatingWindow;

function popOutTablesWindow() {
    const popup = window.open('/tables-tool', '_blank');
    if (!popup) {
        alert('The tables pop-out was blocked. Allow pop-ups and try again.');
        return;
    }
    popup.opener = null;
    closeFloatingWindow();
}
window.popOutTablesWindow = popOutTablesWindow;

function applyTablesDock(side) {
    const win = getFloatingWindow();
    if (!win) return;
    clearWindowInlineStyles(win);
    win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-snapped-bottom', 'is-maximized');
    document.body.classList.remove('snap-mode-right', 'snap-mode-left', 'snap-mode-bottom');
    if (side !== 'float') {
        win.classList.add(`is-snapped-${side}`);
        document.body.classList.add(`snap-mode-${side}`);
    }
    currentTablesDock = side === 'float' ? '' : side;
    isSnapped = side !== 'float';
    isMaximized = false;
    const maxBtn = document.getElementById('btn-maximize-restore');
    if (maxBtn) {
        maxBtn.innerText = '🗖';
        maxBtn.title = 'Full Screen / Maximize';
    }

}
window.dockManager.register('tables', applyTablesDock);
function floatTablesWindow() {
    window.dockManager.set('tables', 'float');
}
window.floatTablesWindow = floatTablesWindow;

function snapWindow(side) {
    const win = getFloatingWindow();
    if (!win) return;
    if (win.style.display !== 'flex') {
        win.style.display = 'flex';
        renderTableA();
    }
    window.dockManager.set('tables', side);
}
window.snapWindow = snapWindow;
window.getTablesDockMode = () => currentTablesDock;

function toggleMaximizeWindow() {
    const win = getFloatingWindow();
    const btn = document.getElementById('btn-maximize-restore');
    if (!win) return;

    if (!isMaximized) {
        if (!isSnapped) {
            const rect = win.getBoundingClientRect();
            savedFloatingRect = {
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                right: 'auto',
                width: `${rect.width}px`,
                height: `${rect.height}px`
            };
        }
        clearWindowInlineStyles(win);
        window.dockManager.release('tables');
        document.body.classList.remove('snap-mode-right', 'snap-mode-left', 'snap-mode-bottom');
        win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-snapped-bottom');
        win.classList.add('is-maximized');
        isMaximized = true;
        isSnapped = false;
        currentTablesDock = '';
        if (btn) {
            btn.innerText = '🗗';
            btn.title = 'Restore Window Size';
        }
    } else {
        win.classList.remove('is-maximized');
        isMaximized = false;
        if (btn) {
            btn.innerText = '🗖';
            btn.title = 'Full Screen / Maximize';
        }
        clearWindowInlineStyles(win);
        win.style.left = savedFloatingRect.left || 'auto';
        win.style.top = savedFloatingRect.top || '75px';
        win.style.right = savedFloatingRect.right || '25px';
        win.style.width = savedFloatingRect.width || '600px';
        win.style.height = savedFloatingRect.height || '520px';
    }
    window.dockManager.reflow();
}
window.toggleMaximizeWindow = toggleMaximizeWindow;

function unsnapToFloating(clientX, clientY) {
    const win = getFloatingWindow();
    if (!win) return;

    window.dockManager.release('tables');
    win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-snapped-bottom', 'is-maximized');
    document.body.classList.remove('snap-mode-right', 'snap-mode-left', 'snap-mode-bottom');
    isSnapped = false;
    isMaximized = false;
    currentTablesDock = '';

    const maxBtn = document.getElementById('btn-maximize-restore');
    if (maxBtn) {
        maxBtn.innerText = '🗖';
        maxBtn.title = 'Full Screen / Maximize';
    }

    clearWindowInlineStyles(win);
    win.style.width = '600px';
    win.style.height = '520px';
    win.style.left = `${Math.max(10, clientX - 300)}px`;
    win.style.top = `${Math.max(10, clientY - 18)}px`;
}

function switchTab(tabId) {
    document.querySelectorAll('.window-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });

    const activePane = document.getElementById(tabId);
    if (activePane) {
        activePane.classList.add('active');
        activePane.style.display = 'block';
    }

    const tabKey = tabId.replace('tab-', 'btn-tab-');
    const activeBtn = document.getElementById(tabKey);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'tab-table-a') renderTableA();
    attachTableCrosshairs();

    if (window.renderMathInElement && activePane) {
        renderMathInElement(activePane, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }
}
window.switchTab = switchTab;

function normalCDF(z) {
    const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937, b4 = -1.821255978, b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.39894228;
    if (z >= 0.0) {
        const t = 1.0 / (1.0 + p * z);
        return (1.0 - c * Math.exp(-z * z / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    } else {
        const t = 1.0 / (1.0 - p * z);
        return (c * Math.exp(-z * z / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    }
}

function renderTableA() {
    const modeSelect = document.getElementById('table-a-mode');
    const mode = modeSelect ? modeSelect.value : 'positive';
    const tableEl = document.getElementById('table-a-content');
    if (!tableEl) return;
    clearTableCrosshairs(tableEl);

    const cols = [0.00, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09];
    let html = '<thead><tr><th>z</th>';
    cols.forEach(c => html += `<th>${c.toFixed(2).substring(1)}</th>`);
    html += '</tr></thead><tbody>';

    if (mode === 'positive') {
        for (let row = 0; row <= 34; row++) {
            const zRow = (row / 10).toFixed(1);
            html += `<tr><td>${zRow}</td>`;
            cols.forEach(c => {
                const zVal = parseFloat(zRow) + c;
                html += `<td>${normalCDF(zVal).toFixed(4).substring(1)}</td>`;
            });
            html += '</tr>';
        }
    } else {
        for (let row = -34; row <= 0; row++) {
            const zRow = (row / 10).toFixed(1);
            html += `<tr><td>${zRow}</td>`;
            cols.forEach(c => {
                const zVal = parseFloat(zRow) - c;
                html += `<td>${normalCDF(zVal).toFixed(4).substring(1)}</td>`;
            });
            html += '</tr>';
        }
    }
    html += '</tbody>';
    tableEl.innerHTML = html;
    attachTableCrosshairs();

    const tablePane = tableEl.closest('.tab-pane');
    if (window.renderMathInElement && tablePane) {
        renderMathInElement(tablePane, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }
}
window.renderTableA = renderTableA;

window.addEventListener('DOMContentLoaded', () => {
    attachTableCrosshairs();
    const win = getFloatingWindow();
    const titlebar = document.getElementById('window-titlebar');
    const grip = document.getElementById('window-resize-grip');
    const dockResizer = document.getElementById('tables-dock-resizer');
    if (!win || !titlebar) return;
    if (document.body.classList.contains('tables-standalone')) {
        win.style.display = 'flex';
        renderTableA();
        if (window.renderMathInElement) {
            renderMathInElement(win, { delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false }
            ], throwOnError: false });
        }
    }

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        if (isSnapped || isMaximized) unsnapToFloating(e.clientX, e.clientY);

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = win.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        win.style.right = 'auto';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        win.style.left = `${Math.max(10, startLeft + dx)}px`;
        win.style.top = `${Math.max(10, startTop + dy)}px`;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.userSelect = '';
    });

    // Dock Edge Resizing
    let isTablesDockResizing = false;
    let dockResizeSide = '';
    let startDockW = 0;
    let startDockX = 0;
    let startDockH = 0;
    let startDockY = 0;

    if (dockResizer) {
        dockResizer.addEventListener('mousedown', (e) => {
            const isRight = win.classList.contains('is-snapped-right');
            const isLeft = win.classList.contains('is-snapped-left');
            const isBottom = win.classList.contains('is-snapped-bottom');
            if (!isRight && !isLeft && !isBottom) return;

            const rect = win.getBoundingClientRect();
            isTablesDockResizing = true;
            dockResizeSide = isBottom ? 'bottom' : isRight ? 'right' : 'left';
            startDockX = e.clientX;
            startDockW = rect.width;
            startDockY = e.clientY;
            startDockH = rect.height;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = isBottom ? 'row-resize' : 'col-resize';
            e.stopPropagation();
            e.preventDefault();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (!isTablesDockResizing) return;
        if (dockResizeSide === 'right') {
            const dw = startDockX - e.clientX;
            window.dockManager.resize('tables', startDockW + dw);
        } else if (dockResizeSide === 'left') {
            const dw = e.clientX - startDockX;
            window.dockManager.resize('tables', startDockW + dw);
        } else if (dockResizeSide === 'bottom') {
            window.dockManager.resize('tables', startDockH + startDockY - e.clientY);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isTablesDockResizing) {
            isTablesDockResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });

    // Floating Corner Grip
    if (grip) {
        let isResizing = false;
        let startRWidth, startRHeight, startRX, startRY;

        grip.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (isSnapped || isMaximized) return;

            isResizing = true;
            startRX = e.clientX;
            startRY = e.clientY;
            const rect = win.getBoundingClientRect();
            startRWidth = rect.width;
            startRHeight = rect.height;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dw = e.clientX - startRX;
            const dh = e.clientY - startRY;
            win.style.width = `${Math.max(320, startRWidth + dw)}px`;
            win.style.height = `${Math.max(240, startRHeight + dh)}px`;
        });

        window.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.userSelect = '';
        });
    }
});
