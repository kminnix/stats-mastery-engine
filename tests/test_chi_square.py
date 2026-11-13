import random
import re
import unittest
from unittest.mock import patch

from scipy.stats import chi2

from app.engine.chi_square import (
    generate_chi_problem,
    generate_chi_square_homogeneity,
    generate_chi_square_independence,
    generate_chi_square_two_way,
)


class ChiSquareTwoWayTests(unittest.TestCase):
    def assert_conditions_and_df(self, problem):
        conditions, df = problem["steps"][1:3]
        self.assertEqual(
            [option["label"] for option in conditions["components"][0]["options"]],
            [
                "Met — random sample/assignment and all expected counts E ≥ 5",
                "Not met — at least one expected count is less than 5 (E < 5)",
                "Not met — observed counts must all be at least 5 (O ≥ 5)",
                "Not met — all expected counts must be at least 10 (E ≥ 10)",
            ],
        )
        self.assertEqual(conditions["components"][1]["tolerance"], 0.05)
        self.assertEqual(df["input_type"], "number")
        self.assertEqual(df["label"], "Degrees of Freedom (df):")
        self.assertNotIn("inputs", df)
        self.assertNotIn("requested cell", problem["prompt"])
        self.assertNotIn("requested cell", problem["solution"])

    def test_distinct_hypotheses_and_numerical_results(self):
        state = random.getstate()
        try:
            random.seed(418)
            for topic, sampling, null_word, alternative_word in (
                ("chi_independence", "single random sample", "independent", "associated"),
                ("chi_homogeneity", "Independent random samples", "same", "differs"),
            ):
                for _ in range(50):
                    with self.subTest(topic=topic):
                        problem = generate_chi_problem(topic)
                        self.assert_conditions_and_df(problem)
                        self.assertEqual(problem["type"], topic)
                        self.assertEqual(problem["topic"], topic)
                        self.assertIn(sampling, problem["prompt"])
                        hypotheses, conditions, calculations, statistic, decision = problem["steps"]
                        self.assertEqual([step["step_num"] for step in problem["steps"]], [1, 2, 3, 4, 5])
                        minimum = conditions["components"][1]
                        self.assertGreaterEqual(minimum["expected"][0], 5)
                        self.assertEqual(minimum["tolerance"], 0.05)
                        rows = re.findall(r"\\text\{([^{}]+)\} & ((?:\d+(?: & )?)+)", problem["prompt"])
                        observed = [[int(value) for value in counts.split(" & ")] for _, counts in rows]
                        self.assertGreaterEqual(len(observed), 2)
                        row_totals = [sum(row) for row in observed]
                        column_totals = [sum(row[c] for row in observed) for c in range(len(observed[0]))]
                        expected_minimum = min(
                            row * col / sum(row_totals) for row in row_totals for col in column_totals
                        )
                        self.assertAlmostEqual(minimum["expected"][0], expected_minimum)
                        self.assertIn(null_word, hypotheses["components"][0]["expected"][0])
                        alternative = hypotheses["components"][1]["expected"][0]
                        self.assertIn(alternative_word, alternative)
                        context = next(item for item in decision["components"] if item["id"] == "chi-conclusion-context")
                        self.assertEqual(context["expected"], [alternative])
                        self.assertAlmostEqual(
                            decision["components"][0]["expected"][0],
                            chi2.sf(statistic["inputs"][0]["expected"][0], calculations["expected"][0]),
                        )
                        self.assertEqual(statistic["inputs"][1]["expected"], decision["components"][0]["expected"])
        finally:
            random.setstate(state)

    def test_legacy_dispatch_preserves_type_and_can_choose_either_procedure(self):
        for generator in (generate_chi_square_independence, generate_chi_square_homogeneity):
            with self.subTest(generator=generator.__name__):
                real_choice = random.choice

                def choose_legacy(options):
                    if options == [generate_chi_square_independence, generate_chi_square_homogeneity]:
                        return generator
                    return real_choice(options)

                with patch("app.engine.chi_square.random.choice", side_effect=choose_legacy):
                    problem = generate_chi_square_two_way()
                self.assertEqual(problem["type"], "chi_two_way")
                self.assertEqual(problem["topic"], "chi_two_way")
                self.assertEqual(problem["title"], "Chi-Square Test for " + (
                    "Independence" if generator is generate_chi_square_independence else "Homogeneity"
                ))

    def test_gof_dispatch_is_unchanged(self):
        self.assertEqual(generate_chi_problem("chi_gof")["type"], "chi_gof")

    def test_gof_stages_and_conditional_follow_up(self):
        state = random.getstate()
        try:
            random.seed(911)
            outcomes = set()
            for _ in range(500):
                problem = generate_chi_problem("chi_gof")
                self.assert_conditions_and_df(problem)
                steps = problem["steps"]
                conditions, calculations, statistic, decision = steps[1:5]
                self.assertGreaterEqual(conditions["components"][1]["expected"][0], 5)
                proportions = [float(value) for value in re.findall(
                    r": (0\.\d+)", problem["prompt"].split("In a random sample")[0]
                )]
                n = int(re.search(r"n=(\d+)", problem["prompt"]).group(1))
                self.assertAlmostEqual(conditions["components"][1]["expected"][0], n * min(proportions))
                self.assertEqual(steps[0]["label"], "State Hypotheses:")
                self.assertEqual(
                    statistic["inputs"][1]["expected"][0],
                    decision["components"][0]["expected"][0],
                )
                self.assertAlmostEqual(
                    statistic["inputs"][1]["expected"][0],
                    chi2.sf(statistic["inputs"][0]["expected"][0], calculations["expected"][0]),
                )
                rejected = decision["components"][3]["expected"][0] == "reject"
                outcomes.add(rejected)
                self.assertEqual(len(steps), 6 if rejected else 5)
                if rejected:
                    self.assertEqual(steps[5]["step_num"], 6)
            self.assertEqual(outcomes, {True, False})
        finally:
            random.setstate(state)


if __name__ == "__main__":
    unittest.main()
