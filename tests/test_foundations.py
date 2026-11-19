import math
import random
import re
import statistics
import unittest

from app.engine.foundations import generate_foundations_problem
from app.engine.input_types import tag_problem_input_types


class FoundationsTests(unittest.TestCase):
    def test_summary_statistics_and_outliers(self):
        state = random.getstate()
        try:
            random.seed(101)
            lengths, directions = set(), set()
            for _ in range(300):
                problem = tag_problem_input_types(generate_foundations_problem("eda_summary"))
                values = [float(value) for value in problem["prompt"].split("minutes: ")[1].split(". Find")[0].split(", ")]
                ordered = sorted(values)
                n = len(values)
                lengths.add(n)
                q1 = statistics.median(ordered[:n // 2])
                q3 = statistics.median(ordered[(n + 1) // 2:])
                iqr = q3 - q1
                lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                outliers = [x for x in ordered if x < lower or x > upper]
                self.assertTrue(outliers)
                directions.update("lower" if x < lower else "upper" for x in outliers)
                expected = [
                    [ordered[0], q1, statistics.median(ordered), q3, ordered[-1]],
                    [iqr, lower, upper],
                    [len(outliers), statistics.mean(values), statistics.stdev(values)],
                ]
                for step, answers in zip(problem["steps"], expected):
                    for field, value in zip(step["inputs"], answers):
                        self.assertAlmostEqual(field["expected"][0], value)
                self.assertTrue(all(field["input_type"] == "number" for field in problem["steps"][1]["inputs"]))
            self.assertEqual(lengths, {8, 9})
            self.assertEqual(directions, {"lower", "upper"})
        finally:
            random.setstate(state)

    def test_advanced_summary_frequency_table_statistics(self):
        state = random.getstate()
        try:
            random.seed(102)
            for _ in range(50):
                problem = generate_foundations_problem("eda_summary", "advanced")
                prompt = problem["prompt"]
                self.assertIn("<caption>Frequency Table</caption>", prompt)
                self.assertIn(">Value</th>", prompt)
                self.assertIn(">Frequency</th>", prompt)
                rows = re.findall(
                    r"<tr><td[^>]*>(\d+)</td><td[^>]*>(\d+)</td></tr>",
                    prompt,
                )
                self.assertIn(len(rows), (4, 5))
                self.assertEqual(len({value for value, _ in rows}), len(rows))
                values = [
                    int(value)
                    for value, frequency in rows
                    for _ in range(int(frequency))
                ]
                self.assertTrue(all(int(frequency) > 0 for _, frequency in rows))
                self.assertTrue(10 <= len(values) <= 14)
                ordered = sorted(values)
                n = len(values)
                q1 = statistics.median(ordered[:n // 2])
                q3 = statistics.median(ordered[(n + 1) // 2:])
                iqr = q3 - q1
                lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                expected = [
                    [ordered[0], q1, statistics.median(ordered), q3, ordered[-1]],
                    [iqr, lower, upper],
                    [sum(value < lower or value > upper for value in values),
                     statistics.mean(values), statistics.stdev(values)],
                ]
                for step, answers in zip(problem["steps"], expected):
                    for field, value in zip(step["inputs"], answers):
                        self.assertAlmostEqual(field["expected"][0], value)
        finally:
            random.setstate(state)

    def test_transformations_and_independent_combinations(self):
        state = random.getstate()
        try:
            random.seed(202)
            combinations, signs = set(), set()
            for _ in range(200):
                problem = generate_foundations_problem("rv_transform_combine")
                prompt = problem["prompt"]
                mu_x, sd_x, mu_y, sd_y = map(int, re.findall(r"\\(?:mu|sigma)_[XY]=(\d+)", prompt))
                a, b = map(int, re.search(r"W=(\d+)\+\((-?\d+)\)X", prompt).groups())
                symbol = re.search(r"[TD]=X([+-])Y", prompt).group(1)
                combinations.add(symbol)
                signs.add(b < 0)
                steps = problem["steps"]
                self.assertEqual(steps[0]["inputs"][0]["expected"], [a + b * mu_x])
                self.assertEqual(steps[0]["inputs"][1]["expected"], [abs(b) * sd_x])
                self.assertEqual(steps[0]["inputs"][1]["input_type"], "number")
                self.assertEqual(steps[1]["inputs"][0]["expected"], [mu_x + mu_y if symbol == "+" else mu_x - mu_y])
                self.assertAlmostEqual(steps[1]["inputs"][1]["expected"][0], math.hypot(sd_x, sd_y))
                self.assertEqual(steps[1]["inputs"][1]["input_type"], "number")
            self.assertEqual(combinations, {"+", "-"})
            self.assertEqual(signs, {True, False})
        finally:
            random.setstate(state)

    def test_table_probabilities_and_exact_independence(self):
        state = random.getstate()
        try:
            random.seed(303)
            outcomes, widths = set(), set()
            for _ in range(300):
                problem = generate_foundations_problem("prob_twoway")
                table = problem["table_data"]
                first, second, totals = table["rows"]
                widths.add(len(table["headers"]))
                self.assertEqual(len(first), len(table["headers"]))
                cells = [first[1:-1], second[1:-1]]
                self.assertTrue(all(value > 0 for row in cells for value in row))
                self.assertEqual(first[-1], sum(cells[0]))
                self.assertEqual(second[-1], sum(cells[1]))
                self.assertEqual(totals[1:-1], [sum(row[c] for row in cells) for c in range(len(cells[0]))])
                n = totals[-1]
                self.assertEqual(n, first[-1] + second[-1])
                steps = problem["steps"]
                self.assertAlmostEqual(steps[0]["inputs"][0]["expected"][0], first[-1] / n)
                self.assertAlmostEqual(steps[0]["inputs"][1]["expected"][0], cells[0][0] / n)
                self.assertAlmostEqual(steps[1]["inputs"][0]["expected"][0], cells[0][0] / totals[1])
                self.assertTrue(all(
                    field["input_type"] == "number"
                    for step in steps[:2] for field in step["inputs"]
                ))
                independent = cells[0][0] * n == first[-1] * totals[1]
                outcomes.add(independent)
                self.assertEqual(steps[2]["expected"][0].startswith("Independent"), independent)
            self.assertEqual(outcomes, {True, False})
            self.assertEqual(widths, {4, 5})
        finally:
            random.setstate(state)

    def test_advanced_foundation_prompts_use_context_without_formula_scaffolding(self):
        state = random.getstate()
        try:
            random.seed(404)
            standard_table = generate_foundations_problem("prob_twoway")
            random.seed(404)
            advanced_table = generate_foundations_problem("prob_twoway", "advanced")
            self.assertIn("Let A be", standard_table["prompt"])
            self.assertNotIn("Let A be", advanced_table["prompt"])
            self.assertIn("Using appropriate probabilities from the table", advanced_table["prompt"])
            row_name = advanced_table["table_data"]["rows"][0][0]
            column_name = advanced_table["table_data"]["headers"][1]
            self.assertEqual(
                advanced_table["steps"][1]["inputs"][0]["label"],
                f"P({row_name} | {column_name})",
            )

            random.seed(405)
            standard_rv = generate_foundations_problem("rv_transform_combine")
            random.seed(405)
            advanced_rv = generate_foundations_problem("rv_transform_combine", "advanced")
            self.assertIn("W=", standard_rv["prompt"])
            self.assertNotIn("W=", advanced_rv["prompt"])
            self.assertIn("fixed handling fee", advanced_rv["prompt"])
            self.assertIn("shipment", advanced_rv["prompt"])
        finally:
            random.setstate(state)

    def test_unknown_topic_raises(self):
        with self.assertRaises(ValueError):
            generate_foundations_problem("unknown")


if __name__ == "__main__":
    unittest.main()
