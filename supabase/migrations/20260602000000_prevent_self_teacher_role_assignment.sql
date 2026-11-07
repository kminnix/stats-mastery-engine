CREATE OR REPLACE FUNCTION public.prevent_self_teacher_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
        AND NEW.role = 'teacher'
        AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role) THEN
        RAISE EXCEPTION 'Teacher role requires administrator approval'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_teacher_role ON public.profiles;

CREATE TRIGGER profiles_prevent_self_teacher_role
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_self_teacher_role_assignment();
