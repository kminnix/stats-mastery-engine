import random
from scipy.stats import norm

def generate_normal_problem():
    """
    Generates a parameterized normal distribution problem:
    Find P(x1 < X < x2) given mean mu and standard deviation sigma.
    Includes both exact (calculator) and rounded z-table expected answers.
    """
    mu = round(random.uniform(60, 85), 1)
    sigma = round(random.uniform(6, 14), 1)
    
    # Standardized z-scores between -2.2 and 2.2
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
        f"<p><strong>Step 3: Determine Cumulative Probabilities</strong></p>"
        f"$$P(Z < {calc_z1}) \\approx {phi1}$$"
        f"$$P(Z < {calc_z2}) \\approx {phi2}$$"
        f"<p><strong>Step 4: Subtract Cumulative Areas</strong></p>"
        f"$$P({x1} < X < {x2}) = P({calc_z1} < Z < {calc_z2})$$"
        f"$$= P(Z < {calc_z2}) - P(Z < {calc_z1})$$"
        f"$$= {phi2} - {phi1} = \\mathbf{{{prob_table}}}$$"
        f"<p><em>(Calculator exact via normalcdf: {prob_exact})</em></p>"
    )

    return {
        "prompt": f"A continuous random variable \\(X\\) is normally distributed with mean \\(\\mu = {mu}\\) and standard deviation \\(\\sigma = {sigma}\\). Find \\(P({x1} < X < {x2})\\). Round your answer to four decimal places.",
        "expected_answers": [prob_table, prob_exact],
        "tolerance": 0.005,
        "solution": solution_latex,
        "plot_data": {
            "mu": mu,
            "sigma": sigma,
            "z1": calc_z1,
            "z2": calc_z2,
            "x1": x1,
            "x2": x2
        }
    }

def verify_normal_answer(user_val: float, expected_answers: list[float], tolerance: float) -> bool:
    return any(abs(user_val - target) <= tolerance for target in expected_answers)
