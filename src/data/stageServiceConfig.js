import config from "./stageServiceConfig.json";

export const stageServiceConfig = config;
export const stageServiceDisciplineOptions = config.disciplineOptions || [];
const stageVideoTypeOptions = config.services["stage-video"]?.videoTypes || [];
const stageVideoTypeMap = new Map(stageVideoTypeOptions.map((option) => [option.value, option]));
const stageVideoAdditionalDisciplineSeparator = "::";
const localizedServiceTitles = {
  "stage-photo": { ko: "무대 사진 촬영", en: "Stage Photo Shoot" },
  "stage-video": { ko: "무대 영상 촬영", en: "Stage Video Shoot" },
  "hair-makeup": { ko: "헤어&메이크업", en: "Hair & Makeup" },
};
const localizedDisciplineLabels = {
  보디빌딩: { ko: "보디빌딩", en: "Bodybuilding" },
  클래식: { ko: "클래식 피지크", en: "Classic Physique" },
  피지크: { ko: "피지크", en: "Physique" },
  "남성 모델": { ko: "남성 모델", en: "Men's Model" },
  "남성 피트니스": { ko: "남성 피트니스", en: "Men's Fitness" },
  "남성 데님": { ko: "남성 데님", en: "Men's Denim" },
  미즈비키니: { ko: "미즈비키니", en: "Ms.Bikini" },
  피규어: { ko: "피규어", en: "Figure" },
  "여성 모델": { ko: "여성 모델", en: "Women's Model" },
  "여성 피트니스": { ko: "여성 피트니스", en: "Women's Fitness" },
  "여성 데님": { ko: "여성 데님", en: "Women's Denim" },
};
const localizedHairOptionLabels = {
  MALE_HAIR_MAKEUP: { ko: "남자 헤어&메이크업", en: "Men's Hair & Makeup" },
  MALE_MAKEUP: { ko: "남자 메이크업", en: "Men's Makeup" },
  MALE_HAIR: { ko: "남자 헤어", en: "Men's Hair" },
  FEMALE_HAIR_MAKEUP: { ko: "여자 헤어&메이크업", en: "Women's Hair & Makeup" },
  FEMALE_MAKEUP: { ko: "여자 메이크업", en: "Women's Makeup" },
  FEMALE_HAIR: { ko: "여자 헤어", en: "Women's Hair" },
};
const localizedHairOptionalLabels = {
  BODY_MAKEUP: { ko: "바디메이크업", en: "Body Makeup" },
  MALE_RETOUCH: { ko: "남자 리터치", en: "Men's Retouch" },
  FEMALE_RETOUCH: { ko: "여자 리터치", en: "Women's Retouch" },
};

function resolveLocale(locale = "ko") {
  return locale === "en" ? "en" : "ko";
}

function getLocalizedText(localizedValue, locale, fallback = "") {
  if (!localizedValue) {
    return fallback;
  }

  const normalizedLocale = resolveLocale(locale);
  return localizedValue[normalizedLocale] || localizedValue.ko || fallback;
}

export const stageServiceItems = [
  { key: "stage-photo", title: config.services["stage-photo"].title },
  { key: "stage-video", title: config.services["stage-video"].title },
  { key: "hair-makeup", title: config.services["hair-makeup"].title },
];

export function getStageServiceByKey(serviceKey) {
  return config.services[serviceKey] || null;
}

export function getStageServiceDisciplineLabel(discipline, locale = "ko") {
  return getLocalizedText(
    localizedDisciplineLabels[discipline],
    locale,
    discipline || "",
  );
}

export function getStageServiceDisciplineOptions(locale = "ko") {
  return stageServiceDisciplineOptions.map((discipline) => ({
    value: discipline,
    label: getStageServiceDisciplineLabel(discipline, locale),
  }));
}

export function getStageServiceTitle(serviceKey, locale = "ko") {
  return getLocalizedText(
    localizedServiceTitles[serviceKey],
    locale,
    getStageServiceByKey(serviceKey)?.title || "",
  );
}

export function formatStageServiceAmount(value, locale = "ko") {
  return new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getVideoTypeOptions(locale = "ko") {
  return stageVideoTypeOptions.map((option) => ({
    ...option,
    label: getLocalizedText({ ko: option.label, en: option.label }, locale, option.label),
  }));
}

export function getHairOptionChoices(locale = "ko") {
  return (getStageServiceByKey("hair-makeup")?.hairOptions || []).map((option) => ({
    ...option,
    label: getLocalizedText(localizedHairOptionLabels[option.value], locale, option.label),
  }));
}

export function getHairOptionalChoices({ hairOptionValue, hasAdditionalDiscipline, locale = "ko" }) {
  const hairOptions = getHairOptionChoices(locale);
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
  }).map((option) => ({
    ...option,
    label: getLocalizedText(localizedHairOptionalLabels[option.value], locale, option.label),
  }));
}

export function buildStageVideoAdditionalDisciplineValue(videoTypeValue, discipline) {
  if (!videoTypeValue || !discipline) {
    return "";
  }

  return `${videoTypeValue}${stageVideoAdditionalDisciplineSeparator}${discipline}`;
}

export function getStageVideoAdditionalDisciplineMeta(value, fallbackVideoTypeValue = "", locale = "ko") {
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
      label: `${selectedVideoType.label}: ${getStageServiceDisciplineLabel(discipline, locale)} (${formatStageServiceAmount(
        selectedVideoType.price,
        locale,
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
      label: `${selectedVideoType.label}: ${getStageServiceDisciplineLabel(normalizedValue, locale)} (${formatStageServiceAmount(
        selectedVideoType.price,
        locale,
      )})`,
      isLegacy: true,
    };
  }

  return null;
}

export function getStageVideoAdditionalDisciplineChoices(locale = "ko") {
  return getVideoTypeOptions(locale).flatMap((videoType) =>
    stageServiceDisciplineOptions.map((discipline) => ({
      value: buildStageVideoAdditionalDisciplineValue(videoType.value, discipline),
      label: `${videoType.label}: ${getStageServiceDisciplineLabel(discipline, locale)} (${formatStageServiceAmount(videoType.price, locale)})`,
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
