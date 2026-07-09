import catalog from "./applicationDisciplineCatalog.json";

const disciplineDefinitions = Array.isArray(catalog.items) ? catalog.items : [];

function normalizeDisciplineAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const disciplineDefinitionByImageKey = new Map(
  disciplineDefinitions.map((definition) => [definition.imageKey, definition]),
);

const disciplineDefinitionByAlias = new Map();

disciplineDefinitions.forEach((definition) => {
  [definition.title, ...(definition.aliases || [])].forEach((alias) => {
    const normalizedAlias = normalizeDisciplineAlias(alias);

    if (normalizedAlias) {
      disciplineDefinitionByAlias.set(normalizedAlias, definition);
    }
  });
});

export function getApplicationDisciplineDefinition({
  imageKey = "",
  discipline = "",
} = {}) {
  if (imageKey && disciplineDefinitionByImageKey.has(imageKey)) {
    return disciplineDefinitionByImageKey.get(imageKey);
  }

  const normalizedAlias = normalizeDisciplineAlias(discipline);

  if (normalizedAlias && disciplineDefinitionByAlias.has(normalizedAlias)) {
    return disciplineDefinitionByAlias.get(normalizedAlias);
  }

  return null;
}

export function getApplicationDisciplineTitleByImageKey(imageKey) {
  return disciplineDefinitionByImageKey.get(imageKey)?.title || "";
}

export function getCanonicalApplicationDisciplineTitle({
  imageKey = "",
  discipline = "",
} = {}) {
  return getApplicationDisciplineDefinition({ imageKey, discipline })?.title || discipline || "";
}

export function normalizeApplicationSelection(selection = {}) {
  return {
    ...selection,
    discipline: getCanonicalApplicationDisciplineTitle({
      imageKey: selection.imageKey,
      discipline: selection.discipline,
    }),
  };
}
