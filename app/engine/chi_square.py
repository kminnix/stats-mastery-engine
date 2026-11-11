import random
from typing import Any, Dict, Sequence

from scipy.stats import chi2


def _decision_step(p_value: float, alpha: float, conclusion: str) -> Dict[str, Any]:
    reject = p_value <= alpha
    decision = "reject" if reject else "fail to reject"
    comparison = "less than or equal to" if reject else "greater than"
    evidence = "is convincing" if reject else "is not convincing"
    return {
        "step_num": 4,
        "label": "Decision & Conclusion:",
        "input_type": "cloze",
        "components": [
            {
                "id": "chi-p-value",
                "type": "number",
                "placeholder": "P-value",
                "expected": [p_value],
                "tolerance": 0.001,
            },
            {
                "id": "chi-p-alpha",
                "type": "select",
                "options": [
                    {
                        "value": "less than or equal to",
                        "label": "less than or equal to",
                    },
                    {"value": "greater than", "label": "greater than"},
                ],
                "expected": [comparison],
            },
            {
                "id": "chi-alpha",
                "type": "number",
                "placeholder": "α",
                "expected": [alpha],
                "tolerance": 0.00001,
            },
            {
                "id": "chi-decision",
                "type": "select",
                "options": [
                    {"value": "reject", "label": "reject H₀"},
                    {"value": "fail to reject", "label": "fail to reject H₀"},
                ],
                "expected": [decision],
            },
            {
                "id": "chi-conclusion",
                "type": "select",
                "options": [
                    {"value": "is convincing", "label": "is convincing"},
                    {"value": "is not convincing", "label": "is not convincing"},
                ],
                "expected": [evidence],
            },
        ],
        "parts": [
            "Because the P-value ( ",
            {"component": "chi-p-value"},
            " ) is ",
            {"component": "chi-p-alpha"},
            " α = ",
            {"component": "chi-alpha"},
            ", we ",
            {"component": "chi-decision"},
            ". There ",
            {"component": "chi-conclusion"},
            " statistical evidence that ",
            conclusion,
            ".",
        ],
        "hint": r"Compare the \(P\)-value with \(\alpha\). If \(P \le \alpha\), reject \(H_0\); if \(P > \alpha\), fail to reject \(H_0\).",
    }


def _count_table(labels: Sequence[str], observed: Sequence[int], expected: Sequence[float]) -> str:
    rows = [
        rf"\text{{{label}}} & {count} & {value:.2f} & "
        rf"\frac{{({count} - {value:.2f})^2}}{{{value:.2f}}} = "
        rf"{(count - value) ** 2 / value:.4f}"
        for label, count, value in zip(labels, observed, expected)
    ]
    joined_rows = r" \\ ".join(rows)
    return (
        rf"\[\begin{{array}}{{l|c|c|c}} \text{{Category}} & O_i & E_i "
        rf"& \frac{{(O_i - E_i)^2}}{{E_i}} \\ \hline {joined_rows} \end{{array}}\]"
    )


def generate_chi_square_gof() -> Dict[str, Any]:
    scenarios = [
        (
            "M&M color breakdown",
            ["Blue", "Brown", "Green", "Orange", "Red", "Yellow"],
            [0.13, 0.14, 0.13, 0.20, 0.24, 0.16],
            "a bag of M&M's",
        ),
        (
            "store customer visits by weekday",
            ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            [0.16, 0.18, 0.18, 0.19, 0.29],
            "store customer visits",
        ),
        (
            "genetic phenotype ratios",
            ["Phenotype A", "Phenotype B", "Phenotype C", "Phenotype D"],
            [0.25, 0.25, 0.25, 0.25],
            "offspring phenotypes",
        ),
    ]
    scenario, categories, proportions, sample_description = random.choice(scenarios)
    n = random.randint(100, 300)
    observed = [0] * len(categories)
    for selected_category in random.choices(range(len(categories)), weights=proportions, k=n):
        observed[selected_category] += 1

    expected = [n * proportion for proportion in proportions]
    df = len(categories) - 1
    chi2_stat = sum(
        (observed_count - expected_count) ** 2 / expected_count
        for observed_count, expected_count in zip(observed, expected)
    )
    p_value = float(chi2.sf(chi2_stat, df))
    alpha = random.choice([0.01, 0.05, 0.10])
    target_index = random.randrange(len(categories))
    components = [
        (observed_count - expected_count) ** 2 / expected_count
        for observed_count, expected_count in zip(observed, expected)
    ]
    null_distribution = ", ".join(
        f"{category}: {proportion:.2f}"
        for category, proportion in zip(categories, proportions)
    )
    observed_table = (
        r"\[\begin{array}{l|c} "
        r"\text{Category} & O_i \\ \hline "
        + r" \\ ".join(
            rf"\text{{{category}}} & {count}"
            for category, count in zip(categories, observed)
        )
        + r" \end{array}\]"
    )
    prompt = (
        f"A researcher studies the {scenario}. Under the null hypothesis, the population "
        f"proportions are {null_distribution}. In a random sample of \\(n={n}\\) "
        f"{sample_description}, the observed counts are shown below. At "
        f"\\(\\alpha={alpha:g}\\), test whether the observed category distribution differs "
        f"from the hypothesized distribution.<br><br>{observed_table}"
    )
    solution = (
        "<p><strong>Goodness-of-fit test</strong></p>"
        f"<p>Degrees of freedom: \\(df=k-1={len(categories)}-1={df}\\). "
        f"The expected count for {categories[target_index]} is "
        f"\\(E={n}({proportions[target_index]:g})={expected[target_index]:.2f}\\).</p>"
        f"<p>Expected counts are \\(({', '.join(f'{value:.2f}' for value in expected)})\\); "
        f"all are at least 5. The test statistic is "
        f"\\(\\chi^2={chi2_stat:.4f}\\) and the P-value is \\({p_value:.4g}\\).</p>"
        f"<br><br>{_count_table(categories, observed, expected)}<br><br>"
        f"<p>Since the P-value {('≤' if p_value <= alpha else '>')} "
        f"\\(\\alpha={alpha:g}\\), {('reject' if p_value <= alpha else 'fail to reject')} "
        f"\\(H_0\\). There is "
        f"{'convincing' if p_value <= alpha else 'not convincing'} statistical evidence that the "
        "distribution of categories differs from the hypothesized distribution.</p>"
    )
    steps = [
        {
            "step_num": 1,
            "label": "Degrees of Freedom (df):",
            "input_type": "number",
            "placeholder": "df",
            "expected": [df],
            "tolerance": 0.01,
            "hint": r"Degrees of freedom for Goodness-of-Fit is \(df = k - 1\), where \(k\) is the number of categories.",
        },
        {
            "step_num": 2,
            "label": f"Expected Count for {categories[target_index]}:",
            "input_type": "number",
            "placeholder": "Expected count",
            "expected": [expected[target_index]],
            "tolerance": 0.01,
            "hint": r"Expected count for a category is \(E = n \cdot p_0\), multiplying the total sample size by the hypothesized proportion.",
        },
        {
            "step_num": 3,
            "label": "Test Statistic (χ²):",
            "input_type": "number",
            "placeholder": "χ²",
            "expected": [chi2_stat],
            "tolerance": 0.05,
            "hint": r"Calculate \(\chi^2 = \sum \frac{(O - E)^2}{E}\) by summing the squared differences divided by expected counts across all categories.",
        },
        _decision_step(
            p_value,
            alpha,
            "the distribution of categories differs from the hypothesized distribution",
        ),
    ]
    if p_value <= alpha:
        largest_index = max(range(len(components)), key=components.__getitem__)
        largest_contributor = categories[largest_index]
        direction = (
            "observed more than expected"
            if observed[largest_index] > expected[largest_index]
            else "observed fewer than expected"
        )
        steps.append(
            {
                "step_num": 5,
                "label": "Follow-Up Analysis (Largest Discrepancy):",
                "input_type": "cloze",
                "components": [
                    {
                        "id": "largest-contributor-category",
                        "type": "select",
                        "options": [
                            {"value": category, "label": category}
                            for category in categories
                        ],
                        "expected": [largest_contributor],
                    },
                    {
                        "id": "largest-contributor-direction",
                        "type": "select",
                        "options": [
                            {
                                "value": "observed more than expected",
                                "label": "observed more than expected",
                            },
                            {
                                "value": "observed fewer than expected",
                                "label": "observed fewer than expected",
                            },
                        ],
                        "expected": [direction],
                    },
                ],
                "parts": [
                    "The category contributing most to ",
                    r"\(\chi^2\)",
                    " is ",
                    {"component": "largest-contributor-category"},
                    "; it was ",
                    {"component": "largest-contributor-direction"},
                    ".",
                ],
                "hint": "Compare each category's observed and expected counts to identify the largest chi-square contribution and its direction.",
            }
        )

    return {
        "type": "chi_gof",
        "title": "Chi-Square Goodness-of-Fit Test",
        "prompt": prompt,
        "steps": steps,
        "solution": solution,
    }


def _matrix_latex(
    title: str,
    row_labels: Sequence[str],
    column_labels: Sequence[str],
    values: Sequence[Sequence[float]],
    formatter: str,
) -> str:
    column_spec = "c|" + "r" * len(column_labels)
    header = r"\text{" + title + r"} & " + " & ".join(
        rf"\text{{{label}}}" for label in column_labels
    )
    rows = [
        rf"\text{{{row_label}}} & "
        + " & ".join(format(value, formatter) for value in row)
        for row_label, row in zip(row_labels, values)
    ]
    joined_rows = r" \\ ".join(rows)
    return rf"\[\begin{{array}}{{{column_spec}}} {header} \\ \hline {joined_rows} \end{{array}}\]"


def generate_chi_square_two_way() -> Dict[str, Any]:
    scenarios = [
        (
            "treatment and recovery outcome",
            ["Control", "Treatment"],
            ["No improvement", "Improved", "Recovered"],
            [[0.55, 0.30, 0.15], [0.30, 0.35, 0.35]],
            "treatment is associated with recovery outcome",
        ),
        (
            "survey responses by age group",
            ["Age 18–34", "Age 35–54"],
            ["Prefer A", "Prefer B", "No preference"],
            [[0.45, 0.35, 0.20], [0.30, 0.40, 0.30]],
            "survey response is associated with age group",
        ),
        (
            "school preference by grade level",
            ["Grade 9", "Grade 10", "Grade 11"],
            ["Science", "Arts"],
            [[0.60, 0.40], [0.48, 0.52], [0.35, 0.65]],
            "school preference is associated with grade level",
        ),
    ]
    scenario, row_labels, column_labels, row_probabilities, conclusion = random.choice(scenarios)
    row_count = len(row_labels)
    row_totals = (
        [random.randint(50, 150) for _ in row_labels]
        if row_count == 2
        else [random.randint(40, 100) for _ in row_labels]
    )
    observed = []
    for probabilities, row_total in zip(row_probabilities, row_totals):
        row_draws = random.choices(
            range(len(column_labels)),
            weights=probabilities,
            k=row_total,
        )
        observed.append(
            [row_draws.count(column) for column in range(len(column_labels))]
        )
    row_totals = [sum(row) for row in observed]
    column_totals = [
        sum(observed[row][column] for row in range(row_count))
        for column in range(len(column_labels))
    ]
    grand_total = sum(row_totals)
    expected = [
        [
            row_totals[row] * column_totals[column] / grand_total
            for column in range(len(column_labels))
        ]
        for row in range(row_count)
    ]
    components = [
        [
            (observed[row][column] - expected[row][column]) ** 2 / expected[row][column]
            for column in range(len(column_labels))
        ]
        for row in range(row_count)
    ]
    chi2_stat = sum(sum(row) for row in components)
    df = (row_count - 1) * (len(column_labels) - 1)
    p_value = float(chi2.sf(chi2_stat, df))
    alpha = random.choice([0.01, 0.05, 0.10])
    target_row = random.randrange(row_count)
    target_column = random.randrange(len(column_labels))

    observed_table = _matrix_latex(
        "Observed counts",
        row_labels,
        column_labels,
        observed,
        "d",
    )
    prompt = (
        f"A study examines {scenario}. The observed counts are shown below. Test whether "
        f"the row and column variables are associated at \\(\\alpha={alpha:g}\\). "
        f"Calculate the expected count for the cell ({row_labels[target_row]}, "
        f"{column_labels[target_column]}).<br><br>{observed_table}"
    )
    expected_table = _matrix_latex(
        "Expected counts",
        row_labels,
        column_labels,
        expected,
        ".2f",
    )
    component_table = _matrix_latex(
        "Chi-square contributions",
        row_labels,
        column_labels,
        components,
        ".4f",
    )
    observed_with_totals = [
        f"{label} = {total}" for label, total in zip(row_labels, row_totals)
    ]
    solution = (
        "<p><strong>Chi-square test of independence / homogeneity</strong></p>"
        f"<p>Row totals are {', '.join(observed_with_totals)}; column totals are "
        f"{', '.join(f'{label} = {total}' for label, total in zip(column_labels, column_totals))}; "
        f"the grand total is \\({grand_total}\\). Degrees of freedom: "
        f"\\(df=(r-1)(c-1)=({row_count}-1)({len(column_labels)}-1)={df}\\).</p>"
        f"<p>For the requested cell, "
        f"\\(E=\\frac{{({row_totals[target_row]})({column_totals[target_column]})}}"
        f"{{{grand_total}}}={expected[target_row][target_column]:.2f}\\).</p>"
        f"<br><br>{expected_table}<br><br>{component_table}<br><br>"
        f"<p>The test statistic is \\(\\chi^2={chi2_stat:.4f}\\); "
        f"the P-value is \\({p_value:.4g}\\).</p>"
        f"<p>Since the P-value {('≤' if p_value <= alpha else '>')} "
        f"\\(\\alpha={alpha:g}\\), {('reject' if p_value <= alpha else 'fail to reject')} "
        f"\\(H_0\\). There is "
        f"{'convincing' if p_value <= alpha else 'not convincing'} statistical evidence that "
        f"{conclusion}.</p>"
    )
    return {
        "type": "chi_two_way",
        "title": "Chi-Square Test of Independence / Homogeneity",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": "Degrees of Freedom (df):",
                "input_type": "number",
                "placeholder": "df",
                "expected": [df],
                "tolerance": 0.01,
                "hint": r"Degrees of freedom for a two-way table is \(df = (r - 1)(c - 1)\), where \(r\) is the number of rows and \(c\) is the number of columns.",
            },
            {
                "step_num": 2,
                "label": (
                    f"Expected Count for ({row_labels[target_row]}, "
                    f"{column_labels[target_column]}):"
                ),
                "input_type": "number",
                "placeholder": "Expected count",
                "expected": [expected[target_row][target_column]],
                "tolerance": 0.01,
                "hint": r"Expected count for a cell is \(E = \frac{(\text{row total})(\text{column total})}{\text{grand total}}\).",
            },
            {
                "step_num": 3,
                "label": "Test Statistic (χ²):",
                "input_type": "number",
                "placeholder": "χ²",
                "expected": [chi2_stat],
                "tolerance": 0.05,
                "hint": r"Calculate \(\chi^2 = \sum \frac{(O - E)^2}{E}\) by summing the squared differences divided by expected counts across all cells.",
            },
            _decision_step(p_value, alpha, conclusion),
        ],
        "solution": f"{observed_table}{solution}",
    }


def generate_chi_problem(topic: str = "random") -> Dict[str, Any]:
    if topic == "chi_gof":
        return generate_chi_square_gof()
    if topic == "chi_two_way":
        return generate_chi_square_two_way()
    if topic == "random":
        return random.choice(
            [generate_chi_square_gof, generate_chi_square_two_way]
        )()
    raise ValueError(f"Unknown chi-square topic: {topic}")
