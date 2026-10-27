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
        win.style.display = 'none';
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
    document.getElementById('floating-tables-window').style.display = 'none';
}

// 2D Movement & Corner Resizing Engines
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

    // Window Movement (Move by Titlebar)
    titlebar.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'button') return;
        isDragging = true;
        const rect = win.getBoundingClientRect();
        startOffsetX = e.clientX - rect.left;
        startOffsetY = e.clientY - rect.top;

        win.style.setProperty('right', 'auto', 'important');
        win.style.setProperty('left', rect.left + 'px', 'important');
        win.style.setProperty('top', rect.top + 'px', 'important');
        document.body.style.userSelect = 'none';
    });

    // Window Resizing (Corner Grip Drag)
    if (resizeGrip) {
        resizeGrip.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = win.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            win.style.setProperty('right', 'auto', 'important');
            win.style.setProperty('left', rect.left + 'px', 'important');
            win.style.setProperty('top', rect.top + 'px', 'important');
            document.body.style.userSelect = 'none';
            e.stopPropagation();
            e.preventDefault();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const newLeft = Math.max(10, Math.min(window.innerWidth - 80, e.clientX - startOffsetX));
            const newTop = Math.max(10, Math.min(window.innerHeight - 60, e.clientY - startOffsetY));
            win.style.setProperty('left', newLeft + 'px', 'important');
            win.style.setProperty('top', newTop + 'px', 'important');
        } else if (isResizing) {
            const newWidth = Math.max(320, Math.min(window.innerWidth - 40, startWidth + (e.clientX - startX)));
            const newHeight = Math.max(240, Math.min(window.innerHeight - 40, startHeight + (e.clientY - startY)));
            win.style.setProperty('width', newWidth + 'px', 'important');
            win.style.setProperty('height', newHeight + 'px', 'important');
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        isResizing = false;
        document.body.style.userSelect = '';
    });
});
