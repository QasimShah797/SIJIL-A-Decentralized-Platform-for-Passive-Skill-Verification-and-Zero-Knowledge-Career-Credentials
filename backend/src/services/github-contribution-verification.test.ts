import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countUniqueGitHubCommits } from "./github-contribution-verification.service";

describe("GitHub contribution verification", () => {
  it("counts unique commits without counting duplicates", () => {
    const commits = [
      { sha: "abc123" },
      { sha: "def456" },
      { sha: "abc123" },
      { sha: "abc789" },
    ];

    assert.equal(countUniqueGitHubCommits(commits), 3);
  });

  it("returns zero when there are no commits", () => {
    assert.equal(countUniqueGitHubCommits([]), 0);
  });

  it("rejects commits without a valid SHA", () => {
    assert.throws(() =>
      countUniqueGitHubCommits([{ sha: "" }]),
    );
  });
});

describe("Authenticated GitHub identity", () => {
  it("accepts the connected GitHub account", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ id: 12345, login: "testlearner" }), {
        status: 200,
      });

    const { verifyGitHubIdentity } = await import(
      "./github-contribution-verification.service"
    );

    const identity = await verifyGitHubIdentity({
      accessToken: "test-token",
      expectedUsername: "testlearner",
      fetchImpl: mockFetch,
    });

    assert.equal(identity.id, 12345);
    assert.equal(identity.login, "testlearner");
  });

  it("rejects a different GitHub account", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ id: 99999, login: "anotheruser" }), {
        status: 200,
      });

    const { verifyGitHubIdentity } = await import(
      "./github-contribution-verification.service"
    );

    await assert.rejects(
      verifyGitHubIdentity({
        accessToken: "test-token",
        expectedUsername: "testlearner",
        fetchImpl: mockFetch,
      }),
    );
  });

  it("rejects GitHub API authentication failures", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401,
      });

    const { verifyGitHubIdentity } = await import(
      "./github-contribution-verification.service"
    );

    await assert.rejects(
      verifyGitHubIdentity({
        accessToken: "invalid-token",
        expectedUsername: "testlearner",
        fetchImpl: mockFetch,
      }),
    );
  });
});

describe("GitHub commit pagination", () => {
  it("fetches all pages and counts unique commits", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes("page=2")) {
        return new Response(
          JSON.stringify([{ sha: "abc123", author: { id: 12345 } }, { sha: "def456", author: { id: 12345 } }]),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify([{ sha: "abc123", author: { id: 12345 } }, { sha: "fed789", author: { id: 12345 } }]),
        {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/testlearner/demo/commits?author=testlearner&per_page=100&page=2>; rel="next"',
          },
        },
      );
    };

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    const commits = await fetchPaginatedGitHubCommits({
      accessToken: "test-token",
      repositoryFullName: "testlearner/demo",
      githubUsername: "testlearner",
      expectedGitHubUserId: 12345,
      fetchImpl: mockFetch,
    });

    assert.equal(countUniqueGitHubCommits(commits), 3);
    assert.equal(requestedUrls.length, 2);
  });
});

describe("GitHub pagination security", () => {
  it("rejects GitHub API failures", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ message: "API rate limit exceeded" }),
        { status: 403 },
      );

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    await assert.rejects(
      fetchPaginatedGitHubCommits({
        accessToken: "test-token",
        repositoryFullName: "testlearner/demo",
        githubUsername: "testlearner",
        expectedGitHubUserId: 12345,
        fetchImpl: mockFetch,
      }),
      /GitHub commits API failed: 403/,
    );
  });
});

describe("GitHub pagination URL protection", () => {
  it("rejects external pagination URLs without sending the token", async () => {
    const requestedUrls: string[] = [];

    const mockFetch: typeof fetch = async (input) => {
      requestedUrls.push(String(input));

      return new Response(
        JSON.stringify([{ sha: "abc123", author: { id: 12345 } }]),
        {
          status: 200,
          headers: {
            Link: '<https://evil.example/steal-token>; rel="next"',
          },
        },
      );
    };

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    await assert.rejects(
      fetchPaginatedGitHubCommits({
        accessToken: "test-token",
        repositoryFullName: "testlearner/demo",
        githubUsername: "testlearner",
        expectedGitHubUserId: 12345,
        fetchImpl: mockFetch,
      }),
      /Unsafe GitHub pagination URL/,
    );

    assert.equal(requestedUrls.length, 1);
    assert.equal(
      new URL(requestedUrls[0]).hostname,
      "api.github.com",
    );
  });
});

describe("GitHub malformed pagination header", () => {
  it("rejects a malformed next-page Link header", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { sha: "abc123", author: { id: 12345 } },
        ]),
        {
          status: 200,
          headers: {
            Link: '<https://api.github.com/repos/testlearner/demo/commits?page=2>; rel=next',
          },
        },
      );

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    await assert.rejects(
      fetchPaginatedGitHubCommits({
        accessToken: "test-token",
        repositoryFullName: "testlearner/demo",
        githubUsername: "testlearner",
        expectedGitHubUserId: 12345,
        fetchImpl: mockFetch,
      }),
      /Malformed GitHub pagination link/,
    );
  });
});

describe("GitHub API response validation", () => {
  it("rejects invalid commit response data", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ message: "Unexpected response" }),
        { status: 200 },
      );

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    await assert.rejects(
      fetchPaginatedGitHubCommits({
        accessToken: "test-token",
        repositoryFullName: "testlearner/demo",
        githubUsername: "testlearner",
        expectedGitHubUserId: 12345,
        fetchImpl: mockFetch,
      }),
      /Invalid GitHub commits API response/,
    );
  });
});

describe("GitHub commit authorship verification", () => {
  it("accepts commits linked to the authenticated GitHub account", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { sha: "abc123", author: { id: 12345, login: "testlearner" } },
          { sha: "def456", author: { id: 12345, login: "testlearner" } },
        ]),
        { status: 200 },
      );

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    const commits = await fetchPaginatedGitHubCommits({
      accessToken: "test-token",
      repositoryFullName: "testlearner/demo",
      githubUsername: "testlearner",
      expectedGitHubUserId: 12345,
      fetchImpl: mockFetch,
    });

    assert.equal(countUniqueGitHubCommits(commits), 2);
  });

  it("excludes commits authored by a different GitHub account", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { sha: "abc123", author: { id: 99999, login: "anotheruser" }, committer: { id: 12345 } },
        ]),
        { status: 200 },
      );

    const { fetchPaginatedGitHubCommits } = await import(
      "./github-contribution-verification.service"
    );

    const commits = await fetchPaginatedGitHubCommits({
      accessToken: "test-token",
      repositoryFullName: "testlearner/demo",
      githubUsername: "testlearner",
      expectedGitHubUserId: 12345,
      fetchImpl: mockFetch,
    });
    assert.equal(countUniqueGitHubCommits(commits), 0);
  });

  it("does not pass an at-least-100 request when the learner authored 80 of 300 commits", async () => {
    const rows = [
      ...Array.from({ length: 80 }, (_, index) => ({
        sha: `a${index.toString(16).padStart(6, "0")}`,
        author: { id: 12345, login: "learner-b" },
        committer: { id: 12345 },
      })),
      ...Array.from({ length: 220 }, (_, index) => ({
        sha: `b${index.toString(16).padStart(6, "0")}`,
        author: { id: 777, login: "learner-a" },
        committer: { id: 777 },
      })),
    ];
    const mockFetch: typeof fetch = async () => new Response(JSON.stringify(rows), { status: 200 });
    const { fetchPaginatedGitHubCommits } = await import("./github-contribution-verification.service");
    const commits = await fetchPaginatedGitHubCommits({
      accessToken: "test-token",
      repositoryFullName: "org/shared",
      githubUsername: "learner-b",
      expectedGitHubUserId: 12345,
      fetchImpl: mockFetch,
    });
    const count = countUniqueGitHubCommits(commits);
    assert.equal(rows.length, 300);
    assert.equal(count, 80);
    assert.equal(count >= 100, false);
  });

  it("counts 120 commits authored by the connected account and ignores the committer", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      sha: `c${index.toString(16).padStart(6, "0")}`,
      author: { id: 12345, login: "learner-a" },
      committer: { id: index % 2 === 0 ? 12345 : 888 },
    }));
    rows.push({ sha: "deadbeef", author: null as unknown as { id: number; login: string }, committer: { id: 12345 } });
    const mockFetch: typeof fetch = async () => new Response(JSON.stringify(rows), { status: 200 });
    const { fetchPaginatedGitHubCommits } = await import("./github-contribution-verification.service");
    const commits = await fetchPaginatedGitHubCommits({
      accessToken: "test-token",
      repositoryFullName: "org/shared",
      githubUsername: "learner-a",
      expectedGitHubUserId: 12345,
      fetchImpl: mockFetch,
    });
    assert.equal(countUniqueGitHubCommits(commits), 120);
    assert.equal(countUniqueGitHubCommits(commits) >= 100, true);
  });
});
