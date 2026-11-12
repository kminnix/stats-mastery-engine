from typing import Any, Dict


def tag_problem_input_types(problem: Dict[str, Any]) -> Dict[str, Any]:
    for step in problem.get("steps", []):
        step.setdefault("input_type", "number")
        for field_key in ("components", "inputs"):
            for field in step.get(field_key, []):
                field.setdefault(
                    "input_type",
                    "select" if field.get("type") == "select" else "number",
                )
    return problem
