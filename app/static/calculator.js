let lastAnswer = 0;
let isDegreeMode = true;

// Teacher Permissions config: easily restrict functions later
window.TeacherCalcPermissions = {
    allowFractions: true,
    allowTrig: true,
    allowLogs: true,
    allowStats: true
};

function getMathField() {
    return document.getElementById('calc-mathfield');
}

function disableMathLiveDefaultKeyboard() {
    if (window.mathVirtualKeyboard) {
        window.mathVirtualKeyboard.policy = "manual";
        window.mathVirtualKeyboard.visible = false;
    }
}

function toggleCalculatorWindow() {
    const dock = document.getElementById('deltamath-calc-dock');
    if (dock.style.display === 'flex') {
        closeCalculatorWindow();
    } else {
        dock.style.display = 'flex';
        document.body.classList.add('calc-docked-active');
        disableMathLiveDefaultKeyboard();
        const mf = getMathField();
        if (mf) setTimeout(() => mf.focus(), 60);
    }
}

function closeCalculatorWindow() {
    const dock = document.getElementById('deltamath-calc-dock');
    dock.style.display = 'none';
    document.body.classList.remove('calc-docked-active');
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
    document.getElementById('calc-expression-preview').innerText = '';
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
    if (dir === 'left') mf.executeCommand('moveToPreviousChar');
    if (dir === 'right') mf.executeCommand('moveToNextChar');
    if (dir === 'up') mf.executeCommand('moveToPreviousPlaceholder');
    if (dir === 'down') mf.executeCommand('moveToNextPlaceholder');
    mf.focus();
}

function toggleExtendedFuncs(btn) {
    const mf = getMathField();
    // Quick popover for Trig / Log / Stats functions
    calcInsert('\\sin(');
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

        document.getElementById('calc-expression-preview').innerText = `${latex} = ${formatted}`;
        mf.setValue(formatted.toString());
        mf.focus();
    } catch (err) {
        document.getElementById('calc-expression-preview').innerText = 'Syntax Error';
    }
}

function calcToFraction() {
    const mf = getMathField();
    if (!mf) return;
    const val = parseFloat(mf.getValue());
    if (!isNaN(val)) {
        try {
            const frac = math.fraction(val);
            if (frac.d !== 1) {
                mf.setValue(`\\frac{${frac.n}}{${frac.d}}`);
            }
        } catch (e) {}
    }
}

window.addEventListener('DOMContentLoaded', () => {
    disableMathLiveDefaultKeyboard();
    const mf = getMathField();
    if (mf) {
        mf.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                calcEvaluate();
            }
        });
        mf.addEventListener('focus', () => {
            disableMathLiveDefaultKeyboard();
        });
    }
});
