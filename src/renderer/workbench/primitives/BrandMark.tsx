import zhishuLogo from "../../assets/zhishu-logo.png";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src={zhishuLogo} alt="知述" />
    </span>
  );
}
