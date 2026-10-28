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

    // 1. Immediately apply our own target dock state FIRST
    currentDockMode = mode;
    dock.className = `dock-${mode}`;
    updateBodyDockGutters(mode);

    document.querySelectorAll('.calc-dock-controls .calc-header-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.calc-dock-controls button[onclick*="'${mode}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (mode !== 'float') {
        dock.style.left = '';
        dock.style.top = '';
        dock.style.right = '';
        dock.style.bottom = '';
        dock.style.width = '';
        dock.style.height = '';
    }

    // 2. Safely resolve collision without re-triggering recursive loops
    if (!isResolvingCalcCollision) {
        isResolvingCalcCollision = true;
        const isTablesOnRight = document.body.classList.contains('snap-mode-right');
        const isTablesOnLeft = document.body.classList.contains('snap-mode-left');

        if (mode === 'right' && isTablesOnRight) {
            if (typeof window.snapWindow === 'function') {
                window.snapWindow('left');
            }
        } else if (mode === 'left' && isTablesOnLeft) {
            if (typeof window.snapWindow === 'function') {
                window.snapWindow('right');
            }
        }
        isResolvingCalcCollision = false;
    }

    const mf = getMathField();
    if (mf) mf.focus();
}
window.setCalcDockMode = setCalcDockMode;

function toggleCalculatorWindow() {
    const dock = document.getElementById('calc-dock');
    if (dock.style.display === 'flex') {
        closeCalculatorWindow();
    } else {
        dock.style.display = 'flex';
        setCalcDockMode(currentDockMode || 'bottom');
        suppressMathLiveIcons();
        const mf = getMathField();
        if (mf) setTimeout(() => mf.focus(), 60);
    }
}

function closeCalculatorWindow() {
    const dock = document.getElementById('calc-dock');
    dock.style.display = 'none';
    document.body.classList.remove('calc-docked-bottom', 'calc-docked-left', 'calc-docked-right');
}

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

function toggleCalculatorAngleMode() {
    isDegreeMode = !isDegreeMode;
    document.getElementById('calc-angle-btn').innerText = isDegreeMode ? 'DEG' : 'RAD';
}

function calcInsert(text) {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', text]);
    mf.focus();
}

function calcInsertFraction() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\frac{#?}{#?}']);
    mf.focus();
}

function calcInsertSqrt() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\sqrt{#?}']);
    mf.focus();
}

function calcInsertNthRoot() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\sqrt[#?]{#?}']);
    mf.focus();
}

function calcInsertAbs() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '|#0|']);
    mf.focus();
}

function calcInsertAns() {
    calcInsert(lastAnswer.toString());
}

function calcClear() {
    const mf = getMathField();
    if (!mf) return;
    mf.setValue('');
    historyIndex = -1;
    mf.focus();
}

function calcBackspace() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand('deleteBackward');
    mf.focus();
}

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
    clean = clean.replace(/\\sqrt\{\s*\}/g, 'sqrt(0)')
                 .replace(/\\sqrt\b/g, 'sqrt');

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

    setTimeout(() => {
        list.scrollTop = list.scrollHeight;
    }, 10);
}

function calcEvaluate() {
    const mf = getMathField();
    if (!mf) return;
    const latex = mf.getValue();
    if (!latex.trim()) return;

    try {
        const mathjsExpr = latexToMathJs(latex);
        const rawResult = math.evaluate(mathjsExpr);
        let formatted = rawResult;

        if (typeof rawResult === 'number') {
            formatted = parseFloat(rawResult.toFixed(10));
            lastAnswer = formatted;
        }

        addHistoryEntry(latex, formatted);
        mf.setValue(formatted.toString());
        mf.focus();
    } catch (err) {
        console.warn("Calculator evaluation error:", err, "Raw LaTeX:", latex);
        const list = document.getElementById('calc-history-list');
        const errRow = document.createElement('div');
        errRow.className = 'calc-history-row';
        errRow.style.color = '#dc2626';
        errRow.innerText = 'Syntax Error';
        list.appendChild(errRow);
        list.scrollTop = list.scrollHeight;
    }
}

// Drag & Dock Resizing Listeners
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

    // Floating Corner Resize for Calculator
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
            dock.style.height = `${Math.max(220, startFloatH + dh)}px`;
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
            const newH = Math.max(240, Math.min(window.innerHeight * 0.75, startDim + dh));
            document.documentElement.style.setProperty('--calc-dock-h', `${newH}px`);
        } else if (dockResizeMode === 'right') {
            const dw = startCoord - e.clientX;
            const newW = Math.max(320, Math.min(window.innerWidth * 0.7, startDim + dw));
            document.documentElement.style.setProperty('--calc-dock-w', `${newW}px`);
        } else if (dockResizeMode === 'left') {
            const dw = e.clientX - startCoord;
            const newW = Math.max(320, Math.min(window.innerWidth * 0.7, startDim + dw));
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
