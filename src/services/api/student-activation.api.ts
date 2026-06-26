import { apiRequest } from "@/services/api/client";

export type ActivationPreview = {
  fullName: string;
  universityEmail: string;
  registrationNumber: string;
  institutionName: string;
  department: string;
  program: string;
  batchSemester: string;
  expiresAt: string;
};

export async function previewStudentActivation(token: string): Promise<ActivationPreview> {
  const q = new URLSearchParams({ token });
  return apiRequest<ActivationPreview>(`/student-activation/preview?${q.toString()}`);
}

export async function activateStudentAccount(payload: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ universityEmail: string }> {
  return apiRequest<{ universityEmail: string }>("/student-activation/activate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
