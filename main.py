import os
import random
import string
import traceback
import csv
import io
import re
from copy import deepcopy
from typing import List, Optional, Dict, Any, Literal, Union
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
from app.engine.foundations import generate_foundations_problem
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

STATIC_VERSION = "153"
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

class AssessmentUpdateRequest(BaseModel):
    class_id: Optional[str] = None
    section_id: Optional[str] = None
    title: str
    type: str
    parent_assessment_id: Optional[str] = None
    config: Dict[str, Any]
    due_date: Optional[str] = None
    submission_action: Optional[Literal["keep", "reset"]] = None

class StudentSubmissionRequest(BaseModel):
    assessment_id: str
    score: float
    responses: List[Dict[str, Any]]
    details: Dict[str, Any]
    reset_version: Optional[str] = None

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

SINGLE_STEP_TOPICS = {
    "eda_five_num": ("foundations", "eda_summary", "five_num"),
    "eda_iqr_fences": ("foundations", "eda_summary", "iqr"),
    "eda_mean_sd": ("foundations", "eda_summary", "mean_sd"),
    "rv_transform": ("foundations", "rv_transform_combine", "transform"),
    "rv_combine": ("foundations", "rv_transform_combine", "combine"),
    "prob_marginal_joint": ("foundations", "prob_twoway", "marginal"),
    "prob_conditional": ("foundations", "prob_twoway", "cond_prob"),
    "ci_prop_cond": ("ci", "prop_z", "cond"),
    "ci_prop_crit_se": ("ci", "prop_z", "crit_se"),
    "ci_prop_bounds": ("ci", "prop_z", "bounds"),
    "ci_prop_interp": ("ci", "prop_z", "interp"),
    "ci_mean_cond": ("ci", "mean_t", "cond"),
    "ci_mean_crit_se": ("ci", "mean_t", "crit_se"),
    "ci_mean_bounds": ("ci", "mean_t", "bounds"),
    "ci_mean_interp": ("ci", "mean_t", "interp"),
    "ht_prop_hypo": ("ht", "ht_prop_z", "hypo"),
    "ht_prop_cond": ("ht", "ht_prop_z", "cond"),
    "ht_prop_stat": ("ht", "ht_prop_z", "se_stat"),
    "ht_prop_pval": ("ht", "ht_prop_z", "pval"),
    "ht_prop_conc": ("ht", "ht_prop_z", "conc"),
    "ht_mean_hypo": ("ht", "ht_mean_t", "hypo"),
    "ht_mean_cond": ("ht", "ht_mean_t", "cond"),
    "ht_mean_stat": ("ht", "ht_mean_t", "se_stat"),
    "ht_mean_pval": ("ht", "ht_mean_t", "pval"),
    "ht_mean_conc": ("ht", "ht_mean_t", "conc"),
    "chi_step_hypo": ("chi", "chi_gof", "hypo"),
    "chi_step_cond": ("chi", "chi_gof", "cond"),
    "chi_step_df": ("chi", "chi_gof", "df"),
    "chi_step_stat_pval": ("chi", "chi_gof", "stat_pval"),
    "chi_step_conc": ("chi", "chi_gof", "conc"),
    "reg_step_slope_int": ("regression", "reg_lsrl", "slope_int"),
    "reg_step_equation": ("regression", "reg_lsrl", "equation"),
    "reg_step_pred_res": ("regression", "reg_pred_res", "pred_res"),
    "reg_step_slope_stat": ("regression", "reg_slope_test", "slope_stat"),
    "reg_step_slope_conc": ("regression", "reg_slope_test", "conc"),
}


def _combine_drill_steps(steps: List[Dict[str, Any]], label: str) -> Dict[str, Any]:
    fields = []
    for index, step in enumerate(steps):
        source = step.get("inputs") or step.get("components")
        standalone = source is None
        if source is None:
            source = [step]
        for field in source:
            item = deepcopy(field)
            item["id"] = f"drill-{index}-{item.get('id', 'value')}"
            labels = {
                "sample-statistic-symbol": "Sample statistic symbol",
                "sample-statistic-value": "Sample statistic value",
                "standard-error": "Standard error",
            }
            item["label"] = (step["label"] if standalone else
                             item.get("label") or labels.get(field.get("id")) or
                             item.get("placeholder") or field.get("id", "Value").replace("-", " "))
            item.setdefault("type", "select" if item.get("input_type") == "select" else "number")
            fields.append(item)
    return {
        "step_num": 1, "label": label, "input_type": "compound", "inputs": fields,
        "hint": " ".join(step.get("hint", "") for step in steps),
    }


def _before(text: str, marker: str) -> str:
    if marker not in text:
        raise ValueError(f"Expected prompt marker not found: {marker}")
    return text.split(marker, 1)[0].strip()


def _standalone_prompt(problem: Dict[str, Any], selector: str, context: List[str]) -> str:
    kind, prompt = problem["type"], problem["prompt"]
    metadata = problem.get("metadata") or {}
    steps = problem["steps"]
    question = ""
    base = ""
    if kind == "eda_summary":
        base = _before(prompt, ". Use the median-of-halves") + "."
        questions = {
            "five_num": "Find the five-number summary (Min, Q1, Median, Q3, Max).",
            "iqr": "Calculate the interquartile range (IQR) and the lower and upper outlier fences.",
            "mean_sd": "Calculate the sample mean (x̄) and sample standard deviation (s_x).",
        }
        if selector == "five_num":
            base += " Use the median-of-halves method, excluding the overall median when n is odd."
        question = questions[selector]
    elif kind == "rv_transform_combine":
        description, remainder = prompt.split(". They are independent, with ", 1)
        parameters, definitions = remainder.split(". Define the transformed quantity ", 1)
        transform, combination = definitions.split(" and ", 1)
        combination = _before(combination, ". Find their means")
        if selector == "transform":
            x_parameters = _before(parameters, r", \(\mu_Y")
            base = description.replace("Let X and Y represent ", "Let X represent one of the ") + "."
            base += f" Its parameters are {x_parameters}. Define {transform}."
            question = "Find the mean and standard deviation of W."
        else:
            base = f"{description}. They are independent, with {parameters}. Define {combination}."
            question = "Find the mean and standard deviation of the combined variable."
    elif kind == "prob_twoway":
        base = _before(prompt, " Find the requested probabilities")
        question = ("Find the requested marginal and joint probabilities." if selector == "marginal"
                    else "Find the conditional probability and determine whether the events are independent.")
    elif kind in {"prop_z", "prop_z_2samp", "mean_t", "mean_t_2samp", "matched_pairs_t"}:
        base = _before(prompt, " Construct a")
        if selector == "cond":
            base += " " + prompt.split("<p>", 1)[1].split("</p>", 1)[0].strip()
            question = "Verify whether the conditions for inference are met."
        elif selector == "crit_se":
            base += f" The confidence level is {metadata['confidence']}%."
            if kind == "mean_t_2samp":
                base += r" Use conservative degrees of freedom \(df=\min(n_1-1,n_2-1)\)."
            question = "Find the critical value and standard error."
        elif selector == "bounds":
            base += f" The confidence level is {metadata['confidence']}%."
            question = "Calculate the margin of error and confidence interval bounds."
        elif selector == "interp":
            targets = {
                "prop_z": "the true population proportion of individuals responding favorably",
                "prop_z_2samp": "the difference in population proportions for group 1 minus group 2",
                "mean_t": "the true population mean",
                "mean_t_2samp": "the difference in population means for group 1 minus group 2",
                "matched_pairs_t": "the population mean paired difference",
            }
            base += f" The parameter is {targets[kind]}."
            question = "Interpret the confidence interval in context."
        else:
            question = "Find the critical value."
    elif kind.startswith("ht_"):
        base = _before(prompt, "<p>").replace("Test whether ", "The research question is whether ")
        if base.startswith("Compare mean "):
            base = base.replace("Compare mean ", "The study compares mean ", 1)
        if base.startswith("Measure "):
            base = base.replace("Measure ", "The study measures ", 1)
        if selector == "cond":
            base += " " + prompt.split("<p>", 1)[1].split("</p>", 1)[0].strip()
            question = "Verify whether the conditions for inference are met."
        elif selector == "hypo":
            question = "State the null and alternative hypotheses."
        else:
            hypotheses = next(step for step in steps if step["input_type"] == "hypotheses")
            fields = {field["id"]: field["expected"][0] for field in hypotheses["components"]}
            direction = "≠" if fields["ha-direction"] == "!=" else fields["ha-direction"]
            base += f" Use H₀: {fields['h0-symbol']} = {fields['h0-value']:g}; Hₐ: {fields['ha-symbol']} {direction} {fields['ha-value']:g}."
            question = {
                "se_stat": "Calculate the standard error and test statistic.",
                "pval": "Find the P-value and interpret it in context.",
                "conc": "State your statistical decision and conclusion in context.",
            }[selector]
    elif kind.startswith("chi"):
        scenario, table = prompt.split("<br><br>", 1)
        scenario = scenario.replace(", test whether ", ", the research question is whether ")
        base = f"{scenario}<br><br>{table}"
        if selector == "conc":
            calc = next(step for step in steps if step["label"] == "Test Statistic & P-value:")
            statistic = next(field["expected"][0] for field in calc["inputs"] if field["id"] == "chi-statistic")
            context.insert(0, f"Use χ² = {statistic:.12g}.")
        question = {
            "hypo": "State the null and alternative hypotheses.",
            "cond": "Check the conditions and calculate the minimum expected count.",
            "df": "Calculate the chi-square degrees of freedom.",
            "stat_pval": "Calculate the chi-square test statistic and P-value.",
            "conc": "State your statistical decision and conclusion in context.",
        }[selector]
    elif kind == "reg_lsrl":
        base = _before(prompt, " Here, find")
        question = ("Calculate the slope and y-intercept." if selector == "slope_int"
                    else "Write the least-squares regression equation.")
    elif kind == "reg_pred_res":
        base = _before(prompt, ", calculate the predicted response")
        base += "."
        question = {
            "pred_res": "Calculate the predicted value and residual.",
            "pred": "Calculate the predicted value.",
            "res": "Calculate the residual.",
        }[selector]
    elif kind == "reg_slope_test":
        if selector == "conc":
            scenario = _before(prompt, ". The residual plot") + "."
            claim = _before(prompt.split("Test whether ", 1)[1], r" at \(\alpha=")
            base = f"{scenario} The research question is whether {claim} at α = {metadata['expected_alpha']:g}."
        else:
            base = prompt.replace("Test whether ", "The research question is whether ")
        question = ("State the slope hypotheses and calculate the test statistic and degrees of freedom."
                    if selector == "slope_stat"
                    else "State your statistical decision and conclusion in context.")
    elif kind == "reg_slope_ci":
        base = _before(prompt, " Construct a")
        level_match = re.search(r"Construct a (\d+)% confidence interval", prompt)
        if not level_match:
            raise ValueError("Slope confidence level missing from prompt")
        base += f" The confidence level is {level_match.group(1)}%."
        context.append(f"Use t* = {steps[1]['expected'][0]:.12g}.")
        question = "Calculate and interpret the confidence interval for the population slope."
    else:
        raise ValueError(f"Unsupported standalone prompt: {kind}, {selector}")
    return " ".join([base, *context, question])


def slice_problem_to_step(problem_dict: Dict[str, Any], step_selector: Union[str, int], context_summary: str = "") -> Dict[str, Any]:
    problem = deepcopy(problem_dict)
    steps = problem["steps"]
    kind = problem["type"]
    metadata = problem.get("metadata") or {}
    context = []
    if context_summary:
        context.append(context_summary)
    def find(label: str) -> Dict[str, Any]:
        return next(step for step in steps if label.lower() in step["label"].lower())

    if isinstance(step_selector, int):
        if step_selector < 1 or step_selector > len(steps):
            raise ValueError(f"Step number out of range: {step_selector}")
        selected = steps[step_selector - 1]
    elif step_selector == "cond":
        selected = find("Check Conditions")
    elif step_selector == "hypo":
        selected = find("Hypotheses")
    elif step_selector == "five_num":
        selected = steps[0]
    elif step_selector == "iqr":
        selected = steps[1]
        q1, q3 = steps[0]["inputs"][1]["expected"][0], steps[0]["inputs"][3]["expected"][0]
        context.append(f"Use Q1 = {q1:g} and Q3 = {q3:g}.")
    elif step_selector == "mean_sd":
        selected = deepcopy(steps[2])
        selected["inputs"] = selected["inputs"][1:]
        selected["label"] = "Sample Mean and Standard Deviation:"
        selected["hint"] = r"Use \(\bar{x}=\sum x_i/n\) and \(s_x=\sqrt{\sum(x_i-\bar{x})^2/(n-1)}\)."
    elif step_selector in ("transform", "marginal"):
        selected = steps[0]
    elif step_selector == "combine":
        selected = steps[1]
    elif step_selector == "cond_prob":
        selected = _combine_drill_steps(steps[1:3], "Conditional Probability and Independence:")
    elif step_selector == "crit_se":
        critical = deepcopy(find("Critical Value"))
        critical["label"] = re.sub(r"\s*\(df\s*=\s*\d+\)", "", critical["label"])
        critical["hint"] = "Use the confidence level and appropriate degrees of freedom to find the critical value."
        fields = [critical, {"label": "Standard Error (SE)", "input_type": "math",
                             "math_symbols": ["sqrt", "frac", "parens"],
                             "expected": [metadata["se"]], "tolerance": 0.005}]
        if "df" in metadata:
            fields.insert(0, {"label": "Degrees of Freedom (df)", "expected": [metadata["df"]], "tolerance": 0.01})
        selected = _combine_drill_steps(fields, "Critical Value and Standard Error:")
    elif step_selector == "crit":
        selected = find("Critical Value")
    elif step_selector == "bounds":
        selected = _combine_drill_steps([find("Margin of Error"), find("Lower Bound"), find("Upper Bound")],
                                        "Margin of Error and Interval Bounds:")
        context.append(f"Use point estimate = {metadata['point']:.6g}, critical value = {metadata['critical']:.6g}, and SE = {metadata['se']:.8g}.")
    elif step_selector == "interp":
        level = metadata["confidence"]
        targets = {
            "prop_z": "the true population proportion of individuals responding favorably",
            "prop_z_2samp": "the difference in population proportions for group 1 minus group 2",
            "mean_t": "the true population mean",
            "mean_t_2samp": "the difference in population means for group 1 minus group 2",
            "matched_pairs_t": "the population mean paired difference",
        }
        correct = f"We are {level}% confident the interval contains {targets[kind]}."
        selected = {"step_num": 1, "label": "Interpret the Confidence Interval:", "input_type": "select",
                    "options": [{"value": value, "label": value} for value in [
                        correct, f"There is a {level}% probability the fixed population parameter is in this computed interval.",
                        f"{level}% of individual observations lie in this interval."]],
                    "expected": [correct],
                    "hint": "Interpret confidence as the reliability of the method for capturing the fixed population parameter."}
        context.append(f"The {level}% confidence interval is ({metadata['lower']}, {metadata['upper']}).")
    elif step_selector == "se_stat":
        selected = _combine_drill_steps([find("Sample Statistic & Standard Error"), find("Standardized Test Statistic")],
                                        "Standard Error and Test Statistic:")
    elif step_selector == "pval":
        selected = find("P-Value")
        context.append(f"Use test statistic = {metadata['test_statistic']:.6f}" +
                       (f" and df = {metadata['degrees_freedom']}" if metadata.get("degrees_freedom") is not None else "") + ".")
    elif step_selector == "df":
        selected = find("Degrees of Freedom")
    elif step_selector == "stat_pval":
        selected = find("Test Statistic & P-value")
        context.append(f"Use df = {find('Degrees of Freedom')['expected'][0]}.")
    elif step_selector == "conc":
        selected = find("Conclusion")
        if kind.startswith("ht_") or kind == "reg_slope_test":
            context.append(f"Use P-value = {metadata['expected_pval']:.12g}.")
        elif kind.startswith("chi"):
            p_field = next(field for field in find("Test Statistic & P-value")["inputs"] if field["id"] == "chi-test-p-value")
            context.append(f"Use P-value = {p_field['expected'][0]:.12g}.")
    elif step_selector == "slope_int":
        selected = _combine_drill_steps(steps[:2], "Slope and y-Intercept:")
    elif step_selector in ("equation", "lsrl_eq"):
        selected = steps[2]
        context.append(f"Use intercept = {steps[1]['expected'][0]:.6f} and slope = {steps[0]['expected'][0]:.6f}.")
    elif step_selector == "pred_res":
        selected = _combine_drill_steps(steps[:2], "Predicted Value and Residual:")
    elif step_selector == "pred":
        selected = steps[0]
    elif step_selector == "res":
        selected = steps[1]
        context.append(f"Use predicted value = {steps[0]['expected'][0]:.6g}.")
    elif step_selector == "slope_stat":
        hypotheses = find("Hypotheses")
        statistic = find("Degrees of Freedom and Test Statistic")
        parts = []
        for row in hypotheses["rows"]:
            parts.extend([row["label"] + " ", {"component": row["symbol"]},
                          " " + row.get("operator", "")])
            if row.get("operator_component"):
                parts.append({"component": row["operator_component"]})
            parts.extend([" ", {"component": row["value"]}, "<br>"])
        for row in statistic["rows"]:
            parts.extend([row["formula"], {"component": row["component"]}, "<br>"])
        selected = {
            "step_num": 1, "label": "Slope Hypotheses and Test Statistic:",
            "input_type": "cloze", "components": hypotheses["components"] + statistic["components"],
            "parts": parts, "hint": hypotheses["hint"] + " " + statistic["hint"],
        }
    elif step_selector == "slope_interval":
        selected = steps[-1]
        level_match = re.search(r"Construct a (\d+)% confidence interval", problem["prompt"])
        if not level_match:
            raise ValueError("Slope confidence level missing from prompt")
        correct = f"We are {level_match.group(1)}% confident the interval contains the true population slope for this relationship."
        incorrect = f"{level_match.group(1)}% of individual observations lie within this interval."
        selected["components"].append({
            "id": "slope-ci-interpretation", "type": "select",
            "options": [{"value": value, "label": value} for value in (correct, incorrect)],
            "expected": [correct],
        })
        selected["parts"].extend([". Interpretation: ", {"component": "slope-ci-interpretation"}])
        selected["label"] = "Slope Interval Bounds and Interpretation:"
    else:
        raise ValueError(f"Unknown step selector: {step_selector}")
    selected["step_num"] = 1
    if isinstance(step_selector, str):
        problem["prompt"] = _standalone_prompt(problem, step_selector, context)
    else:
        problem["prompt"] += "".join(f"<p>{text}</p>" for text in context)
    problem["steps"] = [selected]
    return problem


def generate_single_step(topic: str, notation: str = "ab") -> Dict[str, Any]:
    engine, parent, selector = SINGLE_STEP_TOPICS[topic]
    parent_families = {
        "ci_prop_": ["prop_z", "prop_z_2samp"],
        "ci_mean_": ["mean_t", "mean_t_2samp", "matched_pairs_t"],
        "ht_prop_": ["ht_prop_z", "ht_prop_z_2samp"],
        "ht_mean_": ["ht_mean_t", "ht_mean_t_2samp", "ht_matched_pairs_t"],
        "chi_step_": ["chi_gof", "chi_independence", "chi_homogeneity"],
    }
    for prefix, parents in parent_families.items():
        if topic.startswith(prefix):
            parent = random.choice(parents)
            break
    generators = {
        "foundations": lambda: generate_foundations_problem(parent),
        "ci": lambda: generate_ci_problem(parent),
        "ht": lambda: generate_ht_problem(parent),
        "chi": lambda: generate_chi_problem(parent),
        "regression": lambda: generate_regression_problem(parent, notation),
    }
    if topic == "reg_step_slope_conc":
        parent = random.choice(["reg_slope_ci", "reg_slope_test"])
        selector = "slope_interval" if parent == "reg_slope_ci" else "conc"
    result = slice_problem_to_step(generators[engine](), selector)
    return tag_problem_input_types(result)

@app.get("/api/problem/ci")
async def get_ci_problem(topic: str = "mean_t", problem_type: str = "mean_t"):
    selected = topic if topic != "mean_t" else problem_type
    if selected in SINGLE_STEP_TOPICS:
        return generate_single_step(selected)
    try:
        return tag_problem_input_types(generate_ci_problem(selected))
    except TypeError:
        return tag_problem_input_types(generate_ci_problem())

@app.get("/api/problem/ht")
async def get_ht_problem(topic: str = "ht_prop_z"):
    try:
        if topic in SINGLE_STEP_TOPICS:
            return generate_single_step(topic)
        return tag_problem_input_types(generate_ht_problem(topic or "ht_prop_z"))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Unable to generate hypothesis-testing problem: {e}",
        ) from e

@app.get("/api/problem/chi")
async def get_chi_problem(topic: str = "random"):
    if topic in SINGLE_STEP_TOPICS:
        return generate_single_step(topic)
    return tag_problem_input_types(generate_chi_problem(topic or "random"))

@app.get("/api/problem/regression")
async def get_regression_problem(topic: str = "reg_lsrl", notation: str = "ab"):
    if topic in SINGLE_STEP_TOPICS:
        return generate_single_step(topic, notation)
    return tag_problem_input_types(generate_regression_problem(topic or "reg_lsrl", notation))

@app.get("/api/problem/prob_sampling")
async def get_prob_sampling_problem(topic: str):
    return tag_problem_input_types(generate_prob_sampling_problem(topic))

@app.get("/api/problem/foundations")
async def get_foundations_problem(topic: str):
    try:
        if topic in SINGLE_STEP_TOPICS:
            return generate_single_step(topic)
        return tag_problem_input_types(generate_foundations_problem(topic))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

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
    submission_res = db.table("assessment_submissions").select("id").eq("assessment_id", assessment_id).execute()
    return {**res.data[0], "section_id": res.data[0]["class_id"], "submission_count": len(submission_res.data or [])}

@app.put("/api/teacher/assessments/{assessment_id}")
async def update_assessment(assessment_id: str, req: AssessmentUpdateRequest, authorization: Optional[str] = Header(None)):
    access = verify_teacher_access(authorization)
    db = get_scoped_supabase(authorization)
    existing = db.table("assessments").select("*").eq("id", assessment_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Assessment not found")
    current = existing.data[0]
    verify_teacher_class_access(db, current["class_id"], access["user"].id)
    class_id = req.class_id or req.section_id
    if not class_id or (req.class_id and req.section_id and req.class_id != req.section_id):
        raise HTTPException(status_code=422, detail="A consistent class_id or section_id is required")
    verify_teacher_class_access(db, class_id, access["user"].id)
    config = dict(req.config)
    reset_version = (current.get("config") or {}).get("_submission_reset_version")
    if reset_version:
        config["_submission_reset_version"] = reset_version
    else:
        config.pop("_submission_reset_version", None)
    fields_set = getattr(req, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(req, "__fields_set__")
    payload = {
        "class_id": class_id, "title": req.title, "type": req.type,
        "parent_assessment_id": req.parent_assessment_id if "parent_assessment_id" in fields_set else current.get("parent_assessment_id"),
        "config": config, "due_date": req.due_date,
    }
    try:
        result = db.rpc("update_assessment_with_submission_action", {
            "p_assessment_id": assessment_id,
            "p_values": payload,
            "p_action": req.submission_action,
        }).execute()
    except Exception as exc:
        if "SUBMISSION_CHOICE_REQUIRED" in str(exc):
            raise HTTPException(status_code=409, detail="Choose whether to keep or reset existing submissions.") from exc
        raise HTTPException(status_code=400, detail=f"Could not save assessment: {exc}") from exc
    if not result.data:
        raise HTTPException(status_code=404, detail="Assessment could not be updated")
    updated = result.data[0] if isinstance(result.data, list) else result.data
    return {"status": "success", "assessment": updated}

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

@app.get("/api/teacher/assessments/{assessment_id}/results")
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
        .select("id, student_id, status, score, responses, details, submitted_at")
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
            "responses": submission.get("responses"),
            "details": submission.get("details"),
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

@app.post("/api/student/submissions")
async def submit_student_assessment(req: StudentSubmissionRequest, authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization[len("Bearer "):].strip()
    db = get_scoped_supabase(authorization)
    try:
        user = db.auth.get_user(token).user
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid user session") from exc
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user session")
    assessment = db.table("assessments").select("class_id, config, is_active").eq("id", req.assessment_id).execute()
    if not assessment.data or not assessment.data[0].get("is_active"):
        raise HTTPException(status_code=404, detail="Assessment not found or inactive")
    task = assessment.data[0]
    enrollment = db.table("enrollments").select("class_id").eq("class_id", task["class_id"]).eq("student_id", user.id).execute()
    if not enrollment.data:
        raise HTTPException(status_code=403, detail="Assessment is not assigned to this student")
    if (task.get("config") or {}).get("_submission_reset_version") != req.reset_version:
        raise HTTPException(status_code=409, detail="This assessment was reset. Reload it before submitting.")
    if not 0 <= req.score <= 100 or not isinstance(req.details.get("question_breakdown"), list):
        raise HTTPException(status_code=422, detail="Invalid score or question breakdown")
    try:
        db.rpc("submit_assessment_with_details", {
            "p_assessment_id": req.assessment_id, "p_score": req.score,
            "p_responses": req.responses, "p_details": req.details,
            "p_reset_version": req.reset_version,
        }).execute()
    except Exception as exc:
        if "ASSESSMENT_RESET" in str(exc):
            raise HTTPException(status_code=409, detail="This assessment was reset. Reload it before submitting.") from exc
        raise HTTPException(status_code=400, detail=f"Could not submit assessment: {exc}") from exc
    return {"status": "success"}

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