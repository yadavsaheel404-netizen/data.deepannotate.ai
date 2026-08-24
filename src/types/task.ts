export type SubmissionStatus = 'in_review' | 'approved' | 'rejected';
export type SubmissionType = 'file' | 'link' | 'text';

// Conceptually a "Task" (contributor's work item) — kept named Submission
// in the codebase to preserve UI variable naming. DB table is now `tasks`.
export interface Submission {
  id: string;
  project_id: string;
  user_id: string;
  file_url: string | null;
  file_hash: string | null;
  text_content: string | null;
  external_url: string | null;
  submission_type: SubmissionType;
  status: SubmissionStatus;
  notes: string | null;
  selected_category_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type SubmissionInsert = Pick<Submission, 'project_id' | 'user_id' | 'file_url' | 'text_content'> & {
  file_hash?: string | null;
  external_url?: string | null;
  submission_type?: SubmissionType;
  selected_category_id?: string | null;
};
