from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from app.engine.normal_dist import generate_normal_problem, verify_normal_answer
from app.engine.confidence_intervals import generate_ci_problem

app = FastAPI(title="Komore Stats Engine")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

class AnswerSubmission(BaseModel):
    user_answer: float
    expected_answers: list[float]
    tolerance: float

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/problem/normal")
async def get_normal_problem(topic: str = Query("random")):
    return generate_normal_problem(topic=topic)

@app.get("/api/problem/ci")
async def get_ci_problem(topic: str = Query("random")):
    return generate_ci_problem(topic=topic)

@app.post("/api/verify")
async def check_answer(submission: AnswerSubmission):
    is_correct = verify_normal_answer(
        submission.user_answer,
        submission.expected_answers,
        submission.tolerance
    )
    return {"correct": is_correct}
