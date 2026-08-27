export type HsmMcpAdapter = {
  revalidateKvks(kvks: string[]): Promise<{
    status: "ok" | "stale" | "error";
    present: string[];
  }>;
};

/** Injectable no-network stub. Production hybrid join lands in a later ticket. */
export function createStubHsmMcp(): HsmMcpAdapter {
  return {
    async revalidateKvks(kvks) {
      return { status: "ok", present: [...kvks] };
    },
  };
}
