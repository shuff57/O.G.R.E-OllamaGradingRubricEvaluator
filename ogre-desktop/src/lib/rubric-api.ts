/**
 * Rubric Library API client.
 * Calls the grading server's /api/rubrics endpoints using tauriFetch.
 */

;
import { getHandshakeToken } from "./provider-sync";

const SERVER_BASE = "http://localhost:3456";

export interface RubricCriterion {
  criteria: string;
  description: string;
  points: number;
  question?: number;
  category?: string;
  categoryWeight?: number;
  criterionWeight?: number;
}

export interface SavedRubric {
  id: string;
  name: string;
  description: string;
  criteria: RubricCriterion[];
  maxScore: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  weightMode?: 'off' | 'category' | 'criterion';
}

function authHeaders(): Record<string, string> {
  const token = getHandshakeToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function listRubrics(): Promise<SavedRubric[]> {
  const res = await fetch(`${SERVER_BASE}/api/rubrics`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to list rubrics: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.rubrics ?? [];
}

export async function createRubric(
  rubric: Omit<SavedRubric, "id" | "createdAt" | "updatedAt">
): Promise<SavedRubric> {
  const res = await fetch(`${SERVER_BASE}/api/rubrics`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(rubric),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to create rubric: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.rubric;
}

export async function updateRubric(
  id: string,
  updates: Partial<SavedRubric>
): Promise<SavedRubric> {
  const res = await fetch(`${SERVER_BASE}/api/rubrics/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to update rubric: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.rubric;
}

export async function deleteRubric(id: string): Promise<void> {
  const res = await fetch(`${SERVER_BASE}/api/rubrics/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to delete rubric: ${res.status} ${body}`);
  }
}
