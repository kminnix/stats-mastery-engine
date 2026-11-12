ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS tool_policy jsonb NOT NULL
    DEFAULT '{"allow_calc":true,"allow_stats_tool":true,"allow_tables":true,"allow_popouts":true}'::jsonb;
