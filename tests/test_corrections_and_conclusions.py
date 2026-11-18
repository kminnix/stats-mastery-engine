from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from app.engine.inference_drills import generate_conclusion_drill


class Query:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.filters = []
        self.payload = None
        self.update_payload = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, key, value):
        self.filters.append(lambda row: row.get(key) == value)
        return self

    def in_(self, key, values):
        self.filters.append(lambda row: row.get(key) in values)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.payload = payload
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def execute(self):
        rows = self.database.rows[self.table_name]
        if self.payload is not None:
            row = {"id": "correction", "due_date": None, **self.payload}
            rows.append(row)
            return SimpleNamespace(data=[row])
        selected = [row for row in rows if all(check(row) for check in self.filters)]
        if self.update_payload is not None:
            for row in selected:
                row.update(self.update_payload)
        return SimpleNamespace(data=selected)


class Database:
    def __init__(self):
        self.rows = {
            "classes": [{"id": "class", "teacher_id": "teacher", "tool_policy": {}}],
            "enrollments": [{"student_id": "student", "class_id": "class", "classes": {"name": "Statistics"}}],
            "assessments": [{
                "id": "parent", "title": "Original", "class_id": "class",
                "type": "test", "is_active": False, "due_date": None,
                "config": {"blocks": [{"topic": "ht_prop_z", "count": 2}]},
            }],
            "assessment_submissions": [],
        }

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, params):
        if name != "auto_exempt_correction":
            raise AssertionError(name)
        database = self

        class Exemption:
            def execute(self):
                if not any(row["assessment_id"] == params["p_assessment_id"] and
                           row["student_id"] == params["p_student_id"]
                           for row in database.rows["assessment_submissions"]):
                    database.rows["assessment_submissions"].append({
                        "assessment_id": params["p_assessment_id"],
                        "student_id": params["p_student_id"], "status": "submitted", "score": 100,
                        "details": {"auto_exempt": True, "reason": "100% on parent exam"},
                    })
                return SimpleNamespace(data=True)
        return Exemption()


class CorrectionsTests(unittest.TestCase):
    def setUp(self):
        self.db = Database()
        self.checked = []
        patches = [
            patch.object(main, "get_scoped_supabase", lambda _authorization=None: self.db),
            patch.object(main, "verify_teacher_access", lambda _authorization=None: {"user": SimpleNamespace(id="teacher")}),
            patch.object(main, "verify_teacher_class_access", lambda _db, class_id, _teacher: self.checked.append(class_id)),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.client = TestClient(main.app)

    def create_correction(self):
        response = self.client.post("/api/teacher/assessments/parent/corrections")
        self.assertEqual(response.status_code, 200)
        return response.json()["correction_assessment"]

    def test_create_and_personalize_from_archived_parent(self):
        correction = self.create_correction()
        self.assertEqual(self.checked, ["class"])
        self.assertEqual(correction["title"], "Original — Test Corrections")
        self.assertEqual(correction["config"]["fallback_questions"], [
            {"topic": "ht_prop_z", "allow_hints": True},
            {"topic": "ht_prop_z", "allow_hints": True},
        ])
        self.assertEqual(correction["config"]["blocks"][0]["required_passes"], 2)
        self.assertEqual(correction["config"]["blocks"][0]["mode"], "mastery")
        self.db.rows["assessment_submissions"].append({
            "assessment_id": "parent", "student_id": "student", "status": "submitted",
            "details": {"question_breakdown": [
                {"topic": "ht_prop_z", "points_earned": 0.5, "max_points": 1},
                {"topic": "ht_mean_t", "points_earned": 1, "max_points": 1},
            ]},
        })
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertEqual(task["missed_questions"][0]["topic"], "ht_prop_z")
        self.assertTrue(task["missed_questions"][0]["fallback_guided"])
        self.assertFalse(task["perfect_on_parent"])

    def test_missing_perfect_and_legacy_submissions(self):
        self.create_correction()
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertTrue(task["parent_submission_missing"])
        self.db.rows["assessment_submissions"].append({
            "assessment_id": "parent", "student_id": "student",
            "status": "submitted",
            "responses": [{"correct": True, "breakdown": {"topic": "ht_mean_t", "points_earned": 1, "max_points": 1}}],
        })
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertTrue(task["perfect_on_parent"])
        self.db.rows["assessment_submissions"][0]["responses"][0]["correct"] = False
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertEqual(task["missed_questions"][0]["topic"], "ht_mean_t")
        self.db.rows["assessment_submissions"][0]["responses"] = [{"correct": False}]
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertIn("correction_error", task)
        self.assertFalse(task["perfect_on_parent"])

    def test_targeted_and_full_question_scopes(self):
        self.create_correction()
        self.db.rows["assessments"][-1]["config"]["blocks"][0]["allow_frq_conclusion"] = True
        self.db.rows["assessment_submissions"].append({
            "assessment_id": "parent", "student_id": "student", "status": "submitted",
            "details": {"question_breakdown": [{
                "q_num": 2, "topic": "ht_prop_z", "points_earned": 0.5, "max_points": 1,
                "missed_steps": [{"step_index": 6, "step_label": "P-Value & Interpretation:"},
                                 {"step_index": 7, "step_label": "Conclusion:"}],
            }]},
        })
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertEqual([item["topic"] for item in task["missed_questions"]],
                         ["step__ht_prop_z__6", "step__ht_prop_z__7"])
        self.assertEqual(task["missed_questions"][0]["source_q"], 2)
        self.assertTrue(all(item["required_passes"] == 2 for item in task["missed_questions"]))
        self.assertTrue(task["missed_questions"][1]["allow_frq_conclusion"])
        self.db.rows["assessments"][-1]["config"]["corrections_scope"] = "full_questions"
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertEqual([item["topic"] for item in task["missed_questions"]], ["ht_prop_z"])

    def test_correction_inherits_difficulty_from_the_matching_source_block(self):
        self.db.rows["assessments"][0]["config"]["blocks"] = [
            {"id": "first", "topic": "ht_prop_z", "count": 1, "reading_difficulty": "standard"},
            {"id": "second", "topic": "ht_prop_z", "count": 1, "reading_difficulty": "advanced"},
        ]
        self.create_correction()
        self.db.rows["assessment_submissions"].append({
            "assessment_id": "parent", "student_id": "student", "status": "submitted",
            "details": {"question_breakdown": [{
                "q_num": 2, "topic": "ht_prop_z", "block_id": "second",
                "points_earned": 0, "max_points": 1,
            }]},
        })
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertEqual(task["missed_questions"][0]["reading_difficulty"], "advanced")

    def test_canonical_step_ids_stay_with_their_parent(self):
        self.assertEqual(main.correction_step_topic("ht_prop_z", "step__ht_prop_z__6"), "step__ht_prop_z__6")
        self.assertEqual(main.correction_step_topic("ht_prop_z", {"step_topic": "step__ht_prop_z__7"}), "step__ht_prop_z__7")
        self.assertIsNone(main.correction_step_topic("ht_prop_z", "step__ht_mean_t__6"))
        self.assertIsNone(main.correction_step_topic("ht_prop_z", "step__ht_prop_z__999"))

    def test_perfect_exemption_is_idempotent_and_preserves_existing_submission(self):
        self.create_correction()
        self.db.rows["assessment_submissions"].append({
            "assessment_id": "parent", "student_id": "student", "status": "submitted",
            "score": 100, "details": {"question_breakdown": [
                {"topic": "ht_prop_z", "points_earned": 1, "max_points": 1, "missed_steps": []},
            ]},
        })
        for _ in range(2):
            task = self.client.get("/api/student/tasks/student").json()[0]
            self.assertTrue(task["perfect_on_parent"])
            self.assertEqual((task["status"], task["score"]), ("submitted", 100))
        submissions = [row for row in self.db.rows["assessment_submissions"] if row["assessment_id"] == "correction"]
        self.assertEqual(len(submissions), 1)
        self.assertTrue(submissions[0]["details"]["auto_exempt"])
        submissions[0]["score"] = 73
        self.assertEqual(self.client.get("/api/student/tasks/student").json()[0]["score"], 73)

    def test_score_100_with_missed_steps_is_not_exempt(self):
        self.create_correction()
        self.db.rows["assessment_submissions"].append({
            "assessment_id": "parent", "student_id": "student", "status": "submitted", "score": 100,
            "details": {"question_breakdown": [{
                "topic": "ht_prop_z", "points_earned": 1, "max_points": 1,
                "missed_steps": [{"step_index": 6, "step_label": "P-value"}],
            }]},
        })
        task = self.client.get("/api/student/tasks/student").json()[0]
        self.assertFalse(task["perfect_on_parent"])
        self.assertEqual(task["missed_questions"][0]["topic"], "step__ht_prop_z__6")
        self.assertEqual(len(self.db.rows["assessment_submissions"]), 1)

    def test_all_targeted_topics_generate_one_fresh_step(self):
        for topic, labels in main.TARGETED_STEP_LABELS.items():
            for index in range(1, len(labels) + 1):
                with self.subTest(topic=topic, index=index):
                    problem = main.generate_single_step(f"step__{topic}__{index}")
                    self.assertEqual(len(problem["steps"]), 1)

    def test_class_mastery_policy_round_trip_and_validation(self):
        response = self.client.patch("/api/teacher/classes/class/settings", json={
            "tool_policy": {"allow_calc": False, "mastery_required_passes": 4, "corrections_scope": "full_questions"}
        })
        self.assertEqual(response.status_code, 200)
        policy = response.json()["tool_policy"]
        self.assertFalse(policy["allow_calc"])
        self.assertEqual(policy["mastery_required_passes"], 4)
        self.assertEqual(policy["corrections_scope"], "full_questions")
        for policy in ({"mastery_required_passes": 5}, {"corrections_scope": "invalid"}):
            with self.subTest(policy=policy):
                self.assertEqual(self.client.patch("/api/teacher/classes/class/settings", json={
                    "tool_policy": policy
                }).status_code, 422)


class ConclusionTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.payload = {
            "p_val": 0.02, "alpha": 0.05, "decision": "reject H0",
            "direction": "greater", "context_keywords": ["voters"],
        }

    def evaluate(self, text, **changes):
        response = self.client.post("/api/evaluate/conclusion", json={**self.payload, **changes, "student_text": text})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_full_partial_and_incorrect(self):
        good = "The P-value 0.02 is less than alpha 0.05, so we reject H0. There is convincing evidence that the proportion of voters is greater than 0.5."
        self.assertEqual(self.evaluate(good)["score_code"], "E")
        self.assertEqual(self.evaluate(good.replace("voters", "people"))["score_code"], "P")
        self.assertEqual(self.evaluate("We accept H0.")["score_code"], "I")
        self.assertEqual(self.evaluate(good.replace("reject H0", "reject H0 and accept H0"))["score_code"], "P")
        self.assertEqual(self.evaluate(good.replace("greater than 0.5", "less than 0.5"))["score_code"], "P")

    def test_failure_to_reject_and_equal_boundary(self):
        text = "The P-value 0.2 is greater than alpha 0.05, so we fail to reject H0. There is insufficient evidence that voters differ from the null value."
        self.assertTrue(self.evaluate(text, p_val=0.2, decision="fail to reject H0", direction="different")["passed"])
        boundary = "The P-value 0.05 is equal to alpha 0.05, so we reject H0. There is convincing evidence that voters differ from the null value."
        self.assertTrue(self.evaluate(boundary, p_val=0.05, direction="different")["passed"])
        self.assertEqual(self.evaluate(boundary.replace("equal to", "less than"), p_val=0.05, direction="different")["score_code"], "P")

    def test_expanded_rejection_phrases(self):
        for comparison in ("less than", "smaller than", "lower than", "below", "<=", "<", "at most"):
            for evidence in ("convincing", "sufficient", "strong", "enough", "statistical"):
                with self.subTest(comparison=comparison, evidence=evidence):
                    text = f"The PVAL is {comparison} α, so reject null. There is {evidence} evidence that voters are greater than 0.5."
                    self.assertTrue(self.evaluate(text)["passed"])
        for comparison in ("0.02 < 0.05", "0.05 > 0.02", "p value 0.02 <= 0.05"):
            text = f"{comparison}, so reject the null hypothesis. There is enough evidence that voters are greater than 0.5."
            with self.subTest(comparison=comparison):
                self.assertTrue(self.evaluate(text)["passed"])

    def test_expanded_failure_to_reject_phrases(self):
        decisions = ("fail to reject", "fail reject", "failed to reject", "do not reject",
                     "don't reject", "cannot reject", "can't reject", "not reject")
        comparisons = ("greater than", "larger than", "bigger than", "higher than", "above", ">=", ">", "exceeds")
        evidence = ("do not have convincing evidence", "don't have convincing evidence", "no convincing evidence",
                    "not convincing evidence", "insufficient evidence", "not enough evidence",
                    "do not have enough evidence", "don't have enough evidence", "lack convincing evidence",
                    "lack sufficient evidence", "no sufficient evidence", "not sufficient evidence")
        changes = {"p_val": 0.2, "decision": "fail to reject H0"}
        for decision in decisions:
            with self.subTest(decision=decision):
                text = f"The p-value is bigger than alpha, so {decision} H₀. There is insufficient evidence that voters are greater than 0.5."
                self.assertTrue(self.evaluate(text, **changes)["passed"])
        for comparison in comparisons:
            with self.subTest(comparison=comparison):
                text = f"The p value is {comparison} alpha, so fail to reject the null. There is insufficient evidence that voters are greater than 0.5."
                self.assertTrue(self.evaluate(text, **changes)["passed"])
        for wording in evidence:
            with self.subTest(evidence=wording):
                text = f"Pval > alpha, so fail to reject H0. We {wording} that voters are greater than 0.5."
                self.assertTrue(self.evaluate(text, **changes)["passed"])
        for wording in ("is not convincing", "isn't convincing"):
            text = f"Pval > alpha, so fail to reject H0. The evidence {wording} that voters are greater than 0.5."
            with self.subTest(evidence=wording):
                self.assertTrue(self.evaluate(text, **changes)["passed"])

    def test_negations_misconceptions_and_numeric_comparisons(self):
        good = "Pval < alpha, so reject H0. There is strong evidence that voters are greater than 0.5."
        for negation in ("not", "no", "insufficient", "lack of", "don't have", "do not have"):
            with self.subTest(negation=negation):
                self.assertFalse(self.evaluate(good.replace("strong evidence", f"{negation} strong evidence"))["passed"])
        for decision in ("fail to reject", "fail reject", "don't reject", "cannot reject", "can't reject"):
            with self.subTest(decision=decision):
                self.assertFalse(self.evaluate(good.replace("reject H0", f"{decision} H0"))["passed"])
        for claim in ("accept null", "prove the null", "H0 is proven", "H0 is true"):
            with self.subTest(claim=claim):
                self.assertFalse(self.evaluate(good.replace("reject H0", f"reject H0 and {claim}"))["passed"])
        for comparison in ("0.02 > 0.05", "0.2 < 0.05", "pval is not less than alpha"):
            with self.subTest(comparison=comparison):
                self.assertFalse(self.evaluate(good.replace("Pval < alpha", comparison))["passed"])
        self.assertTrue(self.evaluate(
            "Pval < alpha, so reject H0. There is strong evidence that the proportion of voters 0.6 > 0.5."
        )["passed"])

    def test_carry_through_with_numeric_and_word_comparisons(self):
        changes = {"p_val": 0.2, "student_p_val": 0.001, "alpha": 0.1, "decision": "fail to reject H0"}
        for comparison in ("Since .001 < .1", "Since .1 > .001", "The p-value is less than alpha",
                           "The p-value .001 < alpha .1"):
            for null in ("ho", "h0", "h₀", "the h0"):
                with self.subTest(comparison=comparison, null=null):
                    result = self.evaluate(
                        f"{comparison}, we reject {null}. There is convincing evidence that voters are greater than 0.5.",
                        **changes,
                    )
                    self.assertTrue(result["passed"])
                    self.assertTrue(result["decision_ok"])
                    self.assertTrue(result["evidence_ok"])
                    self.assertTrue(result["context_ok"])
                    self.assertIn("0.001", result["model_conclusion"])

        result = self.evaluate(
            "Since .2 > .05, we fail to reject the h0. There is insufficient evidence that voters are greater than 0.5.",
            student_p_val=0.2,
        )
        self.assertTrue(result["passed"])
        self.assertTrue(self.evaluate(
            "Since .001 < .1, reject ho. There is convincing evidence that voters are greater than 0.5.",
            **{**changes, "decision": "reject H0"},
        )["passed"])

    def test_carry_through_numeric_matching_and_fallback(self):
        changes = {"p_val": 0.2, "student_p_val": 0.001, "alpha": 0.1, "decision": "fail to reject H0"}
        template = "{}; reject ho. There is convincing evidence that voters are greater than 0.5."
        for comparison in (".011 <= .105", ".101 >= .002"):
            with self.subTest(comparison=comparison):
                self.assertTrue(self.evaluate(template.format(comparison), **changes)["decision_ok"])
        for comparison in (".012 < .1", ".001 < .106", ".001 > .1", "pvalue .001 < .106 alpha",
                           "pvalue 0.2 is less than alpha 0.1"):
            with self.subTest(comparison=comparison):
                self.assertFalse(self.evaluate(template.format(comparison), **changes)["decision_ok"])
        text = "P-value < alpha, so reject h0. There is convincing evidence that voters are greater than 0.5."
        for student_value in (None, "invalid", [], {}):
            with self.subTest(student_value=student_value):
                self.assertTrue(self.evaluate(text, student_p_val=student_value)["passed"])

    def test_conclusion_drill_has_evaluable_context(self):
        problem = generate_conclusion_drill()
        metadata = problem["metadata"]
        response = self.client.post("/api/evaluate/conclusion", json={
            "student_text": "",
            "p_val": metadata["expected_pval"],
            "alpha": metadata["expected_alpha"],
            "decision": metadata["expected_decision"],
            "direction": metadata["alternative"],
            "context_keywords": [metadata["parameter_description"]],
            "alternative_statement": metadata["alternative_statement"],
        })
        self.assertEqual(response.status_code, 200)
        model = response.json()["model_conclusion"]
        payload = {
            "student_text": model, "p_val": metadata["expected_pval"],
            "alpha": metadata["expected_alpha"], "decision": metadata["expected_decision"],
            "direction": metadata["alternative"], "context_keywords": [metadata["parameter_description"]],
            "alternative_statement": metadata["alternative_statement"],
        }
        self.assertTrue(self.client.post("/api/evaluate/conclusion", json=payload).json()["passed"])


if __name__ == "__main__":
    unittest.main()
