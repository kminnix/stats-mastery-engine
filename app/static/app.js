const STORAGE_KEY = 'qederam_state_v1';
const TARGET_MASTERY = 5;
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('task_id');

let currentProblem = null;
let isMultiStage = false;
let hadStageMistake = false;
let currentQuestionAnswers = [];
let currentUser = null;
let currentSession = null;
let supabaseClient = null;
let taskRunnerState = null;

if (window.SUPABASE_URL && window.SUPABASE_KEY && window.supabase) {
    try {
        supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    } catch (e) {
        console.warn("Supabase init error:", e);
    }
}

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

function getTaskTopics(task) {
    const supportedTopics = ['random', 'between', 'left_tail', 'right_tail', 'inverse', 'ci_mean_t', 'ci_prop_z'];
    const configuredTopics = Array.isArray(task.config?.topics) ? task.config.topics : [];
    return configuredTopics.filter(topic => supportedTopics.includes(topic));
}

function updateTaskRunnerUI() {
    const topicSelector = document.querySelector('.topic-selector-wrapper');
    const banner = document.getElementById('task-runner-banner');
    if (!taskRunnerState) {
        if (topicSelector) topicSelector.style.display = '';
        if (banner) banner.style.display = 'none';
        return;
    }

    if (topicSelector) topicSelector.style.display = 'none';
    if (banner) banner.style.display = 'flex';
    document.getElementById('task-title-display').textContent = `Task: ${taskRunnerState.title}`;
    const questionNumber = Math.min(taskRunnerState.currentQuestionIndex + 1, taskRunnerState.totalQuestions);
    document.getElementById('task-progress-display').textContent =
        `Question ${questionNumber} of ${taskRunnerState.totalQuestions}`;
    const progressTrack = banner.querySelector('[role="progressbar"]');
    const progressFill = document.getElementById('task-progress-fill');
    const progress = taskRunnerState.currentQuestionIndex / taskRunnerState.totalQuestions;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(taskRunnerState.currentQuestionIndex));
    if (progressTrack) progressTrack.setAttribute('aria-valuemax', String(taskRunnerState.totalQuestions));
    if (progressFill) progressFill.style.width = `${progress * 100}%`;
}

function selectTaskTopic() {
    if (!taskRunnerState || taskRunnerState.topics.length === 0) return;
    const topic = taskRunnerState.topics[taskRunnerState.currentQuestionIndex % taskRunnerState.topics.length];
    state.selectedTopic = topic;
    const topicSelect = document.getElementById('topic-select');
    if (topicSelect) topicSelect.value = topic;
}

function removeTaskIdFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('task_id');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function startAssignedTask(assignedTaskId) {
    if (!currentUser) throw new Error('Sign in with your student account to start this task.');

    const headers = { 'Content-Type': 'application/json' };
    if (currentSession?.access_token) headers.Authorization = `Bearer ${currentSession.access_token}`;
    const response = await fetch(`/api/student/tasks/${encodeURIComponent(currentUser.id)}`, { headers });
    if (!response.ok) throw new Error(`Could not load assigned tasks (${response.status}).`);

    const tasks = await response.json();
    const task = tasks.find(item => String(item.assessment_id) === String(assignedTaskId));
    if (!task) throw new Error('This task is not assigned to your account or is no longer active.');

    const topics = getTaskTopics(task);
    const configuredCount = Number(task.config?.count);
    const totalQuestions = Number.isInteger(configuredCount) && configuredCount > 0 ? configuredCount : 5;
    taskRunnerState = {
        taskId: task.assessment_id,
        totalQuestions,
        currentQuestionIndex: 0,
        score: 0,
        answers: [],
        isTest: (task.task_type || task.type) === 'test',
        title: task.title,
        topics: topics.length ? topics : ['random'],
        previousTopic: state.selectedTopic,
        isSubmitting: false,
        submitted: false
    };

    document.getElementById('task-completion-card').style.display = 'none';
    document.getElementById('task-submission-status').textContent = '';
    document.getElementById('task-retry-submit').style.display = 'none';
    document.getElementById('student-practice-view').style.display = 'block';
    const tasksView = document.getElementById('student-tasks-view');
    if (tasksView) tasksView.style.display = 'none';
    const practiceTab = document.getElementById('tab-practice-btn');
    const tasksTab = document.getElementById('tab-tasks-btn');
    if (practiceTab) practiceTab.classList.add('active');
    if (tasksTab) tasksTab.classList.remove('active');

    selectTaskTopic();
    updateTaskRunnerUI();
    await loadProblem();
}

function launchTask(assignedTaskId) {
    window.location.search = `?task_id=${encodeURIComponent(assignedTaskId)}`;
}
window.launchTask = launchTask;

function exitTask() {
    if (!taskRunnerState) return;
    const previousTopic = taskRunnerState.previousTopic;
    taskRunnerState = null;
    state.selectedTopic = previousTopic || 'random';
    const topicSelect = document.getElementById('topic-select');
    if (topicSelect) topicSelect.value = state.selectedTopic;
    saveState();
    const nextBtn = document.getElementById('next-btn');
    nextBtn.innerText = 'Next Problem →';
    nextBtn.onclick = loadProblem;
    updateTaskRunnerUI();
    document.getElementById('task-completion-card').style.display = 'none';
    removeTaskIdFromUrl();
    loadProblem();
}
window.exitTask = exitTask;

function loadNextTaskQuestion() {
    if (!taskRunnerState || taskRunnerState.currentQuestionIndex >= taskRunnerState.totalQuestions) return;
    selectTaskTopic();
    loadProblem();
}

async function submitTaskResults() {
    if (!taskRunnerState || taskRunnerState.isSubmitting) return;
    if (!supabaseClient || !currentUser) {
        throw new Error('You must be signed in to submit this task.');
    }

    taskRunnerState.isSubmitting = true;
    const retryButton = document.getElementById('task-retry-submit');
    if (retryButton) retryButton.style.display = 'none';
    try {
        const { error } = await supabaseClient.from('assessment_submissions').upsert({
            assessment_id: taskRunnerState.taskId,
            student_id: currentUser.id,
            status: 'submitted',
            score: Math.round((taskRunnerState.score / taskRunnerState.totalQuestions) * 100)
        }, { onConflict: 'assessment_id,student_id' });
        if (error) throw error;

        taskRunnerState.submitted = true;
        document.getElementById('task-submission-status').textContent = 'Your results were submitted.';
        if (retryButton) retryButton.style.display = 'none';
    } finally {
        taskRunnerState.isSubmitting = false;
    }
}

async function retryTaskSubmission() {
    try {
        await submitTaskResults();
    } catch (error) {
        console.error('Task submission failed:', error);
        document.getElementById('task-submission-status').textContent =
            'We could not submit your results. Check your connection and try again.';
        document.getElementById('task-retry-submit').style.display = 'inline-block';
    }
}
window.retryTaskSubmission = retryTaskSubmission;

function returnToTaskDashboard() {
    if (taskRunnerState && !taskRunnerState.submitted) {
        document.getElementById('task-submission-status').textContent =
            'Submit your results before returning to the dashboard.';
        return;
    }
    if (taskRunnerState) {
        state.selectedTopic = taskRunnerState.previousTopic || 'random';
        const topicSelect = document.getElementById('topic-select');
        if (topicSelect) topicSelect.value = state.selectedTopic;
        saveState();
        taskRunnerState = null;
    }
    updateTaskRunnerUI();
    removeTaskIdFromUrl();
    document.getElementById('task-completion-card').style.display = 'none';
    if (typeof switchStudentTab === 'function') switchStudentTab('tasks');
}
window.returnToTaskDashboard = returnToTaskDashboard;

function getActiveSkillState() {
    const topic = state.selectedTopic || 'random';
    if (!state.skills[topic]) state.skills[topic] = { streak: 0, mastered: false };
    return state.skills[topic];
}

// Authentication
async function initAuth() {
    if (!supabaseClient) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    await handleSession(session);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
    });
}

async function handleSession(session) {
    window.currentSession = session;
    window.currentUser = session ? session.user : null;
    currentSession = session;
    currentUser = session ? session.user : null;
    const authBtnLabel = document.getElementById('auth-user-label');
    const teacherBtn = document.getElementById('teacher-portal-btn');
    
    if (currentUser) {
        const name = currentUser.user_metadata?.full_name || currentUser.email || 'User';
        if (authBtnLabel) authBtnLabel.innerText = `${name} (Sign Out)`;

        // Check if user is a teacher
        try {
            const { data } = await supabaseClient
                .from('profiles')
                .select('role')
                .eq('id', currentUser.id)
                .single();

            if (data && data.role === 'teacher') {
                if (teacherBtn) teacherBtn.style.display = 'inline-block';
            } else {
                if (teacherBtn) teacherBtn.style.display = 'none';
            }
        } catch (e) {
            console.warn("Role lookup failed:", e);
            if (teacherBtn) teacherBtn.style.display = 'none';
        }

        loadCloudState();
    } else {
        if (authBtnLabel) authBtnLabel.innerText = 'Sign In';
        if (teacherBtn) teacherBtn.style.display = 'none';
        loadSavedState();
    }
}

async function toggleAuth() {
    if (!supabaseClient) {
        alert("Supabase is not configured.");
        return;
    }
    if (currentUser) {
        if (confirm("Sign out of your account?")) {
            await supabaseClient.auth.signOut();
            window.location.reload();
        }
    } else {
        const redirectTarget = window.location.hostname.includes('127.0.0.1') || window.location.hostname.includes('localhost')
            ? window.location.origin + '/practice'
            : 'https://qederam.org/practice';

        await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: redirectTarget }
        });
    }
}

// Progress State Synchronization
async function loadCloudState() {
    if (!supabaseClient || !currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('skill_progress')
            .select('*')
            .eq('student_id', currentUser.id);

        if (!error && data) {
            let totalAtt = 0;
            let totalCorr = 0;
            data.forEach(row => {
                if (state.skills[row.skill_id]) {
                    state.skills[row.skill_id].streak = row.consecutive_streak || 0;
                    state.skills[row.skill_id].mastered = Boolean(row.is_mastered);
                }
                totalAtt += (row.total_attempted || 0);
                totalCorr += (row.total_correct || 0);
            });
            state.totalAttempted = totalAtt;
            state.totalCorrect = totalCorr;
            updateStatsUI();
        }
    } catch (e) {
        console.warn("Could not load cloud progress:", e);
    }
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
    const sel = document.getElementById('topic-select');
    if (sel) sel.value = state.selectedTopic;
    updateStatsUI();
}

async function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    updateStatsUI();

    if (supabaseClient && currentUser) {
        const topic = state.selectedTopic || 'random';
        const skill = getActiveSkillState();
        try {
            await supabaseClient.from('skill_progress').upsert({
                student_id: currentUser.id,
                skill_id: topic,
                consecutive_streak: skill.streak,
                is_mastered: skill.mastered,
                total_attempted: state.totalAttempted,
                total_correct: state.totalCorrect,
                last_practiced_at: new Date().toISOString()
            }, { onConflict: 'student_id,skill_id' });
        } catch (err) {
            console.warn("Failed to sync progress to cloud:", err);
        }
    }
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
    if (!svg) return;
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
    const feedbackBanner = document.getElementById('feedback-banner');
    const solutionCard = document.getElementById('solution-card');
    const nextBtn = document.getElementById('next-btn');
    if (feedbackBanner) feedbackBanner.style.display = 'none';
    if (solutionCard) solutionCard.style.display = 'none';
    document.getElementById('task-completion-card').style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    hadStageMistake = false;
    currentQuestionAnswers = [];

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

    const firstInput = document.getElementById('stage-input-0');
    if (firstInput) {
        firstInput.focus();
        firstInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitStage(0);
        });
    }
}

async function submitStage(idx) {
    const input = document.getElementById(`stage-input-${idx}`);
    const rawVal = input.value.trim();
    if (!rawVal) return;
    currentQuestionAnswers[idx] = rawVal;

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
        finalizeProblem(!hadStageMistake, currentQuestionAnswers.slice());
    }
}

async function submitSingleAnswer() {
    const input = document.getElementById('answer-input');
    const rawVal = input.value.trim();
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
    await finalizeProblem(data.correct, rawVal);

    document.getElementById('submit-btn').style.display = 'none';
    input.disabled = true;
}

async function finalizeProblem(isSuccess, answer = null) {
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
        feedback.innerHTML = '&#10008; Problem finished with step errors. Streak reset.';
    }

    saveState();
    const nextBtn = document.getElementById('next-btn');
    const showSolution = !taskRunnerState || !taskRunnerState.isTest ||
        taskRunnerState.currentQuestionIndex + 1 >= taskRunnerState.totalQuestions;
    if (!isSuccess && showSolution) {
        feedback.innerHTML += ' Full derivation:';
        const solCard = document.getElementById('solution-card');
        const solContent = document.getElementById('solution-content');
        if (currentProblem.plot_data) drawNormalDistribution(currentProblem.plot_data);
        solContent.innerHTML = currentProblem.solution;
        triggerKaTeX(solContent);
        solCard.style.display = 'block';
    }

    if (!taskRunnerState) {
        nextBtn.style.display = 'inline-block';
        nextBtn.focus();
        return;
    }

    taskRunnerState.answers.push({
        question: taskRunnerState.currentQuestionIndex + 1,
        topic: state.selectedTopic,
        answer,
        correct: Boolean(isSuccess)
    });
    if (isSuccess) taskRunnerState.score += 1;
    taskRunnerState.currentQuestionIndex += 1;
    updateTaskRunnerUI();

    if (taskRunnerState.currentQuestionIndex >= taskRunnerState.totalQuestions) {
        nextBtn.style.display = 'none';
        const completionCard = document.getElementById('task-completion-card');
        const summary = document.getElementById('task-completion-summary');
        const percentage = Math.round((taskRunnerState.score / taskRunnerState.totalQuestions) * 100);
        summary.textContent =
            `${taskRunnerState.title}: ${taskRunnerState.score} of ${taskRunnerState.totalQuestions} correct (${percentage}%).`;
        completionCard.style.display = 'block';
        try {
            await submitTaskResults();
        } catch (error) {
            console.error('Task submission failed:', error);
            document.getElementById('task-submission-status').textContent =
                'We could not submit your results. Check your connection and try again.';
            document.getElementById('task-retry-submit').style.display = 'inline-block';
        }
        return;
    }

    nextBtn.innerText = 'Next Task Question →';
    nextBtn.onclick = loadNextTaskQuestion;
    nextBtn.style.display = 'inline-block';
    nextBtn.focus();
}

window.addEventListener('load', async () => {
    await initAuth();
    if (taskId) {
        try {
            await startAssignedTask(taskId);
        } catch (error) {
            console.error('Could not start assigned task:', error);
            await loadProblem();
            const feedback = document.getElementById('feedback-banner');
            feedback.innerText = error.message;
            feedback.className = 'banner incorrect';
            feedback.style.display = 'block';
        }
    } else {
        loadProblem();
    }
    const ansInput = document.getElementById('answer-input');
    if (ansInput) {
        ansInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitSingleAnswer();
        });
    }
});
