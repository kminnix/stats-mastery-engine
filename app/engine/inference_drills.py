import math
import random
from typing import Any, Dict


def _latex_direction(direction: str) -> str:
    return r"\neq" if direction == "!=" else direction


def generate_condition_check(kind: str = "random") -> Dict[str, Any]:
    if kind == "proportion" or (kind == "random" and random.choice(["proportion", "mean"]) == "proportion"):
        contexts = [
            ("voters who support a proposal", "polling organization", "voters"),
            ("manufactured items that are defective", "factory", "items"),
            ("customers who renew a subscription", "business", "customers"),
            ("seeds that germinate", "seed supplier", "seeds"),
        ]
        subject, organization, sample_unit = random.choice(contexts)
        n = random.choice([30, 40, 60, 100, 150])
        p0 = random.choice([0.1, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9])
        is_random = random.choice([True, False])
        population_size = n * random.choice([5, 10, 20])
        successes = n * p0
        failures = n * (1 - p0)
        counts_sufficient = successes >= 10 and failures >= 10
        is_ten_percent = n <= population_size * 0.1
        prompt = (
            f"A {organization} tests the claim that the proportion of {subject} is "
            f"\\(p_0={p0:g}\\). They use a {'random' if is_random else 'convenience'} "
            f"sample of \\(n={n}\\) {sample_unit} from a population of "
            f"\\(N={population_size}\\). Check the conditions for a one-sample "
            "proportion test."
        )
        steps = [
            {
                "step_num": 1,
                "label": "Random Sample Condition:",
                "input_type": "select",
                "options": [
                    {"value": "Met", "label": "Met"},
                    {"value": "Not met", "label": "Not met"},
                ],
                "expected": ["Met" if is_random else "Not met"],
                "hint": "A random sample supports generalizing the result to the population.",
            },
            {
                "step_num": 2,
                "label": "10% Condition (Independence):",
                "input_type": "select",
                "options": [
                    {"value": "Met", "label": "Met"},
                    {"value": "Not met", "label": "Not met"},
                ],
                "expected": ["Met" if is_ten_percent else "Not met"],
                "hint": "For sampling without replacement, check whether n is at most 10% of N.",
            },
            {
                "step_num": 3,
                "label": "Large Counts Condition:",
                "input_type": "cloze",
                "components": [
                    {
                        "id": "expected-successes",
                        "type": "number",
                        "placeholder": "n × p₀",
                        "expected": [successes],
                        "tolerance": 0.01,
                    },
                    {
                        "id": "expected-failures",
                        "type": "number",
                        "placeholder": "n × (1 − p₀)",
                        "expected": [failures],
                        "tolerance": 0.01,
                    },
                    {
                        "id": "large-counts-met",
                        "type": "select",
                        "options": [
                            {"value": "yes", "label": "Yes"},
                            {"value": "no", "label": "No"},
                        ],
                        "expected": ["yes" if counts_sufficient else "no"],
                    },
                ],
                "parts": [
                    "\\(np_0=\\)",
                    {"component": "expected-successes"},
                    ", \\(n(1-p_0)=\\)",
                    {"component": "expected-failures"},
                    ". Are both counts at least 10? ",
                    {"component": "large-counts-met"},
                ],
                "hint": "For a test, use the null proportion p₀ in both expected-count calculations.",
            },
        ]
        solution = (
            "<p><strong>Condition check</strong></p>"
            f"<p>Random sample: {'met' if is_random else 'not met'}; "
            f"{'the sample was randomly selected.' if is_random else 'a convenience sample is not random.'}</p>"
            f"<p>10% condition: {'met' if is_ten_percent else 'not met'}, since "
            f"\\(n/N={n}/{population_size}={n / population_size:.3f}\\).</p>"
            f"<p>Large counts: \\(np_0={n}({p0:g})={successes:g}\\) and "
            f"\\(n(1-p_0)={n}(1-{p0:g})={failures:g}\\). "
            f"{'Both' if counts_sufficient else 'Not both'} counts are at least 10, "
            f"so the condition is {'met' if counts_sufficient else 'not met'}.</p>"
        )
        return {
            "type": "cond_check_proportion",
            "title": "Checking Conditions: One-Sample Proportion",
            "prompt": prompt,
            "steps": steps,
            "solution": solution,
        }

    contexts = [
        ("battery runtime", "battery manufacturer", "hours"),
        ("coffee fill volume", "coffee company", "milliliters"),
        ("exam score", "instructor", "points"),
        ("customer wait time", "service manager", "minutes"),
    ]
    subject, organization, units = random.choice(contexts)
    n = random.choice([18, 24, 30, 36, 50])
    is_random = random.choice([True, False])
    population_size = n * random.choice([5, 10, 20])
    population_is_normal = random.choice([True, False])
    is_ten_percent = n <= population_size * 0.1
    normality_met = n >= 30 or population_is_normal
    prompt = (
        f"A {organization} studies the mean {subject}. A {'random' if is_random else 'convenience'} "
        f"sample of \\(n={n}\\) {units} is taken from a population of \\(N={population_size}\\). "
        f"The population is {'stated to be normal' if population_is_normal else 'not stated to be normal'}. "
        "Check the conditions for a one-sample mean test."
    )
    steps = [
        {
            "step_num": 1,
            "label": "Randomization Condition:",
            "input_type": "select",
            "options": [
                {"value": "Met", "label": "Met"},
                {"value": "Not met", "label": "Not met"},
            ],
            "expected": ["Met" if is_random else "Not met"],
            "hint": "A random sample or random assignment is needed for inference.",
        },
        {
            "step_num": 2,
            "label": "10% Condition (Independence):",
            "input_type": "select",
            "options": [
                {"value": "Met", "label": "Met"},
                {"value": "Not met", "label": "Not met"},
            ],
            "expected": ["Met" if is_ten_percent else "Not met"],
            "hint": "For sampling without replacement, check whether n is at most 10% of N.",
        },
        {
            "step_num": 3,
            "label": "Normality Condition:",
            "input_type": "select",
            "options": [
                {"value": "Met", "label": "Met"},
                {"value": "Not met", "label": "Not met"},
            ],
            "expected": ["Met" if normality_met else "Not met"],
            "hint": "The sampling distribution is approximately normal if n ≥ 30 or the population is normal.",
        },
    ]
    solution = (
        "<p><strong>Condition check</strong></p>"
        f"<p>Randomization: {'met' if is_random else 'not met'}; "
        f"{'the sample was randomly selected.' if is_random else 'a convenience sample is not random.'}</p>"
        f"<p>10% condition: {'met' if is_ten_percent else 'not met'}, since "
        f"\\(n/N={n}/{population_size}={n / population_size:.3f}\\).</p>"
        f"<p>Normality: {'met' if normality_met else 'not met'}, because "
        f"{'n is at least 30' if n >= 30 else 'the population is stated to be normal' if population_is_normal else 'n is below 30 and the population is not stated to be normal'}.</p>"
    )
    return {
        "type": "cond_check_mean",
        "title": "Checking Conditions: One-Sample Mean",
        "prompt": prompt,
        "steps": steps,
        "solution": solution,
    }


def generate_hypothesis_drill(kind: str = "random") -> Dict[str, Any]:
    alternative_phrases = {
        "<": "less than",
        ">": "greater than",
        "!=": "different from",
    }
    scenarios = [
        {
            "parameter": "p",
            "null": 0.5,
            "description": "the true proportion of voters who support the proposal",
            "context": "A polling organization tests whether the proportion of voters who support a proposal differs from 0.50.",
        },
        {
            "parameter": "μ",
            "null": 50.0,
            "description": "the true mean battery runtime, in hours",
            "context": "A battery maker investigates whether mean runtime is different from its 50-hour claim.",
        },
        {
            "parameter": "p₁ - p₂",
            "null": 0,
            "description": "the difference in the true proportions of customers who renew for plans 1 and 2",
            "context": "A business compares renewal rates for plan 1 and plan 2 customers.",
        },
        {
            "parameter": "μ₁ - μ₂",
            "null": 0,
            "description": "the difference in the true mean wait times for locations 1 and 2, in minutes",
            "context": "A service manager compares mean wait times at location 1 and location 2.",
        },
        {
            "parameter": "μ_diff",
            "null": 0,
            "description": "the true mean paired difference in exam scores (after − before), in points",
            "context": "Students take the same exam before and after a review course; the study examines after-minus-before score differences.",
        },
    ]
    if kind == "proportion":
        scenarios = [scenario for scenario in scenarios if scenario["parameter"] in {"p", "p₁ - p₂"}]
    elif kind == "mean":
        scenarios = [scenario for scenario in scenarios if scenario["parameter"] in {"μ", "μ₁ - μ₂", "μ_diff"}]
    scenario = random.choice(scenarios)
    direction = random.choice(["<", ">", "!="])
    phrase = alternative_phrases[direction]
    null_value = scenario["null"]
    prompt = (
        f"{scenario['context']} The alternative claim is that "
        f"{scenario['description']} is {phrase} {null_value:g}. "
        "Identify only the population parameter symbol, the null-hypothesis value, "
        "and the alternative inequality direction."
    )
    steps = [
        {
            "step_num": 1,
            "label": "Population Parameter Symbol:",
            "input_type": "select",
            "options": [
                {"value": symbol, "label": symbol}
                for symbol in ["p", "μ", "p₁ - p₂", "μ₁ - μ₂", "μ_diff"]
            ],
            "expected": [scenario["parameter"]],
            "hint": "Choose the population parameter, not a sample statistic.",
        },
        {
            "step_num": 2,
            "label": "Null Hypothesis Value:",
            "input_type": "number",
            "placeholder": "null value",
            "expected": [null_value],
            "tolerance": 0.00001,
            "hint": "The null value is the equality value in H₀; differences are commonly tested against 0.",
        },
        {
            "step_num": 3,
            "label": "Alternative Inequality Direction:",
            "input_type": "select",
            "options": [
                {"value": symbol, "label": "≠" if symbol == "!=" else symbol}
                for symbol in ["<", ">", "!="]
            ],
            "expected": [direction],
            "hint": "Translate “less than,” “greater than,” or “different from” into its symbol.",
        },
    ]
    return {
        "type": "drill_hypothesis",
        "title": "Sub-Skill: Stating Hypotheses",
        "prompt": prompt,
        "steps": steps,
        "solution": (
            f"<p>The population parameter is \\({scenario['parameter']}\\), representing "
            f"{scenario['description']}. The null value is \\({null_value:g}\\), so "
            f"\\(H_0: {scenario['parameter']}={null_value:g}\\). The direction “{phrase}” "
            f"corresponds to \\({_latex_direction(direction)}\\), giving "
            f"\\(H_a: {scenario['parameter']} {_latex_direction(direction)} {null_value:g}\\).</p>"
        ),
    }


def generate_test_stat_drill(kind: str = "random") -> Dict[str, Any]:
    if kind == "proportion" or (kind == "random" and random.choice(["proportion", "mean"]) == "proportion"):
        n = random.choice([50, 80, 100, 150, 200])
        p0 = random.choice([0.2, 0.25, 0.4, 0.5, 0.6, 0.75])
        x = random.randint(max(0, int(n * p0) - 18), min(n, int(n * p0) + 18))
        p_hat = x / n
        alternative = random.choice(["<", ">", "!="])
        standard_error = math.sqrt(p0 * (1 - p0) / n)
        statistic = (p_hat - p0) / standard_error
        prompt = (
            f"A one-sample proportion test uses \\(H_0:p={p0:g}\\) against "
            f"\\(H_a:p {_latex_direction(alternative)} {p0:g}\\). In a sample of "
            f"\\(n={n}\\), \\(x={x}\\) successes were observed "
            f"(\\(\\hat{{p}}={p_hat:.4f}\\)). Calculate the null standard error \\(SE_0\\) "
            "and the standardized z test statistic."
        )
        statistic_label = "z"
        standard_error_formula = r"\sqrt{\frac{p_0(1-p_0)}{n}}"
        statistic_formula = r"\frac{\hat{p}-p_0}{SE_0}"
        solution = (
            f"<p>\\(SE_0=\\sqrt{{p_0(1-p_0)/n}}="
            f"\\sqrt{{{p0:g}(1-{p0:g})/{n}}}={standard_error:.5f}\\).</p>"
            f"<p>\\(z=(\\hat p-p_0)/SE_0=({p_hat:.4f}-{p0:g})/"
            f"{standard_error:.5f}={statistic:.4f}\\).</p>"
        )
    else:
        n = random.choice([16, 20, 25, 30, 36, 45])
        mu0 = random.choice([50.0, 75.0, 100.0])
        sample_sd = random.choice([4.0, 6.0, 8.0, 10.0, 12.0])
        x_bar = mu0 + random.choice([-1, 1]) * random.choice([1, 2, 3, 5]) * sample_sd / math.sqrt(n)
        alternative = random.choice(["<", ">", "!="])
        standard_error = sample_sd / math.sqrt(n)
        statistic = (x_bar - mu0) / standard_error
        prompt = (
            f"A one-sample mean test uses \\(H_0:\\mu={mu0:g}\\) against "
            f"\\(H_a:\\mu {_latex_direction(alternative)} {mu0:g}\\). A sample of "
            f"\\(n={n}\\) has mean \\(\\bar{{x}}={x_bar:.3f}\\) and standard deviation "
            f"\\(s={sample_sd:g}\\). Calculate the null standard error \\(SE_0\\) "
            "and the standardized t test statistic."
        )
        statistic_label = "t"
        standard_error_formula = r"\frac{s}{\sqrt{n}}"
        statistic_formula = r"\frac{\bar{x}-\mu_0}{SE_0}"
        solution = (
            f"<p>\\(SE_0=s/\\sqrt{{n}}={sample_sd:g}/\\sqrt{{{n}}}="
            f"{standard_error:.5f}\\).</p>"
            f"<p>\\(t=(\\bar x-\\mu_0)/SE_0=({x_bar:.3f}-{mu0:g})/"
            f"{standard_error:.5f}={statistic:.4f}\\).</p>"
        )
    return {
        "type": "drill_test_statistic",
        "title": "Sub-Skill: Standard Error & Test Statistic",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": "Standard Error (SE₀):",
                "input_type": "math",
                "math_symbols": ["sqrt", "frac", "parens"],
                "placeholder": "standard error",
                "expected": [round(standard_error, 5)],
                "tolerance": 0.00005,
                "hint": f"Use \\({standard_error_formula}\\) with the null proportion for z or sample s for t.",
            },
            {
                "step_num": 2,
                "label": f"Standardized Test Statistic ({statistic_label}):",
                "input_type": "math",
                "math_symbols": ["sqrt", "frac", "parens"],
                "placeholder": statistic_label,
                "expected": [
                    round(statistic, 4),
                    round(statistic, 3),
                    round(statistic, 2),
                ],
                "tolerance": 0.005,
                "hint": f"Use \\({statistic_formula}\\): subtract the null value and divide by SE₀.",
            },
        ],
        "solution": solution,
    }


def generate_conclusion_drill(kind: str = "random") -> Dict[str, Any]:
    scenarios = [
        ("p", "the true proportion of voters who support the proposal", [0.4, 0.5, 0.6]),
        ("μ", "the true mean battery runtime, in hours", [50, 75, 100]),
        ("p₁ - p₂", "the difference in the true proportions of plan 1 and plan 2 customers who renew", [0]),
        ("μ₁ - μ₂", "the difference in the true mean wait times at locations 1 and 2, in minutes", [0]),
        ("μ_diff", "the true mean paired difference in exam scores (after − before), in points", [0]),
    ]
    if kind == "proportion":
        scenarios = [scenario for scenario in scenarios if scenario[0] in {"p", "p₁ - p₂"}]
    elif kind == "mean":
        scenarios = [scenario for scenario in scenarios if scenario[0] in {"μ", "μ₁ - μ₂", "μ_diff"}]
    parameter, parameter_description, null_values = random.choice(scenarios)
    claim_value = random.choice(null_values)
    alternative = random.choice(["<", ">", "!="])
    alpha = random.choice([0.01, 0.025, 0.05, 0.08, 0.10])
    p_value = random.choice([0.002, 0.008, 0.018, 0.035, 0.065, 0.12])
    while p_value == alpha:
        p_value = random.choice([0.002, 0.008, 0.018, 0.035, 0.065, 0.12])
    reject = p_value < alpha
    comparison = "<" if reject else ">"
    decision = "reject H0" if reject else "fail to reject H0"
    evidence = "is convincing" if reject else "is not convincing"
    p_value_text = f"{p_value:g}"
    alpha_text = f"{alpha:g}"
    prompt = (
        f"A hypothesis test considers \\(H_0:{parameter}={claim_value:g}\\) against "
        f"\\(H_a:{parameter} {_latex_direction(alternative)} {claim_value:g}\\), where {parameter} represents "
        f"{parameter_description}. The significance level is \\(\\alpha={alpha_text}\\) "
        f"and the P-value is \\({p_value_text}\\). Complete the contextual conclusion."
    )
    steps = [
        {
            "step_num": 1,
            "label": "P-Value & Contextual Conclusion:",
            "input_type": "cloze",
            "components": [
                {
                    "id": "conclusion-pvalue",
                    "type": "number",
                    "placeholder": "P-value",
                    "expected": [p_value],
                    "tolerance": 0.00001,
                },
                {
                    "id": "conclusion-comparison",
                    "type": "select",
                    "options": [
                        {"value": "<", "label": "<"},
                        {"value": ">", "label": ">"},
                    ],
                    "expected": [comparison],
                },
                {
                    "id": "conclusion-alpha",
                    "type": "number",
                    "placeholder": "alpha",
                    "expected": [alpha],
                    "tolerance": 0.00001,
                },
                {
                    "id": "conclusion-decision",
                    "type": "select",
                    "options": [
                        {"value": "reject H0", "label": "reject H₀"},
                        {"value": "fail to reject H0", "label": "fail to reject H₀"},
                    ],
                    "expected": [decision],
                },
                {
                    "id": "conclusion-evidence",
                    "type": "select",
                    "options": [
                        {"value": "is convincing", "label": "is convincing"},
                        {"value": "is not convincing", "label": "is not convincing"},
                    ],
                    "expected": [evidence],
                },
                {
                    "id": "param-context",
                    "type": "select",
                    "options": [
                        {"value": description, "label": description}
                        for _, description, _ in scenarios
                    ],
                    "expected": [parameter_description],
                },
                {
                    "id": "conclusion-direction",
                    "type": "select",
                    "options": [
                        {"value": "<", "label": "<"},
                        {"value": ">", "label": ">"},
                        {"value": "!=", "label": "≠"},
                    ],
                    "expected": [alternative],
                },
                {
                    "id": "conclusion-claim",
                    "type": "number",
                    "placeholder": "claim value",
                    "expected": [claim_value],
                    "tolerance": 0.00001,
                },
            ],
            "parts": [
                "Because the P-value (",
                {"component": "conclusion-pvalue"},
                ") is ",
                {"component": "conclusion-comparison"},
                " alpha = ",
                {"component": "conclusion-alpha"},
                ", we ",
                {"component": "conclusion-decision"},
                ". There ",
                {"component": "conclusion-evidence"},
                " statistical evidence that ",
                {"component": "param-context"},
                " ",
                {"component": "conclusion-direction"},
                " ",
                {"component": "conclusion-claim"},
                ".",
            ],
            "hint": "Compare the P-value with α. A smaller P-value leads to rejection; otherwise, fail to reject H₀.",
        }
    ]
    return {
        "type": "drill_conclusion",
        "title": "Sub-Skill: P-Value & Contextual Conclusion",
        "prompt": prompt,
        "steps": steps,
        "solution": (
            f"<p>Since the P-value \\({p_value_text}\\) is {comparison} "
            f"\\(\\alpha={alpha_text}\\), {decision}. There {evidence} statistical evidence "
            f"that {parameter_description} {_latex_direction(alternative)} {claim_value:g}.</p>"
        ),
    }


def generate_condition_check_proportion() -> Dict[str, Any]:
    return generate_condition_check("proportion")


def generate_condition_check_mean() -> Dict[str, Any]:
    return generate_condition_check("mean")


def generate_hypothesis_drill_proportion() -> Dict[str, Any]:
    return generate_hypothesis_drill("proportion")


def generate_hypothesis_drill_mean() -> Dict[str, Any]:
    return generate_hypothesis_drill("mean")


def generate_test_stat_drill_proportion() -> Dict[str, Any]:
    return generate_test_stat_drill("proportion")


def generate_test_stat_drill_mean() -> Dict[str, Any]:
    return generate_test_stat_drill("mean")


def generate_conclusion_drill_proportion() -> Dict[str, Any]:
    return generate_conclusion_drill("proportion")


def generate_conclusion_drill_mean() -> Dict[str, Any]:
    return generate_conclusion_drill("mean")


def generate_standard_error_drill_proportion() -> Dict[str, Any]:
    contexts = [
        ("voters who support a proposal", "polling organization"),
        ("customers who renew a subscription", "business"),
        ("seeds that germinate", "seed supplier"),
    ]
    subject, organization = random.choice(contexts)
    n = random.choice([40, 60, 100, 150, 200])
    successes = random.randint(10, n - 10)
    p_hat = successes / n
    standard_error = math.sqrt(p_hat * (1 - p_hat) / n)
    return {
        "type": "drill_se_proportion",
        "title": "Sub-Skill: Standard Error for Proportions",
        "prompt": (
            f"A {organization} estimates the proportion of {subject} using a sample of "
            f"\\(n={n}\\) units and observes "
            f"\\(x={successes}\\) successes (\\(\\hat{{p}}={p_hat:.4f}\\)). "
            "For a confidence interval, calculate the estimated standard error "
            "\\(\\sqrt{\\hat{p}(1-\\hat{p})/n}\\)."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Estimated Standard Error:",
                "input_type": "math",
                "math_symbols": ["sqrt", "frac", "parens"],
                "placeholder": "standard error",
                "expected": [round(standard_error, 5)],
                "tolerance": 0.00005,
                "hint": "For a proportion confidence interval, use p-hat rather than the null proportion.",
            }
        ],
        "solution": (
            f"<p>\\(SE=\\sqrt{{\\hat p(1-\\hat p)/n}}="
            f"\\sqrt{{{p_hat:.4f}(1-{p_hat:.4f})/{n}}}="
            f"{standard_error:.5f}\\).</p>"
        ),
    }


def generate_standard_error_drill_mean() -> Dict[str, Any]:
    from scipy.stats import t

    n = random.choice([12, 16, 20, 25, 30, 36])
    sample_sd = random.choice([4.0, 6.0, 8.0, 10.0, 12.0])
    confidence_level = random.choice([0.90, 0.95, 0.98, 0.99])
    standard_error = sample_sd / math.sqrt(n)
    critical_value = float(t.ppf((1 + confidence_level) / 2, n - 1))
    return {
        "type": "drill_se_mean",
        "title": "Sub-Skill: Standard Error & t* for Means",
        "prompt": (
            f"A sample of \\(n={n}\\) observations has standard deviation "
            f"\\(s={sample_sd:g}\\). For a {confidence_level:.0%} confidence interval "
            "for a population mean, calculate the standard error and the critical "
            f"value \\(t^*\\) with \\(df={n - 1}\\)."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Standard Error:",
                "input_type": "math",
                "math_symbols": ["sqrt", "frac", "parens"],
                "placeholder": "standard error",
                "expected": [round(standard_error, 5)],
                "tolerance": 0.00005,
                "hint": "Calculate \\(SE=s/\\sqrt{n}\\).",
            },
            {
                "step_num": 2,
                "label": "Critical Value (t*):",
                "input_type": "number",
                "placeholder": "t*",
                "expected": [round(critical_value, 3), round(critical_value, 2)],
                "tolerance": 0.005,
                "hint": f"Use the t-distribution with \\(df={n - 1}\\) and equal tail areas of \\((1-{confidence_level:g})/2\\).",
            },
        ],
        "solution": (
            f"<p>\\(SE=s/\\sqrt{{n}}={sample_sd:g}/\\sqrt{{{n}}}="
            f"{standard_error:.5f}\\).</p>"
            f"<p>For a {confidence_level:.0%} interval with \\(df={n - 1}\\), "
            f"\\(t^*={critical_value:.4f}\\).</p>"
        ),
    }
