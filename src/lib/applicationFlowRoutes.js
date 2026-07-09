import { normalizeApplicationSelection } from "../data/applicationDisciplines";

export function buildApplyDetailPath(selection) {
  const normalizedSelection = normalizeApplicationSelection(selection);
  const params = new URLSearchParams();

  if (normalizedSelection?.division) {
    params.set("division", normalizedSelection.division);
  }

  if (normalizedSelection?.discipline) {
    params.set("discipline", normalizedSelection.discipline);
  }

  if (normalizedSelection?.imageKey) {
    params.set("imageKey", normalizedSelection.imageKey);
  }

  const query = params.toString();
  return query ? `/apply/detail?${query}` : "/apply/detail";
}
