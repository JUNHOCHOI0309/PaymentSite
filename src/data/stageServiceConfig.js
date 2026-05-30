import config from "./stageServiceConfig.json";

export const stageServiceConfig = config;
export const stageServiceDisciplineOptions = config.disciplineOptions || [];
const stageVideoTypeOptions = config.services["stage-video"]?.videoTypes || [];
const stageVideoTypeMap = new Map(stageVideoTypeOptions.map((option) => [option.value, option]));
const stageVideoAdditionalDisciplineSeparator = "::";
export const stageServiceItems = [
  { key: "stage-photo", title: config.services["stage-photo"].title },
  { key: "stage-video", title: config.services["stage-video"].title },
  { key: "hair-makeup", title: config.services["hair-makeup"].title },
];

export function getStageServiceByKey(serviceKey) {
  return config.services[serviceKey] || null;
}

export function getStageServiceDisciplineOptions() {
  return stageServiceDisciplineOptions;
}

export function getStageServiceTitle(serviceKey) {
  return getStageServiceByKey(serviceKey)?.title || "";
}

export function formatStageServiceAmount(value, locale = "ko") {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getVideoTypeOptions() {
  return stageVideoTypeOptions;
}

export function getHairOptionChoices() {
  return getStageServiceByKey("hair-makeup")?.hairOptions || [];
}

export function getHairOptionalChoices({ hairOptionValue, hasAdditionalDiscipline }) {
  const hairOptions = getHairOptionChoices();
  const selectedHairOption = hairOptions.find((option) => option.value === hairOptionValue);
  const selectedGender = selectedHairOption?.gender || "all";
  const optionalOptions = getStageServiceByKey("hair-makeup")?.optionalOptions || [];

  return optionalOptions.filter((option) => {
    if (option.requiresAdditionalDiscipline && !hasAdditionalDiscipline) {
      return false;
    }

    if (option.gender === "all") {
      return true;
    }

    return option.gender === selectedGender;
  });
}

export function buildStageVideoAdditionalDisciplineValue(videoTypeValue, discipline) {
  if (!videoTypeValue || !discipline) {
    return "";
  }

  return `${videoTypeValue}${stageVideoAdditionalDisciplineSeparator}${discipline}`;
}

export function getStageVideoAdditionalDisciplineMeta(value, fallbackVideoTypeValue = "") {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    return null;
  }

  const separatorIndex = normalizedValue.indexOf(stageVideoAdditionalDisciplineSeparator);

  if (separatorIndex > 0) {
    const typeValue = normalizedValue.slice(0, separatorIndex);
    const discipline = normalizedValue.slice(
      separatorIndex + stageVideoAdditionalDisciplineSeparator.length,
    );
    const selectedVideoType = stageVideoTypeMap.get(typeValue);

    if (!selectedVideoType || !stageServiceDisciplineOptions.includes(discipline)) {
      return null;
    }

    return {
      value: normalizedValue,
      typeValue,
      typeLabel: selectedVideoType.label,
      discipline,
      price: Number(selectedVideoType.price || 0),
      label: `${selectedVideoType.label}: ${discipline} (${formatStageServiceAmount(
        selectedVideoType.price,
        "ko",
      )})`,
    };
  }

  // Legacy fallback: older drafts stored only the discipline and used the main video type price.
  if (stageServiceDisciplineOptions.includes(normalizedValue) && stageVideoTypeMap.has(fallbackVideoTypeValue)) {
    const selectedVideoType = stageVideoTypeMap.get(fallbackVideoTypeValue);

    return {
      value: normalizedValue,
      typeValue: selectedVideoType.value,
      typeLabel: selectedVideoType.label,
      discipline: normalizedValue,
      price: Number(selectedVideoType.price || 0),
      label: `${selectedVideoType.label}: ${normalizedValue} (${formatStageServiceAmount(
        selectedVideoType.price,
        "ko",
      )})`,
      isLegacy: true,
    };
  }

  return null;
}

export function getStageVideoAdditionalDisciplineChoices() {
  return getVideoTypeOptions().flatMap((videoType) =>
    stageServiceDisciplineOptions.map((discipline) => ({
      value: buildStageVideoAdditionalDisciplineValue(videoType.value, discipline),
      label: `${videoType.label}: ${discipline} (${formatStageServiceAmount(videoType.price, "ko")})`,
      price: Number(videoType.price || 0),
      typeValue: videoType.value,
      discipline,
    })),
  );
}

export function calculateStageServiceTotalAmount({
  serviceKey,
  photoHasAdditionalDiscipline = "X",
  videoType = "",
  videoAdditionalDiscipline = "",
  hairOption = "",
  hairOptionalOption = "",
}) {
  if (serviceKey === "stage-photo") {
    const basePrice = getStageServiceByKey("stage-photo")?.basePrice || 0;
    const additionalDisciplinePrice =
      getStageServiceByKey("stage-photo")?.additionalDisciplinePrice || 0;

    return basePrice + (photoHasAdditionalDiscipline === "O" ? additionalDisciplinePrice : 0);
  }

  if (serviceKey === "stage-video") {
    const selectedVideoType = getVideoTypeOptions().find((option) => option.value === videoType);
    const selectedAdditionalVideoOption = getStageVideoAdditionalDisciplineMeta(
      videoAdditionalDiscipline,
      videoType,
    );
    const basePrice = selectedVideoType?.price || 0;
    return basePrice + (selectedAdditionalVideoOption?.price || 0);
  }

  if (serviceKey === "hair-makeup") {
    const selectedHairOption = getHairOptionChoices().find((option) => option.value === hairOption);
    const selectedOptionalOption = (getStageServiceByKey("hair-makeup")?.optionalOptions || []).find(
      (option) => option.value === hairOptionalOption,
    );

    return (selectedHairOption?.price || 0) + (selectedOptionalOption?.price || 0);
  }

  return 0;
}
