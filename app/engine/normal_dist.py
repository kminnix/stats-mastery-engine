import random
from scipy.stats import norm

def generate_between_problem():
    mu = round(random.uniform(60, 85), 1)
    sigma = round(random.uniform(6, 14), 1)
    
    z1 = round(random.uniform(-2.2, -0.3), 2)
    z2 = round(random.uniform(0.3, 2.2), 2)
    
    x1 = round(mu + z1 * sigma, 1)
    x2 = round(mu + z2 * sigma, 1)
    
    calc_z1 = round((x1 - mu) / sigma, 2)
    calc_z2 = round((x2 - mu) / sigma, 2)
    
    phi1 = round(norm.cdf(calc_z1), 4)
    phi2 = round(norm.cdf(calc_z2), 4)
    prob_table = round(phi2 - phi1, 4)
    prob_exact = round(norm.cdf((x2 - mu) / sigma) - norm.cdf((x1 - mu) / sigma), 4)
    
    diff1 = round(x1 - mu, 1)
    diff2 = round(x2 - mu, 1)

    solution_latex = (
        f"<p><strong>Step 1: Identify Parameters</strong></p>"
        f"$$\\mu = {mu},\\quad \\sigma = {sigma}$$"
        f"<p><strong>Step 2: Convert Boundaries to z-scores</strong></p>"
        f"$$z_1 = \\frac{{{x1} - {mu}}}{{{sigma}}} = \\frac{{{diff1}}}{{{sigma}}} \\approx {calc_z1}$$"
        f"$$z_2 = \\frac{{{x2} - {mu}}}{{{sigma}}} = \\frac{{{diff2}}}{{{sigma}}} \\approx {calc_z2}$$"
        f"<p><strong>Step 3: Determine Cumulative Probabilities (Phi)</strong></p>"
        f"$$P(Z < {calc_z1}) \\approx {phi1},\\quad P(Z < {calc_z2}) \\approx {phi2}$$"
        f"<p><strong>Step 4: Subtract Cumulative Areas</strong></p>"
        f"$$P({x1} < X < {x2}) = P({calc_z1} < Z < {calc_z2}) = {phi2} - {phi1} = \\mathbf{{{prob_table}}}$$"
        f"<p><em>(Calculator exact via normalcdf: {prob_exact})</em></p>"
    )

    return {
        "type": "between",
        "input_label": "Probability:",
        "placeholder": "e.g. 0.4532",
        "prompt": f"A continuous random variable \\(X\\) is normally distributed with mean \\(\\mu = {mu}\\) and standard deviation \\(\\sigma = {sigma}\\). Find \\(P({x1} < X < {x2})\\). Round your answer to four decimal places.",
        "expected_answers": [prob_table, prob_exact],
        "tolerance": 0.005,
        "solution": solution_latex,
        "plot_data": {
            "type": "between",
            "mu": mu,
            "sigma": sigma,
            "z1": calc_z1,
            "z2": calc_z2,
            "x1": x1,
            "x2": x2
        }
    }

def generate_left_tail_problem():
    mu = round(random.uniform(50, 100), 1)
    sigma = round(random.uniform(5, 15), 1)
    
    z = round(random.uniform(-2.3, 1.8), 2)
    x = round(mu + z * sigma, 1)
    calc_z = round((x - mu) / sigma, 2)
    
    prob_table = round(norm.cdf(calc_z), 4)
    prob_exact = round(norm.cdf((x - mu) / sigma), 4)
    diff = round(x - mu, 1)

    solution_latex = (
        f"<p><strong>Step 1: Identify Parameters</strong></p>"
        f"$$\\mu = {mu},\\quad \\sigma = {sigma}$$"
        f"<p><strong>Step 2: Standardize to a z-score</strong></p>"
        f"$$z = \\frac{{{x} - {mu}}}{{{sigma}}} = \\frac{{{diff}}}{{{sigma}}} \\approx {calc_z}$$"
        f"<p><strong>Step 3: Cumulative Probability</strong></p>"
        f"$$P(X < {x}) = P(Z < {calc_z}) = \\Phi({calc_z}) = \\mathbf{{{prob_table}}}$$"
        f"<p><em>(Calculator exact via normalcdf: {prob_exact})</em></p>"
    )

    return {
        "type": "left_tail",
        "input_label": "Probability:",
        "placeholder": "e.g. 0.1587",
        "prompt": f"A continuous random variable \\(X\\) is normally distributed with mean \\(\\mu = {mu}\\) and standard deviation \\(\\sigma = {sigma}\\). Find \\(P(X < {x})\\). Round your answer to four decimal places.",
        "expected_answers": [prob_table, prob_exact],
        "tolerance": 0.005,
        "solution": solution_latex,
        "plot_data": {
            "type": "left_tail",
            "mu": mu,
            "sigma": sigma,
            "z": calc_z,
            "x": x
        }
    }

def generate_right_tail_problem():
    mu = round(random.uniform(50, 100), 1)
    sigma = round(random.uniform(5, 15), 1)
    
    z = round(random.uniform(-1.8, 2.3), 2)
    x = round(mu + z * sigma, 1)
    calc_z = round((x - mu) / sigma, 2)
    
    phi = round(norm.cdf(calc_z), 4)
    prob_table = round(1.0 - phi, 4)
    prob_exact = round(1.0 - norm.cdf((x - mu) / sigma), 4)
    diff = round(x - mu, 1)

    solution_latex = (
        f"<p><strong>Step 1: Identify Parameters</strong></p>"
        f"$$\\mu = {mu},\\quad \\sigma = {sigma}$$"
        f"<p><strong>Step 2: Standardize to a z-score</strong></p>"
        f"$$z = \\frac{{{x} - {mu}}}{{{sigma}}} = \\frac{{{diff}}}{{{sigma}}} \\approx {calc_z}$$"
        f"<p><strong>Step 3: Apply the Complement Rule</strong></p>"
        f"$$P(X > {x}) = P(Z > {calc_z}) = 1 - P(Z < {calc_z})$$"
        f"$$= 1 - {phi} = \\mathbf{{{prob_table}}}$$"
        f"<p><em>(Calculator exact via normalcdf: {prob_exact})</em></p>"
    )

    return {
        "type": "right_tail",
        "input_label": "Probability:",
        "placeholder": "e.g. 0.2119",
        "prompt": f"A continuous random variable \\(X\\) is normally distributed with mean \\(\\mu = {mu}\\) and standard deviation \\(\\sigma = {sigma}\\). Find \\(P(X > {x})\\). Round your answer to four decimal places.",
        "expected_answers": [prob_table, prob_exact],
        "tolerance": 0.005,
        "solution": solution_latex,
        "plot_data": {
            "type": "right_tail",
            "mu": mu,
            "sigma": sigma,
            "z": calc_z,
            "x": x
        }
    }

def generate_inverse_problem():
    mu = round(random.uniform(60, 120), 1)
    sigma = round(random.uniform(6, 20), 1)
    
    is_top = random.choice([True, False])
    # Pick clean percentiles like 5%, 10%, 15%, 20%, 25%, 30%, 70%, 75%, 80%, etc.
    percent = random.choice([5, 8, 10, 12, 15, 20, 25, 30, 35, 40])
    
    if is_top:
        target_tail_area = percent / 100.0
        cumulative_area = 1.0 - target_tail_area
        direction_text = f"top {percent}%"
    else:
        target_tail_area = percent / 100.0
        cumulative_area = target_tail_area
        direction_text = f"bottom {percent}%"

    z_exact = norm.ppf(cumulative_area)
    z_rounded = round(z_exact, 2)
    
    x_exact = round(mu + z_exact * sigma, 2)
    x_table = round(mu + z_rounded * sigma, 2)

    solution_latex = (
        f"<p><strong>Step 1: Identify Parameters & Cumulative Probability Area</strong></p>"
        f"$$\\mu = {mu},\\quad \\sigma = {sigma}$$"
        f"<p>For the {direction_text}, the cumulative area to the left is:</p>"
        f"$$\\text{{Area to left}} = {cumulative_area:.4f}$$"
        f"<p><strong>Step 2: Find the Corresponding Critical z-score</strong></p>"
        f"$$z \\approx {z_rounded}\\quad (\\text{{via standard z-table or invNorm}})$$ "
        f"<p><strong>Step 3: Un-standardize to find the Cutoff Value x</strong></p>"
        f"$$x = \\mu + z \\cdot \\sigma = {mu} + ({z_rounded})({sigma}) = \\mathbf{{{x_table}}}$$"
        f"<p><em>(Calculator exact via invNorm: {x_exact})</em></p>"
    )

    return {
        "type": "inverse",
        "input_label": "Cutoff Value (x):",
        "placeholder": "e.g. 78.4",
        "prompt": f"A continuous random variable \\(X\\) is normally distributed with mean \\(\\mu = {mu}\\) and standard deviation \\(\\sigma = {sigma}\\). Find the cutoff score \\(x\\) that separates the <strong>{direction_text}</strong> of values. Round your answer to one or two decimal places.",
        "expected_answers": [x_table, x_exact],
        "tolerance": 0.35,  # Allows slight table vs invNorm decimal rounding
        "solution": solution_latex,
        "plot_data": {
            "type": "inverse",
            "is_top": is_top,
            "mu": mu,
            "sigma": sigma,
            "z": z_rounded,
            "x": x_table
        }
    }

def generate_normal_problem(topic: str = "random"):
    generators = {
        "between": generate_between_problem,
        "left_tail": generate_left_tail_problem,
        "right_tail": generate_right_tail_problem,
        "inverse": generate_inverse_problem
    }
    if topic in generators:
        return generators[topic]()
    return random.choice(list(generators.values()))()

def verify_normal_answer(user_val: float, expected_answers: list[float], tolerance: float) -> bool:
    return any(abs(user_val - target) <= tolerance for target in expected_answers)
