import { createD1JobsIndex, type JobsIndexDatabase } from "./d1-jobs-index";
import { createStubHsmMcp } from "./hsm-mcp";
import { handleRequest } from "./http";

export type Env = {
  JOBS_INDEX: JobsIndexDatabase;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      jobsIndex: createD1JobsIndex(env.JOBS_INDEX),
      hsmMcp: createStubHsmMcp(),
    });
  },
};
