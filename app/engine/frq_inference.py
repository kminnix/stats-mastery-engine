import ast
import math
import re
from typing import Any, Dict, List, Optional, Tuple

from .confidence_intervals import generate_ci_problem
from .hypothesis_testing import generate_ht_problem
from .inference_drills import PROCEDURE_NAMES, procedure_name_for_topic


FRQ_TOPICS = {
    "frq_ci_prop_1samp": ("prop_z", "Full FRQ: 1-Sample z-Interval for Proportion (p)"),
    "frq_ci_prop_2samp": ("prop_z_2samp", "Full FRQ: 2-Sample z-Interval for Proportions (p₁ - p₂)"),
    "frq_ci_mean_1samp": ("mean_t", "Full FRQ: 1-Sample t-Interval for Mean (μ)"),
    "frq_ci_mean_2samp": ("mean_t_2samp", "Full FRQ: 2-Sample t-Interval for Means (μ₁ - μ₂)"),
    "frq_ht_prop_1samp": ("ht_prop_z", "Full FRQ: 1-Sample z-Test for Proportion (p)"),
    "frq_ht_prop_2samp": ("ht_prop_z_2samp", "Full FRQ: 2-Sample z-Test for Proportions (p₁ - p₂)"),
    "frq_ht_mean_1samp": ("ht_mean_t", "Full FRQ: 1-Sample t-Test for Mean (μ)"),
    "frq_ht_mean_2samp": ("ht_mean_t_2samp", "Full FRQ: 2-Sample t-Test for Means (μ₁ - μ₂)"),
}

PARAMETER_SYMBOLS = {
    "ci_prop_z": "p", "ht_prop_z": "p",
    "ci_prop_z_2samp": "p₁ - p₂", "ht_prop_z_2samp": "p₁ - p₂",
    "ci_mean_t": "μ", "ht_mean_t": "μ",
    "ci_mean_t_2samp": "μ₁ - μ₂", "ht_mean_t_2samp": "μ₁ - μ₂",
}


def _clean(text: Any) -> str:
    value = str(text or "").lower().replace("₀", "0").replace("₁", "1").replace("₂", "2").replace("ₐ", "a")
    value = value.replace("μ", "mu").replace("−", "-").replace("–", "-").replace("≠", "!=")
    value = value.replace("≤", "<=").replace("≥", ">=").replace("α", "alpha")
    value = value.replace("p̂", "phat").replace("x̄", "xbar")
    return re.sub(r"\s+", " ", value).strip()


def _normalize_plan_text(text: str) -> str:
    value = _clean(text)
    value = re.sub(r"(?<=[a-z0-9])-(?=[a-z])", " ", value)
    value = value.replace(",", "")
    value = re.sub(r"\s*(<=|>=|<|>)\s*", r" \1 ", value)
    value = re.sub(r"(?<=\d)%(?=[a-z])", "% ", value)
    return re.sub(r"\s+", " ", value).strip()


def _keywords(description: str) -> List[str]:
    ignored = {
        "the", "true", "population", "proportion", "mean", "difference", "in", "of",
        "for", "and", "who", "that", "is", "are", "with", "between", "group",
    }
    return [word for word in re.findall(r"[a-z]{3,}", description.lower()) if word not in ignored][:8]


def _condition_numbers(topic: str, data: Dict[str, Any]) -> List[float]:
    numbers: List[float] = []
    sample_sizes = data.get("sample_sizes") or [
        value for value in (data.get("n"), data.get("n1"), data.get("n2")) if value is not None
    ]
    for size in sample_sizes:
        numbers.extend([float(size), float(size) * 10])
    if "prop" not in topic:
        return numbers
    if topic == "ci_prop_z":
        n, x = float(data["n"]), float(data["x"])
        numbers.extend([x, n - x])
    elif topic == "ci_prop_z_2samp":
        numbers.extend([
            float(data["x1"]), float(data["n1"]) - float(data["x1"]),
            float(data["x2"]), float(data["n2"]) - float(data["x2"]),
        ])
    elif topic == "ht_prop_z":
        n, p0 = float(data["n"]), float(data["p0"])
        numbers.extend([n * p0, n * (1 - p0)])
    elif topic == "ht_prop_z_2samp":
        pooled = float(data["pooled"])
        for key in ("n1", "n2"):
            n = float(data[key])
            numbers.extend([n * pooled, n * (1 - pooled)])
    return numbers


def _exemplar(topic: str, data: Dict[str, Any], procedure: str) -> Dict[str, str]:
    parameter = PARAMETER_SYMBOLS[topic]
    context = data.get("parameter_description", "the population parameter in the scenario")
    is_test = topic.startswith("ht_")
    sample_sizes = data.get("sample_sizes") or []
    checks = _condition_numbers(topic, data)
    random_text = "The samples were randomly selected or randomly assigned."
    independence = "For independence, each sample is at most 10% of its population: "
    independence += "; ".join(
        f"10 × {int(n)} = {int(10 * n)}" for n in sample_sizes
    ) + "."
    if "prop" in topic:
        condition_text = "The success/failure or expected-count checks are " + ", ".join(
            f"{value:g}" for value in checks[len(sample_sizes) * 2:]
        ) + "; each is at least 10."
    else:
        condition_text = "The population is assumed approximately normal, or the sample size supports the CLT: " + ", ".join(
            f"n = {int(n)}" for n in sample_sizes
        ) + "."
    if is_test:
        null_value = data["p0"] if "prop" in topic and topic == "ht_prop_z" else (
            data["mu0"] if topic == "ht_mean_t" else 0
        )
        alt = {"<": "<", ">": ">", "!=": "≠"}[data["direction"]]
        state = (
            f"Let {parameter} represent {context}. "
            f"H₀: {parameter} = {null_value:g}; Hₐ: {parameter} {alt} {null_value:g}."
        )
        plan = f"{procedure}. {random_text} {independence} {condition_text}"
        do = (
            f"{data['stat_name']} = {data['stat']:.4f}; P-value = {data['p_val']:.5f}; "
            + (f"df = {data['df']}." if data.get("df") is not None else "Use the standard normal model.")
        )
        reject = data["p_val"] <= data["alpha"]
        decision = "reject H₀" if reject else "fail to reject H₀"
        evidence = "convincing" if reject else "not convincing"
        conclude = (
            f"Since the P-value {data['p_val']:.5f} is {'less than or equal to' if reject else 'greater than'} "
            f"α = {data['alpha']:g}, we {decision}. There is {evidence} evidence that {context} "
            f"{ {'<': 'is less than', '>': 'is greater than', '!=': 'differs from'}[data['direction']] } "
            f"{null_value:g}."
        )
    else:
        confidence = data["conf_level"]
        state = (
            f"Let {parameter} represent {context}. The parameter of interest is {parameter}, "
            f"with a {confidence}% confidence level."
        )
        plan = f"{procedure}. {random_text} {independence} {condition_text}"
        do = (
            f"Interval bounds: L = {data['ci_lower']:.4f}, U = {data['ci_upper']:.4f}"
            + (f"; df = {data['df']}." if data.get("df") is not None else ".")
        )
        conclude = (
            f"We are {confidence}% confident that the interval from {data['ci_lower']:.4f} "
            f"to {data['ci_upper']:.4f} captures the true {context}."
        )
    return {"state": state, "plan": plan, "do": do, "conclude": conclude}


def generate_frq_problem(topic: str) -> Dict[str, Any]:
    if topic not in FRQ_TOPICS:
        raise ValueError(f"Unknown full FRQ topic: {topic}")
    source_topic, title = FRQ_TOPICS[topic]
    problem = generate_ht_problem(source_topic) if source_topic.startswith("ht_") else generate_ci_problem(source_topic)
    analysis_topic = source_topic if source_topic.startswith("ht_") else f"ci_{source_topic}"
    data = dict(problem.get("metadata") or {})
    data["topic"] = analysis_topic
    data["procedure_name"] = procedure_name_for_topic(analysis_topic)
    data["parameter_symbol"] = PARAMETER_SYMBOLS[analysis_topic]
    data["parameter_description"] = (
        problem.get("parameter_description")
        or data.get("parameter_description")
        or {
            "ci_prop_z": "the true population proportion of surveyed individuals who responded favorably",
            "ci_prop_z_2samp": "the difference in true population proportions for Group 1 minus Group 2",
            "ci_mean_t": "the true population mean of the measured variable",
            "ci_mean_t_2samp": "the difference in true population means for Group 1 minus Group 2",
        }.get(analysis_topic, "the population parameter in the scenario")
    )
    context_keywords = problem.get("context_keywords") or data.get("context_keywords")
    data["context_keywords"] = (
        list(context_keywords) if context_keywords
        else _keywords(data["parameter_description"])
    )
    data["sample_sizes"] = data.get("sample_sizes") or [
        value for value in (data.get("n"), data.get("n1"), data.get("n2")) if value is not None
    ]
    if analysis_topic == "ci_prop_z":
        data.update(n=data["sample_sizes"][0], phat=data["point"])
    elif analysis_topic == "ci_prop_z_2samp":
        data.update(n1=data["sample_sizes"][0], n2=data["sample_sizes"][1])
    elif analysis_topic == "ci_mean_t":
        data.update(n=data["sample_sizes"][0], xbar=data["point"])
    elif analysis_topic == "ci_mean_t_2samp":
        data.update(n1=data["sample_sizes"][0], n2=data["sample_sizes"][1])
    is_test = analysis_topic.startswith("ht_")
    data["is_test"] = is_test
    if is_test:
        data["stat"] = data["test_statistic"]
        data["stat_name"] = "z" if analysis_topic.startswith("ht_prop") else "t"
        data["p_val"] = data["p_value"]
        data["direction"] = data["alternative"]
        data["alpha"] = data["alpha"]
        data["conf_level"] = None
        data["ci_lower"] = None
        data["ci_upper"] = None
    else:
        data["stat"] = None
        data["stat_name"] = None
        data["p_val"] = None
        data["direction"] = None
        data["alpha"] = (100 - data["confidence"]) / 100
        data["conf_level"] = data["confidence"]
        data["ci_lower"] = data["lower"]
        data["ci_upper"] = data["upper"]
    exemplar = _exemplar(analysis_topic, data, data["procedure_name"])
    prompt = re.sub(
        r"<p>\s*Assume the samples or pairs were randomly selected.*?</p>",
        "",
        problem["prompt"],
        flags=re.IGNORECASE | re.DOTALL,
    )
    return {
        "type": topic,
        "title": title,
        "problem_mode": "full_frq",
        "prompt": prompt,
        "data": data,
        "procedure_options": list(PROCEDURE_NAMES.values()),
        "exemplar": exemplar,
        "solution": "".join(
            f"<h4>{label}</h4><p>{exemplar[key]}</p>"
            for key, label in (("state", "State"), ("plan", "Plan"), ("do", "Do"), ("conclude", "Conclude"))
        ),
    }


def _number_list(value: Any) -> List[float]:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return [float(value)]
    if not isinstance(value, str):
        return []
    found: List[float] = []
    for match in re.finditer(r"(?<![\w.])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?", value.replace(",", "")):
        try:
            found.append(float(match.group(0)))
        except ValueError:
            continue
    return found


def _number_near_pattern(
    text: str,
    target: float,
    marker_pattern: str,
    window: int = 120,
    tolerance: float = 0.005,
) -> bool:
    number_pattern = re.compile(rf"(?<![\w.])({_NUMBER_PATTERN})(?![\w.])")
    for match in number_pattern.finditer(text):
        if abs(float(match.group(1)) - target) > tolerance:
            continue
        context = text[max(0, match.start() - window):match.end() + window]
        if re.search(marker_pattern, context):
            return True
    return False


def _contains_number(text: str, target: float, tolerance: float = 0.005) -> bool:
    return any(abs(value - target) <= tolerance for value in _number_list(text))


def _mentions_parameter(text: str, parameter: str) -> bool:
    if parameter == "p":
        return bool(
            re.search(r"\bp\b(?!\s*[- ]?\s*value)", text)
            or re.search(r"\b(?:true|population)\s+(?:population\s+)?proportion\b", text)
        )
    if parameter == "mu":
        return bool(
            re.search(r"\bmu\b", text)
            or re.search(r"\b(?:true|population)\s+(?:population\s+)?mean\b", text)
        )
    if parameter in ("p1 - p2", "mu1 - mu2"):
        quantity = "proportions" if parameter.startswith("p") else "means"
        defined_difference = re.search(
            rf"\b(?:true\s+)?difference\s+(?:in|between)\s+"
            rf"(?:the\s+)?(?:(?:true|population)\s+)?(?:population\s+)?{quantity}\b",
            text,
        )
        return bool(defined_difference) or parameter.replace(" ", "") in text.replace(" ", "")
    return parameter.replace(" ", "") in text.replace(" ", "")


def _parse_number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if not isinstance(value, str):
        return None
    try:
        tree = ast.parse(value.strip().replace(",", ""), mode="eval")
    except (SyntaxError, ValueError):
        values = _number_list(value)
        return values[-1] if values else None

    def evaluate(node: ast.AST) -> float:
        if isinstance(node, ast.Expression):
            return evaluate(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            operand = evaluate(node.operand)
            return operand if isinstance(node.op, ast.UAdd) else -operand
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            left, right = evaluate(node.left), evaluate(node.right)
            operations = {
                ast.Add: lambda: left + right, ast.Sub: lambda: left - right,
                ast.Mult: lambda: left * right, ast.Div: lambda: left / right,
                ast.Pow: lambda: left ** right,
            }
            return operations[type(node.op)]()
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "sqrt"
            and len(node.args) == 1
            and not node.keywords
        ):
            return math.sqrt(evaluate(node.args[0]))
        raise ValueError("Unsupported numeric expression")
    try:
        result = evaluate(tree)
        return result if math.isfinite(result) else None
    except (ValueError, ZeroDivisionError, OverflowError):
        return None


_NUMBER_PATTERN = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?"


def _normalize_do_text(text: str) -> str:
    value = _clean(text)
    value = re.sub(r"√\s*\(", "sqrt(", value)
    value = value.replace("²", "**2").replace("³", "**3")
    return value.replace("±", "+/-")


def _extract_labeled_number(
    text: str,
    label_pattern: str,
    stop_label_pattern: str = "",
) -> Optional[float]:
    pattern = re.compile(
        rf"\b(?:{label_pattern})\s*(?:=|≈|~|:|\bis\b)\s*",
        re.IGNORECASE,
    )
    result = None
    for match in pattern.finditer(text):
        expression = text[match.end():]
        if stop_label_pattern:
            boundary = re.search(
                rf"(?:[,;]|\band\b)?\s*(?=\b(?:{stop_label_pattern})\s*(?:=|≈|~|:|\bis\b))",
                expression,
                re.IGNORECASE,
            )
            if boundary:
                expression = expression[:boundary.start()]
        else:
            expression = expression.splitlines()[0] if expression.splitlines() else ""
        if ";" in expression:
            expression = expression.split(";", 1)[0]
        parsed = _parse_number(expression)
        if parsed is not None:
            result = parsed
            continue
        values = _number_list(expression)
        if values:
            result = values[-1]
    return result


def _parse_interval_bounds(text: str) -> Tuple[Optional[float], Optional[float]]:
    text = _normalize_do_text(text)
    lower = _extract_labeled_number(text, "L", r"U|df")
    upper = _extract_labeled_number(text, "U", "df")
    if lower is not None and upper is not None:
        return lower, upper

    pair_pattern = re.compile(
        rf"[\(\[]\s*({_NUMBER_PATTERN})\s*,\s*({_NUMBER_PATTERN})\s*[\)\]]"
    )
    pairs = list(pair_pattern.finditer(text))
    if pairs:
        return float(pairs[-1].group(1)), float(pairs[-1].group(2))

    plus_minus_pattern = re.compile(
        rf"({_NUMBER_PATTERN})\s*\+/\-\s*({_NUMBER_PATTERN})(?!\s*[A-Za-z0-9.+*/^√(\-])"
    )
    plus_minus = list(plus_minus_pattern.finditer(text))
    if plus_minus:
        center = float(plus_minus[-1].group(1))
        margin = abs(float(plus_minus[-1].group(2)))
        return center - margin, center + margin

    inequality_pattern = re.compile(
        rf"(?<![\w.])({_NUMBER_PATTERN})\s*(?:<=|<)\s*"
        rf"[a-zA-Z_][\w₀₁₂ₐ]*\s*(?:<=|<)\s*({_NUMBER_PATTERN})(?![\w.])"
    )
    inequalities = list(inequality_pattern.finditer(text))
    if inequalities:
        return float(inequalities[-1].group(1)), float(inequalities[-1].group(2))

    range_pattern = re.compile(
        rf"(?<![\w.])(?:from\s+)?({_NUMBER_PATTERN})\s+to\s+({_NUMBER_PATTERN})(?![\w.])",
        re.IGNORECASE,
    )
    ranges = list(range_pattern.finditer(text))
    if ranges:
        return float(ranges[-1].group(1)), float(ranges[-1].group(2))

    between_pattern = re.compile(
        rf"\bbetween\s+({_NUMBER_PATTERN})\s+and\s+({_NUMBER_PATTERN})(?![\w.])",
        re.IGNORECASE,
    )
    between = list(between_pattern.finditer(text))
    if between:
        return float(between[-1].group(1)), float(between[-1].group(2))
    return None, None


def _parse_conclusion_p_value(text: str) -> Optional[float]:
    match = re.search(
        rf"\b(?:p\s*[- ]?\s*value|pval)\s*(?:=|≈|~|:|\bis\b)?\s*({_NUMBER_PATTERN})",
        text,
        re.IGNORECASE,
    )
    return float(match.group(1)) if match else _extract_labeled_number(text, "p")


def _parse_do_results(
    topic: str,
    data: Dict[str, Any],
    do_text: str,
    legacy_values: Dict[str, Any],
) -> Dict[str, Optional[float]]:
    do_text = _normalize_do_text(do_text)
    if do_text.strip():
        if topic.startswith("ht_"):
            stat_name = re.escape(str(data["stat_name"]))
            result = {
                "stat": _extract_labeled_number(
                    do_text, stat_name, r"p\s*[- ]?\s*value|pval|p|df"
                ),
                "p_value": _extract_labeled_number(
                    do_text, r"p\s*[- ]?\s*value|pval", r"z|t|df"
                ),
                "df": _extract_labeled_number(do_text, "df"),
            }
            if result["p_value"] is None:
                result["p_value"] = _extract_labeled_number(
                    do_text, "p", r"z|t|df"
                )
            return result
        lower, upper = _parse_interval_bounds(do_text)
        return {
            "lower": lower,
            "upper": upper,
            "df": _extract_labeled_number(do_text, "df"),
        }

    if topic.startswith("ht_"):
        return {
            key: _parse_number(legacy_values.get(key))
            for key in ("stat", "p_value", "df")
        }
    return {
        key: _parse_number(legacy_values.get(key))
        for key in ("lower", "upper", "df")
    }


def _grade(score_parts: List[bool]) -> str:
    passed = sum(score_parts)
    if passed == len(score_parts):
        return "E"
    if passed:
        return "P"
    return "I"


def _feedback(code: str, good: str, needs_work: str, incorrect: str) -> str:
    return good if code == "E" else needs_work if code == "P" else incorrect


def _score_label(code: str) -> str:
    return {"E": "Full Credit", "P": "Partial Credit", "I": "Needs Revision"}[code]


def evaluate_full_frq(payload: Dict[str, Any], use_ai_grading: bool = False) -> Dict[str, Any]:
    del use_ai_grading
    problem = payload.get("problem") if isinstance(payload.get("problem"), dict) else {}
    data = problem.get("data") if isinstance(problem.get("data"), dict) else payload.get("data", {})
    if not isinstance(data, dict):
        data = {}
    topic = data.get("topic") or payload.get("topic")
    if topic not in PARAMETER_SYMBOLS:
        raise ValueError("A supported FRQ problem payload is required.")
    sections = payload.get("sections") if isinstance(payload.get("sections"), dict) else payload
    response_text = payload.get("response_text")
    has_unified_response = isinstance(response_text, str)
    if has_unified_response:
        state = plan = do_text = conclude = _clean(response_text)
    else:
        state = _clean(sections.get("state_text", sections.get("state", "")))
        plan_value = sections.get("plan") if isinstance(sections.get("plan"), dict) else {}
        plan = _clean(plan_value.get("text", sections.get("plan_text", "")))
        do_text = _clean(sections.get("do_text", payload.get("do_text", "")))
        conclude = _clean(sections.get("conclude_text", sections.get("conclude", "")))

    plan_value = sections.get("plan") if isinstance(sections.get("plan"), dict) else {}
    procedure = _clean(
        plan_value.get("procedure_name", sections.get("procedure_name", ""))
    )
    do_value = sections.get("do") if isinstance(sections.get("do"), dict) else {}
    combined_setup_text = f"{state}\n{plan}"
    parameter = _clean(PARAMETER_SYMBOLS[topic])
    context_words = data.get("context_keywords") or _keywords(data.get("parameter_description", ""))
    context_ok = (
        any(_clean(word) in combined_setup_text for word in context_words)
        and _mentions_parameter(combined_setup_text, parameter)
    )
    if topic.startswith("ht_"):
        h0 = re.search(
            r"\bh0\b(.*?)(?=\bha\b|[;\n]|$)", combined_setup_text, re.DOTALL
        )
        ha = re.search(
            r"\bha\b(.*?)(?=\.\s+[a-z]|[;\n]|$)", combined_setup_text, re.DOTALL
        )
        expected_null = float(data.get("null_value", data.get("p0", data.get("mu0", 0))))
        equality_ok = bool(
            h0
            and re.search(r"(?<![<>!])=(?!=)|\bis\b", h0.group(1))
            and _contains_number(h0.group(1), expected_null, 0.0005)
        )
        direction = str(data.get("direction", ""))
        direction_tokens = {"<": ("<", "less"), ">": (">", "greater"), "!=": ("!=", "different", "not equal")}
        alt_ok = bool(ha and any(token in ha.group(1) for token in direction_tokens.get(direction, ()))
                      and _contains_number(ha.group(1), expected_null, 0.0005))
        state_code = _grade([context_ok, equality_ok, alt_ok])
        state_feedback = _feedback(state_code, "Parameter and hypotheses are stated in context.",
                                   "Define the population parameter in context and check both hypotheses.",
                                   "State the population parameter and the null and alternative hypotheses.")
    else:
        confidence = float(data["conf_level"])
        confidence_ok = (
            _contains_number(combined_setup_text, confidence, 0.01)
            or _contains_number(combined_setup_text, confidence / 100, 0.0001)
        )
        state_code = _grade([context_ok, confidence_ok])
        state_feedback = _feedback(state_code, "Parameter and confidence level are stated in context.",
                                   "Include the population parameter and the requested confidence level.",
                                   "Define the population parameter in context and state the confidence level.")

    normalized_plan = _normalize_plan_text(combined_setup_text)
    proc_expected = _normalize_plan_text(data["procedure_name"])
    procedure_ok = (
        _normalize_plan_text(procedure) == proc_expected
        or proc_expected in normalized_plan
    )
    sample_sizes = data.get("sample_sizes") or [
        value for value in (data.get("n"), data.get("n1"), data.get("n2"))
        if value is not None
    ]
    context_in_response = any(
        _clean(word) in normalized_plan for word in context_words
    )
    random_marker = r"\b(?:random|randomly|srs)\b"
    random_evidence = context_in_response or any(
        _contains_number(normalized_plan, float(size))
        or _contains_number(normalized_plan, float(size) * 10)
        for size in sample_sizes
    )
    random_ok = bool(re.search(random_marker, normalized_plan)) and random_evidence
    independence_marker = r"(?:10\s*%|10\s*percent|0\.10|10\s+times|ten\s+times)"
    independence_ok = bool(sample_sizes) and all(
        _number_near_pattern(normalized_plan, float(size), independence_marker)
        or _number_near_pattern(normalized_plan, float(size) * 10, independence_marker)
        for size in sample_sizes
    )
    expected_numbers = _condition_numbers(topic, data)
    sample_numbers_ok = bool(sample_sizes) and all(
        _contains_number(normalized_plan, float(size))
        or _contains_number(normalized_plan, float(size) * 10)
        for size in sample_sizes
    )
    if "prop" in topic:
        count_numbers = expected_numbers[len(sample_sizes) * 2:]
        count_marker = r"(?:large counts?|at least\s+10|(?:>=|>)\s*10)"
        counts_ok = bool(count_numbers) and all(
            _contains_number(normalized_plan, number, 1.5)
            and _number_near_pattern(
                normalized_plan, number, count_marker, tolerance=1.5
            )
            for number in count_numbers
        )
        numeric_conditions_ok = sample_numbers_ok and bool(count_numbers) and all(
            _contains_number(normalized_plan, number, 1.5)
            for number in count_numbers
        )
        model_ok = counts_ok
    else:
        numeric_conditions_ok = sample_numbers_ok
        model_ok = any(
            word in normalized_plan
            for word in ("normal", "clt", "central limit", "approximately bell")
        )
    checks_claimed = random_ok and independence_ok and model_ok
    plan_code = _grade([procedure_ok, checks_claimed, numeric_conditions_ok])
    plan_feedback = _feedback(plan_code, "Procedure and conditions are identified with numerical checks.",
                              "Correct procedure; add the problem's numerical evidence to each condition check.",
                              "Name the exact procedure and address randomization, independence, and the model condition.")

    do_results = _parse_do_results(topic, data, do_text, do_value)
    do_checks: List[bool] = []
    if topic.startswith("ht_"):
        for key, expected, tolerance in (
            ("stat", float(data["stat"]), 0.005),
            ("p_value", float(data["p_val"]), 0.002),
        ):
            actual = do_results[key]
            do_checks.append(
                actual is not None and abs(actual - expected) <= tolerance
            )
    else:
        for key, expected in (
            ("lower", float(data["ci_lower"])),
            ("upper", float(data["ci_upper"])),
        ):
            actual = do_results[key]
            do_checks.append(
                actual is not None and abs(actual - expected) <= 0.005
            )
    if data.get("df") is not None and do_results["df"] is not None:
        do_checks.append(
            abs(do_results["df"] - float(data["df"])) <= 0.02
        )
    do_code = _grade(do_checks)
    do_feedback = _feedback(do_code, "Your calculations are within the accepted tolerances.",
                            "Review your final results and rounding, then check the formula setup.",
                            "Show your work and include the requested final statistic and probability or interval bounds.")

    if topic.startswith("ht_"):
        entered_p = do_results["p_value"]
        alpha = float(data["alpha"])
        expected_reject = entered_p <= alpha if entered_p is not None else False
        says_reject = bool(re.search(r"\breject(?:\s+h0|\s+the\s+null|\s+null)?\b", conclude))
        says_fail = bool(re.search(r"(?:fail(?:ed)?\s+to\s+reject|do\s+not\s+reject|don't\s+reject|cannot\s+reject|can't\s+reject)", conclude))
        decision_ok = (says_reject and not says_fail) if expected_reject else says_fail
        comparison_term = any(term in conclude for term in (
            ("less than", "smaller than", "below", "<=", "at most") if expected_reject
            else ("greater than", "larger than", "above", ">", "exceeds")
        ))
        comparison_ok = comparison_term and ("alpha" in conclude) and any(
            term in conclude for term in ("p-value", "pvalue", "p value")
        )
        alpha_in_text = _contains_number(conclude, alpha, 0.005)
        conclusion_p = _parse_conclusion_p_value(conclude)
        p_in_text = (
            entered_p is not None and conclusion_p is not None
            and abs(conclusion_p - entered_p) <= 0.01
        )
        negative_evidence = any(phrase in conclude for phrase in (
            "not convincing", "no convincing", "insufficient", "lack of convincing", "lack sufficient"
        ))
        evidence_ok = (
            not negative_evidence and any(phrase in conclude for phrase in
                ("convincing evidence", "sufficient evidence", "strong evidence", "enough evidence"))
            if expected_reject else
            negative_evidence or any(phrase in conclude for phrase in ("not enough evidence", "no sufficient evidence"))
        )
        direction = str(data["direction"])
        direction_ok = any(term in conclude for term in {
            "<": ("less than", "lower than", "below"),
            ">": ("greater than", "higher than", "above"),
            "!=": ("different", "differs", "not equal"),
        }[direction])
        context_conclude_ok = any(_clean(word) in conclude for word in context_words) and direction_ok
        fatal = (
            bool(re.search(r"\b(?:prove|proves|proved|proven)\b", conclude))
            or bool(re.search(r"\b(?:accept|accepting)\s+(?:h0|the null)\b|\bh0\s+is\s+true\b", conclude))
        )
        conclude_checks = [entered_p is not None, decision_ok, comparison_ok, evidence_ok,
                           context_conclude_ok, alpha_in_text, p_in_text, not fatal]
        conclude_code = _grade(conclude_checks)
        conclude_feedback = _feedback(conclude_code, "Decision, comparison, evidence, and context are consistent with your work.",
                                      "Revise the decision, comparison, evidence wording, or context to agree with your entered P-value.",
                                      "State a decision based on your entered P-value and α, with evidence phrased in context.")
    else:
        entered_lower, entered_upper = do_results["lower"], do_results["upper"]
        conclusion_lower, conclusion_upper = _parse_interval_bounds(conclude)
        confidence = float(data["conf_level"])
        bounds_match = (
            entered_lower is not None and entered_upper is not None
            and conclusion_lower is not None and conclusion_upper is not None
            and abs(conclusion_lower - entered_lower) <= 0.01
            and abs(conclusion_upper - entered_upper) <= 0.01
        )
        confidence_ok = _contains_number(conclude, confidence, 0.01)
        confidence_word_ok = bool(re.search(r"\bconfident\b|\bconfidence\b", conclude))
        captures = any(word in conclude for word in ("capture", "contains", "contain", "includes"))
        true_parameter = "true" in conclude and any(_clean(word) in conclude for word in context_words)
        sample_statistic_claim = bool(
            re.search(
                r"\b(?:captures?|contains?|includes?)\b.{0,50}"
                r"\b(?:sample\s+(?:proportion|mean)|phat|xbar)\b",
                conclude,
            )
            or re.search(
                r"\b(?:sample\s+(?:proportion|mean)|phat|xbar)\b.{0,50}"
                r"\b(?:is|falls|lies)\b.{0,30}\b(?:in|inside|within)\b.{0,20}\binterval\b",
                conclude,
            )
        )
        probability_misconception = bool(
            re.search(r"\b(?:probability|chance)\b", conclude)
            and "interval" in conclude
            and (
                re.search(r"\b(?:captures?|contains?|includes?)\b", conclude)
                or re.search(
                    r"\b(?:true|population|parameter|p|mu|phat|xbar)\b.{0,50}"
                    r"\b(?:is|lies|falls)\s+(?:in|inside|within)\b",
                    conclude,
                )
            )
        )
        conclude_code = _grade(
            [bounds_match, confidence_ok, confidence_word_ok, captures, true_parameter]
        )
        if sample_statistic_claim or probability_misconception:
            conclude_code = "P"
        if sample_statistic_claim:
            conclude_feedback = (
                "Confidence intervals estimate the population parameter, not the sample statistic."
            )
        elif probability_misconception:
            conclude_feedback = (
                "Use confidence language: a confidence interval does not give the probability "
                "that the fixed population parameter is in this interval."
            )
        else:
            conclude_feedback = _feedback(
                conclude_code,
                "Your interpretation matches the interval and parameter context.",
                "Revise the confidence wording, carried-through bounds, or contextual interpretation.",
                "Interpret the interval using your entered bounds and the true population parameter.",
            )

    results = {
        "state": {"score_code": state_code, "score_label": _score_label(state_code), "feedback": state_feedback},
        "plan": {"score_code": plan_code, "score_label": _score_label(plan_code), "feedback": plan_feedback},
        "do": {"score_code": do_code, "score_label": _score_label(do_code), "feedback": do_feedback},
        "conclude": {"score_code": conclude_code, "score_label": _score_label(conclude_code), "feedback": conclude_feedback},
    }
    overall = _grade([item["score_code"] == "E" for item in results.values()])
    try:
        attempt = max(1, int(payload.get("attempt", 1)))
    except (TypeError, ValueError, OverflowError):
        attempt = 1
    reveal_exemplar = payload.get("retry_mode") == "one_shot" or all(
        item["score_code"] == "E" for item in results.values()
    ) or attempt >= 2
    exemplar = _exemplar(topic, data, data["procedure_name"]) if reveal_exemplar else {}
    return {
        "score_code": overall,
        "passed": all(item["score_code"] == "E" for item in results.values()),
        "sections": results,
        "exemplar": exemplar,
        "model_conclusion": exemplar.get("conclude", ""),
    }
