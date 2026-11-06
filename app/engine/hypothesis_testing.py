import math
import random

from scipy.stats import norm, t


ALPHA_LEVELS = [0.01, 0.05, 0.10]
ALTERNATIVES = ["<", ">", "!="]


def _alternative_latex(parameter: str, alternative: str, null_value: str) -> str:
    symbol = r"\ne" if alternative == "!=" else alternative
    return f"{parameter} {symbol} {null_value}"


def _decision(p_value: float, alpha: float) -> str:
    return "Reject H0" if p_value < alpha else "Fail to reject H0"


def generate_one_sample_prop_z_test():
    """Generate a one-sample z test for a population proportion."""
    contexts = [
        ("customers who are satisfied", "A company", "customers", "report being satisfied"),
        ("manufactured items that are defective", "A factory", "manufactured items", "are defective"),
        ("voters who support a proposal", "A polling organization", "voters", "support the proposal"),
        ("seeds that successfully germinate", "A seed supplier", "seeds", "germinate"),
        ("patients who respond to treatment", "A medical research team", "patients", "respond to treatment")
    ]
    context_noun, claimant, sample_unit, sample_success = random.choice(contexts)
    p0 = random.choice([0.2, 0.25, 0.4, 0.5, 0.6, 0.75])
    n = random.choice([50, 80, 100, 150, 200])
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    x = random.randint(0, n)
    phat = x / n
    se0 = math.sqrt((p0 * (1 - p0)) / n)
    z_stat = (phat - p0) / se0

    if alternative == "<":
        p_value = float(norm.cdf(z_stat))
    elif alternative == ">":
        p_value = float(1.0 - norm.cdf(z_stat))
    else:
        p_value = float(2.0 * (1.0 - norm.cdf(abs(z_stat))))
    decision = _decision(p_value, alpha)
    alternative_hypothesis = _alternative_latex("p", alternative, "p_0")
    direction_phrase = {
        "<": "less than",
        ">": "greater than",
        "!=": "different from"
    }[alternative]
    p_value_comparison = (
        r"p\text{-value} < \alpha" if p_value < alpha
        else r"p\text{-value} \geq \alpha"
    )

    solution = (
        f"<p><strong>Step 1: Identify the null value and state the hypotheses</strong></p>"
        f"$$\\text{{Null value: }}p_0 = {p0},\\qquad "
        f"H_0: p = p_0,\\qquad H_a: {alternative_hypothesis}$$"
        f"<p><strong>Step 2: Calculate the test statistic</strong></p>"
        f"$$\\hat{{p}} = \\frac{{x}}{{n}} = \\frac{{{x}}}{{{n}}} = {phat:.4f}$$"
        f"$$SE_0 = \\sqrt{{\\frac{{p_0(1-p_0)}}{{n}}}} = "
        f"\\sqrt{{\\frac{{({p0})(1-{p0})}}{{{n}}}}} \\approx {se0:.5f}$$"
        f"$$z = \\frac{{\\hat{{p}}-p_0}}{{SE_0}} = "
        f"\\frac{{{phat:.4f}-{p0}}}{{{se0:.5f}}} \\approx \\mathbf{{{z_stat:.4f}}}$$"
        f"<p><strong>Step 3: Calculate the p-value</strong></p>"
        f"$$p\\text{{-value}} = {p_value:.5f}$$"
        f"<p><strong>Step 4: Make the decision</strong></p>"
        f"$$\\alpha = {alpha:.2f},\\qquad "
        f"{p_value_comparison}$$"
        f"<p><strong>{decision}</strong>. "
        f"{'There is sufficient evidence for the alternative.' if decision == 'Reject H0' else 'There is not sufficient evidence for the alternative.'}</p>"
    )

    direction_options = [
        {"value": "<", "label": "Hₐ: p < p₀"},
        {"value": ">", "label": "Hₐ: p > p₀"},
        {"value": "!=", "label": "Hₐ: p ≠ p₀"}
    ]
    decision_options = [
        {"value": "Reject H0", "label": "Reject H₀"},
        {"value": "Fail to reject H0", "label": "Fail to reject H₀"}
    ]
    return {
        "type": "ht_prop_z",
        "title": "1-Sample z-Test for Proportion",
        "prompt": (
            f"{claimant} claims that the proportion of {context_noun} is "
            f"\\(p = {p0}\\). In a random sample of \\(n = {n}\\) {sample_unit}, "
            f"\\(x = {x}\\) {sample_success}. Test whether the true proportion of "
            f"{context_noun} is {direction_phrase} \\({p0}\\) at the "
            f"\\(\\alpha = {alpha:.2f}\\) significance level."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Null Value (p₀) & Alternative Hypothesis:",
                "input_type": "select",
                "options": direction_options,
                "expected": [alternative],
                "tolerance": 0,
                "hint": "Identify the null value \\(p_0\\) and determine the inequality \\((<, >, \\neq)\\) from the research claim."
            },
            {
                "step_num": 2,
                "label": "Test Statistic z:",
                "placeholder": "e.g. 1.42",
                "expected": [round(z_stat, 4), round(z_stat, 3), round(z_stat, 2)],
                "tolerance": 0.05,
                "hint": "Use \\(z = \\frac{\\hat{p} - p_0}{SE_0}\\), where \\(SE_0 = \\sqrt{\\frac{p_0(1 - p_0)}{n}}\\)."
            },
            {
                "step_num": 3,
                "label": "P-value:",
                "placeholder": "e.g. 0.0832",
                "expected": [round(p_value, 5), round(p_value, 4), round(p_value, 3)],
                "tolerance": 0.005,
                "hint": "Calculate the tail probability using the standard normal distribution for the test statistic \\(z\\)."
            },
            {
                "step_num": 4,
                "label": f"Decision (α = {alpha:.2f}):",
                "input_type": "select",
                "options": decision_options,
                "expected": [decision],
                "tolerance": 0,
                "hint": "Compare \\(P\\)-value to \\(\\alpha\\). If \\(P \\le \\alpha\\), reject \\(H_0\\); if \\(P > \\alpha\\), fail to reject \\(H_0\\)."
            }
        ],
        "solution": solution
    }


def generate_one_sample_mean_t_test():
    """Generate a one-sample t test for a population mean."""
    contexts = [
        ("battery runtime", "A battery manufacturer", "hours"),
        ("coffee machine fill volume", "A coffee machine company", "milliliters"),
        ("score on a student exam", "An instructor", "points"),
        ("package fill weight", "A packaging company", "grams"),
        ("daily customer wait time", "A service manager", "minutes")
    ]
    context_noun, claimant, units = random.choice(contexts)
    mu0 = random.choice([50.0, 75.0, 100.0])
    n = random.choice([16, 20, 25, 30, 36])
    df = n - 1
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    s = round(random.uniform(4.0, 15.0), 1)
    se = s / math.sqrt(n)
    xbar = round(mu0 + random.uniform(-3.0, 3.0) * se, 1)
    t_stat = (xbar - mu0) / se

    if alternative == "<":
        p_value = float(t.cdf(t_stat, df))
    elif alternative == ">":
        p_value = float(1.0 - t.cdf(t_stat, df))
    else:
        p_value = float(2.0 * (1.0 - t.cdf(abs(t_stat), df)))
    decision = _decision(p_value, alpha)
    alternative_hypothesis = _alternative_latex(r"\mu", alternative, r"\mu_0")
    direction_phrase = {
        "<": "less than",
        ">": "greater than",
        "!=": "different from"
    }[alternative]
    p_value_comparison = (
        r"p\text{-value} < \alpha" if p_value < alpha
        else r"p\text{-value} \geq \alpha"
    )

    solution = (
        f"<p><strong>Step 1: Identify the null value and state the hypotheses</strong></p>"
        f"$$\\text{{Null value: }}\\mu_0 = {mu0:.1f},\\qquad "
        f"H_0: \\mu = \\mu_0,\\qquad H_a: {alternative_hypothesis}$$"
        f"<p><strong>Step 2: Calculate the test statistic</strong></p>"
        f"$$SE = \\frac{{s}}{{\\sqrt{{n}}}} = \\frac{{{s}}}{{\\sqrt{{{n}}}}} "
        f"\\approx {se:.4f}$$"
        f"$$t = \\frac{{\\bar{{x}}-\\mu_0}}{{SE}} = "
        f"\\frac{{{xbar}-{mu0:.1f}}}{{{se:.4f}}} \\approx \\mathbf{{{t_stat:.4f}}},"
        f"\\qquad df = n - 1 = {df}$$"
        f"<p><strong>Step 3: Calculate the p-value</strong></p>"
        f"$$p\\text{{-value}} = {p_value:.5f}$$"
        f"<p><strong>Step 4: Make the decision</strong></p>"
        f"$$\\alpha = {alpha:.2f},\\qquad "
        f"{p_value_comparison}$$"
        f"<p><strong>{decision}</strong>. "
        f"{'There is sufficient evidence for the alternative.' if decision == 'Reject H0' else 'There is not sufficient evidence for the alternative.'}</p>"
    )

    direction_options = [
        {"value": "<", "label": "Hₐ: μ < μ₀"},
        {"value": ">", "label": "Hₐ: μ > μ₀"},
        {"value": "!=", "label": "Hₐ: μ ≠ μ₀"}
    ]
    decision_options = [
        {"value": "Reject H0", "label": "Reject H₀"},
        {"value": "Fail to reject H0", "label": "Fail to reject H₀"}
    ]
    return {
        "type": "ht_mean_t",
        "title": "1-Sample t-Test for Mean",
        "prompt": (
            f"{claimant} claims that the average {context_noun} is "
            f"\\(\\mu = {mu0:.1f}\\). A random sample of "
            f"\\(n = {n}\\) has a mean of \\(\\bar{{x}} = {xbar}\\) {units} "
            f"and a standard deviation of \\(s = {s}\\) {units}. Test whether the true "
            f"mean {context_noun} is {direction_phrase} {mu0:.1f} {units} at the "
            f"\\(\\alpha = {alpha:.2f}\\) significance level."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Null Value (μ₀) & Alternative Hypothesis:",
                "input_type": "select",
                "options": direction_options,
                "expected": [alternative],
                "tolerance": 0,
                "hint": "Identify \\(\\mu_0\\) and the alternative direction \\((<, >, \\neq)\\)."
            },
            {
                "step_num": 2,
                "label": f"Test Statistic t (df = {df}):",
                "placeholder": "e.g. 1.42",
                "expected": [round(t_stat, 4), round(t_stat, 3), round(t_stat, 2)],
                "tolerance": 0.05,
                "hint": "Use \\(t = \\frac{\\bar{x} - \\mu_0}{SE}\\), where \\(SE = \\frac{s}{\\sqrt{n}}\\) with \\(df = n - 1\\)."
            },
            {
                "step_num": 3,
                "label": "P-value:",
                "placeholder": "e.g. 0.0832",
                "expected": [round(p_value, 5), round(p_value, 4), round(p_value, 3)],
                "tolerance": 0.005,
                "hint": "Find the tail area under the t-distribution with \\(df = n - 1\\)."
            },
            {
                "step_num": 4,
                "label": f"Decision (α = {alpha:.2f}):",
                "input_type": "select",
                "options": decision_options,
                "expected": [decision],
                "tolerance": 0,
                "hint": "Reject \\(H_0\\) if \\(P \\le \\alpha\\); otherwise, fail to reject \\(H_0\\)."
            }
        ],
        "solution": solution
    }


def generate_ht_problem(topic: str):
    if topic == "ht_prop_z":
        return generate_one_sample_prop_z_test()
    if topic == "ht_mean_t":
        return generate_one_sample_mean_t_test()
    raise ValueError(f"Unsupported hypothesis-testing topic: {topic}")
