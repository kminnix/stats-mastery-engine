import math
import random
from statistics import mean, median, stdev
from typing import Any, Dict, Optional


def _field(field_id: str, label: str, value: float, input_type: str = "number",
           symbols: Optional[list[str]] = None, tolerance: float = 0.005) -> Dict[str, Any]:
    field: Dict[str, Any] = {
        "id": field_id, "label": label, "type": "number", "input_type": input_type,
        "expected": [value], "tolerance": tolerance,
    }
    if symbols is not None:
        field["math_symbols"] = symbols
    return field


def _step(number: int, label: str, fields: list[Dict[str, Any]], hint: str) -> Dict[str, Any]:
    return {"step_num": number, "label": label, "input_type": "compound", "inputs": fields, "hint": hint}


def generate_eda_summary_problem() -> Dict[str, Any]:
    n = random.choice([8, 9])
    decimal = random.choice([True, False])
    center = random.randint(25, 45)
    if decimal:
        ordinary = [center + offset / 10 for offset in random.sample(range(-30, 31), n - 1)]
    else:
        ordinary = [center + offset for offset in random.choices(range(-3, 4), k=n - 1)]
    outlier = center + random.choice([-20, 20])
    values = ordinary + [outlier]
    random.shuffle(values)
    ordered = sorted(values)
    middle = n // 2
    q1 = median(ordered[:middle])
    q3 = median(ordered[(n + 1) // 2:])
    med = median(ordered)
    iqr = q3 - q1
    lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    outliers = [value for value in ordered if value < lower or value > upper]
    avg, sd = mean(values), stdev(values)
    display = ", ".join(f"{value:g}" for value in values)
    sorted_display = ", ".join(f"{value:g}" for value in ordered)
    outlier_display = ", ".join(f"{value:g}" for value in outliers)
    return {
        "type": "eda_summary",
        "title": "1-Variable Summary Stats, IQR & Outliers",
        "prompt": (
            f"The following {n} study sessions had durations in minutes: {display}. "
            "Use the median-of-halves method, excluding the overall median when n is odd. "
            "Find the five-number summary, fences, number of outliers, mean and sample standard deviation."
        ),
        "steps": [
            _step(1, "Five-Number Summary:", [
                _field("eda-min", "Minimum", ordered[0]),
                _field("eda-q1", "Q1", q1),
                _field("eda-median", "Median", med),
                _field("eda-q3", "Q3", q3),
                _field("eda-max", "Maximum", ordered[-1]),
            ], r"Sort the data. Find the median and the medians of the lower and upper halves; exclude the overall median when \(n\) is odd."),
            _step(2, "IQR and Outlier Fences:", [
                _field("eda-iqr", "IQR", iqr, "math", ["parens"]),
                _field("eda-lower", "Lower fence", lower, "math", ["parens"]),
                _field("eda-upper", "Upper fence", upper, "math", ["parens"]),
            ], r"Use \(IQR=Q_3-Q_1\) and fences \(Q_1-1.5(IQR)\), \(Q_3+1.5(IQR)\)."),
            _step(3, "Outliers and Sample Statistics:", [
                _field("eda-outliers", "Number of outliers", len(outliers), tolerance=0),
                _field("eda-mean", "Sample mean x̄", avg),
                _field("eda-sd", "Sample standard deviation sₓ", sd),
            ], r"Count values strictly outside the fences. Use \(\bar{x}=\sum x_i/n\) and \(s_x=\sqrt{\sum(x_i-\bar{x})^2/(n-1)}\)."),
        ],
        "solution": (
            f"<p>Sorted data: {sorted_display}.</p>"
            f"<p>Excluding the overall median from the halves when needed gives "
            f"\\(Q_1={q1:g}\\), median \\({med:g}\\), and \\(Q_3={q3:g}\\); "
            f"minimum \\({ordered[0]:g}\\), maximum \\({ordered[-1]:g}\\).</p>"
            f"<p>\\(IQR={q3:g}-{q1:g}={iqr:g}\\). "
            f"Fences: \\({q1:g}-1.5({iqr:g})={lower:g}\\) and "
            f"\\({q3:g}+1.5({iqr:g})={upper:g}\\). "
            f"Values outside the fences: {outlier_display} ({len(outliers)} total).</p>"
            f"<p>\\(\\bar{{x}}=\\sum x_i/{n}={avg:.4f}\\); "
            f"\\(s_x=\\sqrt{{\\sum(x_i-\\bar{{x}})^2/({n}-1)}}={sd:.4f}\\).</p>"
        ),
    }


def generate_rv_transform_combine_problem() -> Dict[str, Any]:
    context = random.choice([
        ("completion times for two independent tasks", "minutes"),
        ("weights of two independently selected shipments", "kilograms"),
        ("scores on two independent assessments", "points"),
    ])
    mu_x, mu_y = random.randint(12, 35), random.randint(5, 11)
    sd_x, sd_y = random.randint(2, 6), random.randint(1, 5)
    a, b = random.randint(5, 15), random.choice([-3, -2, -1, 2, 3])
    plus = random.choice([True, False])
    symbol = "+" if plus else "-"
    result_name = "T" if plus else "D"
    transformed_mean = a + b * mu_x
    transformed_sd = abs(b) * sd_x
    combined_mean = mu_x + mu_y if plus else mu_x - mu_y
    combined_sd = math.sqrt(sd_x ** 2 + sd_y ** 2)
    return {
        "type": "rv_transform_combine",
        "title": "Transforming & Combining Random Variables",
        "prompt": (
            f"Let X and Y represent {context[0]}, measured in {context[1]}. "
            f"They are independent, with \\(\\mu_X={mu_x}\\), \\(\\sigma_X={sd_x}\\), "
            f"\\(\\mu_Y={mu_y}\\), and \\(\\sigma_Y={sd_y}\\). "
            f"Define the transformed quantity \\(W={a}+({b})X\\) and "
            f"\\({result_name}=X{symbol}Y\\). Find their means and standard deviations."
        ),
        "steps": [
            _step(1, "Linear Transformation W:", [
                _field("rv-w-mean", "Mean μW", transformed_mean),
                _field("rv-w-sd", "Standard deviation σW", transformed_sd, "math", ["parens"]),
            ], r"Use \(\mu_W=a+b\mu_X\) and \(\sigma_W=|b|\sigma_X\); adding a constant does not change standard deviation."),
            _step(2, f"Combination {result_name}:", [
                _field("rv-comb-mean", f"Mean μ{result_name}", combined_mean),
                _field("rv-comb-sd", f"Standard deviation σ{result_name}", combined_sd, "math", ["sqrt", "pow", "parens"]),
            ], r"For independent variables, add variances for both sums and differences: \(\sigma_{X\pm Y}=\sqrt{\sigma_X^2+\sigma_Y^2}\)."),
        ],
        "solution": (
            f"<p>\\(\\mu_W={a}+({b})({mu_x})={transformed_mean}\\), "
            f"\\(\\sigma_W=|{b}|({sd_x})={transformed_sd}\\).</p>"
            f"<p>\\(\\mu_{{{result_name}}}={mu_x}{symbol}{mu_y}={combined_mean}\\). "
            f"Since X and Y are independent, "
            f"\\(\\sigma_{{{result_name}}}=\\sqrt{{{sd_x}^2+{sd_y}^2}}={combined_sd:.4f}\\).</p>"
        ),
    }


def generate_twoway_prob_problem() -> Dict[str, Any]:
    contexts = [
        ("students", ["First year", "Other years"], ["Bus", "Car", "Walk"], "Year", "Commute"),
        ("customers", ["Member", "Nonmember"], ["Online", "In store", "Phone"], "Membership", "Purchase"),
    ]
    population, row_names, all_columns, row_title, col_title = random.choice(contexts)
    column_names = all_columns[:random.choice([2, 3])]
    row_factors = [random.randint(2, 5), random.randint(2, 5)]
    column_factors = [random.randint(3, 8) for _ in column_names]
    counts = [[row_factor * factor for factor in column_factors] for row_factor in row_factors]
    if random.choice([True, False]):
        counts[0][0] += 1
        counts[0][1] -= 1
        counts[1][0] -= 1
        counts[1][1] += 1
    row_totals = [sum(row) for row in counts]
    col_totals = [sum(row[col] for row in counts) for col in range(len(column_names))]
    total = sum(row_totals)
    joint = counts[0][0]
    p_a, p_joint, p_cond = row_totals[0] / total, joint / total, joint / col_totals[0]
    independent = joint * total == row_totals[0] * col_totals[0]
    independent_text = "Independent — P(A | B) = P(A)"
    dependent_text = "Not independent — P(A | B) ≠ P(A)"
    answer = independent_text if independent else dependent_text
    relation = "=" if independent else r"\ne"
    return {
        "type": "prob_twoway",
        "title": "Two-Way Tables, Conditional Probability & Independence",
        "prompt": (
            f"A survey of {population} produced the table below. Choose one person at random. "
            f"Let A be {row_names[0]} and B be {column_names[0]}. "
            "Find the requested probabilities and decide whether A and B are independent."
        ),
        "table_data": {
            "headers": [f"{row_title} / {col_title}", *column_names, "Total"],
            "rows": [
                [row_names[i], *counts[i], row_totals[i]] for i in range(2)
            ] + [["Total", *col_totals, total]],
        },
        "steps": [
            _step(1, "Marginal and Joint Probabilities:", [
                _field("two-p-a", "P(A)", p_a, "math", ["frac"]),
                _field("two-p-joint", "P(A and B)", p_joint, "math", ["frac"]),
            ], r"Divide the A row total and the A-and-B cell count by the grand total \(N\)."),
            _step(2, "Conditional Probability:", [
                _field("two-p-conditional", "P(A | B)", p_cond, "math", ["frac"]),
            ], r"Restrict the denominator to B: \(P(A\mid B)=P(A\cap B)/P(B)\)."),
            {
                "step_num": 3, "label": "Independence:", "input_type": "select",
                "options": [{"value": text, "label": text} for text in [independent_text, dependent_text]],
                "expected": [answer],
                "hint": r"Compare \(P(A\mid B)\) with \(P(A)\) using exact fractions.",
            },
        ],
        "solution": (
            f"<p>\\(P(A)={row_totals[0]}/{total}={p_a:.4f}\\) and "
            f"\\(P(A\\cap B)={joint}/{total}={p_joint:.4f}\\).</p>"
            f"<p>\\(P(A\\mid B)={joint}/{col_totals[0]}={p_cond:.4f}\\).</p>"
            f"<p>Compare the exact fractions: \\({joint}\\cdot {total}"
            f"{relation}{row_totals[0]}\\cdot {col_totals[0]}\\). "
            f"{answer}.</p>"
        ),
    }


def generate_foundations_problem(topic: str) -> Dict[str, Any]:
    generators = {
        "eda_summary": generate_eda_summary_problem,
        "rv_transform_combine": generate_rv_transform_combine_problem,
        "prob_twoway": generate_twoway_prob_problem,
    }
    if topic not in generators:
        raise ValueError(f"Unknown foundations topic: {topic}")
    return generators[topic]()
