import os
import random
import string
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

from app.engine.normal_dist import generate_normal_problem, verify_normal_answer
from app.engine.confidence_intervals import generate_ci_problem

load_dotenv()

app = FastAPI(title="Qederam Engine")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_PUBLISHABLE_KEY", ""))

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
        token = auth_header.split(" ")[1]
        scoped = create_client(SUPABASE_URL, SUPABASE_KEY)
        scoped.postgrest.auth(token)
        return scoped
    return supabase_client

class VerifyPayload(BaseModel):
    user_answer: float
    expected_answers: List[float]
    tolerance: float = 0.005

class CreateClassPayload(BaseModel):
    teacher_id: str
    name: str

class JoinClassPayload(BaseModel):
    student_id: str
    join_code: str

def generate_join_code(length=6) -> str:
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace('O', '').replace('0', '').replace('I', '').replace('1', '')
    return ''.join(random.choices(chars, k=length))

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"supabase_url": SUPABASE_URL, "supabase_key": SUPABASE_KEY}
    )

@app.get("/teacher", response_class=HTMLResponse)
async def serve_teacher_dashboard(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="teacher.html",
        context={"supabase_url": SUPABASE_URL, "supabase_key": SUPABASE_KEY}
    )

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
        return generate_ci_problem(selected)
    except TypeError:
        return generate_ci_problem()

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
    db = get_scoped_supabase(authorization)
    classes_res = db.table("classes").select("*").eq("teacher_id", teacher_id).order("created_at").execute()
    return classes_res.data or []

@app.get("/api/teacher/roster/{class_id}")
async def get_class_roster(class_id: str, authorization: Optional[str] = Header(None)):
    db = get_scoped_supabase(authorization)

    enrollments_res = db.table("enrollments").select("student_id").eq("class_id", class_id).execute()
    student_ids = [e["student_id"] for e in (enrollments_res.data or [])]

    if not student_ids:
        return []

    profiles_res = db.table("profiles").select("id, email, full_name").in_("id", student_ids).execute()
    profiles_map = {p["id"]: p for p in (profiles_res.data or [])}

    progress_res = db.table("skill_progress").select("*").in_("student_id", student_ids).execute()

    student_records = {}
    for sid in student_ids:
        p = profiles_map.get(sid, {"email": "Unknown", "full_name": "Student"})
        student_records[sid] = {
            "student_id": sid,
            "name": p.get("full_name") or p.get("email"),
            "email": p.get("email"),
            "skills": {}
        }

    for row in (progress_res.data or []):
        sid = row["student_id"]
        if sid in student_records:
            student_records[sid]["skills"][row["skill_id"]] = {
                "streak": row.get("consecutive_streak", 0),
                "mastered": row.get("is_mastered", False),
                "attempted": row.get("total_attempted", 0),
                "correct": row.get("total_correct", 0)
            }

    return list(student_records.values())
