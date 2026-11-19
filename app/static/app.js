const STORAGE_KEY = 'qederam_state_v1';
const urlParams = new URLSearchParams(window.location.search);
const taskId = urlParams.get('task_id');

function evaluateMathInput(rawStringOrLatex) {
    if (!rawStringOrLatex || !rawStringOrLatex.trim()) return NaN;
    const str = rawStringOrLatex.trim()
        .replace(/√\s*\(/g, 'sqrt(')
        .replace(/²/g, '^2')
        .replace(/³/g, '^3');
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

let currentProblem = null;
let isMultiStage = false;
let currentFrqAttemptCount = 0;
let currentFrqEvaluation = null;
let currentQuestionAnswers = [];
let currentStepAttemptStates = [];
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
    earnedPoints: 0,
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
    { id: 'eda_summary', title: '1-Variable Summary Stats, IQR & Outliers (Full)', topic: 'Exploring Data & Probability Rules', notation: 'Q₁, Q₃, IQR' },
    { id: 'eda_five_num', title: 'Five-Number Summary (Min, Q1, Med, Q3, Max)', topic: 'Exploring Data & Probability Rules', notation: 'Q₁, Q₃' },
    { id: 'eda_iqr_fences', title: 'IQR & 1.5×IQR Outlier Fences', topic: 'Exploring Data & Probability Rules', notation: 'IQR' },
    { id: 'eda_mean_sd', title: 'Sample Mean & Standard Deviation', topic: 'Exploring Data & Probability Rules', notation: 'x̄, s' },
    { id: 'rv_transform_combine', title: 'Transforming & Combining Random Variables (Full)', topic: 'Exploring Data & Probability Rules', notation: 'μ, σ' },
    { id: 'rv_transform', title: 'Linear Transformation (a + bX)', topic: 'Exploring Data & Probability Rules', notation: 'a + bX' },
    { id: 'rv_combine', title: 'Combining Independent Random Variables (X ± Y)', topic: 'Exploring Data & Probability Rules', notation: 'X ± Y' },
    { id: 'prob_twoway', title: 'Two-Way Tables & Conditional Probability (Full)', topic: 'Exploring Data & Probability Rules', notation: 'P(A | B)' },
    { id: 'prob_marginal_joint', title: 'Marginal & Joint Probabilities', topic: 'Exploring Data & Probability Rules', notation: 'P(A), P(A ∩ B)' },
    { id: 'prob_conditional', title: 'Conditional Probability & Independence Check', topic: 'Exploring Data & Probability Rules', notation: 'P(A | B)' },
    { id: 'prob_discrete_rv', title: 'Discrete Random Variables (E(X) & SD)', topic: 'Random Variables & Probability Distributions', notation: 'E(X), σ_X' },
    { id: 'prob_binom_geom', title: 'Binomial & Geometric Distributions', topic: 'Random Variables & Probability Distributions', notation: 'Binom(n, p), Geom(p)' },
    { id: 'sampling_dist', title: 'Sampling Distributions for x̄ and p̂', topic: 'Sampling Distributions (CLT)', notation: 'x̄, p̂' },
    { id: 'drill_proc_ci_prop', title: 'Naming the Procedure (Intervals for p)', topic: 'Confidence Intervals for Proportions (p)', notation: 'z-Interval' },
    { id: 'cond_check_prop', title: 'Checking Conditions for Proportions', topic: 'Confidence Intervals for Proportions (p)', notation: 'Random, 10%, Large Counts' },
    { id: 'drill_se_prop', title: 'Standard Error for Proportions', topic: 'Confidence Intervals for Proportions (p)', notation: 'SE = √(p̂(1 − p̂)/n)' },
    { id: 'ci_prop_z', title: '1-Sample z-Interval for Proportion', topic: 'Confidence Intervals for Proportions (p)', notation: 'p' },
    { id: 'frq_ci_prop_1samp', title: 'Full FRQ: 1-Sample z-Interval for Proportion (p)', topic: 'Confidence Intervals for Proportions (p)', notation: 'p' },
    { id: 'ci_prop_z_2samp', title: '2-Sample z-Interval for Proportions', topic: 'Confidence Intervals for Proportions (p)', notation: 'p₁ - p₂' },
    { id: 'frq_ci_prop_2samp', title: 'Full FRQ: 2-Sample z-Interval for Proportions (p₁ - p₂)', topic: 'Confidence Intervals for Proportions (p)', notation: 'p₁ - p₂' },
    { id: 'ci_prop_cond', title: 'Checking Conditions for Proportion Intervals', topic: 'Confidence Intervals for Proportions (p)', notation: 'Conditions' },
    { id: 'ci_prop_crit_se', title: 'Critical Value (z*) & Standard Error for p', topic: 'Confidence Intervals for Proportions (p)', notation: 'z*, SE' },
    { id: 'ci_prop_bounds', title: 'Margin of Error & Interval Bounds for p', topic: 'Confidence Intervals for Proportions (p)', notation: 'E, L, U' },
    { id: 'ci_prop_interp', title: 'Interpreting a Proportion Confidence Interval', topic: 'Confidence Intervals for Proportions (p)', notation: 'p' },
    { id: 'drill_proc_ht_prop', title: 'Naming the Procedure (Tests for p)', topic: 'Significance Tests for Proportions (p)', notation: 'z-Test' },
    { id: 'drill_hypo_prop', title: 'Stating Hypotheses for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'H₀, Hₐ' },
    { id: 'drill_stat_prop', title: 'Test Statistic & SE for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'SE₀, z' },
    { id: 'drill_conclusion_prop', title: 'P-Value & Conclusion for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'p-value vs. α' },
    { id: 'ht_prop_z', title: '1-Sample z-Test for Proportion', topic: 'Significance Tests for Proportions (p)', notation: 'H₀: p = p₀' },
    { id: 'frq_ht_prop_1samp', title: 'Full FRQ: 1-Sample z-Test for Proportion (p)', topic: 'Significance Tests for Proportions (p)', notation: 'H₀, z, P' },
    { id: 'ht_prop_z_2samp', title: '2-Sample z-Test for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'H₀: p₁ = p₂' },
    { id: 'frq_ht_prop_2samp', title: 'Full FRQ: 2-Sample z-Test for Proportions (p₁ - p₂)', topic: 'Significance Tests for Proportions (p)', notation: 'H₀, z, P' },
    { id: 'ht_prop_hypo', title: 'Stating Hypotheses for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'H₀, Hₐ' },
    { id: 'ht_prop_cond', title: 'Checking Conditions for Proportion Tests', topic: 'Significance Tests for Proportions (p)', notation: 'Conditions' },
    { id: 'ht_prop_stat', title: 'Standard Error (SE₀) & z-Statistic for p', topic: 'Significance Tests for Proportions (p)', notation: 'SE₀, z' },
    { id: 'ht_prop_pval', title: 'P-Value & Interpretation for Proportions', topic: 'Significance Tests for Proportions (p)', notation: 'P-value' },
    { id: 'ht_prop_conc', title: 'Decision & Contextual Conclusion for p', topic: 'Significance Tests for Proportions (p)', notation: 'P-value, α' },
    { id: 'drill_proc_ci_mean', title: 'Naming the Procedure (Intervals for μ)', topic: 'Confidence Intervals for Means (μ)', notation: 't-Interval' },
    { id: 'cond_check_mean', title: 'Checking Conditions for Means', topic: 'Confidence Intervals for Means (μ)', notation: 'Random, 10%, Normality' },
    { id: 'drill_se_mean', title: 'Standard Error & Critical Value (t*) for Means', topic: 'Confidence Intervals for Means (μ)', notation: 'SE = s/√n, t*' },
    { id: 'ci_mean_t', title: '1-Sample t-Interval for Mean', topic: 'Confidence Intervals for Means (μ)', notation: 'μ' },
    { id: 'frq_ci_mean_1samp', title: 'Full FRQ: 1-Sample t-Interval for Mean (μ)', topic: 'Confidence Intervals for Means (μ)', notation: 'μ' },
    { id: 'ci_mean_t_2samp', title: '2-Sample t-Interval for Means', topic: 'Confidence Intervals for Means (μ)', notation: 'μ₁ - μ₂' },
    { id: 'frq_ci_mean_2samp', title: 'Full FRQ: 2-Sample t-Interval for Means (μ₁ - μ₂)', topic: 'Confidence Intervals for Means (μ)', notation: 'μ₁ - μ₂' },
    { id: 'drill_proc_matched_pairs', title: 'Naming the Procedure (Matched Pairs)', topic: 'Confidence Intervals for Means (μ)', notation: 'Matched Pairs t' },
    { id: 'ci_matched_pairs_t', title: 'Matched Pairs t-Interval for Mean Difference', topic: 'Confidence Intervals for Means (μ)', notation: 'μ_diff' },
    { id: 'frq_ci_matched_pairs', title: 'Full FRQ: Matched Pairs t-Interval for Mean Difference (μ_diff)', topic: 'Confidence Intervals for Means (μ)', notation: 'μ_diff' },
    { id: 'ci_mean_cond', title: 'Checking Conditions for Mean Intervals', topic: 'Confidence Intervals for Means (μ)', notation: 'Conditions' },
    { id: 'ci_mean_crit_se', title: 'Degrees of Freedom, t* & SE for μ', topic: 'Confidence Intervals for Means (μ)', notation: 'df, t*, SE' },
    { id: 'ci_mean_bounds', title: 'Margin of Error & Interval Bounds for μ', topic: 'Confidence Intervals for Means (μ)', notation: 'E, L, U' },
    { id: 'ci_mean_interp', title: 'Interpreting a Mean Confidence Interval', topic: 'Confidence Intervals for Means (μ)', notation: 'μ' },
    { id: 'drill_proc_ht_mean', title: 'Naming the Procedure (Tests for μ)', topic: 'Significance Tests for Means (μ)', notation: 't-Test' },
    { id: 'drill_hypo_mean', title: 'Stating Hypotheses for Means', topic: 'Significance Tests for Means (μ)', notation: 'H₀, Hₐ' },
    { id: 'drill_stat_mean', title: 'Test Statistic & SE for Means', topic: 'Significance Tests for Means (μ)', notation: 'SE₀, t' },
    { id: 'drill_conclusion_mean', title: 'P-Value & Conclusion for Means', topic: 'Significance Tests for Means (μ)', notation: 'p-value vs. α' },
    { id: 'ht_mean_t', title: '1-Sample t-Test for Mean', topic: 'Significance Tests for Means (μ)', notation: 'H₀: μ = μ₀' },
    { id: 'frq_ht_mean_1samp', title: 'Full FRQ: 1-Sample t-Test for Mean (μ)', topic: 'Significance Tests for Means (μ)', notation: 'H₀, t, P' },
    { id: 'ht_mean_t_2samp', title: '2-Sample t-Test for Means', topic: 'Significance Tests for Means (μ)', notation: 'H₀: μ₁ = μ₂' },
    { id: 'frq_ht_mean_2samp', title: 'Full FRQ: 2-Sample t-Test for Means (μ₁ - μ₂)', topic: 'Significance Tests for Means (μ)', notation: 'H₀, t, P' },
    { id: 'ht_matched_pairs_t', title: 'Matched Pairs t-Test', topic: 'Significance Tests for Means (μ)', notation: 'H₀: μ_diff = 0' },
    { id: 'frq_ht_matched_pairs', title: 'Full FRQ: Matched Pairs t-Test for Mean Difference (μ_diff)', topic: 'Significance Tests for Means (μ)', notation: 'μ_diff, H₀, t, P' },
    { id: 'ht_mean_hypo', title: 'Stating Hypotheses for Means', topic: 'Significance Tests for Means (μ)', notation: 'H₀, Hₐ' },
    { id: 'ht_mean_cond', title: 'Checking Conditions for Mean Tests', topic: 'Significance Tests for Means (μ)', notation: 'Conditions' },
    { id: 'ht_mean_stat', title: 'Standard Error & t-Statistic for μ', topic: 'Significance Tests for Means (μ)', notation: 'SE, t' },
    { id: 'ht_mean_pval', title: 'P-Value & Interpretation for Means', topic: 'Significance Tests for Means (μ)', notation: 'P-value' },
    { id: 'ht_mean_conc', title: 'Decision & Contextual Conclusion for μ', topic: 'Significance Tests for Means (μ)', notation: 'P-value, α' },
    { id: 'drill_proc_chi_square', title: 'Naming the Procedure (Chi-Square)', topic: 'Chi-Square Tests (χ²)', notation: 'Chi-Square Tests' },
    { id: 'chi_gof', title: 'Chi-Square Goodness-of-Fit Test', topic: 'Chi-Square Tests (χ²)', notation: 'df = k - 1' },
    { id: 'frq_chi_gof', title: 'Full FRQ: Chi-Square Goodness-of-Fit Test', topic: 'Chi-Square Tests (χ²)', notation: 'χ², P-value' },
    { id: 'chi_independence', title: 'Chi-Square Test for Independence', topic: 'Chi-Square Tests (χ²)', notation: 'df = (r-1)(c-1)' },
    { id: 'frq_chi_independence', title: 'Full FRQ: Chi-Square Test for Independence', topic: 'Chi-Square Tests (χ²)', notation: 'χ², P-value' },
    { id: 'chi_homogeneity', title: 'Chi-Square Test for Homogeneity', topic: 'Chi-Square Tests (χ²)', notation: 'df = (r-1)(c-1)' },
    { id: 'frq_chi_homogeneity', title: 'Full FRQ: Chi-Square Test for Homogeneity', topic: 'Chi-Square Tests (χ²)', notation: 'χ², P-value' },
    { id: 'chi_step_hypo', title: 'Stating Chi-Square Hypotheses', topic: 'Chi-Square Tests (χ²)', notation: 'H₀, Hₐ' },
    { id: 'chi_step_cond', title: 'Chi-Square Conditions & Minimum Expected Count (E_min)', topic: 'Chi-Square Tests (χ²)', notation: 'E_min' },
    { id: 'chi_step_df', title: 'Chi-Square Degrees of Freedom (df)', topic: 'Chi-Square Tests (χ²)', notation: 'df' },
    { id: 'chi_step_stat_pval', title: 'χ² Test Statistic & P-Value', topic: 'Chi-Square Tests (χ²)', notation: 'χ², P-value' },
    { id: 'chi_step_conc', title: 'Chi-Square Decision & Conclusion', topic: 'Chi-Square Tests (χ²)', notation: 'P-value, α' },
    { id: 'reg_lsrl', title: 'Least-Squares Regression Line (LSRL)', topic: 'Linear Regression Analysis', notation: 'ŷ = b₀ + b₁x' },
    { id: 'reg_pred_res', title: 'Predictions & Residual Analysis', topic: 'Linear Regression Analysis', notation: 'e = y - ŷ' },
    { id: 'reg_comp_output', title: 'Reading Regression Computer Output', topic: 'Linear Regression Analysis', notation: 'Coef, SE Coef, T, P' },
    { id: 'reg_raw_data', title: 'Regression from Raw Data Table', topic: 'Linear Regression Analysis', notation: 'Data Table → LSRL' },
    { id: 'reg_slope_ci', title: 'Confidence Interval for Slope (β₁)', topic: 'Linear Regression Analysis', notation: 'b₁ ± t*SE_b₁' },
    { id: 'drill_proc_slope', title: 'Naming the Procedure (Regression Slope)', topic: 'Linear Regression Analysis', notation: 'Regression t' },
    { id: 'frq_ci_slope', title: 'Full FRQ: Linear Regression t-Interval for Slope (β₁)', topic: 'Linear Regression Analysis', notation: 'β₁, t, df' },
    { id: 'reg_slope_test', title: 'Significance Test for Slope (β₁)', topic: 'Linear Regression Analysis', notation: 'H₀: β₁ = 0' },
    { id: 'frq_ht_slope', title: 'Full FRQ: Linear Regression t-Test for Slope (β₁)', topic: 'Linear Regression Analysis', notation: 'β₁, H₀, t, P' },
    { id: 'reg_step_slope_int', title: 'Calculating Slope & y-Intercept', topic: 'Linear Regression Analysis', notation: 'b₀, b₁' },
    { id: 'reg_step_equation', title: 'Writing the LSRL Equation', topic: 'Linear Regression Analysis', notation: 'ŷ = b₀ + b₁x' },
    { id: 'reg_step_pred_res', title: 'Calculating Predicted Value (ŷ) & Residual', topic: 'Linear Regression Analysis', notation: 'ŷ, e' },
    { id: 'reg_step_slope_stat', title: 'Slope Hypotheses & t-Statistic', topic: 'Linear Regression Analysis', notation: 'H₀, t' },
    { id: 'reg_step_slope_conc', title: 'Slope CI Bounds & Test Conclusion', topic: 'Linear Regression Analysis', notation: 'P-value, α' }
];

const ADVANCED_SUPPORTED_TOPICS = new Set([
    'eda_summary', 'eda_mean_sd', 'prob_twoway', 'prob_conditional',
    'rv_transform_combine', 'prob_binom_geom', 'sampling_dist',
    ...TOPIC_REGISTRY.filter(topic => /^(ci|ht|chi|reg|frq)_/.test(topic.id))
        .map(topic => topic.id)
]);

function supportsAdvancedReading(topic) {
    const targetedStep = /^step__(.+)__\d+$/.exec(topic);
    const parentTopic = targetedStep ? targetedStep[1] : topic;
    return ADVANCED_SUPPORTED_TOPICS.has(parentTopic) || /^(ci|ht|chi|reg|frq)_/.test(parentTopic);
}

// Helper to merge tool permissions: students always have full access unless a policy explicitly denies
function mergeStudentToolPermissions(assignmentPolicy = null, classPolicy = null) {
    const defaultFull = {
        allow_calc: true,
        allow_stats_tool: true,
        allow_tables: true,
        allow_popouts: true
    };
    
    // Start with full permissions
    const merged = { ...defaultFull };
    
    // Apply class policy (if any) - restricts from default full
    if (classPolicy) {
        Object.keys(merged).forEach(key => {
            if (classPolicy[key] === false) merged[key] = false;
        });
    }
    
    // Apply assignment policy (if any) - further restricts
    if (assignmentPolicy) {
        Object.keys(merged).forEach(key => {
            if (assignmentPolicy[key] === false) merged[key] = false;
        });
    }
    
    return merged;
}

let state = {
    selectedTopic: 'random',
    previousView: 'catalog',
    lsrlNotationStyle: 'ab',
    readingDifficulty: 'standard'
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

function getActiveReadingDifficulty() {
    if (!activeTaskState.active) return state.readingDifficulty;
    const question = activeTaskState.questionQueue[activeTaskState.currentIndex - 1];
    return question?.reading_difficulty || activeTaskState.currentBlock?.reading_difficulty || 'standard';
}

function updateReadingDifficultyControl() {
    const control = document.getElementById('reading-difficulty-control');
    if (control) control.hidden = activeTaskState.active || getActivePracticeView() !== 'practice' ||
        !supportsAdvancedReading(state.selectedTopic);
}

function syncFreePracticeDifficulty() {
    if (!supportsAdvancedReading(state.selectedTopic)) state.readingDifficulty = 'standard';
    const select = document.getElementById('reading-difficulty-select');
    if (select) select.value = state.readingDifficulty;
    updateReadingDifficultyControl();
}

function applyStudentToolPermissions(policy = {}) {
    // Default policy: students have full unrestricted access unless explicitly restricted
    const defaultPolicy = {
        allow_calc: true,
        allow_stats_tool: true,
        allow_tables: true,
        allow_popouts: true
    };
    const mergedPolicy = { ...defaultPolicy, ...policy };
    
    const tools = [
        ['allow_calc', 'tool-calc-button', 'calc-dock', window.closeCalculatorWindow],
        ['allow_stats_tool', 'tool-stats-button', 'floating-stats-window', window.closeStatsGrapherWindow],
        ['allow_tables', 'tool-tables-button', 'floating-tables-window', window.closeFloatingWindow]
    ];
    tools.forEach(([key, buttonId, windowId, close]) => {
        const allowed = mergedPolicy[key] !== false;
        const button = document.getElementById(buttonId);
        const tool = document.getElementById(windowId);
        if (button) button.hidden = !allowed;
        if (!allowed && tool && getComputedStyle(tool).display !== 'none' && typeof close === 'function') close();
    });
    document.querySelectorAll('.tool-popout').forEach(button => { button.hidden = mergedPolicy.allow_popouts === false; });
}
window.applyStudentToolPermissions = applyStudentToolPermissions;

const LEGACY_TOPIC_TITLES = { chi_two_way: 'Chi-Square Test of Independence / Homogeneity' };

Object.entries(window.TARGETED_STEP_LABELS || {}).forEach(([parentId, labels]) => {
    const parent = TOPIC_REGISTRY.find(topic => topic.id === parentId);
    if (!parent) return;
    labels.forEach((label, index) => TOPIC_REGISTRY.push({
        ...parent,
        id: `step__${parentId}__${index + 1}`,
        title: `${parent.title}: ${label}`
    }));
});

function getTaskTopics(task) {
    const supportedTopics = [...TOPIC_REGISTRY.map(topic => topic.id), ...Object.keys(LEGACY_TOPIC_TITLES)];
    const configuredTopics = Array.isArray(task.config?.topics) ? task.config.topics : [];
    return configuredTopics.filter(topic => supportedTopics.includes(topic));
}

function updateCurrentTopicName() {
    const topicName = document.getElementById('current-skill-name');
    const topic = TOPIC_REGISTRY.find(item => item.id === state.selectedTopic);
    if (topicName) topicName.textContent = topic?.title || LEGACY_TOPIC_TITLES[state.selectedTopic] || 'All Normal Types (Mixed)';
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
        const isDrill = topic => /^(?:step__|eda_(?:five_num|iqr_fences|mean_sd)|rv_(?:transform|combine)$|prob_(?:marginal_joint|conditional)|(?:ci_prop|ci_mean)_(?:cond|crit_se|bounds|interp)|(?:ht_prop|ht_mean)_(?:hypo|cond|stat|pval|conc)|(?:chi|reg)_step_|cond_|drill_)/.test(topic.id);
        const hasDrills = topics.some(isDrill);
        const ordered = [...topics.filter(topic => !isDrill(topic)), ...topics.filter(isDrill)];
        let currentGroup = null;
        ordered.forEach(topic => {
            const group = isDrill(topic) ? 'drills' : 'full';
            if (hasDrills && group !== currentGroup) {
                const groupHeading = document.createElement('strong');
                groupHeading.className = 'catalog-skill-group-heading';
                groupHeading.dataset.group = group;
                groupHeading.textContent = group === 'drills' ? 'Single-Step Skill Drills' : 'Full Multi-Stage Procedures';
                skillsInner.appendChild(groupHeading);
                currentGroup = group;
            }
            const row = document.createElement('div');
            row.className = 'catalog-item-row';
            row.dataset.group = group;
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
        category.querySelectorAll('.catalog-skill-group-heading').forEach(groupHeading => {
            const visible = [...category.querySelectorAll('.catalog-item-row')]
                .some(row => row.dataset.group === groupHeading.dataset.group && row.style.display !== 'none');
            groupHeading.hidden = !visible;
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
    updateReadingDifficultyControl();
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
    syncFreePracticeDifficulty();
    const topicName = document.getElementById('current-skill-name');
    const topic = TOPIC_REGISTRY.find(item => item.id === topicId);
    if (topicName) topicName.textContent = title || topic?.title || 'All Normal Types (Mixed)';
    saveState();
    switchPracticeView('practice');
    loadProblem();
}

function updateTaskRunnerUI() {
    updateReadingDifficultyControl();
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
        if (activeTaskState.taskType === 'test_correction') {
            const scopeLabel = activeTaskState.correctionsScope === 'full_questions'
                ? 'Full Missed Questions' : 'Missed Steps Only';
            badges.push(`<span class="badge">🩹 Test Corrections (${scopeLabel})</span>`);
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
        const item = activeTaskState.questionQueue[activeTaskState.currentIndex - 1];
        if (activeTaskState.taskType === 'test_correction' && item?.source_q && item?.step_label) {
            const source = document.createElement('span');
            source.className = 'badge';
            source.textContent = `🩹 Correction from Q${item.source_q} · ${item.step_label}`;
            modeBadges.appendChild(source);
        }
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
                document.querySelectorAll(`#stage-box-${stageIndex} input, #stage-box-${stageIndex} select, #stage-box-${stageIndex} math-field, #stage-box-${stageIndex} textarea`)
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
                feedbackStyles: controls.map(control => ({
                    borderColor: control.style.borderColor,
                    backgroundColor: control.style.backgroundColor
                })),
                value: values[0] ?? '',
                disabled: disabledStates[0] ?? true,
                display: document.getElementById(`stage-box-${stageIndex}`)?.style.display || '',
                className: document.getElementById(`stage-box-${stageIndex}`)?.className || 'stage-box',
                status: document.getElementById(`stage-status-${stageIndex}`)?.innerHTML || '',
                revealDisplay: document.getElementById(`stage-reveal-${stageIndex}`)?.style.display || 'none',
                revealText: document.getElementById(`stage-reveal-${stageIndex}`)?.textContent || '',
                buttonDisabled: document.getElementById(`stage-btn-${stageIndex}`)?.disabled ?? true,
                attemptWarning: document.getElementById(`stage-input-warning-${stageIndex}`)?.textContent || '',
                attemptWarningDisplay: document.getElementById(`stage-input-warning-${stageIndex}`)?.style.display || 'none'
            };
        })
        : [];
    activeTaskState.questionsState[index] = {
        ...existing,
        problem: currentProblem,
        answer: singleInput?.value || '',
        answerDisabled: Boolean(singleInput?.disabled),
        stageInputs: currentQuestionAnswers.slice(),
        stepAttemptStates: currentStepAttemptStates.map(step => ({ ...step })),
        stageStates,
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
    if (questionState.stepAttemptStates) {
        currentStepAttemptStates = questionState.stepAttemptStates.map(step => ({ ...step }));
    }
    if (currentProblem.steps) {
        questionState.stageStates?.forEach((stage, index) => {
            const controls = Array.from(
                document.querySelectorAll(`#stage-box-${index} input, #stage-box-${index} select, #stage-box-${index} math-field, #stage-box-${index} textarea`)
            );
            const box = document.getElementById(`stage-box-${index}`);
            const status = document.getElementById(`stage-status-${index}`);
            const reveal = document.getElementById(`stage-reveal-${index}`);
            const verifyButton = document.getElementById(`stage-btn-${index}`);
            const warning = document.getElementById(`stage-input-warning-${index}`);
            if (box && stage.display !== undefined) box.style.display = stage.display;
            if (stage.values) {
                controls.forEach((control, controlIndex) => {
                    control.style.borderColor = stage.feedbackStyles?.[controlIndex]?.borderColor || '';
                    control.style.backgroundColor = stage.feedbackStyles?.[controlIndex]?.backgroundColor || '';
                    if (control.matches('math-field')) {
                        control.setValue(stage.values[controlIndex] ?? '');
                        control.readOnly = stage.disabledStates?.[controlIndex] ?? true;
                    } else {
                        control.value = stage.values[controlIndex] ?? '';
                        control.disabled = stage.disabledStates?.[controlIndex] ?? true;
                    }
                    if (control.matches('select.stage-long-select')) updateLongSelectText(control);
                });
            } else if (controls[0]) {
                if (controls[0].matches('math-field')) {
                    controls[0].setValue(stage.value || '');
                    controls[0].readOnly = stage.disabled;
                } else {
                    controls[0].value = stage.value;
                    controls[0].disabled = stage.disabled;
                    if (controls[0].matches('select.stage-long-select')) updateLongSelectText(controls[0]);
                }
            }
            if (box) box.className = stage.className;
            if (status) status.innerHTML = stage.status;
            if (reveal) {
                reveal.style.display = stage.revealDisplay;
                reveal.textContent = stage.revealText;
            }
            if (verifyButton) verifyButton.disabled = stage.buttonDisabled;
            if (warning) {
                warning.textContent = stage.attemptWarning || '';
                warning.style.display = stage.attemptWarningDisplay || 'none';
            }
            if (currentStepAttemptStates[index]?.frqEnabled) {
                const textarea = document.getElementById('frq-conclusion-input');
                const check = document.getElementById(`frq-check-${index}`);
                if (check && textarea) check.disabled = textarea.disabled || currentStepAttemptStates[index].resolved;
                showFrqResult(index, activeTaskState.taskType !== 'test' ||
                    (activeTaskState.examCompleted && (activeTaskState.submitted || activeTaskState.isPreview)));
            }
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
        bindOptionalStepButtons();
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
        activeTaskState.allowFrqConclusion = Boolean(queuedQuestion.allow_frq_conclusion);
        activeTaskState.frqRetryMode = queuedQuestion.frq_retry_mode || 'revision';
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
    const isCorrection = taskType === 'test_correction' && task.status !== 'preview';
    if (isCorrection && task.perfect_on_parent) throw new Error('No corrections are needed for the original assessment.');
    if (isCorrection && task.parent_submission_missing) throw new Error('Submit the original assessment before starting corrections.');
    if (isCorrection && task.correction_error) throw new Error(task.correction_error);
    const assignedTopic = task.skill_topic || task.config?.skill_topic || task.config?.topic;
    const supportedTopics = new Set([...TOPIC_REGISTRY.map(topic => topic.id), ...Object.keys(LEGACY_TOPIC_TITLES)]);
    const questionQueue = [];
    if (isCorrection && (!Array.isArray(task.missed_questions) || !task.missed_questions.length)) {
        throw new Error('No missed questions are available. Contact your teacher.');
    }
    const configuredBlocks = isCorrection
        ? task.missed_questions.map((question, index) => ({
            ...question,
            id: `correction-${index}`,
            count: 2,
            mode: 'mastery',
            required_passes: question.required_passes,
            max_attempts: 6
        }))
        : Array.isArray(task.config?.blocks) ? task.config.blocks : null;
    const taskBlocks = configuredBlocks
        ? configuredBlocks.map((block, index) => {
            const stepAttemptLimit = Number(block?.max_step_attempts);
            return {
                ...block,
                id: block?.id || `block-${index}`,
                mode: isTest ? 'no_hints' : block.mode,
                max_step_attempts: Number.isInteger(stepAttemptLimit) &&
                    stepAttemptLimit >= 1 && stepAttemptLimit <= 5
                    ? stepAttemptLimit
                    : null
            };
        })
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
            const count = !isTest && block.mode === 'mastery'
                ? 2
                : !isTest && block.mode === 'scaffold' ? Math.max(2, parsedCount)
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
                    phase,
                    source_q: block.source_q,
                    step_label: block.step_label,
                    fallback_guided: block.fallback_guided,
                    reading_difficulty: block.reading_difficulty || 'standard',
                    allow_frq_conclusion: Boolean(block.allow_frq_conclusion),
                    frq_retry_mode: block.frq_retry_mode || 'revision'
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
                reading_difficulty: question.reading_difficulty || 'standard',
                allow_hints: typeof question.allow_hints === 'boolean'
                    ? question.allow_hints
                    : task.config?.allow_hints !== false && task.allow_hints !== false,
                allow_frq_conclusion: Boolean(question.allow_frq_conclusion),
                frq_retry_mode: question.frq_retry_mode || 'revision'
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
                    reading_difficulty: skill.reading_difficulty || 'standard',
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
        frqRetryMode: 'revision',
        correctionsScope: task.config?.corrections_scope || 'missed_steps',
        resetVersion: task.config?._submission_reset_version || null,
        allowHints: task.config?.allow_hints !== false && task.allow_hints !== false,
        allowFrqConclusion: false,
        totalQuestions: questionQueue.length,
        currentIndex: 1,
        correctCount: 0,
        earnedPoints: 0,
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
            requiredPasses: Math.min(5, Math.max(1, parseInt(block.required_passes || block.required_clean_passes, 10) || 1)),
            attemptsCount: 0,
            shieldActive: false,
            remediationStepTopic: null,
            consecutiveStepMisses: {},
            optionalMissedStepTopic: null,
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
                if (saved && (saved.resetVersion || null) !== activeTaskState.resetVersion) {
                    localStorage.removeItem(key);
                } else {
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
        }
    } catch (error) {
        activeTaskState = previousTaskState;
        console.error('Could not read incomplete test:', error);
        throw new Error('The saved incomplete test could not be read on this device. Contact your teacher before continuing.');
    }
    if (!Number.isFinite(activeTaskState.earnedPoints)) {
        activeTaskState.earnedPoints = activeTaskState.responses.reduce(
            (total, response) => total + (Number.isFinite(response.score)
                ? response.score
                : response.correct ? 1 : 0),
            0
        );
    }
    applyStudentToolPermissions(
        mergeStudentToolPermissions(
            task.config?.tool_policy || null,
            task.tool_policy || null
        )
    );
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
        earnedPoints: 0,
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

function buildQuestionBreakdown(questionIndex, points, steps, totalSteps) {
    const question = activeTaskState.questionQueue[questionIndex - 1] || {};
    const block = activeTaskState.blocks[question.blockIndex];
    const problem = activeTaskState.questionsState[questionIndex - 1]?.problem ||
        (questionIndex === activeTaskState.currentIndex ? currentProblem : null);
    const topic = question.topic || '';
    const title = block?.title || TOPIC_REGISTRY.find(item => item.id === topic)?.title ||
        LEGACY_TOPIC_TITLES[topic] || topic || 'Question';
    return {
        q_num: questionIndex,
        topic,
        block_id: question.blockId || null,
        title,
        mode: question.mode || (question.allow_hints ? 'all_hints' : 'no_hints'),
        attempts_used: totalSteps === null ? null : totalSteps
            ? steps.reduce((sum, step) => sum + (step.attemptsUsed || 0), 0)
            : (points === 0 && !steps.length ? 0 : 1),
        points_earned: points,
        max_points: 1,
        steps_first_try: totalSteps === null ? null : steps.filter(step => step.firstAttemptCorrect).length,
        total_steps: totalSteps,
        missed_steps: (problem?.steps || [])
            .map((step, index) => ({ step, state: steps[index], index }))
            .filter(({ state }) => !state || state.firstAttemptCorrect !== true)
            .map(({ step, index }) => ({
                step_index: index + 1,
                step_label: step.label || `Step ${index + 1}`,
                step_topic: `step__${topic}__${index + 1}`
            }))
    };
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
                    skipped: true,
                    breakdown: {
                        ...buildQuestionBreakdown(questionIndex, 0, [],
                            activeTaskState.questionsState[questionIndex - 1]?.problem?.steps?.length ?? null),
                        attempts_used: 0
                    }
                });
            }
        }
        activeTaskState.responses.sort((left, right) => left.questionIndex - right.questionIndex);
    }
    const responseCount = activeTaskState.taskType === 'test'
        ? activeTaskState.totalQuestions
        : activeTaskState.responses.length;
    const earnedPoints = Number.isFinite(activeTaskState.earnedPoints)
        ? activeTaskState.earnedPoints
        : activeTaskState.correctCount;
    const score = responseCount ? Math.round((earnedPoints / responseCount) * 100) : 0;
    if (supabaseClient && currentUser && !activeTaskState.isPreview) {
        activeTaskState.isSubmitting = true;
        try {
            const response = await fetch('/api/student/submissions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${currentSession.access_token}`
                },
                body: JSON.stringify({
                    assessment_id: activeTaskState.taskId,
                    score,
                    responses: activeTaskState.responses,
                    details: { question_breakdown: activeTaskState.responses.map(item =>
                        item.breakdown || buildQuestionBreakdown(
                            item.questionIndex, item.score ?? (item.correct ? 1 : 0), [], null
                        )
                    ) },
                    reset_version: activeTaskState.resetVersion
                })
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.detail || `Submission failed (${response.status}).`);
            }
            activeTaskState.submitted = true;
        } catch (error) {
            console.error('Task submission failed:', error);
            document.getElementById('completion-subtitle').textContent =
                `Your task is complete, but we could not submit the results: ${error.message} Please contact your teacher.`;
        } finally {
            activeTaskState.isSubmitting = false;
        }
    }

    document.getElementById('completion-title').textContent = activeTaskState.taskTitle;
    document.getElementById('completion-score').textContent =
        `${Number(earnedPoints.toFixed(2))} / ${responseCount}`;
    document.getElementById('completion-percent').textContent = `(${score}%)`;
    document.getElementById('completion-icon').textContent = score >= 70 ? '🎉' : '📝';
    const frqFeedback = document.getElementById('completion-frq-feedback');
    frqFeedback.replaceChildren();
    if (activeTaskState.taskType === 'test' && (activeTaskState.submitted || activeTaskState.isPreview)) {
        activeTaskState.questionsState.forEach((question, index) => {
            const result = question?.stepAttemptStates?.find(step => step.frqEnabled && step.frqResult)?.frqResult;
            if (!result) return;
            const details = document.createElement('p');
            details.textContent = `Question ${index + 1} (${result.score_code}): ${result.feedback} Model conclusion: ${result.model_conclusion}`;
            frqFeedback.appendChild(details);
        });
    }
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
        earnedPoints: 0,
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
            state.readingDifficulty = parsed.readingDifficulty === 'advanced' ? 'advanced' : 'standard';
        }
    } catch (e) {
        console.warn('localStorage not accessible');
    }
    updateCurrentTopicName();
    syncFreePracticeDifficulty();
    saveState();
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            selectedTopic: state.selectedTopic || 'random',
            readingDifficulty: state.readingDifficulty
        }));
    } catch (e) {}
}

function onTopicChange() {
    const topicSelect = document.getElementById('topic-select');
    state.selectedTopic = topicSelect?.value || state.selectedTopic || 'random';
    syncFreePracticeDifficulty();
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

function renderProblemPrompt(promptEl, problem) {
    const promptTemplate = document.createElement('template');
    promptTemplate.innerHTML = problem.prompt || '';
    const stepBox = document.getElementById('problem-step-box');
    const stepContext = Array.from(promptTemplate.content.querySelectorAll('.problem-step-context'));
    stepBox.replaceChildren(...stepContext);
    stepBox.hidden = stepContext.length === 0;
    const tableData = problem.table_data;
    const promptContent = document.createElement('div');
    promptContent.className = 'problem-prompt-content';
    promptContent.appendChild(promptTemplate.content);
    promptEl.replaceChildren();
    const isStickyPrompt = Boolean(problem.steps?.length || problem.problem_mode === 'full_frq');
    promptEl.classList.toggle('problem-prompt-sticky', isStickyPrompt);
    if (isStickyPrompt) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'problem-prompt-toggle';
        toggle.textContent = 'Collapse Prompt';
        toggle.setAttribute('aria-expanded', 'true');
        toggle.addEventListener('click', () => {
            const collapsed = !promptContent.hidden;
            promptContent.hidden = collapsed;
            toggle.textContent = collapsed ? 'Expand Prompt' : 'Collapse Prompt';
            toggle.setAttribute('aria-expanded', String(!collapsed));
        });
        promptEl.append(toggle, promptContent);
    } else {
        promptEl.appendChild(promptContent);
    }

    if (tableData && Array.isArray(tableData.headers) && Array.isArray(tableData.rows)) {
        const table = document.createElement('table');
        table.className = 'prob-dist-table';
        table.style.cssText = 'border-collapse: collapse; margin: 12px 0; min-width: 240px;';
        const head = table.createTHead();
        const headerRow = head.insertRow();
        tableData.headers.forEach(value => {
            const cell = document.createElement('th');
            cell.textContent = value;
            cell.style.cssText = 'border: 1px solid #e2e8f0; background: #f8fafc; text-align: center; padding: 8px 12px;';
            headerRow.appendChild(cell);
        });
        const body = table.createTBody();
        tableData.rows.forEach(row => {
            const tableRow = body.insertRow();
            row.forEach(value => {
                const cell = tableRow.insertCell();
                cell.textContent = value;
                cell.style.cssText = 'border: 1px solid #e2e8f0; text-align: center; padding: 8px 12px;';
                if (value === '?') cell.style.fontWeight = '700';
            });
        });
        promptContent.appendChild(table);
    }
    triggerKaTeX(promptEl);
    triggerKaTeX(stepBox);
}

function showKeepPracticingButton(afterElement) {
    if (activeTaskState.active) return;
    let button = document.getElementById('keep-practicing-btn');
    if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.id = 'keep-practicing-btn';
        button.className = 'btn-primary';
        button.style.marginTop = '15px';
        button.textContent = 'Keep Practicing This Skill →';
        button.addEventListener('click', () => loadProblem());
    }
    afterElement.insertAdjacentElement('afterend', button);
}

async function loadProblem(problemToRender = null) {
    document.getElementById('keep-practicing-btn')?.remove();
    const feedbackBanner = document.getElementById('feedback-banner');
    const solutionCard = document.getElementById('solution-card');
    const nextBtn = document.getElementById('next-btn');
    if (feedbackBanner) feedbackBanner.style.display = 'none';
    if (solutionCard) solutionCard.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    hideTaskAdvanceButton();
    currentQuestionAnswers = [];
    currentStepAttemptStates = [];

    const topic = state.selectedTopic || 'random';
    isMultiStage = topic.startsWith('frq_') || topic.startsWith('step__') || topic.startsWith('ci_') || topic.startsWith('ht_') || topic.startsWith('chi_') ||
        topic.startsWith('reg_') ||
        topic.startsWith('cond_') || topic.startsWith('drill_') ||
        topic.startsWith('prob_') || topic.startsWith('sampling_') ||
        topic.startsWith('eda_') || topic.startsWith('rv_');
    currentProblem = problemToRender;

    if (isMultiStage) {
        document.getElementById('single-input-panel').style.display = 'none';
        document.getElementById('multi-stage-panel').style.display = 'block';
        document.getElementById('graph-wrapper').style.display = 'none';
        
        if (!currentProblem) {
            const isFullFrq = topic.startsWith('frq_');
            const isHypothesisTest = topic.startsWith('ht_');
            const isChiSquare = topic.startsWith('chi_');
            const isRegression = topic.startsWith('reg_');
            const isInferenceDrill = topic.startsWith('cond_') || topic.startsWith('drill_');
            const isFoundations = topic.startsWith('eda_') || topic.startsWith('rv_') ||
                ['prob_twoway', 'prob_marginal_joint', 'prob_conditional'].includes(topic);
            const isProbSampling = topic.startsWith('prob_') || topic.startsWith('sampling_');
            const problemTopic = isHypothesisTest || isChiSquare || isRegression
                || isProbSampling || isFoundations ? topic
                : topic.startsWith('ci_') && !['ci_prop_cond', 'ci_prop_crit_se', 'ci_prop_bounds', 'ci_prop_interp',
                    'ci_mean_cond', 'ci_mean_crit_se', 'ci_mean_bounds', 'ci_mean_interp'].includes(topic)
                    ? topic.replace('ci_', '') : topic;
            const endpoint = isFullFrq
                ? '/api/problem/frq'
                : topic.startsWith('step__')
                ? '/api/problem/targeted-step'
                : isInferenceDrill
                ? '/api/problem/drill'
                : isFoundations ? '/api/problem/foundations'
                : isHypothesisTest ? '/api/problem/ht'
                    : isChiSquare ? '/api/problem/chi'
                        : isRegression ? '/api/problem/regression'
                            : isProbSampling ? '/api/problem/prob_sampling' : '/api/problem/ci';
            const notation = getActiveLsrlNotation();
            const notationParam = isRegression || topic.startsWith('step__') ? `&notation=${encodeURIComponent(notation)}` : '';
            const difficultyParam = `&reading_difficulty=${encodeURIComponent(getActiveReadingDifficulty())}`;
            const res = await fetch(`${endpoint}?topic=${encodeURIComponent(problemTopic)}${notationParam}${difficultyParam}`);
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
            const res = await fetch(`/api/problem/normal?topic=${encodeURIComponent(topic)}&reading_difficulty=${encodeURIComponent(getActiveReadingDifficulty())}`);
            currentProblem = await res.json();
        }

        document.getElementById('input-label').innerText = currentProblem.input_label || "Answer:";
        input.placeholder = currentProblem.placeholder || "e.g. 0.4532";
        input.focus();
    }

    const promptEl = document.getElementById('problem-prompt');
    renderProblemPrompt(promptEl, currentProblem);
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
                stepAttemptStates: currentStepAttemptStates.map(step => ({ ...step })),
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
    const index = currentProblem.steps.indexOf(step);
    if (index >= 0 && currentStepAttemptStates[index]?.frqEnabled) {
        return [{ id: 'frq-conclusion-input', type: 'frq' }];
    }
    if (step.components) {
        return step.components.map(definition => definition.id === 'stage-pval'
            ? {
                ...definition,
                input_type: definition.input_type || (definition.type === 'select' ? 'select' : 'number'),
                expected: [currentProblem.metadata.expected_pval]
            }
            : {
                ...definition,
                input_type: definition.input_type || (definition.type === 'select' ? 'select' : 'number')
            });
    }
    if (step.input_type === 'compound') {
        return (step.inputs || []).map(definition => ({
            ...definition,
            input_type: definition.input_type || (definition.type === 'select' ? 'select' : 'number')
        }));
    }
    return [{
        id: null,
        type: step.input_type === 'select' ? 'select' : 'number',
        input_type: step.input_type === 'math' ? 'math'
            : step.input_type === 'select' ? 'select' : 'number',
        options: step.options,
        placeholder: step.placeholder,
        expected: step.expected,
        tolerance: step.tolerance
    }];
}

function getAllowedStepAttempts(step) {
    const configuredLimit = Number(activeTaskState.currentBlock?.max_step_attempts);
    if (Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 5) {
        return configuredLimit;
    }
    const definitions = getStageInputDefinitions(step);
    const mcCount = definitions.filter(isSelectDefinition).length;
    const numCount = definitions.length - mcCount;
    if (mcCount && numCount) return 3;
    if (mcCount) return mcCount >= 3 ? 2 : 1;
    return 2;
}

function isSelectDefinition(definition) {
    return definition.type === 'select' || definition.input_type === 'select';
}
function getStageControlId(idx, definition) {
    if (definition.id === 'frq-conclusion-input') return definition.id;
    return definition.id === 'stage-pval'
        ? 'step-stage-pval'
        : `stage-input-${idx}${definition.id ? `-${definition.id}` : ''}`;
}

function isMathComputationField(definition) {
    return definition.input_type === 'math';
}

function getStageControlValue(control) {
    return control.matches('math-field') ? control.getValue() : control.value;
}

function setStageControlDisabled(control, disabled) {
    if (control.matches('math-field')) control.readOnly = disabled;
    else control.disabled = disabled;
}

function updateLongSelectText(control) {
    const text = control.parentElement.querySelector('.stage-select-text');
    if (text) text.textContent = control.value ? control.selectedOptions[0]?.textContent || '' : '';
}

function isFrqConclusionStep(step) {
    return /conclusion/i.test(step.label || '') &&
        Array.isArray(step.components) &&
        step.components.some(component => ['conclusion-decision', 'chi-decision'].includes(component.id)) &&
        Boolean(currentProblem.metadata?.alternative && currentProblem.metadata?.parameter_description);
}

function getStudentPValue(conclusionIndex) {
    for (let index = conclusionIndex - 1; index >= 0; index -= 1) {
        const step = currentProblem.steps[index];
        const definition = getStageInputDefinitions(step).find(field =>
            !isSelectDefinition(field) &&
            (/^(stage-pval|chi-test-p-value)$/.test(field.id || '') ||
                /p[\s-]*value/i.test(field.label || field.placeholder || '') ||
                (!field.id && /p[\s-]*value/i.test(step.label || '')))
        );
        if (!definition) continue;
        const control = document.getElementById(getStageControlId(index, definition));
        if (!control) continue;
        const value = evaluateMathInput(getStageControlValue(control));
        return Number.isFinite(value) ? value : null;
    }
    return null;
}

function showFrqResult(idx, revealDetails) {
    const stepState = currentStepAttemptStates[idx];
    const feedback = document.getElementById(`frq-feedback-${idx}`);
    if (!feedback || !stepState?.frqResult) return;
    feedback.replaceChildren();
    const badge = document.createElement('strong');
    const labels = { E: 'Full Credit / E', P: 'Partial Credit / P', I: 'No Credit / I' };
    badge.textContent = labels[stepState.frqResult.score_code];
    feedback.appendChild(badge);
    if (Array.isArray(stepState.frqResult.rubric)) {
        const parts = document.createElement('div');
        parts.textContent = stepState.frqResult.rubric.map(part =>
            `${part.part}: ${part.passed ? 'Full Credit / E' : 'No Credit / I'}`
        ).join(' · ');
        feedback.appendChild(parts);
    }
    if (revealDetails && stepState.resolved) {
        const explanation = document.createElement('p');
        explanation.textContent = stepState.frqResult.feedback;
        const exemplar = document.createElement('p');
        exemplar.textContent = `Model conclusion: ${stepState.frqResult.model_conclusion}`;
        feedback.append(explanation, exemplar);
    }
}

async function submitFrqConclusion(idx, regrade = false) {
    const stepState = currentStepAttemptStates[idx];
    const textarea = document.getElementById('frq-conclusion-input');
    const text = textarea.value.trim();
    if (!text || (stepState.resolved && !regrade) || activeTaskState.isVerifying) return false;
    const metadata = currentProblem.metadata;
    const studentPVal = getStudentPValue(idx);
    const ignored = new Set(['the', 'true', 'population', 'proportion', 'proportions', 'mean', 'difference',
        'between', 'of', 'and', 'for', 'in', 'who', 'paired', 'after', 'before', 'group']);
    const keywords = (metadata.parameter_description.match(/[a-zA-Z][a-zA-Z0-9'-]*/g) || [])
        .filter(word => word.length > 2 && !ignored.has(word.toLowerCase()));
    if (!keywords.length) {
        showStageInputWarning(idx, 'The question is missing context for FRQ evaluation. Contact your teacher.');
        return false;
    }
    const button = document.getElementById(`frq-check-${idx}`);
    button.disabled = true;
    activeTaskState.isVerifying = true;
    try {
        const evaluate = async studentText => {
            const response = await fetch('/api/evaluate/conclusion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_text: studentText,
                    student_p_val: studentPVal,
                    p_val: metadata.expected_pval,
                    alpha: metadata.expected_alpha,
                    decision: metadata.expected_decision,
                    direction: metadata.alternative,
                    context_keywords: keywords,
                    alternative_statement: metadata.alternative_statement
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Could not evaluate the conclusion.');
            return result;
        };
        const result = await evaluate(text);
        const pValueChanged = stepState.frqResult && stepState.frqCheckedPVal !== studentPVal;
        const firstText = stepState.frqFirstText ||
            (stepState.attemptsUsed === 1 ? stepState.frqCheckedText : '');
        const firstResult = pValueChanged && firstText && firstText !== text
            ? await evaluate(firstText)
            : result;
        if (!regrade) stepState.attemptsUsed += 1;
        stepState.maxAttempts = 2;
        if (stepState.firstAttemptCorrect === null || (pValueChanged && firstText)) {
            stepState.firstAttemptCorrect = firstResult.passed;
            stepState.frqFirstScore = firstResult.score_code === 'E' ? 1 : firstResult.score_code === 'P' ? 0.5 : 0;
            stepState.frqFirstText = firstText || text;
        }
        stepState.frqResult = result;
        stepState.frqCheckedText = text;
        stepState.frqCheckedPVal = studentPVal;
        stepState.resolved = result.passed || stepState.attemptsUsed >= 2;
        stepState.earnedCredit = result.passed;
        currentQuestionAnswers[idx] = text;
        const isTest = activeTaskState.active && activeTaskState.taskType === 'test';
        showFrqResult(idx, !isTest);
        showStageInputWarning(idx, '');
        const switchButton = document.querySelector(`#stage-box-${idx} .stage-header button`);
        if (switchButton) switchButton.disabled = true;
        textarea.disabled = stepState.resolved;
        button.disabled = stepState.resolved;
        if (!isTest && stepState.resolved) {
            const box = document.getElementById(`stage-box-${idx}`);
            box.className = result.passed ? 'stage-box completed' : 'stage-box revealed';
            document.getElementById(`stage-status-${idx}`).textContent = result.passed ? '✓ Correct' : '✘ No attempts remaining';
            unlockNextStage(idx);
        } else {
            captureTaskQuestionState();
        }
        return true;
    } catch (error) {
        showStageInputWarning(idx, error.message || 'Could not evaluate the conclusion.');
        button.disabled = false;
        return false;
    } finally {
        activeTaskState.isVerifying = false;
    }
}

function replaceFrqShorthand(input) {
    if (!input) return;
    const prefix = input.value.slice(0, input.selectionStart || 0);
    const replacements = [
        [/\bmudiff\b/gi, 'μ_diff'], [/\bxbardiff\b/gi, 'x̄_diff'],
        [/\b(?:chi2|chisq)\b/gi, 'χ²'], [/\bbeta1\b/gi, 'β₁'],
        [/\b(?:h0|ho)(?=\s*:|\b)/gi, 'H₀'], [/\bha(?=\s*:|\b)/gi, 'Hₐ'], [/\bphat\b/gi, 'p̂'],
        [/\bxbar\b/gi, 'x̄'], [/\bmu\b/gi, 'μ'], [/\balpha\b/gi, 'α'],
        [/\bsqrt\s*\(/gi, '√('], [/\+\-/g, '±'], [/\^2(?!\d)/g, '²'], [/\^3(?!\d)/g, '³'],
        [/!=/g, '≠'], [/\s*<=\s*/g, '≤'], [/\s*>=\s*/g, '≥'], [/~=/g, '≈']
    ];
    let value = input.value;
    let caretPrefix = prefix;
    replacements.forEach(([pattern, replacement]) => {
        value = value.replace(pattern, replacement);
        caretPrefix = caretPrefix.replace(pattern, replacement);
    });
    if (value !== input.value) {
        input.value = value;
        input.setSelectionRange(caretPrefix.length, caretPrefix.length);
    }
}

function insertFrqSymbol(input, symbol) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(symbol, start, end, 'end');
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertFrqEquation(mathfield, responseInput, status) {
    const latex = mathfield.getValue();
    if (!latex.trim()) {
        status.textContent = 'Enter an equation first.';
        mathfield.focus();
        return false;
    }

    try {
        if (typeof latexToMathJs !== 'function' || typeof math === 'undefined') {
            throw new Error('The equation evaluator is unavailable.');
        }
        const toReadableExpression = expression => expression
            .replace(/\(\(([^()]+)\)\/\(([^()]+)\)\)/g, '$1/$2')
            .replace(/\bsqrt\(/g, '√(')
            .replace(/([0-9)])([+\-*/])(?=[0-9(])/g, '$1 $2 ');
        const plusMinusParts = latex.split(/\\pm/);
        let readableExpression;
        let resultText;
        if (plusMinusParts.length === 2) {
            const centerExpression = latexToMathJs(plusMinusParts[0]);
            const marginExpression = latexToMathJs(plusMinusParts[1]);
            const center = math.evaluate(centerExpression);
            const margin = math.evaluate(marginExpression);
            if (typeof center !== 'number' || !Number.isFinite(center)
                || typeof margin !== 'number' || !Number.isFinite(margin)) {
                throw new Error('Enter an equation with a finite numeric result.');
            }
            const interval = [center - Math.abs(margin), center + Math.abs(margin)]
                .map(value => Number(value.toPrecision(10)));
            readableExpression = `${toReadableExpression(centerExpression)} ± ${toReadableExpression(marginExpression)}`;
            resultText = `(${interval[0]}, ${interval[1]})`;
        } else {
            if (plusMinusParts.length > 2) {
                throw new Error('Use one ± symbol per equation.');
            }
            const expression = latexToMathJs(latex);
            const result = math.evaluate(expression);
            if (typeof result !== 'number' || !Number.isFinite(result)) {
                throw new Error('Enter an equation with a finite numeric result.');
            }
            readableExpression = toReadableExpression(expression);
            resultText = Number(result.toPrecision(10));
        }
        const line = `${readableExpression} = ${resultText}`;
        const start = responseInput.selectionStart ?? responseInput.value.length;
        const end = responseInput.selectionEnd ?? start;
        const before = responseInput.value.slice(0, start);
        const after = responseInput.value.slice(end);
        const prefix = before && !before.endsWith('\n') ? '\n' : '';
        const suffix = after && !after.startsWith('\n') ? '\n' : '';
        responseInput.setRangeText(`${prefix}${line}${suffix}`, start, end, 'end');
        responseInput.dispatchEvent(new Event('input', { bubbles: true }));
        mathfield.setValue('');
        status.textContent = '';
        responseInput.focus();
        return true;
    } catch (error) {
        status.textContent = error.message || 'Could not evaluate this equation.';
        mathfield.focus();
        return false;
    }
}

function insertFrqInlineCalculation(input) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    if (start !== end) return false;

    const lineStart = input.value.lastIndexOf('\n', start - 1) + 1;
    const lineEndIndex = input.value.indexOf('\n', start);
    const lineEnd = lineEndIndex === -1 ? input.value.length : lineEndIndex;
    if (input.value.slice(start, lineEnd).trim()) return false;

    const linePrefix = input.value.slice(lineStart, start);
    const previousEquals = linePrefix.lastIndexOf('=');
    const expression = linePrefix.slice(previousEquals + 1).trim();
    if (!expression) return false;

    const plusMinusParts = expression.split('±');
    if (plusMinusParts.length === 2) {
        const center = evaluateMathInput(plusMinusParts[0]);
        const margin = evaluateMathInput(plusMinusParts[1]);
        if (!Number.isFinite(center) || !Number.isFinite(margin)) return false;
        const values = [center - Math.abs(margin), center + Math.abs(margin)]
            .map(value => Number(value.toPrecision(10)));
        input.setRangeText(`= (${values[0]}, ${values[1]})`, start, end, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    const result = evaluateMathInput(expression);
    if (!Number.isFinite(result)) return false;
    input.setRangeText(`= ${Number(result.toPrecision(10))}`, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
}

function renderFullFrqUI(container) {
    currentFrqAttemptCount = 0;
    currentFrqEvaluation = null;
    container.classList.add('full-frq-workspace');
    container.style.display = 'grid';
    const toolbarRow = document.createElement('div');
    toolbarRow.className = 'frq-notation-toolbar';
    const symbolBar = document.createElement('div');
    symbolBar.className = 'frq-symbol-bar';
    ['p', 'p̂', 'μ', 'x̄', 'μ_diff', 'x̄_diff', 'p₁ - p₂', 'μ₁ - μ₂', 'β₁', 'χ²', 'H₀', 'Hₐ', 'α', '≠', '≤', '≥', '≈'].forEach(symbol => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'frq-symbol-pill';
        pill.textContent = symbol;
        pill.addEventListener('click', () => {
            const input = document.activeElement?.matches('.frq-text-input')
                ? document.activeElement : container.querySelector('.frq-text-input:not(:disabled)');
            if (input) insertFrqSymbol(input, symbol);
        });
        symbolBar.appendChild(pill);
    });

    const equationBuilder = document.createElement('div');
    equationBuilder.id = 'frq-equation-builder';
    equationBuilder.className = 'frq-equation-builder';
    equationBuilder.setAttribute('aria-label', '2D Equation Builder');
    const mathfield = document.createElement('math-field');
    mathfield.id = 'frq-mathfield';
    mathfield.className = 'question-mathfield frq-equation-mathfield';
    mathfield.setAttribute('virtual-keyboard-mode', 'manual');
    mathfield.setAttribute('aria-label', 'Enter a mathematical expression');
    const equationStatus = document.createElement('span');
    equationStatus.className = 'frq-equation-status';
    equationStatus.setAttribute('aria-live', 'polite');
    const insertBuilderSymbol = (label, latex, accessibleLabel = label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'frq-equation-button';
        button.textContent = label;
        button.setAttribute('aria-label', accessibleLabel);
        button.addEventListener('click', () => {
            mathfield.executeCommand(['insert', latex]);
            mathfield.focus();
            equationStatus.textContent = '';
        });
        equationBuilder.appendChild(button);
    };
    equationBuilder.appendChild(mathfield);
    insertBuilderSymbol('√', '\\sqrt{#0}', 'Insert square root');
    insertBuilderSymbol('a/b', '\\frac{#?}{#?}', 'Insert fraction');
    insertBuilderSymbol('±', '\\pm', 'Insert plus or minus');
    const insertEquation = document.createElement('button');
    insertEquation.type = 'button';
    insertEquation.className = 'frq-equation-button frq-equation-insert';
    insertEquation.textContent = 'Insert (=)';
    insertEquation.addEventListener('click', () =>
        insertFrqEquation(mathfield, document.getElementById('frq-response-input'), equationStatus)
    );
    equationBuilder.appendChild(insertEquation);
    equationBuilder.appendChild(equationStatus);
    mathfield.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            insertFrqEquation(mathfield, document.getElementById('frq-response-input'), equationStatus);
        }
    });
    mathfield.addEventListener('input', () => { equationStatus.textContent = ''; });
    toolbarRow.append(symbolBar, equationBuilder);
    container.appendChild(toolbarRow);

    const responseCard = document.createElement('section');
    responseCard.className = 'frq-section-card';
    responseCard.style.gridColumn = '1 / -1';
    responseCard.innerHTML = '<h3>Free Response</h3>';
    const responseInput = document.createElement('textarea');
    responseInput.id = 'frq-response-input';
    responseInput.className = 'frq-text-input frq-do-input';
    responseInput.rows = 16;
    responseInput.addEventListener('keydown', event => {
        if (event.key === '=' && insertFrqInlineCalculation(responseInput)) {
            event.preventDefault();
        }
    });
    responseCard.appendChild(responseInput);
    container.appendChild(responseCard);

    const checklist = document.createElement('details');
    checklist.className = 'frq-structure-checklist';
    checklist.style.gridColumn = '1 / -1';
    const checklistSummary = document.createElement('summary');
    checklistSummary.textContent = 'Need structure? Show State / Plan / Do / Conclude checklist';
    const checklistItems = document.createElement('ul');
    [
        'State: parameter in context and hypotheses or confidence level.',
        'Plan: procedure and condition checks, supported by the problem’s numbers.',
        'Do: calculations, test statistic and P-value or confidence interval.',
        'Conclude: decision and interpretation in context.'
    ].forEach(item => {
        const listItem = document.createElement('li');
        listItem.textContent = item;
        checklistItems.appendChild(listItem);
    });
    checklist.append(checklistSummary, checklistItems);
    container.appendChild(checklist);

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.id = 'frq-submit-full';
    submit.className = 'btn-primary';
    submit.textContent = 'Submit Full Free Response';
    submit.addEventListener('click', submitFullFrqResponse);
    const feedback = document.createElement('div');
    feedback.id = 'frq-full-feedback';
    feedback.setAttribute('aria-live', 'polite');
    const exemplar = document.createElement('div');
    exemplar.id = 'frq-exemplar';
    exemplar.className = 'frq-exemplar';
    exemplar.hidden = true;
    const next = document.createElement('button');
    next.type = 'button';
    next.id = 'frq-next-question';
    next.className = 'btn-secondary';
    next.textContent = 'Next Question →';
    next.hidden = true;
    next.addEventListener('click', () => activeTaskState.active ? advanceToNextOrSummary() : loadProblem());
    container.append(submit, feedback, exemplar, next);
    container.querySelectorAll('textarea.frq-text-input').forEach(input => {
        input.addEventListener('input', () => replaceFrqShorthand(input));
        input.addEventListener('paste', () => setTimeout(() => {
            replaceFrqShorthand(input);
        }, 0));
    });
}

async function submitFullFrqResponse() {
    const panel = document.getElementById('multi-stage-panel');
    const feedback = document.getElementById('frq-full-feedback');
    const submit = document.getElementById('frq-submit-full');
    const responseText = document.getElementById('frq-response-input').value;
    const payload = {
        topic: currentProblem.data?.topic,
        problem: currentProblem,
        attempt: currentFrqAttemptCount + 1,
        retry_mode: activeTaskState.active ? activeTaskState.frqRetryMode : 'revision',
        reading_difficulty: getActiveReadingDifficulty(),
        response_text: responseText,
        state_text: responseText,
        plan_text: responseText,
        do_text: responseText,
        conclude_text: responseText,
    };
    submit.disabled = true;
    try {
        const response = await fetch('/api/evaluate/frq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || `FRQ evaluation failed (${response.status}).`);
        currentFrqAttemptCount += 1;
        currentFrqEvaluation = result;
        feedback.replaceChildren();
        const rubric = document.createElement('div');
        rubric.className = 'frq-rubric-results';
        const sectionTitles = {
            state: currentProblem.data?.is_test ? 'Parameter & Hypotheses' : 'Parameter & Confidence Level',
            plan: 'Procedure & Conditions',
            do: 'Calculations & Results',
            conclude: 'Conclusion in Context'
        };
        Object.entries(result.sections || {}).forEach(([key, item]) => {
            const row = document.createElement('section');
            row.className = 'frq-rubric-section';
            const badge = document.createElement('strong');
            badge.className = `frq-score frq-score-${item.score_code.toLowerCase()}`;
            badge.textContent = `${sectionTitles[key] || key}: ${item.score_label}`;
            const note = document.createElement('p');
            note.textContent = item.feedback;
            row.append(badge, note);
            rubric.appendChild(row);
        });
        feedback.appendChild(rubric);
        showKeepPracticingButton(feedback);
        const retryMode = payload.retry_mode;
        const showExemplar = retryMode === 'one_shot' || result.passed || currentFrqAttemptCount >= 2;
        if (!showExemplar) {
            submit.textContent = 'Revise Missed Parts and Resubmit';
            return;
        }
        const exemplar = document.getElementById('frq-exemplar');
        exemplar.hidden = false;
        exemplar.replaceChildren();
        const exemplarHeading = document.createElement('h3');
        exemplarHeading.textContent = 'Exemplar: State, Plan, Do, Conclude';
        exemplar.appendChild(exemplarHeading);
        [['state', 'State'], ['plan', 'Plan'], ['do', 'Do'], ['conclude', 'Conclude']].forEach(([key, title]) => {
            if (!result.exemplar?.[key]) return;
            const heading = document.createElement('h4');
            heading.textContent = title;
            const text = document.createElement('p');
            text.textContent = result.exemplar[key];
            exemplar.append(heading, text);
        });
        showKeepPracticingButton(exemplar);
        submit.hidden = true;
        document.getElementById('frq-next-question').hidden = !activeTaskState.active;
        panel.querySelectorAll('.frq-text-input, [data-frq-number], #frq-equation-builder button')
            .forEach(input => { input.disabled = true; });
        const equationField = panel.querySelector('#frq-mathfield');
        if (equationField) equationField.readOnly = true;
        if (activeTaskState.active) {
            const index = activeTaskState.currentIndex - 1;
            const earned = Object.values(result.sections).reduce((sum, item) =>
                sum + (item.score_code === 'E' ? 1 : item.score_code === 'P' ? 0.5 : 0), 0) / 4;
            const questionState = activeTaskState.questionsState[index] || {};
            questionState.problem = currentProblem;
            questionState.completed = true;
            questionState.correct = Boolean(result.passed);
            questionState.score = earned;
            activeTaskState.questionsState[index] = questionState;
            activeTaskState.responses[index] = {
                questionIndex: index + 1,
                prompt: currentProblem.prompt,
                correct: Boolean(result.passed),
                score: earned,
                breakdown: {
                    q_num: index + 1,
                    topic: activeTaskState.questionQueue[index]?.topic,
                    block_id: activeTaskState.questionQueue[index]?.blockId || null,
                    sections: result.sections
                },
            };
        }
    } catch (error) {
        feedback.textContent = error.message || 'Could not evaluate this response.';
    } finally {
        submit.disabled = false;
    }
}

function renderMultiStageUI(topic) {
    const container = document.getElementById('multi-stage-panel');
    container.innerHTML = '';
    container.style.display = 'block';
    if (currentProblem.problem_mode === 'full_frq') {
        renderFullFrqUI(container);
        return;
    }
    const isTest = activeTaskState.active && activeTaskState.taskType === 'test';
    const questionState = activeTaskState.active
        ? activeTaskState.questionsState[activeTaskState.currentIndex - 1]
        : null;
    const savedStepStates = questionState?.stepAttemptStates || [];
    currentStepAttemptStates = currentProblem.steps.map((step, index) => {
        const saved = savedStepStates[index];
        return {
            attemptsUsed: saved?.attemptsUsed || 0,
            maxAttempts: saved?.maxAttempts || getAllowedStepAttempts(step),
            firstAttemptCorrect: saved?.firstAttemptCorrect ?? null,
            resolved: Boolean(saved?.resolved),
            earnedCredit: Boolean(saved?.earnedCredit),
            frqEnabled: saved?.frqEnabled ?? (isFrqConclusionStep(step) && Boolean(activeTaskState.allowFrqConclusion)),
            frqResult: saved?.frqResult || null,
            frqCheckedText: saved?.frqCheckedText || '',
            frqCheckedPVal: saved?.frqCheckedPVal ?? null,
            frqFirstText: saved?.frqFirstText || '',
            frqFirstScore: saved?.frqFirstScore ?? null
        };
    });
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
            const isMathField = isMathComputationField(definition);
            const isSelect = isSelectDefinition(definition);
            const control = document.createElement(
                isMathField ? 'math-field' : isSelect ? 'select' : 'input'
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
            if (isSelect) {
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
                control.inputMode = 'decimal';
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
                const longSelect = control.matches('select') && (
                    (topic.startsWith('chi_') && ['chi-null', 'chi-alternative'].includes(definition.id))
                    || (definition.options || []).some(option => String(option.label || '').length > 35)
                );
                if (longSelect) {
                    const wrapper = document.createElement('span');
                    wrapper.className = 'stage-long-select-wrap';
                    control.classList.add('stage-long-select');
                    const text = document.createElement('span');
                    text.className = 'stage-select-text';
                    text.setAttribute('aria-hidden', 'true');
                    wrapper.append(control, text);
                    control.addEventListener('change', () => updateLongSelectText(control));
                    parent.appendChild(wrapper);
                } else {
                    parent.appendChild(control);
                }
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'math-input-wrapper';
            wrapper.appendChild(control);
            const toolbar = document.createElement('div');
            toolbar.className = 'math-micro-toolbar';
            const availableSymbols = {
                sqrt: { label: '√', title: 'Insert a square root', latex: '\\sqrt{#0}' },
                frac: { label: 'a/b', title: 'Insert a fraction', latex: '\\frac{#?}{#?}' },
                parens: { label: '( )', title: 'Insert parentheses', latex: '\\left(#0\\right)' },
                pow: { label: 'xʸ', title: 'Insert an exponent', latex: '#0^{#?}' }
            };
            const mathSymbols = definition.math_symbols || step.math_symbols || ['sqrt', 'frac', 'parens'];
            mathSymbols.map(symbolName => availableSymbols[symbolName]).filter(Boolean).forEach(symbol => {
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
            if (step.components.some(component => component.id === 'procedure-name')) {
                inputRow.append(' Procedure: ');
                appendComponent(inputRow, 'procedure-name');
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
            const chiHypotheses = topic.startsWith('chi_')
                && step.components.some(component => component.id === 'chi-null')
                && step.components.some(component => component.id === 'chi-alternative');
            if (chiHypotheses) {
                const rows = document.createElement('div');
                rows.className = 'stage-stacked-hypotheses';
                [['chi-null', 'H₀:'], ['chi-alternative', 'Hₐ:']].forEach(([id, label]) => {
                    const row = document.createElement('div');
                    const caption = document.createElement('label');
                    caption.htmlFor = getStageControlId(idx, step.components.find(component => component.id === id));
                    caption.textContent = label;
                    row.appendChild(caption);
                    appendComponent(row, id);
                    rows.appendChild(row);
                });
                inputRow.appendChild(rows);
            } else {
                const paragraph = document.createElement('p');
                step.parts.forEach(part => {
                    if (part === '<br>') paragraph.appendChild(document.createElement('br'));
                    else if (typeof part === 'string') paragraph.append(part);
                    else appendComponent(paragraph, part.component);
                });
                inputRow.appendChild(paragraph);
            }
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

        let frqPanel = null;
        if (isFrqConclusionStep(step)) {
            const stepState = currentStepAttemptStates[idx];
            const switchButton = document.createElement('button');
            switchButton.type = 'button';
            switchButton.textContent = stepState.frqEnabled
                ? 'Switch to Guided Selection'
                : '✍️ Switch to Free-Response FRQ Mode';
            switchButton.disabled = stepState.attemptsUsed > 0;
            frqPanel = document.createElement('div');
            frqPanel.className = 'frq-conclusion-panel';
            frqPanel.hidden = !stepState.frqEnabled;
            inputRow.hidden = stepState.frqEnabled;
            const textarea = document.createElement('textarea');
            textarea.id = 'frq-conclusion-input';
            textarea.rows = 3;
            textarea.placeholder = 'Write your conclusion in context (compare P-value to α, state decision on H₀, and state evidence in context)...';
            textarea.style.cssText = 'display:block;width:100%;max-width:700px;margin:8px 0;';
            textarea.disabled = (idx > 0 && !isTest) || stepState.resolved;
            const check = document.createElement('button');
            check.type = 'button';
            check.id = `frq-check-${idx}`;
            check.textContent = 'Check FRQ Conclusion';
            check.disabled = textarea.disabled;
            check.addEventListener('click', () => submitFrqConclusion(idx));
            const feedback = document.createElement('div');
            feedback.id = `frq-feedback-${idx}`;
            feedback.setAttribute('aria-live', 'polite');
            frqPanel.append(textarea, check, feedback);
            switchButton.addEventListener('click', () => {
                stepState.frqEnabled = !stepState.frqEnabled;
                inputRow.hidden = stepState.frqEnabled;
                frqPanel.hidden = !stepState.frqEnabled;
                switchButton.textContent = stepState.frqEnabled
                    ? 'Switch to Guided Selection'
                    : '✍️ Switch to Free-Response FRQ Mode';
                captureTaskQuestionState();
            });
            header.appendChild(switchButton);
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

        box.appendChild(header);
        const queued = activeTaskState.questionQueue[activeTaskState.currentIndex - 1];
        const blockState = queued?.blockIndex === undefined ? null : activeTaskState.blockStates[queued.blockIndex];
        const key = targetedStepTopic(queued?.topic || '', idx) || `${queued?.topic}#${idx + 1}`;
        if (blockState?.mode === 'mastery' && (blockState.consecutiveStepMisses?.[key] || 0) >= 2) {
            const match = /^step__(.+)__(\d+)$/.exec(key);
            const sourceTopic = match ? match[1] : queued.topic;
            const label = match ? window.TARGETED_STEP_LABELS?.[sourceTopic]?.[Number(match[2]) - 1] || step.label : step.label;
            const blueprint = document.createElement('div');
            blueprint.className = 'step-blueprint';
            blueprint.style.cssText = 'padding:10px;margin:8px 0;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;';
            const heading = document.createElement('strong');
            heading.textContent = '📐 Step Blueprint';
            const explanation = document.createElement('div');
            explanation.textContent = stepBlueprint(sourceTopic, label || '');
            blueprint.append(heading, explanation);
            box.appendChild(blueprint);
        }
        box.appendChild(inputRow);
        if (frqPanel) box.appendChild(frqPanel);
        box.append(hint, inputWarning, reveal);
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
    const firstInput = currentStepAttemptStates[0]?.frqEnabled
        ? document.getElementById('frq-conclusion-input')
        : container.querySelector('#stage-box-0 input, #stage-box-0 select, #stage-box-0 math-field');
    const activeStepInputs = isTest
        ? container.querySelectorAll('input, select, math-field, textarea')
        : container.querySelectorAll('#stage-box-0 input, #stage-box-0 select, #stage-box-0 math-field, #stage-box-0 textarea');
    activeStepInputs.forEach(control => {
        control.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !control.matches('textarea')) {
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
    let firstAttemptCorrectCount = 0;
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
            if (isSelectDefinition(definition) || definition.type === 'frq') continue;
            const control = document.getElementById(getStageControlId(stepIndex, definition));
            const value = evaluateMathInput(getStageControlValue(control));
            if (!Number.isFinite(value)) {
                showStageInputWarning(stepIndex, 'Enter a valid number or arithmetic expression, such as 12/sqrt(16).');
                return;
            }
        }
    }
    for (const [stepIndex] of currentProblem.steps.entries()) {
        const stepState = currentStepAttemptStates[stepIndex];
        if (!stepState?.frqEnabled) continue;
        const text = document.getElementById('frq-conclusion-input').value.trim();
        const sameText = stepState.frqCheckedText === text;
        if ((!sameText || stepState.frqCheckedPVal !== getStudentPValue(stepIndex)) &&
            !(await submitFrqConclusion(stepIndex, sameText))) return;
    }

    activeTaskState.isVerifying = true;
    const questionState = activeTaskState.questionsState[activeTaskState.currentIndex - 1];
    if (questionState) questionState.attempted = true;
    try {
        currentStepAttemptStates = currentProblem.steps.map((step, stepIndex) => {
            let stepCorrect = true;
            for (const definition of getStageInputDefinitions(step)) {
                const control = document.getElementById(getStageControlId(stepIndex, definition));
                const answer = getStageControlValue(control).trim();
                if (definition.type === 'frq') {
                    stepCorrect = Boolean(currentStepAttemptStates[stepIndex].frqResult?.passed);
                } else if (isSelectDefinition(definition)) {
                    if (!definition.expected.includes(answer)) stepCorrect = false;
                } else {
                    const value = evaluateMathInput(answer);
                    const tolerance = definition.tolerance ?? step.tolerance ?? 0;
                    if (!Number.isFinite(value) || !definition.expected.some(
                        expected => Math.abs(value - Number(expected)) <= tolerance
                    )) {
                        stepCorrect = false;
                    }
                }
            }
            const previous = currentStepAttemptStates[stepIndex];
            const firstCorrect = previous.frqEnabled ? previous.firstAttemptCorrect : stepCorrect;
            if (firstCorrect) firstAttemptCorrectCount += 1;
            return {
                ...previous,
                attemptsUsed: previous.frqEnabled ? previous.attemptsUsed : 1,
                maxAttempts: getAllowedStepAttempts(step),
                firstAttemptCorrect: firstCorrect,
                resolved: true,
                earnedCredit: stepCorrect
            };
        });
    } finally {
        activeTaskState.isVerifying = false;
    }
    const questionScore = currentProblem.steps.length
        ? firstAttemptCorrectCount / currentProblem.steps.length
        : 0;
    await finalizeProblem(
        firstAttemptCorrectCount === currentProblem.steps.length,
        submittedAnswers,
        questionScore
    );
}

async function submitStage(idx) {
    const step = currentProblem.steps[idx];
    const stepState = currentStepAttemptStates[idx];
    if (!stepState || stepState.resolved) return;
    if (stepState.frqEnabled) {
        await submitFrqConclusion(idx);
        return;
    }
    const controls = getStageInputDefinitions(step).map(definition => ({
        definition,
        control: document.getElementById(getStageControlId(idx, definition))
    }));
    const answers = controls.map(({ control }) => getStageControlValue(control).trim());
    if (answers.some(answer => !answer)) return;
    const numericValues = controls.map(({ definition }, index) =>
        isSelectDefinition(definition) ? null : evaluateMathInput(answers[index])
    );
    if (numericValues.some((value, index) =>
        !isSelectDefinition(controls[index].definition) && !Number.isFinite(value)
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
            if (isSelectDefinition(definition)) {
                componentCorrect = definition.expected.some(expected => String(expected) === answer);
            } else {
                const value = numericValues[inputIndex];
                const tolerance = definition.tolerance ?? step.tolerance ?? 0.005;
                componentCorrect = Number.isFinite(value) && definition.expected.some(
                    expected => Number.isFinite(Number(expected))
                        && Math.abs(value - Number(expected)) <= tolerance
                );
            }
            if (!isSelectDefinition(definition)) {
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
    stepState.attemptsUsed += 1;
    if (stepState.firstAttemptCorrect === null) {
        stepState.firstAttemptCorrect = isCorrect;
    }
    const statusEl = document.getElementById(`stage-status-${idx}`);
    const box = document.getElementById(`stage-box-${idx}`);
    const revealEl = document.getElementById(`stage-reveal-${idx}`);
    const stageInputs = Array.from(box.querySelectorAll('input, select, math-field, textarea'));
    if (isCorrect) {
        stepState.resolved = true;
        stepState.earnedCredit = true;
        revealEl.textContent = '';
        revealEl.style.display = 'none';
        statusEl.innerHTML = '<span style="color: #10b981;">&#10004; Correct</span>';
        box.className = 'stage-box completed';
        stageInputs.forEach(control => setStageControlDisabled(control, true));
        document.getElementById(`stage-btn-${idx}`).disabled = true;
        unlockNextStage(idx);
        return;
    }

    if (stepState.attemptsUsed < stepState.maxAttempts) {
        controls.forEach(({ control, definition }, index) => {
            if (controls.length > 1 && isSelectDefinition(definition)) {
                control.style.borderColor = '#f59e0b';
                control.style.backgroundColor = '#fffbeb';
            } else if (controls.length > 1) {
                control.style.borderColor = componentResults[index] ? '#16a34a' : '#dc2626';
                control.style.backgroundColor = componentResults[index] ? '#f0fdf4' : '#fef2f2';
            } else {
                control.style.borderColor = '#dc2626';
                control.style.backgroundColor = '#fef2f2';
            }
        });
        const remaining = stepState.maxAttempts - stepState.attemptsUsed;
        statusEl.innerHTML = '<span style="color: #d97706;">&#10008; Incorrect</span>';
        box.className = 'stage-box active';
        revealEl.style.display = 'none';
        stageInputs.forEach(control => setStageControlDisabled(control, false));
        document.getElementById(`stage-btn-${idx}`).disabled = false;
        showStageInputWarning(
            idx,
            `Incorrect — ${remaining} attempt${remaining === 1 ? '' : 's'} remaining for this step.`
        );
        captureTaskQuestionState();
        return;
    }

    stepState.resolved = true;
    stepState.earnedCredit = false;
    statusEl.innerHTML = '<span style="color: #d97706;">&#10008; No attempts remaining</span>';
    box.className = 'stage-box revealed';
    showStageInputWarning(idx, '');
    const expected = controls
        .map(({ definition }) => definition.expected?.[0])
        .join(', ');
    revealEl.textContent = `Expected answer: ${expected}. Continue to the next step.`;
    revealEl.style.display = 'block';
    stageInputs.forEach(control => setStageControlDisabled(control, true));
    document.getElementById(`stage-btn-${idx}`).disabled = true;
    unlockNextStage(idx);
}

function showStageInputWarning(idx, message) {
    const warning = document.getElementById(`stage-input-warning-${idx}`);
    if (!warning) return;
    warning.textContent = message;
    warning.style.display = message ? 'block' : 'none';
}

function unlockNextStage(idx) {
    if (idx + 1 < currentProblem.steps.length) {
        const nextBox = document.getElementById(`stage-box-${idx + 1}`);
        nextBox.className = 'stage-box active';
        nextBox.style.display = 'block';
        triggerKaTeX(nextBox);
        const nextInput = currentStepAttemptStates[idx + 1]?.frqEnabled
            ? nextBox.querySelector('textarea')
            : nextBox.querySelector('input, select, math-field');
        const nextBtn = document.getElementById(`stage-btn-${idx + 1}`);
        nextBox.querySelectorAll('input, select, math-field, textarea').forEach(input => setStageControlDisabled(input, false));
        if (nextBtn) nextBtn.disabled = false;
        const frqButton = document.getElementById(`frq-check-${idx + 1}`);
        if (frqButton) frqButton.disabled = false;
        nextInput.focus();

        nextBox.querySelectorAll('input, select, math-field, textarea').forEach(control => {
            control.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !control.matches('textarea')) {
                    event.preventDefault();
                    submitStage(idx + 1);
                }
            });
        });
        captureTaskQuestionState();
        renderTaskNavigationChips();
    } else {
        finalizeProblem(
            currentStepAttemptStates.every(step => step.resolved && step.earnedCredit),
            currentQuestionAnswers.slice()
        );
    }
}

async function submitSingleAnswer() {
    const input = document.getElementById('answer-input');
    const rawVal = input.value.trim();
    if (!rawVal) return;

    const userVal = evaluateMathInput(rawVal);
    if (!Number.isFinite(userVal)) {
        const feedback = document.getElementById('feedback-banner');
        feedback.className = 'banner incorrect';
        feedback.textContent = 'Enter a valid number or arithmetic expression.';
        feedback.style.display = 'block';
        return;
    }
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

function targetedStepTopic(topic, index) {
    if (topic.startsWith('step__')) return topic;
    const candidate = `step__${topic}__${index + 1}`;
    return TOPIC_REGISTRY.some(item => item.id === candidate) ? candidate : null;
}

function missedMasterySteps(question) {
    if (!currentProblem.steps?.length) {
        return [{ key: question.topic, topic: question.topic, label: currentProblem.input_label || 'Question', fallback: true }];
    }
    return currentProblem.steps.flatMap((step, index) => {
        if (currentStepAttemptStates[index]?.firstAttemptCorrect === true) return [];
        const topic = targetedStepTopic(question.topic, index);
        return [{
            key: topic || `${question.topic}#${index + 1}`,
            topic: topic || question.topic,
            label: step.label || `Step ${index + 1}`,
            fallback: !topic
        }];
    });
}

function stepBlueprint(topic, label) {
    const text = label.toLowerCase();
    if (/hypotheses/.test(text)) return 'H₀: θ = θ₀; Hₐ: θ [<, >, ≠] θ₀. θ is the population parameter; θ₀ is its null value.';
    if (/parameter/.test(text)) return 'θ = the population quantity in context. θ describes the population, not the sample.';
    if (/conditions/.test(text)) return 'Independence: n ≤ fN when sampling without replacement; also check randomization and the model-specific condition. n is sample size, N is population size, and f is the allowed sampling fraction.';
    if (/degrees of freedom/.test(text)) {
        if (topic === 'chi_gof') return 'df = k − 1. k is the number of categories.';
        if (topic.startsWith('chi_')) return 'df = (r − 1)(c − 1). r and c are the numbers of rows and columns.';
        if (topic.startsWith('reg_')) return 'df = n − 2. n is the number of paired observations.';
        if (topic === 'ci_mean_t_2samp') return 'df = min(n₁ − 1, n₂ − 1). n₁ and n₂ are the two sample sizes.';
        return 'df = n − 1. n is the sample size.';
    }
    if (/critical value/.test(text)) return 'c* = F⁻¹((1 + C)/2). C is confidence level; F is the appropriate standard normal or t distribution.';
    if (/margin of error/.test(text)) return 'E = c* × SE. E is margin of error, c* is the critical value, and SE is standard error.';
    if (/lower bound|upper bound|interval bounds/.test(text)) return 'L = estimate − E; U = estimate + E. L and U are the bounds; E is margin of error.';
    if (/test statistic/.test(text) && topic.startsWith('chi_')) return 'χ² = Σ (O − E)² / E; p = P(χ² ≥ χ²observed | H₀). O and E are observed and expected counts.';
    if (/test statistic/.test(text)) return 'statistic = (estimate − null value) / SE. SE is the standard error under the null model.';
    if (/p-value|conclusion/.test(text)) return 'p = P(result at least as extreme | H₀); compare p with α. α is the significance level; H₀ is the null hypothesis.';
    if (/standard error|sample statistic and se|mean and standard error/.test(text)) return 'μestimate = E(estimate); SE = √Var(estimate). The estimate is the sample statistic; Var is its sampling variance.';
    if (/point estimate/.test(text)) return 'estimate = the corresponding sample statistic. It estimates the population parameter θ.';
    if (/iqr|fences/.test(text)) return 'IQR = Q₃ − Q₁; fences = Q₁ − k·IQR and Q₃ + k·IQR. Q₁ and Q₃ are quartiles; k is the fence multiplier.';
    if (/five.number/.test(text)) return 'minimum ≤ Q₁ ≤ median ≤ Q₃ ≤ maximum. Quartiles describe positions in the ordered data.';
    if (/sample statistics/.test(text)) return 'x̄ = Σxᵢ/n; s = √[Σ(xᵢ − x̄)²/(n − 1)]. xᵢ are observations and n is their count.';
    if (/transformation/.test(text)) return 'E(a + bX) = a + bE(X); SD(a + bX) = |b|SD(X). a and b are constants.';
    if (/combining variables/.test(text)) return 'E(X ± Y) = E(X) ± E(Y); Var(X ± Y) = Var(X) + Var(Y) for independent variables.';
    if (/residual|prediction/.test(text)) return 'ŷ = a + bx; e = y − ŷ. a is intercept, b is slope, x is predictor and y is observed response.';
    if (/slope|intercept|regression equation/.test(text)) return 'ŷ = a + bx; b = r(sᵧ/sₓ); a = ȳ − bx̄. a is intercept, b is slope, r is correlation, and sₓ and sᵧ are sample standard deviations.';
    if (/missing probability/.test(text)) return 'p(missing) = 1 − Σp(other values). Probabilities across all possible values sum to one.';
    if (/probability/.test(text)) return 'P(A) = P(X ∈ A). A is the event and X follows the stated distribution.';
    if (/expected value|standard deviation/.test(text)) return 'μ = Σx·P(X=x); σ = √[Σ(x − μ)²P(X=x)]. x is a possible value of X.';
    if (/correlation|r.squared/.test(text)) return 'R² = r². r is correlation; R² is the fraction of response variability explained by the linear model.';
    return 'quantity = f(inputs). Identify the relevant variables and apply the relationship stated by the model.';
}

function bindOptionalStepButtons() {
    document.querySelectorAll('#feedback-banner .optional-step-practice').forEach(button => {
        button.onclick = async () => {
            const current = activeTaskState.questionQueue[activeTaskState.currentIndex - 1];
            const block = activeTaskState.blockStates[current?.blockIndex];
            if (!current || !block) return;
            const topic = button.dataset.topic;
            button.disabled = true;
            activeTaskState.questionQueue.splice(activeTaskState.currentIndex, 0, {
                ...current, topic, phase: 'optional', allow_hints: true,
                blueprintStepKey: button.dataset.key,
                fallback_guided: button.dataset.fallback === 'true'
            });
            activeTaskState.questionsState.splice(activeTaskState.currentIndex, 0, null);
            activeTaskState.totalQuestions = activeTaskState.questionQueue.length;
            captureTaskQuestionState();
            await loadTaskQuestion(activeTaskState.currentIndex + 1);
        };
    });
}

async function finalizeProblem(isSuccess, answer = null, questionScore = null) {
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
    let firstAttemptCorrectCount = 0;
    if (currentProblem.steps?.length) {
        firstAttemptCorrectCount = currentStepAttemptStates.reduce(
            (total, step) => total + (step.frqEnabled && step.frqFirstScore !== null
                ? step.frqFirstScore : step.firstAttemptCorrect === true ? 1 : 0),
            0
        );
        questionScore = firstAttemptCorrectCount / currentProblem.steps.length;
        isSuccess = currentStepAttemptStates.length === currentProblem.steps.length &&
            currentStepAttemptStates.every(step => step.resolved && step.earnedCredit);
    }
    if (!Number.isFinite(questionScore)) questionScore = isSuccess ? 1 : 0;
    if (isTest) {
        feedback.className = 'banner';
        feedback.textContent = 'Test response recorded. Continue to the next question.';
    } else if (currentProblem.steps?.length) {
        if (activeTaskState.active) {
            feedback.className = isSuccess ? 'banner correct' : 'banner incorrect';
            feedback.textContent = isSuccess
                ? "✓ Question Complete! Click 'Next Problem' to continue."
                : "Question finished. Click 'Next Problem' to continue.";
        } else if (isSuccess) {
            feedback.className = 'banner correct';
            feedback.textContent = '✓ Problem Complete!';
        } else {
            feedback.className = 'banner incorrect';
            feedback.innerHTML = '&#10008; Problem finished with step errors.';
        }
    } else if (isSuccess) {
        feedback.className = 'banner correct';
        feedback.innerHTML = '&#10004; Problem complete! All steps solved cleanly.';
    } else {
        feedback.className = 'banner incorrect';
        feedback.innerHTML = '&#10008; Problem finished with step errors.';
    }

    const nextBtn = document.getElementById('next-btn');
    const showSolution = !isTest;
    if (!isSuccess && showSolution) {
        if (!activeTaskState.active) feedback.innerHTML += ' Full derivation:';
        const solCard = document.getElementById('solution-card');
        const solContent = document.getElementById('solution-content');
        if (currentProblem.plot_data) drawNormalDistribution(currentProblem.plot_data);
        solContent.innerHTML = currentProblem.solution;
        triggerKaTeX(solCard);
        solCard.style.display = 'block';
    }

    if (!activeTaskState.active) {
        showKeepPracticingButton(
            document.getElementById('solution-card').style.display === 'block'
                ? document.getElementById('solution-card') : feedback
        );
        document.getElementById('keep-practicing-btn').focus();
        return;
    }

    if (completedQuestion?.phase === 'optional') {
        if (questionState) {
            questionState.completed = true;
            questionState.correct = Boolean(isSuccess);
            questionState.score = questionScore;
        }
        feedback.textContent = 'Optional practice complete. Your mastery progress is unchanged.';
        captureTaskQuestionState();
        updateTaskRunnerUI();
        renderTaskNavigationChips();
        nextBtn.style.display = 'none';
        showTaskAdvanceButton();
        return;
    }

    activeTaskState.responses.push({
        questionIndex: activeTaskState.currentIndex,
        prompt: currentProblem.prompt,
        correct: Boolean(isSuccess),
        score: questionScore,
        answer,
        breakdown: buildQuestionBreakdown(
            activeTaskState.currentIndex,
            questionScore,
            currentProblem.steps?.length ? currentStepAttemptStates : [{ attemptsUsed: 1, firstAttemptCorrect: Boolean(isSuccess) }],
            currentProblem.steps?.length || 1
        ),
        blockId: completedQuestion?.blockId || null,
        phase: completedQuestion?.phase || null
    });
    if (questionState) {
        questionState.attempted = true;
        questionState.completed = true;
        questionState.correct = Boolean(isSuccess);
        questionState.score = questionScore;
        questionState.answer = answer;
    }
    if (isSuccess) activeTaskState.correctCount += 1;
    activeTaskState.earnedPoints += questionScore;
    if (completedQuestion?.blockId) {
        const blockIndex = completedQuestion.blockIndex;
        const blockState = activeTaskState.blockStates[blockIndex];
        const makeQuestion = (phase, allowHints, drill = null) => ({
            topic: drill?.topic || activeTaskState.blocks[blockIndex].topic,
            allow_hints: allowHints,
            blockId: completedQuestion.blockId,
            blockIndex,
            qInBlock: blockState.attemptsCount,
            mode: blockState.mode,
            phase,
            source_q: completedQuestion.source_q,
            step_label: completedQuestion.step_label,
            blueprintStepKey: drill?.key,
            fallback_guided: Boolean(drill?.fallback),
            reading_difficulty: completedQuestion.reading_difficulty || 'standard',
            allow_frq_conclusion: completedQuestion.allow_frq_conclusion
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

        if (blockState.mode !== 'mastery' || completedQuestion.phase === 'independent') {
            blockState.attemptsCount += 1;
        }
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
            blockState.consecutiveStepMisses = blockState.consecutiveStepMisses || {};
            const totalSteps = currentProblem.steps?.length || 1;
            const passed = questionScore >= (totalSteps >= 3 ? 0.8 : 1);
            activeTaskState.blockProgress.failedUnassisted = completedQuestion.phase === 'independent' && !passed;
            const missedSteps = missedMasterySteps(completedQuestion);
            if (completedQuestion.phase === 'guided') {
                blockState.guidedPassed = true;
                blockState.phase = 'independent';
                feedback.innerHTML += ' Guided step complete. Continue with an unassisted mastery problem.';
            } else if (completedQuestion.phase === 'remediation') {
                blockState.phase = 'independent';
                blockState.remediationStepTopic = null;
                feedback.innerHTML += ' Remediation complete. Continue with a fresh unassisted problem.';
            } else if (passed) {
                blockState.cleanPassesCount += 1;
                blockState.shieldActive = true;
                blockState.consecutiveStepMisses = {};
                if (totalSteps >= 3 && questionScore < 1) {
                    feedback.innerHTML += ` ✔ Mastery Pass Earned (${currentStepAttemptStates.filter(step => step.firstAttemptCorrect).length}/${totalSteps} steps)!`;
                    blockState.optionalMissedStepTopic = missedSteps[0]?.topic || null;
                }
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
                const missedKeys = new Set(missedSteps.map(item => item.key));
                Object.keys(blockState.consecutiveStepMisses).forEach(key => {
                    if (!missedKeys.has(key)) delete blockState.consecutiveStepMisses[key];
                });
                missedSteps.forEach(item => {
                    blockState.consecutiveStepMisses[item.key] = (blockState.consecutiveStepMisses[item.key] || 0) + 1;
                });
                const protectedPass = blockState.cleanPassesCount > 0 && blockState.shieldActive;
                if (protectedPass) blockState.shieldActive = false;
                else blockState.cleanPassesCount = Math.max(0, blockState.cleanPassesCount - 1);
                blockState.phase = protectedPass || blockState.cleanPassesCount > 0 ? 'remediation' : 'guided';
                if (blockState.attemptsCount >= blockState.maxAttempts) {
                    blockState.completed = true;
                    if (questionState) questionState.maxAttemptsReached = true;
                    feedback.innerHTML = '<strong>⚠️ Max Attempts Reached for this Topic.</strong><br>You have completed the allowed attempts for this practice block. Move on to the next section or review with your teacher.';
                    discardRemainingBlockQuestions();
                } else {
                    discardRemainingBlockQuestions();
                    if (blockState.phase === 'remediation') {
                        const drill = missedSteps[0];
                        blockState.remediationStepTopic = drill.topic;
                        feedback.innerHTML += protectedPass
                            ? ' Second-chance shield used. Your passes are preserved; practice the missed step.'
                            : ' One pass was stepped back. Practice the missed step before trying again.';
                        insertBlockQuestions([makeQuestion('remediation', true, drill), makeQuestion('independent', false)]);
                    } else {
                        blockState.guidedPassed = false;
                        feedback.innerHTML += ' Review the derivation, then return to guided practice.';
                        insertBlockQuestions([makeQuestion('guided', true), makeQuestion('independent', false)]);
                    }
                }
            }
            if (completedQuestion.phase === 'independent' && passed && totalSteps >= 3 && questionScore < 1) {
                missedSteps.forEach(step => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn-secondary optional-step-practice';
                    button.dataset.topic = step.topic;
                    button.dataset.key = step.key;
                    button.dataset.fallback = String(step.fallback);
                    button.textContent = `🔧 Practice: ${step.label} (Optional)`;
                    feedback.appendChild(button);
                });
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
    bindOptionalStepButtons();
    updateTaskRunnerUI();
    renderTaskNavigationChips();
    nextBtn.style.display = 'none';
    showTaskAdvanceButton();
    document.getElementById('task-advance-btn')?.focus();
}

window.addEventListener('load', async () => {
    const difficultySelect = document.getElementById('reading-difficulty-select');
    if (difficultySelect) {
        difficultySelect.value = state.readingDifficulty;
        difficultySelect.addEventListener('change', () => {
            if (activeTaskState.active) return;
            state.readingDifficulty = difficultySelect.value;
            saveState();
            if (getActivePracticeView() === 'practice') loadProblem();
        });
    }
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
