/**
 * Loads the Poseidon helper without exposing it to browser clients.
 * Dynamic import stays intact when TypeScript emits CommonJS.
 */
import { pathToFileURL } from "node:url";
import { githubCommitmentModulePath } from "./github-zkp-artifacts";

export interface GitHubCommitmentResult {
  publicCommitment: {
    version: number;
    scheme: string;
    circuitId: string;
    commitment: string;
  };
  opening: {
    count: number;
    blinding: string;
    learnerId: string;
    snapshotId: string;
  };
}

export interface GitHubCommitmentModule {
  createGitHubCommitment(input: {
    count: number;
    learnerId: string;
    snapshotId: string;
    blinding?: string;
  }): Promise<GitHubCommitmentResult>;
  verifyGitHubOpening(input: {
    count: number;
    learnerId: string;
    snapshotId: string;
    blinding: string;
    commitment: string;
  }): Promise<boolean>;
}

export async function loadGitHubCommitmentModule(): Promise<GitHubCommitmentModule> {
  const moduleUrl = pathToFileURL(githubCommitmentModulePath()).href;
  const importModule = new Function(
    "url",
    "return import(url)",
  ) as (url: string) => Promise<GitHubCommitmentModule>;
  return importModule(moduleUrl);
}
