# Stats Mastery Engine

An algorithmic practice and step-by-step verification platform designed for collegiate-level inferential statistics (MTH 245).

## Features
- Dynamic problem generation with randomized seed parameters.
- Contextual statistical tolerance validation (accounting for table lookups vs. calculator precision).
- Dynamic step-by-step derivations rendered via KaTeX.
- Mastery-based retry loops.
- Class-default regression notation, with optional assignment-block overrides.
- A dockable Stats & Plots tool for one-variable summaries and plots, and two-variable regression and residual plots. Quartiles use the median of each half, excluding the overall median for odd sample sizes.
- Stats & Plots also supports editable variable labels, single and split stem-and-leaf plots, and categorical mosaic plots. Blank contingency-table counts are zero; Clear removes counts while keeping category labels and dimensions. Stem-and-leaf plots preserve the entered decimal precision and use tens as the leaf unit only when all values are multiples of ten.
- Stats & Plots can be maximized or opened at `/stats-tool`. Its data and variable names are saved in the browser's local storage; avoid entering sensitive data on shared devices.
- Calculator, reference tables, and Stats & Plots share dock space; drag a dock's inner edge to resize it. When both sides are occupied, a displaced calculator moves to the bottom and other displaced windows float.
- Teachers can set class tool defaults and override them per assessment. These controls hide tools in the practice interface; they are not a secure exam lockdown and cannot close tabs already opened independently. Independent practice allows all tools.
- Exiting a test saves an incomplete session in this browser on this device, not on the server. Reopen the test on the same device and account to resume it; clearing browser storage removes this saved session.

## Database setup
Apply [the class notation migration](supabase/migrations/20261111000000_class_default_notation.sql) to the Supabase database before deploying this version. It adds the `classes.default_notation` column used by the teacher dashboard and student assignments.
Also apply [the class tool policy migration](supabase/migrations/20261112000000_class_tool_policy.sql) before deploying the tool permission controls.

## Local Setup
1. Create and activate a virtual environment:
   python -m venv venv
   .\venv\Scripts\Activate.ps1
2. Install dependencies:
   pip install -r requirements.txt
3. Run the development server:
   uvicorn main:app --reload
