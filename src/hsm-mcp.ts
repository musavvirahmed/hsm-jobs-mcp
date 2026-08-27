export type HsmMcpAdapter = {
  revalidateKvks(kvks: string[]): Promise<{
    status: "ok" | "stale" | "error";
    present: string[];
  }>;
};

/** Injectable no-network stub. Pass `stale` or `error` to exercise hybrid-join degrade. */
export function createStubHsmMcp(status: "ok" | "stale" | "error" = "ok"): HsmMcpAdapter {
  return {
    async revalidateKvks(kvks) {
      return { status, present: status === "ok" ? [...kvks] : [] };
    },
  };
}
