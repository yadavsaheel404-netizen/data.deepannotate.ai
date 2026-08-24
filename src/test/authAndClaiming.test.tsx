

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "../stores/authStore";
import { claimWorkItem, saveAnnotationsBatch } from "../services/taskService";

// Mock Supabase client
vi.mock("../integrations/supabase/client", () => {
  return {
    setSupabaseToken: vi.fn(),
    supabase: {
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
        setSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      rpc: vi.fn(),
    },
  };
});

// Mock Firebase SDK
vi.mock("firebase/auth", () => {
  return {
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({ user: { emailVerified: true } }),
    createUserWithEmailAndPassword: vi.fn().mockResolvedValue({
      user: {
        getIdToken: vi.fn().mockResolvedValue("mock-firebase-id-token"),
      },
    }),
    signInWithPopup: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue({}),
    onIdTokenChanged: vi.fn((auth, cb) => {
      // Simulate no initial user
      cb(null);
      return () => {};
    }),
    updateProfile: vi.fn().mockResolvedValue({}),
    sendEmailVerification: vi.fn().mockResolvedValue({}),
  };
});

vi.mock("../lib/firebase", () => {
  return {
    firebaseAuth: {},
    googleAuthProvider: {},
  };
});

describe("Auth and Claiming Integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with signed-out state on empty user", async () => {
    const store = useAuthStore.getState();
    await store.initialize();
    
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
    expect(useAuthStore.getState().role).toBeNull();
  });

  it("should call sign-in correctly", async () => {
    const store = useAuthStore.getState();
    await store.signInWithEmail("contributor@dataforge.com", "SecurePassword123!");
    // Store goes into loading state or resolves after Firebase signin triggers callback
    expect(useAuthStore.getState().loading).toBe(true);
  });

  it("should claim work item by calling RPC", async () => {
    const { supabase } = await import("../integrations/supabase/client");
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "mock-work-item-uuid", error: null });

    const claimedId = await claimWorkItem("mock-project-uuid");
    
    expect(supabase.rpc).toHaveBeenCalledWith("claim_work_item", {
      _project_id: "mock-project-uuid",
    });
    expect(claimedId).toBe("mock-work-item-uuid");
  });

  it("should save batch annotations by calling RPC", async () => {
    const { supabase } = await import("../integrations/supabase/client");
    const mockAnnotations = [
      {
        annotation_type: "bbox",
        frame_number: 30,
        start_ms: 1000,
        end_ms: 2000,
        data: { x: 0.1, y: 0.2, width: 0.3, height: 0.4, label: "Car" },
      },
    ];

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ success: true, current_version: 5, db_annotations: [] }],
      error: null,
    });

    const result = await saveAnnotationsBatch("mock-work-item-uuid", 4, mockAnnotations);

    expect(supabase.rpc).toHaveBeenCalledWith("save_annotations_batch", {
      _work_item_id: "mock-work-item-uuid",
      _client_version: 4,
      _annotations: mockAnnotations,
    });
    expect(result.success).toBe(true);
    expect(result.current_version).toBe(5);
  });

  it("should send email verification on signUp and immediately sign out", async () => {
    const store = useAuthStore.getState();
    const { sendEmailVerification, signOut } = await import("firebase/auth");
    
    await store.signUp("unverified@example.com", "Password123!", "Unverified User");
    
    expect(sendEmailVerification).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
