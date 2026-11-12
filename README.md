# Stats Mastery Engine

An algorithmic practice and step-by-step verification platform designed for collegiate-level inferential statistics (MTH 245).

## Features
- Dynamic problem generation with randomized seed parameters.
- Contextual statistical tolerance validation (accounting for table lookups vs. calculator precision).
- Dynamic step-by-step derivations rendered via KaTeX.
- Mastery-based retry loops.
- Class-default regression notation, with optional assignment-block overrides.
- A dockable Stats & Plots tool for one-variable summaries and plots, and two-variable regression and residual plots. Quartiles use the median of each half, excluding the overall median for odd sample sizes.

## Database setup
Apply [the class notation migration](supabase/migrations/20261111000000_class_default_notation.sql) to the Supabase database before deploying this version. It adds the `classes.default_notation` column used by the teacher dashboard and student assignments.

## Local Setup
1. Create and activate a virtual environment:
   python -m venv venv
   .\venv\Scripts\Activate.ps1
2. Install dependencies:
   pip install -r requirements.txt
3. Run the development server:
   uvicorn main:app --reload
