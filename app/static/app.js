const STORAGE_KEY = 'qederam_state_v1';
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('task_id');

function evaluateMathInput(rawStringOrLatex) {
    if (!rawStringOrLatex || !rawStringOrLatex.trim()) return NaN;
    const str = rawStringOrLatex.trim();
    try {
        if (!isNaN(Number(str))) return Number(str);
        if (typeof math === 'undefined') return NaN;
        const isLatex = /\\|[{}]/.test(str);
        let expression = str;
        if (isLatex) {
            if (typeof latexToMathJs !== 'function') return NaN;
            expression = latexToMathJs(str);
        } else {
            if (!/^[\d\s.+\-*/^()a-zA-Z]*$/.test(str)) return NaN;
            const words = str.match(/[a-zA-Z]+/g) || [];
            if (words.some(word => word.toLowerCase() !== 'sqrt')) return NaN;
        }
        const result = math.evaluate(expression);
        return typeof result === 'number' && Number.isFinite(result) ? result : NaN;
    } catch (error) {
        return NaN;
    }
}

function updateEvaluationDisplay(control, rawAnswer, numericAnswer, isCorrect) {
    const oldBadge = control.nextElementSibling;
    if (oldBadge?.classList.contains('evaluated-decimal')) oldBadge.remove();
    if (!isCorrect || Number.isFinite(Number(rawAnswer)) || !Number.isFinite(numericAnswer)) return;

    const badge = document.createElement('span');
    badge.className = 'evaluated-decimal';
    badge.textContent = `≈ ${numericAnswer.toFixed(3)}`;
    control.insertAdjacentElement('afterend', badge);
}

window.addEventListener('wheel', () => {
    if (document.activeElement?.type === 'number') {
        document.activeElement.blur();
    }
}, { passive: true });

let currentProblem = null;
let isMultiStage = false;
let hadStageMistake = false;
let currentQuestionAnswers = [];
let currentUser = null;
let currentSession = null;
let supabaseClient = null;
window.currentUserRole = 'student';
let activeTaskState = {
    active: false,
    taskId: null,
    taskTitle: '',
    taskType: 'assignment',
    allowHints: true,
    totalQuestions: 5,
    currentIndex: 1,
    correctCount: 0,
    responses: [],
    selectedTopic: '',
    topics: [],
    questionQueue: [],
    blocks: [],
    blockStates: [],
    currentBlockIndex: 0,
    currentBlockIdx: 0,
    currentBlock: null,
    currentBlockId: null,
    blockMode: null,
    masteryAttempts: 0,
    maxMasteryAttempts: 4,
    currentPhase: 'guided',
    questionsState: [],
    masteryAttemptsByBlock: {},
    blockProgress: { qInBlock: 0, phase: 'hint_on', failedUnassisted: false },
    previousTopic: 'random',
    isSubmitting: false,
    submitted: false,
    isPreview: false
};

if (window.SUPABASE_URL && window.SUPABASE_KEY && window.supabase) {
    try {
        supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    } catch (e) {
        console.warn("Supabase init error:", e);
    }
};

const TOPIC_REGISTRY = [
    { id: 'random', title: 'All Normal Types (Mixed)', topic: 'Normal Distributions', notation: 'Normal(μ, σ)' },
    { id: 'between', title: 'Between Bounds P(a < X < b)', topic: 'Normal Distributions', notation: 'P(a < X < b)' },
    { id: 'left_tail', title: 'Left Tail Cumulative Area', topic: 'Normal Distributions', notation: 'P(X < b)' },
    { id: 'right_tail', title: 'Right Tail Cumulative Area', topic: 'Normal Distributions', notation: 'P(X > a)' },
    { id: 'inverse', title: 'Inverse Cutoffs & Percentiles', topic: 'Normal Distributions', notation: 'x = μ + zσ' },
    { id: 'cond_check_prop', title: 'Sub-Topic: Checking Conditions for Proportions', topic: 'Confidence Intervals for Proportions (p)', notation: 'Random, 10%, Large Counts' },
    { id: 'drill_se_prop', title: 'Sub-Topic: Standard Error for Proportions', topic: 'Confidence Intervals for Proportions (p)', notation: 'SE = √(p̂(1 − p̂)/n)' },
    { id: 'ci_prop_z', title: '1-Sample z-Interval for Proportion', topic: 'Confidence Intervals for Proportions (p)', notation: 'p' },
    { id: 'ci_prop_z_2samp', title: '2-Sample z-Interval for Proportions', topic: 'Confidence Intervals for Proportions (p)', notation: 'p₁ - p₂' },
    { id: 'drill_hypo_prop', title: 'Sub-Topic: Stating Hypotheses for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'H₀, Hₐ' },
    { id: 'drill_stat_prop', title: 'Sub-Topic: Test Statistic & SE for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'SE₀, z' },
    { id: 'drill_conclusion_prop', title: 'Sub-Topic: P-Value & Conclusion for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'p-value vs. α' },
    { id: 'ht_prop_z', title: '1-Sample z-Test for Proportion', topic: 'Significance Tests for Proportions (p)', notation: 'H₀: p = p₀' },
    { id: 'ht_prop_z_2samp', title: '2-Sample z-Test for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'H₀: p₁ = p₂' },
    { id: 'cond_check_mean', title: 'Sub-Topic: Checking Conditions for Means', topic: 'Confidence Intervals for Means (μ)', notation: 'Random, 10%, Normality' },
    { id: 'drill_se_mean', title: 'Sub-Topic: Standard Error & t* for Means', topic: 'Confidence Intervals for Means (μ)', notation: 'SE = s/√n, t*' },
    { id: 'ci_mean_t', title: '1-Sample t-Interval for Mean', topic: 'Confidence Intervals for Means (μ)', notation: 'μ' },
    { id: 'ci_mean_t_2samp', title: '2-Sample t-Interval for Means', topic: 'Confidence Intervals for Means (μ)', notation: 'μ₁ - μ₂' },
    { id: 'ci_matched_pairs_t', title: 'Matched Pairs t-Interval for Mean Difference', topic: 'Confidence Intervals for Means (μ)', notation: 'μ_diff' },
    { id: 'drill_hypo_mean', title: 'Sub-Topic: Stating Hypotheses for Means', topic: 'Significance Tests for Means (μ)', notation: 'H₀, Hₐ' },
    { id: 'drill_stat_mean', title: 'Sub-Topic: Test Statistic & SE for Means', topic: 'Significance Tests for Means (μ)', notation: 'SE₀, t' },
    { id: 'drill_conclusion_mean', title: 'Sub-Topic: P-Value & Conclusion for Means', topic: 'Significance Tests for Means (μ)', notation: 'p-value vs. α' },
    { id: 'ht_mean_t', title: '1-Sample t-Test for Mean', topic: 'Significance Tests for Means (μ)', notation: 'H₀: μ = μ₀' },
    { id: 'ht_mean_t_2samp', title: '2-Sample t-Test for Means', topic: 'Significance Tests for Means (μ)', notation: 'H₀: μ₁ = μ₂' },
    { id: 'ht_matched_pairs_t', title: 'Matched Pairs t-Test', topic: 'Significance Tests for Means (μ)', notation: 'H₀: μ_diff = 0' },
    { id: 'chi_gof', title: 'Chi-Square Goodness-of-Fit Test', topic: 'Chi-Square Tests (χ²)', notation: 'df = k - 1' },
    { id: 'chi_two_way', title: 'Chi-Square Test of Independence / Homogeneity', topic: 'Chi-Square Tests (χ²)', notation: 'df = (r-1)(c-1)' },
    { id: 'reg_lsrl', title: 'Least-Squares Regression Line (LSRL)', topic: 'Linear Regression Analysis', notation: 'ŷ = b₀ + b₁x' },
    { id: 'reg_pred_res', title: 'Predictions & Residual Analysis', topic: 'Linear Regression Analysis', notation: 'e = y - ŷ' },
    { id: 'reg_raw_data', title: 'Full Regression from Data', topic: 'Linear Regression Analysis', notation: 'Data Table → LSRL' },
    { id: 'reg_slope_ci', title: 'Confidence Interval for Slope (β₁)', topic: 'Linear Regression Analysis', notation: 'b₁ ± t*SE_b₁' },
    { id: 'reg_slope_test', title: 'Significance Test for Slope (β₁)', topic: 'Linear Regression Analysis', notation: 'H₀: β₁ = 0' }
];

let state = {
    selectedTopic: 'random',
    previousView: 'catalog',
    lsrlNotationStyle: 'ab'
};

try {
    const savedNotation = localStorage.getItem('lsrl_notation');
    if (savedNotation === 'ab' || savedNotation === 'b0b1') state.lsrlNotationStyle = savedNotation;
} catch (error) {
    console.warn('Could not load LSRL notation preference:', error);
}

function setLsrlNotationStyle(style) {
    if (!['ab', 'b0b1'].includes(style)) return;
    state.lsrlNotationStyle = style;
    try {
        localStorage.setItem('lsrl_notation', style);
    } catch (error) {
        console.warn('Could not save LSRL notation preference:', error);
    }
    window.dispatchEvent(new Event('lsrl-notation-change'));
}

function getActiveLsrlNotation() {
    const blockNotation = activeTaskState.active && activeTaskState.currentBlock?.notation_style;
    const classNotation = activeTaskState.active && activeTaskState.defaultNotation;
    return blockNotation || classNotation || state.lsrlNotationStyle;
}
window.getActiveLsrlNotation = getActiveLsrlNotation;

function applyStudentToolPermissions(policy = {}) {
    const tools = [
        ['allow_calc', 'tool-calc-button', 'calc-dock', window.closeCalculatorWindow],
        ['allow_stats_tool', 'tool-stats-button', 'floating-stats-window', window.closeStatsGrapherWindow],
        ['allow_tables', 'tool-tables-button', 'floating-tables-window', window.closeFloatingWindow]
    ];
    tools.forEach(([key, buttonId, windowId, close]) => {
        const allowed = policy[key] !== false;
        const button = document.getElementById(buttonId);
        const tool = document.getElementById(windowId);
        if (button) button.hidden = !allowed;
        if (!allowed && tool && getComputedStyle(tool).display !== 'none' && typeof close === 'function') close();
    });
    document.querySelectorAll('.tool-popout').forEach(button => { button.hidden = policy.allow_popouts === false; });
}
window.applyStudentToolPermissions = applyStudentToolPermissions;

function getTaskTopics(task) {
    const supportedTopics = TOPIC_REGISTRY.map(topic => topic.id);
    const configuredTopics = Array.isArray(task.config?.topics) ? task.config.topics : [];
    return configuredTopics.filter(topic => supportedTopics.includes(topic));
}

function updateCurrentTopicName() {
    const topicName = document.getElementById('current-skill-name');
    const topic = TOPIC_REGISTRY.find(item => item.id === state.selectedTopic);
    if (topicName) topicName.textContent = topic?.title || 'All Normal Types (Mixed)';
}

function renderTopicCatalog() {
    const accordion = document.getElementById('catalog-accordion');
    if (!accordion) return;

    accordion.replaceChildren();
    const categories = new Map();
    TOPIC_REGISTRY.forEach(topic => {
        if (!categories.has(topic.topic)) categories.set(topic.topic, []);
        categories.get(topic.topic).push(topic);
    });

    categories.forEach((topics, categoryName) => {
        const category = document.createElement('section');
        category.className = 'catalog-category-accordion';
        category.dataset.searchText = categoryName.toLowerCase();

        const heading = document.createElement('button');
        heading.type = 'button';
        heading.className = 'catalog-category-heading';
        heading.setAttribute('aria-expanded', 'true');
        const headingText = document.createElement('span');
        headingText.textContent = categoryName;
        const chevron = document.createElement('span');
        chevron.className = 'catalog-category-chevron';
        chevron.textContent = '▾';
        heading.append(headingText, chevron);
        heading.addEventListener('click', () => {
            const isExpanded = heading.getAttribute('aria-expanded') === 'true';
            heading.setAttribute('aria-expanded', String(!isExpanded));
            category.classList.toggle('is-collapsed', isExpanded);
            chevron.textContent = isExpanded ? '▸' : '▾';
        });
        category.appendChild(heading);

        const skills = document.createElement('div');
        skills.className = 'catalog-category-skills';
        const skillsInner = document.createElement('div');
        skillsInner.className = 'catalog-category-skills-inner';
        topics.forEach(topic => {
            const row = document.createElement('div');
            row.className = 'catalog-item-row';
            row.dataset.searchText = `${topic.topic} ${topic.title}`.toLowerCase();

            const title = document.createElement('div');
            title.className = 'catalog-item-title';
            title.textContent = topic.title;

            const practiceButton = document.createElement('button');
            practiceButton.type = 'button';
            practiceButton.className = 'btn-primary catalog-practice-btn';
            practiceButton.textContent = 'Practice →';
            practiceButton.addEventListener('click', () => startPracticingTopic(topic.id, topic.title));

            row.append(title, practiceButton);
            skillsInner.appendChild(row);
        });
        skills.appendChild(skillsInner);
        category.appendChild(skills);
        accordion.appendChild(category);
    });

    if (typeof triggerKaTeX === 'function') triggerKaTeX(accordion);
    filterTopicCatalog();
}

function filterTopicCatalog() {
    const input = document.getElementById('topic-search-input');
    const query = input ? input.value.trim().toLowerCase() : '';
    document.querySelectorAll('#catalog-accordion .catalog-category-accordion').forEach(category => {
        let visibleTopics = 0;
        category.querySelectorAll('.catalog-item-row').forEach(row => {
            const matches = !query || row.dataset.searchText.includes(query);
            row.style.display = matches ? '' : 'none';
            if (matches) visibleTopics += 1;
        });
        category.style.display = visibleTopics ? '' : 'none';
        const heading = category.querySelector('.catalog-category-heading');
        const chevron = category.querySelector('.catalog-category-chevron');
        const expanded = !query || visibleTopics > 0;
        category.classList.toggle('is-collapsed', !expanded);
        if (heading) heading.setAttribute('aria-expanded', String(expanded));
        if (chevron) chevron.textContent = expanded ? '▾' : '▸';
    });
}

function getActivePracticeView() {
    return ['practice', 'tasks', 'catalog'].find(viewName => {
        const view = document.getElementById(`${viewName}-view`);
        return view && view.style.display !== 'none';
    });
}

function switchPracticeView(targetView, skipHistoryPush = false) {
    if (activeTaskState.active && activeTaskState.taskType === 'test' && !activeTaskState.examCompleted && targetView !== 'practice') {
        alert(targetView === 'catalog'
            ? 'Skill Directory and worked examples are locked while a test is in progress.'
            : 'Exit or complete the test before returning to assigned tasks.');
        return;
    }
    if (activeTaskState.active && targetView === 'catalog' && !activeTaskState.examCompleted) return;
    const views = {
        practice: document.getElementById('practice-view'),
        tasks: document.getElementById('tasks-view'),
        catalog: document.getElementById('catalog-view')
    };
    if (!views[targetView]) return;

    const currentActiveView = getActivePracticeView();
    if (targetView === 'practice' && ['tasks', 'catalog'].includes(currentActiveView)) {
        state.previousView = currentActiveView;
    }

    if (!skipHistoryPush) {
        history.pushState({ appView: targetView }, '', `#${targetView}`);
    } else {
        history.replaceState({ appView: targetView }, '', `#${targetView}`);
    }

    const buttons = {
        tasks: document.getElementById('nav-tasks-btn'),
        catalog: document.getElementById('nav-topics-btn')
    };

    Object.entries(views).forEach(([name, view]) => {
        if (view) view.style.display = name === targetView ? 'block' : 'none';
    });
    Object.entries(buttons).forEach(([name, button]) => {
        if (button) button.classList.toggle('active', name === targetView);
    });
    if (targetView === 'tasks' && !skipHistoryPush && typeof fetchStudentTasks === 'function') {
        fetchStudentTasks();
    } else if (targetView === 'catalog') {
        renderTopicCatalog();
    }
}

function handleBackNavigation() {
    const practiceView = document.getElementById('practice-view');
    const tasksView = document.getElementById('tasks-view');
    if (practiceView && practiceView.style.display !== 'none') {
        if (activeTaskState.active) {
            exitActiveTask();
            return;
        }
        const dest = state.previousView === 'tasks' ? 'tasks' : 'catalog';
        switchPracticeView(dest, true);
    } else if (tasksView && tasksView.style.display !== 'none') {
        switchPracticeView('catalog', true);
    }
}
window.handleBackNavigation = handleBackNavigation;

window.addEventListener('popstate', event => {
    const practiceView = document.getElementById('practice-view');
    if (practiceView && practiceView.style.display !== 'none') {
        event.preventDefault();
        handleBackNavigation();
        if (practiceView.style.display !== 'none') {
            history.pushState({ appView: 'practice' }, '', '#practice');
        }
        return;
    }

    if (event.state?.appView) {
        switchPracticeView(event.state.appView, true);
    }
    if (event.state?.navigationRoot) {
        const currentView = getActivePracticeView() || event.state.appView;
        history.pushState(
            { appView: currentView, navigationRoot: true },
            '',
            `#${currentView}`
        );
    }
});

function startPracticingTopic(topicId, title) {
    if (activeTaskState.active) return;

    state.selectedTopic = topicId;
    const topicName = document.getElementById('current-skill-name');
    const topic = TOPIC_REGISTRY.find(item => item.id === topicId);
    if (topicName) topicName.textContent = title || topic?.title || 'All Normal Types (Mixed)';
    saveState();
    switchPracticeView('practice');
    loadProblem();
}

function updateTaskRunnerUI() {
    const banner = document.getElementById('task-runner-banner');
    const topicsButton = document.getElementById('nav-topics-btn');
    const tasksButton = document.getElementById('nav-tasks-btn');
    const examLocked = activeTaskState.active && activeTaskState.taskType === 'test' && !activeTaskState.examCompleted;
    if (topicsButton) {
        topicsButton.disabled = activeTaskState.active && !activeTaskState.examCompleted;
        topicsButton.title = examLocked
            ? 'Skill Directory is locked during an active test'
            : 'Browse the topic library';
    }
    if (tasksButton) {
        tasksButton.disabled = examLocked;
        tasksButton.title = examLocked ? 'Assigned Tasks are locked during an active test' : '';
    }
    const exitButton = document.getElementById('btn-exit-task');
    if (exitButton) exitButton.textContent = examLocked ? '← Exit Test' : '← Exit Task';

    if (!activeTaskState.active) {
        if (banner) banner.style.display = 'none';
        const navBar = document.getElementById('task-nav-bar');
        if (navBar) navBar.style.display = 'none';
        hideTaskAdvanceButton();
        return;
    }

    if (banner) banner.style.display = 'flex';
    document.getElementById('task-title-display').textContent = activeTaskState.taskTitle;
    const questionNumber = Math.min(activeTaskState.currentIndex, activeTaskState.totalQuestions);
    document.getElementById('task-progress-display').textContent = activeTaskState.blocks.length
        ? `Block ${activeTaskState.currentBlockIndex + 1} of ${activeTaskState.blocks.length} · Question ${questionNumber} of ${activeTaskState.totalQuestions}`
        : `Question ${questionNumber} of ${activeTaskState.totalQuestions}`;
    const modeBadges = document.getElementById('task-mode-badges');
    if (modeBadges) {
        const badges = [];
        if (activeTaskState.taskType === 'test') {
            badges.push('<span class="badge" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">📝 Exam Mode (Formula Hints &amp; Step Solutions Suppressed)</span>');
            badges.push('<span class="badge">Exiting saves a draft only in this browser on this device.</span>');
        }
        if (activeTaskState.blockMode === 'scaffold') {
            badges.push(`<span class="badge" style="background: #e0f2fe; color: #0369a1;">🎓 Scaffolded (${activeTaskState.allowHints ? 'Guided: Hints ON' : 'Independent: Hints OFF'})</span>`);
        } else if (activeTaskState.blockMode === 'mastery') {
            const attempt = Math.max(1, activeTaskState.masteryAttempts);
            badges.push(`<span class="badge" style="background: #f3e8ff; color: #6b21a8;">🎯 Mastery Mode (Attempt ${attempt} of ${activeTaskState.maxMasteryAttempts} max) • [${activeTaskState.allowHints ? 'Step 1: Guided' : 'Step 2: Unassisted Test'}]</span>`);
        } else if (activeTaskState.blockMode === 'all_hints') {
            badges.push('<span class="badge" style="background: #dbeafe; color: #1e40af;">📘 Practice (Hints ON)</span>');
        }
        modeBadges.innerHTML = badges.join('');
    }
    const progressTrack = banner.querySelector('[role="progressbar"]');
    const progressFill = document.getElementById('task-progress-fill');
    const completedQuestions = Math.max(0, activeTaskState.currentIndex - 1);
    const progress = completedQuestions / activeTaskState.totalQuestions;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(completedQuestions));
    if (progressTrack) progressTrack.setAttribute('aria-valuemax', String(activeTaskState.totalQuestions));
    if (progressFill) progressFill.style.width = `${progress * 100}%`;
}

function renderTaskNavigationChips() {
    const navBar = document.getElementById('task-nav-bar');
    const chips = document.getElementById('task-question-chips');
    if (!activeTaskState.active) {
        if (navBar) navBar.style.display = 'none';
        return;
    }

    activeTaskState.totalQuestions = activeTaskState.questionQueue.length;
    activeTaskState.questionsState.length = activeTaskState.totalQuestions;
    if (navBar) navBar.style.display = 'flex';
    if (!chips) return;
    chips.replaceChildren();

    if (activeTaskState.blocks.length) {
        activeTaskState.blocks.forEach((block, index) => {
            const blockState = activeTaskState.blockStates[index];
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'task-chip';
            if (blockState?.completed) chip.classList.add('completed');
            else if (blockState?.guidedPassed) chip.classList.add('half-completed');
            if (index === activeTaskState.currentBlockIndex) chip.classList.add('active');
            chip.textContent = `Q${index + 1} ${blockState?.completed ? '✔' : blockState?.guidedPassed ? '½' : ''}`.trim();
            chip.title = block.title || block.topic || `Block ${index + 1}`;
            chip.addEventListener('click', () => jumpToTaskQuestion(index));
            chips.appendChild(chip);
        });
        const previousButton = document.getElementById('btn-task-prev');
        const nextButton = document.getElementById('btn-task-next');
        if (previousButton) previousButton.disabled = activeTaskState.currentBlockIndex <= 0;
        if (nextButton) nextButton.disabled = activeTaskState.currentBlockIndex >= activeTaskState.blocks.length - 1;
        return;
    }

    activeTaskState.questionQueue.forEach((_question, index) => {
        const questionState = activeTaskState.questionsState[index];
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'task-chip';
        chip.textContent = questionState?.completed ? `Q${index + 1} ✔` : `Q${index + 1}`;
        if (questionState?.completed) chip.classList.add('completed');
        if (index + 1 === activeTaskState.currentIndex) chip.classList.add('active');
        else if (questionState?.attempted && !questionState?.completed) {
            chip.style.borderColor = questionState.correct === false ? '#dc2626' : '#d97706';
        } else if (questionState?.completed && questionState.correct === false) {
            chip.style.borderColor = '#d97706';
        }
        chip.addEventListener('click', () => jumpToTaskQuestion(index + 1));
        chips.appendChild(chip);
    });

    const previousButton = document.getElementById('btn-task-prev');
    const nextButton = document.getElementById('btn-task-next');
    if (previousButton) previousButton.disabled = activeTaskState.currentIndex <= 1;
    if (nextButton) nextButton.disabled = activeTaskState.currentIndex >= activeTaskState.totalQuestions;
}

function captureTaskQuestionState() {
    if (!activeTaskState.active || !currentProblem) return;
    const index = activeTaskState.currentIndex - 1;
    const existing = activeTaskState.questionsState[index] || {};
    const singleInput = document.getElementById('answer-input');
    const stageStates = currentProblem.steps
        ? currentProblem.steps.map((_step, stageIndex) => {
            const controls = Array.from(
                document.querySelectorAll(`#stage-box-${stageIndex} input, #stage-box-${stageIndex} select, #stage-box-${stageIndex} math-field`)
            );
            const values = controls.map(control => control.matches('math-field')
                ? control.getValue()
                : control.value);
            const disabledStates = controls.map(control => control.matches('math-field')
                ? control.readOnly
                : control.disabled);
            return {
                values,
                disabledStates,
                value: values[0] ?? '',
                disabled: disabledStates[0] ?? true,
                display: document.getElementById(`stage-box-${stageIndex}`)?.style.display || '',
                className: document.getElementById(`stage-box-${stageIndex}`)?.className || 'stage-box',
                status: document.getElementById(`stage-status-${stageIndex}`)?.innerHTML || '',
                revealDisplay: document.getElementById(`stage-reveal-${stageIndex}`)?.style.display || 'none',
                revealText: document.getElementById(`stage-reveal-${stageIndex}`)?.textContent || '',
                buttonDisabled: document.getElementById(`stage-btn-${stageIndex}`)?.disabled ?? true
            };
        })
        : [];
    activeTaskState.questionsState[index] = {
        ...existing,
        problem: currentProblem,
        answer: singleInput?.value || '',
        answerDisabled: Boolean(singleInput?.disabled),
        stageInputs: currentQuestionAnswers.slice(),
        stageStates,
        hadStageMistake,
        feedbackHtml: document.getElementById('feedback-banner')?.innerHTML || '',
        feedbackClass: document.getElementById('feedback-banner')?.className || 'banner',
        feedbackDisplay: document.getElementById('feedback-banner')?.style.display || 'none',
        solutionHtml: document.getElementById('solution-content')?.innerHTML || '',
        solutionDisplay: document.getElementById('solution-card')?.style.display || 'none'
    };
    const blockState = activeTaskState.blockStates[activeTaskState.currentBlockIndex];
    if (blockState) {
        blockState.cachedProblem = currentProblem;
        blockState.cachedInputs = {
            answer: singleInput?.value || '',
            stageInputs: currentQuestionAnswers.slice()
        };
    }
}

function restoreTaskQuestionState(questionState) {
    currentQuestionAnswers = questionState.stageInputs?.slice() || [];
    hadStageMistake = Boolean(questionState.hadStageMistake);
    if (currentProblem.steps) {
        questionState.stageStates?.forEach((stage, index) => {
            const controls = Array.from(
                document.querySelectorAll(`#stage-box-${index} input, #stage-box-${index} select, #stage-box-${index} math-field`)
            );
            const box = document.getElementById(`stage-box-${index}`);
            const status = document.getElementById(`stage-status-${index}`);
            const reveal = document.getElementById(`stage-reveal-${index}`);
            const verifyButton = document.getElementById(`stage-btn-${index}`);
            if (box && stage.display !== undefined) box.style.display = stage.display;
            if (stage.values) {
                controls.forEach((control, controlIndex) => {
                    if (control.matches('math-field')) {
                        control.setValue(stage.values[controlIndex] ?? '');
                        control.readOnly = stage.disabledStates?.[controlIndex] ?? true;
                    } else {
                        control.value = stage.values[controlIndex] ?? '';
                        control.disabled = stage.disabledStates?.[controlIndex] ?? true;
                    }
                });
            } else if (controls[0]) {
                if (controls[0].matches('math-field')) {
                    controls[0].setValue(stage.value || '');
                    controls[0].readOnly = stage.disabled;
                } else {
                    controls[0].value = stage.value;
                    controls[0].disabled = stage.disabled;
                }
            }
            if (box) box.className = stage.className;
            if (status) status.innerHTML = stage.status;
            if (reveal) {
                reveal.style.display = stage.revealDisplay;
                reveal.textContent = stage.revealText;
            }
            if (verifyButton) verifyButton.disabled = stage.buttonDisabled;
        });
    } else {
        const input = document.getElementById('answer-input');
        if (input) {
            input.value = questionState.answer || '';
            input.disabled = Boolean(questionState.answerDisabled || questionState.completed);
            document.getElementById('submit-btn').style.display = questionState.completed ? 'none' : 'inline-block';
        }
    }

    const feedback = document.getElementById('feedback-banner');
    if (feedback) {
        feedback.innerHTML = questionState.feedbackHtml || '';
        feedback.className = questionState.feedbackClass || 'banner';
        feedback.style.display = questionState.feedbackDisplay || 'none';
    }
    const solutionCard = document.getElementById('solution-card');
    const solutionContent = document.getElementById('solution-content');
    if (solutionContent) solutionContent.innerHTML = questionState.solutionHtml || '';
    if (solutionCard) solutionCard.style.display = questionState.solutionDisplay || 'none';
    if (questionState.completed) showTaskAdvanceButton();
    else hideTaskAdvanceButton();
}

function showTaskAdvanceButton() {
    const container = document.getElementById('task-advance-container');
    const button = document.getElementById('task-advance-btn');
    if (!container || !button || !activeTaskState.active) return;
    const currentQuestion = activeTaskState.questionsState[activeTaskState.currentIndex - 1];
    const blockState = activeTaskState.blockStates[activeTaskState.currentBlockIndex];
    if (activeTaskState.blocks.length) {
        const nextInBlock = activeTaskState.questionQueue.findIndex((question, index) =>
            index >= activeTaskState.currentIndex &&
            question.blockIndex === activeTaskState.currentBlockIndex &&
            !activeTaskState.questionsState[index]?.completed
        );
        const nextBlock = activeTaskState.blockStates.some((item, index) =>
            index !== activeTaskState.currentBlockIndex && !item.completed
        );
        let label = activeTaskState.taskType === 'test' ? 'Submit Test' : 'Review & Submit Assessment 🏁';
        if (currentQuestion?.maxAttemptsReached) label = 'Next Block →';
        else if (blockState?.mode === 'mastery' && blockState.phase === 'guided' && blockState.attemptsCount > 1) {
            label = 'Try Guided Practice Again →';
        } else if (blockState?.mode === 'mastery' && blockState.guidedPassed && !blockState.completed) {
            label = `${blockState.cleanPassesCount ? 'Continue' : 'Start'} Unassisted Mastery Problem →`;
        } else if (blockState?.mode === 'scaffold' && blockState.phase === 'independent' && !blockState.completed) {
            label = 'Next Step: Independent Problem →';
        } else if (blockState?.mode === 'scaffold' && blockState.phase === 'guided' && blockState.attemptsCount > 1) {
            label = 'Try Guided Practice Again →';
        } else if (nextInBlock >= 0) label = 'Continue in This Block →';
        else if (nextBlock) label = 'Continue to Next Block →';
        else if (activeTaskState.taskType !== 'test') label = 'Review & Submit Assessment 🏁';
        button.textContent = label;
    } else {
        button.textContent = currentQuestion?.maxAttemptsReached
            ? 'Next Problem →'
            : activeTaskState.currentIndex === activeTaskState.totalQuestions
                ? activeTaskState.taskType === 'test' ? 'Submit Test' : 'Review & Submit Assessment 🏁'
                : 'Continue to Next Question →';
    }
    container.style.display = 'block';
}

function hideTaskAdvanceButton() {
    const container = document.getElementById('task-advance-container');
    if (container) container.style.display = 'none';
}

async function loadTaskQuestion(targetIndex) {
    if (!activeTaskState.active || targetIndex < 1 || targetIndex > activeTaskState.totalQuestions) return;
    activeTaskState.currentIndex = targetIndex;
    selectTaskTopic();
    updateCurrentTopicName();
    updateTaskRunnerUI();
    renderTaskNavigationChips();
    const cachedQuestion = activeTaskState.questionsState[targetIndex - 1];
    activeTaskState.isLoadingQuestion = true;
    try {
        if (cachedQuestion?.problem) {
            currentProblem = cachedQuestion.problem;
            await loadProblem(currentProblem);
        } else {
            await loadProblem();
        }
    } finally {
        activeTaskState.isLoadingQuestion = false;
    }
}

async function jumpToTaskQuestion(targetIndex) {
    if (!activeTaskState.active) return;
    if (activeTaskState.isVerifying) return;
    if (activeTaskState.blocks.length) {
        if (targetIndex < 0 || targetIndex >= activeTaskState.blocks.length) return;
        captureTaskQuestionState();
        const targetQuestions = activeTaskState.questionQueue
            .map((question, index) => ({ question, index }))
            .filter(({ question }) => question.blockIndex === targetIndex);
        if (!targetQuestions.length) return;
        const unfinished = targetQuestions.find(({ index }) => !activeTaskState.questionsState[index]?.completed);
        const targetQuestionIndex = unfinished?.index ?? targetQuestions[targetQuestions.length - 1].index;
        await loadTaskQuestion(targetQuestionIndex + 1);
        return;
    }
    if (targetIndex < 1 || targetIndex > activeTaskState.totalQuestions) return;
    captureTaskQuestionState();
    await loadTaskQuestion(targetIndex);
}

async function advanceToNextOrSummary() {
    if (!activeTaskState.active) return;
    captureTaskQuestionState();
    if (activeTaskState.blocks.length) {
        const blockIndex = activeTaskState.currentBlockIndex;
        const nextInBlock = activeTaskState.questionQueue.findIndex((question, index) =>
            index >= activeTaskState.currentIndex &&
            question.blockIndex === blockIndex &&
            !activeTaskState.questionsState[index]?.completed
        );
        if (nextInBlock >= 0) {
            await loadTaskQuestion(nextInBlock + 1);
            return;
        }
        const nextBlock = activeTaskState.blockStates.findIndex((item, index) =>
            index > blockIndex && !item.completed
        );
        const earlierIncomplete = activeTaskState.blockStates.findIndex((item, index) =>
            index < blockIndex && !item.completed
        );
        const targetBlock = nextBlock >= 0 ? nextBlock : earlierIncomplete;
        if (targetBlock >= 0) {
            await jumpToTaskQuestion(targetBlock);
            return;
        }
        if (activeTaskState.blockStates.every(item => item.completed)) {
            await completeStudentTask();
        }
        return;
    }
    if (activeTaskState.currentIndex < activeTaskState.totalQuestions) {
        await jumpToTaskQuestion(activeTaskState.currentIndex + 1);
        return;
    }
    await completeStudentTask();
}

function selectTaskTopic() {
    if (!activeTaskState.active) return;
    const queuedQuestion = activeTaskState.questionQueue[activeTaskState.currentIndex - 1];
    if (queuedQuestion) {
        activeTaskState.selectedTopic = queuedQuestion.topic;
        activeTaskState.allowHints = queuedQuestion.allow_hints;
        if (queuedQuestion.blockId) {
            activeTaskState.currentBlockIdx = queuedQuestion.blockIndex ?? 0;
            activeTaskState.currentBlockIndex = activeTaskState.currentBlockIdx;
            activeTaskState.currentBlock = activeTaskState.blocks[activeTaskState.currentBlockIdx] || null;
            activeTaskState.blockMode = queuedQuestion.mode || activeTaskState.currentBlock?.mode || null;
            const blockState = activeTaskState.blockStates[activeTaskState.currentBlockIdx];
            activeTaskState.currentBlock = activeTaskState.currentBlock || null;
            if (blockState) {
                activeTaskState.currentPhase = queuedQuestion.allow_hints ? 'guided' : 'independent';
                activeTaskState.masteryAttempts = blockState.attemptsCount + 1;
                activeTaskState.maxMasteryAttempts = blockState.maxAttempts;
            }
            activeTaskState.currentBlockId = queuedQuestion.blockId;
            if (blockState) {
                activeTaskState.masteryAttempts = blockState.attemptsCount + 1;
                activeTaskState.maxMasteryAttempts = blockState.maxAttempts;
            } else {
                activeTaskState.masteryAttempts = 0;
                activeTaskState.maxMasteryAttempts = 4;
            }
            activeTaskState.currentPhase = queuedQuestion.allow_hints ? 'guided' : 'independent';
            activeTaskState.blockProgress = {
                qInBlock: queuedQuestion.qInBlock ?? 0,
                phase: queuedQuestion.phase || 'hint_on',
                failedUnassisted: queuedQuestion.phase === 'scaffold_retry' ||
                    queuedQuestion.phase === 'mastery_hint'
            };
        } else {
            activeTaskState.currentBlock = null;
            activeTaskState.currentBlockId = null;
            activeTaskState.blockMode = null;
            activeTaskState.masteryAttempts = 0;
            activeTaskState.maxMasteryAttempts = 4;
            activeTaskState.currentPhase = queuedQuestion.allow_hints ? 'guided' : 'independent';
        }
        state.selectedTopic = queuedQuestion.topic;
        updateCurrentTopicName();
        window.dispatchEvent(new Event('lsrl-notation-change'));
        return;
    }

    const topics = activeTaskState.topics;
    const topic = topics.length
        ? topics[(activeTaskState.currentIndex - 1) % topics.length]
        : activeTaskState.selectedTopic;
    state.selectedTopic = topic || 'random';
    updateCurrentTopicName();
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

    await startStudentTask(task);
}

async function startStudentTask(task) {
    if (activeTaskState.active && activeTaskState.taskType === 'test' && !activeTaskState.examCompleted) {
        throw new Error('Exit or complete the active test before starting another task.');
    }
    const topics = getTaskTopics(task);
    const configuredCount = parseInt(task.question_count || task.config?.total_count || task.config?.count, 10);
    const taskType = task.task_type === 'test' || task.type === 'test'
        ? 'test'
        : task.task_type || task.type || 'assignment';
    const isTest = taskType === 'test';
    const assignedTopic = task.skill_topic || task.config?.skill_topic || task.config?.topic;
    const supportedTopics = new Set(TOPIC_REGISTRY.map(topic => topic.id));
    const questionQueue = [];
    const configuredBlocks = Array.isArray(task.config?.blocks) ? task.config.blocks : null;
    const taskBlocks = configuredBlocks
        ? configuredBlocks.map((block, index) => ({
            ...block,
            id: block?.id || `block-${index}`,
            mode: isTest ? 'no_hints' : block.mode
        }))
        : [];
    if (configuredBlocks) {
        if (!taskBlocks.length) {
            throw new Error('This task does not have any question blocks configured.');
        }
        taskBlocks.forEach((block, blockIndex) => {
            if (!block || !supportedTopics.has(block.topic)) {
                throw new Error('This task contains a block for an unsupported topic.');
            }
            if (!['scaffold', 'mastery', 'all_hints', 'no_hints'].includes(block.mode)) {
                throw new Error('This task contains a block with an unsupported practice mode.');
            }
            const parsedCount = parseInt(block.count, 10);
            if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 50) {
                throw new Error('This task contains an invalid question count.');
            }
            const count = !isTest && (block.mode === 'mastery' || block.mode === 'scaffold')
                ? Math.max(2, parsedCount)
                : parsedCount;
            for (let index = 0; index < count; index += 1) {
                let phase = 'standard';
                let allowHints = block.mode === 'all_hints';
                if (!isTest && block.mode === 'scaffold') {
                    phase = index === 0 ? 'guided' : 'independent';
                    allowHints = index === 0;
                } else if (!isTest && block.mode === 'mastery') {
                    phase = index === 0 ? 'guided' : 'independent';
                    allowHints = index === 0;
                }
                questionQueue.push({
                    topic: block.topic,
                    allow_hints: allowHints,
                    blockId: block.id,
                    blockIndex,
                    qInBlock: index,
                    mode: block.mode,
                    phase
                });
            }
        });
    } else if (Array.isArray(task.config?.questions)) {
        const configuredQuestions = task.config.questions;
        if (!configuredQuestions.length) {
            throw new Error('This task does not have any questions configured.');
        }
        configuredQuestions.forEach(question => {
            if (!question || !supportedTopics.has(question.topic)) {
                throw new Error('This task contains a question for an unsupported topic.');
            }
            questionQueue.push({
                topic: question.topic,
                allow_hints: typeof question.allow_hints === 'boolean'
                    ? question.allow_hints
                    : task.config?.allow_hints !== false && task.allow_hints !== false
            });
        });
    } else if (Array.isArray(task.config?.skills)) {
        task.config.skills.forEach(skill => {
            if (!skill || !supportedTopics.has(skill.topic)) return;
            const skillQuestionCount = parseInt(skill.count, 10);
            const count = Number.isFinite(skillQuestionCount) && skillQuestionCount > 0
                ? Math.min(skillQuestionCount, 50)
                : 1;
            for (let index = 0; index < count; index += 1) {
                questionQueue.push({
                    topic: skill.topic,
                    allow_hints: typeof skill.hints === 'boolean'
                        ? skill.hints
                        : task.config?.allow_hints !== false && task.allow_hints !== false
                });
            }
        });
    }
    if (!questionQueue.length) {
        const fallbackCount = Number.isInteger(configuredCount) && configuredCount > 0 ? configuredCount : 5;
        const fallbackTopics = topics.length ? topics : [assignedTopic || 'random'];
        for (let index = 0; index < fallbackCount; index += 1) {
            questionQueue.push({
                topic: fallbackTopics[index % fallbackTopics.length],
                allow_hints: task.config?.allow_hints !== false && task.allow_hints !== false
            });
        }
    }
    const selectedTopic = questionQueue[0]?.topic || assignedTopic || topics[0] || 'random';
    const previousTaskState = activeTaskState;
    activeTaskState = {
        active: true,
        defaultNotation: task.default_notation,
        taskId: task.id || task.assessment_id,
        taskTitle: task.title || 'Assigned Task',
        taskType,
        allowHints: task.config?.allow_hints !== false && task.allow_hints !== false,
        totalQuestions: questionQueue.length,
        currentIndex: 1,
        correctCount: 0,
        responses: [],
        selectedTopic,
        topics: assignedTopic ? [assignedTopic] : topics,
        questionQueue,
        blocks: taskBlocks,
        blockStates: taskBlocks.map(block => ({
            id: block.id,
            mode: block.mode,
            phase: block.mode === 'no_hints' ? 'independent' : 'guided',
            guidedPassed: false,
            cleanPassesCount: 0,
            requiredPasses: Math.min(5, Math.max(1, parseInt(block.required_clean_passes, 10) || 1)),
            attemptsCount: 0,
            maxAttempts: Math.min(15, Math.max(2, parseInt(block.max_attempts, 10) || 4)),
            count: Math.max(1, parseInt(block.count, 10) || 1),
            completedCount: 0,
            completed: false,
            cachedProblem: null,
            cachedInputs: null
        })),
        currentBlockIndex: 0,
        currentBlockIdx: 0,
        currentBlock: null,
        currentBlockId: null,
        blockMode: null,
        masteryAttempts: 0,
        maxMasteryAttempts: 4,
        currentPhase: 'guided',
        blockProgress: { qInBlock: 0, phase: 'hint_on', failedUnassisted: false },
        previousTopic: state.selectedTopic,
        isSubmitting: false,
        submitted: false,
        isPreview: task.status === 'preview'
    };
    activeTaskState.questionsState = new Array(activeTaskState.totalQuestions).fill(null);
    activeTaskState.masteryAttemptsByBlock = {};
    try {
        if (isTest && task.status !== 'submitted' && task.status !== 'completed') {
            const key = incompleteTestStorageKey(activeTaskState);
            const stored = localStorage.getItem(key);
            if (stored) {
                const saved = JSON.parse(stored);
                if (!saved || saved.taskType !== 'test' || String(saved.taskId) !== String(activeTaskState.taskId) ||
                    !Array.isArray(saved.questionQueue) || !Array.isArray(saved.questionsState) ||
                    !Array.isArray(saved.responses) || !Array.isArray(saved.blocks) || !Array.isArray(saved.blockStates) ||
                    !Number.isInteger(saved.currentIndex) || saved.currentIndex < 1 || saved.currentIndex > saved.questionQueue.length) {
                    throw new Error('Invalid incomplete test data');
                }
                activeTaskState = { ...saved, active: true, isSubmitting: false, isVerifying: false, examCompleted: false,
                    defaultNotation: task.default_notation, isPreview: task.status === 'preview' };
            }
        }
    } catch (error) {
        activeTaskState = previousTaskState;
        console.error('Could not read incomplete test:', error);
        throw new Error('The saved incomplete test could not be read on this device. Contact your teacher before continuing.');
    }
    applyStudentToolPermissions({ ...(task.tool_policy || {}), ...(task.config?.tool_policy || {}) });
    updateTaskRunnerUI();

    document.getElementById('task-completion-modal').style.display = 'none';
    document.getElementById('completion-subtitle').textContent = activeTaskState.isPreview
        ? 'Preview complete. No student submission was recorded.'
        : 'Here is how you performed:';
    if (typeof switchStudentTab === 'function') switchStudentTab('practice');
    const navBar = document.getElementById('task-nav-bar');
    if (navBar) navBar.style.display = 'flex';
    renderTaskNavigationChips();
    await loadTaskQuestion(activeTaskState.currentIndex);
}
window.startStudentTask = startStudentTask;

function launchTask(assignedTaskId) {
    window.location.search = `?task_id=${encodeURIComponent(assignedTaskId)}`;
}
window.launchTask = launchTask;

function incompleteTestStorageKey(taskState) {
    if (!currentUser?.id || !taskState.taskId) {
        throw new Error('A signed-in user and test ID are required to save an incomplete test.');
    }
    return `qederam_incomplete_test:${encodeURIComponent(currentUser.id)}:${encodeURIComponent(taskState.taskId)}:${taskState.isPreview ? 'preview' : 'student'}`;
}

function exitActiveTask() {
    if (!activeTaskState.active || activeTaskState.isSubmitting || activeTaskState.isVerifying) return;
    if (activeTaskState.isLoadingQuestion) {
        alert('Please wait for the question to finish loading before exiting.');
        return;
    }
    const isTest = activeTaskState.taskType === 'test' && !activeTaskState.examCompleted;
    const message = isTest
        ? 'Are you sure you want to exit this test? Your current answers will be saved as an incomplete session, and you will leave Exam Mode.'
        : 'Exit this assignment and return to your task list?';
    if (!confirm(message)) return;
    if (isTest) {
        try {
            captureTaskQuestionState();
            localStorage.setItem(incompleteTestStorageKey(activeTaskState), JSON.stringify(activeTaskState));
        } catch (error) {
            console.error('Could not save incomplete test:', error);
            alert('Could not save your incomplete test on this device. You are still in Exam Mode.');
            return;
        }
    }
    const previousTopic = activeTaskState.previousTopic;
    activeTaskState = {
        active: false,
        taskId: null,
        taskTitle: '',
        taskType: null,
        totalQuestions: 5,
        currentIndex: 1,
        correctCount: 0,
        responses: [],
        selectedTopic: '',
        topics: [],
        questionQueue: [],
        blocks: [],
        blockStates: [],
        currentBlockIndex: 0,
        currentBlockIdx: 0,
        currentBlock: null,
        currentBlockId: null,
        blockMode: null,
        masteryAttempts: 0,
        maxMasteryAttempts: 4,
        currentPhase: 'guided',
        questionsState: [],
        masteryAttemptsByBlock: {},
        blockProgress: { qInBlock: 0, phase: 'hint_on', failedUnassisted: false },
        previousTopic: 'random',
        isSubmitting: false,
        submitted: false,
        isPreview: false
    };
    state.selectedTopic = previousTopic || 'random';
    applyStudentToolPermissions();
    updateCurrentTopicName();
    saveState();
    window.dispatchEvent(new Event('lsrl-notation-change'));
    const nextBtn = document.getElementById('next-btn');
    nextBtn.innerText = 'Next Problem →';
    nextBtn.onclick = loadProblem;
    updateTaskRunnerUI();
    renderTaskNavigationChips();
    document.getElementById('task-completion-modal').style.display = 'none';
    removeTaskIdFromUrl();
    switchPracticeView('tasks');
}
window.exitActiveTask = exitActiveTask;

async function loadNextTaskQuestion() {
    if (!activeTaskState.active || activeTaskState.currentIndex > activeTaskState.totalQuestions) return;
    activeTaskState.currentIndex += 1;
    if (activeTaskState.currentIndex > activeTaskState.totalQuestions) {
        document.getElementById('next-btn').style.display = 'none';
        await completeStudentTask();
        return;
    }
    selectTaskTopic();
    updateTaskRunnerUI();
    loadProblem();
}

async function completeStudentTask() {
    if (activeTaskState.isSubmitting || activeTaskState.submitted) return;
    if (activeTaskState.taskType === 'test') {
        const answeredQuestions = new Set(activeTaskState.responses.map(response => response.questionIndex));
        for (let questionIndex = 1; questionIndex <= activeTaskState.totalQuestions; questionIndex += 1) {
            if (!answeredQuestions.has(questionIndex)) {
                activeTaskState.responses.push({
                    questionIndex,
                    correct: false,
                    answer: null,
                    skipped: true
                });
            }
        }
        activeTaskState.responses.sort((left, right) => left.questionIndex - right.questionIndex);
    }
    const responseCount = activeTaskState.taskType === 'test'
        ? activeTaskState.totalQuestions
        : activeTaskState.responses.length;
    const score = responseCount ? Math.round((activeTaskState.correctCount / responseCount) * 100) : 0;
    if (supabaseClient && currentUser && !activeTaskState.isPreview) {
        activeTaskState.isSubmitting = true;
        try {
            const { error } = await supabaseClient.from('assessment_submissions').upsert({
                assessment_id: activeTaskState.taskId,
                student_id: currentUser.id,
                status: 'submitted',
                score,
                responses: activeTaskState.responses,
                submitted_at: new Date().toISOString()
            }, { onConflict: 'assessment_id,student_id' });
            if (error) throw error;
            activeTaskState.submitted = true;
        } catch (error) {
            console.error('Task submission failed:', error);
            document.getElementById('completion-subtitle').textContent =
                'Your task is complete, but we could not submit the results. Please contact your teacher.';
        } finally {
            activeTaskState.isSubmitting = false;
        }
    }

    document.getElementById('completion-title').textContent = activeTaskState.taskTitle;
    document.getElementById('completion-score').textContent =
        `${activeTaskState.correctCount} / ${responseCount}`;
    document.getElementById('completion-percent').textContent = `(${score}%)`;
    document.getElementById('completion-icon').textContent = score >= 70 ? '🎉' : '📝';
    document.getElementById('task-completion-modal').style.display = 'flex';
    if (activeTaskState.taskType === 'test') {
        activeTaskState.examCompleted = true;
        updateTaskRunnerUI();
        if (activeTaskState.submitted || activeTaskState.isPreview) {
            try {
                localStorage.removeItem(incompleteTestStorageKey(activeTaskState));
            } catch (error) {
                console.error('Could not remove the saved incomplete test:', error);
            }
        }
    }
}

function finishStudentTask() {
    state.selectedTopic = activeTaskState.previousTopic || 'random';
    updateCurrentTopicName();
    saveState();
    activeTaskState = {
        active: false,
        taskId: null,
        taskTitle: '',
        taskType: 'assignment',
        totalQuestions: 5,
        currentIndex: 1,
        correctCount: 0,
        responses: [],
        selectedTopic: '',
        topics: [],
        questionQueue: [],
        blocks: [],
        blockStates: [],
        currentBlockIndex: 0,
        currentBlockIdx: 0,
        currentBlock: null,
        currentBlockId: null,
        blockMode: null,
        masteryAttempts: 0,
        maxMasteryAttempts: 4,
        currentPhase: 'guided',
        questionsState: [],
        masteryAttemptsByBlock: {},
        blockProgress: { qInBlock: 0, phase: 'hint_on', failedUnassisted: false },
        previousTopic: 'random',
        isSubmitting: false,
        submitted: false,
        isPreview: false
    };
    applyStudentToolPermissions();
    window.dispatchEvent(new Event('lsrl-notation-change'));
    const nextBtn = document.getElementById('next-btn');
    nextBtn.innerText = 'Next Problem →';
    nextBtn.onclick = loadProblem;
    updateTaskRunnerUI();
    removeTaskIdFromUrl();
    document.getElementById('task-completion-modal').style.display = 'none';
    if (typeof switchStudentTab === 'function') switchStudentTab('tasks', true);
    if (typeof loadStudentTasks === 'function') loadStudentTasks();
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
    window.currentUserRole = 'student';
    const teacherFilterBar = document.getElementById('teacher-class-filter-bar');
    if (teacherFilterBar) teacherFilterBar.style.display = 'none';
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

            window.currentUserRole = data?.role || 'student';
            if (data && data.role === 'teacher') {
                if (teacherBtn) teacherBtn.style.display = 'inline-block';
                if (teacherFilterBar) teacherFilterBar.style.display = 'flex';
            } else {
                if (teacherBtn) teacherBtn.style.display = 'none';
                if (teacherFilterBar) teacherFilterBar.style.display = 'none';
            }
        } catch (e) {
            console.warn("Role lookup failed:", e);
            window.currentUserRole = 'student';
            if (teacherBtn) teacherBtn.style.display = 'none';
            if (teacherFilterBar) teacherFilterBar.style.display = 'none';
        }

        loadSavedState();
    } else {
        if (authBtnLabel) authBtnLabel.innerText = 'Sign In';
        if (teacherBtn) teacherBtn.style.display = 'none';
        window.currentUserRole = 'student';
        if (teacherFilterBar) teacherFilterBar.style.display = 'none';
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

function loadSavedState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            state.selectedTopic = parsed.selectedTopic || 'random';
        }
    } catch (e) {
        console.warn('localStorage not accessible');
    }
    updateCurrentTopicName();
    saveState();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            selectedTopic: state.selectedTopic || 'random'
        }));
    } catch (e) {}
}

function onTopicChange() {
    const topicSelect = document.getElementById('topic-select');
    state.selectedTopic = topicSelect?.value || state.selectedTopic || 'random';
    updateCurrentTopicName();
    saveState();
    loadProblem();
}

function triggerKaTeX(element) {
    if (window.renderMathInElement && element) {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\[', right: '\\]', display: true },
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

async function loadProblem(problemToRender = null) {
    const feedbackBanner = document.getElementById('feedback-banner');
    const solutionCard = document.getElementById('solution-card');
    const nextBtn = document.getElementById('next-btn');
    if (feedbackBanner) feedbackBanner.style.display = 'none';
    if (solutionCard) solutionCard.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    hideTaskAdvanceButton();
    hadStageMistake = false;
    currentQuestionAnswers = [];

    const topic = state.selectedTopic || 'random';
    isMultiStage = topic.startsWith('ci_') || topic.startsWith('ht_') || topic.startsWith('chi_') ||
        topic.startsWith('reg_') ||
        topic.startsWith('cond_') || topic.startsWith('drill_');
    currentProblem = problemToRender;

    if (isMultiStage) {
        document.getElementById('single-input-panel').style.display = 'none';
        document.getElementById('multi-stage-panel').style.display = 'block';
        document.getElementById('graph-wrapper').style.display = 'none';
        
        if (!currentProblem) {
            const isHypothesisTest = topic.startsWith('ht_');
            const isChiSquare = topic.startsWith('chi_');
            const isRegression = topic.startsWith('reg_');
            const isInferenceDrill = topic.startsWith('cond_') || topic.startsWith('drill_');
            const problemTopic = isHypothesisTest || isChiSquare || isRegression
                ? topic
                : topic.replace('ci_', '');
            const endpoint = isInferenceDrill
                ? '/api/problem/drill'
                : isHypothesisTest ? '/api/problem/ht'
                    : isChiSquare ? '/api/problem/chi'
                        : isRegression ? '/api/problem/regression' : '/api/problem/ci';
            const notation = getActiveLsrlNotation();
            const notationParam = isRegression ? `&notation_style=${encodeURIComponent(notation)}` : '';
            const res = await fetch(`${endpoint}?topic=${encodeURIComponent(problemTopic)}${notationParam}`);
            if (!res.ok) throw new Error(`Could not load problem (${res.status}).`);
            currentProblem = await res.json();
        }
        renderMultiStageUI(topic);
    } else {
        document.getElementById('single-input-panel').style.display = 'flex';
        document.getElementById('multi-stage-panel').style.display = 'none';
        document.getElementById('graph-wrapper').style.display = 'block';
        document.getElementById('submit-btn').style.display = 'inline-block';
        
        const input = document.getElementById('answer-input');
        input.disabled = false;
        input.value = '';

        if (!currentProblem) {
            const res = await fetch(`/api/problem/normal?topic=${encodeURIComponent(topic)}`);
            currentProblem = await res.json();
        }

        document.getElementById('input-label').innerText = currentProblem.input_label || "Answer:";
        input.placeholder = currentProblem.placeholder || "e.g. 0.4532";
        input.focus();
    }

    const promptEl = document.getElementById('problem-prompt');
    promptEl.innerHTML = currentProblem.prompt;
    triggerKaTeX(promptEl);
    if (activeTaskState.active) {
        const index = activeTaskState.currentIndex - 1;
        const cachedQuestion = activeTaskState.questionsState[index];
        if (problemToRender && cachedQuestion) {
            restoreTaskQuestionState(cachedQuestion);
        } else {
            activeTaskState.questionsState[index] = {
                problem: currentProblem,
                attempted: false,
                completed: false,
                correct: null,
                stageInputs: [],
                stageStates: []
            };
        }
        renderTaskNavigationChips();
    }
    if (topic.startsWith('chi_')) {
        const solutionContent = document.getElementById('solution-content');
        if (solutionContent) solutionContent.innerHTML = currentProblem.solution;
        triggerKaTeX(solutionCard);
    }
}

function getStageInputDefinitions(step) {
    if (step.components) {
        return step.components.map(definition => definition.id === 'stage-pval'
            ? {
                ...definition,
                expected: [currentProblem.metadata.expected_pval]
            }
            : definition);
    }
    if (step.input_type === 'compound') return step.inputs || [];
    return [{
        id: null,
        type: step.input_type === 'select' ? 'select' : 'number',
        options: step.options,
        placeholder: step.placeholder,
        expected: step.expected,
        tolerance: step.tolerance
    }];
}

function getStageControlId(idx, definition) {
    return definition.id === 'stage-pval'
        ? 'step-stage-pval'
        : `stage-input-${idx}${definition.id ? `-${definition.id}` : ''}`;
}

function isMathComputationField(step, definition) {
    if (definition.type === 'select') return false;
    if (currentProblem.type?.startsWith('reg_')) return true;
    return ['sample-statistic-value', 'standard-error', 'stage-pval'].includes(definition.id) ||
        currentProblem.type?.startsWith('ht_') && step.step_num === 4;
}

function getStageControlValue(control) {
    return control.matches('math-field') ? control.getValue() : control.value;
}

function setStageControlDisabled(control, disabled) {
    if (control.matches('math-field')) control.readOnly = disabled;
    else control.disabled = disabled;
}

function renderMultiStageUI(topic) {
    const container = document.getElementById('multi-stage-panel');
    container.innerHTML = '';
    const isTest = activeTaskState.active && activeTaskState.taskType === 'test';
    const showHints = !isTest && (
        topic.startsWith('chi_') ||
        !activeTaskState.active ||
        activeTaskState.allowHints !== false
    );

    currentProblem.steps.forEach((step, idx) => {
        const box = document.createElement('div');
        box.id = `stage-box-${idx}`;
        box.className = idx === 0 ? 'stage-box active' : 'stage-box';
        box.style.display = isTest || idx === 0 ? 'block' : 'none';

        const header = document.createElement('div');
        header.className = 'stage-header';
        header.innerHTML = `<span>Step ${step.step_num}: ${step.label}</span>`;
        const status = document.createElement('span');
        status.id = `stage-status-${idx}`;
        header.appendChild(status);

        const inputRow = document.createElement('div');
        inputRow.className = `input-row stage-input-row${step.full_width || step.input_type === 'cloze' ? ' full-width' : ''}`;
        const controlId = definition => getStageControlId(idx, definition);
        const createControl = definition => {
            const isMathField = isMathComputationField(step, definition);
            const control = document.createElement(
                isMathField ? 'math-field' : definition.type === 'select' ? 'select' : 'input'
            );
            control.id = controlId(definition);
            control.autocomplete = 'off';
            control.setAttribute('aria-label', definition.label || definition.id || step.label);
            if (isMathField) {
                control.className = 'question-mathfield';
                control.setAttribute('virtual-keyboard-mode', 'manual');
                control.readOnly = idx > 0 && !isTest;
            } else {
                control.disabled = idx > 0 && !isTest;
            }
            if (definition.type === 'select') {
                control.add(new Option('Choose an answer...', ''));
                const options = definition.id === 'chi-p-alpha'
                    ? [
                        { value: 'less than or equal to', label: 'less than or equal to' },
                        { value: 'greater than', label: 'greater than' }
                    ]
                    : definition.options || [];
                options.forEach(option => {
                    const symbolLabels = {
                        'p': 'p',
                        'p̂': 'p̂',
                        'μ': 'μ',
                        'x̄': 'x̄',
                        'μ_diff': 'μ_diff',
                        'x̄_diff': 'x̄_diff'
                    };
                    const label = ['parameter-symbol', 'h0-symbol', 'ha-symbol'].includes(definition.id)
                        ? symbolLabels[option.value] || option.value
                        : option.label;
                    control.add(new Option(label, option.value));
                });
                if (definition.id === 'param-context') control.style.maxWidth = 'min(440px, 100%)';
            } else if (!isMathField) {
                control.type = 'text';
                control.inputMode = 'text';
                control.placeholder = definition.placeholder || step.placeholder || '';
                if (definition.id === 'stage-pval') {
                    control.style.width = '110px';
                    control.style.textAlign = 'center';
                }
            }
            return control;
        };
        const appendControl = (parent, definition) => {
            const control = createControl(definition);
            if (!control.matches('math-field')) {
                parent.appendChild(control);
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'math-input-wrapper';
            wrapper.appendChild(control);
            const toolbar = document.createElement('div');
            toolbar.className = 'math-micro-toolbar';
            [
                { label: '√', title: 'Insert a square root', latex: '\\sqrt{#0}' },
                { label: 'a/b', title: 'Insert a fraction', latex: '\\frac{#?}{#?}' },
                { label: '( )', title: 'Insert parentheses', latex: '\\left(#0\\right)' }
            ].forEach(symbol => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn-micro-symbol';
                button.textContent = symbol.label;
                button.title = symbol.title;
                button.setAttribute('aria-label', symbol.title);
                button.addEventListener('click', () => {
                    control.focus();
                    control.executeCommand(['insert', symbol.latex]);
                    control.focus();
                });
                toolbar.appendChild(button);
            });
            wrapper.appendChild(toolbar);
            parent.appendChild(wrapper);
            control.addEventListener('focus', () => {
                if (typeof suppressMathLiveIcons === 'function') suppressMathLiveIcons();
            });
            if (typeof suppressMathLiveIcons === 'function') suppressMathLiveIcons();
        };
        const appendComponent = (parent, componentId) => {
            const definition = step.components.find(component => component.id === componentId);
            appendControl(parent, definition);
        };
        if (step.input_type === 'parameter_definition') {
            inputRow.classList.add('stage-parameter-definition');
            if (topic === 'reg_slope_test') {
                inputRow.append('Choose the parameter definition for ');
                appendComponent(inputRow, 'parameter-symbol');
                inputRow.append(': ');
                appendComponent(inputRow, 'parameter-context');
            } else {
                inputRow.append('Let ');
                appendComponent(inputRow, 'parameter-symbol');
                inputRow.append(' represent ');
                appendComponent(inputRow, 'parameter-context');
                inputRow.append('.');
            }
        } else if (step.input_type === 'hypotheses') {
            inputRow.classList.add('stage-hypothesis-lines');
            step.rows.forEach(row => {
                const line = document.createElement('div');
                line.className = 'stage-hypothesis-line';
                const label = document.createElement('strong');
                label.textContent = row.label;
                line.append(label, ' ');
                appendComponent(line, row.symbol);
                line.append(` ${row.operator || ''}`);
                if (row.operator_component) {
                    appendComponent(line, row.operator_component);
                }
                line.append(' ');
                appendComponent(line, row.value);
                inputRow.appendChild(line);
            });
        } else if (step.input_type === 'statistic_se') {
            inputRow.classList.add('stage-hypothesis-lines');
            const statisticLine = document.createElement('div');
            statisticLine.className = 'stage-hypothesis-line';
            statisticLine.append('Sample statistic: ');
            appendComponent(statisticLine, 'sample-statistic-symbol');
            appendComponent(statisticLine, 'sample-statistic-value');
            const standardErrorLine = document.createElement('div');
            standardErrorLine.className = 'stage-hypothesis-line';
            standardErrorLine.append('Standard error: ');
            appendComponent(standardErrorLine, 'standard-error');
            inputRow.append(statisticLine, standardErrorLine);
        } else if (step.input_type === 'regression_conditions') {
            inputRow.classList.add('stage-hypothesis-lines');
            step.rows.forEach(row => {
                const line = document.createElement('div');
                line.className = 'stage-hypothesis-line';
                const label = document.createElement('span');
                label.textContent = row.label;
                line.append(label);
                appendComponent(line, row.component);
                inputRow.appendChild(line);
            });
        } else if (step.input_type === 'slope_test_statistic') {
            inputRow.classList.add('stage-hypothesis-lines');
            step.rows.forEach(row => {
                const line = document.createElement('div');
                line.className = 'stat-calc-row';
                line.style.display = 'flex';
                line.style.alignItems = 'center';
                line.style.flexWrap = 'wrap';
                line.style.gap = '10px';
                line.style.marginBottom = '12px';
                line.style.width = '100%';
                const formula = document.createElement('span');
                formula.className = 'stat-calc-formula';
                formula.innerHTML = row.formula;
                line.appendChild(formula);
                appendComponent(line, row.component);
                inputRow.appendChild(line);
            });
        } else if (step.input_type === 'cloze') {
            inputRow.classList.add('stage-cloze');
            const paragraph = document.createElement('p');
            step.parts.forEach(part => {
                if (part === '<br>') paragraph.appendChild(document.createElement('br'));
                else if (typeof part === 'string') paragraph.append(part);
                else appendComponent(paragraph, part.component);
            });
            inputRow.appendChild(paragraph);
        } else if (step.input_type === 'compound') {
            inputRow.classList.add('compound');
            (step.inputs || []).forEach(definition => {
                const field = document.createElement('label');
                field.className = 'stage-compound-field';
                field.textContent = definition.label || '';
                appendControl(field, definition);
                inputRow.appendChild(field);
            });
        } else {
            appendControl(inputRow, getStageInputDefinitions(step)[0]);
        }

        if (!isTest) {
            const verifyButton = document.createElement('button');
            verifyButton.id = `stage-btn-${idx}`;
            verifyButton.textContent = 'Verify Step';
            verifyButton.disabled = idx > 0;
            verifyButton.addEventListener('click', () => submitStage(idx));
            inputRow.appendChild(verifyButton);
        }

        const hint = document.createElement('div');
        hint.className = 'stage-hint';
        hint.textContent = step.hint || '';
        hint.hidden = !showHints;
        if (isTest) hint.style.display = 'none';
        const reveal = document.createElement('div');
        reveal.id = `stage-reveal-${idx}`;
        reveal.className = 'revealed-msg';
        reveal.style.display = 'none';
        const inputWarning = document.createElement('div');
        inputWarning.id = `stage-input-warning-${idx}`;
        inputWarning.className = 'stage-hint';
        inputWarning.style.display = 'none';
        inputWarning.style.color = '#b45309';

        box.append(header, inputRow, hint, inputWarning, reveal);
        container.appendChild(box);
        triggerKaTeX(box);
    });

    if (isTest) {
        const submitButton = document.createElement('button');
        submitButton.type = 'button';
        submitButton.className = 'btn-primary';
        submitButton.textContent = 'Submit Test Answer';
        submitButton.addEventListener('click', submitTestQuestion);
        container.appendChild(submitButton);
    }
    const firstInput = container.querySelector('#stage-box-0 input, #stage-box-0 select, #stage-box-0 math-field');
    const activeStepInputs = isTest
        ? container.querySelectorAll('input, select, math-field')
        : container.querySelectorAll('#stage-box-0 input, #stage-box-0 select, #stage-box-0 math-field');
    activeStepInputs.forEach(control => {
        control.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (isTest) submitTestQuestion();
                else submitStage(0);
            }
        });
    });
    if (firstInput) firstInput.focus();
}

async function submitTestQuestion() {
    if (!activeTaskState.active || activeTaskState.taskType !== 'test' || activeTaskState.isVerifying) return;

    const submittedAnswers = [];
    let isCorrect = true;
    currentProblem.steps.forEach((step, stepIndex) => {
        const answers = {};
        getStageInputDefinitions(step).forEach(definition => {
            const control = document.getElementById(getStageControlId(stepIndex, definition));
            answers[definition.id || `answer-${stepIndex}`] = getStageControlValue(control).trim();
        });
        submittedAnswers.push({ step_num: step.step_num, answers });
    });
    if (submittedAnswers.some(step => Object.values(step.answers).some(answer => !answer))) return;

    for (const [stepIndex, step] of currentProblem.steps.entries()) {
        showStageInputWarning(stepIndex, '');
        for (const definition of getStageInputDefinitions(step)) {
            if (definition.type === 'select') continue;
            const control = document.getElementById(getStageControlId(stepIndex, definition));
            const value = evaluateMathInput(getStageControlValue(control));
            if (!Number.isFinite(value)) {
                showStageInputWarning(stepIndex, 'Enter a valid number or arithmetic expression, such as 12/sqrt(16).');
                return;
            }
        }
    }

    activeTaskState.isVerifying = true;
    const questionState = activeTaskState.questionsState[activeTaskState.currentIndex - 1];
    if (questionState) questionState.attempted = true;
    try {
        for (const [stepIndex, step] of currentProblem.steps.entries()) {
            for (const definition of getStageInputDefinitions(step)) {
                const control = document.getElementById(getStageControlId(stepIndex, definition));
                const answer = getStageControlValue(control).trim();
                if (definition.type === 'select') {
                    if (!definition.expected.includes(answer)) isCorrect = false;
                } else {
                    const value = evaluateMathInput(answer);
                    const tolerance = definition.tolerance ?? step.tolerance ?? 0;
                    if (!Number.isFinite(value) || !definition.expected.some(
                        expected => Math.abs(value - Number(expected)) <= tolerance
                    )) {
                        isCorrect = false;
                    }
                }
            }
        }
    } finally {
        activeTaskState.isVerifying = false;
    }
    await finalizeProblem(isCorrect, submittedAnswers);
}

async function submitStage(idx) {
    const step = currentProblem.steps[idx];
    const controls = getStageInputDefinitions(step).map(definition => ({
        definition,
        control: document.getElementById(getStageControlId(idx, definition))
    }));
    const answers = controls.map(({ control }) => getStageControlValue(control).trim());
    if (answers.some(answer => !answer)) return;
    const numericValues = controls.map(({ definition }, index) =>
        definition.type === 'select' ? null : evaluateMathInput(answers[index])
    );
    if (numericValues.some((value, index) =>
        controls[index].definition.type !== 'select' && !Number.isFinite(value)
    )) {
        showStageInputWarning(idx, 'Enter a valid number or arithmetic expression, such as 12/sqrt(16).');
        return;
    }
    showStageInputWarning(idx, '');
    controls.forEach(({ control }) => {
        control.style.borderColor = '';
        control.style.backgroundColor = '';
    });
    currentQuestionAnswers[idx] = controls.length > 1 ? answers : answers[0];
    if (activeTaskState.active) {
        activeTaskState.isVerifying = true;
        const questionState = activeTaskState.questionsState[activeTaskState.currentIndex - 1];
        if (questionState) questionState.attempted = true;
    }

    let isCorrect;
    const componentResults = [];
    try {
        isCorrect = true;
        for (let inputIndex = 0; inputIndex < controls.length; inputIndex += 1) {
            const { definition } = controls[inputIndex];
            const answer = answers[inputIndex];
            let componentCorrect;
            if (definition.type === 'select') {
                componentCorrect = definition.expected.some(expected => String(expected) === answer);
            } else {
                const value = numericValues[inputIndex];
                const tolerance = definition.tolerance ?? step.tolerance ?? 0.005;
                componentCorrect = Number.isFinite(value) && definition.expected.some(
                    expected => Number.isFinite(Number(expected))
                        && Math.abs(value - Number(expected)) <= tolerance
                );
            }
            if (definition.type !== 'select') {
                updateEvaluationDisplay(
                    controls[inputIndex].control,
                    answer,
                    numericValues[inputIndex],
                    componentCorrect
                );
            }
            componentResults.push(componentCorrect);
            isCorrect = componentCorrect && isCorrect;
        }
    } finally {
        activeTaskState.isVerifying = false;
    }
    const statusEl = document.getElementById(`stage-status-${idx}`);
    const box = document.getElementById(`stage-box-${idx}`);
    const revealEl = document.getElementById(`stage-reveal-${idx}`);
    const stageInputs = Array.from(box.querySelectorAll('input, select, math-field'));
    const isTest = activeTaskState.active && activeTaskState.taskType === 'test';
    controls.forEach(({ control }, index) => {
        if (!componentResults[index]) {
            control.style.borderColor = '#dc2626';
            control.style.backgroundColor = '#fef3c7';
        }
    });

    if (isCorrect) {
        revealEl.textContent = '';
        revealEl.style.display = 'none';
        statusEl.innerHTML = isTest
            ? '<span>Step recorded.</span>'
            : '<span style="color: #10b981;">&#10004; Correct</span>';
        box.className = 'stage-box completed';
        stageInputs.forEach(control => setStageControlDisabled(control, true));
        document.getElementById(`stage-btn-${idx}`).disabled = true;

        unlockNextStage(idx);
    } else {
        if (isTest) {
            await finalizeProblem(false, currentQuestionAnswers.slice());
            return;
        }
        hadStageMistake = true;

        statusEl.innerHTML = '<span style="color: #d97706;">&#10008; Incorrect — try again to reveal the next step.</span>';
        box.className = 'stage-box revealed';
        if (!isTest) {
            revealEl.style.display = 'block';
            const feedback = controls
                .map(({ definition }, index) => definition.feedback_by_value?.[answers[index]])
                .find(Boolean);
            const expected = controls.map(({ definition }) => definition.expected[0]).join(', ');
            revealEl.innerText = `${feedback ? `${feedback} ` : ''}Expected answer: ${expected}. Correct this step to continue.`;
        }
        stageInputs.forEach(control => setStageControlDisabled(control, false));
        document.getElementById(`stage-btn-${idx}`).disabled = false;
    }
}

function showStageInputWarning(idx, message) {
    const warning = document.getElementById(`stage-input-warning-${idx}`);
    if (!warning) return;
    warning.textContent = message;
    warning.style.display = message ? 'block' : 'none';
}

function unlockNextStage(idx) {
    if (idx + 1 < currentProblem.steps.length) {
        const nextStep = currentProblem.steps[idx + 1];
        const isChiSquareFollowUp = currentProblem.type === 'chi_gof' && nextStep.step_num === 5;
        if (isChiSquareFollowUp && currentProblem.steps[idx].step_num !== 4) return;
        const nextBox = document.getElementById(`stage-box-${idx + 1}`);
        nextBox.className = 'stage-box active';
        nextBox.style.display = 'block';
        triggerKaTeX(nextBox);
        const nextInput = nextBox.querySelector('input, select, math-field');
        const nextBtn = document.getElementById(`stage-btn-${idx + 1}`);
        nextBox.querySelectorAll('input, select, math-field').forEach(input => setStageControlDisabled(input, false));
        nextBtn.disabled = false;
        nextInput.focus();

        nextBox.querySelectorAll('input, select, math-field').forEach(control => {
            control.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    submitStage(idx + 1);
                }
            });
        });
        captureTaskQuestionState();
        renderTaskNavigationChips();
    } else {
        finalizeProblem(!hadStageMistake, currentQuestionAnswers.slice());
    }
}

async function submitSingleAnswer() {
    const input = document.getElementById('answer-input');
    const rawVal = input.value.trim();
    if (!rawVal) return;

    const userVal = parseFloat(rawVal);
    if (activeTaskState.active) {
        activeTaskState.isVerifying = true;
        const questionState = activeTaskState.questionsState[activeTaskState.currentIndex - 1];
        if (questionState) questionState.attempted = true;
    }
    let data;
    try {
        const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_answer: userVal,
                expected_answers: currentProblem.expected_answers,
                tolerance: currentProblem.tolerance
            })
        });
        data = await res.json();
    } finally {
        activeTaskState.isVerifying = false;
    }
    await finalizeProblem(data.correct, rawVal);

    document.getElementById('submit-btn').style.display = 'none';
    input.disabled = true;
}

async function finalizeProblem(isSuccess, answer = null) {
    const feedback = document.getElementById('feedback-banner');
    feedback.style.display = 'block';
    const isTest = activeTaskState.active && activeTaskState.taskType === 'test';
    const completedQuestion = activeTaskState.active
        ? activeTaskState.questionQueue[activeTaskState.currentIndex - 1]
        : null;
    const questionState = activeTaskState.active
        ? activeTaskState.questionsState[activeTaskState.currentIndex - 1]
        : null;
    if (questionState?.completed) return;
    if (isTest) {
        feedback.className = 'banner';
        feedback.textContent = 'Test response recorded. Continue to the next question.';
    } else {
        if (isSuccess) {
            feedback.className = 'banner correct';
            feedback.innerHTML = '&#10004; Problem complete! All steps solved cleanly.';
        } else {
            feedback.className = 'banner incorrect';
            feedback.innerHTML = '&#10008; Problem finished with step errors.';
        }
    }

    const nextBtn = document.getElementById('next-btn');
    const showSolution = !isTest;
    if (!isSuccess && showSolution) {
        feedback.innerHTML += ' Full derivation:';
        const solCard = document.getElementById('solution-card');
        const solContent = document.getElementById('solution-content');
        if (currentProblem.plot_data) drawNormalDistribution(currentProblem.plot_data);
        solContent.innerHTML = currentProblem.solution;
        triggerKaTeX(solCard);
        solCard.style.display = 'block';
    }

    if (!activeTaskState.active) {
        nextBtn.style.display = 'inline-block';
        nextBtn.focus();
        return;
    }

    activeTaskState.responses.push({
        questionIndex: activeTaskState.currentIndex,
        prompt: currentProblem.prompt,
        correct: Boolean(isSuccess),
        answer,
        blockId: completedQuestion?.blockId || null,
        phase: completedQuestion?.phase || null
    });
    if (questionState) {
        questionState.attempted = true;
        questionState.completed = true;
        questionState.correct = Boolean(isSuccess);
        questionState.answer = answer;
    }
    if (isSuccess) activeTaskState.correctCount += 1;
    if (completedQuestion?.blockId) {
        const blockIndex = completedQuestion.blockIndex;
        const blockState = activeTaskState.blockStates[blockIndex];
        const makeQuestion = (phase, allowHints) => ({
            topic: completedQuestion.topic,
            allow_hints: allowHints,
            blockId: completedQuestion.blockId,
            blockIndex,
            qInBlock: blockState.attemptsCount,
            mode: blockState.mode,
            phase
        });
        const discardRemainingBlockQuestions = () => {
            const retained = activeTaskState.questionQueue
                .map((question, index) => ({ question, state: activeTaskState.questionsState[index], index }))
                .filter(item => item.index < activeTaskState.currentIndex || item.question.blockIndex !== blockIndex);
            activeTaskState.questionQueue = retained.map(item => item.question);
            activeTaskState.questionsState = retained.map(item => item.state || null);
        };
        const insertBlockQuestions = questions => {
            activeTaskState.questionQueue.splice(activeTaskState.currentIndex, 0, ...questions);
            activeTaskState.questionsState.splice(activeTaskState.currentIndex, 0, ...questions.map(() => null));
        };

        blockState.attemptsCount += 1;
        activeTaskState.blockProgress.failedUnassisted = completedQuestion.allow_hints === false && !isSuccess;
        if (blockState.mode === 'scaffold') {
            if (completedQuestion.phase === 'guided') {
                blockState.guidedPassed = true;
                blockState.phase = 'independent';
                feedback.innerHTML += ' Guided step complete! Now solve a fresh problem independently without hints.';
            } else if (isSuccess) {
                blockState.completed = true;
                feedback.innerHTML += ' Scaffolded block complete.';
                discardRemainingBlockQuestions();
            } else {
                blockState.phase = 'guided';
                blockState.guidedPassed = false;
                feedback.innerHTML += ' Review the derivation, then try guided practice again.';
                discardRemainingBlockQuestions();
                insertBlockQuestions([makeQuestion('guided', true), makeQuestion('independent', false)]);
            }
        } else if (blockState.mode === 'mastery') {
            if (completedQuestion.phase === 'guided') {
                blockState.guidedPassed = true;
                blockState.phase = 'independent';
                feedback.innerHTML += ' Guided step complete. Continue with an unassisted mastery problem.';
            } else if (isSuccess) {
                blockState.cleanPassesCount += 1;
                if (blockState.cleanPassesCount >= blockState.requiredPasses) {
                    blockState.completed = true;
                    feedback.innerHTML += ' 🎯 Mastery block complete with the required unassisted passes.';
                    discardRemainingBlockQuestions();
                } else if (blockState.attemptsCount >= blockState.maxAttempts) {
                    blockState.completed = true;
                    if (questionState) questionState.maxAttemptsReached = true;
                    feedback.innerHTML += ' <strong>⚠️ Max Attempts Reached for this Topic.</strong> Move on to the next section or review with your teacher.';
                    discardRemainingBlockQuestions();
                } else {
                    blockState.phase = 'independent';
                    feedback.innerHTML += ` Clean pass ${blockState.cleanPassesCount} of ${blockState.requiredPasses}! Keep going.`;
                    discardRemainingBlockQuestions();
                    insertBlockQuestions([makeQuestion('independent', false)]);
                }
            } else {
                blockState.cleanPassesCount = 0;
                blockState.guidedPassed = false;
                blockState.phase = 'guided';
                if (blockState.attemptsCount >= blockState.maxAttempts) {
                    blockState.completed = true;
                    if (questionState) questionState.maxAttemptsReached = true;
                    feedback.innerHTML = '<strong>⚠️ Max Attempts Reached for this Topic.</strong><br>You have completed the allowed attempts for this practice block. Move on to the next section or review with your teacher.';
                    discardRemainingBlockQuestions();
                } else {
                    feedback.innerHTML += ' Review the derivation, then return to guided practice.';
                    discardRemainingBlockQuestions();
                    insertBlockQuestions([makeQuestion('guided', true), makeQuestion('independent', false)]);
                }
            }
        } else {
            blockState.completedCount += 1;
            if (blockState.completedCount >= blockState.count) blockState.completed = true;
        }
        activeTaskState.currentBlockIndex = blockIndex;
        activeTaskState.currentBlockIdx = blockIndex;
        activeTaskState.masteryAttempts = blockState.attemptsCount + 1;
        activeTaskState.maxMasteryAttempts = blockState.maxAttempts;
        activeTaskState.totalQuestions = activeTaskState.questionQueue.length;
    }
    activeTaskState.totalQuestions = activeTaskState.questionQueue.length;
    if (questionState) {
        questionState.completed = true;
        questionState.correct = Boolean(isSuccess);
        questionState.problem = currentProblem;
        questionState.feedbackHtml = feedback.innerHTML;
        questionState.feedbackClass = feedback.className;
        questionState.feedbackDisplay = feedback.style.display;
        const solutionContent = document.getElementById('solution-content');
        const solutionCard = document.getElementById('solution-card');
        questionState.solutionHtml = solutionContent?.innerHTML || '';
        questionState.solutionDisplay = solutionCard?.style.display || 'none';
    }
    captureTaskQuestionState();
    updateTaskRunnerUI();
    renderTaskNavigationChips();
    nextBtn.style.display = 'none';
    showTaskAdvanceButton();
    document.getElementById('task-advance-btn')?.focus();
}

window.addEventListener('load', async () => {
    const notationSelect = document.getElementById('lsrl-notation-select');
    if (notationSelect) notationSelect.value = state.lsrlNotationStyle;
    const rootView = taskId ? 'tasks' : 'catalog';
    state.previousView = rootView;
    history.replaceState({ appView: rootView, navigationRoot: true }, '', `#${rootView}`);
    history.pushState({ appView: rootView, navigationRoot: true }, '', `#${rootView}`);

    await initAuth();
    const finishTaskButton = document.getElementById('btn-finish-task');
    if (finishTaskButton) finishTaskButton.addEventListener('click', finishStudentTask);
    if (taskId) {
        try {
            await startAssignedTask(taskId);
        } catch (error) {
            console.error('Could not start assigned task:', error);
            await fetchStudentTasks();
            switchPracticeView('tasks', true);
            const message = document.createElement('p');
            message.setAttribute('role', 'alert');
            message.className = 'banner incorrect';
            message.textContent = error.message || 'Could not start this task.';
            document.getElementById('tasks-list').prepend(message);
        }
    } else {
        const tasks = await fetchStudentTasks();
        if (tasks && tasks.length > 0) {
            switchPracticeView('tasks', true);
        } else {
            switchPracticeView('catalog', true);
        }
    }
    const ansInput = document.getElementById('answer-input');
    if (ansInput) {
        ansInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitSingleAnswer();
        });
    }
});
