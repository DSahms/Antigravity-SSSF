/** Minimal shared work record: software attaches a repository; information jobs need not. */
export interface CrewCase {
  id: string;
  title: string;
  jobType: string;
  createdAt: string;
  repositoryPath?: string;
  inputs: { path: string; mediaType: string }[];
  outputs: { path: string; description: string }[];
}

export interface CrewJobDefinition {
  id: string;
  requiredRoles: string[];
  phases: { name: string; kind: "agent" | "code" | "human"; owner: string }[];
  acceptanceChecks: string[];
}
