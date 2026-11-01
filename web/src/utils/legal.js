export function validateLegalBundle(value) {
  if (!value || !["draft", "published"].includes(value.status) ||
      typeof value.version !== "string" || !value.version || !Array.isArray(value.documents) ||
      !["privacy", "terms"].every((id) => value.documents.some((doc) => doc.id === id && Array.isArray(doc.sections)))) {
    throw new Error("协议信息暂不可用，请重试");
  }
  return value;
}

export function legalGuardMessage(bundle, accepted) {
  if (!bundle) return "请先加载协议后再继续";
  if (bundle.reviewOnly) return "当前为审阅副本，请加载最新协议后再继续";
  if (bundle.status === "published" && !accepted) return "请阅读并勾选同意用户协议和隐私政策";
  return "";
}

export function legalAuthPayload(bundle, accepted) {
  const message = legalGuardMessage(bundle, accepted);
  if (message) throw new Error(message);
  return bundle.status === "published" ? { legalConsent: { accepted: true, version: bundle.version } } : {};
}

export function safeLegalUrl(value) {
  return /^https?:\/\//i.test(String(value || "")) ? value : "";
}
