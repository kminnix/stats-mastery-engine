import math
import random

from scipy.stats import binom, geom, norm


def _format_number(value: float, digits: int = 4) -> str:
    return f"{value:.{digits}f}".rstrip("0").rstrip(".")


def generate_discrete_rv_problem():
    outcome_count = random.choice([4, 5])
    outcomes = list(range(outcome_count))
    cut_points = sorted(random.sample(range(1, 100), outcome_count - 1))
    probability_units = [
        point - previous
        for point, previous in zip(cut_points + [100], [0] + cut_points)
    ]
    probabilities = [units / 100 for units in probability_units]
    missing_index = random.randrange(outcome_count)
    missing_probability = probabilities[missing_index]
    mean = sum(x * probability for x, probability in zip(outcomes, probabilities))
    variance = sum(
        (x - mean) ** 2 * probability
        for x, probability in zip(outcomes, probabilities)
    )
    standard_deviation = math.sqrt(variance)

    known_probability_sum = sum(
        probability for index, probability in enumerate(probabilities)
        if index != missing_index
    )
    expanded_mean = " + ".join(
        f"{outcome}({probability:.3f})"
        for index, (outcome, probability) in enumerate(zip(outcomes, probabilities))
        if index != missing_index
    )
    expanded_mean += f" + {outcomes[missing_index]}({missing_probability:.3f})"
    expanded_variance = " + ".join(
        f"({outcome} - {mean:.4f})^2({probability:.3f})"
        for outcome, probability in zip(outcomes, probabilities)
    )

    return {
        "type": "prob_discrete_rv",
        "title": "Discrete Random Variable: Mean and Standard Deviation",
        "prompt": (
            "The table gives the probability distribution of a discrete random "
            "variable \\(X\\). One probability is missing. Find the missing "
            "probability, then calculate \\(E(X)\\) and \\(\\sigma_X\\)."
        ),
        "table_data": {
            "headers": ["x", "P(X = x)"],
            "rows": [
                [
                    str(outcome),
                    "?" if index == missing_index else f"{probability:.3f}",
                ]
                for index, (outcome, probability) in enumerate(
                    zip(outcomes, probabilities)
                )
            ],
        },
        "steps": [
            {
                "step_num": 1,
                "label": f"Missing probability \\(P(X={outcomes[missing_index]})\\):",
                "input_type": "number",
                "placeholder": "e.g. 0.25",
                "expected": [missing_probability],
                "tolerance": 0.002,
                "hint": "All probabilities in a discrete distribution must sum to 1.",
            },
            {
                "step_num": 2,
                "label": "Expected value \\(\\mu_X=E(X)\\):",
                "input_type": "number",
                "placeholder": "e.g. 1.75",
                "expected": [mean],
                "tolerance": 0.005,
                "hint": "Multiply each value of x by its probability, then add.",
            },
            {
                "step_num": 3,
                "label": "Standard deviation \\(\\sigma_X\\):",
                "input_type": "math",
                "math_symbols": ["sqrt", "pow", "parens"],
                "placeholder": "e.g. 1.12",
                "expected": [standard_deviation],
                "tolerance": 0.005,
                "hint": "Use the square root of the probability-weighted variance.",
            },
        ],
        "solution": (
            "<p><strong>Step 1: Find the missing probability</strong></p>"
            f"$$\\sum P(X=x)=1,\\quad P(X={outcomes[missing_index]})"
            f"=1-({_format_number(known_probability_sum)})"
            f"=\\mathbf{{{missing_probability:.3f}}}$$"
            "<p><strong>Step 2: Calculate the expected value</strong></p>"
            f"$$\\mu_X=E(X)=\\sum x_iP(x_i)={expanded_mean}"
            f"=\\mathbf{{{mean:.4f}}}$$"
            "<p><strong>Step 3: Calculate the standard deviation</strong></p>"
            f"$$\\sigma_X=\\sqrt{{\\sum (x_i-\\mu_X)^2P(x_i)}}"
            f"=\\sqrt{{{expanded_variance}}}"
            f"=\\mathbf{{{standard_deviation:.4f}}}$$"
        ),
    }


def generate_binomial_geom_problem():
    distribution = random.choice(["binomial", "geometric"])
    p = random.choice([0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7])
    if distribution == "binomial":
        n = random.randint(8, 20)
        outcome = random.choice(["exact", "at_most", "at_least"])
        k = random.randint(1, n - 1)
        mean = n * p
        standard_deviation = math.sqrt(n * p * (1 - p))
        if outcome == "exact":
            event = f"X={k}"
            probability_work = (
                f"P(X={k})=\\binom{{{n}}}{{{k}}}({p})^{{{k}}}"
                f"(1-{p})^{{{n-k}}}"
            )
        elif outcome == "at_most":
            event = f"X\\leq {k}"
            probability_work = f"P(X\\leq {k})=\\sum_{{x=0}}^{{{k}}}P(X=x)"
        else:
            event = f"X\\geq {k}"
            probability_work = (
                f"P(X\\geq {k})=1-P(X\\leq {k-1})"
            )
        distribution_details = (
            f"\\(X\\sim\\operatorname{{Bin}}({n},{p})\\), "
            f"where \\(n={n}\\) and \\(p={p}\\)."
        )
        probability_value = (
            binom.pmf(k, n, p) if outcome == "exact"
            else binom.cdf(k, n, p) if outcome == "at_most"
            else binom.sf(k - 1, n, p)
        )
        event_description = f"the number of successes in {n} independent trials"
        distribution_name = "Binomial"
        probability_call = (
            f"\\operatorname{{binom}}.pmf({k},{n},{p})"
            if outcome == "exact"
            else f"\\operatorname{{binom}}.cdf({k},{n},{p})"
            if outcome == "at_most"
            else f"\\operatorname{{binom}}.sf({k-1},{n},{p})"
        )
    else:
        outcome = random.choice(["exact", "at_most", "at_least"])
        k = random.randint(2, 8)
        mean = 1 / p
        standard_deviation = math.sqrt((1 - p) / (p ** 2))
        if outcome == "exact":
            event = f"X={k}"
            probability_work = f"P(X={k})=(1-p)^{{{k-1}}}p"
        elif outcome == "at_most":
            event = f"X\\leq {k}"
            probability_work = f"P(X\\leq {k})=1-(1-p)^{{{k}}}"
        else:
            event = f"X\\geq {k}"
            probability_work = f"P(X\\geq {k})=(1-p)^{{{k-1}}}"
        distribution_details = f"\\(X\\sim\\operatorname{{Geom}}({p})\\), where \\(p={p}\\)."
        probability_value = (
            geom.pmf(k, p) if outcome == "exact"
            else geom.cdf(k, p) if outcome == "at_most"
            else geom.sf(k - 1, p)
        )
        event_description = "the number of trials until the first success"
        distribution_name = "Geometric"
        probability_call = (
            f"\\operatorname{{geom}}.pmf({k},{p})"
            if outcome == "exact"
            else f"\\operatorname{{geom}}.cdf({k},{p})"
            if outcome == "at_most"
            else f"\\operatorname{{geom}}.sf({k-1},{p})"
        )

    return {
        "type": "prob_binom_geom",
        "title": f"{distribution_name} Distribution",
        "prompt": (
            f"{distribution_details} Let {event_description}. "
            f"Find the mean and standard deviation, then calculate "
            f"\\(P({event})\\). Round to four decimal places."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Mean and standard deviation:",
                "input_type": "compound",
                "inputs": [
                    {
                        "id": "distribution-mean",
                        "type": "number",
                        "input_type": "number",
                        "label": "Mean",
                        "placeholder": "Mean",
                        "expected": [mean],
                        "tolerance": 0.01,
                    },
                    {
                        "id": "distribution-sd",
                        "type": "number",
                        "input_type": "math",
                        "math_symbols": ["sqrt", "parens"],
                        "label": "Standard deviation",
                        "placeholder": "Standard deviation",
                        "expected": [standard_deviation],
                        "tolerance": 0.01,
                    },
                ],
                "hint": "Use the formulas for the identified distribution.",
            },
            {
                "step_num": 2,
                "label": f"Probability \\(P({event})\\):",
                "input_type": "math",
                "math_symbols": ["frac", "pow", "parens"],
                "placeholder": "e.g. 0.1234",
                "expected": [round(probability_value, 4)],
                "tolerance": 0.005,
                "hint": "Use the pmf for an exact value, the cdf for at most, or a right-tail probability for at least.",
            },
        ],
        "solution": (
            "<p><strong>Step 1: Mean and standard deviation</strong></p>"
            + (
                f"$$\\mu=np=({n})({p})={mean:.4f},\\quad "
                f"\\sigma=\\sqrt{{np(1-p)}}="
                f"\\sqrt{{({n})({p})(1-{p})}}={standard_deviation:.4f}$$"
                if distribution == "binomial"
                else f"$$\\mu=\\frac{{1}}{{p}}=\\frac{{1}}{{{p}}}={mean:.4f},\\quad "
                f"\\sigma=\\sqrt{{\\frac{{1-p}}{{p^2}}}}="
                f"\\sqrt{{\\frac{{1-{p}}}{{{p}^2}}}}={standard_deviation:.4f}$$"
            )
            + "<p><strong>Step 2: Calculate the requested probability</strong></p>"
            + f"$${probability_work}={probability_call}"
            f"\\approx\\mathbf{{{probability_value:.4f}}}$$"
        ),
    }


def generate_sampling_dist_problem():
    distribution = random.choice(["mean", "proportion"])
    if distribution == "mean":
        n = random.choice([20, 30, 35, 40, 50, 64])
        population_normal = random.choice([True, False])
        mu = round(random.uniform(50, 100), 1)
        sigma = round(random.uniform(6, 18), 1)
        sampling_mean = mu
        standard_error = sigma / math.sqrt(n)
        z_target = random.choice([-1.5, -1.2, -0.8, 0.7, 1.1, 1.6])
        cutoff = round(sampling_mean + z_target * standard_error, 2)
        z_score = (cutoff - sampling_mean) / standard_error
        is_right_tail = random.choice([True, False])
        event = f"\\bar{{x}} {'>' if is_right_tail else '<'} {cutoff}"
        probability = (
            norm.sf(z_score) if is_right_tail else norm.cdf(z_score)
        )
        condition_label = "CLT / Normal Population Condition:"
        condition_met = n >= 30 or population_normal
        condition_hint = (
            "The sampling distribution is approximately normal when the population "
            "is normal or the sample size is at least 30."
        )
        parameter_work = f"\\mu_{{\\bar{{x}}}}=\\mu={mu}"
        error_work = (
            f"\\sigma_{{\\bar{{x}}}}=\\frac{{\\sigma}}{{\\sqrt{{n}}}}"
            f"=\\frac{{{sigma}}}{{\\sqrt{{{n}}}}}={standard_error:.4f}"
        )
        z_work = (
            f"z=\\frac{{{cutoff}-{mu}}}{{{sigma}/\\sqrt{{{n}}}}}"
            f"={z_score:.4f}"
        )
        prompt = (
            f"A population has mean \\(\\mu={mu}\\) and standard deviation "
            f"\\(\\sigma={sigma}\\). Consider samples of size \\(n={n}\\). "
            f"Find the mean and standard error of \\(\\bar{{x}}\\), then estimate "
            f"\\(P({event})\\) using a normal model."
        )
        distribution_type = "sampling_mean"
    else:
        n = random.choice([40, 60, 100, 120, 150, 200])
        p = random.choice([0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9])
        sampling_mean = p
        standard_error = math.sqrt(p * (1 - p) / n)
        z_target = random.choice([-1.5, -1.2, -0.8, 0.7, 1.1, 1.6])
        cutoff = round(sampling_mean + z_target * standard_error, 3)
        z_score = (cutoff - sampling_mean) / standard_error
        is_right_tail = random.choice([True, False])
        event = f"\\hat{{p}} {'>' if is_right_tail else '<'} {cutoff}"
        probability = (
            norm.sf(z_score) if is_right_tail else norm.cdf(z_score)
        )
        successes = n * p
        failures = n * (1 - p)
        condition_met = successes >= 10 and failures >= 10
        condition_label = "Large Counts Condition:"
        condition_hint = (
            "Check that both the expected number of successes np and failures "
            "n(1-p) are at least 10."
        )
        parameter_work = f"\\mu_{{\\hat{{p}}}}=p={p}"
        error_work = (
            f"\\sigma_{{\\hat{{p}}}}=\\sqrt{{\\frac{{p(1-p)}}{{n}}}}"
            f"=\\sqrt{{\\frac{{{p}(1-{p})}}{{{n}}}}}={standard_error:.4f}"
        )
        z_work = (
            f"z=\\frac{{{cutoff}-{p}}}"
            f"{{\\sqrt{{{p}(1-{p})/{n}}}}}={z_score:.4f}"
        )
        prompt = (
            f"A population proportion is \\(p={p}\\), and samples have size "
            f"\\(n={n}\\). Find the mean and standard error of \\(\\hat{{p}}\\), "
            f"then estimate \\(P({event})\\) using a normal model."
        )
        distribution_type = "sampling_proportion"

    return {
        "type": distribution_type,
        "title": "Sampling Distribution",
        "prompt": prompt,
        "steps": [
            {
                "step_num": 1,
                "label": condition_label,
                "input_type": "select",
                "options": [
                    {"value": "Met", "label": "Met"},
                    {"value": "Not met", "label": "Not met"},
                ],
                "expected": ["Met" if condition_met else "Not met"],
                "hint": condition_hint,
            },
            {
                "step_num": 2,
                "label": "Mean and standard error:",
                "input_type": "compound",
                "inputs": [
                    {
                        "id": "sampling-mean",
                        "type": "number",
                        "input_type": "number",
                        "label": "Sampling-distribution mean",
                        "placeholder": "Mean",
                        "expected": [sampling_mean],
                        "tolerance": 0.005,
                    },
                    {
                        "id": "sampling-standard-error",
                        "type": "number",
                        "input_type": "math",
                        "math_symbols": ["sqrt", "frac", "parens"],
                        "label": "Standard error",
                        "placeholder": "Standard error",
                        "expected": [standard_error],
                        "tolerance": 0.005,
                    },
                ],
                "hint": "Use the appropriate sampling-distribution mean and standard-error formulas.",
            },
            {
                "step_num": 3,
                "label": f"Probability \\(P({event})\\):",
                "input_type": "number",
                "placeholder": "e.g. 0.1234",
                "expected": [round(probability, 4)],
                "tolerance": 0.005,
                "hint": "Standardize the cutoff to a z-score, then use a normal table or normalcdf.",
            },
        ],
        "solution": (
            "<p><strong>Step 1: Check the normality condition</strong></p>"
            + (
                (
                    f"<p>\\(n={n}\\geq30\\), so the Central Limit Theorem condition "
                    f"is met{' (the population is also normal)' if population_normal else ''}.</p>"
                    if condition_met
                    else f"<p>\\(n={n}<30\\) and the population is not normal, "
                    "so neither condition is met; the normal-model estimate may "
                    "not be reliable.</p>"
                )
                if distribution == "mean"
                else (
                    f"<p>\\(np={n}({p})={successes:g}\\geq10\\) and "
                    f"\\(n(1-p)={n}(1-{p})={failures:g}\\geq10\\), "
                    "so Large Counts is met.</p>"
                    if condition_met
                    else f"<p>\\(np={n}({p})={successes:g}\\) and "
                    f"\\(n(1-p)={n}(1-{p})={failures:g}\\); "
                    "at least one count is below 10, so Large Counts is not met "
                    "and the normal-model estimate may not be reliable.</p>"
                )
            )
            + "<p><strong>Step 2: Find the mean and standard error</strong></p>"
            + f"$${parameter_work},\\quad {error_work}$$"
            + "<p><strong>Step 3: Standardize and find the probability</strong></p>"
            + f"$${z_work}$$"
            + (
                f"$$P({event})=P(Z>{z_score:.4f})"
                f"=1-\\Phi({z_score:.4f})\\approx\\mathbf{{{probability:.4f}}}$$"
                if is_right_tail
                else f"$$P({event})=P(Z<{z_score:.4f})"
                f"=\\Phi({z_score:.4f})\\approx\\mathbf{{{probability:.4f}}}$$"
            )
            + f"<p><em>Using a z-table may differ slightly from normalcdf; "
            f"the accepted tolerance is 0.005.</em></p>"
        ),
    }


def generate_prob_sampling_problem(topic: str):
    generators = {
        "prob_discrete_rv": generate_discrete_rv_problem,
        "prob_binom_geom": generate_binomial_geom_problem,
        "sampling_dist": generate_sampling_dist_problem,
    }
    if topic not in generators:
        raise ValueError(f"Unknown probability and sampling topic: {topic}")
    return generators[topic]()