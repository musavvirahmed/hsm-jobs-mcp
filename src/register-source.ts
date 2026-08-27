export type RegisterSponsor = {
  kvk: string;
  name: string;
};

export type RegisterSource = {
  load(): Promise<{ asOf: string | null; sponsors: RegisterSponsor[] }>;
};

export type HsmRegisterClient = {
  getRegisterStatus(): Promise<{ ind_last_updated: string | null }>;
  listSponsors(): Promise<RegisterSponsor[]>;
};

export function createFixtureRegister(
  sponsors: RegisterSponsor[],
  asOf: string | null,
): RegisterSource {
  return {
    async load() {
      return { asOf, sponsors: sponsors.map((row) => ({ kvk: padKvk(row.kvk), name: row.name })) };
    },
  };
}

/** Production register identity: wrap current hsm-mcp (or gated IND via that client). Not the GitHub mirror. */
export function createHsmMcpRegisterSource(client: HsmRegisterClient): RegisterSource {
  return {
    async load() {
      const [status, sponsors] = await Promise.all([client.getRegisterStatus(), client.listSponsors()]);
      return {
        asOf: status.ind_last_updated,
        sponsors: sponsors.map((row) => ({ kvk: padKvk(row.kvk), name: row.name })),
      };
    },
  };
}

function padKvk(kvk: string): string {
  return kvk.replace(/\D/g, "").padStart(8, "0");
}
