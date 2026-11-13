ALTER TABLE public.assessment_submissions
    ADD COLUMN IF NOT EXISTS details jsonb;

CREATE OR REPLACE FUNCTION public.update_assessment_with_submission_action(
    p_assessment_id uuid, p_values jsonb, p_action text
)
RETURNS SETOF public.assessments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    original public.assessments%ROWTYPE;
    updated public.assessments%ROWTYPE;
BEGIN
    SELECT * INTO original FROM public.assessments
    WHERE id = p_assessment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    updated := jsonb_populate_record(original, p_values);
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.classes WHERE id = original.class_id AND teacher_id = auth.uid()
    ) OR NOT EXISTS (
        SELECT 1 FROM public.classes WHERE id = updated.class_id AND teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Class access denied' USING ERRCODE = '42501';
    END IF;
    IF p_action IS NOT NULL AND p_action NOT IN ('keep', 'reset') THEN
        RAISE EXCEPTION 'Invalid submission action';
    END IF;
    IF p_action IS NULL AND EXISTS (
        SELECT 1 FROM public.assessment_submissions WHERE assessment_id = p_assessment_id
    ) THEN
        RAISE EXCEPTION 'SUBMISSION_CHOICE_REQUIRED';
    END IF;
    IF p_action = 'reset' THEN
        updated.config := jsonb_set(updated.config, '{_submission_reset_version}', to_jsonb(gen_random_uuid()::text));
    ELSIF original.config ? '_submission_reset_version' THEN
        updated.config := jsonb_set(updated.config, '{_submission_reset_version}', original.config->'_submission_reset_version');
    ELSE
        updated.config := updated.config - '_submission_reset_version';
    END IF;
    UPDATE public.assessments SET
        class_id = updated.class_id,
        title = updated.title,
        type = updated.type,
        parent_assessment_id = updated.parent_assessment_id,
        config = updated.config,
        due_date = updated.due_date
    WHERE id = p_assessment_id
    RETURNING * INTO updated;
    IF p_action = 'reset' THEN
        DELETE FROM public.assessment_submissions WHERE assessment_id = p_assessment_id;
    END IF;
    RETURN NEXT updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_assessment_with_submission_action(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_assessment_with_submission_action(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_assessment_with_details(
    p_assessment_id uuid, p_score double precision, p_responses jsonb,
    p_details jsonb, p_reset_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    task public.assessments%ROWTYPE;
BEGIN
    SELECT * INTO task FROM public.assessments WHERE id = p_assessment_id FOR UPDATE;
    IF NOT FOUND OR task.is_active IS NOT TRUE OR auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE class_id = task.class_id AND student_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Assessment is not assigned to this student' USING ERRCODE = '42501';
    END IF;
    IF task.config->>'_submission_reset_version' IS DISTINCT FROM p_reset_version THEN
        RAISE EXCEPTION 'ASSESSMENT_RESET';
    END IF;
    IF p_score IS NULL OR p_score < 0 OR p_score > 100
        OR jsonb_typeof(p_responses) IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_details->'question_breakdown') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid submission';
    END IF;
    INSERT INTO public.assessment_submissions
        (assessment_id, student_id, status, score, responses, details, submitted_at)
    VALUES (p_assessment_id, auth.uid(), 'submitted', p_score, p_responses, p_details, now())
    ON CONFLICT (assessment_id, student_id) DO UPDATE SET
        status = EXCLUDED.status, score = EXCLUDED.score, responses = EXCLUDED.responses,
        details = EXCLUDED.details, submitted_at = EXCLUDED.submitted_at;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_assessment_with_details(uuid, double precision, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_assessment_with_details(uuid, double precision, jsonb, jsonb, text) TO authenticated;
