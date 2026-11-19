import random
import re
from decimal import Decimal
from typing import Any, Dict


_MEAN_TYPES = {
    "mean_t", "mean_t_2samp", "matched_pairs_t",
    "ht_mean_t", "ht_mean_t_2samp", "ht_matched_pairs_t",
}
_SMALL_NUMBERS = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
    11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen",
    15: "fifteen", 16: "sixteen", 17: "seventeen",
    18: "eighteen", 19: "nineteen",
}
ADVANCED_OPENERS = (
    "A prior-quarter pilot recorded 18 observations from a separate group.",
    "A regional benchmark covered 24 districts, rather than the sample described here.",
    "Historical baselines for this outcome were recorded three years earlier.",
    "The equipment specification lists a nominal capacity of 75 units, not a study result.",
    "An archival record summarizes 12 earlier cases from a different collection.",
    "An earlier survey wave drew 31 responses from a separate group.",
    "A planning estimate was prepared before data collection and refers to a broader population.",
    "A nearby site reported measurements under a different protocol.",
    "A prior-year report tracked a related outcome using another sample.",
    "A preliminary calibration run used 10 readings before these data were recorded.",
    "A regional planning file includes figures from a separate collection period.",
    "An earlier protocol review summarized results from another study.",
)


def _scrub_explicit_measurement_labels(prompt: str, scrub_x_counts: bool = True) -> str:
    number = r"[-+]?(?:\d+(?:\.\d+)?|\.\d+)"
    open_math, close_math = r"(?:\\\(\s*)?", r"(?:\s*\\\))?"

    pair_pattern = re.compile(
        rf"(?<![A-Za-z0-9_]){open_math}x\s*_\s*(?:\{{\s*[12]\s*\}}|[12])"
        rf"\s*=\s*(?P<x>{number}){close_math}\s+of\s+"
        rf"{open_math}n\s*_\s*(?:\{{\s*[12]\s*\}}|[12])\s*=\s*"
        rf"(?P<n>{number}){close_math}"
    )
    prompt = pair_pattern.sub(
        lambda match: f"{match.group('x')} out of {match.group('n')}", prompt
    )

    mean_pattern = re.compile(
        rf"(?<![A-Za-z0-9_]){open_math}"
        rf"(?:\\bar\s*\{{\s*[xyd]\s*\}}|[xyd]̄|[xyd]bar)"
        rf"(?P<sub>\s*_\s*(?:\{{\s*(?:[12]|d|x|y)\s*\}}|[12dxy]"
        rf"|\{{\s*\\text\s*\{{\s*diff\s*\}}\s*\}}))?"
        rf"\s*=\s*(?P<value>{number}){close_math}"
    )

    def replace_mean(match: re.Match) -> str:
        prefix = re.sub(r"<[^>]*>", "", prompt[:match.start()])[-60:].lower()
        value = match.group("value")
        if re.search(r"(?:mean|average)\b[^.;]{0,40}\b(?:of|is)\s*$", prefix):
            return value
        if re.search(r"(?:mean|average)\s*$", prefix):
            return f"of {value}"
        return f"a sample mean of {value}"

    prompt = mean_pattern.sub(replace_mean, prompt)

    standard_deviation_pattern = re.compile(
        rf"(?<![A-Za-z0-9_]){open_math}s"
        rf"(?:\s*_\s*(?:\{{\s*(?:[12]|d|x|y)\s*\}}|[12dxy]))?"
        rf"(?P<variance>\s*\^2)?\s*=\s*(?P<value>{number}){close_math}"
    )

    def replace_standard_deviation(match: re.Match) -> str:
        prefix = re.sub(r"<[^>]*>", "", prompt[:match.start()])[-60:].lower()
        value = match.group("value")
        if match.group("variance"):
            if re.search(r"variance\s+(?:of|is)\s*$", prefix):
                return value
            if re.search(r"variance\s*$", prefix):
                return f"of {value}"
            return f"a sample variance of {value}"
        if re.search(r"(?:standard deviation|sd)\s+(?:of|is)\s*$", prefix):
            return value
        if re.search(r"(?:standard deviation|sd)\s*$", prefix):
            return f"of {value}"
        return f"a sample standard deviation of {value}"

    prompt = standard_deviation_pattern.sub(replace_standard_deviation, prompt)

    population_size_pattern = re.compile(
        rf"(?<![A-Za-z0-9_]){open_math}N\s*=\s*"
        r"(?P<value>\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*\\\))?"
    )

    def replace_population_size(match: re.Match) -> str:
        value = Decimal(match.group("value").replace(",", ""))
        if value == value.to_integral_value():
            return f"{int(value):,}"
        return str(value)

    prompt = population_size_pattern.sub(replace_population_size, prompt)

    population_mean_pattern = re.compile(
        rf"(?<![A-Za-z0-9_]){open_math}(?:\\mu|μ|mu)\s*=\s*"
        rf"(?P<value>{number}){close_math}",
        flags=re.IGNORECASE,
    )
    prompt = population_mean_pattern.sub(lambda match: match.group("value"), prompt)

    if scrub_x_counts:
        count_pattern = re.compile(
            rf"(?<![A-Za-z0-9_]){open_math}"
            rf"(?:n|x)(?:\s*_\s*(?:\{{\s*[12]\s*\}}|[12]))?"
            rf"\s*=\s*(?P<value>{number}){close_math}"
        )
        prompt = count_pattern.sub(lambda match: match.group("value"), prompt)
    else:
        sample_size_pattern = re.compile(
            rf"(?<![A-Za-z0-9_]){open_math}"
            rf"n(?:\s*_\s*(?:\{{\s*[12]\s*\}}|[12]))?"
            rf"\s*=\s*(?P<value>{number}){close_math}"
        )
        prompt = sample_size_pattern.sub(lambda match: match.group("value"), prompt)

    return prompt


def apply_reading_difficulty(
    problem: Dict[str, Any], reading_difficulty: str = "standard"
) -> Dict[str, Any]:
    if reading_difficulty not in ("standard", "advanced"):
        raise ValueError(f"Unknown reading difficulty: {reading_difficulty}")
    if reading_difficulty == "standard":
        return problem

    prompt = problem["prompt"]
    marker = '<div class="problem-step-context">'
    step_context = ""
    if marker in prompt:
        prompt, step_context = prompt.split(marker, 1)
        step_context = marker + step_context
    prompt = re.sub(
        r"Assume the samples or pairs were randomly selected.*?"
        r"corresponding sample size\.\s*",
        "",
        prompt,
        flags=re.IGNORECASE | re.DOTALL,
    )
    prompt = re.sub(
        r"Assume each relevant population, or the population of paired differences, "
        r"is approximately normal\.\s*",
        "",
        prompt,
        flags=re.IGNORECASE,
    )
    prompt = re.sub(r"<p>\s*</p>", "", prompt, flags=re.IGNORECASE)
    prompt = re.sub(
        r"\b(?:The sample|The sampling design) is random\.\s*",
        "",
        prompt,
        flags=re.IGNORECASE,
    )

    problem_type = str(problem.get("type", ""))
    if problem_type == "chi_gof":
        prompt = re.sub(
            r"A researcher studies the ([^.]+)\. Under the null hypothesis, "
            r"the population proportions are (.*?)\.(?= In a random sample)",
            r"Historically, \1 followed this distribution: \2.",
            prompt,
        )
    metadata = problem.get("metadata") or {}
    sample_sizes = metadata.get("sample_sizes") or [
        value for value in (metadata.get("n"), metadata.get("n1"), metadata.get("n2"))
        if value is not None
    ]
    if problem_type.startswith(("prop_z", "mean_t", "ht_", "chi_", "reg_slope")) and sample_sizes:
        population_size = metadata.get("population_size")
        has_frame_count = re.search(
            r"\b(?:sampling frame|source populations?)\b[^.!?]*\d",
            prompt,
            flags=re.IGNORECASE,
        )
        has_population_count = (
            population_size is not None
            and re.search(r"\bpopulation\b[^.!?]*\d", prompt, flags=re.IGNORECASE)
        )
        if not has_frame_count and not has_population_count:
            provided_population_sizes = metadata.get("population_sizes")
            if (
                isinstance(provided_population_sizes, list)
                and len(provided_population_sizes) == len(sample_sizes)
            ):
                population_sizes = [int(size) for size in provided_population_sizes]
            elif population_size is not None and len(sample_sizes) == 1:
                population_sizes = [int(population_size)]
            else:
                population_sizes = [int(size) * 20 for size in sample_sizes]
            formatted_population_sizes = ", ".join(
                f"{size:,}" for size in population_sizes
            )
            if len(population_sizes) == 1:
                prompt += (
                    f" The sampling frame contains {population_sizes[0]:,} eligible units."
                )
            else:
                prompt += (
                    f" The respective source populations contain "
                    f"{formatted_population_sizes} eligible units."
                )

    if problem_type in _MEAN_TYPES and sample_sizes and min(sample_sizes) < 30:
        if "matched_pairs" in problem_type:
            prompt += (
                " A plot of the paired differences is roughly symmetric, with no extreme values."
            )
        elif "2samp" in problem_type:
            prompt += (
                " Within each group, the measured values are roughly symmetric and show no "
                "extreme outliers."
            )
        else:
            prompt += (
                " A plot of the measured values is roughly symmetric, with no extreme outliers."
            )

    if problem.get("type") in _MEAN_TYPES:
        def variance(match: re.Match) -> str:
            squared = Decimal(match.group("value")) ** 2
            return f"s{match.group('sub') or ''}^2{match.group('space')}={match.group('after')}{squared}"

        prompt, replacements = re.subn(
            r"(?<![a-zA-Z0-9_])s(?P<sub>_1|_2|_d)?(?P<space>\s*)="
            r"(?P<after>\s*)(?P<value>\d+(?:\.\d+)?)",
            variance,
            prompt,
        )
        if replacements:
            prompt = prompt.replace("sample standard deviation", "sample variance")
            prompt = re.sub(
                r"(\\\(s(?:_1|_2|_d)?\s*\^2\s*=\s*\d+(?:\.\d+)?\\\))"
                r" ([^.;<>]+)(?=[.;])",
                r"\1 (\2)<sup>2</sup>",
                prompt,
            )
            if problem["type"] == "ht_mean_t_2samp":
                prompt = re.sub(
                    r", in ([a-zA-Z ]+)\.",
                    r"; the means are in \1 and the variances are in squared \1.",
                    prompt,
                    count=1,
                )
            prompt = (
                "The reported sample spread values are variances in squared units, "
                "rather than standard deviations. " + prompt
            )

    prompt = _scrub_explicit_measurement_labels(
        prompt, scrub_x_counts=not str(problem.get("type", "")).startswith("reg_")
    )

    def spell_sample_size(match: re.Match) -> str:
        size = int(match.group(2))
        return match.group(1) + _SMALL_NUMBERS.get(size, match.group(2))

    prompt = re.sub(
        r"(\brandom sample of )(\d+)\b", spell_sample_size, prompt,
        flags=re.IGNORECASE,
    )
    if problem_type != "eda_summary" and random.random() < 0.4:
        prompt = random.choice(ADVANCED_OPENERS) + " " + prompt
    problem["prompt"] = prompt + step_context
    return problem
