export type ScoringCompanyHistory = {
  runId: string;
  latest: ScoringCompanyPoint;
  history: ScoringCompanyPoint[];
};

export type ScoringCompanyPoint = {
  company: string;
  month: string;
  scoreSolo: number;
  scoreGrupo: number;
  ajusteHolding: number;
  evaluacionEwi: {
    revisionStage2Candidata: boolean;
    ewis: {
      ewi1ImpagoObligaciones: boolean;
      ewi2MorosidadComercial: boolean;
      ewi3TensionCobertura: boolean;
      ewi4DeficitPersistente: boolean;
    };
  };
  gapCicloDias: number | null;
  recomendacionEmbat: string | null;
  requiereAvalMatriz: boolean;
  alertaPignoracionCaja: boolean;
  cobertura: { hardcoreRevolving: boolean };
  forecast: {
    horizontes: {
      3: {
        scoreSoloPred: number;
        scoreGrupoPred: number;
        p10Solo: number;
        p90Solo: number;
        p10Grupo: number;
        p90Grupo: number;
        bandaSoloPred: string;
        bandaGrupoPred: string;
      };
      6: {
        scoreSoloPred: number;
        scoreGrupoPred: number;
        p10Solo: number;
        p90Solo: number;
        p10Grupo: number;
        p90Grupo: number;
        bandaSoloPred: string;
        bandaGrupoPred: string;
      };
    };
    metodoSolo: string;
    metodoGrupo: string;
    driversSolo: { id: string; deltaAportacion: number }[];
    driversGrupo: { id: string; deltaAportacion: number }[];
  } | null;
};

type RawScore = Omit<ScoringCompanyPoint, "forecast">;

export const scoringKeys = {
  company: (companyId: string) => ["scoring", "company", companyId] as const,
};

export async function fetchScoringCompany(
  companyId: string,
  baseUrl = "",
): Promise<ScoringCompanyHistory> {
  const response = await fetch(
    `${baseUrl}/api/scoring/companies/${encodeURIComponent(companyId)}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("No se ha podido cargar la previsión");
  const payload = (await response.json()) as {
    runId: string;
    latest: { scoreSolo: RawScore; forecast: ScoringCompanyPoint["forecast"] };
    history: { scoreSolo: RawScore; forecast: ScoringCompanyPoint["forecast"] }[];
  };
  const flatten = (item: {
    scoreSolo: RawScore;
    forecast: ScoringCompanyPoint["forecast"];
  }): ScoringCompanyPoint => ({
    ...item.scoreSolo,
    forecast: item.forecast,
  });
  return {
    runId: payload.runId,
    latest: flatten(payload.latest),
    history: payload.history.map(flatten),
  };
}
