import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import pptxgen from "pptxgenjs";
import { parse } from "csv-parse/sync";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "tmp", "scoring-slides");
const groupId = process.env.SCORING_SLIDES_GROUP ?? "GROUP_0088";

const C = {
  navy: "10233F",
  navy2: "183554",
  ink: "182433",
  muted: "637083",
  paper: "F6F8FB",
  white: "FFFFFF",
  teal: "12A594",
  tealLight: "DDF4EF",
  blue: "3478C5",
  blueLight: "E6F0FA",
  amber: "E6A23C",
  amberLight: "FFF0D7",
  coral: "E45D5D",
  coralLight: "FBE4E4",
  line: "DCE3EC",
};

const indicatorNames = {
  margin: "Margen de caja",
  deficit: "Meses con déficit",
  debtCover: "Cobertura de deuda",
  interest: "Carga de intereses",
  receivableDelay: "Plazo de cobro",
  overdue: "Facturas vencidas",
  payableDelay: "Plazo de pago",
  revenueTrend: "Tendencia de ingresos",
  marginTrend: "Tendencia del margen",
  concentration: "Concentración",
  volatility: "Volatilidad",
  creditUse: "Uso de crédito",
};

async function findFiles(directory, filename) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await findFiles(full, filename)));
    else if (entry.name === filename) found.push(full);
  }
  return found;
}

async function latestScoringFile() {
  const base = path.join(root, "tmp", "scoring-v02", "runs");
  const candidates = await findFiles(base, "scores.jsonl");
  const complete = [];
  for (const candidate of candidates) {
    const directory = path.dirname(candidate);
    try {
      await stat(path.join(directory, "manifest.json"));
      await stat(path.join(directory, "backtest.json"));
      complete.push({ candidate, modified: (await stat(candidate)).mtimeMs });
    } catch {
      // Only use fully materialized runs.
    }
  }
  complete.sort((a, b) => b.modified - a.modified);
  if (!complete[0])
    throw new Error("No completed scoring artifact found. Run pnpm db:setup first.");
  return complete[0].candidate;
}

function rawBand(score) {
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

function countBy(rows, selector) {
  const counts = {};
  for (const row of rows) {
    const key = selector(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pct(value, total) {
  return `${((100 * value) / total).toFixed(1).replace(".", ",")}%`;
}

function decimal(value, digits = 1) {
  return value.toFixed(digits).replace(".", ",");
}

function euro(value) {
  return `${Math.round(value).toLocaleString("es-ES")} €`;
}

async function loadData() {
  const companies = parse(await readFile(path.join(root, "dataset", "companies.csv"), "utf8"), {
    columns: true,
    skip_empty_lines: true,
  });
  const companyToGroup = new Map(
    companies.map((company) => [company.company_id, company.group_id || company.company_id]),
  );
  const members = companies
    .filter((company) => (company.group_id || company.company_id) === groupId)
    .map((company) => company.company_id)
    .sort();
  if (members.length === 0) throw new Error(`Group ${groupId} does not exist.`);

  const scoresFile = await latestScoringFile();
  const latest = new Map();
  const histories = new Map(members.map((company) => [company, []]));
  for await (const line of createInterface({
    input: createReadStream(scoresFile),
    crlfDelay: Infinity,
  })) {
    if (!line) continue;
    const row = JSON.parse(line);
    latest.set(row.company, row);
    histories.get(row.company)?.push(row);
  }

  const directory = path.dirname(scoresFile);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const backtest = JSON.parse(await readFile(path.join(directory, "backtest.json"), "utf8"));
  return {
    rows: [...latest.values()],
    histories,
    members,
    companyToGroup,
    manifest,
    backtest,
  };
}

function aggregateHistory(histories, members) {
  const first = histories.get(members[0]);
  return first.map((row, index) => {
    const monthRows = members.map((member) => histories.get(member)[index]);
    const confidence = monthRows.reduce((sum, item) => sum + item.confidence, 0);
    return {
      month: row.month,
      score:
        confidence === 0
          ? 50
          : monthRows.reduce((sum, item) => sum + item.score * item.confidence, 0) / confidence,
    };
  });
}

function createSummary(data) {
  const scores = data.rows.map((row) => row.score);
  const rawBands = countBy(data.rows, (row) => rawBand(row.score));
  const assignedBands = countBy(data.rows, (row) => row.band);
  const actions = countBy(data.rows, (row) => row.action);
  const directions = countBy(data.rows, (row) => row.direction);
  const alerts = {};
  for (const row of data.rows)
    for (const alert of row.alerts) alerts[alert.type] = (alerts[alert.type] ?? 0) + 1;
  const groupCounts = countBy([...data.companyToGroup.values()], (group) => group);
  const aggregate = aggregateHistory(data.histories, data.members);
  const group = data.members.map((company) => {
    const history = data.histories.get(company);
    const latest = history.at(-1);
    const observed = history.filter((row) => row.confidence > 0);
    const first = observed[0] ?? history[0];
    return {
      company,
      latest,
      first,
      min: Math.min(...observed.map((row) => row.score)),
      max: Math.max(...observed.map((row) => row.score)),
    };
  });
  return {
    cutoff: data.rows[0].month,
    runId: data.manifest.runId,
    companies: data.rows.length,
    groups: Object.keys(groupCounts).length,
    multiCompanyGroups: Object.values(groupCounts).filter((count) => count > 1).length,
    score: {
      mean: mean(scores),
      median: median(scores),
      min: Math.min(...scores),
      max: Math.max(...scores),
    },
    confidence: { mean: mean(data.rows.map((row) => row.confidence)) },
    rawBands,
    assignedBands,
    actions,
    directions,
    alerts,
    groupId,
    group,
    aggregate,
    backtest: data.backtest,
  };
}

function addHeader(slide, title, kicker) {
  slide.background = { color: C.paper };
  slide.addText(kicker.toUpperCase(), {
    x: 0.7,
    y: 0.35,
    w: 11.9,
    h: 0.22,
    fontFace: "Aptos",
    fontSize: 9,
    bold: true,
    color: C.teal,
    charSpacing: 1.6,
    margin: 0,
  });
  slide.addText(title, {
    x: 0.7,
    y: 0.63,
    w: 11.9,
    h: 0.55,
    fontFace: "Aptos Display",
    fontSize: 27,
    bold: true,
    color: C.navy,
    margin: 0,
  });
  slide.addShape("line", { x: 0.7, y: 1.3, w: 11.9, h: 0, line: { color: C.line } });
}

function addFooter(slide, number, source = "Fuente: scoring v0.2 · corte agosto 2026") {
  slide.addText(source, {
    x: 0.7,
    y: 7.16,
    w: 10.8,
    h: 0.18,
    fontFace: "Aptos",
    fontSize: 8,
    color: C.muted,
    margin: 0,
  });
  slide.addText(String(number).padStart(2, "0"), {
    x: 11.9,
    y: 7.12,
    w: 0.7,
    h: 0.22,
    align: "right",
    fontFace: "Aptos",
    fontSize: 9,
    bold: true,
    color: C.navy,
    margin: 0,
  });
}

function addCard(slide, { x, y, w, h, value, label, detail, color = C.navy }) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color: C.white },
    line: { color: C.line },
  });
  slide.addShape("rect", { x, y, w: 0.08, h, fill: { color }, line: { color } });
  slide.addText(value, {
    x: x + 0.28,
    y: y + 0.2,
    w: w - 0.45,
    h: 0.46,
    fontFace: "Aptos Display",
    fontSize: 26,
    bold: true,
    color,
    margin: 0,
  });
  slide.addText(label, {
    x: x + 0.28,
    y: y + 0.72,
    w: w - 0.45,
    h: 0.3,
    fontFace: "Aptos",
    fontSize: 11,
    bold: true,
    color: C.ink,
    margin: 0,
  });
  if (detail)
    slide.addText(detail, {
      x: x + 0.28,
      y: y + 1.05,
      w: w - 0.45,
      h: h - 1.2,
      fontFace: "Aptos",
      fontSize: 9,
      color: C.muted,
      breakLine: false,
      margin: 0,
      valign: "top",
    });
}

function addCallout(slide, text, { x, y, w, h, color = C.teal, fill = C.tealLight }) {
  slide.addShape("roundRect", { x, y, w, h, fill: { color: fill }, line: { color: fill } });
  slide.addText(text, {
    x: x + 0.22,
    y: y + 0.16,
    w: w - 0.44,
    h: h - 0.32,
    fontFace: "Aptos",
    fontSize: 12,
    bold: true,
    color,
    valign: "mid",
    margin: 0,
  });
}

function addBulletList(slide, items, { x, y, w, h, fontSize = 16, color = C.ink }) {
  slide.addText(
    items.map((item) => ({
      text: item,
      options: { bullet: { indent: 14 }, hanging: 4, breakLine: true },
    })),
    {
      x,
      y,
      w,
      h,
      fontFace: "Aptos",
      fontSize,
      color,
      breakLine: false,
      paraSpaceAfterPt: 12,
      valign: "top",
      margin: 0.03,
    },
  );
}

function baseChartOptions() {
  return {
    showTitle: false,
    showLegend: false,
    showValue: true,
    showCatName: false,
    showPercent: false,
    showBorder: false,
    chartColors: [C.teal, C.blue, C.amber, C.coral],
    catAxisLabelFontFace: "Aptos",
    catAxisLabelFontSize: 10,
    valAxisLabelFontFace: "Aptos",
    valAxisLabelFontSize: 9,
    valGridLine: { color: C.line, width: 1 },
  };
}

function buildDeck(summary) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Airbenders";
  pptx.subject = "Análisis de resultados del motor de scoring v0.2";
  pptx.title = "Scoring v0.2 — resultados y evolución";
  pptx.company = "Airbenders";
  pptx.lang = "es-ES";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "es-ES",
  };

  let slide = pptx.addSlide();
  slide.background = { color: C.navy };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: C.teal },
    line: { color: C.teal },
  });
  slide.addText("SCORING v0.2", {
    x: 0.85,
    y: 0.75,
    w: 4,
    h: 0.28,
    fontFace: "Aptos",
    fontSize: 12,
    bold: true,
    color: "65D7C7",
    charSpacing: 2,
    margin: 0,
  });
  slide.addText("Resultados, evolución\ny señales de riesgo", {
    x: 0.85,
    y: 1.38,
    w: 7.5,
    h: 1.65,
    fontFace: "Aptos Display",
    fontSize: 36,
    bold: true,
    color: C.white,
    breakLine: false,
    margin: 0,
  });
  slide.addText(`Cartera completa y caso ${summary.groupId}`, {
    x: 0.88,
    y: 3.35,
    w: 6.7,
    h: 0.4,
    fontFace: "Aptos",
    fontSize: 18,
    color: "C9D5E5",
    margin: 0,
  });
  slide.addShape("roundRect", {
    x: 8.8,
    y: 1.35,
    w: 3.45,
    h: 3.75,
    fill: { color: C.navy2 },
    line: { color: "315372" },
  });
  slide.addText(decimal(summary.score.median), {
    x: 9.25,
    y: 1.9,
    w: 2.55,
    h: 0.8,
    fontSize: 44,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  slide.addText("mediana de score", {
    x: 9.25,
    y: 2.8,
    w: 2.55,
    h: 0.3,
    fontSize: 12,
    color: "C9D5E5",
    align: "center",
    margin: 0,
  });
  slide.addShape("line", { x: 9.4, y: 3.35, w: 2.25, h: 0, line: { color: "476482" } });
  slide.addText(`${summary.companies.toLocaleString("es-ES")} empresas`, {
    x: 9.25,
    y: 3.7,
    w: 2.55,
    h: 0.35,
    fontSize: 18,
    bold: true,
    color: "65D7C7",
    align: "center",
    margin: 0,
  });
  slide.addText("Corte: agosto de 2026", {
    x: 0.88,
    y: 6.75,
    w: 5,
    h: 0.25,
    fontSize: 10,
    color: "93A8BE",
    margin: 0,
  });

  slide = pptx.addSlide();
  addHeader(slide, "Qué mide hoy el motor", "Alcance");
  addCard(slide, {
    x: 0.7,
    y: 1.7,
    w: 3.75,
    h: 2.1,
    value: "1",
    label: "score oficial por empresa",
    detail:
      "Una observación mensual por company_id. Combina 12 indicadores, score 0–100 y confianza 0–1.",
    color: C.teal,
  });
  addCard(slide, {
    x: 4.78,
    y: 1.7,
    w: 3.75,
    h: 2.1,
    value: "0",
    label: "scores oficiales por holding",
    detail:
      "group_id participa en el split de calibración, pero el motor no agrega compañías ni emite un score consolidado.",
    color: C.coral,
  });
  addCard(slide, {
    x: 8.86,
    y: 1.7,
    w: 3.75,
    h: 2.1,
    value: "12",
    label: "indicadores ponderados",
    detail:
      "Caja, deuda, facturas, tendencia, concentración, volatilidad y dependencia de crédito.",
    color: C.blue,
  });
  addCallout(
    slide,
    "La vista de holding de estas slides es un promedio ponderado por confianza para análisis. No es una salida oficial ni debe usarse para decidir límites.",
    { x: 0.7, y: 4.35, w: 11.9, h: 1.05, color: C.coral, fill: C.coralLight },
  );
  addBulletList(
    slide,
    [
      "Bandas: A ≥75 · B 60–74,9 · C 45–59,9 · D <45.",
      "La confianza atenúa indicadores con poca historia o cobertura.",
      "El histórico de facturas está marcado como estimado.",
    ],
    { x: 0.9, y: 5.75, w: 11.3, h: 1.1, fontSize: 13 },
  );
  addFooter(slide, 2);

  slide = pptx.addSlide();
  addHeader(slide, "La cartera se concentra alrededor de 50–60 puntos", "Foto general");
  addCard(slide, {
    x: 0.7,
    y: 1.65,
    w: 2.75,
    h: 1.7,
    value: summary.companies.toLocaleString("es-ES"),
    label: "empresas",
    detail: `${summary.groups} grupos; ${summary.multiCompanyGroups} con más de una empresa`,
    color: C.navy,
  });
  addCard(slide, {
    x: 3.7,
    y: 1.65,
    w: 2.75,
    h: 1.7,
    value: decimal(summary.score.mean),
    label: "score medio",
    detail: `Mediana ${decimal(summary.score.median)}`,
    color: C.teal,
  });
  addCard(slide, {
    x: 6.7,
    y: 1.65,
    w: 2.75,
    h: 1.7,
    value: decimal(summary.confidence.mean * 100) + "%",
    label: "confianza media",
    detail: "La mitad de la cartera queda aproximadamente por encima de 0,55",
    color: C.blue,
  });
  addCard(slide, {
    x: 9.7,
    y: 1.65,
    w: 2.9,
    h: 1.7,
    value: "0",
    label: "empresas en A",
    detail: `Máximo observado: ${decimal(summary.score.max)}`,
    color: C.amber,
  });
  const histogramLabels = ["20–29", "30–39", "40–49", "50–59", "60–69", "70–79"];
  const ranges = [
    [20, 30],
    [30, 40],
    [40, 50],
    [50, 60],
    [60, 70],
    [70, 80],
  ];
  const latestScores = summary._rows.map((row) => row.score);
  const values = ranges.map(
    ([lo, hi]) => latestScores.filter((score) => score >= lo && score < hi).length,
  );
  slide.addChart(pptx.ChartType.bar, [{ name: "Empresas", labels: histogramLabels, values }], {
    ...baseChartOptions(),
    x: 0.85,
    y: 3.85,
    w: 7.45,
    h: 2.65,
    chartColors: [C.blue],
    showValue: true,
    dataLabelPosition: "outEnd",
    valAxisMinVal: 0,
    valAxisMaxVal: 800,
    valAxisMajorUnit: 200,
  });
  addCallout(
    slide,
    `${values[3].toLocaleString("es-ES")} empresas están entre 50 y 59 puntos. La distribución tiene poco poder de separación en la parte alta y ninguna empresa alcanza A.`,
    { x: 8.65, y: 4.0, w: 3.65, h: 1.85, color: C.navy, fill: C.blueLight },
  );
  slide.addText(`Rango total: ${decimal(summary.score.min)}–${decimal(summary.score.max)}`, {
    x: 8.85,
    y: 6.1,
    w: 3.2,
    h: 0.3,
    fontSize: 11,
    bold: true,
    color: C.muted,
    align: "center",
    margin: 0,
  });
  addFooter(slide, 3);

  slide = pptx.addSlide();
  addHeader(slide, "Distribución por franja de puntuación", "Bandas");
  const bandRows = [
    ["A", "≥ 75", summary.rawBands.A ?? 0, C.teal],
    ["B", "60–74,9", summary.rawBands.B ?? 0, C.blue],
    ["C", "45–59,9", summary.rawBands.C ?? 0, C.amber],
    ["D", "< 45", summary.rawBands.D ?? 0, C.coral],
  ];
  slide.addChart(
    pptx.ChartType.doughnut,
    [
      {
        name: "Empresas",
        labels: bandRows.map((row) => row[0]),
        values: bandRows.map((row) => row[2]),
      },
    ],
    {
      x: 0.7,
      y: 1.6,
      w: 5.2,
      h: 4.8,
      holeSize: 62,
      showLegend: true,
      legendPos: "b",
      showPercent: true,
      showValue: false,
      chartColors: bandRows.map((row) => row[3]),
      dataLabelPosition: "bestFit",
      dataLabelColor: C.ink,
      showTitle: false,
      showBorder: false,
    },
  );
  const table = [
    ["Franja", "Umbral", "Empresas", "% cartera"],
    ...bandRows.map((row) => [
      row[0],
      row[1],
      row[2].toLocaleString("es-ES"),
      pct(row[2], summary.companies),
    ]),
  ];
  slide.addTable(table, {
    x: 6.15,
    y: 1.8,
    w: 6.0,
    h: 2.6,
    border: { color: C.line, pt: 1 },
    fill: C.white,
    color: C.ink,
    fontFace: "Aptos",
    fontSize: 12,
    margin: 0.1,
    rowH: 0.5,
    bold: false,
    autoFit: false,
  });
  slide.addShape("rect", {
    x: 6.15,
    y: 1.8,
    w: 6,
    h: 0.5,
    fill: { color: C.navy },
    line: { color: C.navy },
  });
  slide.addText("Franja", {
    x: 6.25,
    y: 1.94,
    w: 1,
    h: 0.2,
    color: C.white,
    bold: true,
    fontSize: 11,
    margin: 0,
  });
  slide.addText("Umbral", {
    x: 7.75,
    y: 1.94,
    w: 1,
    h: 0.2,
    color: C.white,
    bold: true,
    fontSize: 11,
    margin: 0,
  });
  slide.addText("Empresas", {
    x: 9.25,
    y: 1.94,
    w: 1,
    h: 0.2,
    color: C.white,
    bold: true,
    fontSize: 11,
    margin: 0,
  });
  slide.addText("% cartera", {
    x: 10.75,
    y: 1.94,
    w: 1.1,
    h: 0.2,
    color: C.white,
    bold: true,
    fontSize: 11,
    margin: 0,
  });
  addCallout(
    slide,
    "El motor rebaja 17 empresas por deterioro estructural: 3 pasan de B a C y 14 de C a D. Por eso la banda asignada termina en B 299 · C 859 · D 128.",
    { x: 6.15, y: 4.85, w: 6.0, h: 1.15, color: C.coral, fill: C.coralLight },
  );
  addFooter(slide, 4, "Fuente: score numérico y banda final del motor · corte agosto 2026");

  slide = pptx.addSlide();
  addHeader(
    slide,
    "Las decisiones son más severas que la distribución de score",
    "Acciones y señales",
  );
  const actionOrder = ["mantener", "cerrar", "reducir", "ampliar", "abrir"];
  slide.addChart(
    pptx.ChartType.bar,
    [
      {
        name: "Empresas",
        labels: actionOrder,
        values: actionOrder.map((key) => summary.actions[key] ?? 0),
      },
    ],
    {
      ...baseChartOptions(),
      x: 0.7,
      y: 1.7,
      w: 6.1,
      h: 3.35,
      chartColors: [C.coral],
      showValue: true,
      dataLabelPosition: "outEnd",
      valAxisMaxVal: 800,
      valAxisMajorUnit: 200,
    },
  );
  addCard(slide, {
    x: 7.25,
    y: 1.75,
    w: 2.5,
    h: 1.6,
    value: (summary.actions.cerrar ?? 0).toLocaleString("es-ES"),
    label: "cierres",
    detail: `${pct(summary.actions.cerrar ?? 0, summary.companies)} de la cartera`,
    color: C.coral,
  });
  addCard(slide, {
    x: 10.0,
    y: 1.75,
    w: 2.5,
    h: 1.6,
    value: (summary.alerts.datos_insuficientes ?? 0).toLocaleString("es-ES"),
    label: "datos insuficientes",
    detail: "Alerta activa en el último mes",
    color: C.amber,
  });
  addCard(slide, {
    x: 7.25,
    y: 3.65,
    w: 2.5,
    h: 1.6,
    value: (summary.directions.deterioro ?? 0).toLocaleString("es-ES"),
    label: "en deterioro",
    detail: `${summary.directions.mejora ?? 0} en mejora`,
    color: C.coral,
  });
  addCard(slide, {
    x: 10.0,
    y: 3.65,
    w: 2.5,
    h: 1.6,
    value: (summary.alerts.vencido_alto ?? 0).toLocaleString("es-ES"),
    label: "vencido alto",
    detail: "Señal con impacto de cierre",
    color: C.blue,
  });
  addCallout(
    slide,
    "Un score medio no implica una decisión media: las reglas duras y la confianza tienen prioridad sobre la franja numérica.",
    { x: 0.9, y: 5.65, w: 11.4, h: 0.85, color: C.navy, fill: C.blueLight },
  );
  addFooter(slide, 5);

  slide = pptx.addSlide();
  addHeader(slide, "El backtest exige cautela antes de usarlo para crédito", "Validación");
  addCard(slide, {
    x: 0.7,
    y: 1.7,
    w: 2.8,
    h: 1.7,
    value: decimal(summary.backtest.forwardMarginSpearman, 2),
    label: "Spearman a 3 meses",
    detail: `${summary.backtest.forwardMarginPairs.toLocaleString("es-ES")} pares; relación positiva, pero débil`,
    color: C.blue,
  });
  addCard(slide, {
    x: 3.75,
    y: 1.7,
    w: 2.8,
    h: 1.7,
    value: "0%",
    label: "recall de deterioro",
    detail: `0 de ${summary.backtest.deterioro.events} eventos anticipados`,
    color: C.coral,
  });
  addCard(slide, {
    x: 6.8,
    y: 1.7,
    w: 2.8,
    h: 1.7,
    value: pct(summary.backtest.recuperacion.matched, summary.backtest.recuperacion.events),
    label: "recall de recuperación",
    detail: `${summary.backtest.recuperacion.matched} de ${summary.backtest.recuperacion.events} eventos`,
    color: C.amber,
  });
  addCard(slide, {
    x: 9.85,
    y: 1.7,
    w: 2.75,
    h: 1.7,
    value: "90–100%",
    label: "falsas alarmas",
    detail: "100% deterioro · 90,5% recuperación",
    color: C.coral,
  });
  addBulletList(
    slide,
    [
      "Las alertas actuales no anticipan los eventos de deterioro definidos por el propio protocolo.",
      "La correlación de 0,16 aporta señal, pero no basta para validar precios, límites o cierres automáticos.",
      "Los indicadores de facturas requieren especial revisión porque el histórico de estados se reconstruye desde una foto final.",
    ],
    { x: 0.95, y: 4.0, w: 11.2, h: 1.65, fontSize: 16 },
  );
  addCallout(
    slide,
    "Lectura recomendada: herramienta de priorización y diagnóstico con revisión humana; todavía no motor autónomo de decisión.",
    { x: 0.9, y: 6.0, w: 11.4, h: 0.75, color: C.coral, fill: C.coralLight },
  );
  addFooter(
    slide,
    6,
    `Fuente: backtest de validación · ${summary.backtest.validationCompanies} empresas`,
  );

  slide = pptx.addSlide();
  addHeader(
    slide,
    `${summary.groupId}: cinco trayectorias, tres perfiles de riesgo`,
    "Caso de grupo",
  );
  const groupTable = [
    ["Empresa", "Score", "Conf.", "Banda", "Dirección", "Acción", "Δ desde inicio"],
  ];
  for (const item of summary.group)
    groupTable.push([
      item.company,
      decimal(item.latest.score),
      decimal(item.latest.confidence * 100) + "%",
      item.latest.band,
      item.latest.direction,
      item.latest.action,
      `${item.latest.score - item.first.score >= 0 ? "+" : ""}${decimal(item.latest.score - item.first.score)}`,
    ]);
  slide.addTable(groupTable, {
    x: 0.7,
    y: 1.65,
    w: 11.9,
    h: 3.15,
    border: { color: C.line, pt: 1 },
    fill: C.white,
    color: C.ink,
    fontFace: "Aptos",
    fontSize: 11,
    margin: 0.08,
    rowH: 0.48,
    autoFit: false,
    bold: false,
  });
  slide.addShape("rect", {
    x: 0.7,
    y: 1.65,
    w: 11.9,
    h: 0.48,
    fill: { color: C.navy },
    line: { color: C.navy },
  });
  ["Empresa", "Score", "Conf.", "Banda", "Dirección", "Acción", "Δ desde inicio"].forEach(
    (text, index) =>
      slide.addText(text, {
        x: 0.82 + index * 1.69,
        y: 1.79,
        w: index === 0 ? 1.35 : 1.45,
        h: 0.18,
        color: C.white,
        bold: true,
        fontSize: 10,
        margin: 0,
      }),
  );
  addCallout(
    slide,
    "La dispersión intragrupo es material: 44,9 puntos entre la mejor y la peor compañía. Un único promedio de holding ocultaría esa concentración de riesgo.",
    { x: 0.7, y: 5.2, w: 5.8, h: 1.05, color: C.navy, fill: C.blueLight },
  );
  addCallout(
    slide,
    "COMP_0338 cae a D y deterioro; COMP_0915 se mantiene en B. Ambas pertenecen al mismo grupo, pero necesitan decisiones distintas.",
    { x: 6.8, y: 5.2, w: 5.8, h: 1.05, color: C.coral, fill: C.coralLight },
  );
  addFooter(slide, 7);

  slide = pptx.addSlide();
  addHeader(slide, `${summary.groupId}: el agregado vuelve al punto de partida`, "Evolución");
  const activeAggregate = summary.aggregate.filter((item) => item.month >= "2025-01");
  const labels = activeAggregate.map((item) => item.month.slice(2));
  const series = summary.group.map((item) => ({
    name: item.company,
    labels,
    values: dataSlice(summary._histories.get(item.company), "2025-01").map((row) => row.score),
  }));
  series.push({
    name: "Agregado analítico",
    labels,
    values: activeAggregate.map((item) => item.score),
  });
  slide.addChart(pptx.ChartType.line, series, {
    x: 0.7,
    y: 1.55,
    w: 11.9,
    h: 4.55,
    showTitle: false,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 9,
    chartColors: ["5B8FF9", "5AD8A6", "E8684A", "F6BD16", "9270CA", C.navy],
    lineSize: 2,
    showValue: false,
    catAxisLabelFontSize: 8,
    valAxisLabelFontSize: 9,
    valAxisMinVal: 15,
    valAxisMaxVal: 80,
    valAxisMajorUnit: 10,
    valGridLine: { color: C.line, width: 1 },
    showBorder: false,
  });
  const peak = activeAggregate.reduce((best, item) => (item.score > best.score ? item : best));
  const last = activeAggregate.at(-1);
  addCallout(
    slide,
    `El agregado ilustrativo alcanza ${decimal(peak.score)} en ${peak.month}, pero termina en ${decimal(last.score)}: −${decimal(peak.score - last.score)} puntos desde el máximo.`,
    { x: 0.9, y: 6.35, w: 11.4, h: 0.62, color: C.navy, fill: C.blueLight },
  );
  addFooter(slide, 8, "Agregado analítico = media ponderada por confianza; no es un score oficial");

  const focus =
    summary.group.find((item) => item.company === "COMP_0338") ??
    summary.group.reduce((worst, item) => (item.latest.score < worst.latest.score ? item : worst));
  slide = pptx.addSlide();
  addHeader(slide, `${focus.company}: una caída sostenida hasta 21,6`, "Profundización");
  addCard(slide, {
    x: 0.7,
    y: 1.65,
    w: 2.55,
    h: 1.7,
    value: decimal(focus.first.score),
    label: `inicio · ${focus.first.month}`,
    detail: "Primera observación con confianza",
    color: C.navy,
  });
  addCard(slide, {
    x: 3.5,
    y: 1.65,
    w: 2.55,
    h: 1.7,
    value: decimal(focus.max),
    label: "máximo histórico",
    detail: "Julio de 2025",
    color: C.teal,
  });
  addCard(slide, {
    x: 6.3,
    y: 1.65,
    w: 2.55,
    h: 1.7,
    value: decimal(focus.latest.score),
    label: "agosto de 2026",
    detail: `Banda ${focus.latest.band} · confianza ${decimal(focus.latest.confidence * 100)}%`,
    color: C.coral,
  });
  addCard(slide, {
    x: 9.1,
    y: 1.65,
    w: 3.5,
    h: 1.7,
    value: "−" + decimal(focus.max - focus.latest.score),
    label: "puntos desde el máximo",
    detail: "Dirección: deterioro · naturaleza: temporal",
    color: C.coral,
  });
  const weakest = [...focus.latest.contributions]
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 4);
  slide.addText("Indicadores que más penalizan", {
    x: 0.75,
    y: 3.85,
    w: 4.4,
    h: 0.35,
    fontSize: 18,
    bold: true,
    color: C.navy,
    margin: 0,
  });
  const weakTable = [
    ["Indicador", "Aportación", "Valor bruto"],
    ...weakest.map((item) => [
      indicatorNames[item.indicator] ?? item.indicator,
      decimal(item.contribution, 2),
      item.raw === null ? "n/d" : decimal(item.raw, 2),
    ]),
  ];
  slide.addTable(weakTable, {
    x: 0.75,
    y: 4.35,
    w: 5.35,
    h: 1.9,
    border: { color: C.line, pt: 1 },
    fill: C.white,
    color: C.ink,
    fontFace: "Aptos",
    fontSize: 11,
    margin: 0.08,
    rowH: 0.38,
  });
  slide.addText("Señales activas", {
    x: 6.65,
    y: 3.85,
    w: 3.3,
    h: 0.35,
    fontSize: 18,
    bold: true,
    color: C.navy,
    margin: 0,
  });
  addBulletList(
    slide,
    focus.latest.alerts.map((alert) => alert.type.replaceAll("_", " ")),
    { x: 6.75, y: 4.35, w: 5.1, h: 1.35, fontSize: 15 },
  );
  addCallout(
    slide,
    "La etiqueta «temporal» merece revisión: el score encadena doce meses de caída frente a agosto de 2025. La clasificación depende de la alineación de indicadores, no solo de la duración visual.",
    { x: 6.55, y: 5.65, w: 5.7, h: 0.8, color: C.coral, fill: C.coralLight },
  );
  addFooter(slide, 9);

  slide = pptx.addSlide();
  addHeader(slide, "El cierre domina incluso cuando existe capacidad calculada", "Caso de grupo");
  const limitTable = [
    ["Empresa", "Score", "Límite recomendado", "Límite aplicado", "Acción", "Alerta clave"],
  ];
  for (const item of summary.group)
    limitTable.push([
      item.company,
      decimal(item.latest.score),
      euro(item.latest.recommendedLimit),
      euro(item.latest.appliedLimit),
      item.latest.action,
      item.latest.alerts.map((alert) => alert.type).join(", "),
    ]);
  slide.addTable(limitTable, {
    x: 0.7,
    y: 1.65,
    w: 11.9,
    h: 3.35,
    border: { color: C.line, pt: 1 },
    fill: C.white,
    color: C.ink,
    fontFace: "Aptos",
    fontSize: 10,
    margin: 0.07,
    rowH: 0.5,
    autoFit: false,
  });
  slide.addShape("rect", {
    x: 0.7,
    y: 1.65,
    w: 11.9,
    h: 0.5,
    fill: { color: C.navy },
    line: { color: C.navy },
  });
  addCallout(
    slide,
    `${summary.group.find((item) => item.company === "COMP_0915")?.company ?? "COMP_0915"} calcula ${euro(summary.group.find((item) => item.company === "COMP_0915")?.latest.recommendedLimit ?? 0)} de límite, pero aplica 0 € por cierre. La regla dura tiene precedencia sobre capacidad y banda.`,
    { x: 0.85, y: 5.35, w: 5.6, h: 1.1, color: C.coral, fill: C.coralLight },
  );
  addCallout(
    slide,
    "Que las cinco empresas del grupo cierren por vencidos sugiere una señal común real o un efecto sistemático de la reconstrucción estimada de facturas. Debe validarse contra un ledger histórico.",
    { x: 6.8, y: 5.35, w: 5.55, h: 1.1, color: C.navy, fill: C.blueLight },
  );
  addFooter(slide, 10);

  slide = pptx.addSlide();
  addHeader(slide, "Qué haría antes de crear un score de holding", "Siguiente iteración");
  const steps = [
    [
      "01",
      "Validar facturas",
      "Contrastar vencidos y pagos con un ledger histórico por fecha de corte.",
    ],
    [
      "02",
      "Recalibrar alertas",
      "Corregir recall 0% y falsas alarmas antes de automatizar cierres.",
    ],
    [
      "03",
      "Modelar el grupo",
      "Eliminar transferencias intragrupo y consolidar caja, deuda y límites.",
    ],
    [
      "04",
      "Definir contagio",
      "Medir concentración del riesgo y garantías cruzadas entre sociedades.",
    ],
    [
      "05",
      "Emitir dos outputs",
      "Company score y holding score, cada uno con confianza y contribuciones propias.",
    ],
  ];
  steps.forEach(([number, title, detail], index) => {
    const y = 1.55 + index * 1.0;
    slide.addShape("ellipse", {
      x: 0.85,
      y,
      w: 0.62,
      h: 0.62,
      fill: { color: index < 2 ? C.coral : C.teal },
      line: { color: index < 2 ? C.coral : C.teal },
    });
    slide.addText(number, {
      x: 0.85,
      y: y + 0.19,
      w: 0.62,
      h: 0.2,
      color: C.white,
      bold: true,
      fontSize: 10,
      align: "center",
      margin: 0,
    });
    slide.addText(title, {
      x: 1.75,
      y: y + 0.02,
      w: 3.0,
      h: 0.3,
      fontSize: 17,
      bold: true,
      color: C.navy,
      margin: 0,
    });
    slide.addText(detail, {
      x: 4.6,
      y: y + 0.02,
      w: 7.4,
      h: 0.48,
      fontSize: 13,
      color: C.muted,
      margin: 0,
    });
    if (index < steps.length - 1)
      slide.addShape("line", {
        x: 1.16,
        y: y + 0.63,
        w: 0,
        h: 0.38,
        line: { color: C.line, width: 2 },
      });
  });
  addCallout(
    slide,
    "Hoy: un score por compañía. El score de holding debe construirse sobre magnitudes consolidadas; promediar scores individuales ocultaría empresas como COMP_0338.",
    { x: 0.8, y: 6.65, w: 11.6, h: 0.55, color: C.navy, fill: C.blueLight },
  );
  addFooter(slide, 11);

  slide = pptx.addSlide();
  slide.background = { color: C.navy };
  slide.addText("Tres conclusiones", {
    x: 0.85,
    y: 0.75,
    w: 6,
    h: 0.6,
    fontSize: 31,
    bold: true,
    color: C.white,
    margin: 0,
  });
  const conclusions = [
    [
      "1",
      "Concentración media",
      "El 67,7% está en C y ninguna empresa alcanza A; el modelo separa poco la cola superior.",
    ],
    [
      "2",
      "Señales severas",
      "438 cierres y alertas con baja precisión obligan a mantener revisión humana.",
    ],
    [
      "3",
      "Riesgo intragrupo",
      `${summary.groupId} combina 66,5 y 21,6 puntos; un promedio único no cuenta toda la historia.`,
    ],
  ];
  conclusions.forEach(([number, title, detail], index) => {
    const y = 1.75 + index * 1.5;
    slide.addText(number, {
      x: 0.95,
      y,
      w: 0.6,
      h: 0.65,
      fontSize: 34,
      bold: true,
      color: "65D7C7",
      margin: 0,
    });
    slide.addText(title, {
      x: 1.75,
      y: y + 0.02,
      w: 3.0,
      h: 0.35,
      fontSize: 19,
      bold: true,
      color: C.white,
      margin: 0,
    });
    slide.addText(detail, {
      x: 4.55,
      y: y + 0.02,
      w: 7.5,
      h: 0.7,
      fontSize: 15,
      color: "C9D5E5",
      margin: 0,
    });
  });
  slide.addShape("line", { x: 0.9, y: 6.35, w: 11.4, h: 0, line: { color: "315372" } });
  slide.addText("Decisión recomendada", {
    x: 0.9,
    y: 6.65,
    w: 2.2,
    h: 0.25,
    fontSize: 11,
    bold: true,
    color: "65D7C7",
    margin: 0,
  });
  slide.addText(
    "Validar y recalibrar antes de automatizar; diseñar después el modelo consolidado de holding.",
    { x: 3.15, y: 6.55, w: 8.9, h: 0.5, fontSize: 17, bold: true, color: C.white, margin: 0 },
  );

  return pptx;
}

function dataSlice(rows, firstMonth) {
  return rows.filter((row) => row.month >= firstMonth);
}

async function main() {
  const data = await loadData();
  const summary = createSummary(data);
  summary.cutoff = data.rows[0].month;
  summary._rows = data.rows;
  summary._histories = data.histories;
  const serializable = { ...summary };
  delete serializable._rows;
  delete serializable._histories;

  await mkdir(outputDir, { recursive: true });
  const deckPath = path.join(outputDir, "scoring-results-v02.pptx");
  const summaryPath = path.join(outputDir, "scoring-results-v02-summary.json");
  await writeFile(summaryPath, JSON.stringify(serializable, null, 2));
  await buildDeck(summary).writeFile({ fileName: deckPath });
  console.log(
    JSON.stringify({ deckPath, summaryPath, group: groupId, companies: summary.companies }),
  );
}

await main();
