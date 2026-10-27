const STORAGE_KEY = 'komore_state_v7';
const TARGET_MASTERY = 5;
let currentProblem = null;
let isMultiStage = false;
let hadStageMistake = false;

let state = {
    selectedTopic: 'random',
    totalAttempted: 0,
    totalCorrect: 0,
    skills: {
        random:     { streak: 0, mastered: false },
        between:    { streak: 0, mastered: false },
        left_tail:  { streak: 0, mastered: false },
        right_tail: { streak: 0, mastered: false },
        inverse:    { streak: 0, mastered: false },
        ci_mean_t:  { streak: 0, mastered: false },
        ci_prop_z:  { streak: 0, mastered: false }
    }
};

function getActiveSkillState() {
    const topic = state.selectedTopic || 'random';
    if (!state.skills[topic]) state.skills[topic] = { streak: 0, mastered: false };
    return state.skills[topic];
}

function loadSavedState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state.selectedTopic = parsed.selectedTopic || 'random';
            state.totalAttempted = parsed.totalAttempted || 0;
            state.totalCorrect = parsed.totalCorrect || 0;
            if (parsed.skills) {
                for (let k in parsed.skills) {
                    if (state.skills[k]) state.skills[k] = parsed.skills[k];
                }
            }
        }
    } catch (e) {
        console.warn('localStorage not accessible');
    }
    document.getElementById('topic-select').value = state.selectedTopic;
    updateStatsUI();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    updateStatsUI();
}

function resetCurrentSkill() {
    const topic = state.selectedTopic || 'random';
    if (confirm("Reset streak for this skill?")) {
        state.skills[topic] = { streak: 0, mastered: false };
        saveState();
    }
}

function onTopicChange() {
    state.selectedTopic = document.getElementById('topic-select').value;
    saveState();
    loadProblem();
}

function updateStatsUI() {
    const pillEl = document.getElementById('mastery-pill');
    const statsEl = document.getElementById('session-stats');
    const skillState = getActiveSkillState();

    if (skillState.mastered || skillState.streak >= TARGET_MASTERY) {
        skillState.mastered = true;
        pillEl.className = 'mastery-badge mastered';
        pillEl.innerHTML = `&#10004; Mastered (${skillState.streak}/${TARGET_MASTERY})`;
    } else {
        pillEl.className = 'mastery-badge';
        pillEl.innerHTML = `Streak: <span>${skillState.streak}</span> / ${TARGET_MASTERY}`;
    }

    const acc = state.totalAttempted > 0 
        ? Math.round((state.totalCorrect / state.totalAttempted) * 100) 
        : 0;
    statsEl.innerText = `Attempts: ${state.totalAttempted} | Accuracy: ${acc}%`;
}

function triggerKaTeX(element) {
    if (window.renderMathInElement && element) {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false
        });
    }
}

function drawNormalDistribution(plotData) {
    const svg = document.getElementById('normal-curve-svg');
    svg.innerHTML = '';
    const width = 600, baselineY = 175, peakHeight = 140;
    const zMin = -3.5, zMax = 3.5;

    function zToX(z) { return ((z - zMin) / (zMax - zMin)) * (width - 80) + 40; }
    function gaussian(z) { return Math.exp(-0.5 * z * z); }
    function zToY(z) { return baselineY - gaussian(z) * peakHeight; }

    let startZ = zMin, endZ = zMax;
    if (plotData.type === 'between') {
        startZ = Math.max(zMin, Math.min(plotData.z1, zMax));
        endZ = Math.max(zMin, Math.min(plotData.z2, zMax));
    } else if (plotData.type === 'left_tail') {
        endZ = Math.max(zMin, Math.min(plotData.z, zMax));
    } else if (plotData.type === 'right_tail') {
        startZ = Math.max(zMin, Math.min(plotData.z, zMax));
    } else if (plotData.type === 'inverse') {
        if (plotData.is_top) startZ = Math.max(zMin, Math.min(plotData.z, zMax));
        else endZ = Math.max(zMin, Math.min(plotData.z, zMax));
    }

    let shadeD = `M ${zToX(startZ)} ${baselineY}`;
    for (let z = startZ; z <= endZ; z += 0.05) shadeD += ` L ${zToX(z)} ${zToY(z)}`;
    shadeD += ` L ${zToX(endZ)} ${baselineY} Z`;

    const shadePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shadePath.setAttribute("d", shadeD);
    shadePath.setAttribute("fill", "#93c5fd");
    shadePath.setAttribute("opacity", "0.65");
    svg.appendChild(shadePath);

    let curveD = `M ${zToX(zMin)} ${baselineY}`;
    for (let z = zMin; z <= zMax; z += 0.05) curveD += ` L ${zToX(z)} ${zToY(z)}`;
    const curvePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    curvePath.setAttribute("d", curveD);
    curvePath.setAttribute("fill", "none");
    curvePath.setAttribute("stroke", "#1e40af");
    curvePath.setAttribute("stroke-width", "2.5");
    svg.appendChild(curvePath);
}

async function loadProblem() {
    document.getElementById('feedback-banner').style.display = 'none';
    document.getElementById('solution-card').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';
    hadStageMistake = false;

    const topic = state.selectedTopic || 'random';
    isMultiStage = topic.startsWith('ci_');

    if (isMultiStage) {
        document.getElementById('single-input-panel').style.display = 'none';
        document.getElementById('multi-stage-panel').style.display = 'block';
        document.getElementById('graph-wrapper').style.display = 'none';
        
        const subTopic = topic.replace('ci_', '');
        const res = await fetch(`/api/problem/ci?topic=${encodeURIComponent(subTopic)}`);
        currentProblem = await res.json();
        renderMultiStageUI();
    } else {
        document.getElementById('single-input-panel').style.display = 'flex';
        document.getElementById('multi-stage-panel').style.display = 'none';
        document.getElementById('graph-wrapper').style.display = 'block';
        document.getElementById('submit-btn').style.display = 'inline-block';
        
        const input = document.getElementById('answer-input');
        input.disabled = false;
        input.value = '';

        const res = await fetch(`/api/problem/normal?topic=${encodeURIComponent(topic)}`);
        currentProblem = await res.json();

        document.getElementById('input-label').innerText = currentProblem.input_label || "Answer:";
        input.placeholder = currentProblem.placeholder || "e.g. 0.4532";
        input.focus();
    }

    const promptEl = document.getElementById('problem-prompt');
    promptEl.innerHTML = currentProblem.prompt;
    triggerKaTeX(promptEl);
}

function renderMultiStageUI() {
    const container = document.getElementById('multi-stage-panel');
    container.innerHTML = '';

    currentProblem.steps.forEach((step, idx) => {
        const box = document.createElement('div');
        box.id = `stage-box-${idx}`;
        box.className = idx === 0 ? 'stage-box active' : 'stage-box';
        if (idx > 0) box.style.opacity = '0.45';

        box.innerHTML = `
            <div class="stage-header">
                <span>Step ${step.step_num}: ${step.label}</span>
                <span id="stage-status-${idx}"></span>
            </div>
            <div class="input-row" style="margin: 6px 0 0 0;">
                <input type="number" step="any" id="stage-input-${idx}" placeholder="${step.placeholder}" ${idx > 0 ? 'disabled' : ''} autocomplete="off">
                <button id="stage-btn-${idx}" onclick="submitStage(${idx})" ${idx > 0 ? 'disabled' : ''}>Verify Step</button>
            </div>
            <div class="stage-hint">${step.hint}</div>
            <div id="stage-reveal-${idx}" class="revealed-msg" style="display: none;"></div>
        `;
        container.appendChild(box);
    });

    document.getElementById('stage-input-0').focus();
    document.getElementById('stage-input-0').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitStage(0);
    });
}

async function submitStage(idx) {
    const input = document.getElementById(`stage-input-${idx}`);
    const rawVal = input.value.trim();
    if (!rawVal) return;

    const userVal = parseFloat(rawVal);
    const step = currentProblem.steps[idx];

    const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_answer: userVal,
            expected_answers: step.expected,
            tolerance: step.tolerance
        })
    });
    const data = await res.json();
    const statusEl = document.getElementById(`stage-status-${idx}`);
    const box = document.getElementById(`stage-box-${idx}`);
    const revealEl = document.getElementById(`stage-reveal-${idx}`);

    if (data.correct) {
        statusEl.innerHTML = '<span style="color: #10b981;">&#10004; Correct</span>';
        box.className = 'stage-box completed';
        input.disabled = true;
        document.getElementById(`stage-btn-${idx}`).disabled = true;

        unlockNextStage(idx);
    } else {
        hadStageMistake = true;
        const skillState = getActiveSkillState();
        skillState.streak = 0;
        saveState();

        statusEl.innerHTML = '<span style="color: #d97706;">&#10008; Incorrect (Revealed)</span>';
        box.className = 'stage-box revealed';
        input.value = step.expected[0];
        input.disabled = true;
        document.getElementById(`stage-btn-${idx}`).disabled = true;
        revealEl.style.display = 'block';
        revealEl.innerText = `Expected value: ${step.expected[0]} (use this to proceed to the next step).`;

        unlockNextStage(idx);
    }
}

function unlockNextStage(idx) {
    if (idx + 1 < currentProblem.steps.length) {
        const nextBox = document.getElementById(`stage-box-${idx + 1}`);
        nextBox.className = 'stage-box active';
        nextBox.style.opacity = '1';
        const nextInput = document.getElementById(`stage-input-${idx + 1}`);
        const nextBtn = document.getElementById(`stage-btn-${idx + 1}`);
        nextInput.disabled = false;
        nextBtn.disabled = false;
        nextInput.focus();

        nextInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitStage(idx + 1);
        });
    } else {
        finalizeProblem(!hadStageMistake);
    }
}

async function submitSingleAnswer() {
    const rawVal = document.getElementById('answer-input').value.trim();
    if (!rawVal) return;

    const userVal = parseFloat(rawVal);
    const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_answer: userVal,
            expected_answers: currentProblem.expected_answers,
            tolerance: currentProblem.tolerance
        })
    });
    const data = await res.json();
    finalizeProblem(data.correct);

    document.getElementById('submit-btn').style.display = 'none';
    document.getElementById('answer-input').disabled = true;
}

function finalizeProblem(isSuccess) {
    const feedback = document.getElementById('feedback-banner');
    feedback.style.display = 'block';
    state.totalAttempted += 1;
    const skillState = getActiveSkillState();

    if (isSuccess) {
        skillState.streak += 1;
        state.totalCorrect += 1;
        feedback.className = 'banner correct';
        feedback.innerHTML = '&#10004; Problem complete! All steps solved cleanly.';
    } else {
        skillState.streak = 0;
        feedback.className = 'banner incorrect';
        feedback.innerHTML = '&#10008; Problem finished with step errors. Streak reset. Full derivation:';

        const solCard = document.getElementById('solution-card');
        const solContent = document.getElementById('solution-content');
        if (currentProblem.plot_data) drawNormalDistribution(currentProblem.plot_data);
        solContent.innerHTML = currentProblem.solution;
        triggerKaTeX(solContent);
        solCard.style.display = 'block';
    }

    saveState();
    document.getElementById('next-btn').style.display = 'inline-block';
    document.getElementById('next-btn').focus();
}

window.addEventListener('load', () => {
    loadSavedState();
    loadProblem();
    document.getElementById('answer-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitSingleAnswer();
    });
});
