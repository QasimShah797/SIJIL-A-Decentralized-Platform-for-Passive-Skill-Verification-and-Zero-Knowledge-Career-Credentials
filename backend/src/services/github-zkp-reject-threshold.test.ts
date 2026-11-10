/**
 * Client-supplied thresholds are rejected; automated evaluate is required.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { AppError } from "../utils/AppError";
import {
  createGitHubDisclosure,
  createGitHubSnapshot,
  requestGitHubProof,
} from "../controllers/github-zkp.controller";

describe("reject client GitHub threshold", () => {
  it("returns 400 when body includes threshold", async () => {
    await assert.rejects(
      () => requestGitHubProof({
        user: { id: "123e4567-e89b-42d3-a456-426614174000" },
        body: {
          snapshotId: "223e4567-e89b-42d3-a456-426614174000",
          threshold: 10,
        },
      } as Request, {} as Response),
      (error: unknown) =>
        error instanceof AppError
        && error.statusCode === 400
        && /thresholds are not accepted/i.test(error.message),
    );
  });

  it("retires the manual snapshot, proof, and disclosure endpoints with 410", async () => {
    const req = {
      user: { id: "123e4567-e89b-42d3-a456-426614174000" },
      body: { snapshotId: "223e4567-e89b-42d3-a456-426614174000", proofId: "223e4567-e89b-42d3-a456-426614174000", repositoryFullName: "octo/demo" },
    } as Request;
    for (const handler of [requestGitHubProof, createGitHubSnapshot, createGitHubDisclosure]) {
      await assert.rejects(
        () => handler(req, {} as Response),
        (error: unknown) =>
          error instanceof AppError
          && error.statusCode === 410
          && /automatically/i.test(error.message),
      );
    }
  });
});
