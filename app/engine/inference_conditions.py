from typing import Any, Dict, Optional, Sequence
import re


def add_inference_conditions(
    problem: Dict[str, Any],
    sample_sizes: Sequence[int],
    minimum_count: Optional[float] = None,
    count_formula: str = "",
    after_hypotheses: bool = False,
) -> Dict[str, Any]:
    is_proportion = minimum_count is not None
    design = (
        "Assume the samples or pairs were randomly selected or randomly assigned, "
        "the groups are independent when applicable, and each sampled population "
        "is at least ten times the corresponding sample size. "
    )
    if not is_proportion:
        design += "Assume each relevant population, or the population of paired differences, is approximately normal. "
    problem["prompt"] += f"<p>{design}</p>"
    if is_proportion:
        correct = "Met — random sample/assignment and all expected/observed success & failure counts ≥ 10"
        choices = [
            correct,
            "Not met — sample size must be n ≥ 30",
            "Not met — expected counts only need to be ≥ 5",
            "Not met — independence requires sampling more than 10% of the population",
        ]
    else:
        correct = "Met — random sample/assignment and n ≥ 30 (CLT) or normal population"
        choices = [
            correct,
            "Not met — sample proportion must satisfy np ≥ 10",
            "Not met — sample size must be n ≥ 50",
            "Not met — independence requires sampling more than 10% of the population",
        ]
    components = [{
        "id": "inference-conditions", "type": "select",
        "options": [{"value": choice, "label": choice} for choice in choices],
        "expected": [correct],
    }]
    parts = ["Conditions: ", {"component": "inference-conditions"}]
    if is_proportion:
        components.append({
            "id": "inference-min-count", "type": "number",
            "placeholder": "Smallest success/failure count",
            "expected": [minimum_count], "tolerance": 0.05,
        })
        parts.extend([". Smallest success/failure count: ", {"component": "inference-min-count"}])
    step = {
        "step_num": 1, "label": "Check Conditions:", "input_type": "cloze",
        "components": components, "parts": parts,
        "hint": (
            r"Check randomization and \(n\leq 0.10N\) for each sample. "
            + (count_formula if is_proportion else
               "For each mean, use a large sample or an approximately normal population; "
               "for paired data, check the differences.")
        ),
    }
    position = 2 if after_hypotheses else 0
    problem["steps"].insert(position, step)
    for index, item in enumerate(problem["steps"], 1):
        item["step_num"] = index
    explanation = (
        f"<p><strong>Conditions:</strong> {design}"
        + (f"The smallest success/failure count is {minimum_count:.4f}, at least 10." if is_proportion else "")
        + "</p>"
    )
    def renumber(match: re.Match[str]) -> str:
        number = int(match.group(1))
        return f"Step {number + (not after_hypotheses or number > 2)}"
    problem["solution"] = explanation + re.sub(r"Step (\d+)", renumber, problem["solution"])
    return problem
