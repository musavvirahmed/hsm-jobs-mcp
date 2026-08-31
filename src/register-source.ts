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

export function createRegisterSubset(source: RegisterSource, kvks: Set<string>): RegisterSource {
  return {
    async load() {
      const full = await source.load();
      return {
        asOf: full.asOf,
        sponsors: full.sponsors.filter((sponsor) => kvks.has(sponsor.kvk)),
      };
    },
  };
}

/** In-memory subset of an already-loaded register — does not call the source again. */
export function createRegisterFromSponsors(
  sponsors: RegisterSponsor[],
  asOf: string | null,
  kvks?: Set<string>,
): RegisterSource {
  const filtered = kvks ? sponsors.filter((sponsor) => kvks.has(sponsor.kvk)) : sponsors;
  return createFixtureRegister(filtered, asOf);
}
