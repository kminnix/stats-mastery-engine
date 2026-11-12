import math
import random
from typing import Any, Dict, List, Sequence, Tuple

from scipy.stats import t


def _sample_statistics(
    x_values: Sequence[float],
    y_values: Sequence[float],
) -> Tuple[float, float, float, float, float]:
    count = len(x_values)
    x_mean = sum(x_values) / count
    y_mean = sum(y_values) / count
    x_ss = sum((value - x_mean) ** 2 for value in x_values)
    y_ss = sum((value - y_mean) ** 2 for value in y_values)
    cross_product = sum(
        (x_value - x_mean) * (y_value - y_mean)
        for x_value, y_value in zip(x_values, y_values)
    )
    x_sd = math.sqrt(x_ss / (count - 1))
    y_sd = math.sqrt(y_ss / (count - 1))
    correlation = cross_product / math.sqrt(x_ss * y_ss)
    return x_mean, x_sd, y_mean, y_sd, correlation


def _solution_paragraphs(*paragraphs: str) -> str:
    return "".join(f"<p>{paragraph}</p>" for paragraph in paragraphs)


def generate_lsrl_equation_problem(notation_style: str = "ab") -> Dict[str, Any]:
    if notation_style not in {"ab", "b0b1"}:
        raise ValueError(f"Unknown LSRL notation style: {notation_style}")
    scenarios = [
        ("study time (hours)", "exam score (points)", 1),
        ("car weight (1000 lb)", "fuel economy (mpg)", -1),
        ("temperature (°C)", "ice cream sales (hundreds of dollars)", 1),
        ("experience (years)", "salary (thousands of dollars)", 1),
    ]
    x_name, y_name, direction = random.choice(scenarios)
    x_variable = x_name.split(" (")[0]
    y_variable = y_name.split(" (")[0]
    x_mean = round(random.uniform(4.0, 20.0), 2)
    x_sd = round(random.uniform(1.0, 5.0), 2)
    y_mean = round(random.uniform(30.0, 100.0), 2)
    y_sd = round(random.uniform(5.0, 25.0), 2)
    correlation = round(direction * random.uniform(0.5, 0.94), 3)
    slope = correlation * y_sd / x_sd
    intercept = y_mean - slope * x_mean
    intercept_symbol, slope_symbol = ("a", "b") if notation_style == "ab" else ("b_0", "b_1")
    intercept_placeholder, slope_placeholder = ("a", "b") if notation_style == "ab" else ("b₀", "b₁")
    operator = "+" if slope >= 0 else "-"
    magnitude = abs(slope)
    prompt = (
        f"A study examines the relationship between {x_name} (x) and {y_name} (y). "
        f"Summary statistics are \\(\\bar{{x}}={x_mean:.2f}\\), "
        f"\\(s_x={x_sd:.2f}\\), \\(\\bar{{y}}={y_mean:.2f}\\), "
        f"\\(s_y={y_sd:.2f}\\), and \\(r={correlation:.3f}\\). Here, "
        f"find the least-squares regression equation for predicting {y_name} "
        f"from {x_name}, in the form "
        f"\\(\\widehat{{\\text{{{y_variable}}}}}={intercept_symbol}+{slope_symbol}"
        f"(\\text{{{x_variable}}})\\)."
    )
    equation_step = {
        "step_num": 3,
        "label": "Form the Least-Squares Regression Equation:",
        "input_type": "cloze",
        "components": [
            {
                "id": "lsrl-intercept",
                "type": "number",
                "placeholder": intercept_placeholder,
                "expected": [intercept],
                "tolerance": 0.05,
            },
            {
                "id": "lsrl-slope-sign",
                "type": "select",
                "options": [
                    {"value": "+", "label": "+"},
                    {"value": "-", "label": "−"},
                ],
                "expected": [operator],
            },
            {
                "id": "lsrl-slope-magnitude",
                "type": "number",
                "placeholder": f"|{slope_placeholder}|",
                "expected": [magnitude],
                "tolerance": 0.01,
            },
        ],
        "parts": [
            rf"\(\widehat{{\text{{{y_variable}}}}}={intercept_symbol}+{slope_symbol}"
            rf"(\text{{{x_variable}}})=\)",
            {"component": "lsrl-intercept"},
            " ",
            {"component": "lsrl-slope-sign"},
            " ",
            {"component": "lsrl-slope-magnitude"},
            rf"\((\text{{{x_variable}}})\)",
        ],
        "hint": rf"Write \(\widehat{{\text{{{y_variable}}}}}={intercept_symbol}+{slope_symbol}(\text{{{x_variable}}})\), using the slope's sign and magnitude.",
    }
    return {
        "type": "reg_lsrl",
        "title": "Least-Squares Regression Line (LSRL)",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": f"Slope ({slope_placeholder}):",
                "input_type": "number",
                "placeholder": slope_placeholder,
                "expected": [slope],
                "tolerance": 0.01,
                "hint": rf"Use \({slope_symbol}=r\left(\frac{{s_y}}{{s_x}}\right)\), keeping the sign of \(r\).",
            },
            {
                "step_num": 2,
                "label": f"y-Intercept ({intercept_placeholder}):",
                "input_type": "number",
                "placeholder": intercept_placeholder,
                "expected": [intercept],
                "tolerance": 0.05,
                "hint": rf"Use \({intercept_symbol}=\bar{{y}}-{slope_symbol}\bar{{x}}\) with the slope from Step 1.",
            },
            equation_step,
        ],
        "solution": _solution_paragraphs(
            rf"Slope \({slope_symbol}\): \({slope_symbol}=r\frac{{s_y}}{{s_x}}=({correlation:.3f})"
            rf"\frac{{{y_sd:.2f}}}{{{x_sd:.2f}}}={slope:.4f}\).",
            rf"Intercept \({intercept_symbol}\): \({intercept_symbol}=\bar{{y}}-{slope_symbol}\bar{{x}}={y_mean:.2f}"
            rf"-({slope:.4f})({x_mean:.2f})={intercept:.4f}\).",
            rf"Regression equation: \(\widehat{{\text{{{y_variable}}}}}={intercept_symbol}+{slope_symbol}"
            rf"(\text{{{x_variable}}})={intercept:.4f}"
            rf"{'+' if slope >= 0 else '-'}{magnitude:.4f}"
            rf"(\text{{{x_variable}}})\).",
        ),
    }


def generate_prediction_residual_problem(notation_style: str = "ab") -> Dict[str, Any]:
    intercept_symbol, slope_symbol = _notation_symbols(notation_style)
    scenarios = [
        ("study time (hours)", "exam score (points)", 1),
        ("car weight (1000 lb)", "fuel economy (mpg)", -1),
        ("temperature (°C)", "ice cream sales (hundreds of dollars)", 1),
        ("experience (years)", "salary (thousands of dollars)", 1),
    ]
    x_name, y_name, direction = random.choice(scenarios)
    x_variable = x_name.split(" (")[0]
    y_variable = y_name.split(" (")[0]
    slope = round(direction * random.uniform(1.2, 5.0), 2)
    intercept = round(random.uniform(15.0, 60.0), 2)
    x_observed = random.randint(3, 18)
    y_hat_observed = intercept + slope * x_observed
    residual = round(random.choice([-1, 1]) * random.uniform(2.0, 9.0), 2)
    y_observed = round(y_hat_observed + residual, 2)
    residual = round(y_observed - y_hat_observed, 2)
    direction_answer = "overestimated" if residual < 0 else "underestimated"
    prompt = (
        f"The least-squares regression line for predicting {y_name} from {x_name} is "
        f"\\(\\widehat{{\\text{{{y_variable}}}}}={intercept_symbol}+{slope_symbol}"
        f"(\\text{{{x_variable}}})={intercept:.2f}"
        f"{'+' if slope >= 0 else '-'}{abs(slope):.2f}"
        f"(\\text{{{x_variable}}})\\). For the observed pair "
        f"\\((x_{{obs}}, y_{{obs}})=({x_observed}, {y_observed:.2f})\\), "
        "calculate the predicted response and residual, then determine whether "
        "the model overestimated or underestimated the actual value."
    )
    return {
        "type": "reg_pred_res",
        "title": "Predictions & Residual Analysis",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": f"Predicted {y_name} at x = {x_observed}:",
                "input_type": "number",
                "placeholder": "ŷ",
                "expected": [y_hat_observed],
                "tolerance": 0.05,
                "hint": rf"Substitute \(x_{{obs}}={x_observed}\) into the given regression equation.",
            },
            {
                "step_num": 2,
                "label": "Residual for the Observed Point:",
                "input_type": "number",
                "placeholder": "e = y − ŷ",
                "expected": [residual],
                "tolerance": 0.05,
                "hint": rf"Use \(e=y_{{obs}}-\hat{{y}}_{{obs}}={y_observed:.2f}-\hat{{y}}_{{obs}}\).",
            },
            {
                "step_num": 3,
                "label": "Interpret the Residual:",
                "input_type": "cloze",
                "components": [
                    {
                        "id": "prediction-model-outcome",
                        "type": "select",
                        "options": [
                            {"value": "overestimated", "label": "overestimated"},
                            {"value": "underestimated", "label": "underestimated"},
                        ],
                        "expected": [direction_answer],
                    }
                ],
                "parts": [
                    "The model ",
                    {"component": "prediction-model-outcome"},
                    " the actual value.",
                ],
                "hint": "A negative residual means the model overestimated; a positive residual means it underestimated.",
            },
        ],
        "solution": _solution_paragraphs(
            rf"For \(x_{{obs}}={x_observed}\), \(\hat{{y}}_{{obs}}={intercept:.2f}"
            rf"{'+' if slope >= 0 else '-'}{abs(slope):.2f}({x_observed})"
            rf"={y_hat_observed:.2f}\).",
            rf"The residual is \(e=y_{{obs}}-\hat{{y}}_{{obs}}="
            rf"{y_observed:.2f}-{y_hat_observed:.2f}={residual:.2f}\), "
            f"so the model {direction_answer} the response.",
        ),
    }


def _raw_data_values() -> Tuple[List[float], List[float], float]:
    count = random.randint(5, 7)
    x_values = [float(index) for index in range(1, count + 1)]
    x_mean = sum(x_values) / count
    centered_x = [value - x_mean for value in x_values]
    norm_x = math.sqrt(sum(value**2 for value in centered_x))

    while True:
        noise = [random.uniform(-1.0, 1.0) for _ in x_values]
        noise_mean = sum(noise) / count
        centered_noise = [value - noise_mean for value in noise]
        projection = sum(
            x_value * noise_value
            for x_value, noise_value in zip(centered_x, centered_noise)
        ) / (norm_x**2)
        orthogonal_noise = [
            noise_value - projection * x_value
            for x_value, noise_value in zip(centered_noise, centered_x)
        ]
        norm_noise = math.sqrt(sum(value**2 for value in orthogonal_noise))
        if norm_noise > 1e-8:
            break

    target_r = random.uniform(0.52, 0.90)
    sign = random.choice([-1, 1])
    y_mean = random.uniform(35.0, 85.0)
    y_scale = random.uniform(5.0, 16.0)
    y_values = [
        y_mean
        + y_scale
        * (
            sign * target_r * x_component / norm_x
            + math.sqrt(1 - target_r**2) * noise_component / norm_noise
        )
        for x_component, noise_component in zip(centered_x, orthogonal_noise)
    ]
    return x_values, y_values, y_mean


def generate_raw_data_regression_problem(notation_style: str = "ab") -> Dict[str, Any]:
    intercept_symbol, slope_symbol = _notation_symbols(notation_style)
    intercept_placeholder, slope_placeholder = ("a", "b") if notation_style == "ab" else ("b₀", "b₁")
    scenarios = [
        ("weekly practice hours", "quiz score (points)"),
        ("car weight (1000 lb)", "fuel economy (mpg)"),
        ("daily temperature (°C)", "ice cream sales (hundreds of dollars)"),
        ("years of experience", "salary (thousands of dollars)"),
    ]
    x_name, y_name = random.choice(scenarios)
    x_values, y_values, _ = _raw_data_values()
    x_mean, x_sd, y_mean, y_sd, correlation = _sample_statistics(x_values, y_values)
    slope = correlation * y_sd / x_sd
    intercept = y_mean - slope * x_mean
    target_x = random.choice(x_values)
    observed_index = random.randrange(len(x_values))
    predicted_target = intercept + slope * target_x
    observed_prediction = intercept + slope * x_values[observed_index]
    residual = y_values[observed_index] - observed_prediction
    table_rows = r" \\ ".join(
        rf"{x_value:g} & {y_value:.2f}"
        for x_value, y_value in zip(x_values, y_values)
    )
    data_table = (
        rf"\[\begin{{array}}{{c|c}} {x_name} & {y_name} \\ \hline "
        rf"{table_rows} \end{{array}}\]"
    )
    steps = [
        {
            "step_num": 1,
            "label": "Correlation Coefficient (r):",
            "input_type": "number",
            "placeholder": "r",
            "expected": [correlation],
            "tolerance": 0.02,
            "hint": r"Use \(r=\frac{\sum(x-\bar{x})(y-\bar{y})}{\sqrt{\sum(x-\bar{x})^2\sum(y-\bar{y})^2}}\).",
        },
        {
            "step_num": 2,
            "label": "LSRL Slope and y-Intercept:",
            "input_type": "cloze",
            "components": [
                {
                    "id": "raw-slope",
                    "type": "number",
                    "placeholder": slope_placeholder,
                    "expected": [slope],
                    "tolerance": 0.02,
                },
                {
                    "id": "raw-intercept",
                    "type": "number",
                    "placeholder": intercept_placeholder,
                    "expected": [intercept],
                    "tolerance": 0.05,
                },
            ],
            "parts": [
                rf"\({slope_symbol}=\)",
                {"component": "raw-slope"},
                rf", \({intercept_symbol}=\)",
                {"component": "raw-intercept"},
            ],
            "hint": rf"Calculate \({slope_symbol}=r\frac{{s_y}}{{s_x}}\), then \({intercept_symbol}=\bar{{y}}-{slope_symbol}\bar{{x}}\).",
        },
        {
            "step_num": 3,
            "label": f"Prediction at x = {target_x:g}:",
            "input_type": "number",
            "placeholder": "ŷ",
            "expected": [predicted_target],
            "tolerance": 0.05,
            "hint": r"Use your regression equation and substitute the target \(x\)-value.",
        },
        {
            "step_num": 4,
            "label": f"Residual for the point ({x_values[observed_index]:g}, {y_values[observed_index]:.2f}):",
            "input_type": "number",
            "placeholder": "e = y − ŷ",
            "expected": [residual],
            "tolerance": 0.05,
            "hint": r"Calculate the fitted response at this point's \(x\), then subtract: \(e=y-\hat{y}\).",
        },
    ]
    return {
        "type": "reg_raw_data",
        "title": "Full Regression from Data",
        "prompt": (
            f"Use the data on {x_name} and {y_name} to analyze the linear relationship."
            f"<br><br>{data_table}<br><br>Find the correlation, least-squares line, "
            f"predicted {y_name} at x = {target_x:g}, and residual for the point "
            f"({x_values[observed_index]:g}, {y_values[observed_index]:.2f}). "
            rf"Use \(\hat{{y}}={intercept_symbol}+{slope_symbol}x\), where "
            rf"\({intercept_symbol}\) is the intercept and \({slope_symbol}\) is the slope."
        ),
        "steps": steps,
        "solution": _solution_paragraphs(
            rf"From the data, \(\bar{{x}}={x_mean:.3f}\), \(s_x={x_sd:.3f}\), "
            rf"\(\bar{{y}}={y_mean:.3f}\), \(s_y={y_sd:.3f}\), and \(r={correlation:.4f}\).",
            rf"The slope is \({slope_symbol}=r\frac{{s_y}}{{s_x}}={slope:.4f}\), and the "
            rf"intercept is \({intercept_symbol}=\bar{{y}}-{slope_symbol}\bar{{x}}={intercept:.4f}\).",
            rf"The fitted line is \(\hat{{y}}={intercept_symbol}+{slope_symbol}x\). At \(x={target_x:g}\), "
            rf"\(\hat{{y}}={predicted_target:.2f}\). "
            rf"For the identified point, \(e={y_values[observed_index]:.2f}"
            rf"-{observed_prediction:.2f}={residual:.2f}\).",
        ),
    }


def generate_slope_confidence_interval(notation_style: str = "ab") -> Dict[str, Any]:
    _, slope_symbol = _notation_symbols(notation_style)
    contexts = [
        ("weekly study time and exam score", "points per additional study hour"),
        ("car weight and fuel economy", "mpg per additional 1000 lb"),
        ("temperature and ice cream sales", "hundreds of dollars per °C"),
        ("work experience and salary", "thousands of dollars per additional year"),
    ]
    context, slope_units = random.choice(contexts)
    n = random.choice([15, 20, 25, 30])
    df = n - 2
    slope = round(random.choice([-1, 1]) * random.uniform(0.2, 4.0), 3)
    standard_error = round(random.uniform(0.15, 1.5), 3)
    confidence_level = random.choice([0.90, 0.95, 0.99])
    alpha = 1 - confidence_level
    critical_t = float(t.ppf(1 - alpha / 2, df))
    margin_of_error = critical_t * standard_error
    lower = slope - margin_of_error
    upper = slope + margin_of_error
    prompt = (
        f"A regression analysis studies {context}. In a sample of \\(n={n}\\), "
        f"the estimated slope is \\({slope_symbol}={slope:.3f}\\) {slope_units}, with "
        f"standard error \\(SE_{{{slope_symbol}}}={standard_error:.3f}\\). Construct a "
        f"{100 * confidence_level:g}% confidence interval for the population slope "
        "\\(\\beta_1\\)."
    )
    return {
        "type": "reg_slope_ci",
        "title": "Confidence Interval for Slope (β₁)",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": "Degrees of Freedom:",
                "input_type": "number",
                "placeholder": "df",
                "expected": [df],
                "tolerance": 0.01,
                "hint": r"For a regression slope, \(df=n-2\).",
            },
            {
                "step_num": 2,
                "label": "Critical Value (t*):",
                "input_type": "number",
                "placeholder": "t*",
                "expected": [critical_t],
                "tolerance": 0.02,
                "hint": rf"Use \(t^*=t_{{1-(1-C)/2,{df}}}\) for \(C={confidence_level:.2f}\).",
            },
            {
                "step_num": 3,
                "label": "Margin of Error:",
                "input_type": "number",
                "placeholder": "MOE",
                "expected": [margin_of_error],
                "tolerance": 0.02,
                "hint": rf"Calculate \(MOE=t^*SE_{{{slope_symbol}}}\).",
            },
            {
                "step_num": 4,
                "label": "Report the Interval Bounds (L, U):",
                "input_type": "cloze",
                "components": [
                    {
                        "id": "slope-ci-lower",
                        "type": "number",
                        "placeholder": "L",
                        "expected": [lower],
                        "tolerance": 0.02,
                    },
                    {
                        "id": "slope-ci-upper",
                        "type": "number",
                        "placeholder": "U",
                        "expected": [upper],
                        "tolerance": 0.02,
                    },
                ],
                "parts": [
                    r"\((L, U) = \left( \text{lower}, \text{upper} \right)\)",
                    "<br>",
                    "Enter the interval bounds: [",
                    {"component": "slope-ci-lower"},
                    ", ",
                    {"component": "slope-ci-upper"},
                    "]",
                ],
                "hint": rf"Calculate \(L={slope_symbol}-MOE\) and \(U={slope_symbol}+MOE\), then report \((L,U)\).",
            },
        ],
        "solution": _solution_paragraphs(
            rf"Degrees of freedom: \(df=n-2={n}-2={df}\). The critical value is "
            rf"\(t^*={critical_t:.3f}\).",
            rf"The margin of error is \(MOE=t^*SE_{{{slope_symbol}}}="
            rf"({critical_t:.3f})({standard_error:.3f})={margin_of_error:.3f}\).",
            rf"The confidence interval is \((L,U)=("
            rf"{slope:.3f}-{margin_of_error:.3f}, "
            rf"{slope:.3f}+{margin_of_error:.3f})="
            rf"({lower:.3f}, {upper:.3f})\).",
        ),
    }


def generate_slope_significance_test(notation_style: str = "ab") -> Dict[str, Any]:
    _, slope_symbol = _notation_symbols(notation_style)
    contexts = {
        ">": [
            ("work experience", "salary", "thousands of dollars per additional year"),
            ("weekly study time", "exam score", "points per additional study hour"),
        ],
        "<": [
            ("vehicle mileage", "vehicle price", "dollars per 1000 additional miles"),
            ("car weight", "fuel economy", "mpg per additional 1000 lb"),
        ],
        "!=": [
            ("temperature", "ice cream sales", "hundreds of dollars per °C"),
            ("weekly study time", "exam score", "points per additional study hour"),
        ],
    }
    direction = random.choice([">", "<", "!="])
    alternative_symbol = {"!=": r"\ne"}.get(direction, direction)
    explanatory, response, slope_units = random.choice(contexts[direction])
    context = f"{explanatory} and {response}"
    claim_by_direction = {
        ">": f"the true slope relating {explanatory} to {response} is positive",
        "<": f"the true slope relating {explanatory} to {response} is negative",
        "!=": f"the true slope relating {explanatory} to {response} differs from 0",
    }
    expected_claim = claim_by_direction[direction]
    claim_options = [
        {"value": claim, "label": claim}
        for claim in (
            claim_by_direction[">"],
            claim_by_direction["<"],
            claim_by_direction["!="],
        )
    ]
    n = random.choice([15, 20, 25, 30])
    df = n - 2
    slope = round(random.choice([-1, 1]) * random.uniform(0.2, 4.0), 3)
    standard_error = round(random.uniform(0.15, 1.5), 3)
    alpha = random.choice([0.01, 0.05, 0.10])
    test_statistic = slope / standard_error
    if direction == ">":
        p_value = float(t.sf(test_statistic, df))
    elif direction == "<":
        p_value = float(t.cdf(test_statistic, df))
    else:
        p_value = float(2 * t.sf(abs(test_statistic), df))
    reject = p_value <= alpha
    expected_pval_op = "≤" if reject else ">"
    expected_decision = "reject H₀" if reject else "fail to reject H₀"
    expected_evidence = "is convincing" if reject else "is not convincing"
    expected_assumption = "H₀ is true"
    population_size = n * 20
    prompt = (
        f"A random sample of \\(n={n}\\) observations from a population of "
        f"\\(N={population_size}\\) is used to study {context}. The residual plot "
        "shows no curved pattern, the residuals are approximately normal, and their "
        "spread is roughly constant. "
        + (
            f"Test whether increased {explanatory} leads to higher {response}"
            if direction == ">"
            else f"Test whether higher {explanatory} is associated with lower {response}"
            if direction == "<"
            else f"Test whether there is a linear relationship between {explanatory} and {response}"
        )
        + f" at \\(\\alpha={alpha:g}\\). The estimated slope is "
        f"\\({slope_symbol}={slope:.3f}\\) {slope_units}, with standard error "
        f"\\(SE_{{{slope_symbol}}}={standard_error:.3f}\\)."
    )
    step_metadata = {
        "expected_pval": p_value,
        "expected_alpha": alpha,
        "expected_pval_op": expected_pval_op,
        "expected_decision": expected_decision,
        "expected_evidence": expected_evidence,
        "expected_claim": expected_claim,
    }
    return {
        "type": "reg_slope_test",
        "title": "Significance Test for Slope (β₁)",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": "Define the Parameter:",
                "input_type": "parameter_definition",
                "components": [
                    {
                        "id": "parameter-symbol",
                        "type": "select",
                        "options": [
                            {"value": "β₁", "label": "β₁"},
                            {"value": "β", "label": "β"},
                        ],
                        "expected": ["β₁"],
                    },
                    {
                        "id": "parameter-context",
                        "type": "select",
                        "options": [
                            {
                                "value": f"The true slope of the population regression line relating {explanatory} to {response} (β₁)",
                                "label": f"The true slope of the population regression line relating {explanatory} to {response} (β₁)",
                            },
                            {
                                "value": f"The true sample slope (b₁) observed between {explanatory} and {response} in the sample",
                                "label": f"The true sample slope (b₁) observed between {explanatory} and {response} in the sample",
                            },
                            {
                                "value": f"The true mean response (μ) across all subjects in the population",
                                "label": f"The true mean response (μ) across all subjects in the population",
                            },
                            {
                                "value": f"The true y-intercept (β₀) when {explanatory} is zero",
                                "label": f"The true y-intercept (β₀) when {explanatory} is zero",
                            },
                        ],
                        "expected": [
                            f"The true slope of the population regression line relating {explanatory} to {response} (β₁)"
                        ],
                    },
                ],
                "hint": "Choose the population slope parameter, not a sample statistic or response mean.",
            },
            {
                "step_num": 2,
                "label": "Formulate the Hypotheses:",
                "input_type": "hypotheses",
                "components": [
                    {
                        "id": "slope-test-h0-symbol",
                        "type": "select",
                        "options": [
                            {"value": "β₁", "label": "β₁"},
                            {"value": "b₁", "label": "b₁"},
                            {"value": "μ", "label": "μ"},
                            {"value": "p", "label": "p"},
                        ],
                        "expected": ["β₁"],
                    },
                    {
                        "id": "slope-test-ha-symbol",
                        "type": "select",
                        "options": [
                            {"value": "β₁", "label": "β₁"},
                            {"value": "b₁", "label": "b₁"},
                            {"value": "μ", "label": "μ"},
                            {"value": "p", "label": "p"},
                        ],
                        "expected": ["β₁"],
                    },
                    {
                        "id": "slope-test-ha-direction",
                        "type": "select",
                        "options": [
                            {"value": ">", "label": ">"},
                            {"value": "<", "label": "<"},
                            {"value": "!=", "label": "≠"},
                        ],
                        "expected": [direction],
                    },
                    {
                        "id": "slope-test-h0-value",
                        "type": "number",
                        "placeholder": "0",
                        "expected": [0],
                        "tolerance": 0.00001,
                    },
                    {
                        "id": "slope-test-ha-value",
                        "type": "number",
                        "placeholder": "0",
                        "expected": [0],
                        "tolerance": 0.00001,
                    },
                ],
                "rows": [
                    {
                        "label": "H₀:",
                        "symbol": "slope-test-h0-symbol",
                        "operator": "=",
                        "value": "slope-test-h0-value",
                    },
                    {
                        "label": "Hₐ:",
                        "symbol": "slope-test-ha-symbol",
                        "operator_component": "slope-test-ha-direction",
                        "value": "slope-test-ha-value",
                    },
                ],
                "hint": rf"The null is \(H_0:\beta_1=0\); use the research direction \(H_a:\beta_1{alternative_symbol}0\).",
            },
            {
                "step_num": 3,
                "label": "Check Conditions (LINER):",
                "input_type": "regression_conditions",
                "components": [
                    {
                        "id": "slope-condition-linear",
                        "type": "select",
                        "options": [
                            {"value": "Met", "label": "Met"},
                            {"value": "Not met", "label": "Not met"},
                        ],
                        "expected": ["Met"],
                    },
                    {
                        "id": "slope-condition-independent",
                        "type": "select",
                        "options": [
                            {"value": "Met", "label": "Met"},
                            {"value": "Not met", "label": "Not met"},
                        ],
                        "expected": ["Met"],
                    },
                    {
                        "id": "slope-condition-normal",
                        "type": "select",
                        "options": [
                            {"value": "Met", "label": "Met"},
                            {"value": "Not met", "label": "Not met"},
                        ],
                        "expected": ["Met"],
                    },
                    {
                        "id": "slope-condition-equal-variance",
                        "type": "select",
                        "options": [
                            {"value": "Met", "label": "Met"},
                            {"value": "Not met", "label": "Not met"},
                        ],
                        "expected": ["Met"],
                    },
                    {
                        "id": "slope-condition-random",
                        "type": "select",
                        "options": [
                            {"value": "Met", "label": "Met"},
                            {"value": "Not met", "label": "Not met"},
                        ],
                        "expected": ["Met"],
                    },
                ],
                "rows": [
                    {"label": "Linear relationship", "component": "slope-condition-linear"},
                    {"label": f"Independent observations (n={n} ≤ 0.10N={population_size * 0.1:g})", "component": "slope-condition-independent"},
                    {"label": "Normal residuals", "component": "slope-condition-normal"},
                    {"label": "Equal variance", "component": "slope-condition-equal-variance"},
                    {"label": "Random sample", "component": "slope-condition-random"},
                ],
                "hint": "Use the prompt’s sample design and residual diagnostics to evaluate LINER.",
            },
            {
                "step_num": 4,
                "label": "Degrees of Freedom and Test Statistic:",
                "input_type": "slope_test_statistic",
                "components": [
                    {
                        "id": "slope-test-df",
                        "type": "number",
                        "placeholder": "df",
                        "expected": [df],
                        "tolerance": 0.01,
                    },
                    {
                        "id": "slope-test-statistic",
                        "type": "number",
                        "placeholder": "t",
                        "expected": [test_statistic],
                        "tolerance": 0.02,
                    },
                ],
                "rows": [
                    {"formula": r"\(df=n-2=\)", "component": "slope-test-df"},
                    {
                        "formula": rf"\(t=\frac{{{slope_symbol}}}{{SE_{{{slope_symbol}}}}}=\)",
                        "component": "slope-test-statistic",
                    },
                ],
                "hint": rf"Calculate \(df=n-2\) and \(t=\frac{{{slope_symbol}}}{{SE_{{{slope_symbol}}}}}\).",
            },
            {
                "step_num": 5,
                "label": "P-Value Calculation & Interpretation:",
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
                        "id": "slope-test-assumption",
                        "type": "select",
                        "options": [
                            {"value": "H₀ is true", "label": "H₀ is true"},
                            {
                                "value": "there is no linear relationship",
                                "label": "there is no linear relationship",
                            },
                        ],
                        "expected": [expected_assumption],
                    },
                ],
                "parts": [
                    "Assuming that ",
                    {"component": "slope-test-assumption"},
                    ", the probability of obtaining an estimated slope ",
                    (
                        "as large or larger than observed"
                        if direction == ">"
                        else "as small or smaller than observed"
                        if direction == "<"
                        else "as extreme or more extreme than observed"
                    ),
                    " purely by chance is approximately ",
                    {"component": "stage-pval"},
                    ".",
                ],
                "hint": (
                    rf"Use the {('upper' if direction == '>' else 'lower' if direction == '<' else 'two-sided')} tail area under the \(t_{{{df}}}\) distribution."
                ),
            },
            {
                "step_num": 6,
                "label": "AP-Style Conclusion:",
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
                        "options": [
                            {"value": "≤", "label": "less than or equal to"},
                            {"value": ">", "label": "greater than"},
                        ],
                        "expected": [expected_pval_op],
                    },
                    {
                        "id": "conclusion-decision",
                        "type": "select",
                        "options": [
                            {"value": "reject H₀", "label": "reject H₀"},
                            {
                                "value": "fail to reject H₀",
                                "label": "fail to reject H₀",
                            },
                        ],
                        "expected": [expected_decision],
                    },
                    {
                        "id": "conclusion-evidence",
                        "type": "select",
                        "options": [
                            {"value": "is convincing", "label": "is convincing"},
                            {
                                "value": "is not convincing",
                                "label": "is not convincing",
                            },
                        ],
                        "expected": [expected_evidence],
                    },
                    {
                        "id": "slope-test-claim",
                        "type": "select",
                        "options": claim_options,
                        "expected": [expected_claim],
                    },
                ],
                "parts": [
                    "Because the P-value ( ",
                    {"component": "decision-p-value"},
                    " ) is ",
                    {"component": "p-val-op"},
                    " α = ",
                    {"component": "decision-alpha"},
                    ", we ",
                    {"component": "conclusion-decision"},
                    ". There ",
                    {"component": "conclusion-evidence"},
                    " statistical evidence that ",
                    {"component": "slope-test-claim"},
                    ".",
                ],
                "metadata": step_metadata,
                "hint": r"Compare the P-value with \(\alpha\), then state the evidence and conclusion in context.",
            },
        ],
        "solution": _solution_paragraphs(
            rf"Let \(\beta_1\) be the true slope relating {explanatory} to {response}. "
            rf"State \(H_0:\beta_1=0\) and \(H_a:\beta_1{alternative_symbol}0\). "
            rf"The regression conditions are met, and \(df=n-2={n}-2={df}\).",
            rf"The test statistic is \(t=\frac{{{slope_symbol}}}{{SE_{{{slope_symbol}}}}}="
            rf"\frac{{{slope:.3f}}}{{{standard_error:.3f}}}={test_statistic:.3f}\). "
            + (
                rf"The P-value is \(P(T_{{{df}}}\ge {test_statistic:.3f})={p_value:.4g}\)."
                if direction == ">"
                else rf"The P-value is \(P(T_{{{df}}}\le {test_statistic:.3f})={p_value:.4g}\)."
                if direction == "<"
                else rf"The P-value is \(2P(T_{{{df}}}\ge|{test_statistic:.3f}|)={p_value:.4g}\)."
            ),
            "Because the P-value is "
            + ("at most" if reject else "greater than")
            + rf" \(\alpha={alpha:g}\), "
            + expected_decision
            + f". There {expected_evidence} statistical evidence that {expected_claim}.",
        ),
        "metadata": step_metadata,
    }


def _notation_symbols(notation_style: str) -> Tuple[str, str]:
    if notation_style == "ab":
        return "a", "b"
    if notation_style == "b0b1":
        return "b_0", "b_1"
    raise ValueError(f"Unknown LSRL notation style: {notation_style}")


def generate_regression_problem(topic: str, notation_style: str = "ab") -> Dict[str, Any]:
    generators = {
        "reg_lsrl": generate_lsrl_equation_problem,
        "reg_pred_res": generate_prediction_residual_problem,
        "reg_predict_residual": generate_prediction_residual_problem,
        "reg_raw_data": generate_raw_data_regression_problem,
        "reg_slope_ci": generate_slope_confidence_interval,
        "reg_slope_test": generate_slope_significance_test,
    }
    generator = generators.get(topic)
    if generator is None:
        raise ValueError(f"Unknown linear-regression topic: {topic}")
    return generator(notation_style)
