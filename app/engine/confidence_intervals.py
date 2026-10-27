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

def generate_ci_problem(topic: str = "random"):
    if topic == "mean_t":
        return generate_mean_t_interval()
    elif topic == "prop_z":
        return generate_proportion_z_interval()
    return random.choice([generate_mean_t_interval, generate_proportion_z_interval])()
