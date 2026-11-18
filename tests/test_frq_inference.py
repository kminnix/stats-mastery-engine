import copy
import unittest

from app.engine.frq_inference import (
    _ALTERNATIVE_LABEL,
    _NULL_LABEL,
    _clean,
    _extended_do_results,
    _extract_hypothesis_text,
    _extract_labeled_number,
    _matches_context,
    _mentions_parameter,
    _normalize_do_text,
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

    def test_chi_square_hypothesis_aliases_are_graded_without_scalar_parameters(self):
        for topic in (
            "frq_chi_gof",
            "frq_chi_independence",
            "frq_chi_homogeneity",
        ):
            problem = generate_frq_problem(topic)
            data = problem["data"]
            for null_label, alternative_label in (
                ("Null", "Alt"),
                ("Ho", "Ha"),
                ("H₀", "Hₐ"),
                ("h0", "ha"),
                ("null hypothesis", "alternative hypothesis"),
            ):
                with self.subTest(
                    topic=topic,
                    null_label=null_label,
                    alternative_label=alternative_label,
                ):
                    sections = {
                        "state_text": (
                            f"{null_label}: {data['null_statement']}. "
                            f"{alternative_label}: {data['alternative_statement']}."
                        ),
                        "plan_text": problem["exemplar"]["plan"],
                        "do_text": problem["exemplar"]["do"],
                        "conclude_text": problem["exemplar"]["conclude"],
                    }
                    result = evaluate_full_frq({
                        "problem": {"data": data},
                        "sections": sections,
                    })
                    self.assertEqual(result["sections"]["state"]["score_code"], "E")

    def test_chi_square_inline_statistic_and_df_use_final_evaluated_values(self):
        result = _extended_do_results(
            "chi_gof",
            {"stat": 0.4783, "p_val": 0.9929, "df": 5},
            "χ^2 = (37-34.58)^2/34.58 = 0.4783\n"
            "p = 0.9929\ndf = 6 - 1 = 5",
            {},
        )
        self.assertAlmostEqual(result["stat"], 0.4783)
        self.assertAlmostEqual(result["p_value"], 0.9929)
        self.assertAlmostEqual(result["df"], 5)

    def test_multiline_hypotheses_stop_at_labels_blank_lines_and_plan(self):
        text = (
            "H₀: the category proportions\n"
            "match the claimed distribution\n"
            "Hₐ: at least one category proportion\n"
            "differs from the claimed distribution\n"
            "Plan: chi-square goodness of fit\n"
            "random sample"
        )
        self.assertIn(
            "match the claimed distribution",
            _extract_hypothesis_text(text, _NULL_LABEL, _ALTERNATIVE_LABEL),
        )
        alternative = _extract_hypothesis_text(text, _ALTERNATIVE_LABEL)
        self.assertIn("differs from the claimed distribution", alternative)
        self.assertNotIn("Plan:", alternative)
        self.assertEqual(
            _extract_hypothesis_text("Null: first line\nsecond line\n\nHa: other", _NULL_LABEL, _ALTERNATIVE_LABEL),
            "first line\nsecond line",
        )
        self.assertEqual(
            _extract_hypothesis_text("Ha: no claim. Plan: at least one differs", _ALTERNATIVE_LABEL),
            "no claim.",
        )

    def test_chi_gof_accepts_multiline_explicit_null_proportions(self):
        problem = generate_frq_problem("frq_chi_gof")
        data = copy.deepcopy(problem["data"])
        data["null_proportions"] = [0.16, 0.18]
        for proportions in (
            "p_monday = 0.16,\np_tuesday = 0.18",
            "p1 = 0.16,\np2 = 0.18",
            "category proportions = 0.16 and\n0.18",
        ):
            with self.subTest(proportions=proportions):
                state = (
                    f"H₀: category {proportions}\n"
                    "Hₐ: at least one category proportion\n"
                    "differs from the claimed distribution."
                )
                result = self.evaluate(data, problem["exemplar"], state_text=state)
                self.assertEqual(result["sections"]["state"]["score_code"], "E")

    def test_chi_gof_does_not_take_alternative_from_plan(self):
        problem = generate_frq_problem("frq_chi_gof")
        response = (
            f"H0: {problem['data']['null_statement']}\n"
            "Ha: no claim here.\n"
            "Plan: at least one category proportion differs."
        )
        result = evaluate_full_frq({
            "problem": {"data": problem["data"]},
            "response_text": response,
        })
        self.assertNotEqual(result["sections"]["state"]["score_code"], "E")

    def test_chi_hypothesis_semantics_accept_wrapped_phrases(self):
        problem = generate_frq_problem("frq_chi_independence")
        result = self.evaluate(
            problem["data"],
            problem["exemplar"],
            state_text=(
                f"H0: There is no\nassociation between the variables for "
                f"{problem['data']['context_keywords'][0]}.\n"
                "Ha: The variables are\nassociated."
            ),
        )
        self.assertEqual(result["sections"]["state"]["score_code"], "E")

    def test_multiline_do_results_ignore_exponents_and_percentages(self):
        for label in ("χ²", "χ^2"):
            text = (
                f"{label} = (28-28.32)^2/28.32 +\n"
                "(32-30)²/30\n= 1.4964\n"
                "P-value 0.4738\ndf = 6 - 1 = 5"
            )
            result = _extended_do_results("chi_gof", {}, text, {})
            with self.subTest(label=label):
                self.assertAlmostEqual(result["stat"], 1.4964)
                self.assertAlmostEqual(result["p_value"], 0.4738)
                self.assertAlmostEqual(result["df"], 5)
        normalized = _normalize_do_text("χ² = 2.5^2 + 95%\n\np = 0.1")
        self.assertEqual(_extract_labeled_number(normalized, "chi2", "p"), 2.5)

    def test_multiline_do_results_are_used_by_full_frq_evaluation(self):
        problem = generate_frq_problem("frq_chi_gof")
        data = problem["data"]
        response = (
            f"{problem['exemplar']['state']}\n\n{problem['exemplar']['plan']}\n\n"
            f"χ² = (28-28.32)^2/28.32 +\n= {data['stat']:.4f}\n"
            f"p-value {data['p_val']:.5f}\ndf = {data['df']}\n\n"
            f"{problem['exemplar']['conclude']}"
        )
        result = evaluate_full_frq({"problem": {"data": data}, "response_text": response})
        self.assertEqual(result["sections"]["do"]["score_code"], "E")

    def test_extended_tests_accept_p_value_and_parameter_variants(self):
        for label in ("χ²", "χ^2", "chi-square", "chi squared", "chi2"):
            for kind in ("chi_gof", "chi_independence", "chi_homogeneity"):
                result = _extended_do_results(
                    kind,
                    {"stat": 0.4783, "p_val": 0.9929, "df": 5},
                    f"{label} = (37-34.58)^2/34.58 = 0.4783\n"
                    "P-value = 0.9929\ndf = 5",
                    {},
                )
                with self.subTest(kind=kind, label=label):
                    self.assertAlmostEqual(result["stat"], 0.4783)
                    self.assertAlmostEqual(result["p_value"], 0.9929)
        for kind in ("matched_ht", "slope_ht"):
            result = _extended_do_results(
                kind,
                {"stat": 2.4, "p_val": 0.015, "df": 16},
                "t = 2.4\np = 0.015\ndf = 18 - 2 = 16",
                {},
            )
            with self.subTest(kind=kind):
                self.assertAlmostEqual(result["p_value"], 0.015)
                self.assertAlmostEqual(result["df"], 16)

        self.assertTrue(_mentions_parameter(_clean("μ_diff"), "mu_diff"))
        self.assertTrue(_mentions_parameter(_clean("μd"), "mu_diff"))
        self.assertTrue(_mentions_parameter(_clean("mu_d"), "mu_diff"))
        self.assertTrue(_mentions_parameter(
            _clean("the true mean paired difference in test scores"),
            "mu_diff",
        ))
        self.assertTrue(_mentions_parameter(_clean("β₁"), "beta1"))
        self.assertTrue(_mentions_parameter(_clean("β"), "beta1"))
        self.assertTrue(_mentions_parameter(_clean("beta1"), "beta1"))
        self.assertTrue(_mentions_parameter(_clean("beta"), "beta1"))
        self.assertTrue(_mentions_parameter(
            _clean("the true slope of the population regression line"),
            "beta1",
        ))

    def test_chi_square_conclusion_context_handles_ampersands_and_evidence_wording(self):
        problem = generate_frq_problem("frq_chi_gof")
        data = problem["data"]
        data["context_keywords"] = ["M&M's", "colors", "category", "distribution"]
        self.assertTrue(_matches_context("The M&M's colors follow this distribution.", data["context_keywords"]))
        p_value, alpha = data["p_val"], data["alpha"]
        reject = p_value <= alpha
        comparison = "less than or equal to" if reject else "greater than"
        decision = "reject" if reject else "fail to reject"
        evidence = "convincing" if reject else "not convincing"
        conclusion = (
            f"Since the P-value {p_value:.5f} is {comparison} alpha = {alpha:g}, "
            f"we {decision} H0. There is {evidence} evidence that the category "
            "distribution for M&M's differs from the claimed distribution."
        )
        result = self.evaluate(
            data,
            problem["exemplar"],
            state_text=(
                f"Null: {data['null_statement']}. "
                f"Alt: {data['alternative_statement']}."
            ),
            conclude_text=conclusion,
        )
        self.assertEqual(result["sections"]["conclude"]["score_code"], "E")

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
