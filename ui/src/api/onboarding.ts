import type { Issue, Project } from "@rudderhq/shared";
import { api } from "./client";

export interface GettingStartedSeedResult {
  project: Project;
  issues: Issue[];
  createdProject: boolean;
  createdIssueCount: number;
}

export const onboardingApi = {
  seedGettingStarted: (orgId: string) =>
    api.post<GettingStartedSeedResult>(
      `/orgs/${orgId}/onboarding/getting-started`,
      {},
    ),
};
