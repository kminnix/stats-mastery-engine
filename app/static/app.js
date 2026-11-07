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
    { id: 'ci_prop_z', title: '1-Sample z-Interval for Proportion', topic: 'Confidence Intervals', notation: 'p' },
    { id: 'ci_prop_z_2samp', title: '2-Sample z-Interval for Proportions', topic: 'Confidence Intervals', notation: 'p₁ - p₂' },
    { id: 'ci_mean_t', title: '1-Sample t-Interval for Mean', topic: 'Confidence Intervals', notation: 'μ' },
    { id: 'ci_mean_t_2samp', title: '2-Sample t-Interval for Means', topic: 'Confidence Intervals', notation: 'μ₁ - μ₂' },
    { id: 'ci_matched_pairs_t', title: 'Matched Pairs t-Interval', topic: 'Confidence Intervals', notation: '\\mu_{\\text{diff}}' },
    { id: 'ht_prop_z', title: '1-Sample z-Test for Proportion', topic: 'Hypothesis Testing', notation: 'H_0: p = p_0' },
    { id: 'ht_mean_t', title: '1-Sample t-Test for Mean', topic: 'Hypothesis Testing', notation: 'H_0: \\mu = \\mu_0' }
];

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
        ci_prop_z:  { streak: 0, mastered: false },
        ci_mean_t_2samp: { streak: 0, mastered: false },
        ci_prop_z_2samp: { streak: 0, mastered: false },
        ci_matched_pairs_t: { streak: 0, mastered: false },
        ht_prop_z: { streak: 0, mastered: false },
        ht_mean_t: { streak: 0, mastered: false }
    }
};

function getTaskTopics(task) {
    const supportedTopics = TOPIC_REGISTRY.map(topic => topic.id);
    const configuredTopics = Array.isArray(task.config?.topics) ? task.config.topics : [];
    return configuredTopics.filter(topic => supportedTopics.includes(topic));
}

function updateCurrentSkillName() {
    const skillName = document.getElementById('current-skill-name');
    const topic = TOPIC_REGISTRY.find(item => item.id === state.selectedTopic);
    if (skillName) skillName.textContent = topic?.title || 'All Normal Types (Mixed)';
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
            const skill = state.skills[topic.id] || { streak: 0, mastered: false };
            const isMastered = skill.mastered || skill.streak >= TARGET_MASTERY;
            const row = document.createElement('div');
            row.className = 'catalog-item-row';
            row.dataset.searchText = `${topic.topic} ${topic.title} ${topic.notation}`.toLowerCase();

            const details = document.createElement('div');
            details.className = 'catalog-item-details';
            const title = document.createElement('div');
            title.className = 'catalog-item-title';
            title.textContent = topic.title;
            const notation = document.createElement('span');
            notation.className = 'catalog-math-pill';
            notation.textContent = `\\(${topic.notation}\\)`;
            details.append(title, notation);

            const status = document.createElement('span');
            status.className = isMastered ? 'catalog-mastery-status mastered' : 'catalog-mastery-status';
            status.textContent = isMastered
                ? `✔ Mastered (${skill.streak}/${TARGET_MASTERY})`
                : `Streak ${skill.streak || 0}/${TARGET_MASTERY}`;

            const practiceButton = document.createElement('button');
            practiceButton.type = 'button';
            practiceButton.className = 'btn-primary catalog-practice-btn';
            practiceButton.textContent = 'Practice →';
            practiceButton.addEventListener('click', () => startPracticingTopic(topic.id, topic.title));

            row.append(details, status, practiceButton);
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
        let visibleSkills = 0;
        category.querySelectorAll('.catalog-item-row').forEach(row => {
            const matches = !query || row.dataset.searchText.includes(query);
            row.style.display = matches ? '' : 'none';
            if (matches) visibleSkills += 1;
        });
        category.style.display = visibleSkills ? '' : 'none';
        const heading = category.querySelector('.catalog-category-heading');
        const chevron = category.querySelector('.catalog-category-chevron');
        const expanded = !query || visibleSkills > 0;
        category.classList.toggle('is-collapsed', !expanded);
        if (heading) heading.setAttribute('aria-expanded', String(expanded));
        if (chevron) chevron.textContent = expanded ? '▾' : '▸';
    });
}

function switchPracticeView(viewName, shouldLoadTasks = true) {
    if (activeTaskState.active && viewName === 'catalog') return;

    const views = {
        practice: document.getElementById('practice-view'),
        tasks: document.getElementById('tasks-view'),
        catalog: document.getElementById('catalog-view')
    };
    const buttons = {
        tasks: document.getElementById('nav-tasks-btn'),
        catalog: document.getElementById('nav-topics-btn')
    };

    Object.entries(views).forEach(([name, view]) => {
        if (view) view.style.display = name === viewName ? 'block' : 'none';
    });
    Object.entries(buttons).forEach(([name, button]) => {
        if (button) button.classList.toggle('active', name === viewName);
    });
    if (viewName === 'tasks' && shouldLoadTasks && typeof fetchStudentTasks === 'function') {
        fetchStudentTasks();
    } else if (viewName === 'catalog') {
        renderTopicCatalog();
    }
}

function startPracticingTopic(topicId, title) {
    if (activeTaskState.active) return;

    state.selectedTopic = topicId;
    const skillName = document.getElementById('current-skill-name');
    const topic = TOPIC_REGISTRY.find(item => item.id === topicId);
    if (skillName) skillName.textContent = title || topic?.title || 'All Normal Types (Mixed)';
    saveState();
    switchPracticeView('practice', false);
    loadProblem();
}

function updateTaskRunnerUI() {
    const banner = document.getElementById('task-runner-banner');
    const topicsButton = document.getElementById('nav-topics-btn');
    if (topicsButton) topicsButton.disabled = activeTaskState.active;

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
            badges.push('<span class="badge" style="background: #fef3c7; color: #b45309; border: 1px solid #fde68a;">📝 Test (Exam Conditions)</span>');
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
        ? currentProblem.steps.map((_step, stageIndex) => ({
            value: document.getElementById(`stage-input-${stageIndex}`)?.value ?? '',
            disabled: document.getElementById(`stage-input-${stageIndex}`)?.disabled ?? true,
            className: document.getElementById(`stage-box-${stageIndex}`)?.className || 'stage-box',
            status: document.getElementById(`stage-status-${stageIndex}`)?.innerHTML || '',
            revealDisplay: document.getElementById(`stage-reveal-${stageIndex}`)?.style.display || 'none',
            revealText: document.getElementById(`stage-reveal-${stageIndex}`)?.textContent || '',
            buttonDisabled: document.getElementById(`stage-btn-${stageIndex}`)?.disabled ?? true
        }))
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
            const input = document.getElementById(`stage-input-${index}`);
            const box = document.getElementById(`stage-box-${index}`);
            const status = document.getElementById(`stage-status-${index}`);
            const reveal = document.getElementById(`stage-reveal-${index}`);
            const verifyButton = document.getElementById(`stage-btn-${index}`);
            if (input) {
                input.value = stage.value;
                input.disabled = stage.disabled;
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
        let label = 'Review & Submit Assessment 🏁';
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
        button.textContent = label;
    } else {
        button.textContent = currentQuestion?.maxAttemptsReached
            ? 'Next Problem →'
            : activeTaskState.currentIndex === activeTaskState.totalQuestions
                ? 'Review & Submit Assessment 🏁'
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
    updateCurrentSkillName();
    updateTaskRunnerUI();
    renderTaskNavigationChips();
    const cachedQuestion = activeTaskState.questionsState[targetIndex - 1];
    if (cachedQuestion?.problem) {
        currentProblem = cachedQuestion.problem;
        await loadProblem(currentProblem);
    } else {
        await loadProblem();
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
        updateCurrentSkillName();
        return;
    }

    const topics = activeTaskState.topics;
    const topic = topics.length
        ? topics[(activeTaskState.currentIndex - 1) % topics.length]
        : activeTaskState.selectedTopic;
    state.selectedTopic = topic || 'random';
    updateCurrentSkillName();
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
    const topics = getTaskTopics(task);
    const configuredCount = parseInt(task.question_count || task.config?.total_count || task.config?.count, 10);
    const taskType = task.task_type || task.type || 'assignment';
    const assignedTopic = task.skill_topic || task.config?.skill_topic || task.config?.topic;
    const supportedTopics = new Set(TOPIC_REGISTRY.map(topic => topic.id));
    const questionQueue = [];
    const configuredBlocks = Array.isArray(task.config?.blocks) ? task.config.blocks : null;
    const taskBlocks = configuredBlocks
        ? configuredBlocks.map((block, index) => ({ ...block, id: block?.id || `block-${index}` }))
        : [];
    if (configuredBlocks) {
        if (!taskBlocks.length) {
            throw new Error('This task does not have any question blocks configured.');
        }
        taskBlocks.forEach((block, blockIndex) => {
            if (!block || !supportedTopics.has(block.topic)) {
                throw new Error('This task contains a block for an unsupported skill.');
            }
            if (!['scaffold', 'mastery', 'all_hints', 'no_hints'].includes(block.mode)) {
                throw new Error('This task contains a block with an unsupported practice mode.');
            }
            const parsedCount = parseInt(block.count, 10);
            if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 50) {
                throw new Error('This task contains an invalid question count.');
            }
            const count = block.mode === 'mastery' || block.mode === 'scaffold'
                ? Math.max(2, parsedCount)
                : parsedCount;
            for (let index = 0; index < count; index += 1) {
                let phase = 'standard';
                let allowHints = block.mode === 'all_hints';
                if (block.mode === 'scaffold') {
                    phase = index === 0 ? 'guided' : 'independent';
                    allowHints = index === 0;
                } else if (block.mode === 'mastery') {
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
                throw new Error('This task contains a question for an unsupported skill.');
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
    activeTaskState = {
        active: true,
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

    document.getElementById('task-completion-modal').style.display = 'none';
    document.getElementById('completion-subtitle').textContent = activeTaskState.isPreview
        ? 'Preview complete. No student submission was recorded.'
        : 'Here is how you performed:';
    if (typeof switchStudentTab === 'function') switchStudentTab('practice');
    const navBar = document.getElementById('task-nav-bar');
    if (navBar) navBar.style.display = 'flex';
    renderTaskNavigationChips();
    await loadTaskQuestion(1);
}
window.startStudentTask = startStudentTask;

function launchTask(assignedTaskId) {
    window.location.search = `?task_id=${encodeURIComponent(assignedTaskId)}`;
}
window.launchTask = launchTask;

function exitTask() {
    if (!activeTaskState.active || !confirm('Exit task? Progress may not be saved')) return;
    const previousTopic = activeTaskState.previousTopic;
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
    state.selectedTopic = previousTopic || 'random';
    updateCurrentSkillName();
    saveState();
    const nextBtn = document.getElementById('next-btn');
    nextBtn.innerText = 'Next Problem →';
    nextBtn.onclick = loadProblem;
    updateTaskRunnerUI();
    renderTaskNavigationChips();
    document.getElementById('task-completion-modal').style.display = 'none';
    removeTaskIdFromUrl();
    if (typeof switchStudentTab === 'function') switchStudentTab('tasks');
}
window.exitTask = exitTask;

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
    const responseCount = activeTaskState.responses.length;
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
}

function finishStudentTask() {
    state.selectedTopic = activeTaskState.previousTopic || 'random';
    updateCurrentSkillName();
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
    const nextBtn = document.getElementById('next-btn');
    nextBtn.innerText = 'Next Problem →';
    nextBtn.onclick = loadProblem;
    updateTaskRunnerUI();
    removeTaskIdFromUrl();
    document.getElementById('task-completion-modal').style.display = 'none';
    if (typeof switchStudentTab === 'function') switchStudentTab('tasks', false);
    if (typeof loadStudentTasks === 'function') loadStudentTasks();
}

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

        loadCloudState();
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
            updateCurrentSkillName();
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
    updateCurrentSkillName();
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
    const topicSelect = document.getElementById('topic-select');
    state.selectedTopic = topicSelect?.value || state.selectedTopic || 'random';
    updateCurrentSkillName();
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
    const catalogView = document.getElementById('catalog-view');
    if (catalogView && catalogView.style.display !== 'none') renderTopicCatalog();
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
    isMultiStage = topic.startsWith('ci_') || topic.startsWith('ht_');
    currentProblem = problemToRender;

    if (isMultiStage) {
        document.getElementById('single-input-panel').style.display = 'none';
        document.getElementById('multi-stage-panel').style.display = 'block';
        document.getElementById('graph-wrapper').style.display = 'none';
        
        if (!currentProblem) {
            const isHypothesisTest = topic.startsWith('ht_');
            const problemTopic = isHypothesisTest ? topic : topic.replace('ci_', '');
            const endpoint = isHypothesisTest ? '/api/problem/ht' : '/api/problem/ci';
            const res = await fetch(`${endpoint}?topic=${encodeURIComponent(problemTopic)}`);
            currentProblem = await res.json();
        }
        renderMultiStageUI();
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
}

function renderMultiStageUI() {
    const container = document.getElementById('multi-stage-panel');
    container.innerHTML = '';
    const showHints = !activeTaskState.active || (
        activeTaskState.allowHints !== false &&
        (activeTaskState.taskType !== 'test' || activeTaskState.blocks.length > 0)
    );

    currentProblem.steps.forEach((step, idx) => {
        const box = document.createElement('div');
        box.id = `stage-box-${idx}`;
        box.className = idx === 0 ? 'stage-box active' : 'stage-box';
        if (idx > 0) box.style.opacity = '0.45';

        const header = document.createElement('div');
        header.className = 'stage-header';
        header.innerHTML = `<span>Step ${step.step_num}: ${step.label}</span>`;
        const status = document.createElement('span');
        status.id = `stage-status-${idx}`;
        header.appendChild(status);

        const inputRow = document.createElement('div');
        inputRow.className = 'input-row stage-input-row';
        const input = document.createElement(step.input_type === 'select' ? 'select' : 'input');
        input.id = `stage-input-${idx}`;
        input.disabled = idx > 0;
        input.autocomplete = 'off';
        if (step.input_type === 'select') {
            input.add(new Option('Choose an answer...', ''));
            (step.options || []).forEach(option => {
                input.add(new Option(option.label, option.value));
            });
        } else {
            input.type = 'number';
            input.step = 'any';
            input.placeholder = step.placeholder || '';
        }

        const verifyButton = document.createElement('button');
        verifyButton.id = `stage-btn-${idx}`;
        verifyButton.textContent = 'Verify Step';
        verifyButton.disabled = idx > 0;
        verifyButton.addEventListener('click', () => submitStage(idx));
        inputRow.append(input, verifyButton);

        const hint = document.createElement('div');
        hint.className = 'stage-hint';
        hint.textContent = step.hint || '';
        hint.hidden = !showHints;
        const reveal = document.createElement('div');
        reveal.id = `stage-reveal-${idx}`;
        reveal.className = 'revealed-msg';
        reveal.style.display = 'none';

        box.append(header, inputRow, hint, reveal);
        container.appendChild(box);
        if (showHints) triggerKaTeX(hint);
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
    if (activeTaskState.active) {
        activeTaskState.isVerifying = true;
        const questionState = activeTaskState.questionsState[activeTaskState.currentIndex - 1];
        if (questionState) questionState.attempted = true;
    }

    const step = currentProblem.steps[idx];
    let isCorrect;
    try {
        if (step.input_type === 'select') {
            isCorrect = step.expected.some(expected => String(expected) === rawVal);
        } else {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_answer: parseFloat(rawVal),
                    expected_answers: step.expected,
                    tolerance: step.tolerance
                })
            });
            const data = await res.json();
            isCorrect = data.correct;
        }
    } finally {
        activeTaskState.isVerifying = false;
    }
    const statusEl = document.getElementById(`stage-status-${idx}`);
    const box = document.getElementById(`stage-box-${idx}`);
    const revealEl = document.getElementById(`stage-reveal-${idx}`);
    const isTest = activeTaskState.active && activeTaskState.taskType === 'test';

    if (isCorrect) {
        statusEl.innerHTML = isTest
            ? '<span>Step recorded.</span>'
            : '<span style="color: #10b981;">&#10004; Correct</span>';
        box.className = 'stage-box completed';
        input.disabled = true;
        document.getElementById(`stage-btn-${idx}`).disabled = true;

        unlockNextStage(idx);
    } else {
        hadStageMistake = true;
        if (!isTest) {
            const skillState = getActiveSkillState();
            skillState.streak = 0;
            saveState();
        }

        statusEl.innerHTML = isTest
            ? '<span>Step recorded.</span>'
            : '<span style="color: #d97706;">&#10008; Incorrect (Revealed)</span>';
        box.className = isTest ? 'stage-box completed' : 'stage-box revealed';
        if (!isTest) input.value = step.expected[0];
        input.disabled = true;
        document.getElementById(`stage-btn-${idx}`).disabled = true;
        if (!isTest) {
            revealEl.style.display = 'block';
            revealEl.innerText = `Expected value: ${step.expected[0]} (use this to proceed to the next step).`;
        }

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
        feedback.textContent = "Answer recorded. Click 'Next Problem' to continue.";
    } else {
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
    }

    const nextBtn = document.getElementById('next-btn');
    const showSolution = !isTest || (completedQuestion?.mode === 'mastery' && !isSuccess);
    if (!isSuccess && showSolution) {
        feedback.innerHTML += ' Full derivation:';
        const solCard = document.getElementById('solution-card');
        const solContent = document.getElementById('solution-content');
        if (currentProblem.plot_data) drawNormalDistribution(currentProblem.plot_data);
        solContent.innerHTML = currentProblem.solution;
        triggerKaTeX(solContent);
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
                    feedback.innerHTML += ' <strong>⚠️ Max Attempts Reached for this Skill.</strong> Move on to the next section or review with your teacher.';
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
                    feedback.innerHTML = '<strong>⚠️ Max Attempts Reached for this Skill.</strong><br>You have completed the allowed attempts for this practice block. Move on to the next section or review with your teacher.';
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
    await initAuth();
    const exitTaskButton = document.getElementById('btn-exit-task');
    if (exitTaskButton) exitTaskButton.addEventListener('click', exitTask);
    const finishTaskButton = document.getElementById('btn-finish-task');
    if (finishTaskButton) finishTaskButton.addEventListener('click', finishStudentTask);
    if (taskId) {
        try {
            await startAssignedTask(taskId);
        } catch (error) {
            console.error('Could not start assigned task:', error);
            await fetchStudentTasks();
            switchPracticeView('tasks', false);
            const message = document.createElement('p');
            message.setAttribute('role', 'alert');
            message.className = 'banner incorrect';
            message.textContent = error.message || 'Could not start this task.';
            document.getElementById('tasks-list').prepend(message);
        }
    } else {
        const tasks = await fetchStudentTasks();
        if (tasks && tasks.length > 0) {
            switchPracticeView('tasks', false);
        } else {
            switchPracticeView('catalog');
        }
    }
    const ansInput = document.getElementById('answer-input');
    if (ansInput) {
        ansInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitSingleAnswer();
        });
    }
});
