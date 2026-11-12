import os
import random
import string
import traceback
import csv
import io
from typing import List, Optional, Dict, Any, Literal
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

from app.engine.normal_dist import generate_normal_problem, verify_normal_answer
from app.engine.confidence_intervals import generate_ci_problem
from app.engine.hypothesis_testing import generate_ht_problem
from app.engine.chi_square import generate_chi_problem
from app.engine.linear_regression import generate_regression_problem
from app.engine.probability_sampling import generate_prob_sampling_problem
from app.engine.input_types import tag_problem_input_types
from app.engine.inference_drills import (
    generate_condition_check_mean,
    generate_condition_check_proportion,
    generate_conclusion_drill_mean,
    generate_conclusion_drill_proportion,
    generate_hypothesis_drill_mean,
    generate_hypothesis_drill_proportion,
    generate_standard_error_drill_mean,
    generate_standard_error_drill_proportion,
    generate_test_stat_drill_mean,
    generate_test_stat_drill_proportion,
)

load_dotenv()

app = FastAPI(title="Qederam Engine")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

STATIC_VERSION = "141"
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_PUBLISHABLE_KEY", ""))
SUPABASE_ANON_KEY = SUPABASE_KEY

# Base unauthenticated client
supabase_client: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Supabase init error: {e}")

def get_scoped_supabase(auth_header: Optional[str] = None) -> Client:
    """Returns a client scoped with the user's JWT if present to satisfy RLS."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):].strip()
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")
        scoped = create_client(SUPABASE_URL, SUPABASE_KEY)
        scoped.postgrest.auth(token)
        return scoped
    return supabase_client

def verify_teacher_access(authorization: Optional[str] = None) -> Dict[str, Any]:
    """Require a valid Supabase user session with an approved teacher profile."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")

    token = authorization[len("Bearer "):].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    db = get_scoped_supabase(authorization)
    try:
        user_res = db.auth.get_user(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid user session") from exc

    user = user_res.user
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user session")

    try:
        profile_res = (
            db.table("profiles")
            .select("role")
            .eq("id", user.id)
            .single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Forbidden: Teacher approval required") from exc

    profile = profile_res.data
    if not profile or profile.get("role") != "teacher":
        raise HTTPException(status_code=403, detail="Forbidden: Teacher approval required")

    return {"user": user, "profile": profile}

def verify_teacher_class_access(db: Client, class_id: str, teacher_id: str) -> None:
    """Ensure a class belongs to the authenticated teacher."""
    result = (
        db.table("classes")
        .select("id")
        .eq("id", class_id)
        .eq("teacher_id", teacher_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Forbidden: Class access denied")

class VerifyPayload(BaseModel):
    user_answer: float
    expected_answers: List[float]
    tolerance: float = 0.005

class CreateClassPayload(BaseModel):
    teacher_id: str
    name: str

class RenameClassPayload(BaseModel):
    name: str

class ToolPolicy(BaseModel):
    allow_calc: bool = True
    allow_stats_tool: bool = True
    allow_tables: bool = True
    allow_popouts: bool = True

class ClassSettingsPayload(BaseModel):
    default_notation: Optional[Literal["ab", "b0b1"]] = None
    tool_policy: Optional[ToolPolicy] = None

class JoinClassPayload(BaseModel):
    student_id: str
    join_code: str

class AssessmentCreateRequest(BaseModel):
    class_id: str
    title: str
    type: str  # 'assignment', 'test', or 'test_correction'
    parent_assessment_id: Optional[str] = None
    config: Dict[str, Any]
    allow_hints: bool = True
    due_date: Optional[str] = None

def generate_join_code(length=6) -> str:
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '')
    return ''.join(random.choices(chars, k=length))

# --- PAGE ROUTING ---

@app.get("/", response_class=HTMLResponse)
@app.get("/", response_class=HTMLResponse)
async def serve_landing(request: Request):
    """Initial landing gateway: logs in and branches to student or teacher."""
    return templates.TemplateResponse(
        request=request,
        name="landing.html",
        context={
            "supabase_url": SUPABASE_URL, 
            "supabase_key": SUPABASE_KEY,
            "v": STATIC_VERSION,
            "static_version": STATIC_VERSION
        }
    )

@app.get("/practice", response_class=HTMLResponse)
async def serve_student_practice(request: Request):
    """Student problem generator and procedural practice arena."""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "supabase_url": SUPABASE_URL, 
            "supabase_key": SUPABASE_KEY,
            "v": STATIC_VERSION,
            "static_version": STATIC_VERSION
        }
    )

@app.get("/stats-tool", response_class=HTMLResponse)
async def serve_stats_tool(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="stats_tool.html",
        context={"v": STATIC_VERSION}
    )

@app.get("/tables-tool", response_class=HTMLResponse)
async def serve_tables_tool(request: Request):
    return templates.TemplateResponse(request=request, name="tables_tool.html", context={"v": STATIC_VERSION})

@app.get("/calculator-tool", response_class=HTMLResponse)
async def serve_calculator_tool(request: Request):
    return templates.TemplateResponse(request=request, name="calculator_tool.html", context={"v": STATIC_VERSION})

@app.get("/teacher", response_class=HTMLResponse)
async def serve_teacher_dashboard(request: Request):
    """Teacher dashboard for roster and section management."""
    return templates.TemplateResponse(
        request=request,
        name="teacher.html",
        context={
            "supabase_url": SUPABASE_URL, 
            "supabase_key": SUPABASE_KEY,
            "v": STATIC_VERSION,
            "static_version": STATIC_VERSION
        }
    )

@app.get("/teacher/assignments/new", response_class=HTMLResponse)
async def get_teacher_assessment_builder(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="create_assessment.html",
        context={
            "supabase_url": SUPABASE_URL,
            "supabase_key": SUPABASE_ANON_KEY,
            "static_version": STATIC_VERSION
        }
    )

# --- PROBLEM & VERIFICATION APIS ---

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "supabase_connected": supabase_client is not None,
        "has_url": bool(SUPABASE_URL),
        "has_key": bool(SUPABASE_KEY)
    }

@app.get("/api/problem/normal")
async def get_normal_problem(topic: str = "random", problem_type: str = "random"):
    selected = topic if topic != "random" else problem_type
    try:
        return generate_normal_problem(selected)
    except TypeError:
        return generate_normal_problem()

@app.get("/api/problem/ci")
async def get_ci_problem(topic: str = "mean_t", problem_type: str = "mean_t"):
    selected = topic if topic != "mean_t" else problem_type
    try:
        return tag_problem_input_types(generate_ci_problem(selected))
    except TypeError:
        return tag_problem_input_types(generate_ci_problem())

@app.get("/api/problem/ht")
async def get_ht_problem(topic: str = "ht_prop_z"):
    try:
        return tag_problem_input_types(generate_ht_problem(topic or "ht_prop_z"))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Unable to generate hypothesis-testing problem: {e}",
        ) from e

@app.get("/api/problem/chi")
async def get_chi_problem(topic: str = "random"):
    return tag_problem_input_types(generate_chi_problem(topic or "random"))

@app.get("/api/problem/regression")
async def get_regression_problem(topic: str = "reg_lsrl", notation: str = "ab"):
    return tag_problem_input_types(generate_regression_problem(topic or "reg_lsrl", notation))

@app.get("/api/problem/prob_sampling")
async def get_prob_sampling_problem(topic: str):
    return tag_problem_input_types(generate_prob_sampling_problem(topic))

@app.get("/api/problem/drill")
async def get_inference_drill(topic: str):
    generators = {
        "cond_check_prop": generate_condition_check_proportion,
        "drill_se_prop": generate_standard_error_drill_proportion,
        "drill_hypo_prop": generate_hypothesis_drill_proportion,
        "drill_stat_prop": generate_test_stat_drill_proportion,
        "drill_conclusion_prop": generate_conclusion_drill_proportion,
        "cond_check_mean": generate_condition_check_mean,
        "drill_se_mean": generate_standard_error_drill_mean,
        "drill_hypo_mean": generate_hypothesis_drill_mean,
        "drill_stat_mean": generate_test_stat_drill_mean,
        "drill_conclusion_mean": generate_conclusion_drill_mean,
    }
    generator = generators.get(topic)
    if generator is None:
        raise HTTPException(status_code=404, detail=f"Unknown inference drill topic: {topic}")
    return tag_problem_input_types(generator())

@app.post("/api/verify")
async def check_answer(payload: VerifyPayload):
    is_correct = verify_normal_answer(
        payload.user_answer,
        payload.expected_answers,
        payload.tolerance
    )
    return {"correct": is_correct}

# --- ROSTER & CLASSROOM ENDPOINTS ---

@app.post("/api/classes/create")
async def create_class(payload: CreateClassPayload, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    if payload.teacher_id != access["user"].id:
        raise HTTPException(status_code=403, detail="Forbidden: Teacher ID mismatch")
    db = get_scoped_supabase(authorization)
    code = generate_join_code()

    res = db.table("classes").insert({
        "teacher_id": payload.teacher_id,
        "name": payload.name,
        "join_code": code
    }).execute()

    if not res.data:
        raise HTTPException(status_code=400, detail="Could not create class")
    return res.data[0]

@app.post("/api/classes/join")
async def join_class(payload: JoinClassPayload, authorization: Optional[str] = Header(None)):
    db = get_scoped_supabase(authorization)
    clean_code = payload.join_code.strip().upper()

    cls_query = db.table("classes").select("id, name").eq("join_code", clean_code).execute()
    if not cls_query.data:
        raise HTTPException(status_code=404, detail="Class code not found. Check code and retry.")

    class_data = cls_query.data[0]
    class_id = class_data["id"]

    db.table("enrollments").upsert({
        "class_id": class_id,
        "student_id": payload.student_id
    }, on_conflict="class_id,student_id").execute()

    return {"message": f"Successfully enrolled in {class_data['name']}", "class_name": class_data["name"]}

@app.get("/api/teacher/classes/{teacher_id}")
async def list_teacher_classes(teacher_id: str, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    if teacher_id != access["user"].id:
        raise HTTPException(status_code=403, detail="Forbidden: Teacher ID mismatch")
    db = get_scoped_supabase(authorization)
    classes_res = db.table("classes").select("*").eq("teacher_id", teacher_id).order("created_at").execute()
    return classes_res.data or []

@app.patch("/api/teacher/classes/{class_id}")
async def rename_teacher_class(
    class_id: str,
    payload: RenameClassPayload,
    authorization: Optional[str] = Header(None)
):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Section name cannot be empty")

    result = (
        db.table("classes")
        .update({"name": name})
        .eq("id", class_id)
        .eq("teacher_id", access["user"].id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Could not update section name")
    return result.data[0]

@app.patch("/api/teacher/classes/{class_id}/settings")
async def update_teacher_class_settings(
    class_id: str,
    payload: ClassSettingsPayload,
    authorization: Optional[str] = Header(None)
):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)
    updates = {}
    if payload.default_notation is not None:
        updates["default_notation"] = payload.default_notation
    if payload.tool_policy is not None:
        updates["tool_policy"] = payload.tool_policy.model_dump()
    if not updates:
        raise HTTPException(status_code=400, detail="No class settings provided")
    result = (
        db.table("classes")
        .update(updates)
        .eq("id", class_id)
        .eq("teacher_id", access["user"].id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Could not update class settings")
    return result.data[0]

@app.post("/api/teacher/classes/{class_id}/join-code")
async def regenerate_teacher_class_join_code(
    class_id: str,
    authorization: Optional[str] = Header(None)
):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)
    join_code = generate_join_code()
    result = (
        db.table("classes")
        .update({"join_code": join_code})
        .eq("id", class_id)
        .eq("teacher_id", access["user"].id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=400, detail="Could not regenerate student join code")
    return {"join_code": result.data[0]["join_code"]}

@app.delete("/api/teacher/classes/{class_id}")
async def delete_teacher_class(
    class_id: str,
    authorization: Optional[str] = Header(None)
):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)
    db.table("classes").delete().eq("id", class_id).eq("teacher_id", access["user"].id).execute()
    return {"status": "deleted"}

@app.get("/api/teacher/classes/{teacher_id}/tasks")
async def get_teacher_class_tasks(
    teacher_id: str,
    class_id: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """Fetches active assessments for one or all classes owned by a teacher."""
    access = verify_teacher_access(authorization)
    if teacher_id != access["user"].id:
        raise HTTPException(status_code=403, detail="Forbidden: Teacher ID mismatch")
    db = get_scoped_supabase(authorization)
    classes_res = (
        db.table("classes")
        .select("id, name, default_notation, tool_policy")
        .eq("teacher_id", teacher_id)
        .execute()
    )
    teacher_classes = classes_res.data or []
    class_ids = [item["id"] for item in teacher_classes]
    if class_id and class_id not in class_ids:
        raise HTTPException(status_code=403, detail="Forbidden: Class access denied")
    if not teacher_classes:
        return {"classes": [], "tasks": []}

    class_map = {item["id"]: item for item in teacher_classes}
    target_ids = [class_id] if class_id else class_ids
    assessments_res = (
        db.table("assessments")
        .select("*")
        .in_("class_id", target_ids)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .execute()
    )

    tasks = [
        {
            "assessment_id": assessment["id"],
            "title": assessment["title"],
            "type": assessment["type"],
            "class_id": assessment["class_id"],
            "class_name": class_map[assessment["class_id"]]["name"],
            "default_notation": class_map[assessment["class_id"]].get("default_notation"),
            "tool_policy": class_map[assessment["class_id"]].get("tool_policy"),
            "due_date": assessment["due_date"],
            "config": assessment["config"],
            "parent_assessment_id": assessment.get("parent_assessment_id"),
            "status": "preview",
            "score": None
        }
        for assessment in (assessments_res.data or [])
    ]
    return {"classes": teacher_classes, "tasks": tasks}

@app.get("/api/teacher/roster/{class_id}")
async def get_class_roster(class_id: str, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)

    res = (
        db.table("enrollments")
        .select("student_id, profiles(id, full_name, email)")
        .eq("class_id", class_id)
        .execute()
    )
    roster = []
    for row in (res.data or []):
        prof = row.get("profiles") or {}
        roster.append({
            "id": row.get("student_id"),
            "name": prof.get("full_name") or "Unknown Student",
            "email": prof.get("email") or "",
            "joined_at": "Enrolled"
        })
    return roster

@app.delete("/api/teacher/classes/{class_id}/students/{student_id}")
async def remove_student_from_class(
    class_id: str,
    student_id: str,
    authorization: Optional[str] = Header(None)
):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)
    db.table("enrollments").delete().eq("class_id", class_id).eq("student_id", student_id).execute()
    return {"status": "removed"}

# --- ASSIGNMENT & ASSESSMENT ENDPOINTS ---

@app.post("/api/teacher/assessments/create")
async def create_assessment(req: AssessmentCreateRequest, authorization: Optional[str] = Header(None)):
    """Creates a new assignment, test, or correction block for a section."""
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, req.class_id, access["user"].id)
    assessment_config = {**req.config, "allow_hints": req.allow_hints}
    
    payload = {
        "class_id": req.class_id,
        "title": req.title,
        "type": req.type,
        "parent_assessment_id": req.parent_assessment_id,
        "config": assessment_config,
        "due_date": req.due_date,
        "is_active": True
    }
    
    try:
        res = db.table("assessments").insert(payload).execute()
        if res.data:
            return {"status": "success", "assessment": res.data[0]}
    except Exception as e:
        print(f"Error creating assessment: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    raise HTTPException(status_code=400, detail="Could not create assessment")

@app.get("/api/teacher/assessments/{class_id}")
async def get_class_assessments(
    class_id: str,
    include_archived: bool = False,
    authorization: Optional[str] = Header(None)
):
    """Retrieves all assessments and student submission counts for a section."""
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)
    
    try:
        query = db.table("assessments").select("*").eq("class_id", class_id)
        if not include_archived:
            query = query.eq("is_active", True)
        res = query.order("created_at", desc=True).execute()
        assessments = res.data or []
        assessment_ids = [assessment["id"] for assessment in assessments]
        if assessment_ids:
            sub_res = (
                db.table("assessment_submissions")
                .select("id, assessment_id, status")
                .in_("assessment_id", assessment_ids)
                .execute()
            )
            completed_counts: Dict[str, int] = {}
            for submission in sub_res.data or []:
                if submission.get("status") in ("completed", "submitted"):
                    assessment_id = submission["assessment_id"]
                    completed_counts[assessment_id] = completed_counts.get(assessment_id, 0) + 1
            for assessment in assessments:
                assessment["assessment_submissions"] = [{
                    "count": completed_counts.get(assessment["id"], 0)
                }]
        else:
            assessments = []
        return assessments
    except Exception as e:
        print(f"Error fetching class assessments: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/teacher/assessments/{assessment_id}/details")
async def get_assessment_details(assessment_id: str, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    res = db.table("assessments").select("*").eq("id", assessment_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Assessment not found")
    verify_teacher_class_access(db, res.data[0]["class_id"], access["user"].id)
    return res.data[0]

@app.patch("/api/teacher/assessments/{assessment_id}/archive")
async def archive_assessment(assessment_id: str, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    assessment_res = (
        db.table("assessments")
        .select("id, class_id")
        .eq("id", assessment_id)
        .execute()
    )
    if not assessment_res.data:
        raise HTTPException(status_code=404, detail="Assessment not found")

    class_id = assessment_res.data[0]["class_id"]
    verify_teacher_class_access(db, class_id, access["user"].id)
    result = (
        db.table("assessments")
        .update({"is_active": False})
        .eq("id", assessment_id)
        .eq("class_id", class_id)
        .select("id")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Assessment could not be archived")
    return {"status": "archived"}

@app.patch("/api/teacher/assessments/{assessment_id}/restore")
async def restore_assessment(assessment_id: str, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    assessment_res = (
        db.table("assessments")
        .select("id, class_id")
        .eq("id", assessment_id)
        .execute()
    )
    if not assessment_res.data:
        raise HTTPException(status_code=404, detail="Assessment not found")

    class_id = assessment_res.data[0]["class_id"]
    verify_teacher_class_access(db, class_id, access["user"].id)
    result = (
        db.table("assessments")
        .update({"is_active": True})
        .eq("id", assessment_id)
        .eq("class_id", class_id)
        .select("id")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Assessment could not be restored")
    return {"status": "restored"}

@app.get("/api/teacher/assessment/{assessment_id}/submissions")
async def get_assessment_submissions(assessment_id: str, authorization: Optional[str] = Header(None)):
    """Fetches all student submissions, scores, and names for a specific assessment."""
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    assessment_res = (
        db.table("assessments")
        .select("class_id")
        .eq("id", assessment_id)
        .execute()
    )
    if not assessment_res.data:
        raise HTTPException(status_code=404, detail="Assessment not found")
    verify_teacher_class_access(db, assessment_res.data[0]["class_id"], access["user"].id)

    subs_res = (
        db.table("assessment_submissions")
        .select("id, student_id, status, score, responses, submitted_at")
        .eq("assessment_id", assessment_id)
        .order("submitted_at", desc=True)
        .execute()
    )
    submissions = subs_res.data or []
    if not submissions:
        return []

    student_ids = [submission["student_id"] for submission in submissions]
    prof_res = (
        db.table("profiles")
        .select("id, full_name, email")
        .in_("id", student_ids)
        .execute()
    )
    profile_names = {
        profile["id"]: profile.get("full_name") or profile.get("email") or "Student"
        for profile in (prof_res.data or [])
    }

    return [
        {
            "submission_id": submission["id"],
            "student_id": submission["student_id"],
            "student_name": profile_names.get(submission["student_id"], "Unknown Student"),
            "status": submission.get("status", "submitted"),
            "score": submission.get("score"),
            "submitted_at": submission.get("submitted_at")
        }
        for submission in submissions
    ]

@app.get("/api/teacher/gradebook/{class_id}")
async def get_class_gradebook(class_id: str, authorization: Optional[str] = Header(None)):
    """Fetches all enrolled students, section assessments, and student scores."""
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)

    enroll_res = db.table("enrollments").select("student_id").eq("class_id", class_id).execute()
    student_ids = [enrollment["student_id"] for enrollment in (enroll_res.data or [])]
    assess_res = (
        db.table("assessments")
        .select("id, title, type, created_at")
        .eq("class_id", class_id)
        .eq("is_active", True)
        .order("created_at")
        .execute()
    )
    assessments = assess_res.data or []
    if not student_ids:
        return {"students": [], "assessments": assessments, "grades": {}}

    prof_res = (
        db.table("profiles")
        .select("id, full_name, email")
        .in_("id", student_ids)
        .execute()
    )
    students = [
        {
            "id": profile["id"],
            "name": profile.get("full_name") or profile.get("email") or "Student"
        }
        for profile in (prof_res.data or [])
    ]
    students.sort(key=lambda student: student["name"].lower())

    if not assessments:
        return {"students": students, "assessments": [], "grades": {}}

    assessment_ids = [assessment["id"] for assessment in assessments]
    sub_res = (
        db.table("assessment_submissions")
        .select("assessment_id, student_id, score, status")
        .in_("assessment_id", assessment_ids)
        .in_("student_id", student_ids)
        .execute()
    )

    grades: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for submission in (sub_res.data or []):
        student_id = submission["student_id"]
        assessment_id = submission["assessment_id"]
        grades.setdefault(student_id, {})[assessment_id] = {
            "score": submission.get("score"),
            "status": submission.get("status", "submitted")
        }

    return {
        "students": students,
        "assessments": assessments,
        "grades": grades
    }

@app.get("/api/teacher/gradebook/{class_id}/export-csv")
async def export_gradebook_csv(class_id: str, authorization: Optional[str] = Header(None)):
    """Exports enrolled students' active assessment scores as a CSV gradebook."""
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    verify_teacher_class_access(db, class_id, access["user"].id)

    enroll_res = (
        db.table("enrollments")
        .select("student_id, profiles(id, full_name, email)")
        .eq("class_id", class_id)
        .execute()
    )
    roster = enroll_res.data or []
    student_ids = [enrollment["student_id"] for enrollment in roster]
    assessments_res = (
        db.table("assessments")
        .select("id, title")
        .eq("class_id", class_id)
        .eq("is_active", True)
        .order("created_at")
        .execute()
    )
    assessments = assessments_res.data or []

    grades: Dict[str, Dict[str, Any]] = {}
    assessment_ids = [assessment["id"] for assessment in assessments]
    if student_ids and assessment_ids:
        submissions_res = (
            db.table("assessment_submissions")
            .select("assessment_id, student_id, status, score")
            .in_("assessment_id", assessment_ids)
            .in_("student_id", student_ids)
            .in_("status", ["completed", "submitted"])
            .execute()
        )
        for submission in submissions_res.data or []:
            grades.setdefault(submission["student_id"], {})[
                submission["assessment_id"]
            ] = submission.get("score")

    def generate_csv_rows():
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        writer.writerow(
            ["Student Name", "Email"]
            + [assessment.get("title") or "Untitled Assessment" for assessment in assessments]
            + ["Class Average"]
        )
        yield output.getvalue()

        for enrollment in roster:
            student_id = enrollment["student_id"]
            profile = enrollment.get("profiles") or {}
            scores = grades.get(student_id, {})
            valid_scores = []
            row_scores = []
            for assessment in assessments:
                score = scores.get(assessment["id"])
                if score is not None:
                    try:
                        numeric_score = float(score)
                    except (TypeError, ValueError):
                        numeric_score = None
                    if numeric_score is not None:
                        row_scores.append(numeric_score)
                        valid_scores.append(numeric_score)
                        continue
                row_scores.append(None)

            class_average = (
                sum(valid_scores) / len(valid_scores)
                if valid_scores
                else None
            )
            output.seek(0)
            output.truncate(0)
            writer.writerow(
                [
                    profile.get("full_name") or profile.get("email") or "Student",
                    profile.get("email") or "",
                    *[
                        f"{score:g}%" if score is not None else "--"
                        for score in row_scores
                    ],
                    f"{class_average:.2f}%" if class_average is not None else "--"
                ]
            )
            yield output.getvalue()

    return StreamingResponse(
        generate_csv_rows(),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                'attachment; filename="gradebook_'
                + "".join(character for character in class_id if character.isalnum() or character in "-_")
                + '.csv"'
            )
        }
    )

@app.get("/api/student/tasks/{student_id}")
async def get_student_tasks(student_id: str, authorization: Optional[str] = Header(None)):
    """Fetches all active assignments, tests, and corrections for classes the student is enrolled in."""
    db = get_scoped_supabase(authorization)

    # 1. Get the class IDs this student is enrolled in
    enroll_res = db.table("enrollments").select("class_id, classes(name, default_notation, tool_policy)").eq("student_id", student_id).execute()
    enrolled_classes = enroll_res.data or []
    if not enrolled_classes:
        return []

    class_ids = [item["class_id"] for item in enrolled_classes]
    class_map = {item["class_id"]: item.get("classes") or {} for item in enrolled_classes}

    # 2. Get active assessments for these classes
    assess_res = db.table("assessments").select("*").in_("class_id", class_ids).eq("is_active", True).order("created_at", desc=True).execute()
    assessments = assess_res.data or []
    if not assessments:
        return []

    assessment_ids = [a["id"] for a in assessments]

    # 3. Get existing student submission statuses
    sub_res = db.table("assessment_submissions").select("*").eq("student_id", student_id).in_("assessment_id", assessment_ids).execute()
    submission_map = {s["assessment_id"]: s for s in (sub_res.data or [])}

    # 4. Assemble student task view
    task_list = []
    for a in assessments:
        sub = submission_map.get(a["id"])
        task_list.append({
            "assessment_id": a["id"],
            "title": a["title"],
            "type": a["type"],
            "class_id": a["class_id"],
            "class_name": class_map.get(a["class_id"], {}).get("name", "Class"),
            "default_notation": class_map.get(a["class_id"], {}).get("default_notation"),
            "tool_policy": class_map.get(a["class_id"], {}).get("tool_policy"),
            "due_date": a["due_date"],
            "config": a["config"],
            "parent_assessment_id": a.get("parent_assessment_id"),
            "status": sub["status"] if sub else "not_started",
            "score": sub.get("score") if sub else None
        })

    return task_list