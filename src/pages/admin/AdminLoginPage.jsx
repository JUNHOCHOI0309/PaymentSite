import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/common/Button";
import { Input } from "../../components/common/Input";
import { adminLogin } from "../../lib/applicationApi";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await adminLogin({ email, password });
      navigate("/admin", { replace: true });
    } catch (error) {
      setErrorMessage(error.message || "관리자 로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="site-admin-auth">
      <div className="site-admin-auth__card">
        <div className="site-admin-auth__header">
          <p className="site-kicker">Admin</p>
          <h1>관리자 로그인</h1>
          <p>등록 현황, 환불 정보, R2 자산 조회를 위한 관리자 전용 화면입니다.</p>
        </div>

        <form className="site-admin-auth__form" onSubmit={handleSubmit}>
          <Input
            label="이메일"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="비밀번호"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {errorMessage ? <p className="site-error-message">{errorMessage}</p> : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </div>
    </section>
  );
}
