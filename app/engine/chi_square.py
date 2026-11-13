import random
from typing import Any, Dict, Sequence

from scipy.stats import chi2


def _decision_step(
    p_value: float, alpha: float, conclusion: str, null_conclusion: str = ""
) -> Dict[str, Any]:
    reject = p_value <= alpha
    decision = "reject" if reject else "fail to reject"
    comparison = "less than or equal to" if reject else "greater than"
    evidence = "is convincing" if reject else "is not convincing"
    step = {
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
    if null_conclusion:
        step["components"].append({
            "id": "chi-conclusion-context",
            "type": "select",
            "options": [
                {"value": null_conclusion, "label": null_conclusion},
                {"value": conclusion, "label": conclusion},
            ],
            "expected": [conclusion],
        })
        step["parts"][-2] = {"component": "chi-conclusion-context"}
    return step


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


def _hypotheses_step(null: str, alternative: str, distractor: str) -> Dict[str, Any]:
    options = [{"value": value, "label": value} for value in (null, alternative, distractor)]
    return {
        "step_num": 1,
        "label": "State Hypotheses:",
        "input_type": "cloze",
        "components": [
            {"id": "chi-null", "type": "select", "options": options, "expected": [null]},
            {"id": "chi-alternative", "type": "select", "options": options, "expected": [alternative]},
        ],
        "parts": [r"\(H_0\): ", {"component": "chi-null"}, r"; \(H_a\): ",
                  {"component": "chi-alternative"}, "."],
        "hint": r"\(H_0\) states the claimed distribution, independence, or identical distributions. \(H_a\) states a departure from that null.",
    }


def _conditions_step(minimum: float, formula: str) -> Dict[str, Any]:
    met = "Met — random sample/assignment and all expected counts E ≥ 5"
    options = [
        met,
        "Not met — at least one expected count is less than 5 (E < 5)",
        "Not met — observed counts must all be at least 5 (O ≥ 5)",
        "Not met — all expected counts must be at least 10 (E ≥ 10)",
    ]
    return {
        "step_num": 2,
        "label": "Check Conditions:",
        "input_type": "cloze",
        "components": [
            {"id": "chi-conditions", "type": "select",
             "options": [{"value": value, "label": value} for value in options],
             "expected": [met]},
            {"id": "chi-min-expected", "type": "number", "placeholder": "Minimum expected count",
             "expected": [minimum], "tolerance": 0.05},
        ],
        "parts": ["Randomness and large counts: ", {"component": "chi-conditions"},
                  r". Smallest expected count \(E_{\min}\): ", {"component": "chi-min-expected"}, "."],
        "hint": rf"Check the stated sampling design, calculate every expected count using {formula}, and compare the smallest with \(5\).",
    }


def _calculation_steps(
    df: int, statistic: float, p_value: float, df_formula: str,
) -> list[Dict[str, Any]]:
    return [
        {
            "step_num": 3,
            "label": "Degrees of Freedom (df):",
            "input_type": "number",
            "placeholder": "df",
            "expected": [df],
            "tolerance": 0.01,
            "hint": rf"Use {df_formula}.",
        },
        {
            "step_num": 4,
            "label": "Test Statistic & P-value:",
            "input_type": "compound",
            "inputs": [
                {"id": "chi-statistic", "label": "χ²", "type": "number", "input_type": "math",
                 "math_symbols": ["frac", "pow", "parens"], "expected": [statistic], "tolerance": 0.05},
                {"id": "chi-test-p-value", "label": "P-value", "type": "number",
                 "expected": [p_value], "tolerance": 0.001},
            ],
            "hint": r"Sum \(\chi^2=\sum (O-E)^2/E\), then find the right-tail area \(P(\chi^2_{df}\geq\chi^2_{\mathrm{obs}})\).",
        },
    ]


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
    null = f"the category proportions for {sample_description} match the claimed distribution"
    alternative = f"at least one category proportion for {sample_description} differs from the claimed distribution"
    distractor = f"the observed counts for {sample_description} exactly equal their expected counts"
    solution = (
        "<p><strong>Goodness-of-fit test</strong></p>"
        f"<p>\\(H_0\\): {null}. \\(H_a\\): {alternative}.</p>"
        f"<p>The sample is random. Using \\(E_i=np_i\\), "
        f"\\(E_{{\\min}}={n}({min(proportions):g})={min(expected):.2f}\\geq 5\\), "
        "so the large-counts condition is met.</p>"
        f"<p>Degrees of freedom: \\(df=k-1={len(categories)}-1={df}\\).</p>"
        f"<p>Expected counts are \\(({', '.join(f'{value:.2f}' for value in expected)})\\); "
        f"all are at least 5. The test statistic is "
        f"\\(\\chi^2=\\sum (O_i-E_i)^2/E_i={chi2_stat:.4f}\\), and "
        f"\\(P(\\chi^2_{{{df}}}\\geq {chi2_stat:.4f})={p_value:.4g}\\).</p>"
        f"<br><br>{_count_table(categories, observed, expected)}<br><br>"
        f"<p>Since the P-value {('≤' if p_value <= alpha else '>')} "
        f"\\(\\alpha={alpha:g}\\), {('reject' if p_value <= alpha else 'fail to reject')} "
        f"\\(H_0\\). There is "
        f"{'convincing' if p_value <= alpha else 'not convincing'} statistical evidence that the "
        "distribution of categories differs from the hypothesized distribution.</p>"
    )
    decision = _decision_step(p_value, alpha, alternative, null)
    decision["step_num"] = 5
    steps = [
        _hypotheses_step(null, alternative, distractor),
        _conditions_step(min(expected), r"\(E_i=np_i\)"),
        *_calculation_steps(df, chi2_stat, p_value, r"\(df=k-1\)"),
        decision,
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
                "step_num": 6,
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
                "hint": r"Compare \((O_i-E_i)^2/E_i\) across categories, then compare \(O_i\) with \(E_i\) for the largest contributor.",
            }
        )
        solution += (
            f"<p>The largest contribution is for {largest_contributor}: "
            f"\\((O-E)^2/E={components[largest_index]:.4f}\\); "
            f"the category had {direction}.</p>"
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


def _generate_chi_square_two_way(kind: str) -> Dict[str, Any]:
    if kind == "chi_independence":
        scenarios = [
            ("students", "grade level", "preferred study spot",
             ["Grade 9", "Grade 10", "Grade 11"], ["Library", "Home", "Cafe"],
             [[0.55, 0.30, 0.15], [0.35, 0.40, 0.25], [0.25, 0.30, 0.45]]),
            ("adults", "age bracket", "commuting mode",
             ["Age 18-34", "Age 35-54"], ["Car", "Transit", "Walk"],
             [[0.45, 0.40, 0.15], [0.65, 0.25, 0.10]]),
            ("college students", "major", "housing type",
             ["Science", "Arts"], ["On campus", "Off campus", "Family"],
             [[0.50, 0.30, 0.20], [0.30, 0.45, 0.25]]),
        ]
    else:
        scenarios = [
            ("patients", "treatment group", "recovery outcome",
             ["Control", "Treatment"], ["No improvement", "Improved", "Recovered"],
             [[0.55, 0.30, 0.15], [0.30, 0.35, 0.35]]),
            ("customers", "store", "satisfaction rating",
             ["Store A", "Store B"], ["Low", "Medium", "High"],
             [[0.30, 0.40, 0.30], [0.15, 0.35, 0.50]]),
            ("students", "class section", "course outcome",
             ["Morning", "Evening"], ["Pass", "Fail"],
             [[0.75, 0.25], [0.60, 0.40]]),
        ]
    population, row_variable, response, row_labels, column_labels, row_probabilities = random.choice(scenarios)
    row_count = len(row_labels)
    while True:
        if kind == "chi_independence":
            n = random.randint(150, 300)
            cells = [(r, c) for r in range(row_count) for c in range(len(column_labels))]
            weights = [row_probabilities[r][c] / row_count for r, c in cells]
            draws = random.choices(cells, weights=weights, k=n)
            observed = [[draws.count((r, c)) for c in range(len(column_labels))]
                        for r in range(row_count)]
        else:
            row_totals = [random.randint(50, 150) for _ in row_labels]
            observed = []
            for probabilities, row_total in zip(row_probabilities, row_totals):
                draws = random.choices(range(len(column_labels)), weights=probabilities, k=row_total)
                observed.append([draws.count(column) for column in range(len(column_labels))])
        row_totals = [sum(row) for row in observed]
        column_totals = [sum(row[c] for row in observed) for c in range(len(column_labels))]
        grand_total = sum(row_totals)
        if all(row * col / grand_total >= 5 for row in row_totals for col in column_totals):
            break
    independence = kind == "chi_independence"
    if independence:
        title = "Chi-Square Test for Independence"
        sampling = f"A single random sample of {population} is cross-classified by {row_variable} and {response}."
        null = f"{row_variable} and {response} are independent in the population of {population}"
        alternative = f"{row_variable} and {response} are associated (not independent) in the population of {population}"
        distractor = f"every category of {row_variable} and {response} has the same population proportion"
    else:
        title = "Chi-Square Test for Homogeneity"
        sampling = f"Independent random samples of {population} are taken from each {row_variable} group."
        null = f"the distribution of {response} is the same across the {row_variable} populations"
        alternative = f"the distribution of {response} differs across the {row_variable} populations"
        distractor = f"every {response} category is equally likely within each {row_variable} group"
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
    min_row, min_column = min(
        ((row, column) for row in range(row_count) for column in range(len(column_labels))),
        key=lambda cell: expected[cell[0]][cell[1]],
    )
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

    observed_table = _matrix_latex(
        "Observed counts",
        row_labels,
        column_labels,
        observed,
        "d",
    )
    prompt = (
        f"{sampling} The observed counts are shown below. At \\(\\alpha={alpha:g}\\), "
        f"test whether {alternative}.<br><br>{observed_table}"
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
        f"<p><strong>{title}</strong></p>"
        f"<p>H₀: {null}. Hₐ: {alternative}.</p>"
        f"<p>Row totals are {', '.join(observed_with_totals)}; column totals are "
        f"{', '.join(f'{label} = {total}' for label, total in zip(column_labels, column_totals))}; "
        f"the grand total is \\({grand_total}\\). Degrees of freedom: "
        f"\\(df=(r-1)(c-1)=({row_count}-1)({len(column_labels)}-1)={df}\\).</p>"
        f"<p>The sampling design is random. Using \\(E_{{ij}}=R_iC_j/N\\), "
        f"the smallest expected count is for ({row_labels[min_row]}, {column_labels[min_column]}): "
        f"\\(E_{{\\min}}=\\frac{{{row_totals[min_row]}\\cdot {column_totals[min_column]}}}"
        f"{{{grand_total}}}={expected[min_row][min_column]:.2f}\\geq5\\), "
        "so the large-counts condition is met.</p>"
        f"<br><br>{expected_table}<br><br>{component_table}<br><br>"
        f"<p>The test statistic is \\(\\chi^2=\\sum (O-E)^2/E={chi2_stat:.4f}\\); "
        f"\\(P(\\chi^2_{{{df}}}\\geq {chi2_stat:.4f})={p_value:.4g}\\).</p>"
        f"<p>Since the P-value {('≤' if p_value <= alpha else '>')} "
        f"\\(\\alpha={alpha:g}\\), {('reject' if p_value <= alpha else 'fail to reject')} "
        f"\\(H_0\\). There is "
        f"{'convincing' if p_value <= alpha else 'not convincing'} statistical evidence that "
        f"{alternative}.</p>"
    )
    decision = _decision_step(p_value, alpha, alternative, null)
    decision["step_num"] = 5
    return {
        "type": kind,
        "topic": kind,
        "title": title,
        "prompt": prompt,
        "steps": [
            _hypotheses_step(null, alternative, distractor),
            _conditions_step(min(min(row) for row in expected), r"\(E_{ij}=R_iC_j/N\)"),
            *_calculation_steps(df, chi2_stat, p_value, r"\(df=(r-1)(c-1)\)"),
            decision,
        ],
        "solution": f"{observed_table}{solution}",
    }


def generate_chi_square_independence() -> Dict[str, Any]:
    return _generate_chi_square_two_way("chi_independence")


def generate_chi_square_homogeneity() -> Dict[str, Any]:
    return _generate_chi_square_two_way("chi_homogeneity")


def generate_chi_square_two_way() -> Dict[str, Any]:
    problem = random.choice([generate_chi_square_independence, generate_chi_square_homogeneity])()
    problem["type"] = "chi_two_way"
    problem["topic"] = "chi_two_way"
    return problem


def generate_chi_problem(topic: str = "random") -> Dict[str, Any]:
    if topic == "chi_gof":
        return generate_chi_square_gof()
    if topic == "chi_two_way":
        return generate_chi_square_two_way()
    if topic == "chi_independence":
        return generate_chi_square_independence()
    if topic == "chi_homogeneity":
        return generate_chi_square_homogeneity()
    if topic == "random":
        return random.choice(
            [generate_chi_square_gof, generate_chi_square_two_way]
        )()
    raise ValueError(f"Unknown chi-square topic: {topic}")
