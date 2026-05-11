export function buildApplyDetailPath(selection) {
  const params = new URLSearchParams();

  if (selection?.division) {
    params.set("division", selection.division);
  }

  if (selection?.discipline) {
    params.set("discipline", selection.discipline);
  }

  if (selection?.imageKey) {
    params.set("imageKey", selection.imageKey);
  }

  const query = params.toString();
  return query ? `/apply/detail?${query}` : "/apply/detail";
}
