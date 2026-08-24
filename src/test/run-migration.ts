import pkg from 'pg';
const { Client } = pkg;

const password = decodeURIComponent("94K2eSv21DjJPJHJt1IS2piLXBvFXH%2FENf%2BK2agRHQ4MkiY2KG6OQOHjNjkUm2eNydonIRXdyKeNOyPQ2pPlUQ%3D%3D");
const projectRef = "gkkmmhjhsmrnhnlpgnrs";

const regions = [
  "aws-0-ap-southeast-1",
  "aws-0-ap-south-1",
  "aws-0-ap-northeast-1",
  "aws-0-ap-northeast-2",
  "aws-0-eu-central-1",
  "aws-0-eu-west-1",
  "aws-0-eu-west-2",
  "aws-0-eu-west-3",
  "aws-0-us-east-1",
  "aws-0-us-east-2",
  "aws-0-us-west-1",
  "aws-0-us-west-2",
  "aws-0-sa-east-1",
  "aws-0-ca-central-1",
];

const sql = `
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS platform_url TEXT;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS referral_code TEXT;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS discord_url TEXT;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS community_url TEXT;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS guidelines_doc_url TEXT;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS has_guidelines_hub BOOLEAN DEFAULT false;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS short_description TEXT;
`;

async function run() {
  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    console.log(`Testing region pooler: ${host}...`);
    const client = new Client({
      host,
      port: 6543,
      user: "postgres",
      password,
      database: "postgres",
      options: `reference=${projectRef}`,
      connectionTimeoutMillis: 2000,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log(`🎉 SUCCESS CONNECTING TO ${host}! Executing DDL...`);
      await client.query(sql);
      console.log("SUCCESS! APPLIED 8 GUIDELINES COLUMNS TO PUBLIC.PROJECTS!");

      const res = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'projects' AND table_schema = 'public'
        ORDER BY ordinal_position;
      `);
      console.log("=== CONFIRMED LIVE COLUMNS ON PUBLIC.PROJECTS ===");
      console.table(res.rows);

      await client.end();
      return;
    } catch (err: any) {
      if (err.message.includes("ENOTFOUND") && err.message.includes("tenant/user")) {
        // wrong region
      } else {
        console.log(`Region ${region} result:`, err.message);
      }
      try { await client.end(); } catch {}
    }
  }
}

run();
