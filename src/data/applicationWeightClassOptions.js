const weightClassOptionsByImageKey = {
  "register/common_1.png": [
    "스포츠모델 오픈",
    "스포츠모델 노비스",
    "커머셜모델 오픈",
    "커머셜모델 노비스",
  ],
  "register/common_2.png": [
    "여자 노비스",
    "여자 오픈",
    "남자 노비스",
    "남자 오픈",
  ],
  "register/woman_2.png": [
    "여자 클래식",
    "여자 오픈",
    "여자 노비스",
  ],
  "register/woman_1.png": [
    "여자 클래식",
    "여자 오픈",
    "여자 노비스",
  ],
  "register/man_1.png": [
    "남자 주니어 (단일체급, 만22세 이하)",
    "남자 클래식 (단일체급, 만40세 이상)",
    "남자 노비스 -65kg",
    "남자 노비스 -75kg",
    "남자 노비스 -85kg",
    "남자 노비스 +85kg",
    "남자 오픈 -65kg",
    "남자 오픈 -75kg",
    "남자 오픈 -85kg",
    "남자 오픈 +85kg",
  ],
  "register/man_2.png": [
    "남자 주니어 (단일체급, 만22세 이하)",
    "남자 노비스",
    "남자 오픈",
  ],
  "register/man_3.png": [
    "남자 주니어 (단일체급, 만22세 이하)",
    "남자 클래식 (단일체급, 만40세 이상)",
    "남자 노비스",
    "남자 오픈",
  ],
};

export function getWeightClassOptions(imageKey) {
  return weightClassOptionsByImageKey[imageKey] || [];
}
