from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


class Query:
    def __init__(self, rows):
        self.rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args):
        return self

    def in_(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class Database:
    def __init__(self):
        self.assessment = {
            "id": "assessment", "class_id": "original", "title": "Original",
            "type": "assignment", "config": {}, "is_active": True,
            "parent_assessment_id": "parent",
        }
        self.rows = {
            "assessments": [self.assessment],
            "assessment_submissions": [{
                "id": "submission", "student_id": "student", "status": "submitted",
                "score": 75, "details": {"question_breakdown": [{"q_num": 1}]},
                "responses": [], "submitted_at": None,
            }],
            "profiles": [{"id": "student", "full_name": "Student"}],
            "enrollments": [{"class_id": "original"}],
        }
        self.auth = SimpleNamespace(get_user=lambda _token: SimpleNamespace(user=SimpleNamespace(id="student")))
        self.calls = []
        self.rpc_error = None

    def table(self, name):
        return Query(self.rows[name])

    def rpc(self, name, params):
        self.calls.append((name, params))
        if self.rpc_error:
            raise RuntimeError(self.rpc_error)
        return Query([self.assessment])


class AssessmentEditingTests(unittest.TestCase):
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

    def test_details_and_results_include_breakdown(self):
        details = self.client.get("/api/teacher/assessments/assessment/details").json()
        self.assertEqual(details["section_id"], "original")
        self.assertEqual(details["submission_count"], 1)
        result = self.client.get("/api/teacher/assessments/assessment/results").json()
        self.assertEqual(result[0]["details"]["question_breakdown"], [{"q_num": 1}])
        self.assertEqual(self.checked, ["original", "original"])

    def test_update_checks_both_classes_and_preserves_parent(self):
        response = self.client.put("/api/teacher/assessments/assessment", json={
            "title": "Edited", "type": "assignment", "section_id": "destination",
            "config": {"blocks": []}, "submission_action": "keep",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.checked, ["original", "destination"])
        name, params = self.db.calls[-1]
        self.assertEqual(name, "update_assessment_with_submission_action")
        self.assertEqual(params["p_action"], "keep")
        self.assertEqual(params["p_values"]["parent_assessment_id"], "parent")

    def test_update_requires_explicit_submission_choice(self):
        self.db.rpc_error = "SUBMISSION_CHOICE_REQUIRED"
        response = self.client.put("/api/teacher/assessments/assessment", json={
            "title": "Edited", "type": "assignment", "class_id": "original", "config": {},
        })
        self.assertEqual(response.status_code, 409)

    def test_reset_choice_and_database_race_are_forwarded(self):
        response = self.client.put("/api/teacher/assessments/assessment", json={
            "title": "Edited", "type": "assignment", "class_id": "original",
            "config": {}, "submission_action": "reset",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.calls[-1][1]["p_action"], "reset")
        self.db.rpc_error = "ASSESSMENT_RESET"
        response = self.client.post("/api/student/submissions", headers={"Authorization": "Bearer token"}, json={
            "assessment_id": "assessment", "score": 0, "responses": [],
            "details": {"question_breakdown": []},
        })
        self.assertEqual(response.status_code, 409)

    def test_student_submission_sends_details_and_rejects_stale_reset(self):
        payload = {
            "assessment_id": "assessment", "score": 75, "responses": [],
            "details": {"question_breakdown": [{"q_num": 1}]},
        }
        response = self.client.post("/api/student/submissions", headers={"Authorization": "Bearer token"}, json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.db.calls[-1][0], "submit_assessment_with_details")
        self.assertEqual(self.db.calls[-1][1]["p_details"], payload["details"])
        self.db.assessment["config"]["_submission_reset_version"] = "reset"
        response = self.client.post("/api/student/submissions", headers={"Authorization": "Bearer token"}, json=payload)
        self.assertEqual(response.status_code, 409)
