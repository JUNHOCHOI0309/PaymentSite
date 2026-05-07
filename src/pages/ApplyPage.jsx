import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../components/common/Button";
import { Checkbox } from "../components/common/Checkbox";
import { Input } from "../components/common/Input";
import { NoticeBox } from "../components/common/NoticeBox";
import { PageShell } from "../components/layout/PageShell";
import { useApplicationFlow } from "../context/ApplicationFlowContext";
import { buildApiUrl, createDraft, updateDraft, uploadFile } from "../lib/applicationApi";

function getRegisterImageUrl(key) {
  return buildApiUrl(`/api/home/gallery-image?key=${encodeURIComponent(key)}`);
}

const defaultAdditionalInfo = {
  title: "추가 안내",
  sections: [
    {
      title: "안내",
      body: "선택한 종목의 추가 설명문이 들어갈 영역입니다.",
    },
  ],
};

const additionalInfoByImageKey = {
  "register/man_1.png": {
    title: "머슬마니아 보디빌딩 (MUSCLEMANIA BODYBUILDING)",
    sections: [
      {
        title: "종목 소개",
        body:
          "미국에서 1991년 최초의 월드클래스 수준의 보디빌딩 투어로 시작되었습니다.\n\n현재 머슬마니아는 미국에서 가장 인기있는 보디빌딩 대회입니다.",
      },
      {
        title: "보디빌딩 출전자격",
        body: "대회일 기준 만 16세 이상의 남성",
      },
      {
        title: "보디빌딩 출전체급",
        body:
          "남자 주니어 (단일체급, 만22세 이하)\n\n남자 클래식 (단일체급, 만40세 이상)\n\n남자 노비스 -65kg -75kg -85kg +85kg\n\n남자 오픈 -65kg -75kg -85kg +85kg\n\n주니어 클래식 오픈 2라운드, 노비스 1라운드\n\n주니어 클래식 오픈 1라운드 2라운드 동시진행",
      },
      {
        title: "심사항목",
        body:
          "▷1라운드 규정포즈심사\n\n1.대칭미 2.포즈 및 표현력 3.근육크기 4.컨디션 및 데피니션\n\n▷2라운드 자유포즈심사\n\n포즈 및 표현력 10점\n\n- 총합 100점 : 1라운드90+2라운드10점\n\n보디빌딩 노비스는 규정포즈심사만 진행됩니다.(90점 만점)\n\n자유포즈 심사시, 출전선수가 선수가 MP3음원을 제출하지 않거나,\n\n파일에 이상이 있는경우 대체음악이 재생됩니다.",
      },
      {
        title: "보디빌딩 무대진행순서",
        body:
          "▷ 1라운드 (노비스 & 오픈O)\n\n단체선수라인업 입장▶쿼터턴심사▶규정포즈심사▶퇴장\n\n- 보디빌딩 노비스는 1라운드만 진행하며, 자유포즈심사 없음.\n\n▷ 2라운드 (노비스X 오픈O)\n\n개인선수입장▶보디빌딩 오픈 자유포즈 심사 (60초)▶개인선수퇴장\n\n- 보디빌딩 오픈 1라운드, 2라운드 동시진행",
      },
      {
        title: "보디빌딩 규정포즈",
        body:
          "1. 프론트 더블 바이셉스 2. 프론트 랫스프레드 3. 사이드 체스트\n\n4. 리어 더블바이셉스 5. 리어 랫스프레드 6. 트라이셉스\n\n7. 업도미널 앤 타이 8. 모스트머스큘라",
      },
      {
        title: "보디빌딩 복장규정",
        body:
          "규정복장 : 대회용 보디빌딩 트렁크\n\n액세서리 및 신발 착용 금지\n\n의상 규정에 어긋나는 복장 착용시 감점\n\n컬러크림 또는 과도한 오일 사용시 감점",
        tone: "danger",
      },
    ],
  },
  "register/man_2.png": {
    title: "머슬마니아 클래식 (MUSCLEMANIA CLASSIC)",
    sections: [
      {
        title: "종목 소개",
        body:
          "2016년부터 시작된 부문으로 고전적이고 대칭적이며 해변과 어울리는 완벽한 신체를\n\n보여주고자 하는 남성들을 위한 새로운 종목으로서 단일라운드로 치뤄집니다.",
      },
      {
        title: "클래식 출전자격",
        body: "대회일 기준 만 20세 이상의 남성",
      },
      {
        title: "클래식 출전체급",
        body:
          "남자 주니어 (단일체급, 만22세 이하)\n\n남자 노비스 & 오픈\n\n- 체급 신장 계측 후 균등 분배\n- 클래식 종목은 클래식보디빌딩 또는 클래식피지크 개념의 종목입니다.",
      },
      {
        title: "클래식 심사규정",
        body: "1.근육대칭미 2.포즈와 표현력 3.근육 크기 4.컨디션 및 데피니션",
      },
      {
        title: "클래식 무대진행순서",
        body:
          "개인선수입장▶무대중앙 자유포즈▶개인선수퇴장▶단체라인업재입장\n\n▶단체쿼터턴심사▶규정포즈심사▶퇴장\n\n- 무대 중앙 워킹 & 자유포즈 시간 약30~40초",
      },
      {
        title: "클래식 규정포즈",
        body:
          "1. 프론트 더블 바이셉스 2. 사이드 체스트 3. 트라이셉스\n\n4. 리어 더블 바이셉스 5. 업도미널 앤 타이\n\n클래식보디빌딩 규정포즈",
      },
      {
        title: "클래식 복장규정",
        body:
          "규정복장 : 남성 브리프\n\n액세서리 및 신발 착용 금지\n\n의상 규정에 어긋나는 복장 착용시 감점\n\n컬러크림 또는 과도한 오일 사용시 감점",
        tone: "danger",
      },
    ],
  },
  "register/man_3.png": {
    title: "피지크 (PHYSIQUE)",
    sections: [
      {
        title: "종목 소개",
        body:
          "2013년부터 시작된 부문으로 보디빌딩과 모델 수영복 라운드의 중간적인 개념이며,\n\n단일라운드로 진행됩니다. 남자 선수의 상체를 주로 심사합니다.",
      },
      {
        title: "피지크 출전자격",
        body: "대회일 기준 만 20세 이상의 남성",
      },
      {
        title: "피지크 출전체급",
        body:
          "남자 주니어 (단일체급, 만22세 이하)\n\n남자 클래식 (단일체급, 만40세 이상)\n\n남자 노비스\n\n남자 오픈\n\n체급 신장 계측 후 균등 분배",
      },
      {
        title: "피지크 심사규정",
        body: "1.근육 대칭미 2.포즈와 표현력 3.근육 크기 4.컨디션 및 데피니션",
      },
      {
        title: "피지크 무대진행순서",
        body:
          "개인선수입장▶무대중앙 자유포즈▶개인선수퇴장▶단체라인업재입장\n\n▶단체 쿼터턴 심사 후 퇴장\n\n- 무대 중앙 워킹 & 자유포즈 약 30초",
      },
      {
        title: "피지크 복장규정",
        body:
          "규정복장 : 보드 반바지 혹은 보드 쇼트\n\n액세서리 및 신발 착용 금지\n\n의상 규정에 어긋나는 복장 착용시 감점\n\n컬러크림 또는 과도한 오일 사용시 감점",
        tone: "danger",
      },
    ],
  },
  "register/woman_1.png": {
    title: "미즈비키니 (MS.BIKINI)",
    sections: [
      {
        title: "종목 소개",
        body:
          "미즈비키니 부문은 선수분들의 신체라인, 컨디션과\n\n전체적인 매력에 초점을 맞춘 대회입니다.\n\n클래식&오픈은 2라운드 / 노비스는 1라운드로 진행됩니다.",
      },
      {
        title: "미즈 비키니 출전자격",
        body: "대회일 기준 만 18세 이상의 여성",
      },
      {
        title: "미즈 비키니 출전체급",
        body:
          "클래식 (만35세 이상 출전가능. 단일체급)\n\n오픈 & 노비스 (쇼트. 미디움. 톨)\n\n- 체급 신장 계측 후 균등 분배",
      },
      {
        title: "미즈 비키니 심사규정",
        body:
          "▷1라운드 심사항목 (테마웨어)\n\n1. 스포츠웨어 의상선택 2. 개성 3. 포즈 및 표현력 4.전반적 외관 및 외모\n\n▷2라운드 심사항목 (비키니)\n\n1. 신체 컨디션 2. 전반적 외관 및 외모 3. 미적 점수 4.포징 및 표현력\n\n- 미즈비키니 노비스는 비키니심사만 진행됩니다",
      },
      {
        title: "미즈 비키니 무대진행순서",
        body:
          "▷ 1라운드 테마웨어\n\n개인선수입장▶무대중앙포즈&하프턴▶개인선수퇴장▶단체라인업재입장\n\n▶단체 하프턴(180도) 심사 후 퇴장\n\n▷ 2라운드 비키니\n\n개인선수입장▶무대중앙포즈&하프턴▶개인선수퇴장▶단체라인업재입장\n\n▶단체 하프턴(180도) 심사 후 퇴장\n\n- 무대 중앙 워킹 & 자유포즈 약 30초",
      },
      {
        title: "미즈비키니 복장규정",
        body:
          "1라운드 테마웨어\n\n참가자의 성격 즐기는 운동을 대변하는 의상\n\n가장 편하게 느끼는 의상을 자유롭게 선택\n\n2라운드 비키니\n\n스탠다드 투피스 비키니와 하이힐 착용\n\n악세사리 착용 가능\n\n단, 라운드에 맞지 않는 과도한 (큐빅)악세사리 감점\n\n라운드에 맞지 않는 의상 착용시 감점\n\n지나치게 성적이거나 문란하거나 도발적인\n\n자세. 행위. 태도를 취하는 선수는 즉각적으로\n\n실격처리 될 수 있습니다. (G스트링X 끈팬티X)",
        tone: "danger",
      },
    ],
  },
  "register/woman_2.png": {
    title: "피규어 (FIGURE)",
    sections: [
      {
        title: "종목 소개",
        body:
          "2005년부터 시작된 부문으로 머슬마니아 여성부문과 미즈비키니의 중간적인\n\n개념이며, 단일라운드로 진행됩니다.\n\n미즈비키니보다 높은 근육량과 선명도 머슬마니아 여성부문과 다르게 여성성과\n\n여성의 신체라인이 잘 드러나는 몸매를 높게 평가합니다.",
      },
      {
        title: "피규어 출전자격",
        body: "대회일 기준 만 18세 이상의 여성",
      },
      {
        title: "피규어 출전체급",
        body:
          "여자 클래식 (단일체급, 만35세 이상)\n\n여자 노비스\n\n여자 오픈\n\n체급 신장 계측 후 균등 분배",
      },
      {
        title: "피규어 심사규정",
        body: "1.근육 대칭미 2.전반적 외관 및 용모 3.신체 컨디션 4.포즈 및 표현력",
      },
      {
        title: "피규어 무대진행순서",
        body:
          "개인선수입장▶무대중앙 개인 쿼터턴 포즈▶개인선수퇴장▶단체라인업재입장\n\n▶단체 쿼터턴 심사 후 퇴장\n\n- 무대 중앙 워킹 & 개인 쿼터턴 포즈 약 30초",
      },
      {
        title: "피규어 복장규정",
        body:
          "규정복장 : 하이컷 투피스 스타일의 수영복\n\n액세서리 착용가능",
        tone: "danger",
      },
    ],
  },
  "register/common_1.png": {
    title: "모델 (MODEL)",
    sections: [
      {
        title: "종목 소개",
        body:
          "모델 부문은 선수분들의 패션센스와 우월한 신체를 뽐낼 수 있는 최고의 무대입니다.\n\n스포츠모델 / 커머셜모델 부문으로 나눠져 있으며, 오픈 3라운드, 노비스 1라운드로 진행됩니다.\n\n스포츠모델 오픈과 커머셜모델 오픈의 중복출전은 불가하며, 이 외의 경우는 노비스를 포함하여\n\n모두 중복출전이 가능합니다.",
      },
      {
        title: "모델 출전자격",
        body: "대회일 기준 만 16세 이상의 남녀",
      },
      {
        title: "모델 출전체급",
        body:
          "스포츠모델 오픈 & 노비스 (쇼트.미디움.톨)\n\n커머셜모델 오픈 & 노비스 (쇼트.미디움.톨)\n\n- 체급 신장 계측 후 균등 분배",
      },
      {
        title: "모델 심사규정",
        body:
          "1.포토제닉(사진) 2.신체적 외관 및 외모 3.복장선택 및 조화 4.포징 및 표현력\n\n*모든 라운드(1R~3R)의 심사규정은 동일합니다.",
      },
      {
        title: "모델 무대진행순서",
        body:
          "오픈 3라운드\n\n▷ 1라운드 클럽웨어\n\n개인선수입장▶무대중앙포즈&하프턴▶개인선수퇴장▶단체라인업재입장\n\n▶단체 하프턴(180도) 심사 후 퇴장\n\n▷ 2라운드 스포츠웨어\n\n개인선수입장▶무대중앙포즈&하프턴▶개인선수퇴장▶단체라인업재입장\n\n▶단체 하프턴(180도) 심사 후 퇴장\n\n▷ 3라운드 수영복\n\n개인선수입장▶무대중앙포즈&하프턴▶개인선수퇴장▶단체라인업재입장\n\n▶단체 하프턴(180도) 심사 후 퇴장\n\n- 무대 중앙 워킹 & 자유포즈 약 30초\n\n노비스 1라운드\n\n▷ 1라운드 커머셜모델 클럽웨어 / 스포츠모델 스포츠웨어\n\n개인선수입장▶무대중앙포즈&하프턴▶개인선수퇴장▶단체라인업재입장\n\n▶단체 하프턴(180도) 심사 후 퇴장\n\n- 무대 중앙 워킹 & 자유포즈 약 30초",
      },
      {
        title: "모델 복장규정",
        body:
          "클럽웨어 : 소셜 문화생활 및 밤문화 생활에 어울리는 복장\n\n스포츠웨어 : 활동적인 스포츠웨어, 스포츠테마 선택 가능\n\n남자 수영복 : 패턴이나 추가 로고가 없는 단색 수영복\n\n여자 수영복 : 투피스 스타일의 수영복과 하이힐\n\n액세서리 착용 가능\n\n라운드에 맞지 않는 의상 착용시 감점\n\n지나치게 성적이거나 문란하거나 도발적인\n\n자세. 행위. 태도를 취하는 선수는 즉각적으로\n\n실격처리 될 수 있습니다.",
        tone: "danger",
      },
    ],
  },
  "register/common_2.png": {
    title: "피트니스 (FITNESS)",
    sections: [
      {
        title: "종목 소개",
        body:
          "피트니스 종목은 피트니스모델 개념의 종목입니다.\n\n선수 개인의 역량이 빛나는 다양한 자유포징을 볼 수 있으며,\n\n수영복 라운드를 통해 아름다운 신체를 추구하는 종목입니다.\n\n피트니스 오픈 부문은 2라운드, 노비스 부문은 1라운드로 진행됩니다.",
      },
      {
        title: "피트니스 출전자격",
        body:
          "남자 노비스 & 오픈\n\n여자 노비스 & 오픈\n\n- 자격제한없음 / 체급 신장 계측 후 균등 분배",
      },
      {
        title: "피트니스 심사규정",
        body:
          "▷ 1라운드 심사항목 (90초 이내의 자유포징 / 피트니스 퍼포먼스)\n\n1. 퍼포먼스 루틴의 실행 2. 창의성 3. 전반적인 외관 및 용모 4. 난이도\n\n▷ 2라운드 심사항목 (수영복 심사)\n\n1. 포징 및 표현력 2. 신체 컨디션 3. 여성성/남성성 4. 전반적인 외관 및 용모\n\n오픈 피트니스 퍼포먼스+수영복심사 100점 만점\n\n노비스 수영복심사 50점 만점",
      },
      {
        title: "피트니스 무대진행순서",
        body:
          "오픈 2라운드\n\n▷ 1라운드 (노비스X 오픈O)\n\n개인선수입장▶음악에 맞춰 90초 이내의 자유포징 퍼포먼스 진행 ▶개인선수퇴장\n\n1라운드 자유포징 음원 미제출시, 임의의 음악이 60초간 재생됩니다.\n\n▷ 2라운드\n\n단체선수라인업 입장▶쿼터턴심사▶퇴장\n\n피트니스 오픈 1라운드, 2라운드 동시진행\n\n자유포즈음악 재생이 멈추면 심사위원의 지시에 따라 쿼터턴\n\n노비스 1라운드\n\n개인선수입장▶개인포징 30초▶개인선수퇴장▶단체라인업재입장\n\n▶단체 쿼터턴 심사 후 퇴장\n\n피트니스 노비스는 1라운드 30초 개인포징 후 단체 쿼터턴 심사",
      },
      {
        title: "피트니스 복장규정",
        body:
          "남자 수영복 : 패턴이나 추가 로고가 없는 단색 수영복\n\n여자 수영복 : 스탠다드 투피스 비키니와 하이힐 착용\n\n액세서리 착용가능",
        tone: "danger",
      },
    ],
  },
  "register/common_3.png": {
    title: "Danim Korea",
    sections: [
      {
        title: "준비중",
        body: "상세 안내 자료를 준비 중입니다.",
      },
    ],
  },
};

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function ApplyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch, isHydrated } = useApplicationFlow();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const competitionName = searchParams.get("discipline") || "대회명";
  const selectedImageKey = searchParams.get("imageKey");
  const additionalInfo = additionalInfoByImageKey[selectedImageKey] || defaultAdditionalInfo;

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    dispatch({ type: "RESET_APPLICATION_FLOW" });
    setSelectedFile(null);
    setErrorMessage("");
  }, [dispatch, isHydrated]);

  const setApplicantField = (field) => (event) => {
    dispatch({
      type: "SET_APPLICANT_FIELD",
      field,
      value:
        field === "phone"
          ? formatPhoneNumber(event.target.value)
          : event.target.value,
    });
  };

  const setConsent = (field) => (event) => {
    dispatch({
      type: "TOGGLE_CONSENT",
      field,
      value: event.target.checked,
    });
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);

    dispatch({
      type: "SET_FILE_META",
      payload: file
        ? {
            originalFilename: file.name,
            storedFilename: "",
            mimeType: file.type,
            fileSize: file.size,
          }
        : {
            originalFilename: "",
            storedFilename: "",
            mimeType: "",
            fileSize: 0,
          },
    });
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = {
        name: state.applicantInfo.name,
        phone: state.applicantInfo.phone,
        email: state.applicantInfo.email,
        birthDate: state.applicantInfo.birthDate,
        organization: state.applicantInfo.organization,
        paymentMethod: state.paymentMethod,
        consents: {
          ...state.consents,
          version: "v1",
        },
      };

      const draftResponse = state.draftId
        ? await updateDraft(state.draftId, payload)
        : await createDraft(payload);

      const draftId = draftResponse.draft.draftId;

      dispatch({ type: "SET_DRAFT_ID", value: draftId });

      if (selectedFile) {
        const fileResponse = await uploadFile({
          draftId,
          file: selectedFile,
        });

        dispatch({
          type: "SET_FILE_META",
          payload: {
            originalFilename: fileResponse.file.original_filename,
            storedFilename: fileResponse.file.stored_filename,
            mimeType: fileResponse.file.mime_type,
            fileSize: fileResponse.file.file_size,
          },
        });
      }

      navigate("/apply/review");
    } catch (error) {
      setErrorMessage(error.message || "신청 초안 저장에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <section className="site-apply-detail">
        <div className="site-apply-detail__layout">
          <aside className="site-apply-detail__summary">
            <Link className="site-apply-detail__back-link" to="/apply">
             &lt; 뒤로가기
            </Link>
            <h1>{competitionName}</h1>
            {selectedImageKey ? (
              <img src={getRegisterImageUrl(selectedImageKey)} alt={competitionName} />
            ) : (
              <div className="site-apply-detail__image-placeholder">대회 이미지</div>
            )}
          </aside>

          <form className="site-form-card site-apply-detail__form" onSubmit={handleSubmit}>
            <div className="site-form-card__header">
              <p className="site-kicker">Application</p>
              <h1>신청 정보 입력</h1>
              <p>입력값을 draft로 먼저 저장하고, review 단계에서 결제 주문을 생성하는 흐름입니다.</p>
            </div>

            <div className="site-form-grid">
              <Input label="성함" requirement="필수" value={state.applicantInfo.name} onChange={setApplicantField("name")} required />
              <Input label="연락처" requirement="필수" value={state.applicantInfo.phone} onChange={setApplicantField("phone")} placeholder="010-0000-0000" required />
              <Input label="이메일" requirement="필수" type="email" value={state.applicantInfo.email} onChange={setApplicantField("email")} required />
              <Input label="생년월일" requirement="필수" type="date" value={state.applicantInfo.birthDate} onChange={setApplicantField("birthDate")} required />
              <Input label="소속" requirement="선택" value={state.applicantInfo.organization} onChange={setApplicantField("organization")} />
              <label className="site-field">
                <span className="site-field__label">
                  제출 파일
                  <span className="site-field__requirement">(선택)</span>
                </span>
                <input className="site-input site-input--file" type="file" onChange={handleFileChange} />
                <span className="site-field__hint">
                  {state.uploadedFileMeta.originalFilename || "선택된 파일이 없습니다."}
                </span>
              </label>
            </div>

            <div className="site-apply-detail__form-lower">
              <div className="site-apply-detail__submit-area">
                <div className="site-consent-group">
                  <Checkbox label="개인정보 수집 및 이용 동의" checked={state.consents.privacy} onChange={setConsent("privacy")} required />
                  <Checkbox label="참가 유의사항 동의" checked={state.consents.terms} onChange={setConsent("terms")} required />
                  <Checkbox label="환불 규정 동의" checked={state.consents.refund} onChange={setConsent("refund")} required />
                  <Checkbox label="마케팅 정보 수신 동의" checked={state.consents.marketing} onChange={setConsent("marketing")} />
                </div>

                <div className="site-form-card__actions">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "저장 중..." : "다음 단계로"}
                  </Button>
                </div>
                {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}
              </div>

              <aside className="site-apply-detail__upload-notice">
                <h2>파일 업로드 주의사항</h2>
                <p>허용된 문서 파일만 업로드할 수 있고 파일 크기 제한이 적용됩니다.</p>
                <p>실제 저장 파일명은 서버에서 별도 object key로 생성됩니다.</p>
              </aside>
            </div>
          </form>
        </div>

        <NoticeBox title="신청 전 확인 사항">
          <ul className="site-list">
            <li>이 단계에서 draft를 생성하거나 수정한 뒤 review 단계로 이동합니다.</li>
            <li>첨부 파일은 draft 저장 뒤 서버를 거쳐 외부 스토리지에 업로드됩니다.</li>
            <li>개인정보, 환불 규정, 참가 유의사항 동의는 결제 전에 필수로 저장됩니다.</li>
          </ul>
        </NoticeBox>

        <section className="site-apply-detail__additional-info" aria-labelledby="apply-additional-info-title">
          <h2 id="apply-additional-info-title">{additionalInfo.title}</h2>
          <div className="site-apply-detail__additional-sections">
            {additionalInfo.sections.map((section) => (
              <section
                className={`site-apply-detail__additional-section ${
                  section.tone === "danger" ? "site-apply-detail__additional-section--danger" : ""
                }`}
                key={section.title}
              >
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </section>
            ))}
          </div>
        </section>
      </section>
    </PageShell>
  );
}
