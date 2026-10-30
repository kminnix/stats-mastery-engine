let lastAnswer = 0;
let isDegreeMode = true;
let currentDockMode = 'bottom';
let isResolvingCalcCollision = false;

const calcHistory = [];
let historyIndex = -1;

function getMathField() {
    return document.getElementById('calc-mathfield');
}

function suppressMathLiveIcons() {
    if (window.mathVirtualKeyboard) {
        window.mathVirtualKeyboard.policy = "manual";
        window.mathVirtualKeyboard.visible = false;
    }
    const mf = getMathField();
    if (mf && mf.shadowRoot) {
        const toggles = mf.shadowRoot.querySelectorAll('.ML__virtual-keyboard-toggle, .ML__menu-toggle');
        toggles.forEach(t => t.style.display = 'none');
    }
}

function updateBodyDockGutters(mode) {
    document.body.classList.remove('calc-docked-bottom', 'calc-docked-left', 'calc-docked-right');
    if (mode === 'bottom') document.body.classList.add('calc-docked-bottom');
    if (mode === 'left') document.body.classList.add('calc-docked-left');
    if (mode === 'right') document.body.classList.add('calc-docked-right');
}

function setCalcDockMode(mode) {
    const dock = document.getElementById('calc-dock');
    if (!dock) return;

    currentDockMode = mode;
    dock.className = `dock-${mode}`;
    updateBodyDockGutters(mode);

    document.querySelectorAll('.calc-dock-controls .calc-header-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.calc-dock-controls button[onclick*="'${mode}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    dock.style.left = '';
    dock.style.top = '';
    dock.style.right = '';
    dock.style.bottom = '';
    dock.style.width = '';
    dock.style.height = '';

    if (mode === 'bottom') {
        const savedH = getComputedStyle(document.documentElement).getPropertyValue('--calc-dock-h').trim() || '340px';
        dock.style.height = savedH;
    }

    // Bidirectional exclusion: Move Tables if currently on this side
    if (!isResolvingCalcCollision) {
        isResolvingCalcCollision = true;
        const isTablesOnRight = document.body.classList.contains('snap-mode-right');
        const isTablesOnLeft = document.body.classList.contains('snap-mode-left');

        if (mode === 'right' && isTablesOnRight && typeof window.snapWindow === 'function') {
            window.snapWindow('left');
        } else if (mode === 'left' && isTablesOnLeft && typeof window.snapWindow === 'function') {
            window.snapWindow('right');
        }
        isResolvingCalcCollision = false;
    }

    const mf = getMathField();
    if (mf) mf.focus();
}
window.setCalcDockMode = setCalcDockMode;

function toggleCalculatorWindow() {
    const dock = document.getElementById('calc-dock');
    if (!dock) return;

    if (dock.style.display === 'flex') {
        closeCalculatorWindow();
    } else {
        dock.style.display = 'flex';
        
        // Check if Tables window is currently snapped and apply body clearance classes immediately
        const tablesWin = document.getElementById('floating-tables-window');
        if (tablesWin && tablesWin.style.display === 'flex') {
            if (tablesWin.classList.contains('is-snapped-left')) {
                document.body.classList.add('snap-mode-left');
            } else if (tablesWin.classList.contains('is-snapped-right')) {
                document.body.classList.add('snap-mode-right');
            }
        }

        setCalcDockMode(currentDockMode || 'bottom');
        suppressMathLiveIcons();
        const mf = getMathField();
        if (mf) setTimeout(() => mf.focus(), 60);
    }
}
window.toggleCalculatorWindow = toggleCalculatorWindow;
window.toggleCalculator = toggleCalculatorWindow;

function closeCalculatorWindow() {
    const dock = document.getElementById('calc-dock');
    if (dock) dock.style.display = 'none';
    document.body.classList.remove('calc-docked-bottom', 'calc-docked-left', 'calc-docked-right');
}
window.closeCalculatorWindow = closeCalculatorWindow;

function toggleKeypadBank(bank) {
    const mainBank = document.getElementById('calc-bank-main');
    const funcsBank = document.getElementById('calc-bank-funcs');
    if (bank === 'funcs') {
        mainBank.style.display = 'none';
        funcsBank.style.display = 'grid';
    } else {
        mainBank.style.display = 'grid';
        funcsBank.style.display = 'none';
    }
    const mf = getMathField();
    if (mf) mf.focus();
}
window.toggleKeypadBank = toggleKeypadBank;

function toggleCalculatorAngleMode() {
    isDegreeMode = !isDegreeMode;
    const btn = document.getElementById('calc-angle-btn');
    if (btn) btn.innerText = isDegreeMode ? 'DEG' : 'RAD';
}
window.toggleCalculatorAngleMode = toggleCalculatorAngleMode;

function calcInsert(text) {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', text]);
    mf.focus();
}
window.calcInsert = calcInsert;

function calcInsertFraction() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\frac{#?}{#?}']);
    mf.focus();
}
window.calcInsertFraction = calcInsertFraction;

function calcInsertSqrt() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\sqrt{#?}']);
    mf.focus();
}
window.calcInsertSqrt = calcInsertSqrt;

function calcInsertNthRoot() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\sqrt[#?]{#?}']);
    mf.focus();
}
window.calcInsertNthRoot = calcInsertNthRoot;

function calcInsertAbs() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '|#0|']);
    mf.focus();
}
window.calcInsertAbs = calcInsertAbs;

function calcInsertAns() {
    calcInsert(lastAnswer.toString());
}
window.calcInsertAns = calcInsertAns;

function calcClear() {
    const mf = getMathField();
    if (!mf) return;
    mf.setValue('');
    historyIndex = -1;
    mf.focus();
}
window.calcClear = calcClear;

function calcBackspace() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand('deleteBackward');
    mf.focus();
}
window.calcBackspace = calcBackspace;

function calcNav(dir) {
    const mf = getMathField();
    if (!mf) return;

    if (dir === 'up') {
        if (calcHistory.length > 0) {
            if (historyIndex === -1) {
                historyIndex = calcHistory.length - 1;
            } else if (historyIndex > 0) {
                historyIndex--;
            }
            mf.setValue(calcHistory[historyIndex].latex);
            mf.focus();
            return;
        }
    } else if (dir === 'down') {
        if (calcHistory.length > 0 && historyIndex !== -1) {
            if (historyIndex < calcHistory.length - 1) {
                historyIndex++;
                mf.setValue(calcHistory[historyIndex].latex);
            } else {
                historyIndex = -1;
                mf.setValue('');
            }
            mf.focus();
            return;
        }
    } else if (dir === 'left') {
        mf.executeCommand('moveToPreviousChar');
    } else if (dir === 'right') {
        mf.executeCommand('moveToNextChar');
    }
    mf.focus();
}
window.calcNav = calcNav;

function convertLatexFractions(expr) {
    let prev;
    let res = expr;
    do {
        prev = res;
        res = res.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
    } while (res !== prev);
    return res;
}

function latexToMathJs(latex) {
    let clean = latex;
    clean = clean.replace(/\\(mathrm|mathit|mathbf|text|operatorname)\{([^{}]+)\}/g, '$2')
                 .replace(/\\[,;!]|\\quad|\\qquad|\\enspace/g, ' ')
                 .replace(/\\left|\\right/g, '')
                 .replace(/\\placeholder\{([^{}]*)\}/g, '$1')
                 .replace(/\\placeholder/g, '');

    clean = convertLatexFractions(clean);
    clean = clean.replace(/\\times/g, '*')
                 .replace(/\\cdot/g, '*')
                 .replace(/\\ast/g, '*')
                 .replace(/\\div/g, '/')
                 .replace(/\\pi\b/g, 'pi')
                 .replace(/\\exponentialE\b|\\mathrm\{e\}\b/g, 'e')
                 .replace(/\\ln\b/g, 'log')
                 .replace(/\\log_\{?10\}?/g, 'log10')
                 .replace(/\\log\b/g, 'log10');

    while (/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/.test(clean)) {
        clean = clean.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, 'nthRoot($2, $1)');
    }
    clean = clean.replace(/\\sqrt\[([^\]]+)\]\s*([0-9.]+|[a-zA-Z]+)/g, 'nthRoot($2, $1)');

    while (/\\sqrt\s*\{([^{}]+)\}/.test(clean)) {
        clean = clean.replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');
    }
    clean = clean.replace(/\\sqrt\s*\(/g, 'sqrt(');
    clean = clean.replace(/\\sqrt\s*([0-9.]+|[a-zA-Z]+)/g, 'sqrt($1)');
    clean = clean.replace(/\\sqrt\{\s*\}/g, 'sqrt(0)').replace(/\\sqrt\b/g, 'sqrt');

    clean = clean.replace(/\\sin\b/g, 'sin')
                 .replace(/\\cos\b/g, 'cos')
                 .replace(/\\tan\b/g, 'tan')
                 .replace(/\\arcsin\b/g, 'asin')
                 .replace(/\\arccos\b/g, 'acos')
                 .replace(/\\arctan\b/g, 'atan')
                 .replace(/\\binom\{([^{}]+)\}\{([^{}]+)\}/g, 'combinations($1, $2)')
                 .replace(/nCr\b/g, 'combinations')
                 .replace(/nPr\b/g, 'permutations');

    clean = clean.replace(/\b(sin|cos|tan|asin|acos|atan|log|log10)\s+([0-9.]+|[a-zA-Z]+)/g, '$1($2)');
    clean = clean.replace(/\{/g, '(').replace(/\}/g, ')');
    clean = clean.replace(/(\d)\s*\(/g, '$1*(')
                 .replace(/\)\s*(\d)/g, ')*$1')
                 .replace(/\)\s*\(/g, ')*(')
                 .replace(/(\d)\s*(sqrt|sin|cos|tan|asin|acos|atan|log|pi|e)\b/g, '$1*$2')
                 .replace(/\)\s*(sqrt|sin|cos|tan|asin|acos|atan|log|pi|e)\b/g, ')*$1');

    if (isDegreeMode) {
        clean = clean
            .replace(/\basin\(([^)]+)\)/g, '(asin($1) * (180 / pi))')
            .replace(/\bacos\(([^)]+)\)/g, '(acos($1) * (180 / pi))')
            .replace(/\batan\(([^)]+)\)/g, '(atan($1) * (180 / pi))')
            .replace(/\bsin\(([^)]+)\)/g, 'sin(($1) * (pi / 180))')
            .replace(/\bcos\(([^)]+)\)/g, 'cos(($1) * (pi / 180))')
            .replace(/\btan\(([^)]+)\)/g, 'tan(($1) * (pi / 180))');
    }
    clean = clean.replace(/\\/g, '');
    return clean;
}

function addHistoryEntry(latex, result) {
    calcHistory.push({ latex, result });
    historyIndex = -1;

    const list = document.getElementById('calc-history-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'calc-history-row';

    const exprChip = document.createElement('span');
    exprChip.className = 'calc-history-chip calc-chip-expr';
    exprChip.title = 'Click to insert equation at cursor';
    exprChip.innerHTML = `\\(${latex}\\)`;
    exprChip.onclick = (e) => {
        e.stopPropagation();
        calcInsert(latex);
    };

    const eqSpan = document.createElement('span');
    eqSpan.innerText = '=';

    const resChip = document.createElement('span');
    resChip.className = 'calc-history-chip calc-chip-res';
    resChip.title = 'Click to insert answer at cursor';
    resChip.innerHTML = `\\(${result}\\)`;
    resChip.onclick = (e) => {
        e.stopPropagation();
        calcInsert(result.toString());
    };

    row.appendChild(exprChip);
    row.appendChild(eqSpan);
    row.appendChild(resChip);
    list.appendChild(row);

    if (window.renderMathInElement) {
        renderMathInElement(row, {
            delimiters: [{ left: '\\(', right: '\\)', display: false }],
            throwOnError: false
        });
    }

    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 10);
}

function calcEvaluate() {
    const mf = getMathField();
    if (!mf) return;
    const latex = mf.getValue();
    if (!latex.trim()) return;

    try {
        const mathjsExpr = latexToMathJs(latex);
        const rawResult = window.math ? window.math.evaluate(mathjsExpr) : eval(mathjsExpr);
        let formatted = rawResult;

        if (typeof rawResult === 'number') {
            formatted = parseFloat(rawResult.toFixed(10));
            lastAnswer = formatted;
        }

        addHistoryEntry(latex, formatted);
        mf.setValue(formatted.toString());
        mf.focus();
    } catch (err) {
        console.warn("Calculator error:", err, "Raw LaTeX:", latex);
        const list = document.getElementById('calc-history-list');
        if (list) {
            const errRow = document.createElement('div');
            errRow.className = 'calc-history-row';
            errRow.style.color = '#dc2626';
            errRow.innerText = 'Syntax Error';
            list.appendChild(errRow);
            list.scrollTop = list.scrollHeight;
        }
    }
}
window.calcEvaluate = calcEvaluate;

window.addEventListener('DOMContentLoaded', () => {
    suppressMathLiveIcons();
    const dock = document.getElementById('calc-dock');
    const titlebar = document.getElementById('calc-titlebar');
    const grip = document.getElementById('calc-resize-grip');
    const dockResizer = document.getElementById('calc-dock-resizer');
    const mf = getMathField();

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    if (titlebar) {
        titlebar.addEventListener('mousedown', (e) => {
            if (currentDockMode !== 'float') return;
            if (e.target.closest('button') || e.target.closest('math-field') || e.target.closest('.calc-history-list')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = dock.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            dock.style.right = 'auto';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            dock.style.left = `${Math.max(10, startLeft + dx)}px`;
            dock.style.top = `${Math.max(10, startTop + dy)}px`;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            document.body.style.userSelect = '';
        });
    }

    // Floating Corner Resize
    if (grip) {
        let isFloatResizing = false;
        let startFloatW, startFloatH, startFX, startFY;

        grip.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (currentDockMode !== 'float') return;

            isFloatResizing = true;
            startFX = e.clientX;
            startFY = e.clientY;
            const rect = dock.getBoundingClientRect();
            startFloatW = rect.width;
            startFloatH = rect.height;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isFloatResizing) return;
            const dw = e.clientX - startFX;
            const dh = e.clientY - startFY;
            dock.style.width = `${Math.max(340, startFloatW + dw)}px`;
            dock.style.height = `${Math.max(260, startFloatH + dh)}px`;
        });

        window.addEventListener('mouseup', () => {
            isFloatResizing = false;
            document.body.style.userSelect = '';
        });
    }

    // Docked Edge Resizing
    let isDockResizing = false;
    let dockResizeMode = '';
    let startDim = 0;
    let startCoord = 0;

    if (dockResizer) {
        dockResizer.addEventListener('mousedown', (e) => {
            if (currentDockMode === 'float') return;
            const rect = dock.getBoundingClientRect();
            isDockResizing = true;
            dockResizeMode = currentDockMode;
            startCoord = (currentDockMode === 'bottom') ? e.clientY : e.clientX;
            startDim = (currentDockMode === 'bottom') ? rect.height : rect.width;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = (currentDockMode === 'bottom') ? 'row-resize' : 'col-resize';
            e.preventDefault();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (!isDockResizing) return;

        if (dockResizeMode === 'bottom') {
            const dh = startCoord - e.clientY;
            const newH = Math.max(220, Math.min(window.innerHeight * 0.8, startDim + dh));
            dock.style.height = `${newH}px`;
            document.documentElement.style.setProperty('--calc-dock-h', `${newH}px`);
        } else if (dockResizeMode === 'right') {
            const dw = startCoord - e.clientX;
            const newW = Math.max(320, Math.min(window.innerWidth * 0.7, startDim + dw));
            dock.style.width = `${newW}px`;
            document.documentElement.style.setProperty('--calc-dock-w', `${newW}px`);
        } else if (dockResizeMode === 'left') {
            const dw = e.clientX - startCoord;
            const newW = Math.max(320, Math.min(window.innerWidth * 0.7, startDim + dw));
            dock.style.width = `${newW}px`;
            document.documentElement.style.setProperty('--calc-dock-w', `${newW}px`);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDockResizing) {
            isDockResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });

    if (mf) {
        mf.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                calcEvaluate();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                calcNav('up');
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                calcNav('down');
            }
        });
        mf.addEventListener('focus', () => {
            suppressMathLiveIcons();
        });
    }
});
