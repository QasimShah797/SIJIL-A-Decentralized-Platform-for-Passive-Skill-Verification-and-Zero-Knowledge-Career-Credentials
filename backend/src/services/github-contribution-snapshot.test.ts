import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createGitHubContributionSnapshot } from "./github-contribution-snapshot.service";

describe("GitHub contribution snapshot", () => {
  it("creates a snapshot using verified identity and unique commits", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/user") {
        return new Response(
          JSON.stringify({ id: 12345, login: "testlearner" }),
          { status: 200 },
        );
      }

      if (url.startsWith("https://api.github.com/repos/testlearner/demo/commits")) {
        return new Response(
          JSON.stringify([
            { sha: "abc123", author: { id: 12345 } },
            { sha: "def456", author: { id: 12345 } },
            { sha: "abc123", author: { id: 12345 } },
          ]),
          { status: 200 },
        );
      }

      throw new Error("Unexpected GitHub API request");
    };

    const mockConnection = async (userId: string) => {
      assert.equal(userId, "learner-123");

      return {
        data: {
          github_user_id: 12345,
          github_username: "testlearner",
          access_token: "mock-token",
        },
        error: null,
      };
    };

    const snapshot = await createGitHubContributionSnapshot(
      "learner-123",
      "testlearner/demo",
      mockFetch,
      mockConnection,
    );

    assert.match(
      snapshot.snapshotId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(snapshot.userId, "learner-123");
    assert.equal(snapshot.githubUserId, 12345);
    assert.equal(snapshot.githubUsername, "testlearner");
    assert.equal(snapshot.repositoryFullName, "testlearner/demo");
    assert.equal(snapshot.contributionCount, 2);
    assert.ok(!Number.isNaN(Date.parse(snapshot.verifiedAt)));
    assert.equal(requestedUrls.length, 2);
  });

  it("rejects a missing GitHub connection", async () => {
    let githubApiCalled = false;

    const mockFetch: typeof fetch = async () => {
      githubApiCalled = true;
      throw new Error("GitHub API must not be called");
    };

    const mockConnection = async () => ({
      data: null,
      error: null,
    });

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "testlearner/demo",
        mockFetch,
        mockConnection,
      ),
      /GitHub account is not connected/,
    );

    assert.equal(githubApiCalled, false);
  });

  it("rejects a malformed repository name before contacting GitHub", async () => {
    let connectionCalled = false;
    let githubApiCalled = false;

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "not-a-valid-repository",
        async () => {
          githubApiCalled = true;
          throw new Error("GitHub API must not be called");
        },
        async () => {
          connectionCalled = true;
          return { data: null, error: null };
        },
      ),
      /owner\/name/,
    );

    assert.equal(connectionCalled, false);
    assert.equal(githubApiCalled, false);
  });


  it("rejects an invalid stored GitHub user ID", async () => {
    let githubApiCalled = false;

    const mockFetch: typeof fetch = async () => {
      githubApiCalled = true;
      throw new Error("GitHub API must not be called");
    };

    for (const invalidId of ["0", "-1", "abc", "9007199254740993"]) {
      const mockConnection = async () => ({
        data: {
          github_user_id: invalidId,
          github_username: "testlearner",
          access_token: "mock-token",
        },
        error: null,
      });

      await assert.rejects(
        createGitHubContributionSnapshot(
          "learner-123",
          "testlearner/demo",
          mockFetch,
          mockConnection,
        ),
        /Invalid stored GitHub user ID/,
      );
    }

    assert.equal(githubApiCalled, false);
  });


  it("rejects a mismatched GitHub account ID", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/user") {
        return new Response(
          JSON.stringify({ id: 99999, login: "testlearner" }),
          { status: 200 },
        );
      }

      throw new Error("Commit API must not be called");
    };

    const mockConnection = async () => ({
      data: {
        github_user_id: 12345,
        github_username: "testlearner",
        access_token: "mock-token",
      },
      error: null,
    });

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "testlearner/demo",
        mockFetch,
        mockConnection,
      ),
      /GitHub account ID does not match/,
    );

    assert.deepEqual(requestedUrls, [
      "https://api.github.com/user",
    ]);
  });


  it("rejects a mismatched GitHub username", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/user") {
        return new Response(
          JSON.stringify({ id: 12345, login: "differentuser" }),
          { status: 200 },
        );
      }

      throw new Error("Commit API must not be called");
    };

    const mockConnection = async () => ({
      data: {
        github_user_id: 12345,
        github_username: "testlearner",
        access_token: "mock-token",
      },
      error: null,
    });

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "testlearner/demo",
        mockFetch,
        mockConnection,
      ),
      /GitHub.*(username|identity|match)/i,
    );

    assert.deepEqual(requestedUrls, [
      "https://api.github.com/user",
    ]);
  });


  it("rejects a GitHub API authentication failure", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      return new Response(
        JSON.stringify({ message: "Bad credentials" }),
        { status: 401 },
      );
    };

    const mockConnection = async () => ({
      data: {
        github_user_id: 12345,
        github_username: "testlearner",
        access_token: "expired-mock-token",
      },
      error: null,
    });

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "testlearner/demo",
        mockFetch,
        mockConnection,
      ),
    );

    assert.deepEqual(requestedUrls, [
      "https://api.github.com/user",
    ]);
  });


  it("rejects commits belonging to another GitHub user", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/user") {
        return new Response(
          JSON.stringify({ id: 12345, login: "testlearner" }),
          { status: 200 },
        );
      }

      if (url.startsWith("https://api.github.com/repos/testlearner/demo/commits")) {
        return new Response(
          JSON.stringify([
            { sha: "abc123", author: { id: 99999 } },
          ]),
          { status: 200 },
        );
      }

      throw new Error("Unexpected GitHub API request");
    };

    const mockConnection = async () => ({
      data: {
        github_user_id: 12345,
        github_username: "testlearner",
        access_token: "mock-token",
      },
      error: null,
    });

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "testlearner/demo",
        mockFetch,
        mockConnection,
      ),
    );

    assert.equal(requestedUrls.length, 2);
  });


  it("rejects a Supabase database failure", async () => {
    let githubApiCalled = false;

    const mockFetch: typeof fetch = async () => {
      githubApiCalled = true;
      throw new Error("GitHub API must not be called");
    };

    const mockConnection = async () => ({
      data: null,
      error: { message: "Database connection failed" },
    });

    await assert.rejects(
      createGitHubContributionSnapshot(
        "learner-123",
        "testlearner/demo",
        mockFetch,
        mockConnection,
      ),
      /Could not load GitHub connection/,
    );

    assert.equal(githubApiCalled, false);
  });


  it("rejects an empty GitHub access token", async () => {
    let githubApiCalled = false;

    const mockFetch: typeof fetch = async () => {
      githubApiCalled = true;
      throw new Error("GitHub API must not be called");
    };

    for (const invalidToken of ["", "   "]) {
      const mockConnection = async () => ({
        data: {
          github_user_id: 12345,
          github_username: "testlearner",
          access_token: invalidToken,
        },
        error: null,
      });

      await assert.rejects(
        createGitHubContributionSnapshot(
          "learner-123",
          "testlearner/demo",
          mockFetch,
          mockConnection,
        ),
        /Invalid GitHub connection/,
      );
    }

    assert.equal(githubApiCalled, false);
  });


  it("rejects a blank SIJIL user ID", async () => {
    let databaseCalled = false;
    let githubApiCalled = false;

    const mockFetch: typeof fetch = async () => {
      githubApiCalled = true;
      throw new Error("GitHub API must not be called");
    };

    const mockConnection = async () => {
      databaseCalled = true;
      throw new Error("Database must not be called");
    };

    for (const invalidUserId of ["", "   "]) {
      await assert.rejects(
        createGitHubContributionSnapshot(
          invalidUserId,
          "testlearner/demo",
          mockFetch,
          mockConnection,
        ),
        /SIJIL user ID is required/,
      );
    }

    assert.equal(databaseCalled, false);
    assert.equal(githubApiCalled, false);
  });

});
