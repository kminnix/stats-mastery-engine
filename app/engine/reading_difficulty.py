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
ADVANCED_BACKGROUND = (
    "For background, a 2024 review considered 5 unrelated reports; these "
    "figures do not describe the scenario below. In the present investigation: "
)


def apply_reading_difficulty(
    problem: Dict[str, Any], reading_difficulty: str = "standard"
) -> Dict[str, Any]:
    if reading_difficulty not in ("standard", "advanced"):
        raise ValueError(f"Unknown reading difficulty: {reading_difficulty}")
    if reading_difficulty == "standard":
        return problem

    prompt = problem["prompt"]
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
        metadata = problem.get("metadata") or {}
        mean = metadata.get("xbar", metadata.get("xbar1"))
        if mean is not None:
            baseline = Decimal(str(mean)) + Decimal("3.2")
            prompt = (
                f"A historical reference mean was {baseline} in the same measurement "
                "units, but it does not describe the current sample. " + prompt
            )

    def spell_sample_size(match: re.Match) -> str:
        size = int(match.group(2))
        return match.group(1) + _SMALL_NUMBERS.get(size, match.group(2))

    prompt = re.sub(
        r"(\brandom sample of )(\d+)\b", spell_sample_size, prompt,
        flags=re.IGNORECASE,
    )
    problem["prompt"] = ADVANCED_BACKGROUND + prompt
    return problem
