import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CompareTable } from "@/components/grifo/peers/compare-table";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { monthScore } from "@/lib/features/portfolio/dataset";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

function companyFile(
  company: string,
  scoreSolo: number,
  scoreGrupo: number,
  ajusteHolding: number,
): CompanyFileResponse {
  const latest = monthScore(
    scoreRowFixture({
      company,
      groupId: "GROUP_0217",
      scoreSolo,
      scoreGrupo,
      ajusteHolding,
      D1: 0.1,
      D2: 64,
      D3: 1,
      D5: 0.2,
      cobertura: {
        ...scoreRowFixture().cobertura,
        nHermanasConDatos: 21,
      },
    }),
    null,
    null,
  );

  return {
    company: {
      id: company,
      groupId: "GROUP_0217",
      country: "ES",
      currency: "EUR",
      erp: "",
      groupSize: 22,
    },
    month: latest.month,
    months: [latest.month],
    latest,
    previous: null,
    history: [latest],
    peers: [],
  };
}

test("el comparador muestra el ajuste materializado del grupo", () => {
  const files = [
    companyFile("COMP_0512", 52, 71.4, 19.4),
    companyFile("COMP_0926", 95, 82.6, -12.4),
  ];

  const html = renderToStaticMarkup(createElement(CompareTable, { files }));

  assert.match(html, /\+19,4 pts/);
  assert.match(html, /-12,4 pts/);
  assert.doesNotMatch(html, /0,0 pts/);
});
