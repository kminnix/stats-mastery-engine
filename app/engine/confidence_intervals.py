import random
import math
from scipy.stats import norm, t
from .inference_conditions import add_inference_conditions


PROPORTION_SCENARIOS = [
    {
        "sample_units": "household tap-water samples from the city",
        "success": "met the EPA lead standard",
        "parameter": "the true proportion of household tap-water samples from city homes that meet the EPA lead standard",
        "keywords": ["household", "tap-water", "lead", "EPA"],
    },
    {
        "sample_units": "treated heirloom seeds from the farm's seed lot",
        "success": "sprouted within 14 days",
        "parameter": "the true proportion of treated heirloom seeds from the farm's seed lot that sprout within 14 days",
        "keywords": ["treated", "heirloom", "seeds", "sprout"],
    },
    {
        "sample_units": "students enrolled at the university",
        "success": "used campus transit at least three days per week",
        "parameter": "the true proportion of university students who use campus transit at least three days per week",
        "keywords": ["university", "students", "campus", "transit"],
    },
    {
        "sample_units": "circuit boards produced on the assembly line",
        "success": "passed the final quality inspection",
        "parameter": "the true proportion of circuit boards from the assembly line that pass final quality inspection",
        "keywords": ["circuit", "boards", "quality", "inspection"],
    },
    {
        "sample_units": "likely voters registered in the city",
        "success": "supported the proposed public-transit bond",
        "parameter": "the true proportion of likely city voters who support the proposed public-transit bond",
        "keywords": ["voters", "city", "support", "transit", "bond"],
    },
    {
        "sample_units": "patients receiving the new allergy treatment",
        "success": "reported relief from seasonal-allergy symptoms",
        "parameter": "the true proportion of patients receiving the new allergy treatment who report relief from seasonal-allergy symptoms",
        "keywords": ["patients", "allergy", "treatment", "symptoms", "relief"],
    },
    {
        "sample_units": "produce samples collected from the watershed farms",
        "success": "had pesticide residues below the environmental safety limit",
        "parameter": "the true proportion of produce samples from watershed farms with pesticide residues below the environmental safety limit",
        "keywords": ["produce", "watershed", "farms", "pesticide", "residues"],
    },
    {
        "sample_units": "customers who purchased the redesigned reusable bottle",
        "success": "said they would recommend it to a friend",
        "parameter": "the true proportion of customers who purchased the redesigned reusable bottle and would recommend it to a friend",
        "keywords": ["customers", "redesigned", "reusable", "bottle", "recommend"],
    },
    {
        "sample_units": "public high-school seniors in the district",
        "success": "completed a paid work-based learning placement",
        "parameter": "the true proportion of public high-school seniors in the district who complete a paid work-based learning placement",
        "keywords": ["public", "high-school", "seniors", "district", "placement"],
    },
    {
        "sample_units": "electric-vehicle battery cells sampled from the production run",
        "success": "passed the thermal-safety test",
        "parameter": "the true proportion of electric-vehicle battery cells from the production run that pass the thermal-safety test",
        "keywords": ["electric-vehicle", "battery", "cells", "thermal-safety"],
    },
]

TWO_SAMPLE_PROPORTION_SCENARIOS = [
    {
        "group1": "seeds treated with organic compost",
        "group2": "seeds treated with conventional fertilizer",
        "success": "germinated within 14 days",
        "parameter": "the difference in the true germination proportions for seeds treated with organic compost minus seeds treated with conventional fertilizer",
        "keywords": ["seeds", "organic", "compost", "conventional", "fertilizer", "germination"],
    },
    {
        "group1": "circuit boards assembled on the day shift",
        "group2": "circuit boards assembled on the night shift",
        "success": "failed the final inspection",
        "parameter": "the difference in the true defect proportions for day-shift circuit boards minus night-shift circuit boards",
        "keywords": ["circuit", "boards", "day", "night", "shift", "defect"],
    },
    {
        "group1": "patients assigned to Treatment A",
        "group2": "patients assigned to the placebo",
        "success": "reported relief from allergy symptoms",
        "parameter": "the difference in the true symptom-relief proportions for patients receiving Treatment A minus patients receiving the placebo",
        "keywords": ["patients", "Treatment A", "placebo", "allergy", "symptom-relief"],
    },
    {
        "group1": "students in online sections of the course",
        "group2": "students in in-person sections of the course",
        "success": "passed the end-of-term assessment",
        "parameter": "the difference in the true course pass proportions for students in online sections minus students in in-person sections",
        "keywords": ["students", "online", "in-person", "course", "passed"],
    },
    {
        "group1": "water samples collected upstream of the treatment plant",
        "group2": "water samples collected downstream of the treatment plant",
        "success": "met the dissolved-contaminant safety threshold",
        "parameter": "the difference in the true safety-compliance proportions for upstream water samples minus downstream water samples",
        "keywords": ["water", "upstream", "downstream", "treatment", "contaminant"],
    },
    {
        "group1": "customers who tested Brand A's refillable bottle",
        "group2": "customers who tested Brand B's refillable bottle",
        "success": "rated the bottle easy to clean",
        "parameter": "the difference in the true easy-to-clean rating proportions for customers testing Brand A minus customers testing Brand B",
        "keywords": ["customers", "Brand A", "Brand B", "refillable", "bottle", "clean"],
    },
    {
        "group1": "likely voters in District 1",
        "group2": "likely voters in District 2",
        "success": "supported the regional transit measure",
        "parameter": "the difference in the true support proportions for likely voters in District 1 minus likely voters in District 2",
        "keywords": ["voters", "District 1", "District 2", "support", "transit"],
    },
    {
        "group1": "tomato plots irrigated with drip lines",
        "group2": "tomato plots irrigated with sprinklers",
        "success": "produced marketable fruit",
        "parameter": "the difference in the true marketable-yield proportions for drip-irrigated tomato plots minus sprinkler-irrigated tomato plots",
        "keywords": ["tomato", "plots", "drip", "sprinklers", "irrigated", "marketable"],
    },
    {
        "group1": "produce lots screened by Supplier A",
        "group2": "produce lots screened by Supplier B",
        "success": "passed the food-safety pathogen test",
        "parameter": "the difference in the true food-safety pass proportions for Supplier A produce lots minus Supplier B produce lots",
        "keywords": ["produce", "Supplier A", "Supplier B", "food-safety", "pathogen"],
    },
    {
        "group1": "city bus trips using the priority-lane corridor",
        "group2": "city bus trips using the standard route",
        "success": "arrived within five minutes of the scheduled time",
        "parameter": "the difference in the true on-time arrival proportions for priority-lane bus trips minus standard-route bus trips",
        "keywords": ["city", "bus", "priority-lane", "standard", "route", "on-time"],
    },
]

MEAN_SCENARIOS = [
    {
        "sample_units": "smartwatches from the latest production lot",
        "measure": "battery lifespan",
        "unit": "hours",
        "parameter": "the true mean battery lifespan, in hours, of smartwatches from the latest production lot",
        "keywords": ["smartwatches", "battery", "lifespan", "hours"],
        "mean_range": (45, 110), "sd_range": (4, 15),
    },
    {
        "sample_units": "water samples collected from the river",
        "measure": "dissolved oxygen level",
        "unit": "mg/L",
        "parameter": "the true mean dissolved oxygen level, in mg/L, in river water samples",
        "keywords": ["river", "water", "dissolved", "oxygen", "mg/L"],
        "mean_range": (4.5, 10.5), "sd_range": (0.5, 2),
    },
    {
        "sample_units": "city residents selected from the municipal address registry",
        "measure": "daily commute time",
        "unit": "minutes",
        "parameter": "the true mean daily commute time, in minutes, for city residents",
        "keywords": ["city", "residents", "daily", "commute", "minutes"],
        "mean_range": (20, 60), "sd_range": (5, 20),
    },
    {
        "sample_units": "cereal boxes from the morning packaging line",
        "measure": "net fill weight",
        "unit": "grams",
        "parameter": "the true mean net fill weight, in grams, of cereal boxes from the morning packaging line",
        "keywords": ["cereal", "boxes", "net", "fill", "weight", "grams"],
        "mean_range": (450, 550), "sd_range": (2, 10),
    },
    {
        "sample_units": "patients completing outpatient physical therapy",
        "measure": "recovery time",
        "unit": "days",
        "parameter": "the true mean recovery time, in days, for patients completing outpatient physical therapy",
        "keywords": ["patients", "recovery", "outpatient", "physical", "therapy", "days"],
        "mean_range": (4, 18), "sd_range": (1, 6),
    },
    {
        "sample_units": "wheat plots harvested across the county",
        "measure": "crop yield",
        "unit": "bushels per acre",
        "parameter": "the true mean wheat yield, in bushels per acre, across county farms",
        "keywords": ["wheat", "plots", "crop", "yield", "bushels", "acre"],
        "mean_range": (80, 220), "sd_range": (10, 40),
    },
    {
        "sample_units": "students taking the district's algebra assessment",
        "measure": "assessment score",
        "unit": "points",
        "parameter": "the true mean algebra assessment score, in points, for students in the district",
        "keywords": ["students", "district", "algebra", "assessment", "score", "points"],
        "mean_range": (60, 90), "sd_range": (5, 20),
    },
    {
        "sample_units": "electric-vehicle charging sessions at public fast chargers",
        "measure": "charging time from 20% to 80%",
        "unit": "minutes",
        "parameter": "the true mean electric-vehicle charging time, in minutes, from 20% to 80% at public fast chargers",
        "keywords": ["electric-vehicle", "charging", "public", "fast", "chargers", "minutes"],
        "mean_range": (20, 50), "sd_range": (5, 15),
    },
    {
        "sample_units": "households participating in the city's water-use study",
        "measure": "weekly household water use",
        "unit": "gallons",
        "parameter": "the true mean weekly water use, in gallons, for households in the city study",
        "keywords": ["households", "city", "water-use", "weekly", "gallons"],
        "mean_range": (500, 3000), "sd_range": (100, 800),
    },
    {
        "sample_units": "air-monitoring days recorded near the industrial corridor",
        "measure": "fine-particle concentration",
        "unit": "µg/m³",
        "parameter": "the true mean fine-particle concentration, in µg/m³, near the industrial corridor",
        "keywords": ["air-monitoring", "fine-particle", "concentration", "industrial", "corridor"],
        "mean_range": (5, 30), "sd_range": (2, 8),
    },
]

TWO_SAMPLE_MEAN_SCENARIOS = [
    {
        "group1": "fields using drip irrigation",
        "group2": "fields using sprinkler irrigation",
        "measure": "wheat yield",
        "unit": "bushels per acre",
        "parameter": "the difference in true mean wheat yields, in bushels per acre, for drip-irrigated fields minus sprinkler-irrigated fields",
        "keywords": ["wheat", "yield", "drip", "sprinkler", "irrigation", "bushels", "acre"],
        "mean_range": (80, 220), "sd_range": (10, 40),
    },
    {
        "group1": "participants completing the reaction task with background noise",
        "group2": "participants completing the reaction task in silence",
        "measure": "reaction time",
        "unit": "milliseconds",
        "parameter": "the difference in true mean reaction times, in milliseconds, with background noise minus in silence",
        "keywords": ["participants", "reaction", "time", "background", "noise", "silence"],
        "mean_range": (200, 400), "sd_range": (15, 60),
    },
    {
        "group1": "tires made with the new rubber compound",
        "group2": "tires made with the standard rubber compound",
        "measure": "tread life",
        "unit": "thousands of miles",
        "parameter": "the difference in true mean tire tread lives, in thousands of miles, for the new compound minus the standard compound",
        "keywords": ["tires", "tread", "life", "new", "standard", "compound"],
        "mean_range": (30, 70), "sd_range": (4, 12),
    },
    {
        "group1": "servings of Brand A tomato soup",
        "group2": "servings of Brand B tomato soup",
        "measure": "sodium content",
        "unit": "milligrams",
        "parameter": "the difference in true mean sodium content, in milligrams per serving, for Brand A tomato soup minus Brand B tomato soup",
        "keywords": ["Brand A", "Brand B", "tomato", "soup", "sodium", "milligrams"],
        "mean_range": (400, 1000), "sd_range": (50, 200),
    },
    {
        "group1": "patients receiving the new outpatient therapy",
        "group2": "patients receiving the standard outpatient therapy",
        "measure": "recovery time",
        "unit": "days",
        "parameter": "the difference in true mean recovery times, in days, for patients receiving the new therapy minus the standard therapy",
        "keywords": ["patients", "outpatient", "therapy", "recovery", "days", "new", "standard"],
        "mean_range": (5, 25), "sd_range": (2, 8),
    },
    {
        "group1": "water samples collected upstream of the restoration site",
        "group2": "water samples collected downstream of the restoration site",
        "measure": "dissolved oxygen level",
        "unit": "mg/L",
        "parameter": "the difference in true mean dissolved oxygen levels, in mg/L, for upstream water samples minus downstream samples",
        "keywords": ["water", "samples", "upstream", "downstream", "dissolved", "oxygen", "restoration"],
        "mean_range": (4.5, 10.5), "sd_range": (0.5, 2),
    },
    {
        "group1": "students in the district's new mathematics curriculum",
        "group2": "students in the district's previous mathematics curriculum",
        "measure": "mathematics assessment score",
        "unit": "points",
        "parameter": "the difference in true mean mathematics scores, in points, for students in the new curriculum minus the previous curriculum",
        "keywords": ["students", "district", "mathematics", "curriculum", "assessment", "score"],
        "mean_range": (60, 90), "sd_range": (5, 20),
    },
    {
        "group1": "battery packs charged using the fast-charging protocol",
        "group2": "battery packs charged using the standard protocol",
        "measure": "battery service life",
        "unit": "hours",
        "parameter": "the difference in true mean battery service lives, in hours, for fast-charged packs minus standard-charged packs",
        "keywords": ["battery", "packs", "fast-charging", "standard", "protocol", "service", "life"],
        "mean_range": (8, 24), "sd_range": (1, 5),
    },
    {
        "group1": "orders delivered using the electric-van fleet",
        "group2": "orders delivered using the conventional fleet",
        "measure": "delivery time",
        "unit": "hours",
        "parameter": "the difference in true mean delivery times, in hours, for electric-van deliveries minus conventional-fleet deliveries",
        "keywords": ["orders", "delivered", "electric-van", "conventional", "fleet", "delivery", "time"],
        "mean_range": (12, 48), "sd_range": (3, 12),
    },
    {
        "group1": "vehicles tested with the low-emission fuel blend",
        "group2": "vehicles tested with the standard fuel blend",
        "measure": "fuel economy",
        "unit": "miles per gallon",
        "parameter": "the difference in true mean fuel economies, in miles per gallon, for the low-emission blend minus the standard blend",
        "keywords": ["vehicles", "low-emission", "standard", "fuel", "blend", "economy", "miles"],
        "mean_range": (20, 50), "sd_range": (3, 8),
    },
]


def generate_mean_t_interval():
    """Generates a 1-sample t confidence interval problem for a population mean."""
    scenario = random.choice(MEAN_SCENARIOS)
    n = random.choice([16, 20, 25, 30, 36, 40, 49, 50])
    df = n - 1
    conf_level = random.choice([90, 95, 98, 99])
    alpha = (100 - conf_level) / 100.0
    
    xbar = round(random.uniform(*scenario["mean_range"]), 1)
    s = round(random.uniform(*scenario["sd_range"]), 1)
    
    # Critical value t*
    t_star_exact = t.ppf(1.0 - alpha / 2.0, df)
    t_star_rounded = round(t_star_exact, 3)
    
    # Standard Error & Margin of Error
    se = s / math.sqrt(n)
    moe_exact = t_star_exact * se
    moe_table = t_star_rounded * se
    
    # Interval bounds
    lower_exact = round(xbar - moe_exact, 2)
    upper_exact = round(xbar + moe_exact, 2)
    lower_table = round(xbar - moe_table, 2)
    upper_table = round(xbar + moe_table, 2)

    solution_html = (
        f"<p><strong>Parameter:</strong> Let \\(\\mu\\) denote {scenario['parameter']}.</p>"
        f"<p><strong>Step 1: Point Estimate & Degrees of Freedom</strong></p>"
        f"$$\\bar{{x}} = {xbar},\\quad n = {n},\\quad s = {s}$$"
        f"$$\\text{{Degrees of freedom: }}\\; df = n - 1 = {n} - 1 = {df}$$"
        f"<p><strong>Step 2: Find Critical Value \\(t^*\\)</strong></p>"
        f"$$\\text{{For a }}\\; {conf_level}\\%\\; \\text{{interval with }}\\; df = {df}:\\quad t^* \\approx {t_star_rounded}$$"
        f"<p><strong>Step 3: Calculate Standard Error and Margin of Error (E)</strong></p>"
        f"$$SE = \\frac{{s}}{{\\sqrt{{n}}}} = \\frac{{{s}}}{{\\sqrt{{{n}}}}} = \\frac{{{s}}}{{{round(math.sqrt(n), 4)}}} \\approx {round(se, 4)}$$"
        f"$$E = t^* \\cdot \\left(\\frac{{s}}{{\\sqrt{{n}}}}\\right) = ({t_star_rounded})({round(se, 4)}) \\approx \\mathbf{{{round(moe_table, 3)}}}$$"
        f"<p><strong>Step 4: Construct the Interval Bounds \\((L, U)\\)</strong></p>"
        f"$$L = \\bar{{x}} - E = {xbar} - {round(moe_table, 2)} = \\mathbf{{{lower_table}}}$$"
        f"$$U = \\bar{{x}} + E = {xbar} + {round(moe_table, 2)} = \\mathbf{{{upper_table}}}$$"
        f"<p>Confidence Interval: \\(({lower_table}, {upper_table})\\)</p>"
    )

    return add_inference_conditions({
        "type": "mean_t",
        "title": f"1-Sample t-Interval for Mean ({conf_level}%)",
        "metadata": {"se": se, "critical": t_star_rounded, "point": xbar, "margin": moe_table,
                     "lower": lower_table, "upper": upper_table, "confidence": conf_level, "df": df,
                     "sample_sizes": [n], "xbar": xbar, "s": s,
                     "parameter_description": scenario["parameter"],
                     "context_keywords": scenario["keywords"]},
        "parameter_description": scenario["parameter"],
        "context_keywords": scenario["keywords"],
        "prompt": (
            f"A simple random sample of {n} {scenario['sample_units']} yields a sample mean "
            f"\\(\\bar{{x}} = {xbar}\\) {scenario['unit']} and sample standard deviation "
            f"\\(s = {s}\\) {scenario['unit']}. Construct a <strong>{conf_level}%</strong> "
            f"confidence interval for \\(\\mu\\), the population mean of {scenario['measure']}."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Point Estimate (x̄):",
                "input_type": "number",
                "placeholder": "e.g. 72.4",
                "expected": [xbar],
                "tolerance": 0.05,
                "hint": "The sample mean is your unbiased point estimate."
            },
            {
                "step_num": 2,
                "label": f"Critical Value t* (df = {df}):",
                "input_type": "number",
                "placeholder": "e.g. 2.064",
                "expected": [t_star_rounded, round(t_star_exact, 3), round(t_star_exact, 4)],
                "tolerance": 0.02,
                "hint": f"Look up t* with df = {df} for {conf_level}% confidence or use invT."
            },
            {
                "step_num": 3,
                "label": "Margin of Error (E):",
                "input_type": "math",
                "math_symbols": ["sqrt", "frac", "parens"],
                "placeholder": "e.g. 3.25",
                "expected": [round(moe_table, 2), round(moe_exact, 2), round(moe_table, 3)],
                "tolerance": 0.08,
                "hint": "E = t* · (s / √n)"
            },
            {
                "step_num": 4,
                "label": "Lower Bound (L):",
                "input_type": "number",
                "placeholder": "e.g. 69.15",
                "expected": [lower_table, lower_exact],
                "tolerance": 0.15,
                "hint": "L = x̄ - E"
            },
            {
                "step_num": 5,
                "label": "Upper Bound (U):",
                "input_type": "number",
                "placeholder": "e.g. 75.65",
                "expected": [upper_table, upper_exact],
                "tolerance": 0.15,
                "hint": "U = x̄ + E"
            }
        ],
        "solution": solution_html
    }, [n])

def generate_proportion_z_interval():
    """Generates a 1-sample z confidence interval problem for a population proportion."""
    scenario = random.choice(PROPORTION_SCENARIOS)
    n = random.choice([100, 150, 200, 250, 400, 500])
    p_true = random.uniform(0.25, 0.75)
    x = int(round(n * p_true))
    phat = round(x / n, 4)
    qhat = round(1.0 - phat, 4)
    
    conf_level = random.choice([90, 95, 98, 99])
    alpha = (100 - conf_level) / 100.0
    
    z_star_exact = norm.ppf(1.0 - alpha / 2.0)
    z_star_rounded = round(z_star_exact, 3)
    if conf_level == 90:
        z_star_rounded = 1.645
    elif conf_level == 95:
        z_star_rounded = 1.96
    elif conf_level == 99:
        z_star_rounded = 2.576
        
    se = math.sqrt((phat * qhat) / n)
    moe_exact = z_star_exact * se
    moe_table = z_star_rounded * se
    
    lower_exact = round(phat - moe_exact, 4)
    upper_exact = round(phat + moe_exact, 4)
    lower_table = round(phat - moe_table, 4)
    upper_table = round(phat + moe_table, 4)

    solution_html = (
        f"<p><strong>Parameter:</strong> Let \\(p\\) denote {scenario['parameter']}.</p>"
        f"<p><strong>Step 1: Point Estimate (p̂)</strong></p>"
        f"$$\\hat{{p}} = \\frac{{x}}{{n}} = \\frac{{{x}}}{{{n}}} = \\mathbf{{{phat}}}$$"
        f"<p><strong>Step 2: Find Critical Value \\(z^*\\)</strong></p>"
        f"$$\\text{{For }}\\; {conf_level}\\%\\; \\text{{confidence:}}\\quad z^* = \\mathbf{{{z_star_rounded}}}$$"
        f"<p><strong>Step 3: Standard Error and Margin of Error (E)</strong></p>"
        f"$$SE = \\sqrt{{\\frac{{\\hat{{p}}\\hat{{q}}}}{{n}}}} = \\sqrt{{\\frac{{({phat})({qhat})}}{{{n}}}}} \\approx {round(se, 5)}$$"
        f"$$E = z^* \\cdot SE = ({z_star_rounded})({round(se, 5)}) \\approx \\mathbf{{{round(moe_table, 4)}}}$$"
        f"<p><strong>Step 4: Interval Bounds \\((L, U)\\)</strong></p>"
        f"$$L = \\hat{{p}} - E = {phat} - {round(moe_table, 4)} = \\mathbf{{{lower_table}}}$$"
        f"$$U = \\hat{{p}} + E = {phat} + {round(moe_table, 4)} = \\mathbf{{{upper_table}}}$$"
        f"<p>Confidence Interval: \\(({lower_table}, {upper_table})\\)</p>"
    )

    return add_inference_conditions({
        "type": "prop_z",
        "title": f"1-Sample z-Interval for Proportion ({conf_level}%)",
        "metadata": {"se": se, "critical": z_star_rounded, "point": phat, "margin": moe_table,
                     "lower": lower_table, "upper": upper_table, "confidence": conf_level,
                     "sample_sizes": [n], "x": x, "phat": phat,
                     "parameter_description": scenario["parameter"],
                     "context_keywords": scenario["keywords"]},
        "parameter_description": scenario["parameter"],
        "context_keywords": scenario["keywords"],
        "prompt": (
            f"In a random sample of \\(n = {n}\\) {scenario['sample_units']}, "
            f"\\(x = {x}\\) {scenario['success']}. Construct a <strong>{conf_level}%</strong> "
            f"confidence interval for \\(p\\), {scenario['parameter']}. "
            f"Round intermediate decimals and bounds to four places."
        ),
        "steps": [
            {
                "step_num": 1,
                "label": "Point Estimate (p̂):",
                "input_type": "number",
                "placeholder": "e.g. 0.4500",
                "expected": [phat],
                "tolerance": 0.005,
                "hint": "p̂ = x / n"
            },
            {
                "step_num": 2,
                "label": "Critical Value z*:",
                "input_type": "number",
                "placeholder": "e.g. 1.96",
                "expected": [z_star_rounded, round(z_star_exact, 3), round(z_star_exact, 2)],
                "tolerance": 0.02,
                "hint": f"Standard z* for {conf_level}% confidence."
            },
            {
                "step_num": 3,
                "label": "Margin of Error (E):",
                "input_type": "math",
                "math_symbols": ["sqrt", "frac", "parens"],
                "placeholder": "e.g. 0.0485",
                "expected": [round(moe_table, 4), round(moe_exact, 4)],
                "tolerance": 0.003,
                "hint": "E = z* · √[p̂(1 - p̂) / n]"
            },
            {
                "step_num": 4,
                "label": "Lower Bound (L):",
                "input_type": "number",
                "placeholder": "e.g. 0.4015",
                "expected": [lower_table, lower_exact],
                "tolerance": 0.005,
                "hint": "L = p̂ - E"
            },
            {
                "step_num": 5,
                "label": "Upper Bound (U):",
                "input_type": "number",
                "placeholder": "e.g. 0.4985",
                "expected": [upper_table, upper_exact],
                "tolerance": 0.005,
                "hint": "U = p̂ + E"
            }
        ],
        "solution": solution_html
    }, [n], min(x, n - x), r"Calculate \(n\hat p=x\) and \(n(1-\hat p)=n-x\).")

def generate_two_sample_mean_t_interval():
    """Generates a conservative two-sample t confidence interval for a difference in means."""
    scenario = random.choice(TWO_SAMPLE_MEAN_SCENARIOS)
    n1 = random.choice([16, 20, 25, 30, 36])
    n2 = random.choice([16, 20, 25, 30, 36])
    df = min(n1 - 1, n2 - 1)
    conf_level = random.choice([90, 95, 99])
    alpha = (100 - conf_level) / 100.0

    xbar1 = round(random.uniform(*scenario["mean_range"]), 1)
    xbar2 = round(random.uniform(*scenario["mean_range"]), 1)
    s1 = round(random.uniform(*scenario["sd_range"]), 1)
    s2 = round(random.uniform(*scenario["sd_range"]), 1)
    difference = xbar1 - xbar2
    se = math.sqrt((s1 ** 2 / n1) + (s2 ** 2 / n2))
    t_star_exact = t.ppf(1.0 - alpha / 2.0, df)
    t_star = round(t_star_exact, 3)
    moe = round(t_star * se, 2)
    lower = round(difference - moe, 2)
    upper = round(difference + moe, 2)
    point_estimate = round(difference, 2)

    solution_html = (
        f"<p><strong>Parameter:</strong> Let \\(\\mu_1 - \\mu_2\\) denote "
        f"{scenario['parameter']}.</p>"
        f"<p><strong>Step 1: Point Estimate (x̄₁ - x̄₂)</strong></p>"
        f"$$\\bar{{x}}_1 - \\bar{{x}}_2 = {xbar1} - {xbar2} = \\mathbf{{{point_estimate}}}$$"
        f"<p><strong>Step 2: Conservative Degrees of Freedom</strong></p>"
        f"$$df = \\min(n_1 - 1, n_2 - 1) = \\min({n1} - 1, {n2} - 1) = \\mathbf{{{df}}}$$"
        f"<p><strong>Step 3: Critical Value (t*)</strong></p>"
        f"$$t^* = t_{{{1.0 - alpha / 2.0:.3f},\\,{df}}} \\approx \\mathbf{{{t_star}}}$$"
        f"<p><strong>Step 4: Margin of Error (E)</strong></p>"
        f"$$SE = \\sqrt{{\\frac{{s_1^2}}{{n_1}} + \\frac{{s_2^2}}{{n_2}}}}"
        f" = \\sqrt{{\\frac{{{s1}^2}}{{{n1}}} + \\frac{{{s2}^2}}{{{n2}}}}} \\approx {round(se, 4)}$$"
        f"$$E = t^* \\cdot SE = ({t_star})({round(se, 4)}) \\approx \\mathbf{{{moe}}}$$"
        f"<p><strong>Step 5: Lower Bound (L)</strong></p>"
        f"$$L = ({point_estimate}) - ({moe}) = \\mathbf{{{lower}}}$$"
        f"<p><strong>Step 6: Upper Bound (U)</strong></p>"
        f"$$U = ({point_estimate}) + ({moe}) = \\mathbf{{{upper}}}$$"
        f"<p>Confidence Interval for \\(\\mu_1 - \\mu_2\\): \\(({lower}, {upper})\\)</p>"
    )

    return add_inference_conditions({
        "type": "mean_t_2samp",
        "title": f"2-Sample t-Interval for Means ({conf_level}%)",
        "metadata": {"se": se, "critical": t_star, "point": point_estimate, "margin": moe,
                     "lower": lower, "upper": upper, "confidence": conf_level, "df": df,
                     "sample_sizes": [n1, n2], "xbar1": xbar1, "xbar2": xbar2, "s1": s1, "s2": s2,
                     "parameter_description": scenario["parameter"],
                     "context_keywords": scenario["keywords"]},
        "parameter_description": scenario["parameter"],
        "context_keywords": scenario["keywords"],
        "prompt": (
            f"Independent random samples were taken from {scenario['group1']} and "
            f"{scenario['group2']}. The first sample has \\(n_1 = {n1}\\), "
            f"\\(\\bar{{x}}_1 = {xbar1}\\) {scenario['unit']}, and "
            f"\\(s_1 = {s1}\\) {scenario['unit']}; the second has \\(n_2 = {n2}\\), "
            f"\\(\\bar{{x}}_2 = {xbar2}\\) {scenario['unit']}, and "
            f"\\(s_2 = {s2}\\) {scenario['unit']}. Construct a <strong>{conf_level}%</strong> "
            f"confidence interval for \\(\\mu_1 - \\mu_2\\), {scenario['parameter']}, "
            f"using the conservative degrees of freedom "
            f"\\(df = \\min(n_1 - 1, n_2 - 1)\\). Round the point estimate and bounds to "
            f"two decimals, the critical value to three decimals, and the margin of error to two decimals."
        ),
        "steps": [
            {"step_num": 1, "label": "Point Estimate (x̄₁ - x̄₂):", "input_type": "number", "placeholder": "e.g. 4.25",
             "expected": [point_estimate], "tolerance": 0.05,
             "hint": "Subtract the second sample mean from the first."},
            {"step_num": 2, "label": "Conservative Degrees of Freedom (df):", "input_type": "number", "placeholder": "e.g. 15",
             "expected": [df], "tolerance": 0.01,
             "hint": "Use the smaller of n₁ - 1 and n₂ - 1."},
            {"step_num": 3, "label": "Critical Value t*:", "input_type": "number", "placeholder": "e.g. 2.131",
             "expected": [t_star], "tolerance": 0.01,
             "hint": f"Use {conf_level}% confidence with the conservative df."},
            {"step_num": 4, "label": "Margin of Error (E):", "input_type": "math", "math_symbols": ["sqrt", "frac", "parens"], "placeholder": "e.g. 5.42",
             "expected": [moe], "tolerance": 0.08,
             "hint": "E = t* · √(s₁²/n₁ + s₂²/n₂)"},
            {"step_num": 5, "label": "Lower Bound (L):", "input_type": "number", "placeholder": "e.g. -1.17",
             "expected": [lower], "tolerance": 0.12,
             "hint": "L = (x̄₁ - x̄₂) - E"},
            {"step_num": 6, "label": "Upper Bound (U):", "input_type": "number", "placeholder": "e.g. 9.67",
             "expected": [upper], "tolerance": 0.12,
             "hint": "U = (x̄₁ - x̄₂) + E"}
        ],
        "solution": solution_html
    }, [n1, n2])

def generate_two_sample_prop_z_interval():
    """Generates a two-sample z confidence interval for a difference in proportions."""
    scenario = random.choice(TWO_SAMPLE_PROPORTION_SCENARIOS)
    n1 = random.choice([100, 150, 200, 250, 300])
    n2 = random.choice([100, 150, 200, 250, 300])
    x1 = random.randint(int(n1 * 0.2), int(n1 * 0.8))
    x2 = random.randint(int(n2 * 0.2), int(n2 * 0.8))
    p1_hat = x1 / n1
    p2_hat = x2 / n2
    difference = p1_hat - p2_hat
    se = math.sqrt(
        (p1_hat * (1.0 - p1_hat) / n1) +
        (p2_hat * (1.0 - p2_hat) / n2)
    )
    conf_level = random.choice([90, 95, 99])
    z_star = {90: 1.645, 95: 1.960, 99: 2.576}[conf_level]
    moe = round(z_star * se, 4)
    point_estimate = round(difference, 4)
    lower = round(difference - moe, 4)
    upper = round(difference + moe, 4)
    p1_display = round(p1_hat, 4)
    p2_display = round(p2_hat, 4)

    solution_html = (
        f"<p><strong>Parameter:</strong> Let \\(p_1 - p_2\\) denote "
        f"{scenario['parameter']}.</p>"
        f"<p><strong>Step 1: Point Estimate (p̂₁ - p̂₂)</strong></p>"
        f"$$\\hat{{p}}_1 - \\hat{{p}}_2 = \\frac{{{x1}}}{{{n1}}} - \\frac{{{x2}}}{{{n2}}}"
        f" = {p1_display} - {p2_display} = \\mathbf{{{point_estimate}}}$$"
        f"<p><strong>Step 2: Critical Value (z*)</strong></p>"
        f"$$z^* = \\mathbf{{{z_star}}}\\quad\\text{{for }}{conf_level}\\%\\text{{ confidence}}$$"
        f"<p><strong>Step 3: Margin of Error (E)</strong></p>"
        f"$$SE = \\sqrt{{\\frac{{\\hat{{p}}_1(1-\\hat{{p}}_1)}}{{n_1}} + "
        f"\\frac{{\\hat{{p}}_2(1-\\hat{{p}}_2)}}{{n_2}}}} \\approx {round(se, 5)}$$"
        f"$$E = z^* \\cdot SE = ({z_star})({round(se, 5)}) \\approx \\mathbf{{{moe}}}$$"
        f"<p><strong>Step 4: Lower Bound (L)</strong></p>"
        f"$$L = ({point_estimate}) - ({moe}) = \\mathbf{{{lower}}}$$"
        f"<p><strong>Step 5: Upper Bound (U)</strong></p>"
        f"$$U = ({point_estimate}) + ({moe}) = \\mathbf{{{upper}}}$$"
        f"<p>Confidence Interval for \\(p_1 - p_2\\): \\(({lower}, {upper})\\)</p>"
    )

    return add_inference_conditions({
        "type": "prop_z_2samp",
        "title": f"2-Sample z-Interval for Proportions ({conf_level}%)",
        "metadata": {"se": se, "critical": z_star, "point": point_estimate, "margin": moe,
                     "lower": lower, "upper": upper, "confidence": conf_level,
                     "sample_sizes": [n1, n2], "x1": x1, "x2": x2,
                     "phat1": p1_hat, "phat2": p2_hat,
                     "parameter_description": scenario["parameter"],
                     "context_keywords": scenario["keywords"]},
        "parameter_description": scenario["parameter"],
        "context_keywords": scenario["keywords"],
        "prompt": (
            f"In independent random samples, {x1} of {n1} from {scenario['group1']} and "
            f"{x2} of {n2} from {scenario['group2']} {scenario['success']}. Construct a "
            f"<strong>{conf_level}%</strong> confidence interval for \\(p_1 - p_2\\), "
            f"{scenario['parameter']}. Round the point estimate, margin of error, and bounds to four decimals."
        ),
        "steps": [
            {"step_num": 1, "label": "Point Estimate (p̂₁ - p̂₂):", "input_type": "number", "placeholder": "e.g. 0.0525",
             "expected": [point_estimate], "tolerance": 0.001,
             "hint": "Compute p̂₁ = x₁/n₁ and p̂₂ = x₂/n₂, then subtract."},
            {"step_num": 2, "label": "Critical Value z*:", "input_type": "number", "placeholder": "e.g. 1.960",
             "expected": [z_star], "tolerance": 0.01,
             "hint": f"Use the z* value for {conf_level}% confidence."},
            {"step_num": 3, "label": "Margin of Error (E):", "input_type": "math", "math_symbols": ["sqrt", "frac", "parens"], "placeholder": "e.g. 0.0834",
             "expected": [moe], "tolerance": 0.002,
             "hint": "E = z* · √[p̂₁(1-p̂₁)/n₁ + p̂₂(1-p̂₂)/n₂]"},
            {"step_num": 4, "label": "Lower Bound (L):", "input_type": "number", "placeholder": "e.g. -0.0309",
             "expected": [lower], "tolerance": 0.003,
             "hint": "L = (p̂₁ - p̂₂) - E"},
            {"step_num": 5, "label": "Upper Bound (U):", "input_type": "number", "placeholder": "e.g. 0.1360",
             "expected": [upper], "tolerance": 0.003,
             "hint": "U = (p̂₁ - p̂₂) + E"}
        ],
        "solution": solution_html
    }, [n1, n2], min(x1, n1 - x1, x2, n2 - x2),
        r"Calculate successes and failures for each sample; compare all four counts.")

def generate_matched_pairs_t_interval():
    """Generates a matched-pairs t confidence interval for a population mean difference."""
    n = random.choice([12, 15, 18, 20, 25])
    df = n - 1
    d_bar = round(random.uniform(-8.0, 8.0), 1)
    s_d = round(random.uniform(2.0, 8.0), 1)
    conf_level = random.choice([90, 95, 99])
    alpha = (100 - conf_level) / 100.0
    t_star_exact = t.ppf(1.0 - alpha / 2.0, df)
    t_star = round(t_star_exact, 3)
    se = s_d / math.sqrt(n)
    moe = round(t_star * se, 2)
    lower = round(d_bar - moe, 2)
    upper = round(d_bar + moe, 2)

    solution_html = (
        f"<p><strong>Step 1: Point Estimate (d̄)</strong></p>"
        f"$$\\bar{{d}} = \\mathbf{{{d_bar}}}$$"
        f"<p><strong>Step 2: Critical Value (t*)</strong></p>"
        f"$$df = n - 1 = {n} - 1 = {df},\\quad "
        f"t^* = t_{{{1.0 - alpha / 2.0:.3f},\\,{df}}} \\approx \\mathbf{{{t_star}}}$$"
        f"<p><strong>Step 3: Margin of Error (E)</strong></p>"
        f"$$SE = \\frac{{s_d}}{{\\sqrt{{n}}}} = \\frac{{{s_d}}}{{\\sqrt{{{n}}}}} "
        f"\\approx {round(se, 4)}$$"
        f"$$E = t^* \\cdot SE = ({t_star})({round(se, 4)}) \\approx \\mathbf{{{moe}}}$$"
        f"<p><strong>Step 4: Lower Bound (L)</strong></p>"
        f"$$L = \\bar{{d}} - E = {d_bar} - ({moe}) = \\mathbf{{{lower}}}$$"
        f"<p><strong>Step 5: Upper Bound (U)</strong></p>"
        f"$$U = \\bar{{d}} + E = {d_bar} + ({moe}) = \\mathbf{{{upper}}}$$"
        f"<p>Confidence Interval for the population mean difference \\(\\mu_{{\\text{{diff}}}}\\): "
        f"\\(({lower}, {upper})\\)</p>"
    )

    return add_inference_conditions({
        "type": "matched_pairs_t",
        "title": f"Matched Pairs t-Interval for μ_diff ({conf_level}%)",
        "metadata": {"se": se, "critical": t_star, "point": d_bar, "margin": moe,
                     "lower": lower, "upper": upper, "confidence": conf_level, "df": df},
        "prompt": (
            f"For {n} matched pairs, the sample mean of the paired differences is "
            f"\\(\\bar{{d}} = {d_bar}\\) and their sample standard deviation is "
            f"\\(s_d = {s_d}\\). Construct a <strong>{conf_level}%</strong> confidence "
            f"interval for the population mean difference \\(\\mu_{{\\text{{diff}}}}\\). Use "
            f"\\(df = n - 1\\). Round the margin of error and bounds to two decimals."
        ),
        "steps": [
            {"step_num": 1, "label": "Point Estimate (d̄):", "input_type": "number", "placeholder": "e.g. 2.4",
             "expected": [d_bar], "tolerance": 0.05,
             "hint": "The sample mean difference is the point estimate."},
            {"step_num": 2, "label": f"Critical Value t* (df = {df}):", "input_type": "number", "placeholder": "e.g. 2.145",
             "expected": [t_star], "tolerance": 0.01,
             "hint": f"Use {conf_level}% confidence with df = n - 1 = {df}."},
            {"step_num": 3, "label": "Margin of Error (E):", "input_type": "math", "math_symbols": ["sqrt", "frac", "parens"], "placeholder": "e.g. 2.35",
             "expected": [moe], "tolerance": 0.08,
             "hint": "E = t* · (s_d / √n)"},
            {"step_num": 4, "label": "Lower Bound (L):", "input_type": "number", "placeholder": "e.g. -0.05",
             "expected": [lower], "tolerance": 0.12,
             "hint": "L = d̄ - E"},
            {"step_num": 5, "label": "Upper Bound (U):", "input_type": "number", "placeholder": "e.g. 4.75",
             "expected": [upper], "tolerance": 0.12,
             "hint": "U = d̄ + E"}
        ],
        "solution": solution_html
    }, [n])

def generate_ci_problem(topic: str = "random"):
    if topic == "mean_t":
        return generate_mean_t_interval()
    elif topic == "prop_z":
        return generate_proportion_z_interval()
    elif topic == "mean_t_2samp":
        return generate_two_sample_mean_t_interval()
    elif topic == "prop_z_2samp":
        return generate_two_sample_prop_z_interval()
    elif topic == "matched_pairs_t":
        return generate_matched_pairs_t_interval()
    return random.choice([
        generate_mean_t_interval,
        generate_proportion_z_interval,
        generate_two_sample_mean_t_interval,
        generate_two_sample_prop_z_interval,
        generate_matched_pairs_t_interval
    ])()
