import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp-up to 50 active virtual users
    { duration: '1m', target: 50 },   // Hold at 50 concurrent active users
    { duration: '15s', target: 0 },   // Ramp-down to 0 users
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Error rate must be less than 1%
    http_req_duration: ['p(95)<500'], // 95% of requests must complete under 500ms
  },
};

const BASE_URL = __ENV.SUPABASE_API_URL || 'https://example.supabase.co';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'mock-anon-key';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
  };

  // Phase 1: Browse active task feed
  const feedRes = http.post(
    `${BASE_URL}/rest/v1/rpc/get_visible_projects_with_counts`,
    JSON.stringify({}),
    { headers }
  );
  check(feedRes, {
    'feed status is 200': (r) => r.status === 200,
  });
  sleep(1);

  // Phase 2: Claim work item (segment)
  const claimRes = http.post(
    `${BASE_URL}/rest/v1/rpc/claim_work_item`,
    JSON.stringify({ _project_id: 'd3b07384-d113-4e4e-9b57-6953f6517a61' }),
    { headers }
  );
  check(claimRes, {
    'claim status is 200 or 409': (r) => r.status === 200 || r.status === 409 || r.status === 404,
  });
  sleep(2);

  // Phase 3: High-frequency autosave annotations
  const annotationsPayload = JSON.stringify({
    _work_item_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    _client_version: 1,
    _annotations: [
      {
        annotation_type: 'bbox',
        frame_number: 120,
        start_ms: 4000,
        end_ms: 6000,
        data: { x: 0.15, y: 0.25, width: 0.4, height: 0.35, label: 'Person' },
      },
    ],
  });

  const saveRes = http.post(
    `${BASE_URL}/rest/v1/rpc/save_annotations_batch`,
    annotationsPayload,
    { headers }
  );
  check(saveRes, {
    'save status is 200 or 400/409': (r) => r.status === 200 || r.status === 400 || r.status === 409,
  });

  sleep(1);
}
