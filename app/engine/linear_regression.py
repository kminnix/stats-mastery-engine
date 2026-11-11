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


def _liner_conditions_step(n: int, population_size: int) -> Dict[str, Any]:
    checks = [
        ("liner-linear", "Linear relationship: residual plot has no curved pattern."),
        (
            "liner-independent",
            f"Independent observations: n = {n} and N = {population_size}, so n ≤ 0.10N.",
        ),
        (
            "liner-normal",
            "Normal residuals: histogram shows no strong skewness or outliers.",
        ),
        ("liner-equal-variance", "Equal variance: residual spread is roughly constant."),
        ("liner-random", "Randomization: observations come from a random sample."),
    ]
    return {
        "step_num": 1,
        "label": "Check Regression Conditions (LINER):",
        "input_type": "cloze",
        "components": [
            {
                "id": component_id,
                "type": "select",
                "options": [
                    {"value": "Met", "label": "Met"},
                    {"value": "Not met", "label": "Not met"},
                ],
                "expected": ["Met"],
            }
            for component_id, _ in checks
        ],
        "parts": [
            part
            for component_id, description in checks
            for part in (description + " ", {"component": component_id}, "<br>")
        ],
        "hint": "Check linearity, independence (10% condition), normal residuals, equal variance, and randomization.",
    }


def generate_lsrl_equation_problem() -> Dict[str, Any]:
    scenarios = [
        ("study time (hours)", "exam score (points)", 1),
        ("car weight (1000 lb)", "fuel economy (mpg)", -1),
        ("temperature (°C)", "ice cream sales (hundreds of dollars)", 1),
        ("experience (years)", "salary (thousands of dollars)", 1),
    ]
    x_name, y_name, direction = random.choice(scenarios)
    x_mean = random.uniform(4.0, 20.0)
    x_sd = random.uniform(1.0, 5.0)
    y_mean = random.uniform(30.0, 100.0)
    y_sd = random.uniform(5.0, 25.0)
    correlation = direction * random.uniform(0.5, 0.94)
    slope = correlation * y_sd / x_sd
    intercept = y_mean - slope * x_mean
    operator = "+" if slope >= 0 else "-"
    magnitude = abs(slope)
    prompt = (
        f"A study examines the relationship between {x_name} (x) and {y_name} (y). "
        f"Summary statistics are \\(\\bar{{x}}={x_mean:.2f}\\), "
        f"\\(s_x={x_sd:.2f}\\), \\(\\bar{{y}}={y_mean:.2f}\\), "
        f"\\(s_y={y_sd:.2f}\\), and \\(r={correlation:.3f}\\). Here, "
        "\\(a=b_0\\) is the y-intercept and \\(b=b_1\\) is the slope. Find the "
        "least-squares regression equation for predicting y from x."
    )
    equation_step = {
        "step_num": 3,
        "label": "Form the Least-Squares Regression Equation:",
        "input_type": "cloze",
        "components": [
            {
                "id": "lsrl-intercept",
                "type": "number",
                "placeholder": "b₀",
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
                "placeholder": "|b₁|",
                "expected": [magnitude],
                "tolerance": 0.01,
            },
        ],
        "parts": [
            r"\(\hat{y}=\)",
            {"component": "lsrl-intercept"},
            " ",
            {"component": "lsrl-slope-sign"},
            " ",
            {"component": "lsrl-slope-magnitude"},
            "x",
        ],
        "hint": r"Write \(\hat{y}=a+bx\), where \(a=b_0\) is the intercept and \(b=b_1\) is the slope. Enter the intercept, the slope's sign, and its magnitude.",
    }
    return {
        "type": "reg_lsrl",
        "title": "Finding the LSRL Equation",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": "Slope (b = b₁):",
                "input_type": "number",
                "placeholder": "b₁",
                "expected": [slope],
                "tolerance": 0.01,
                "hint": r"Use \(b=b_1=r\left(\frac{s_y}{s_x}\right)\), keeping the sign of \(r\).",
            },
            {
                "step_num": 2,
                "label": "y-Intercept (a = b₀):",
                "input_type": "number",
                "placeholder": "b₀",
                "expected": [intercept],
                "tolerance": 0.05,
                "hint": r"Use \(a=b_0=\bar{y}-b\bar{x}\) with the slope from Step 1.",
            },
            equation_step,
        ],
        "solution": _solution_paragraphs(
            rf"Slope \(b=b_1\): \(b=r\frac{{s_y}}{{s_x}}=({correlation:.3f})"
            rf"\frac{{{y_sd:.2f}}}{{{x_sd:.2f}}}={slope:.4f}\).",
            rf"Intercept \(a=b_0\): \(a=\bar{{y}}-b\bar{{x}}={y_mean:.2f}"
            rf"-({slope:.4f})({x_mean:.2f})={intercept:.4f}\).",
            rf"Regression equation: \(\hat{{y}}=a+bx={intercept:.4f}"
            rf"{'+' if slope >= 0 else '-'}{magnitude:.4f}x\).",
        ),
    }


def generate_prediction_residual_problem() -> Dict[str, Any]:
    scenarios = [
        ("study time (hours)", "exam score (points)", 1),
        ("car weight (1000 lb)", "fuel economy (mpg)", -1),
        ("temperature (°C)", "ice cream sales (hundreds of dollars)", 1),
        ("experience (years)", "salary (thousands of dollars)", 1),
    ]
    x_name, y_name, direction = random.choice(scenarios)
    slope = direction * random.uniform(1.2, 5.0)
    intercept = random.uniform(15.0, 60.0)
    x_observed = random.randint(3, 18)
    x_target = x_observed + random.choice([-3, -1, 2, 4])
    y_hat_observed = intercept + slope * x_observed
    residual = random.choice([-1, 1]) * random.uniform(2.0, 9.0)
    y_observed = y_hat_observed + residual
    y_hat_target = intercept + slope * x_target
    direction_answer = "overestimated" if residual < 0 else "underestimated"
    prompt = (
        f"The least-squares regression line for predicting {y_name} from {x_name} is "
        f"\\(\\hat{{y}}={intercept:.2f}{'+' if slope >= 0 else '-'}"
        f"{abs(slope):.2f}x\\), where \(a\) is the intercept and \(b\) is the slope. "
        f"An observed point is "
        f"\\(({x_observed}, {y_observed:.2f})\\). Find the predicted response at "
        f"\\(x={x_target}\\), then find and interpret the residual for the observed point."
    )
    return {
        "type": "reg_predict_residual",
        "title": "Predictions & Residuals (Equation Given)",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": f"Predicted {y_name} at x = {x_target}:",
                "input_type": "number",
                "placeholder": "ŷ",
                "expected": [y_hat_target],
                "tolerance": 0.05,
                "hint": r"Substitute the target value into the given line: \(\hat{y}=a+bx\).",
            },
            {
                "step_num": 2,
                "label": "Residual for the Observed Point:",
                "input_type": "number",
                "placeholder": "e = y − ŷ",
                "expected": [residual],
                "tolerance": 0.05,
                "hint": rf"First calculate \(\hat{{y}}_{{obs}}={intercept:.2f}"
                rf"{'+' if slope >= 0 else '-'}{abs(slope):.2f}({x_observed})\), "
                r"then use \(e=y-\hat{y}_{obs}\).",
            },
            {
                "step_num": 3,
                "label": "Model Outcome:",
                "input_type": "select",
                "options": [
                    {"value": "overestimated", "label": "overestimated"},
                    {"value": "underestimated", "label": "underestimated"},
                ],
                "expected": [direction_answer],
                "hint": "A negative residual means the model overestimated; a positive residual means it underestimated.",
            },
        ],
        "solution": _solution_paragraphs(
            rf"At \(x={x_target}\), \(\hat{{y}}={intercept:.2f}"
            rf"{'+' if slope >= 0 else '-'}{abs(slope):.2f}({x_target})"
            rf"={y_hat_target:.2f}\).",
            rf"For the observed point, \(\hat{{y}}_{{obs}}={intercept:.2f}"
            rf"{'+' if slope >= 0 else '-'}{abs(slope):.2f}({x_observed})"
            rf"={y_hat_observed:.2f}\). The residual is "
            rf"\(e={y_observed:.2f}-{y_hat_observed:.2f}={residual:.2f}\), "
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


def generate_raw_data_regression_problem() -> Dict[str, Any]:
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
                    "placeholder": "b₁",
                    "expected": [slope],
                    "tolerance": 0.02,
                },
                {
                    "id": "raw-intercept",
                    "type": "number",
                    "placeholder": "b₀",
                    "expected": [intercept],
                    "tolerance": 0.05,
                },
            ],
            "parts": [
                r"\(b_1=\)",
                {"component": "raw-slope"},
                r", \(b_0=\)",
                {"component": "raw-intercept"},
            ],
            "hint": r"Calculate \(b_1=r\frac{s_y}{s_x}\), then \(b_0=\bar{y}-b_1\bar{x}\).",
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
            "Use \\(\\hat{y}=a+bx\\), where a is the intercept and b is the slope."
        ),
        "steps": steps,
        "solution": _solution_paragraphs(
            rf"From the data, \(\bar{{x}}={x_mean:.3f}\), \(s_x={x_sd:.3f}\), "
            rf"\(\bar{{y}}={y_mean:.3f}\), \(s_y={y_sd:.3f}\), and \(r={correlation:.4f}\).",
            rf"The slope \(b=b_1\) is \(b=r\frac{{s_y}}{{s_x}}={slope:.4f}\), and the "
            rf"intercept \(a=b_0\) is \(a=\bar{{y}}-b\bar{{x}}={intercept:.4f}\).",
            rf"The fitted line is \(\hat{{y}}=a+bx\). At \(x={target_x:g}\), "
            rf"\(\hat{{y}}={predicted_target:.2f}\). "
            rf"For the identified point, \(e={y_values[observed_index]:.2f}"
            rf"-{observed_prediction:.2f}={residual:.2f}\).",
        ),
    }


def _slope_inference_steps(
    is_test: bool,
    n: int,
    population_size: int,
    alpha: float,
    critical_t: float,
    test_statistic: float,
    p_value: float,
    lower: float,
    upper: float,
    context: str,
) -> List[Dict[str, Any]]:
    df = n - 2
    condition_step = _liner_conditions_step(n, population_size)
    if is_test:
        reject = p_value <= alpha
        return [
            condition_step,
            {
                "step_num": 2,
                "label": "Degrees of Freedom:",
                "input_type": "number",
                "placeholder": "df",
                "expected": [df],
                "tolerance": 0.01,
                "hint": r"For inference about a regression slope, \(df=n-2\).",
            },
            {
                "step_num": 3,
                "label": "Test Statistic (t):",
                "input_type": "number",
                "placeholder": "t",
                "expected": [test_statistic],
                "tolerance": 0.02,
                "hint": r"Under \(H_0:\beta=0\), calculate \(t=\frac{b}{SE_b}\).",
            },
            {
                "step_num": 4,
                "label": "Two-Sided P-Value:",
                "input_type": "number",
                "placeholder": "P-value",
                "expected": [p_value],
                "tolerance": 0.002,
                "hint": rf"With \(df={df}\), find \(P(|T|\ge |{test_statistic:.3f}|)\).",
            },
            {
                "step_num": 5,
                "label": "Conclusion:",
                "input_type": "cloze",
                "components": [
                    {
                        "id": "slope-test-pvalue",
                        "type": "number",
                        "placeholder": "P-value",
                        "expected": [p_value],
                        "tolerance": 0.002,
                    },
                    {
                        "id": "slope-test-comparison",
                        "type": "select",
                        "options": [
                            {
                                "value": "less than or equal to",
                                "label": "less than or equal to",
                            },
                            {"value": "greater than", "label": "greater than"},
                        ],
                        "expected": [
                            "less than or equal to"
                            if reject
                            else "greater than"
                        ],
                    },
                    {
                        "id": "slope-test-alpha",
                        "type": "number",
                        "placeholder": "α",
                        "expected": [alpha],
                        "tolerance": 0.00001,
                    },
                    {
                        "id": "slope-test-decision",
                        "type": "select",
                        "options": [
                            {"value": "reject", "label": "reject H₀"},
                            {"value": "fail to reject", "label": "fail to reject H₀"},
                        ],
                        "expected": ["reject" if reject else "fail to reject"],
                    },
                    {
                        "id": "slope-test-conclusion",
                        "type": "select",
                        "options": [
                            {"value": "convincing", "label": "convincing"},
                            {"value": "not convincing", "label": "not convincing"},
                        ],
                        "expected": ["convincing" if reject else "not convincing"],
                    },
                    {
                        "id": "slope-test-context",
                        "type": "select",
                        "options": [
                            {
                                "value": "there is a linear relationship between the explanatory and response variables",
                                "label": "there is a linear relationship between the explanatory and response variables",
                            },
                            {
                                "value": "the true slope differs from 0",
                                "label": "the true slope differs from 0",
                            },
                        ],
                        "expected": [
                            "there is a linear relationship between the explanatory and response variables"
                            if reject
                            else "the true slope differs from 0"
                        ],
                    },
                ],
                "parts": [
                    "Because the P-value ( ",
                    {"component": "slope-test-pvalue"},
                    " ) is ",
                    {"component": "slope-test-comparison"},
                    " α = ",
                    {"component": "slope-test-alpha"},
                    ", we ",
                    {"component": "slope-test-decision"},
                    ". There ",
                    {"component": "slope-test-conclusion"},
                    " statistical evidence that ",
                    {"component": "slope-test-context"},
                    " for ",
                    context,
                    ".",
                ],
                "hint": r"Compare the \(P\)-value with \(\alpha\), select the matching decision and evidence, and state the conclusion in context.",
            },
        ]
    return [
        condition_step,
        {
            "step_num": 2,
            "label": "Degrees of Freedom:",
            "input_type": "number",
            "placeholder": "df",
            "expected": [df],
            "tolerance": 0.01,
            "hint": r"For a confidence interval for the regression slope, \(df=n-2\).",
        },
        {
            "step_num": 3,
            "label": "Critical Value (t*):",
            "input_type": "number",
            "placeholder": "t*",
            "expected": [critical_t],
            "tolerance": 0.02,
            "hint": rf"Use \(t^*=t_{{1-\alpha/2,{df}}}\) for a {100 * (1 - alpha):g}% confidence interval.",
        },
        {
            "step_num": 4,
            "label": "Confidence Interval for β₁:",
            "input_type": "cloze",
            "components": [
                {
                    "id": "slope-ci-lower",
                    "type": "number",
                    "placeholder": "lower bound",
                    "expected": [lower],
                    "tolerance": 0.02,
                },
                {
                    "id": "slope-ci-upper",
                    "type": "number",
                    "placeholder": "upper bound",
                    "expected": [upper],
                    "tolerance": 0.02,
                },
            ],
            "parts": [
                r"\(b_1 \pm t^*SE_{b_1}\): [",
                {"component": "slope-ci-lower"},
                ", ",
                {"component": "slope-ci-upper"},
                "]",
            ],
            "hint": r"Calculate \(b_1\pm t^*SE_{b_1}\).",
        },
        {
            "step_num": 5,
            "label": "Conclusion:",
            "input_type": "cloze",
            "components": [
                {
                    "id": "slope-ci-decision",
                    "type": "select",
                    "options": [
                        {"value": "excludes zero", "label": "excludes zero"},
                        {"value": "includes zero", "label": "includes zero"},
                    ],
                    "expected": ["excludes zero" if lower > 0 or upper < 0 else "includes zero"],
                },
                {
                    "id": "slope-ci-conclusion",
                    "type": "select",
                    "options": [
                        {"value": "convincing", "label": "convincing"},
                        {"value": "not convincing", "label": "not convincing"},
                    ],
                    "expected": ["convincing" if lower > 0 or upper < 0 else "not convincing"],
                },
            ],
            "parts": [
                "The interval ",
                {"component": "slope-ci-decision"},
                ". There is ",
                {"component": "slope-ci-conclusion"},
                " evidence of a linear relationship between the variables for ",
                context,
                ".",
            ],
            "hint": "If the confidence interval excludes zero, it supports a nonzero population slope.",
        },
    ]


def generate_slope_inference_problem() -> Dict[str, Any]:
    contexts = [
        ("weekly study time and exam score", "points per additional study hour"),
        ("car weight and fuel economy", "mpg per additional 1000 lb"),
        ("temperature and ice cream sales", "hundreds of dollars per °C"),
        ("work experience and salary", "thousands of dollars per additional year"),
    ]
    context, slope_units = random.choice(contexts)
    n = random.randint(18, 60)
    population_size = n * 20
    df = n - 2
    slope = random.choice([-1, 1]) * random.uniform(0.2, 4.0)
    standard_error = random.uniform(0.15, 1.5)
    alpha = random.choice([0.01, 0.05, 0.10])
    is_test = random.choice([True, False])
    critical_t = float(t.ppf(1 - alpha / 2, df))
    test_statistic = slope / standard_error
    p_value = float(2 * t.sf(abs(test_statistic), df))
    lower = slope - critical_t * standard_error
    upper = slope + critical_t * standard_error
    steps = _slope_inference_steps(
        is_test,
        n,
        population_size,
        alpha,
        critical_t,
        test_statistic,
        p_value,
        lower,
        upper,
        context,
    )
    diagnostics = (
        f"A random sample of \\(n={n}\\) observations was taken from a population of "
        f"\\(N={population_size}\\). The residual plot has no curved pattern, the "
        "residual histogram has no strong skewness or outliers, and the residual spread "
        "is roughly constant."
    )
    prompt = (
        f"A regression analysis studies {context}. The sample size is \\(n={n}\\), "
        f"the estimated slope is \\(b_1={slope:.3f}\\) {slope_units}, and its "
        f"standard error is \\(SE_{{b_1}}={standard_error:.3f}\\) (equivalently, "
        f"\\(b=b_1\\) estimates the population slope \\(\\beta\\)). Test "
        f"\\(H_0:\\beta=0\\) versus \\(H_a:\\beta\\ne0\\) "
        f"\\(\\alpha={alpha:g}\\). {diagnostics}"
        if is_test
        else f"A regression analysis studies {context}. The sample size is \\(n={n}\\), "
        f"the estimated slope is \\(b_1={slope:.3f}\\) {slope_units}, and its "
        f"standard error is \\(SE_{{b_1}}={standard_error:.3f}\\) (equivalently, "
        f"\\(b=b_1\\) estimates the population slope \\(\\beta\\)). Find and interpret "
        f"a {100 * (1 - alpha):g}% confidence interval for the population slope. "
        f"{diagnostics}"
    )
    if is_test:
        test_result = (
            rf"\(t=\frac{{b}}{{SE_b}}=\frac{{{slope:.3f}}}"
            rf"{{{standard_error:.3f}}}={test_statistic:.3f}\), "
            rf"\(df={df}\), and \(P={p_value:.4g}\)."
        )
        conclusion = (
            "The P-value is "
            + ("at most" if p_value <= alpha else "greater than")
            + rf" \(\alpha={alpha:g}\), so "
            + ("reject" if p_value <= alpha else "fail to reject")
            + rf" \(H_0\). There is {'convincing' if p_value <= alpha else 'not convincing'} "
            f"evidence that the population slope differs from zero for {context}."
        )
    else:
        test_result = (
            rf"\(t^*={critical_t:.3f}\), \(df={df}\), and the interval is "
            rf"\({slope:.3f}\pm({critical_t:.3f})({standard_error:.3f})"
            rf"=({lower:.3f}, {upper:.3f})\)."
        )
        excludes_zero = lower > 0 or upper < 0
        conclusion = (
            f"The interval {'excludes' if excludes_zero else 'includes'} zero, "
            f"so there is {'convincing' if excludes_zero else 'not convincing'} evidence "
            f"of a linear relationship for {context}."
        )
    return {
        "type": "reg_slope_inference",
        "title": "Inference for Slope (t-Test & CI)",
        "prompt": prompt,
        "steps": steps,
        "solution": _solution_paragraphs(
            rf"Degrees of freedom: \(df=n-2={n}-2={df}\).",
            test_result,
            conclusion,
        ),
    }


def generate_regression_problem(topic: str) -> Dict[str, Any]:
    generators = {
        "reg_lsrl": generate_lsrl_equation_problem,
        "reg_predict_residual": generate_prediction_residual_problem,
        "reg_raw_data": generate_raw_data_regression_problem,
        "reg_slope_inference": generate_slope_inference_problem,
    }
    generator = generators.get(topic)
    if generator is None:
        raise ValueError(f"Unknown linear-regression topic: {topic}")
    return generator()
