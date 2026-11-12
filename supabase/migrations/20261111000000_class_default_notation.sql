ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS default_notation text NOT NULL DEFAULT 'ab';

ALTER TABLE public.classes
    ADD CONSTRAINT classes_default_notation_check
    CHECK (default_notation IN ('ab', 'b0b1'));
