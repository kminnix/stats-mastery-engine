import math
import random
import re
from typing import Any, Dict, List, Optional, Tuple

from scipy.stats import norm, t


ALPHA_LEVELS = [0.01, 0.02, 0.025, 0.04, 0.05, 0.08, 0.10]
ALTERNATIVES = ["<", ">", "!="]


def _decision(p_value: float, alpha: float) -> str:
    return "Reject H0" if p_value <= alpha else "Fail to reject H0"


def _tail_probability(statistic: float, alternative: str, df: Optional[int] = None) -> float:
    distribution = t if df is not None else norm
    if alternative == "<":
        return float(distribution.cdf(statistic, df) if df is not None else distribution.cdf(statistic))
    if df is not None:
        return float(distribution.sf(statistic if alternative == ">" else abs(statistic), df) * (2 if alternative == "!=" else 1))
    return float(distribution.sf(statistic if alternative == ">" else abs(statistic)) * (2 if alternative == "!=" else 1))


def _cdf_tail_probability(statistic: float, alternative: str, df: Optional[int] = None) -> float:
    distribution = t if df is not None else norm
    cdf = float(distribution.cdf(statistic, df) if df is not None else distribution.cdf(statistic))
    if alternative == "<":
        return cdf
    if alternative == ">":
        return 1 - cdf
    return 2 * min(cdf, 1 - cdf)


def _alternative_symbol(alternative: str) -> str:
    return r"\ne" if alternative == "!=" else alternative


def _parameter_definition_options(
    test_type: str,
    parameter_description: str,
    sample_description: str,
    null_value: float,
) -> Tuple[str, List[Dict[str, str]]]:
    if "prop" in test_type:
        prefix = "the true population proportion of "
        context = parameter_description[len(prefix):] if parameter_description.startswith(prefix) else parameter_description
        if test_type == "ht_prop_z":
            correct = f"The true population proportion of {context}"
            sample_sizes = re.findall(r"\d+", sample_description)
            sample_size = sample_sizes[0] if sample_sizes else "sampled"
            sample_distractor = f"The true sample proportion of the {sample_size} surveyed items observed in this experiment"
        else:
            prefix = "the true difference in the proportions of "
            context = parameter_description[len(prefix):] if parameter_description.startswith(prefix) else parameter_description
            correct = f"The true difference in the proportions of {context}"
            sample_sizes = re.findall(r"\d+", sample_description)
            size_phrase = " and ".join(sample_sizes) if sample_sizes else "the sampled"
            sample_distractor = f"The true sample proportion from the groups of {size_phrase} observed in this experiment"
        other_event = (
            "The probability that a random item is not defective"
            if "defective" in context
            else "The probability that a random item is defective"
        )
        distractors = [
            sample_distractor,
            "The true standard error of sample proportions",
            other_event,
        ]
    else:
        if test_type == "ht_mean_t":
            prefix = "the true population mean "
            context = parameter_description[len(prefix):] if parameter_description.startswith(prefix) else parameter_description
            correct = f"The true mean {context}"
            sample_distractor = f"The true sample mean {context} observed in this experiment"
        elif test_type == "ht_mean_t_2samp":
            prefix = "the true difference in mean "
            context = parameter_description[len(prefix):] if parameter_description.startswith(prefix) else parameter_description
            correct = f"The true mean difference in {context}"
            sample_distractor = f"The true sample mean difference in {context} observed in this experiment"
        else:
            prefix = "the true mean paired difference in "
            context = parameter_description[len(prefix):] if parameter_description.startswith(prefix) else parameter_description
            correct = f"The true mean paired difference in {context}"
            sample_distractor = f"The true sample mean paired difference in {context} observed in this experiment"
        distractors = [
            sample_distractor,
            f"The hypothesized standard error of {context}",
            f"The probability that the null mean is equal to {null_value:g}",
        ]
    return correct, [
        {"value": option, "label": option}
        for option in [correct, *distractors]
    ]


def _build_inference_pipeline(
    *,
    test_type: str,
    parameter_description: str,
    sample_description: str,
    parameter_symbol: str,
    sample_statistic_symbol: str,
    parameter_definition_options: List[Dict[str, str]],
    null_value: float,
    alternative: str,
    alternative_statement: str,
    null_hypothesis: str,
    alternative_hypothesis: str,
    test_statistic_label: str,
    test_statistic: float,
    sample_statistic_value: float,
    standard_error: float,
    degrees_freedom: Optional[int],
    test_statistic_formula: str,
    statistic_derivation: str,
    p_value: float,
    p_value_derivation: str,
    alpha: float,
    decision: str,
) -> Tuple[List[Dict[str, Any]], str]:
    formatted_p_value = f"{p_value:.5f}"
    convincing = decision == "Reject H0"
    formatted_alpha = f"{alpha:.3f}".rstrip("0").rstrip(".")
    comparison_operator = "≤" if p_value <= alpha else ">"
    symbol_options = [
        {"value": symbol, "label": symbol}
        for symbol in (
            ["μ_diff", "x̄_diff", "μ", "x̄"]
            if parameter_symbol == "μ_diff"
            else ["μ₁ - μ₂", "x̄₁ - x̄₂", "μ", "x̄"]
            if parameter_symbol == "μ₁ - μ₂"
            else ["p₁ - p₂", "p̂₁ - p̂₂", "p", "p̂"]
            if parameter_symbol == "p₁ - p₂"
            else ["p", "p̂", "μ", "x̄"]
            if parameter_symbol == "p"
            else ["μ", "x̄", "p", "p̂"]
        )
    ]
    direction_options = [
        {"value": "<", "label": "<"},
        {"value": ">", "label": ">"},
        {"value": "!=", "label": "≠"}
    ]
    decision_options = [
        {"value": "Reject H0", "label": "reject H₀"},
        {"value": "Fail to reject H0", "label": "fail to reject H₀"}
    ]
    evidence_options = [
        {"value": "is convincing", "label": "is convincing"},
        {"value": "is not convincing", "label": "is not convincing"}
    ]
    direction_phrases = {
        "<": "is less than",
        ">": "is greater than",
        "!=": "differs from",
    }
    parameter_context_options = [
        {"value": parameter_description, "label": parameter_description},
        {"value": f"the sample {sample_description}", "label": f"the sample {sample_description}"},
        {
            "value": (
                f"the null difference in proportions is 0"
                if test_type == "ht_prop_z_2samp"
                else f"the null proportion is {null_value:g}"
                if parameter_symbol == "p"
                else f"the null difference in means is 0"
                if test_type == "ht_mean_t_2samp"
                else f"the null mean is {null_value:g}"
            ),
            "label": (
                f"the null difference in proportions is 0"
                if test_type == "ht_prop_z_2samp"
                else f"the null proportion is {null_value:g}"
                if parameter_symbol == "p"
                else f"the null difference in means is 0"
                if test_type == "ht_mean_t_2samp"
                else f"the null mean is {null_value:g}"
            ),
        },
        {"value": "the probability that the null hypothesis is true", "label": "the probability that the null hypothesis is true"},
    ]
    parameter_feedback = {
        sample_statistic_symbol: (
            f"{sample_statistic_symbol} is a sample statistic. Choose the population parameter "
            f"{parameter_symbol} instead."
        ),
        "p̂": "p̂ is a sample proportion, not the population proportion p.",
        "p̂₁ - p̂₂": "p̂₁ - p̂₂ is a sample statistic. Choose the population difference p₁ - p₂.",
        "x̄": "x̄ is a sample mean, not the population mean μ.",
        "x̄₁ - x̄₂": "x̄₁ - x̄₂ is a sample statistic. Choose the population difference μ₁ - μ₂."
    }
    steps = [
        {
            "step_num": 1,
            "label": "Parameter Definition:",
            "input_type": "parameter_definition",
            "components": [
                {
                    "id": "parameter-symbol",
                    "type": "select",
                    "options": symbol_options,
                    "expected": [parameter_symbol],
                    "feedback_by_value": parameter_feedback
                },
                {
                    "id": "parameter-context",
                    "type": "select",
                    "options": parameter_definition_options,
                    "expected": [parameter_definition_options[0]["value"]]
                }
            ],
            "hint": "Choose a population parameter symbol, then identify the true population quantity it describes."
        },
        {
            "step_num": 2,
            "label": "Construct Both Hypotheses:",
            "input_type": "hypotheses",
            "components": [
                {
                    "id": "h0-symbol",
                    "type": "select",
                    "options": symbol_options,
                    "expected": [parameter_symbol],
                    "feedback_by_value": parameter_feedback
                },
                {
                    "id": "ha-symbol",
                    "type": "select",
                    "options": symbol_options,
                    "expected": [parameter_symbol],
                    "feedback_by_value": parameter_feedback
                },
                {
                    "id": "ha-direction",
                    "type": "select",
                    "options": direction_options,
                    "expected": [alternative]
                },
                {
                    "id": "h0-value",
                    "type": "number",
                    "placeholder": "null value",
                    "expected": [null_value],
                    "tolerance": 0.00001
                },
                {
                    "id": "ha-value",
                    "type": "number",
                    "placeholder": "null value",
                    "expected": [null_value],
                    "tolerance": 0.00001
                }
            ],
            "rows": [
                {"label": "H₀:", "symbol": "h0-symbol", "operator": "=", "value": "h0-value"},
                {"label": "Hₐ:", "symbol": "ha-symbol", "operator_component": "ha-direction", "value": "ha-value"}
            ],
            "hint": f"The null hypothesis uses equality. Use the same population parameter in both rows: \\({null_hypothesis}\\) and \\({alternative_hypothesis}\\)."
        },
        {
            "step_num": 3,
            "label": "Sample Statistic & Standard Error:",
            "input_type": "statistic_se",
            "components": [
                {
                    "id": "sample-statistic-symbol",
                    "type": "select",
                    "options": [
                        {"value": sample_statistic_symbol, "label": sample_statistic_symbol},
                        {"value": parameter_symbol, "label": parameter_symbol},
                    ],
                    "expected": [sample_statistic_symbol],
                },
                {
                    "id": "sample-statistic-value",
                    "type": "number",
                    "placeholder": "sample statistic",
                    "expected": [sample_statistic_value],
                    "tolerance": 0.01,
                },
                {
                    "id": "standard-error",
                    "type": "number",
                    "placeholder": "SE",
                    "expected": [standard_error],
                    "tolerance": 0.005,
                },
            ],
            "hint": f"Identify the observed sample statistic and calculate its standard error. Use \\({test_statistic_formula}\\) for the later standardized statistic.",
        },
        {
            "step_num": 4,
            "label": f"Standardized Test Statistic {test_statistic_label}:",
            "placeholder": "e.g. 1.42",
            "expected": [round(test_statistic, 4), round(test_statistic, 3), round(test_statistic, 2)],
            "tolerance": 0.05,
            "hint": f"Use \\({test_statistic_formula}\\), subtracting the null value and dividing by the standard error.",
        },
        {
            "step_num": 5,
            "label": "P-Value & Interpretation:",
            "input_type": "cloze",
            "components": [
                {
                    "id": "stage-pval",
                    "type": "number",
                    "placeholder": "P-value",
                    "expected": [p_value],
                    "tolerance": 0.005,
                },
                {
                    "id": "null-assumption",
                    "type": "select",
                    "options": [
                        {"value": "H0 is true", "label": "H₀ is true"},
                        {"value": "H0 is false", "label": "H₀ is false"},
                    ],
                    "expected": ["H0 is true"],
                },
            ],
            "parts": [
                "Assuming that ",
                {"component": "null-assumption"},
                ", the probability of obtaining a sample result as extreme or more extreme than observed purely by chance is approximately ",
                {"component": "stage-pval"},
                ".",
            ],
            "hint": f"Calculate the tail area under the null distribution: {p_value_derivation}",
        },
        {
            "step_num": 6,
            "label": "Statistical Decision & Contextual Conclusion:",
            "input_type": "cloze",
            "components": [
                {
                    "id": "decision-p-value",
                    "type": "number",
                    "placeholder": "P-value",
                    "expected": [p_value],
                    "tolerance": 0.005,
                },
                {
                    "id": "decision-alpha",
                    "type": "number",
                    "placeholder": "α",
                    "expected": [alpha],
                    "tolerance": 0.00001,
                },
                {
                    "id": "p-val-op",
                    "type": "select",
                    "options": [{"value": "≤", "label": "≤"}, {"value": ">", "label": ">"}],
                    "expected": [comparison_operator],
                },
                {
                    "id": "conclusion-decision",
                    "type": "select",
                    "options": decision_options,
                    "expected": [decision],
                },
                {
                    "id": "conclusion-evidence",
                    "type": "select",
                    "options": evidence_options,
                    "expected": ["is convincing" if convincing else "is not convincing"],
                },
                {
                    "id": "param-context",
                    "type": "select",
                    "options": parameter_context_options,
                    "expected": [parameter_description],
                },
                {
                    "id": "direction-phrase",
                    "type": "select",
                    "options": [
                        {"value": phrase, "label": phrase}
                        for phrase in direction_phrases.values()
                    ],
                    "expected": [direction_phrases[alternative]],
                },
                {
                    "id": "claim-val",
                    "type": "number",
                    "placeholder": "claimed value",
                    "expected": [null_value],
                    "tolerance": 0.00001,
                },
            ],
            "parts": [
                "Because the P-value (",
                {"component": "decision-p-value"},
                ") is ",
                {"component": "p-val-op"},
                " α = ",
                {"component": "decision-alpha"},
                ", we ",
                {"component": "conclusion-decision"},
                ". There ",
                {"component": "conclusion-evidence"},
                " statistical evidence that ",
                {"component": "param-context"},
                " ",
                {"component": "direction-phrase"},
                " ",
                {"component": "claim-val"},
                ".",
            ],
            "hint": f"Compare the computed P-value with \\(\\alpha={formatted_alpha}\\), then state the decision and conclusion in context.",
        },
    ]
    solution = (
        "<p><strong>Step 1: Define the parameter in context</strong></p>"
        f"<p>Let {parameter_symbol} represent {parameter_definition_options[0]['value'].lower()}.</p>"
        "<p><strong>Step 2: Construct both hypotheses</strong></p>"
        f"$$H_0: {null_hypothesis},\\qquad H_a: {alternative_hypothesis}$$"
        "<p><strong>Step 3: Identify the sample statistic and standard error</strong></p>"
        f"$$\\text{{Sample statistic}}={sample_statistic_value:.5f},"
        f"\\qquad SE={standard_error:.5f}$$"
        "<p><strong>Step 4: Calculate the standardized test statistic</strong></p>"
        f"{statistic_derivation}"
        "<p><strong>Step 5: Find and interpret the p-value under the null model</strong></p>"
        f"{p_value_derivation}<p>Therefore, $$p\\text{{-value}}={formatted_p_value}$$</p>"
        f"<p>Assuming \\(H_0\\) is true, the probability of obtaining a sample result as extreme "
        f"or more extreme than observed purely by chance is approximately \\({formatted_p_value}\\).</p>"
        "<p><strong>Step 6: Make the statistical decision and conclude in context</strong></p>"
        f"$$ {formatted_p_value} {comparison_operator} {formatted_alpha}"
        f"\\quad\\Longrightarrow\\quad \\text{{{decision}}}$$"
        f"<p>Because the P-value (\\({formatted_p_value}\\)) is "
        f"{comparison_operator} \\(\\alpha={formatted_alpha}\\), we "
        f"{'reject' if convincing else 'fail to reject'} \\(H_0\\). There "
        f"{'is convincing' if convincing else 'is not convincing'} statistical evidence "
        f"that {parameter_description} {direction_phrases[alternative]} "
        f"\\({null_value:g}\\).</p>"
    )
    return steps, solution


def _test_result(
    *,
    test_type: str,
    title: str,
    prompt: str,
    parameter_description: str,
    sample_description: str,
    null_value: float,
    alternative: str,
    alternative_statement: str,
    null_hypothesis: str,
    alternative_hypothesis: str,
    statistic_name: str,
    statistic: float,
    sample_statistic_value: float,
    standard_error: float,
    degrees_freedom: Optional[int],
    statistic_formula: str,
    statistic_derivation: str,
    p_value: float,
    p_value_derivation: str,
    alpha: float,
    decision: str,
) -> Dict[str, Any]:
    parameter_symbols = {
        "ht_prop_z": ("p", "p̂"),
        "ht_mean_t": ("μ", "x̄"),
        "ht_mean_t_2samp": ("μ₁ - μ₂", "x̄₁ - x̄₂"),
        "ht_prop_z_2samp": ("p₁ - p₂", "p̂₁ - p̂₂"),
        "ht_matched_pairs_t": ("μ_diff", "x̄_diff"),
    }
    parameter_symbol, sample_statistic_symbol = parameter_symbols[test_type]
    expected_pval_op = "≤" if p_value <= alpha else ">"
    _, parameter_definition_options = _parameter_definition_options(
        test_type,
        parameter_description,
        sample_description,
        null_value,
    )
    steps, solution = _build_inference_pipeline(
        test_type=test_type,
        parameter_description=parameter_description,
        sample_description=sample_description,
        parameter_symbol=parameter_symbol,
        sample_statistic_symbol=sample_statistic_symbol,
        parameter_definition_options=parameter_definition_options,
        null_value=null_value,
        alternative=alternative,
        alternative_statement=alternative_statement,
        null_hypothesis=null_hypothesis,
        alternative_hypothesis=alternative_hypothesis,
        test_statistic_label=statistic_name,
        test_statistic=statistic,
        sample_statistic_value=sample_statistic_value,
        standard_error=standard_error,
        degrees_freedom=degrees_freedom,
        test_statistic_formula=statistic_formula,
        statistic_derivation=statistic_derivation,
        p_value=p_value,
        p_value_derivation=p_value_derivation,
        alpha=alpha,
        decision=decision,
    )
    return {
        "type": test_type,
        "title": title,
        "prompt": prompt,
        "steps": steps,
        "solution": solution,
        "metadata": {
            "parameter_description": parameter_description,
            "null_value": null_value,
            "alternative": alternative,
            "test_statistic": statistic,
            "p_value": p_value,
            "alpha": alpha,
            "decision": decision,
            "expected_pval": p_value,
            "expected_alpha": alpha,
            "expected_pval_op": expected_pval_op,
            "expected_decision": decision,
            "expected_evidence": "is convincing" if decision == "Reject H0" else "is not convincing",
            "expected_param": parameter_description,
            "expected_dir": {
                "<": "is less than",
                ">": "is greater than",
                "!=": "differs from",
            }[alternative],
            "expected_claim": null_value,
            "sample_statistic": sample_statistic_value,
            "standard_error": standard_error,
        },
    }


def generate_one_sample_prop_z_test() -> Dict[str, Any]:
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
    x = random.randint(0, n)
    phat = x / n
    se0 = math.sqrt(p0 * (1 - p0) / n)
    z_stat = (phat - p0) / se0
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    p_value = _tail_probability(z_stat, alternative)
    decision = _decision(p_value, alpha)
    direction = {"<": "less than", ">": "greater than", "!=": "different from"}[alternative]
    symbol = _alternative_symbol(alternative)
    return _test_result(
        test_type="ht_prop_z",
        title="1-Sample z-Test for Proportion",
        prompt=(
            f"{claimant} claims the proportion of {context_noun} is \\(p={p0:g}\\). "
            f"In a random sample of \\(n={n}\\) {sample_unit}, \\(x={x}\\) {sample_success}. "
            f"Test whether the true proportion of {context_noun} is {direction} {p0:g} "
            f"at \\(\\alpha={alpha:g}\\)."
        ),
        parameter_description=f"the true population proportion of {context_noun}",
        sample_description=f"proportion of the {n} {sample_unit} in this study",
        null_value=p0,
        alternative=alternative,
        alternative_statement=f"the true proportion of {context_noun} is {direction} {p0:g}",
        null_hypothesis=f"p={p0:g}",
        alternative_hypothesis=f"p {symbol} {p0:g}",
        statistic_name="z",
        statistic=z_stat,
        sample_statistic_value=phat,
        standard_error=se0,
        degrees_freedom=None,
        statistic_formula=r"z=\frac{\hat{p}-p_0}{SE_0}",
        statistic_derivation=(
            f"$$\\hat{{p}}=\\frac{{x}}{{n}}=\\frac{{{x}}}{{{n}}}={phat:.4f},"
            f"\\quad SE_0=\\sqrt{{\\frac{{p_0(1-p_0)}}{{n}}}}"
            f"=\\sqrt{{\\frac{{{p0:g}(1-{p0:g})}}{{{n}}}}}={se0:.5f}$$"
            f"$$z=\\frac{{\\hat{{p}}-p_0}}{{SE_0}}"
            f"=\\frac{{{phat:.4f}-{p0:g}}}{{{se0:.5f}}}=\\mathbf{{{z_stat:.4f}}}$$"
        ),
        p_value=p_value,
        p_value_derivation=_normal_tail_formula(z_stat, alternative),
        alpha=alpha,
        decision=decision,
    )


def _normal_tail_formula(statistic: float, alternative: str) -> str:
    if alternative == "<":
        return f"$$p\\text{{-value}}=P(Z\\leq {statistic:.4f})$$"
    if alternative == ">":
        return f"$$p\\text{{-value}}=P(Z\\geq {statistic:.4f})$$"
    return f"$$p\\text{{-value}}=2P(Z\\geq |{statistic:.4f}|)$$"


def _t_tail_formula(statistic: float, df: int, alternative: str) -> str:
    if alternative == "<":
        return f"$$p\\text{{-value}}=P(T_{{{df}}}\\leq {statistic:.4f})$$"
    if alternative == ">":
        return f"$$p\\text{{-value}}=P(T_{{{df}}}\\geq {statistic:.4f})$$"
    return f"$$p\\text{{-value}}=2P(T_{{{df}}}\\geq |{statistic:.4f}|)$$"


def generate_one_sample_mean_t_test() -> Dict[str, Any]:
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
    s = round(random.uniform(4.0, 15.0), 1)
    se = s / math.sqrt(n)
    xbar = round(mu0 + random.uniform(-3.0, 3.0) * se, 1)
    t_stat = (xbar - mu0) / se
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    p_value = _tail_probability(t_stat, alternative, df)
    decision = _decision(p_value, alpha)
    direction = {"<": "less than", ">": "greater than", "!=": "different from"}[alternative]
    symbol = _alternative_symbol(alternative)
    return _test_result(
        test_type="ht_mean_t",
        title="1-Sample t-Test for Mean",
        prompt=(
            f"{claimant} claims the average {context_noun} is \\(\\mu={mu0:g}\\). "
            f"A random sample of \\(n={n}\\) has \\(\\bar{{x}}={xbar}\\) {units} "
            f"and \\(s={s}\\) {units}. Test whether the true mean {context_noun} is "
            f"{direction} {mu0:g} {units} at \\(\\alpha={alpha:g}\\)."
        ),
        parameter_description=f"the true population mean {context_noun}",
        sample_description=f"mean of the {n} observations in this study",
        null_value=mu0,
        alternative=alternative,
        alternative_statement=f"the true mean {context_noun} is {direction} {mu0:g} {units}",
        null_hypothesis=f"\\mu={mu0:g}",
        alternative_hypothesis=f"\\mu {symbol} {mu0:g}",
        statistic_name="t",
        statistic=t_stat,
        sample_statistic_value=xbar,
        standard_error=se,
        degrees_freedom=df,
        statistic_formula=r"t=\frac{\bar{x}-\mu_0}{SE}",
        statistic_derivation=(
            f"$$SE=\\frac{{s}}{{\\sqrt{{n}}}}=\\frac{{{s}}}{{\\sqrt{{{n}}}}}={se:.4f}$$"
            f"$$t=\\frac{{\\bar{{x}}-\\mu_0}}{{SE}}"
            f"=\\frac{{{xbar}-{mu0:g}}}{{{se:.4f}}}=\\mathbf{{{t_stat:.4f}}},"
            f"\\quad df=n-1={df}$$"
        ),
        p_value=p_value,
        p_value_derivation=_t_tail_formula(t_stat, df, alternative),
        alpha=alpha,
        decision=decision,
    )


def generate_two_sample_mean_t_test() -> Dict[str, Any]:
    scenarios = [
        ("battery life", "Brand A batteries", "Brand B batteries", "hours", (8.0, 24.0), (1.5, 5.0)),
        ("test scores", "students taught with Method A", "students taught with Method B", "points", (60.0, 85.0), (5.0, 15.0)),
        ("crop yield", "crops treated with Fertilizer A", "crops treated with Fertilizer B", "kilograms per acre", (10.0, 35.0), (2.0, 8.0))
    ]
    context_noun, group1, group2, units, mean_range, deviation_range = random.choice(scenarios)
    n1 = random.choice([16, 20, 25, 30, 36])
    n2 = random.choice([16, 20, 25, 30, 36])
    df = min(n1 - 1, n2 - 1)
    s1 = round(random.uniform(*deviation_range), 1)
    s2 = round(random.uniform(*deviation_range), 1)
    se = math.sqrt(s1**2 / n1 + s2**2 / n2)
    xbar2 = round(random.uniform(*mean_range), 1)
    xbar1 = round(xbar2 + random.uniform(-2.0, 2.0) * se, 1)
    difference = xbar1 - xbar2
    t_stat = difference / se
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    p_value = _cdf_tail_probability(t_stat, alternative, df)
    decision = _decision(p_value, alpha)
    direction = {"<": "less than", ">": "greater than", "!=": "different from"}[alternative]
    symbol = _alternative_symbol(alternative)
    return _test_result(
        test_type="ht_mean_t_2samp",
        title="2-Sample t-Test for Means",
        prompt=(
            f"Compare mean {context_noun} for {group1} and {group2}. The null claim is "
            f"\\(H_0:\\mu_1-\\mu_2=0\\). Independent samples have "
            f"\\(n_1={n1},\\bar{{x}}_1={xbar1},s_1={s1}\\) and "
            f"\\(n_2={n2},\\bar{{x}}_2={xbar2},s_2={s2}\\), in {units}. "
            f"Test whether the mean for Group 1 is {direction} the mean for Group 2 "
            f"at \\(\\alpha={alpha:g}\\)."
        ),
        parameter_description=f"the true difference in mean {context_noun} between {group1} and {group2}",
        sample_description=f"difference between the sample means from {n1} and {n2} observations in this study",
        null_value=0,
        alternative=alternative,
        alternative_statement=f"the true mean {context_noun} for {group1} is {direction} that for {group2}",
        null_hypothesis="\\mu_1-\\mu_2=0",
        alternative_hypothesis=f"\\mu_1-\\mu_2 {symbol} 0",
        statistic_name="t",
        statistic=t_stat,
        sample_statistic_value=difference,
        standard_error=se,
        degrees_freedom=df,
        statistic_formula=r"t=\frac{\bar{x}_1-\bar{x}_2}{SE}",
        statistic_derivation=(
            f"$$SE=\\sqrt{{\\frac{{s_1^2}}{{n_1}}+\\frac{{s_2^2}}{{n_2}}}}"
            f"=\\sqrt{{\\frac{{{s1}^2}}{{{n1}}}+\\frac{{{s2}^2}}{{{n2}}}}}={se:.4f}$$"
            f"$$t=\\frac{{\\bar{{x}}_1-\\bar{{x}}_2}}{{SE}}"
            f"=\\frac{{{xbar1}-{xbar2}}}{{{se:.4f}}}=\\mathbf{{{t_stat:.4f}}},"
            f"\\quad df=\\min(n_1-1,n_2-1)={df}$$"
        ),
        p_value=p_value,
        p_value_derivation=_t_tail_formula(t_stat, df, alternative),
        alpha=alpha,
        decision=decision,
    )


def generate_two_sample_prop_z_test() -> Dict[str, Any]:
    scenarios = [
        ("clinical trial", "patients receiving a drug", "patients receiving a placebo", "are cured"),
        ("customer survey", "customers at Store A", "customers at Store B", "report being satisfied"),
        ("voter poll", "voters in Region A", "voters in Region B", "approve of the proposal")
    ]
    context_noun, group1, group2, success_phrase = random.choice(scenarios)
    n1 = random.choice([100, 150, 200, 250, 300])
    n2 = random.choice([100, 150, 200, 250, 300])
    x1 = random.randint(int(0.15 * n1), int(0.85 * n1))
    x2 = random.randint(int(0.15 * n2), int(0.85 * n2))
    p1_hat, p2_hat = x1 / n1, x2 / n2
    pooled = (x1 + x2) / (n1 + n2)
    se = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    z_stat = (p1_hat - p2_hat) / se
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    p_value = _cdf_tail_probability(z_stat, alternative)
    decision = _decision(p_value, alpha)
    direction = {"<": "less than", ">": "greater than", "!=": "different from"}[alternative]
    symbol = _alternative_symbol(alternative)
    return _test_result(
        test_type="ht_prop_z_2samp",
        title="2-Sample z-Test for Proportions",
        prompt=(
            f"A {context_noun} compares the proportion of {group1} and {group2} who {success_phrase}. "
            f"The null claim is \\(H_0:p_1-p_2=0\\). Independent samples have "
            f"\\(x_1={x1}\\) of \\(n_1={n1}\\) and \\(x_2={x2}\\) of \\(n_2={n2}\\). "
            f"Test whether the Group 1 proportion is {direction} the Group 2 proportion "
            f"at \\(\\alpha={alpha:g}\\)."
        ),
        parameter_description=f"the true difference in the proportions of {group1} and {group2} who {success_phrase}",
        sample_description=f"difference between the sample proportions from {n1} and {n2} observations in this study",
        null_value=0,
        alternative=alternative,
        alternative_statement=f"the true proportion of {group1} who {success_phrase} is {direction} that of {group2}",
        null_hypothesis="p_1-p_2=0",
        alternative_hypothesis=f"p_1-p_2 {symbol} 0",
        statistic_name="z",
        statistic=z_stat,
        sample_statistic_value=p1_hat - p2_hat,
        standard_error=se,
        degrees_freedom=None,
        statistic_formula=r"z=\frac{\hat{p}_1-\hat{p}_2}{SE_0}",
        statistic_derivation=(
            f"$$\\hat{{p}}_1=\\frac{{{x1}}}{{{n1}}}={p1_hat:.4f},"
            f"\\quad \\hat{{p}}_2=\\frac{{{x2}}}{{{n2}}}={p2_hat:.4f}$$"
            f"$$p_c=\\frac{{x_1+x_2}}{{n_1+n_2}}"
            f"=\\frac{{{x1}+{x2}}}{{{n1}+{n2}}}={pooled:.5f}$$"
            f"$$SE_0=\\sqrt{{p_c(1-p_c)(\\frac{{1}}{{n_1}}+\\frac{{1}}{{n_2}})}}"
            f"=\\sqrt{{{pooled:.5f}(1-{pooled:.5f})"
            f"(\\frac{{1}}{{{n1}}}+\\frac{{1}}{{{n2}}})}}={se:.5f}$$"
            f"$$z=\\frac{{\\hat{{p}}_1-\\hat{{p}}_2}}{{SE_0}}"
            f"=\\frac{{{p1_hat:.4f}-{p2_hat:.4f}}}{{{se:.5f}}}=\\mathbf{{{z_stat:.4f}}}$$"
        ),
        p_value=p_value,
        p_value_derivation=_normal_tail_formula(z_stat, alternative),
        alpha=alpha,
        decision=decision,
    )


def generate_matched_pairs_t_test() -> Dict[str, Any]:
    scenarios = [
        ("test scores", "pre-test", "post-test", "points"),
        ("tire tread depth", "before rotation", "after rotation", "millimeters"),
        ("reaction time", "before caffeine", "after caffeine", "milliseconds")
    ]
    context_noun, before_label, after_label, units = random.choice(scenarios)
    n = random.choice([12, 15, 18, 20, 25])
    df = n - 1
    s_d = round(random.uniform(2.0, 10.0), 1)
    se = s_d / math.sqrt(n)
    d_bar = round(random.uniform(-2.0, 2.0) * se, 1)
    t_stat = d_bar / se
    alternative = random.choice(ALTERNATIVES)
    alpha = random.choice(ALPHA_LEVELS)
    p_value = _cdf_tail_probability(t_stat, alternative, df)
    decision = _decision(p_value, alpha)
    direction = {"<": "less than", ">": "greater than", "!=": "different from"}[alternative]
    symbol = _alternative_symbol(alternative)
    return _test_result(
        test_type="ht_matched_pairs_t",
        title="Matched Pairs t-Test",
        prompt=(
            f"Measure {context_noun} on the same subjects {before_label} and {after_label}; "
            f"define each difference as after minus before. The null claim is "
            f"\\(H_0:\\mu_{{\\text{{diff}}}}=0\\). For \\(n={n}\\) pairs, "
            f"\\(\\bar{{x}}_{{\\text{{diff}}}}={d_bar}\\) and \\(s_d={s_d}\\) {units}. "
            f"Test whether the mean paired difference is {direction} zero at "
            f"\\(\\alpha={alpha:g}\\)."
        ),
        parameter_description=f"the true mean paired difference in {context_noun} (after minus before)",
        sample_description=f"mean difference from the {n} matched pairs in this study",
        null_value=0,
        alternative=alternative,
        alternative_statement=f"the true mean paired difference in {context_noun} (after minus before) is {direction} zero",
        null_hypothesis="\\mu_{\\text{diff}}=0",
        alternative_hypothesis=f"\\mu_{{\\text{{diff}}}} {symbol} 0",
        statistic_name="t",
        statistic=t_stat,
        sample_statistic_value=d_bar,
        standard_error=se,
        degrees_freedom=df,
        statistic_formula=r"t=\frac{\bar{x}_{\text{diff}}}{SE}",
        statistic_derivation=(
            f"$$SE=\\frac{{s_d}}{{\\sqrt{{n}}}}=\\frac{{{s_d}}}{{\\sqrt{{{n}}}}}={se:.4f}$$"
            f"$$t=\\frac{{\\bar{{x}}_{{\\text{{diff}}}}}}{{SE}}"
            f"=\\frac{{{d_bar}}}{{{se:.4f}}}=\\mathbf{{{t_stat:.4f}}},"
            f"\\quad df=n-1={df}$$"
        ),
        p_value=p_value,
        p_value_derivation=_t_tail_formula(t_stat, df, alternative),
        alpha=alpha,
        decision=decision,
    )


def generate_ht_problem(topic: str) -> Dict[str, Any]:
    generators = {
        "ht_prop_z": generate_one_sample_prop_z_test,
        "ht_mean_t": generate_one_sample_mean_t_test,
        "ht_mean_t_2samp": generate_two_sample_mean_t_test,
        "ht_prop_z_2samp": generate_two_sample_prop_z_test,
        "ht_matched_pairs_t": generate_matched_pairs_t_test
    }
    generator = (
        random.choice(list(generators.values()))
        if topic == "random_ht"
        else generators.get(topic, generate_one_sample_prop_z_test)
    )
    return generator()
