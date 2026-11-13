import re
import unittest

from fastapi.testclient import TestClient

import main
from app.engine.confidence_intervals import generate_ci_problem
from app.engine.hypothesis_testing import generate_ht_problem


class SingleStepDrillTests(unittest.TestCase):
    def test_all_topics_route_to_single_step(self):
        client = TestClient(main.app)
        for topic, (engine, _, _) in main.SINGLE_STEP_TOPICS.items():
            with self.subTest(topic=topic):
                response = client.get(f"/api/problem/{engine}", params={"topic": topic})
                self.assertEqual(response.status_code, 200, response.text)
                problem = response.json()
                self.assertEqual(len(problem["steps"]), 1)
                step = problem["steps"][0]
                self.assertEqual(step["step_num"], 1)
                fields = step.get("inputs") or step.get("components") or [step]
                self.assertTrue(all(field.get("expected") for field in fields))
                if step["input_type"] == "cloze":
                    ids = {field["id"] for field in step["components"]}
                    self.assertTrue(all(part["component"] in ids for part in step["parts"] if isinstance(part, dict)))

    def test_conditions_appear_in_all_inference_procedures(self):
        ci_topics = ["prop_z", "prop_z_2samp", "mean_t", "mean_t_2samp", "matched_pairs_t"]
        ht_topics = ["ht_prop_z", "ht_prop_z_2samp", "ht_mean_t", "ht_mean_t_2samp", "ht_matched_pairs_t"]
        for topic in ci_topics + ht_topics:
            for _ in range(20):
                with self.subTest(topic=topic):
                    is_test = topic.startswith("ht_")
                    problem = generate_ht_problem(topic) if is_test else generate_ci_problem(topic)
                    steps = problem["steps"]
                    self.assertEqual([step["step_num"] for step in steps], list(range(1, len(steps) + 1)))
                    condition = steps[2 if is_test else 0]
                    self.assertEqual(condition["label"], "Check Conditions:")
                    self.assertIn("ten times", problem["prompt"])
                    if "prop" in topic:
                        self.assertEqual(len(condition["components"]), 2)
                        self.assertGreaterEqual(condition["components"][1]["expected"][0], 10)
                    else:
                        self.assertEqual(len(condition["components"]), 1)
                        self.assertIn("approximately normal", problem["prompt"])

    def test_specific_combined_drills(self):
        conditional = main.generate_single_step("prob_conditional")["steps"][0]
        self.assertEqual(len(conditional["inputs"]), 2)
        self.assertEqual(conditional["inputs"][1]["type"], "select")
        for topic in ("ci_prop_bounds", "ci_mean_bounds"):
            problem = main.generate_single_step(topic)
            self.assertEqual(len(problem["steps"][0]["inputs"]), 3)
            self.assertIn("critical value", problem["prompt"])
        seen = set()
        for _ in range(100):
            regression = main.generate_single_step("reg_step_slope_conc")
            kind = regression["type"]
            seen.add(kind)
            ids = {component["id"] for component in regression["steps"][0]["components"]}
            if kind == "reg_slope_ci":
                self.assertTrue({"slope-ci-lower", "slope-ci-upper", "slope-ci-interpretation"} <= ids)
                self.assertNotIn("conclusion-decision", ids)
                self.assertIn("Use t* =", regression["prompt"])
            else:
                self.assertIn("conclusion-decision", ids)
                self.assertNotIn("slope-ci-lower", ids)
                self.assertIn("Use P-value =", regression["prompt"])
                self.assertNotIn("The estimated slope", regression["prompt"])
            self.assertNotIn("Separately", regression["prompt"])
        self.assertEqual(seen, {"reg_slope_ci", "reg_slope_test"})

    def test_targeted_prompts_across_parent_families(self):
        endings = {
            "eda_five_num": "Find the five-number summary (Min, Q1, Median, Q3, Max).",
            "eda_iqr_fences": "Calculate the interquartile range (IQR) and the lower and upper outlier fences.",
            "eda_mean_sd": "Calculate the sample mean (x̄) and sample standard deviation (s_x).",
            "rv_transform": "Find the mean and standard deviation of W.",
            "rv_combine": "Find the mean and standard deviation of the combined variable.",
            "prob_marginal_joint": "Find the requested marginal and joint probabilities.",
            "prob_conditional": "Find the conditional probability and determine whether the events are independent.",
        }
        for prefix in ("ci_prop", "ci_mean", "ht_prop", "ht_mean"):
            endings[prefix + "_cond"] = "Verify whether the conditions for inference are met."
        for prefix in ("ci_prop", "ci_mean"):
            endings[prefix + "_crit_se"] = "Find the critical value and standard error."
            endings[prefix + "_bounds"] = "Calculate the margin of error and confidence interval bounds."
            endings[prefix + "_interp"] = "Interpret the confidence interval in context."
        for prefix in ("ht_prop", "ht_mean"):
            endings[prefix + "_hypo"] = "State the null and alternative hypotheses."
            endings[prefix + "_stat"] = "Calculate the standard error and test statistic."
            endings[prefix + "_pval"] = "Find the P-value and interpret it in context."
            endings[prefix + "_conc"] = "State your statistical decision and conclusion in context."
        for topic in main.SINGLE_STEP_TOPICS:
            for _ in range(15):
                with self.subTest(topic=topic):
                    problem = main.generate_single_step(topic)
                    prompt = problem["prompt"]
                    self.assertNotIn("For this drill", prompt)
                    self.assertNotIn("Construct a", prompt)
                    self.assertNotIn("Find their means and standard deviations", prompt)
                    self.assertNotIn("then determine whether the model", prompt)
                    if topic in endings:
                        self.assertTrue(prompt.endswith(endings[topic]), prompt)
                    if topic == "rv_transform":
                        self.assertNotIn(r"\mu_Y", prompt)
                        self.assertNotIn(r"\sigma_Y", prompt)
                        self.assertNotIn(" and Y ", prompt)
                    if topic == "rv_combine":
                        self.assertNotIn(r"\(W=", prompt)
                    if topic == "prob_conditional":
                        self.assertIn("table_data", problem)
                    if topic == "chi_step_conc":
                        self.assertIn("Use χ² =", prompt)
                        self.assertIn("Use P-value =", prompt)
                    if topic.endswith("_interp"):
                        self.assertIn("confidence interval is (", prompt)

    def test_proportion_large_count_calculations(self):
        for _ in range(50):
            ci = generate_ci_problem("prop_z")
            n = int(re.search(r"n = (\d+)", ci["prompt"]).group(1))
            x = int(re.search(r"x = (\d+)", ci["prompt"]).group(1))
            self.assertAlmostEqual(ci["steps"][0]["components"][1]["expected"][0], min(x, n - x))
            ci = generate_ci_problem("prop_z_2samp")
            x1, n1, x2, n2 = map(int, re.search(
                r"samples, (\d+) of (\d+) individuals in group 1 and (\d+) of (\d+)", ci["prompt"]
            ).groups())
            self.assertAlmostEqual(ci["steps"][0]["components"][1]["expected"][0],
                                   min(x1, n1 - x1, x2, n2 - x2))
            test = generate_ht_problem("ht_prop_z")
            p0 = float(re.search(r"p=([\d.]+)", test["prompt"]).group(1))
            n = int(re.search(r"n=(\d+)", test["prompt"]).group(1))
            self.assertAlmostEqual(test["steps"][2]["components"][1]["expected"][0],
                                   min(n * p0, n * (1 - p0)))
            test = generate_ht_problem("ht_prop_z_2samp")
            x1, n1, x2, n2 = map(int, re.search(
                r"x_1=(\d+).*?n_1=(\d+).*?x_2=(\d+).*?n_2=(\d+)", test["prompt"]
            ).groups())
            pooled = (x1 + x2) / (n1 + n2)
            self.assertAlmostEqual(test["steps"][2]["components"][1]["expected"][0],
                                   min(n1 * pooled, n1 * (1 - pooled), n2 * pooled, n2 * (1 - pooled)))

    def test_catalogs_match_routing(self):
        with open("app/static/app.js", encoding="utf-8-sig") as file:
            practice = file.read().split("const TOPIC_REGISTRY = [", 1)[1].split("\n];", 1)[0]
        with open("app/templates/create_assessment.html", encoding="utf-8") as file:
            builder = file.read().split("const ASSESSABLE_SKILLS = [", 1)[1].split("\n    ];", 1)[0]
        for topic in main.SINGLE_STEP_TOPICS:
            self.assertEqual(len(re.findall(r"\bid: '" + re.escape(topic) + r"'", practice)), 1, topic)
            self.assertEqual(len(re.findall(r"\bid: '" + re.escape(topic) + r"'", builder)), 1, topic)
        self.assertNotIn("Step Drill:", practice)
        self.assertNotIn("Step Drill:", builder)
