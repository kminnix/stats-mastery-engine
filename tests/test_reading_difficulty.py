import random
import re
import unittest
from decimal import Decimal
from math import sqrt
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from app.engine.chi_square import generate_chi_problem
from app.engine.confidence_intervals import generate_ci_problem
from app.engine.frq_inference import FRQ_TOPICS, evaluate_full_frq, generate_frq_problem
from app.engine.hypothesis_testing import generate_ht_problem
from app.engine.linear_regression import generate_regression_problem
from app.engine.probability_sampling import generate_prob_sampling_problem
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
            )
        ] + [
            (generate_frq_problem, topic)
            for topic in FRQ_TOPICS
            if topic not in ("frq_ci_slope", "frq_ht_slope")
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
                self.assertIsInstance(standard_prompt, str)
                self.assertIsInstance(advanced_prompt, str)

    def test_advanced_background_is_optional(self):
        problem = {"type": "other", "prompt": "The study reports a result."}
        with patch("app.engine.reading_difficulty.random.random", return_value=0.39), patch(
            "app.engine.reading_difficulty.random.choice",
            return_value="A prior-quarter pilot involved a separate group of observations.",
        ):
            with_background = apply_reading_difficulty(
                dict(problem), "advanced"
            )["prompt"]
        self.assertTrue(with_background.startswith("A prior-quarter pilot"))

        with patch("app.engine.reading_difficulty.random.random", return_value=0.4):
            without_background = apply_reading_difficulty(
                dict(problem), "advanced"
            )["prompt"]
        self.assertEqual(without_background, problem["prompt"])

    def test_mean_variance_challenge_keeps_values_but_removes_symbol_labels(self):
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
                    squared = Decimal(original.group(1)) ** 2 if original else None
                    self.assertIsNotNone(original)
                    self.assertRegex(
                        advanced,
                        rf"sample variance (?:of|is) {re.escape(str(squared))}",
                    )
                    self.assertNotRegex(advanced, rf"(?<!\w){symbol}\^2\s*=\s*\d")
                self.assertIn("variances", advanced)

    def test_variance_units_and_small_sample_sizes(self):
        problem = {
            "type": "mean_t",
            "prompt": r"A random sample of 16 observations has sample standard deviation \(s = 1.2\) mg/L.",
        }
        prompt = apply_reading_difficulty(problem, "advanced")["prompt"]
        self.assertIn("sample of sixteen", prompt)
        self.assertIn("sample variance of 1.44 (mg/L)<sup>2</sup>", prompt)

    def test_advanced_scrubs_measurement_labels_and_preserves_standard_and_metadata(self):
        problem = {
            "type": "other",
            "prompt": (
                r"Mean of \(\bar{x} = 42.5\), standard deviation \(s = 6.2\); "
                r"\(n = 500\), \(x = 323\), \(H_0:p=.6\), and \(\alpha=.05\). "
                r"The first group had \(x_1=207\) of \(n_1=250\). "
                r"The population mean is \(\mu = 50\) and its size is \(N = 4,560\)."
            ),
            "metadata": {"n": 500, "x": 323, "xbar": 42.5, "s": 6.2},
        }
        original_prompt = problem["prompt"]
        original_metadata = dict(problem["metadata"])
        self.assertIs(apply_reading_difficulty(problem, "standard"), problem)
        self.assertEqual(problem["prompt"], original_prompt)

        advanced = apply_reading_difficulty(
            {"type": problem["type"], "prompt": original_prompt, "metadata": original_metadata},
            "advanced",
        )
        self.assertIn("Mean of 42.5", advanced["prompt"])
        self.assertIn("standard deviation of 6.2", advanced["prompt"])
        self.assertIn("207 out of 250", advanced["prompt"])
        self.assertIn(r"\(H_0:p=.6\)", advanced["prompt"])
        self.assertIn(r"\(\alpha=.05\)", advanced["prompt"])
        self.assertIn("population mean is 50", advanced["prompt"])
        self.assertIn("size is 4,560", advanced["prompt"])
        self.assertNotRegex(advanced["prompt"], r"(?:\bn|\bx)\s*=\s*\d")
        self.assertEqual(advanced["metadata"], original_metadata)

    def test_advanced_conditions_boilerplate_is_removed(self):
        text = (
            "A sample is described."
            "<p>Assume the samples or pairs were randomly selected or randomly assigned, "
            "the groups are independent when applicable, and each sampled population "
            "is at least ten times the corresponding sample size. "
            "Assume each relevant population is approximately normal.</p>"
        )
        problem = {
            "type": "mean_t",
            "prompt": text,
            "metadata": {"sample_sizes": [16]},
        }
        advanced = apply_reading_difficulty(dict(problem), "advanced")["prompt"]
        self.assertNotIn("Assume the samples or pairs", advanced)
        self.assertNotIn("Assume each relevant population", advanced)
        self.assertIn("sampling frame contains 320 eligible units", advanced)
        self.assertIn("roughly symmetric", advanced)
        self.assertEqual(apply_reading_difficulty(dict(problem), "standard")["prompt"], text)

    def test_advanced_sampling_distribution_does_not_prescribe_normal_model(self):
        state = random.getstate()
        try:
            random.seed(406)
            for _ in range(12):
                problem = generate_prob_sampling_problem("sampling_dist", "advanced")
                self.assertNotIn("using a normal model", problem["prompt"].lower())
        finally:
            random.setstate(state)

    def test_advanced_slope_inference_uses_raw_data_table(self):
        for topic in ("reg_slope_ci", "reg_slope_test"):
            with self.subTest(topic=topic):
                problem = generate_regression_problem(
                    topic, reading_difficulty="advanced"
                )
                table = problem["table_data"]
                pairs = [(float(x), float(y)) for x, y in table["rows"]]
                self.assertEqual(len(table["headers"]), 2)
                self.assertNotIn("(x, y)", problem["prompt"])
                self.assertIn(len(pairs), (6, 7, 8))
                data = problem["metadata"]
                x_values, y_values = zip(*pairs)
                x_mean = sum(x_values) / len(pairs)
                y_mean = sum(y_values) / len(pairs)
                x_ss = sum((x - x_mean) ** 2 for x in x_values)
                slope = sum(
                    (x - x_mean) * (y - y_mean)
                    for x, y in pairs
                ) / x_ss
                intercept = y_mean - slope * x_mean
                residual_ss = sum(
                    (y - intercept - slope * x) ** 2
                    for x, y in pairs
                )
                standard_error = sqrt(
                    (residual_ss / (len(pairs) - 2)) / x_ss
                )
                self.assertAlmostEqual(data["slope"], slope)
                self.assertAlmostEqual(data["standard_error"], standard_error)
                if topic == "reg_slope_test":
                    self.assertAlmostEqual(data["stat"], slope / standard_error)

        for topic in ("frq_ci_slope", "frq_ht_slope"):
            with self.subTest(topic=topic):
                problem = generate_frq_problem(topic, reading_difficulty="advanced")
                self.assertIn(len(problem["table_data"]["rows"]), (6, 7, 8))

    def test_advanced_gof_describes_historical_distribution(self):
        random.seed(301)
        standard = generate_chi_problem("chi_gof")
        random.seed(301)
        advanced = generate_chi_problem("chi_gof", reading_difficulty="advanced")
        self.assertIn("Under the null hypothesis", standard["prompt"])
        self.assertNotIn("Under the null hypothesis", advanced["prompt"])
        self.assertIn("Historically,", advanced["prompt"])
        self.assertNotRegex(advanced["prompt"], r"\b[nN]\s*=\s*\d")
        self.assertEqual(standard["metadata"], advanced["metadata"])

    def test_eda_has_no_advanced_background(self):
        with patch("app.engine.reading_difficulty.random.random", return_value=0):
            problem = apply_reading_difficulty(
                {"type": "eda_summary", "prompt": "The data are 1, 2, 3."},
                "advanced",
            )
        self.assertEqual(problem["prompt"], "The data are 1, 2, 3.")

    def test_regression_predictor_value_is_not_scrubbed(self):
        problem = {
            "type": "reg_raw_data",
            "prompt": r"A sample has \(n=20\). Predict at \(x=3.5\).",
        }
        prompt = apply_reading_difficulty(problem, "advanced")["prompt"]
        self.assertIn("A sample has 20.", prompt)
        self.assertIn(r"\(x=3.5\)", prompt)

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
            ("prob_sampling", "sampling_dist"),
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
                self.assertIn("prompt", response.json())
        response = client.get(
            "/api/problem/ci",
            params={"topic": "mean_t", "reading_difficulty": "unknown"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
