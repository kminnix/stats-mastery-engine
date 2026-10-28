let isSnapped = false;
let isMaximized = false;
let isResolvingTableCollision = false;
let savedFloatingRect = { left: 'auto', top: '75px', right: '25px', width: '600px', height: '520px' };

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
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }
    }
}

function closeFloatingWindow() {
    const win = getFloatingWindow();
    if (!win) return;
    win.style.display = 'none';
    document.body.classList.remove('snap-mode-right', 'snap-mode-left');
    win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-maximized');
    isSnapped = false;
    isMaximized = false;
    const maxBtn = document.getElementById('btn-maximize-restore');
    if (maxBtn) {
        maxBtn.innerText = '🗖';
        maxBtn.title = 'Full Screen / Maximize';
    }
}

function snapWindow(side) {
    const win = getFloatingWindow();
    if (!win) return;

    if (win.style.display !== 'flex') {
        win.style.display = 'flex';
        renderTableA();
    }

    clearWindowInlineStyles(win);
    win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-maximized');
    document.body.classList.remove('snap-mode-right', 'snap-mode-left');

    // 1. Immediately apply our own target dock state FIRST
    if (side === 'right') {
        win.classList.add('is-snapped-right');
        document.body.classList.add('snap-mode-right');
    } else {
        win.classList.add('is-snapped-left');
        document.body.classList.add('snap-mode-left');
    }

    isSnapped = true;
    isMaximized = false;
    const maxBtn = document.getElementById('btn-maximize-restore');
    if (maxBtn) {
        maxBtn.innerText = '🗖';
        maxBtn.title = 'Full Screen / Maximize';
    }

    // 2. Safely resolve collision without re-triggering recursive loops
    if (!isResolvingTableCollision) {
        isResolvingTableCollision = true;
        const isCalcOnRight = document.body.classList.contains('calc-docked-right');
        const isCalcOnLeft = document.body.classList.contains('calc-docked-left');

        if (side === 'right' && isCalcOnRight) {
            if (typeof window.setCalcDockMode === 'function') {
                window.setCalcDockMode('left');
            }
        } else if (side === 'left' && isCalcOnLeft) {
            if (typeof window.setCalcDockMode === 'function') {
                window.setCalcDockMode('right');
            }
        }
        isResolvingTableCollision = false;
    }
}
window.snapWindow = snapWindow;

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
        document.body.classList.remove('snap-mode-right', 'snap-mode-left');
        win.classList.remove('is-snapped-right', 'is-snapped-left');
        win.classList.add('is-maximized');
        isMaximized = true;
        isSnapped = false;
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
}

function unsnapToFloating(clientX, clientY) {
    const win = getFloatingWindow();
    if (!win) return;

    win.classList.remove('is-snapped-right', 'is-snapped-left', 'is-maximized');
    document.body.classList.remove('snap-mode-right', 'snap-mode-left');
    isSnapped = false;
    isMaximized = false;

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
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

    const activePane = document.getElementById(tabId);
    if (activePane) activePane.classList.add('active');

    const tabKey = tabId.replace('tab-', 'btn-tab-');
    const activeBtn = document.getElementById(tabKey);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'tab-table-a') renderTableA();

    if (window.renderMathInElement && activePane) {
        renderMathInElement(activePane, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }
}

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
}

// 2D Drag & Resize Engine
window.addEventListener('DOMContentLoaded', () => {
    const win = getFloatingWindow();
    const titlebar = document.getElementById('window-titlebar');
    const grip = document.getElementById('window-resize-grip');
    const dockResizer = document.getElementById('tables-dock-resizer');
    if (!win || !titlebar) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button') return;

        if (isSnapped || isMaximized) {
            unsnapToFloating(e.clientX, e.clientY);
        }

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

    // Dedicated Edge Drag Resizer on the dock-resizer strip
    let isTablesDockResizing = false;
    let dockResizeSide = '';
    let startDockW = 0;
    let startDockX = 0;

    if (dockResizer) {
        dockResizer.addEventListener('mousedown', (e) => {
            const isRight = win.classList.contains('is-snapped-right');
            const isLeft = win.classList.contains('is-snapped-left');
            if (!isRight && !isLeft) return;

            const rect = win.getBoundingClientRect();
            isTablesDockResizing = true;
            dockResizeSide = isRight ? 'right' : 'left';
            startDockX = e.clientX;
            startDockW = rect.width;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            e.stopPropagation();
            e.preventDefault();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (!isTablesDockResizing) return;
        if (dockResizeSide === 'right') {
            const dw = startDockX - e.clientX;
            const newW = Math.max(320, Math.min(window.innerWidth * 0.7, startDockW + dw));
            document.documentElement.style.setProperty('--tables-dock-w', `${newW}px`);
        } else if (dockResizeSide === 'left') {
            const dw = e.clientX - startDockX;
            const newW = Math.max(320, Math.min(window.innerWidth * 0.7, startDockW + dw));
            document.documentElement.style.setProperty('--tables-dock-w', `${newW}px`);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isTablesDockResizing) {
            isTablesDockResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });

    // Floating corner grip
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
