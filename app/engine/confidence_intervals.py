import random
import math
from scipy.stats import norm, t

def generate_mean_t_interval():
    """Generates a 1-sample t confidence interval problem for a population mean."""
    n = random.choice([16, 20, 25, 30, 36, 40, 49, 50])
    df = n - 1
    conf_level = random.choice([90, 95, 98, 99])
    alpha = (100 - conf_level) / 100.0
    
    xbar = round(random.uniform(45.0, 110.0), 1)
    s = round(random.uniform(4.0, 15.0), 1)
    
    # Critical value t*
    t_star_exact = t.ppf(1.0 - alpha / 2.0, df)
    t_star_rounded = round(t_star_exact, 3)
    
    # Standard Error & Margin of Error
    se = s / math.sqrt(n)
    moe_exact = t_star_exact * se
    moe_table = t_star_rounded * se
    
    # Interval bounds
    lower_exact = round(xbar - moe_exact, 2)
    upper_exact = round(xbar + moe_exact, 2)
    lower_table = round(xbar - moe_table, 2)
    upper_table = round(xbar + moe_table, 2)

    solution_html = (
        f"<p><strong>Step 1: Point Estimate & Degrees of Freedom</strong></p>"
        f"$$\\bar{{x}} = {xbar},\\quad n = {n},\\quad s = {s}$$"
        f"$$\\text{{Degrees of freedom: }}\\; df = n - 1 = {n} - 1 = {df}$$"
        f"<p><strong>Step 2: Find Critical Value \\(t^*\\)</strong></p>"
        f"$$\\text{{For a }}\\; {conf_level}\\%\\; \\text{{interval with }}\\; df = {df}:\\quad t^* \\approx {t_star_rounded}$$"
        f"<p><strong>Step 3: Calculate Standard Error and Margin of Error (E)</strong></p>"
        f"$$SE = \\frac{{s}}{{\\sqrt{{n}}}} = \\frac{{{s}}}{{\\sqrt{{{n}}}}} = \\frac{{{s}}}{{{round(math.sqrt(n), 4)}}} \\approx {round(se, 4)}$$"
        f"$$E = t^* \\cdot \\left(\\frac{{s}}{{\\sqrt{{n}}}}\\right) = ({t_star_rounded})({round(se, 4)}) \\approx \\mathbf{{{round(moe_table, 3)}}}$$"
        f"<p><strong>Step 4: Construct the Interval Bounds \\((L, U)\\)</strong></p>"
        f"$$L = \\bar{{x}} - E = {xbar} - {round(moe_table, 2)} = \\mathbf{{{lower_table}}}$$"
        f"$$U = \\bar{{x}} + E = {xbar} + {round(moe_table, 2)} = \\mathbf{{{upper_table}}}$$"
        f"<p>Confidence Interval: \\(({lower_table}, {upper_table})\\)</p>"
    )

    return {
        "type": "mean_t",
        "title": f"1-Sample t-Interval for Mean ({conf_level}%)",
        "prompt": (
            f"A simple random sample of size \\(n = {n}\\) yields a sample mean \\(\\bar{{x}} = {xbar}\\) "
            f"and sample standard deviation \\(s = {s}\\). Construct a <strong>{conf_level}%</strong> "
            f"confidence interval for the population mean \\(\\mu\\)."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Point Estimate (x̄):",
                "placeholder": "e.g. 72.4",
                "expected": [xbar],
                "tolerance": 0.05,
                "hint": "The sample mean is your unbiased point estimate."
            },
            {
                "step_num": 2,
                "label": f"Critical Value t* (df = {df}):",
                "placeholder": "e.g. 2.064",
                "expected": [t_star_rounded, round(t_star_exact, 3), round(t_star_exact, 4)],
                "tolerance": 0.02,
                "hint": f"Look up t* with df = {df} for {conf_level}% confidence or use invT."
            },
            {
                "step_num": 3,
                "label": "Margin of Error (E):",
                "placeholder": "e.g. 3.25",
                "expected": [round(moe_table, 2), round(moe_exact, 2), round(moe_table, 3)],
                "tolerance": 0.08,
                "hint": "E = t* · (s / √n)"
            },
            {
                "step_num": 4,
                "label": "Lower Bound (L):",
                "placeholder": "e.g. 69.15",
                "expected": [lower_table, lower_exact],
                "tolerance": 0.15,
                "hint": "L = x̄ - E"
            },
            {
                "step_num": 5,
                "label": "Upper Bound (U):",
                "placeholder": "e.g. 75.65",
                "expected": [upper_table, upper_exact],
                "tolerance": 0.15,
                "hint": "U = x̄ + E"
            }
        ],
        "solution": solution_html
    }

def generate_proportion_z_interval():
    """Generates a 1-sample z confidence interval problem for a population proportion."""
    n = random.choice([100, 150, 200, 250, 400, 500])
    p_true = random.uniform(0.25, 0.75)
    x = int(round(n * p_true))
    phat = round(x / n, 4)
    qhat = round(1.0 - phat, 4)
    
    conf_level = random.choice([90, 95, 98, 99])
    alpha = (100 - conf_level) / 100.0
    
    z_star_exact = norm.ppf(1.0 - alpha / 2.0)
    z_star_rounded = round(z_star_exact, 3)
    if conf_level == 90:
        z_star_rounded = 1.645
    elif conf_level == 95:
        z_star_rounded = 1.96
    elif conf_level == 99:
        z_star_rounded = 2.576
        
    se = math.sqrt((phat * qhat) / n)
    moe_exact = z_star_exact * se
    moe_table = z_star_rounded * se
    
    lower_exact = round(phat - moe_exact, 4)
    upper_exact = round(phat + moe_exact, 4)
    lower_table = round(phat - moe_table, 4)
    upper_table = round(phat + moe_table, 4)

    solution_html = (
        f"<p><strong>Step 1: Point Estimate (p̂)</strong></p>"
        f"$$\\hat{{p}} = \\frac{{x}}{{n}} = \\frac{{{x}}}{{{n}}} = \\mathbf{{{phat}}}$$"
        f"<p><strong>Step 2: Find Critical Value \\(z^*\\)</strong></p>"
        f"$$\\text{{For }}\\; {conf_level}\\%\\; \\text{{confidence:}}\\quad z^* = \\mathbf{{{z_star_rounded}}}$$"
        f"<p><strong>Step 3: Standard Error and Margin of Error (E)</strong></p>"
        f"$$SE = \\sqrt{{\\frac{{\\hat{{p}}\\hat{{q}}}}{{n}}}} = \\sqrt{{\\frac{{({phat})({qhat})}}{{{n}}}}} \\approx {round(se, 5)}$$"
        f"$$E = z^* \\cdot SE = ({z_star_rounded})({round(se, 5)}) \\approx \\mathbf{{{round(moe_table, 4)}}}$$"
        f"<p><strong>Step 4: Interval Bounds \\((L, U)\\)</strong></p>"
        f"$$L = \\hat{{p}} - E = {phat} - {round(moe_table, 4)} = \\mathbf{{{lower_table}}}$$"
        f"$$U = \\hat{{p}} + E = {phat} + {round(moe_table, 4)} = \\mathbf{{{upper_table}}}$$"
        f"<p>Confidence Interval: \\(({lower_table}, {upper_table})\\)</p>"
    )

    return {
        "type": "prop_z",
        "title": f"1-Sample z-Interval for Proportion ({conf_level}%)",
        "prompt": (
            f"In a random sample of \\(n = {n}\\) surveyed individuals, \\(x = {x}\\) responded favorably. "
            f"Construct a <strong>{conf_level}%</strong> confidence interval for the true population proportion \\(p\\). "
            f"Round intermediate decimals and bounds to four places."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Point Estimate (p̂):",
                "placeholder": "e.g. 0.4500",
                "expected": [phat],
                "tolerance": 0.005,
                "hint": "p̂ = x / n"
            },
            {
                "step_num": 2,
                "label": "Critical Value z*:",
                "placeholder": "e.g. 1.96",
                "expected": [z_star_rounded, round(z_star_exact, 3), round(z_star_exact, 2)],
                "tolerance": 0.02,
                "hint": f"Standard z* for {conf_level}% confidence."
            },
            {
                "step_num": 3,
                "label": "Margin of Error (E):",
                "placeholder": "e.g. 0.0485",
                "expected": [round(moe_table, 4), round(moe_exact, 4)],
                "tolerance": 0.003,
                "hint": "E = z* · √[p̂(1 - p̂) / n]"
            },
            {
                "step_num": 4,
                "label": "Lower Bound (L):",
                "placeholder": "e.g. 0.4015",
                "expected": [lower_table, lower_exact],
                "tolerance": 0.005,
                "hint": "L = p̂ - E"
            },
            {
                "step_num": 5,
                "label": "Upper Bound (U):",
                "placeholder": "e.g. 0.4985",
                "expected": [upper_table, upper_exact],
                "tolerance": 0.005,
                "hint": "U = p̂ + E"
            }
        ],
        "solution": solution_html
    }

def generate_two_sample_mean_t_interval():
    """Generates a conservative two-sample t confidence interval for a difference in means."""
    n1 = random.choice([16, 20, 25, 30, 36])
    n2 = random.choice([16, 20, 25, 30, 36])
    df = min(n1 - 1, n2 - 1)
    conf_level = random.choice([90, 95, 99])
    alpha = (100 - conf_level) / 100.0

    xbar1 = round(random.uniform(45.0, 110.0), 1)
    xbar2 = round(random.uniform(45.0, 110.0), 1)
    s1 = round(random.uniform(4.0, 15.0), 1)
    s2 = round(random.uniform(4.0, 15.0), 1)
    difference = xbar1 - xbar2
    se = math.sqrt((s1 ** 2 / n1) + (s2 ** 2 / n2))
    t_star_exact = t.ppf(1.0 - alpha / 2.0, df)
    t_star = round(t_star_exact, 3)
    moe = round(t_star * se, 2)
    lower = round(difference - moe, 2)
    upper = round(difference + moe, 2)
    point_estimate = round(difference, 2)

    solution_html = (
        f"<p><strong>Step 1: Point Estimate (x̄₁ - x̄₂)</strong></p>"
        f"$$\\bar{{x}}_1 - \\bar{{x}}_2 = {xbar1} - {xbar2} = \\mathbf{{{point_estimate}}}$$"
        f"<p><strong>Step 2: Conservative Degrees of Freedom</strong></p>"
        f"$$df = \\min(n_1 - 1, n_2 - 1) = \\min({n1} - 1, {n2} - 1) = \\mathbf{{{df}}}$$"
        f"<p><strong>Step 3: Critical Value (t*)</strong></p>"
        f"$$t^* = t_{{{1.0 - alpha / 2.0:.3f},\\,{df}}} \\approx \\mathbf{{{t_star}}}$$"
        f"<p><strong>Step 4: Margin of Error (E)</strong></p>"
        f"$$SE = \\sqrt{{\\frac{{s_1^2}}{{n_1}} + \\frac{{s_2^2}}{{n_2}}}}"
        f" = \\sqrt{{\\frac{{{s1}^2}}{{{n1}}} + \\frac{{{s2}^2}}{{{n2}}}}} \\approx {round(se, 4)}$$"
        f"$$E = t^* \\cdot SE = ({t_star})({round(se, 4)}) \\approx \\mathbf{{{moe}}}$$"
        f"<p><strong>Step 5: Lower Bound (L)</strong></p>"
        f"$$L = ({point_estimate}) - ({moe}) = \\mathbf{{{lower}}}$$"
        f"<p><strong>Step 6: Upper Bound (U)</strong></p>"
        f"$$U = ({point_estimate}) + ({moe}) = \\mathbf{{{upper}}}$$"
        f"<p>Confidence Interval for \\(\\mu_1 - \\mu_2\\): \\(({lower}, {upper})\\)</p>"
    )

    return {
        "type": "mean_t_2samp",
        "title": f"2-Sample t-Interval for Means ({conf_level}%)",
        "prompt": (
            f"Independent random samples have \\(n_1 = {n1}\\), "
            f"\\(\\bar{{x}}_1 = {xbar1}\\), and \\(s_1 = {s1}\\), and "
            f"\\(n_2 = {n2}\\), \\(\\bar{{x}}_2 = {xbar2}\\), and \\(s_2 = {s2}\\). "
            f"Construct a <strong>{conf_level}%</strong> confidence interval for "
            f"\\(\\mu_1 - \\mu_2\\) using the conservative degrees of freedom "
            f"\\(df = \\min(n_1 - 1, n_2 - 1)\\). Round the point estimate and bounds to "
            f"two decimals, the critical value to three decimals, and the margin of error to two decimals."
        ),
        "steps": [
            {"step_num": 1, "label": "Point Estimate (x̄₁ - x̄₂):", "placeholder": "e.g. 4.25",
             "expected": [point_estimate], "tolerance": 0.05,
             "hint": "Subtract the second sample mean from the first."},
            {"step_num": 2, "label": "Conservative Degrees of Freedom (df):", "placeholder": "e.g. 15",
             "expected": [df], "tolerance": 0.01,
             "hint": "Use the smaller of n₁ - 1 and n₂ - 1."},
            {"step_num": 3, "label": "Critical Value t*:", "placeholder": "e.g. 2.131",
             "expected": [t_star], "tolerance": 0.01,
             "hint": f"Use {conf_level}% confidence with the conservative df."},
            {"step_num": 4, "label": "Margin of Error (E):", "placeholder": "e.g. 5.42",
             "expected": [moe], "tolerance": 0.08,
             "hint": "E = t* · √(s₁²/n₁ + s₂²/n₂)"},
            {"step_num": 5, "label": "Lower Bound (L):", "placeholder": "e.g. -1.17",
             "expected": [lower], "tolerance": 0.12,
             "hint": "L = (x̄₁ - x̄₂) - E"},
            {"step_num": 6, "label": "Upper Bound (U):", "placeholder": "e.g. 9.67",
             "expected": [upper], "tolerance": 0.12,
             "hint": "U = (x̄₁ - x̄₂) + E"}
        ],
        "solution": solution_html
    }

def generate_two_sample_prop_z_interval():
    """Generates a two-sample z confidence interval for a difference in proportions."""
    n1 = random.choice([100, 150, 200, 250, 300])
    n2 = random.choice([100, 150, 200, 250, 300])
    x1 = random.randint(int(n1 * 0.2), int(n1 * 0.8))
    x2 = random.randint(int(n2 * 0.2), int(n2 * 0.8))
    p1_hat = x1 / n1
    p2_hat = x2 / n2
    difference = p1_hat - p2_hat
    se = math.sqrt(
        (p1_hat * (1.0 - p1_hat) / n1) +
        (p2_hat * (1.0 - p2_hat) / n2)
    )
    conf_level = random.choice([90, 95, 99])
    z_star = {90: 1.645, 95: 1.960, 99: 2.576}[conf_level]
    moe = round(z_star * se, 4)
    point_estimate = round(difference, 4)
    lower = round(difference - moe, 4)
    upper = round(difference + moe, 4)
    p1_display = round(p1_hat, 4)
    p2_display = round(p2_hat, 4)

    solution_html = (
        f"<p><strong>Step 1: Point Estimate (p̂₁ - p̂₂)</strong></p>"
        f"$$\\hat{{p}}_1 - \\hat{{p}}_2 = \\frac{{{x1}}}{{{n1}}} - \\frac{{{x2}}}{{{n2}}}"
        f" = {p1_display} - {p2_display} = \\mathbf{{{point_estimate}}}$$"
        f"<p><strong>Step 2: Critical Value (z*)</strong></p>"
        f"$$z^* = \\mathbf{{{z_star}}}\\quad\\text{{for }}{conf_level}\\%\\text{{ confidence}}$$"
        f"<p><strong>Step 3: Margin of Error (E)</strong></p>"
        f"$$SE = \\sqrt{{\\frac{{\\hat{{p}}_1(1-\\hat{{p}}_1)}}{{n_1}} + "
        f"\\frac{{\\hat{{p}}_2(1-\\hat{{p}}_2)}}{{n_2}}}} \\approx {round(se, 5)}$$"
        f"$$E = z^* \\cdot SE = ({z_star})({round(se, 5)}) \\approx \\mathbf{{{moe}}}$$"
        f"<p><strong>Step 4: Lower Bound (L)</strong></p>"
        f"$$L = ({point_estimate}) - ({moe}) = \\mathbf{{{lower}}}$$"
        f"<p><strong>Step 5: Upper Bound (U)</strong></p>"
        f"$$U = ({point_estimate}) + ({moe}) = \\mathbf{{{upper}}}$$"
        f"<p>Confidence Interval for \\(p_1 - p_2\\): \\(({lower}, {upper})\\)</p>"
    )

    return {
        "type": "prop_z_2samp",
        "title": f"2-Sample z-Interval for Proportions ({conf_level}%)",
        "prompt": (
            f"In two independent random samples, {x1} of {n1} individuals in group 1 and "
            f"{x2} of {n2} individuals in group 2 have the characteristic of interest. "
            f"Construct a <strong>{conf_level}%</strong> confidence interval for "
            f"\\(p_1 - p_2\\). Round the point estimate, margin of error, and bounds to four decimals."
        ),
        "steps": [
            {"step_num": 1, "label": "Point Estimate (p̂₁ - p̂₂):", "placeholder": "e.g. 0.0525",
             "expected": [point_estimate], "tolerance": 0.001,
             "hint": "Compute p̂₁ = x₁/n₁ and p̂₂ = x₂/n₂, then subtract."},
            {"step_num": 2, "label": "Critical Value z*:", "placeholder": "e.g. 1.960",
             "expected": [z_star], "tolerance": 0.01,
             "hint": f"Use the z* value for {conf_level}% confidence."},
            {"step_num": 3, "label": "Margin of Error (E):", "placeholder": "e.g. 0.0834",
             "expected": [moe], "tolerance": 0.002,
             "hint": "E = z* · √[p̂₁(1-p̂₁)/n₁ + p̂₂(1-p̂₂)/n₂]"},
            {"step_num": 4, "label": "Lower Bound (L):", "placeholder": "e.g. -0.0309",
             "expected": [lower], "tolerance": 0.003,
             "hint": "L = (p̂₁ - p̂₂) - E"},
            {"step_num": 5, "label": "Upper Bound (U):", "placeholder": "e.g. 0.1360",
             "expected": [upper], "tolerance": 0.003,
             "hint": "U = (p̂₁ - p̂₂) + E"}
        ],
        "solution": solution_html
    }

def generate_matched_pairs_t_interval():
    """Generates a matched-pairs t confidence interval for a population mean difference."""
    n = random.choice([12, 15, 18, 20, 25])
    df = n - 1
    d_bar = round(random.uniform(-8.0, 8.0), 1)
    s_d = round(random.uniform(2.0, 8.0), 1)
    conf_level = random.choice([90, 95, 99])
    alpha = (100 - conf_level) / 100.0
    t_star_exact = t.ppf(1.0 - alpha / 2.0, df)
    t_star = round(t_star_exact, 3)
    se = s_d / math.sqrt(n)
    moe = round(t_star * se, 2)
    lower = round(d_bar - moe, 2)
    upper = round(d_bar + moe, 2)

    solution_html = (
        f"<p><strong>Step 1: Point Estimate (d̄)</strong></p>"
        f"$$\\bar{{d}} = \\mathbf{{{d_bar}}}$$"
        f"<p><strong>Step 2: Critical Value (t*)</strong></p>"
        f"$$df = n - 1 = {n} - 1 = {df},\\quad "
        f"t^* = t_{{{1.0 - alpha / 2.0:.3f},\\,{df}}} \\approx \\mathbf{{{t_star}}}$$"
        f"<p><strong>Step 3: Margin of Error (E)</strong></p>"
        f"$$SE = \\frac{{s_d}}{{\\sqrt{{n}}}} = \\frac{{{s_d}}}{{\\sqrt{{{n}}}}} "
        f"\\approx {round(se, 4)}$$"
        f"$$E = t^* \\cdot SE = ({t_star})({round(se, 4)}) \\approx \\mathbf{{{moe}}}$$"
        f"<p><strong>Step 4: Lower Bound (L)</strong></p>"
        f"$$L = \\bar{{d}} - E = {d_bar} - ({moe}) = \\mathbf{{{lower}}}$$"
        f"<p><strong>Step 5: Upper Bound (U)</strong></p>"
        f"$$U = \\bar{{d}} + E = {d_bar} + ({moe}) = \\mathbf{{{upper}}}$$"
        f"<p>Confidence Interval for the population mean difference \\(\\mu_{{\\text{{diff}}}}\\): "
        f"\\(({lower}, {upper})\\)</p>"
    )

    return {
        "type": "matched_pairs_t",
        "title": f"Matched Pairs t-Interval for μ_diff ({conf_level}%)",
        "prompt": (
            f"For {n} matched pairs, the sample mean of the paired differences is "
            f"\\(\\bar{{d}} = {d_bar}\\) and their sample standard deviation is "
            f"\\(s_d = {s_d}\\). Construct a <strong>{conf_level}%</strong> confidence "
            f"interval for the population mean difference \\(\\mu_{{\\text{{diff}}}}\\). Use "
            f"\\(df = n - 1\\). Round the margin of error and bounds to two decimals."
        ),
        "steps": [
            {"step_num": 1, "label": "Point Estimate (d̄):", "placeholder": "e.g. 2.4",
             "expected": [d_bar], "tolerance": 0.05,
             "hint": "The sample mean difference is the point estimate."},
            {"step_num": 2, "label": f"Critical Value t* (df = {df}):", "placeholder": "e.g. 2.145",
             "expected": [t_star], "tolerance": 0.01,
             "hint": f"Use {conf_level}% confidence with df = n - 1 = {df}."},
            {"step_num": 3, "label": "Margin of Error (E):", "placeholder": "e.g. 2.35",
             "expected": [moe], "tolerance": 0.08,
             "hint": "E = t* · (s_d / √n)"},
            {"step_num": 4, "label": "Lower Bound (L):", "placeholder": "e.g. -0.05",
             "expected": [lower], "tolerance": 0.12,
             "hint": "L = d̄ - E"},
            {"step_num": 5, "label": "Upper Bound (U):", "placeholder": "e.g. 4.75",
             "expected": [upper], "tolerance": 0.12,
             "hint": "U = d̄ + E"}
        ],
        "solution": solution_html
    }

def generate_ci_problem(topic: str = "random"):
    if topic == "mean_t":
        return generate_mean_t_interval()
    elif topic == "prop_z":
        return generate_proportion_z_interval()
    elif topic == "mean_t_2samp":
        return generate_two_sample_mean_t_interval()
    elif topic == "prop_z_2samp":
        return generate_two_sample_prop_z_interval()
    elif topic == "matched_pairs_t":
        return generate_matched_pairs_t_interval()
    return random.choice([
        generate_mean_t_interval,
        generate_proportion_z_interval,
        generate_two_sample_mean_t_interval,
        generate_two_sample_prop_z_interval,
        generate_matched_pairs_t_interval
    ])()
