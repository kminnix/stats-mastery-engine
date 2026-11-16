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
    normalized_breakdown jsonb;
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
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_details->'question_breakdown') AS entries(item)
        WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
            OR (item ? 'missed_steps' AND jsonb_typeof(item->'missed_steps') IS DISTINCT FROM 'array')
    ) THEN
        RAISE EXCEPTION 'Invalid missed-step breakdown';
    END IF;
    SELECT COALESCE(jsonb_agg(item || jsonb_build_object(
        'missed_steps', COALESCE(item->'missed_steps', '[]'::jsonb)
    ) ORDER BY position), '[]'::jsonb)
    INTO normalized_breakdown
    FROM jsonb_array_elements(p_details->'question_breakdown') WITH ORDINALITY AS entries(item, position);
    p_details := jsonb_set(p_details, '{question_breakdown}', normalized_breakdown);
    INSERT INTO public.assessment_submissions
        (assessment_id, student_id, status, score, responses, details, submitted_at)
    VALUES (p_assessment_id, auth.uid(), 'submitted', p_score, p_responses, p_details, now())
    ON CONFLICT (assessment_id, student_id) DO UPDATE SET
        status = EXCLUDED.status, score = EXCLUDED.score, responses = EXCLUDED.responses,
        details = EXCLUDED.details, submitted_at = EXCLUDED.submitted_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_exempt_correction(
    p_assessment_id uuid, p_student_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    correction public.assessments%ROWTYPE;
    parent_submission public.assessment_submissions%ROWTYPE;
    breakdown jsonb;
    item jsonb;
    question jsonb;
    perfect boolean;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_student_id THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO correction FROM public.assessments
    WHERE id = p_assessment_id AND type = 'test_correction' AND is_active IS TRUE FOR SHARE;
    IF NOT FOUND OR correction.parent_assessment_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE class_id = correction.class_id AND student_id = p_student_id
    ) THEN
        RAISE EXCEPTION 'Correction is not assigned to this student' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.assessments
    WHERE id = correction.parent_assessment_id AND class_id = correction.class_id FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent assessment not found';
    END IF;
    SELECT * INTO parent_submission FROM public.assessment_submissions
    WHERE assessment_id = correction.parent_assessment_id AND student_id = p_student_id
        AND status IN ('submitted', 'completed') FOR SHARE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    breakdown := parent_submission.details->'question_breakdown';
    IF jsonb_typeof(breakdown) IS DISTINCT FROM 'array' THEN
        breakdown := parent_submission.responses;
    END IF;
    perfect := parent_submission.score = 100;
    IF jsonb_typeof(breakdown) = 'array' THEN
        IF jsonb_array_length(breakdown) > 0 THEN
            perfect := true;
            FOR item IN SELECT value FROM jsonb_array_elements(breakdown) LOOP
                IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
                    perfect := false;
                    EXIT;
                END IF;
                question := CASE WHEN jsonb_typeof(item->'breakdown') = 'object'
                    THEN item->'breakdown' ELSE item END;
                IF question->'correct' = 'false'::jsonb OR item->'correct' = 'false'::jsonb
                    OR (question ? 'missed_steps' AND (
                        jsonb_typeof(question->'missed_steps') IS DISTINCT FROM 'array'
                        OR question->'missed_steps' <> '[]'::jsonb
                    )) THEN
                    perfect := false;
                    EXIT;
                END IF;
                IF jsonb_typeof(question->'points_earned') = 'number'
                    AND jsonb_typeof(question->'max_points') = 'number' THEN
                    IF (question->>'points_earned')::numeric < (question->>'max_points')::numeric THEN
                        perfect := false;
                        EXIT;
                    END IF;
                ELSIF COALESCE(question->'correct', item->'correct') IS DISTINCT FROM 'true'::jsonb THEN
                    perfect := false;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;
    IF NOT COALESCE(perfect, false) THEN
        RETURN false;
    END IF;
    INSERT INTO public.assessment_submissions
        (assessment_id, student_id, status, score, responses, details, submitted_at)
    VALUES (p_assessment_id, p_student_id, 'submitted', 100, '[]'::jsonb,
        '{"auto_exempt": true, "reason": "100% on parent exam"}'::jsonb, now())
    ON CONFLICT (assessment_id, student_id) DO NOTHING;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_exempt_correction(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_exempt_correction(uuid, uuid) TO authenticated;
