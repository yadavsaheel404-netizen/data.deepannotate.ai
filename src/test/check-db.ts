import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://gkkmmhjhsmrnhnlpgnrs.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdra21taGpoc21ybmhubHBnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDc0NzYsImV4cCI6MjEwMjc4MzQ3Nn0.UcB4PcOGa7iyBD0usaBQKn0Fp1PYLnLoHhTOHPvVqS0"
);

async function run() {
  try {
    const { data, error } = await supabase.from("profiles").select("id").limit(1);
    if (error) {
      console.log("DATABASE_CHECK_RESULT: ERROR", error.message);
    } else {
      console.log("DATABASE_CHECK_RESULT: SUCCESS", data);
    }
  } catch (err: any) {
    console.log("DATABASE_CHECK_RESULT: EXCEPTION", err.message);
  }
}

run();
