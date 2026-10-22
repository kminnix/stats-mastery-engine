# Stats Mastery Engine

An algorithmic practice and step-by-step verification platform designed for collegiate-level inferential statistics (MTH 245).

## Features
- Dynamic problem generation with randomized seed parameters.
- Contextual statistical tolerance validation (accounting for table lookups vs. calculator precision).
- Dynamic step-by-step derivations rendered via KaTeX.
- Mastery-based retry loops.

## Local Setup
1. Create and activate a virtual environment:
   python -m venv venv
   .\venv\Scripts\Activate.ps1
2. Install dependencies:
   pip install -r requirements.txt
3. Run the development server:
   uvicorn main:app --reload
