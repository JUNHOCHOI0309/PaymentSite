import stageServiceConfig from "../data/stageServiceConfig.json";

const disciplineGroups = stageServiceConfig.hairMakeupDisciplineGroups || {};
const maleDisciplines = new Set(disciplineGroups.male || []);
const femaleDisciplines = new Set(disciplineGroups.female || []);

export function getHairMakeupDisciplineGender(discipline) {
  if (maleDisciplines.has(discipline)) {
    return "male";
  }

  if (femaleDisciplines.has(discipline)) {
    return "female";
  }

  return "all";
}

export function isHairMakeupOptionAllowed(participantDiscipline, option) {
  const participantGender = getHairMakeupDisciplineGender(participantDiscipline);

  return participantGender === "all" || option?.gender === participantGender;
}

export function isHairMakeupAdditionalDisciplineAllowed(
  participantDiscipline,
  additionalDiscipline,
) {
  const participantGender = getHairMakeupDisciplineGender(participantDiscipline);
  const additionalGender = getHairMakeupDisciplineGender(additionalDiscipline);

  return (
    participantGender === "all" ||
    additionalGender === "all" ||
    participantGender === additionalGender
  );
}
