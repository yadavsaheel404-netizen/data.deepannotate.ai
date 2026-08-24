
DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can send realtime" ON realtime.messages;

CREATE POLICY "Users can subscribe to own realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can send to own realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE '%' || auth.uid()::text || '%'
  OR public.has_role(auth.uid(), 'admin'::app_role)
);
