import { z } from "zod";

export const buildFeatureArgsSchema = {
  goal: z.string().min(1),
  target: z.string().optional(),
};

export const chooseComponentsArgsSchema = {
  interface: z.string().min(1),
};

export const diagnoseProjectArgsSchema = {
  symptom: z.string().min(1),
};
