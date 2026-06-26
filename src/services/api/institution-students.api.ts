import { apiRequest } from "@/services/api/client";

export type InstitutionStudent = {
  userId: string;
  fullName: string;
  universityEmail: string;
  registrationNumber: string;
  department: string;
  program: string;
  batchSemester: string;
  status: string;
  statusLabel: string;
  accountActivated: boolean;
  createdAt: string;
};

export type CreateInstitutionStudentPayload = {
  fullName: string;
  universityEmail: string;
  registrationNumber: string;
  department: string;
  program: string;
  batchSemester: string;
};

export type CreateInstitutionStudentResult = InstitutionStudent & {
  activationLink: string;
  activationExpiresAt: string;
};

export async function listInstitutionStudents(): Promise<InstitutionStudent[]> {
  return apiRequest<InstitutionStudent[]>("/institution/students");
}

export async function createInstitutionStudent(
  payload: CreateInstitutionStudentPayload,
): Promise<CreateInstitutionStudentResult> {
  return apiRequest<CreateInstitutionStudentResult>("/institution/students", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
