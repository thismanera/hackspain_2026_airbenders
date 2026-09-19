export type Banda = "A" | "B" | "C" | "D";
export type Accion = "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
export type DecisionRow = {
  company: string;
  month: string;
  motor: "legacy";
  banda: Banda;
  precio: number | null;
  capacidadBase: number;
  capacidadAdv: number;
  limiteCap: number;
  limiteOp: number;
  /** Límite que tendría la empresa antes de aplicar las puertas de elegibilidad. */
  limiteTeorico: number;
  limiteRecomendado: number;
  limiteVigente: number;
  elegible: boolean;
  puertasFallidas: string[];
  accion: Accion;
  motivo: string;
};
