import { afterEach, expect, test } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { FIXTURE_SNAPSHOT } from "../src/fixtures/jobs-index";
import { createStubHsmMcp } from "../src/hsm-mcp";
import { createJobsMcpServer } from "../src/mcp-server";
import type { JobsToolsDeps } from "../src/jobs-tools";
import { handleRequest } from "../src/http";
import { SHARED_RELEASE_ORIGIN } from "../src/packaging";
import { createMemoryJobsIndex } from "../src/jobs-index";
import type { Client } from "@modelcontextprotocol/client";
import {
  checkSharedReleaseHealth,
  connectSharedReleaseMcp,
  formatSharedReleaseFailures,
  indexScopeReadyForSharedRelease,
  MIN_PLAUSIBLE_REGISTER_SIZE,
  verifySharedRelease,
} from "../src/shared-release-verify";

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

function sharedReleaseReadyDeps(): JobsToolsDeps {
  return {
    jobsIndex: createMemoryJobsIndex({
      snapshot: {
        ...FIXTURE_SNAPSHOT,
        stale: false,
        index_scope: {
          pass: "full_careers_pass",
          sponsors_attempted: FIXTURE_SNAPSHOT.index_scope.register_size,
          sponsors_with_openings: FIXTURE_SNAPSHOT.index_scope.sponsors_with_openings,
          register_size: FIXTURE_SNAPSHOT.index_scope.register_size,
          register_as_of: FIXTURE_SNAPSHOT.index_scope.register_as_of,
          omissions_possible: false,
        },
      },
    }),
    hsmMcp: createStubHsmMcp(),
  };
}

function sharedReleasePartialDeps(): JobsToolsDeps {
  return {
    jobsIndex: createMemoryJobsIndex({
      snapshot: {
        ...FIXTURE_SNAPSHOT,
        stale: false,
      },
    }),
    hsmMcp: createStubHsmMcp(),
  };
}

async function connectVerifyHarness(deps: JobsToolsDeps): Promise<Connected> {
  const handler = createMcpHandler(() => createJobsMcpServer(deps));
  const fetchImpl = ((url, init) => handler.fetch(new Request(url, init))) as typeof fetch;
  const connected = await connectSharedReleaseMcp(SHARED_RELEASE_ORIGIN, fetchImpl);
  return {
    client: connected.client,
    close: async () => {
      await connected.close();
      await handler.close();
    },
  };
}

function routeRequest(deps: JobsToolsDeps): typeof fetch {
  return ((url, init) => handleRequest(new Request(url, init), deps)) as typeof fetch;
}

let connected: Connected | undefined;

afterEach(async () => {
  if (connected) {
    await connected.close();
    connected = undefined;
  }
});

test("verifySharedRelease passes when index scope is full careers pass on shared host", async () => {
  const deps = sharedReleaseReadyDeps();
  connected = await connectVerifyHarness(deps);
  const fetchImpl = routeRequest(deps);
  const result = await verifySharedRelease(connected.client, {
    origin: SHARED_RELEASE_ORIGIN,
    fetchImpl,
  });
  expect(result).toEqual({ ok: true });
});

test("verifySharedRelease fails when pass is partial and /mcp is blocked", async () => {
  const deps = sharedReleasePartialDeps();
  await expect(connectSharedReleaseMcp(SHARED_RELEASE_ORIGIN, routeRequest(deps))).rejects.toThrow(
    /503/,
  );
});

test("verifySharedRelease reports index scope failures on a partial pass when /mcp is open", async () => {
  const deps = sharedReleasePartialDeps();
  const handler = createMcpHandler(() => createJobsMcpServer(deps));
  connected = await connectSharedReleaseMcp("http://127.0.0.1:8787", (url, init) =>
    handler.fetch(new Request(url, init)),
  );
  const result = await verifySharedRelease(connected.client, {
    origin: "http://127.0.0.1:8787",
    fetchImpl: (url, init) => handleRequest(new Request(url, init), deps),
  });
  await connected.close();
  connected = undefined;
  await handler.close();
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.failures.map((failure) => failure.check)).toEqual([
    "get_index_status pass",
  ]);
});

test("verifySharedRelease rejects omissions_possible true on full careers pass scope", async () => {
  const deps = {
    jobsIndex: createMemoryJobsIndex({
      snapshot: {
        ...FIXTURE_SNAPSHOT,
        stale: false,
        index_scope: {
          pass: "full_careers_pass",
          sponsors_attempted: FIXTURE_SNAPSHOT.index_scope.register_size,
          sponsors_with_openings: FIXTURE_SNAPSHOT.index_scope.sponsors_with_openings,
          register_size: FIXTURE_SNAPSHOT.index_scope.register_size,
          register_as_of: FIXTURE_SNAPSHOT.index_scope.register_as_of,
          omissions_possible: true,
        },
      },
    }),
    hsmMcp: createStubHsmMcp(),
  };
  connected = await connectVerifyHarness(deps);
  const result = await verifySharedRelease(connected.client, {
    origin: SHARED_RELEASE_ORIGIN,
    fetchImpl: routeRequest(deps),
  });
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.failures).toContainEqual({
    check: "get_index_status omissions_possible",
    detail: "expected index_scope.omissions_possible false on a shared-release index",
  });
});

test("verifySharedRelease rejects implausible register_size", async () => {
  const deps = {
    jobsIndex: createMemoryJobsIndex({
      snapshot: {
        ...FIXTURE_SNAPSHOT,
        stale: false,
        index_scope: {
          pass: "full_careers_pass",
          sponsors_attempted: 1,
          sponsors_with_openings: 0,
          register_size: 1,
          register_as_of: "2026-08-03",
          omissions_possible: false,
        },
      },
    }),
    hsmMcp: createStubHsmMcp(),
  };
  connected = await connectVerifyHarness(deps);
  const result = await verifySharedRelease(connected.client, {
    origin: SHARED_RELEASE_ORIGIN,
    fetchImpl: routeRequest(deps),
  });
  expect(result.ok).toBe(false);
  if (result.ok) {
    return;
  }
  expect(result.failures).toContainEqual({
    check: "get_index_status register_size",
    detail: `expected index_scope.register_size >= ${MIN_PLAUSIBLE_REGISTER_SIZE} (plausible Work register), got 1`,
  });
});

test("checkSharedReleaseHealth accepts up and stale coarse status", async () => {
  const deps = sharedReleaseReadyDeps();
  const fetchImpl = routeRequest(deps);
  expect(await checkSharedReleaseHealth(SHARED_RELEASE_ORIGIN, fetchImpl)).toBeNull();
});

test("checkSharedReleaseHealth fails on degraded health", async () => {
  const fetchImpl = ((url) =>
    handleRequest(new Request(url), {
      jobsIndex: {
        snapshot: async () => {
          throw new Error("jobs index unavailable");
        },
        searchOpenings: async () => [],
        getOpening: async () => null,
      },
      hsmMcp: createStubHsmMcp(),
    })) as typeof fetch;
  const failure = await checkSharedReleaseHealth(SHARED_RELEASE_ORIGIN, fetchImpl);
  expect(failure).toEqual({
    check: "/health",
    detail: `expected HTTP 200 from ${SHARED_RELEASE_ORIGIN}/health, got 503`,
  });
});

test("indexScopeReadyForSharedRelease accepts full careers pass with plausible register_size", () => {
  expect(
    indexScopeReadyForSharedRelease({
      pass: "full_careers_pass",
      omissions_possible: false,
      register_size: FIXTURE_SNAPSHOT.index_scope.register_size,
    }),
  ).toBeNull();
});

test("formatSharedReleaseFailures prefixes checks for operators", () => {
  const message = formatSharedReleaseFailures([
    {
      check: "get_index_status pass",
      detail: 'expected index_scope.pass "full_careers_pass", got partial',
    },
  ]);
  expect(message).toContain("[shared-release:verify]");
  expect(message).toContain("full_careers_pass");
});
