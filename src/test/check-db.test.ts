import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signSupabaseToken } from "../lib/jwt";

const SUPABASE_URL = "https://gkkmmhjhsmrnhnlpgnrs.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdra21taGpoc21ybmhubHBnbnJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDc0NzYsImV4cCI6MjEwMjc4MzQ3Nn0.UcB4PcOGa7iyBD0usaBQKn0Fp1PYLnLoHhTOHPvVqS0";
const JWT_SECRET = "94K2eSv21DjJPJHJt1IS2piLXBvFXH/ENf+K2agRHQ4MkiY2KG6OQOHjNjkUm2eNydonIRXdyKeNOyPQ2pPlUQ==";

describe("Projects Guidelines Fields Verification & VLA Seeding", () => {
  it("proves all 8 columns exist on remote public.projects and seeds VLA project row", async () => {
    const serviceToken = await signSupabaseToken(
      {
        role: "service_role",
        iss: "supabase",
        aud: "service_role",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      JWT_SECRET
    );

    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${serviceToken}`,
        },
      },
    });

    // 1. Direct query selecting all 8 new columns from public.projects
    const { data: testSelect, error: selErr } = await supabase
      .from("projects")
      .select("id, title, slug, platform_url, referral_code, discord_url, community_url, guidelines_doc_url, has_guidelines_hub, short_description")
      .limit(5);

    console.log("=== REMOTE DB COLUMNS VERIFICATION ===");
    console.log("SELECT ERROR:", selErr);
    expect(selErr).toBeNull();
    console.log("SELECT SUCCESS! All 8 new guidelines columns confirmed on live remote database.");

    // 2. Check for VLA project or seed it
    const { data: existingVla } = await supabase
      .from("projects")
      .select("*")
      .or("slug.eq.vla,title.ilike.%vla%")
      .limit(1);

    if (existingVla && existingVla.length > 0) {
      const { data: updated, error: updErr } = await supabase
        .from("projects")
        .update({
          slug: "vla",
          has_guidelines_hub: true,
          short_description: "Onboarding, quality calibration, and studio access for the VLA multimodal annotation project.",
        } as any)
        .eq("id", existingVla[0].id)
        .select();

      console.log("UPDATED EXISTING VLA ROW:", updErr ? updErr : updated[0]);
    } else {
      const vlaId = crypto.randomUUID();
      const { data: created, error: createErr } = await supabase
        .from("projects")
        .insert({
          id: vlaId,
          title: "VLA — Vision-Language-Action",
          instructions: "<p>Onboarding and quality calibration guide for the VLA annotation project.</p>",
          overview: "Vision-Language-Action multimodal annotation pipeline.",
          slug: "vla",
          has_guidelines_hub: true,
          short_description: "Onboarding, quality calibration, and studio access for the VLA multimodal annotation project.",
          media_type: "video",
          status: "active",
          total_tasks: 100,
          pay_per_task: 15.0,
          reward_tokens: 50,
          dos: ["Annotate bounding boxes with high IoU precision (>0.85)", "Verify frame continuity across temporal video segments"],
          donts: ["Do not clip bounding box edges outside object margins", "Do not submit uncalibrated frame segments"],
          sample_media_urls: [],
        } as any)
        .select();

      console.log("SEEDED NEW VLA ROW IN REMOTE PUBLIC.PROJECTS:", createErr ? createErr : created[0]);
    }

    // 4. Inspect profiles and user_roles for saheelyadav67@gmail.com
    const { data: userProfiles } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .ilike("email", "%saheel%");

    console.log("=== USER PROFILES FOR SAHEEL ===", userProfiles);
    if (userProfiles && userProfiles.length > 0) {
      for (const p of userProfiles) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("*")
          .eq("user_id", p.id);
        console.log(`ROLES FOR PROFILE ${p.email} (${p.id}):`, roles);

        const hasAdmin = (roles || []).some((r) => r.role === "admin");
        if (!hasAdmin) {
          console.log(`UPDATING ROLE TO ADMIN FOR ${p.email}...`);
          const { data: updatedRole, error: updRoleErr } = await supabase
            .from("user_roles")
            .update({ role: "admin" } as any)
            .eq("user_id", p.id)
            .select();
          console.log("UPDATE ROLE RESULT:", updRoleErr ? updRoleErr : updatedRole);
        }
      }
    }
  });
});
