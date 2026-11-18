import copy
import unittest

from app.engine.frq_inference import (
    _parse_interval_bounds,
    evaluate_full_frq,
    generate_frq_problem,
)


class FullFrqInferenceTests(unittest.TestCase):
    def setUp(self):
        self.problem = generate_frq_problem("frq_ci_prop_1samp")

    def evaluate(self, data, exemplar, **changes):
        sections = {
            "state_text": exemplar["state"],
            "plan_text": exemplar["plan"],
            "do_text": exemplar["do"],
            "conclude_text": exemplar["conclude"],
        }
        sections.update(changes)
        return evaluate_full_frq({"problem": {"data": data}, "sections": sections})

    def test_interval_bounds_accept_common_student_formats(self):
        cases = {
            "(0.5493, 0.7041)": (0.5493, 0.7041),
            "[0.5493, 0.7041]": (0.5493, 0.7041),
            "0.5493 < p < 0.7041": (0.5493, 0.7041),
            "0.5493 ≤ μ ≤ 0.7041": (0.5493, 0.7041),
            "from 0.5493 to 0.7041": (0.5493, 0.7041),
            "between 0.5493 and 0.7041": (0.5493, 0.7041),
            "0.6267 ± 0.0774": (0.5493, 0.7041),
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                bounds = _parse_interval_bounds(text)
                self.assertAlmostEqual(bounds[0], expected[0])
                self.assertAlmostEqual(bounds[1], expected[1])

    def test_implicit_population_parameter_definition_is_accepted(self):
        data = copy.deepcopy(self.problem["data"])
        state = (
            f"{data['parameter_description'].capitalize()}. "
            f"The confidence level is {data['conf_level']}%."
        )
        result = self.evaluate(data, self.problem["exemplar"], state_text=state)
        self.assertEqual(result["sections"]["state"]["score_code"], "E")

    def test_thousands_separator_in_population_count_is_normalized(self):
        data = copy.deepcopy(generate_frq_problem("frq_ht_prop_1samp")["data"])
        data.update(n=150, sample_sizes=[150], p0=0.627)
        keyword = data["context_keywords"][0]
        plan = (
            f"{data['procedure_name']}. Random sample of {keyword}, n = 150. "
            "For independence, n is at most 10% of the population; at least "
            "1,500 produce samples. Large counts: 94 and 56 are at least 10."
        )
        exemplar = generate_frq_problem("frq_ht_prop_1samp")["exemplar"]
        result = self.evaluate(data, exemplar, plan_text=plan)
        self.assertEqual(result["sections"]["plan"]["score_code"], "E")

    def test_hypothesis_test_large_counts_use_null_proportion(self):
        problem = generate_frq_problem("frq_ht_prop_1samp")
        data = copy.deepcopy(problem["data"])
        data.update(n=200, sample_sizes=[200], p0=0.3)
        keyword = data["context_keywords"][0]
        plan = (
            f"{data['procedure_name']}. Random sample of {keyword}, n = 200. "
            "For independence, n is at most 10% of the population. "
            "Large counts from the sample proportion are 160 and 40, each at least 10."
        )
        result = self.evaluate(data, problem["exemplar"], plan_text=plan)
        self.assertNotEqual(result["sections"]["plan"]["score_code"], "E")

    def test_rounded_null_expected_counts_are_accepted(self):
        problem = generate_frq_problem("frq_ht_prop_1samp")
        data = copy.deepcopy(problem["data"])
        data.update(n=150, sample_sizes=[150], p0=0.627)
        keyword = data["context_keywords"][0]
        plan = (
            f"{data['procedure_name']}. Random sample of {keyword}, n = 150. "
            "For independence, n is at most 10% of the population. "
            "Large counts: 94 and 56 are each at least 10."
        )
        result = self.evaluate(data, problem["exemplar"], plan_text=plan)
        self.assertEqual(result["sections"]["plan"]["score_code"], "E")

    def test_sample_statistic_conclusion_gets_targeted_partial_credit(self):
        data = copy.deepcopy(self.problem["data"])
        keyword = data["context_keywords"][0]
        conclusion = (
            f"We are {data['conf_level']}% confident that the interval from "
            f"{data['ci_lower']:.4f} to {data['ci_upper']:.4f} captures the true "
            f"sample proportion of {keyword}."
        )
        result = self.evaluate(data, self.problem["exemplar"], conclude_text=conclusion)
        section = result["sections"]["conclude"]
        self.assertEqual(section["score_code"], "P")
        self.assertIn("not the sample statistic", section["feedback"])

    def test_probability_claim_about_interval_gets_targeted_partial_credit(self):
        data = copy.deepcopy(self.problem["data"])
        keyword = data["context_keywords"][0]
        conclusion = (
            f"There is a {data['conf_level']}% chance that the interval from "
            f"{data['ci_lower']:.4f} to {data['ci_upper']:.4f} captures the true "
            f"population parameter for {keyword}."
        )
        result = self.evaluate(data, self.problem["exemplar"], conclude_text=conclusion)
        section = result["sections"]["conclude"]
        self.assertEqual(section["score_code"], "P")
        self.assertIn("does not give the probability", section["feedback"])


if __name__ == "__main__":
    unittest.main()
