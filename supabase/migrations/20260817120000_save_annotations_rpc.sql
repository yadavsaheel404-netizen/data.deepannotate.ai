CREATE OR REPLACE FUNCTION public.save_annotations_batch(
  _work_item_id UUID,
  _client_version INT,
  _annotations JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  current_version INT,
  db_annotations JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  active_claim BOOLEAN;
  max_db_version INT := 0;
  ret_annotations JSONB;
  ann_row RECORD;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- 1. Verify caller has an active claim
  SELECT EXISTS (
    SELECT 1 FROM public.work_claims
    WHERE work_item_id = _work_item_id
      AND contributor_id = caller_id
      AND status = 'active'
      AND expires_at > now()
  ) INTO active_claim;

  IF NOT active_claim THEN
    RAISE EXCEPTION 'CLAIM_EXPIRED_OR_INVALID';
  END IF;

  -- 2. Find current max version in database
  SELECT COALESCE(MAX(version), 0) INTO max_db_version
  FROM public.annotations
  WHERE work_item_id = _work_item_id;

  -- 3. Check version conflict
  IF max_db_version > _client_version THEN
    -- Build JSON array of current DB annotations to return to client for merging
    SELECT COALESCE(jsonb_agg(json_build_object(
      'id', id,
      'annotation_type', annotation_type,
      'frame_number', frame_number,
      'start_ms', start_ms,
      'end_ms', end_ms,
      'data', data,
      'version', version
    )), '[]'::jsonb) INTO ret_annotations
    FROM public.annotations
    WHERE work_item_id = _work_item_id;

    RETURN QUERY SELECT FALSE, max_db_version, ret_annotations;
    RETURN;
  END IF;

  -- 4. Delete old annotations for this work item
  DELETE FROM public.annotations WHERE work_item_id = _work_item_id;

  -- 5. Insert new batch of annotations with incremented version
  FOR ann_row IN SELECT * FROM jsonb_to_recordset(_annotations) AS (
    annotation_type TEXT,
    frame_number INT,
    start_ms INT,
    end_ms INT,
    data JSONB
  ) LOOP
    INSERT INTO public.annotations (
      work_item_id, contributor_id, annotation_type, frame_number, start_ms, end_ms, data, version
    ) VALUES (
      _work_item_id, caller_id, ann_row.annotation_type, ann_row.frame_number, ann_row.start_ms, ann_row.end_ms, ann_row.data, _client_version + 1
    );
  END LOOP;

  RETURN QUERY SELECT TRUE, _client_version + 1, '[]'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_annotations_batch(UUID, INT, JSONB) TO authenticated;
