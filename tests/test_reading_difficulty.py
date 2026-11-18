import random
import re
import unittest
from decimal import Decimal

from fastapi.testclient import TestClient

import main
from app.engine.chi_square import generate_chi_problem
from app.engine.confidence_intervals import generate_ci_problem
from app.engine.frq_inference import FRQ_TOPICS, evaluate_full_frq, generate_frq_problem
from app.engine.hypothesis_testing import generate_ht_problem
from app.engine.linear_regression import generate_regression_problem
from app.engine.reading_difficulty import apply_reading_difficulty


class ReadingDifficultyTests(unittest.TestCase):
    def test_advanced_changes_only_the_prompt(self):
        cases = [
            (generate_ci_problem, topic)
            for topic in ("prop_z", "prop_z_2samp", "mean_t", "mean_t_2samp", "matched_pairs_t")
        ] + [
            (generate_ht_problem, topic)
            for topic in (
                "ht_prop_z", "ht_prop_z_2samp", "ht_mean_t",
                "ht_mean_t_2samp", "ht_matched_pairs_t",
            )
        ] + [
            (generate_chi_problem, topic)
            for topic in ("chi_gof", "chi_independence", "chi_homogeneity", "chi_two_way")
        ] + [
            (generate_regression_problem, topic)
            for topic in (
                "reg_lsrl", "reg_pred_res", "reg_comp_output", "reg_raw_data",
                "reg_slope_ci", "reg_slope_test",
            )
        ] + [
            (generate_frq_problem, topic) for topic in FRQ_TOPICS
        ]
        for generator, topic in cases:
            with self.subTest(topic=topic):
                random.seed(47)
                standard = generator(topic)
                random.seed(47)
                advanced = generator(topic, reading_difficulty="advanced")
                standard_prompt = standard.pop("prompt")
                advanced_prompt = advanced.pop("prompt")
                self.assertEqual(standard, advanced)
                self.assertNotEqual(standard_prompt, advanced_prompt)
                self.assertIn("2024", advanced_prompt)
                self.assertIn("5 unrelated reports", advanced_prompt)

    def test_mean_prompts_use_exact_sample_variances(self):
        cases = [
            (generate_ci_problem, "mean_t", ("s",)),
            (generate_ci_problem, "mean_t_2samp", ("s_1", "s_2")),
            (generate_ci_problem, "matched_pairs_t", ("s_d",)),
            (generate_ht_problem, "ht_mean_t", ("s",)),
            (generate_ht_problem, "ht_mean_t_2samp", ("s_1", "s_2")),
            (generate_ht_problem, "ht_matched_pairs_t", ("s_d",)),
        ]
        for generator, topic, symbols in cases:
            with self.subTest(topic=topic):
                random.seed(21)
                standard = generator(topic)["prompt"]
                random.seed(21)
                advanced = generator(topic, reading_difficulty="advanced")["prompt"]
                for symbol in symbols:
                    original = re.search(
                        rf"(?<!\w){symbol}\s*=\s*(\d+(?:\.\d+)?)", standard
                    )
                    squared = re.search(
                        rf"(?<!\w){symbol}\^2\s*=\s*(\d+(?:\.\d+)?)", advanced
                    )
                    self.assertIsNotNone(original)
                    self.assertIsNotNone(squared)
                    self.assertEqual(Decimal(squared.group(1)), Decimal(original.group(1)) ** 2)
                    self.assertNotRegex(advanced, rf"(?<!\w){symbol}\s*=\s*\d")
                self.assertIn("variances", advanced)

    def test_variance_units_and_small_sample_sizes(self):
        problem = {
            "type": "mean_t",
            "prompt": r"A random sample of 16 observations has sample standard deviation \(s = 1.2\) mg/L.",
        }
        prompt = apply_reading_difficulty(problem, "advanced")["prompt"]
        self.assertIn("sample of sixteen", prompt)
        self.assertIn(r"\(s^2 = 1.44\) (mg/L)<sup>2</sup>", prompt)

    def test_frq_background_does_not_change_context_grading(self):
        random.seed(47)
        standard = generate_frq_problem("frq_chi_gof")
        random.seed(47)
        advanced = generate_frq_problem("frq_chi_gof", reading_difficulty="advanced")
        response = "H0: the proportions match the distribution. Ha: at least one differs. Background."
        standard_result = evaluate_full_frq({"problem": standard, "response_text": response})
        advanced_result = evaluate_full_frq({"problem": advanced, "response_text": response})
        self.assertEqual(standard_result, advanced_result)

    def test_problem_endpoints_receive_difficulty(self):
        client = TestClient(main.app)
        cases = [
            ("normal", "between"),
            ("ci", "mean_t"),
            ("ht", "ht_mean_t"),
            ("chi", "chi_gof"),
            ("regression", "reg_slope_ci"),
            ("targeted-step", "step__ci_mean_t__1"),
            ("foundations", "eda_summary"),
            ("prob_sampling", "prob_binom_geom"),
            ("drill", "drill_se_mean"),
            ("frq", "frq_chi_gof"),
        ]
        for endpoint, topic in cases:
            with self.subTest(endpoint=endpoint):
                response = client.get(
                    f"/api/problem/{endpoint}",
                    params={"topic": topic, "reading_difficulty": "advanced"},
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn("2024", response.json()["prompt"])
        response = client.get(
            "/api/problem/ci",
            params={"topic": "mean_t", "reading_difficulty": "unknown"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
