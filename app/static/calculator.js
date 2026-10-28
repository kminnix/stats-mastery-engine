let lastAnswer = 0;
let isDegreeMode = true;
let isDockedMode = true;

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

function toggleCalculatorWindow() {
    const dock = document.getElementById('calc-dock');
    if (dock.style.display === 'flex') {
        closeCalculatorWindow();
    } else {
        dock.style.display = 'flex';
        if (isDockedMode) {
            document.body.classList.add('calc-docked-active');
        }
        suppressMathLiveIcons();
        const mf = getMathField();
        if (mf) setTimeout(() => mf.focus(), 60);
    }
}

function closeCalculatorWindow() {
    const dock = document.getElementById('calc-dock');
    dock.style.display = 'none';
    document.body.classList.remove('calc-docked-active');
}

function toggleCalculatorDock() {
    const dock = document.getElementById('calc-dock');
    const dockBtn = document.getElementById('calc-dock-btn');
    isDockedMode = !isDockedMode;

    if (isDockedMode) {
        dock.className = 'is-docked';
        dockBtn.innerText = '⬈';
        dockBtn.title = 'Undock / Float Window';
        document.body.classList.add('calc-docked-active');
        dock.style.left = '';
        dock.style.top = '';
        dock.style.right = '';
        dock.style.bottom = '';
    } else {
        dock.className = 'is-floating';
        dockBtn.innerText = '⬊';
        dockBtn.title = 'Dock to Bottom';
        document.body.classList.remove('calc-docked-active');
    }
    const mf = getMathField();
    if (mf) mf.focus();
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
    mf.executeCommand(['insert', '\\sqrt{#0}']);
    mf.focus();
}

function calcInsertNthRoot() {
    const mf = getMathField();
    if (!mf) return;
    mf.executeCommand(['insert', '\\sqrt[#?]{#0}']);
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
    clean = convertLatexFractions(clean);

    clean = clean.replace(/\\times/g, '*')
                 .replace(/\\cdot/g, '*')
                 .replace(/\\pi/g, 'pi')
                 .replace(/\\ln/g, 'log')
                 .replace(/\\log_\{10\}/g, 'log10')
                 .replace(/\\log/g, 'log10')
                 .replace(/\\sin/g, 'sin')
                 .replace(/\\cos/g, 'cos')
                 .replace(/\\tan/g, 'tan')
                 .replace(/\\arcsin/g, 'asin')
                 .replace(/\\arccos/g, 'acos')
                 .replace(/\\arctan/g, 'atan')
                 .replace(/\\sqrt\[(.*?)\]\{(.*?)\}/g, 'nthRoot($2, $1)')
                 .replace(/\\sqrt\{(.*?)\}/g, 'sqrt($1)')
                 .replace(/\\left/g, '')
                 .replace(/\\right/g, '')
                 .replace(/\{/g, '(')
                 .replace(/\}/g, ')');

    if (isDegreeMode) {
        clean = clean
            .replace(/sin\(([^)]+)\)/g, 'sin(($1) * (pi / 180))')
            .replace(/cos\(([^)]+)\)/g, 'cos(($1) * (pi / 180))')
            .replace(/tan\(([^)]+)\)/g, 'tan(($1) * (pi / 180))');
    }
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
        const list = document.getElementById('calc-history-list');
        const errRow = document.createElement('div');
        errRow.className = 'calc-history-row';
        errRow.style.color = '#dc2626';
        errRow.innerText = 'Syntax Error';
        list.appendChild(errRow);
        list.scrollTop = list.scrollHeight;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    suppressMathLiveIcons();
    const dock = document.getElementById('calc-dock');
    const titlebar = document.getElementById('calc-titlebar');
    const mf = getMathField();

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    if (titlebar) {
        titlebar.addEventListener('mousedown', (e) => {
            if (isDockedMode) return;
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
