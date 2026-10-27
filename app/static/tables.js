function standardNormalCDF(z) {
    const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2.0);
    let prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    if (z > 0) prob = 1.0 - prob;
    return prob;
}

function renderTableA() {
    const modeEl = document.getElementById('table-a-mode');
    const table = document.getElementById('table-a-content');
    if (!modeEl || !table) return;

    const mode = modeEl.value;
    let html = '<thead><tr><th>z</th>';
    for (let c = 0; c <= 9; c++) {
        html += `<th>.0${c}</th>`;
    }
    html += '</tr></thead><tbody>';

    if (mode === 'positive') {
        for (let r = 0; r <= 34; r++) {
            const rowZ = r / 10.0;
            html += `<tr><td>${rowZ.toFixed(1)}</td>`;
            for (let c = 0; c <= 9; c++) {
                const z = rowZ + c / 100.0;
                html += `<td>${standardNormalCDF(z).toFixed(4)}</td>`;
            }
            html += '</tr>';
        }
    } else {
        for (let r = -34; r <= 0; r++) {
            const rowZ = r / 10.0;
            html += `<tr><td>${rowZ.toFixed(1)}</td>`;
            for (let c = 0; c <= 9; c++) {
                const z = rowZ - c / 100.0;
                html += `<td>${standardNormalCDF(z).toFixed(4)}</td>`;
            }
            html += '</tr>';
        }
    }
    html += '</tbody>';
    table.innerHTML = html;
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.window-tab-btn').forEach(b => b.classList.remove('active'));

    const pane = document.getElementById(tabId);
    const btn = document.getElementById('btn-' + tabId);

    if (pane) pane.classList.add('active');
    if (btn) btn.classList.add('active');

    if (window.renderMathInElement && pane) {
        window.renderMathInElement(pane, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }
}

function toggleFloatingWindow() {
    const win = document.getElementById('floating-tables-window');
    if (win.style.display === 'flex') {
        closeFloatingWindow();
    } else {
        win.style.display = 'flex';
        renderTableA();
        
        if (window.renderMathInElement) {
            window.renderMathInElement(win, {
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
    const win = document.getElementById('floating-tables-window');
    win.style.display = 'none';
    clearAllSnapStates(win);
}

// Memory of floating position & dimensions
let savedFloat = {
    left: 'auto',
    right: '25px',
    top: '75px',
    width: '600px',
    height: '520px'
};

function clearInlineStyles(win) {
    win.style.removeProperty('left');
    win.style.removeProperty('top');
    win.style.removeProperty('right');
    win.style.removeProperty('bottom');
    win.style.removeProperty('width');
    win.style.removeProperty('height');
}

function clearAllSnapStates(win) {
    win.classList.remove('is-snapped-left', 'is-snapped-right', 'is-maximized');
    document.body.classList.remove('snap-mode-left', 'snap-mode-right');
    
    const grip = document.getElementById('window-resize-grip');
    if (grip) grip.style.display = 'block';

    const maxBtn = document.getElementById('btn-maximize-restore');
    if (maxBtn) {
        maxBtn.innerText = '🗖';
        maxBtn.title = 'Full Screen / Maximize';
    }
}

function snapWindow(direction) {
    const win = document.getElementById('floating-tables-window');
    if (!win) return;

    if (direction === 'left' && win.classList.contains('is-snapped-left')) {
        restoreFloating(win);
        return;
    }
    if (direction === 'right' && win.classList.contains('is-snapped-right')) {
        restoreFloating(win);
        return;
    }

    if (!win.classList.contains('is-snapped-left') && 
        !win.classList.contains('is-snapped-right') && 
        !win.classList.contains('is-maximized')) {
        const rect = win.getBoundingClientRect();
        savedFloat = {
            left: rect.left + 'px',
            right: 'auto',
            top: rect.top + 'px',
            width: rect.width + 'px',
            height: rect.height + 'px'
        };
    }

    clearInlineStyles(win);
    clearAllSnapStates(win);

    const grip = document.getElementById('window-resize-grip');
    if (grip) grip.style.display = 'none';

    if (direction === 'left') {
        win.classList.add('is-snapped-left');
        document.body.classList.add('snap-mode-left');
    } else {
        win.classList.add('is-snapped-right');
        document.body.classList.add('snap-mode-right');
    }
}

function toggleMaximizeWindow() {
    const win = document.getElementById('floating-tables-window');
    if (!win) return;

    if (win.classList.contains('is-maximized')) {
        restoreFloating(win);
    } else {
        if (!win.classList.contains('is-snapped-left') && !win.classList.contains('is-snapped-right')) {
            const rect = win.getBoundingClientRect();
            savedFloat = {
                left: rect.left + 'px',
                right: 'auto',
                top: rect.top + 'px',
                width: rect.width + 'px',
                height: rect.height + 'px'
            };
        }

        clearInlineStyles(win);
        clearAllSnapStates(win);

        win.classList.add('is-maximized');
        const grip = document.getElementById('window-resize-grip');
        if (grip) grip.style.display = 'none';

        const maxBtn = document.getElementById('btn-maximize-restore');
        if (maxBtn) {
            maxBtn.innerText = '🗗';
            maxBtn.title = 'Restore Window';
        }
    }
}

function restoreFloating(win) {
    clearAllSnapStates(win);
    clearInlineStyles(win);

    win.style.left = savedFloat.left;
    win.style.top = savedFloat.top;
    win.style.right = savedFloat.right;
    win.style.width = savedFloat.width;
    win.style.height = savedFloat.height;
}

// 2D Drag & Corner Resize Handlers
window.addEventListener('DOMContentLoaded', () => {
    const win = document.getElementById('floating-tables-window');
    const titlebar = document.getElementById('window-titlebar');
    const resizeGrip = document.getElementById('window-resize-grip');
    if (!win || !titlebar) return;

    let isDragging = false;
    let isResizing = false;
    let startX, startY;
    let startWidth, startHeight;
    let startOffsetX, startOffsetY;

    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;

        if (win.classList.contains('is-snapped-left') || 
            win.classList.contains('is-snapped-right') || 
            win.classList.contains('is-maximized')) {
            const w = parseFloat(savedFloat.width) || 600;
            const h = parseFloat(savedFloat.height) || 520;
            clearAllSnapStates(win);
            clearInlineStyles(win);
            win.style.width = w + 'px';
            win.style.height = h + 'px';
            win.style.left = Math.max(10, e.clientX - w / 2) + 'px';
            win.style.top = Math.max(10, e.clientY - 20) + 'px';
        }

        isDragging = true;
        const rect = win.getBoundingClientRect();
        startOffsetX = e.clientX - rect.left;
        startOffsetY = e.clientY - rect.top;

        win.style.right = 'auto';
        win.style.left = rect.left + 'px';
        win.style.top = rect.top + 'px';
        document.body.style.userSelect = 'none';
    });

    if (resizeGrip) {
        resizeGrip.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = win.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            win.style.right = 'auto';
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';
            document.body.style.userSelect = 'none';
            e.stopPropagation();
            e.preventDefault();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const newLeft = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - startOffsetX));
            const newTop = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - startOffsetY));
            win.style.left = newLeft + 'px';
            win.style.top = newTop + 'px';
        } else if (isResizing) {
            const newWidth = Math.max(320, Math.min(window.innerWidth - 20, startWidth + (e.clientX - startX)));
            const newHeight = Math.max(240, Math.min(window.innerHeight - 20, startHeight + (e.clientY - startY)));
            win.style.width = newWidth + 'px';
            win.style.height = newHeight + 'px';
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDragging || isResizing) {
            const rect = win.getBoundingClientRect();
            savedFloat = {
                left: rect.left + 'px',
                right: 'auto',
                top: rect.top + 'px',
                width: rect.width + 'px',
                height: rect.height + 'px'
            };
        }
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
    });
});
